/**
 * React Navigation Types
 * Type definitions for navigation throughout the app
 */

import type { NavigatorScreenParams } from '@react-navigation/native';
import type { StackScreenProps } from '@react-navigation/stack';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';

// Auth Stack
export type AuthStackParamList = {
  Splash: undefined;
  Onboarding: undefined;
  AccountType: undefined;
  Login: undefined;
  Signup: undefined;
  SignupOTP: { email: string; fullName: string; accountType: string };
  SignupPassword: { email: string; fullName: string; accountType: string };
  SignupProfile: { accountType?: string };
  SignupPlan: { 
    accountType: string; 
    fullName: string; 
    email: string; 
    password?: string; 
    confirmPassword?: string; 
    isUpgrade?: boolean; 
    currentPlan?: string; 
    googleSignup?: boolean;
  };
  SignupPayment: { 
    accountType: string; 
    fullName: string; 
    email: string; 
    password: string; 
    confirmPassword: string;
    plan: any;
    planSlug: string; 
    planType: string; 
    planPrice: number;
    billingCycle: string;
  };
  PlanConfirmation: { 
    accountType: string; 
    fullName: string; 
    email: string; 
    password?: string; 
    confirmPassword?: string;
    plan: any;
    planSlug: string; 
    planType: string; 
    billingCycle?: string;
    planPrice?: number;
    isUpgrade?: boolean;
    currentPlan?: string;
    googleSignup?: boolean;
  };
  ForgotPassword: undefined;
};

// Marketer Tab Navigator
export type MarketerTabParamList = {
  Dashboard: undefined;
  Discover: undefined;
  Referrals: undefined;
  Earnings: undefined;
  Profile: undefined;
};

// Business Tab Navigator
export type BusinessTabParamList = {
  Dashboard: undefined;
  Referrals: undefined;
  Marketers: undefined;
  Projects: undefined;
  Profile: undefined;
};

// Admin Tab Navigator
export type AdminTabParamList = {
  Home: undefined;  // Admin Dashboard
  Businesses: undefined;
  Marketers: undefined;
  Referrals: undefined;
  More: undefined;
};

// Root Navigator
export type RootStackParamList = {
  Auth: NavigatorScreenParams<AuthStackParamList>;
  MarketerTabs: NavigatorScreenParams<MarketerTabParamList>;
  BusinessTabs: NavigatorScreenParams<BusinessTabParamList>;
  AdminTabs: NavigatorScreenParams<AdminTabParamList>;
  
  // Common screens
  DiscoverMarketers: undefined;
  DiscoverMarketerDetails: { marketerId: string };
  DiscoverBusinesses: undefined;
  DiscoverBusinessDetails: { businessId: string; initialData?: any };
  
  // Chat
  ChatList: undefined;
  ChatConversation: { chatId: string; otherUserId?: string };
  NewChat: undefined;
  
  // Notifications
  NotificationPermission: { nextScreen?: string };
  AllActivities: { userType?: 'marketer' | 'business' | 'admin' };
  
  // Business screens
  BusinessSetup: undefined;
  BusinessPreview: { formData: any; user: any }; // formData and user from BusinessSetup
  Organisation: undefined;
  BusinessAccount: undefined;
  Profile: undefined;
  Subscription: undefined;
  CommissionsSetup: undefined;
  TeamMembers: undefined;
  Invites: undefined;
  AddProject: undefined;
  ProjectDetails: { projectId: string; initialData?: any };
  ReferralDetails: { referralId: string };
  MarketerDetails: { marketerId: string };
  MarketerFees: undefined;
  PlatformFees: undefined;
  Notifications: undefined;
  HelpSupport: undefined;
  PrivacySecurity: undefined;
  ThemeSettings: undefined;
  BusinessReports: undefined;
  
  // Marketer screens
  MarketerDashboard: undefined;
  MarketerAccount: undefined;
  MarketerReferrals: undefined;
  MarketerProjects: undefined;
  MarketerBusinesses: undefined;
  MarketerEarnings: undefined;
  MarketerProfessionalProfile: undefined;
  AddReferral: undefined;
  MarketerReferralDetails: { referralId: string; initialData?: any };
  ReferralDetails: { referralId: string; initialData?: any };
  BusinessDetails: { businessId: string; initialData?: any };
          CashoutRequest: { availableBalance?: number };
  PaymentMethodSetup: undefined;
  MarketerProfessionalProfile: undefined;
  MarketerAIMatch: { searchQuery?: string };
  MarketerUpgrade: undefined;
  MarketerReports: undefined;
  
  // Admin screens
  AdminSettings: undefined;
  
  // Auth screens (also accessible via Auth stack)
  Home: undefined;
  AdminTabNavigator: undefined;
  BusinessTabNavigator: undefined;
  MarketerTabNavigator: undefined;
};

// Business Setup Form Data Type
export interface BusinessSetupFormData {
  businessName: string;
  description: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  logo: string | null;
  businessType: 'services' | 'products' | '';
  industries: string[];
  selectedServices: string[];
  salesChannel: string[];
  marketerCount: string;
  commissionRateNew: string;
  commissionRateReturning: string;
}

// Global navigation prop type
declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}

// Type helpers for screen props
export type AuthStackScreenProps<T extends keyof AuthStackParamList> = StackScreenProps<AuthStackParamList, T>;
export type MarketerTabScreenProps<T extends keyof MarketerTabParamList> = CompositeScreenProps<
  BottomTabScreenProps<MarketerTabParamList, T>,
  StackScreenProps<RootStackParamList>
>;
export type BusinessTabScreenProps<T extends keyof BusinessTabParamList> = CompositeScreenProps<
  BottomTabScreenProps<BusinessTabParamList, T>,
  StackScreenProps<RootStackParamList>
>;
export type AdminTabScreenProps<T extends keyof AdminTabParamList> = CompositeScreenProps<
  BottomTabScreenProps<AdminTabParamList, T>,
  StackScreenProps<RootStackParamList>
>;
export type RootStackScreenProps<T extends keyof RootStackParamList> = StackScreenProps<RootStackParamList, T>;

// Common navigation and route types
export type NavigationProp = any; // Will be properly typed in each screen
export type RouteProp<T extends keyof RootStackParamList> = {
  key: string;
  name: T;
  params?: RootStackParamList[T];
  path?: string;
};
