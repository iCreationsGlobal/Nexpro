import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';

import { AppIcon } from '@/components/AppIcon';
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
import { useShopOptional } from '@/context/ShopContext';
import { useStudioLocationOptional } from '@/context/StudioLocationContext';
import { shareReceiptPdf } from '@/services/pdfDocumentService';
import { invoiceService } from '@/services/invoiceService';
import { saleService } from '@/services/saleService';
import { settingsService } from '@/services/settings';
import { formatCurrency, formatDate } from '@/utils/formatCurrency';
import { formatStatusLabel } from '@/utils/formatLabels';
import {
  getDirectMomoProviders,
  isPaymentCollectionConfigured,
  isValidDirectMomoPhone,
  normalizeDirectMomoPhone,
  type DirectMomoProvider,
} from '@/utils/paymentCollection';
import { getApiErrorMessage, parseApiEntity, parseApiListResponse } from '@/utils/parseApiListResponse';
import { validateRecordedPaymentAmount } from '@/utils/recordPayment';
import { refreshAfterSale } from '@/utils/queryInvalidation';
import { resolveImageUrl } from '@/utils/fileUtils';
import { DeliveryStatusPicker } from '@/components/DeliveryStatusPicker';
import { SaleRecordPaymentSheet } from '@/components/SaleRecordPaymentSheet';
import { usePaystackReconciliation } from '@/hooks/usePaystackReconciliation';

type SaleItemDetail = {
  id?: string;
  name: string;
  sku?: string;
  quantity: number;
  unitPrice?: number;
  total: number;
  product?: { name?: string; imageUrl?: string | null };
};

type SaleDetail = {
  id: string;
  saleNumber?: string;
  total: number;
  amountPaid?: number;
  status: string;
  invoiceId?: string | null;
  invoice?: { id?: string; invoiceNumber?: string } | null;
  deliveryStatus?: string | null;
  createdAt: string;
  customer?: { name?: string; phone?: string; email?: string };
  shop?: { name?: string };
  studioLocation?: { name?: string };
  items?: SaleItemDetail[];
};

type SaleAction = 'receipt' | 'payment' | 'cancel' | 'deliveryStatus' | 'invoice' | 'delete';

function getSaleItemImageUrl(item: SaleItemDetail): string | null {
  const raw = item.product?.imageUrl;
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed === 'null' || trimmed === 'undefined' || trimmed.startsWith('undefined')) {
    return null;
  }
  return resolveImageUrl(trimmed);
}

export default function SaleDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { activeTenant, activeTenantId, isAdmin } = useAuth();
  const shopContext = useShopOptional();
  const studioContext = useStudioLocationOptional();
  const { colors, cardBg, borderColor, textColor, mutedColor } = useEntityDetailTheme();

  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [awaitingPaystackReturn, setAwaitingPaystackReturn] = useState(false);
  const [directPaymentStatus, setDirectPaymentStatus] = useState<
    'idle' | 'pending' | 'awaiting_otp' | 'success' | 'failed'
  >('idle');
  const [directPaymentReference, setDirectPaymentReference] = useState<string | null>(null);
  const [directPaymentMessage, setDirectPaymentMessage] = useState<string | null>(null);
  const { isAnyActionActive, isActionActive, runExclusiveAction } = useExclusiveAction<SaleAction>();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['sale', id],
    queryFn: () => saleService.getSaleById(String(id)),
    enabled: !!id,
  });

  const sale = useMemo(() => parseApiEntity<SaleDetail>(data), [data]);

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

  const { data: linkedInvoicesResponse } = useQuery({
    queryKey: ['invoices', 'sale-link', id],
    queryFn: () => invoiceService.getInvoices({ saleId: String(id), limit: 1 }),
    enabled: !!id && !sale?.invoiceId && !sale?.invoice?.id,
  });

  const linkedInvoiceId = useMemo(() => {
    if (sale?.invoiceId) return sale.invoiceId;
    if (sale?.invoice?.id) return sale.invoice.id;
    const [invoice] = parseApiListResponse<{ id?: string }>(linkedInvoicesResponse);
    return invoice?.id ?? null;
  }, [linkedInvoicesResponse, sale?.invoiceId, sale?.invoice?.id]);

  const balance = useMemo(() => {
    if (!sale) return 0;
    return Math.max(0, Number(sale.total || 0) - Number(sale.amountPaid || 0));
  }, [sale]);

  const canRecordPayment =
    sale && balance > 0 && sale.status !== 'cancelled' && sale.status !== 'refunded';

  const deliveryStatusMutation = useMutation({
    mutationFn: (deliveryStatus: string | null) =>
      saleService.updateDeliveryStatus(String(id), deliveryStatus),
    onSuccess: async () => {
      await refetch();
      await refreshAfterSale(queryClient);
    },
    onError: (err: Error & { response?: { data?: { message?: string } } }) => {
      Alert.alert('Update failed', err?.response?.data?.message || err?.message || 'Could not update delivery status');
    },
  });

  const refresh = useCallback(async () => {
    await refetch();
    await refreshAfterSale(queryClient);
  }, [queryClient, refetch]);

  const reconcileSalePaystack = useCallback(async () => {
    if (!id || !sale) return;
    if (balance <= 0) return;
    try {
      const res = await saleService.checkPaystackCharge(String(id));
      const payload = res?.success !== undefined || res?.applied !== undefined ? res : res?.data ?? res;
      await refresh();
      const checkedSale = payload?.data ?? null;
      const completed = payload?.applied === true || checkedSale?.status === 'completed';
      if (completed) {
        setDirectPaymentStatus('success');
        setDirectPaymentMessage('Payment confirmed and recorded on this sale.');
        setShowPaymentForm(false);
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
  }, [balance, id, refresh, sale]);

  usePaystackReconciliation(
    Boolean(id && sale && balance > 0 && paymentCollectionConfigured && awaitingPaystackReturn),
    reconcileSalePaystack
  );

  const handleDownloadReceipt = useCallback(async () => {
    if (!sale) return;
    await runExclusiveAction('receipt', async () => {
      try {
        let saleForReceipt: SaleDetail = sale;
        try {
          const res = await saleService.getReceipt(sale.id);
          const full = res?.data ?? res;
          if (full && typeof full === 'object') saleForReceipt = full as SaleDetail;
        } catch {
          // use sale
        }
        await shareReceiptPdf({
          ...saleForReceipt,
          shop: saleForReceipt?.shop ?? shopContext?.activeShop ?? undefined,
          studioLocation: saleForReceipt?.studioLocation ?? studioContext?.activeLocation ?? undefined,
          tenantName: activeTenant?.name,
        });
      } catch (err: unknown) {
        Alert.alert('Receipt unavailable', err instanceof Error ? err.message : 'Could not prepare this receipt PDF.');
      }
    });
  }, [activeTenant?.name, runExclusiveAction, sale, shopContext?.activeShop, studioContext?.activeLocation]);

  const handleClosePaymentSheet = useCallback(() => {
    if (!isAnyActionActive) setShowPaymentForm(false);
  }, [isAnyActionActive]);

  const handleRecordPayment = useCallback(
    async (payload: { amount: number; paymentMethod: string; referenceNumber?: string }) => {
      if (!sale) return;
      const { amount, paymentMethod, referenceNumber } = payload;
      const paymentType = amount >= balance - 0.01 ? 'full' : 'partial';
      const amountError = validateRecordedPaymentAmount(amount, balance, paymentType);
      if (amountError) {
        Alert.alert('Error', amountError);
        return;
      }
      await runExclusiveAction('payment', async () => {
        try {
          await saleService.recordPayment(sale.id, {
            amount,
            paymentMethod,
            referenceNumber,
            paymentDate: new Date().toISOString().slice(0, 10),
          });
          await refresh();
          setShowPaymentForm(false);
          Alert.alert('Success', paymentType === 'partial' ? 'Part payment recorded' : 'Payment recorded');
        } catch (err: unknown) {
          Alert.alert('Error', getApiErrorMessage(err, 'Failed to record payment'));
        }
      });
    },
    [balance, refresh, runExclusiveAction, sale]
  );

  const handleCheckDirectSalePayment = useCallback(() => {
    void reconcileSalePaystack();
  }, [reconcileSalePaystack]);

  const handleOpenDirectSalePayment = useCallback(async (payload: { phoneNumber: string; provider: DirectMomoProvider }) => {
    if (!sale) return;
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
        const res = await saleService.initiateDirectMobileMoney(sale.id, {
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
          void reconcileSalePaystack();
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
        Alert.alert('Direct payment unavailable', message || (err instanceof Error ? err.message : 'Could not start direct payment'));
        setDirectPaymentStatus('failed');
        setDirectPaymentMessage(message || 'Could not start direct payment.');
      }
    });
  }, [directMomoProviders, paymentCollectionConfigured, reconcileSalePaystack, runExclusiveAction, sale]);

  const handleSubmitDirectSaleOtp = useCallback(
    async (otp: string) => {
      if (!sale) return;
      const cleanedOtp = String(otp || '').trim();
      if (!cleanedOtp) {
        Alert.alert('OTP required', 'Enter the OTP sent to the customer.');
        return;
      }
      await runExclusiveAction('payment', async () => {
        try {
          const res = await saleService.submitPaystackOtp(sale.id, {
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
            void reconcileSalePaystack();
          }, 2500);
          Alert.alert('OTP submitted', 'Check status after the customer finishes approval on their phone.');
        } catch (err: unknown) {
          const message =
            typeof err === 'object' && err !== null && 'response' in err
              ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
              : undefined;
          Alert.alert('OTP failed', message || (err instanceof Error ? err.message : 'Could not submit OTP'));
          setDirectPaymentStatus('awaiting_otp');
          setDirectPaymentMessage(message || 'Invalid or expired OTP. Try again.');
        }
      });
    },
    [directPaymentReference, reconcileSalePaystack, runExclusiveAction, sale]
  );

  const handleCancelSale = useCallback(() => {
    if (!sale) return;
    Alert.alert('Cancel sale', 'Cancel this sale and restore stock?', [
      { text: 'No', style: 'cancel' },
      {
        text: 'Cancel sale',
        style: 'destructive',
        onPress: async () => {
          await runExclusiveAction('cancel', async () => {
            try {
              await saleService.cancelSale(sale.id);
              await refresh();
              Alert.alert('Success', 'Sale cancelled');
            } catch (err: unknown) {
              Alert.alert('Error', err instanceof Error ? err.message : 'Failed to cancel sale');
            }
          });
        },
      },
    ]);
  }, [refresh, runExclusiveAction, sale]);

  const handleInvoiceAction = useCallback(async () => {
    if (!sale) return;
    if (linkedInvoiceId) {
      router.push(`/invoice/${encodeURIComponent(linkedInvoiceId)}` as never);
      return;
    }
    await runExclusiveAction('invoice', async () => {
      try {
        const res = await saleService.generateInvoice(sale.id);
        await refresh();
        const payload = res?.data ?? res;
        const invoiceId =
          (payload as { invoice?: { id?: string } })?.invoice?.id ??
          (payload as { id?: string })?.id ??
          (payload as { invoiceId?: string })?.invoiceId;
        if (invoiceId) {
          router.push(`/invoice/${encodeURIComponent(invoiceId)}` as never);
          return;
        }
        Alert.alert('Invoice created', 'The invoice was created for this sale.');
      } catch (err: unknown) {
        Alert.alert('Error', err instanceof Error ? err.message : 'Failed to create invoice');
      }
    });
  }, [linkedInvoiceId, refresh, router, runExclusiveAction, sale]);

  const handleDeleteSale = useCallback(() => {
    if (!sale) return;
    Alert.alert('Delete sale', 'Delete this sale permanently? This is only allowed when the backend considers it safe.', [
      { text: 'Keep sale', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          runExclusiveAction('delete', async () => {
            try {
              await saleService.deleteSale(sale.id);
              await refreshAfterSale(queryClient);
              Alert.alert('Deleted', 'Sale deleted');
              router.back();
            } catch (err: unknown) {
              Alert.alert('Error', err instanceof Error ? err.message : 'Failed to delete sale');
            }
          }),
      },
    ]);
  }, [queryClient, router, runExclusiveAction, sale]);

  if (isLoading) return <DetailLoading title="Sale" />;
  if (!sale) return <DetailNotFound title="Sale" entityLabel="Sale" />;

  const salePrimaryIsPayment = Boolean(canRecordPayment);
  const saleMoreActions: DetailMoreAction[] = [
    ...(salePrimaryIsPayment
      ? [{
          key: 'receipt',
          label: 'Download Receipt',
          icon: 'download' as const,
          onPress: handleDownloadReceipt,
          loading: isActionActive('receipt'),
          disabled: isAnyActionActive,
        }]
      : []),
    {
      key: 'invoice',
      label: linkedInvoiceId ? 'View invoice' : 'Create invoice',
      icon: 'file-text',
      onPress: handleInvoiceAction,
      loading: isActionActive('invoice'),
      disabled: isAnyActionActive,
    },
    ...(sale.status !== 'cancelled' && sale.status !== 'refunded'
      ? [{
          key: 'cancel',
          label: 'Cancel',
          variant: 'danger' as const,
          onPress: handleCancelSale,
          loading: isActionActive('cancel'),
          disabled: isAnyActionActive,
        }]
      : []),
    ...(isAdmin
      ? [{
          key: 'delete',
          label: 'Delete',
          variant: 'danger' as const,
          onPress: handleDeleteSale,
          loading: isActionActive('delete'),
          disabled: isAnyActionActive,
        }]
      : []),
  ];

  return (
    <>
      <EntityDetailHeader title={sale.saleNumber || 'Sale details'} />
      <ScreenShell style={styles.screen}>
        <ScrollView contentContainerStyle={styles.content}>
          <DetailHeroCard
            eyebrow={sale.saleNumber || 'Sale'}
            title={formatStatusLabel(sale.status)}
            message={balance > 0 ? 'This sale still has an outstanding balance.' : 'This sale is paid or complete.'}
            metricLabel="Total Amount"
            metricValue={formatCurrency(sale.total)}
            secondaryIcon="archive"
            secondaryLabel="Items"
            secondaryValue={`${sale.items?.length || 0} ${(sale.items?.length || 0) === 1 ? 'Item' : 'Items'}`}
          />

          <DetailSectionCard title="Sale Details" icon="receipt">
            <DetailInfoRow icon="user" label="Customer" value={sale.customer?.name ?? 'Walk-in'} />
            <DetailInfoRow icon="calendar" label="Date" value={formatDate(sale.createdAt)} />
            <DetailInfoRow icon="tag" label="Status" value={formatStatusLabel(sale.status)} />
            {Number(sale.amountPaid || 0) > 0 ? (
              <DetailInfoRow icon="credit-card" label="Paid" value={formatCurrency(sale.amountPaid)} />
            ) : null}
            {balance > 0 ? (
              <DetailInfoRow icon="credit-card" label="Balance" value={formatCurrency(balance)} valueColor="#ef4444" />
            ) : null}
            <DetailInfoRow icon="truck" label="Delivery status">
              <DeliveryStatusPicker
                value={sale.deliveryStatus}
                onChange={(nextStatus) => {
                  runExclusiveAction('deliveryStatus', () => deliveryStatusMutation.mutateAsync(nextStatus));
                }}
                cardBg={cardBg}
                borderColor={borderColor}
                textColor={textColor}
                mutedColor={mutedColor}
                tintColor={colors.tint}
                loading={isActionActive('deliveryStatus')}
                disabled={isAnyActionActive || sale.status !== 'completed'}
              />
            </DetailInfoRow>
          </DetailSectionCard>
          {sale.items && sale.items.length > 0 ? (
            <DetailSectionCard title="Sale Items" icon="archive">
              <Text style={[styles.section, { color: textColor }]}>Items</Text>
              {sale.items.map((item, i) => {
                const imageUri = getSaleItemImageUrl(item);
                const displayName = item.name || item.product?.name || 'Product';
                return (
                  <View
                    key={item.id ?? i}
                    style={[styles.itemRow, i > 0 && { borderTopColor: borderColor, borderTopWidth: 1 }]}
                  >
                    {imageUri ? (
                      <Image
                        source={{ uri: imageUri }}
                        style={[styles.itemImage, { borderColor }]}
                        contentFit="cover"
                      />
                    ) : (
                      <View style={[styles.itemImagePlaceholder, { borderColor }]}>
                        <AppIcon name="archive" size={18} color={mutedColor} />
                      </View>
                    )}
                    <View style={styles.itemInfo}>
                      <Text style={[styles.itemName, { color: textColor }]} numberOfLines={2}>
                        {displayName} x{item.quantity}
                      </Text>
                      {item.sku ? (
                        <Text style={[styles.itemSku, { color: mutedColor }]} numberOfLines={1}>
                          SKU: {item.sku}
                        </Text>
                      ) : null}
                    </View>
                    <Text style={[styles.itemTotal, { color: textColor }]}>
                      {formatCurrency(item.total)}
                    </Text>
                  </View>
                );
              })}
            </DetailSectionCard>
          ) : null}
        </ScrollView>
        <DetailFooter>
          {salePrimaryIsPayment ? (
            <DetailActionButton
              label="Pay"
              variant="primary"
              onPress={() => setShowPaymentForm(true)}
              disabled={isAnyActionActive}
            />
          ) : (
            <DetailActionButton
              label="Download Receipt"
              icon="download"
              variant="primary"
              onPress={handleDownloadReceipt}
              loading={isActionActive('receipt')}
              disabled={isAnyActionActive}
            />
          )}
          <DetailMoreActions actions={saleMoreActions} disabled={isAnyActionActive} />
        </DetailFooter>
      </ScreenShell>
      <SaleRecordPaymentSheet
        visible={showPaymentForm && Boolean(canRecordPayment)}
        balance={balance}
        onClose={handleClosePaymentSheet}
        onSubmit={handleRecordPayment}
        onDirectPayment={handleOpenDirectSalePayment}
        onSubmitDirectOtp={handleSubmitDirectSaleOtp}
        onCheckDirectStatus={handleCheckDirectSalePayment}
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
  content: { padding: 16 },
  thumbRow: { marginBottom: 12 },
  thumbRowContent: { gap: 8 },
  thumbImage: { width: 56, height: 56, borderRadius: 10, borderWidth: 1 },
  section: { fontSize: 16, fontWeight: '600', marginBottom: 12 },
  itemRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 10 },
  itemImage: { width: 48, height: 48, borderRadius: 10, borderWidth: 1 },
  itemImagePlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemInfo: { flex: 1, minWidth: 0 },
  itemName: { fontSize: 14, fontWeight: '500' },
  itemSku: { fontSize: 12, marginTop: 2 },
  itemTotal: { fontSize: 14, fontWeight: '600' },
});
