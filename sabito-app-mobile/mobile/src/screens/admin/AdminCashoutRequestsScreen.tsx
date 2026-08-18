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
  Image,
  Alert,
  Modal,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import {
  Search,
  DollarSign,
  User,
  Calendar,
  CheckCircle,
  XCircle,
  Clock,
  Phone,
  CreditCard,
  AlertCircle,
} from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { getTheme } from '../../constants/themes';
import BackButton from '../../components/common/BackButton';
import COLORS from '../../constants/colors';
import apiClient from '../../services/apiClient';
import type { RootStackScreenProps } from '../../types/navigation';
import type { CashoutRequest } from '../../types/api';

type AdminCashoutRequestsScreenProps = RootStackScreenProps<'AdminCashoutRequests'>;

interface CashoutRequestsResponse {
  requests: CashoutRequest[];
}

const AdminCashoutRequestsScreen: React.FC = () => {
  const navigation = useNavigation<AdminCashoutRequestsScreenProps['navigation']>();
  const { theme, effectiveTheme } = useTheme();
  const { colors, isDark } = getTheme(effectiveTheme || theme);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [cashouts, setCashouts] = useState<CashoutRequest[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeTab, setActiveTab] = useState<string>('all');
  const [selectedCashout, setSelectedCashout] = useState<CashoutRequest | null>(null);
  const [showActionModal, setShowActionModal] = useState<boolean>(false);
  const [actionComment, setActionComment] = useState<string>('');
  const [actionLoading, setActionLoading] = useState<boolean>(false);

  const tabs = [
    { key: 'all', label: 'All', status: null },
    { key: 'pending', label: 'Pending', status: 'pending' },
    { key: 'processed', label: 'Processed', status: 'processed' },
    { key: 'paid', label: 'Paid', status: 'paid' },
    { key: 'rejected', label: 'Rejected', status: 'rejected' },
  ];

  const filteredCashouts = useMemo(() => {
    let filtered = cashouts;

    // Filter by status
    if (activeTab !== 'all') {
      filtered = filtered.filter((c) => c.status === activeTab);
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (c) =>
          c.marketer?.name?.toLowerCase().includes(query) ||
          c.marketer?.email?.toLowerCase().includes(query) ||
          c.amount?.toString().includes(query)
      );
    }

    return filtered;
  }, [searchQuery, cashouts, activeTab]);

  useEffect(() => {
    fetchCashoutRequests();
  }, []);

  const fetchCashoutRequests = async (): Promise<void> => {
    try {
      setLoading(true);
      const response = await apiClient.get<CashoutRequestsResponse>('/api/admin/cashout-requests');
      
      if (response.data?.requests) {
        setCashouts(response.data.requests);
      }
    } catch (error: any) {
      Alert.alert('Error', 'Failed to fetch cashout requests');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = (): void => {
    setRefreshing(true);
    fetchCashoutRequests();
  };

  const handleCashoutPress = (cashout: CashoutRequest): void => {
    setSelectedCashout(cashout);
    setShowActionModal(true);
    setActionComment('');
  };

  const handleUpdateStatus = async (newStatus: 'processed' | 'paid' | 'rejected'): Promise<void> => {
    if (!selectedCashout) return;

    try {
      setActionLoading(true);
      await apiClient.patch(
        `/api/admin/cashout-requests/${selectedCashout.id}/status`,
        {
          status: newStatus,
          comment: actionComment.trim() || undefined,
        }
      );

      Alert.alert('Success', `Cashout request ${newStatus} successfully`);
      setShowActionModal(false);
      setSelectedCashout(null);
      setActionComment('');
      fetchCashoutRequests();
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.message || 'Failed to update status');
    } finally {
      setActionLoading(false);
    }
  };

  const getStatusIcon = (status?: string): React.ReactElement | null => {
    switch (status) {
      case 'paid':
        return <CheckCircle size={14} color={COLORS.SUCCESS} strokeWidth={2} />;
      case 'rejected':
        return <XCircle size={14} color={COLORS.ERROR} strokeWidth={2} />;
      case 'pending':
        return <Clock size={14} color={COLORS.WARNING} strokeWidth={2} />;
      case 'processed':
        return <AlertCircle size={14} color={COLORS.INFO} strokeWidth={2} />;
      default:
        return null;
    }
  };

  const getStatusColor = (status?: string): string => {
    switch (status) {
      case 'paid':
        return COLORS.SUCCESS;
      case 'rejected':
        return COLORS.ERROR;
      case 'pending':
        return COLORS.WARNING;
      case 'processed':
        return COLORS.INFO;
      default:
        return colors.textSecondary;
    }
  };

  const renderCashoutCard = (cashout: CashoutRequest): React.ReactElement | null => {
    if (!cashout) return null;

    const status = cashout.status || 'pending';
    const marketer = cashout.marketer || {};
    
    return (
      <TouchableOpacity
        key={cashout.id}
        style={[styles.cashoutCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}
        onPress={() => handleCashoutPress(cashout)}
      >
        {/* Header */}
        <View style={styles.cardHeader}>
          {marketer.profileImage ? (
            <Image source={{ uri: marketer.profileImage }} style={styles.marketerAvatar} />
          ) : (
            <View style={[styles.marketerAvatarPlaceholder, { backgroundColor: `${COLORS.APP_GREEN}15` }]}>
              <User size={24} color={COLORS.APP_GREEN} strokeWidth={2} />
            </View>
          )}
          <View style={styles.marketerInfo}>
            <Text style={[styles.marketerName, { color: colors.text }]} numberOfLines={1}>
              {marketer.name || 'Unknown Marketer'}
            </Text>
            <View
              style={[
                styles.statusChip,
                {
                  backgroundColor: getStatusColor(status) + '20',
                  borderColor: getStatusColor(status),
                },
              ]}
            >
              {getStatusIcon(status)}
              <Text style={[styles.statusChipText, { color: getStatusColor(status) }]}>
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </Text>
            </View>
          </View>
        </View>

        {/* Amount Section */}
        <View style={[styles.amountSection, { backgroundColor: `${COLORS.APP_GREEN}10` }]}>
          <View style={styles.amountRow}>
            <Text style={[styles.amountLabel, { color: colors.textSecondary }]}>Total Amount:</Text>
            <Text style={[styles.amountValue, { color: COLORS.APP_GREEN }]}>
              GHS {(cashout.totalAmount || 0).toLocaleString()}
            </Text>
          </View>
          {cashout.feeAmount && cashout.feeAmount > 0 && (
            <View style={styles.amountRow}>
              <Text style={[styles.amountLabel, { color: colors.textSecondary }]}>Fee (2%):</Text>
              <Text style={[styles.amountValue, { color: COLORS.ERROR }]}>
                - GHS {(cashout.feeAmount || 0).toLocaleString()}
              </Text>
            </View>
          )}
          <View style={[styles.amountRow, styles.finalAmountRow]}>
            <Text style={[styles.finalAmountLabel, { color: colors.text }]}>Final Amount:</Text>
            <Text style={[styles.finalAmountValue, { color: COLORS.APP_GREEN }]}>
              GHS {(cashout.finalAmount || cashout.amount || 0).toLocaleString()}
            </Text>
          </View>
        </View>

        {/* Details */}
        <View style={styles.cardDetails}>
          {cashout.projectCount && cashout.projectCount > 0 && (
            <View style={styles.detailRow}>
              <DollarSign size={16} color={colors.textSecondary} strokeWidth={2} />
              <Text style={[styles.detailText, { color: colors.textSecondary }]}>
                {cashout.projectCount} project{cashout.projectCount !== 1 ? 's' : ''}
              </Text>
            </View>
          )}
          {marketer.phone && (
            <View style={styles.detailRow}>
              <Phone size={16} color={colors.textSecondary} strokeWidth={2} />
              <Text style={[styles.detailText, { color: colors.textSecondary }]}>
                {marketer.phone}
              </Text>
            </View>
          )}
          {marketer.paymentMethod && (
            <View style={styles.detailRow}>
              <CreditCard size={16} color={colors.textSecondary} strokeWidth={2} />
              <Text style={[styles.detailText, { color: colors.textSecondary }]}>
                {marketer.paymentMethod} - {marketer.paymentNumber || 'N/A'}
              </Text>
            </View>
          )}
          <View style={styles.detailRow}>
            <Calendar size={16} color={colors.textSecondary} strokeWidth={2} />
            <Text style={[styles.detailText, { color: colors.textSecondary }]}>
              {new Date(cashout.createdAt).toLocaleDateString('en-GB', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
              })}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderActionModal = (): React.ReactElement | null => {
    if (!selectedCashout) return null;

    const isPending = selectedCashout.status === 'pending';
    const isProcessed = selectedCashout.status === 'processed';

    return (
      <Modal
        visible={showActionModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowActionModal(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowActionModal(false)}
        >
          <View
            style={[styles.modalContent, { backgroundColor: colors.cardBackground }]}
            onStartShouldSetResponder={() => true}
          >
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              Update Cashout Request
            </Text>

            {/* Marketer Info */}
            <View style={styles.modalMarketerInfo}>
              <Text style={[styles.modalMarketerName, { color: colors.text }]}>
                {selectedCashout.marketer?.name || 'Unknown'}
              </Text>
              <Text style={[styles.modalAmount, { color: COLORS.APP_GREEN }]}>
                GHS {(selectedCashout.finalAmount || selectedCashout.amount || 0).toLocaleString()}
              </Text>
            </View>

            {/* Comment Input */}
            <TextInput
              style={[
                styles.commentInput,
                {
                  backgroundColor: colors.background,
                  borderColor: colors.border,
                  color: colors.text,
                },
              ]}
              placeholder="Add a comment (optional)"
              placeholderTextColor={colors.textSecondary}
              value={actionComment}
              onChangeText={setActionComment}
              multiline
              numberOfLines={3}
            />

            {/* Action Buttons */}
            <View style={styles.modalActions}>
              {isPending && (
                <>
                  <TouchableOpacity
                    style={[styles.modalButton, styles.processedButton]}
                    onPress={() => handleUpdateStatus('processed')}
                    disabled={actionLoading}
                  >
                    {actionLoading ? (
                      <ActivityIndicator size="small" color={COLORS.WHITE} />
                    ) : (
                      <>
                        <AlertCircle size={18} color={COLORS.WHITE} strokeWidth={2} />
                        <Text style={styles.modalButtonText}>Mark Processed</Text>
                      </>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modalButton, styles.rejectButton]}
                    onPress={() => handleUpdateStatus('rejected')}
                    disabled={actionLoading}
                  >
                    {actionLoading ? (
                      <ActivityIndicator size="small" color={COLORS.WHITE} />
                    ) : (
                      <>
                        <XCircle size={18} color={COLORS.WHITE} strokeWidth={2} />
                        <Text style={styles.modalButtonText}>Reject</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </>
              )}
              {isProcessed && (
                <TouchableOpacity
                  style={[styles.modalButton, styles.paidButton]}
                  onPress={() => handleUpdateStatus('paid')}
                  disabled={actionLoading}
                >
                  {actionLoading ? (
                    <ActivityIndicator size="small" color={COLORS.WHITE} />
                  ) : (
                    <>
                      <CheckCircle size={18} color={COLORS.WHITE} strokeWidth={2} />
                      <Text style={styles.modalButtonText}>Mark as Paid</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton, { borderColor: colors.border }]}
                onPress={() => setShowActionModal(false)}
                disabled={actionLoading}
              >
                <Text style={[styles.cancelButtonText, { color: colors.text }]}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
    );
  };

  const handleBack = (): void => {
    navigation.goBack();
  };

  if (loading && !refreshing) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
        
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <BackButton onPress={handleBack} />
          <Text style={[styles.headerTitle, { color: colors.text }]}>Cashout Requests</Text>
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
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
      
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <BackButton onPress={handleBack} />
        <Text style={[styles.headerTitle, { color: colors.text }]}>Cashout Requests</Text>
        <View style={{ width: 40 }} />
      </View>
      
      {/* Search Bar */}
      <View style={[styles.searchContainer, { backgroundColor: colors.background }]}>
        <View style={[styles.searchBar, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
          <Search size={20} color={colors.textSecondary} strokeWidth={2} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder="Search by marketer or amount..."
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
                backgroundColor: activeTab === tab.key ? COLORS.APP_GREEN : colors.cardBackground,
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

      {/* Cashout List */}
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
        {filteredCashouts && filteredCashouts.length > 0 ? (
          filteredCashouts.map((cashout) => renderCashoutCard(cashout))
        ) : (
          <View style={styles.emptyContainer}>
            <DollarSign size={64} color={colors.textSecondary} strokeWidth={1.5} />
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              No cashout requests found
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Action Modal */}
      {renderActionModal()}
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
    padding: 16,
  },
  cashoutCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  marketerAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  marketerAvatarPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  marketerInfo: {
    flex: 1,
    marginLeft: 12,
  },
  marketerName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
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
  amountSection: {
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  amountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  finalAmountRow: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.1)',
  },
  amountLabel: {
    fontSize: 13,
  },
  amountValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  finalAmountLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  finalAmountValue: {
    fontSize: 16,
    fontWeight: '700',
  },
  cardDetails: {
    gap: 8,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  detailText: {
    fontSize: 13,
    flex: 1,
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 16,
    padding: 24,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 16,
    textAlign: 'center',
  },
  modalMarketerInfo: {
    alignItems: 'center',
    marginBottom: 16,
  },
  modalMarketerName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  modalAmount: {
    fontSize: 24,
    fontWeight: '700',
  },
  commentInput: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    minHeight: 80,
    textAlignVertical: 'top',
    marginBottom: 16,
  },
  modalActions: {
    gap: 10,
  },
  modalButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 8,
  },
  processedButton: {
    backgroundColor: COLORS.INFO,
  },
  paidButton: {
    backgroundColor: COLORS.SUCCESS,
  },
  rejectButton: {
    backgroundColor: COLORS.ERROR,
  },
  cancelButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
  },
  modalButtonText: {
    color: COLORS.WHITE,
    fontSize: 15,
    fontWeight: '600',
  },
  cancelButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
});

export default AdminCashoutRequestsScreen;





