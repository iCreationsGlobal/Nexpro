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

// Marketer Screens
import MarketerDashboard from '../screens/marketer/MarketerDashboard';
import MarketerBusinesses from '../screens/marketer/MarketerBusinesses';
import MarketerReferrals from '../screens/marketer/MarketerReferrals';
import MarketerEarnings from '../screens/marketer/MarketerEarnings';
import MarketerAccount from '../screens/marketer/MarketerAccount';
import type { MarketerTabParamList } from '../types/navigation';

const Tab = createBottomTabNavigator<MarketerTabParamList>();

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

const MarketerTabNavigator: React.FC = () => {
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
          borderBottomWidth: 0,
          ...Platform.select({
            android: {
              height: 80,
              paddingTop: 0,
              paddingBottom: 0,
            },
            ios: {
              paddingTop: SPACING.sm,
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
              marginBottom: 36,
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
        component={MarketerDashboard}
        options={{
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "grid" : "grid-outline"} size={24} color={color} />
          ),
          tabBarButton: (props) => <AnimatedTabButton {...props} />,
        }}
      />
      
      <Tab.Screen 
        name="Businesses" 
        component={MarketerBusinesses}
        options={{
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "business" : "business-outline"} size={24} color={color} />
          ),
          tabBarButton: (props) => <AnimatedTabButton {...props} />,
        }}
      />
      
      <Tab.Screen 
        name="Referrals" 
        component={MarketerReferrals}
        options={{
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "share-social" : "share-social-outline"} size={24} color={color} />
          ),
          tabBarButton: (props) => <AnimatedTabButton {...props} />,
        }}
      />
      
      <Tab.Screen 
        name="Earnings" 
        component={MarketerEarnings}
        options={{
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "wallet" : "wallet-outline"} size={24} color={color} />
          ),
          tabBarButton: (props) => <AnimatedTabButton {...props} />,
        }}
      />
      
      <Tab.Screen 
        name="Account" 
        component={MarketerAccount}
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

export default MarketerTabNavigator;





