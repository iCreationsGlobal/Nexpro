"use client";

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { changePassword, closeAccount, clearAuth } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function AccountSecurity() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [closePassword, setClosePassword] = useState('');
  const [acknowledgement, setAcknowledgement] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent, closing = false) {
    event.preventDefault();
    if (busy) return;
    setError('');
    if (!closing && password !== confirm) { setError('Passwords do not match.'); return; }
    if (closing && acknowledgement !== 'CLOSE') { setError('Type CLOSE to confirm account closure.'); return; }
    setBusy(true);
    try {
      if (closing) await closeAccount(closePassword);
      else await changePassword({ currentPassword, password });
      clearAuth();
      router.replace('/login');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update your account.');
    } finally { setBusy(false); }
  }

  return <section className="space-y-6 rounded-2xl border border-brand-200 bg-white p-4">
    <form onSubmit={event => submit(event)} className="space-y-3">
      <h2 className="font-semibold">Change password</h2>
      <p className="text-sm text-brand-600">You will need to sign in again after changing your password.</p>
      <label className="block text-sm">Current password<Input type="password" required autoComplete="current-password" value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} /></label>
      <label className="block text-sm">New password<Input type="password" required minLength={8} maxLength={128} autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} /></label>
      <label className="block text-sm">Confirm new password<Input type="password" required autoComplete="new-password" value={confirm} onChange={event => setConfirm(event.target.value)} /></label>
      <Button disabled={busy}>{busy ? 'Please wait…' : 'Change password'}</Button>
    </form>
    <details className="border-t pt-4">
      <summary className="cursor-pointer font-semibold text-red-700">Close account</summary>
      <form onSubmit={event => submit(event, true)} className="mt-3 space-y-3">
        <p className="text-sm text-brand-600">Closing your account revokes access. Financial records are retained for outstanding settlements.</p>
        <label className="block text-sm">Current password<Input type="password" required autoComplete="current-password" value={closePassword} onChange={event => setClosePassword(event.target.value)} /></label>
        <label className="block text-sm">Type CLOSE to confirm<Input required pattern="CLOSE" autoComplete="off" value={acknowledgement} onChange={event => setAcknowledgement(event.target.value)} /></label>
        <Button variant="outline" disabled={busy || acknowledgement !== 'CLOSE'}>Close my account</Button>
      </form>
    </details>
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
  </section>;
}
