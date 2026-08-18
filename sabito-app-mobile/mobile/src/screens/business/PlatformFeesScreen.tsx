import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Platform,
  RefreshControl,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { CreditCard, Calendar, AlertCircle, CheckCircle, Clock, Info } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../../context/ThemeContext';
import { getTheme } from '../../constants/themes';
import COLORS from '../../constants/colors';
import { SPACING, FONT_SIZES, FONT_WEIGHTS, LAYOUT_PADDING } from '../../constants/sizes';
import BackButton from '../../components/common/BackButton';
import PlatformFeePaymentModal from '../../components/payments/PlatformFeePaymentModal';
import CustomDialog from '../../components/common/CustomDialog';
import useDialog from '../../hooks/useDialog';
import apiClient from '../../services/apiClient';
import type { RootStackScreenProps } from '../../types/navigation';
import type { PlatformFeeInvoice, PlatformFeeSummary } from '../../types/api';

type PlatformFeesScreenProps = RootStackScreenProps<'PlatformFees'>;

interface StatusColor {
  color: string;
  bg: string;
  border: string;
}

const PlatformFeesScreen: React.FC<PlatformFeesScreenProps> = ({ navigation }) => {
  const { theme, effectiveTheme } = useTheme();
  const { colors, isDark } = getTheme(effectiveTheme || theme);
  const { dialog, showDialog, hideDialog } = useDialog();
  
  const [invoices, setInvoices] = useState<PlatformFeeInvoice[]>([]);
  const [summary, setSummary] = useState<PlatformFeeSummary | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [selectedFee, setSelectedFee] = useState<PlatformFeeInvoice | null>(null);
  const [isPaymentModalVisible, setIsPaymentModalVisible] = useState<boolean>(false);

  useEffect(() => {
    fetchPlatformFees();
    
    return () => {
      // Cleanup if needed
    };
  }, []);

  // Auto-refresh when screen comes into focus
  useFocusEffect(
    React.useCallback(() => {
      fetchPlatformFees(true);
    }, [])
  );

  const fetchPlatformFees = async (isRefresh = false): Promise<void> => {
    try {
      if (isRefresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }

      const response = await apiClient.get('/api/platform-fees/business');
      if (response.data.invoices) {
        setInvoices(response.data.invoices as PlatformFeeInvoice[]);
        setSummary(response.data.summary as PlatformFeeSummary);
      }
    } catch (error) {
      // Silent fail
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  const onRefresh = (): void => {
    fetchPlatformFees(true);
  };

  const handlePayFee = (invoice: PlatformFeeInvoice): void => {
    setSelectedFee(invoice);
    setIsPaymentModalVisible(true);
  };

  const handlePaymentSuccess = async (paymentData: { amount: string | number }): Promise<void> => {
    setIsPaymentModalVisible(false);
    setSelectedFee(null);
    
    // Refresh data first
    await fetchPlatformFees(true);
    
    // Show success dialog after refresh
    setTimeout(() => {
      showDialog({
        title: 'Payment Successful!',
        message: `Platform fee of ₵${parseFloat(String(paymentData.amount)).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} has been paid successfully.`,
        buttons: [
          {
            text: 'OK',
            onPress: hideDialog,
          },
        ]
      });
    }, 300);
  };

  const handleClosePaymentModal = (): void => {
    setIsPaymentModalVisible(false);
    setSelectedFee(null);
  };

  const getStatusColor = (status?: string): StatusColor => {
    switch (status?.toLowerCase()) {
      case 'paid':
        return { color: '#1CA700', bg: '#E8F5E9', border: '#1CA700' };
      case 'pending':
        return { color: '#F9A825', bg: '#FFF8E1', border: '#F9A825' };
      case 'overdue':
        return { color: '#D32F2F', bg: '#FFEBEE', border: '#D32F2F' };
      case 'processing':
        return { color: '#3B82F6', bg: '#dbeafe', border: '#3B82F6' };
      default:
        return { color: '#555', bg: '#eee', border: '#ccc' };
    }
  };

  const formatCurrency = (amount?: number): string => {
    return `₵${(amount || 0).toLocaleString('en-GH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const formatDate = (dateString?: string): string => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const renderInvoiceCard = (invoice: PlatformFeeInvoice): React.ReactElement => {
    const statusColors = getStatusColor(invoice.status);
    const isOverdue = invoice.status === 'overdue';

    return (
      <TouchableOpacity
        key={invoice.id}
        style={[styles.invoiceCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}
        onPress={() => {
          // TODO: Navigate to invoice details
        }}
      >
        <View style={styles.invoiceHeader}>
          <View style={styles.invoiceLeft}>
            <View style={styles.projectIconContainer}>
              <Text style={styles.projectIcon}>
                {invoice.project?.projectName?.charAt(0)?.toUpperCase() || 'P'}
              </Text>
            </View>
            <View style={styles.invoiceInfo}>
              <Text style={[styles.projectName, { color: colors.text }]} numberOfLines={1}>
                {invoice.project?.projectName || 'Platform Fee Invoice'}
              </Text>
              <Text style={[styles.invoiceId, { color: colors.textSecondary }]} numberOfLines={1}>
                #{invoice.id.slice(0, 8)}
              </Text>
            </View>
          </View>
          <View
            style={[
              styles.statusBadge,
              {
                backgroundColor: isDark ? 'transparent' : statusColors.bg,
                borderColor: statusColors.border,
              },
            ]}
          >
            <Text style={[styles.statusText, { color: statusColors.color }]}>
              {invoice.status?.toUpperCase()}
            </Text>
          </View>
        </View>

        <View style={styles.invoiceDetails}>
          <View style={styles.detailRow}>
            <View style={styles.detailItem}>
              <CreditCard size={14} color={colors.iconSecondary} strokeWidth={2} />
              <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Amount</Text>
              <Text style={[styles.detailValue, { color: colors.text }]}>{formatCurrency(invoice.amount)}</Text>
            </View>
            <View style={styles.detailItem}>
              <Calendar size={14} color={colors.iconSecondary} strokeWidth={2} />
              <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Due Date</Text>
              <Text style={[styles.detailValue, { color: colors.text }, isOverdue && styles.overdueText]}>
                {formatDate(invoice.dueDate)}
              </Text>
            </View>
          </View>

          <View style={[styles.feeTypeChip, { 
            backgroundColor: isDark ? colors.backgroundSecondary : '#F3F4F6',
            borderColor: colors.border
          }]}>
            <Text style={[styles.feeTypeText, { color: colors.textSecondary }]}>
              {invoice.percentage}% • {invoice.clientType === 'new' ? 'New Client' : 'Returning Client'}
            </Text>
          </View>

          {/* Pay Now Button - Only show for pending invoices */}
          {invoice.status === 'pending' && (
            <TouchableOpacity
              style={styles.payNowButton}
              onPress={(e) => {
                e.stopPropagation();
                handlePayFee(invoice);
              }}
            >
              <CreditCard size={16} color={COLORS.WHITE} strokeWidth={2} />
              <Text style={styles.payNowButtonText}>Pay Now</Text>
            </TouchableOpacity>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const renderEmptyState = (): React.ReactElement => (
    <View style={styles.emptyState}>
      <View style={[styles.emptyIconContainer, { 
        backgroundColor: isDark ? colors.backgroundSecondary : '#F0FDF4' 
      }]}>
        <CheckCircle size={48} color={COLORS.APP_GREEN} strokeWidth={1.5} />
      </View>
      <Text style={[styles.emptyTitle, { color: colors.text }]}>All Caught Up!</Text>
      <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
        You have no platform fee invoices at the moment. Invoices will appear here when projects are completed.
      </Text>
    </View>
  );

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.APP_GREEN} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading platform fees...</Text>
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
        <Text style={[styles.headerTitle, { color: colors.text }]}>Platform Fees</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={[styles.scrollView, { backgroundColor: colors.background }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            colors={[COLORS.APP_GREEN]}
            tintColor={COLORS.APP_GREEN}
          />
        }
      >
        {/* Info Box */}
        <View style={[styles.infoBox, { 
          backgroundColor: isDark ? colors.backgroundSecondary : '#E8F5E9' 
        }]}>
          <Info size={20} color={COLORS.APP_GREEN} strokeWidth={2} />
          <Text style={[styles.infoText, { color: colors.text }]}>
            Platform fees are automatically calculated based on your subscription plan and project amounts.
          </Text>
        </View>

        {/* Summary Cards */}
        {summary && (
          <View style={styles.summarySection}>
            <View style={[styles.summaryCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
              <Clock size={20} color="#F9A825" strokeWidth={2} />
              <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Pending</Text>
              <Text style={[styles.summaryValue, { color: colors.text }]}>{formatCurrency(summary.totalUnpaid || 0)}</Text>
              <Text style={[styles.summaryCount, { color: colors.textSecondary }]}>{summary.pendingCount || 0} invoices</Text>
            </View>

            <View style={[styles.summaryCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
              <AlertCircle size={20} color="#D32F2F" strokeWidth={2} />
              <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Overdue</Text>
              <Text style={[styles.summaryValue, { color: colors.text }]}>{formatCurrency(summary.totalOverdue || 0)}</Text>
              <Text style={[styles.summaryCount, { color: colors.textSecondary }]}>{summary.overdueCount || 0} invoices</Text>
        </View>

            <View style={[styles.summaryCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
              <CheckCircle size={20} color="#1CA700" strokeWidth={2} />
              <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Paid</Text>
              <Text style={[styles.summaryValue, { color: colors.text }]}>{formatCurrency(summary.totalPaid || 0)}</Text>
              <Text style={[styles.summaryCount, { color: colors.textSecondary }]}>{summary.paidCount || 0} invoices</Text>
            </View>
          </View>
        )}

        {/* Invoices List */}
        <View style={styles.invoicesSection}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>All Invoices</Text>
          {invoices.length > 0 ? (
            invoices.map(renderInvoiceCard)
          ) : (
            renderEmptyState()
          )}
        </View>
      </ScrollView>

      {/* Payment Modal */}
      <PlatformFeePaymentModal
        visible={isPaymentModalVisible}
        fee={selectedFee}
        onClose={handleClosePaymentModal}
        onPaymentSuccess={handlePaymentSuccess}
      />

      {/* Custom Dialog */}
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  headerTitle: {
    fontSize: FONT_SIZES.xl,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.BLACK,
  },
  scrollView: {
    flex: 1,
    backgroundColor: COLORS.WHITE,
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#E8F5E9',
    borderRadius: 12,
    padding: SPACING.md,
    margin: 16,
    gap: SPACING.sm,
  },
  infoText: {
    flex: 1,
    fontSize: FONT_SIZES.sm,
    color: COLORS.BLACK,
    lineHeight: 20,
  },
  summarySection: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginBottom: SPACING.md,
    gap: SPACING.sm,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: COLORS.WHITE,
    borderRadius: 12,
    padding: SPACING.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    gap: 4,
  },
  summaryLabel: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.GRAY,
    marginTop: 4,
  },
  summaryValue: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.BLACK,
  },
  summaryCount: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.GRAY,
  },
  invoicesSection: {
    paddingHorizontal: 16,
    paddingBottom: SPACING.xl,
  },
  sectionTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.BLACK,
    marginBottom: SPACING.md,
  },
  invoiceCard: {
    backgroundColor: COLORS.WHITE,
    borderRadius: 12,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  invoiceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: SPACING.sm,
  },
  invoiceLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: SPACING.sm,
  },
  projectIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E8F5E9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  projectIcon: {
    fontSize: FONT_SIZES.lg,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.APP_GREEN,
  },
  invoiceInfo: {
    flex: 1,
  },
  projectName: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.BLACK,
    marginBottom: 2,
  },
  invoiceId: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.GRAY,
  },
  statusBadge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  statusText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  invoiceDetails: {
    gap: SPACING.sm,
  },
  detailRow: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  detailItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  detailLabel: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.GRAY,
  },
  detailValue: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.BLACK,
  },
  overdueText: {
    color: '#D32F2F',
  },
  feeTypeChip: {
    backgroundColor: '#F3F4F6',
    borderRadius: 16,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 6,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  feeTypeText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.GRAY,
  },
  payNowButton: {
    backgroundColor: COLORS.APP_GREEN,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: 8,
    gap: 6,
    marginTop: SPACING.md,
  },
  payNowButtonText: {
    color: COLORS.WHITE,
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.xxl * 2,
  },
  emptyIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#E8F5E9',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  emptyTitle: {
    fontSize: FONT_SIZES.xl,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.BLACK,
    marginBottom: SPACING.sm,
  },
  emptyText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.GRAY,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: SPACING.xl,
  },
});

export default PlatformFeesScreen;






