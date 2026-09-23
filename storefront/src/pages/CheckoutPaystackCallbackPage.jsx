import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertCircle, Loader2, ShieldCheck } from 'lucide-react';

import storeService from '../services/storeService';
import { useCart } from '../context/CartContext';
import { showError } from '../utils/toast';
import { clearGuestCheckoutPending, readGuestCheckoutPending, rememberGuestOrder } from '../utils/guestCheckout';
import { Breadcrumbs, PageShell } from '../components/storefront/StorefrontLayout';
import { Button } from '@/components/ui/button';

const CheckoutPaystackCallbackPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { clearCart } = useCart();
  const verifyStartedRef = useRef(false);
  const [phase, setPhase] = useState('verifying');
  const [errorMessage, setErrorMessage] = useState('');

  const reference = (searchParams.get('reference') || searchParams.get('trxref') || '').trim();
  const fromPaystack = searchParams.get('paystack') === '1';

  const verifyPayment = useCallback(async () => {
    if (!reference) {
      setPhase('failed');
      setErrorMessage('Missing Paystack reference. Return to checkout and try payment again.');
      return;
    }

    setPhase('verifying');
    setErrorMessage('');
    try {
      // Guest orders prove ownership with the token saved when payment started.
      const pendingGuest = readGuestCheckoutPending();
      const response = await storeService.verifyStorefrontOrderPaystack(reference, pendingGuest?.token || null);
      const order = response?.data?.order || response?.order;
      if (!order?.id) {
        throw new Error('Payment was verified but the order could not be loaded.');
      }
      if (pendingGuest?.orderId === order.id) {
        rememberGuestOrder(order.id, pendingGuest.token);
        clearGuestCheckoutPending();
      }
      clearCart();
      setPhase('success');
      navigate(`/checkout/success/${encodeURIComponent(order.id)}`, {
        replace: true,
        state: { order },
      });
    } catch (error) {
      setPhase('failed');
      const message = error?.response?.data?.message
        || error?.message
        || 'Could not confirm your Paystack payment.';
      setErrorMessage(message);
      showError(error, message);
    }
  }, [clearCart, navigate, reference]);

  useEffect(() => {
    if (!fromPaystack || verifyStartedRef.current) return;
    verifyStartedRef.current = true;
    verifyPayment();
  }, [fromPaystack, verifyPayment]);

  return (
    <PageShell activePath="/checkout" appMode>
      <Breadcrumbs items={[{ label: 'Cart', to: '/cart' }, { label: 'Checkout', to: '/checkout' }, { label: 'Payment' }]} />
      <section className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 text-center sm:rounded-[2rem] md:p-10">
        {phase === 'verifying' ? (
          <>
            <Loader2 className="mx-auto h-12 w-12 animate-spin text-green-700" />
            <p className="mt-6 text-sm font-bold uppercase tracking-[0.18em] text-green-700">Confirming payment</p>
            <h1 className="mt-2 text-3xl font-black text-slate-950">Verifying Paystack payment</h1>
            <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-slate-500">
              Please wait while we confirm your payment and place your order.
            </p>
          </>
        ) : (
          <>
            <span className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-red-50 text-red-700">
              <AlertCircle className="h-11 w-11" />
            </span>
            <p className="mt-6 text-sm font-bold uppercase tracking-[0.18em] text-red-700">Payment not confirmed</p>
            <h1 className="mt-2 text-3xl font-black text-slate-950">We could not place your order</h1>
            <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-slate-500">
              {errorMessage || 'Your Paystack payment was not confirmed. You can retry checkout without being charged twice for the same attempt.'}
            </p>
            <div className="mt-6 rounded-2xl border border-green-100 bg-green-50 p-4 text-left text-sm leading-6 text-green-900 sm:rounded-3xl">
              <span className="inline-flex items-center gap-2 font-black text-green-800">
                <ShieldCheck className="h-4 w-4" />
                Trade Assurance
              </span>
              <p className="mt-2">Orders are only finalized after Paystack confirms payment. No held-payment status is shown until verification succeeds.</p>
            </div>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Button variant="outline" className="rounded-full border-green-200 text-green-800 hover:bg-green-50" asChild>
                <Link to="/cart">Back to cart</Link>
              </Button>
              <Button variant="outline" className="rounded-full border-green-200 text-green-800 hover:bg-green-50" asChild>
                <Link to="/checkout">Return to checkout</Link>
              </Button>
              <Button className="rounded-full bg-green-700 hover:bg-green-800" onClick={verifyPayment} disabled={!reference}>
                Try confirmation again
              </Button>
            </div>
          </>
        )}
      </section>
    </PageShell>
  );
};

export default CheckoutPaystackCallbackPage;
