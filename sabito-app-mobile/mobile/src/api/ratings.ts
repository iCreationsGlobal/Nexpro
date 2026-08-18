/**
 * Ratings API
 * Handles business and marketer ratings
 */

import apiClient from '../services/apiClient';
import type { ApiResponse } from '../types/api';

interface RatingData {
  rating: number;
  ratings?: {
    quality?: number;
    communication?: number;
    timeliness?: number;
    professionalism?: number;
    [key: string]: number | undefined;
  };
  review?: string;
  [key: string]: any;
}

interface Rating {
  id: string;
  rating: number;
  ratings?: Record<string, number>;
  review?: string;
  createdAt: string;
  updatedAt: string;
  [key: string]: any;
}

/**
 * Submit a rating for a business (Marketer → Business)
 */
export const submitBusinessRating = async (
  businessId: string, 
  ratingData: RatingData
): Promise<ApiResponse<Rating>> => {
  try {
    const response = await apiClient.post<ApiResponse<Rating>>(`/api/ratings/${businessId}`, ratingData);

    return {
      success: true,
      data: response.data.data as Rating
    };
  } catch (error: any) {
    console.error('[submitBusinessRating] Error:', error);
    return {
      success: false,
      error: error.response?.data?.message || 'Failed to submit rating'
    };
  }
};

/**
 * Get my rating for a business
 */
export const getMyBusinessRating = async (businessId: string): Promise<ApiResponse<Rating | null>> => {
  try {
    const response = await apiClient.get<ApiResponse<Rating>>(`/api/ratings/${businessId}/my-rating`);

    return {
      success: true,
      data: response.data.data as Rating
    };
  } catch (error: any) {
    console.error('[getMyBusinessRating] Error:', error);
    return {
      success: false,
      error: error.response?.data?.message || 'Failed to fetch rating',
      data: null
    };
  }
};

/**
 * Submit a rating for a marketer (Business → Marketer)
 */
export const submitMarketerRating = async (
  marketerId: string, 
  ratingData: RatingData
): Promise<ApiResponse<Rating>> => {
  try {
    const response = await apiClient.post<ApiResponse<Rating>>(`/api/ratings/marketer/${marketerId}`, ratingData);

    return {
      success: true,
      data: response.data.data as Rating
    };
  } catch (error: any) {
    console.error('[submitMarketerRating] Error:', error);
    return {
      success: false,
      error: error.response?.data?.message || 'Failed to submit rating'
    };
  }
};

/**
 * Get my rating for a marketer
 */
export const getMyMarketerRating = async (marketerId: string): Promise<ApiResponse<Rating | null>> => {
  try {
    const response = await apiClient.get<ApiResponse<Rating>>(`/api/ratings/marketer/${marketerId}/my-rating`);

    return {
      success: true,
      data: response.data.data as Rating
    };
  } catch (error: any) {
    console.error('[getMyMarketerRating] Error:', error);
    return {
      success: false,
      error: error.response?.data?.message || 'Failed to fetch rating',
      data: null
    };
  }
};






