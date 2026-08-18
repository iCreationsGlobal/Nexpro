import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  DollarSign,
  BarChart3,
  Users,
  Settings,
  HelpCircle,
  LogOut,
  ChevronRight,
  Wallet,
  TrendingUp,
  FileText,
  UserPlus,
  Shield,
  RefreshCw,
  LucideIcon,
} from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { getTheme } from '../../constants/themes';
import AdminHeader from '../../components/admin/AdminHeader';
import COLORS from '../../constants/colors';
import apiClient from '../../services/apiClient';
import type { AdminTabScreenProps } from '../../types/navigation';

type AdminMoreScreenProps = AdminTabScreenProps<'More'>;

const AdminMoreScreen: React.FC = () => {
  const navigation = useNavigation<AdminMoreScreenProps['navigation']>();
  const { theme, effectiveTheme, isDark } = useTheme();
  const { colors } = getTheme(effectiveTheme || theme);
  const [pendingCashouts, setPendingCashouts] = useState<number>(0);
  const [recalculating, setRecalculating] = useState<boolean>(false);

  useEffect(() => {
    fetchPendingCashouts();
  }, []);

  const fetchPendingCashouts = async (): Promise<void> => {
    try {
      const response = await apiClient.get<{ requests?: any[]; data?: { pagination?: { total: number } } }>('/api/admin/cashout-requests');
      // Backend returns { requests: [...] } without pagination
      if (response.data?.requests) {
        const pendingCount = response.data.requests.filter((req: any) => req.status === 'pending').length;
        setPendingCashouts(pendingCount);
      } else if (response.data?.data?.pagination?.total) {
        setPendingCashouts(response.data.data.pagination.total);
      }
    } catch (error: any) {
      console.error('[AdminMore] Failed to fetch pending cashouts:', error);
      // Silently fail - badge count is not critical
    }
  };

  const handleRecalculateFees = (): void => {
    Alert.alert(
      'Recalculate Fees & Commissions',
      'This will recalculate platform fees and commissions for all existing transactions based on current subscription plans and rates. This may take a few minutes. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Recalculate',
          style: 'default',
          onPress: async () => {
            try {
              setRecalculating(true);
              const response = await apiClient.post<{ success: boolean; total: number; updated: number; errors: number; message?: string }>('/api/admin/recalculate-fees-commissions');
              
              if (response.data?.success) {
                Alert.alert(
                  'Success',
                  `Recalculation complete!\n\nTotal: ${response.data.total}\nUpdated: ${response.data.updated}\nErrors: ${response.data.errors}`,
                  [{ text: 'OK' }]
                );
              } else {
                Alert.alert('Error', response.data?.message || 'Failed to recalculate fees');
              }
            } catch (error: any) {
              Alert.alert(
                'Error',
                error.response?.data?.message || 'Failed to recalculate fees and commissions'
              );
            } finally {
              setRecalculating(false);
            }
          },
        },
      ]
    );
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
              // Clear local storage
              await AsyncStorage.multiRemove(['accessToken', 'refreshToken', 'user']);
              // Navigate to login
              navigation.reset({
                index: 0,
                routes: [{ name: 'AccountType' }],
              });
            } catch (error: any) {
              // Error handling
            }
          },
        },
      ]
    );
  };

  const renderMenuItem = (
    icon: React.ReactElement, 
    title: string, 
    subtitle: string | null, 
    onPress: () => void, 
    badgeCount: number = 0, 
    color: string = COLORS.APP_GREEN, 
    isLoading: boolean = false
  ): React.ReactElement => {
    return (
      <TouchableOpacity
        style={[
          styles.menuItem,
          { backgroundColor: colors.cardBackground, borderColor: colors.border },
          isLoading && styles.menuItemDisabled
        ]}
        onPress={onPress}
        disabled={isLoading}
      >
        <View style={[styles.menuIconContainer, { backgroundColor: `${color}15` }]}>
          {isLoading ? (
            <ActivityIndicator size="small" color={color} />
          ) : (
            icon
          )}
        </View>
        <View style={styles.menuContent}>
          <Text style={[styles.menuTitle, { color: colors.text }]}>{title}</Text>
          {subtitle && (
            <Text style={[styles.menuSubtitle, { color: colors.textSecondary }]}>{subtitle}</Text>
          )}
        </View>
        <View style={styles.menuEnd}>
          {badgeCount > 0 && (
            <View style={[styles.badge, { backgroundColor: COLORS.ERROR }]}>
              <Text style={styles.badgeText}>{badgeCount > 99 ? '99+' : badgeCount}</Text>
            </View>
          )}
          {isLoading ? (
            <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Processing...</Text>
          ) : (
            <ChevronRight size={20} color={colors.textSecondary} strokeWidth={2} />
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const renderSectionHeader = (title: string): React.ReactElement => {
    return (
      <Text style={[styles.sectionHeader, { color: colors.textSecondary }]}>{title}</Text>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <AdminHeader title="More" showSearch={false} />
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Finance Section */}
        {renderSectionHeader('FINANCE')}
        {renderMenuItem(
          <DollarSign size={24} color={COLORS.APP_GREEN} strokeWidth={2} />,
          'Cashout Requests',
          'Review and approve marketer payouts',
          () => navigation.navigate('AdminCashouts' as any),
          pendingCashouts,
          COLORS.APP_GREEN
        )}
        {renderMenuItem(
          <Wallet size={24} color="#10B981" strokeWidth={2} />,
          'Finance Overview',
          'Earnings, commissions & subscriptions',
          () => navigation.navigate('AdminFinance' as any),
          0,
          '#10B981'
        )}
        {renderMenuItem(
          <TrendingUp size={24} color="#3B82F6" strokeWidth={2} />,
          'Platform Commissions',
          'Track platform revenue',
          () => navigation.navigate('AdminCommissions' as any),
          0,
          '#3B82F6'
        )}
        {renderMenuItem(
          <RefreshCw size={24} color="#06B6D4" strokeWidth={2} />,
          'Recalculate Fees',
          'Update fees & commissions for all transactions',
          handleRecalculateFees,
          0,
          '#06B6D4',
          recalculating
        )}

        {/* Analytics Section */}
        {renderSectionHeader('ANALYTICS')}
        {renderMenuItem(
          <BarChart3 size={24} color="#8B5CF6" strokeWidth={2} />,
          'Reports',
          'View detailed analytics',
          () => navigation.navigate('AdminReports' as any),
          0,
          '#8B5CF6'
        )}

        {/* User Management Section */}
        {renderSectionHeader('USER MANAGEMENT')}
        {renderMenuItem(
          <UserPlus size={24} color="#F59E0B" strokeWidth={2} />,
          'Waiting List',
          'Pre-launch signups',
          () => navigation.navigate('AdminWaitingList' as any),
          0,
          '#F59E0B'
        )}
        {renderMenuItem(
          <Users size={24} color="#EC4899" strokeWidth={2} />,
          'Team Members',
          'Manage admin team',
          () => navigation.navigate('AdminTeamMembers' as any),
          0,
          '#EC4899'
        )}
        {renderMenuItem(
          <Shield size={24} color="#EF4444" strokeWidth={2} />,
          'Role Management',
          'Permissions & access control',
          () => navigation.navigate('AdminRoleManagement' as any),
          0,
          '#EF4444'
        )}

        {/* Settings Section */}
        {renderSectionHeader('ACCOUNT')}
        {renderMenuItem(
          <Settings size={24} color={colors.text} strokeWidth={2} />,
          'Settings',
          'Account preferences',
          () => navigation.navigate('AdminSettings'),
          0,
          colors.text
        )}
        {renderMenuItem(
          <HelpCircle size={24} color={colors.text} strokeWidth={2} />,
          'Help & Support',
          'Get help and contact support',
          () => navigation.navigate('AdminHelp' as any),
          0,
          colors.text
        )}

        {/* Logout */}
        <TouchableOpacity
          style={[styles.logoutButton, { backgroundColor: `${COLORS.ERROR}15`, borderColor: COLORS.ERROR }]}
          onPress={handleLogout}
        >
          <LogOut size={24} color={COLORS.ERROR} strokeWidth={2} />
          <Text style={[styles.logoutText, { color: COLORS.ERROR }]}>Logout</Text>
        </TouchableOpacity>

        {/* Version Info */}
        <View style={styles.versionContainer}>
          <Text style={[styles.versionText, { color: colors.textSecondary }]}>
            Sabito Admin v1.0.1
          </Text>
          <Text style={[styles.versionText, { color: colors.textSecondary }]}>
            Build 8
          </Text>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 20,
    marginBottom: 12,
    marginLeft: 4,
    letterSpacing: 0.5,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
  },
  menuItemDisabled: {
    opacity: 0.6,
  },
  menuIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuContent: {
    flex: 1,
    marginLeft: 16,
  },
  menuTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  menuSubtitle: {
    fontSize: 13,
  },
  menuEnd: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  badge: {
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  badgeText: {
    color: COLORS.WHITE,
    fontSize: 12,
    fontWeight: 'bold',
  },
  loadingText: {
    fontSize: 12,
    fontStyle: 'italic',
    marginRight: 4,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    marginTop: 32,
  },
  logoutText: {
    fontSize: 16,
    fontWeight: '600',
  },
  versionContainer: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  versionText: {
    fontSize: 12,
  },
});

export default AdminMoreScreen;



