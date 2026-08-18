import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  TouchableOpacity,
  ScrollView,
  Switch,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Lock, Eye, Shield, Key, ArrowLeft } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../../context/ThemeContext';
import { getTheme } from '../../constants/themes';
import COLORS from '../../constants/colors';
import { SPACING, FONT_SIZES, FONT_WEIGHTS, LAYOUT_PADDING } from '../../constants/sizes';
import BackButton from '../../components/common/BackButton';
import CustomDialog from '../../components/common/CustomDialog';
import useDialog from '../../hooks/useDialog';
import type { RootStackScreenProps } from '../../types/navigation';

type PrivacySecurityScreenProps = RootStackScreenProps<'PrivacySecurity'>;

interface SecuritySettings {
  twoFactorAuth: boolean;
  sessionTimeout: boolean;
}

interface SecurityOption {
  icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  title: string;
  description: string;
  key?: keyof SecuritySettings;
  type: 'toggle' | 'action';
  onPress?: () => void;
}

const PrivacySecurityScreen: React.FC<PrivacySecurityScreenProps> = ({ navigation }) => {
  const { theme, effectiveTheme } = useTheme();
  const { colors, isDark } = getTheme(effectiveTheme || theme);
  const { dialog, showDialog, hideDialog } = useDialog();
  
  const [settings, setSettings] = useState<SecuritySettings>({
    twoFactorAuth: false,
    sessionTimeout: true,
  });
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Load settings from AsyncStorage on mount
  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async (): Promise<void> => {
    try {
      const keys: (keyof SecuritySettings)[] = ['twoFactorAuth', 'sessionTimeout'];
      const loadedSettings: Partial<SecuritySettings> = {};

      for (const key of keys) {
        const value = await AsyncStorage.getItem(`security_${key}`);
        if (value !== null) {
          loadedSettings[key] = JSON.parse(value) as boolean;
        } else {
          // Set defaults
          loadedSettings[key] = key === 'sessionTimeout' ? true : false;
        }
      }

      setSettings(loadedSettings as SecuritySettings);
    } catch (error) {
      // Silent fail
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggle = async (key: keyof SecuritySettings): Promise<void> => {
    const newValue = !settings[key];
    
    // Optimistically update UI
    setSettings({ ...settings, [key]: newValue });
    
    // Save to AsyncStorage
    try {
      await AsyncStorage.setItem(`security_${key}`, JSON.stringify(newValue));
      // Show confirmation with helpful info
      const settingNames: Record<string, string> = {
        twoFactorAuth: 'Two-Factor Authentication',
        sessionTimeout: 'Auto Session Timeout',
      };
      
      const messages: Record<string, string> = {
        twoFactorAuth: newValue 
          ? 'You will receive a verification code on your email for additional security.' 
          : 'Your account will no longer require two-factor authentication.',
        sessionTimeout: newValue 
          ? 'You will be automatically logged out after 30 minutes of inactivity.' 
          : 'Auto logout has been disabled.',
      };
      // Could show confirmation here
    } catch (error) {
      // Revert on error
      setSettings({ ...settings, [key]: !newValue });
    }
  };

  const handleChangePassword = (): void => {
    showDialog({
      title: 'Change Password',
      message: 'You will be redirected to change your password.',
      buttons: [
        { text: 'Cancel', style: 'cancel', onPress: hideDialog },
        { 
          text: 'Continue', 
          onPress: () => {
            hideDialog();
            // Navigate to forgot password flow
            navigation.navigate('ForgotPassword' as any);
          },
          style: 'default',
        },
      ]
    });
  };

  const securityOptions: SecurityOption[] = [
    {
      icon: Key,
      title: 'Two-Factor Authentication',
      description: 'Add an extra layer of security to your account',
      key: 'twoFactorAuth',
      type: 'toggle',
    },
    {
      icon: Shield,
      title: 'Auto Session Timeout',
      description: 'Automatically log out after inactivity',
      key: 'sessionTimeout',
      type: 'toggle',
    },
    {
      icon: Lock,
      title: 'Change Password',
      description: 'Update your account password',
      type: 'action',
      onPress: handleChangePassword,
    },
  ];

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
        
        {/* Header */}
        <View style={[styles.header, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
          <BackButton onPress={() => navigation.goBack()} />
          <Text style={[styles.headerTitle, { color: colors.text }]}>Privacy & Security</Text>
          <View style={{ width: 24 }} />
        </View>

        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.APP_GREEN} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading settings...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />

      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={[styles.headerTitle, { color: colors.text }]}>Privacy & Security</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={[styles.scrollView, { backgroundColor: colors.background }]} showsVerticalScrollIndicator={false}>
        {/* Info Banner */}
        <View style={[styles.infoBanner, { backgroundColor: isDark ? colors.cardBackground : '#F0FDF4', borderColor: colors.border }]}>
          <Shield size={20} color={COLORS.APP_GREEN} strokeWidth={1.5} />
          <Text style={[styles.infoBannerText, { color: colors.text }]}>
            Keep your account secure with these security features
          </Text>
        </View>

        {/* Security Options */}
        <View style={styles.section}>
          <View style={[styles.optionsGroup, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
            {securityOptions.map((option, index) => {
              const Icon = option.icon;
              return (
                <TouchableOpacity
                  key={index}
                  style={[
                    styles.optionItem,
                    { borderBottomColor: colors.border },
                    index === securityOptions.length - 1 && styles.lastOptionItem,
                  ]}
                  onPress={option.type === 'action' ? option.onPress : undefined}
                  activeOpacity={option.type === 'action' ? 0.7 : 1}
                >
                  <View style={[styles.optionIconContainer, { 
                    backgroundColor: isDark ? 'transparent' : '#F3F4F6',
                    borderWidth: isDark ? 1 : 0,
                    borderColor: isDark ? colors.border : 'transparent'
                  }]}>
                    <Icon size={22} color={colors.iconSecondary} strokeWidth={1.5} />
                  </View>
                  <View style={styles.optionContent}>
                    <Text style={[styles.optionTitle, { color: colors.text }]}>{option.title}</Text>
                    <Text style={[styles.optionDescription, { color: colors.textSecondary }]}>{option.description}</Text>
                  </View>
                  {option.type === 'toggle' && option.key ? (
                    <Switch
                      value={settings[option.key]}
                      onValueChange={() => handleToggle(option.key!)}
                      trackColor={{ false: '#D1D5DB', true: COLORS.APP_GREEN }}
                      thumbColor={COLORS.WHITE}
                    />
                  ) : (
                    <ArrowLeft size={20} color="#9CA3AF" strokeWidth={1.5} style={{ transform: [{ rotate: '180deg' }] }} />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Privacy Info */}
        <View style={styles.privacySection}>
          <Text style={[styles.privacySectionTitle, { color: colors.text }]}>Privacy Information</Text>
          <View style={[styles.privacyCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
            <Eye size={18} color={COLORS.APP_GREEN} strokeWidth={1.5} />
            <Text style={[styles.privacyText, { color: colors.textSecondary }]}>
              We take your privacy seriously. Your data is encrypted and secure. We never share your information with third parties without your consent.
            </Text>
          </View>
        </View>
      </ScrollView>

      <CustomDialog
        visible={dialog.visible}
        title={dialog.title}
        message={dialog.message}
        buttons={dialog.buttons}
        onClose={hideDialog}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: SPACING.xs,
  },
  headerTitle: {
    fontSize: FONT_SIZES.xl,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.BLACK,
  },
  scrollView: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: SPACING.md,
    fontSize: FONT_SIZES.md,
    color: COLORS.GRAY,
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    marginHorizontal: SPACING.md,
    marginTop: SPACING.md,
    padding: SPACING.md,
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.APP_GREEN,
  },
  infoBannerText: {
    flex: 1,
    marginLeft: SPACING.sm,
    fontSize: FONT_SIZES.sm,
    color: '#166534',
    lineHeight: 20,
  },
  section: {
    marginHorizontal: SPACING.md,
    marginTop: SPACING.md,
    marginBottom: SPACING.md,
  },
  optionsGroup: {
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
  },
  optionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.STROKE_COLOR,
  },
  lastOptionItem: {
    borderBottomWidth: 0,
  },
  optionIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.md,
  },
  optionContent: {
    flex: 1,
  },
  optionTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.BLACK,
    marginBottom: 2,
  },
  optionDescription: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.GRAY,
    lineHeight: 16,
  },
  privacySection: {
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.xl,
  },
  privacySectionTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.semibold,
    marginBottom: SPACING.sm,
  },
  privacyCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: SPACING.md,
    borderRadius: 12,
    borderWidth: 1,
  },
  privacyText: {
    flex: 1,
    marginLeft: SPACING.sm,
    fontSize: FONT_SIZES.sm,
    lineHeight: 20,
  },
});

export default PrivacySecurityScreen;






