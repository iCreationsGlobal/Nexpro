import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastContainer } from 'react-toastify';

import App from './App';
import { QUERY_CACHE } from './constants';
import { CartProvider } from './context/CartContext';
import { StorefrontAuthProvider } from './context/StorefrontAuthContext';
import { WishlistProvider } from './context/WishlistContext';
import { startScrollReveal } from './utils/scrollReveal';
import 'react-toastify/dist/ReactToastify.css';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: QUERY_CACHE.STALE_TIME_DEFAULT,
      gcTime: QUERY_CACHE.CACHE_TIME,
      retry: 1,
    },
    mutations: {
      retry: false,
    },
  },
});

startScrollReveal();

ReactDOM.createRoot(document.getElementById('root')).render(
  <QueryClientProvider client={queryClient}>
    <StorefrontAuthProvider>
      <CartProvider>
        <WishlistProvider>
          <App />
        </WishlistProvider>
      </CartProvider>
    </StorefrontAuthProvider>
    <ToastContainer
      position="bottom-right"
      autoClose={5000}
      hideProgressBar={false}
      closeButton
      newestOnTop
      pauseOnHover
      theme="light"
      limit={4}
    />
  </QueryClientProvider>,
);
