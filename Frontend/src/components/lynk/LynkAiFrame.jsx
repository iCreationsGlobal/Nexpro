import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import lynkAiService from '../../services/lynkAiService';
import { useLynkAi } from '../../context/LynkAiContext';
import { isAbsPath, pageFromLocation } from './lynkPage';

/**
 * Lynk AI's screen inside ABS (the Lynk AI page with its tabs, or Ask in the side panel): Lynk's own screen in a
 * frame, opened with a one-time pass. It tells Lynk which page is open as the person moves around, and follows
 * Lynk's buttons to ABS's pages; "Bring in products" opens ABS's Lynk import.
 */
export default function LynkAiFrame({ screen = 'full', tab = 'ask', onClose, className = '' }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { openImport, openFullPage } = useLynkAi();
  const [state, setState] = useState({ status: 'starting', url: null, error: null });
  const [attempt, setAttempt] = useState(0);
  const frame = useRef(null);
  const firstPage = useRef(pageFromLocation(location));
  const origin = useMemo(() => {
    try { return state.url ? new URL(state.url).origin : null; } catch { return null; }
  }, [state.url]);

  useEffect(() => {
    let alive = true;
    lynkAiService.start({ screen, tab, page: firstPage.current })
      .then((res) => { if (alive) setState({ status: 'open', url: res.screenUrl, error: null }); })
      .catch((err) => { if (alive) setState({ status: 'error', url: null, error: err?.response?.data?.message ?? 'Lynk AI isn\'t available right now. Try again in a moment.' }); });
    return () => { alive = false; };
  }, [screen, tab, attempt]);

  useEffect(() => {
    if (!origin) return undefined;
    const onMessage = (event) => {
      if (event.origin !== origin || event.data?.source !== 'lynk-ai') return;
      const { event: what } = event.data;
      if (what === 'navigate' && isAbsPath(event.data.path)) navigate(event.data.path);
      else if (what === 'open' && event.data.what === 'import') openImport();
      else if (what === 'open' && event.data.what === 'full') openFullPage();
      else if (what === 'closed') onClose?.();
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [origin, navigate, openImport, openFullPage, onClose]);

  // The page they move to, so "this" keeps meaning what's open.
  useEffect(() => {
    if (!origin || !frame.current?.contentWindow) return;
    frame.current.contentWindow.postMessage({ source: 'lynk-app', event: 'page', page: pageFromLocation(location) }, origin);
  }, [origin, location]);

  if (state.status === 'error') {
    return (
      <div className={`flex flex-col items-center justify-center gap-3 p-6 text-center ${className}`}>
        <Sparkles className="h-8 w-8 text-primary" />
        <p className="max-w-sm text-sm text-muted-foreground">{state.error}</p>
        <Button type="button" variant="outline" size="sm" onClick={() => { setState({ status: 'starting', url: null, error: null }); setAttempt((n) => n + 1); }}>Try again</Button>
      </div>
    );
  }
  return (
    <div className={`relative ${className}`}>
      {state.url && (
        <iframe
          ref={frame}
          title="Lynk AI"
          src={state.url}
          allow="microphone; autoplay; clipboard-write"
          className="h-full w-full border-0"
          onLoad={() => { if (origin) frame.current?.contentWindow?.postMessage({ source: 'lynk-app', event: 'page', page: pageFromLocation(location) }, origin); }}
        />
      )}
      {!state.url && (
        <div className="absolute inset-0 grid place-items-center">
          <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Opening Lynk AI…</p>
        </div>
      )}
    </div>
  );
}
