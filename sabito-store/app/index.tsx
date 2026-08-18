import AsyncStorage from '@react-native-async-storage/async-storage';
import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { LoadingState, Screen } from '@/components/ui';
import { STORAGE_KEYS } from '@/constants';

export default function Index() {
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState<boolean | null>(null);

  useEffect(() => {
    (async () => {
      const value = await AsyncStorage.getItem(STORAGE_KEYS.onboardingComplete);
      setHasCompletedOnboarding(value === 'true');
    })();
  }, []);

  if (hasCompletedOnboarding === null) {
    return (
      <Screen>
        <LoadingState label="Preparing Sabito Store..." />
      </Screen>
    );
  }

  return <Redirect href={hasCompletedOnboarding ? '/(tabs)' : '/onboarding'} />;
}
