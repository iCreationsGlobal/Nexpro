import { useState, useEffect } from 'react';
import { api } from '@/services/api';

export type PublicGoogleConfig = {
  googleClientId: string;
  googleIosClientId: string;
  googleAndroidClientId: string;
  configLoaded: boolean;
};

export function usePublicConfig(): PublicGoogleConfig {
  const [googleClientId, setGoogleClientId] = useState('');
  const [googleIosClientId, setGoogleIosClientId] = useState('');
  const [googleAndroidClientId, setGoogleAndroidClientId] = useState('');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .get('/auth/config')
      .then((res) => {
        if (cancelled) return;
        const data = res?.data || {};
        setGoogleClientId(String(data.googleClientId ?? '').trim());
        setGoogleIosClientId(String(data.googleIosClientId ?? '').trim());
        setGoogleAndroidClientId(String(data.googleAndroidClientId ?? '').trim());
      })
      .catch(() => {
        if (!cancelled) {
          setGoogleClientId('');
          setGoogleIosClientId('');
          setGoogleAndroidClientId('');
        }
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return {
    googleClientId,
    googleIosClientId,
    googleAndroidClientId,
    configLoaded: loaded,
  };
}
