import React, { useState, useEffect } from 'react';
import { Platform } from 'react-native';
import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../context/ThemeContext';
import { getTheme } from '../constants/themes';
import COLORS from '../constants/colors';
import { SPACING, FONT_SIZES, FONT_WEIGHTS } from '../constants/sizes';
import DiscoverBusinessesScreen from '../screens/common/DiscoverBusinessesScreen';
import DiscoverMarketersScreen from '../screens/common/DiscoverMarketersScreen';
import BusinessMarketers from '../screens/business/BusinessMarketers';
import type { User } from '../types/api';

const Tab = createMaterialTopTabNavigator();

const DiscoverTabNavigator: React.FC = () => {
  const { theme, effectiveTheme } = useTheme();
  const { colors, isDark } = getTheme(effectiveTheme || theme);
  const insets = useSafeAreaInsets();
  const [userType, setUserType] = useState<'business' | 'marketer' | null>(null);

  // Get user type to determine which tabs to show
  useEffect(() => {
    const getUserType = async (): Promise<void> => {
      try {
        const userData = await AsyncStorage.getItem('user');
        if (userData) {
          const user: User = JSON.parse(userData);
          setUserType(user.accountType as 'business' | 'marketer');
        }
      } catch (error) {
        // Error handling
      }
    };
    getUserType();
  }, []);

  // Common tab navigator options
  const tabNavigatorOptions = {
    tabBarActiveTintColor: COLORS.APP_GREEN,
    tabBarInactiveTintColor: colors.textSecondary,
    tabBarStyle: {
      backgroundColor: colors.background,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      elevation: 0,
      shadowOpacity: 0,
      paddingTop: Platform.OS === 'ios' ? Math.max(insets.top, SPACING.sm) : SPACING.sm,
      marginTop: 0,
    },
    tabBarLabelStyle: {
      fontSize: FONT_SIZES.md,
      fontWeight: FONT_WEIGHTS.semibold,
      textTransform: 'none' as const,
    },
    tabBarIndicatorStyle: {
      backgroundColor: COLORS.APP_GREEN,
      height: 3,
    },
    tabBarPressColor: COLORS.APP_GREEN + '20',
    swipeEnabled: true,
  };

  // For businesses, show Marketers and My Marketers tabs
  if (userType === 'business') {
    return (
      <Tab.Navigator screenOptions={tabNavigatorOptions}>
        <Tab.Screen 
          name="Marketers" 
          component={DiscoverMarketersScreen}
          options={{
            tabBarLabel: 'Marketers',
          }}
        />
        <Tab.Screen 
          name="MyMarketers" 
          component={BusinessMarketers}
          options={{
            tabBarLabel: 'My Marketers',
          }}
        />
      </Tab.Navigator>
    );
  }

  // For marketers, show Businesses and Marketers tabs
  return (
    <Tab.Navigator screenOptions={tabNavigatorOptions}>
      <Tab.Screen 
        name="Businesses" 
        component={DiscoverBusinessesScreen}
        options={{
          tabBarLabel: 'Businesses',
        }}
      />
      <Tab.Screen 
        name="Marketers" 
        component={DiscoverMarketersScreen}
        options={{
          tabBarLabel: 'Marketers',
        }}
      />
    </Tab.Navigator>
  );
};

export default DiscoverTabNavigator;





