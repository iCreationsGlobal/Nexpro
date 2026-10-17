import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { ToastContainer } from 'react-toastify';
import App from './App';
import { QUERY_CACHE, APP_NAME } from './constants';
import { clearChunkReloadAttempt } from './utils/chunkLoadError';
import { matchesAppShell, useDeviceMode } from './hooks/useDeviceMode';
import {
  clearPersistedQueryCache,
  createQueryPersister,
  PERSISTED_CACHE_BUSTER,
  PERSISTED_CACHE_MAX_AGE,
  shouldPersistQuery,
} from './lib/queryPersistence';
import 'react-toastify/dist/ReactToastify.css';
import './index.css';

if (typeof window !== 'undefined') {
  window.APP_NAME = APP_NAME;
  clearChunkReloadAttempt();
}

// PWA service worker is registered via PWAUpdatePrompt (prod only).
// In dev, unregister any leftover SW from preview/prod on localhost so it does not serve stale chunks.
if (import.meta.env.DEV && typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    registrations.forEach((registration) => registration.unregister());
  });
}

// Phones and tablets keep fetched data between launches (see lib/queryPersistence).
// Without a session nothing saved earlier may be shown, so start clean.
const hasSession = (() => {
  try {
    return Boolean(localStorage.getItem('token'));
  } catch {
    return false;
  }
})();
if (!hasSession) clearPersistedQueryCache();
const queryPersister = matchesAppShell() ? createQueryPersister() : null;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: QUERY_CACHE.STALE_TIME_DEFAULT,
      // Saved queries must outlive the save window, or they are dropped before the next launch.
      gcTime: queryPersister ? PERSISTED_CACHE_MAX_AGE : QUERY_CACHE.CACHE_TIME,
      retry: 1,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    },
    mutations: {
      retry: false,
    },
  },
});

/** Phones and tablets: toasts drop from the top like app notices, clear of the tab bar. */
function AppToastContainer() {
  const { isAppShell } = useDeviceMode();
  return (
    <ToastContainer
      position={isAppShell ? 'top-center' : 'bottom-right'}
      autoClose={5000}
      hideProgressBar={false}
      closeButton
      newestOnTop
      pauseOnHover
      theme="light"
      limit={4}
    />
  );
}

const app = (
  <>
    <App />
    <AppToastContainer />
  </>
);

ReactDOM.createRoot(document.getElementById('root')).render(
  queryPersister ? (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister: queryPersister,
        maxAge: PERSISTED_CACHE_MAX_AGE,
        buster: PERSISTED_CACHE_BUSTER,
        dehydrateOptions: { shouldDehydrateQuery: shouldPersistQuery },
      }}
    >
      {app}
    </PersistQueryClientProvider>
  ) : (
    <QueryClientProvider client={queryClient}>{app}</QueryClientProvider>
  )
);
