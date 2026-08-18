import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  RefreshControl,
  ActivityIndicator,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import {
  Search,
  CreditCard,
  Calendar,
  CheckCircle,
  Clock,
  AlertCircle,
  Building2,
  DollarSign,
  TrendingUp,
} from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { getTheme } from '../../constants/themes';
import BackButton from '../../components/common/BackButton';
import COLORS from '../../constants/colors';
import apiClient from '../../services/apiClient';
import type { RootStackScreenProps } from '../../types/navigation';
import type { PlatformFeeInvoice, PlatformFeeSummary } from '../../types/api';

type AdminPlatformFeesScreenProps = RootStackScreenProps<'AdminPlatformFees'>;

interface PlatformFeesResponse {
  success?: boolean;
  platformFees?: PlatformFeeInvoice[];
  invoices?: PlatformFeeInvoice[]; // For compatibility
  summary?: PlatformFeeSummary;
  message?: string;
}

const AdminPlatformFeesScreen: React.FC = () => {
  const navigation = useNavigation<AdminPlatformFeesScreenProps['navigation']>();
  const { theme, effectiveTheme } = useTheme();
  const { colors, isDark } = getTheme(effectiveTheme || theme);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [invoices, setInvoices] = useState<PlatformFeeInvoice[]>([]);
  const [summary, setSummary] = useState<PlatformFeeSummary | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeTab, setActiveTab] = useState<string>('all');

  const tabs = [
    { key: 'all', label: 'All', status: null },
    { key: 'paid', label: 'Paid', status: 'paid' },
    { key: 'pending', label: 'Pending', status: 'pending' },
    { key: 'overdue', label: 'Overdue', status: 'overdue' },
    { key: 'processing', label: 'Processing', status: 'processing' },
  ];

  const filteredInvoices = useMemo(() => {
    let filtered = invoices;

    // Filter by status
    if (activeTab !== 'all') {
      filtered = filtered.filter((inv) => inv.status?.toLowerCase() === activeTab);
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (inv) =>
          inv.project?.projectName?.toLowerCase().includes(query) ||
          inv.business?.businessName?.toLowerCase().includes(query) ||
          inv.id?.toLowerCase().includes(query)
      );
    }

    return filtered;
  }, [searchQuery, invoices, activeTab]);

  useEffect(() => {
    fetchPlatformFees();
  }, []);

  const fetchPlatformFees = async (): Promise<void> => {
    try {
      setLoading(true);
      const response = await apiClient.get<PlatformFeesResponse>('/api/admin/platform-fees');
      
      // Backend returns { success: true, platformFees: [...], summary: {...} }
      if (response.data) {
        const invoices = response.data.platformFees || response.data.invoices || [];
        setInvoices(invoices);
        setSummary(response.data.summary || null);
      }
    } catch (error: any) {
      // Error handling
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = (): void => {
    setRefreshing(true);
    fetchPlatformFees();
  };

  const handleBack = (): void => {
    navigation.goBack();
  };

  const getStatusColor = (status?: string): { color: string; bg: string; border: string } => {
    switch (status?.toLowerCase()) {
      case 'paid':
        return { color: COLORS.SUCCESS, bg: '#E8F5E9', border: COLORS.SUCCESS };
      case 'pending':
        return { color: COLORS.WARNING, bg: '#FFF8E1', border: COLORS.WARNING };
      case 'overdue':
        return { color: COLORS.ERROR, bg: '#FFEBEE', border: COLORS.ERROR };
      case 'processing':
        return { color: COLORS.INFO, bg: '#E3F2FD', border: COLORS.INFO };
      default:
        return { color: colors.textSecondary, bg: colors.cardBackground, border: colors.border };
    }
  };

  const formatCurrency = (amount?: number): string => {
    return `GHS ${(amount || 0).toLocaleString('en-GH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const formatDate = (dateString?: string): string => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-GB', { 
      day: '2-digit', 
      month: 'short', 
      year: 'numeric' 
    });
  };

  const renderSummaryCards = (): React.ReactElement | null => {
    if (!summary) return null;

    return (
      <View style={styles.summarySection}>
        <View style={[styles.summaryCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
          <View style={[styles.summaryIconContainer, { backgroundColor: `${COLORS.APP_GREEN}15` }]}>
            <TrendingUp size={24} color={COLORS.APP_GREEN} strokeWidth={2} />
          </View>
          <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Total Revenue</Text>
          <Text style={[styles.summaryValue, { color: colors.text }]}>
            {formatCurrency(summary.totalRevenue)}
          </Text>
          <Text style={[styles.summaryCount, { color: colors.textSecondary }]}>
            {summary.totalCount || 0} invoices
          </Text>
        </View>

        <View style={[styles.summaryCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
          <View style={[styles.summaryIconContainer, { backgroundColor: `${COLORS.SUCCESS}15` }]}>
            <CheckCircle size={24} color={COLORS.SUCCESS} strokeWidth={2} />
          </View>
          <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Paid</Text>
          <Text style={[styles.summaryValue, { color: colors.text }]}>
            {formatCurrency(summary.totalPaid)}
          </Text>
          <Text style={[styles.summaryCount, { color: colors.textSecondary }]}>
            {summary.paidCount || 0} invoices
          </Text>
        </View>

        <View style={[styles.summaryCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
          <View style={[styles.summaryIconContainer, { backgroundColor: `${COLORS.WARNING}15` }]}>
            <Clock size={24} color={COLORS.WARNING} strokeWidth={2} />
          </View>
          <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Pending</Text>
          <Text style={[styles.summaryValue, { color: colors.text }]}>
            {formatCurrency(summary.totalPending)}
          </Text>
          <Text style={[styles.summaryCount, { color: colors.textSecondary }]}>
            {summary.pendingCount || 0} invoices
          </Text>
        </View>

        <View style={[styles.summaryCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
          <View style={[styles.summaryIconContainer, { backgroundColor: `${COLORS.ERROR}15` }]}>
            <AlertCircle size={24} color={COLORS.ERROR} strokeWidth={2} />
          </View>
          <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Overdue</Text>
          <Text style={[styles.summaryValue, { color: colors.text }]}>
            {formatCurrency(summary.totalOverdue)}
          </Text>
          <Text style={[styles.summaryCount, { color: colors.textSecondary }]}>
            {summary.overdueCount || 0} invoices
          </Text>
        </View>
      </View>
    );
  };

  const renderInvoiceCard = (invoice: PlatformFeeInvoice): React.ReactElement | null => {
    if (!invoice) return null;

    const statusColors = getStatusColor(invoice.status);
    const isOverdue = invoice.status?.toLowerCase() === 'overdue';

    return (
      <TouchableOpacity
        key={invoice.id}
        style={[styles.invoiceCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}
        onPress={() => {
          // TODO: Navigate to invoice details if needed
        }}
      >
        {/* Header */}
        <View style={styles.invoiceHeader}>
          <View style={styles.invoiceLeft}>
            <View style={[styles.projectIconContainer, { backgroundColor: `${COLORS.APP_GREEN}15` }]}>
              <Text style={styles.projectIcon}>
                {invoice.project?.projectName?.charAt(0)?.toUpperCase() || 'P'}
              </Text>
            </View>
            <View style={styles.invoiceInfo}>
              <Text style={[styles.projectName, { color: colors.text }]} numberOfLines={1}>
                {invoice.project?.projectName || 'Platform Fee Invoice'}
              </Text>
              <View style={styles.businessRow}>
                <Building2 size={12} color={colors.textSecondary} strokeWidth={2} />
                <Text style={[styles.businessName, { color: colors.textSecondary }]} numberOfLines={1}>
                  {invoice.business?.businessName || 'Unknown Business'}
                </Text>
              </View>
            </View>
          </View>
          <View
            style={[
              styles.statusChip,
              {
                backgroundColor: statusColors.color + '20',
                borderColor: statusColors.border,
              },
            ]}
          >
            <Text style={[styles.statusChipText, { color: statusColors.color }]}>
              {invoice.status?.toUpperCase()}
            </Text>
          </View>
        </View>

        {/* Details */}
        <View style={styles.invoiceDetails}>
          <View style={styles.detailRow}>
            <View style={styles.detailItem}>
              <CreditCard size={14} color={colors.textSecondary} strokeWidth={2} />
              <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Amount</Text>
              <Text style={[styles.detailValue, { color: colors.text }]}>
                {formatCurrency(invoice.amount)}
              </Text>
            </View>
            <View style={styles.detailItem}>
              <Calendar size={14} color={colors.textSecondary} strokeWidth={2} />
              <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>
                {isOverdue ? 'Overdue' : 'Due Date'}
              </Text>
              <Text
                style={[
                  styles.detailValue,
                  { color: isOverdue ? COLORS.ERROR : colors.text },
                ]}
              >
                {formatDate(invoice.dueDate)}
              </Text>
            </View>
          </View>

          {/* Fee Info */}
          <View style={styles.feeInfoRow}>
            <View
              style={[
                styles.feeChip,
                {
                  backgroundColor: isDark ? colors.backgroundSecondary : '#F3F4F6',
                  borderColor: colors.border,
                },
              ]}
            >
              <Text style={[styles.feeChipText, { color: colors.textSecondary }]}>
                {invoice.percentage || 0}% Fee
              </Text>
            </View>
            {invoice.clientType && (
              <View
                style={[
                  styles.feeChip,
                  {
                    backgroundColor: isDark ? colors.backgroundSecondary : '#F3F4F6',
                    borderColor: colors.border,
                  },
                ]}
              >
                <Text style={[styles.feeChipText, { color: colors.textSecondary }]}>
                  {invoice.clientType === 'new' ? 'New Client' : 'Returning Client'}
                </Text>
              </View>
            )}
          </View>

          {/* Invoice ID */}
          <Text style={[styles.invoiceId, { color: colors.textSecondary }]}>
            Invoice #{invoice.id?.slice(0, 12)}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading && !refreshing) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
        
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <BackButton onPress={handleBack} />
          <Text style={[styles.headerTitle, { color: colors.text }]}>Platform Fees</Text>
          <View style={{ width: 40 }} />
        </View>
        
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.APP_GREEN} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <BackButton onPress={handleBack} />
        <Text style={[styles.headerTitle, { color: colors.text }]}>Platform Fees</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Search Bar */}
      <View style={[styles.searchContainer, { backgroundColor: colors.background }]}>
        <View
          style={[
            styles.searchBar,
            { backgroundColor: colors.cardBackground, borderColor: colors.border },
          ]}
        >
          <Search size={20} color={colors.textSecondary} strokeWidth={2} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder="Search by project, business, or invoice..."
            placeholderTextColor={colors.textSecondary}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
      </View>

      {/* Tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabsContainer}
        contentContainerStyle={styles.tabsContent}
      >
        {tabs.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[
              styles.tab,
              {
                backgroundColor:
                  activeTab === tab.key ? COLORS.APP_GREEN : colors.cardBackground,
                borderColor: activeTab === tab.key ? COLORS.APP_GREEN : colors.border,
              },
            ]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Text
              style={[
                styles.tabText,
                { color: activeTab === tab.key ? COLORS.WHITE : colors.text },
              ]}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.APP_GREEN}
          />
        }
      >
        {/* Summary Cards */}
        {renderSummaryCards()}

        {/* Invoices List */}
        <View style={styles.invoicesSection}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            {filteredInvoices.length} Invoice{filteredInvoices.length !== 1 ? 's' : ''}
          </Text>
          {filteredInvoices && filteredInvoices.length > 0 ? (
            filteredInvoices.map((invoice) => renderInvoiceCard(invoice))
          ) : (
            <View style={styles.emptyContainer}>
              <DollarSign size={64} color={colors.textSecondary} strokeWidth={1.5} />
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                No platform fee invoices found
              </Text>
            </View>
          )}
        </View>
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
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 999,
    borderWidth: 1,
    gap: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
  },
  tabsContainer: {
    maxHeight: 50,
  },
  tabsContent: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 8,
  },
  tab: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
  summarySection: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  summaryCard: {
    width: '48%',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
  },
  summaryIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryLabel: {
    fontSize: 12,
    marginTop: 4,
  },
  summaryValue: {
    fontSize: 18,
    fontWeight: '700',
  },
  summaryCount: {
    fontSize: 11,
  },
  invoicesSection: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  invoiceCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
  },
  invoiceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  invoiceLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  projectIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  projectIcon: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.APP_GREEN,
  },
  invoiceInfo: {
    flex: 1,
  },
  projectName: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 4,
  },
  businessRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  businessName: {
    fontSize: 12,
  },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    gap: 6,
  },
  statusChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  invoiceDetails: {
    gap: 10,
  },
  detailRow: {
    flexDirection: 'row',
    gap: 12,
  },
  detailItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  detailLabel: {
    fontSize: 11,
  },
  detailValue: {
    fontSize: 13,
    fontWeight: '600',
  },
  feeInfoRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  feeChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  feeChipText: {
    fontSize: 11,
  },
  invoiceId: {
    fontSize: 11,
    marginTop: 4,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 16,
    marginTop: 16,
  },
});

export default AdminPlatformFeesScreen;




