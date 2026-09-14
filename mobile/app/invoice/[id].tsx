import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import {
  DetailHeroCard,
  DetailInfoRow,
  DetailSectionCard,
  DetailFooter,
  DetailLoading,
  DetailNotFound,
  DetailActionButton,
  DetailMoreActions,
  type DetailMoreAction,
  EntityDetailHeader,
  useEntityDetailTheme,
} from '@/components/EntityDetailLayout';
import { ScreenShell } from '@/components/ScreenShell';
import { useAuth } from '@/context/AuthContext';
import { useExclusiveAction } from '@/hooks/useExclusiveAction';
import { invoiceService } from '@/services/invoiceService';
import { settingsService } from '@/services/settings';
import { shareInvoicePdf, printInvoice, formatLineItemQuantityDisplay } from '@/services/pdfDocumentService';
import { usePrintFormat } from '@/hooks/usePrintFormat';
import { formatCurrency, formatDate } from '@/utils/formatCurrency';
import { formatStatusLabel } from '@/utils/formatLabels';
import {
  getDirectMomoProviders,
  isPaymentCollectionConfigured,
  isValidDirectMomoPhone,
  normalizeDirectMomoPhone,
  type DirectMomoProvider,
} from '@/utils/paymentCollection';
import { getApiErrorMessage, parseApiEntity } from '@/utils/parseApiListResponse';
import { toInvoicePaymentMethod, validateRecordedPaymentAmount } from '@/utils/recordPayment';
import { refreshAfterInvoicePayment } from '@/utils/queryInvalidation';
import {
  shareInvoiceViaEmail,
  shareInvoiceViaSms,
  shareInvoiceViaWhatsApp,
} from '@/utils/invoiceShare';
import { getCountryCallingCodeFromPhone } from '@/utils/whatsapp';
import { STUDIO_LIKE_TYPES } from '@/constants';
import { InvoiceRecordPaymentSheet } from '@/components/InvoiceRecordPaymentSheet';
import { usePaystackReconciliation } from '@/hooks/usePaystackReconciliation';

type InvoiceDetail = {
  id: string;
  invoiceNumber?: string;
  total?: number;
  totalAmount?: number;
  status: string;
  dueDate?: string;
  createdAt: string;
  customer?: { name?: string; phone?: string; email?: string; company?: string };
  saleId?: string | null;
  sale?: { id?: string; saleNumber?: string } | null;
  paymentToken?: string | null;
  paidAmount?: number;
  amountPaid?: number;
  balance?: number;
  items?: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    productCode?: string | null;
    sku?: string | null;
    code?: string | null;
    barcode?: string | null;
    metadata?: { productCode?: string | null; sku?: string | null; barcode?: string | null } | null;
  }>;
};

type InvoiceAction = 'pdf' | 'print' | 'payment' | 'send' | 'markPaid' | 'shareWhatsapp' | 'shareSms' | 'shareEmail';
type InvoiceDangerAction = InvoiceAction | 'cancel' | 'delete';

function getItemProductCode(item: NonNullable<InvoiceDetail['items']>[number]) {
  return String(
    item.metadata?.productCode
      || item.productCode
      || item.code
      || item.metadata?.barcode
      || item.barcode
      || item.sku
      || item.metadata?.sku
      || ''
  ).trim();
}

export default function InvoiceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { activeTenantId, activeTenant, isAdmin, isManager } = useAuth();
  const { printFormat } = usePrintFormat();
  const { colors, cardBg, borderColor, textColor, mutedColor } = useEntityDetailTheme();
  const [showPaymentSheet, setShowPaymentSheet] = useState(false);
  const [awaitingPaystackReturn, setAwaitingPaystackReturn] = useState(false);
  const [directPaymentStatus, setDirectPaymentStatus] = useState<
    'idle' | 'pending' | 'awaiting_otp' | 'success' | 'failed'
  >('idle');
  const [directPaymentReference, setDirectPaymentReference] = useState<string | null>(null);
  const [directPaymentMessage, setDirectPaymentMessage] = useState<string | null>(null);
  const { isAnyActionActive, isActionActive, runExclusiveAction } = useExclusiveAction<InvoiceDangerAction>();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['invoice', id],
    queryFn: () => invoiceService.getInvoiceById(String(id)),
    enabled: !!id,
  });

  const invoice = useMemo(() => parseApiEntity<InvoiceDetail>(data), [data]);
  const showProductCode = useMemo(
    () => !STUDIO_LIKE_TYPES.includes((activeTenant?.businessType || '') as (typeof STUDIO_LIKE_TYPES)[number]),
    [activeTenant?.businessType]
  );

  const { data: paymentCollectionData, isLoading: paymentCollectionLoading } = useQuery({
    queryKey: ['settings', 'payment-collection', activeTenantId],
    queryFn: settingsService.getPaymentCollectionSettings,
    enabled: Boolean(activeTenantId),
  });
  const paymentCollectionConfigured = useMemo(
    () => isPaymentCollectionConfigured(paymentCollectionData),
    [paymentCollectionData]
  );
  const directMomoProviders = useMemo(
    () => getDirectMomoProviders(paymentCollectionData),
    [paymentCollectionData]
  );

  const balance = useMemo(() => {
    if (!invoice) return 0;
    if (invoice.balance != null && Number.isFinite(Number(invoice.balance))) {
      return Math.max(0, Number(invoice.balance));
    }
    const total = Number(invoice.totalAmount ?? invoice.total ?? 0);
    const paid = Number(invoice.amountPaid ?? invoice.paidAmount ?? 0);
    return Math.max(0, total - paid);
  }, [invoice]);

  const linkedSaleId = invoice?.saleId || invoice?.sale?.id || null;

  const refreshInvoice = useCallback(async () => {
    await refetch();
    await refreshAfterInvoicePayment(queryClient);
  }, [queryClient, refetch]);

  const reconcileInvoicePaystack = useCallback(async () => {
    if (!invoice || balance <= 0) return;
    try {
      const res = await invoiceService.verifyPaystackCharge(invoice.id);
      const body = res?.success !== undefined ? res : res?.data ?? res;
      const payload = body?.data ?? body;
      await refreshInvoice();
      const applied = payload?.applied === true;
      const checkedInvoice = payload?.invoice ?? null;
      const paid = applied || checkedInvoice?.status === 'paid';
      if (paid) {
        setDirectPaymentStatus('success');
        setDirectPaymentMessage('Payment confirmed and recorded on this invoice.');
        setShowPaymentSheet(false);
        Alert.alert('Payment confirmed', 'The mobile money payment was recorded.');
        return;
      }
      const providerStatus = payload?.paystackStatus ? String(payload.paystackStatus).toLowerCase() : '';
      if (providerStatus && !['pending', 'ongoing'].includes(providerStatus)) {
        setDirectPaymentStatus('failed');
        setDirectPaymentMessage('The payment is not complete. Ask the customer to retry approval or start a new prompt.');
        return;
      }
      setDirectPaymentStatus('pending');
      setDirectPaymentMessage('Still waiting for the customer to approve the MoMo prompt.');
    } catch {
      setDirectPaymentStatus('pending');
      setDirectPaymentMessage('Could not verify yet. Check again after the customer approves the prompt.');
    } finally {
      setAwaitingPaystackReturn(false);
    }
  }, [balance, invoice, refreshInvoice]);

  usePaystackReconciliation(
    Boolean(invoice && balance > 0 && paymentCollectionConfigured && awaitingPaystackReturn),
    reconcileInvoicePaystack
  );

  const runAction = useCallback(
    async (actionKey: InvoiceDangerAction, action: () => Promise<unknown>, successMessage: string) => {
      if (!invoice) return;
      await runExclusiveAction(actionKey, async () => {
        try {
          await action();
          await refetch();
          await refreshAfterInvoicePayment(queryClient);
          Alert.alert('Success', successMessage);
          setShowPaymentSheet(false);
        } catch (err: unknown) {
          Alert.alert('Error', getApiErrorMessage(err, 'Action failed'));
        }
      });
    },
    [invoice, queryClient, refetch, runExclusiveAction]
  );

  const handleDownloadInvoice = useCallback(async () => {
    if (!invoice) return;
    await runExclusiveAction('pdf', async () => {
      try {
        // PDF (view/download/share) always renders A4 regardless of the print-format
        // setting — that setting only governs the direct "Print" action below, which
        // sends straight to whatever printer/paper size the workspace configured.
        await shareInvoicePdf(invoice as unknown as Record<string, unknown>, {
          showProductCode,
          businessType: activeTenant?.businessType,
        });
      } catch (err: unknown) {
        Alert.alert('Invoice unavailable', err instanceof Error ? err.message : 'Could not prepare this invoice PDF.');
      }
    });
  }, [invoice, runExclusiveAction, showProductCode, activeTenant?.businessType]);

  const handlePrintInvoice = useCallback(async () => {
    if (!invoice) return;
    await runExclusiveAction('print', async () => {
      try {
        await printInvoice(invoice as unknown as Record<string, unknown>, {
          showProductCode,
          businessType: activeTenant?.businessType,
          printFormat,
        });
      } catch (err: unknown) {
        Alert.alert('Print unavailable', err instanceof Error ? err.message : 'Could not print this invoice.');
      }
    });
  }, [invoice, runExclusiveAction, showProductCode, activeTenant?.businessType, printFormat]);

  const shareOptions = useMemo(
    () => ({
      businessName: activeTenant?.name,
      defaultCountryCode: getCountryCallingCodeFromPhone(activeTenant?.metadata?.phone),
    }),
    [activeTenant?.metadata?.phone, activeTenant?.name]
  );

  const handleShareViaWhatsApp = useCallback(async () => {
    if (!invoice) return;
    await runExclusiveAction('shareWhatsapp', async () => {
      try {
        await shareInvoiceViaWhatsApp(invoice, {
          ...shareOptions,
          showProductCode,
          businessType: activeTenant?.businessType,
          pdfSource: invoice as unknown as Record<string, unknown>,
        });
      } catch (err: unknown) {
        Alert.alert(
          'Share unavailable',
          err instanceof Error ? err.message : 'Could not share this invoice on WhatsApp.'
        );
      }
    });
  }, [invoice, runExclusiveAction, shareOptions, showProductCode]);

  const handleShareViaSms = useCallback(async () => {
    if (!invoice) return;
    await runExclusiveAction('shareSms', async () => {
      await shareInvoiceViaSms(invoice, shareOptions);
    });
  }, [invoice, runExclusiveAction, shareOptions]);

  const handleShareViaEmail = useCallback(async () => {
    if (!invoice) return;
    await runExclusiveAction('shareEmail', async () => {
      await shareInvoiceViaEmail(invoice, shareOptions);
    });
  }, [invoice, runExclusiveAction, shareOptions]);

  const handleCancelInvoice = useCallback(() => {
    if (!invoice) return;
    Alert.alert('Cancel invoice', 'Cancel this invoice? This keeps the record but stops further payment actions.', [
      { text: 'Keep invoice', style: 'cancel' },
      {
        text: 'Cancel invoice',
        style: 'destructive',
        onPress: () =>
          runAction('cancel', () => invoiceService.cancel(invoice.id), 'Invoice cancelled'),
      },
    ]);
  }, [invoice, runAction]);

  const handleDeleteInvoice = useCallback(() => {
    if (!invoice) return;
    const isCancelled = invoice.status === 'cancelled';
    Alert.alert('Delete invoice', 'Delete this invoice permanently?', [
      { text: 'Keep invoice', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          runExclusiveAction('delete', async () => {
            try {
              if (isCancelled) {
                await invoiceService.deleteCancelledInvoice(invoice.id);
              } else {
                await invoiceService.deleteInvoice(invoice.id);
              }
              await refreshAfterInvoicePayment(queryClient);
              Alert.alert('Deleted', 'Invoice deleted');
              router.back();
            } catch (err: unknown) {
              Alert.alert('Error', err instanceof Error ? err.message : 'Failed to delete invoice');
            }
          }),
      },
    ]);
  }, [invoice, queryClient, router, runExclusiveAction]);

  const handleClosePaymentSheet = useCallback(() => {
    if (!isAnyActionActive) setShowPaymentSheet(false);
  }, [isAnyActionActive]);

  const handleRecordPayment = useCallback(
    async (payload: {
      amount: number;
      paymentMethod: string;
      referenceNumber?: string;
      paymentDate: string;
    }) => {
      if (!invoice) return;
      const { amount, paymentMethod, referenceNumber, paymentDate } = payload;
      const paymentType = amount >= balance - 0.01 ? 'full' : 'partial';
      const amountError = validateRecordedPaymentAmount(amount, balance, paymentType);
      if (amountError) {
        Alert.alert('Error', amountError);
        return;
      }
      if (!paymentDate || Number.isNaN(new Date(paymentDate).getTime())) {
        Alert.alert('Error', 'Enter a valid payment date');
        return;
      }
      await runAction(
        'payment',
        () =>
          invoiceService.recordPayment(invoice.id, {
            amount,
            paymentMethod: toInvoicePaymentMethod(paymentMethod),
            referenceNumber,
            paymentDate,
          }),
        paymentType === 'partial' ? 'Part payment recorded' : 'Payment recorded'
      );
    },
    [balance, invoice, runAction]
  );

  const handleCheckDirectInvoicePayment = useCallback(() => {
    void reconcileInvoicePaystack();
  }, [reconcileInvoicePaystack]);

  const handleOpenDirectPayment = useCallback(async (payload: { phoneNumber: string; provider: DirectMomoProvider }) => {
    if (!invoice) return;
    if (!paymentCollectionConfigured) {
      Alert.alert('Direct payment unavailable', 'Set up Payment Collection in Settings before taking direct payments.');
      return;
    }
    if (!payload.provider || !directMomoProviders.includes(payload.provider)) {
      Alert.alert('Direct payment unavailable', 'Choose a supported mobile money network.');
      return;
    }
    if (!payload.phoneNumber.trim()) {
      Alert.alert('Phone required', 'Enter the customer mobile money phone number.');
      return;
    }
    const normalizedPhone = normalizeDirectMomoPhone(payload.phoneNumber);
    if (!isValidDirectMomoPhone(normalizedPhone)) {
      Alert.alert('Invalid MoMo number', 'Enter a valid Ghana mobile money number, for example 024 XXX XXXX.');
      return;
    }
    await runExclusiveAction('payment', async () => {
      try {
        const res = await invoiceService.initiateDirectMobileMoney(invoice.id, {
          phoneNumber: normalizedPhone,
          provider: payload.provider,
        });
        const result = res?.data ?? res;
        const reference = result?.reference ? String(result.reference) : null;
        setDirectPaymentReference(reference);
        const requiresOtp =
          result?.requiresOtp === true
          || String(result?.status || '').toLowerCase() === 'send_otp';
        if (requiresOtp) {
          setDirectPaymentStatus('awaiting_otp');
          setDirectPaymentMessage(
            result?.message
            || result?.displayText
            || 'Enter the OTP sent to the customer to continue payment.'
          );
          setAwaitingPaystackReturn(false);
          Alert.alert(
            'OTP required',
            result?.message || 'Enter the OTP sent to the customer phone, then submit.'
          );
          return;
        }
        setDirectPaymentStatus('pending');
        setDirectPaymentMessage(
          result?.message || 'Prompt sent. Ask the customer to approve it on their phone, then check status.'
        );
        setAwaitingPaystackReturn(true);
        setTimeout(() => {
          void reconcileInvoicePaystack();
        }, 2500);
        Alert.alert(
          'MoMo prompt sent',
          'Ask the customer to approve the prompt or enter their PIN on the phone, then tap Check status.'
        );
      } catch (err: unknown) {
        const message =
          typeof err === 'object' && err !== null && 'response' in err
            ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
            : undefined;
        const fallback = err instanceof Error ? err.message : 'Could not start direct payment';
        Alert.alert('Direct payment unavailable', message || fallback);
        setDirectPaymentStatus('failed');
        setDirectPaymentMessage(message || fallback);
      }
    });
  }, [directMomoProviders, invoice, paymentCollectionConfigured, reconcileInvoicePaystack, runExclusiveAction]);

  const handleSubmitDirectInvoiceOtp = useCallback(
    async (otp: string) => {
      if (!invoice) return;
      const cleanedOtp = String(otp || '').trim();
      if (!cleanedOtp) {
        Alert.alert('OTP required', 'Enter the OTP sent to the customer.');
        return;
      }
      await runExclusiveAction('payment', async () => {
        try {
          const res = await invoiceService.submitPaystackOtp(invoice.id, {
            otp: cleanedOtp,
            reference: directPaymentReference || undefined,
          });
          const result = res?.data ?? res;
          const stillNeedsOtp =
            result?.requiresOtp === true
            || String(result?.status || '').toLowerCase() === 'send_otp';
          if (stillNeedsOtp) {
            setDirectPaymentStatus('awaiting_otp');
            setDirectPaymentMessage(
              result?.message || 'Enter the new OTP sent to the customer to continue payment.'
            );
            Alert.alert('OTP required', result?.message || 'Another OTP is required. Enter it to continue.');
            return;
          }
          const status = String(result?.status || '').toLowerCase();
          if (status === 'failed' || status === 'abandoned') {
            setDirectPaymentStatus('failed');
            setDirectPaymentMessage(result?.message || 'Mobile money payment failed.');
            Alert.alert('Payment failed', result?.message || 'Mobile money payment failed.');
            return;
          }
          setDirectPaymentStatus('pending');
          setDirectPaymentMessage(
            result?.message || 'OTP accepted. Ask the customer to approve if prompted, then check status.'
          );
          setAwaitingPaystackReturn(true);
          setTimeout(() => {
            void reconcileInvoicePaystack();
          }, 2500);
          Alert.alert('OTP submitted', 'Check status after the customer finishes approval on their phone.');
        } catch (err: unknown) {
          const message =
            typeof err === 'object' && err !== null && 'response' in err
              ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
              : undefined;
          const fallback = err instanceof Error ? err.message : 'Could not submit OTP';
          Alert.alert('OTP failed', message || fallback);
          setDirectPaymentStatus('awaiting_otp');
          setDirectPaymentMessage(message || 'Invalid or expired OTP. Try again.');
        }
      });
    },
    [directPaymentReference, invoice, reconcileInvoicePaystack, runExclusiveAction]
  );

  if (isLoading) return <DetailLoading title="Invoice" />;
  if (!invoice) return <DetailNotFound title="Invoice" entityLabel="Invoice" />;

  const totalAmount = Number(invoice.totalAmount ?? invoice.total ?? 0);
  const paidAmount = Number(invoice.amountPaid ?? invoice.paidAmount ?? 0);
  const canRecordInvoicePayment = balance > 0 && invoice.status !== 'cancelled' && invoice.status !== 'paid';
  const canShareInvoice = invoice.status !== 'cancelled';
  const invoiceMoreActions: DetailMoreAction[] = [
    ...(canShareInvoice
      ? [
          {
            key: 'shareWhatsapp',
            label: 'Share on WhatsApp',
            icon: 'comments' as const,
            onPress: handleShareViaWhatsApp,
            loading: isActionActive('shareWhatsapp'),
            disabled: isAnyActionActive,
          },
          {
            key: 'shareSms',
            label: 'Share via SMS',
            icon: 'phone' as const,
            onPress: handleShareViaSms,
            loading: isActionActive('shareSms'),
            disabled: isAnyActionActive,
          },
          {
            key: 'shareEmail',
            label: 'Share via Email',
            icon: 'mail' as const,
            onPress: handleShareViaEmail,
            loading: isActionActive('shareEmail'),
            disabled: isAnyActionActive,
          },
        ]
      : []),
    {
      key: 'print',
      label: 'Print Invoice',
      icon: 'printer' as const,
      onPress: handlePrintInvoice,
      loading: isActionActive('print'),
      disabled: isAnyActionActive,
    },
    ...(canRecordInvoicePayment
      ? [{
          key: 'download',
          label: 'Download Invoice',
          icon: 'download' as const,
          onPress: handleDownloadInvoice,
          loading: isActionActive('pdf'),
          disabled: isAnyActionActive,
        }]
      : []),
    ...(linkedSaleId
      ? [{
          key: 'sale',
          label: 'View sale',
          icon: 'receipt' as const,
          onPress: () => router.push(`/sale/${encodeURIComponent(linkedSaleId)}` as any),
          disabled: isAnyActionActive,
        }]
      : []),
    ...(invoice.status === 'draft'
      ? [{
          key: 'send',
          label: 'Send',
          onPress: () =>
            Alert.alert('Send invoice', 'Email this invoice to the customer?', [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Send',
                onPress: () => runAction('send', () => invoiceService.send(invoice.id), 'Invoice sent'),
              },
            ]),
          loading: isActionActive('send'),
          disabled: isAnyActionActive,
        }]
      : []),
    ...(isManager && invoice.status !== 'cancelled' && invoice.status !== 'paid'
      ? [{
          key: 'cancel',
          label: 'Cancel',
          variant: 'danger' as const,
          onPress: handleCancelInvoice,
          loading: isActionActive('cancel'),
          disabled: isAnyActionActive,
        }]
      : []),
    ...(isAdmin && (invoice.status === 'draft' || invoice.status === 'cancelled')
      ? [{
          key: 'delete',
          label: 'Delete',
          variant: 'danger' as const,
          onPress: handleDeleteInvoice,
          loading: isActionActive('delete'),
          disabled: isAnyActionActive,
        }]
      : []),
    ...(canRecordInvoicePayment
      ? [{
          key: 'markPaid',
          label: 'Mark paid',
          onPress: () =>
            Alert.alert('Mark as paid', 'Mark this invoice as fully paid?', [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Mark paid',
                onPress: () =>
                  runAction('markPaid', () => invoiceService.markAsPaid(invoice.id), 'Invoice marked as paid'),
              },
            ]),
          loading: isActionActive('markPaid'),
          disabled: isAnyActionActive,
        }]
      : []),
  ];

  return (
    <>
      <EntityDetailHeader title={invoice.invoiceNumber || 'Invoice details'} />
      <ScreenShell style={styles.screen}>
        <ScrollView contentContainerStyle={styles.content}>
          <DetailHeroCard
            eyebrow={invoice.invoiceNumber || 'Invoice'}
            title={formatStatusLabel(invoice.status)}
            message={balance > 0 ? 'Payment is still due for this invoice.' : 'This invoice is fully settled.'}
            metricLabel="Total Amount"
            metricValue={formatCurrency(totalAmount)}
            secondaryIcon="credit-card"
            secondaryLabel={balance > 0 ? 'Balance' : 'Paid'}
            secondaryValue={formatCurrency(balance > 0 ? balance : paidAmount)}
          />

          <DetailSectionCard title="Invoice Details" icon="receipt">
            <DetailInfoRow icon="user" label="Customer" value={invoice.customer?.name ?? '—'} />
            <DetailInfoRow icon="tag" label="Status" value={formatStatusLabel(invoice.status)} />
            {invoice.dueDate ? (
              <DetailInfoRow icon="calendar" label="Due Date" value={formatDate(invoice.dueDate)} />
            ) : null}
            <DetailInfoRow icon="calendar" label="Created" value={formatDate(invoice.createdAt)} />
            {paidAmount > 0 ? (
              <DetailInfoRow icon="credit-card" label="Paid" value={formatCurrency(paidAmount)} />
            ) : null}
          </DetailSectionCard>
          {invoice.items && invoice.items.length > 0 ? (
            <DetailSectionCard title="Invoice Items" icon="archive">
              <Text style={[styles.section, { color: textColor }]}>Items</Text>
              {invoice.items.map((item, i) => (
                <View key={i} style={[styles.itemRow, i > 0 && { borderTopColor: borderColor, borderTopWidth: 1 }]}>
                  <View style={styles.itemInfo}>
                    <Text style={[styles.itemName, { color: textColor }]} numberOfLines={1}>
                      {item.description} x{formatLineItemQuantityDisplay(item as Record<string, unknown>)}
                    </Text>
                    {showProductCode && getItemProductCode(item) ? (
                      <Text style={[styles.itemCode, { color: mutedColor }]} numberOfLines={1}>
                        Code: {getItemProductCode(item)}
                      </Text>
                    ) : null}
                  </View>
                  <Text style={[styles.itemTotal, { color: textColor }]}>
                    {formatCurrency(item.unitPrice * item.quantity)}
                  </Text>
                </View>
              ))}
            </DetailSectionCard>
          ) : null}
        </ScrollView>
        <DetailFooter>
          {canRecordInvoicePayment ? (
            <DetailActionButton
              label="Pay"
              icon="credit-card"
              variant="primary"
              onPress={() => setShowPaymentSheet(true)}
              disabled={isAnyActionActive}
            />
          ) : (
            <DetailActionButton
              label="Download Invoice"
              icon="download"
              variant="primary"
              onPress={handleDownloadInvoice}
              loading={isActionActive('pdf')}
              disabled={isAnyActionActive}
            />
          )}
          <DetailMoreActions actions={invoiceMoreActions} disabled={isAnyActionActive} />
        </DetailFooter>
      </ScreenShell>
      <InvoiceRecordPaymentSheet
        visible={showPaymentSheet && canRecordInvoicePayment}
        balance={balance}
        onClose={handleClosePaymentSheet}
        onSubmit={handleRecordPayment}
        onDirectPayment={handleOpenDirectPayment}
        onSubmitDirectOtp={handleSubmitDirectInvoiceOtp}
        onCheckDirectStatus={handleCheckDirectInvoicePayment}
        directProviders={directMomoProviders}
        directStatus={directPaymentStatus}
        directReference={directPaymentReference}
        directStatusMessage={directPaymentMessage}
        directPaymentAvailable={paymentCollectionConfigured && directMomoProviders.length > 0 && !paymentCollectionLoading}
        directUnavailableReason={
          paymentCollectionLoading
            ? 'Checking payment collection setup...'
            : paymentCollectionConfigured
              ? 'No supported MoMo provider is available for Direct payment.'
              : 'Set up Payment Collection in Settings before taking direct payments.'
        }
        isSubmitting={isActionActive('payment')}
        disabled={isAnyActionActive}
        cardBg={cardBg}
        borderColor={borderColor}
        textColor={textColor}
        mutedColor={mutedColor}
        tintColor={colors.tint}
      />
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 16, paddingBottom: 24 },
  section: { fontSize: 16, fontWeight: '600', marginBottom: 12 },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  itemInfo: { flex: 1, paddingRight: 8 },
  itemName: { flex: 1, fontSize: 14 },
  itemCode: { fontSize: 12, marginTop: 2 },
  itemTotal: { fontSize: 14, fontWeight: '600' },
});
