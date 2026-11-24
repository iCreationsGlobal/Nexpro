import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Loader2, LockKeyhole, MailCheck, ShieldCheck, ShoppingBag, X } from 'lucide-react';

import { dashboardLink } from '../../config';
import { useStorefrontAuth } from '../../context/StorefrontAuthContext';
import { useStorefrontMode } from '../../context/StorefrontModeContext';
import { resolveSingleStoreHomePath } from '../../online-store/storePaths';
import GoogleSignInButton from './GoogleSignInButton';
import { useGoogleSignIn } from './GoogleSignInHost';
import { showError, showSuccess } from '../../utils/toast';
import { isExistingShopperAccountError } from '../../utils/shopperAuthFlow';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const GoogleLogo = ({ className = 'h-5 w-5' }) => (
  <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
    <path
      fill="#4285F4"
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
    />
    <path
      fill="#34A853"
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
    />
    <path
      fill="#FBBC05"
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
    />
    <path
      fill="#EA4335"
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
    />
  </svg>
);

const getErrorMessage = (error) => (
  error?.response?.data?.message ||
  error?.response?.data?.error ||
  error?.message ||
  'Authentication failed. Please try again.'
);

const initialForm = {
  name: '',
  email: '',
  phone: '',
  password: '',
  confirmPassword: '',
  otp: '',
};

const ShopperAuthModal = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    authModal,
    closeShopperAuthModal,
    googleAuth,
    googleClientId,
    googleConfigLoaded,
    login,
    register,
    resendVerification,
    sendLoginOtp,
    verifyEmail,
    verifyLoginOtp,
  } = useStorefrontAuth();
  const { isSingleStoreMode, storeSlug: modeSlug, pathPrefix, isCustomDomain } = useStorefrontMode();
  const [mode, setMode] = useState('login');
  const [absLinkToken, setAbsLinkToken] = useState('');
  const [authNotice, setAuthNotice] = useState('');
  const [form, setForm] = useState(initialForm);
  const [signupStep, setSignupStep] = useState('details');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const googleSignIn = useGoogleSignIn();
  const scriptLoadedSuccessfully = googleSignIn?.scriptLoadedSuccessfully ?? false;
  const homePath = isSingleStoreMode
    ? resolveSingleStoreHomePath({ storeSlug: modeSlug, pathPrefix, isCustomDomain })
    : '/';

  const isOpen = Boolean(authModal?.isOpen);
  const isSignup = mode === 'signup';
  const isAbsLink = mode === 'abs-link';
  const isVerification = mode === 'verify' || isAbsLink;
  const isSignupDetailsStep = isSignup && signupStep === 'details';
  const isSignupSecurityStep = isSignup && signupStep === 'security';
  const returnTo = useMemo(() => {
    const requested = authModal?.intent?.returnTo || `${location.pathname}${location.search || ''}` || '/';
    return requested.startsWith('/') && !requested.startsWith('//') ? requested : '/';
  }, [authModal?.intent?.returnTo, location.pathname, location.search]);
  const isCheckoutReturn = returnTo.startsWith('/checkout');
  const targetLabel = isCheckoutReturn ? 'checkout' : returnTo.startsWith('/account') ? 'your account' : 'home';

  useEffect(() => {
    if (!isOpen) return;
    setMode(authModal?.mode === 'signup' ? 'signup' : authModal?.mode === 'verify' ? 'verify' : 'login');
    setAbsLinkToken('');
    setAuthNotice('');
    setSignupStep('details');
    setForm((current) => ({
      ...initialForm,
      email: current.email,
    }));
  }, [authModal?.mode, isOpen]);

  // Online Store: prefer full /login|/signup under OnlineStorePageShell (store footer).
  // Sabito marketplace keeps this modal unchanged.
  useEffect(() => {
    if (!isOpen || !isSingleStoreMode) return;
    const authPath = authModal?.mode === 'login'
      ? '/login'
      : authModal?.mode === 'verify'
        ? '/verify-email'
        : '/signup';
    const params = new URLSearchParams();
    if (returnTo && returnTo !== '/') params.set('returnTo', returnTo);
    const query = params.toString();
    closeShopperAuthModal();
    navigate(query ? `${authPath}?${query}` : authPath);
  }, [authModal?.mode, closeShopperAuthModal, isOpen, isSingleStoreMode, navigate, returnTo]);

  useEffect(() => {
    if (!isOpen || isSingleStoreMode) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') closeShopperAuthModal();
    };

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [closeShopperAuthModal, isOpen, isSingleStoreMode]);

  const updateField = useCallback((field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
    if (field === 'email') {
      setAbsLinkToken('');
      setAuthNotice('');
    }
  }, []);

  const switchMode = useCallback((nextMode) => {
    setSignupStep('details');
    setAbsLinkToken('');
    setAuthNotice('');
    setForm((current) => ({ ...current, password: '', confirmPassword: '', otp: '' }));
    setMode(nextMode);
  }, []);

  const completeAuthentication = useCallback((message) => {
    showSuccess(message);
    closeShopperAuthModal();
    navigate(returnTo, { replace: false });
  }, [closeShopperAuthModal, navigate, returnTo]);

  const handleSubmit = useCallback(async (event) => {
    event.preventDefault();

    if (isSignupDetailsStep) {
      setSignupStep('security');
      return;
    }

    if (isSignupSecurityStep && form.password !== form.confirmPassword) {
      showError('Passwords do not match. Please confirm your password.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (isVerification) {
        if (isAbsLink) {
          await verifyLoginOtp({ email: form.email, otp: form.otp, absLinkToken });
        } else {
          await verifyEmail({ email: form.email, otp: form.otp });
        }
        completeAuthentication(`Verified. You can continue to ${targetLabel}.`);
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
          completeAuthentication(data?.customer?.isEmailVerified
            ? `Account created. You can continue to ${targetLabel}.`
            : 'Account created. Check your email to verify from your account.');
          return;
        }

        if (data?.verificationRequired) {
          showSuccess('Verification code sent. Check your email.');
          setMode('verify');
          return;
        }

        completeAuthentication(`Account created. You can continue to ${targetLabel}.`);
        return;
      }

      await login({ email: form.email, password: form.password });
      completeAuthentication(`Signed in. You can continue to ${targetLabel}.`);
    } catch (error) {
      const errorData = error?.response?.data;
      if (isSignup && isExistingShopperAccountError(error)) {
        switchMode('login');
        setAuthNotice('You already have an account. Sign in with your shopper or ABS password to continue.');
        return;
      }
      if (errorData?.errorCode === 'STOREFRONT_ABS_LINK_REQUIRED') {
        setAbsLinkToken(errorData.data.absLinkToken);
        setMode('abs-link');
        setForm((current) => ({ ...current, password: '', otp: '' }));
        setAuthNotice(errorData.message);
        return;
      }
      if (errorData?.errorCode === 'STOREFRONT_ABS_LINK_EXPIRED') {
        switchMode('login');
        setAuthNotice(errorData.message);
        return;
      }
      if (errorData?.errorCode === 'EMAIL_VERIFICATION_REQUIRED') {
        const pendingEmail = errorData?.data?.email || form.email;
        updateField('email', pendingEmail);
        setMode('verify');
      }
      showError(getErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }, [
    absLinkToken,
    completeAuthentication,
    form.confirmPassword,
    form.email,
    form.name,
    form.otp,
    form.password,
    form.phone,
    isSignup,
    isAbsLink,
    isSignupDetailsStep,
    isSignupSecurityStep,
    isVerification,
    login,
    register,
    switchMode,
    targetLabel,
    updateField,
    verifyEmail,
    verifyLoginOtp,
  ]);

  const handleResend = useCallback(async () => {
    setIsResending(true);
    try {
      if (isAbsLink) await sendLoginOtp({ email: form.email });
      else await resendVerification({ email: form.email });
      showSuccess('A new verification code has been sent.');
    } catch (error) {
      showError(getErrorMessage(error));
    } finally {
      setIsResending(false);
    }
  }, [form.email, isAbsLink, resendVerification, sendLoginOtp]);

  const handleGoogleSuccess = useCallback(async (credentialResponse) => {
    const idToken = credentialResponse?.credential;
    if (!idToken) {
      showError('Google did not return a sign-in token. Please try again.');
      return;
    }

    setIsGoogleSubmitting(true);
    try {
      await googleAuth(idToken, { signUp: isSignup });
      completeAuthentication(isSignup ? `Google account connected. You can continue to ${targetLabel}.` : `Signed in with Google. You can continue to ${targetLabel}.`);
    } catch (error) {
      const errorData = error?.response?.data;
      if (!isSignup && errorData?.code === 'GOOGLE_SHOPPER_NOT_FOUND') {
        setMode('signup');
        showError('No shopper account was found for that Google account. Choose Sign up with Google to create one.');
      } else {
        showError(getErrorMessage(error));
      }
    } finally {
      setIsGoogleSubmitting(false);
    }
  }, [completeAuthentication, googleAuth, isSignup, targetLabel]);

  const handleGoogleError = useCallback(() => {
    setIsGoogleSubmitting(false);
    showError('Google sign-in was cancelled or failed.');
  }, []);

  useEffect(() => {
    if (!googleSignIn) return undefined;
    return googleSignIn.registerHandlers({
      onSuccess: handleGoogleSuccess,
      onError: handleGoogleError,
    });
  }, [googleSignIn, handleGoogleSuccess, handleGoogleError]);

  // Marketplace Sabito modal only — Online Store redirects to full auth pages above.
  if (!isOpen || isSingleStoreMode) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-slate-950/60 p-0 sm:items-center sm:px-6 sm:py-4" role="dialog" aria-modal="true" aria-labelledby="shopper-auth-title">
      <div className="relative grid h-dvh max-h-none w-full max-w-none overflow-x-hidden overflow-y-auto border-0 bg-white sm:h-auto sm:max-h-[92vh] sm:max-w-5xl sm:rounded-[2rem] sm:border sm:border-green-200 md:grid-cols-[0.9fr_1.1fr]">
        <button
          type="button"
          onClick={closeShopperAuthModal}
          className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
          aria-label="Close shopper account modal"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="min-w-0 bg-green-50 p-4 pt-14 sm:p-5 sm:pt-14 md:p-8">
          <div className="flex items-center gap-2 text-sm font-semibold text-green-800">
            <Link to={homePath} onClick={closeShopperAuthModal} className="hover:text-green-950">
              {isSingleStoreMode ? 'Shop' : 'Home'}
            </Link>
            <span>/</span>
            <span>{isSignup ? 'Create shopper account' : 'Shopper sign-in'}</span>
          </div>

          <span className="mt-8 flex h-14 w-14 items-center justify-center rounded-2xl border border-green-200 bg-white text-green-800">
            <LockKeyhole className="h-7 w-7" />
          </span>
          <p className="mt-6 text-sm font-bold uppercase tracking-[0.18em] text-green-700">No Guest Checkout</p>
          <h1 id="shopper-auth-title" className="mt-3 text-2xl font-black text-green-950 sm:text-3xl md:text-4xl">
            {isSignup ? 'Create an account to buy' : 'Sign in to continue'}
          </h1>
          <p className="mt-4 text-sm leading-6 text-green-950/70">
            {isSingleStoreMode
              ? 'Shoppers can browse freely, but purchases require a customer account for order tracking and communication with the store.'
              : 'Shoppers can browse freely, but purchases require a Sabito Store customer account for order tracking, trade assurance, and seller communication.'}
          </p>
          {isCheckoutReturn ? (
            <Alert className="mt-6 border-amber-200 bg-amber-50">
              <ShoppingBag className="h-4 w-4" />
              <AlertDescription>
                Your cart and checkout path are preserved. After authentication, you will return to the purchase flow.
              </AlertDescription>
            </Alert>
          ) : null}
        </div>

        <form onSubmit={handleSubmit} className="min-w-0 space-y-4 p-4 pt-16 sm:p-5 sm:pt-16 md:p-8 md:pt-8">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-green-700">
              {isAbsLink ? 'Confirm ABS sign-in' : isVerification ? 'Email activation' : isSignup ? 'New customer' : 'Existing customer'}
            </p>
            <h2 className="mt-2 text-2xl font-black text-slate-950">
              {isVerification ? 'Enter the 6-digit code' : isSignupSecurityStep ? 'Secure your shopper account' : isSignup ? 'Create your shopper account' : 'Sign in to your shopper account'}
            </h2>
            {!isSignup && !isVerification ? (
              <p className="mt-2 text-sm text-slate-600">
                Use your shopper account or your existing ABS email and password.{' '}
                <a className="font-semibold underline" href={dashboardLink('/forgot-password')}>Forgot your ABS password?</a>
              </p>
            ) : null}
          </div>

          {authNotice ? (
            <Alert className="border-green-200 bg-green-50">
              <AlertDescription>{authNotice}</AlertDescription>
            </Alert>
          ) : null}

          {isVerification && !isAbsLink ? (
            <Alert className="border-green-200 bg-green-50">
              <MailCheck className="h-4 w-4" />
              <AlertDescription>
                We sent a verification code to {form.email || 'your email'}. You can verify here or from inside your shopper account.
              </AlertDescription>
            </Alert>
          ) : null}

          {isSignup ? (
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
              <span className={isSignupDetailsStep ? 'text-green-800' : 'text-slate-400'}>1. Customer details</span>
              <span className="h-px flex-1 bg-slate-200" />
              <span className={isSignupSecurityStep ? 'text-green-800' : 'text-slate-400'}>2. Password</span>
            </div>
          ) : null}

          {isSignupDetailsStep ? (
            <div className="grid gap-2">
              <label className="text-sm font-semibold text-slate-700" htmlFor="shopper-auth-name">Full name</label>
              <Input
                id="shopper-auth-name"
                value={form.name}
                onChange={(event) => updateField('name', event.target.value)}
                autoComplete="name"
                required
              />
            </div>
          ) : null}

          {!isSignupSecurityStep ? (
            <div className="grid gap-2">
              <label className="text-sm font-semibold text-slate-700" htmlFor="shopper-auth-email">Email</label>
              <Input
                id="shopper-auth-email"
                type="email"
                value={form.email}
                onChange={(event) => updateField('email', event.target.value)}
                autoComplete="email"
                disabled={isVerification}
                required
              />
            </div>
          ) : null}

          {isSignupDetailsStep ? (
            <div className="grid gap-2">
              <label className="text-sm font-semibold text-slate-700" htmlFor="shopper-auth-phone">Phone</label>
              <Input
                id="shopper-auth-phone"
                value={form.phone}
                onChange={(event) => updateField('phone', event.target.value)}
                autoComplete="tel"
                required
              />
            </div>
          ) : null}

          {isSignupSecurityStep ? (
            <Alert className="border-green-200 bg-green-50">
              <ShieldCheck className="h-4 w-4" />
              <AlertDescription>
                Passwords must be at least 8 characters. You can go back to edit {form.email || 'your customer details'} before checkout.
              </AlertDescription>
            </Alert>
          ) : null}

          {isVerification ? (
            <div className="grid gap-2">
              <label className="text-sm font-semibold text-slate-700" htmlFor="shopper-auth-otp">
                Verification code
              </label>
              <Input
                id="shopper-auth-otp"
                inputMode="numeric"
                maxLength={6}
                pattern="[0-9]{6}"
                value={form.otp}
                onChange={(event) => updateField('otp', event.target.value.replace(/\D/g, '').slice(0, 6))}
                autoComplete="one-time-code"
                required
              />
            </div>
          ) : !isSignupDetailsStep ? (
            <div className="grid gap-2">
              <label className="text-sm font-semibold text-slate-700" htmlFor="shopper-auth-password">Password</label>
              <Input
                id="shopper-auth-password"
                type="password"
                value={form.password}
                onChange={(event) => updateField('password', event.target.value)}
                autoComplete={isSignup ? 'new-password' : 'current-password'}
                minLength={8}
                required
              />
            </div>
          ) : null}

          {isSignupSecurityStep ? (
            <div className="grid gap-2">
              <label className="text-sm font-semibold text-slate-700" htmlFor="shopper-auth-confirm-password">Confirm password</label>
              <Input
                id="shopper-auth-confirm-password"
                type="password"
                value={form.confirmPassword}
                onChange={(event) => updateField('confirmPassword', event.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
              />
            </div>
          ) : null}

          {!isSignup && !isVerification ? (
            <div className="flex flex-wrap items-center justify-end gap-3 text-sm">
              <Link
                className="font-semibold text-green-800 hover:underline"
                to={`/forgot-password?returnTo=${encodeURIComponent(returnTo)}`}
                onClick={closeShopperAuthModal}
              >
                Forgot password?
              </Link>
            </div>
          ) : null}

          {!isVerification && !isSignupSecurityStep ? (
            <div className="rounded-2xl bg-white p-3">
              {googleClientId ? (
                <div className="relative w-full min-w-0" data-google-configured="true">
                  <GoogleSignInButton
                    isSignup={isSignup}
                    disabled={isGoogleSubmitting || !scriptLoadedSuccessfully}
                  >
                    <span className="flex w-full items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700">
                      {isGoogleSubmitting ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : (
                        <GoogleLogo />
                      )}
                      <span>{isSignup ? 'Sign up with Google' : 'Sign in with Google'}</span>
                    </span>
                  </GoogleSignInButton>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full rounded-full border-slate-200 text-slate-700 hover:bg-slate-50"
                  disabled={!googleConfigLoaded}
                  onClick={() => showError('Google sign-in is not configured yet. Use email and password for now.')}
                >
                  {googleConfigLoaded ? 'Google sign-in unavailable' : 'Loading Google sign-in...'}
                </Button>
              )}
              {isGoogleSubmitting ? (
                <p className="mt-2 flex items-center justify-center text-xs font-semibold text-green-800">
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                  Connecting your Google account...
                </p>
              ) : null}
            </div>
          ) : null}

          {isVerification ? (
            <p className="text-center text-sm text-slate-600">
              <button
                type="button"
                className="font-semibold text-green-800 hover:underline"
                onClick={() => switchMode('login')}
              >
                Back to sign in
              </button>
            </p>
          ) : null}

          {isSignupSecurityStep ? (
            <p className="text-center text-sm text-slate-600">
              <button
                type="button"
                className="font-semibold text-green-800 hover:underline"
                onClick={() => setSignupStep('details')}
              >
                Back to edit details
              </button>
            </p>
          ) : null}

          <Button type="submit" className="w-full rounded-full bg-green-700 hover:bg-green-800" disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {isVerification ? 'Verify and continue' : isSignupDetailsStep ? 'Continue' : isSignup ? 'Create account and continue' : 'Sign in'}
          </Button>

          {isVerification ? (
            <p className="text-center text-sm text-slate-600">
              <button
                type="button"
                className="font-semibold text-green-800 hover:underline disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isResending || !form.email}
                onClick={handleResend}
              >
                {isResending ? 'Sending verification code...' : 'Resend verification code'}
              </button>
            </p>
          ) : null}

          {!isVerification && !isSignupSecurityStep ? (
            <p className="text-center text-sm text-slate-600">
              {isSignup ? (
                <>
                  Already have an account?{' '}
                  <button
                    type="button"
                    className="font-semibold text-green-800 hover:underline"
                    onClick={() => switchMode('login')}
                  >
                    Sign in
                  </button>
                </>
              ) : (
                <>
                  Don&apos;t have an account?{' '}
                  <button
                    type="button"
                    className="font-semibold text-green-800 hover:underline"
                    onClick={() => switchMode('signup')}
                  >
                    Sign up
                  </button>
                </>
              )}
            </p>
          ) : null}

          <p className="text-center text-xs text-slate-500">
            Looking for seller access? <a className="font-semibold text-green-800" href={dashboardLink('/login')}>Use the ABS Dashboard</a>.
          </p>
        </form>
      </div>
    </div>
  );
};

export default ShopperAuthModal;
