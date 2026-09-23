import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2, LockKeyhole, MailCheck, ShieldCheck, ShoppingBag } from 'lucide-react';

import { useStorefrontAuth } from '../context/StorefrontAuthContext';
import { useStorefrontMode } from '../context/StorefrontModeContext';
import { dashboardLink } from '../config';
import { showError, showSuccess } from '../utils/toast';
import { Breadcrumbs, PageShell } from '../components/storefront/StorefrontLayout';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const getErrorMessage = (error) => (
  error?.response?.data?.message ||
  error?.response?.data?.error ||
  error?.message ||
  'Authentication failed. Please try again.'
);

const HOME_PATH = '/';
const EMAIL_PATTERN = /\S+@\S+\.\S+/;

const isSafeReturnPath = (path) => (
  typeof path === 'string' && path.startsWith('/') && !path.startsWith('//')
);

const StorefrontAuthPage = () => {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { login, register, resendVerification, sendLoginOtp, verifyEmail, verifyLoginOtp } = useStorefrontAuth();
  const { isSingleStoreMode } = useStorefrontMode();
  const [mode, setMode] = useState(
    searchParams.get('mode') === 'verify' || location.pathname === '/verify-email'
      ? 'verify'
      : searchParams.get('mode') === 'signup' || location.pathname === '/signup' ? 'signup' : 'login'
  );
  const [form, setForm] = useState({ name: '', email: searchParams.get('email') || '', phone: '', password: '', otp: '' });
  const [loginMethod, setLoginMethod] = useState('password');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [isSendingLoginOtp, setIsSendingLoginOtp] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [sessionNotice, setSessionNotice] = useState('');
  const fieldRefs = useRef({});
  const returnTo = useMemo(() => {
    const requested = searchParams.get('returnTo') || location.state?.returnTo || '';
    return isSafeReturnPath(requested) ? requested : HOME_PATH;
  }, [location.state?.returnTo, searchParams]);
  const isCheckoutReturn = returnTo.startsWith('/checkout');
  const targetLabel = isCheckoutReturn ? 'checkout' : returnTo.startsWith('/account') ? 'your account' : 'home';
  const isSignup = mode === 'signup';
  const isVerification = mode === 'verify';
  const isOtpLogin = !isSignup && !isVerification && loginMethod === 'otp';

  useEffect(() => {
    let storedMessage = '';
    try {
      storedMessage = window.sessionStorage.getItem('storefrontAuthMessage') || '';
      window.sessionStorage.removeItem('storefrontAuthMessage');
    } catch {
      storedMessage = '';
    }
    if (storedMessage) {
      setSessionNotice(storedMessage);
      return;
    }
    if (searchParams.get('reason') === 'session_expired') {
      setSessionNotice('Your shopper session expired. Sign in again to continue.');
    }
  }, [searchParams]);

  const updateField = useCallback((field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => {
      if (!current[field]) return current;
      return { ...current, [field]: undefined, form: undefined };
    });
  }, []);

  const focusFirstInvalid = useCallback((errors) => {
    const firstField = ['name', 'email', 'phone', 'password', 'otp'].find((field) => errors[field]);
    if (firstField) {
      fieldRefs.current[firstField]?.focus();
    }
  }, []);

  const validateAuthForm = useCallback(() => {
    const errors = {};
    const email = form.email.trim();

    if (isSignup && !form.name.trim()) errors.name = 'Enter your full name.';
    if (!email) errors.email = 'Enter your email.';
    else if (!EMAIL_PATTERN.test(email)) errors.email = 'Enter a valid email address.';
    if (isSignup && !form.phone.trim()) errors.phone = 'Enter your phone number.';

    if (isVerification || isOtpLogin) {
      if (!form.otp.trim()) errors.otp = 'Enter the 6-digit code from your email.';
      else if (form.otp.trim().length !== 6) errors.otp = 'Enter the full 6-digit code.';
    } else if (!form.password) {
      errors.password = 'Enter your password.';
    } else if (isSignup && form.password.length < 8) {
      errors.password = 'Use at least 8 characters.';
    }

    setFieldErrors(errors);
    focusFirstInvalid(errors);
    return Object.keys(errors).length === 0;
  }, [focusFirstInvalid, form.email, form.name, form.otp, form.password, form.phone, isOtpLogin, isSignup, isVerification]);

  const handleSubmit = useCallback(async (event) => {
    event.preventDefault();
    if (!validateAuthForm()) return;
    setIsSubmitting(true);
    try {
      if (isVerification) {
        await verifyEmail({ email: form.email, otp: form.otp });
        showSuccess(`Email verified. You can continue to ${targetLabel}.`);
        navigate(returnTo, { replace: true });
        return;
      }

      if (isSignup) {
        const data = await register({
          name: form.name,
          email: form.email,
          phone: form.phone,
          password: form.password,
        });
        if (data?.token || data?.customer) {
          showSuccess(data?.customer?.isEmailVerified ? `Account created. You can continue to ${targetLabel}.` : 'Account created. Check your email to verify from your account.');
        } else if (data?.verificationRequired) {
          showSuccess('Verification code sent. Check your email.');
          setMode('verify');
          return;
        } else {
          showSuccess(`Account created. You can continue to ${targetLabel}.`);
        }
      } else if (isOtpLogin) {
        await verifyLoginOtp({ email: form.email, otp: form.otp });
        showSuccess(`Signed in. You can continue to ${targetLabel}.`);
      } else {
        await login({ email: form.email, password: form.password });
        showSuccess(`Signed in. You can continue to ${targetLabel}.`);
      }
      navigate(returnTo, { replace: true });
    } catch (error) {
      const errorData = error?.response?.data;
      if (errorData?.errorCode === 'EMAIL_VERIFICATION_REQUIRED') {
        const pendingEmail = errorData?.data?.email || form.email;
        updateField('email', pendingEmail);
        setMode('verify');
        setFieldErrors((current) => ({
          ...current,
          form: errorData?.message || 'Verify your email to continue.',
        }));
      }
      const message = getErrorMessage(error);
      setFieldErrors((current) => ({ ...current, form: message }));
      showError(message);
    } finally {
      setIsSubmitting(false);
    }
  }, [form.email, form.name, form.otp, form.password, form.phone, isOtpLogin, isSignup, isVerification, login, navigate, register, returnTo, targetLabel, validateAuthForm, verifyEmail, verifyLoginOtp]);

  const handleResend = useCallback(async () => {
    setIsResending(true);
    try {
      await resendVerification({ email: form.email });
      showSuccess('A new verification code has been sent.');
    } catch (error) {
      showError(getErrorMessage(error));
    } finally {
      setIsResending(false);
    }
  }, [form.email, resendVerification]);

  const handleSendLoginOtp = useCallback(async () => {
    const email = form.email.trim();
    const errors = {};
    if (!email) errors.email = 'Enter your email before requesting a code.';
    else if (!EMAIL_PATTERN.test(email)) errors.email = 'Enter a valid email address.';
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      focusFirstInvalid(errors);
      return;
    }

    setFieldErrors({});
    setIsSendingLoginOtp(true);
    try {
      const response = await sendLoginOtp({ email: form.email });
      showSuccess(response?.message || 'Sign-in code sent. Check your email.');
    } catch (error) {
      const message = getErrorMessage(error);
      setFieldErrors((current) => ({ ...current, form: message }));
      showError(message);
    } finally {
      setIsSendingLoginOtp(false);
    }
  }, [focusFirstInvalid, form.email, sendLoginOtp]);

  return (
    <PageShell activePath="/login">
      <Breadcrumbs items={[{ label: isVerification ? 'Verify email' : isSignup ? 'Create shopper account' : 'Shopper login' }]} />

      <section className="mx-auto grid max-w-5xl gap-6 rounded-2xl border border-[color:color-mix(in_srgb,var(--store-accent,#166534)_28%,white)] bg-white p-5 sm:rounded-[2rem] md:grid-cols-[0.9fr_1.1fr] md:p-8">
        <div className="rounded-2xl border border-[color:color-mix(in_srgb,var(--store-accent,#166534)_18%,#e5e7eb)] bg-[var(--store-accent-soft,#f0fdf4)] p-6 sm:rounded-[1.5rem]">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-[color:color-mix(in_srgb,var(--store-accent,#166534)_28%,white)] bg-white text-[color:color-mix(in_srgb,var(--store-accent,#166534)_85%,black)]">
            <LockKeyhole className="h-7 w-7" />
          </span>
          <p className="mt-6 text-sm font-bold uppercase tracking-[0.18em] text-[color:var(--store-accent,#166534)]">{isSingleStoreMode ? 'Shopper account' : 'No Guest Checkout'}</p>
          <h1 className="mt-3 text-3xl font-black text-[color:color-mix(in_srgb,var(--store-accent,#166534)_55%,#020617)]">
            {isVerification
              ? 'Verify your shopper email'
              : isSignup
                ? 'Create your shopper account'
                : isCheckoutReturn
                  ? 'Sign in to continue checkout'
                  : (isSingleStoreMode ? 'Sign in to shop' : 'Sign in to shop Sabito Store')}
          </h1>
          <p className="mt-3 text-sm leading-6 text-[color:color-mix(in_srgb,var(--store-accent,#166534)_55%,#020617)]/70">
            {isSingleStoreMode
              ? 'An account is optional. Sign in to see all your orders and saved addresses in one place, or check out as a guest.'
              : 'Shoppers can browse freely, but purchases require a Sabito Store customer account for order tracking, trade assurance, and seller communication.'}
          </p>
          {isSingleStoreMode && isCheckoutReturn ? (
            <Button asChild variant="outline" className="mt-6 w-full rounded-full bg-white">
              <Link to="/checkout">Continue as guest</Link>
            </Button>
          ) : null}
          {isCheckoutReturn ? (
            <Alert className="mt-6 border-amber-200 bg-amber-50">
              <ShoppingBag className="h-4 w-4" />
              <AlertDescription>
                Your cart and checkout path are preserved. After authentication, you will return to the purchase flow.
              </AlertDescription>
            </Alert>
          ) : null}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-[color:var(--store-accent,#166534)]">
              {isVerification ? 'Email activation' : isSignup ? 'New customer' : isOtpLogin ? 'Email code login' : 'Returning customer'}
            </p>
            <h2 className="mt-2 text-2xl font-black text-slate-950">
              {isVerification ? 'Enter the 6-digit code' : isSignup ? 'Create your shopper account' : isOtpLogin ? 'Login with a one-time code' : 'Login to your shopper account'}
            </h2>
          </div>

          {isVerification ? (
            <Alert className="border-[color:color-mix(in_srgb,var(--store-accent,#166534)_28%,white)] bg-[var(--store-accent-soft,#f0fdf4)]">
              <MailCheck className="h-4 w-4" />
              <AlertDescription>
                We sent a verification code to {form.email || 'your email'}. You can verify here or from inside your shopper account.
              </AlertDescription>
            </Alert>
          ) : null}

          {sessionNotice ? (
            <Alert className="border-amber-200 bg-amber-50">
              <LockKeyhole className="h-4 w-4" />
              <AlertDescription>
                {sessionNotice} {returnTo !== '/' ? 'We will bring you back after sign-in.' : ''}
              </AlertDescription>
            </Alert>
          ) : null}

          {isOtpLogin ? (
            <Alert className="border-[color:color-mix(in_srgb,var(--store-accent,#166534)_28%,white)] bg-[var(--store-accent-soft,#f0fdf4)]">
              <ShieldCheck className="h-4 w-4" />
              <AlertDescription>
                Enter your email, request a code, then use the 6-digit code to sign in without your password.
              </AlertDescription>
            </Alert>
          ) : null}

          {isSignup ? (
            <div className="grid gap-2">
              <label className="text-sm font-semibold text-slate-700" htmlFor="name">Full name</label>
              <Input
                ref={(node) => { fieldRefs.current.name = node; }}
                id="name"
                value={form.name}
                onChange={(event) => updateField('name', event.target.value)}
                autoComplete="name"
                aria-invalid={Boolean(fieldErrors.name)}
                aria-describedby={fieldErrors.name ? 'name-error' : undefined}
                className={fieldErrors.name ? 'border-red-300 focus-visible:ring-red-200' : undefined}
              />
              <FieldError id="name-error" message={fieldErrors.name} />
            </div>
          ) : null}

          <div className="grid gap-2">
            <label className="text-sm font-semibold text-slate-700" htmlFor="email">Email</label>
            <Input
              ref={(node) => { fieldRefs.current.email = node; }}
              id="email"
              type="email"
              value={form.email}
              onChange={(event) => updateField('email', event.target.value)}
              autoComplete="email"
              disabled={isVerification}
              aria-invalid={Boolean(fieldErrors.email)}
              aria-describedby={fieldErrors.email ? 'email-error' : undefined}
              className={fieldErrors.email ? 'border-red-300 focus-visible:ring-red-200' : undefined}
            />
            <FieldError id="email-error" message={fieldErrors.email} />
          </div>

          {isSignup ? (
            <div className="grid gap-2">
              <label className="text-sm font-semibold text-slate-700" htmlFor="phone">Phone</label>
              <Input
                ref={(node) => { fieldRefs.current.phone = node; }}
                id="phone"
                value={form.phone}
                onChange={(event) => updateField('phone', event.target.value)}
                autoComplete="tel"
                aria-invalid={Boolean(fieldErrors.phone)}
                aria-describedby={fieldErrors.phone ? 'phone-error' : undefined}
                className={fieldErrors.phone ? 'border-red-300 focus-visible:ring-red-200' : undefined}
              />
              <FieldError id="phone-error" message={fieldErrors.phone} />
            </div>
          ) : null}

          {isVerification || isOtpLogin ? (
            <div className="grid gap-2">
              <label className="text-sm font-semibold text-slate-700" htmlFor="otp">
                {isOtpLogin ? 'Sign-in code' : 'Verification code'}
              </label>
              <Input
                ref={(node) => { fieldRefs.current.otp = node; }}
                id="otp"
                inputMode="numeric"
                maxLength={6}
                pattern="[0-9]{6}"
                value={form.otp}
                onChange={(event) => updateField('otp', event.target.value.replace(/\D/g, '').slice(0, 6))}
                autoComplete="one-time-code"
                aria-invalid={Boolean(fieldErrors.otp)}
                aria-describedby={fieldErrors.otp ? 'otp-error' : undefined}
                className={fieldErrors.otp ? 'border-red-300 focus-visible:ring-red-200' : undefined}
              />
              <FieldError id="otp-error" message={fieldErrors.otp} />
            </div>
          ) : (
          <div className="grid gap-2">
            <label className="text-sm font-semibold text-slate-700" htmlFor="password">Password</label>
            <Input
              ref={(node) => { fieldRefs.current.password = node; }}
              id="password"
              type="password"
              value={form.password}
              onChange={(event) => updateField('password', event.target.value)}
              autoComplete={isSignup ? 'new-password' : 'current-password'}
              minLength={8}
              aria-invalid={Boolean(fieldErrors.password)}
              aria-describedby={fieldErrors.password ? 'password-error' : undefined}
              className={fieldErrors.password ? 'border-red-300 focus-visible:ring-red-200' : undefined}
            />
            <FieldError id="password-error" message={fieldErrors.password} />
          </div>
          )}

          {!isSignup && !isVerification ? (
            <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
              <button
                type="button"
                className="font-semibold text-[color:color-mix(in_srgb,var(--store-accent,#166534)_85%,black)] hover:underline"
                onClick={() => {
                  setLoginMethod(isOtpLogin ? 'password' : 'otp');
                  updateField('otp', '');
                }}
              >
                {isOtpLogin ? 'Use password instead' : 'Email me a sign-in code'}
              </button>
              {isOtpLogin ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-full border-[color:color-mix(in_srgb,var(--store-accent,#166534)_28%,white)] text-[color:color-mix(in_srgb,var(--store-accent,#166534)_85%,black)] hover:bg-[var(--store-accent-soft,#16653422)]"
                    disabled={isSendingLoginOtp || !form.email}
                    aria-describedby={!form.email ? 'send-code-helper' : undefined}
                    onClick={handleSendLoginOtp}
                  >
                    {isSendingLoginOtp ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Send code
                  </Button>
                  {!form.email ? (
                    <p id="send-code-helper" className="basis-full text-xs text-slate-500">
                      Enter your email before requesting a sign-in code.
                    </p>
                  ) : null}
                </>
              ) : (
                <Link className="font-semibold text-[color:color-mix(in_srgb,var(--store-accent,#166534)_85%,black)] hover:underline" to={`/forgot-password?returnTo=${encodeURIComponent(returnTo)}`}>
                  Forgot password?
                </Link>
              )}
            </div>
          ) : null}

          {fieldErrors.form ? (
            <div role="alert" className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
              {fieldErrors.form}
            </div>
          ) : null}

          {isVerification ? (
            <p className="text-center text-sm text-slate-600">
              <button
                type="button"
                className="font-semibold text-[color:color-mix(in_srgb,var(--store-accent,#166534)_85%,black)] hover:underline"
                onClick={() => setMode('login')}
              >
                Back to sign in
              </button>
            </p>
          ) : null}

          <Button type="submit" className="w-full rounded-full bg-[var(--store-accent,#166534)] text-white hover:bg-[var(--store-accent-hover,color-mix(in_srgb,var(--store-accent,#166534)_85%,black))]" disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {isVerification ? 'Verify and continue' : isSignup ? 'Create account and continue' : isOtpLogin ? 'Verify code and continue' : 'Sign in'}
          </Button>

          {isVerification ? (
            <p className="text-center text-sm text-slate-600">
              <button
                type="button"
                className="font-semibold text-[color:color-mix(in_srgb,var(--store-accent,#166534)_85%,black)] hover:underline disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isResending || !form.email}
                onClick={handleResend}
              >
                {isResending ? 'Sending verification code...' : 'Resend verification code'}
              </button>
            </p>
          ) : null}

          {!isVerification ? (
            <p className="text-center text-sm text-slate-600">
              {isSignup ? (
                <>
                  Already have an account?{' '}
                  <button
                    type="button"
                    className="font-semibold text-[color:color-mix(in_srgb,var(--store-accent,#166534)_85%,black)] hover:underline"
                    onClick={() => setMode('login')}
                  >
                    Sign in
                  </button>
                </>
              ) : (
                <>
                  Don&apos;t have an account?{' '}
                  <button
                    type="button"
                    className="font-semibold text-[color:color-mix(in_srgb,var(--store-accent,#166534)_85%,black)] hover:underline"
                    onClick={() => setMode('signup')}
                  >
                    Sign up
                  </button>
                </>
              )}
            </p>
          ) : null}

          <p className="text-center text-xs text-slate-500">
            Looking for seller access? <a className="font-semibold text-[color:color-mix(in_srgb,var(--store-accent,#166534)_85%,black)]" href={dashboardLink('/login')}>Use the ABS Dashboard</a>.
          </p>
        </form>
      </section>
    </PageShell>
  );
};

const FieldError = ({ id, message }) => (
  message ? (
    <p id={id} className="text-sm font-semibold text-red-700">
      {message}
    </p>
  ) : null
);

export default StorefrontAuthPage;
