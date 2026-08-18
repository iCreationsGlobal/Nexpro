import apiClient from '../services/apiClient';
import { API_CONFIG } from '../config/env';
import type { 
  LoginResponse, 
  SignupResponse, 
  OtpResponse, 
  ApiResponse, 
  User,
  PricingPlan 
} from '../types/api';

// Use apiClient which has token refresh logic built-in
const api = apiClient;

/**
 * Login user with email and password
 */
export const loginUser = async (email: string, password: string): Promise<LoginResponse> => {
  try {
    const response = await api.post<LoginResponse>('/api/users/login', {
      email,
      password,
    });
    return response.data;
  } catch (error: any) {
    if (error.response) {
      // Server responded with error
      const message = error.response.data?.message || error.response.data?.error || 'Login failed';
      throw new Error(message);
    } else if (error.request) {
      // Request made but no response
      throw new Error(`Cannot connect to ${API_CONFIG.baseURL}\n\nTroubleshooting:\n• Backend running?\n• Using correct IP address?\n• Same WiFi network?`);
    } else {
      // Something else happened
      throw new Error('Unexpected error: ' + error.message);
    }
  }
};

interface SendOtpData {
  name: string;
  email: string;
  accountType: 'business' | 'marketer';
}

/**
 * Send OTP to email for signup
 */
export const sendOtp = async (data: SendOtpData): Promise<OtpResponse> => {
  try {
    const response = await api.post<OtpResponse>('/api/users/signup/send-otp', data);
    return response.data;
  } catch (error: any) {
    if (error.response) {
      const message = error.response.data?.message || error.response.data?.error || 'Failed to send OTP';
      throw new Error(message);
    } else if (error.request) {
      throw new Error(`Cannot connect to server at ${API_CONFIG.baseURL}`);
    } else {
      throw new Error('Unexpected error: ' + error.message);
    }
  }
};

interface VerifyOtpData {
  email: string;
  otp: string;
  accountType: 'business' | 'marketer';
}

/**
 * Verify OTP code
 */
export const verifyOtp = async (data: VerifyOtpData): Promise<ApiResponse> => {
  try {
    const response = await api.post<ApiResponse>('/api/users/signup/verify-otp', data);
    return response.data;
  } catch (error: any) {
    if (error.response) {
      const message = error.response.data?.message || error.response.data?.error || 'Invalid OTP';
      throw new Error(message);
    } else if (error.request) {
      throw new Error(`Cannot connect to server at ${API_CONFIG.baseURL}`);
    } else {
      throw new Error('Unexpected error: ' + error.message);
    }
  }
};

interface CreatePasswordData {
  email: string;
  password: string;
  confirmPassword: string;
  accountType: 'business' | 'marketer';
  planSlug?: string;
  planType?: string;
}

/**
 * Create password and complete account setup
 */
export const createPassword = async (data: CreatePasswordData): Promise<SignupResponse> => {
  try {
    const response = await api.post<SignupResponse>('/api/users/create-password', data);
    return response.data;
  } catch (error: any) {
    if (error.response) {
      const message = error.response.data?.message || error.response.data?.error || 'Failed to create account';
      throw new Error(message);
    } else if (error.request) {
      throw new Error(`Cannot connect to server at ${API_CONFIG.baseURL}`);
    } else {
      throw new Error('Unexpected error: ' + error.message);
    }
  }
};

/**
 * Request password reset
 */
export const requestPasswordReset = async (email: string): Promise<ApiResponse> => {
  try {
    const response = await api.post<ApiResponse>('/api/users/forgot-password', { email });
    return response.data;
  } catch (error: any) {
    if (error.response) {
      throw new Error(error.response.data?.message || 'Failed to send reset email');
    } else {
      throw new Error('Cannot connect to server');
    }
  }
};

/**
 * Get active pricing plans
 */
export const getPricingPlans = async (): Promise<PricingPlan[]> => {
  try {
    const response = await api.get<ApiResponse<PricingPlan[]>>('/api/pricing/active');
    // Handle different response structures
    const data = response.data;
    if (data.success && Array.isArray(data.data)) {
      return data.data;
    } else if (Array.isArray(data)) {
      return data;
    } else {
      return [];
    }
  } catch (error: any) {
    if (error.response) {
      throw new Error(error.response.data?.message || 'Failed to fetch pricing plans');
    } else if (error.request) {
      throw new Error(`Cannot connect to server at ${API_CONFIG.baseURL}`);
    } else {
      throw new Error('Unexpected error: ' + error.message);
    }
  }
};

/**
 * Get all industries
 */
export const getIndustries = async (): Promise<ApiResponse> => {
  try {
    const response = await api.get<ApiResponse>('/api/industries');
    return response.data;
  } catch (error: any) {
    throw error;
  }
};

/**
 * Get services for a specific industry
 */
export const getIndustryServices = async (industryValue: string): Promise<ApiResponse> => {
  try {
    const response = await api.get<ApiResponse>(`/api/industries/${industryValue}/services`);
    return response.data;
  } catch (error: any) {
    throw error;
  }
};

interface BusinessProfileData {
  businessName: string;
  description?: string;
  industry?: string;
  address?: string;
  logo?: string;
  coverImage?: string;
  services?: string[];
  commissionRateNew?: number;
  commissionRateReturning?: number;
  [key: string]: any;
}

/**
 * Create business profile
 */
export const createBusinessProfile = async (data: BusinessProfileData): Promise<ApiResponse<Business>> => {
  try {
    const response = await api.post<ApiResponse<Business>>('/api/business/create', data);
    return response.data;
  } catch (error: any) {
    throw error;
  }
};

interface GoogleSignInParams {
  idToken: string;
  accountType?: 'business' | 'marketer' | null;
  redirectUri?: string | null;
  codeVerifier?: string | null;
}

/**
 * Google OAuth sign-in
 */
export const googleSignIn = async (
  idToken: string, 
  accountType: 'business' | 'marketer' | null = null, 
  redirectUri: string | null = null, 
  codeVerifier: string | null = null
): Promise<LoginResponse | SignupResponse> => {
  const requestId = `mobile-google-signin-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  
  console.log('\n========================================');
  console.log(`[Mobile Google Sign-In][${requestId}] 🚀 START - Mobile Google Sign-In Request`);
  console.log('========================================');
  console.log(`[Mobile Google Sign-In][${requestId}] 📥 Request Details:`, {
    endpoint: accountType ? '/api/auth/google/signup' : '/api/auth/google/signin',
    accountType,
    hasIdToken: Boolean(idToken),
    idTokenLength: idToken?.length,
    idTokenPrefix: idToken?.substring(0, 30),
    idTokenType: idToken?.startsWith('4/') ? 'AUTHORIZATION_CODE' : 'ID_TOKEN',
    hasRedirectUri: Boolean(redirectUri),
    redirectUri,
    hasCodeVerifier: Boolean(codeVerifier),
    codeVerifierLength: codeVerifier?.length,
    platform: 'MOBILE',
  });
  
  try {
    const endpoint = accountType 
      ? '/api/auth/google/signup' 
      : '/api/auth/google/signin';
    
    // For mobile apps sending authorization codes, include redirect URI and code_verifier
    const payload = accountType 
      ? { 
          idToken, 
          accountType, 
          ...(redirectUri && { redirectUri }),
          ...(codeVerifier && { codeVerifier })
        } 
      : { 
          idToken, 
          ...(redirectUri && { redirectUri }),
          ...(codeVerifier && { codeVerifier })
        };
    
    console.log(`[Mobile Google Sign-In][${requestId}] 📤 Sending request to backend:`, {
      endpoint,
      payload: {
        ...payload,
        idToken: payload.idToken?.substring(0, 30) + '...', // Truncate for security
        codeVerifier: payload.codeVerifier ? payload.codeVerifier.substring(0, 20) + '...' : undefined,
      },
    });
    
    const response = await api.post<LoginResponse | SignupResponse>(endpoint, payload);
    
    console.log(`[Mobile Google Sign-In][${requestId}] ✅ Success:`, {
      hasUser: Boolean(response.data?.user),
      hasAccessToken: Boolean((response.data as any)?.accessToken),
      hasRefreshToken: Boolean((response.data as any)?.refreshToken),
      userId: response.data?.user?.id,
      email: response.data?.user?.email,
      accountType: response.data?.user?.accountType,
    });
    console.log('========================================\n');
    
    return response.data;
  } catch (error: any) {
    console.error(`[Mobile Google Sign-In][${requestId}] ❌ Error:`, {
      message: error?.message,
      response: error?.response?.data,
      status: error?.response?.status,
      statusText: error?.response?.statusText,
      requestData: {
        endpoint: accountType ? '/api/auth/google/signup' : '/api/auth/google/signin',
        hasIdToken: Boolean(idToken),
        hasRedirectUri: Boolean(redirectUri),
        redirectUri,
      },
    });
    console.log('========================================\n');
    throw error;
  }
};

interface CompleteGoogleSignupData {
  email: string;
  name: string;
  picture?: string;
  googleSub: string;
  accountType: 'business' | 'marketer';
  planSlug: string;
  planType: string;
  billingCycle: string;
  paymentReference?: string;
}

/**
 * Complete Google sign-up for business users (after plan selection)
 */
export const completeGoogleSignup = async (data: CompleteGoogleSignupData): Promise<SignupResponse> => {
  try {
    const response = await api.post<SignupResponse>('/api/auth/google/complete-signup', data);
    return response.data;
  } catch (error: any) {
    throw error;
  }
};

/**
 * Accept partnership terms
 */
export const acceptPartnershipTerms = async (
  token: string, 
  termsVersion: string = '1.0'
): Promise<ApiResponse> => {
  try {
    const response = await api.post<ApiResponse>(
      '/api/partnership-terms/accept',
      {
        termsVersion,
        acceptedAt: new Date().toISOString(),
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );
    return response.data;
  } catch (error: any) {
    throw error;
  }
};

/**
 * Get partnership terms acceptance status
 */
export const getPartnershipTermsStatus = async (token: string): Promise<ApiResponse> => {
  try {
    const response = await api.get<ApiResponse>('/api/partnership-terms/status', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return response.data;
  } catch (error: any) {
    throw error;
  }
};

export default api;

