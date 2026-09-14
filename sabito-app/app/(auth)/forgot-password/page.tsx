"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { requestPasswordReset, resetPassword } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function PasswordRecoveryPage() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [step, setStep] = useState<"request" | "reset" | "done">("request");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError("");
    if (step === "reset" && password !== confirm) { setError("Passwords do not match."); return; }
    setBusy(true);
    try {
      const response = step === "request"
        ? await requestPasswordReset(email.trim())
        : await resetPassword({ email: email.trim(), code: code.trim(), password });
      setMessage(response.data.message);
      setStep(step === "request" ? "reset" : "done");
      setPassword(""); setConfirm("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to reset your password. Please try again.");
    } finally { setBusy(false); }
  }

  return <form onSubmit={submit} className="space-y-4">
    <h1 className="text-2xl font-bold">Reset your password</h1>
    {message && <p role="status" className="text-sm">{message}</p>}
    {step !== "done" && <>
      <label className="block space-y-1">Email<Input type="email" autoComplete="email" required disabled={busy || step === "reset"} value={email} onChange={e => setEmail(e.target.value)} /></label>
      {step === "reset" && <>
        <label className="block space-y-1">Reset code<Input required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={e => setCode(e.target.value)} /></label>
        <label className="block space-y-1">New password<Input type="password" autoComplete="new-password" required minLength={8} maxLength={128} value={password} onChange={e => setPassword(e.target.value)} /></label>
        <label className="block space-y-1">Confirm password<Input type="password" autoComplete="new-password" required value={confirm} onChange={e => setConfirm(e.target.value)} /></label>
      </>}
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <Button className="w-full" disabled={busy}>{busy ? "Please wait…" : step === "request" ? "Send reset code" : "Reset password"}</Button>
      {step === "reset" && <button type="button" disabled={busy} onClick={() => { setStep("request"); setMessage(""); setError(""); setCode(""); }} className="text-sm underline">Use another email or request a new code</button>}
    </>}
    <Link href="/login" className="block text-sm underline">Back to sign in</Link>
  </form>;
}
