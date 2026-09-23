import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { CheckCircle2, Loader2, MessageCircle, Package, ShieldCheck } from 'lucide-react';

import { useStorefrontMode } from '../context/StorefrontModeContext';
import { useStorefrontAuth } from '../context/StorefrontAuthContext';
import { getGuestOrderToken } from '../utils/guestCheckout';
import { brandAccent } from '../online-store/brandAccent';
import { buildStoreHomePath } from '../online-store/storePaths';
import storeService from '../services/storeService';
import { showError } from '../utils/toast';
import { formatAmount } from '../utils/formatNumber';
import { buildStoreWhatsAppHref, whatsappOrderMessage } from '../utils/whatsapp';
import { Breadcrumbs, PageShell } from '../components/storefront/StorefrontLayout';
import { Button } from '@/components/ui/button';

const OrderSuccessPage = () => {
  const { id } = useParams();
  const location = useLocation();
  const { isSingleStoreMode, storeSlug: modeSlug, pathPrefix, isCustomDomain } = useStorefrontMode();
  const { isAuthenticated, isLoading: isAuthLoading } = useStorefrontAuth();
  const guestToken = useMemo(() => getGuestOrderToken(id), [id]);
  const isGuestOrder = Boolean(guestToken);
  const [order, setOrder] = useState(location.state?.order || null);
  const [isLoading, setIsLoading] = useState(!location.state?.order && Boolean(id));

  const orderStoreSlug = order?.storeSlug || order?.store?.slug || modeSlug;
  const continuePath = isSingleStoreMode
    ? (isCustomDomain
      ? '/'
      : (orderStoreSlug
        ? buildStoreHomePath(orderStoreSlug, {
          pathname: location.pathname,
          ...(pathPrefix ? { prefix: pathPrefix } : {}),
        })
        : '/'))
    : '/products';
  const continueLabel = isSingleStoreMode ? 'Back to shop' : 'Continue shopping';

  const whatsappHref = useMemo(() => {
    if (!isSingleStoreMode || !order) return '';
    const store = {
      displayName: order.storeName || order.store?.displayName,
      whatsappNumber: order.storeWhatsappNumber || order.store?.whatsappNumber,
      contactPhone: order.storeContactPhone || order.store?.contactPhone,
    };
    return buildStoreWhatsAppHref(
      store,
      whatsappOrderMessage(order.saleNumber, store.displayName),
    );
  }, [isSingleStoreMode, order]);

  useEffect(() => {
    if (order || !id || isAuthLoading) return undefined;
    if (!isGuestOrder && !isAuthenticated) {
      // A guest on another device: the order is still reachable through Track Order.
      setIsLoading(false);
      return undefined;
    }
    let mounted = true;
    const request = isGuestOrder
      ? storeService.getStorefrontGuestOrder(id, guestToken)
      : storeService.getStorefrontOrder(id);
    request
      .then((response) => {
        if (mounted) setOrder(response?.data?.order || response?.order || null);
      })
      .catch((error) => {
        if (mounted) showError(error, 'Could not load order confirmation.');
      })
      .finally(() => {
        if (mounted) setIsLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [guestToken, id, isAuthLoading, isAuthenticated, isGuestOrder, order]);

  return (
    <PageShell activePath="/checkout" appMode>
      <Breadcrumbs items={[{ label: 'Order placed' }]} />
      <section className="mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white p-6 text-center sm:rounded-[2rem] md:p-10">
        {isLoading ? (
          <div className="flex min-h-60 items-center justify-center text-sm font-semibold text-slate-500">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Loading order confirmation...
          </div>
        ) : (
          <>
            <span className={`mx-auto flex h-20 w-20 items-center justify-center rounded-full ${brandAccent.softIcon}`}>
              <CheckCircle2 className="h-11 w-11" />
            </span>
            <p className={`mt-6 ${brandAccent.eyebrow}`}>Order placed</p>
            <h1 className="mt-2 text-3xl font-black text-slate-950 md:text-4xl">
              {order?.saleNumber ? `Order ${order.saleNumber}` : 'Your order is confirmed'}
            </h1>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-500">
              {order?.paymentStatus === 'paid_held' || order?.tradeAssurance?.paymentStatus === 'paid_held'
                ? (isSingleStoreMode
                  ? 'The store has received your order. Payment is held until delivery is confirmed.'
                  : 'The seller has received your order. Sabito is holding the payment until delivery is confirmed.')
                : 'Your order details are shown below. Payment confirmation may still be processing.'}
            </p>

            {order ? (
              <div className="mt-6 grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left sm:grid-cols-3 sm:rounded-3xl">
                <TotalLine label="Subtotal" value={formatAmount(order.subtotal, order.currency)} />
                <TotalLine label="Delivery" value={formatAmount(order.deliveryFee, order.currency)} />
                <TotalLine label="Total" value={formatAmount(order.total, order.currency)} strong />
              </div>
            ) : null}

            <div
              className="mt-6 rounded-2xl border p-5 text-left text-slate-800 sm:rounded-3xl"
              style={brandAccent.softPanelStyle}
            >
              <span className={`inline-flex items-center gap-2 font-black ${brandAccent.textStrong}`}>
                <ShieldCheck className="h-5 w-5" />
                What happens next
              </span>
              <div className="mt-3 grid gap-2 text-sm leading-6">
                <p>The seller prepares your order and contacts you for delivery or pickup details.</p>
                {(order?.paymentStatus === 'paid_held' || order?.tradeAssurance?.paymentStatus === 'paid_held') ? (
                  <p>
                    {isSingleStoreMode
                      ? 'Payment stays held until you confirm the order was received.'
                      : 'Payment stays held by Sabito Trade Assurance until you confirm the order was received.'}
                  </p>
                ) : (
                  <p>If payment is still processing, refresh this page shortly or check your orders list.</p>
                )}
                {isGuestOrder ? (
                  <p>
                    Save your order number{order?.saleNumber ? ` (${order.saleNumber})` : ''}. You can track it any time
                    with the email or phone you used at checkout.
                  </p>
                ) : (
                  <p>You can track this order from your shopper account and confirm receipt after delivery.</p>
                )}
              </div>
            </div>

            {whatsappHref ? (
              <div className="mt-6">
                <Button asChild variant="outline" className={`w-full sm:w-auto ${brandAccent.outlineBtn}`}>
                  <a href={whatsappHref} target="_blank" rel="noreferrer">
                    <MessageCircle className="mr-2 h-4 w-4" />
                    Need help? Chat the store
                  </a>
                </Button>
              </div>
            ) : null}

            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Button variant="outline" className={brandAccent.outlineBtn} asChild>
                <Link to={continuePath}>{continueLabel}</Link>
              </Button>
              <Button className={brandAccent.primaryBtn} asChild>
                {isGuestOrder || !isAuthenticated ? (
                  <Link to="/track-order">
                    <Package className="mr-2 h-4 w-4" />
                    Track order
                  </Link>
                ) : (
                  <Link to={order?.id ? `/account/orders/${order.id}` : '/account/orders'}>
                    <Package className="mr-2 h-4 w-4" />
                    View order
                  </Link>
                )}
              </Button>
            </div>
          </>
        )}
      </section>
    </PageShell>
  );
};

const TotalLine = ({ label, value, strong = false }) => (
  <div>
    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
    <p className={`mt-1 ${strong ? 'text-2xl' : 'text-lg'} font-black text-slate-950`}>{value}</p>
  </div>
);

export default OrderSuccessPage;
