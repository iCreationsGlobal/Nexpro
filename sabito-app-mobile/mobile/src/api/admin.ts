/**
 * Admin API Service
 * Centralized API calls for admin functionality
 */

import apiClient from '../services/apiClient';
import type { ApiResponse, Business, Marketer, Referral, Project, Payment } from '../types/api';

interface ListParams {
  page?: number;
  limit?: number;
  status?: string;
  search?: string;
  [key: string]: any;
}

interface PlatformStats {
  totalUsers?: number;
  activeMarketers?: number;
  activeBusinesses?: number;
  totalRevenue?: number;
  totalCommissions?: number;
  averageCommission?: number;
  conversionRate?: number;
  totalProjects?: number;
  totalReferrals?: number;
  userGrowth?: number;
  marketerGrowth?: number;
  businessGrowth?: number;
  projectGrowth?: number;
  conversionRateChange?: number;
  revenueGrowth?: number;
  commissionGrowth?: number;
  referralGrowth?: number;
  [key: string]: any;
}

interface DashboardSummary {
  platformStats?: PlatformStats;
  [key: string]: any;
}

interface SystemHealth {
  status: string;
  database?: string;
  redis?: string;
  uptime?: number;
  [key: string]: any;
}

interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/**
 * Dashboard APIs
 * Uses the same endpoint as web app: /api/admin/reports
 */
export const getDashboardSummary = async (period: string = 'today'): Promise<ApiResponse<DashboardSummary>> => {
  try {
    const response = await apiClient.get<ApiResponse<DashboardSummary>>(`/api/admin/reports?period=${period}`);
    return response.data;
  } catch (error: any) {
    console.error('Error fetching dashboard summary:', error);
    throw error;
  }
};

export const getSystemHealth = async (): Promise<ApiResponse<SystemHealth>> => {
  try {
    const response = await apiClient.get<ApiResponse<SystemHealth>>('/api/admin/system-health');
    return response.data;
  } catch (error: any) {
    console.error('Error fetching system health:', error);
    throw error;
  }
};

/**
 * Business APIs
 */
export const getAllBusinesses = async (params: ListParams = {}): Promise<ApiResponse<PaginatedResponse<Business>>> => {
  try {
    const { page = 1, limit = 20, status = '', search = '' } = params;
    const statusParam = status ? `&status=${status}` : '';
    const searchParam = search ? `&search=${search}` : '';
    const response = await apiClient.get<ApiResponse<PaginatedResponse<Business>>>(
      `/api/admin/businesses?page=${page}&limit=${limit}${statusParam}${searchParam}`
    );
    return response.data;
  } catch (error: any) {
    console.error('Error fetching businesses:', error);
    throw error;
  }
};

export const getBusinessById = async (businessId: string): Promise<ApiResponse<Business>> => {
  try {
    const response = await apiClient.get<ApiResponse<Business>>(`/api/admin/businesses/${businessId}`);
    return response.data;
  } catch (error: any) {
    console.error('Error fetching business:', error);
    throw error;
  }
};

export const approveBusiness = async (businessId: string): Promise<ApiResponse<Business>> => {
  try {
    const response = await apiClient.put<ApiResponse<Business>>(`/api/admin/businesses/${businessId}/approve`);
    return response.data;
  } catch (error: any) {
    console.error('Error approving business:', error);
    throw error;
  }
};

export const rejectBusiness = async (businessId: string): Promise<ApiResponse<Business>> => {
  try {
    const response = await apiClient.put<ApiResponse<Business>>(`/api/admin/businesses/${businessId}/reject`);
    return response.data;
  } catch (error: any) {
    console.error('Error rejecting business:', error);
    throw error;
  }
};

/**
 * Marketer APIs
 */
export const getAllMarketers = async (params: ListParams = {}): Promise<ApiResponse<PaginatedResponse<Marketer>>> => {
  try {
    const { page = 1, limit = 20, status = '', search = '' } = params;
    const statusParam = status ? `&status=${status}` : '';
    const searchParam = search ? `&search=${search}` : '';
    const response = await apiClient.get<ApiResponse<PaginatedResponse<Marketer>>>(
      `/api/admin/marketers?page=${page}&limit=${limit}${statusParam}${searchParam}`
    );
    return response.data;
  } catch (error: any) {
    console.error('Error fetching marketers:', error);
    throw error;
  }
};

export const getMarketerById = async (marketerId: string): Promise<ApiResponse<Marketer>> => {
  try {
    const response = await apiClient.get<ApiResponse<Marketer>>(`/api/admin/marketers/${marketerId}`);
    return response.data;
  } catch (error: any) {
    console.error('Error fetching marketer:', error);
    throw error;
  }
};

/**
 * User Management APIs
 */
export const suspendUser = async (userId: string): Promise<ApiResponse> => {
  try {
    const response = await apiClient.put<ApiResponse>(`/api/admin/users/${userId}/suspend`);
    return response.data;
  } catch (error: any) {
    console.error('Error suspending user:', error);
    throw error;
  }
};

export const activateUser = async (userId: string): Promise<ApiResponse> => {
  try {
    const response = await apiClient.put<ApiResponse>(`/api/admin/users/${userId}/activate`);
    return response.data;
  } catch (error: any) {
    console.error('Error activating user:', error);
    throw error;
  }
};

export const deleteUser = async (userId: string): Promise<ApiResponse> => {
  try {
    const response = await apiClient.delete<ApiResponse>(`/api/admin/users/${userId}`);
    return response.data;
  } catch (error: any) {
    console.error('Error deleting user:', error);
    throw error;
  }
};

/**
 * Referral APIs
 */
export const getAllReferrals = async (params: ListParams = {}): Promise<ApiResponse<PaginatedResponse<Referral>>> => {
  try {
    const { page = 1, limit = 20, status = '', search = '' } = params;
    const statusParam = status && status !== 'all' ? `&status=${status}` : '';
    const searchParam = search ? `&search=${search}` : '';
    const response = await apiClient.get<ApiResponse<PaginatedResponse<Referral>>>(
      `/api/admin/referrals?page=${page}&limit=${limit}${statusParam}${searchParam}`
    );
    return response.data;
  } catch (error: any) {
    console.error('Error fetching referrals:', error);
    throw error;
  }
};

export const getReferralById = async (referralId: string): Promise<ApiResponse<Referral>> => {
  try {
    const response = await apiClient.get<ApiResponse<Referral>>(`/api/admin/referrals/${referralId}`);
    return response.data;
  } catch (error: any) {
    console.error('Error fetching referral:', error);
    throw error;
  }
};

/**
 * Project APIs
 */
export const getAllProjects = async (params: ListParams = {}): Promise<ApiResponse<PaginatedResponse<Project>>> => {
  try {
    const { page = 1, limit = 20, status = '', search = '' } = params;
    const statusParam = status && status !== 'all' ? `&status=${status}` : '';
    const searchParam = search ? `&search=${search}` : '';
    const response = await apiClient.get<ApiResponse<PaginatedResponse<Project>>>(
      `/api/admin/projects?page=${page}&limit=${limit}${statusParam}${searchParam}`
    );
    return response.data;
  } catch (error: any) {
    console.error('Error fetching projects:', error);
    throw error;
  }
};

export const getProjectById = async (projectId: string): Promise<ApiResponse<Project>> => {
  try {
    const response = await apiClient.get<ApiResponse<Project>>(`/api/admin/projects/${projectId}`);
    return response.data;
  } catch (error: any) {
    console.error('Error fetching project:', error);
    throw error;
  }
};

/**
 * Cashout Request APIs
 */
interface CashoutRequest {
  id: string;
  userId: string;
  amount: number;
  status: 'pending' | 'approved' | 'rejected' | 'completed';
  createdAt: string;
  [key: string]: any;
}

export const getAllCashoutRequests = async (params: ListParams = {}): Promise<ApiResponse<PaginatedResponse<CashoutRequest>>> => {
  try {
    const { page = 1, limit = 20, status = '' } = params;
    const statusParam = status ? `&status=${status}` : '';
    const response = await apiClient.get<ApiResponse<PaginatedResponse<CashoutRequest>>>(
      `/api/admin/cashout-requests?page=${page}&limit=${limit}${statusParam}`
    );
    return response.data;
  } catch (error: any) {
    console.error('Error fetching cashout requests:', error);
    throw error;
  }
};

export const updateCashoutStatus = async (
  cashoutId: string, 
  status: 'pending' | 'approved' | 'rejected' | 'completed'
): Promise<ApiResponse<CashoutRequest>> => {
  try {
    const response = await apiClient.put<ApiResponse<CashoutRequest>>(`/api/admin/cashout-requests/${cashoutId}/status`, { status });
    return response.data;
  } catch (error: any) {
    console.error('Error updating cashout status:', error);
    throw error;
  }
};

/**
 * Financial APIs
 */
interface Earnings {
  id: string;
  marketerId: string;
  amount: number;
  status: string;
  createdAt: string;
  [key: string]: any;
}

export const getAllEarnings = async (params: ListParams = {}): Promise<ApiResponse<PaginatedResponse<Earnings>>> => {
  try {
    const { page = 1, limit = 20 } = params;
    const response = await apiClient.get<ApiResponse<PaginatedResponse<Earnings>>>(`/api/admin/earnings?page=${page}&limit=${limit}`);
    return response.data;
  } catch (error: any) {
    console.error('Error fetching earnings:', error);
    throw error;
  }
};

interface PlatformFee {
  id: string;
  businessId: string;
  amount: number;
  status: string;
  createdAt: string;
  [key: string]: any;
}

export const getPlatformFees = async (params: ListParams = {}): Promise<ApiResponse<PaginatedResponse<PlatformFee>>> => {
  try {
    const { page = 1, limit = 20, status = '' } = params;
    const statusParam = status ? `&status=${status}` : '';
    const response = await apiClient.get<ApiResponse<PaginatedResponse<PlatformFee>>>(
      `/api/admin/platform-fees?page=${page}&limit=${limit}${statusParam}`
    );
    return response.data;
  } catch (error: any) {
    console.error('Error fetching platform fees:', error);
    throw error;
  }
};

interface Subscription {
  id: string;
  userId: string;
  plan: string;
  status: string;
  startDate: string;
  endDate: string;
  [key: string]: any;
}

export const getSubscriptions = async (params: ListParams = {}): Promise<ApiResponse<PaginatedResponse<Subscription>>> => {
  try {
    const { page = 1, limit = 20, status = '' } = params;
    const statusParam = status ? `&status=${status}` : '';
    const response = await apiClient.get<ApiResponse<PaginatedResponse<Subscription>>>(
      `/api/admin/subscriptions?page=${page}&limit=${limit}${statusParam}`
    );
    return response.data;
  } catch (error: any) {
    console.error('Error fetching subscriptions:', error);
    throw error;
  }
};

interface PlatformRevenue {
  totalRevenue?: number;
  monthlyRevenue?: number;
  yearlyRevenue?: number;
  [key: string]: any;
}

export const getPlatformRevenue = async (): Promise<ApiResponse<PlatformRevenue>> => {
  try {
    const response = await apiClient.get<ApiResponse<PlatformRevenue>>('/api/admin/platform-revenue');
    return response.data;
  } catch (error: any) {
    console.error('Error fetching platform revenue:', error);
    throw error;
  }
};

/**
 * Reports APIs
 */
interface Report {
  id: string;
  type: string;
  data: any;
  createdAt: string;
  [key: string]: any;
}

export const getReports = async (params: ListParams = {}): Promise<ApiResponse<PaginatedResponse<Report>>> => {
  try {
    const { page = 1, limit = 20 } = params;
    const response = await apiClient.get<ApiResponse<PaginatedResponse<Report>>>(`/api/admin/reports?page=${page}&limit=${limit}`);
    return response.data;
  } catch (error: any) {
    console.error('Error fetching reports:', error);
    throw error;
  }
};

export const generateReport = async (
  reportType: string, 
  params: Record<string, any> = {}
): Promise<ApiResponse<Report>> => {
  try {
    const response = await apiClient.post<ApiResponse<Report>>('/api/admin/reports/generate', {
      reportType,
      ...params,
    });
    return response.data;
  } catch (error: any) {
    console.error('Error generating report:', error);
    throw error;
  }
};

/**
 * Waiting List APIs
 */
interface WaitingListEntry {
  id: string;
  email: string;
  name?: string;
  status: string;
  createdAt: string;
  [key: string]: any;
}

export const getWaitingList = async (params: ListParams = {}): Promise<ApiResponse<PaginatedResponse<WaitingListEntry>>> => {
  try {
    const { page = 1, limit = 20, status = '' } = params;
    const statusParam = status ? `&status=${status}` : '';
    const response = await apiClient.get<ApiResponse<PaginatedResponse<WaitingListEntry>>>(
      `/api/admin/waiting-list?page=${page}&limit=${limit}${statusParam}`
    );
    return response.data;
  } catch (error: any) {
    console.error('Error fetching waiting list:', error);
    throw error;
  }
};

export const updateWaitingListStatus = async (
  entryId: string, 
  status: string
): Promise<ApiResponse<WaitingListEntry>> => {
  try {
    const response = await apiClient.put<ApiResponse<WaitingListEntry>>(`/api/admin/waiting-list/${entryId}/status`, { status });
    return response.data;
  } catch (error: any) {
    console.error('Error updating waiting list status:', error);
    throw error;
  }
};

/**
 * Team Management APIs
 */
interface TeamMember {
  id: string;
  email: string;
  name: string;
  role: string;
  createdAt: string;
  [key: string]: any;
}

export const getTeamMembers = async (params: ListParams = {}): Promise<ApiResponse<PaginatedResponse<TeamMember>>> => {
  try {
    const { page = 1, limit = 20 } = params;
    const response = await apiClient.get<ApiResponse<PaginatedResponse<TeamMember>>>(`/api/admin/team-members?page=${page}&limit=${limit}`);
    return response.data;
  } catch (error: any) {
    console.error('Error fetching team members:', error);
    throw error;
  }
};

/**
 * Global Search API
 */
interface SearchResult {
  type: 'user' | 'business' | 'marketer' | 'referral' | 'project';
  data: any;
  [key: string]: any;
}

export const globalSearch = async (query: string): Promise<ApiResponse<SearchResult[]>> => {
  try {
    const response = await apiClient.get<ApiResponse<SearchResult[]>>(`/api/admin/search?q=${encodeURIComponent(query)}`);
    return response.data;
  } catch (error: any) {
    console.error('Error performing global search:', error);
    throw error;
  }
};

export default {
  getDashboardSummary,
  getSystemHealth,
  getAllBusinesses,
  getBusinessById,
  approveBusiness,
  rejectBusiness,
  getAllMarketers,
  getMarketerById,
  suspendUser,
  activateUser,
  deleteUser,
  getAllReferrals,
  getReferralById,
  getAllProjects,
  getProjectById,
  getAllCashoutRequests,
  updateCashoutStatus,
  getAllEarnings,
  getPlatformFees,
  getSubscriptions,
  getPlatformRevenue,
  getReports,
  generateReport,
  getWaitingList,
  updateWaitingListStatus,
  getTeamMembers,
  globalSearch,
};





