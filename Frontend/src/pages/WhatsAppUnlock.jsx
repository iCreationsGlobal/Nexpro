/**
 * Public page: enter the PIN for ABS on WhatsApp (a one-time link sent in the chat), so it never shows in the chat.
 * Route: /wa/:token
 * API: GET and POST /api/public/whatsapp-unlock/:token
 */
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle, Loader2 } from 'lucide-react';
import { AuthBrandMark } from '@/components/AppLogo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import absWhatsAppService from '../services/absWhatsAppService';

const EXPIRED = 'This link has expired. Send any message to ABS on WhatsApp to get a new one.';
const NO_CONNECTION = 'Could not reach ABS. Check your connection and try again.';

export default function WhatsAppUnlock() {
  const { token } = useParams();
  /** checking, ready, ended (with a message), done */
  const [state, setState] = useState('checking');
  const [message, setMessage] = useState('');
  const [pin, setPin] = useState('');
  const [sending, setSending] = useState(false);
  const [chatUrl, setChatUrl] = useState('');

  useEffect(() => {
    let left = false;
    absWhatsAppService.checkUnlock(token)
      .then(() => { if (!left) setState('ready'); })
      .catch((error) => {
        if (left) return;
        // Only a link ABS doesn't know has ended; otherwise they may still try.
        if (error?.response?.status === 404) { setState('ended'); setMessage(EXPIRED); } else setState('ready');
      });
    return () => { left = true; };
  }, [token]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!/^\d{4,6}$/.test(pin)) return setMessage('Your PIN has 4 to 6 digits.');
    setSending(true);
    setMessage('');
    try {
      const done = await absWhatsAppService.unlock(token, pin);
      setChatUrl(done?.chatUrl || '');
      setState('done');
    } catch (error) {
      const status = error?.response?.status;
      setPin('');
      setMessage(error?.response?.data?.message || NO_CONNECTION);
      if (status === 404 || status === 423) setState('ended');
    } finally {
      setSending(false);
    }
    return undefined;
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <main className="w-full max-w-sm text-center">
        <AuthBrandMark showName appName="ABS" className="mx-auto mb-6 justify-center" logoClassName="h-11 w-11" />
        {state === 'checking' ? <Loader2 className="mx-auto h-8 w-8 animate-spin text-brand" aria-label="Loading" /> : null}
        {state === 'ended' ? <p role="alert" className="text-foreground">{message}</p> : null}
        {state === 'done' ? (
          <>
            <CheckCircle className="mx-auto mb-4 h-14 w-14 text-brand" />
            <h1 className="mb-2 text-xl font-semibold">You can go back to WhatsApp</h1>
            <p className="mb-6 text-muted-foreground">Your answer is there.</p>
            {chatUrl ? <Button asChild className="w-full hover:text-primary-foreground"><a href={chatUrl}>Open WhatsApp</a></Button> : null}
          </>
        ) : null}
        {state === 'ready' ? (
          <form onSubmit={handleSubmit} className="grid gap-4 text-left">
            <h1 className="text-center text-xl font-semibold">Enter your PIN</h1>
            <p className="text-center text-sm text-muted-foreground">The one you chose for ABS on WhatsApp.</p>
            <div className="grid gap-2">
              <Label htmlFor="whatsapp-pin">PIN</Label>
              <Input
                id="whatsapp-pin"
                type="password"
                inputMode="numeric"
                autoComplete="off"
                autoFocus
                maxLength={6}
                value={pin}
                onChange={(event) => setPin(event.target.value.replace(/\D/g, ''))}
                className="text-center text-2xl tracking-[0.5em]"
              />
            </div>
            {message ? <p role="alert" className="text-sm font-medium text-destructive">{message}</p> : null}
            <Button type="submit" disabled={sending} className="w-full">
              {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Continue
            </Button>
            <p className="text-center text-xs text-muted-foreground">Forgot it? Set a new one in ABS, under Settings, ABS on WhatsApp.</p>
          </form>
        ) : null}
      </main>
    </div>
  );
}
