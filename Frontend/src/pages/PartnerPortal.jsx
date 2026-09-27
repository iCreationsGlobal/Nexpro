import { useEffect, useState } from 'react';
import { Building2, Users, Wallet, Headphones, Link as LinkIcon, LogOut, ArrowUpRight, Loader2 } from 'lucide-react';
import service, { partnerSession } from '../services/absPartnerPortalService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import AppLogo from '../components/AppLogo';
const money = (value, currency = 'GHS') => new Intl.NumberFormat('en-GH', {
  style: 'currency',
  currency
}).format((Number(value) || 0) / 100);
const date = value => value ? new Date(value).toLocaleDateString() : '—';
const errorText = error => error.response?.data?.message || 'Unable to complete this request. Please try again.';
const fieldClass = 'w-full rounded-lg border border-slate-200 bg-white p-3 text-sm';
function Field({
  label,
  name,
  type = 'text',
  required = false,
  ...props
}) {
  return <label className="block space-y-1.5 text-sm font-medium text-slate-700"><span>{label}</span><Input name={name} type={type} required={required} className="h-11" {...props} /></label>;
}
function Status({
  value
}) {
  return <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold capitalize text-emerald-800">{value}</span>;
}
function Table({
  headings,
  children,
  empty
}) {
  return <div className="overflow-x-auto rounded-xl border bg-white"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-slate-500"><tr>{headings.map(h => <th key={h} className="p-4 font-medium">{h}</th>)}</tr></thead><tbody className="divide-y">{children}</tbody></table>{empty && <p className="p-8 text-center text-slate-500">Nothing here yet.</p>}</div>;
}
const cell = 'p-4';
export default function PartnerPortal() {
  const [invitation, setInvitation] = useState(() => new URLSearchParams(window.location.hash.slice(1)).get('invite'));
  const [authenticated, setAuthenticated] = useState(Boolean(partnerSession.get()) && !invitation);
  const [data, setData] = useState(null);
  const [tab, setTab] = useState('overview');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const refresh = async () => {
    setLoading(true);
    try {
      setData(await service.overview());
    } catch (e) {
      setError(errorText(e));
      if ([401, 403].includes(e.response?.status)) {
        partnerSession.clear();
        setAuthenticated(false);
        setData(null);
      }
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    if (authenticated) void refresh();
  }, [authenticated]);
  const run = async action => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await action();
      await refresh();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const signIn = async event => {
    event.preventDefault();
    setBusy(true);
    setError('');
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const result = invitation ? await service.accept({
        token: invitation,
        password: values.password
      }) : await service.login(values);
      partnerSession.set(result.token);
      setInvitation(null);
      window.history.replaceState(null, '', '/partners');
      setAuthenticated(true);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const messages = <>{error && <div role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">{error}</div>}{notice && <div role="status" className="mb-4 rounded-xl bg-emerald-50 p-4 text-emerald-800">{notice}</div>}</>;
  if (!authenticated) return <main className="min-h-screen bg-slate-50 px-5 py-16 text-slate-900"><div className="mx-auto max-w-md"><div className="mb-8 flex items-center gap-3 text-xl font-bold"><AppLogo className="h-12 w-12" alt="ABS" />ABS Partners</div><div className="rounded-2xl border bg-white p-8 shadow-sm"><p className="text-xs font-semibold uppercase tracking-widest text-emerald-700">Grow with ABS</p><h1 className="mt-3 text-3xl font-bold">{invitation ? 'Welcome, partner.' : 'Your partner workspace.'}</h1><p className="mb-6 mt-3 text-slate-500">{invitation ? 'Set your password to accept your invitation.' : 'Sign in to manage referrals, businesses, and earnings.'}</p>{messages}<form onSubmit={signIn} className="space-y-5">{!invitation && <Field label="Email" name="email" type="email" autoComplete="username" required />}<Field label="Password" name="password" type="password" autoComplete={invitation ? 'new-password' : 'current-password'} minLength={invitation ? 12 : undefined} required />{invitation && <p className="text-xs text-slate-500">At least 12 characters.</p>}<Button disabled={busy} className="h-12 w-full bg-emerald-800 hover:bg-emerald-900">{busy ? 'Please wait…' : invitation ? 'Accept invitation' : 'Sign in'}</Button></form><p className="mt-6 text-xs text-slate-500">Need access or a password reset? Ask your ABS partner manager for a new invitation.</p></div></div></main>;
  const nav = [['overview', 'Overview', Building2], ['leads', 'Leads', Users], ['businesses', 'Businesses', Building2], ['commissions', 'Commissions', Wallet], ['payouts', 'Payouts', Wallet], ['support', 'Support', Headphones], ...(data?.account.role === 'distributor' ? [['team', 'Resellers', Users]] : [])];
  const leads = data?.records.filter(r => r.kind === 'lead') || [];
  const support = data?.records.filter(r => r.kind === 'support') || [];
  const payouts = data?.records.filter(r => r.kind === 'payout') || [];
  const due = data?.commissions.filter(c => c.status === 'due' && c.currency === 'GHS').reduce((sum, c) => sum + Number(c.amount), 0) || 0;
  const paid = data?.commissions.filter(c => c.status === 'paid' && c.currency === 'GHS').reduce((sum, c) => sum + Number(c.amount), 0) || 0;
  const createForm = (kind, fields) => <form className="space-y-4 rounded-xl border bg-white p-5" onSubmit={event => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    void run(async () => {
      await service.create({
        kind,
        ...values
      });
      form.reset();
      setNotice(kind === 'lead' ? 'Lead saved.' : 'Support request submitted.');
    });
  }}><h2 className="text-lg font-semibold">{kind === 'lead' ? 'Register a lead' : 'Ask ABS for help'}</h2>{fields}<Button disabled={busy}>Submit</Button></form>;
  return <main className="min-h-screen bg-slate-50 text-slate-900"><header className="border-b bg-white px-5 py-4"><div className="mx-auto flex max-w-7xl items-center justify-between gap-3"><div className="flex items-center gap-3 font-bold"><AppLogo className="h-10 w-10" alt="ABS" />ABS Partners</div><div className="flex items-center gap-3"><span className="hidden text-sm text-slate-500 sm:inline">{data?.name}</span><Button variant="ghost" onClick={async () => {
            try {
              await service.logout();
            } catch {
              // A network failure must not prevent local sign-out.
            } finally {
              partnerSession.clear();
              setAuthenticated(false);
              setData(null);
            }
          }}><LogOut className="mr-2 h-4 w-4" />Sign out</Button></div></div></header><div className="mx-auto grid max-w-7xl gap-7 px-4 py-7 md:grid-cols-[190px_1fr]"><nav className="flex gap-1 overflow-x-auto md:flex-col" aria-label="Partner navigation">{nav.map(([id, label, Icon]) => <button key={id} onClick={() => setTab(id)} className={`flex items-center gap-3 whitespace-nowrap rounded-lg px-4 py-3 text-left text-sm font-medium ${tab === id ? 'bg-emerald-900 text-white' : 'text-slate-600 hover:bg-white'}`}><Icon className="h-5 w-5" />{label}</button>)}</nav><section className="min-w-0"><div className="mb-6 flex items-center justify-between"><div><p className="text-xs font-semibold uppercase tracking-widest text-emerald-700">{data?.account.role || 'Partner'} workspace</p><h1 className="mt-1 text-3xl font-bold">{nav.find(n => n[0] === tab)?.[1]}</h1></div><Button variant="outline" disabled={loading} onClick={refresh}>Refresh</Button></div>{messages}{loading && !data ? <Loader2 className="animate-spin" /> : data && <>
    {tab === 'overview' && <><div className="grid gap-4 sm:grid-cols-3">{[['Referred businesses', data.businesses.length], ['Commission due', money(due)], ['Paid commissions', money(paid)]].map(([label, value]) => <div key={label} className="rounded-xl border bg-white p-5"><p className="text-sm text-slate-500">{label}</p><p className="mt-3 text-3xl font-bold">{value}</p></div>)}</div><div className="mt-6 rounded-xl border bg-white p-6"><h2 className="flex items-center gap-2 text-lg font-semibold"><LinkIcon className="h-5 w-5" />Your referral links</h2><p className="mt-2 text-sm text-slate-500">Share a link with a business owner. Their signup will carry your referral code.</p>{!data.codes.length && <p className="mt-4 text-sm">Ask ABS to activate a referral code.</p>}{data.codes.map(code => {
                const link = `${window.location.origin}/signup?code=${encodeURIComponent(code.code)}`;
                return <div key={code.id} className="mt-4 flex flex-wrap items-center gap-3 rounded-lg bg-slate-50 p-3"><span className="font-mono font-semibold">{code.code}</span><input aria-label={`Referral link ${code.code}`} className="min-w-0 flex-1 bg-transparent text-sm" value={link} readOnly /><Button variant="outline" onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(link);
                      setNotice('Referral link copied.');
                    } catch {
                      setError('Select and copy the referral link.');
                    }
                  }}>Copy link</Button></div>;
              })}<p className="mt-5 text-sm text-slate-500">Current commission: {data.commissionPercent != null ? `${data.commissionPercent}% of each successful subscription payment` : `${money(data.commissionAmount)} per qualifying subscription payment (existing agreement)`}, up to 3 payments per referred business.</p></div><div className="mt-5 rounded-xl bg-emerald-900 p-6 text-white"><h2 className="text-xl font-semibold">Help your next business get started</h2><p className="mt-2 text-emerald-100">Register the lead, share your link, then track their business here.</p><button className="mt-4 flex items-center gap-2 font-semibold" onClick={() => setTab('leads')}>Add a lead <ArrowUpRight className="h-4 w-4" /></button></div></>}
    {tab === 'leads' && <div className="space-y-5">{createForm('lead', <div className="grid gap-4 sm:grid-cols-2"><Field label="Business name" name="title" maxLength={200} required /><Field label="Contact name" name="contactName" /><Field label="Email" name="email" type="email" /><Field label="Phone" name="phone" /><Field label="Notes / next follow-up" name="notes" maxLength={4000} /></div>)}<Table headings={['Business', 'Contact', 'Stage', 'Created']} empty={!leads.length}>{leads.map(r => <tr key={r.id}><td className={cell}><strong>{r.title}</strong><p className="text-xs text-slate-500">{r.details.notes}</p></td><td className={cell}>{r.details.contactName}<p>{r.details.email || r.details.phone}</p></td><td className={cell}><select aria-label={`Stage for ${r.title}`} value={r.status} disabled={busy} className={fieldClass} onChange={e => run(() => service.update(r.id, {
                    status: e.target.value
                  }))}>{['new', 'contacted', 'onboarding', 'won', 'lost'].map(status => <option key={status}>{status}</option>)}</select></td><td className={cell}>{date(r.createdAt)}</td></tr>)}</Table></div>}
    {tab === 'businesses' && <><p className="mb-4 text-sm text-slate-500">Businesses attributed through your referral codes. Business records require a separate owner invitation.</p><Table headings={['Business', 'Plan', 'Status', 'Trial ends', 'Joined']} empty={!data.businesses.length}>{data.businesses.map(b => <tr key={b.id}><td className={cell}>{b.name}</td><td className={cell}>{b.plan}</td><td className={cell}><Status value={b.status} /></td><td className={cell}>{date(b.trialEndsAt)}</td><td className={cell}>{date(b.createdAt)}</td></tr>)}</Table></>}
    {tab === 'commissions' && <Table headings={['Business', 'Period', 'Amount', 'Status', 'Paid on']} empty={!data.commissions.length}>{data.commissions.map(c => <tr key={c.id}><td className={cell}>{data.businesses.find(b => b.id === c.tenantId)?.name || 'Referred business'}</td><td className={cell}>{c.periodNumber} / 3</td><td className={cell}>{money(c.amount, c.currency)}</td><td className={cell}><Status value={c.status} /></td><td className={cell}>{date(c.paidAt)}</td></tr>)}</Table>}
    {tab === 'payouts' && <div className="space-y-5"><form className="rounded-xl border bg-white p-5 space-y-4" onSubmit={e => {
              e.preventDefault();
              const values = Object.fromEntries(new FormData(e.currentTarget));
              run(async () => {
                await service.payoutDetails(values);
                setNotice('Payout details saved.');
              });
            }}><h2 className="text-lg font-semibold">Where should ABS pay you?</h2><div className="grid gap-4 sm:grid-cols-2"><label className="text-sm">Method<select name="method" defaultValue={data.payoutDetails.method || 'mobile_money'} className={fieldClass}><option value="mobile_money">Mobile money</option><option value="bank">Bank account</option></select></label><Field label="Bank or network" name="provider" defaultValue={data.payoutDetails.provider} required /><Field label="Account holder" name="accountName" defaultValue={data.payoutDetails.accountName} required /><Field label="Account / mobile number" name="accountNumber" defaultValue={data.payoutDetails.accountNumber} required /></div><Button disabled={busy}>Save payout details</Button></form><div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white p-5"><span>Due: <strong>{money(due)}</strong></span><Button disabled={busy || due <= 0 || payouts.some(p => p.status === 'pending')} onClick={() => run(async () => {
                await service.create({
                  kind: 'payout'
                });
                setNotice('Payout requested. ABS will review it.');
              })}>Request payout</Button></div><Table headings={['Requested', 'Amount', 'Status', 'Reference / response']} empty={!payouts.length}>{payouts.map(p => <tr key={p.id}><td className={cell}>{date(p.createdAt)}</td><td className={cell}>{money(p.details.amount)}</td><td className={cell}><Status value={p.status} /></td><td className={cell}>{p.history.at(-1)?.note || '—'}</td></tr>)}</Table></div>}
    {tab === 'support' && <div className="space-y-5">{createForm('support', <><Field label="Subject" name="title" required /><label className="block text-sm">Message<textarea name="message" required maxLength={4000} rows={4} className={fieldClass} /></label></>)}{support.map(r => <article key={r.id} className="rounded-xl border bg-white p-5"><div className="flex justify-between"><h2 className="font-semibold">{r.title}</h2><Status value={r.status} /></div><p className="mt-3 whitespace-pre-wrap text-sm">{r.details.message}</p>{r.history.filter(h => h.note).map((h, i) => <p key={i} className="mt-3 rounded-lg bg-slate-50 p-3 text-sm whitespace-pre-wrap"><strong>{h.actor}: </strong>{h.note}</p>)}{r.status === 'open' && <form className="mt-4 flex gap-2" onSubmit={e => {
                e.preventDefault();
                const form = e.currentTarget;
                const note = new FormData(form).get('note');
                run(async () => {
                  await service.update(r.id, {
                    note
                  });
                  form.reset();
                });
              }}><Input name="note" aria-label="Reply" placeholder="Add a reply" required maxLength={4000} /><Button disabled={busy}>Reply</Button></form>}</article>)}</div>}
    {tab === 'team' && <><p className="mb-4 text-sm text-slate-500">Your assigned resellers. Ask ABS support to invite or reassign a reseller.</p><Table headings={['Reseller', 'Email', 'Status', 'Referred businesses']} empty={!data.team.length}>{data.team.map(p => <tr key={p.id}><td className={cell}>{p.name}</td><td className={cell}>{p.email}</td><td className={cell}><Status value={p.status} /></td><td className={cell}>{p.businessCount}</td></tr>)}</Table></>}
  </>}</section></div></main>;
}
