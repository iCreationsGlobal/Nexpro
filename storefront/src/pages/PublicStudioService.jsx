import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Loader2 } from 'lucide-react';

import storeService from '../services/storeService';
import { dashboardLink } from '../config';
import { useStorefrontAuth } from '../context/StorefrontAuthContext';
import { useStorefrontMode } from '../context/StorefrontModeContext';
import OnlineStorePageShell from '../online-store/OnlineStorePageShell';
import { resolveSingleStoreHomePath } from '../online-store/storePaths';
import {
  Breadcrumbs,
  BuyerLayoutFrame,
  StoreScopedFooter,
  StorefrontFooter,
  StorefrontHeader,
  unwrapData,
} from '../components/storefront/StorefrontLayout';
import {
  ReviewList,
  ReviewSummaryLine,
  VerifiedReviewForm,
} from '../components/storefront/VerifiedReviewSection';
import { resolveImageUrl } from '../utils/fileUtils';
import { formatAmount } from '../utils/formatNumber';
import { showError, showSuccess } from '../utils/toast';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const emptyRequestForm = {
  name: '',
  email: '',
  phone: '',
  preferredDate: '',
  preferredTime: '',
  message: '',
};

const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const validateRequestForm = (values) => {
  const errors = {};
  const name = values.name?.trim() || '';
  const email = values.email?.trim() || '';
  const phone = values.phone?.trim() || '';
  const message = values.message?.trim() || '';

  if (!name) errors.name = 'Your name is required';
  if (email && !isValidEmail(email)) errors.email = 'Enter a valid email';
  if (!email && !phone) errors.email = 'Email or phone is required';
  if (message.length < 10) errors.message = 'Tell the studio what you need in at least 10 characters';

  return errors;
};

const formatServicePrice = (service, currency) => {
  if (service?.priceType === 'quote_only') return 'Quote on request';
  const price = Number.parseFloat(service?.startingPrice || 0);
  if (!price) return 'Price on request';
  return service?.priceType === 'fixed' ? formatAmount(price, currency) : `From ${formatAmount(price, currency)}`;
};

const normalizePhone = (value) => String(value || '').replace(/[^\d]/g, '');

const buildContactHref = (studio, service) => {
  const phone = normalizePhone(studio?.whatsappNumber || studio?.contactPhone);
  const message = `Hi, I am interested in ${service?.title || 'a service'} from ${studio?.displayName || 'your store'}.`;
  if (phone) return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
  if (studio?.contactEmail) return `mailto:${studio.contactEmail}`;
  return '';
};

const PublicStudioService = () => {
  const { studioSlug: studioSlugParam, storeSlug, serviceSlug } = useParams();
  const { storeSlug: modeSlug, pathPrefix, isCustomDomain, isSingleStoreMode } = useStorefrontMode();
  const studioSlug = studioSlugParam || storeSlug || modeSlug;
  const studioHomePath = isSingleStoreMode
    ? resolveSingleStoreHomePath({ storeSlug: studioSlug, pathPrefix, isCustomDomain })
    : (storeSlug
      ? `/stores/${encodeURIComponent(storeSlug)}`
      : `/studios/${encodeURIComponent(studioSlug || '')}`);
  const showOwnedChrome = Boolean(isCustomDomain || isSingleStoreMode || storeSlug);
  const backLabel = isSingleStoreMode ? 'Back to shop' : 'Back to studio';
  const [searchParams, setSearchParams] = useSearchParams();
  const { customer, isAuthenticated, isLoading: authLoading, openShopperAuthModal } = useStorefrontAuth();
  const [requestForm, setRequestForm] = useState(emptyRequestForm);
  const [formErrors, setFormErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [paymentVerifying, setPaymentVerifying] = useState(false);
  const [paidBooking, setPaidBooking] = useState(null);

  const serviceQuery = useQuery({
    queryKey: ['public-studio-service', studioSlug, serviceSlug],
    queryFn: () => storeService.getPublicStudioService(studioSlug, serviceSlug),
    enabled: Boolean(studioSlug && serviceSlug),
    retry: false,
  });

  const payload = useMemo(() => unwrapData(serviceQuery.data) || {}, [serviceQuery.data]);
  const serviceId = payload?.service?.id;

  const reviewsQuery = useQuery({
    queryKey: ['service-reviews', serviceId],
    queryFn: () => storeService.getServiceReviews(serviceId || ''),
    enabled: Boolean(serviceId),
    retry: false,
  });

  const eligibilityQuery = useQuery({
    queryKey: ['service-review-eligibility', serviceId, customer?.id],
    queryFn: () => storeService.getServiceReviewEligibility(serviceId || ''),
    enabled: Boolean(isAuthenticated && serviceId),
    retry: false,
  });
  const studio = payload.studio;
  const service = payload.service;
  const reviews = unwrapData(reviewsQuery.data)?.reviews || service?.reviewSummary?.reviews || [];
  const canCheckout = service
    && service.priceType !== 'quote_only'
    && Number.parseFloat(service.startingPrice || 0) > 0
    && ['book_service', 'fixed_price'].includes(service.ctaType);

  useEffect(() => {
    if (!customer) return;
    setRequestForm((current) => ({
      ...current,
      name: current.name || customer.name || '',
      email: current.email || customer.email || '',
      phone: current.phone || customer.phone || '',
    }));
  }, [customer]);

  const updateRequestField = useCallback((field, value) => {
    setRequestForm((current) => ({ ...current, [field]: value }));
    setFormErrors((current) => (current[field] ? { ...current, [field]: undefined } : current));
  }, []);

  const handleRequireBookingAuth = useCallback(() => {
    openShopperAuthModal({
      mode: 'login',
      intent: {
        action: 'service_booking',
        returnTo: window.location.pathname,
      },
    });
  }, [openShopperAuthModal]);

  useEffect(() => {
    const reference = searchParams.get('reference') || searchParams.get('trxref');
    if (!reference || searchParams.get('servicePaystack') !== '1' || paidBooking || paymentVerifying) return;

    setPaymentVerifying(true);
    storeService.verifyServiceBookingPaystack(reference)
      .then((response) => {
        const data = unwrapData(response);
        setPaidBooking(data?.booking || null);
        showSuccess('Service payment confirmed. Your appointment is booked.');
        const next = new URLSearchParams(searchParams);
        next.delete('reference');
        next.delete('trxref');
        next.delete('servicePaystack');
        setSearchParams(next, { replace: true });
      })
      .catch((error) => {
        showError(error?.response?.data?.message || error?.message || 'Failed to verify service payment');
      })
      .finally(() => setPaymentVerifying(false));
  }, [paidBooking, paymentVerifying, searchParams, setSearchParams]);

  const handleSubmitRequest = useCallback(async (event) => {
    event.preventDefault();
    if (!isAuthenticated) {
      handleRequireBookingAuth();
      return;
    }
    const values = {
      name: requestForm.name.trim(),
      email: requestForm.email.trim(),
      phone: requestForm.phone.trim(),
      preferredDate: requestForm.preferredDate,
      preferredTime: requestForm.preferredTime,
      message: requestForm.message.trim(),
    };
    const errors = validateRequestForm(values);
    if (Object.keys(errors).length) {
      setFormErrors(errors);
      return;
    }

    setSubmitting(true);
    try {
      if (canCheckout) {
        if (service.ctaType === 'book_service' && (!values.preferredDate || !values.preferredTime)) {
          showError('Choose an appointment date and time before paying.');
          return;
        }
        const response = await storeService.initializeServiceBookingPaystack({
          studioSlug,
          serviceListingId: service?.id,
          serviceSlug: service?.slug,
          serviceTitle: service?.title,
          amount: service?.startingPrice,
          ...values,
        });
        const data = unwrapData(response);
        if (data?.authorization_url) {
          window.location.href = data.authorization_url;
          return;
        }
        showError('Payment could not start. Please try again.');
        return;
      }

      await storeService.submitServiceRequest({
        studioSlug,
        serviceListingId: service?.id,
        serviceSlug: service?.slug,
        serviceTitle: service?.title,
        ...values,
      });
      setSubmitted(true);
      showSuccess('Your request has been sent to the studio.');
    } catch (error) {
      showError(error?.response?.data?.message || error?.message || 'Failed to send request');
    } finally {
      setSubmitting(false);
    }
  }, [canCheckout, handleRequireBookingAuth, isAuthenticated, requestForm, service, studioSlug]);

  const handleReviewSubmit = useCallback(async (reviewPayload) => {
    if (!isAuthenticated) {
      openShopperAuthModal({ action: 'review', returnTo: window.location.pathname });
      return;
    }
    setReviewSubmitting(true);
    try {
      await storeService.submitServiceReview(service.id, reviewPayload);
      showSuccess('Review submitted');
      await Promise.all([reviewsQuery.refetch(), eligibilityQuery.refetch(), serviceQuery.refetch()]);
    } catch (error) {
      showError(error?.response?.data?.message || error?.message || 'Failed to submit review');
    } finally {
      setReviewSubmitting(false);
    }
  }, [eligibilityQuery, isAuthenticated, openShopperAuthModal, reviewsQuery, service?.id, serviceQuery]);

  if (serviceQuery.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Loading service...
      </div>
    );
  }

  if (serviceQuery.isError || !service || !studio) {
    return (
      <div className="min-h-screen bg-[#f4f7f2] p-8 text-center">
        <h1 className="text-2xl font-semibold">Service not found</h1>
        <Button className="mt-4" asChild><Link to={studioHomePath}>{backLabel}</Link></Button>
      </div>
    );
  }

  const ctaLabel = canCheckout
    ? (service.ctaType === 'book_service' ? 'Book and pay' : 'Pay now')
    : 'Request quote';
  const contactHref = buildContactHref(studio, service);

  const Shell = isSingleStoreMode ? OnlineStorePageShell : BuyerLayoutFrame;
  const shellProps = isSingleStoreMode ? {
    footer: (
      // No color of its own: it follows the shop theme the shell sets.
      <StoreScopedFooter
        store={{ ...studio, primaryColor: null }}
        isServiceStore
        singleStoreMode
        contactHref={contactHref}
        storeBasePath={studioHomePath}
      />
    ),
  } : {};

  return (
    <Shell {...shellProps}>
      {!showOwnedChrome ? <StorefrontHeader activePath="/services" /> : null}
      <div className={`mx-auto max-w-6xl ${isSingleStoreMode ? '' : 'px-4 py-6'}`}>
        <Breadcrumbs items={showOwnedChrome
          ? [
            { label: studio.displayName, to: studioHomePath },
            { label: service.title },
          ]
          : [
            { label: 'Studios', to: '/studios' },
            { label: studio.displayName, to: studioHomePath },
            { label: service.title },
          ]} />

        <Button variant="outline" className="mb-6" asChild>
          <Link to={studioHomePath}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            {backLabel}
          </Link>
        </Button>

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="space-y-6">
            <div className="overflow-hidden rounded-3xl border border-border bg-white">
              {service.images?.[0] ? (
                <img src={resolveImageUrl(service.images[0])} alt={service.title} className="aspect-[16/10] w-full object-cover" />
              ) : null}
              <div className="space-y-4 p-6">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{service.category}</Badge>
                  <Badge>{ctaLabel}</Badge>
                </div>
                <h1 className="text-3xl font-bold">{service.title}</h1>
                <p className="text-lg font-semibold text-green-800">{formatServicePrice(service, studio.currency)}</p>
                <ReviewSummaryLine summary={service.reviewSummary} />
                <p className="text-muted-foreground">{service.shortDescription}</p>
                {service.description ? <div className="prose max-w-none text-sm">{service.description}</div> : null}
                {service.turnaroundLabel ? <p className="text-sm"><span className="font-medium">Turnaround:</span> {service.turnaroundLabel}</p> : null}
              </div>
            </div>

            {reviews.length ? (
              <section>
                <h2 className="text-xl font-semibold">Reviews</h2>
                <div className="mt-4"><ReviewList reviews={reviews} /></div>
              </section>
            ) : null}

            {isAuthenticated ? (
              <VerifiedReviewForm
                eligibility={unwrapData(eligibilityQuery.data)}
                isAuthenticated={isAuthenticated}
                isEligibilityLoading={eligibilityQuery.isLoading}
                isSubmitting={reviewSubmitting}
                onRequireAuth={() => openShopperAuthModal({ action: 'review', returnTo: window.location.pathname })}
                onSubmit={handleReviewSubmit}
                targetLabel="this service"
              />
            ) : null}
          </div>

          <div className="rounded-3xl border border-border bg-white p-6">
            <h2 className="text-xl font-semibold">{ctaLabel}</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {canCheckout
                ? `Choose your appointment details and pay securely to book ${service.title}.`
                : `Send your request to ${studio.displayName}. They will follow up with a quote or booking details.`}
            </p>

            {paymentVerifying ? (
              <Alert className="mt-4">
                <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                <AlertDescription className="inline">
                  Confirming your service payment...
                </AlertDescription>
              </Alert>
            ) : paidBooking ? (
              <Alert className="mt-4">
                <AlertDescription>
                  Payment confirmed. Your appointment has been sent to the studio.
                  {paidBooking.trackingToken ? (
                    <Button variant="link" className="mt-2 block h-auto p-0 font-semibold text-green-800" asChild>
                      <a href={dashboardLink(`/track-job/${encodeURIComponent(paidBooking.trackingToken)}`)}>
                        Track this service job
                      </a>
                    </Button>
                  ) : null}
                </AlertDescription>
              </Alert>
            ) : submitted ? (
              <Alert className="mt-4">
                <AlertDescription>
                  Your request was sent. The studio will contact you soon. If they create a job for you, you can track progress using the link they share.
                </AlertDescription>
              </Alert>
            ) : !isAuthenticated ? (
              <div className="mt-4 rounded-2xl border border-green-100 bg-green-50 p-4">
                <h3 className="font-semibold text-green-950">Sign in to book this service</h3>
                <p className="mt-2 text-sm leading-6 text-green-950/70">
                  Sign in or create a shopper account first. We will use your profile to fill in your name, email, and phone before booking.
                </p>
                <Button
                  type="button"
                  className="mt-4 w-full bg-green-700 hover:bg-green-800"
                  onClick={handleRequireBookingAuth}
                  disabled={authLoading}
                >
                  {authLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Sign in to continue
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmitRequest} className="mt-4 space-y-4">
                <label className="block text-sm font-medium text-slate-950">
                  Your name
                  <Input
                    value={requestForm.name}
                    onChange={(event) => updateRequestField('name', event.target.value)}
                    className="mt-1"
                  />
                  {formErrors.name ? <p className="mt-1 text-sm text-red-600">{formErrors.name}</p> : null}
                </label>
                <label className="block text-sm font-medium text-slate-950">
                  Email
                  <Input
                    type="email"
                    value={requestForm.email}
                    onChange={(event) => updateRequestField('email', event.target.value)}
                    className="mt-1"
                  />
                  {formErrors.email ? <p className="mt-1 text-sm text-red-600">{formErrors.email}</p> : null}
                </label>
                <label className="block text-sm font-medium text-slate-950">
                  Phone (optional)
                  <Input
                    value={requestForm.phone}
                    onChange={(event) => updateRequestField('phone', event.target.value)}
                    className="mt-1"
                  />
                </label>
                <label className="block text-sm font-medium text-slate-950">
                  {canCheckout && service.ctaType === 'book_service' ? 'Appointment date' : 'Preferred date (optional)'}
                  <Input
                    type="date"
                    value={requestForm.preferredDate}
                    onChange={(event) => updateRequestField('preferredDate', event.target.value)}
                    className="mt-1"
                  />
                </label>
                <label className="block text-sm font-medium text-slate-950">
                  {canCheckout && service.ctaType === 'book_service' ? 'Appointment time' : 'Preferred time (optional)'}
                  <Input
                    type="time"
                    value={requestForm.preferredTime}
                    onChange={(event) => updateRequestField('preferredTime', event.target.value)}
                    className="mt-1"
                  />
                </label>
                <label className="block text-sm font-medium text-slate-950">
                  What do you need?
                  <textarea
                    rows={5}
                    value={requestForm.message}
                    onChange={(event) => updateRequestField('message', event.target.value)}
                    className="mt-1 min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
                  />
                  {formErrors.message ? <p className="mt-1 text-sm text-red-600">{formErrors.message}</p> : null}
                </label>
                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {ctaLabel}
                </Button>
              </form>
            )}
          </div>
        </div>
      </div>
      {isSingleStoreMode ? null : (showOwnedChrome ? (
        <StoreScopedFooter store={studio} isServiceStore contactHref={contactHref} />
      ) : (
        <StorefrontFooter />
      ))}
    </Shell>
  );
};

export default PublicStudioService;
