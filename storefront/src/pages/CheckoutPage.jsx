import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, Loader2, MapPin, MessageCircle, ShieldCheck, ShoppingBag, Truck } from 'lucide-react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';

import { useCart } from '../context/CartContext';
import { useStorefrontMode } from '../context/StorefrontModeContext';
import { buildStoreHomePath } from '../online-store/storePaths';
import storeService from '../services/storeService';
import { DEFAULT_DELIVERY_COUNTRY, GHANA_REGIONS } from '../constants';
import { showError } from '../utils/toast';
import { formatAmount } from '../utils/formatNumber';
import {
  buildStoreWhatsAppHref,
  resolveStoreWhatsAppPhone,
  whatsappCheckoutMessage,
} from '../utils/whatsapp';
import AccountLayout from '../components/storefront/AccountLayout';
import { EmptyState } from '../components/storefront/StorefrontLayout';
import { InlineErrorState, SkeletonBlock } from '../components/storefront/StateBlocks';
import {
  QUERY_STALE,
  refreshAfterAddressChange,
  SHOPPER_QUERY_KEYS,
} from '../utils/queryInvalidation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const unwrapData = (response) => response?.data?.data || response?.data || response;

const emptyAddress = {
  label: '',
  recipientName: '',
  phone: '',
  line1: '',
  line2: '',
  city: '',
  region: '',
  country: DEFAULT_DELIVERY_COUNTRY,
  deliveryNotes: '',
};

const comparableAddressFields = ['recipientName', 'phone', 'line1', 'line2', 'city', 'region', 'country'];
const EMPTY_REGION_VALUE = 'none';
const REQUIRED_DELIVERY_FIELDS = ['recipientName', 'phone', 'line1', 'city'];
const DELIVERY_FIELD_LABELS = {
  recipientName: 'Recipient name',
  phone: 'Phone',
  line1: 'Address line 1',
  city: 'City',
};

const normalizeAddressPart = (value) => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();

const isSameDeliveryAddress = (address, form) => comparableAddressFields.every(
  (field) => normalizeAddressPart(address?.[field]) === normalizeAddressPart(form?.[field]),
);

const buildDeliveryAddressPayload = (address = {}) => ({
  ...address,
  country: DEFAULT_DELIVERY_COUNTRY,
});

const getCachedAddresses = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.data?.addresses)) return payload.data.addresses;
  if (Array.isArray(payload?.addresses)) return payload.addresses;
  return [];
};

const patchCachedAddresses = (payload, nextAddresses) => {
  if (Array.isArray(payload)) return nextAddresses;
  if (Array.isArray(payload?.data)) {
    return { ...payload, data: nextAddresses };
  }
  if (payload?.data && typeof payload.data === 'object') {
    return { ...payload, data: { ...payload.data, addresses: nextAddresses } };
  }
  return { ...(payload || {}), addresses: nextAddresses };
};

const formatDeliveryAddress = (address = {}) => (
  [address.line1, address.line2, address.city, address.region].filter(Boolean).join(', ')
);

const CheckoutPage = () => {
  const queryClient = useQueryClient();
  const { cartSummary, items } = useCart();
  const { isSingleStoreMode, storeSlug: modeSlug, pathPrefix, isCustomDomain } = useStorefrontMode();
  const [selectedAddressId, setSelectedAddressId] = useState('new');
  const [addressForm, setAddressForm] = useState(emptyAddress);
  const [saveAddressForLater, setSaveAddressForLater] = useState(false);
  const [fulfillmentMethod, setFulfillmentMethod] = useState('pickup');
  const [notes, setNotes] = useState('');
  const [paymentPhase, setPaymentPhase] = useState('idle');
  const [addressErrors, setAddressErrors] = useState({});
  const defaultAddressAppliedRef = useRef(false);
  const addressFieldRefs = useRef({});
  const isPlacingOrder = paymentPhase !== 'idle';

  const store = cartSummary.store;
  const currency = cartSummary.currency;
  const shopSlug = store?.slug || modeSlug;
  const shopHomePath = isSingleStoreMode
    ? (isCustomDomain
      ? '/'
      : (shopSlug
        ? buildStoreHomePath(shopSlug, {
          pathname: typeof window !== 'undefined' ? window.location.pathname : '',
          ...(pathPrefix ? { prefix: pathPrefix } : {}),
        })
        : '/'))
    : '/products';
  const emptyCartActionLabel = isSingleStoreMode ? 'Back to shop' : 'Browse products';
  const deliveryAvailable = store?.deliveryEnabled === true;
  const pickupAvailable = store?.pickupEnabled !== false;

  const needsPublicStoreFetch = isSingleStoreMode && Boolean(shopSlug) && items.length > 0;

  const publicStoreQuery = useQuery({
    queryKey: ['public-store', shopSlug],
    queryFn: () => storeService.getPublicStore(shopSlug),
    enabled: needsPublicStoreFetch,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const publicStore = useMemo(() => {
    const payload = unwrapData(publicStoreQuery.data);
    return payload?.store || payload || null;
  }, [publicStoreQuery.data]);

  // Brand chrome comes from OnlineStorePageShell (session-seeded); do not nest a
  // second TemplateThemeProvider that would flash classic green before fetch.

  const whatsappHref = useMemo(() => {
    if (!isSingleStoreMode || items.length === 0) return '';
    const contactStore = {
      displayName: store?.displayName || publicStore?.displayName,
      whatsappNumber: store?.whatsappNumber || publicStore?.whatsappNumber,
      contactPhone: store?.contactPhone || publicStore?.contactPhone,
    };
    if (!resolveStoreWhatsAppPhone(contactStore)) return '';
    return buildStoreWhatsAppHref(contactStore, whatsappCheckoutMessage(contactStore.displayName));
  }, [isSingleStoreMode, items.length, publicStore, store]);

  const addressesQuery = useQuery({
    queryKey: SHOPPER_QUERY_KEYS.addresses,
    queryFn: storeService.getDeliveryAddresses,
    staleTime: QUERY_STALE.LIST,
    refetchOnWindowFocus: false,
  });

  const addresses = addressesQuery.data?.data?.addresses || addressesQuery.data?.addresses || [];

  useEffect(() => {
    if (!store) return;
    if (deliveryAvailable) {
      setFulfillmentMethod('delivery');
    } else if (pickupAvailable) {
      setFulfillmentMethod('pickup');
    }
  }, [deliveryAvailable, pickupAvailable, store]);

  useEffect(() => {
    if (addressesQuery.error) showError(addressesQuery.error, 'Could not load saved delivery addresses.');
  }, [addressesQuery.error]);

  useEffect(() => {
    if (!addresses.length || defaultAddressAppliedRef.current) return;
    const defaultAddress = addresses.find((address) => address.isDefault) || addresses[0];
    if (defaultAddress?.id) {
      defaultAddressAppliedRef.current = true;
      setSelectedAddressId(defaultAddress.id);
    }
  }, [addresses]);

  const selectedAddress = useMemo(
    () => addresses.find((address) => address.id === selectedAddressId) || null,
    [addresses, selectedAddressId],
  );

  const deliveryAddress = selectedAddressId === 'new' ? addressForm : selectedAddress;
  const shouldSaveInlineAddress = fulfillmentMethod === 'delivery' && selectedAddressId === 'new' && saveAddressForLater;

  const checkoutPayload = useMemo(() => {
    if (!store) return null;
    const payload = {
      storeSlug: store.slug,
      commerceChannel: isSingleStoreMode ? 'online_store' : 'sabito_marketplace',
      items: items.map((item) => ({
        listingId: item.listingId,
        quantity: item.quantity,
      })),
      fulfillmentMethod,
      notes,
    };
    if (fulfillmentMethod === 'delivery') {
      payload.deliveryAddress = buildDeliveryAddressPayload(deliveryAddress);
    }
    return payload;
  }, [deliveryAddress, fulfillmentMethod, isSingleStoreMode, items, notes, store]);

  // Totals don't depend on the address, so keep it out of the preview; otherwise every
  // keystroke refetches and a half-filled address fails validation and blocks Pay Now.
  const previewPayload = useMemo(() => {
    if (!checkoutPayload) return null;
    const { deliveryAddress: _deliveryAddress, notes: _notes, ...rest } = checkoutPayload;
    return rest;
  }, [checkoutPayload]);

  const previewQuery = useQuery({
    queryKey: ['checkout', 'preview', previewPayload],
    queryFn: () => storeService.previewStorefrontCheckout(previewPayload),
    enabled: Boolean(previewPayload && items.length > 0),
    staleTime: QUERY_STALE.CHECKOUT,
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData,
  });

  const checkoutPreview = previewQuery.data?.data || previewQuery.data || null;
  const checkoutPreviewError = previewQuery.error?.message || '';
  const isLoadingPreview = previewQuery.isFetching;
  const isPreviewPending = previewQuery.isPending || previewQuery.isPlaceholderData;
  const isLoadingAddresses = addressesQuery.isLoading;
  const deliveryFee = checkoutPreview
    ? Number(checkoutPreview.deliveryFee || 0)
    : fulfillmentMethod === 'delivery' ? Number(store?.deliveryFee || 0) : 0;
  const subtotal = checkoutPreview ? Number(checkoutPreview.subtotal || 0) : cartSummary.subtotal;
  const total = checkoutPreview ? Number(checkoutPreview.total || 0) : Number((cartSummary.subtotal + deliveryFee).toFixed(2));
  const submitBlockedReason = addressesQuery.isError && fulfillmentMethod === 'delivery'
    ? 'Retry saved addresses before paying for delivery.'
    : checkoutPreviewError
      ? 'Fix the checkout issue shown above before paying.'
      : isPreviewPending
        ? 'Wait for checkout totals to finish calculating.'
        : '';

  const validateDeliveryAddress = useCallback(() => {
    if (fulfillmentMethod !== 'delivery' || selectedAddressId !== 'new') {
      setAddressErrors({});
      return true;
    }

    const nextErrors = {};
    REQUIRED_DELIVERY_FIELDS.forEach((field) => {
      if (!String(addressForm[field] || '').trim()) {
        nextErrors[field] = `${DELIVERY_FIELD_LABELS[field]} is required for delivery.`;
      }
    });

    setAddressErrors(nextErrors);
    const firstField = REQUIRED_DELIVERY_FIELDS.find((field) => nextErrors[field]);
    if (firstField) {
      addressFieldRefs.current[firstField]?.focus();
      return false;
    }
    return true;
  }, [addressForm, fulfillmentMethod, selectedAddressId]);

  const placeOrder = useCallback(async (event) => {
    event.preventDefault();
    if (!checkoutPayload || !store || items.length === 0) return;
    if (!validateDeliveryAddress()) return;
    if (checkoutPreviewError) {
      showError(new Error(checkoutPreviewError), 'Fix the checkout issue before paying.');
      return;
    }

    setPaymentPhase('initializing');
    try {
      if (shouldSaveInlineAddress) {
        try {
          const inlineAddressPayload = buildDeliveryAddressPayload(addressForm);
          const existingAddress = addresses.find((address) => isSameDeliveryAddress(address, inlineAddressPayload));
          if (!existingAddress) {
            await queryClient.cancelQueries({ queryKey: SHOPPER_QUERY_KEYS.addresses });
            const previousAddresses = queryClient.getQueryData(SHOPPER_QUERY_KEYS.addresses);
            const optimisticAddress = {
              ...inlineAddressPayload,
              id: `optimistic-${Date.now()}`,
              isDefault: addresses.length === 0,
            };
            queryClient.setQueryData(
              SHOPPER_QUERY_KEYS.addresses,
              (current) => patchCachedAddresses(
                current || previousAddresses,
                [...getCachedAddresses(current || previousAddresses), optimisticAddress],
              ),
            );

            const saveResponse = await storeService.createDeliveryAddress(inlineAddressPayload);
            const savedAddress = saveResponse?.data?.address || saveResponse?.address;
            if (savedAddress?.id) {
              queryClient.setQueryData(
                SHOPPER_QUERY_KEYS.addresses,
                (current) => patchCachedAddresses(
                  current,
                  getCachedAddresses(current).map((address) => (
                    address.id === optimisticAddress.id ? savedAddress : address
                  )),
                ),
              );
              setSelectedAddressId(savedAddress.id);
            }
            await refreshAfterAddressChange(queryClient);
          }
        } catch (saveError) {
          queryClient.setQueryData(SHOPPER_QUERY_KEYS.addresses, addressesQuery.data);
          showError(saveError, 'Checkout will continue, but this address could not be saved.');
        }
      }

      const response = await storeService.initializeStorefrontOrderPaystack(checkoutPayload);
      const authorizationUrl = response?.data?.authorization_url || response?.authorization_url;
      if (!authorizationUrl) {
        throw new Error('Paystack checkout could not be started.');
      }

      setPaymentPhase('redirecting');
      window.location.assign(authorizationUrl);
    } catch (error) {
      setPaymentPhase('idle');
      showError(error, 'Could not start Paystack checkout.');
    }
  }, [
    addressForm,
    addresses,
    checkoutPayload,
    checkoutPreviewError,
    items,
    queryClient,
    shouldSaveInlineAddress,
    store,
    validateDeliveryAddress,
  ]);

  if (items.length === 0) {
    return (
      <AccountLayout
        activePath="/checkout"
        title="Checkout"
        description={isSingleStoreMode
          ? 'Complete your details and place your order.'
          : 'Complete your buyer details and place orders with Sabito Trade Assurance.'}
        breadcrumbItems={[{ label: 'Checkout' }]}
      >
        <EmptyState
          icon={ShoppingBag}
          title="Your cart is empty"
          description="Add products to your cart before checkout."
          action={(
            <Button asChild className="rounded-full bg-[var(--store-accent,#166534)] text-white hover:bg-[color-mix(in_srgb,var(--store-accent,#166534)_85%,black)]">
              <Link to={shopHomePath}>{emptyCartActionLabel}</Link>
            </Button>
          )}
        />
      </AccountLayout>
    );
  }

  return (
    <AccountLayout
      activePath="/checkout"
      title="Checkout"
      description={isSingleStoreMode
        ? 'Choose delivery, confirm your address, and place your order.'
        : 'Choose delivery, confirm your saved address, and place your Sabito Store order.'}
      breadcrumbItems={[{ label: 'Cart', to: '/cart' }, { label: 'Checkout' }]}
    >
      <form onSubmit={placeOrder} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]" noValidate>
        <section className="grid gap-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:rounded-[2rem] sm:p-5 md:p-6">
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-[color:var(--store-accent,#166534)]">Checkout</p>
            <h1 className="mt-2 text-3xl font-black text-slate-950">Complete your order</h1>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              {isSingleStoreMode
                ? `You are ordering from ${store?.displayName}.`
                : `You are ordering from ${store?.displayName}. Sabito holds payment until delivery is confirmed.`}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:rounded-[2rem] sm:p-5 md:p-6">
            <h2 className="inline-flex items-center gap-2 text-xl font-black text-slate-950">
              <Truck className="h-5 w-5 text-[color:var(--store-accent,#166534)]" />
              Delivery method
            </h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {deliveryAvailable ? (
                <MethodCard
                  checked={fulfillmentMethod === 'delivery'}
                  label="Delivery"
                  description={`Seller delivery ${deliveryFee > 0 ? `for ${formatAmount(store.deliveryFee, currency)}` : 'with no listed fee'}.`}
                  onChange={() => setFulfillmentMethod('delivery')}
                />
              ) : null}
              {pickupAvailable ? (
                <MethodCard
                  checked={fulfillmentMethod === 'pickup'}
                  label="Pickup"
                  description="Collect from the seller after they confirm pickup details."
                  onChange={() => setFulfillmentMethod('pickup')}
                />
              ) : null}
            </div>
          </div>

          {fulfillmentMethod === 'delivery' ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:rounded-[2rem] sm:p-5 md:p-6">
              <h2 className="inline-flex items-center gap-2 text-xl font-black text-slate-950">
                <MapPin className="h-5 w-5 text-[color:var(--store-accent,#166534)]" />
                Delivery address
              </h2>
              {isLoadingAddresses ? (
                <div className="mt-5 grid gap-3" role="status" aria-label="Loading saved delivery addresses">
                  <SkeletonBlock className="h-24 rounded-2xl" />
                  <SkeletonBlock className="h-24 rounded-2xl" />
                </div>
              ) : addressesQuery.isError ? (
                <InlineErrorState
                  title="Saved addresses did not load"
                  message="Retry saved addresses before choosing delivery for this checkout."
                  onRetry={addressesQuery.refetch}
                />
              ) : (
                <div className="mt-5 grid gap-4">
                  {addresses.length ? (
                    <div className="grid gap-3">
                      {addresses.map((address) => (
                        <label
                          key={address.id}
                          className="flex cursor-pointer gap-3 rounded-2xl border border-slate-200 p-4 hover:border-[color:color-mix(in_srgb,var(--store-accent,#166534)_40%,#e2e8f0)] sm:rounded-3xl"
                        >
                          <input
                            type="radio"
                            name="deliveryAddress"
                            checked={selectedAddressId === address.id}
                            onChange={() => setSelectedAddressId(address.id)}
                            className="mt-1 h-4 w-4 accent-[var(--store-accent,#166534)]"
                          />
                          <span>
                            <span className="font-black text-slate-950">{address.label || 'Delivery address'}</span>
                            <span className="mt-1 block text-sm font-semibold text-slate-700">{address.recipientName} - {address.phone}</span>
                            <span className="mt-1 block text-sm leading-6 text-slate-500">
                              {formatDeliveryAddress(address)}
                            </span>
                          </span>
                        </label>
                      ))}
                      <label className="flex cursor-pointer gap-3 rounded-2xl border border-slate-200 p-4 hover:border-[color:color-mix(in_srgb,var(--store-accent,#166534)_40%,#e2e8f0)] sm:rounded-3xl">
                        <input
                          type="radio"
                          name="deliveryAddress"
                          checked={selectedAddressId === 'new'}
                          onChange={() => setSelectedAddressId('new')}
                          className="mt-1 h-4 w-4 accent-[var(--store-accent,#166534)]"
                        />
                        <span className="font-black text-slate-950">Use a different address</span>
                      </label>
                    </div>
                  ) : null}
                  {selectedAddressId === 'new' ? (
                    <AddressForm
                      value={addressForm}
                      onChange={(updater) => {
                        setAddressForm(updater);
                      }}
                      errors={addressErrors}
                      onClearError={(field) => setAddressErrors((current) => ({ ...current, [field]: undefined }))}
                      fieldRefs={addressFieldRefs}
                      saveAddressForLater={saveAddressForLater}
                      onSaveAddressForLaterChange={setSaveAddressForLater}
                    />
                  ) : null}
                </div>
              )}
            </div>
          ) : null}

          <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:rounded-[2rem] sm:p-5 md:p-6">
            <label className="text-sm font-semibold text-slate-700" htmlFor="checkout-notes">Order notes (optional)</label>
            <textarea
              id="checkout-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Delivery instructions, preferred time, or seller notes"
              className="mt-2 min-h-28 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-[color:var(--store-accent,#166534)]"
            />
          </div>
        </section>

        <aside className="h-fit rounded-2xl border border-slate-200 bg-white p-4 sm:rounded-[2rem] sm:p-5 md:p-6">
          <h2 className="text-xl font-black text-slate-950">Order summary</h2>
          <div className="mt-4 grid gap-3">
            {(checkoutPreview?.items || items).map((item) => (
              <div key={item.listingId} className="flex items-start justify-between gap-3 rounded-2xl border border-slate-200 p-3 text-sm">
                <div className="min-w-0">
                  <p className="break-words font-bold text-slate-950">{item.title}</p>
                  <p className="mt-1 text-slate-500">Qty {item.quantity}</p>
                </div>
                <p className="shrink-0 font-black text-[color:var(--store-accent,#166534)]">{formatAmount(item.subtotal ?? item.unitPrice * item.quantity, checkoutPreview?.currency || currency)}</p>
              </div>
            ))}
          </div>
          <div className="mt-5 grid gap-3 border-t border-slate-200 pt-4 text-sm">
            <SummaryLine label="Subtotal" value={formatAmount(subtotal, checkoutPreview?.currency || currency)} />
            <SummaryLine
              label="Delivery"
              value={checkoutPreview?.deliveryFeeWaived ? 'Free' : formatAmount(deliveryFee, checkoutPreview?.currency || currency)}
            />
            <SummaryLine label="Total" value={formatAmount(total, checkoutPreview?.currency || currency)} strong />
          </div>
          {checkoutPreview?.freeDeliveryThreshold ? (
            <p
              className="mt-3 rounded-2xl border px-4 py-3 text-sm font-semibold text-[color:var(--store-accent,#166534)]"
              style={{
                borderColor: 'color-mix(in srgb, var(--store-accent, #166534) 22%, #e5e7eb)',
                backgroundColor: 'var(--store-accent-soft, #f0fdf4)',
              }}
            >
              Free delivery on orders over {formatAmount(checkoutPreview.freeDeliveryThreshold, checkoutPreview?.currency || currency)}.
            </p>
          ) : null}
          {checkoutPreviewError ? (
            <div
              role="alert"
              id="checkout-preview-error"
              className="mt-3 flex gap-2 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{checkoutPreviewError}</span>
            </div>
          ) : null}
          {isLoadingPreview && !checkoutPreview ? (
            <div className="mt-3 grid gap-2" role="status" aria-label="Calculating checkout total">
              <SkeletonBlock className="h-4 w-2/3" />
              <SkeletonBlock className="h-4 w-1/2" />
              <SkeletonBlock className="h-5 w-3/4" />
            </div>
          ) : null}
          <div
            className="mt-5 rounded-2xl border p-4 text-sm leading-6 text-slate-800 sm:rounded-3xl"
            style={{
              borderColor: 'color-mix(in srgb, var(--store-accent, #166534) 22%, #e5e7eb)',
              backgroundColor: 'var(--store-accent-soft, #f0fdf4)',
            }}
          >
            <span className="inline-flex items-center gap-2 font-black text-[color:var(--store-accent,#166534)]">
              <ShieldCheck className="h-4 w-4" />
              {isSingleStoreMode ? 'Secure payment' : 'Trade Assurance'}
            </span>
            <p className="mt-2">
              {isSingleStoreMode
                ? 'You will be redirected to Paystack to pay securely. Your order is placed after payment is confirmed.'
                : 'Payment is held by Sabito until you confirm delivery. Seller payout is released after confirmation.'}
            </p>
          </div>
          {whatsappHref ? (
            <Button
              asChild
              variant="outline"
              className="mt-5 w-full rounded-full border-[color:color-mix(in_srgb,var(--store-accent,#166534)_28%,white)] text-[color:var(--store-accent,#166534)] hover:bg-[var(--store-accent-soft,#16653422)]"
            >
              <a href={whatsappHref} target="_blank" rel="noreferrer">
                <MessageCircle className="mr-2 h-4 w-4" />
                Ask on WhatsApp
              </a>
            </Button>
          ) : null}
          <Button
            type="submit"
            className={`${whatsappHref ? 'mt-3' : 'mt-5'} w-full rounded-full bg-[var(--store-accent,#166534)] text-white hover:bg-[color-mix(in_srgb,var(--store-accent,#166534)_85%,black)]`}
            disabled={isPlacingOrder || isLoadingAddresses || isPreviewPending || Boolean(checkoutPreviewError) || (addressesQuery.isError && fulfillmentMethod === 'delivery')}
            aria-describedby={checkoutPreviewError ? 'checkout-preview-error' : submitBlockedReason ? 'checkout-submit-helper' : undefined}
          >
            {isPlacingOrder || isLoadingPreview ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {paymentPhase === 'redirecting' ? 'Redirecting...' : paymentPhase === 'initializing' ? 'Starting payment...' : 'Pay Now'}
          </Button>
          {submitBlockedReason ? (
            <p id="checkout-submit-helper" className="mt-2 text-center text-xs font-semibold leading-5 text-slate-500">
              {submitBlockedReason}
            </p>
          ) : null}
          <p className="mt-3 text-center text-xs leading-5 text-slate-500">
            You will be redirected to Paystack to pay securely. Your order is placed only after payment is confirmed.
          </p>
        </aside>
      </form>
    </AccountLayout>
  );
};


const MethodCard = ({ checked, label, description, onChange }) => (
  <label
    className={`flex min-h-24 cursor-pointer gap-3 rounded-2xl border p-4 sm:rounded-3xl ${
      checked
        ? 'border-[color:color-mix(in_srgb,var(--store-accent,#166534)_40%,#e2e8f0)] bg-[var(--store-accent-soft,#f0fdf4)]'
        : 'border-slate-200 bg-white'
    }`}
  >
    <input type="radio" checked={checked} onChange={onChange} className="mt-1 h-4 w-4 accent-[var(--store-accent,#166534)]" />
    <span>
      <span className="font-black text-slate-950">{label}</span>
      <span className="mt-1 block text-sm leading-6 text-slate-500">{description}</span>
    </span>
  </label>
);

const AddressForm = ({
  value,
  onChange,
  errors = {},
  onClearError,
  fieldRefs,
  saveAddressForLater,
  onSaveAddressForLaterChange,
}) => (
  <div className="grid gap-3">
    <div className="grid gap-3 sm:grid-cols-2">
      <Field name="recipientName" label="Recipient name" value={value.recipientName} onChange={(recipientName) => onChange((current) => ({ ...current, recipientName }))} error={errors.recipientName} onClearError={onClearError} fieldRefs={fieldRefs} required />
      <Field name="phone" label="Phone" value={value.phone} onChange={(phone) => onChange((current) => ({ ...current, phone }))} error={errors.phone} onClearError={onClearError} fieldRefs={fieldRefs} required />
    </div>
    <Field name="line1" label="Address line 1" value={value.line1} onChange={(line1) => onChange((current) => ({ ...current, line1 }))} error={errors.line1} onClearError={onClearError} fieldRefs={fieldRefs} required />
    <Field label="Address line 2 (optional)" value={value.line2} onChange={(line2) => onChange((current) => ({ ...current, line2 }))} />
    <div className="grid gap-3 sm:grid-cols-2">
      <Field name="city" label="City" value={value.city} onChange={(city) => onChange((current) => ({ ...current, city }))} error={errors.city} onClearError={onClearError} fieldRefs={fieldRefs} required />
      <RegionSelect value={value.region} onChange={(region) => onChange((current) => ({ ...current, region }))} />
    </div>
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:rounded-3xl">
      <label className="flex items-start gap-3 text-sm font-semibold text-slate-700">
        <input
          type="checkbox"
          checked={saveAddressForLater}
          onChange={(event) => onSaveAddressForLaterChange(event.target.checked)}
          className="mt-1 h-4 w-4 rounded border-slate-300 accent-[var(--store-accent,#166534)]"
        />
        <span>
          <span className="block text-slate-950">Save this address for later</span>
          <span className="mt-1 block font-normal leading-5 text-slate-500">Reuse it next time you check out with seller delivery.</span>
        </span>
      </label>
    </div>
  </div>
);

const Field = ({ name, label, value, onChange, required = false, error, onClearError, fieldRefs }) => {
  const id = label.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const errorId = `${id}-error`;
  return (
    <div className="grid gap-2">
      <label className="text-sm font-semibold text-slate-700" htmlFor={id}>{label}</label>
      <Input
        ref={(node) => {
          if (name && fieldRefs) fieldRefs.current[name] = node;
        }}
        id={id}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          if (name && error) onClearError?.(name);
        }}
        required={required}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        className={error ? 'border-red-300 focus-visible:ring-red-200' : undefined}
      />
      {error ? <p id={errorId} className="text-sm font-semibold text-red-700">{error}</p> : null}
    </div>
  );
};

const RegionSelect = ({ value, onChange }) => (
  <div className="grid gap-2">
    <label className="text-sm font-semibold text-slate-700" htmlFor="region-optional">Region (optional)</label>
    <Select value={value || EMPTY_REGION_VALUE} onValueChange={(nextValue) => onChange(nextValue === EMPTY_REGION_VALUE ? '' : nextValue)}>
      <SelectTrigger id="region-optional" className="min-h-10 rounded-2xl border-slate-200 bg-white focus:ring-[var(--store-accent,#166534)]">
        <SelectValue placeholder="Select region" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={EMPTY_REGION_VALUE}>No region selected</SelectItem>
        {GHANA_REGIONS.map((region) => (
          <SelectItem key={region} value={region}>{region}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  </div>
);

const SummaryLine = ({ label, value, strong = false }) => (
  <div className="flex items-center justify-between gap-3">
    <span className="text-slate-500">{label}</span>
    <span className={`${strong ? 'text-xl' : ''} font-black text-slate-950`}>{value}</span>
  </div>
);

export default CheckoutPage;

