import React, { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { hasSeenOnboarding, setOnboardingCompleted } from '../utils/storage';
import { TOKEN_KEY } from '../config/env';
import { getMarketerSession } from '../api/absMarketer';

import SplashScreen from '../screens/auth/SplashScreen';
import OnboardingScreen from '../screens/auth/OnboardingScreen';
import LoginScreen from '../screens/auth/LoginScreen';
import SignupScreen from '../screens/auth/SignupScreen';
import SignupProfileScreen from '../screens/auth/SignupProfileScreen';
import SignupPasswordScreen from '../screens/auth/SignupPasswordScreen';
import MarketerTabNavigator from './MarketerTabNavigator';

/** Fail boot session validation quickly so a bad/hanging API cannot pin the splash. */
const SESSION_BOOT_TIMEOUT_MS = 8000;

const BusinessDetailsScreen = lazy(() => import('../screens/marketer/BusinessDetailsScreen'));
const AddReferralScreen = lazy(() => import('../screens/marketer/AddReferralScreen'));
const MarketerReferralDetailsScreen = lazy(() => import('../screens/marketer/MarketerReferralDetailsScreen'));
const CashoutRequestScreen = lazy(() => import('../screens/marketer/CashoutRequestScreen'));
const PaymentMethodSetupScreen = lazy(() => import('../screens/marketer/PaymentMethodSetupScreen'));
const ProfileEditScreen = lazy(() => import('../screens/marketer/ProfileEditScreen'));
const ThemeSettingsScreen = lazy(() => import('../screens/marketer/ThemeSettingsScreen'));
const HelpSupportScreen = lazy(() => import('../screens/marketer/HelpSupportScreen'));
const AllActivitiesScreen = lazy(() => import('../screens/marketer/AllActivitiesScreen'));

const ScreenLoader = () => (
  <View style={styles.loader}>
    <ActivityIndicator size="large" color="#1CA700" />
  </View>
);

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

const Stack = createStackNavigator();

const RootNavigator: React.FC = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [showSplash, setShowSplash] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  const checkAuthAndOnboardingStatus = useCallback(async () => {
    try {
      const seen = await hasSeenOnboarding();
      setShowOnboarding(!seen);

      const token = await AsyncStorage.getItem(TOKEN_KEY);
      if (token) {
        try {
          await withTimeout(
            getMarketerSession(),
            SESSION_BOOT_TIMEOUT_MS,
            'Marketer session check'
          );
          setIsLoggedIn(true);
          // Returning users with a valid session skip onboarding
          setShowOnboarding(false);
        } catch {
          await AsyncStorage.removeItem(TOKEN_KEY);
          setIsLoggedIn(false);
        }
      } else {
        setIsLoggedIn(false);
      }
    } catch {
      setIsLoggedIn(false);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuthAndOnboardingStatus();
  }, [checkAuthAndOnboardingStatus]);

  const handleSplashComplete = useCallback(() => setShowSplash(false), []);

  const handleOnboardingComplete = useCallback(async () => {
    await setOnboardingCompleted();
    setShowOnboarding(false);
  }, []);

  const handleLoginSuccess = useCallback(() => setIsLoggedIn(true), []);

  const handleLogout = useCallback(async () => {
    await AsyncStorage.removeItem(TOKEN_KEY);
    setIsLoggedIn(false);
  }, []);

  // SplashScreen callback is `onAnimationComplete` (not `onFinish`).
  // Keep splash and auth loading separate so a hanging session check cannot pin the brand splash.
  if (showSplash) {
    return <SplashScreen onAnimationComplete={handleSplashComplete} />;
  }

  if (isLoading) {
    return <ScreenLoader />;
  }

  return (
    <NavigationContainer>
      <Suspense fallback={<ScreenLoader />}>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          {showOnboarding ? (
            <Stack.Screen name="Onboarding">
              {(props) => (
                <OnboardingScreen {...props} onComplete={handleOnboardingComplete} />
              )}
            </Stack.Screen>
          ) : !isLoggedIn ? (
            <>
              <Stack.Screen name="Login">
                {(props) => <LoginScreen {...props} onLoginSuccess={handleLoginSuccess} />}
              </Stack.Screen>
              <Stack.Screen name="Signup" component={SignupScreen} />
              <Stack.Screen name="SignupProfile" component={SignupProfileScreen} />
              <Stack.Screen name="SignupPassword">
                {(props) => (
                  <SignupPasswordScreen {...props} onLoginSuccess={handleLoginSuccess} />
                )}
              </Stack.Screen>
            </>
          ) : (
            <>
              <Stack.Screen name="MarketerTabs">
                {() => <MarketerTabNavigator onLogout={handleLogout} />}
              </Stack.Screen>
              <Stack.Screen name="BusinessDetails" component={BusinessDetailsScreen} />
              <Stack.Screen name="AddReferral" component={AddReferralScreen} />
              <Stack.Screen name="MarketerReferralDetails" component={MarketerReferralDetailsScreen} />
              <Stack.Screen name="CashoutRequest" component={CashoutRequestScreen} />
              <Stack.Screen name="PaymentMethodSetup" component={PaymentMethodSetupScreen} />
              <Stack.Screen name="Profile" component={ProfileEditScreen} />
              <Stack.Screen name="ThemeSettings" component={ThemeSettingsScreen} />
              <Stack.Screen name="HelpSupport" component={HelpSupportScreen} />
              <Stack.Screen name="AllActivities" component={AllActivitiesScreen} />
            </>
          )}
        </Stack.Navigator>
      </Suspense>
    </NavigationContainer>
  );
};

const styles = StyleSheet.create({
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
});

export default RootNavigator;
