import { createContext, lazy, Suspense, useCallback, useContext, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from './AuthContext';
import { showSuccess, showInfo } from '../utils/toast';
import { refreshAfterInventoryChange } from '../utils/queryInvalidation';

const LynkImportDialog = lazy(() => import('../components/LynkImportDialog'));

/**
 * Lynk AI inside ABS, for owners, admins and managers: the side panel beside any page (desktop), the Lynk AI page
 * (/lynk), and "Bring in products" when Lynk AI asks for it from anywhere.
 */
const LynkAiContext = createContext(null);
const PANEL_KEY = 'abs-lynk-panel';

const readPanel = () => {
  try { return window.localStorage.getItem(PANEL_KEY) === '1'; } catch { return false; }
};
const keepPanel = (open) => {
  try { window.localStorage.setItem(PANEL_KEY, open ? '1' : '0'); } catch { /* private window */ }
};

export function LynkAiProvider({ children }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isManager, isDriver } = useAuth();
  const canUse = Boolean(isManager) && !isDriver;
  const [panelOpen, setPanelOpen] = useState(() => canUse && readPanel());
  const [importOpen, setImportOpen] = useState(false);

  const openPanel = useCallback(() => { setPanelOpen(true); keepPanel(true); }, []);
  const closePanel = useCallback(() => { setPanelOpen(false); keepPanel(false); }, []);
  const togglePanel = useCallback(() => setPanelOpen((open) => { keepPanel(!open); return !open; }), []);
  const openFullPage = useCallback(() => { setPanelOpen(false); keepPanel(false); navigate('/lynk'); }, [navigate]);
  const openImport = useCallback(() => setImportOpen(true), []);

  const onImported = useCallback(({ addedCount, updatedCount }) => {
    const done = [addedCount ? `${addedCount} product${addedCount === 1 ? '' : 's'} added` : null, updatedCount ? `${updatedCount} updated` : null].filter(Boolean).join(', ');
    if (done) showSuccess(`${done} with Lynk AI`);
    else showInfo('Nothing new to add: those products were already in ABS or left out');
    refreshAfterInventoryChange(queryClient);
    navigate('/products');
  }, [navigate, queryClient]);

  const value = useMemo(() => ({ canUse, panelOpen: canUse && panelOpen, openPanel, closePanel, togglePanel, openFullPage, openImport }), [canUse, panelOpen, openPanel, closePanel, togglePanel, openFullPage, openImport]);

  return (
    <LynkAiContext.Provider value={value}>
      {children}
      {importOpen && (
        <Suspense fallback={null}>
          <LynkImportDialog open={importOpen} onOpenChange={setImportOpen} onSaved={onImported} />
        </Suspense>
      )}
    </LynkAiContext.Provider>
  );
}

const NONE = { canUse: false, panelOpen: false, openPanel: () => {}, closePanel: () => {}, togglePanel: () => {}, openFullPage: () => {}, openImport: () => {} };

export const useLynkAi = () => useContext(LynkAiContext) ?? NONE;
