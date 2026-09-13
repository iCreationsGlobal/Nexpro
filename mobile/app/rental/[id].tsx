import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
  Image,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';

import { AppIcon } from '@/components/AppIcon';
import {
  AppBottomSheet,
  APP_SHEET_HEIGHT_COMPACT,
  SheetMenuRow,
} from '@/components/AppBottomSheet';
import { FormSheetModal } from '@/components/FormSheetModal';
import { FormInput, FormLabel } from '@/components/FormField';
import {
  DetailHeroCard,
  DetailInfoRow,
  DetailSectionCard,
  DetailFooter,
  DetailLoading,
  DetailNotFound,
  DetailActionButton,
  DetailMoreActions,
  EntityDetailHeader,
  type DetailMoreAction,
} from '@/components/EntityDetailLayout';
import { useExclusiveAction } from '@/hooks/useExclusiveAction';
import { useScreenColors } from '@/hooks/useScreenColors';
import { ScreenShell } from '@/components/ScreenShell';
import { useAuth } from '@/context/AuthContext';
import { RentalRecordPaymentSheet } from '@/components/RentalRecordPaymentSheet';
import { expenseService } from '@/services/expenseService';
import { rentalService, type RentalItemRow, type RentalLateCharge, type RentalRow } from '@/services/rentalService';
import { getApiErrorMessage, parseApiEntity } from '@/utils/parseApiListResponse';
import { refreshAfterRentalChange } from '@/utils/queryInvalidation';
import { formatCurrency, formatDate } from '@/utils/formatCurrency';
import { resolveImageUrl } from '@/utils/fileUtils';
import { computeRentalFinancials } from '@/utils/rentalFinancials';
import { validateRecordedPaymentAmount } from '@/utils/recordPayment';
import {
  DAMAGE_SEVERITY_OPTIONS,
  DAMAGE_TYPE_OPTIONS,
  getRentalCustomerLabel,
  getRentalReference,
  getRentalStatusColors,
  getRentalStatusLabel,
  getTodayIsoDate,
  isRentalCheckoutEligible,
  isRentalOpen,
  isRentalReturnable,
} from '@/utils/rentalStatus';

type RentalAction = 'checkout' | 'return' | 'damage' | 'payment' | `waive:${string}`;

export default function RentalDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const rentalId = String(id || '');
  const { isManager } = useAuth();
  const queryClient = useQueryClient();
  const { colors, cardBg, borderColor, textColor, mutedColor, inputBg } = useScreenColors();

  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [damageOpen, setDamageOpen] = useState(false);
  const [waiveOpen, setWaiveOpen] = useState(false);
  const [itemPickerOpen, setItemPickerOpen] = useState(false);
  const [damageTypeOpen, setDamageTypeOpen] = useState(false);
  const [damageSeverityOpen, setDamageSeverityOpen] = useState(false);

  const [handoverNotes, setHandoverNotes] = useState('');
  const [actualReturnDate, setActualReturnDate] = useState(getTodayIsoDate());
  const [inspectionNotes, setInspectionNotes] = useState('');
  const [waiveReason, setWaiveReason] = useState('');
  const [waiveCharge, setWaiveCharge] = useState<RentalLateCharge | null>(null);

  const [damageItemId, setDamageItemId] = useState('');
  const [damageType, setDamageType] = useState<(typeof DAMAGE_TYPE_OPTIONS)[number]['value']>('other');
  const [damageSeverity, setDamageSeverity] = useState<(typeof DAMAGE_SEVERITY_OPTIONS)[number]['value']>('minor');
  const [damageDescription, setDamageDescription] = useState('');
  const [damageCost, setDamageCost] = useState('0');
  const [damagePhotoUrls, setDamagePhotoUrls] = useState<string[]>([]);
  const [damagePhotoUploading, setDamagePhotoUploading] = useState(false);

  const { isAnyActionActive, isActionActive, runExclusiveAction } = useExclusiveAction<RentalAction>();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['rental', rentalId],
    queryFn: () => rentalService.getById(rentalId),
    enabled: !!rentalId,
  });

  const rental = useMemo(() => parseApiEntity<RentalRow>(data), [data]);
  const financials = useMemo(() => computeRentalFinancials(rental), [rental]);

  const { data: returnPreviewRes } = useQuery({
    queryKey: ['rental', rentalId, 'return-preview', actualReturnDate],
    queryFn: () => rentalService.previewReturn(rentalId, { actualReturnDate }),
    enabled: returnOpen && !!rentalId && !!actualReturnDate,
  });

  const returnPreview = useMemo(() => parseApiEntity<{
    lateCharge?: { daysLate?: number; totalCharge?: number; chargePerDay?: number };
    isLate?: boolean;
    rentalDurationDays?: number;
  }>(returnPreviewRes), [returnPreviewRes]);

  const selectedDamageItem = useMemo(
    () => (rental?.items || []).find((item) => item.id === damageItemId) || null,
    [rental?.items, damageItemId]
  );

  useEffect(() => {
    if (!returnOpen) return;
    setActualReturnDate(getTodayIsoDate());
    setInspectionNotes('');
  }, [returnOpen]);

  useEffect(() => {
    if (!damageOpen) return;
    setDamageItemId('');
    setDamageType('other');
    setDamageSeverity('minor');
    setDamageDescription('');
    setDamageCost('0');
    setDamagePhotoUrls([]);
  }, [damageOpen]);

  const invalidateRentalQueries = useCallback(async () => {
    await refreshAfterRentalChange(queryClient);
    await refetch();
  }, [queryClient, refetch]);

  const paymentMutation = useMutation({
    mutationFn: (payload: {
      amount: number;
      paymentMethod: string;
      referenceNumber?: string;
      notes?: string;
    }) => rentalService.recordPayment(rentalId, payload),
    onSuccess: async (_response, payload) => {
      setPaymentOpen(false);
      await invalidateRentalQueries();
      Alert.alert('Payment recorded', `${formatCurrency(payload.amount)} was applied to this rental.`);
    },
    onError: (err: unknown) => {
      Alert.alert('Payment failed', getApiErrorMessage(err, 'Could not record payment.'));
    },
  });

  const checkoutMutation = useMutation({
    mutationFn: () => rentalService.checkoutRental(rentalId, { handoverNotes: handoverNotes.trim() || null }),
    onSuccess: async () => {
      setCheckoutOpen(false);
      setHandoverNotes('');
      await invalidateRentalQueries();
      Alert.alert('Handed over', 'Rental is now active.');
    },
    onError: (err: unknown) => {
      Alert.alert('Handover failed', getApiErrorMessage(err, 'Could not check out rental.'));
    },
  });

  const returnMutation = useMutation({
    mutationFn: () =>
      rentalService.returnRental(rentalId, {
        actualReturnDate: actualReturnDate.trim() || getTodayIsoDate(),
        inspectionNotes: inspectionNotes.trim() || null,
      }),
    onSuccess: async (response: { lateCharge?: { totalCharge?: number } | null }) => {
      setReturnOpen(false);
      await invalidateRentalQueries();
      const lateMsg =
        response?.lateCharge?.totalCharge && Number(response.lateCharge.totalCharge) > 0
          ? ` A late charge of ${formatCurrency(response.lateCharge.totalCharge)} was added.`
          : '';
      Alert.alert('Return recorded', `Rental return was saved.${lateMsg}`);
    },
    onError: (err: unknown) => {
      Alert.alert('Return failed', getApiErrorMessage(err, 'Could not record return.'));
    },
  });

  const damageMutation = useMutation({
    mutationFn: () => {
      const item = selectedDamageItem;
      if (!item?.productId) {
        throw new Error('Select a rental item');
      }
      return rentalService.recordDamage(rentalId, {
        rentalItemId: damageItemId,
        productId: item.productId,
        damageType,
        severity: damageSeverity,
        description: damageDescription.trim() || null,
        estimatedRepairCost: Number.parseFloat(damageCost) || 0,
        photos: damagePhotoUrls,
      });
    },
    onSuccess: async () => {
      setDamageOpen(false);
      await invalidateRentalQueries();
      Alert.alert('Damage recorded', 'An expense was created for approval.');
    },
    onError: (err: unknown) => {
      Alert.alert('Damage report failed', getApiErrorMessage(err, 'Could not record damage.'));
    },
  });

  const waiveMutation = useMutation({
    mutationFn: () => {
      if (!waiveCharge) throw new Error('No late charge selected');
      return rentalService.waiveLateCharge(rentalId, waiveCharge.id, { reason: waiveReason.trim() });
    },
    onSuccess: async () => {
      setWaiveOpen(false);
      setWaiveReason('');
      setWaiveCharge(null);
      await invalidateRentalQueries();
      Alert.alert('Late charge waived', 'The invoice was updated.');
    },
    onError: (err: unknown) => {
      Alert.alert('Waive failed', getApiErrorMessage(err, 'Could not waive late charge.'));
    },
  });

  const handleRecordPayment = useCallback((payload: {
    amount: number;
    paymentMethod: string;
    referenceNumber?: string;
    notes?: string;
  }) => {
    const paymentType = payload.amount >= financials.balance - 0.01 ? 'full' : 'partial';
    const error = validateRecordedPaymentAmount(payload.amount, financials.balance, paymentType);
    if (error) {
      Alert.alert('Payment', error);
      return;
    }
    runExclusiveAction('payment', () => paymentMutation.mutateAsync(payload));
  }, [financials.balance, paymentMutation, runExclusiveAction]);

  const handleCheckout = useCallback(() => {
    runExclusiveAction('checkout', () => checkoutMutation.mutateAsync());
  }, [checkoutMutation, runExclusiveAction]);

  const handleReturn = useCallback(() => {
    runExclusiveAction('return', () => returnMutation.mutateAsync());
  }, [returnMutation, runExclusiveAction]);

  const handleDamage = useCallback(() => {
    if (!damageItemId) {
      Alert.alert('Select item', 'Choose the rental item with damage.');
      return;
    }
    runExclusiveAction('damage', () => damageMutation.mutateAsync());
  }, [damageItemId, damageMutation, runExclusiveAction]);

  const handleWaive = useCallback(() => {
    if (!waiveReason.trim()) {
      Alert.alert('Reason required', 'Enter a reason to waive this late charge.');
      return;
    }
    if (!waiveCharge) return;
    runExclusiveAction(`waive:${waiveCharge.id}`, () => waiveMutation.mutateAsync());
  }, [waiveCharge, waiveMutation, waiveReason, runExclusiveAction]);

  const pickDamagePhoto = useCallback(async (source: 'camera' | 'library') => {
    try {
      const permission =
        source === 'camera'
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (permission.status !== 'granted') {
        Alert.alert('Permission needed', 'Allow camera or photo access to attach damage photos.');
        return;
      }
      const result =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync({ quality: 0.8, allowsEditing: false })
          : await ImagePicker.launchImageLibraryAsync({
              quality: 0.8,
              allowsEditing: false,
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
            });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      setDamagePhotoUploading(true);
      try {
        const url = await expenseService.uploadReceipt(
          asset.uri,
          asset.fileName || 'damage.jpg',
          asset.mimeType || 'image/jpeg'
        );
        setDamagePhotoUrls((prev) => [...prev, url]);
      } finally {
        setDamagePhotoUploading(false);
      }
    } catch (err: unknown) {
      setDamagePhotoUploading(false);
      Alert.alert('Upload failed', getApiErrorMessage(err, 'Could not upload photo.'));
    }
  }, []);

  const showPhotoPicker = useCallback(() => {
    Alert.alert('Add photo', 'Attach evidence of damage.', [
      { text: 'Camera', onPress: () => pickDamagePhoto('camera') },
      { text: 'Photo library', onPress: () => pickDamagePhoto('library') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [pickDamagePhoto]);

  const checkoutEligible = isRentalCheckoutEligible(rental, isManager);
  const returnEligible = isRentalReturnable(rental);
  const openEligible = isRentalOpen(rental);
  const statusColors = getRentalStatusColors(rental?.status);

  const moreActions = useMemo<DetailMoreAction[]>(() => {
    const actions: DetailMoreAction[] = [];
    if (financials.canRecordPayment && (checkoutEligible || returnEligible)) {
      actions.push({
        key: 'payment',
        label: 'Record payment',
        icon: 'credit-card',
        onPress: () => setPaymentOpen(true),
        disabled: isAnyActionActive,
        loading: isActionActive('payment'),
      });
    }
    if (financials.invoiceId) {
      actions.push({
        key: 'invoice',
        label: 'View invoice',
        icon: 'receipt',
        onPress: () => router.push(`/invoice/${encodeURIComponent(financials.invoiceId as string)}` as never),
        disabled: isAnyActionActive,
      });
    }
    if (openEligible) {
      actions.push({
        key: 'damage',
        label: 'Report damage',
        icon: 'exclamation-triangle',
        onPress: () => setDamageOpen(true),
        disabled: isAnyActionActive,
      });
    }
    return actions;
  }, [checkoutEligible, financials.canRecordPayment, financials.invoiceId, isActionActive, isAnyActionActive, openEligible, returnEligible, router]);

  const primaryAction = useMemo(() => {
    if (checkoutEligible) {
      return {
        label: 'Hand over',
        icon: 'package' as const,
        onPress: () => setCheckoutOpen(true),
      };
    }
    if (returnEligible) {
      return {
        label: 'Record return',
        icon: 'check' as const,
        onPress: () => setReturnOpen(true),
      };
    }
    if (financials.canRecordPayment) {
      return {
        label: 'Record payment',
        icon: 'credit-card' as const,
        onPress: () => setPaymentOpen(true),
      };
    }
    return null;
  }, [checkoutEligible, returnEligible, financials.canRecordPayment]);

  if (isLoading) return <DetailLoading title="Rental" />;
  if (!rental) return <DetailNotFound title="Rental" entityLabel="Rental" />;

  const lateCharges = rental.lateCharges || [];
  const damageReports = rental.damageReports || [];

  return (
    <>
      <EntityDetailHeader title={getRentalReference(rental)} />
      <ScreenShell style={styles.container}>
        <ScrollView contentContainerStyle={styles.content}>
          <DetailHeroCard
            eyebrow="Rental"
            title={getRentalCustomerLabel(rental)}
            message={getRentalStatusLabel(rental.status)}
            metricLabel={financials.balance > 0.01 ? 'Balance due' : 'Total due'}
            metricValue={formatCurrency(financials.balance > 0.01 ? financials.balance : financials.totalDue)}
            secondaryLabel="Due back"
            secondaryValue={formatDate(rental.endDate)}
            secondaryIcon="calendar"
            showCheck={false}
          />

          <DetailSectionCard title="Rental details">
            <DetailInfoRow icon="calendar" label="Period" value={`${formatDate(rental.startDate)} – ${formatDate(rental.endDate)}`} />
            <DetailInfoRow icon="user" label="Customer" value={getRentalCustomerLabel(rental)} />
            {rental.customer?.phone ? (
              <DetailInfoRow icon="phone" label="Phone" value={rental.customer.phone} />
            ) : null}
            <DetailInfoRow icon="credit-card" label="Hire total" value={formatCurrency(financials.totalDue)} />
            {financials.amountPaid > 0 ? (
              <DetailInfoRow icon="credit-card" label="Paid" value={formatCurrency(financials.amountPaid)} />
            ) : null}
            {financials.balance > 0.01 ? (
              <DetailInfoRow icon="credit-card" label="Balance" value={formatCurrency(financials.balance)} />
            ) : null}
            <View style={[styles.statusRow, { borderColor }]}>
              <Text style={[styles.statusRowLabel, { color: mutedColor }]}>Status</Text>
              <View style={[styles.statusPill, { backgroundColor: statusColors.bg, borderColor: statusColors.border }]}>
                <Text style={[styles.statusPillText, { color: statusColors.text }]}>
                  {getRentalStatusLabel(rental.status)}
                </Text>
              </View>
            </View>
          </DetailSectionCard>

          <DetailSectionCard title={`Items (${(rental.items || []).length})`}>
            {(rental.items || []).length === 0 ? (
              <Text style={{ color: mutedColor }}>No items on this rental.</Text>
            ) : (
              (rental.items || []).map((item: RentalItemRow) => (
                <View key={item.id} style={[styles.itemRow, { borderColor }]}>
                  <Text style={[styles.itemName, { color: textColor }]}>
                    {item.product?.name || 'Item'}
                  </Text>
                  <Text style={[styles.itemMeta, { color: mutedColor }]}>
                    Qty {item.quantity || 1}
                    {item.rentalRatePerDay != null ? ` · ${formatCurrency(item.rentalRatePerDay)}/day` : ''}
                    {item.rentalUnit?.serialNumber ? ` · ${item.rentalUnit.serialNumber}` : ''}
                  </Text>
                </View>
              ))
            )}
          </DetailSectionCard>

          {lateCharges.length > 0 ? (
            <DetailSectionCard title={`Late charges (${lateCharges.length})`}>
              {lateCharges.map((charge) => (
                <View key={charge.id} style={[styles.chargeRow, { borderColor }]}>
                  <View style={styles.chargeCopy}>
                    <Text style={[styles.chargeTitle, { color: textColor }]}>
                      {charge.daysLate || 0} day{(charge.daysLate || 0) === 1 ? '' : 's'} late
                    </Text>
                    <Text style={[styles.itemMeta, { color: mutedColor }]}>
                      {formatCurrency(charge.totalCharge)}
                      {charge.status ? ` · ${getRentalStatusLabel(charge.status)}` : ''}
                    </Text>
                  </View>
                  {isManager && charge.status === 'pending' ? (
                    <Pressable
                      onPress={() => {
                        setWaiveCharge(charge);
                        setWaiveReason('');
                        setWaiveOpen(true);
                      }}
                      style={[styles.outlineBtn, { borderColor }]}
                    >
                      <Text style={[styles.outlineBtnText, { color: textColor }]}>Waive</Text>
                    </Pressable>
                  ) : null}
                </View>
              ))}
            </DetailSectionCard>
          ) : null}

          {damageReports.length > 0 ? (
            <DetailSectionCard title={`Damage reports (${damageReports.length})`}>
              {damageReports.map((report) => (
                <View key={report.id} style={[styles.itemRow, { borderColor }]}>
                  <Text style={[styles.itemName, { color: textColor }]}>
                    {(report.damageType || 'other').replace(/_/g, ' ')}
                  </Text>
                  <Text style={[styles.itemMeta, { color: mutedColor }]}>
                    {report.severity || 'minor'}
                    {report.estimatedRepairCost != null ? ` · ${formatCurrency(report.estimatedRepairCost)}` : ''}
                  </Text>
                  {Array.isArray(report.photos) && report.photos.length > 0 ? (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoRow}>
                      {report.photos.map((photoUrl) => (
                        <Image
                          key={photoUrl}
                          source={{ uri: resolveImageUrl(photoUrl) }}
                          style={[styles.photoThumb, { borderColor }]}
                        />
                      ))}
                    </ScrollView>
                  ) : null}
                </View>
              ))}
            </DetailSectionCard>
          ) : null}
        </ScrollView>

        {(primaryAction || moreActions.length > 0) && (
          <DetailFooter>
            {moreActions.length > 0 ? <DetailMoreActions actions={moreActions} /> : null}
            {primaryAction ? (
              <DetailActionButton
                label={primaryAction.label}
                icon={primaryAction.icon}
                variant="primary"
                onPress={primaryAction.onPress}
                disabled={isAnyActionActive}
                loading={checkoutMutation.isPending || returnMutation.isPending || paymentMutation.isPending}
              />
            ) : null}
          </DetailFooter>
        )}
      </ScreenShell>

      <RentalRecordPaymentSheet
        visible={paymentOpen && financials.canRecordPayment}
        balance={financials.balance}
        onClose={() => {
          if (!paymentMutation.isPending && !isActionActive('payment')) setPaymentOpen(false);
        }}
        onSubmit={handleRecordPayment}
        isSubmitting={paymentMutation.isPending || isActionActive('payment')}
        disabled={isAnyActionActive && !isActionActive('payment')}
        cardBg={cardBg}
        borderColor={borderColor}
        textColor={textColor}
        mutedColor={mutedColor}
        tintColor={colors.tint}
      />

      <FormSheetModal
        visible={checkoutOpen}
        title="Hand over"
        onClose={() => setCheckoutOpen(false)}
        cardBg={cardBg}
        borderColor={borderColor}
        textColor={textColor}
        mutedColor={mutedColor}
        footer={
          <View style={styles.sheetFooter}>
            <Pressable
              onPress={() => setCheckoutOpen(false)}
              style={[styles.secondaryBtn, { borderColor }]}
              disabled={checkoutMutation.isPending}
            >
              <Text style={[styles.secondaryBtnText, { color: textColor }]}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={handleCheckout}
              disabled={checkoutMutation.isPending || isActionActive('checkout')}
              style={[styles.primaryBtn, { backgroundColor: colors.tint }]}
            >
              {checkoutMutation.isPending ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryBtnText}>Confirm handover</Text>
              )}
            </Pressable>
          </View>
        }
      >
        <Text style={[styles.sheetHint, { color: mutedColor }]}>
          Check out this rental and record that items were handed to the customer.
        </Text>
        <FormLabel optional>Handover notes</FormLabel>
        <FormInput
          value={handoverNotes}
          onChangeText={setHandoverNotes}
          placeholder="Condition notes, accessories handed over..."
          multiline
        />
      </FormSheetModal>

      <FormSheetModal
        visible={returnOpen}
        title="Record return"
        onClose={() => setReturnOpen(false)}
        cardBg={cardBg}
        borderColor={borderColor}
        textColor={textColor}
        mutedColor={mutedColor}
        footer={
          <View style={styles.sheetFooter}>
            <Pressable
              onPress={() => setReturnOpen(false)}
              style={[styles.secondaryBtn, { borderColor }]}
              disabled={returnMutation.isPending}
            >
              <Text style={[styles.secondaryBtnText, { color: textColor }]}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={handleReturn}
              disabled={returnMutation.isPending || isActionActive('return')}
              style={[styles.primaryBtn, { backgroundColor: colors.tint }]}
            >
              {returnMutation.isPending ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryBtnText}>Confirm return</Text>
              )}
            </Pressable>
          </View>
        }
      >
        <FormLabel>Return date</FormLabel>
        <FormInput
          value={actualReturnDate}
          onChangeText={setActualReturnDate}
          placeholder="YYYY-MM-DD"
          autoCapitalize="none"
        />
        {returnPreview?.isLate && returnPreview.lateCharge?.totalCharge ? (
          <View style={[styles.previewBox, { borderColor, backgroundColor: inputBg }]}>
            <Text style={[styles.previewTitle, { color: textColor }]}>Estimated late charge</Text>
            <Text style={[styles.previewValue, { color: mutedColor }]}>
              {returnPreview.lateCharge.daysLate || 0} day(s) · {formatCurrency(returnPreview.lateCharge.totalCharge)}
            </Text>
          </View>
        ) : null}
        <FormLabel optional>Inspection notes</FormLabel>
        <FormInput
          value={inspectionNotes}
          onChangeText={setInspectionNotes}
          placeholder="Condition on return..."
          multiline
        />
      </FormSheetModal>

      <FormSheetModal
        visible={damageOpen}
        title="Report damage"
        onClose={() => setDamageOpen(false)}
        cardBg={cardBg}
        borderColor={borderColor}
        textColor={textColor}
        mutedColor={mutedColor}
        footer={
          <View style={styles.sheetFooter}>
            <Pressable
              onPress={() => setDamageOpen(false)}
              style={[styles.secondaryBtn, { borderColor }]}
              disabled={damageMutation.isPending || damagePhotoUploading}
            >
              <Text style={[styles.secondaryBtnText, { color: textColor }]}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={handleDamage}
              disabled={damageMutation.isPending || damagePhotoUploading || isActionActive('damage')}
              style={[styles.primaryBtn, { backgroundColor: colors.tint }]}
            >
              {damageMutation.isPending ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryBtnText}>Submit report</Text>
              )}
            </Pressable>
          </View>
        }
      >
        <FormLabel>Rental item</FormLabel>
        <Pressable
          onPress={() => setItemPickerOpen(true)}
          style={[styles.selectField, { borderColor, backgroundColor: inputBg }]}
        >
          <Text style={{ color: selectedDamageItem ? textColor : mutedColor }}>
            {selectedDamageItem?.product?.name || 'Select item'}
          </Text>
          <AppIcon name="chevron-down" size={16} color={mutedColor} />
        </Pressable>

        <FormLabel>Damage type</FormLabel>
        <Pressable
          onPress={() => setDamageTypeOpen(true)}
          style={[styles.selectField, { borderColor, backgroundColor: inputBg }]}
        >
          <Text style={{ color: textColor }}>
            {DAMAGE_TYPE_OPTIONS.find((opt) => opt.value === damageType)?.label || 'Other'}
          </Text>
          <AppIcon name="chevron-down" size={16} color={mutedColor} />
        </Pressable>

        <FormLabel>Severity</FormLabel>
        <Pressable
          onPress={() => setDamageSeverityOpen(true)}
          style={[styles.selectField, { borderColor, backgroundColor: inputBg }]}
        >
          <Text style={{ color: textColor }}>
            {DAMAGE_SEVERITY_OPTIONS.find((opt) => opt.value === damageSeverity)?.label || 'Minor'}
          </Text>
          <AppIcon name="chevron-down" size={16} color={mutedColor} />
        </Pressable>

        <FormLabel optional>Estimated repair cost</FormLabel>
        <FormInput
          value={damageCost}
          onChangeText={setDamageCost}
          keyboardType="decimal-pad"
          placeholder="0.00"
        />

        <FormLabel optional>Description</FormLabel>
        <FormInput
          value={damageDescription}
          onChangeText={setDamageDescription}
          placeholder="What happened?"
          multiline
        />

        <FormLabel optional>Photos</FormLabel>
        <Pressable
          onPress={showPhotoPicker}
          disabled={damagePhotoUploading}
          style={[styles.photoAddBtn, { borderColor, backgroundColor: inputBg }]}
        >
          {damagePhotoUploading ? (
            <ActivityIndicator color={colors.tint} />
          ) : (
            <>
              <AppIcon name="camera" size={18} color={colors.tint} />
              <Text style={[styles.photoAddText, { color: textColor }]}>Add photo</Text>
            </>
          )}
        </Pressable>
        {damagePhotoUrls.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoRow}>
            {damagePhotoUrls.map((photoUrl) => (
              <View key={photoUrl} style={styles.photoWrap}>
                <Image source={{ uri: resolveImageUrl(photoUrl) }} style={[styles.photoThumb, { borderColor }]} />
                <Pressable
                  onPress={() => setDamagePhotoUrls((prev) => prev.filter((url) => url !== photoUrl))}
                  style={styles.photoRemove}
                >
                  <AppIcon name="times" size={12} color="#fff" />
                </Pressable>
              </View>
            ))}
          </ScrollView>
        ) : null}
      </FormSheetModal>

      <FormSheetModal
        visible={waiveOpen}
        title="Waive late charge"
        onClose={() => setWaiveOpen(false)}
        cardBg={cardBg}
        borderColor={borderColor}
        textColor={textColor}
        mutedColor={mutedColor}
        footer={
          <View style={styles.sheetFooter}>
            <Pressable
              onPress={() => setWaiveOpen(false)}
              style={[styles.secondaryBtn, { borderColor }]}
              disabled={waiveMutation.isPending}
            >
              <Text style={[styles.secondaryBtnText, { color: textColor }]}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={handleWaive}
              disabled={waiveMutation.isPending || (waiveCharge ? isActionActive(`waive:${waiveCharge.id}`) : false)}
              style={[styles.primaryBtn, { backgroundColor: colors.tint }]}
            >
              {waiveMutation.isPending ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryBtnText}>Waive charge</Text>
              )}
            </Pressable>
          </View>
        }
      >
        {waiveCharge ? (
          <Text style={[styles.sheetHint, { color: mutedColor }]}>
            Waive {formatCurrency(waiveCharge.totalCharge)} for {waiveCharge.daysLate || 0} day(s) late.
          </Text>
        ) : null}
        <FormLabel>Reason</FormLabel>
        <FormInput
          value={waiveReason}
          onChangeText={setWaiveReason}
          placeholder="Why is this charge being waived?"
          multiline
        />
      </FormSheetModal>

      <AppBottomSheet
        visible={itemPickerOpen}
        title="Rental item"
        onClose={() => setItemPickerOpen(false)}
        height={APP_SHEET_HEIGHT_COMPACT}
        cardBg={cardBg}
        borderColor={borderColor}
        textColor={textColor}
        mutedColor={mutedColor}
      >
        {(rental.items || []).map((item) => (
          <SheetMenuRow
            key={item.id}
            label={item.product?.name || 'Item'}
            active={damageItemId === item.id}
            onPress={() => {
              setDamageItemId(item.id);
              setItemPickerOpen(false);
            }}
            trailing={damageItemId === item.id ? <AppIcon name="check" size={18} color="#fff" /> : <View />}
          />
        ))}
      </AppBottomSheet>

      <AppBottomSheet
        visible={damageTypeOpen}
        title="Damage type"
        onClose={() => setDamageTypeOpen(false)}
        height={APP_SHEET_HEIGHT_COMPACT}
        cardBg={cardBg}
        borderColor={borderColor}
        textColor={textColor}
        mutedColor={mutedColor}
      >
        {DAMAGE_TYPE_OPTIONS.map((opt) => (
          <SheetMenuRow
            key={opt.value}
            label={opt.label}
            active={damageType === opt.value}
            onPress={() => {
              setDamageType(opt.value);
              setDamageTypeOpen(false);
            }}
            trailing={damageType === opt.value ? <AppIcon name="check" size={18} color="#fff" /> : <View />}
          />
        ))}
      </AppBottomSheet>

      <AppBottomSheet
        visible={damageSeverityOpen}
        title="Severity"
        onClose={() => setDamageSeverityOpen(false)}
        height={APP_SHEET_HEIGHT_COMPACT}
        cardBg={cardBg}
        borderColor={borderColor}
        textColor={textColor}
        mutedColor={mutedColor}
      >
        {DAMAGE_SEVERITY_OPTIONS.map((opt) => (
          <SheetMenuRow
            key={opt.value}
            label={opt.label}
            active={damageSeverity === opt.value}
            onPress={() => {
              setDamageSeverity(opt.value);
              setDamageSeverityOpen(false);
            }}
            trailing={damageSeverity === opt.value ? <AppIcon name="check" size={18} color="#fff" /> : <View />}
          />
        ))}
      </AppBottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 120 },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    marginTop: 12,
    paddingTop: 12,
  },
  statusRowLabel: { fontSize: 13, fontWeight: '600' },
  statusPill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  statusPillText: { fontSize: 12, fontWeight: '700' },
  itemRow: { borderBottomWidth: 1, paddingVertical: 10 },
  itemName: { fontSize: 15, fontWeight: '600' },
  itemMeta: { marginTop: 4, fontSize: 13 },
  chargeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderBottomWidth: 1,
    paddingVertical: 10,
  },
  chargeCopy: { flex: 1 },
  chargeTitle: { fontSize: 15, fontWeight: '600' },
  outlineBtn: {
    minHeight: 36,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  outlineBtnText: { fontSize: 13, fontWeight: '700' },
  sheetFooter: { flexDirection: 'row', gap: 10 },
  secondaryBtn: {
    flex: 1,
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: { fontSize: 15, fontWeight: '700' },
  primaryBtn: {
    flex: 1,
    minHeight: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  sheetHint: { fontSize: 14, lineHeight: 20, marginBottom: 8 },
  previewBox: { borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 8 },
  previewTitle: { fontSize: 14, fontWeight: '700' },
  previewValue: { marginTop: 4, fontSize: 13 },
  selectField: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  photoAddBtn: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 8,
  },
  photoAddText: { fontSize: 14, fontWeight: '600' },
  photoRow: { marginTop: 4, marginBottom: 8 },
  photoWrap: { marginRight: 8, position: 'relative' },
  photoThumb: { width: 72, height: 72, borderRadius: 8, borderWidth: 1 },
  photoRemove: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
