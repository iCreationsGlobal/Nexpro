/**
 * Professional Plan API
 * Handles all v1.1 Professional Plan operations
 */

import apiClient from '../services/apiClient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ApiResponse, PricingPlan, User } from '../types/api';

interface ProfessionalPlanResponse {
  success: boolean;
  data?: PricingPlan | any;
  fullResponse?: any;
  error?: string;
}

interface UpgradePaymentData {
  paystackReference: string;
  billingCycle: 'monthly' | 'yearly';
}

interface UpgradeResponse {
  success: boolean;
  user?: User;
  data?: any;
  error?: string;
}

interface EnhancedProfile {
  educationLevel?: string;
  yearsExperience?: number;
  industryExpertise?: string[];
  skills?: string[];
  certifications?: string[];
  languages?: string[];
  languageProficiency?: string[];
  bio?: string;
  portfolioImages?: string[];
  portfolioVideos?: string[];
  [key: string]: any;
}

interface ProfileUpdateResponse {
  success: boolean;
  user?: User;
  data?: any;
  error?: string;
}

/**
 * Get Professional Plan pricing and features
 */
export const getProfessionalPlanInfo = async (): Promise<ProfessionalPlanResponse> => {
  try {
    const response = await apiClient.get<ApiResponse<{ plan: PricingPlan }>>('/api/marketer-professional/plan-info');
    
    console.log('[getProfessionalPlanInfo] API Response:', response.data);
    
    return {
      success: true,
      data: (response.data.data as any)?.plan, // Extract plan directly from response
      fullResponse: response.data // Keep full response for debugging
    };
  } catch (error: any) {
    console.error('[getProfessionalPlanInfo] Error:', error);
    return {
      success: false,
      error: error.response?.data?.message || 'Failed to fetch plan details'
    };
  }
};

/**
 * Upgrade to Professional Plan
 */
export const upgradeToProfessional = async (paymentData: UpgradePaymentData): Promise<UpgradeResponse> => {
  try {
    console.log('[upgradeToProfessional] Sending request:', {
      paystackReference: paymentData.paystackReference,
      billingCycle: paymentData.billingCycle,
      endpoint: '/api/marketer-professional/upgrade',
    });
    
    const response = await apiClient.post<ApiResponse<{ user: User }>>('/api/marketer-professional/upgrade', paymentData);

    console.log('[upgradeToProfessional] Response:', response.data);

    // Update local user data with new subscription plan
    if (response.data.success && (response.data.data as any)?.user) {
      await AsyncStorage.setItem('user', JSON.stringify((response.data.data as any).user));
    }

    return {
      success: true,
      user: (response.data.data as any)?.user,
      data: response.data
    };
  } catch (error: any) {
    console.error('[upgradeToProfessional] Error:', {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status,
    });
    
    return {
      success: false,
      error: error.response?.data?.message || 'Upgrade failed'
    };
  }
};

/**
 * Get Professional Profile (enhanced profile data)
 */
export const getProfessionalProfile = async (): Promise<ProfileUpdateResponse> => {
  try {
    const response = await apiClient.get<ApiResponse<{ profile?: EnhancedProfile }>>('/api/marketer-professional/profile/enhanced');

    return {
      success: true,
      data: (response.data.data as any)?.profile || response.data.data
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.message || 'Failed to fetch profile'
    };
  }
};

/**
 * Get Professional Marketer Stats (AI usage, badges, etc.)
 */
export const getProfessionalStats = async (): Promise<ApiResponse> => {
  try {
    const response = await apiClient.get<ApiResponse>('/api/marketer-professional/stats');

    return {
      success: true,
      data: response.data.data
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.message || 'Failed to fetch stats'
    };
  }
};

/**
 * Update Enhanced Profile (education, skills, etc.)
 */
export const updateEnhancedProfile = async (profileData: Partial<EnhancedProfile>): Promise<ProfileUpdateResponse> => {
  try {
    const response = await apiClient.put<ApiResponse<{ user: User }>>('/api/marketer-professional/profile/enhanced', profileData);

    // Update local user data
    if (response.data.success && (response.data.data as any)?.user) {
      await AsyncStorage.setItem('user', JSON.stringify((response.data.data as any).user));
    }

    return {
      success: true,
      user: (response.data.data as any)?.user,
      data: response.data
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.message || 'Failed to update profile'
    };
  }
};

/**
 * Toggle Public/Private Visibility
 */
export const updateVisibility = async (visibilityMode: 'public' | 'private'): Promise<ProfileUpdateResponse> => {
  try {
    const response = await apiClient.patch<ApiResponse<{ user: User }>>('/api/marketer-professional/profile/visibility', { visibilityMode });

    // Update local user data
    if (response.data.success && (response.data.data as any)?.user) {
      await AsyncStorage.setItem('user', JSON.stringify((response.data.data as any).user));
    }

    return {
      success: true,
      user: (response.data.data as any)?.user,
      data: response.data
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.message || 'Failed to update visibility'
    };
  }
};

/**
 * Refresh user profile from server
 */
export const refreshUserProfile = async (): Promise<ProfileUpdateResponse> => {
  try {
    const response = await apiClient.get<ApiResponse<{ user: User }>>('/api/users/profile');

    // Update local storage
    if ((response.data.data as any)?.user) {
      await AsyncStorage.setItem('user', JSON.stringify((response.data.data as any).user));
    }

    return {
      success: true,
      user: (response.data.data as any)?.user,
      data: (response.data.data as any)?.user
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.message || 'Failed to refresh profile'
    };
  }
};






