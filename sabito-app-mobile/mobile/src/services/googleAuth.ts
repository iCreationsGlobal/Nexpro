/**
 * Google OAuth Service for Expo
 * Using expo-auth-session for Expo-compatible Google authentication
 */

import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { GOOGLE_WEB_CLIENT_ID, GOOGLE_IOS_CLIENT_ID, GOOGLE_ANDROID_CLIENT_ID } from '@env';
import { Platform } from 'react-native';

// Flag to track if WebBrowser session is completed
let isWebBrowserSessionCompleted = false;

/**
 * Complete WebBrowser auth session (deferred until first use)
 */
const completeWebBrowserSession = (): void => {
  if (!isWebBrowserSessionCompleted) {
    WebBrowser.maybeCompleteAuthSession();
    isWebBrowserSessionCompleted = true;
  }
};

/**
 * Get the appropriate Google Client ID based on platform
 * For now, use iOS client ID for testing
 */
const getGoogleClientId = (): string => {
  // Use iOS client ID from env (set GOOGLE_IOS_CLIENT_ID / EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID)
  const clientId = GOOGLE_IOS_CLIENT_ID || '';

  if (!clientId) {
    console.warn('[Google Sign-In] ⚠️ GOOGLE_IOS_CLIENT_ID not found in env');
    console.warn('[Google Sign-In] To fix: set the env var and restart Expo with --clear');
  }

  return clientId;
};

/**
 * Google OAuth Configuration (using getter to defer evaluation)
 */
const googleConfig = {
  get clientId(): string {
    return getGoogleClientId();
  },
  scopes: ['openid', 'profile', 'email'] as const,
};

/**
 * Create Google OAuth request
 */
export const useGoogleAuth = () => {
  // Complete WebBrowser session on first use
  completeWebBrowserSession();
  
  const discovery = AuthSession.useAutoDiscovery('https://accounts.google.com');
  
  // Validate client ID is set - but don't throw error, just log warning
  // This allows the app to load even if Google Sign-In isn't configured
  if (!googleConfig.clientId) {
    console.warn('[Google Sign-In] ⚠️ Google Client ID is missing!');
    console.warn('[Google Sign-In] Google Sign-In will not be available');
    console.warn('[Google Sign-In] To fix: Set GOOGLE_IOS_CLIENT_ID in eas.json or create .env file');
    // Return a mock request that will fail gracefully
    return {
      request: null,
      response: null,
      promptAsync: async () => {
        throw new Error('Google Sign-In is not configured. Please set GOOGLE_IOS_CLIENT_ID.');
      },
      discovery,
    };
  }
  
  // For iOS OAuth clients, Google generates a URL scheme from the reversed client ID
  // Format: com.googleusercontent.apps.CLIENT_ID:/oauthredirect
  // This matches the "iOS URL scheme" shown in Google Cloud Console
  const clientIdParts = googleConfig.clientId.split('.');
  if (clientIdParts.length < 4) {
    console.error('[Google Sign-In] ❌ Invalid Google Client ID format:', googleConfig.clientId);
    console.error('[Google Sign-In] Expected format: CLIENT_ID.apps.googleusercontent.com');
    throw new Error('Invalid Google Client ID format');
  }
  const clientIdReversed = clientIdParts.reverse().join('.');
  const redirectUri = `${clientIdReversed}:/oauthredirect`;
  
  console.log('[Google Sign-In] ✅ Using redirect URI:', redirectUri);
  console.log('[Google Sign-In] Client ID:', googleConfig.clientId);
  console.log('[Google Sign-In] Platform:', Platform.OS);
  console.log('[Google Sign-In] iOS URL scheme:', clientIdReversed);
  console.log('[Google Sign-In] ⚠️  IMPORTANT: Make sure this redirect URI is added to Google Cloud Console');
  console.log('[Google Sign-In] 📋 Go to: APIs & Services → Credentials → Your iOS OAuth Client → Authorized redirect URIs');
  console.log('[Google Sign-In] 📋 Add this exact URI:', redirectUri);
  
  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: googleConfig.clientId,
      scopes: [...googleConfig.scopes],
      redirectUri: redirectUri,
      // iOS OAuth clients require authorization code flow
      responseType: AuthSession.ResponseType.Code,
      // Enable PKCE - iOS OAuth clients require it
      // We'll handle code_verifier extraction for backend exchange
      usePKCE: true,
    },
    discovery
  );

  // Log the request details
  if (request) {
    // Check if request has codeVerifier or code_challenge properties
    const requestProps = Object.keys(request);
    const hasCodeVerifier = 'codeVerifier' in request || 'code_verifier' in request;
    const hasCodeChallenge = 'codeChallenge' in request || 'code_challenge' in request;
    
    console.log('[Google Auth Service] 📋 OAuth Request created:', {
      clientId: request.clientId?.substring(0, 30) + '...',
      redirectUri: request.redirectUri,
      responseType: request.responseType,
      scopes: request.scopes,
      usePKCE: request.usePKCE,
      platform: Platform.OS,
      requestProperties: requestProps,
      hasCodeVerifier,
      hasCodeChallenge,
    });
    
    // Try to log code_verifier if accessible (will be truncated for security)
    if (hasCodeVerifier && (request as any).codeVerifier) {
      console.log('[Google Auth Service] 🔐 Code verifier found in request:', {
        length: (request as any).codeVerifier?.length,
        prefix: (request as any).codeVerifier?.substring(0, 10) + '...',
      });
    }
  }

  // Log response when it changes
  if (response) {
    if (response.type === 'error') {
      console.error('[Google Auth Service] ❌ OAuth Error:', {
        error: (response as any).params?.error,
        errorDescription: (response as any).params?.error_description,
        errorUri: (response as any).params?.error_uri,
        fullResponse: response,
      });
    } else if (response.type === 'success') {
      console.log('[Google Auth Service] ✅ OAuth Success:', {
        hasCode: Boolean((response as any).params?.code),
        codePrefix: (response as any).params?.code?.substring(0, 30),
        hasState: Boolean((response as any).params?.state),
        fullResponse: {
          ...response,
          params: {
            ...(response as any).params,
            code: (response as any).params?.code ? (response as any).params.code.substring(0, 30) + '...' : null,
          },
        },
      });
    } else {
      console.log('[Google Auth Service] 📥 OAuth Response:', {
        type: response.type,
        params: (response as any).params,
      });
    }
  }

  return {
    request,
    response,
    promptAsync,
    discovery,
  };
};

/**
 * Exchange authorization code for ID token
 * This happens on the backend for security
 */
export const exchangeCodeForToken = async (code: string): Promise<{ idToken: string }> => {
  // The backend will handle the code exchange
  // This is just a placeholder - actual implementation in backend
  return {
    idToken: code, // For now, we'll work with the code directly
  };
};

/**
 * Prompt Google Sign-In
 * Returns the ID token on success
 */
export const promptGoogleSignIn = async (
  promptAsync: () => Promise<AuthSession.AuthRequestPromptOptions>,
  request: AuthSession.AuthRequest | null
): Promise<string> => {
  if (!request) {
    throw new Error('Google Sign-In request not ready');
  }

  const result = await promptAsync();
  
  if (result.type === 'success') {
    // For code flow, we get an authorization code
    if ((result as any).params?.code) {
      return (result as any).params.code;
    }
    // For implicit flow, we might get id_token directly
    if ((result as any).params?.id_token) {
      return (result as any).params.id_token;
    }
    throw new Error('No authorization code or ID token received');
  } else if (result.type === 'cancel') {
    throw new Error('SIGN_IN_CANCELLED');
  } else {
    throw new Error((result as any).error?.message || 'Google Sign-In failed');
  }
};


