import { useCallback, useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  Banknote,
  Building2,
  CheckCircle2,
  CreditCard,
  Settings,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Store,
  Users,
} from 'lucide-react';
import adminService from '../../services/adminService';
import ActionColumn from '../../components/ActionColumn';
import DashboardStatsCard from '../../components/DashboardStatsCard';
import DashboardTable from '../../components/DashboardTable';
import DetailsDrawer from '../../components/DetailsDrawer';
import DrawerSectionCard from '../../components/DrawerSectionCard';
import StatusChip from '../../components/StatusChip';
import { useDebounce } from '../../hooks/useDebounce';
import { useSmartSearch } from '../../context/SmartSearchContext';
import { usePlatformAdminPermissions } from '../../context/PlatformAdminPermissionsContext';
import { DEBOUNCE_DELAYS, PAGINATION } from '../../constants';
import { resolveImageUrl } from '../../utils/fileUtils';
import { formatAmount, formatInteger } from '../../utils/formatNumber';
import { handleApiError, showSuccess } from '../../utils/toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Descriptions, DescriptionItem } from '@/components/ui/descriptions';
import { Empty } from '@/components/ui/empty';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';

const SECTION_CONFIG = {
  overview: {
    title: 'Sabito Control Center',
    description: 'Monitor marketplace stores, orders, held payments, disputes, and shopper accounts.',
    permission: 'overview.view',
    searchPlaceholder: 'Search Sabito operations...',
  },
  stores: {
    title: 'Marketplace Stores',
    description: 'Track launched and pending Sabito storefronts across ABS tenants.',
    permission: 'tenants.view',
    searchPlaceholder: 'Search stores, tenants, slugs, or contacts...',
  },
  orders: {
    title: 'Marketplace Orders',
    description: 'Review online storefront orders and their trade assurance state.',
    permission: 'tenants.view',
    searchPlaceholder: 'Search order number, tenant, shop, or customer...',
  },
  'trade-assurance': {
    title: 'Trade Assurance',
    description: 'Monitor held payments, available payouts, platform fees, refunds, and release windows.',
    permission: 'tenants.view',
    searchPlaceholder: 'Search trade assurance records...',
  },
  disputes: {
    title: 'Disputes',
    description: 'Review open and resolved buyer dispute records.',
    permission: 'tenants.view',
    searchPlaceholder: 'Search disputes...',
  },
  customers: {
    title: 'Storefront Shoppers',
    description: 'Browse Sabito shopper accounts used across storefronts.',
    permission: 'tenants.view',
    searchPlaceholder: 'Search shoppers by name, email, or phone...',
  },
  settings: {
    title: 'Platform Settings',
    description: 'Read-only marketplace commission and release settings for this MVP.',
    permission: 'settings.view',
    searchPlaceholder: 'Search Sabito settings...',
  },
};

const NAV_ITEMS = [
  { section: 'overview', label: 'Overview' },
  { section: 'stores', label: 'Stores' },
  { section: 'orders', label: 'Orders' },
  { section: 'trade-assurance', label: 'Trade Assurance' },
  { section: 'disputes', label: 'Disputes' },
  { section: 'customers', label: 'Customers' },
  { section: 'settings', label: 'Settings' },
];

const paymentStatusOptions = ['all', 'paid_held', 'released', 'disputed', 'refunded'];
const disputeStatusOptions = ['all', 'open', 'under_review', 'resolved_release', 'resolved_refund', 'cancelled'];

const getCurrencyPrefix = (currency = 'GHS') => `${String(currency || 'GHS').toUpperCase()} `;
const formatMoney = (amount, currency = 'GHS') => formatAmount(amount, getCurrencyPrefix(currency));
const formatDate = (value) => (value ? dayjs(value).format('MMM D, YYYY') : 'N/A');
const formatDateTime = (value) => (value ? dayjs(value).format('MMM D, YYYY h:mm A') : 'N/A');
const getPaymentStatus = (record) => (
  record?.paymentStatus
  || record?.tradeAssurance?.paymentStatus
  || record?.tradeAssurance?.status
  || 'pending'
);
const getFulfillmentStatus = (record) => record?.fulfillmentStatus || record?.orderStatus || 'pending';
const getStoreStatus = (store) => (store?.enabled && store?.setupCompletedAt ? 'launched' : store?.enabled ? 'active' : 'pending');
const getShopperName = (record) => record?.storefrontCustomer?.name || record?.customer?.name || record?.openedByEmail || 'Guest shopper';
const formatLabel = (value) => (value ? String(value).replace(/_/g, ' ') : 'N/A');
const getOrderItemImageUrl = (item) => resolveImageUrl(
  item?.imageUrl
  || item?.metadata?.imageUrl
  || item?.product?.imageUrl
  || item?.productImageUrl
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

const normalizeStatus = (value) => String(value || '').trim().toLowerCase();

const normalizeTimelineText = (value) => String(value || '')
  .trim()
  .toLowerCase()
  .replace(/[_\s-]+/g, ' ');

const getActivityLabel = (value) => {
  const normalized = normalizeStatus(value);
  if (!normalized) return 'Order updated';
  return ACTIVITY_LABELS[normalized] || normalized
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
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
  return kindMap[normalized] || normalized || normalizeTimelineText(title);
};

const isDuplicateTimelineText = (value, ...comparisons) => {
  const normalized = normalizeTimelineText(value);
  return normalized && comparisons.some((comparison) => normalizeTimelineText(comparison) === normalized);
};

const getTimelineTitle = (rawTitle, status) => {
  const statusLabel = getActivityLabel(status);
  if (!rawTitle || isDuplicateTimelineText(rawTitle, status, statusLabel)) return statusLabel;
  return rawTitle;
};

const getTimelineDescription = (description, status, title) => {
  const statusLabel = getActivityLabel(status);
  const text = String(description || '').trim();
  if (text && !isDuplicateTimelineText(text, title, status, statusLabel)) return text;
  return isDuplicateTimelineText(statusLabel, title) ? '' : statusLabel;
};

const buildActivityTimelineEvents = (activity = []) => {
  const seen = new Set();
  return activity
    .map((event, index) => {
      const status = event.status || event.type || event.action;
      const title = getTimelineTitle(event.label || event.title || event.subject, status);
      return {
        id: event.id || `${status || title}-${event.at || event.createdAt || index}`,
        at: event.at || event.createdAt || event.timestamp,
        title,
        description: getTimelineDescription(event.description || event.notes || event.message || event.detail, status, title),
        status,
      };
    })
    .filter((event) => event.at && dayjs(event.at).isValid())
    .sort((a, b) => dayjs(b.at).valueOf() - dayjs(a.at).valueOf())
    .filter((event) => {
      const key = `${getActivityKind(event.status, event.title)}-${dayjs(event.at).valueOf()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
};

const getDeliveryAddressText = (address) => {
  if (!address || typeof address !== 'object') return 'N/A';
  const parts = [
    address.label,
    address.addressLine1 || address.address,
    address.addressLine2,
    address.city,
    address.region,
    address.country,
  ].filter(Boolean);
  return parts.length ? parts.join(', ') : 'N/A';
};

function OrderDetailTabs({ order, loading }) {
  if (loading && !order?.items) {
    return [
      {
        key: 'overview',
        label: 'Overview',
        content: <Skeleton className="h-[420px] w-full" />,
      },
      {
        key: 'activity',
        label: 'Activities',
        content: <Skeleton className="h-[280px] w-full" />,
      },
    ];
  }

  const currency = order?.currency || order?.tradeAssurance?.currency || 'GHS';
  const items = order?.items || [];
  const activity = order?.activity || [];
  const activityTimeline = buildActivityTimelineEvents(activity);

  const tabs = [
    {
      key: 'overview',
      label: 'Overview',
      content: (
        <div className="space-y-4">
          <DrawerSectionCard title="Order overview">
            <Descriptions column={1} className="space-y-0">
              <DescriptionItem label="Order no">{order?.saleNumber || 'N/A'}</DescriptionItem>
              <DescriptionItem label="Seller">{order?.store?.name || order?.shop?.name || order?.tenant?.name || 'N/A'}</DescriptionItem>
              <DescriptionItem label="Tenant">{order?.tenant?.name || order?.store?.tenantName || 'N/A'}</DescriptionItem>
              <DescriptionItem label="Customer">{order?.shopper?.name || getShopperName(order)}</DescriptionItem>
              <DescriptionItem label="Customer contact">
                {order?.shopper?.email || order?.shopper?.phone || order?.customer?.email || order?.customer?.phone || 'N/A'}
              </DescriptionItem>
              <DescriptionItem label="Created">{formatDateTime(order?.createdAt)}</DescriptionItem>
            </Descriptions>
          </DrawerSectionCard>

          <DrawerSectionCard title="Statuses">
            <Descriptions column={1} className="space-y-0">
              <DescriptionItem label="Sale status"><StatusChip status={order?.status || 'pending'} /></DescriptionItem>
              <DescriptionItem label="Fulfillment"><StatusChip status={getFulfillmentStatus(order)} /></DescriptionItem>
              <DescriptionItem label="Payment"><StatusChip status={getPaymentStatus(order)} /></DescriptionItem>
              <DescriptionItem label="Fulfillment method">{formatLabel(order?.fulfillmentMethod || order?.delivery?.method)}</DescriptionItem>
            </Descriptions>
          </DrawerSectionCard>

          <DrawerSectionCard title="Totals">
            <Descriptions column={1} className="space-y-0">
              <DescriptionItem label="Subtotal">{formatMoney(order?.subtotal || 0, currency)}</DescriptionItem>
              <DescriptionItem label="Discount">{formatMoney(order?.discount || 0, currency)}</DescriptionItem>
              <DescriptionItem label="Tax">{formatMoney(order?.tax || 0, currency)}</DescriptionItem>
              <DescriptionItem label="Delivery fee">{formatMoney(order?.deliveryFee || 0, currency)}</DescriptionItem>
              <DescriptionItem label="Total">{formatMoney(order?.total || 0, currency)}</DescriptionItem>
            </Descriptions>
          </DrawerSectionCard>

          <DrawerSectionCard title="Order items">
            {items.length ? (
              <div className="space-y-3">
                {items.map((item) => (
                  <div key={item.id} className="rounded-lg border border-border bg-background p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-3">
                        <OrderItemThumbnail item={item} alt={item.name || 'Order item'} />
                        <div className="min-w-0">
                          <div className="font-medium">{item.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {[item.variantName, item.sku].filter(Boolean).join(' / ') || 'No variant or SKU'}
                          </div>
                        </div>
                      </div>
                      <div className="text-right text-sm font-semibold">{formatMoney(item.total || 0, currency)}</div>
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-muted-foreground">
                      <span>Qty: {item.quantity}</span>
                      <span>Unit: {formatMoney(item.unitPrice || 0, currency)}</span>
                      <span>Discount: {formatMoney(item.discount || 0, currency)}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No item details were found for this order.</p>
            )}
          </DrawerSectionCard>

          <DrawerSectionCard title="Delivery information">
            <Descriptions column={1} className="space-y-0">
              <DescriptionItem label="Required">{order?.delivery?.required ? 'Yes' : 'No'}</DescriptionItem>
              <DescriptionItem label="Method">{formatLabel(order?.delivery?.method || order?.fulfillmentMethod)}</DescriptionItem>
              <DescriptionItem label="Status">{order?.delivery?.status ? <StatusChip status={order.delivery.status} /> : 'N/A'}</DescriptionItem>
              <DescriptionItem label="Courier">{order?.delivery?.courier || 'N/A'}</DescriptionItem>
              <DescriptionItem label="Tracking no">{order?.delivery?.trackingNumber || 'N/A'}</DescriptionItem>
              <DescriptionItem label="Delivered">{formatDateTime(order?.delivery?.deliveredAt)}</DescriptionItem>
              <DescriptionItem label="Address">{getDeliveryAddressText(order?.delivery?.address)}</DescriptionItem>
            </Descriptions>
            {order?.delivery?.notes && <p className="mt-2 text-sm text-muted-foreground">{order.delivery.notes}</p>}
          </DrawerSectionCard>

          <DrawerSectionCard title="Trade assurance">
            <Descriptions column={1} className="space-y-0">
              <DescriptionItem label="Status"><StatusChip status={getPaymentStatus(order)} /></DescriptionItem>
              <DescriptionItem label="Method">{formatLabel(order?.paymentMethod)}</DescriptionItem>
              <DescriptionItem label="Gross">{formatMoney(order?.tradeAssurance?.grossAmount || order?.total || 0, currency)}</DescriptionItem>
              <DescriptionItem label="Platform fee">{formatMoney(order?.tradeAssurance?.feeAmount || 0, currency)}</DescriptionItem>
              <DescriptionItem label="Seller net">{formatMoney(order?.tradeAssurance?.netAmount || 0, currency)}</DescriptionItem>
              <DescriptionItem label="Refunded">{formatMoney(order?.tradeAssurance?.refundedAmount || 0, currency)}</DescriptionItem>
              <DescriptionItem label="Held">{formatDateTime(order?.tradeAssurance?.heldAt)}</DescriptionItem>
              <DescriptionItem label="Eligible">{formatDateTime(order?.tradeAssurance?.releaseEligibleAt)}</DescriptionItem>
              <DescriptionItem label="Released">{formatDateTime(order?.tradeAssurance?.releasedAt)}</DescriptionItem>
            </Descriptions>
          </DrawerSectionCard>
        </div>
      ),
    },
    {
      key: 'activity',
      label: 'Activities',
      content: (
        <DrawerSectionCard title="Order activity">
          {activityTimeline.length ? (
            <Timeline>
              {activityTimeline.map((event, index) => (
                <TimelineItem
                  key={event.id}
                  isLast={index === activityTimeline.length - 1}
                >
                  <TimelineIndicator />
                  <TimelineContent>
                    <TimelineTitle>{event.title}</TimelineTitle>
                    <TimelineTime>{formatDateTime(event.at)}</TimelineTime>
                    {event.description ? (
                      <TimelineDescription>{event.description}</TimelineDescription>
                    ) : null}
                  </TimelineContent>
                </TimelineItem>
              ))}
            </Timeline>
          ) : (
            <p className="text-sm text-muted-foreground">No activity events are available for this order yet.</p>
          )}
        </DrawerSectionCard>
      ),
    },
  ];

  return tabs;
}

const PermissionDenied = () => (
  <div className="flex items-center justify-center min-h-[400px]">
    <div className="text-center">
      <h3 className="text-lg font-semibold text-foreground mb-2">Access Denied</h3>
      <p className="text-sm text-muted-foreground">You do not have permission to view this Sabito Store Admin page.</p>
    </div>
  </div>
);

function SectionHeader({ section }) {
  const config = SECTION_CONFIG[section] || SECTION_CONFIG.overview;
  return (
    <div className="mb-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <ShoppingBag className="h-5 w-5 text-brand" />
            <h2 className="text-2xl font-semibold text-foreground">{config.title}</h2>
          </div>
          <p className="text-sm text-muted-foreground">{config.description}</p>
        </div>
        <Badge variant="outline" className="w-fit border-brand/30 text-brand">
          Sabito Store Admin
        </Badge>
      </div>
    </div>
  );
}

function SabitoNav({ section }) {
  return (
    <div className="mb-6 flex gap-2 overflow-x-auto border-b border-border pb-2">
      {NAV_ITEMS.map((item) => (
        <Button
          key={item.section}
          asChild
          variant={section === item.section ? 'default' : 'ghost'}
          size="sm"
          className="shrink-0"
        >
          <Link to={`/admin/sabito/${item.section}`}>{item.label}</Link>
        </Button>
      ))}
    </div>
  );
}

function FilterSelect({ value, onChange, options, label }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-full sm:w-[220px]">
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option} value={option}>
            {option === 'all' ? label : option.replace(/_/g, ' ')}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function OverviewSection({ data, loading }) {
  const summary = data?.summary || {};
  const currency = summary.currency || 'GHS';
  const recentOrderColumns = useMemo(() => [
    {
      key: 'saleNumber',
      label: 'Order',
      render: (value, record) => (
        <div>
          <div className="font-medium">{value || 'N/A'}</div>
          <div className="text-xs text-muted-foreground">{record.tenant?.name || record.shop?.name || 'Marketplace'}</div>
        </div>
      ),
    },
    { key: 'customer', label: 'Customer', render: (_, record) => getShopperName(record) },
    { key: 'total', label: 'Total', render: (value, record) => formatMoney(value, record.tradeAssurance?.currency || currency) },
    { key: 'tradeAssurance', label: 'Payment', render: (_, record) => <StatusChip status={getPaymentStatus(record)} /> },
    { key: 'createdAt', label: 'Created', render: formatDate },
  ], [currency]);

  const recentStoreColumns = useMemo(() => [
    {
      key: 'displayName',
      label: 'Store',
      render: (value, record) => (
        <div>
          <div className="font-medium">{value}</div>
          <div className="text-xs text-muted-foreground">/{record.slug}</div>
        </div>
      ),
    },
    { key: 'tenant', label: 'Tenant', render: (value) => value?.name || 'N/A' },
    { key: 'enabled', label: 'Status', render: (_, record) => <StatusChip status={getStoreStatus(record)} /> },
    { key: 'metrics', label: 'Orders', render: (value) => formatInteger(value?.orderCount || 0) },
  ], []);

  if (loading) {
    return <Skeleton className="h-[420px] w-full" />;
  }

  return (
    <div>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <DashboardStatsCard title="Total stores" value={summary.totalStores || 0} icon={Store} iconBgColor="#dcfce7" iconColor="#166534" />
        <DashboardStatsCard title="Active stores" value={summary.activeStores || 0} icon={CheckCircle2} iconBgColor="#dbeafe" iconColor="#2563eb" />
        <DashboardStatsCard title="Orders today" value={summary.ordersToday || 0} icon={ShoppingCart} iconBgColor="#fef3c7" iconColor="#d97706" />
        <DashboardStatsCard title="Held payout" value={formatMoney(summary.heldPayoutAmount || 0, currency)} icon={ShieldCheck} iconBgColor="#e0e7ff" iconColor="#4f46e5" />
        <DashboardStatsCard title="Open disputes" value={summary.openDisputes || 0} icon={AlertTriangle} iconBgColor="#fee2e2" iconColor="#dc2626" />
        <DashboardStatsCard title="Platform fees" value={formatMoney(summary.feeAmount || 0, currency)} icon={Banknote} iconBgColor="#f3e8ff" iconColor="#7c3aed" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <DashboardTable
          title="Recent marketplace orders"
          data={data?.recentOrders || []}
          columns={recentOrderColumns}
          pageSize={5}
          emptyDescription="No marketplace orders yet"
        />
        <DashboardTable
          title="Recently updated stores"
          data={data?.recentStores || []}
          columns={recentStoreColumns}
          pageSize={5}
          emptyDescription="No Sabito stores yet"
        />
      </div>
    </div>
  );
}

function StoresSection({ rows, pagination, loading, filters, onFiltersChange, onPageChange }) {
  const columns = useMemo(() => [
    {
      key: 'displayName',
      label: 'Store',
      render: (value, record) => (
        <div>
          <div className="font-medium">{value}</div>
          <div className="text-xs text-muted-foreground">/{record.slug}</div>
        </div>
      ),
    },
    { key: 'tenant', label: 'Tenant', render: (value) => value?.name || 'N/A' },
    { key: 'shop', label: 'Shop', render: (value) => value?.name || 'Default shop' },
    { key: 'enabled', label: 'Status', render: (_, record) => <StatusChip status={getStoreStatus(record)} /> },
    { key: 'metrics', label: 'Orders', render: (value) => formatInteger(value?.orderCount || 0) },
    { key: 'contactEmail', label: 'Contact', render: (value, record) => value || record.contactPhone || 'N/A' },
    { key: 'updatedAt', label: 'Updated', render: formatDate },
    {
      key: 'actions',
      label: 'Actions',
      render: (_, record) => (
        record?.tenantId ? (
          <Button asChild variant="outline" size="sm">
            <Link to={`/admin/online-store/setup?tenantId=${record.tenantId}`}>
              Set up
            </Link>
          </Button>
        ) : null
      ),
    },
  ], []);

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <FilterSelect
          value={filters.status}
          onChange={(status) => onFiltersChange({ status })}
          options={['all', 'active', 'pending']}
          label="All store statuses"
        />
      </div>
      <DashboardTable
        title="Sabito stores"
        data={rows}
        columns={columns}
        loading={loading}
        pageSize={pagination.pageSize}
        externalPagination={pagination}
        onPageChange={onPageChange}
        emptyDescription="No Sabito stores match this view"
      />
    </div>
  );
}

function OrdersSection({ rows, pagination, loading, filters, onFiltersChange, onPageChange }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const handleViewOrder = useCallback(async (record) => {
    setSelectedOrder(record);
    setDrawerOpen(true);
    setDetailLoading(true);
    try {
      const response = await adminService.getSabitoOrder(record.id);
      if (response?.success) {
        setSelectedOrder(response.data);
      }
    } catch (error) {
      handleApiError(error, { context: 'load marketplace order details' });
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const handleCloseDrawer = useCallback(() => {
    setDrawerOpen(false);
    setSelectedOrder(null);
    setDetailLoading(false);
  }, []);

  const columns = useMemo(() => [
    {
      key: 'saleNumber',
      label: 'Order',
      render: (value, record) => (
        <div>
          <div className="font-medium">{value || 'N/A'}</div>
          <div className="text-xs text-muted-foreground">{record.tenant?.name || record.shop?.name || 'Marketplace'}</div>
        </div>
      ),
    },
    { key: 'customer', label: 'Customer', render: (_, record) => getShopperName(record) },
    { key: 'total', label: 'Total', render: (value, record) => formatMoney(value, record.tradeAssurance?.currency || 'GHS') },
    { key: 'status', label: 'Sale status', render: (value) => <StatusChip status={value} /> },
    { key: 'fulfillmentStatus', label: 'Fulfillment', render: (_, record) => <StatusChip status={getFulfillmentStatus(record)} /> },
    { key: 'tradeAssurance', label: 'Payment', render: (_, record) => <StatusChip status={getPaymentStatus(record)} /> },
    { key: 'createdAt', label: 'Created', render: formatDate },
    {
      key: 'actions',
      label: 'Actions',
      render: (_, record) => <ActionColumn onView={handleViewOrder} record={record} />,
    },
  ], [handleViewOrder]);

  const drawerTabs = useMemo(
    () => OrderDetailTabs({ order: selectedOrder, loading: detailLoading }),
    [detailLoading, selectedOrder]
  );

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <FilterSelect
          value={filters.paymentStatus}
          onChange={(paymentStatus) => onFiltersChange({ paymentStatus })}
          options={paymentStatusOptions}
          label="All payment statuses"
        />
      </div>
      <DashboardTable
        title="Marketplace orders"
        data={rows}
        columns={columns}
        loading={loading}
        pageSize={pagination.pageSize}
        externalPagination={pagination}
        onPageChange={onPageChange}
        emptyDescription="No marketplace orders match this view"
      />
      <DetailsDrawer
        open={drawerOpen}
        onClose={handleCloseDrawer}
        title={selectedOrder?.saleNumber || 'Marketplace order'}
        description="View Sabito marketplace order details"
        width={860}
        showActions={false}
        tabs={drawerTabs}
        extra={selectedOrder ? <StatusChip status={getPaymentStatus(selectedOrder)} /> : null}
      />
    </div>
  );
}

function TradeAssuranceSection({ data, loading, pagination, filters, onFiltersChange, onPageChange, onRefresh }) {
  const summary = data?.summary || {};
  const balances = summary.balances || {};
  const currency = balances.currency || 'GHS';
  const [releasingPaymentId, setReleasingPaymentId] = useState(null);
  const handleReleasePayout = useCallback(async (payment) => {
    const orderId = payment?.sale?.id || payment?.saleId;
    if (!orderId) return;

    const reason = window.prompt('Release reason', 'sabito_admin_release');
    if (reason === null) return;

    setReleasingPaymentId(payment.id);
    try {
      await adminService.releaseSabitoOrderPayout(orderId, { reason: reason || 'sabito_admin_release' });
      showSuccess('Marketplace payout released');
      await onRefresh?.();
    } catch (error) {
      handleApiError(error, { context: 'release marketplace payout' });
    } finally {
      setReleasingPaymentId(null);
    }
  }, [onRefresh]);
  const paymentColumns = useMemo(() => [
    { key: 'sale', label: 'Order', render: (value) => value?.saleNumber || 'N/A' },
    { key: 'shop', label: 'Store', render: (value, record) => value?.name || record.tenant?.name || 'N/A' },
    { key: 'grossAmount', label: 'Gross', render: (value, record) => formatMoney(value, record.currency || currency) },
    { key: 'feeAmount', label: 'Fee', render: (value, record) => formatMoney(value, record.currency || currency) },
    { key: 'netAmount', label: 'Seller net', render: (value, record) => formatMoney(value, record.currency || currency) },
    { key: 'status', label: 'Status', render: (value) => <StatusChip status={value} /> },
    { key: 'releaseEligibleAt', label: 'Eligible', render: formatDate },
    {
      key: 'actions',
      label: '',
      render: (_value, record) => {
        const canRelease = ['paid_held', 'disputed'].includes(record?.status);
        if (!canRelease) return null;

        return (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={releasingPaymentId === record.id}
            onClick={() => handleReleasePayout(record)}
          >
            {releasingPaymentId === record.id ? 'Releasing...' : 'Release payout'}
          </Button>
        );
      },
    },
  ], [currency, handleReleasePayout, releasingPaymentId]);

  if (loading && !data) {
    return <Skeleton className="h-[420px] w-full" />;
  }

  return (
    <div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <DashboardStatsCard title="Pending held" value={formatMoney(balances.pending || 0, currency)} icon={ShieldCheck} iconBgColor="#dcfce7" iconColor="#166534" />
        <DashboardStatsCard title="Available payout" value={formatMoney(balances.available || 0, currency)} icon={CreditCard} iconBgColor="#dbeafe" iconColor="#2563eb" />
        <DashboardStatsCard title="Platform fees" value={formatMoney(balances.fee || 0, currency)} icon={Banknote} iconBgColor="#fef3c7" iconColor="#d97706" />
        <DashboardStatsCard title="Open disputes" value={summary.counts?.openDisputes || 0} icon={AlertTriangle} iconBgColor="#fee2e2" iconColor="#dc2626" />
      </div>

      <div className="mb-4 flex justify-end">
        <FilterSelect
          value={filters.paymentStatus}
          onChange={(paymentStatus) => onFiltersChange({ paymentStatus })}
          options={paymentStatusOptions}
          label="All payment statuses"
        />
      </div>
      <DashboardTable
        title="Held payments and payouts"
        data={data?.payments || []}
        columns={paymentColumns}
        loading={loading}
        pageSize={pagination.pageSize}
        externalPagination={pagination}
        onPageChange={onPageChange}
        emptyDescription="No trade assurance payments yet"
      />
    </div>
  );
}

function DisputesSection({ rows, pagination, loading, filters, onFiltersChange, onPageChange }) {
  const columns = useMemo(() => [
    { key: 'sale', label: 'Order', render: (value) => value?.saleNumber || 'N/A' },
    { key: 'storefrontCustomer', label: 'Customer', render: (value, record) => value?.name || record.openedByEmail || 'Guest shopper' },
    { key: 'shop', label: 'Store', render: (value, record) => value?.name || record.tenant?.name || 'N/A' },
    { key: 'reason', label: 'Reason', render: (value) => value?.replace(/_/g, ' ') || 'issue' },
    { key: 'status', label: 'Status', render: (value) => <StatusChip status={value} /> },
    { key: 'openedAt', label: 'Opened', render: formatDate },
  ], []);

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <FilterSelect
          value={filters.status}
          onChange={(status) => onFiltersChange({ status })}
          options={disputeStatusOptions}
          label="All dispute statuses"
        />
      </div>
      <DashboardTable
        title="Marketplace disputes"
        data={rows}
        columns={columns}
        loading={loading}
        pageSize={pagination.pageSize}
        externalPagination={pagination}
        onPageChange={onPageChange}
        emptyDescription="No disputes match this view"
      />
    </div>
  );
}

function CustomersSection({ rows, pagination, loading, filters, onFiltersChange, onPageChange }) {
  const columns = useMemo(() => [
    { key: 'name', label: 'Customer', render: (value, record) => <div><div className="font-medium">{value}</div><div className="text-xs text-muted-foreground">{record.email}</div></div> },
    { key: 'phone', label: 'Phone', render: (value) => value || 'N/A' },
    { key: 'isActive', label: 'Status', render: (value) => <StatusChip status={value ? 'active' : 'inactive'} /> },
    { key: 'emailVerifiedAt', label: 'Email', render: (value) => <StatusChip status={value ? 'verified' : 'unverified'} /> },
    { key: 'lastLoginAt', label: 'Last login', render: formatDate },
    { key: 'createdAt', label: 'Joined', render: formatDate },
  ], []);

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <FilterSelect
          value={filters.status}
          onChange={(status) => onFiltersChange({ status })}
          options={['all', 'active', 'inactive']}
          label="All shopper statuses"
        />
      </div>
      <DashboardTable
        title="Storefront shoppers"
        data={rows}
        columns={columns}
        loading={loading}
        pageSize={pagination.pageSize}
        externalPagination={pagination}
        onPageChange={onPageChange}
        emptyDescription="No shoppers match this view"
      />
    </div>
  );
}

function SettingsSection({ data, loading }) {
  if (loading) {
    return <Skeleton className="h-[260px] w-full" />;
  }

  if (!data) {
    return <Empty description="Sabito settings are not available" />;
  }

  return (
    <Card className="border border-border">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Settings className="h-4 w-4" />
          Commission and release policy
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-border p-4">
          <div className="text-sm text-muted-foreground">Commission</div>
          <div className="mt-1 text-xl font-semibold">{data.commissionPercent}%</div>
        </div>
        <div className="rounded-lg border border-border p-4">
          <div className="text-sm text-muted-foreground">Fixed fee</div>
          <div className="mt-1 text-xl font-semibold">{formatMoney(data.fixedFeeAmount || 0, data.currency)}</div>
        </div>
        <div className="rounded-lg border border-border p-4">
          <div className="text-sm text-muted-foreground">Auto release</div>
          <div className="mt-1 text-xl font-semibold">{data.autoReleaseHours}h</div>
        </div>
        <div className="rounded-lg border border-border p-4">
          <div className="text-sm text-muted-foreground">Mode</div>
          <div className="mt-1 text-xl font-semibold">{data.editable ? 'Editable' : 'Read-only'}</div>
        </div>
      </CardContent>
    </Card>
  );
}

const initialPagination = {
  current: 1,
  pageSize: PAGINATION.DEFAULT_PAGE_SIZE,
  total: 0,
};

function SabitoAdmin({ section = 'overview' }) {
  const navigate = useNavigate();
  const activeSection = SECTION_CONFIG[section] ? section : 'overview';
  const config = SECTION_CONFIG[activeSection];
  const { searchValue, setPageSearchConfig } = useSmartSearch();
  const debouncedSearch = useDebounce(searchValue, DEBOUNCE_DELAYS.SEARCH);
  const { hasPermission, loading: permissionsLoading } = usePlatformAdminPermissions();
  const [loading, setLoading] = useState(false);
  const [overview, setOverview] = useState(null);
  const [rows, setRows] = useState([]);
  const [tradeAssurance, setTradeAssurance] = useState(null);
  const [settings, setSettings] = useState(null);
  const [pagination, setPagination] = useState(initialPagination);
  const [filters, setFilters] = useState({
    status: 'all',
    paymentStatus: 'all',
  });

  useEffect(() => {
    setPageSearchConfig({
      scope: `sabito-${activeSection}`,
      placeholder: config.searchPlaceholder,
    });
  }, [activeSection, config.searchPlaceholder, setPageSearchConfig]);

  useEffect(() => {
    if (section !== activeSection) {
      navigate('/admin/sabito/overview', { replace: true });
    }
  }, [activeSection, navigate, section]);

  const updateFilters = useCallback((nextFilters) => {
    setFilters((current) => ({ ...current, ...nextFilters }));
    setPagination((current) => ({ ...current, current: 1 }));
  }, []);

  const handlePageChange = useCallback((nextPagination) => {
    setPagination((current) => ({
      ...current,
      current: nextPagination.current || current.current,
      pageSize: nextPagination.pageSize || current.pageSize,
    }));
  }, []);

  const loadData = useCallback(async () => {
    if (!hasPermission(config.permission)) return;
    setLoading(true);
    try {
      if (activeSection === 'overview') {
        const response = await adminService.getSabitoOverview();
        if (response?.success) setOverview(response.data);
        return;
      }
      if (activeSection === 'settings') {
        const response = await adminService.getSabitoSettings();
        if (response?.success) setSettings(response.data);
        return;
      }

      const params = {
        page: pagination.current,
        limit: pagination.pageSize,
      };
      if (debouncedSearch) params.search = debouncedSearch;
      if (filters.status && filters.status !== 'all') params.status = filters.status;
      if (filters.paymentStatus && filters.paymentStatus !== 'all') params.paymentStatus = filters.paymentStatus;

      const serviceMap = {
        stores: adminService.getSabitoStores,
        orders: adminService.getSabitoOrders,
        'trade-assurance': adminService.getSabitoTradeAssurance,
        disputes: adminService.getSabitoDisputes,
        customers: adminService.getSabitoCustomers,
      };
      const response = await serviceMap[activeSection](params);
      if (response?.success) {
        if (activeSection === 'trade-assurance') {
          setTradeAssurance(response.data);
          setRows(response.data?.payments || []);
          setPagination((current) => ({
            ...current,
            total: response.data?.pagination?.total || 0,
          }));
        } else {
          setRows(response.data || []);
          setPagination((current) => ({
            ...current,
            total: response.pagination?.total || 0,
          }));
        }
      }
    } catch (error) {
      handleApiError(error, { context: `load ${config.title}` });
    } finally {
      setLoading(false);
    }
  }, [
    activeSection,
    config.permission,
    config.title,
    debouncedSearch,
    filters.paymentStatus,
    filters.status,
    hasPermission,
    pagination.current,
    pagination.pageSize,
  ]);

  useEffect(() => {
    if (!permissionsLoading) {
      loadData();
    }
  }, [loadData, permissionsLoading]);

  useEffect(() => {
    setPagination(initialPagination);
    setRows([]);
    setOverview(null);
    setTradeAssurance(null);
    setSettings(null);
    setFilters({ status: 'all', paymentStatus: 'all' });
  }, [activeSection]);

  if (!permissionsLoading && !hasPermission(config.permission)) {
    return <PermissionDenied />;
  }

  const tablePagination = {
    ...pagination,
    pageSize: pagination.pageSize || PAGINATION.DEFAULT_PAGE_SIZE,
  };

  return (
    <div>
      <SectionHeader section={activeSection} />
      <SabitoNav section={activeSection} />

      {activeSection === 'overview' && <OverviewSection data={overview} loading={loading || permissionsLoading} />}
      {activeSection === 'stores' && (
        <StoresSection rows={rows} pagination={tablePagination} loading={loading || permissionsLoading} filters={filters} onFiltersChange={updateFilters} onPageChange={handlePageChange} />
      )}
      {activeSection === 'orders' && (
        <OrdersSection rows={rows} pagination={tablePagination} loading={loading || permissionsLoading} filters={filters} onFiltersChange={updateFilters} onPageChange={handlePageChange} />
      )}
      {activeSection === 'trade-assurance' && (
        <TradeAssuranceSection data={tradeAssurance} pagination={tablePagination} loading={loading || permissionsLoading} filters={filters} onFiltersChange={updateFilters} onPageChange={handlePageChange} onRefresh={loadData} />
      )}
      {activeSection === 'disputes' && (
        <DisputesSection rows={rows} pagination={tablePagination} loading={loading || permissionsLoading} filters={filters} onFiltersChange={updateFilters} onPageChange={handlePageChange} />
      )}
      {activeSection === 'customers' && (
        <CustomersSection rows={rows} pagination={tablePagination} loading={loading || permissionsLoading} filters={filters} onFiltersChange={updateFilters} onPageChange={handlePageChange} />
      )}
      {activeSection === 'settings' && <SettingsSection data={settings} loading={loading || permissionsLoading} />}
    </div>
  );
}

export default SabitoAdmin;
