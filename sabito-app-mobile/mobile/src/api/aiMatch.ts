/**
 * AI Match API
 * Handles AI-powered business matching for Professional marketers
 */

import apiClient from '../services/apiClient';
import type { ApiResponse, Business } from '../types/api';

interface AIMatchUsage {
  used: number;
  limit: number;
  remaining: number;
  resetDate: string;
}

interface AIMatchRequest {
  customerNeed?: string;
  customerDescription?: string;
  location?: string;
  budget?: string;
  budgetMin?: number;
  budgetMax?: number;
  timeline?: string;
}

interface AIMatchResult {
  business: Business;
  score: number;
  reason: string;
  [key: string]: any;
}

interface AIMatchResponse {
  matches: AIMatchResult[];
  usage?: AIMatchUsage;
  [key: string]: any;
}

interface MatchDetails {
  score?: number;
  reason?: string;
  [key: string]: any;
}

/**
 * Get AI Match Usage/Quota
 */
export const getAIMatchUsage = async (): Promise<ApiResponse<AIMatchUsage>> => {
  try {
    const response = await apiClient.get<ApiResponse<AIMatchUsage>>('/api/ai-match/usage');

    return {
      success: true,
      data: response.data.data as AIMatchUsage
    };
  } catch (error: any) {
    console.error('[getAIMatchUsage] Error:', error);
    return {
      success: false,
      error: error.response?.data?.message || 'Failed to fetch AI match usage'
    };
  }
};

/**
 * Request AI-powered business matches
 */
export const requestAIMatch = async (matchData: AIMatchRequest): Promise<ApiResponse<AIMatchResponse>> => {
  try {
    console.log('[requestAIMatch] Sending request:', {
      endpoint: '/api/ai-match/search',
      data: matchData,
    });
    
    // Parse budget if provided as string
    let budgetMin = matchData.budgetMin;
    let budgetMax = matchData.budgetMax;
    
    if (matchData.budget && !budgetMin && !budgetMax) {
      const budgetParts = matchData.budget.split('-');
      if (budgetParts.length === 2) {
        budgetMin = parseFloat(budgetParts[0]);
        budgetMax = parseFloat(budgetParts[1]);
      }
    }
    
    const response = await apiClient.post<ApiResponse<AIMatchResponse>>('/api/ai-match/search', {
      customerDescription: matchData.customerNeed || matchData.customerDescription,
      location: matchData.location,
      budgetMin,
      budgetMax,
      timeline: matchData.timeline,
    });

    console.log('[requestAIMatch] Response:', response.data);

    return {
      success: true,
      data: response.data.data as AIMatchResponse
    };
  } catch (error: any) {
    console.error('[requestAIMatch] Error:', {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status,
    });
    
    return {
      success: false,
      error: error.response?.data?.message || 'Failed to generate AI matches',
      data: {
        quota: error.response?.data?.quota // May include quota info if limit reached
      } as any
    };
  }
};

/**
 * Save an AI match for later
 */
export const saveAIMatch = async (
  businessId: string, 
  matchDetails: MatchDetails
): Promise<ApiResponse> => {
  try {
    const response = await apiClient.post<ApiResponse>('/api/ai-match/save', { businessId, matchDetails });

    return {
      success: true,
      data: response.data.data
    };
  } catch (error: any) {
    console.error('[saveAIMatch] Error:', error);
    return {
      success: false,
      error: error.response?.data?.message || 'Failed to save match'
    };
  }
};

/**
 * Get saved AI matches
 */
export const getSavedAIMatches = async (): Promise<ApiResponse<AIMatchResult[]>> => {
  try {
    const response = await apiClient.get<ApiResponse<AIMatchResult[]>>('/api/ai-match/saved');

    return {
      success: true,
      data: response.data.data as AIMatchResult[]
    };
  } catch (error: any) {
    console.error('[getSavedAIMatches] Error:', error);
    return {
      success: false,
      error: error.response?.data?.message || 'Failed to fetch saved matches'
    };
  }
};






