/**
 * Status Colors Utility
 * Centralized status color definitions matching web app's StatusBadge.jsx
 * All colors are synced with frontend/src/components/general_components/StatusBadge.jsx
 */

export interface StatusColor {
  bg: string;
  color: string;
  border: string;
}

export interface StatusColorsMap {
  [key: string]: StatusColor;
}

export const STATUS_COLORS: {
  referral: StatusColorsMap;
  lead: StatusColorsMap;
  business: StatusColorsMap;
  project: StatusColorsMap;
  partnership: StatusColorsMap;
  commission: StatusColorsMap;
  payment: StatusColorsMap;
  cashout: StatusColorsMap;
  invite: StatusColorsMap;
  user: StatusColorsMap;
  generic: StatusColorsMap;
} = {
  // Referral statuses
  referral: {
    New: { bg: '#FDEFFF', color: '#FF00B6', border: '#FF00B6' },
    Converted: { bg: '#E3F2FD', color: '#1E88E5', border: '#1E88E5' },
    Contacted: { bg: '#FFF8E1', color: '#F9A825', border: '#F9A825' },
    Interested: { bg: '#E8F5E9', color: '#388E3C', border: '#388E3C' },
    Unresponsive: { bg: '#F0F0F0', color: '#9E9E9E', border: '#9E9E9E' },
    Rejected: { bg: '#FFEBEE', color: '#D32F2F', border: '#D32F2F' },
    Qualified: { bg: '#E3F2FD', color: '#1E88E5', border: '#1E88E5' },
    completed: { bg: '#E8F5E9', color: '#1CA700', border: '#1CA700' },
    pending: { bg: '#FFF8E1', color: '#F9A825', border: '#F9A825' },
  },

  // Lead statuses
  lead: {
    New: { bg: '#FDEFFF', color: '#FF00B6', border: '#FF00B6' },
    Contacted: { bg: '#FFF8E1', color: '#F9A825', border: '#F9A825' },
    Interested: { bg: '#E8F5E9', color: '#388E3C', border: '#388E3C' },
    Qualified: { bg: '#E3F2FD', color: '#1E88E5', border: '#1E88E5' },
    Converted: { bg: '#E8F5E9', color: '#1CA700', border: '#1CA700' },
    Unresponsive: { bg: '#F0F0F0', color: '#9E9E9E', border: '#9E9E9E' },
    Rejected: { bg: '#FFEBEE', color: '#D32F2F', border: '#D32F2F' },
  },

  // Business statuses
  business: {
    approved: { bg: '#E8F5E9', color: '#388E3C', border: '#388E3C' },
    pending: { bg: '#FFF8E1', color: '#F9A825', border: '#F9A825' },
    rejected: { bg: '#FFEBEE', color: '#D32F2F', border: '#D32F2F' },
    suspended: { bg: '#F0F0F0', color: '#9E9E9E', border: '#9E9E9E' },
  },

  // Project statuses
  project: {
    Paid: { bg: '#E8F5E9', color: '#1CA700', border: '#1CA700' },
    Pending: { bg: '#FFF8E1', color: '#F9A825', border: '#F9A825' },
    Cancelled: { bg: '#fbe9e7', color: '#dc3545', border: '#dc3545' },
    'In Progress': { bg: '#FFF3CD', color: '#FFA500', border: '#FFA500' },
    Completed: { bg: '#E8F5E9', color: '#1CA700', border: '#1CA700' },
    'On Hold': { bg: '#FBE9E7', color: '#dc3545', border: '#dc3545' },
    in_progress: { bg: '#FFF3CD', color: '#FFA500', border: '#FFA500' },
    completed: { bg: '#E8F5E9', color: '#1CA700', border: '#1CA700' },
    pending: { bg: '#FFF8E1', color: '#F9A825', border: '#F9A825' },
    cancelled: { bg: '#fbe9e7', color: '#dc3545', border: '#dc3545' },
    paid: { bg: '#E8F5E9', color: '#1CA700', border: '#1CA700' },
    'on hold': { bg: '#FBE9E7', color: '#dc3545', border: '#dc3545' },
  },

  // Partnership/Marketer statuses
  partnership: {
    accepted: { bg: '#E8F5E9', color: '#1CA700', border: '#1CA700' },
    pending: { bg: '#FFF8E1', color: '#F9A825', border: '#F9A825' },
    rejected: { bg: '#FFEBEE', color: '#D32F2F', border: '#D32F2F' },
    cancelled: { bg: '#F0F0F0', color: '#9E9E9E', border: '#9E9E9E' },
    approved: { bg: '#E8F5E9', color: '#1CA700', border: '#1CA700' },
    suspended: { bg: '#F0F0F0', color: '#9E9E9E', border: '#9E9E9E' },
  },

  // Commission/Earnings statuses
  commission: {
    paid: { bg: '#E8F5E9', color: '#1CA700', border: '#1CA700' },
    pending: { bg: '#FFF8E1', color: '#F9A825', border: '#F9A825' },
    cancelled: { bg: '#fee2e2', color: '#EF4444', border: '#EF4444' },
    processing: { bg: '#dbeafe', color: '#3B82F6', border: '#3B82F6' },
  },

  // Payment statuses
  payment: {
    paid: { bg: '#E8F5E9', color: '#1CA700', border: '#1CA700' },
    unpaid: { bg: '#FFF8E1', color: '#F9A825', border: '#F9A825' },
    partially_paid: { bg: '#dbeafe', color: '#3B82F6', border: '#3B82F6' },
    overdue: { bg: '#fee2e2', color: '#EF4444', border: '#EF4444' },
  },

  // Cashout/Withdrawal statuses
  cashout: {
    available: { bg: '#dbeafe', color: '#3B82F6', border: '#3B82F6' },
    processing: { bg: '#FFF8E1', color: '#F9A825', border: '#F9A825' },
    pending: { bg: '#FFF8E1', color: '#F9A825', border: '#F9A825' },
    approved: { bg: '#E8F5E9', color: '#1CA700', border: '#1CA700' },
    rejected: { bg: '#FFEBEE', color: '#D32F2F', border: '#D32F2F' },
    processed: { bg: '#d1fae5', color: '#10B981', border: '#10B981' },
    paid: { bg: '#E8F5E9', color: '#1CA700', border: '#1CA700' },
  },

  // Invite statuses
  invite: {
    pending: { bg: '#FFF8E1', color: '#F9A825', border: '#F9A825' },
    accepted: { bg: '#E8F5E9', color: '#1CA700', border: '#1CA700' },
    rejected: { bg: '#FFEBEE', color: '#D32F2F', border: '#D32F2F' },
    expired: { bg: '#F0F0F0', color: '#9E9E9E', border: '#9E9E9E' },
    declined: { bg: '#FFEBEE', color: '#D32F2F', border: '#D32F2F' }, // Alias for rejected
  },

  // User/Team statuses
  user: {
    active: { bg: '#E8F5E9', color: '#1CA700', border: '#1CA700' },
    inactive: { bg: '#F0F0F0', color: '#9E9E9E', border: '#9E9E9E' },
    suspended: { bg: '#FFEBEE', color: '#D32F2F', border: '#D32F2F' },
    deactivated: { bg: '#F0F0F0', color: '#9E9E9E', border: '#9E9E9E' },
    pending: { bg: '#FFF8E1', color: '#F9A825', border: '#F9A825' },
  },

  // Generic statuses for fallback
  generic: {
    active: { bg: '#E8F5E9', color: '#1CA700', border: '#1CA700' },
    inactive: { bg: '#F0F0F0', color: '#9E9E9E', border: '#9E9E9E' },
    pending: { bg: '#FFF8E1', color: '#F9A825', border: '#F9A825' },
    completed: { bg: '#E8F5E9', color: '#1CA700', border: '#1CA700' },
    cancelled: { bg: '#FFEBEE', color: '#D32F2F', border: '#D32F2F' },
    processing: { bg: '#dbeafe', color: '#3B82F6', border: '#3B82F6' },
    approved: { bg: '#E8F5E9', color: '#388E3C', border: '#388E3C' },
    rejected: { bg: '#FFEBEE', color: '#D32F2F', border: '#D32F2F' },
  },
};

export type StatusType = 
  | 'referral'
  | 'lead'
  | 'business'
  | 'project'
  | 'partnership'
  | 'commission'
  | 'payment'
  | 'cashout'
  | 'invite'
  | 'user'
  | 'generic';

/**
 * Get status color for a specific status and type
 * @param status - The status value (e.g., 'pending', 'approved')
 * @param type - The status type (e.g., 'business', 'project', 'referral')
 * @returns Color object with bg, color, and border properties
 */
export const getStatusColor = (status: string | null | undefined, type: StatusType = 'generic'): StatusColor => {
  if (!status) return STATUS_COLORS.generic.pending;

  // Normalize status to lowercase for better matching
  const normalizedStatus = status.toString().toLowerCase();
  const originalStatus = status.toString();

  // Try to find color by type and status
  if (STATUS_COLORS[type]) {
    // Try exact match first
    if (STATUS_COLORS[type][originalStatus]) {
      return STATUS_COLORS[type][originalStatus];
    }
    // Try normalized match
    if (STATUS_COLORS[type][normalizedStatus]) {
      return STATUS_COLORS[type][normalizedStatus];
    }
    // Try with first letter capitalized
    const capitalizedStatus = originalStatus.charAt(0).toUpperCase() + originalStatus.slice(1);
    if (STATUS_COLORS[type][capitalizedStatus]) {
      return STATUS_COLORS[type][capitalizedStatus];
    }
  }

  // Try generic statuses
  if (STATUS_COLORS.generic[normalizedStatus]) {
    return STATUS_COLORS.generic[normalizedStatus];
  }

  // Final fallback
  return { bg: '#F0F0F0', color: '#555555', border: '#9E9E9E' };
};

/**
 * Get all status colors for a specific type
 * @param type - The status type (e.g., 'business', 'project', 'referral')
 * @returns Object containing all status colors for that type
 */
export const getStatusColors = (type: StatusType = 'generic'): StatusColorsMap => {
  return STATUS_COLORS[type] || STATUS_COLORS.generic;
};

export default {
  STATUS_COLORS,
  getStatusColor,
  getStatusColors,
};





