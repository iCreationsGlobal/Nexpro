import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { 
  Wallet, 
  CheckCircle, 
  AlertCircle,
  User,
  CreditCard,
  Calculator
} from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { getTheme } from '../../constants/themes';
import COLORS from '../../constants/colors';
import { SPACING, FONT_SIZES, FONT_WEIGHTS } from '../../constants/sizes';
import BackButton from '../../components/common/BackButton';
import { Button } from 'react-native-paper';
import CashoutConfirmationModal from '../../components/common/CashoutConfirmationModal';
import SuccessModal from '../../components/common/SuccessModal';
import CustomDialog from '../../components/common/CustomDialog';
import useDialog from '../../hooks/useDialog';
import {
  createCashout,
  getMarketerSession,
  listMyEarnings,
} from '../../api/absMarketer';
import type { RootStackScreenProps } from '../../types/navigation';

type CashoutRequestScreenProps = RootStackScreenProps<'CashoutRequest'>;

interface Earning {
  id: string;
  amount: number;
  status: string;
  tenant?: { name?: string };
  rateType?: string;
  project?: {
    id: string;
    projectName: string;
    referral?: {
      clientName?: string;
    };
  };
}

const CashoutRequestScreen: React.FC<CashoutRequestScreenProps> = ({ navigation, route }) => {
  const { theme, effectiveTheme } = useTheme();
  const { colors, isDark } = getTheme(effectiveTheme || theme);
  const { dialog, showDialog, hideDialog } = useDialog();
  
  const { availableBalance } = route.params || {};
  
  const [user, setUser] = useState<any>(null);
  const [earnings, setEarnings] = useState<Earning[]>([]);
  const [selectedProjects, setSelectedProjects] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [withdrawalFee] = useState<number>(0);
  const [showConfirmModal, setShowConfirmModal] = useState<boolean>(false);
  const [showSuccessModal, setShowSuccessModal] = useState<boolean>(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async (): Promise<void> => {
    try {
      setIsLoading(true);
      const session = await getMarketerSession();
      setUser(session.marketer);
      await fetchEarnings();
    } catch (error: any) {
      showDialog({
        title: 'Error',
        message: 'Failed to load data',
        buttons: [{ text: 'OK', style: 'default', onPress: hideDialog }]
      });
    } finally {
      setIsLoading(false);
    }
  };

  const fetchEarnings = async (): Promise<void> => {
    try {
      const rows = await listMyEarnings('due');
      const availableEarnings = (rows || []).map((e: any) => ({
        ...e,
        amount: Number(e.amount || 0),
        project: {
          id: e.id,
          projectName: e.tenant?.name || e.rateType || 'Commission',
          referral: { clientName: e.rateType },
        },
      }));
      setEarnings(availableEarnings);
      setSelectedProjects(availableEarnings.map((e) => e.id));
    } catch (error: any) {
      setEarnings([]);
    }
  };

  const toggleProjectSelection = (projectId: string): void => {
    setSelectedProjects(prev => {
      if (prev.includes(projectId)) {
        return prev.filter(id => id !== projectId);
      } else {
        return [...prev, projectId];
      }
    });
  };

  const calculateTotals = (): { totalAmount: number; feeAmount: number; finalAmount: number } => {
    const selectedEarnings = earnings.filter(e => selectedProjects.includes(e.project.id));
    const totalAmount = selectedEarnings.reduce((sum, e) => sum + e.amount, 0);
    const feeAmount = (totalAmount * withdrawalFee) / 100;
    const finalAmount = totalAmount - feeAmount;
    
    return { totalAmount, feeAmount, finalAmount };
  };

  const handleSubmit = (): void => {
    if (selectedProjects.length === 0) {
      showDialog({
        title: 'No Projects Selected',
        message: 'Please select at least one project to cashout',
        buttons: [{ text: 'OK', style: 'default', onPress: hideDialog }]
      });
      return;
    }

    if (!user?.paymentMethod) {
      showDialog({
        title: 'Payment Method Required',
        message: 'Please set up your payment method in your profile before requesting a cashout.',
        buttons: [
          { text: 'Cancel', style: 'cancel', onPress: hideDialog },
          { 
            text: 'Go to Profile', 
            onPress: () => {
              hideDialog();
              navigation.navigate('MarketerAccount');
            },
            style: 'default'
          }
        ]
      });
      return;
    }

    // Show confirmation modal
    setShowConfirmModal(true);
  };

  const submitCashoutRequest = async (): Promise<void> => {
    try {
      setIsSubmitting(true);
      if (!user?.momoNumber && !user?.bankDetails) {
        setShowConfirmModal(false);
        showDialog({
          title: 'Payment method required',
          message: 'Add your MoMo number or bank details in Account before requesting a cashout.',
          buttons: [
            {
              text: 'Set up',
              style: 'default',
              onPress: () => {
                hideDialog();
                navigation.navigate('PaymentMethodSetup' as never);
              },
            },
            { text: 'Cancel', style: 'cancel', onPress: hideDialog },
          ],
        });
        return;
      }

      await createCashout({ commissionIds: selectedProjects });
      setShowConfirmModal(false);
      setShowSuccessModal(true);
    } catch (error: any) {
      const errorMessage = (error.response?.data as any)?.message || error.message || 'Failed to submit cashout request';
      setShowConfirmModal(false);
      showDialog({
        title: 'Error',
        message: errorMessage,
        buttons: [{ text: 'OK', style: 'default', onPress: hideDialog }]
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const { totalAmount, feeAmount, finalAmount } = calculateTotals();
  const isProfessional = user?.subscriptionPlan?.toLowerCase() === 'professional';

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.APP_GREEN} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />

      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.cardBackground, borderBottomColor: colors.border }]}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={[styles.headerTitle, { color: colors.text }]}>Request Cashout</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Available Balance Card */}
        <View style={[styles.balanceCard, { backgroundColor: COLORS.APP_GREEN }]}>
          <Wallet size={32} color="#FFFFFF" strokeWidth={2} />
          <Text style={styles.balanceLabel}>Available Balance</Text>
          <Text style={styles.balanceAmount}>₵{availableBalance?.toFixed(2) || '0.00'}</Text>
        </View>

        {/* Select Projects */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            Select Projects to Cashout
          </Text>
          <Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>
            Choose which projects you want to withdraw
          </Text>
          
          {earnings.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
              <AlertCircle size={32} color={colors.iconSecondary} strokeWidth={1.5} />
              <Text style={[styles.emptyText, { color: colors.text }]}>No available earnings to cashout</Text>
            </View>
          ) : (
            earnings.map((earning) => {
              const isSelected = selectedProjects.includes(earning.project.id);
              return (
                <TouchableOpacity
                  key={earning.id}
                  style={[
                    styles.projectCard,
                    { 
                      backgroundColor: colors.cardBackground,
                      borderColor: isSelected ? COLORS.APP_GREEN : colors.border,
                      borderWidth: isSelected ? 2 : 1
                    }
                  ]}
                  onPress={() => toggleProjectSelection(earning.project.id)}
                  activeOpacity={0.7}
                >
                  <View style={styles.projectHeader}>
                    <View style={[styles.checkbox, { borderColor: isSelected ? COLORS.APP_GREEN : colors.border }]}>
                      {isSelected && <CheckCircle size={24} color={COLORS.APP_GREEN} strokeWidth={2} />}
                    </View>
                    <View style={styles.projectInfo}>
                      <Text style={[styles.projectName, { color: colors.text }]} numberOfLines={1}>
                        {earning.project.projectName}
                      </Text>
                      <Text style={[styles.projectClient, { color: colors.textSecondary }]}>
                        {earning.project.referral?.clientName || 'Unknown Client'}
                      </Text>
                    </View>
                    <Text style={[styles.projectAmount, { color: COLORS.APP_GREEN }]}>
                      ₵{earning.amount.toFixed(2)}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </View>

        {/* Calculation Summary */}
        {selectedProjects.length > 0 && (
          <View style={[styles.summaryCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
            <View style={[styles.summaryIconContainer, { backgroundColor: isDark ? 'transparent' : '#FEF3C7' }]}>
              <Calculator size={24} color="#F59E0B" strokeWidth={2} />
            </View>
            
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Total Earnings</Text>
              <Text style={[styles.summaryValue, { color: colors.text }]}>₵{totalAmount.toFixed(2)}</Text>
            </View>
            
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>
                Withdrawal Fee ({withdrawalFee}%{isProfessional ? ' · Pro' : ''})
              </Text>
              <Text style={[styles.summaryFee, { color: '#EF4444' }]}>- ₵{feeAmount.toFixed(2)}</Text>
            </View>
            
            <View style={[styles.summaryDivider, { backgroundColor: colors.border }]} />
            
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryLabelFinal, { color: colors.text }]}>You Will Receive</Text>
              <Text style={[styles.summaryValueFinal, { color: COLORS.APP_GREEN }]}>₵{finalAmount.toFixed(2)}</Text>
            </View>
          </View>
        )}

        {/* Payment Method Info */}
        <View style={[styles.paymentCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
          <View style={styles.paymentHeader}>
            <CreditCard size={20} color={COLORS.APP_GREEN} strokeWidth={2} />
            <Text style={[styles.paymentTitle, { color: colors.text }]}>Payment Method</Text>
          </View>
          
          {user?.paymentMethod ? (
            <View style={styles.paymentInfo}>
              <View style={styles.paymentRow}>
                <Text style={[styles.paymentLabel, { color: colors.textSecondary }]}>Provider</Text>
                <Text style={[styles.paymentValue, { color: colors.text }]}>{user.paymentProvider || 'N/A'}</Text>
              </View>
              <View style={styles.paymentRow}>
                <Text style={[styles.paymentLabel, { color: colors.textSecondary }]}>Number</Text>
                <Text style={[styles.paymentValue, { color: colors.text }]}>{user.paymentNumber || 'N/A'}</Text>
              </View>
              <View style={styles.paymentRow}>
                <Text style={[styles.paymentLabel, { color: colors.textSecondary }]}>Account Name</Text>
                <Text style={[styles.paymentValue, { color: colors.text }]}>{user.accountName || 'N/A'}</Text>
              </View>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.paymentWarning}
              onPress={() => navigation.navigate('PaymentMethodSetup')}
            >
              <AlertCircle size={20} color="#F59E0B" strokeWidth={2} />
              <View style={styles.paymentWarningContent}>
                <Text style={[styles.paymentWarningTitle, { color: '#F59E0B' }]}>No Payment Method</Text>
                <Text style={[styles.paymentWarningText, { color: colors.textSecondary }]}>
                  Tap to add your mobile money account
                </Text>
              </View>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>

      {/* Bottom Submit Button */}
      <View style={[styles.bottomSection, { 
        backgroundColor: colors.background,
        borderTopColor: colors.border 
      }]}>
        <Button
          mode="contained"
          onPress={handleSubmit}
          style={[styles.submitButton, !user?.paymentMethod && styles.submitButtonDisabled]}
          contentStyle={styles.submitButtonContent}
          labelStyle={styles.submitButtonLabel}
          disabled={selectedProjects.length === 0 || !user?.paymentMethod || isSubmitting}
          loading={isSubmitting}
        >
          {isSubmitting ? 'Submitting...' : `Request ₵${finalAmount.toFixed(2)}`}
        </Button>
        <Text style={[styles.feeNotice, { color: colors.textSecondary }]}>
          {isProfessional ? '1% fee for Professional members' : `${withdrawalFee}% withdrawal fee applies`}
        </Text>
      </View>

      {/* Confirmation Modal */}
      <CashoutConfirmationModal
        visible={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        onConfirm={submitCashoutRequest}
        totalAmount={totalAmount}
        feeAmount={feeAmount}
        finalAmount={finalAmount}
        withdrawalFee={withdrawalFee}
        paymentProvider={user?.paymentProvider || 'N/A'}
        paymentNumber={user?.paymentNumber || 'N/A'}
        isLoading={isSubmitting}
      />

      {/* Success Modal */}
      <SuccessModal
        visible={showSuccessModal}
        onClose={() => {
          setShowSuccessModal(false);
          navigation.goBack();
        }}
        title="Request Submitted!"
        message="Your cashout request has been submitted successfully. You will be notified once it is processed. Payments are typically processed within 1-3 business days."
        buttonText="Done"
      />

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
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: FONT_SIZES.xl,
    fontWeight: FONT_WEIGHTS.bold,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: SPACING.md,
    paddingBottom: SPACING.xxl,
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
  balanceCard: {
    padding: SPACING.xl,
    borderRadius: 16,
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  balanceLabel: {
    fontSize: FONT_SIZES.sm,
    color: 'rgba(255, 255, 255, 0.9)',
    marginTop: SPACING.sm,
    marginBottom: SPACING.xs,
  },
  balanceAmount: {
    fontSize: 36,
    fontWeight: FONT_WEIGHTS.bold,
    color: '#FFFFFF',
  },
  section: {
    marginBottom: SPACING.lg,
  },
  sectionTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: FONT_WEIGHTS.bold,
    marginBottom: SPACING.xs,
  },
  sectionSubtitle: {
    fontSize: FONT_SIZES.sm,
    marginBottom: SPACING.md,
  },
  emptyCard: {
    padding: SPACING.xl,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: FONT_SIZES.md,
    marginTop: SPACING.sm,
  },
  projectCard: {
    borderRadius: 12,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
  },
  projectHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkbox: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.md,
  },
  projectInfo: {
    flex: 1,
  },
  projectName: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.semibold,
    marginBottom: 4,
  },
  projectClient: {
    fontSize: FONT_SIZES.sm,
  },
  projectAmount: {
    fontSize: FONT_SIZES.lg,
    fontWeight: FONT_WEIGHTS.bold,
  },
  summaryCard: {
    borderRadius: 12,
    padding: SPACING.lg,
    borderWidth: 1,
    marginBottom: SPACING.lg,
  },
  summaryIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  summaryLabel: {
    fontSize: FONT_SIZES.md,
  },
  summaryValue: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  summaryFee: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  summaryDivider: {
    height: 1,
    marginVertical: SPACING.md,
  },
  summaryLabelFinal: {
    fontSize: FONT_SIZES.lg,
    fontWeight: FONT_WEIGHTS.bold,
  },
  summaryValueFinal: {
    fontSize: FONT_SIZES.xl,
    fontWeight: FONT_WEIGHTS.bold,
  },
  paymentCard: {
    borderRadius: 12,
    padding: SPACING.lg,
    borderWidth: 1,
    marginBottom: SPACING.lg,
  },
  paymentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  paymentTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  paymentInfo: {
    gap: SPACING.sm,
  },
  paymentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  paymentLabel: {
    fontSize: FONT_SIZES.sm,
  },
  paymentValue: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.medium,
  },
  paymentWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    padding: SPACING.md,
    borderRadius: 8,
    backgroundColor: '#FEF3C7',
  },
  paymentWarningContent: {
    flex: 1,
  },
  paymentWarningTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.semibold,
    marginBottom: 4,
  },
  paymentWarningText: {
    fontSize: FONT_SIZES.sm,
  },
  bottomSection: {
    padding: SPACING.md,
    borderTopWidth: 1,
  },
  submitButton: {
    marginBottom: SPACING.sm,
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonContent: {
    paddingVertical: SPACING.sm,
  },
  submitButtonLabel: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.bold,
  },
  feeNotice: {
    fontSize: FONT_SIZES.xs,
    textAlign: 'center',
  },
});

export default CashoutRequestScreen;






