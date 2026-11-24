import { useCallback, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import QRCode from 'qrcode';
import { Loader2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { WhatsAppIcon } from '@/components/ui/WhatsAppIcon';
import { useAuth } from '../../../context/AuthContext';
import absWhatsAppService from '../../../services/absWhatsAppService';
import { showError, showSuccess } from '../../../utils/toast';

/** While the person is in WhatsApp sending the message, this looks for the connection. */
const LOOK_EVERY_MS = 3000;

/** A PIN typed twice. */
const PinForm = ({ button, saving, onSave, onCancel }) => {
  const [pin, setPin] = useState('');
  const [again, setAgain] = useState('');
  const [problem, setProblem] = useState('');

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!/^\d{4,6}$/.test(pin)) return setProblem('Choose a PIN of 4 to 6 digits.');
    if (pin !== again) return setProblem('The two PINs are not the same.');
    setProblem('');
    return onSave(pin);
  };

  const field = (id, label, value, change) => (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="password"
        inputMode="numeric"
        autoComplete="new-password"
        maxLength={6}
        value={value}
        onChange={(event) => change(event.target.value.replace(/\D/g, ''))}
      />
    </div>
  );

  return (
    <form onSubmit={handleSubmit} className="grid max-w-md gap-4">
      {field('abs-whatsapp-pin', 'PIN', pin, setPin)}
      {field('abs-whatsapp-pin-again', 'PIN again', again, setAgain)}
      <p className="text-xs text-muted-foreground md:text-sm">Asked once a day. Don&apos;t use your mobile money PIN.</p>
      {problem ? <p role="alert" className="text-sm font-medium text-destructive">{problem}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={saving}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          {button}
        </Button>
        {onCancel ? <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button> : null}
      </div>
    </form>
  );
};

/** The message to send from their WhatsApp: opened here on a phone, scanned from a computer. */
const SendStep = ({ step, onRestart }) => {
  const [qr, setQr] = useState('');
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    let left = false;
    QRCode.toDataURL(step.chatUrl, { width: 320, margin: 2 }).then((url) => { if (!left) setQr(url); }).catch(() => {});
    const timer = setTimeout(() => setExpired(true), Math.max(0, new Date(step.expiresAt).getTime() - Date.now()));
    return () => { left = true; clearTimeout(timer); };
  }, [step]);

  if (expired) {
    return (
      <div className="grid gap-3">
        <p className="text-sm">That message has expired.</p>
        <div><Button type="button" onClick={onRestart}>Start again</Button></div>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <p className="text-sm md:text-base">Open WhatsApp and send the message that&apos;s ready there:</p>
      <p className="w-fit rounded-md bg-muted px-3 py-2 font-mono text-sm md:text-base">{step.words}</p>
      <div>
        <Button asChild className="hover:text-primary-foreground">
          <a href={step.chatUrl} target="_blank" rel="noopener noreferrer">
            <WhatsAppIcon className="mr-2 h-4 w-4" />
            Open WhatsApp
          </a>
        </Button>
      </div>
      {qr ? (
        <div className="hidden lg:block">
          <p className="mb-2 text-sm text-muted-foreground">Or scan this with your phone:</p>
          <img src={qr} alt="QR code that opens WhatsApp with the message" className="h-40 w-40 rounded-md border border-border" />
        </div>
      ) : null}
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Waiting for your message. It works for 15 minutes.
      </p>
      <div><Button type="button" variant="outline" onClick={onRestart}>Start again</Button></div>
    </div>
  );
};

/**
 * ABS on WhatsApp: connect the signed-in owner's or manager's own WhatsApp, their PIN, and which business and shop it
 * answers about.
 */
const SettingsAbsWhatsAppSection = () => {
  const { activeTenant } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = ['abs-whatsapp', activeTenant?.id];
  const [step, setStep] = useState(null);
  const [changingPin, setChangingPin] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const { data: status, isPending, isError, refetch } = useQuery({
    queryKey,
    queryFn: absWhatsAppService.getStatus,
    refetchInterval: step ? LOOK_EVERY_MS : false,
  });
  const keep = useCallback((next) => queryClient.setQueryData(['abs-whatsapp', activeTenant?.id], (was) => ({ ...was, ...next })), [queryClient, activeTenant?.id]);

  useEffect(() => {
    if (!step || !status?.connected) return;
    setStep(null);
    showSuccess('WhatsApp connected.');
  }, [step, status?.connected]);

  const connect = useMutation({ mutationFn: absWhatsAppService.connect, onSuccess: setStep, onError: (error) => showError(error, 'Could not start connecting.') });
  const changePin = useMutation({
    mutationFn: absWhatsAppService.changePin,
    onSuccess: (next) => { keep(next); setChangingPin(false); showSuccess('PIN changed. ABS will ask for it next time.'); },
    onError: (error) => showError(error, 'Could not change the PIN.'),
  });
  const pointHere = useMutation({ mutationFn: absWhatsAppService.useHere, onSuccess: (next) => { keep(next); showSuccess('Changed.'); }, onError: (error) => showError(error, 'Could not change it.') });
  const disconnect = useMutation({
    mutationFn: absWhatsAppService.disconnect,
    onSuccess: () => { setLeaving(false); refetch(); showSuccess('WhatsApp disconnected.'); },
    onError: (error) => showError(error, 'Could not disconnect.'),
  });

  if (isPending) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (isError) {
    return (
      <div className="grid justify-items-start gap-3">
        <p className="text-sm">Could not load this.</p>
        <Button type="button" variant="outline" onClick={() => refetch()}>Try again</Button>
      </div>
    );
  }
  if (!status?.available) return <Alert><AlertDescription>ABS on WhatsApp isn&apos;t available yet.</AlertDescription></Alert>;

  if (!status.connected) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{step ? 'Send the message' : 'Connect your WhatsApp'}</CardTitle>
          {step ? null : (
            <CardDescription>
              Ask about today&apos;s sales, who owes you, stock and profit, by text or voice note. Lynk AI answers from this
              business&apos;s records. Typed and spoken questions use your Lynk credit; the menu is free.
            </CardDescription>
          )}
        </CardHeader>
        <CardContent>
          {step
            ? <SendStep step={step} onRestart={() => setStep(null)} />
            : <PinForm button="Continue" saving={connect.isPending} onSave={(pin) => connect.mutate(pin)} />}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Connected</CardTitle>
        <CardDescription>The WhatsApp number ending {status.phoneEnding}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        <div>
          <p className="text-sm text-muted-foreground">Answers about</p>
          <p className="font-medium">{[status.businessName, status.shopName].filter(Boolean).join(', ')}</p>
          {status.here ? null : (
            <Button type="button" variant="outline" className="mt-2" disabled={pointHere.isPending} onClick={() => pointHere.mutate()}>
              Answer about what I have open now
            </Button>
          )}
        </div>
        {status.pinLocked ? <Alert><AlertDescription>Locked after 5 wrong PINs. Set a new PIN to carry on now.</AlertDescription></Alert> : null}
        {changingPin
          ? <PinForm button="Save PIN" saving={changePin.isPending} onSave={(pin) => changePin.mutate(pin)} onCancel={() => setChangingPin(false)} />
          : (
            <div className="flex flex-wrap gap-2">
              <Button asChild className="hover:text-primary-foreground">
                <a href={status.chatUrl} target="_blank" rel="noopener noreferrer">
                  <WhatsAppIcon className="mr-2 h-4 w-4" />
                  Open WhatsApp
                </a>
              </Button>
              <Button type="button" variant="outline" onClick={() => setChangingPin(true)}>Change PIN</Button>
              <Button type="button" variant="outline" onClick={() => setLeaving(true)}>Disconnect</Button>
            </div>
          )}
      </CardContent>
      <AlertDialog open={leaving} onOpenChange={setLeaving}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect your WhatsApp?</AlertDialogTitle>
            <AlertDialogDescription>ABS will stop answering the number ending {status.phoneEnding}. You can connect it again any time.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction loading={disconnect.isPending} onClick={(event) => { event.preventDefault(); disconnect.mutate(); }}>Disconnect</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};

export default SettingsAbsWhatsAppSection;
