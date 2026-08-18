import Constants from 'expo-constants';

const DEFAULT_LOCAL_API_URL = 'http://localhost:5001';

const stripApiSuffix = (value: string) => value.trim().replace(/\/+$/, '').replace(/\/api\/?$/i, '');

const getExpoHost = () => {
  const constants = Constants as typeof Constants & {
    expoConfig?: { hostUri?: string; extra?: { apiUrl?: string } };
    manifest?: { hostUri?: string; debuggerHost?: string; extra?: { apiUrl?: string } };
    manifest2?: { extra?: { expoGo?: { debuggerHost?: string }; apiUrl?: string } };
  };

  const hostUri =
    constants.expoConfig?.hostUri ||
    constants.manifest?.hostUri ||
    constants.manifest?.debuggerHost ||
    constants.manifest2?.extra?.expoGo?.debuggerHost;

  return String(hostUri || '').split(':')[0];
};

const normalizeApiUrl = (value?: string | null) => {
  const raw = stripApiSuffix(value || DEFAULT_LOCAL_API_URL);
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`;

  try {
    const parsed = new URL(withProtocol);
    const expoHost = getExpoHost();
    const isLocalhost = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';

    if (isLocalhost && expoHost && expoHost !== 'localhost' && expoHost !== '127.0.0.1') {
      parsed.hostname = expoHost;
    }

    return parsed.toString().replace(/\/$/, '');
  } catch {
    return DEFAULT_LOCAL_API_URL;
  }
};

export const API_BASE_URL = normalizeApiUrl(
  process.env.EXPO_PUBLIC_API_URL || Constants.expoConfig?.extra?.apiUrl || DEFAULT_LOCAL_API_URL,
);

