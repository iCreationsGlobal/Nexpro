// API Type Definitions for Mobile App

// Common Types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
}

// Authentication Types
export interface LoginResponse {
  message: string;
  user: User;
  accessToken: string;
  refreshToken: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  accountType: 'marketer' | 'business' | 'admin';
  profileImage?: string;
  isVerified: boolean;
  subscriptionPlan?: string;
  isSubscriptionActive?: boolean;
  subscriptionStartDate?: string;
  subscriptionEndDate?: string;
  createdAt: string;
  updatedAt: string;
}

export interface OtpResponse {
  success: boolean;
  message: string;
  otp?: string; // Only in development
}

export interface SignupResponse {
  message: string;
  user: User;
  accessToken: string;
  refreshToken: string;
  signupBilling?: {
    id: string;
    paystackReference: string;
    amount: number;
  };
}

// Business Types
export interface Business {
  id: string;
  businessId?: string;
  businessName: string;
  name?: string;
  description?: string;
  logo?: string;
  coverImage?: string;
  industry?: string;
  location?: string;
  address?: string;
  services?: string[];
  commissionRateNew?: number;
  commissionRateReturning?: number;
  status?: 'pending' | 'approved' | 'rejected' | 'suspended';
  user?: User;
  hasApplied?: boolean;
  partnershipStatus?: string;
  averageRating?: number;
  totalRatings?: number;
  createdAt: string;
  updatedAt: string;
}

// Referral Types
export interface Referral {
  id: string;
  clientName: string;
  clientEmail?: string;
  clientPhone?: string;
  location?: string;
  businessName?: string;
  status: string;
  marketer?: {
    id: string;
    name: string;
    email?: string;
  };
  business?: Business;
  totalProjects?: number;
  totalAmountPaid?: number;
  createdAt: string;
  updatedAt: string;
}

// Project Types
export interface Project {
  id: string;
  title?: string;
  projectName?: string;
  description?: string;
  estimatedValue?: string | number;
  status: 'active' | 'completed' | 'cancelled';
  referral?: Referral;
  business?: Business;
  createdAt: string;
  updatedAt: string;
}

// Payment Types
export interface Payment {
  id: string;
  amount: number;
  currency: string;
  status: 'pending' | 'paid' | 'failed';
  paystackReference?: string;
  paidAt?: string;
  createdAt: string;
}

// Pricing Plan Types
export interface PricingPlan {
  id: string;
  name: string;
  slug: string;
  type?: string;
  description?: string;
  monthlyPrice: number;
  yearlyPrice?: number;
  yearlyDiscount?: number;
  currency: string;
  features?: {
    core?: (string | { text: string })[];
    [key: string]: any;
  };
  status: 'active' | 'inactive';
  isPopular?: boolean;
  maxMarketerPartnerships?: number | null;
  maxReferralsPerMonth?: number | null;
  platformFeeNew?: number;
  platformFeeReturning?: number;
  showYearlyToggle?: boolean;
}

// Chat Types
export interface Chat {
  id: string;
  type: 'direct' | 'group' | 'system';
  name?: string;
  participantIds: string[];
  participants?: Array<{
    id: string;
    user?: User;
    email?: string;
    name?: string;
    accountType?: string;
    business?: {
      businessName: string;
    };
  }>;
  messages?: Message[];
  lastMessage?: Message;
  unreadCount?: number;
  updatedAt: string;
  createdAt?: string;
}

export interface Message {
  id: string;
  chatId: string;
  senderId: string;
  sender: {
    id: string;
    name?: string;
    email?: string;
  };
  content: string;
  type?: 'text' | 'image' | 'file';
  status?: 'sent' | 'delivered' | 'read';
  read?: boolean;
  createdAt: string;
  updatedAt?: string;
}

// Activity Types
export interface Activity {
  id: string;
  type: string;
  description: string;
  entityType?: string;
  entityId?: string;
  read: boolean;
  createdAt: string;
  updatedAt?: string;
}

// Invite Types
export interface Invite {
  id: string;
  email: string;
  businessId: string;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: string;
  updatedAt?: string;
}

// Platform Fee Types
export interface PlatformFeeInvoice {
  id: string;
  amount: number;
  status: 'pending' | 'paid' | 'overdue' | 'processing';
  dueDate: string;
  paidAt?: string;
  percentage: number;
  clientType: 'new' | 'returning';
  project?: {
    id: string;
    projectName: string;
  };
  business?: Business;
  createdAt?: string;
  updatedAt?: string;
}

export interface PlatformFeeSummary {
  totalRevenue?: number;
  totalUnpaid?: number;
  totalOverdue?: number;
  totalPending?: number;
  totalPaid?: number;
  totalCount?: number;
  pendingCount?: number;
  overdueCount?: number;
  paidCount?: number;
}

// Marketer Fee Types
export interface MarketerFee {
  id: string;
  amount: number;
  status: 'pending' | 'paid';
  project?: Project;
  business?: Business;
  createdAt: string;
  updatedAt?: string;
}

export interface MarketerFeeSummary {
  totalEarnings: number;
  totalPaid: number;
  totalPending: number;
  paidCount: number;
  pendingCount: number;
}

// Marketer Professional Profile Types
export interface MarketerProfessionalProfile {
  id: string;
  userId: string;
  bio?: string;
  experience?: string;
  specialties?: string[];
  certifications?: Array<{
    name: string;
    issuer: string;
    date?: string;
  }>;
  portfolio?: Array<{
    title: string;
    description?: string;
    url?: string;
  }>;
  socialLinks?: {
    linkedin?: string;
    twitter?: string;
    website?: string;
  };
  createdAt?: string;
  updatedAt?: string;
}

// Marketer Earnings Types
export interface MarketerEarnings {
  id: string;
  amount: number;
  status: 'pending' | 'paid';
  cashoutStatus?: string;
  project?: Project;
  business?: Business;
  createdAt: string;
  updatedAt?: string;
}

export interface MarketerEarningsSummary {
  totalEarnings: number;
  availableBalance: number;
  pendingCommissions: number;
  totalPaid: number;
}

// Marketer Reports Types
export interface MarketerReportStats {
  totalReferrals: number;
  convertedReferrals: number;
  conversionRate: number;
  totalEarnings: number;
  activeProjects: number;
  completedProjects: number;
}

// Cashout Request Types
export interface CashoutRequest {
  id: string;
  status: 'pending' | 'processed' | 'paid' | 'rejected';
  amount: number;
  totalAmount?: number;
  feeAmount?: number;
  finalAmount?: number;
  projectCount?: number;
  marketer?: {
    id: string;
    name: string;
    email?: string;
    phone?: string;
    profileImage?: string;
    paymentMethod?: string;
    paymentNumber?: string;
  };
  createdAt: string;
  updatedAt?: string;
  comment?: string;
}
