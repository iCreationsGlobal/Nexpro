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
  Alert,
  Modal,
  Pressable,
  Platform,
  Vibration,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Bell, Mail, Smartphone, TrendingUp, Volume2, CheckCircle, ChevronRight } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../../context/ThemeContext';
import { getTheme } from '../../constants/themes';
import COLORS from '../../constants/colors';
import { SPACING, FONT_SIZES, FONT_WEIGHTS, LAYOUT_PADDING } from '../../constants/sizes';
import BackButton from '../../components/common/BackButton';
import type { RootStackScreenProps } from '../../types/navigation';

type NotificationsScreenProps = RootStackScreenProps<'Notifications'>;

interface NotificationSettings {
  emailNotifications: boolean;
  pushNotifications: boolean;
  marketingCommunications: boolean;
}

interface NotificationSound {
  id: string;
  name: string;
  description: string;
}

interface NotificationOption {
  icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  key: keyof NotificationSettings;
  label: string;
  description: string;
  iconColor: string;
}

const NotificationsScreen: React.FC<NotificationsScreenProps> = ({ navigation }) => {
  const { theme, effectiveTheme } = useTheme();
  const { colors, isDark } = getTheme(effectiveTheme || theme);
  
  const [settings, setSettings] = useState<NotificationSettings>({
    emailNotifications: true,
    pushNotifications: true,
    marketingCommunications: false,
  });
  const [selectedSound, setSelectedSound] = useState<string>('Default');
  const [tempSelectedSound, setTempSelectedSound] = useState<string>('Default'); // Temporary selection before saving
  const [showSoundModal, setShowSoundModal] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // WhatsApp-style notification sounds
  const notificationSounds: NotificationSound[] = [
    { id: 'default', name: 'Default', description: 'System default tone' },
    { id: 'tri-tone', name: 'Tri-tone', description: 'Classic notification sound' },
    { id: 'chime', name: 'Chime', description: 'Gentle chime sound' },
    { id: 'ding', name: 'Ding', description: 'Simple ding tone' },
    { id: 'bells', name: 'Bells', description: 'Melodic bells' },
    { id: 'ping', name: 'Ping', description: 'Quick ping sound' },
    { id: 'none', name: 'None', description: 'Silent notifications' },
  ];

  useEffect(() => {
    loadNotificationSettings();
  }, []);

  const loadNotificationSettings = async (): Promise<void> => {
    try {
      const savedSettings = await AsyncStorage.getItem('notificationSettings');
      const savedSound = await AsyncStorage.getItem('notificationSound');
      
      if (savedSettings) {
        setSettings(JSON.parse(savedSettings) as NotificationSettings);
      }
      
      if (savedSound) {
        setSelectedSound(savedSound);
      }
    } catch (error) {
      // Silent fail
    } finally {
      setIsLoading(false);
    }
  };

  const playSound = (soundName: string): void => {
    // Preview the sound with vibration patterns (different for each sound)
    if (soundName === 'None') {
      return;
    }

    // Different vibration patterns for different sounds (WhatsApp-style)
    const vibrationPatterns: Record<string, number[]> = {
      'Default': [0, 100, 50, 100],           // Standard pattern
      'Tri-tone': [0, 80, 50, 80, 50, 80],   // Three short vibrations
      'Chime': [0, 150],                      // Single gentle vibration
      'Ding': [0, 50],                        // Very short
      'Bells': [0, 100, 100, 100, 100, 100], // Multiple vibrations
      'Ping': [0, 30],                        // Very quick
    };

    const pattern = vibrationPatterns[soundName] || [0, 100];
    
    try {
      if (Platform.OS === 'android') {
        Vibration.vibrate(pattern);
      } else {
        // iOS doesn't support patterns, use single vibration
        Vibration.vibrate();
      }
    } catch (error) {
      // Silent fail
    }
  };

  const handleSoundPreview = (soundName: string): void => {
    // Update temporary selection and play sound
    setTempSelectedSound(soundName);
    playSound(soundName);
  };

  const handleSaveSoundSetting = async (): Promise<void> => {
    try {
      const soundChanged = selectedSound !== tempSelectedSound;
      
      setSelectedSound(tempSelectedSound);
      await AsyncStorage.setItem('notificationSound', tempSelectedSound);
      setShowSoundModal(false);
      // Only show alert if sound actually changed
      if (soundChanged) {
        // Could show confirmation here
      }
    } catch (error) {
      // Silent fail
    }
  };

  const handleOpenSoundModal = (): void => {
    setTempSelectedSound(selectedSound); // Initialize temp with current
    setShowSoundModal(true);
  };

  const handleCancelSoundModal = (): void => {
    setTempSelectedSound(selectedSound); // Reset temp to saved
    setShowSoundModal(false);
  };

  const updateSetting = async (key: keyof NotificationSettings, value: boolean): Promise<void> => {
    // Optimistically update UI
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);
    
    try {
      await AsyncStorage.setItem('notificationSettings', JSON.stringify(newSettings));
      // Show confirmation with helpful info
      const settingNames: Record<string, string> = {
        emailNotifications: 'Email Notifications',
        pushNotifications: 'Push Notifications',
        marketingCommunications: 'Marketing Communications',
      };
      
      const messages: Record<string, string> = {
        emailNotifications: value 
          ? 'You will receive email updates about projects, payments, and referrals.' 
          : 'Email notifications have been disabled.',
        pushNotifications: value 
          ? 'You will receive instant push notifications on this device.' 
          : 'Push notifications have been disabled.',
        marketingCommunications: value 
          ? 'You will receive promotional offers, tips, and product updates.' 
          : 'Marketing communications have been disabled.',
      };
      // Could show confirmation here
    } catch (error) {
      // Revert on error
      setSettings({ ...settings, [key]: !value });
    }
  };

  const notificationOptions: NotificationOption[] = [
    {
      icon: Mail,
      key: 'emailNotifications',
      label: 'Email Notifications',
      description: 'Receive updates about projects, payments, and referrals via email',
      iconColor: '#4B5563',
    },
    {
      icon: Smartphone,
      key: 'pushNotifications',
      label: 'Push Notifications',
      description: 'Get instant alerts on your mobile device',
      iconColor: '#4B5563',
    },
    {
      icon: TrendingUp,
      key: 'marketingCommunications',
      label: 'Marketing Communications',
      description: 'Promotional offers, tips, and product updates',
      iconColor: '#4B5563',
    },
  ];

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
        
        {/* Header */}
        <View style={[styles.header, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
          <BackButton onPress={() => navigation.goBack()} />
          <Text style={[styles.headerTitle, { color: colors.text }]}>Notifications</Text>
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
        <Text style={[styles.headerTitle, { color: colors.text }]}>Notifications</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={[styles.scrollView, { backgroundColor: colors.background }]} showsVerticalScrollIndicator={false}>
        {/* Notification Settings */}
        <View style={styles.section}>
          <View style={[styles.settingsGroup, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
            {notificationOptions.map((option, index) => {
              const Icon = option.icon;
              return (
                <View
                  key={option.key}
                  style={[
                    styles.settingItem,
                    { borderBottomColor: colors.border },
                    index === notificationOptions.length - 1 && styles.lastSettingItem,
                  ]}
                >
                  <View style={[styles.settingIconContainer, { 
                    backgroundColor: isDark ? 'transparent' : '#F3F4F6',
                    borderWidth: isDark ? 1 : 0,
                    borderColor: isDark ? colors.border : 'transparent'
                  }]}>
                    <Icon size={22} color={option.iconColor} strokeWidth={1.5} />
                  </View>
                  <View style={styles.settingContent}>
                    <Text style={[styles.settingLabel, { color: colors.text }]}>{option.label}</Text>
                    <Text style={[styles.settingDescription, { color: colors.textSecondary }]}>{option.description}</Text>
                  </View>
                  <Switch
                    value={settings[option.key]}
                    onValueChange={(value) => updateSetting(option.key, value)}
                    trackColor={{ false: '#D1D5DB', true: COLORS.APP_GREEN }}
                    thumbColor={COLORS.WHITE}
                  />
                </View>
              );
            })}
          </View>
        </View>

        {/* Notification Sound */}
        <View style={[styles.section, { marginBottom: SPACING.xl }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Notification Sound</Text>
          <View style={[styles.settingsGroup, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
            <TouchableOpacity
              style={[styles.settingItem, { borderBottomColor: colors.border }]}
              onPress={handleOpenSoundModal}
            >
              <View style={[styles.settingIconContainer, { 
                backgroundColor: isDark ? 'transparent' : '#F3F4F6',
                borderWidth: isDark ? 1 : 0,
                borderColor: isDark ? colors.border : 'transparent'
              }]}>
                <Volume2 size={22} color={colors.iconSecondary} strokeWidth={1.5} />
              </View>
              <View style={styles.settingContent}>
                <Text style={[styles.settingLabel, { color: colors.text }]}>Notification Tone</Text>
                <Text style={[styles.settingDescription, { color: colors.textSecondary }]}>{selectedSound}</Text>
              </View>
              <ChevronRight size={20} color={colors.iconSecondary} strokeWidth={1.5} />
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

      {/* Sound Selection Modal */}
      <Modal
        visible={showSoundModal}
        transparent={true}
        animationType="slide"
        onRequestClose={handleCancelSoundModal}
      >
        <Pressable 
          style={styles.modalOverlay}
          onPress={handleCancelSoundModal}
        >
          <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Notification Sound</Text>
              <TouchableOpacity onPress={handleSaveSoundSetting}>
                <Text style={styles.modalClose}>Done</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
              {notificationSounds.map((sound, index) => (
                <TouchableOpacity
                  key={sound.id}
                  style={[
                    styles.soundItem,
                    index === notificationSounds.length - 1 && styles.lastSoundItem,
                  ]}
                  onPress={() => handleSoundPreview(sound.name)}
                >
                  <View style={styles.soundInfo}>
                    <Text style={styles.soundName}>{sound.name}</Text>
                    <Text style={styles.soundDescription}>{sound.description}</Text>
                  </View>
                  {tempSelectedSound === sound.name && (
                    <CheckCircle size={20} color={COLORS.APP_GREEN} strokeWidth={2} />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
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
    backgroundColor: COLORS.WHITE,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.STROKE_COLOR,
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
  section: {
    marginHorizontal: SPACING.md,
    marginTop: SPACING.md,
    marginBottom: SPACING.md,
  },
  settingsGroup: {
    backgroundColor: COLORS.WHITE,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.STROKE_COLOR,
  },
  lastSettingItem: {
    borderBottomWidth: 0,
  },
  settingIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.md,
  },
  settingContent: {
    flex: 1,
  },
  settingLabel: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.BLACK,
    marginBottom: 4,
  },
  settingDescription: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.GRAY,
    lineHeight: 18,
  },
  sectionTitle: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.GRAY,
    marginBottom: SPACING.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: COLORS.WHITE,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '70%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.STROKE_COLOR,
  },
  modalTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.BLACK,
  },
  modalClose: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.APP_GREEN,
  },
  modalScroll: {
    maxHeight: 400,
  },
  soundItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.STROKE_COLOR,
  },
  lastSoundItem: {
    borderBottomWidth: 0,
  },
  soundInfo: {
    flex: 1,
  },
  soundName: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.medium,
    color: COLORS.BLACK,
    marginBottom: 2,
  },
  soundDescription: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.GRAY,
  },
});

export default NotificationsScreen;






