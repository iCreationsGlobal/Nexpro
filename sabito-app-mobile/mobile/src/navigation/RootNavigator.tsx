import React, { useState, useEffect, lazy, Suspense, ReactNode, ComponentType } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { hasSeenOnboarding, setOnboardingCompleted, clearAllUserData } from '../utils/storage';
import { setSentryUser } from '../config/sentry';
import type { User } from '../types/api';
import type { RootStackParamList } from '../types/navigation';

// Auth Screens
import SplashScreen from '../screens/auth/SplashScreen';
import OnboardingScreen from '../screens/auth/OnboardingScreen';
import AccountTypeScreen from '../screens/auth/AccountTypeScreen';
import LoginScreen from '../screens/auth/LoginScreen';
import ForgotPasswordScreen from '../screens/auth/ForgotPasswordScreen';
import SignupScreen from '../screens/auth/SignupScreen';
import SignupProfileScreen from '../screens/auth/SignupProfileScreen';
import SignupOTPScreen from '../screens/auth/SignupOTPScreen';
import SignupPasswordScreen from '../screens/auth/SignupPasswordScreen';
import SignupPlanScreen from '../screens/auth/SignupPlanScreen';
import PlanConfirmationScreen from '../screens/auth/PlanConfirmationScreen';
import SignupPaymentScreen from '../screens/auth/SignupPaymentScreen';

// Admin Tab Navigator - loaded when needed
import AdminTabNavigator from './AdminTabNavigator';
const AdminCashoutRequestsScreen = lazy(() => import('../screens/admin/AdminCashoutRequestsScreen'));
const AdminPlatformFeesScreen = lazy(() => import('../screens/admin/AdminPlatformFeesScreen'));
const AdminSettingsScreen = lazy(() => import('../screens/admin/AdminSettingsScreen'));
const AdminMarketerDetailsScreen = lazy(() => import('../screens/admin/AdminMarketerDetailsScreen'));
const AdminReferralDetailsScreen = lazy(() => import('../screens/admin/AdminReferralDetailsScreen'));
const AdminProjectDetailsScreen = lazy(() => import('../screens/admin/AdminProjectDetailsScreen'));

// Marketer Tab Navigator
import MarketerTabNavigator from './MarketerTabNavigator';

// Business Tab Navigator - loaded when needed
import BusinessTabNavigator from './BusinessTabNavigator';
const BusinessSetupScreen = lazy(() => import('../screens/business/BusinessSetupScreen'));
const BusinessPreviewScreen = lazy(() => import('../screens/business/BusinessPreviewScreen'));
const ProfileScreen = lazy(() => import('../screens/business/ProfileScreen'));
const OrganisationScreen = lazy(() => import('../screens/business/OrganisationScreen'));
const TeamMembersScreen = lazy(() => import('../screens/business/TeamMembersScreen'));
const InvitesScreen = lazy(() => import('../screens/business/InvitesScreen'));
const SubscriptionScreen = lazy(() => import('../screens/business/SubscriptionScreen'));
const PlatformFeesScreen = lazy(() => import('../screens/business/PlatformFeesScreen'));
const MarketerFeesScreen = lazy(() => import('../screens/business/MarketerFeesScreen'));
const CommissionsSetupScreen = lazy(() => import('../screens/business/CommissionsSetupScreen'));
const ThemeSettingsScreen = lazy(() => import('../screens/business/ThemeSettingsScreen'));
const NotificationsScreen = lazy(() => import('../screens/business/NotificationsScreen'));
const PrivacySecurityScreen = lazy(() => import('../screens/business/PrivacySecurityScreen'));
const HelpSupportScreen = lazy(() => import('../screens/business/HelpSupportScreen'));
const AddProjectScreen = lazy(() => import('../screens/business/AddProjectScreen'));
const BusinessReports = lazy(() => import('../screens/business/BusinessReports'));
const ChatListScreen = lazy(() => import('../screens/chat/ChatListScreen'));
const ChatConversationScreen = lazy(() => import('../screens/chat/ChatConversationScreen'));
const NewChatScreen = lazy(() => import('../screens/chat/NewChatScreen'));
const ReferralDetailsScreen = lazy(() => import('../screens/business/ReferralDetailsScreen'));
const ProjectDetailsScreen = lazy(() => import('../screens/business/ProjectDetailsScreen'));
const MarketerDetailsScreen = lazy(() => import('../screens/business/MarketerDetailsScreen'));
const DiscoverMarketerDetailsScreen = lazy(() => import('../screens/common/DiscoverMarketerDetailsScreen'));
const BusinessDetailsScreen = lazy(() => import('../screens/marketer/BusinessDetailsScreen'));
const MarketerProjects = lazy(() => import('../screens/marketer/MarketerProjects'));
const MarketerReports = lazy(() => import('../screens/marketer/MarketerReports'));
const AddReferralScreen = lazy(() => import('../screens/marketer/AddReferralScreen'));
const MarketerUpgradeScreen = lazy(() => import('../screens/marketer/MarketerUpgradeScreen'));
const MarketerAIMatchScreen = lazy(() => import('../screens/marketer/MarketerAIMatchScreen'));
const MarketerReferralDetailsScreen = lazy(() => import('../screens/marketer/MarketerReferralDetailsScreen'));
const CashoutRequestScreen = lazy(() => import('../screens/marketer/CashoutRequestScreen'));
const PaymentMethodSetupScreen = lazy(() => import('../screens/marketer/PaymentMethodSetupScreen'));
const MarketerProfessionalProfileScreen = lazy(() => import('../screens/marketer/MarketerProfessionalProfileScreen'));

// Common Screens
const AllActivitiesScreen = lazy(() => import('../screens/common/AllActivitiesScreen'));

// Loading component for lazy-loaded screens
const ScreenLoader: React.FC = () => (
  <View style={styles.loader}>
    <ActivityIndicator size="large" color="#1CA700" />
  </View>
);

const Stack = createStackNavigator<RootStackParamList>();

type AccountType = 'admin' | 'business' | 'marketer';

const RootNavigator: React.FC = () => {
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [showSplash, setShowSplash] = useState<boolean>(true);
  const [showOnboarding, setShowOnboarding] = useState<boolean>(false);
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);
  const [userRole, setUserRole] = useState<AccountType | null>(null);

  useEffect(() => {
    checkAuthAndOnboardingStatus();
  }, []);

  const checkAuthAndOnboardingStatus = async (): Promise<void> => {
    try {
      // UNCOMMENT THIS LINE TO CLEAR USER DATA ON APP START (FOR TESTING ONLY)
      // await clearAllUserData(); // DISABLED - Users stay logged in!
      
      // Check if user is already logged in
      const accessToken = await AsyncStorage.getItem('accessToken');
      const refreshToken = await AsyncStorage.getItem('refreshToken');
      const userDataString = await AsyncStorage.getItem('user');
      const userData: User | null = userDataString ? JSON.parse(userDataString) : null;
      
      // User needs both accessToken and refreshToken to be considered logged in
      // If refreshToken is missing, clear all tokens and force re-login
      if (accessToken && refreshToken && userData) {
        // User is logged in with valid tokens
        setIsLoggedIn(true);
        setUserRole((userData.accountType?.toLowerCase() as AccountType) || null);
        setShowOnboarding(false);
        setIsLoading(false);
        
        // Set Sentry user context for error tracking
        setSentryUser(userData);
      } else {
        // User is not logged in or missing tokens, clear any stale data
        if (accessToken && !refreshToken) {
          console.warn('⚠️ Access token found but refresh token missing. Clearing auth data.');
          await AsyncStorage.multiRemove(['accessToken', 'refreshToken', 'user']);
        }
        // User is not logged in, check onboarding status
        const hasCompleted = await hasSeenOnboarding();
        setShowOnboarding(!hasCompleted);
        setIsLoggedIn(false);
        setIsLoading(false);
      }
    } catch (error) {
      setShowOnboarding(true);
      setIsLoggedIn(false);
      setIsLoading(false);
    }
  };

  const handleSplashComplete = async (): Promise<void> => {
    setShowSplash(false);
  };

  const handleOnboardingComplete = async (): Promise<void> => {
    await setOnboardingCompleted();
    // Navigation will be handled by the screen itself
  };

  // Show splash screen
  if (showSplash) {
    return <SplashScreen onAnimationComplete={handleSplashComplete} />;
  }

  // Determine initial route based on auth and onboarding status
  let initialRouteName: keyof RootStackParamList = 'AccountType';
  
  if (isLoggedIn && userRole) {
    // User is logged in, route to appropriate dashboard
    if (userRole === 'admin') {
      initialRouteName = 'AdminTabNavigator';
    } else if (userRole === 'business') {
      initialRouteName = 'BusinessTabNavigator';
    } else if (userRole === 'marketer') {
      initialRouteName = 'MarketerTabNavigator';
    } else {
      // Default to AccountType if role is unknown
      initialRouteName = 'AccountType';
    }
  } else if (showOnboarding) {
    // Not logged in and hasn't seen onboarding
    initialRouteName = 'Onboarding';
  } else {
    // Not logged in but has seen onboarding
    initialRouteName = 'AccountType';
  }

  return (
    <NavigationContainer>
      <Suspense fallback={<ScreenLoader />}>
        <Stack.Navigator
          initialRouteName={initialRouteName}
          screenOptions={{
            headerShown: false,
            cardStyleInterpolator: ({ current, layouts }) => {
              return {
                cardStyle: {
                  transform: [
                    {
                      translateX: current.progress.interpolate({
                        inputRange: [0, 1],
                        outputRange: [layouts.screen.width, 0],
                      }),
                    },
                  ],
                },
              };
            },
            transitionSpec: {
              open: {
                animation: 'timing',
                config: {
                  duration: 250,
                },
              },
              close: {
                animation: 'timing',
                config: {
                  duration: 250,
                },
              },
            },
          }}
        >
        <Stack.Screen name="Onboarding" component={OnboardingScreen} />
        <Stack.Screen name="AccountType" component={AccountTypeScreen} />
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
        <Stack.Screen name="Signup" component={SignupScreen} />
        <Stack.Screen name="SignupProfile" component={SignupProfileScreen} />
        <Stack.Screen name="SignupOTP" component={SignupOTPScreen} />
        <Stack.Screen name="SignupPassword" component={SignupPasswordScreen} />
        <Stack.Screen name="SignupPlan" component={SignupPlanScreen} />
        <Stack.Screen name="PlanConfirmation" component={PlanConfirmationScreen} />
        <Stack.Screen name="SignupPayment" component={SignupPaymentScreen} />
        
        {/* Admin Tab Navigator */}
        <Stack.Screen name="AdminTabNavigator" component={AdminTabNavigator} />
        
        {/* Admin Detail Screens */}
        <Stack.Screen 
          name="AdminBusinessDetails" 
          component={BusinessDetailsScreen as ComponentType<any>}
          options={{ headerShown: false }}
        />
        <Stack.Screen 
          name="AdminMarketerDetails" 
          component={AdminMarketerDetailsScreen as ComponentType<any>}
          options={{ headerShown: false }}
        />
        <Stack.Screen 
          name="AdminReferralDetails" 
          component={AdminReferralDetailsScreen as ComponentType<any>}
          options={{ headerShown: false }}
        />
        <Stack.Screen 
          name="AdminProjectDetails" 
          component={AdminProjectDetailsScreen as ComponentType<any>}
          options={{ headerShown: false }}
        />
        <Stack.Screen 
          name="AdminCashouts" 
          component={AdminCashoutRequestsScreen as ComponentType<any>}
          options={{ headerShown: false }}
        />
        <Stack.Screen 
          name="AdminFinance" 
          component={BusinessReports as ComponentType<any>}
          options={{ headerShown: false }}
        />
        <Stack.Screen 
          name="AdminCommissions" 
          component={AdminPlatformFeesScreen as ComponentType<any>}
          options={{ headerShown: false }}
        />
        <Stack.Screen 
          name="AdminReports" 
          component={BusinessReports as ComponentType<any>}
          options={{ headerShown: false }}
        />
        <Stack.Screen 
          name="AdminWaitingList" 
          component={HelpSupportScreen as ComponentType<any>}
          options={{ headerShown: false }}
        />
        <Stack.Screen 
          name="AdminTeamMembers" 
          component={TeamMembersScreen as ComponentType<any>}
          options={{ headerShown: false }}
        />
        <Stack.Screen 
          name="AdminRoleManagement" 
          component={HelpSupportScreen as ComponentType<any>}
          options={{ headerShown: false }}
        />
        <Stack.Screen 
          name="AdminSettings" 
          component={AdminSettingsScreen as ComponentType<any>}
          options={{ headerShown: false }}
        />
        <Stack.Screen 
          name="AdminHelp" 
          component={HelpSupportScreen as ComponentType<any>}
          options={{ headerShown: false }}
        />
        <Stack.Screen 
          name="AdminProfile" 
          component={AdminSettingsScreen as ComponentType<any>}
          options={{ headerShown: false }}
        />
        <Stack.Screen 
          name="AdminGlobalSearch" 
          component={AllActivitiesScreen as ComponentType<any>}
          options={{ headerShown: false }}
        />
        
        {/* Marketer Screens */}
        <Stack.Screen name="MarketerTabNavigator" component={MarketerTabNavigator} />
        
        {/* Business Screens */}
        <Stack.Screen name="BusinessSetup" component={BusinessSetupScreen as ComponentType<any>} />
        <Stack.Screen name="BusinessPreview" component={BusinessPreviewScreen as ComponentType<any>} />
        <Stack.Screen name="BusinessTabNavigator" component={BusinessTabNavigator} />
        <Stack.Screen name="Profile" component={ProfileScreen as ComponentType<any>} />
        <Stack.Screen name="Organisation" component={OrganisationScreen as ComponentType<any>} />
        <Stack.Screen name="TeamMembers" component={TeamMembersScreen as ComponentType<any>} />
        <Stack.Screen name="Invites" component={InvitesScreen as ComponentType<any>} />
        <Stack.Screen name="Subscription" component={SubscriptionScreen as ComponentType<any>} />
        <Stack.Screen name="PlatformFees" component={PlatformFeesScreen as ComponentType<any>} />
        <Stack.Screen name="MarketerFees" component={MarketerFeesScreen as ComponentType<any>} />
        <Stack.Screen name="CommissionsSetup" component={CommissionsSetupScreen as ComponentType<any>} />
        <Stack.Screen name="ThemeSettings" component={ThemeSettingsScreen as ComponentType<any>} />
        <Stack.Screen name="Notifications" component={NotificationsScreen as ComponentType<any>} />
        <Stack.Screen name="PrivacySecurity" component={PrivacySecurityScreen as ComponentType<any>} />
        <Stack.Screen name="HelpSupport" component={HelpSupportScreen as ComponentType<any>} />
        <Stack.Screen name="AddProject" component={AddProjectScreen as ComponentType<any>} />
        <Stack.Screen name="BusinessReports" component={BusinessReports as ComponentType<any>} />
        
        {/* Common Screens */}
        <Stack.Screen 
          name="AllActivities" 
          component={AllActivitiesScreen as ComponentType<any>}
          options={{
            headerShown: false,
          }}
        />
        
        {/* Chat Screens */}
        <Stack.Screen name="ChatList" component={ChatListScreen as ComponentType<any>} />
        <Stack.Screen name="ChatConversation" component={ChatConversationScreen as ComponentType<any>} />
        <Stack.Screen name="NewChat" component={NewChatScreen as ComponentType<any>} />
        
        {/* Referral Screens */}
        <Stack.Screen name="ReferralDetails" component={ReferralDetailsScreen as ComponentType<any>} />
        
        {/* Project Screens */}
        <Stack.Screen name="ProjectDetails" component={ProjectDetailsScreen as ComponentType<any>} />
        
        {/* Marketer Screens */}
        <Stack.Screen name="MarketerDetails" component={MarketerDetailsScreen as ComponentType<any>} />
        <Stack.Screen name="DiscoverMarketerDetails" component={DiscoverMarketerDetailsScreen as ComponentType<any>} />
        <Stack.Screen name="MarketerProjects" component={MarketerProjects as ComponentType<any>} />
        <Stack.Screen name="MarketerReports" component={MarketerReports as ComponentType<any>} />
        <Stack.Screen name="AddReferral" component={AddReferralScreen as ComponentType<any>} />
        <Stack.Screen name="MarketerUpgrade" component={MarketerUpgradeScreen as ComponentType<any>} options={{ headerShown: false }} />
        <Stack.Screen name="MarketerAIMatch" component={MarketerAIMatchScreen as ComponentType<any>} options={{ headerShown: false }} />
        <Stack.Screen name="MarketerReferralDetails" component={MarketerReferralDetailsScreen as ComponentType<any>} options={{ headerShown: false }} />
        <Stack.Screen name="CashoutRequest" component={CashoutRequestScreen as ComponentType<any>} options={{ headerShown: false }} />
        <Stack.Screen name="PaymentMethodSetup" component={PaymentMethodSetupScreen as ComponentType<any>} options={{ headerShown: false }} />
        <Stack.Screen name="MarketerProfessionalProfile" component={MarketerProfessionalProfileScreen as ComponentType<any>} options={{ headerShown: false }} />
        
        {/* Business Details for Marketer */}
        <Stack.Screen name="BusinessDetails" component={BusinessDetailsScreen as ComponentType<any>} />
        </Stack.Navigator>
      </Suspense>
    </NavigationContainer>
  );
};

const styles = StyleSheet.create({
  loader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default RootNavigator;




