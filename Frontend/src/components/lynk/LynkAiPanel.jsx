import LynkAiFrame from './LynkAiFrame';
import { useLynkAi } from '../../context/LynkAiContext';

/** Width of the side panel; the page moves over by this much while it's open (MainLayout). */
export const LYNK_PANEL_WIDTH = 420;

/**
 * Ask Lynk AI beside any page (desktop): it stays open while the page behind it changes, knows which page is open,
 * and its buttons move that page. "Open the full page" goes to /lynk.
 */
export default function LynkAiPanel() {
  const { panelOpen, closePanel } = useLynkAi();
  if (!panelOpen) return null;
  return (
    <aside
      aria-label="Lynk AI"
      className="fixed right-0 top-0 z-50 flex h-dvh flex-col border-l border-border bg-card shadow-xl print:hidden"
      style={{ width: LYNK_PANEL_WIDTH }}
    >
      <LynkAiFrame screen="panel" onClose={closePanel} className="h-full w-full" />
    </aside>
  );
}
