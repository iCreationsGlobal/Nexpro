import { useEffect, useState } from 'react';
import api from '../../services/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
export default function PartnerPortalDesk({
  agents,
  canInvite,
  canManageBilling
}) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState({
    accounts: [],
    records: []
  });
  const [error, setError] = useState('');
  const [invitation, setInvitation] = useState('');
  const [busy, setBusy] = useState(false);
  const load = async () => {
    try {
      const res = await api.get('/admin/partner-portal');
      const result = res.data?.data || res.data || res;
      if (canManageBilling) {
        const payouts = await api.get('/admin/partner-portal/payouts');
        result.records = [...result.records, ...(payouts.data?.data || payouts.data || payouts)];
      }
      setData(result);
    } catch (e) {
      setError(e.response?.data?.message || 'Could not load partner accounts. Check that the portal migration has run.');
    }
  };
  useEffect(() => {
    if (open) void load();
  }, [open]);
  const update = async (id, status, note, kind) => {
    setBusy(true);
    setError('');
    try {
      await api.patch(`/admin/partner-portal/${kind === 'support' ? 'support' : 'records'}/${id}`, {
        status,
        note
      });
      await load();
    } catch (e) {
      setError(e.response?.data?.message || 'Update failed.');
    } finally {
      setBusy(false);
    }
  };
  return <section className="rounded-xl border bg-card p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">ABS Partner Portal</h2><p className="text-sm text-muted-foreground">Invite resellers and distributors, answer requests, and record payouts.</p></div><Button variant="outline" onClick={() => setOpen(!open)}>{open ? 'Close partner desk' : 'Open partner desk'}</Button></div>{open && <div className="mt-5 space-y-5">{error && <p role="alert" className="text-red-700">{error}</p>}{canInvite && <form className="grid gap-3 sm:grid-cols-2" onSubmit={async e => {
        e.preventDefault();
        const values = Object.fromEntries(new FormData(e.currentTarget));
        setBusy(true);
        setError('');
        setInvitation('');
        try {
          const res = await api.post(`/admin/sales-agents/${values.agentId}/portal-invitation`, {
            role: values.role,
            distributorId: values.distributorId || null
          });
          const result = res.data?.data || res.data || res;
          setInvitation(`${window.location.origin}/partners#invite=${result.token}`);
          await load();
        } catch (err) {
          setError(err.response?.data?.message || 'Could not create invitation.');
        } finally {
          setBusy(false);
        }
      }}><label className="text-sm">Active agent (current list)<select name="agentId" required className="mt-1 w-full rounded-md border bg-background p-2"><option value="">Choose an agent</option>{agents.filter(a => a.status === 'active').map(a => <option key={a.id} value={a.id}>{a.name} — {a.email || 'Email required'}</option>)}</select></label><label className="text-sm">Partner role<select name="role" className="mt-1 w-full rounded-md border bg-background p-2"><option value="reseller">Reseller</option><option value="distributor">Distributor</option></select></label><label className="text-sm">Assign reseller to distributor<select name="distributorId" className="mt-1 w-full rounded-md border bg-background p-2"><option value="">Independent partner</option>{data.accounts.filter(a => a.role === 'distributor' && a.status === 'active').map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label><div className="self-end"><Button disabled={busy}>Generate invitation / reset access</Button></div><p className="text-xs text-muted-foreground sm:col-span-2">Invitation links expire after 72 hours. Reissuing a link resets the partner’s password and signs them out. Share the link directly with the intended partner.</p></form>}{invitation && <label className="block text-sm font-medium">Invitation link<Input readOnly value={invitation} onFocus={e => e.target.select()} className="mt-2" /><span className="text-xs text-muted-foreground">Generated for you to share; no email has been sent.</span></label>}<div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{['Partner', 'Role', 'Distributor', 'Status'].map(h => <th key={h} className="p-2">{h}</th>)}</tr></thead><tbody>{data.accounts.map(a => <tr key={a.id} className="border-t"><td className="p-2">{a.name}<p className="text-xs text-muted-foreground">{a.email}</p></td><td className="p-2">{a.role}</td><td className="p-2">{data.accounts.find(p => p.id === a.distributorId)?.name || '—'}</td><td className="p-2">{a.status}</td></tr>)}</tbody></table></div><h3 className="font-semibold">Support and payout requests</h3>{data.records.filter(r => ['support', 'payout'].includes(r.kind) && r.status !== 'closed').map(r => <article key={r.id} className="rounded-lg border p-4"><div className="flex justify-between"><strong>{r.title}</strong><span className="text-sm">{r.status}</span></div><p className="text-sm text-muted-foreground">{data.accounts.find(a => a.id === r.partnerId)?.name}</p>{r.kind === 'payout' ? <div className="mt-2 text-sm"><p>GHS {(r.details.amount / 100).toFixed(2)}</p><p>{r.details.payoutDetails?.provider} · {r.details.payoutDetails?.accountName} · {r.details.payoutDetails?.accountNumber}</p><p className="mt-2 text-muted-foreground">Pay through your normal payment process, then record the reference here. This action does not transfer money.</p></div> : <p className="mt-2 whitespace-pre-wrap text-sm">{r.details.message}</p>}{r.history.filter(h => h.note).map((h, i) => <p key={i} className="mt-2 text-sm"><strong>{h.actor}:</strong> {h.note}</p>)}{(r.kind === 'support' ? canInvite : canManageBilling) && !['paid', 'rejected'].includes(r.status) && <form className="mt-3 flex flex-wrap gap-2" onSubmit={e => {
          e.preventDefault();
          const values = Object.fromEntries(new FormData(e.currentTarget));
          update(r.id, values.status, values.note, r.kind);
        }}><Input name="note" aria-label="Reply or payment reference" placeholder={r.kind === 'payout' ? 'Payment reference / reason' : 'Reply to partner'} required className="min-w-48 flex-1" /><select name="status" className="rounded-md border bg-background p-2">{(r.kind === 'payout' ? ['paid', 'rejected'] : ['open', 'closed']).map(s => <option key={s}>{s}</option>)}</select><Button disabled={busy}>Save</Button></form>}</article>)}<a href="/partners" target="_blank" rel="noreferrer" className="text-sm font-medium text-primary underline">Open Partner Portal</a></div>}</section>;
}
