import { useEffect } from 'react';
import { router } from 'expo-router';
import { AppLoadingScreen } from '@/components/AppLoadingScreen';
import { useAuth } from '@/context/AuthContext';
import { settingsService } from '@/services/settings';
import { logger } from '@/utils/logger';
import { isOnboardingComplete, tenantWithOrganizationContact } from '@/utils/onboardingStatus';
import {
  hasCompletedIntroOnboarding,
  markIntroOnboardingComplete,
} from '@/utils/introOnboarding';

export default function Index() {
  const { user, loading, sessionSyncing, activeTenant, wasInvited, suppressAppGuidance, isDriver, interfaceMode } =
    useAuth();
  const homeRoute = interfaceMode === 'simple' ? '/simple' : '/(tabs)';

  useEffect(() => {
    if (loading || sessionSyncing) {
      logger.debug('Index', 'Waiting for auth session...', { loading, sessionSyncing });
      return;
    }

    let cancelled = false;

    (async () => {
      if (!user) {
        logger.info('Index', 'No user, redirecting to login');
        router.replace('/login');
        return;
      }

      if (isDriver) {
        logger.info('Index', 'Driver user, redirecting to deliveries');
        router.replace('/(tabs)/deliveries');
        return;
      }

      if (wasInvited || suppressAppGuidance) {
        logger.info('Index', 'Onboarding skipped (invited or tenured), redirecting home');
        router.replace(homeRoute as never);
        return;
      }

      if (isOnboardingComplete(activeTenant)) {
        logger.info('Index', 'Onboarding complete (tenant), redirecting home');
        router.replace(homeRoute as never);
        return;
      }

      try {
        const organization = await settingsService.getOrganizationSettings();
        if (cancelled) return;
        const tenantWithOrg = tenantWithOrganizationContact(activeTenant, organization);
        if (isOnboardingComplete(tenantWithOrg)) {
          await markIntroOnboardingComplete();
          if (cancelled) return;
          logger.info('Index', 'Onboarding complete (organization settings), redirecting home');
          router.replace(homeRoute as never);
          return;
        }
      } catch (err) {
        logger.warn('Index', 'Could not load organization settings for onboarding check:', err);
      }

      if (cancelled) return;
      logger.info('Index', 'Onboarding required, redirecting to onboarding');
      router.replace('/onboarding');
    })();

    return () => {
      cancelled = true;
    };
  }, [user, loading, sessionSyncing, activeTenant, wasInvited, suppressAppGuidance, isDriver, homeRoute]);

  return <AppLoadingScreen />;
}
