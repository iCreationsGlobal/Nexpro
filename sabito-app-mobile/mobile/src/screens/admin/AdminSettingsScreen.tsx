import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  Alert,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  User,
  Mail,
  Shield,
  Moon,
  Sun,
  LogOut,
  ChevronRight,
  Bell,
  Lock,
  HelpCircle,
  LucideIcon,
} from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { getTheme } from '../../constants/themes';
import BackButton from '../../components/common/BackButton';
import COLORS from '../../constants/colors';
import type { RootStackScreenProps } from '../../types/navigation';
import type { User as UserType } from '../../types/api';

type AdminSettingsScreenProps = RootStackScreenProps<'AdminSettings'>;

const AdminSettingsScreen: React.FC = () => {
  const navigation = useNavigation<AdminSettingsScreenProps['navigation']>();
  const { theme, effectiveTheme, toggleTheme } = useTheme();
  const { colors, isDark } = getTheme(effectiveTheme || theme);
  const [userData, setUserData] = useState<UserType | null>(null);

  useEffect(() => {
    loadUserData();
  }, []);

  const loadUserData = async (): Promise<void> => {
    try {
      const userStr = await AsyncStorage.getItem('user');
      if (userStr) {
        const user = JSON.parse(userStr) as UserType;
        setUserData(user);
      }
    } catch (error: any) {
      // Error handling
    }
  };

  const handleBack = (): void => {
    navigation.goBack();
  };

  const handleLogout = (): void => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            try {
              await AsyncStorage.multiRemove([
                'accessToken',
                'refreshToken',
                'user',
                'userRole',
              ]);
              navigation.reset({
                index: 0,
                routes: [{ name: 'Login' }],
              });
            } catch (error: any) {
              Alert.alert('Error', 'Failed to logout. Please try again.');
            }
          },
        },
      ]
    );
  };

  const renderSettingItem = (
    icon: React.ReactElement, 
    label: string, 
    value: string | null, 
    onPress: (() => void) | null, 
    showChevron: boolean = true, 
    rightElement: React.ReactElement | null = null
  ): React.ReactElement => (
    <TouchableOpacity
      style={[styles.settingItem, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}
      onPress={onPress || undefined}
      disabled={!onPress}
    >
      <View style={styles.settingLeft}>
        <View style={[styles.iconContainer, { backgroundColor: `${COLORS.APP_GREEN}15` }]}>
          {icon}
        </View>
        <View style={styles.settingInfo}>
          <Text style={[styles.settingLabel, { color: colors.text }]}>{label}</Text>
          {value && (
            <Text style={[styles.settingValue, { color: colors.textSecondary }]} numberOfLines={1}>
              {value}
            </Text>
          )}
        </View>
      </View>
      {rightElement ? rightElement : showChevron && (
        <ChevronRight size={20} color={colors.textSecondary} strokeWidth={2} />
      )}
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <BackButton onPress={handleBack} />
        <Text style={[styles.headerTitle, { color: colors.text }]}>Settings</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Profile Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>PROFILE</Text>
          
          {renderSettingItem(
            <User size={20} color={COLORS.APP_GREEN} strokeWidth={2} />,
            'Name',
            userData?.name || 'Admin User',
            null,
            false
          )}
          
          {renderSettingItem(
            <Mail size={20} color={COLORS.APP_GREEN} strokeWidth={2} />,
            'Email',
            userData?.email || 'admin@sabito.app',
            null,
            false
          )}
          
          {renderSettingItem(
            <Shield size={20} color={COLORS.APP_GREEN} strokeWidth={2} />,
            'Role',
            'Administrator',
            null,
            false
          )}
        </View>

        {/* Appearance Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>APPEARANCE</Text>
          
          {renderSettingItem(
            isDark ? (
              <Moon size={20} color={COLORS.APP_GREEN} strokeWidth={2} />
            ) : (
              <Sun size={20} color={COLORS.APP_GREEN} strokeWidth={2} />
            ),
            'Dark Mode',
            null,
            null,
            false,
            <Switch
              value={isDark}
              onValueChange={(value: boolean) => {
                toggleTheme(value ? 'dark' : 'light');
              }}
              trackColor={{ false: colors.border, true: COLORS.APP_GREEN }}
              thumbColor={COLORS.WHITE}
            />
          )}
        </View>

        {/* Preferences Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>PREFERENCES</Text>
          
          {renderSettingItem(
            <Bell size={20} color={COLORS.APP_GREEN} strokeWidth={2} />,
            'Notifications',
            'Manage notification preferences',
            () => {
              // TODO: Navigate to notifications settings
              Alert.alert('Coming Soon', 'Notification settings will be available soon.');
            }
          )}
          
          {renderSettingItem(
            <Lock size={20} color={COLORS.APP_GREEN} strokeWidth={2} />,
            'Privacy & Security',
            'Manage your privacy settings',
            () => {
              // TODO: Navigate to privacy settings
              Alert.alert('Coming Soon', 'Privacy settings will be available soon.');
            }
          )}
        </View>

        {/* Support Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>SUPPORT</Text>
          
          {renderSettingItem(
            <HelpCircle size={20} color={COLORS.APP_GREEN} strokeWidth={2} />,
            'Help & Support',
            'Get help or contact support',
            () => {
              // TODO: Navigate to help screen
              Alert.alert('Coming Soon', 'Help & Support will be available soon.');
            }
          )}
        </View>

        {/* Logout Button */}
        <TouchableOpacity
          style={[styles.logoutButton, { backgroundColor: `${COLORS.ERROR}15`, borderColor: COLORS.ERROR }]}
          onPress={handleLogout}
        >
          <LogOut size={20} color={COLORS.ERROR} strokeWidth={2} />
          <Text style={[styles.logoutText, { color: COLORS.ERROR }]}>Logout</Text>
        </TouchableOpacity>

        {/* App Version */}
        <Text style={[styles.versionText, { color: colors.textSecondary }]}>
          Sabito Admin v1.0.1 (Build 8)
        </Text>
      </ScrollView>
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
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    flex: 1,
    textAlign: 'center',
  },
  content: {
    flex: 1,
  },
  section: {
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 12,
    letterSpacing: 0.5,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingInfo: {
    flex: 1,
  },
  settingLabel: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 2,
  },
  settingValue: {
    fontSize: 13,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginHorizontal: 16,
    marginTop: 24,
    marginBottom: 16,
  },
  logoutText: {
    fontSize: 16,
    fontWeight: '600',
  },
  versionText: {
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 32,
  },
});

export default AdminSettingsScreen;




