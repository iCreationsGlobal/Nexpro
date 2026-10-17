import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastContainer } from 'react-toastify';
import App from './App';
import { QUERY_CACHE, APP_NAME } from './constants';
import { clearChunkReloadAttempt } from './utils/chunkLoadError';
import { useDeviceMode } from './hooks/useDeviceMode';
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

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: QUERY_CACHE.STALE_TIME_DEFAULT,
      gcTime: QUERY_CACHE.CACHE_TIME,
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

ReactDOM.createRoot(document.getElementById('root')).render(
  <QueryClientProvider client={queryClient}>
    <App />
    <AppToastContainer />
  </QueryClientProvider>
);
