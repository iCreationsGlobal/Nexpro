import { useCallback, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowUpRight,
  ChevronDown,
  CircleDollarSign,
  Download,
  Eye,
  Filter,
  Loader2,
  MessageCircle,
  PackageCheck,
  RefreshCw,
  ShieldCheck,
  ShoppingBag,
  WalletCards,
} from 'lucide-react';
import dayjs from 'dayjs';
import storeService from '../services/storeService';
import { formatAmount } from '../utils/formatNumber';
import { showError, showSuccess } from '../utils/toast';
import { buildStorefrontStoreUrl } from '../utils/storefrontUrl';
import { resolveImageUrl } from '../utils/fileUtils';
import { QUERY_STALE, refreshAfterOnlineOrderChange } from '../utils/queryInvalidation';
import { queryKeys } from '../utils/queryKeys';
import { usePagedList } from '../hooks/usePagedList';
import InfiniteListFooter from '../components/InfiniteListFooter';
import DetailsDrawer from '../components/DetailsDrawer';
import DrawerSectionCard from '../components/DrawerSectionCard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Descriptions, DescriptionItem } from '@/components/ui/descriptions';
import {
  Timeline,
  TimelineContent,
  TimelineDescription,
  TimelineIndicator,
  TimelineItem,
  TimelineTime,
  TimelineTitle,
} from '@/components/ui/timeline';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { PAGINATION } from '../constants';

const STATUS_FILTERS = [
  { label: 'All Orders', value: 'all' },
  { label: 'New / Pending', value: 'pending' },
  { label: 'Processing', value: 'processing' },
  { label: 'Packed', value: 'ready' },
  { label: 'Out For Delivery', value: 'out_for_delivery' },
  { label: 'Delivered', value: 'delivered' },
  { label: 'Cancelled', value: 'cancelled' },
];

const STATUS_ACTIONS = [
  { label: 'Mark processing', value: 'processing' },
  { label: 'Mark packed', value: 'packed' },
  { label: 'Mark shipped / out for delivery', value: 'out_for_delivery' },
  { label: 'Mark delivered', value: 'delivered' },
  { label: 'Cancel order', value: 'cancelled' },
];

const STATUS_TRANSITIONS = {
  pending: ['processing', 'packed', 'out_for_delivery', 'delivered', 'cancelled'],
  paid: ['processing', 'packed', 'out_for_delivery', 'delivered', 'cancelled'],
  processing: ['packed', 'out_for_delivery', 'delivered', 'cancelled'],
  ready: ['out_for_delivery', 'delivered', 'cancelled'],
  out_for_delivery: ['delivered', 'cancelled'],
  delivered: [],
  cancelled: [],
};

const STATUS_STYLES = {
  pending: 'border-amber-200 bg-amber-50 text-amber-700',
  pending_payment: 'border-amber-200 bg-amber-50 text-amber-700',
  paid: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  processing: 'border-blue-200 bg-blue-50 text-blue-700',
  ready: 'border-indigo-200 bg-indigo-50 text-indigo-700',
  out_for_delivery: 'border-purple-200 bg-purple-50 text-purple-700',
  delivered: 'border-green-200 bg-green-50 text-green-700',
  cancelled: 'border-red-200 bg-red-50 text-red-700',
  paid_held: 'border-amber-200 bg-amber-50 text-amber-700',
  released: 'border-green-200 bg-green-50 text-green-700',
  refunded: 'border-red-200 bg-red-50 text-red-700',
  disputed: 'border-orange-200 bg-orange-50 text-orange-700',
};

const STATUS_LABELS = {
  completed: 'Paid',
  pending: 'Payment Pending',
  pending_payment: 'Payment Pending',
  ready: 'Packed / Ready',
};

const normalizeStatus = (status) => String(status || 'pending').toLowerCase();

const normalizeFulfillmentStatus = (status) => {
  const normalized = normalizeStatus(status);
  return normalized === 'packed' ? 'ready' : normalized;
};

const formatStatusLabel = (status, context) => {
  const normalized = normalizeStatus(status);
  if (context === 'fulfillment' && normalized === 'pending') return 'New / Pending';
  return STATUS_LABELS[normalized] || normalized
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
};

const getBody = (response) => response?.data ?? response ?? {};

const getListPayload = (response) => {
  const payload = response?.data ?? response ?? {};
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    if (payload.success === true || payload.stats || payload.pagination || payload.count != null) {
      return payload;
    }
    if (payload.data && typeof payload.data === 'object' && !Array.isArray(payload.data)) {
      return payload.data;
    }
  }
  return payload;
};

const getApiErrorMessage = (queryError) => {
  const message = queryError?.response?.data?.message
    || queryError?.response?.data?.error
    || queryError?.message;
  return String(message || '').trim();
};

const getOrderRows = (body) => {
  if (Array.isArray(body)) return body;
  if (Array.isArray(body.data)) return body.data;
  if (Array.isArray(body.orders)) return body.orders;
  if (Array.isArray(body.data?.orders)) return body.data.orders;
  if (Array.isArray(body.rows)) return body.rows;
  return [];
};

const getStats = (body, orders) => {
  const stats = body.stats || body.data?.stats || body.summary || {};
  const today = dayjs();
  const todayOrders = orders.filter((order) => dayjs(order.createdAt || order.orderDate).isSame(today, 'day'));

  return {
    totalOrders: stats.totalOrders ?? stats.total ?? orders.length,
    pendingFulfillment: stats.pendingFulfillment ?? stats.pendingOrders ?? orders.filter((order) => getFulfillmentStatus(order) === 'pending').length,
    processing: stats.processing ?? orders.filter((order) => getFulfillmentStatus(order) === 'processing').length,
    ready: stats.ready ?? stats.packed ?? orders.filter((order) => getFulfillmentStatus(order) === 'ready').length,
    outForDelivery: stats.outForDelivery ?? orders.filter((order) => getFulfillmentStatus(order) === 'out_for_delivery').length,
    delivered: stats.delivered ?? orders.filter((order) => getFulfillmentStatus(order) === 'delivered').length,
    cancelled: stats.cancelled ?? orders.filter((order) => getFulfillmentStatus(order) === 'cancelled').length,
    todayRevenue: stats.todayRevenue ?? stats.todaySales ?? todayOrders.reduce((sum, order) => sum + Number(order.total || order.amount || order.grandTotal || 0), 0),
    todayOrderCount: stats.todayOrderCount ?? stats.todayOrders ?? todayOrders.length,
  };
};

const getPagination = (body, fallbackPage) => {
  const pagination = body.pagination || body.data?.pagination || body.meta || {};
  const page = Number(pagination.page || pagination.currentPage || fallbackPage || 1);
  const totalPages = Number(pagination.totalPages || pagination.pages || 1);
  const total = Number(pagination.total || pagination.count || 0);

  return { page, totalPages: Math.max(totalPages, 1), total };
};

/** Orders in one list response (`{ success, count, pagination, data: [...] }`). */
const getOrderRowsFromResponse = (response) => getOrderRows(getListPayload(response));

/** Matching orders across all pages (`count`), for loading more on phones and tablets. */
const getOrdersTotalFromResponse = (response, rows) => {
  const body = getListPayload(response);
  const count = Number(response?.count ?? body?.count ?? getPagination(body).total);
  return count > 0 ? count : rows.length;
};

const getCustomerName = (order) => (
  order.customerName
  || order.customer?.name
  || order.customer?.fullName
  || order.customer?.businessName
  || 'Guest customer'
);

const getOrderNumber = (order) => order.orderNumber || order.orderNo || order.saleNumber || 'Online order';

const getOrderTotal = (order) => Number(order.total || order.amount || order.grandTotal || 0);

const getFulfillmentStatus = (order) => {
  const rawFulfillmentStatus = order.fulfillmentStatus || order.fulfillment_state;
  if (rawFulfillmentStatus) return normalizeFulfillmentStatus(rawFulfillmentStatus);

  const saleStatus = normalizeStatus(order.status);
  const orderStatus = normalizeStatus(order.orderStatus);
  const deliveryStatus = normalizeStatus(order.deliveryStatus);

  if (saleStatus === 'cancelled' || saleStatus === 'refunded' || orderStatus === 'cancelled') return 'cancelled';
  if (deliveryStatus === 'delivered' || orderStatus === 'completed') return 'delivered';
  if (deliveryStatus === 'out_for_delivery') return 'out_for_delivery';
  if (deliveryStatus === 'ready_for_delivery' || orderStatus === 'ready') return 'ready';
  if (orderStatus === 'received') return 'pending';
  if (['preparing', 'processing'].includes(orderStatus)) return 'processing';
  if (saleStatus === 'pending' || saleStatus === 'partially_paid') return 'pending';
  return 'paid';
};

const getCustomerPhone = (order) => (
  order.customerPhone
  || order.phone
  || order.customer?.phone
  || order.customer?.phoneNumber
  || order.deliveryAddress?.phone
  || ''
);

const getCustomerInitials = (order) => getCustomerName(order)
  .split(' ')
  .filter(Boolean)
  .slice(0, 2)
  .map((name) => name[0])
  .join('')
  .toUpperCase();

const getOrderItems = (order) => (
  order.items
  || order.orderItems
  || order.saleItems
  || order.lineItems
  || order.products
  || []
);

const getOrderItemName = (item) => item.name || item.productName || item.product?.name || item.title || 'Item';

const getOrderItemImageUrl = (item) => resolveImageUrl(
  item?.imageUrl
  || item?.metadata?.imageUrl
  || item?.product?.imageUrl
  || item?.productImageUrl
  || item?.listing?.imageUrl
  || (Array.isArray(item?.images) ? item.images[0] : '')
);

const OrderItemThumbnail = ({ item, alt }) => {
  const imageUrl = getOrderItemImageUrl(item);

  return (
    <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted/30">
      {imageUrl ? (
        <img src={imageUrl} alt={alt} className="h-full w-full object-cover" />
      ) : (
        <ShoppingBag className="h-5 w-5 text-muted-foreground" />
      )}
    </div>
  );
};

const getItemSummary = (order) => {
  const items = getOrderItems(order);
  if (!items.length) return order.itemsSummary || 'No item details';
  const firstItem = items[0];
  const firstName = getOrderItemName(firstItem);
  const quantity = firstItem.quantity || firstItem.qty || 1;
  const remaining = items.length - 1;
  return `${quantity} x ${firstName}${remaining > 0 ? ` +${remaining} more` : ''}`;
};

const getPaymentLabel = (order) => {
  const paymentStatus = getPaymentStatus(order);
  return formatStatusLabel(paymentStatus);
};

const getPaymentStatus = (order) => {
  const tradeAssurance = getTradeAssurance(order);
  return tradeAssurance.paymentStatus || order.marketplacePayment?.status || order.paymentStatus || order.payment?.status || order.status;
};

const getTradeAssurance = (order = {}) => (
  order.tradeAssurance
  || order.metadata?.tradeAssurance
  || order.marketplacePayment
  || {}
);

const getTradeAssuranceStatus = (order = {}) => (
  getTradeAssurance(order).paymentStatus || order.marketplacePayment?.status || null
);

const canShowSellerRefund = (order = {}) => getTradeAssurance(order).canSellerRefund === true;

const isServiceOrder = (order = {}) => order.orderType === 'service';

const getExportFilename = (response, fallback) => {
  const contentDisposition = response?.headers?.['content-disposition'] || '';
  const filenameMatch = contentDisposition.match(/filename="?([^"]+)"?/i);
  return filenameMatch?.[1] || fallback;
};

const getWhatsAppHref = (order) => {
  const phone = getCustomerPhone(order).replace(/[^\d]/g, '');
  if (!phone) return '';
  const orderNo = order.orderNumber || order.orderNo || order.saleNumber || order.id;
  const message = `Hi ${getCustomerName(order)}, thanks for your online order ${orderNo}. We are following up on it.`;
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
};

const getUpdatedOrderFromResponse = (response) => {
  const body = getBody(response);
  const candidate = body.data || body.order || body;
  return candidate?.order || candidate?.data || candidate;
};

const updateOrderCollection = (orders, orderId, updater, shouldKeepOrder = () => true) => {
  if (!Array.isArray(orders)) return { value: orders, changed: false };

  let changed = false;
  const nextOrders = orders.reduce((result, order) => {
    if (order?.id !== orderId) {
      result.push(order);
      return result;
    }

    changed = true;
    const updatedOrder = updater(order);
    if (shouldKeepOrder(updatedOrder)) result.push(updatedOrder);
    return result;
  }, []);

  return { value: changed ? nextOrders : orders, changed };
};

const updateOrderPayload = (payload, orderId, updater, shouldKeepOrder) => {
  if (!payload || typeof payload !== 'object') return { value: payload, changed: false };

  const arrayResult = updateOrderCollection(payload, orderId, updater, shouldKeepOrder);
  if (arrayResult.changed) return arrayResult;

  const candidateKeys = ['orders', 'rows', 'data'];
  for (const key of candidateKeys) {
    const value = payload[key];
    if (Array.isArray(value)) {
      const result = updateOrderCollection(value, orderId, updater, shouldKeepOrder);
      if (result.changed) {
        return {
          value: { ...payload, [key]: result.value },
          changed: true,
        };
      }
    }

    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const result = updateOrderPayload(value, orderId, updater, shouldKeepOrder);
      if (result.changed) {
        return {
          value: { ...payload, [key]: result.value },
          changed: true,
        };
      }
    }
  }

  if (payload.id === orderId) {
    const updatedOrder = updater(payload);
    return {
      value: shouldKeepOrder(updatedOrder) ? updatedOrder : payload,
      changed: true,
    };
  }

  return { value: payload, changed: false };
};

const patchCachedOnlineOrderResponse = (response, orderId, updater, shouldKeepOrder) => {
  const result = updateOrderPayload(response, orderId, updater, shouldKeepOrder);
  return result.changed ? result.value : response;
};

const isInfiniteQueryData = (data) => Boolean(
  data && typeof data === 'object' && Array.isArray(data.pages) && Array.isArray(data.pageParams)
);

/**
 * Patches one cached online-orders query: a single response (desktop list, stats, detail) or,
 * for the phone/tablet list that loads as you scroll, every loaded page of `{ pages, pageParams }`.
 */
export const patchCachedOnlineOrders = (cachedData, orderId, updater, shouldKeepOrder = () => true) => {
  if (!isInfiniteQueryData(cachedData)) {
    return patchCachedOnlineOrderResponse(cachedData, orderId, updater, shouldKeepOrder);
  }
  let changed = false;
  const pages = cachedData.pages.map((pageResponse) => {
    const nextPage = patchCachedOnlineOrderResponse(pageResponse, orderId, updater, shouldKeepOrder);
    if (nextPage !== pageResponse) changed = true;
    return nextPage;
  });
  return changed ? { ...cachedData, pages } : cachedData;
};

const getStatusFilterFromOrderQueryKey = (queryKey) => {
  const params = Array.isArray(queryKey) ? queryKey[2] : null;
  if (!params || typeof params !== 'object' || Array.isArray(params)) return 'all';
  return params.status || 'all';
};

const shouldKeepOrderForStatusFilter = (order, statusFilter) => {
  if (!statusFilter || statusFilter === 'all') return true;
  return getFulfillmentStatus(order) === statusFilter;
};

const buildOptimisticStatusOrder = (order, status, reason) => {
  const fulfillmentStatus = normalizeFulfillmentStatus(status);
  const now = new Date().toISOString();
  const metadata = order.metadata && typeof order.metadata === 'object' ? order.metadata : {};
  const deliveryTracking = metadata.deliveryTracking && typeof metadata.deliveryTracking === 'object'
    ? metadata.deliveryTracking
    : {};
  const trackingHistory = Array.isArray(deliveryTracking.history) ? deliveryTracking.history : [];

  return {
    ...order,
    fulfillmentStatus,
    fulfillment_state: fulfillmentStatus,
    orderStatus: fulfillmentStatus === 'ready' ? 'ready' : order.orderStatus,
    deliveryStatus: fulfillmentStatus === 'out_for_delivery' || fulfillmentStatus === 'delivered'
      ? fulfillmentStatus
      : order.deliveryStatus,
    deliveredAt: fulfillmentStatus === 'delivered' ? (order.deliveredAt || now) : order.deliveredAt,
    status: fulfillmentStatus === 'cancelled' ? 'cancelled' : order.status,
    metadata: {
      ...metadata,
      ...(fulfillmentStatus === 'cancelled' ? {
        cancellation: {
          ...(metadata.cancellation || {}),
          reason: reason || metadata.cancellation?.reason,
          cancelledAt: metadata.cancellation?.cancelledAt || now,
        },
      } : {}),
      deliveryTracking: {
        ...deliveryTracking,
        history: [
          {
            status: fulfillmentStatus,
            at: now,
            note: reason || 'Status update is syncing.',
          },
          ...trackingHistory,
        ],
      },
    },
  };
};

const canApplyStatusAction = (order, status) => {
  if (isServiceOrder(order) && !['processing', 'delivered', 'cancelled'].includes(status)) {
    return false;
  }
  const currentStatus = getFulfillmentStatus(order);
  return (STATUS_TRANSITIONS[currentStatus] || []).includes(status);
};

const getStatusActionProgressLabel = (status) => {
  const normalized = normalizeStatus(status);
  if (normalized === 'cancelled') return 'Cancelling order...';
  return `Updating to ${formatStatusLabel(normalized, 'fulfillment')}...`;
};

const getPreviewUrl = (settings) => {
  const slug = settings?.slug || settings?.storeSlug;
  if (!slug) return '';
  return buildStorefrontStoreUrl(slug);
};

const StatusBadge = ({ status, context }) => {
  const normalized = normalizeStatus(status);
  return (
    <Badge variant="outline" className={STATUS_STYLES[normalized] || 'border-border bg-muted/30 text-foreground'}>
      {formatStatusLabel(normalized, context)}
    </Badge>
  );
};

const formatDateTime = (value, fallback = '—') => {
  if (!value || !dayjs(value).isValid()) return fallback;
  return dayjs(value).format('MMM D, YYYY h:mm A');
};

const ACTIVITY_LABELS = {
  created: 'Order placed',
  received: 'Order placed',
  order_received: 'Order received',
  paid_held: 'Payment held in trade assurance',
  payment_held: 'Payment held in trade assurance',
  preparing: 'Processing',
  processing: 'Processing',
  ready: 'Packed / ready',
  packed: 'Packed / ready',
  ready_for_delivery: 'Ready for delivery',
  delivery_assigned: 'Delivery assigned',
  shipped: 'Out for delivery',
  out_for_delivery: 'Out for delivery',
  delivered: 'Order delivered',
  payout_released: 'Payout released',
  released: 'Payout released',
  refunded: 'Payment refunded',
  disputed: 'Dispute opened',
  cancelled: 'Order cancelled',
  updated: 'Order updated',
};

const getActivityKind = (status, title) => {
  const normalized = normalizeStatus(status || title);
  const kindMap = {
    created: 'order_placed',
    received: 'order_placed',
    order_received: 'order_received',
    paid_held: 'payment_held',
    payment_held: 'payment_held',
    preparing: 'processing',
    processing: 'processing',
    ready: 'ready',
    packed: 'ready',
    ready_for_delivery: 'ready_for_delivery',
    delivery_assigned: 'delivery_assigned',
    shipped: 'out_for_delivery',
    out_for_delivery: 'out_for_delivery',
    delivered: 'delivered',
    payout_released: 'payout_released',
    released: 'payout_released',
    refunded: 'refunded',
    disputed: 'disputed',
    cancelled: 'cancelled',
  };
  return kindMap[normalized] || normalized;
};

const normalizeTimelineText = (value) => String(value || '')
  .trim()
  .toLowerCase()
  .replace(/[_\s-]+/g, ' ');

const isDuplicateTimelineText = (value, ...comparisons) => {
  const normalized = normalizeTimelineText(value);
  return normalized && comparisons.some((comparison) => normalizeTimelineText(comparison) === normalized);
};

const getDeliveryAddressText = (order = {}) => {
  const address = order.deliveryAddress || order.metadata?.deliveryAddress || {};
  if (typeof address === 'string') return address;
  const parts = [
    address.addressLine1,
    address.addressLine2,
    address.street,
    address.city,
    address.region,
    address.country,
  ].filter(Boolean);
  return parts.join(', ') || order.deliveryAddressText || '';
};

const getActivityLabel = (status) => {
  const normalized = normalizeStatus(status);
  return ACTIVITY_LABELS[normalized] || formatStatusLabel(normalized);
};

const getTimelineTitle = (rawTitle, status) => {
  const statusLabel = getActivityLabel(status);
  if (!rawTitle || isDuplicateTimelineText(rawTitle, status, statusLabel)) {
    return statusLabel;
  }
  return rawTitle;
};

const getTimelineDescription = (description, status, title) => {
  const statusLabel = getActivityLabel(status);
  const text = String(description || '').trim();
  if (text && !isDuplicateTimelineText(text, title, status, statusLabel)) return text;
  return isDuplicateTimelineText(statusLabel, title) ? '' : statusLabel;
};

const dedupeTimelineEvents = (events) => {
  const seen = new Set();
  return events.filter((event) => {
    const key = `${getActivityKind(event.status, event.title)}-${dayjs(event.at).valueOf()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const buildOrderActivityTimeline = (order = {}) => {
  const metadata = order.metadata && typeof order.metadata === 'object' ? order.metadata : {};
  const deliveryTracking = order.deliveryTracking || metadata.deliveryTracking || {};
  const trackingHistory = Array.isArray(deliveryTracking.history) ? deliveryTracking.history : [];
  const activities = Array.isArray(order.activities) ? order.activities : [];
  const tradeAssurance = getTradeAssurance(order);

  const activityEvents = activities.map((activity) => {
    const status = activity.metadata?.action || activity.type;
    const title = getTimelineTitle(activity.subject, status);
    return {
      id: activity.id,
      at: activity.createdAt,
      title,
      description: getTimelineDescription(activity.notes || activity.nextStep, status, title),
      status,
      source: 'Activity log',
    };
  });

  const trackingEvents = trackingHistory.map((event, index) => {
    const title = getActivityLabel(event.status);
    return {
      id: `tracking-${event.at || index}-${event.status || 'status'}`,
      at: event.at,
      title,
      description: getTimelineDescription(event.reason || event.note || 'Fulfillment status updated from Online Orders.', event.status, title),
      status: event.status,
      source: 'Delivery tracking',
    };
  });

  const fallbackEvents = [
    {
      id: 'created',
      at: order.createdAt || order.orderDate,
      title: 'Order placed',
      description: `${getCustomerName(order)} placed ${getOrderNumber(order)}.`,
      status: 'created',
      source: 'Order timestamp',
    },
    tradeAssurance.heldAt && {
      id: 'payment-held',
      at: tradeAssurance.heldAt,
      title: 'Payment held in trade assurance',
      description: 'Buyer funds were recorded in Sabito Trade Assurance.',
      status: 'paid_held',
      source: 'Trade Assurance',
    },
    order.deliveryAssignedAt && {
      id: 'delivery-assigned',
      at: order.deliveryAssignedAt,
      title: 'Delivery assigned',
      description: 'A delivery handoff was recorded for this order.',
      status: 'out_for_delivery',
      source: 'Delivery',
    },
    order.deliveredAt && {
      id: 'delivered',
      at: order.deliveredAt,
      title: 'Order delivered',
      description: 'Delivery completion was recorded.',
      status: 'delivered',
      source: 'Delivery',
    },
    metadata.cancellation?.cancelledAt && {
      id: 'cancelled',
      at: metadata.cancellation.cancelledAt,
      title: 'Order cancelled',
      description: metadata.cancellation.reason || 'The seller cancelled this order.',
      status: 'cancelled',
      source: 'Order metadata',
    },
    tradeAssurance.payoutReleasedAt && {
      id: 'payout-released',
      at: tradeAssurance.payoutReleasedAt,
      title: 'Payout released',
      description: 'Seller payout moved from Trade Assurance hold to payout processing.',
      status: 'payout_released',
      source: 'Trade Assurance',
    },
    tradeAssurance.payoutPaidOutAt && {
      id: 'payout-transferred',
      at: tradeAssurance.payoutPaidOutAt,
      title: 'Payout transferred',
      description: 'Paystack confirmed the seller transfer.',
      status: 'payout_released',
      source: 'Paystack',
    },
  ].filter(Boolean);

  const events = dedupeTimelineEvents(
    [...activityEvents, ...trackingEvents, ...fallbackEvents]
      .filter((event) => event.at && dayjs(event.at).isValid())
      .sort((a, b) => dayjs(b.at).valueOf() - dayjs(a.at).valueOf())
  );

  return {
    events,
    hasBackendActivity: activities.length > 0,
    hasTrackingHistory: trackingHistory.length > 0,
  };
};

const OnlineOrders = () => {
  const queryClient = useQueryClient();
  const location = useLocation();
  const isOnlineStoreChannel = location.pathname.startsWith('/online-store');
  const commerceChannel = isOnlineStoreChannel ? 'online_store' : 'sabito_marketplace';
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [cancelOrderRequest, setCancelOrderRequest] = useState(null);
  const [cancellationReason, setCancellationReason] = useState('');
  const [cancellationReasonError, setCancellationReasonError] = useState('');
  const cancellationReasonRef = useRef(null);

  const listFilterParams = useMemo(() => ({
    status: statusFilter === 'all' ? undefined : statusFilter,
    includeStats: false,
    commerceChannel,
  }), [statusFilter, commerceChannel]);

  // Desktop's page request; the Trade Assurance dashboard keys on it too.
  const listQueryParams = useMemo(() => ({
    ...listFilterParams,
    page,
    limit: PAGINATION.DEFAULT_PAGE_SIZE,
  }), [listFilterParams, page]);

  const statsQueryParams = useMemo(() => ({
    status: statusFilter === 'all' ? undefined : statusFilter,
    commerceChannel,
  }), [statusFilter, commerceChannel]);

  // Pages on desktop; loads as you scroll on phones and tablets (`response` is the first page there).
  const {
    rows: orders,
    response,
    error,
    isFetching,
    isLoading,
    refetch,
    infinite: ordersInfinite,
  } = usePagedList({
    queryKey: (params) => queryKeys.store.onlineOrders.list(params),
    params: listFilterParams,
    fetchPage: (params) => storeService.getOrders(params),
    getRows: getOrderRowsFromResponse,
    getTotal: getOrdersTotalFromResponse,
    page,
    pageSize: PAGINATION.DEFAULT_PAGE_SIZE,
    staleTime: QUERY_STALE.TRANSACTIONAL,
    queryOptions: {
      refetchInterval: 60 * 1000,
      refetchIntervalInBackground: false,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  });
  // Loading the next rows on scroll isn't a refresh.
  const isRefreshing = isFetching && !ordersInfinite?.isLoadingMore;

  const { data: statsResponse, refetch: refetchStats } = useQuery({
    queryKey: queryKeys.store.onlineOrders.stats(statsQueryParams),
    queryFn: () => storeService.getOrderStats(statsQueryParams),
    staleTime: QUERY_STALE.LIST,
    refetchInterval: 60 * 1000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const {
    data: tradeAssuranceResponse,
    error: tradeAssuranceError,
    isFetching: isTradeAssuranceFetching,
    isError: isTradeAssuranceError,
    refetch: refetchTradeAssurance,
  } = useQuery({
    queryKey: queryKeys.store.tradeAssuranceDashboard(listQueryParams),
    queryFn: () => storeService.getTradeAssuranceDashboard(listQueryParams),
    enabled: !isLoading && !isOnlineStoreChannel,
    staleTime: QUERY_STALE.SLOW,
    refetchInterval: 2 * 60 * 1000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const { data: settingsResponse } = useQuery({
    queryKey: queryKeys.store.settings,
    queryFn: () => storeService.getSettings(),
    staleTime: QUERY_STALE.METADATA,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const body = useMemo(() => getListPayload(response), [response]);
  const statsBody = useMemo(() => getBody(statsResponse), [statsResponse]);
  const stats = useMemo(
    () => getStats({ ...body, stats: statsBody.data || statsBody }, orders),
    [body, statsBody, orders],
  );
  const pagination = useMemo(() => getPagination(body, page), [body, page]);
  const ordersErrorMessage = useMemo(() => getApiErrorMessage(error), [error]);
  const tradeAssuranceErrorMessage = useMemo(() => getApiErrorMessage(tradeAssuranceError), [tradeAssuranceError]);
  const tradeAssuranceBody = useMemo(() => getBody(tradeAssuranceResponse), [tradeAssuranceResponse]);
  const tradeAssuranceDashboard = tradeAssuranceBody.data || tradeAssuranceBody || {};
  const tradeSummary = tradeAssuranceDashboard.summary || {};
  const tradeBalances = tradeSummary.balances || {};
  const tradeCounts = tradeSummary.counts || {};
  const settings = getBody(settingsResponse);
  const previewUrl = getPreviewUrl(settings?.settings || settings);

  const kpiCards = useMemo(() => ([
    { label: isOnlineStoreChannel ? 'Total Online Store orders' : 'Total Sabito orders', value: stats.totalOrders, icon: ShoppingBag },
    { label: 'New / pending', value: stats.pendingFulfillment, icon: ShoppingBag },
    { label: 'Processing', value: stats.processing, icon: PackageCheck },
    { label: 'Delivered', value: stats.delivered, icon: PackageCheck },
  ]), [isOnlineStoreChannel, stats.delivered, stats.pendingFulfillment, stats.processing, stats.totalOrders]);

  const detailOrder = selectedOrder || {};
  const detailItems = useMemo(() => getOrderItems(detailOrder), [detailOrder]);

  const detailQuery = useQuery({
    queryKey: queryKeys.store.onlineOrders.detail(selectedOrder?.id),
    queryFn: () => storeService.getOrderById(selectedOrder.id),
    enabled: Boolean(isDetailOpen && selectedOrder?.id),
    staleTime: QUERY_STALE.TRANSACTIONAL,
    refetchOnWindowFocus: true,
    retry: 1,
  });

  const fullDetailOrder = useMemo(() => {
    const detailBody = getBody(detailQuery.data);
    return detailBody.data || detailBody.order || detailBody || detailOrder;
  }, [detailOrder, detailQuery.data]);
  const activityTimeline = useMemo(() => buildOrderActivityTimeline(fullDetailOrder), [fullDetailOrder]);

  const updateStatusMutation = useMutation({
    mutationFn: ({ orderId, status, reason }) => storeService.updateOrderStatus(orderId, status, reason ? { reason } : {}),
    onMutate: async ({ orderId, status, reason }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.store.onlineOrders.all });

      const previousOnlineOrders = queryClient.getQueriesData({ queryKey: queryKeys.store.onlineOrders.all });
      const previousSelectedOrder = selectedOrder;
      const optimisticUpdater = (order) => buildOptimisticStatusOrder(order, status, reason);

      previousOnlineOrders.forEach(([queryKey]) => {
        const statusFilter = getStatusFilterFromOrderQueryKey(queryKey);
        queryClient.setQueryData(queryKey, (currentData) => patchCachedOnlineOrders(
          currentData,
          orderId,
          optimisticUpdater,
          (order) => shouldKeepOrderForStatusFilter(order, statusFilter)
        ));
      });

      setSelectedOrder((currentOrder) => (
        currentOrder?.id === orderId ? optimisticUpdater(currentOrder) : currentOrder
      ));

      return { previousOnlineOrders, previousSelectedOrder };
    },
    onSuccess: (updateResponse) => {
      const updatedOrder = getUpdatedOrderFromResponse(updateResponse);
      showSuccess(updatedOrder?.status === 'refunded' ? 'Online order cancelled and buyer refund recorded' : 'Online order status updated');
      refreshAfterOnlineOrderChange(queryClient);
      setCancelOrderRequest(null);
      setCancellationReason('');
      if (updatedOrder?.id) {
        queryClient.getQueriesData({ queryKey: queryKeys.store.onlineOrders.all }).forEach(([queryKey]) => {
          const statusFilter = getStatusFilterFromOrderQueryKey(queryKey);
          queryClient.setQueryData(queryKey, (currentData) => patchCachedOnlineOrders(
            currentData,
            updatedOrder.id,
            () => updatedOrder,
            (order) => shouldKeepOrderForStatusFilter(order, statusFilter)
          ));
        });
        queryClient.setQueryData(queryKeys.store.onlineOrders.detail(updatedOrder.id), updateResponse);
        setSelectedOrder((currentOrder) => (
          currentOrder?.id === updatedOrder.id ? updatedOrder : currentOrder
        ));
      }
    },
    onError: (mutationError, variables, context) => {
      context?.previousOnlineOrders?.forEach(([queryKey, previousData]) => {
        queryClient.setQueryData(queryKey, previousData);
      });
      setSelectedOrder((currentOrder) => (
        currentOrder?.id === variables?.orderId ? context?.previousSelectedOrder : currentOrder
      ));
      showError(mutationError, 'Failed to update online order status');
    },
  });
  const pendingStatusUpdate = updateStatusMutation.isPending ? updateStatusMutation.variables : null;
  const pendingStatusOrderId = pendingStatusUpdate?.orderId;
  const pendingStatus = pendingStatusUpdate?.status;

  const refundOrderMutation = useMutation({
    mutationFn: ({ orderId, amount, reason }) => storeService.refundTradeAssuranceOrder(orderId, { amount, reason }),
    onSuccess: () => {
      showSuccess('Marketplace refund recorded');
      refreshAfterOnlineOrderChange(queryClient);
      if (selectedOrder?.id) detailQuery.refetch();
    },
    onError: (mutationError) => {
      showError(mutationError, 'Failed to record marketplace refund');
    },
  });

  const exportMutation = useMutation({
    mutationFn: () => storeService.exportOrders({
      status: statusFilter === 'all' ? undefined : statusFilter,
    }),
    onSuccess: (exportResponse) => {
      const blob = exportResponse?.data instanceof Blob ? exportResponse.data : new Blob([exportResponse?.data || exportResponse]);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = getExportFilename(exportResponse, `online-orders-${dayjs().format('YYYY-MM-DD')}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      showSuccess('Online orders export downloaded');
    },
    onError: (exportError) => {
      showError(exportError, 'Failed to export online orders');
    },
  });

  const handleStatusFilterChange = useCallback((status) => {
    setStatusFilter(status);
    setPage(1);
  }, []);

  const handleViewOrder = useCallback((order) => {
    setSelectedOrder(order);
    setIsDetailOpen(true);
  }, []);

  const handleStatusUpdate = useCallback((order, status) => {
    if (!order?.id || updateStatusMutation.isPending) return;
    if (status === 'cancelled') {
      setCancelOrderRequest(order);
      setCancellationReason('');
      return;
    }
    updateStatusMutation.mutate({ orderId: order.id, status });
  }, [updateStatusMutation]);

  const handleCloseCancelDialog = useCallback((open) => {
    if (open || updateStatusMutation.isPending) return;
    setCancelOrderRequest(null);
    setCancellationReason('');
    setCancellationReasonError('');
  }, [updateStatusMutation.isPending]);

  const handleConfirmCancellation = useCallback(() => {
    const reason = cancellationReason.trim();
    if (!reason) {
      setCancellationReasonError('Enter a cancellation reason for the buyer.');
      cancellationReasonRef.current?.focus();
      return;
    }
    if (!cancelOrderRequest?.id || updateStatusMutation.isPending) return;
    updateStatusMutation.mutate({
      orderId: cancelOrderRequest.id,
      status: 'cancelled',
      reason,
    });
  }, [cancelOrderRequest, cancellationReason, updateStatusMutation]);

  const handleWhatsAppCustomer = useCallback((order) => {
    const href = getWhatsAppHref(order);
    if (!href) {
      showError('This customer does not have a phone number on the order.');
      return;
    }
    window.open(href, '_blank', 'noopener,noreferrer');
  }, []);

  const handleRefundOrder = useCallback((order) => {
    const amountInput = window.prompt('Refund amount. Leave blank for full remaining refund.');
    if (amountInput === null) return;
    const reason = window.prompt('Refund reason', 'buyer_refund');
    if (reason === null) return;
    const amount = amountInput.trim() ? Number(amountInput) : undefined;
    refundOrderMutation.mutate({ orderId: order.id, amount, reason: reason || 'buyer_refund' });
  }, [refundOrderMutation]);

  const handleExport = useCallback(() => {
    exportMutation.mutate();
  }, [exportMutation]);

  const handleRefresh = useCallback(() => {
    refetch();
    refetchStats();
    refetchTradeAssurance();
  }, [refetch, refetchStats, refetchTradeAssurance]);

  const handleCloseDetailDrawer = useCallback(() => {
    setIsDetailOpen(false);
    setSelectedOrder(null);
  }, []);

  const renderLoadingSkeleton = () => (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 md:gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-28 rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-80 rounded-lg" />
    </div>
  );

  const renderEmptyState = () => (
    <Card className="border border-border">
      <CardContent className="flex min-h-64 flex-col items-center justify-center text-center">
        <ShoppingBag className="mb-3 h-10 w-10 text-muted-foreground" />
        <h2 className="font-semibold">No online orders found</h2>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          {error
            ? (ordersErrorMessage || 'Could not load online orders. Check your connection and try again.')
            : 'Orders from your online storefront will appear here as customers check out.'}
        </p>
        {error ? (
          <Button type="button" variant="outline" className="mt-4" onClick={handleRefresh}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Try again
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );

  const renderTradeAssuranceDashboard = () => {
    if (isOnlineStoreChannel) return null;

    if (isTradeAssuranceError) {
      return (
        <Card className="border border-border">
          <CardHeader className="p-4 pb-2 sm:p-6 sm:pb-2">
            <CardTitle className="text-base text-primary">Sabito Trade Assurance</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              Trade Assurance balances are unavailable right now{tradeAssuranceErrorMessage ? `: ${tradeAssuranceErrorMessage}` : '.'}
            </div>
          </CardContent>
        </Card>
      );
    }

    const cards = [
      {
        label: 'Held pending payout',
        value: formatAmount(tradeBalances.pending || 0, tradeBalances.currency),
        helper: `${tradeCounts.held || 0} held orders`,
        icon: ShieldCheck,
      },
      {
        label: 'Available seller balance',
        value: formatAmount(tradeBalances.available || 0, tradeBalances.currency),
        helper: `${tradeCounts.released || 0} released orders`,
        icon: WalletCards,
      },
      {
        label: 'Sabito fees',
        value: formatAmount(tradeBalances.fee || 0, tradeBalances.currency),
        helper: `${tradeSummary.commissionPercent || 0}% commission`,
        icon: CircleDollarSign,
      },
      {
        label: 'Open disputes',
        value: tradeCounts.openDisputes || 0,
        helper: `${tradeCounts.disputed || 0} disputed payments`,
        icon: AlertTriangle,
      },
    ];

    return (
      <Card className="border border-border">
        <CardHeader className="p-4 pb-2 sm:p-6 sm:pb-2">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="text-base text-primary">Sabito Trade Assurance</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Buyer funds are held, seller payouts move from pending to available after confirmation or the {tradeSummary.autoReleaseHours || 72}-hour release window.
              </p>
            </div>
            {isTradeAssuranceFetching ? <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 p-4 sm:grid-cols-2 sm:p-6 lg:grid-cols-4">
          {cards.map((card) => {
            const Icon = card.icon;
            return (
              <div key={card.label} className="rounded-xl border border-border bg-muted/20 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{card.label}</p>
                    <p className="mt-2 text-xl font-semibold">{card.value}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{card.helper}</p>
                  </div>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Icon className="h-4 w-4" />
                  </span>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    );
  };

  const renderOrderTable = () => (
    <Card className="hidden border border-border md:block">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Order No</TableHead>
            <TableHead>Customer</TableHead>
            <TableHead>Items</TableHead>
            <TableHead>Amount</TableHead>
            <TableHead>Payment</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Date</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {orders.map((order) => (
            <TableRow key={order.id || order.orderNumber || order.saleNumber}>
              <TableCell className="font-medium">{getOrderNumber(order)}</TableCell>
              <TableCell>
                <div>
                  <div className="font-medium">{getCustomerName(order)}</div>
                  <div className="text-xs text-muted-foreground">{getCustomerPhone(order) || 'No phone'}</div>
                </div>
              </TableCell>
              <TableCell className="max-w-[240px] truncate">{getItemSummary(order)}</TableCell>
              <TableCell className="font-medium">{formatAmount(getOrderTotal(order))}</TableCell>
              <TableCell>
                <StatusBadge status={getPaymentStatus(order)} />
              </TableCell>
              <TableCell><StatusBadge status={getFulfillmentStatus(order)} context="fulfillment" /></TableCell>
              <TableCell>{dayjs(order.createdAt || order.orderDate).format('MMM D, YYYY h:mm A')}</TableCell>
              <TableCell className="text-right">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleViewOrder(order)}
                  aria-label={`View ${getOrderNumber(order)}`}
                >
                  <Eye className="mr-2 h-4 w-4" />
                  View
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );

  const renderMobileCards = () => (
    <div className="space-y-2 md:hidden">
      {orders.map((order) => (
        <Card key={order.id || order.orderNumber || order.saleNumber} className="border border-border">
          <CardContent className="p-3">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                {getCustomerInitials(order) || 'OO'}
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{getOrderNumber(order)}</p>
                    <p className="truncate text-xs text-muted-foreground">{getCustomerName(order)}</p>
                  </div>
                  <p className="shrink-0 text-sm font-semibold">{formatAmount(getOrderTotal(order))}</p>
                </div>
                <p className="truncate text-xs text-muted-foreground">{getItemSummary(order)}</p>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <StatusBadge status={getFulfillmentStatus(order)} context="fulfillment" />
                  {getTradeAssuranceStatus(order) ? <StatusBadge status={getTradeAssuranceStatus(order)} /> : null}
                  <span className="text-xs text-muted-foreground">{dayjs(order.createdAt || order.orderDate).format('MMM D, YYYY h:mm A')}</span>
                </div>
                <div className="flex items-center justify-end gap-2 border-t border-border pt-3">
                  {getWhatsAppHref(order) && (
                    <Button variant="outline" size="icon" className="h-11 w-11" asChild>
                      <a href={getWhatsAppHref(order)} target="_blank" rel="noreferrer">
                        <MessageCircle className="h-4 w-4" />
                        <span className="sr-only">WhatsApp customer</span>
                      </a>
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="min-w-16"
                    onClick={() => handleViewOrder(order)}
                    aria-label={`View ${getOrderNumber(order)}`}
                  >
                    View
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );

  const renderPagination = () => (
    <div className="flex flex-col gap-3 border-t border-border pt-4 text-center text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:text-left">
      <span className="block">
        Page {pagination.page} of {pagination.totalPages}
        {pagination.total ? ` · ${pagination.total} orders` : ''}
      </span>
      <div className="grid grid-cols-2 gap-2 sm:flex">
        <Button
          variant="outline"
          size="sm"
          className="w-full sm:w-auto"
          disabled={page <= 1 || isFetching}
          onClick={() => setPage((currentPage) => Math.max(currentPage - 1, 1))}
        >
          Previous
        </Button>
        <Button
          size="sm"
          className="w-full sm:w-auto"
          disabled={page >= pagination.totalPages || isFetching}
          onClick={() => setPage((currentPage) => currentPage + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );

  const renderDetailSheet = () => {
    const visibleItems = getOrderItems(fullDetailOrder).length ? getOrderItems(fullDetailOrder) : detailItems;
    const tradeAssurance = getTradeAssurance(fullDetailOrder);
    const tradeStatus = getTradeAssuranceStatus(fullDetailOrder);
    const canRefundOrder = Boolean(fullDetailOrder?.id && canShowSellerRefund(fullDetailOrder));
    const whatsappHref = getWhatsAppHref(fullDetailOrder);
    const isDetailLoading = detailQuery.isFetching && Boolean(selectedOrder?.id);
    const isUpdatingCurrentOrderStatus = Boolean(
      pendingStatusUpdate
      && pendingStatusOrderId === fullDetailOrder?.id
    );
    const renderDetailContentWithStatusOverlay = (content) => (
      <div className="relative min-h-[320px]">
        <div className={isUpdatingCurrentOrderStatus ? 'pointer-events-none select-none opacity-60' : undefined}>
          {content}
        </div>
      </div>
    );
    const orderDrawerPrimaryAction = whatsappHref ? {
      label: 'WhatsApp',
      icon: <MessageCircle className="h-4 w-4" />,
      onClick: () => handleWhatsAppCustomer(fullDetailOrder),
    } : null;
    const orderDrawerMoreMenuItems = [
      ...STATUS_ACTIONS.map((action) => {
        const isUpdatingThisStatus = isUpdatingCurrentOrderStatus && pendingStatus === action.value;
        return {
          key: `status-${action.value}`,
          label: isUpdatingThisStatus ? getStatusActionProgressLabel(action.value) : action.label,
          icon: isUpdatingThisStatus
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : <PackageCheck className="h-4 w-4" />,
          className: isUpdatingThisStatus ? 'bg-primary/5 text-primary data-[disabled]:opacity-100' : undefined,
          disabled: !fullDetailOrder?.id || !canApplyStatusAction(fullDetailOrder, action.value) || updateStatusMutation.isPending,
          onClick: () => handleStatusUpdate(fullDetailOrder, action.value),
        };
      }),
      ...(canRefundOrder ? [{
        key: 'refund',
        label: 'Refund',
        icon: refundOrderMutation.isPending
          ? <Loader2 className="h-4 w-4 animate-spin" />
          : <CircleDollarSign className="h-4 w-4" />,
        disabled: refundOrderMutation.isPending,
        onClick: () => handleRefundOrder(fullDetailOrder),
      }] : []),
    ];

    return (
      <DetailsDrawer
        open={isDetailOpen}
        onClose={handleCloseDetailDrawer}
        title={getOrderNumber(fullDetailOrder)}
        description="Review customer, payment, fulfillment, and item details."
        width={720}
        primaryAction={orderDrawerPrimaryAction}
        moreMenuItems={orderDrawerMoreMenuItems}
        moreMenuLoading={isUpdatingCurrentOrderStatus}
        moreMenuLoadingLabel="Updating status..."
        tabs={[
          {
            key: 'overview',
            label: 'Overview',
            content: renderDetailContentWithStatusOverlay(
              isDetailLoading ? (
                <div className="space-y-3 py-2">
                  <Skeleton className="h-24 rounded-lg" />
                  <Skeleton className="h-36 rounded-lg" />
                  <Skeleton className="h-36 rounded-lg" />
                </div>
              ) : (
                <div className="space-y-6">
                  <DrawerSectionCard title="Order summary">
                    <Descriptions column={1} className="space-y-0">
                      <DescriptionItem label="Amount">
                        <span>{formatAmount(getOrderTotal(fullDetailOrder))}</span>
                      </DescriptionItem>
                      <DescriptionItem label="Items">
                        <span>{visibleItems.length}</span>
                      </DescriptionItem>
                      <DescriptionItem label="Date">
                        <span>{formatDateTime(fullDetailOrder.createdAt || fullDetailOrder.orderDate)}</span>
                      </DescriptionItem>
                      <DescriptionItem label="Fulfillment">
                        <StatusBadge status={getFulfillmentStatus(fullDetailOrder)} context="fulfillment" />
                      </DescriptionItem>
                      <DescriptionItem label="Payment">
                        <StatusBadge status={getPaymentStatus(fullDetailOrder)} />
                      </DescriptionItem>
                    </Descriptions>
                  </DrawerSectionCard>

                  <DrawerSectionCard title="Customer details">
                    <Descriptions column={1} className="space-y-0">
                      <DescriptionItem label="Name">
                        <span>{getCustomerName(fullDetailOrder)}</span>
                      </DescriptionItem>
                      <DescriptionItem label="Phone">
                        <span>{getCustomerPhone(fullDetailOrder) || '—'}</span>
                      </DescriptionItem>
                      <DescriptionItem label="Email">
                        <span>{fullDetailOrder.customerEmail || fullDetailOrder.customer?.email || '—'}</span>
                      </DescriptionItem>
                    </Descriptions>
                  </DrawerSectionCard>

                <DrawerSectionCard title="Payment and fulfillment">
                  <Descriptions column={1} className="space-y-0">
                    <DescriptionItem label="Payment">
                      <StatusBadge status={getPaymentStatus(fullDetailOrder)} />
                    </DescriptionItem>
                    <DescriptionItem label="Fulfillment">
                      <StatusBadge status={getFulfillmentStatus(fullDetailOrder)} context="fulfillment" />
                    </DescriptionItem>
                    <DescriptionItem label="Shop">
                      <span>{fullDetailOrder.shop?.name || '—'}</span>
                    </DescriptionItem>
                  </Descriptions>
                </DrawerSectionCard>

                <DrawerSectionCard title="Delivery info">
                  <Descriptions column={1} className="space-y-0">
                    <DescriptionItem label="Method">
                      <span>{formatStatusLabel(fullDetailOrder.fulfillmentMethod || (fullDetailOrder.deliveryRequired ? 'delivery' : 'pickup'))}</span>
                    </DescriptionItem>
                    <DescriptionItem label="Delivery status">
                      <span>{fullDetailOrder.deliveryStatus ? formatStatusLabel(fullDetailOrder.deliveryStatus) : 'Not assigned'}</span>
                    </DescriptionItem>
                    <DescriptionItem label="Address">
                      <span>{getDeliveryAddressText(fullDetailOrder) || '—'}</span>
                    </DescriptionItem>
                    <DescriptionItem label="Assigned at">
                      <span>{formatDateTime(fullDetailOrder.deliveryAssignedAt)}</span>
                    </DescriptionItem>
                    <DescriptionItem label="Delivered at">
                      <span>{formatDateTime(fullDetailOrder.deliveredAt)}</span>
                    </DescriptionItem>
                  </Descriptions>
                </DrawerSectionCard>

                <DrawerSectionCard title="Totals">
                  <Descriptions column={1} className="space-y-0">
                    <DescriptionItem label="Subtotal">
                      <span>{formatAmount(fullDetailOrder.subtotal || 0)}</span>
                    </DescriptionItem>
                    <DescriptionItem label="Discount">
                      <span>{formatAmount(fullDetailOrder.discount || 0)}</span>
                    </DescriptionItem>
                    <DescriptionItem label="Tax">
                      <span>{formatAmount(fullDetailOrder.tax || 0)}</span>
                    </DescriptionItem>
                    <DescriptionItem label="Delivery fee">
                      <span>{formatAmount(fullDetailOrder.deliveryFee || 0)}</span>
                    </DescriptionItem>
                    <DescriptionItem label="Total">
                      <span>{formatAmount(getOrderTotal(fullDetailOrder))}</span>
                    </DescriptionItem>
                  </Descriptions>
                </DrawerSectionCard>

                {!isOnlineStoreChannel ? (
                <DrawerSectionCard title="Trade Assurance">
                  <Descriptions column={1} className="space-y-0">
                    <DescriptionItem label="Held status">
                      {tradeStatus ? <StatusBadge status={tradeStatus} /> : <span>Not recorded</span>}
                    </DescriptionItem>
                    <DescriptionItem label="Seller net">
                      <span>{formatAmount(tradeAssurance.netAmount || 0)}</span>
                    </DescriptionItem>
                    <DescriptionItem label="Sabito fee">
                      <span>{formatAmount(tradeAssurance.feeAmount || 0)}</span>
                    </DescriptionItem>
                    <DescriptionItem label="Gross amount">
                      <span>{formatAmount(tradeAssurance.grossAmount || getOrderTotal(fullDetailOrder))}</span>
                    </DescriptionItem>
                    <DescriptionItem label="Held at">
                      <span>{formatDateTime(tradeAssurance.heldAt)}</span>
                    </DescriptionItem>
                    <DescriptionItem label="Release eligible">
                      <span>
                        {tradeAssurance.payoutReleaseEligibleAt
                          ? formatDateTime(tradeAssurance.payoutReleaseEligibleAt)
                          : (tradeAssurance.payoutReleaseEligible ? 'Now' : 'After delivery window')}
                      </span>
                    </DescriptionItem>
                    <DescriptionItem label="Refunded">
                      <span>{formatAmount(tradeAssurance.refundedAmount || 0)}</span>
                    </DescriptionItem>
                  </Descriptions>
                </DrawerSectionCard>
                ) : (
                <DrawerSectionCard title="Payment">
                  <Descriptions column={1} className="space-y-0">
                    <DescriptionItem label="Status">
                      {tradeStatus ? <StatusBadge status={tradeStatus} /> : <span>Paid directly</span>}
                    </DescriptionItem>
                    <DescriptionItem label="Amount">
                      <span>{formatAmount(getOrderTotal(fullDetailOrder))}</span>
                    </DescriptionItem>
                    <DescriptionItem label="Settlement">
                      <span>Direct Paystack settlement (not Trade Assurance)</span>
                    </DescriptionItem>
                  </Descriptions>
                </DrawerSectionCard>
                )}

                <DrawerSectionCard title="Items">
                  <div className="space-y-3">
                    {visibleItems.map((item, index) => {
                      const itemName = getOrderItemName(item);

                      return (
                        <div key={item.id || index} className="flex items-start justify-between gap-4 border-b border-border/50 pb-3 last:border-b-0 last:pb-0">
                          <div className="flex min-w-0 items-start gap-3">
                            <OrderItemThumbnail item={item} alt={itemName} />
                            <div className="min-w-0">
                              <p className="font-medium text-foreground">{itemName}</p>
                              <p className="text-sm text-muted-foreground">Qty {item.quantity || item.qty || 1}</p>
                              {item.variant?.name ? <p className="text-xs text-muted-foreground">Variant: {item.variant.name}</p> : null}
                            </div>
                          </div>
                          <p className="shrink-0 text-right font-medium text-foreground">{formatAmount(item.total || item.amount || item.price || item.unitPrice || 0)}</p>
                        </div>
                      );
                    })}
                    {!visibleItems.length && (
                      <p className="text-sm text-muted-foreground">No item details are available for this order yet.</p>
                    )}
                  </div>
                </DrawerSectionCard>
                </div>
              )
            ),
          },
          {
            key: 'activity',
            label: 'Activities',
            content: renderDetailContentWithStatusOverlay((
              <div className="space-y-4">
                {!activityTimeline.hasBackendActivity && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                    Full backend activity history is limited for this order, so this timeline also uses available order timestamps and delivery tracking metadata.
                  </div>
                )}
                <DrawerSectionCard title="Order activity">
                  {activityTimeline.events.length ? (
                    <Timeline>
                      {activityTimeline.events.map((event, index) => (
                        <TimelineItem
                          key={event.id || `${getActivityKind(event.status, event.title)}-${event.at}-${index}`}
                          isLast={index === activityTimeline.events.length - 1}
                        >
                          <TimelineIndicator />
                          <TimelineContent>
                            <TimelineTitle>{event.title}</TimelineTitle>
                            <TimelineTime>{formatDateTime(event.at)}</TimelineTime>
                            {event.description ? (
                              <TimelineDescription>{event.description}</TimelineDescription>
                            ) : null}
                            {event.source ? (
                              <div className="mt-2">
                                <span className="rounded-full border border-border bg-muted/20 px-2.5 py-0.5 text-xs text-muted-foreground">{event.source}</span>
                              </div>
                            ) : null}
                          </TimelineContent>
                        </TimelineItem>
                      ))}
                    </Timeline>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No activity events are available for this order yet.
                    </p>
                  )}
                </DrawerSectionCard>
              </div>
            )),
          },
        ]}
      />
    );
  };

  const renderCancellationDialog = () => {
    const reason = cancellationReason.trim();
    const isCancellingOrder = Boolean(
      pendingStatusUpdate
      && pendingStatus === 'cancelled'
      && pendingStatusOrderId === cancelOrderRequest?.id
    );
    return (
      <Dialog open={Boolean(cancelOrderRequest)} onOpenChange={handleCloseCancelDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Cancel online order?</DialogTitle>
            <DialogDescription>
              Tell the buyer why {getOrderNumber(cancelOrderRequest || {})} is being cancelled. If the order has a held Trade Assurance payment, the held amount will be refunded.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <div className="space-y-2">
              <label htmlFor="order-cancellation-reason" className="text-sm font-medium">
                Cancellation reason
              </label>
              <Textarea
                ref={cancellationReasonRef}
                id="order-cancellation-reason"
                value={cancellationReason}
                onChange={(event) => {
                  setCancellationReason(event.target.value);
                  if (cancellationReasonError) setCancellationReasonError('');
                }}
                placeholder="Example: Item is out of stock and cannot be fulfilled."
                maxLength={240}
                rows={5}
                disabled={isCancellingOrder}
                aria-invalid={Boolean(cancellationReasonError)}
                aria-describedby={cancellationReasonError ? 'order-cancellation-reason-error' : 'order-cancellation-reason-help'}
                className={cancellationReasonError ? 'border-red-300 focus-visible:ring-red-200' : undefined}
              />
              {cancellationReasonError ? (
                <p id="order-cancellation-reason-error" className="text-sm font-medium text-red-700">
                  {cancellationReasonError}
                </p>
              ) : null}
              <p id="order-cancellation-reason-help" className="text-xs text-muted-foreground">
                This reason is saved on the order record and refund activity.
              </p>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={updateStatusMutation.isPending}
              onClick={() => handleCloseCancelDialog(false)}
            >
              Keep order
            </Button>
            <Button
              type="button"
              disabled={!reason || updateStatusMutation.isPending}
              onClick={handleConfirmCancellation}
            >
              {isCancellingOrder ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {isCancellingOrder ? 'Cancelling...' : 'Cancel and refund'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold sm:text-2xl">
            {isOnlineStoreChannel ? 'Online Store orders' : 'Sabito Store orders'}
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground sm:text-base">Track storefront orders, payments, fulfillment, and customer follow-up.</p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end">
          <Button variant="outline" className="w-full sm:w-auto" disabled={!previewUrl} asChild={Boolean(previewUrl)}>
            {previewUrl ? (
              <a href={previewUrl} target="_blank" rel="noreferrer">
                <ArrowUpRight className="mr-2 h-4 w-4" />
                Preview Store
              </a>
            ) : (
              <span>
                <ArrowUpRight className="mr-2 h-4 w-4" />
                Preview Store
              </span>
            )}
          </Button>
          <Button variant="outline" className="w-full sm:w-auto" onClick={handleExport} disabled={exportMutation.isPending}>
            {exportMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            Export
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="w-full sm:w-auto">
                <Filter className="mr-2 h-4 w-4" />
                Filter
                <ChevronDown className="ml-2 h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Order status</DropdownMenuLabel>
              {STATUS_FILTERS.map((filter) => (
                <DropdownMenuItem key={filter.value} onClick={() => handleStatusFilterChange(filter.value)}>
                  {filter.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button className="w-full sm:w-auto" onClick={handleRefresh} disabled={isRefreshing}>
            <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {isLoading ? renderLoadingSkeleton() : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 md:gap-4 lg:grid-cols-4">
            {kpiCards.map((card) => {
              const Icon = card.icon;
              return (
                <Card key={card.label} className="border border-border">
                  <CardHeader className="flex flex-row items-start justify-between gap-2 p-4 pb-2 sm:p-6 sm:pb-2">
                    <CardTitle className="text-xs font-medium leading-snug text-muted-foreground sm:text-sm">{card.label}</CardTitle>
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <Icon className="h-4 w-4" />
                    </span>
                  </CardHeader>
                  <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
                    <div className="text-2xl font-semibold leading-none">{card.value}</div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
            <Card className="border border-border">
              <CardHeader className="p-4 pb-2 sm:p-6 sm:pb-2">
                <CardTitle className="text-base text-primary">Today&apos;s Online Sales</CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
                <div className="text-3xl font-semibold sm:text-4xl">{formatAmount(stats.todayRevenue || 0)}</div>
                <p className="mt-1 text-sm text-muted-foreground">{stats.todayOrderCount || 0} orders placed today</p>
              </CardContent>
            </Card>
            <Card className="border border-border">
              <CardHeader className="p-4 pb-2 sm:p-6 sm:pb-2">
                <CardTitle className="text-base">Fulfillment Activity</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-3 divide-x divide-border p-4 pt-0 text-center text-xs sm:p-6 sm:pt-0 sm:text-sm lg:grid-cols-1 lg:divide-x-0 lg:text-left">
                <div className="space-y-1 px-2 first:pl-0 lg:flex lg:items-center lg:justify-between lg:px-0 lg:py-2">
                  <span className="text-muted-foreground">Today&apos;s orders</span>
                  <span className="block font-semibold lg:inline">{stats.todayOrderCount || 0}</span>
                </div>
                <div className="space-y-1 px-2 lg:flex lg:items-center lg:justify-between lg:px-0 lg:py-2">
                  <span className="text-muted-foreground">In fulfillment</span>
                  <span className="block font-semibold lg:inline">{(stats.processing || 0) + (stats.ready || 0) + (stats.outForDelivery || 0)}</span>
                </div>
                <div className="space-y-1 px-2 last:pr-0 lg:flex lg:items-center lg:justify-between lg:px-0 lg:py-2">
                  <span className="text-muted-foreground">Delivered</span>
                  <span className="block font-semibold lg:inline">{stats.delivered || 0}</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {renderTradeAssuranceDashboard()}

          <Card className="border border-border">
            <CardContent className="space-y-4 p-3 sm:p-6">
              <div className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
                {STATUS_FILTERS.map((filter) => (
                  <Button
                    key={filter.value}
                    variant={statusFilter === filter.value ? 'default' : 'outline'}
                    size="sm"
                    className="shrink-0"
                    onClick={() => handleStatusFilterChange(filter.value)}
                  >
                    {filter.label}
                  </Button>
                ))}
              </div>

              {orders.length === 0 ? renderEmptyState() : (
                <>
                  {renderOrderTable()}
                  {renderMobileCards()}
                  {ordersInfinite ? (
                    <InfiniteListFooter {...ordersInfinite} count={orders.length} noun="orders" />
                  ) : renderPagination()}
                </>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {renderDetailSheet()}
      {renderCancellationDialog()}
    </div>
  );
};

export default OnlineOrders;
