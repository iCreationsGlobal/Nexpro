type NotificationPayload = Record<string, unknown>;

export type NotificationDeepLinkRoute =
  | '/(tabs)/store?section=orders'
  | '/(tabs)/orders'
  | `/(tabs)/${string}`
  | `/customer/${string}`
  | `/expense/${string}`
  | `/invoice/${string}`
  | `/job/${string}`
  | `/lead/${string}`
  | `/product/${string}`
  | `/quote/${string}`
  | `/rental/${string}`
  | `/sale/${string}`
  | `/store-order/${string}`
  | `/task/${string}`;

const DETAIL_KEYS = [
  ['rentalId', '/rental'],
  ['productId', '/product'],
  ['saleId', '/sale'],
  ['invoiceId', '/invoice'],
  ['jobId', '/job'],
  ['quoteId', '/quote'],
  ['customerId', '/customer'],
  ['expenseId', '/expense'],
  ['leadId', '/lead'],
  ['taskId', '/task'],
] as const;

const WEB_LINK_SEGMENTS: Record<string, string> = {
  rentals: '/rental',
  rental: '/rental',
  customers: '/customer',
  customer: '/customer',
  expenses: '/expense',
  expense: '/expense',
  invoices: '/invoice',
  invoice: '/invoice',
  jobs: '/job',
  job: '/job',
  leads: '/lead',
  lead: '/lead',
  products: '/product',
  product: '/product',
  quotes: '/quote',
  quote: '/quote',
  sales: '/sale',
  sale: '/sale',
  tasks: '/task',
  task: '/task',
};

const asRecord = (value: unknown): NotificationPayload | null => (
  value && typeof value === 'object' && !Array.isArray(value) ? (value as NotificationPayload) : null
);

const getRouteId = (value: unknown) => {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
};

const getId = (payload: NotificationPayload, metadata: NotificationPayload | null, key: string) => (
  getRouteId(payload[key]) || getRouteId(metadata?.[key])
);

const buildDetailRoute = (prefix: string, id: string) => `${prefix}/${encodeURIComponent(id)}` as NotificationDeepLinkRoute;

function routeFromLink(link: string): NotificationDeepLinkRoute | null {
  if (!link) return null;

  const path = link.split(/[?#]/)[0].replace(/^https?:\/\/[^/]+/i, '').replace(/\/+$/, '');
  const segments = path.split('/').filter(Boolean);

  if (segments[0] === 'store' && segments[1] === 'orders') {
    if (!segments[2]) return '/(tabs)/store?section=orders';
    try {
      return buildDetailRoute('/store-order', decodeURIComponent(segments[2]));
    } catch {
      return null;
    }
  }

  const firstSegment = segments[0];
  const secondSegment = segments[1];
  if (firstSegment && secondSegment && WEB_LINK_SEGMENTS[firstSegment]) {
    try {
      return buildDetailRoute(WEB_LINK_SEGMENTS[firstSegment], decodeURIComponent(secondSegment));
    } catch {
      return null;
    }
  }

  if (path === '/orders') return '/(tabs)/orders';
  if (segments.length === 1 && WEB_LINK_SEGMENTS[firstSegment]) {
    const tab = firstSegment.endsWith('s') ? firstSegment : `${firstSegment}s`;
    return `/(tabs)/${tab}`;
  }

  return null;
}

export function resolveNotificationDeepLink(data: unknown): NotificationDeepLinkRoute | null {
  const payload = asRecord(data);
  if (!payload) return null;

  const metadata = asRecord(payload.metadata);
  const type = typeof payload.type === 'string' ? payload.type : '';
  const link = typeof payload.link === 'string' ? payload.link : '';
  const source = typeof metadata?.source === 'string' ? metadata.source : '';
  const isOnlineStore = source === 'online_store' || link.includes('/store/orders');
  const orderId = getId(payload, metadata, 'orderId');
  const saleId = getId(payload, metadata, 'saleId');
  const linkRoute = routeFromLink(link);

  if (isOnlineStore) {
    return saleId || orderId ? buildDetailRoute('/store-order', saleId || orderId) : linkRoute || '/(tabs)/store?section=orders';
  }

  if (type === 'order' && (saleId || orderId)) {
    return buildDetailRoute('/sale', saleId || orderId);
  }

  for (const [idKey, routePrefix] of DETAIL_KEYS) {
    const id = getId(payload, metadata, idKey);
    if (id) return buildDetailRoute(routePrefix, id);
  }

  if (linkRoute) return linkRoute;

  if (type === 'inventory' && (source === 'stock_alert' || link.includes('/products'))) {
    return '/(tabs)/products';
  }

  return null;
}
