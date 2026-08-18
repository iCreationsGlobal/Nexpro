/**
 * Business Services API
 * Handles business service portfolio CRUD operations
 */

import apiClient from '../services/apiClient';
import type { ApiResponse } from '../types/api';

interface BusinessService {
  id: string;
  name: string;
  description?: string;
  price?: number;
  category?: string;
  active?: boolean;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: any;
}

interface ServiceResponse {
  success: boolean;
  data?: BusinessService | BusinessService[];
  error?: string;
}

/**
 * Create a new business service
 */
export const createBusinessService = async (serviceData: Partial<BusinessService>): Promise<ServiceResponse> => {
  try {
    const response = await apiClient.post<ApiResponse<BusinessService>>('/api/business/services', serviceData);
    return {
      success: true,
      data: response.data.data as BusinessService
    };
  } catch (error: any) {
    console.error('[createBusinessService] Error:', error);
    return {
      success: false,
      error: error.response?.data?.message || 'Failed to create service'
    };
  }
};

/**
 * Get all business services (authenticated)
 */
export const getBusinessServices = async (): Promise<ServiceResponse> => {
  try {
    const response = await apiClient.get<ApiResponse<{ services: BusinessService[] }>>('/api/business/services');
    return {
      success: true,
      data: response.data.data?.services || (response.data.data as any)?.data?.services || []
    };
  } catch (error: any) {
    console.error('[getBusinessServices] Error:', error);
    return {
      success: false,
      error: error.response?.data?.message || 'Failed to fetch services',
      data: []
    };
  }
};

/**
 * Get business service by ID
 */
export const getBusinessServiceById = async (serviceId: string): Promise<ServiceResponse> => {
  try {
    const response = await apiClient.get<ApiResponse<{ service?: BusinessService; data?: BusinessService }>>(`/api/business/services/${serviceId}`);
    return {
      success: true,
      data: (response.data.data as any)?.service || response.data.data as BusinessService
    };
  } catch (error: any) {
    console.error('[getBusinessServiceById] Error:', error);
    return {
      success: false,
      error: error.response?.data?.message || 'Failed to fetch service'
    };
  }
};

/**
 * Update business service
 */
export const updateBusinessService = async (
  serviceId: string, 
  serviceData: Partial<BusinessService>
): Promise<ServiceResponse> => {
  try {
    const response = await apiClient.put<ApiResponse<BusinessService>>(`/api/business/services/${serviceId}`, serviceData);
    return {
      success: true,
      data: response.data.data as BusinessService
    };
  } catch (error: any) {
    console.error('[updateBusinessService] Error:', error);
    return {
      success: false,
      error: error.response?.data?.message || 'Failed to update service'
    };
  }
};

/**
 * Delete business service
 */
export const deleteBusinessService = async (serviceId: string): Promise<ServiceResponse> => {
  try {
    const response = await apiClient.delete<ApiResponse>(`/api/business/services/${serviceId}`);
    return {
      success: true,
      data: response.data.data as any
    };
  } catch (error: any) {
    console.error('[deleteBusinessService] Error:', error);
    return {
      success: false,
      error: error.response?.data?.message || 'Failed to delete service'
    };
  }
};

/**
 * Toggle service active/inactive status
 */
export const toggleBusinessServiceStatus = async (serviceId: string): Promise<ServiceResponse> => {
  try {
    const response = await apiClient.patch<ApiResponse<BusinessService>>(`/api/business/services/${serviceId}/toggle`);
    return {
      success: true,
      data: response.data.data as BusinessService
    };
  } catch (error: any) {
    console.error('[toggleBusinessServiceStatus] Error:', error);
    return {
      success: false,
      error: error.response?.data?.message || 'Failed to toggle service status'
    };
  }
};

/**
 * Get public business services (no auth required)
 */
export const getPublicBusinessServices = async (businessId: string): Promise<ServiceResponse> => {
  try {
    const response = await apiClient.get<ApiResponse<{ services: BusinessService[] }>>(`/api/business/services/public/${businessId}`);
    return {
      success: true,
      data: response.data.data?.services || (response.data.data as any)?.data?.services || []
    };
  } catch (error: any) {
    console.error('[getPublicBusinessServices] Error:', error);
    return {
      success: false,
      error: error.response?.data?.message || 'Failed to fetch services',
      data: []
    };
  }
};






