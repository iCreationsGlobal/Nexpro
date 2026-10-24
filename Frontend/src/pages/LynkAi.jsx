import { useSearchParams } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import LynkAiFrame from '../components/lynk/LynkAiFrame';
import { useLynkAi } from '../context/LynkAiContext';
import { useDeviceMode } from '../hooks/useDeviceMode';

const TABS = ['ask', 'insights', 'design', 'import'];

/**
 * The Lynk AI page: Lynk's screen with its tabs (Ask, Insights, Design, Import), for owners, admins and managers.
 * /lynk?tab=insights opens a tab.
 */
export default function LynkAi() {
  const { canUse } = useLynkAi();
  const { isAppShell } = useDeviceMode();
  const [params] = useSearchParams();
  const tab = TABS.includes(params.get('tab')) ? params.get('tab') : 'ask';
  if (!canUse) {
    return (
      <div className="mx-auto max-w-md rounded-xl border border-border bg-card p-6 text-center">
        <Sparkles className="mx-auto h-8 w-8 text-primary" />
        <p className="mt-3 text-sm text-muted-foreground">Lynk AI is for the business owner and managers.</p>
      </div>
    );
  }
  return (
    <div
      className="-mx-4 -my-4 overflow-hidden border-border bg-card sm:-my-6 sm:mx-0 sm:rounded-xl sm:border"
      style={{ height: isAppShell ? 'calc(100dvh - 3.5rem - env(safe-area-inset-top, 0px))' : 'calc(100dvh - 4rem - 3rem)' }}
    >
      <LynkAiFrame key={tab} screen="full" tab={tab} className="h-full w-full" />
    </div>
  );
}
