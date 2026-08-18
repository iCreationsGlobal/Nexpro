/**
 * Notification Permission Request Screen
 * Can be shown during onboarding or first app launch
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Bell } from 'lucide-react-native';
import { Button } from 'react-native-paper';
import AsyncStorage from '@react-native-async-storage/async-storage';
import COLORS from '../../constants/colors';
import { SPACING, FONT_SIZES, FONT_WEIGHTS, LAYOUT_PADDING } from '../../constants/sizes';
import { ICON_SIZES } from '../../constants/icons';
import { requestNotificationPermission } from '../../services/permissions';
import type { RootStackScreenProps } from '../../types/navigation';

type NotificationPermissionScreenProps = RootStackScreenProps<'NotificationPermission'>;

interface BenefitItemProps {
  text: string;
}

const BenefitItem: React.FC<BenefitItemProps> = ({ text }) => (
  <View style={styles.benefitItem}>
    <View style={styles.bullet} />
    <Text style={styles.benefitText}>{text}</Text>
  </View>
);

const NotificationPermissionScreen: React.FC<NotificationPermissionScreenProps> = ({ navigation, route }) => {
  const { nextScreen } = route.params || {};

  const handleAllow = async (): Promise<void> => {
    const granted = await requestNotificationPermission();
    
    if (granted) {
      // Mark that we've asked for notification permission
      await AsyncStorage.setItem('notificationPermissionAsked', 'true');
      
      // Navigate to next screen
      if (nextScreen) {
        (navigation as any).replace(nextScreen);
      } else {
        navigation.goBack();
      }
    } else {
      // Even if denied, continue
      await AsyncStorage.setItem('notificationPermissionAsked', 'true');
      
      if (nextScreen) {
        (navigation as any).replace(nextScreen);
      } else {
        navigation.goBack();
      }
    }
  };

  const handleSkip = async (): Promise<void> => {
    // Mark that we've asked (but user skipped)
    await AsyncStorage.setItem('notificationPermissionAsked', 'true');
    await AsyncStorage.setItem('notificationPermissionSkipped', 'true');
    
    // Navigate to next screen
    if (nextScreen) {
      (navigation as any).replace(nextScreen);
    } else {
      navigation.goBack();
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.WHITE} />
      
      <View style={styles.content}>
        {/* Icon */}
        <View style={styles.iconContainer}>
          <Bell size={64} color={COLORS.APP_GREEN} strokeWidth={1.5} />
        </View>

        {/* Title */}
        <Text style={styles.title}>Stay in the Loop</Text>

        {/* Description */}
        <Text style={styles.description}>
          Get notified about new referrals, partnership requests, messages, and important account updates.
        </Text>

        {/* Benefits List */}
        <View style={styles.benefitsList}>
          <BenefitItem text="New referral notifications" />
          <BenefitItem text="Partnership request alerts" />
          <BenefitItem text="New message notifications" />
          <BenefitItem text="Important account updates" />
        </View>
      </View>

      {/* Bottom Buttons */}
      <View style={styles.bottomSection}>
        <Button
          mode="contained"
          onPress={handleAllow}
          style={styles.allowButton}
          contentStyle={styles.allowButtonContent}
          labelStyle={styles.allowButtonLabel}
        >
          Allow Notifications
        </Button>
        
        <Button
          mode="text"
          onPress={handleSkip}
          style={styles.skipButton}
          labelStyle={styles.skipButtonLabel}
        >
          Maybe Later
        </Button>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.WHITE,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: LAYOUT_PADDING,
  },
  iconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#F0FDF4',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.xl,
  },
  title: {
    fontSize: FONT_SIZES['2xl'],
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.BLACK,
    textAlign: 'center',
    marginBottom: SPACING.md,
  },
  description: {
    fontSize: FONT_SIZES.md,
    color: COLORS.GRAY,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: SPACING.xl,
    paddingHorizontal: SPACING.lg,
  },
  benefitsList: {
    width: '100%',
    paddingHorizontal: SPACING.lg,
  },
  benefitItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  bullet: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.APP_GREEN,
    marginRight: SPACING.md,
  },
  benefitText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.BLACK,
    flex: 1,
  },
  bottomSection: {
    paddingHorizontal: LAYOUT_PADDING,
    paddingBottom: SPACING.xl,
    paddingTop: SPACING.lg,
  },
  allowButton: {
    backgroundColor: COLORS.APP_GREEN,
    borderRadius: 12,
    marginBottom: SPACING.md,
  },
  allowButtonContent: {
    paddingVertical: SPACING.md,
  },
  allowButtonLabel: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.WHITE,
  },
  skipButton: {
    marginTop: SPACING.sm,
  },
  skipButtonLabel: {
    fontSize: FONT_SIZES.md,
    color: COLORS.GRAY,
  },
});

export default NotificationPermissionScreen;






