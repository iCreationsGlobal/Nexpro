'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { API_URL } from '@/lib/constants';

type PublicConfig = {
  selfSignupEnabled: boolean;
  configLoaded: boolean;
};

const defaultConfig: PublicConfig = {
  selfSignupEnabled: true,
  configLoaded: false,
};

const PublicConfigContext = createContext<PublicConfig>(defaultConfig);

export function PublicConfigProvider({ children }: { children: React.ReactNode }) {
  const [selfSignupEnabled, setSelfSignupEnabled] = useState(true);
  const [configLoaded, setConfigLoaded] = useState(false);

  useEffect(() => {
    const url = `${API_URL}/api/auth/config`;
    fetch(url)
      .then(async (res) => {
        if (!res.ok) return;
        const contentType = res.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) return;
        const data = await res.json();
        if (typeof data?.selfSignupEnabled !== 'undefined') {
          setSelfSignupEnabled(data.selfSignupEnabled !== false);
        }
      })
      .catch(() => {
        // Keep optimistic default so pricing and signup CTAs stay visible when API is unreachable.
      })
      .finally(() => setConfigLoaded(true));
  }, []);

  const value: PublicConfig = {
    selfSignupEnabled,
    configLoaded,
  };

  return (
    <PublicConfigContext.Provider value={value}>
      {children}
    </PublicConfigContext.Provider>
  );
}

export function usePublicConfig() {
  const context = useContext(PublicConfigContext);
  if (!context) {
    throw new Error('usePublicConfig must be used within PublicConfigProvider');
  }
  return context;
}
