/**
 * Marketplace API
 * Handles public business and marketer discovery
 */

import apiClient from '../services/apiClient';
import { API_CONFIG } from '../config/env';
import type { Business, Marketer, ApiResponse } from '../types/api';

interface BusinessFilters {
  page?: number;
  limit?: number;
  industry?: string;
  location?: string;
  rating?: string;
  services?: string;
  search?: string;
  sort?: 'featured' | 'rating' | 'recent';
}

interface MarketerFilters {
  page?: number;
  limit?: number;
  industry?: string;
  experience?: string;
  rating?: string;
  search?: string;
  sort?: 'featured' | 'rating' | 'experience' | 'referrals';
}

interface PaginationInfo {
  currentPage: number;
  totalPages: number;
  totalCount: number;
}

interface BusinessesResponse {
  success: boolean;
  data?: {
    businesses: Business[];
    pagination: PaginationInfo;
  };
  error?: string;
}

interface MarketersResponse {
  success: boolean;
  data?: {
    marketers: Marketer[];
    pagination: PaginationInfo;
  };
  error?: string;
}

/**
 * Fetch public businesses
 */
export const fetchPublicBusinesses = async (filters: BusinessFilters = {}): Promise<BusinessesResponse> => {
  try {
    console.log('[fetchPublicBusinesses] ===== START =====');
    console.log('[fetchPublicBusinesses] Input filters:', filters);
    console.log('[fetchPublicBusinesses] API_CONFIG.baseURL:', API_CONFIG.baseURL);

    const { 
      page = 1, 
      limit = 12, 
      industry, 
      location, 
      rating, 
      services, 
      search,
      sort = 'featured'
    } = filters;

    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
      sort,
    });

    if (industry) params.append('industry', industry);
    if (location) params.append('location', location);
    if (rating) params.append('rating', rating);
    if (services) params.append('services', services);
    if (search) params.append('search', search);

    const queryString = params.toString();
    console.log('[fetchPublicBusinesses] Query params:', queryString);

    const response = await apiClient.get<ApiResponse<{ businesses: Business[]; pagination: PaginationInfo }>>(`/api/public/businesses?${queryString}`);

    console.log('[fetchPublicBusinesses] Raw Response Status:', response.status);
    console.log('[fetchPublicBusinesses] Raw Response Data:', JSON.stringify(response.data, null, 2).substring(0, 500));
    console.log('[fetchPublicBusinesses] Response success:', response.data?.success);
    console.log('[fetchPublicBusinesses] Response data exists:', !!response.data?.data);
    console.log('[fetchPublicBusinesses] Businesses array:', (response.data.data as any)?.businesses?.length || 0);
    console.log('[fetchPublicBusinesses] Pagination:', (response.data.data as any)?.pagination);

    // Normalize business data to match mobile component expectations
    const rawBusinesses = (response.data.data as any)?.businesses || [];
    console.log('[fetchPublicBusinesses] Raw businesses count:', rawBusinesses.length);
    console.log('[fetchPublicBusinesses] First raw business:', JSON.stringify(rawBusinesses[0], null, 2).substring(0, 500));

    const businesses: Business[] = rawBusinesses.map((business: any, index: number) => {
      // Services is already an array from backend (sliced to first 3)
      const servicesArray = Array.isArray(business.services) 
        ? business.services 
        : (typeof business.services === 'string' 
            ? business.services.split(/\s+/).filter(Boolean)
            : []);

      const normalized: Business = {
        id: business.id || business.businessId,
        businessName: business.name || business.businessName,
        name: business.name || business.businessName,
        industry: business.industry,
        logo: business.logo,
        coverImage: business.coverImage,
        address: business.location,
        services: servicesArray,
        description: business.description || business.fullDescription,
        status: 'approved', // Public businesses are approved
        createdAt: business.memberSince || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ...business, // Include any additional fields
      };
      
      if (index === 0) {
        console.log('[fetchPublicBusinesses] First normalized business:', JSON.stringify(normalized, null, 2).substring(0, 500));
      }
      
      return normalized;
    });

    console.log('[fetchPublicBusinesses] Final businesses count:', businesses.length);
    console.log('[fetchPublicBusinesses] First normalized business:', businesses[0]);

    const finalResult: BusinessesResponse = {
      success: true,
      data: {
        businesses,
        pagination: {
          currentPage: (response.data.data as any)?.pagination?.page || 1,
          totalPages: (response.data.data as any)?.pagination?.totalPages || 1,
          totalCount: (response.data.data as any)?.pagination?.total || 0,
        }
      }
    };

    console.log('[fetchPublicBusinesses] ===== RETURNING =====');
    console.log('[fetchPublicBusinesses] Result:', {
      success: finalResult.success,
      businessesCount: finalResult.data?.businesses.length,
      pagination: finalResult.data?.pagination,
    });

    return finalResult;
  } catch (error: any) {
    console.error('[fetchPublicBusinesses] ===== ERROR =====');
    console.error('[fetchPublicBusinesses] Error type:', error.name);
    console.error('[fetchPublicBusinesses] Error message:', error.message);
    console.error('[fetchPublicBusinesses] Error response:', error.response);
    console.error('[fetchPublicBusinesses] Error response data:', error.response?.data);
    console.error('[fetchPublicBusinesses] Error response status:', error.response?.status);
    console.error('[fetchPublicBusinesses] Full error:', error);
    
    return {
      success: false,
      error: error.response?.data?.message || error.message || 'Failed to fetch businesses',
      data: {
        businesses: [],
        pagination: {
          currentPage: 1,
          totalPages: 1,
          totalCount: 0,
        }
      }
    };
  }
};

/**
 * Fetch public marketers
 */
export const fetchPublicMarketers = async (filters: MarketerFilters = {}): Promise<MarketersResponse> => {
  try {
    const { 
      page = 1, 
      limit = 12, 
      industry, 
      experience, 
      rating, 
      search,
      sort = 'featured'
    } = filters;

    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
      sort,
    });

    if (industry) params.append('industry', industry);
    if (experience) params.append('experience', experience);
    if (rating) params.append('rating', rating);
    if (search) params.append('search', search);

    const response = await apiClient.get<ApiResponse<{ marketers: Marketer[]; pagination: PaginationInfo }>>(`/api/public/marketers?${params.toString()}`);

    return {
      success: true,
      data: {
        marketers: (response.data.data as any)?.marketers || [],
        pagination: {
          currentPage: (response.data.data as any)?.currentPage || 1,
          totalPages: (response.data.data as any)?.totalPages || 1,
          totalCount: (response.data.data as any)?.totalCount || 0,
        }
      }
    };
  } catch (error: any) {
    console.error('[fetchPublicMarketers] Error:', error);
    return {
      success: false,
      error: error.response?.data?.message || 'Failed to fetch marketers',
      data: {
        marketers: [],
        pagination: {
          currentPage: 1,
          totalPages: 1,
          totalCount: 0,
        }
      }
    };
  }
};

/**
 * Get business details by ID
 */
export const getBusinessDetails = async (businessId: string): Promise<ApiResponse<Business>> => {
  try {
    const response = await apiClient.get<ApiResponse<Business>>(`/api/public/businesses/${businessId}`);

    return {
      success: true,
      data: response.data.data as Business
    };
  } catch (error: any) {
    // Only log non-404 errors (404 is expected for pending/inactive businesses)
    if (error.response?.status !== 404) {
      console.error('[getBusinessDetails] Error:', error);
    }
    return {
      success: false,
      error: error.response?.data?.message || 'Failed to fetch business details'
    };
  }
};

/**
 * Get marketer public profile
 */
export const getMarketerPublicProfile = async (marketerId: string): Promise<ApiResponse<Marketer>> => {
  try {
    const response = await apiClient.get<ApiResponse<Marketer>>(`/api/public/marketers/${marketerId}`);

    return {
      success: true,
      data: response.data.data as Marketer
    };
  } catch (error: any) {
    console.error('[getMarketerPublicProfile] Error:', error);
    return {
      success: false,
      error: error.response?.data?.message || 'Failed to fetch marketer profile'
    };
  }
};





