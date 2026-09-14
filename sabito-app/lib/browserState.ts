"use client";

import { useSyncExternalStore } from 'react';
import { getStoredToken } from './api';

export const AUTH_CHANGED_EVENT = 'sabito:auth-changed';
function subscribeAuth(listener: () => void) {
  window.addEventListener('storage', listener);
  window.addEventListener(AUTH_CHANGED_EVENT, listener);
  return () => { window.removeEventListener('storage', listener); window.removeEventListener(AUTH_CHANGED_EVENT, listener); };
}
export function useStoredToken() {
  return useSyncExternalStore(subscribeAuth, getStoredToken, () => undefined);
}
function subscribeSearch(listener: () => void) {
  window.addEventListener('popstate', listener);
  return () => window.removeEventListener('popstate', listener);
}
export function useBrowserSearch() {
  return useSyncExternalStore(subscribeSearch, () => window.location.search, () => '');
}
