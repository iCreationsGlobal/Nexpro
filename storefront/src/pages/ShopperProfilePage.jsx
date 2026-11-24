import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Camera, Loader2, LogOut, Trash2, Upload } from 'lucide-react';

import { useStorefrontAuth } from '../context/StorefrontAuthContext';
import { useStorefrontMode } from '../context/StorefrontModeContext';
import { resolveSingleStoreHomePath } from '../online-store/storePaths';
import { showError, showSuccess } from '../utils/toast';
import { getCustomerAvatarUrl, getCustomerInitials } from '../utils/avatarUtils';
import AccountLayout from '../components/storefront/AccountLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const AVATAR_MAX_SIZE_MB = 2;
const AVATAR_ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

const ShopperProfilePage = () => {
  const { key: locationKey } = useLocation();
  const {
    isSingleStoreMode,
    storeSlug: modeSlug,
    pathPrefix,
    isCustomDomain,
  } = useStorefrontMode();
  const { customer, logout, removeAvatar, updateProfile, uploadAvatar } = useStorefrontAuth();
  const shopHomePath = isSingleStoreMode
    ? resolveSingleStoreHomePath({ storeSlug: modeSlug, pathPrefix, isCustomDomain })
    : '/';
  const shopBrowsePath = isSingleStoreMode
    ? (isCustomDomain || shopHomePath === '/' ? '/products' : `${shopHomePath}/products`)
    : '/products';
  const [form, setForm] = useState({ name: '', phone: '' });
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState('');
  const [removeAvatarRequested, setRemoveAvatarRequested] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const customerAvatarUrl = useMemo(() => getCustomerAvatarUrl(customer), [customer]);
  const avatarUrl = removeAvatarRequested ? '' : (avatarPreview || customerAvatarUrl);
  const initials = useMemo(() => getCustomerInitials(customer), [customer]);

  useEffect(() => {
    setForm({
      name: customer?.name || '',
      phone: customer?.phone || '',
    });
  }, [customer]);

  useEffect(() => {
    if (!avatarFile) {
      setAvatarPreview('');
      return undefined;
    }

    const previewUrl = URL.createObjectURL(avatarFile);
    setAvatarPreview(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [avatarFile]);

  const handleSubmit = useCallback(async (event) => {
    event.preventDefault();
    setIsSubmitting(true);
    try {
      await updateProfile({
        name: form.name,
        phone: form.phone,
      });
      if (avatarFile) {
        await uploadAvatar(avatarFile);
      } else if (removeAvatarRequested && customerAvatarUrl) {
        await removeAvatar();
      }
      setAvatarFile(null);
      setRemoveAvatarRequested(false);
      showSuccess('Profile updated successfully.');
    } catch (error) {
      showError(error, 'Failed to update profile.');
    } finally {
      setIsSubmitting(false);
    }
  }, [avatarFile, customerAvatarUrl, form.name, form.phone, removeAvatar, removeAvatarRequested, updateProfile, uploadAvatar]);

  const handleAvatarChange = useCallback((event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    if (!AVATAR_ALLOWED_TYPES.has(file.type)) {
      showError('Choose a JPG, PNG, WebP, or GIF image.');
      return;
    }

    if (file.size > AVATAR_MAX_SIZE_MB * 1024 * 1024) {
      showError(`Avatar image must be ${AVATAR_MAX_SIZE_MB}MB or smaller.`);
      return;
    }

    setAvatarFile(file);
    setRemoveAvatarRequested(false);
  }, []);

  const handleRemoveAvatar = useCallback(() => {
    setAvatarFile(null);
    setRemoveAvatarRequested(true);
  }, []);

  const handleLogout = useCallback(() => {
    logout({ redirectTo: '/login', locationKey });
  }, [locationKey, logout]);

  return (
    <AccountLayout
      title="Profile"
      description="Manage the safe profile details sellers use for checkout and order communication."
    >
      <section className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
        <aside className="rounded-2xl border border-[color:color-mix(in_srgb,var(--store-accent,#166534)_28%,white)] bg-white p-6 sm:rounded-[2rem]">
          <div className="flex items-center gap-4">
            <span className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl border border-[color:color-mix(in_srgb,var(--store-accent,#166534)_28%,white)] bg-[var(--store-accent-soft,#f0fdf4)] text-xl font-black text-[color:color-mix(in_srgb,var(--store-accent,#166534)_85%,black)] sm:rounded-3xl">
              {avatarUrl ? (
                <img src={avatarUrl} alt={`${customer?.name || 'Shopper'} avatar`} className="h-full w-full object-cover" />
              ) : initials}
            </span>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[color:var(--store-accent,#166534)]">Avatar</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">JPG, PNG, WebP, or GIF up to {AVATAR_MAX_SIZE_MB}MB.</p>
            </div>
          </div>
          <h1 className="mt-5 text-3xl font-black text-slate-950">Shopper profile</h1>
          <p className="mt-3 text-sm leading-6 text-slate-500">
            Manage the safe profile details sellers use for checkout and order communication.
          </p>
          <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm">
            <p className="font-bold text-slate-900">{customer?.name || 'Shopper'}</p>
            <p className="mt-1 text-slate-500">{customer?.email}</p>
            {!customer?.phone ? (
              <p className="mt-2 text-xs font-semibold text-amber-700">
                Add a phone number so sellers can contact you about deliveries.
              </p>
            ) : null}
            <p className="mt-2 text-xs font-semibold text-[color:color-mix(in_srgb,var(--store-accent,#166534)_85%,black)]">
              {customer?.isEmailVerified ? 'Email verified' : 'Email verification pending'}
            </p>
          </div>
        </aside>

        <form onSubmit={handleSubmit} className="rounded-2xl border border-slate-200 bg-white p-6 sm:rounded-[2rem] md:p-8">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-[color:var(--store-accent,#166534)]">Account details</p>
            <h2 className="mt-2 text-2xl font-black text-slate-950">Edit profile</h2>
          </div>
          <div className="mt-6 grid gap-4">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:rounded-3xl">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-4">
                  <span className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl border border-[color:color-mix(in_srgb,var(--store-accent,#166534)_28%,white)] bg-white text-lg font-black text-[color:color-mix(in_srgb,var(--store-accent,#166534)_85%,black)]">
                    {avatarUrl ? (
                      <img src={avatarUrl} alt="Avatar preview" className="h-full w-full object-cover" />
                    ) : initials}
                  </span>
                  <div>
                    <p className="text-sm font-bold text-slate-900">Profile picture</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {avatarFile ? avatarFile.name : removeAvatarRequested ? 'Avatar will be removed when you save.' : 'Shown in your shopper account menu.'}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button asChild type="button" variant="outline" className="rounded-full border-[color:color-mix(in_srgb,var(--store-accent,#166534)_28%,white)] text-[color:color-mix(in_srgb,var(--store-accent,#166534)_85%,black)] hover:bg-[var(--store-accent-soft,#16653422)]">
                    <label htmlFor="avatar">
                      <Upload className="mr-2 h-4 w-4" />
                      {avatarUrl ? 'Change' : 'Upload'}
                    </label>
                  </Button>
                  <input
                    id="avatar"
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    className="sr-only"
                    onChange={handleAvatarChange}
                  />
                  {avatarUrl || customerAvatarUrl ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-full border-rose-200 text-rose-700 hover:bg-rose-50"
                      onClick={handleRemoveAvatar}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Remove
                    </Button>
                  ) : null}
                </div>
              </div>
              <p className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-slate-500">
                <Camera className="h-4 w-4 text-[color:var(--store-accent,#166534)]" />
                Save profile to apply avatar changes.
              </p>
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-semibold text-slate-700" htmlFor="name">Full name</label>
              <Input
                id="name"
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                autoComplete="name"
                minLength={2}
                required
              />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-semibold text-slate-700" htmlFor="phone">Phone</label>
              <Input
                id="phone"
                value={form.phone}
                onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
                autoComplete="tel"
                required
              />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-semibold text-slate-700" htmlFor="email">Email</label>
              <Input id="email" value={customer?.email || ''} disabled />
              <p className="text-xs text-slate-500">Email changes are not available for shopper accounts yet.</p>
            </div>
          </div>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-between">
            {isSingleStoreMode ? null : (
              <Button
                type="button"
                variant="outline"
                className="rounded-full border-slate-200 text-slate-700 hover:bg-slate-50"
                onClick={handleLogout}
              >
                <LogOut className="mr-2 h-4 w-4" />
                Sign out
              </Button>
            )}
            <div className="flex flex-col gap-3 sm:ml-auto sm:flex-row">
              <Button asChild type="button" variant="outline" className="rounded-full border-[color:color-mix(in_srgb,var(--store-accent,#166534)_28%,white)] text-[color:color-mix(in_srgb,var(--store-accent,#166534)_85%,black)] hover:bg-[var(--store-accent-soft,#16653422)]">
                <Link to={shopBrowsePath}>{isSingleStoreMode ? 'Back to shop' : 'Continue shopping'}</Link>
              </Button>
              <Button type="submit" className="rounded-full bg-[var(--store-accent,#166534)] text-white hover:bg-[var(--store-accent-hover,color-mix(in_srgb,var(--store-accent,#166534)_85%,black))]" disabled={isSubmitting}>
                {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Save profile
              </Button>
            </div>
          </div>
        </form>
      </section>
    </AccountLayout>
  );
};

export default ShopperProfilePage;
