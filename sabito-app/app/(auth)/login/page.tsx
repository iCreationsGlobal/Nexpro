"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";
import { loginMarketer, persistAuth } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { accountDestination } from "@/lib/workspace";
import { ABS_SITE_URL } from "@/lib/constants";

function LoginForm() {
  const router = useRouter();
  const search = useSearchParams();
  const requestedNext = search.get("next") || "/dashboard";
  const next = accountDestination(requestedNext);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await loginMarketer({ email, password });
      persistAuth(res.data.token);
      router.push(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Welcome</h1>
        <p className="mt-1 text-sm text-slate-500">Sign in to your Sabito marketer account</p>
      </div>
      <div className="space-y-1.5">
        <label className="text-sm font-medium">Email</label>
        <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <label className="text-sm font-medium">Password</label>
        <Input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Signing in…" : "Sign in"}
      </Button>
      <p className="text-center text-sm text-slate-500">
        New to Sabito?{" "}
        <Link href={`/signup?next=${encodeURIComponent(next)}`} className="text-[var(--sabito-teal)]">
          Create an account
        </Link>
      </p>
      <p className="text-center text-sm text-slate-500">
        Business account?{" "}
        <a href={ABS_SITE_URL} className="text-[var(--sabito-green)]">Continue to ABS</a>
      </p>
    </form>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<p className="text-sm text-slate-500">Loading…</p>}>
      <LoginForm />
    </Suspense>
  );
}
