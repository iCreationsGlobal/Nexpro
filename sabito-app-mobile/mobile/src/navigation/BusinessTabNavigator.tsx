import React, { useRef } from 'react';
import { Animated, Pressable, Platform, StyleProp, ViewStyle } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
import { useTheme } from '../context/ThemeContext';
import { getTheme } from '../constants/themes';
import COLORS from '../constants/colors';
import { SPACING, FONT_WEIGHTS } from '../constants/sizes';

// Business Screens
import BusinessDashboard from '../screens/business/BusinessDashboard';
import BusinessReferrals from '../screens/business/BusinessReferrals';
import BusinessProjects from '../screens/business/BusinessProjects';
import BusinessAccount from '../screens/business/BusinessAccount';
import DiscoverTabNavigator from './DiscoverTabNavigator';
import type { BusinessTabParamList } from '../types/navigation';

const Tab = createBottomTabNavigator<BusinessTabParamList>();

interface AnimatedTabButtonProps extends BottomTabBarButtonProps {
  children: React.ReactNode;
}

// Animated Tab Button Component
const AnimatedTabButton: React.FC<AnimatedTabButtonProps> = ({ children, onPress, ...props }) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = (): void => {
    Animated.spring(scaleAnim, {
      toValue: 1.2, // Scale UP to 120%
      useNativeDriver: true,
      tension: 400,
      friction: 8,
    }).start();
  };

  const handlePressOut = (): void => {
    Animated.spring(scaleAnim, {
      toValue: 1, // Back to normal
      useNativeDriver: true,
      tension: 400,
      friction: 8,
    }).start();
  };

  return (
    <Pressable
      {...props}
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={{ flex: 1, alignItems: 'center', justifyContent: 'center' } as StyleProp<ViewStyle>}
    >
      <Animated.View 
        style={[
          { 
            alignItems: 'center', 
            justifyContent: 'center',
            paddingVertical: 8,
            paddingHorizontal: 12,
            transform: [{ scale: scaleAnim }] 
          }
        ]}
      >
        {children}
      </Animated.View>
    </Pressable>
  );
};

const BusinessTabNavigator: React.FC = () => {
  const { theme, effectiveTheme } = useTheme();
  const { colors, isDark } = getTheme(effectiveTheme || theme);
  const insets = useSafeAreaInsets();
  
  return (
    <Tab.Navigator
      screenOptions={{
        lazy: true, // Lazy load tab screens - only mount when first navigated to
        headerShown: false,
        tabBarActiveTintColor: COLORS.APP_GREEN,
        tabBarInactiveTintColor: isDark ? colors.textSecondary : COLORS.GRAY,
        tabBarStyle: {
          backgroundColor: colors.cardBackground,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          ...Platform.select({
            android: {
              height: 80,
              paddingTop: 0,
              paddingBottom: 0,
            },
            ios: {
              paddingTop: SPACING.xl,
              paddingBottom: Math.max(insets.bottom, SPACING.md),
              height: 60 + Math.max(insets.bottom, SPACING.md),
            },
          }),
          marginBottom: 0,
          width: '100%',
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: isDark ? 0.3 : 0.05,
          shadowRadius: 4,
          elevation: 8,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: FONT_WEIGHTS.medium,
          ...Platform.select({
            android: {
              marginTop: 0,
              marginBottom: 32,
            },
            ios: {
              marginTop: 4,
            },
          }),
        },
        tabBarIconStyle: {
          ...Platform.select({
            android: {
              marginTop: 8,
              marginBottom: 0,
            },
            ios: {
              marginTop: 4,
            },
          }),
        },
      }}
    >
      <Tab.Screen 
        name="Home" 
        component={BusinessDashboard}
        options={{
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "grid" : "grid-outline"} size={24} color={color} />
          ),
          tabBarButton: (props) => <AnimatedTabButton {...props} />,
        }}
      />
      
      <Tab.Screen 
        name="Referrals" 
        component={BusinessReferrals}
        options={{
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "share-social" : "share-social-outline"} size={24} color={color} />
          ),
          tabBarButton: (props) => <AnimatedTabButton {...props} />,
        }}
      />

      <Tab.Screen 
        name="Marketers" 
        component={DiscoverTabNavigator}
        options={{
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "megaphone" : "megaphone-outline"} size={24} color={color} />
          ),
          tabBarButton: (props) => <AnimatedTabButton {...props} />,
        }}
      />
      
      <Tab.Screen 
        name="Projects" 
        component={BusinessProjects}
        options={{
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "briefcase" : "briefcase-outline"} size={24} color={color} />
          ),
          tabBarButton: (props) => <AnimatedTabButton {...props} />,
        }}
      />
      
      <Tab.Screen 
        name="Account" 
        component={BusinessAccount}
        options={{
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "person" : "person-outline"} size={24} color={color} />
          ),
          tabBarButton: (props) => <AnimatedTabButton {...props} />,
        }}
      />
    </Tab.Navigator>
  );
};

export default BusinessTabNavigator;





