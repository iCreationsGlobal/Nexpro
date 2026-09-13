import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon } from '@/components/AppIcon';
import { FeatureAccessDenied } from '@/components/FeatureAccessDenied';
import { FormInput, FormLabel } from '@/components/FormField';
import { ScreenShell } from '@/components/ScreenShell';
import { StackPageHeader } from '@/components/StackPageHeader';
import { useAuth } from '@/context/AuthContext';
import { useWorkspaceScope } from '@/hooks/useWorkspaceScope';
import { useDebounce } from '@/hooks/useDebounce';
import { useScreenColors } from '@/hooks/useScreenColors';
import { customerService } from '@/services/customerService';
import { productService } from '@/services/productService';
import { rentalService } from '@/services/rentalService';
import { settingsService } from '@/services/settings';
import { isRentalBusinessType } from '@/constants';
import { formatCurrency } from '@/utils/formatCurrency';
import { getApiErrorMessage, parseApiListResponse } from '@/utils/parseApiListResponse';
import { refreshAfterRentalChange } from '@/utils/queryInvalidation';
import { RENTAL_PAYMENT_METHODS, type RentalPaymentMethod } from '@/utils/recordPayment';
import {
  HIRE_PAYMENT_CREDIT,
  HIRE_PAYMENT_FULL,
  HIRE_PAYMENT_MODES,
  HIRE_PAYMENT_PARTIAL,
  buildCreateRentalPayload,
  estimateHireDue,
  getTomorrowIsoDate,
  parseAvailabilityItems,
  resolveRentalEndDate,
  unwrapCreatedRentalId,
  validateRentalCreateDraft,
  type HirePaymentMode,
  type RentalCreateLine,
} from '@/utils/rentalCreate';
import { getLocalIsoDate, getRentalDayCount, normalizeDayBillingMode } from '@/utils/rentalDayBilling';

type CustomerOption = { id: string; name: string };
type ProductOption = {
  id: string;
  name: string;
  sku?: string | null;
  rentalRatePerDay?: number | string | null;
  sellingPrice?: number | string | null;
};

function productRate(product: ProductOption): number {
  return Number(product.rentalRatePerDay ?? product.sellingPrice ?? 0) || 0;
}

export default function NewRentalScreen() {
  const router = useRouter();
  const { activeTenant, activeTenantId, hasFeature } = useAuth();
  const { activeShopId, scopeReady } = useWorkspaceScope();
  const { colors, bg, cardBg, borderColor, textColor, mutedColor, inputBg } = useScreenColors();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();

  const isRentalTenant = isRentalBusinessType(activeTenant?.businessType);
  const rentalsEnabled = !!activeTenantId && isRentalTenant && hasFeature('rentals') && scopeReady;

  const [customerId, setCustomerId] = useState('');
  const [startDate, setStartDate] = useState(getLocalIsoDate());
  const [durationDays, setDurationDays] = useState('1');
  const [operationalLocation, setOperationalLocation] = useState('');
  const [items, setItems] = useState<RentalCreateLine[]>([]);
  const [hirePaymentMode, setHirePaymentMode] = useState<HirePaymentMode>(HIRE_PAYMENT_CREDIT);
  const [hireAmountPaid, setHireAmountPaid] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<RentalPaymentMethod>('cash');
  const [promisedPaymentDate, setPromisedPaymentDate] = useState(getTomorrowIsoDate());
  const [discountAmount, setDiscountAmount] = useState('');
  const [depositAmount, setDepositAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const { data: customersResponse, isLoading: loadingCustomers } = useQuery({
    queryKey: ['customers', 'rental-new', activeTenantId],
    queryFn: () => customerService.getCustomers({ limit: 100, isActive: true }),
    enabled: rentalsEnabled && hasFeature('crm'),
    staleTime: 5 * 60 * 1000,
  });

  const customers = useMemo(
    () => parseApiListResponse<CustomerOption>(customersResponse),
    [customersResponse]
  );

  const { data: productsResponse, isLoading: loadingProducts } = useQuery({
    queryKey: ['products', 'rental-new', activeTenantId, activeShopId],
    queryFn: () => productService.getProducts({ limit: 100, isActive: true, isRentable: true }),
    enabled: rentalsEnabled && hasFeature('products'),
    staleTime: 5 * 60 * 1000,
  });

  const products = useMemo(
    () => parseApiListResponse<ProductOption>(productsResponse),
    [productsResponse]
  );

  const { data: rentalSettings } = useQuery({
    queryKey: ['settings', 'rental', activeTenantId],
    queryFn: () => settingsService.getRentalSettings(),
    enabled: rentalsEnabled,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const dayBillingMode = normalizeDayBillingMode(
    rentalSettings && typeof rentalSettings === 'object'
      ? (rentalSettings as { dayBillingMode?: string }).dayBillingMode
      : undefined
  );

  const parsedDuration = Math.max(1, parseInt(durationDays, 10) || 1);
  const endDate = resolveRentalEndDate(startDate, parsedDuration, dayBillingMode);
  const rentalDays = getRentalDayCount(startDate, endDate, dayBillingMode);
  const discountValue = Number(discountAmount || 0) || 0;
  const hireDue = estimateHireDue(items, startDate, endDate, discountValue, dayBillingMode);
  const paidNow = hirePaymentMode === HIRE_PAYMENT_FULL
    ? hireDue
    : hirePaymentMode === HIRE_PAYMENT_PARTIAL
      ? Number(hireAmountPaid || 0) || 0
      : 0;
  const hireBalance = Math.max(0, Number((hireDue - paidNow).toFixed(2)));
  const collectingHire = hirePaymentMode === HIRE_PAYMENT_FULL || hirePaymentMode === HIRE_PAYMENT_PARTIAL;
  const needsPromisedDate = hirePaymentMode === HIRE_PAYMENT_CREDIT || hirePaymentMode === HIRE_PAYMENT_PARTIAL;

  const availabilityKey = useMemo(
    () =>
      JSON.stringify({
        startDate,
        endDate,
        branchId: activeShopId,
        items: items.map((item) => ({ productId: item.productId, quantity: item.quantity })),
      }),
    [startDate, endDate, activeShopId, items]
  );
  const debouncedAvailabilityKey = useDebounce(availabilityKey, 400);

  const {
    data: availabilityResponse,
    isFetching: availabilityLoading,
    isError: availabilityError,
  } = useQuery({
    queryKey: ['rentals', 'availability', activeTenantId, debouncedAvailabilityKey],
    queryFn: async () => {
      const parsed = JSON.parse(debouncedAvailabilityKey) as {
        startDate: string;
        endDate: string;
        items: Array<{ productId: string; quantity: number }>;
      };
      return rentalService.checkAvailability({
        startDate: parsed.startDate,
        endDate: parsed.endDate,
        items: parsed.items,
      });
    },
    enabled: rentalsEnabled && items.length > 0 && !!startDate && !!endDate && !!activeShopId,
    staleTime: 15 * 1000,
  });

  const availabilityRows = useMemo(
    () => parseAvailabilityItems(availabilityResponse),
    [availabilityResponse]
  );
  const availabilityByProductId = useMemo(() => {
    const map = new Map<string, (typeof availabilityRows)[number]>();
    availabilityRows.forEach((row) => {
      if (row.productId) map.set(row.productId, row);
    });
    return map;
  }, [availabilityRows]);

  const availabilityIssues = useMemo(() => {
    if (!items.length || availabilityLoading) return [];
    return items.flatMap((item) => {
      const row = availabilityByProductId.get(item.productId);
      if (!row) return [];
      if (row.canFulfill) return [];
      const name = row.productName || item.name || 'Item';
      return [`${name}: ${row.reason || 'Unavailable for these dates'}`];
    });
  }, [items, availabilityLoading, availabilityByProductId]);

  const addProduct = useCallback((product: ProductOption) => {
    setItems((prev) => {
      const existing = prev.find((item) => item.productId === product.id);
      if (existing) {
        return prev.map((item) =>
          item.productId === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [
        ...prev,
        {
          productId: product.id,
          name: product.name,
          quantity: 1,
          rentalRatePerDay: productRate(product),
        },
      ];
    });
  }, []);

  const updateItemQty = useCallback((productId: string, quantity: number) => {
    setItems((prev) => {
      if (quantity < 1) return prev.filter((item) => item.productId !== productId);
      return prev.map((item) => (item.productId === productId ? { ...item, quantity } : item));
    });
  }, []);

  const createMutation = useMutation({
    mutationFn: () => {
      const draft = {
        customerId,
        startDate,
        durationDays: parsedDuration,
        hirePaymentMode,
        hireAmountPaid,
        paymentMethod,
        promisedPaymentDate,
        discountAmount,
        depositAmount,
        operationalLocation,
        items,
        dayBillingMode,
      };
      const error = validateRentalCreateDraft(draft);
      if (error) {
        throw Object.assign(new Error(error), { clientValidation: true });
      }
      if (!activeShopId) {
        throw Object.assign(new Error('Select a location before creating a rental.'), {
          clientValidation: true,
        });
      }
      if (availabilityLoading) {
        throw Object.assign(new Error('Still checking availability. Try again in a moment.'), {
          clientValidation: true,
        });
      }
      if (availabilityError) {
        throw Object.assign(new Error('Could not check availability. Try again.'), {
          clientValidation: true,
        });
      }
      if (availabilityIssues.length) {
        throw Object.assign(new Error(availabilityIssues[0]), { clientValidation: true });
      }
      return rentalService.createRental(buildCreateRentalPayload(draft));
    },
    onSuccess: async (response) => {
      await refreshAfterRentalChange(queryClient);
      const createdId = unwrapCreatedRentalId(response);
      if (createdId) {
        router.replace(`/rental/${encodeURIComponent(createdId)}` as never);
        return;
      }
      router.replace('/(tabs)/rentals' as never);
    },
    onError: (err: unknown) => {
      const clientMessage = err instanceof Error && (err as { clientValidation?: boolean }).clientValidation
        ? err.message
        : null;
      Alert.alert(
        'Could not create rental',
        clientMessage || getApiErrorMessage(err, 'Failed to create rental. Please try again.')
      );
    },
  });

  const handleSubmit = useCallback(() => {
    if (submitting || createMutation.isPending) return;
    setSubmitting(true);
    createMutation.mutate(undefined, {
      onSettled: () => setSubmitting(false),
    });
  }, [createMutation, submitting]);

  if (!isRentalTenant || !hasFeature('rentals')) {
    return <FeatureAccessDenied message="Rentals are not enabled for this workspace." />;
  }

  const hireSummary = hirePaymentMode === HIRE_PAYMENT_FULL
    ? `Hire paid today: ${formatCurrency(hireDue)}`
    : hirePaymentMode === HIRE_PAYMENT_PARTIAL
      ? `Paid today: ${formatCurrency(paidNow)} · Still to collect: ${formatCurrency(hireBalance)}`
      : `Hire on credit: ${formatCurrency(hireDue)}`;

  return (
    <ScreenShell style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <StackPageHeader
          title="New rental"
          subtitle="Customer, dates, items, and payment."
        />
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.content, { paddingBottom: 140 + insets.bottom }]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
            <FormLabel>Customer</FormLabel>
            {loadingCustomers ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator color={colors.tint} />
                <Text style={[styles.loadingHint, { color: mutedColor }]}>Loading customers…</Text>
              </View>
            ) : customers.length > 0 ? (
              <View style={styles.chipWrap}>
                {customers.map((customer) => {
                  const selected = customerId === customer.id;
                  return (
                    <Pressable
                      key={customer.id}
                      onPress={() => setCustomerId(customer.id)}
                      style={[
                        styles.chip,
                        { borderColor },
                        selected && { backgroundColor: colors.tint, borderColor: colors.tint },
                      ]}
                    >
                      <Text
                        style={[styles.chipText, { color: selected ? '#fff' : textColor }]}
                        numberOfLines={1}
                      >
                        {customer.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : (
              <Text style={[styles.hint, { color: mutedColor }]}>
                No customers found. Add a customer first.
              </Text>
            )}

            <FormLabel>Start date</FormLabel>
            <FormInput
              placeholder="YYYY-MM-DD"
              value={startDate}
              onChangeText={setStartDate}
              autoCapitalize="none"
            />

            <FormLabel>Duration (days)</FormLabel>
            <View style={styles.stepperRow}>
              <Pressable
                onPress={() => setDurationDays(String(Math.max(1, parsedDuration - 1)))}
                style={[styles.stepperButton, { borderColor }]}
                hitSlop={8}
              >
                <AppIcon name="minus" size={16} color={textColor} />
              </Pressable>
              <FormInput
                style={styles.stepperInput}
                placeholder="1"
                keyboardType="number-pad"
                value={durationDays}
                onChangeText={setDurationDays}
              />
              <Pressable
                onPress={() => setDurationDays(String(parsedDuration + 1))}
                style={[styles.stepperButton, { borderColor }]}
                hitSlop={8}
              >
                <AppIcon name="plus" size={16} color={textColor} />
              </Pressable>
            </View>
            <Text style={[styles.hint, { color: mutedColor }]}>
              Return {endDate || '—'} · {rentalDays} billable {rentalDays === 1 ? 'day' : 'days'}
            </Text>

            <FormLabel optional>Where it will be used</FormLabel>
            <FormInput
              placeholder="e.g. Airport, event venue"
              value={operationalLocation}
              onChangeText={setOperationalLocation}
            />

            <FormLabel>Items</FormLabel>
            {loadingProducts ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator color={colors.tint} />
                <Text style={[styles.loadingHint, { color: mutedColor }]}>Loading products…</Text>
              </View>
            ) : products.length > 0 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={styles.productChipsRow}
              >
                {products.map((product) => {
                  const selected = items.some((item) => item.productId === product.id);
                  const availability = availabilityByProductId.get(product.id);
                  return (
                    <Pressable
                      key={product.id}
                      onPress={() => addProduct(product)}
                      style={[
                        styles.productChip,
                        { borderColor },
                        selected && { backgroundColor: colors.tint, borderColor: colors.tint },
                      ]}
                    >
                      <Text
                        style={[styles.productChipName, { color: selected ? '#fff' : textColor }]}
                        numberOfLines={1}
                      >
                        {product.name}
                      </Text>
                      <Text
                        style={[styles.productChipMeta, { color: selected ? '#ecfdf5' : mutedColor }]}
                        numberOfLines={1}
                      >
                        {formatCurrency(productRate(product))}/day
                        {availability && Number.isFinite(availability.availableQty)
                          ? ` · ${availability.availableQty} left`
                          : ''}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            ) : (
              <Text style={[styles.hint, { color: mutedColor }]}>
                No rentable products found. Add products on web or in Products.
              </Text>
            )}

            {items.map((item) => (
              <View key={item.productId} style={[styles.itemCard, { borderColor, backgroundColor: inputBg }]}>
                <View style={styles.itemHeaderRow}>
                  <Text style={[styles.itemTitle, { color: textColor }]} numberOfLines={1}>
                    {item.name || 'Item'}
                  </Text>
                  <Pressable onPress={() => updateItemQty(item.productId, 0)} hitSlop={8}>
                    <AppIcon name="trash" size={16} color="#dc2626" />
                  </Pressable>
                </View>
                <Text style={[styles.hint, { color: mutedColor }]}>
                  {formatCurrency(item.rentalRatePerDay)}/day
                </Text>
                <View style={styles.stepperRow}>
                  <Pressable
                    onPress={() => updateItemQty(item.productId, item.quantity - 1)}
                    style={[styles.stepperButton, { borderColor }]}
                  >
                    <AppIcon name="minus" size={16} color={textColor} />
                  </Pressable>
                  <Text style={[styles.qtyLabel, { color: textColor }]}>{item.quantity}</Text>
                  <Pressable
                    onPress={() => updateItemQty(item.productId, item.quantity + 1)}
                    style={[styles.stepperButton, { borderColor }]}
                  >
                    <AppIcon name="plus" size={16} color={textColor} />
                  </Pressable>
                </View>
              </View>
            ))}

            {availabilityLoading ? (
              <Text style={[styles.hint, { color: mutedColor }]}>Checking availability…</Text>
            ) : availabilityError ? (
              <Text style={styles.errorText}>Could not check availability. Try again before creating.</Text>
            ) : availabilityIssues.length ? (
              availabilityIssues.map((issue) => (
                <Text key={issue} style={styles.errorText}>{issue}</Text>
              ))
            ) : null}

            <FormLabel optional>Discount</FormLabel>
            <FormInput
              placeholder="0.00"
              keyboardType="decimal-pad"
              value={discountAmount}
              onChangeText={setDiscountAmount}
            />

            <FormLabel optional>Deposit to hold today</FormLabel>
            <FormInput
              placeholder="0.00"
              keyboardType="decimal-pad"
              value={depositAmount}
              onChangeText={setDepositAmount}
            />

            <FormLabel>Hire payment</FormLabel>
            <View style={styles.chipWrap}>
              {HIRE_PAYMENT_MODES.map((option) => {
                const selected = hirePaymentMode === option.value;
                return (
                  <Pressable
                    key={option.value}
                    onPress={() => setHirePaymentMode(option.value)}
                    style={[
                      styles.chip,
                      { borderColor },
                      selected && { backgroundColor: colors.tint, borderColor: colors.tint },
                    ]}
                  >
                    <Text style={[styles.chipText, { color: selected ? '#fff' : textColor }]}>
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {hirePaymentMode === HIRE_PAYMENT_PARTIAL ? (
              <>
                <FormLabel>Amount paid now</FormLabel>
                <FormInput
                  placeholder="0.00"
                  keyboardType="decimal-pad"
                  value={hireAmountPaid}
                  onChangeText={setHireAmountPaid}
                />
              </>
            ) : null}

            {collectingHire || Number(depositAmount || 0) > 0 ? (
              <>
                <FormLabel>Payment method</FormLabel>
                <View style={styles.chipWrap}>
                  {RENTAL_PAYMENT_METHODS.map((method) => {
                    const selected = paymentMethod === method.value;
                    return (
                      <Pressable
                        key={method.value}
                        onPress={() => setPaymentMethod(method.value)}
                        style={[
                          styles.chip,
                          { borderColor },
                          selected && { backgroundColor: colors.tint, borderColor: colors.tint },
                        ]}
                      >
                        <Text style={[styles.chipText, { color: selected ? '#fff' : textColor }]}>
                          {method.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            ) : null}

            {needsPromisedDate ? (
              <>
                <FormLabel>Promised payment date</FormLabel>
                <FormInput
                  placeholder="YYYY-MM-DD"
                  value={promisedPaymentDate}
                  onChangeText={setPromisedPaymentDate}
                  autoCapitalize="none"
                />
              </>
            ) : null}

            <View style={[styles.summaryBox, { borderColor, backgroundColor: inputBg }]}>
              <Text style={[styles.summaryTotal, { color: textColor }]}>
                Hire due {formatCurrency(hireDue)}
              </Text>
              <Text style={[styles.hint, { color: mutedColor }]}>{hireSummary}</Text>
            </View>
          </View>
        </ScrollView>
        <View
          style={[
            styles.stickyFooter,
            {
              backgroundColor: bg,
              borderTopColor: borderColor,
              paddingBottom: Math.max(insets.bottom, 16),
            },
          ]}
        >
          <Pressable
            style={[
              styles.primaryButton,
              { backgroundColor: colors.tint },
              (submitting || createMutation.isPending || availabilityLoading || !!availabilityIssues.length) &&
                styles.primaryButtonDisabled,
            ]}
            onPress={handleSubmit}
            disabled={submitting || createMutation.isPending}
          >
            {submitting || createMutation.isPending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryButtonText}>Create rental</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 12 },
  card: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  loadingHint: { fontSize: 14 },
  hint: { fontSize: 13, marginBottom: 8 },
  errorText: { fontSize: 13, color: '#dc2626', marginBottom: 8 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    minHeight: 44,
    justifyContent: 'center',
  },
  chipText: { fontSize: 13, fontWeight: '600' },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  stepperButton: {
    width: 44,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperInput: { flex: 1, marginBottom: 0 },
  qtyLabel: { minWidth: 28, textAlign: 'center', fontSize: 16, fontWeight: '700' },
  productChipsRow: { gap: 8, paddingRight: 8, marginBottom: 8 },
  productChip: {
    width: 168,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    minHeight: 64,
  },
  productChipName: { fontSize: 13, fontWeight: '600' },
  productChipMeta: { fontSize: 12, marginTop: 2 },
  itemCard: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
  },
  itemHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  itemTitle: { fontSize: 14, fontWeight: '600', flex: 1 },
  summaryBox: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginTop: 8,
  },
  summaryTotal: { fontSize: 16, fontWeight: '700', marginBottom: 4 },
  primaryButton: {
    height: 48,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonDisabled: { opacity: 0.7 },
  primaryButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  stickyFooter: {
    borderTopWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
});
