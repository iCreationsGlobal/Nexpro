import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, StatusBar, TouchableOpacity, ScrollView, Image, Platform, Share, ActivityIndicator, Modal as RNModal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { 
  User, 
  Building2, 
  ChevronRight,
  LogOut,
  Bell,
  Lock,
  HelpCircle,
  Share2,
  ClipboardList,
  FolderOpen,
  BarChart3,
  Moon,
  Trash2,
  Globe,
  CreditCard
} from 'lucide-react-native';
import { TextInput, Button } from 'react-native-paper';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../../context/ThemeContext';
import { getTheme } from '../../constants/themes';
import COLORS from '../../constants/colors';
import { SPACING, FONT_SIZES, FONT_WEIGHTS } from '../../constants/sizes';
import CustomDialog from '../../components/common/CustomDialog';
import useDialog from '../../hooks/useDialog';
import apiClient from '../../services/apiClient';
import type { RootStackScreenProps } from '../../types/navigation';
import type { User as UserType } from '../../types/api';

type MarketerAccountProps = RootStackScreenProps<'MarketerAccount'>;

const MarketerAccount: React.FC<MarketerAccountProps> = ({ navigation }) => {
  const { theme, effectiveTheme } = useTheme();
  const { colors, isDark } = getTheme(effectiveTheme || theme);
  const { dialog, showDialog, hideDialog } = useDialog();
  
  const [user, setUser] = useState<UserType | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState<boolean>(false);
  const [deletePassword, setDeletePassword] = useState<string>('');
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  useEffect(() => {
    const loadData = async () => {
      try {
        const userData = await AsyncStorage.getItem('user');
        
        if (userData) {
          const parsedUser = JSON.parse(userData) as UserType;
          setUser(parsedUser);
        }
      } catch (error) {
        // Handle error
      }
    };
    loadData();
  }, []);

  const handleShare = async (): Promise<void> => {
    try {
      const result = await Share.share({
        message: 'Join me on Sabito! Connect businesses with skilled marketers and grow together. Download now: https://sabito.app',
        title: 'Sabito - Grow Your Business',
      });

      if (result.action === Share.sharedAction) {
        if (result.activityType) {
          // Shared with activity type
        } else {
          // Shared successfully
        }
      } else if (result.action === Share.dismissedAction) {
        // Share dismissed
      }
    } catch (error) {
      showDialog({
        title: 'Error',
        message: 'Failed to share the app. Please try again.',
        buttons: [{ text: 'OK' }]
      });
    }
  };

  const handleDeleteAccount = async (): Promise<void> => {
    if (!deletePassword.trim()) {
      return;
    }

    try {
      setIsDeleting(true);

      await apiClient.delete('/api/users/account', {
        data: {
          password: deletePassword,
        },
      });
      
      await AsyncStorage.removeItem('user');
      await AsyncStorage.removeItem('accessToken');
      await AsyncStorage.removeItem('refreshToken');
      await AsyncStorage.removeItem('theme');
      
      setShowDeleteModal(false);
      setDeletePassword('');

      showDialog({
        title: 'Account Deleted',
        message: 'Your account has been permanently deleted.',
        buttons: [
          {
            text: 'OK',
            onPress: () => {
              hideDialog();
              navigation.reset({
                index: 0,
                routes: [{ name: 'Login' }],
              });
            },
            style: 'default',
          },
        ]
      });
    } catch (error: any) {
      showDialog({
        title: 'Error',
        message: error.response?.data?.message || 'Failed to delete account. Please check your password and try again.',
        buttons: [{ text: 'OK' }]
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleLogout = (): void => {
    showDialog({
      title: 'Logout',
      message: 'Are you sure you want to logout?',
      buttons: [
        { 
          text: 'Cancel', 
          style: 'cancel',
          onPress: () => hideDialog()
        },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            await AsyncStorage.removeItem('user');
            await AsyncStorage.removeItem('accessToken');
            await AsyncStorage.removeItem('refreshToken');
            await AsyncStorage.removeItem('theme');
            navigation.reset({
              index: 0,
              routes: [{ name: 'Login' }],
            });
          },
        },
      ]
    });
  };

  interface SettingItem {
    icon: React.ComponentType<any>;
    label: string;
    subtitle: string | null;
    onPress: () => void;
  }

  interface SettingSection {
    title: string;
    items: SettingItem[];
  }

  const settingsSections: SettingSection[] = [
    {
      title: 'Activity',
      items: [
        { 
          icon: ClipboardList, 
          label: 'All Activities', 
          subtitle: 'View your activity history', 
          onPress: () => {
            navigation.navigate('AllActivities', { userType: 'marketer' });
          } 
        },
        { 
          icon: BarChart3, 
          label: 'Reports & Analytics', 
          subtitle: 'View performance insights', 
          onPress: () => {
            navigation.navigate('MarketerReports');
          } 
        },
      ],
    },
    {
      title: 'Payments',
      items: [
        { 
          icon: CreditCard, 
          label: 'Payment Method', 
          subtitle: 'Manage payment settings', 
          onPress: () => {
            navigation.navigate('PaymentMethodSetup');
          } 
        },
        { 
          icon: FolderOpen, 
          label: 'Earnings', 
          subtitle: 'View your earnings', 
          onPress: () => {
            navigation.navigate('MarketerTabNavigator', { screen: 'Earnings' } as any);
          } 
        },
      ],
    },
    {
      title: 'Appearance',
      items: [
        { 
          icon: Moon, 
          label: 'Theme', 
          subtitle: 'Light, Dark, or System', 
          onPress: () => {
            navigation.navigate('ThemeSettings');
          } 
        },
      ],
    },
    {
      title: 'Support & Security',
      items: [
        { 
          icon: Lock, 
          label: 'Privacy & Security', 
          subtitle: 'Manage security settings', 
          onPress: () => {
            navigation.navigate('PrivacySecurity');
          } 
        },
        { 
          icon: HelpCircle, 
          label: 'Help & Support', 
          subtitle: 'Get help and contact support', 
          onPress: () => {
            navigation.navigate('HelpSupport');
          } 
        },
      ],
    },
  ];

  if (!user) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.APP_GREEN} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading account...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <>
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
      
      <ScrollView style={[styles.scrollView, { backgroundColor: colors.background }]} showsVerticalScrollIndicator={false}>
        {/* Profile Header */}
        <TouchableOpacity 
          style={[styles.profileHeader, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}
          onPress={() => navigation.navigate('Profile')}
          activeOpacity={0.7}
        >
          <View style={styles.avatarContainer}>
            {user.profileImage ? (
              <Image source={{ uri: user.profileImage }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarText}>{user.name?.charAt(0)?.toUpperCase() || 'U'}</Text>
              </View>
            )}
          </View>
          <View style={styles.profileInfo}>
            <Text style={[styles.profileName, { color: colors.text }]}>{user.name}</Text>
            <Text style={[styles.profileType, { color: colors.textSecondary }]}>{user.email}</Text>
          </View>
          <ChevronRight size={20} color={colors.iconSecondary} strokeWidth={1.5} />
        </TouchableOpacity>

        {/* Notifications Card */}
        <TouchableOpacity 
          style={[styles.quickActionCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]} 
          onPress={() => navigation.navigate('Notifications')}
          activeOpacity={0.7}
        >
          <View style={[styles.quickActionIconContainer, { 
            backgroundColor: isDark ? colors.backgroundSecondary : '#FEF3C7',
            borderWidth: isDark ? 1 : 0,
            borderColor: isDark ? colors.border : 'transparent'
          }]}>
            <Bell size={22} color="#F59E0B" strokeWidth={1.5} />
          </View>
          <View style={styles.quickActionContent}>
            <Text style={[styles.quickActionText, { color: colors.text }]}>Notifications</Text>
            <Text style={[styles.quickActionDescription, { color: colors.textSecondary }]}>Manage notification preferences</Text>
          </View>
          <ChevronRight size={20} color={colors.iconSecondary} strokeWidth={1.5} />
        </TouchableOpacity>

        {/* Spread the love Button */}
        <TouchableOpacity style={[styles.shareButton, { backgroundColor: colors.cardBackground, borderColor: colors.border }]} onPress={handleShare}>
          <View style={[styles.shareIconContainer, { 
            backgroundColor: isDark ? 'transparent' : colors.primaryLight,
            borderWidth: isDark ? 1 : 0,
            borderColor: isDark ? colors.border : 'transparent'
          }]}>
            <Share2 size={22} color={colors.primary} strokeWidth={1.5} />
          </View>
          <View style={styles.shareContent}>
            <Text style={[styles.shareText, { color: colors.text }]}>Spread the love</Text>
            <Text style={[styles.shareDescription, { color: colors.textSecondary }]}>Share Sabito with friends and family</Text>
          </View>
        </TouchableOpacity>

        {/* Settings Sections */}
        {settingsSections.map((section, sectionIndex) => (
          <View key={sectionIndex} style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>{section.title}</Text>
            <View style={[styles.settingsGroup, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
              {section.items.map((item, itemIndex) => (
                <TouchableOpacity
                  key={itemIndex}
                  style={[
                    styles.settingItem,
                    { borderBottomColor: colors.border },
                    itemIndex === section.items.length - 1 && styles.lastSettingItem,
                  ]}
                  onPress={item.onPress}
                >
                  <View style={[styles.settingIconContainer, { 
                    backgroundColor: isDark ? 'transparent' : '#F3F4F6',
                    borderWidth: isDark ? 1 : 0,
                    borderColor: isDark ? colors.border : 'transparent'
                  }]}>
                    <item.icon size={22} color={colors.iconSecondary} strokeWidth={1.5} />
                  </View>
                  <View style={styles.settingContent}>
                    <Text style={[styles.settingLabel, { color: colors.text }]}>{item.label}</Text>
                    {item.subtitle && (
                      <Text style={[styles.settingSubtitle, { color: colors.textSecondary }]}>{item.subtitle}</Text>
                    )}
                  </View>
                  <ChevronRight size={20} color={colors.iconSecondary} strokeWidth={1.5} />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}

        {/* Logout Button */}
        <TouchableOpacity 
          style={[styles.logoutButton, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}
          onPress={handleLogout}
        >
          <View style={[styles.logoutIconContainer, { 
            backgroundColor: isDark ? 'transparent' : '#FEF2F2',
            borderWidth: isDark ? 1 : 0,
            borderColor: isDark ? colors.border : 'transparent'
          }]}>
            <LogOut size={22} color="#EF4444" strokeWidth={1.5} />
          </View>
          <View style={styles.logoutContent}>
            <Text style={[styles.logoutText, { color: colors.text }]}>Logout</Text>
            <Text style={[styles.logoutDescription, { color: colors.textSecondary }]}>Sign out of your account</Text>
          </View>
          <ChevronRight size={20} color={colors.iconSecondary} strokeWidth={1.5} />
        </TouchableOpacity>

        {/* Delete Account Button */}
        <TouchableOpacity 
          style={styles.deleteButton}
          onPress={() => setShowDeleteModal(true)}
        >
          <Text style={[styles.deleteButtonText, { color: colors.textSecondary }]}>Delete Account</Text>
        </TouchableOpacity>

        {/* App Version */}
        <Text style={[styles.versionText, { color: colors.textTertiary }]}>Sabito Marketer v1.0.0</Text>
      </ScrollView>

      {/* Delete Account Confirmation Modal */}
      <RNModal
        visible={showDeleteModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => {
          setShowDeleteModal(false);
          setDeletePassword('');
        }}
      >
        <TouchableOpacity 
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => {
            setShowDeleteModal(false);
            setDeletePassword('');
          }}
        >
          <TouchableOpacity 
            activeOpacity={1}
            onPress={(e) => e.stopPropagation()}
            style={[styles.modalContentWrapper, { backgroundColor: colors.cardBackground }]}
          >
            <View style={styles.modalHeader}>
              <Trash2 size={32} color={COLORS.ERROR} strokeWidth={1.5} />
              <Text style={[styles.modalTitle, { color: colors.text }]}>Delete Account</Text>
              <Text style={[styles.modalSubtitle, { color: colors.textSecondary }]}>
                This action cannot be undone. All your data will be permanently deleted.
              </Text>
            </View>

            <View style={styles.modalContent}>
              <Text style={[styles.passwordLabel, { color: colors.text }]}>Enter your password to confirm:</Text>
              <TextInput
                value={deletePassword}
                onChangeText={setDeletePassword}
                mode="outlined"
                secureTextEntry
                placeholder="Password"
                placeholderTextColor={colors.inputPlaceholder}
                textColor={colors.text}
                outlineColor={colors.border}
                activeOutlineColor={COLORS.ERROR}
                style={[styles.passwordInput, { backgroundColor: colors.background }]}
              />
            </View>

            <View style={styles.modalActions}>
              <Button
                mode="outlined"
                onPress={() => {
                  setShowDeleteModal(false);
                  setDeletePassword('');
                }}
                style={[styles.modalCancelButton, { borderColor: colors.border }]}
                labelStyle={[styles.modalCancelLabel, { color: colors.text }]}
              >
                Cancel
              </Button>
              <Button
                mode="contained"
                onPress={handleDeleteAccount}
                loading={isDeleting}
                disabled={isDeleting || !deletePassword.trim()}
                style={[styles.modalDeleteButton, { backgroundColor: COLORS.ERROR }]}
                labelStyle={styles.modalDeleteLabel}
              >
                Delete Account
              </Button>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </RNModal>
    </SafeAreaView>

    {/* Custom Dialog */}
    <CustomDialog
      visible={dialog.visible}
      title={dialog.title}
      message={dialog.message}
      buttons={dialog.buttons}
      onClose={hideDialog}
    />
    </>
  );
};

const styles = StyleSheet.create({
  safeArea: {
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
  },
  scrollView: {
    flex: 1,
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.WHITE,
    paddingHorizontal: 16,
    paddingVertical: SPACING.md,
    marginBottom: SPACING.lg,
    marginHorizontal: SPACING.md,
    borderRadius: 12,
    marginTop: SPACING.md,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  avatarContainer: {
    marginRight: SPACING.md,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  avatarPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: COLORS.APP_GREEN,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: FONT_SIZES.xxl,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.WHITE,
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontSize: FONT_SIZES.xl,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.BLACK,
    marginBottom: 2,
  },
  profileType: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.GRAY,
  },
  section: {
    marginBottom: SPACING.lg,
  },
  sectionTitle: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.GRAY,
    paddingHorizontal: 16,
    paddingVertical: SPACING.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  settingsGroup: {
    backgroundColor: COLORS.WHITE,
    marginHorizontal: SPACING.md,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    paddingHorizontal: 16,
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
    fontWeight: FONT_WEIGHTS.medium,
    color: COLORS.BLACK,
    marginBottom: 2,
  },
  settingSubtitle: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.GRAY,
  },
  quickActionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.lg,
    paddingHorizontal: 16,
    marginBottom: SPACING.sm,
    marginHorizontal: SPACING.md,
    borderRadius: 12,
    borderWidth: 1,
  },
  quickActionIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.md,
  },
  quickActionContent: {
    flex: 1,
  },
  quickActionText: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.semibold,
    marginBottom: 2,
  },
  quickActionDescription: {
    fontSize: FONT_SIZES.sm,
  },
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.WHITE,
    paddingVertical: SPACING.lg,
    paddingHorizontal: 16,
    marginBottom: SPACING.md,
    marginHorizontal: SPACING.md,
    borderRadius: 12,
  },
  shareIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#D1FAE5',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.md,
  },
  shareContent: {
    flex: 1,
  },
  shareText: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.BLACK,
    marginBottom: 2,
  },
  shareDescription: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.GRAY,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.lg,
    paddingHorizontal: 16,
    marginTop: SPACING.lg,
    marginBottom: SPACING.sm,
    marginHorizontal: SPACING.md,
    borderRadius: 12,
    borderWidth: 1,
  },
  logoutIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.md,
  },
  logoutContent: {
    flex: 1,
  },
  logoutText: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.semibold,
    marginBottom: 2,
  },
  logoutDescription: {
    fontSize: FONT_SIZES.sm,
  },
  deleteButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.sm,
    marginTop: SPACING.md,
  },
  deleteButtonText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.medium,
  },
  versionText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.GRAY,
    textAlign: 'center',
    paddingVertical: SPACING.xl,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContentWrapper: {
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
  },
  modalHeader: {
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  modalTitle: {
    fontSize: FONT_SIZES.xl,
    fontWeight: FONT_WEIGHTS.bold,
    marginTop: SPACING.md,
    marginBottom: SPACING.xs,
  },
  modalSubtitle: {
    fontSize: FONT_SIZES.sm,
    textAlign: 'center',
    lineHeight: 20,
  },
  modalContent: {
    marginBottom: SPACING.lg,
  },
  passwordLabel: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.medium,
    marginBottom: SPACING.sm,
  },
  passwordInput: {
    fontSize: FONT_SIZES.md,
  },
  modalActions: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  modalCancelButton: {
    flex: 1,
  },
  modalCancelLabel: {
    fontSize: FONT_SIZES.sm,
  },
  modalDeleteButton: {
    flex: 1,
  },
  modalDeleteLabel: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.WHITE,
  },
});

export default MarketerAccount;






