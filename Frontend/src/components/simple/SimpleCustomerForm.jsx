import { useEffect, useState } from 'react';
import { Loader2, Mail, MessageCircle, Phone, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { formatAmount } from '../../utils/formatNumber';
import { formatDisplayPhone, normalizePhone } from '../../utils/phoneUtils';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const Field = ({ icon: Icon, label, children }) => (
  <label className="block">
    <span className="text-base font-semibold">{label}</span>
    <span className="mt-2 flex h-16 items-center gap-3 rounded-2xl border-2 border-border bg-card px-5 focus-within:ring-2 focus-within:ring-brand">
      <Icon className="h-6 w-6 shrink-0 text-muted-foreground" />
      {children}
    </span>
  </label>
);

/**
 * Simple Mode customer form: name, phone and (optional) email. Opening an existing customer
 * also shows what they owe and one-tap Call / WhatsApp buttons.
 *
 * @param {{
 *   open: boolean,
 *   onOpenChange: (open: boolean) => void,
 *   customer?: { name?: string, phone?: string, email?: string, balance?: number|string } | null,
 *   saving?: boolean,
 *   onSave: (values: { name: string, phone: string, email: string }) => void,
 * }} props
 */
export default function SimpleCustomerForm({ open, onOpenChange, customer = null, saving = false, onSave }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setName(customer?.name || '');
    setPhone(customer?.phone ? formatDisplayPhone(customer.phone) : '');
    setEmail(customer?.email || '');
    setError('');
  }, [open, customer]);

  const owes = parseFloat(customer?.balance || 0);
  const dialPhone = normalizePhone(formatDisplayPhone(customer?.phone || ''));
  const whatsappNumber = dialPhone.replace(/\D/g, '');

  const handleSave = () => {
    if (name.trim().length < 2) return setError("Enter the customer's name.");
    if (email.trim() && !EMAIL_PATTERN.test(email.trim())) return setError('That email does not look right.');
    onSave({ name: name.trim(), phone: phone.trim(), email: email.trim() });
    return undefined;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[95dvh] w-[calc(100vw-1.5rem)] max-w-xl gap-5 overflow-y-auto rounded-3xl p-5 sm:gap-6 sm:p-8">
        <DialogTitle className="pr-8 text-2xl font-bold sm:text-3xl">{customer ? customer.name || 'Customer' : 'Add Customer'}</DialogTitle>
        <DialogDescription className="sr-only">Customer name, phone and email.</DialogDescription>

        {customer ? (
          <div className="space-y-3">
            {owes > 0 ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4">
                <p className="text-sm font-semibold uppercase text-amber-700">Owes you</p>
                <p className="text-3xl font-bold text-amber-900">{formatAmount(owes)}</p>
              </div>
            ) : null}
            {dialPhone ? (
              <div className="grid grid-cols-2 gap-3">
                <Button asChild variant="outline" className="h-14 rounded-2xl text-base font-semibold">
                  <a href={`tel:${dialPhone}`}><Phone className="mr-2 h-5 w-5" />Call</a>
                </Button>
                <Button asChild className="h-14 rounded-2xl bg-[#25D366] text-base font-semibold text-white hover:bg-[#1fb457]">
                  <a href={`https://wa.me/${whatsappNumber}`} target="_blank" rel="noreferrer"><MessageCircle className="mr-2 h-5 w-5" />WhatsApp</a>
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}

        <Field icon={User} label="Name">
          <input
            value={name}
            onChange={(e) => { setName(e.target.value); setError(''); }}
            placeholder="e.g. Ama Mensah"
            aria-label="Name"
            className="h-full w-full min-w-0 bg-transparent text-lg outline-none"
          />
        </Field>
        <Field icon={Phone} label="Phone">
          <input
            type="tel"
            inputMode="tel"
            value={phone}
            onChange={(e) => { setPhone(e.target.value); setError(''); }}
            placeholder="e.g. 024 123 4567"
            aria-label="Phone"
            className="h-full w-full min-w-0 bg-transparent text-lg outline-none"
          />
        </Field>
        <Field icon={Mail} label="Email (optional)">
          <input
            type="email"
            inputMode="email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setError(''); }}
            placeholder="e.g. ama@gmail.com"
            aria-label="Email"
            className="h-full w-full min-w-0 bg-transparent text-lg outline-none"
          />
        </Field>

        {error ? <p role="alert" className="text-base font-semibold text-red-700">{error}</p> : null}

        <Button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="mt-1 h-16 w-full rounded-2xl bg-brand px-6 text-xl font-bold text-white hover:bg-brand-dark"
        >
          {saving ? <Loader2 className="mr-3 h-6 w-6 animate-spin" /> : null}
          {customer ? 'Save changes' : 'Save customer'}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
