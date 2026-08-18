import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Home, Building2, User, Link, Menu, LucideIcon } from 'lucide-react-native';
import { RouteProp } from '@react-navigation/native';
import COLORS from '../constants/colors';
import { useTheme } from '../context/ThemeContext';
import { getTheme } from '../constants/themes';

// Admin Screens
import AdminDashboardScreen from '../screens/admin/AdminDashboardScreen';
import AdminBusinessesScreen from '../screens/admin/AdminBusinessesScreen';
import AdminMarketersScreen from '../screens/admin/AdminMarketersScreen';
import AdminReferralsScreen from '../screens/admin/AdminReferralsScreen';
import AdminMoreScreen from '../screens/admin/AdminMoreScreen';

// API service for badge counts
import apiClient from '../services/apiClient';
import type { AdminTabParamList } from '../types/navigation';

const Tab = createBottomTabNavigator<AdminTabParamList>();

const AdminTabNavigator: React.FC = () => {
  const { theme, effectiveTheme, isDark } = useTheme();
  const { colors } = getTheme(effectiveTheme || theme);
  const [pendingBusinessCount, setPendingBusinessCount] = useState<number>(0);

  // Fetch pending business approvals count
  useEffect(() => {
    // Add a small delay to avoid simultaneous requests with screen mounts
    const timeoutId = setTimeout(() => {
      fetchPendingCount();
    }, 500);
    
    // Poll every 30 seconds for updates
    const interval = setInterval(fetchPendingCount, 30000);
    return () => {
      clearTimeout(timeoutId);
      clearInterval(interval);
    };
  }, []);

  const fetchPendingCount = async (): Promise<void> => {
    try {
      const response = await apiClient.get<{ success?: boolean; businesses?: any[]; data?: any[]; pagination?: { total: number } }>('/api/admin/businesses?status=pending');
      // Backend returns { success: true, businesses: [...] } without pagination
      if (response.data?.businesses) {
        setPendingBusinessCount(response.data.businesses.length);
      } else if (response.data?.pagination?.total) {
        setPendingBusinessCount(response.data.pagination.total);
      }
    } catch (error: any) {
      // Log detailed error for token issues
      if (error?.response?.status === 401) {
        console.error('[AdminTabNavigator] ⚠️ Token expired or invalid when fetching pending count:', {
          status: error.response.status,
          code: error.response?.data?.code,
          message: error.response?.data?.message,
          expiredAt: error.response?.data?.expiredAt,
        });
      } else {
        console.error('[AdminTabNavigator] Failed to fetch pending count:', error?.response?.data || error?.message);
      }
      // Silently fail - badge count is not critical
    }
  };

  return (
    <Tab.Navigator
      screenOptions={({ route }: { route: RouteProp<AdminTabParamList, keyof AdminTabParamList> }) => ({
        lazy: true, // Lazy load tab screens - only mount when first navigated to
        headerShown: false,
        tabBarIcon: ({ focused, color, size }: { focused: boolean; color: string; size: number }) => {
          let IconComponent: LucideIcon;
          let badgeCount = 0;

          switch (route.name) {
            case 'Home':
              IconComponent = Home;
              break;
            case 'Businesses':
              IconComponent = Building2;
              badgeCount = pendingBusinessCount;
              break;
            case 'Marketers':
              IconComponent = User;
              break;
            case 'Referrals':
              IconComponent = Link;
              break;
            case 'More':
              IconComponent = Menu;
              break;
            default:
              IconComponent = Home;
          }

          return (
            <View style={styles.iconContainer}>
              <IconComponent
                size={size}
                color={color}
                strokeWidth={focused ? 2.5 : 2}
              />
              {badgeCount > 0 && (
                <View style={[styles.badge, { backgroundColor: COLORS.ERROR }]}>
                  <Text style={styles.badgeText}>
                    {badgeCount > 99 ? '99+' : badgeCount}
                  </Text>
                </View>
              )}
            </View>
          );
        },
        tabBarActiveTintColor: COLORS.APP_GREEN,
        tabBarInactiveTintColor: colors.iconSecondary,
        tabBarStyle: {
          backgroundColor: colors.cardBackground,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: Platform.OS === 'ios' ? 85 : 65,
          paddingBottom: Platform.OS === 'ios' ? 25 : 10,
          paddingTop: 8,
          elevation: 8,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.1,
          shadowRadius: 3,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
          marginTop: 2,
        },
      })}
    >
      <Tab.Screen
        name="Home"
        component={AdminDashboardScreen}
        options={{ tabBarLabel: 'Home' }}
      />
      <Tab.Screen
        name="Businesses"
        component={AdminBusinessesScreen}
        options={{ tabBarLabel: 'Businesses' }}
      />
      <Tab.Screen
        name="Marketers"
        component={AdminMarketersScreen}
        options={{ tabBarLabel: 'Marketers' }}
      />
      <Tab.Screen
        name="Referrals"
        component={AdminReferralsScreen}
        options={{ tabBarLabel: 'Referrals' }}
      />
      <Tab.Screen
        name="More"
        component={AdminMoreScreen}
        options={{ tabBarLabel: 'More' }}
      />
    </Tab.Navigator>
  );
};

const styles = StyleSheet.create({
  iconContainer: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -5,
    right: -10,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: COLORS.WHITE,
    fontSize: 10,
    fontWeight: 'bold',
  },
});

export default AdminTabNavigator;



