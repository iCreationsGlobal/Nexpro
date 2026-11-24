import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import StorefrontAuthPage from '../../../../storefront/src/pages/StorefrontAuthPage';
import ShopperAuthModal from '../../../../storefront/src/components/storefront/ShopperAuthModal';
import { CheckoutRoute, singleStoreCommerceRouteElements } from '../../../../storefront/src/online-store/SingleStoreApp';

const mocks = vi.hoisted(() => ({
  mode: { isSingleStoreMode: true },
  auth: {
    login: vi.fn(), register: vi.fn(), verifyLoginOtp: vi.fn(), sendLoginOtp: vi.fn(),
    verifyEmail: vi.fn(), resendVerification: vi.fn(), openShopperAuthModal: vi.fn(),
    closeShopperAuthModal: vi.fn(), googleAuth: vi.fn(), isLoading: false, isAuthenticated: false,
    authModal: { isOpen: true, mode: 'login', intent: { returnTo: '/checkout' } },
  },
}));

vi.mock('../../../../storefront/src/context/StorefrontAuthContext', () => ({ useStorefrontAuth: () => mocks.auth }));
vi.mock('../../../../storefront/src/context/StorefrontModeContext', () => ({ useStorefrontMode: () => mocks.mode }));
vi.mock('../../../../storefront/src/components/storefront/StorefrontLayout', () => ({
  PageShell: ({ children }) => <main>{children}</main>, Breadcrumbs: () => null,
}));
vi.mock('../../../../storefront/src/components/storefront/GoogleSignInHost', () => ({
  default: ({ children }) => children, useGoogleSignIn: () => null,
}));
vi.mock('../../../../storefront/src/components/storefront/GoogleSignInButton', () => ({ default: () => null }));
vi.mock('../../../../storefront/src/pages/CheckoutPage', () => ({ default: () => <p>Guest checkout ready</p> }));
vi.mock('../../../../storefront/src/utils/toast', () => ({ showError: vi.fn(), showSuccess: vi.fn() }));

// The app's own route table: /login, /signup and /verify-email are separate routes there.
const mountAppRoutes = (path, extraRoutes = null) => render(
  <MemoryRouter initialEntries={[path]}>
    <Location />
    <Routes>
      {extraRoutes}
      {singleStoreCommerceRouteElements}
    </Routes>
  </MemoryRouter>,
);

const fillSignup = async (user) => {
  await user.type(await screen.findByLabelText('Full name'), 'Ama Shopper');
  await user.type(screen.getByLabelText('Email'), 'ama@example.com');
  await user.type(screen.getByLabelText('Phone'), '0240000000');
  await user.type(screen.getByLabelText('Password'), 'signup-password');
  await user.click(screen.getByRole('button', { name: 'Create account and continue' }));
};

const apiError = (errorCode, data = {}, message = errorCode) => ({ response: { status: 403, data: { errorCode, data, message } } });
const Location = () => {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}{location.search}</output>;
};
const mount = (path = '/login?returnTo=%2Fcheckout', element = <StorefrontAuthPage />) => render(
  <MemoryRouter initialEntries={[path]}>
    <Location />
    <Link to="/login?returnTo=%2Fcheckout">Header sign in</Link>
    <Routes>
      <Route path="/checkout" element={<p>Checkout resumed</p>} />
      <Route path="*" element={element} />
    </Routes>
  </MemoryRouter>,
);

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  Object.values(mocks.auth).forEach((value) => { if (vi.isMockFunction(value)) value.mockReset(); });
  mocks.mode.isSingleStoreMode = true;
  mocks.auth.authModal = { isOpen: true, mode: 'login', intent: { returnTo: '/checkout' } };
});

describe('shopper sign-in pages', () => {
  it('moves an existing account from signup to login, preserving email and checkout', async () => {
    const user = userEvent.setup();
    mocks.auth.register.mockRejectedValue(apiError('STOREFRONT_ACCOUNT_EXISTS'));
    mount('/signup?returnTo=%2Fcheckout');
    await user.type(screen.getByLabelText('Full name'), 'Ama Shopper');
    await user.type(screen.getByLabelText('Email'), 'ama@example.com');
    await user.type(screen.getByLabelText('Phone'), '0240000000');
    await user.type(screen.getByLabelText('Password'), 'signup-password');
    await user.click(screen.getByRole('button', { name: 'Create account and continue' }));
    await screen.findByText(/You already have an account/);
    expect(screen.getByTestId('location')).toHaveTextContent('/login?returnTo=%2Fcheckout');
    expect(screen.getByLabelText('Email')).toHaveValue('ama@example.com');
    expect(screen.getByLabelText('Password')).toHaveValue('');
    expect(mocks.auth.login).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText('Password'), 'abs-password');
    await user.click(screen.getByRole('button', { name: 'Sign in', exact: true }));
    await screen.findByText('Checkout resumed');
    expect(mocks.auth.login).toHaveBeenCalledWith({ email: 'ama@example.com', password: 'abs-password' });
    expect(mocks.auth.register).toHaveBeenCalledTimes(1);
  });

  it('uses login when navigating from the signup URL to the login URL', async () => {
    const user = userEvent.setup();
    mount('/signup?returnTo=%2Fcheckout');
    await user.click(screen.getByRole('link', { name: 'Header sign in' }));
    expect(screen.queryByLabelText('Full name')).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('Email'), 'ama@example.com');
    await user.type(screen.getByLabelText('Password'), 'abs-password');
    await user.click(screen.getByRole('button', { name: 'Sign in', exact: true }));
    await screen.findByText('Checkout resumed');
    expect(mocks.auth.login).toHaveBeenCalledTimes(1);
    expect(mocks.auth.register).not.toHaveBeenCalled();
  });

  it('verifies the ABS linking code and returns to checkout without exposing the challenge in the URL', async () => {
    const user = userEvent.setup();
    mocks.auth.login.mockRejectedValue(apiError('STOREFRONT_ABS_LINK_REQUIRED', { absLinkToken: 'link-proof' }, 'We sent a sign-in code.'));
    mount();
    await user.type(screen.getByLabelText('Email'), 'ama@example.com');
    await user.type(screen.getByLabelText('Password'), 'abs-password');
    await user.click(screen.getByRole('button', { name: 'Sign in', exact: true }));
    await screen.findByLabelText('Sign-in code');
    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument();
    expect(screen.getByTestId('location')).not.toHaveTextContent('link-proof');
    await user.type(screen.getByLabelText('Sign-in code'), '123456');
    await user.click(screen.getByRole('button', { name: 'Verify code and continue' }));
    await screen.findByText('Checkout resumed');
    expect(mocks.auth.verifyLoginOtp).toHaveBeenCalledWith({ email: 'ama@example.com', otp: '123456', absLinkToken: 'link-proof' });
    expect(mocks.auth.verifyEmail).not.toHaveBeenCalled();
  });

  it('returns an expired linking request to password sign-in', async () => {
    const user = userEvent.setup();
    mocks.auth.login.mockRejectedValue(apiError('STOREFRONT_ABS_LINK_REQUIRED', { absLinkToken: 'link-proof' }));
    mocks.auth.verifyLoginOtp.mockRejectedValue(apiError('STOREFRONT_ABS_LINK_EXPIRED', {}, 'Please sign in again.'));
    mount();
    await user.type(screen.getByLabelText('Email'), 'ama@example.com');
    await user.type(screen.getByLabelText('Password'), 'abs-password');
    await user.click(screen.getByRole('button', { name: 'Sign in', exact: true }));
    await user.type(await screen.findByLabelText('Sign-in code'), '123456');
    await user.click(screen.getByRole('button', { name: 'Verify code and continue' }));
    expect(await screen.findByLabelText('Password')).toHaveValue('');
    expect(screen.queryByLabelText('Sign-in code')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveValue('ama@example.com');
  });

  it('lets an online-store customer resume guest checkout without authenticating', async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole('link', { name: 'Continue as guest' }));
    await screen.findByText('Checkout resumed');
    expect(mocks.auth.login).not.toHaveBeenCalled();
    expect(mocks.auth.register).not.toHaveBeenCalled();
  });
});

describe('shopper sign-in on the app routes', () => {
  it('keeps the email, notice and checkout destination between /signup and /login', async () => {
    const user = userEvent.setup();
    mocks.auth.register.mockRejectedValue(apiError('STOREFRONT_ACCOUNT_EXISTS'));
    mountAppRoutes('/signup?returnTo=%2Fcheckout');
    await fillSignup(user);
    await screen.findByText(/You already have an account/);
    expect(screen.getByTestId('location')).toHaveTextContent('/login?returnTo=%2Fcheckout');
    expect(screen.getByLabelText('Email')).toHaveValue('ama@example.com');
    expect(screen.getByLabelText('Password')).toHaveValue('');
    await user.type(screen.getByLabelText('Password'), 'abs-password');
    await user.click(screen.getByRole('button', { name: 'Sign in', exact: true }));
    await screen.findByText('Guest checkout ready');
    expect(mocks.auth.login).toHaveBeenCalledWith({ email: 'ama@example.com', password: 'abs-password' });
  });

  it('keeps a destination passed as navigation state when switching between sign in and sign up', async () => {
    const user = userEvent.setup();
    mountAppRoutes('/start', <Route path="/start" element={<Navigate to="/login" replace state={{ returnTo: '/checkout' }} />} />);
    await user.click(await screen.findByRole('button', { name: 'Sign up' }));
    await fillSignup(user);
    await screen.findByText('Guest checkout ready');
    expect(screen.getByTestId('location')).toHaveTextContent('/checkout');
  });

  it('cancels a pending ABS link when the shopper goes back to their password', async () => {
    const user = userEvent.setup();
    mocks.auth.login.mockRejectedValueOnce(apiError('STOREFRONT_ABS_LINK_REQUIRED', { absLinkToken: 'link-proof' }, 'We sent a sign-in code.'));
    mountAppRoutes('/login?returnTo=%2Fcheckout');
    await user.type(await screen.findByLabelText('Email'), 'ama@example.com');
    await user.type(screen.getByLabelText('Password'), 'abs-password');
    await user.click(screen.getByRole('button', { name: 'Sign in', exact: true }));
    await screen.findByText(/We sent a sign-in code/);
    await user.click(screen.getByRole('button', { name: 'Use password instead' }));
    expect(screen.queryByText(/We sent a sign-in code/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Email me a sign-in code' }));
    await user.type(screen.getByLabelText('Sign-in code'), '123456');
    await user.click(screen.getByRole('button', { name: 'Verify code and continue' }));
    await screen.findByText('Guest checkout ready');
    expect(mocks.auth.verifyLoginOtp).toHaveBeenCalledWith({ email: 'ama@example.com', otp: '123456' });
  });

  it('shows an invalid login and stays on sign-in with the email kept', async () => {
    const user = userEvent.setup();
    mocks.auth.login.mockRejectedValue(apiError(undefined, {}, 'Invalid email or password.'));
    mountAppRoutes('/login?returnTo=%2Fcheckout');
    await user.type(await screen.findByLabelText('Email'), 'ama@example.com');
    await user.type(screen.getByLabelText('Password'), 'wrong-password');
    await user.click(screen.getByRole('button', { name: 'Sign in', exact: true }));
    await screen.findByText('Invalid email or password.');
    expect(screen.getByLabelText('Email')).toHaveValue('ama@example.com');
    expect(screen.getByTestId('location')).toHaveTextContent('/login?returnTo=%2Fcheckout');
  });
});

describe('marketplace shopper modal', () => {
  it('moves an existing account to sign-in, and drops the notice if they go back to sign up', async () => {
    mocks.mode.isSingleStoreMode = false;
    mocks.auth.authModal = { isOpen: true, mode: 'signup', intent: { returnTo: '/checkout' } };
    mocks.auth.register.mockRejectedValue(apiError('STOREFRONT_ACCOUNT_EXISTS'));
    const user = userEvent.setup();
    mount('/products', <ShopperAuthModal />);
    await user.type(screen.getByLabelText('Full name'), 'Ama Shopper');
    await user.type(screen.getByLabelText('Email'), 'ama@example.com');
    await user.type(screen.getByLabelText('Phone'), '0240000000');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.type(screen.getByLabelText('Password'), 'signup-password');
    await user.type(screen.getByLabelText('Confirm password'), 'signup-password');
    await user.click(screen.getByRole('button', { name: 'Create account and continue' }));
    await screen.findByText(/You already have an account/);
    expect(screen.getByLabelText('Email')).toHaveValue('ama@example.com');
    expect(screen.getByLabelText('Password')).toHaveValue('');
    await user.click(screen.getByRole('button', { name: 'Sign up' }));
    expect(screen.queryByText(/You already have an account/)).not.toBeInTheDocument();
  });

  it('drops the pending ABS link when the shopper goes back to sign-in', async () => {
    mocks.mode.isSingleStoreMode = false;
    mocks.auth.login.mockRejectedValueOnce(apiError('STOREFRONT_ABS_LINK_REQUIRED', { absLinkToken: 'link-proof' }, 'Check your email to connect ABS.'));
    const user = userEvent.setup();
    mount('/products', <ShopperAuthModal />);
    await user.type(screen.getByLabelText('Email'), 'ama@example.com');
    await user.type(screen.getByLabelText('Password'), 'abs-password');
    await user.click(screen.getByRole('button', { name: 'Sign in', exact: true }));
    await screen.findByText('Check your email to connect ABS.');
    await user.click(screen.getByRole('button', { name: 'Back to sign in' }));
    expect(screen.queryByText('Check your email to connect ABS.')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveValue('ama@example.com');
    expect(screen.getByLabelText('Password')).toHaveValue('');
  });

  it('uses login OTP verification for an ABS linking challenge', async () => {
    mocks.mode.isSingleStoreMode = false;
    mocks.auth.login.mockRejectedValue(apiError('STOREFRONT_ABS_LINK_REQUIRED', { absLinkToken: 'link-proof' }, 'Check your email to connect ABS.'));
    const user = userEvent.setup();
    mount('/products', <ShopperAuthModal />);
    await user.type(screen.getByLabelText('Email'), 'ama@example.com');
    await user.type(screen.getByLabelText('Password'), 'abs-password');
    await user.click(screen.getByRole('button', { name: 'Sign in', exact: true }));
    await screen.findByText('Check your email to connect ABS.');
    await user.type(screen.getByLabelText(/code/i), '123456');
    await user.click(screen.getByRole('button', { name: 'Verify and continue' }));
    await screen.findByText('Checkout resumed');
    expect(mocks.auth.verifyLoginOtp).toHaveBeenCalledWith({ email: 'ama@example.com', otp: '123456', absLinkToken: 'link-proof' });
    expect(mocks.auth.verifyEmail).not.toHaveBeenCalled();
  });
});

describe('checkout auth entry', () => {
  it('allows guest checkout on an online store', async () => {
    mount('/guest-checkout', <CheckoutRoute />);
    await screen.findByText('Guest checkout ready');
    expect(mocks.auth.openShopperAuthModal).not.toHaveBeenCalled();
  });

  it('offers sign-in first when marketplace checkout needs an account', async () => {
    mocks.mode.isSingleStoreMode = false;
    mount('/marketplace-checkout', <CheckoutRoute />);
    await waitFor(() => expect(mocks.auth.openShopperAuthModal).toHaveBeenCalledWith({
      mode: 'login', intent: { action: 'checkout', returnTo: '/marketplace-checkout' },
    }));
  });
});
