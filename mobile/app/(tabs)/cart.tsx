import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  TextInput,
  Alert,
  Share,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';

import { AppIcon, type AppIconName } from '@/components/AppIcon';
import { FormSheetModal } from '@/components/FormSheetModal';
import { CartAmountSheet } from '@/components/CartAmountSheet';
import { CartQuantitySheet } from '@/components/CartQuantitySheet';
import { FORM_LABELS } from '@/constants/formLabels';
import { useCart } from '@/context/CartContext';
import { useAuth } from '@/context/AuthContext';
import { useRegisterPageSearch } from '@/hooks/useRegisterPageSearch';
import { useWorkspaceScope } from '@/hooks/useWorkspaceScope';
import { FeatureAccessDenied } from '@/components/FeatureAccessDenied';
import { customerService } from '@/services/customerService';
import { dealerService } from '@/services/dealerService';
import { saleService } from '@/services/saleService';
import { settingsService } from '@/services/settings';
import { offlineQueueService } from '@/services/offlineQueueService';
import { CURRENCY, SHOP_TYPES, resolveBusinessType } from '@/constants';
import { FontFamily, FontSize } from '@/constants/typography';
import { useScreenColors } from '@/hooks/useScreenColors';
import { ScreenShell } from '@/components/ScreenShell';
import { resolveImageUrl } from '@/utils/fileUtils';
import { formatSaleReceiptText } from '@/utils/formatSaleReceipt';
import { refreshAfterCustomerChange, refreshAfterSale, refreshAfterDealerChange } from '@/utils/queryInvalidation';
import { parseDecimalInput } from '@/utils/formatCurrency';
import { formatCurrency } from '@/utils/formatCurrency';
import { getApiErrorMessage, parseApiEntity } from '@/utils/parseApiListResponse';
import { isProductOutOfStock } from '@/utils/productStock';

const generateSaleClientId = () =>
  `mobile-sale-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

type TaxConfig = {
  enabled?: boolean;
  defaultRatePercent?: number | string;
  pricesAreTaxInclusive?: boolean;
};

const roundCurrency = (value: number) => Math.round(value * 100) / 100;

function computeCartTaxTotal({
  items,
  cartDiscount,
  config,
}: {
  items: Array<{ quantity: number; unitPrice: number; discount?: number }>;
  cartDiscount: number;
  config?: TaxConfig | null;
}) {
  const enabled = config?.enabled === true;
  const rate = Number(config?.defaultRatePercent) || 0;
  const inclusive = config?.pricesAreTaxInclusive === true;
  const lineGross = items.reduce((sum, item) => {
    const quantity = Number(item.quantity) || 0;
    const unitPrice = Number(item.unitPrice) || 0;
    const discount = Math.max(0, Number(item.discount) || 0);
    return sum + Math.max(0, roundCurrency(quantity * unitPrice - discount));
  }, 0);
  const taxable = Math.max(0, roundCurrency(lineGross - Math.max(0, cartDiscount || 0)));

  if (!enabled || rate <= 0) {
    return { taxAmount: 0, total: taxable };
  }

  if (inclusive) {
    const exclusive = roundCurrency(taxable / (1 + rate / 100));
    return { taxAmount: roundCurrency(taxable - exclusive), total: taxable };
  }

  const taxAmount = roundCurrency(taxable * (rate / 100));
  return { taxAmount, total: roundCurrency(taxable + taxAmount) };
}

export default function CartScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ dealerId?: string; mode?: string }>();
  const {
    items,
    removeItem,
    updateQuantity,
    updateDiscount,
    updateUnitPrice,
    clearCart,
    getTotal,
    getSubtotal,
    getItemCount,
  } = useCart();
  const { activeTenantId, activeTenant, hasFeature } = useAuth();
  const { activeShopId, activeShop, activeStudioLocationId, activeStudioLocation, scopeReady } =
    useWorkspaceScope();
  const { colors, bg, cardBg, borderColor, textColor, mutedColor, inputBg } = useScreenColors();
  const queryClient = useQueryClient();

  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  const [selectedDealer, setSelectedDealer] = useState<{
    id: string;
    businessName: string;
    balance?: number | string;
    availableCredit?: number | string;
  } | null>(null);
  const [loadingDealer, setLoadingDealer] = useState(false);
  const [customerModalVisible, setCustomerModalVisible] = useState(false);
  const [paymentModalVisible, setPaymentModalVisible] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'mobile_money' | 'card' | 'credit'>(
    'cash'
  );
  const [amountTendered, setAmountTendered] = useState('');
  const [mobileMoneyNumber, setMobileMoneyNumber] = useState('');
  const [quickCustomerPhone, setQuickCustomerPhone] = useState('');
  const [quickCustomerName, setQuickCustomerName] = useState('');
  const [findingCustomer, setFindingCustomer] = useState(false);
  const [sendToKitchen, setSendToKitchen] = useState(true);
  const [quantityEditItem, setQuantityEditItem] = useState<(typeof items)[number] | null>(null);
  const [amountEdit, setAmountEdit] = useState<{
    mode: 'price' | 'discount';
    item: (typeof items)[number];
  } | null>(null);

  const shopType = activeTenant?.metadata?.shopType;
  const isRestaurant = shopType === SHOP_TYPES.RESTAURANT;
  const resolvedType = resolveBusinessType(activeTenant?.businessType);
  const isRetailLike = resolvedType === 'shop' || resolvedType === 'pharmacy';
  const isDealerMode =
    params.mode === 'dealer' || !!params.dealerId || !!selectedDealer?.id;
  const dealersFeatureEnabled = hasFeature('dealersAccount');

  useEffect(() => {
    const dealerId = params.dealerId ? String(params.dealerId) : '';
    if (!dealerId || !dealersFeatureEnabled) return;

    let cancelled = false;
    const loadDealer = async () => {
      setLoadingDealer(true);
      try {
        const res = await dealerService.getById(dealerId);
        const dealer = parseApiEntity<{
          id: string;
          businessName: string;
          balance?: number | string;
          availableCredit?: number | string;
        }>(res);
        if (!cancelled && dealer?.id) {
          setSelectedDealer(dealer);
          setSelectedCustomer(null);
        }
      } catch (err) {
        if (!cancelled) {
          Alert.alert('Dealer unavailable', getApiErrorMessage(err, 'Could not load dealer account.'));
        }
      } finally {
        if (!cancelled) setLoadingDealer(false);
      }
    };

    loadDealer();
    return () => {
      cancelled = true;
    };
  }, [params.dealerId, dealersFeatureEnabled]);

  const { data: customersResponse } = useQuery({
    queryKey: ['customers', 'list', activeTenantId, activeShopId, activeStudioLocationId],
    queryFn: () => customerService.getCustomers({ limit: 50 }),
    enabled:
      !!activeTenantId &&
      isRetailLike &&
      customerModalVisible &&
      scopeReady,
    staleTime: 5 * 60 * 1000,
    gcTime: 2 * 60 * 60 * 1000,
  });

  const customers = (customersResponse?.data || []) as Array<{
    id: string;
    name: string;
    phone?: string;
    email?: string;
  }>;

  const { data: organizationSettings } = useQuery({
    queryKey: ['settings', 'organization', activeTenantId],
    queryFn: settingsService.getOrganizationSettings,
    enabled: !!activeTenantId,
    staleTime: 5 * 60 * 1000,
    gcTime: 2 * 60 * 60 * 1000,
  });

  const cartTotal = getTotal();
  const itemCount = getItemCount();
  const cartDiscountTotal = getSubtotal() - cartTotal;
  const cartTaxSummary = useMemo(
    () =>
      computeCartTaxTotal({
        items,
        cartDiscount: 0,
        config: organizationSettings?.tax,
      }),
    [items, organizationSettings?.tax]
  );
  const payableTotal = cartTaxSummary.total;

  useRegisterPageSearch({
    scope: 'cart',
    placeholder: 'Search',
    enabled: false,
    title: 'Cart',
    subtitle: `${itemCount} ${itemCount === 1 ? 'item' : 'items'}`,
  });

  const createSaleMutation = useMutation({
    mutationFn: async (payload: object) => {
      try {
        return await saleService.createSale(payload);
      } catch (error: any) {
        const message = String(error?.message || '').toLowerCase();
        const shouldQueue =
          !error?.response &&
          (error?.code === 'ERR_NETWORK' ||
            error?.code === 'ECONNABORTED' ||
            message.includes('network') ||
            message.includes('timeout'));
        if (shouldQueue) {
          await offlineQueueService.queueSale(payload);
          return { _offline: true };
        }
        throw error;
      }
    },
    onSuccess: async (data: any, variables: { sendToKitchen?: boolean; dealerId?: string }) => {
      const kitchenSent = variables?.sendToKitchen !== false;
      const dealerSale = Boolean(variables?.dealerId);
      if (data?._offline) {
        clearCart();
        setPaymentModalVisible(false);
        const offlineMsg =
          isRestaurant && kitchenSent
            ? 'Sale saved offline. It will sync and appear in kitchen when you are back online.'
            : 'Sale will sync when you are back online.';
        Alert.alert('Saved offline', offlineMsg, [{ text: 'OK' }]);
        return;
      }
      clearCart();
      setPaymentModalVisible(false);
      if (dealerSale) setSelectedDealer(null);

      const sale = data?.data ?? data;
      let generatedInvoice = sale?.invoice ?? null;
      if (!dealerSale && sale?.id && sale?.customerId && !sale?.invoiceId) {
        try {
          const invoiceResponse = await saleService.generateInvoice(sale.id);
          generatedInvoice = invoiceResponse?.data ?? invoiceResponse ?? null;
          if (generatedInvoice?.id) {
            sale.invoiceId = generatedInvoice.id;
            sale.invoice = generatedInvoice;
          }
          queryClient.invalidateQueries({ queryKey: ['invoices'] });
          queryClient.invalidateQueries({ queryKey: ['invoice'] });
          queryClient.invalidateQueries({ queryKey: ['customer'] });
          queryClient.invalidateQueries({ queryKey: ['customers'] });
        } catch (invoiceError) {
          // Do not fail the sale after payment has been recorded; the sale detail can retry invoice generation.
          console.warn('[ABS] [Cart] Sale invoice generation failed:', invoiceError);
        }
      }
      if (sale?.invoiceId || generatedInvoice?.id) {
        queryClient.invalidateQueries({ queryKey: ['invoices'] });
        queryClient.invalidateQueries({ queryKey: ['invoice'] });
        queryClient.invalidateQueries({ queryKey: ['customer'] });
        queryClient.invalidateQueries({ queryKey: ['customers'] });
      }
      if (sale?.id) {
        queryClient.setQueriesData({ queryKey: ['sales'] }, (old: any) => {
          const list = Array.isArray(old?.data) ? old.data : null;
          if (!list) return old;
          if (list.some((existingSale: any) => existingSale?.id === sale.id)) return old;
          return {
            ...old,
            count: typeof old.count === 'number' ? old.count + 1 : old.count,
            data: [sale, ...list].slice(0, list.length || 15),
          };
        });
      }
      await refreshAfterSale(queryClient);
      if (variables?.dealerId) {
        await refreshAfterDealerChange(queryClient);
      }

      const offerShare = sale?.id && paymentMethod !== 'credit' && !dealerSale;

      if (dealerSale) {
        Alert.alert('Dealer sale recorded', 'The sale has been charged to the dealer account.', [
          { text: 'OK', onPress: () => router.push('/(tabs)/sales') },
        ]);
        return;
      }

      if (offerShare) {
        const shareTitle =
          isRestaurant && kitchenSent && sale?.saleNumber
            ? `Order #${sale.saleNumber} sent to kitchen`
            : generatedInvoice?.id
              ? 'Sale completed + invoice created'
              : 'Sale completed';
        const shareSubtitle =
          isRestaurant && kitchenSent
            ? 'Share receipt with customer?'
            : 'Share receipt with customer?';
        Alert.alert(shareTitle, shareSubtitle, [
          { text: 'Later', onPress: () => router.push('/(tabs)/sales') },
          {
            text: 'Share',
            onPress: async () => {
              try {
                let receiptSale = sale;
                try {
                  const res = await saleService.getReceipt(sale.id);
                  receiptSale = res?.data ?? res ?? sale;
                } catch {
                  // use sale from create response
                }
                await Share.share({
                  message: formatSaleReceiptText({
                    ...receiptSale,
                    shop: receiptSale?.shop ?? activeShop ?? undefined,
                    studioLocation: receiptSale?.studioLocation ?? activeStudioLocation ?? undefined,
                    tenantName: activeTenant?.name,
                  }),
                  title: `Receipt ${receiptSale?.saleNumber || ''}`.trim(),
                });
              } catch {
                // user dismissed share
              }
              router.push('/(tabs)/sales');
            },
          },
        ]);
        return;
      }

      const successMsg =
        isRestaurant && kitchenSent && sale?.saleNumber
          ? `Order #${sale.saleNumber} has been sent to the kitchen.`
          : generatedInvoice?.id
            ? 'Sale completed and invoice created.'
          : 'Sale completed successfully!';
      Alert.alert('Success', successMsg, [
        { text: 'OK', onPress: () => router.push(isRestaurant && kitchenSent ? '/(tabs)/orders' : '/(tabs)/sales') },
      ]);
    },
    onError: (error: any) => {
      Alert.alert('Error', error?.message || 'Failed to complete sale');
    },
  });

  const handleCheckout = useCallback(() => {
    if (items.length === 0) {
      Alert.alert('Empty Cart', 'Please add items to cart before checkout');
      return;
    }
    setAmountTendered(payableTotal.toFixed(CURRENCY.DECIMAL_PLACES));
    setPaymentModalVisible(true);
  }, [items, payableTotal]);

  const handleAddMoreProducts = useCallback(() => {
    setPaymentModalVisible(false);
    router.push('/(tabs)/scan');
  }, [router]);

  const handleCompletePayment = useCallback(async () => {
    if (!activeTenantId) {
      Alert.alert('Error', 'No active workspace');
      return;
    }

    if (isDealerMode) {
      if (!selectedDealer?.id) {
        Alert.alert('Error', 'Select a dealer account before completing the sale');
        return;
      }
      const total = payableTotal;
      const saleItems = items.map((item) => {
        const unitPrice = Number(item.unitPrice) || 0;
        return {
          productId: item.productId,
          productVariantId: item.productVariantId || null,
          name: item.name,
          sku: item.sku,
          productCode: item.productCode,
          quantity: item.quantity,
          unitPrice,
          totalPrice: unitPrice * item.quantity - (item.discount || 0),
          discount: item.discount || 0,
        };
      });

      const payload: any = {
        clientId: generateSaleClientId(),
        items: saleItems,
        total,
        subtotal: getSubtotal(),
        discount: getSubtotal() - total,
        dealerId: selectedDealer.id,
        saleChannel: 'dealer',
        customerId: null,
        paymentMethod: 'cash',
        amountPaid: 0,
        chargeToAccount: total,
        status: 'completed',
        metadata: {
          dealerBusinessName: selectedDealer.businessName,
          dealerSettlement: 'charge_to_account',
        },
      };

      createSaleMutation.mutate(payload);
      return;
    }

    let customerId = selectedCustomer?.id || null;
    if (!customerId && paymentMethod === 'mobile_money' && mobileMoneyNumber.trim()) {
      try {
        const res = await customerService.findOrCreate(mobileMoneyNumber.trim());
        const customer = res?.data ?? res;
        customerId = customer?.id ?? null;
        if (customerId) refreshAfterCustomerChange(queryClient).catch(() => {});
      } catch {
        // continue without customer link
      }
    }

    const total = payableTotal;
    const saleItems = items.map((item) => {
      const unitPrice = Number(item.unitPrice) || 0;
      return {
        productId: item.productId,
        productVariantId: item.productVariantId || null,
        name: item.name,
        sku: item.sku,
        productCode: item.productCode,
        quantity: item.quantity,
        unitPrice,
        totalPrice: unitPrice * item.quantity - (item.discount || 0),
        discount: item.discount || 0,
      };
    });

    const payload: any = {
      clientId: generateSaleClientId(),
      items: saleItems,
      total,
      subtotal: getSubtotal(),
      discount: getSubtotal() - total,
      paymentMethod,
      customerId,
      status: paymentMethod === 'credit' ? 'pending' : 'completed',
    };

    if (paymentMethod === 'cash') {
      const tendered = parseDecimalInput(amountTendered) || 0;
      if (tendered < total) {
        Alert.alert('Error', 'Amount tendered is less than total');
        return;
      }
      payload.amountPaid = tendered;
      payload.change = tendered - total;
    } else if (paymentMethod === 'mobile_money') {
      if (!mobileMoneyNumber.trim()) {
        Alert.alert('Error', 'Please enter mobile money number');
        return;
      }
      payload.mobileMoneyNumber = mobileMoneyNumber.trim();
      payload.amountPaid = total;
    } else if (paymentMethod === 'card') {
      payload.amountPaid = total;
    } else if (paymentMethod === 'credit') {
      payload.amountPaid = 0;
      payload.balance = total;
    }

    if (isRestaurant) {
      payload.sendToKitchen = sendToKitchen;
    }

    createSaleMutation.mutate(payload);
  }, [
    items,
    payableTotal,
    getSubtotal,
    paymentMethod,
    amountTendered,
    mobileMoneyNumber,
    selectedCustomer,
    selectedDealer,
    isDealerMode,
    activeTenantId,
    createSaleMutation,
    clearCart,
    queryClient,
    isRestaurant,
    sendToKitchen,
  ]);


  if (!isRetailLike) {
    return <FeatureAccessDenied message="Cart checkout is only available for shop and pharmacy workspaces." />;
  }
  if (!hasFeature('paymentsExpenses')) {
    return <FeatureAccessDenied message="Checkout is not enabled for this workspace." />;
  }
  if (isDealerMode && !dealersFeatureEnabled) {
    return <FeatureAccessDenied message="Dealers account is not enabled for this workspace." />;
  }

  if (items.length === 0) {
    return (
      <ScreenShell style={styles.container}>
        <View style={styles.emptyContainer}>
          <AppIcon name="shopping-cart" size={64} color={mutedColor} />
          <Text style={[styles.emptyTitle, { color: textColor }]}>Your cart is empty</Text>
          <Text style={[styles.emptySubtitle, { color: mutedColor }]}>
            Add products from the scan screen
          </Text>
          <Pressable
            onPress={() => router.push('/(tabs)/scan')}
            style={[styles.emptyButton, { backgroundColor: colors.tint }]}
          >
            <Text style={styles.emptyButtonText}>Start Shopping</Text>
          </Pressable>
        </View>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {isDealerMode ? (
          <View style={[styles.customerCard, { backgroundColor: cardBg, borderColor }]}>
            <View style={[styles.customerAvatar, { backgroundColor: `${colors.tint}18` }]}>
              <AppIcon name="briefcase" size={20} color={colors.tint} />
            </View>
            <View style={styles.customerInfo}>
              <Text style={[styles.customerLabel, { color: mutedColor }]}>Dealer account</Text>
              {loadingDealer && !selectedDealer ? (
                <ActivityIndicator color={colors.tint} style={{ marginTop: 4 }} />
              ) : (
                <>
                  <Text style={[styles.customerName, { color: textColor }]}>
                    {selectedDealer?.businessName || 'Dealer not loaded'}
                  </Text>
                  {selectedDealer ? (
                    <Text style={[styles.dealerMeta, { color: mutedColor }]}>
                      Outstanding {formatCurrency(selectedDealer.balance)} · Available{' '}
                      {formatCurrency(selectedDealer.availableCredit)}
                    </Text>
                  ) : null}
                </>
              )}
            </View>
          </View>
        ) : (
          <Pressable
            onPress={() => setCustomerModalVisible(true)}
            style={[styles.customerCard, { backgroundColor: cardBg, borderColor }]}
          >
            <View style={[styles.customerAvatar, { backgroundColor: `${colors.tint}18` }]}>
              <AppIcon name="user" size={20} color={colors.tint} />
            </View>
            <View style={styles.customerInfo}>
              <Text style={[styles.customerLabel, { color: mutedColor }]}>Customer</Text>
              <Text style={[styles.customerName, { color: textColor }]}>
                {selectedCustomer?.name || 'Walk-in Customer'}
              </Text>
            </View>
            <AppIcon name="chevron-right" size={18} color={mutedColor} />
          </Pressable>
        )}

        <View style={styles.itemsContainer}>
          {items.map((item) => {
            const unitPrice = Number(item.unitPrice) || 0;
            const lineDiscount = Math.max(0, Number(item.discount) || 0);
            const itemTotal = unitPrice * item.quantity - lineDiscount;
            const outOfStock = isProductOutOfStock(item);
            const showStockBadge = item.trackStock !== false && item.quantityOnHand != null;
            return (
              <View key={item.id} style={[styles.cartItem, { backgroundColor: cardBg, borderColor }]}>
                <View style={styles.itemTopRow}>
                  {item.imageUrl ? (
                    <Image
                      source={{ uri: resolveImageUrl(item.imageUrl) }}
                      style={styles.itemImage}
                      contentFit="cover"
                    />
                  ) : (
                    <View style={[styles.itemImagePlaceholder, { backgroundColor: `${colors.tint}12`, borderColor }]}>
                      <AppIcon name="package" size={22} color={colors.tint} />
                    </View>
                  )}

                  <View style={styles.itemDetails}>
                    <Text style={[styles.itemName, { color: textColor }]} numberOfLines={2}>
                      {item.name}
                    </Text>
                    <Text style={[styles.itemPrice, { color: mutedColor }]}>
                      {formatCurrency(unitPrice)} each
                    </Text>
                    {showStockBadge ? (
                      <View
                        style={[
                          styles.stockBadge,
                          {
                            backgroundColor: outOfStock ? '#fef2f2' : '#dcfce7',
                            borderColor: outOfStock ? '#fecaca' : '#bbf7d0',
                          },
                        ]}
                      >
                        <AppIcon
                          name="package"
                          size={12}
                          color={outOfStock ? '#dc2626' : '#16a34a'}
                        />
                        <Text
                          style={[
                            styles.stockBadgeText,
                            { color: outOfStock ? '#dc2626' : '#16a34a' },
                          ]}
                        >
                          {outOfStock ? 'Out of stock' : 'In stock'}
                        </Text>
                      </View>
                    ) : null}
                    {lineDiscount > 0 ? (
                      <Text style={styles.itemDiscount}>
                        Discount −{formatCurrency(lineDiscount)}
                      </Text>
                    ) : null}
                  </View>

                  <View style={styles.itemRightCol}>
                    <View style={styles.quantityControls}>
                      <Pressable
                        onPress={() => updateQuantity(item.id, item.quantity - 1)}
                        style={[styles.quantityBtn, { borderColor: colors.tint }]}
                        accessibilityLabel={`Decrease quantity for ${item.name}`}
                      >
                        <AppIcon name="minus" size={14} color={colors.tint} />
                      </Pressable>
                      <Pressable
                        onPress={() => setQuantityEditItem(item)}
                        style={[styles.quantityValueBtn, { borderColor }]}
                        accessibilityLabel={`Edit quantity for ${item.name}`}
                        accessibilityRole="button"
                      >
                        <Text style={[styles.quantityText, { color: textColor }]}>{item.quantity}</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => updateQuantity(item.id, item.quantity + 1)}
                        style={[styles.quantityBtn, { borderColor: colors.tint }]}
                        accessibilityLabel={`Increase quantity for ${item.name}`}
                      >
                        <AppIcon name="plus" size={14} color={colors.tint} />
                      </Pressable>
                    </View>
                    <View style={[styles.qtyPill, { backgroundColor: inputBg }]}>
                      <Text style={[styles.qtyPillText, { color: mutedColor }]}>
                        {formatCurrency(unitPrice)} × {item.quantity}
                      </Text>
                    </View>
                    <Text style={[styles.itemTotal, { color: colors.tint }]}>
                      {formatCurrency(itemTotal)}
                    </Text>
                  </View>
                </View>

                <View style={[styles.itemActionRow, { borderTopColor: borderColor }]}>
                  <Pressable
                    onPress={() => setAmountEdit({ mode: 'price', item })}
                    style={styles.itemActionBtn}
                    accessibilityRole="button"
                    accessibilityLabel={`Edit price for ${item.name}`}
                  >
                    <AppIcon name="pencil" size={16} color={mutedColor} />
                    <Text style={[styles.itemActionLabel, { color: mutedColor }]}>Edit</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setAmountEdit({ mode: 'discount', item })}
                    style={styles.itemActionBtn}
                    accessibilityRole="button"
                    accessibilityLabel={`Discount for ${item.name}`}
                  >
                    <AppIcon name="tag" size={16} color={mutedColor} />
                    <Text style={[styles.itemActionLabel, { color: mutedColor }]}>Discount</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => removeItem(item.id)}
                    style={styles.itemActionBtn}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${item.name}`}
                  >
                    <AppIcon name="trash" size={16} color="#ef4444" />
                    <Text style={[styles.itemActionLabel, { color: '#ef4444' }]}>Remove</Text>
                  </Pressable>
                </View>
              </View>
            );
          })}
        </View>

        <View style={[styles.totalsCard, { backgroundColor: cardBg, borderColor }]}>
          <View style={styles.totalRow}>
            <Text style={[styles.totalLabel, { color: mutedColor }]}>Subtotal</Text>
            <Text style={[styles.totalValue, { color: textColor }]}>
              {formatCurrency(getSubtotal())}
            </Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={[styles.totalLabel, { color: mutedColor }]}>Discount</Text>
            <Text style={[styles.totalValue, { color: '#16a34a' }]}>
              {formatCurrency(cartDiscountTotal)}
            </Text>
          </View>
          {cartTaxSummary.taxAmount > 0 ? (
            <View style={styles.totalRow}>
              <Text style={[styles.totalLabel, { color: mutedColor }]}>
                {organizationSettings?.tax?.displayLabel || 'Tax'}
              </Text>
              <Text style={[styles.totalValue, { color: textColor }]}>
                {formatCurrency(cartTaxSummary.taxAmount)}
              </Text>
            </View>
          ) : null}
          <View style={[styles.totalDivider, { borderColor }]} />
          <View style={[styles.totalFinalBand, { backgroundColor: `${colors.tint}12` }]}>
            <Text style={[styles.totalFinalLabel, { color: textColor }]}>Total</Text>
            <Text style={[styles.totalFinalValue, { color: colors.tint }]}>
              {formatCurrency(payableTotal)}
            </Text>
          </View>
        </View>
      </ScrollView>

      <View style={[styles.checkoutFooter, { backgroundColor: cardBg, borderTopColor: borderColor }]}>
        <View style={styles.checkoutActions}>
          <Pressable
            onPress={handleAddMoreProducts}
            disabled={createSaleMutation.isPending}
            style={[styles.addProductsButton, { borderColor: colors.tint }]}
          >
            <AppIcon name="plus" size={18} color={colors.tint} />
            <Text style={[styles.addProductsButtonText, { color: colors.tint }]}>Add products</Text>
          </Pressable>
          <Pressable
            onPress={handleCheckout}
            disabled={createSaleMutation.isPending}
            style={[styles.checkoutButton, { backgroundColor: colors.tint }]}
          >
            {createSaleMutation.isPending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <AppIcon name="credit-card" size={20} color="#fff" />
                <Text style={styles.checkoutButtonText}>Checkout</Text>
              </>
            )}
          </Pressable>
        </View>
      </View>

      <FormSheetModal
        visible={customerModalVisible}
        title={FORM_LABELS.cart.selectCustomer}
        onClose={() => setCustomerModalVisible(false)}
        cardBg={cardBg}
        borderColor={borderColor}
        textColor={textColor}
        mutedColor={mutedColor}
        footer={
          <Pressable
            disabled={findingCustomer || !quickCustomerPhone.trim()}
            onPress={async () => {
              setFindingCustomer(true);
              try {
                const res = await customerService.findOrCreate(
                  quickCustomerPhone.trim(),
                  quickCustomerName.trim() || undefined
                );
                const customer = res?.data ?? res;
                if (customer?.id) {
                  setSelectedCustomer(customer);
                  setCustomerModalVisible(false);
                  setQuickCustomerPhone('');
                  setQuickCustomerName('');
                }
              } catch (err: unknown) {
                Alert.alert(
                  'Error',
                  err instanceof Error ? err.message : 'Could not find or create customer'
                );
              } finally {
                setFindingCustomer(false);
              }
            }}
            style={[
              styles.findCustomerBtn,
              { backgroundColor: colors.tint, opacity: quickCustomerPhone.trim() ? 1 : 0.5 },
            ]}
          >
            {findingCustomer ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.findCustomerBtnText}>{FORM_LABELS.cart.findOrAdd}</Text>
            )}
          </Pressable>
        }
      >
              <Text style={[styles.inputLabel, { color: textColor }]}>{FORM_LABELS.cart.phone}</Text>
              <TextInput
                style={[styles.input, { color: textColor, borderColor }]}
                placeholder="Phone number"
                placeholderTextColor={mutedColor}
                value={quickCustomerPhone}
                onChangeText={setQuickCustomerPhone}
                keyboardType="phone-pad"
              />
              <Text style={[styles.inputLabel, { color: textColor }]}>{FORM_LABELS.cart.nameOptional}</Text>
              <TextInput
                style={[styles.input, { color: textColor, borderColor, marginTop: 8 }]}
                placeholder="Customer name"
                placeholderTextColor={mutedColor}
                value={quickCustomerName}
                onChangeText={setQuickCustomerName}
              />
              <Pressable
                onPress={() => {
                  setSelectedCustomer(null);
                  setCustomerModalVisible(false);
                }}
                style={[styles.customerOption, { borderColor, marginTop: 16 }]}
              >
                <Text style={[styles.customerOptionText, { color: textColor }]}>{FORM_LABELS.cart.walkIn}</Text>
              </Pressable>
              {customers.map((customer) => (
                <Pressable
                  key={customer.id}
                  onPress={() => {
                    setSelectedCustomer(customer);
                    setCustomerModalVisible(false);
                  }}
                  style={[styles.customerOption, { borderColor }]}
                >
                  <Text style={[styles.customerOptionText, { color: textColor }]}>{customer.name}</Text>
                  <Text style={[styles.customerOptionSubtext, { color: mutedColor }]}>
                    {customer.phone || customer.email}
                  </Text>
                </Pressable>
              ))}
      </FormSheetModal>

      <FormSheetModal
        visible={paymentModalVisible}
        title={isDealerMode ? FORM_LABELS.cart.dealerSale : FORM_LABELS.cart.payment}
        onClose={() => setPaymentModalVisible(false)}
        cardBg={cardBg}
        borderColor={borderColor}
        textColor={textColor}
        mutedColor={mutedColor}
        footer={
          <View style={styles.paymentFooterActions}>
            <Pressable
              onPress={handleAddMoreProducts}
              disabled={createSaleMutation.isPending}
              style={[styles.paymentSecondaryButton, { borderColor }]}
            >
              <Text style={[styles.paymentSecondaryButtonText, { color: colors.tint }]}>
                Add products
              </Text>
            </Pressable>
            <Pressable
              onPress={handleCompletePayment}
              disabled={createSaleMutation.isPending || (isDealerMode && !selectedDealer?.id)}
              style={[styles.payButton, { backgroundColor: colors.tint }]}
            >
              {createSaleMutation.isPending ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.payButtonText}>
                  {isDealerMode ? FORM_LABELS.cart.completeDealerSale : FORM_LABELS.cart.completeSale}
                </Text>
              )}
            </Pressable>
          </View>
        }
      >
              <Text style={[styles.paymentTotal, { color: colors.tint }]}>
                Total: {CURRENCY.SYMBOL} {payableTotal.toFixed(CURRENCY.DECIMAL_PLACES)}
              </Text>

              {isDealerMode ? (
                <View style={[styles.dealerChargeCard, { borderColor, backgroundColor: cardBg }]}>
                  <Text style={[styles.dealerChargeTitle, { color: textColor }]}>
                    Charge {formatCurrency(payableTotal)} to {selectedDealer?.businessName || 'dealer'}
                  </Text>
                  <Text style={[styles.dealerChargeCopy, { color: mutedColor }]}>
                    This sale will be added to the dealer account balance. No customer is required.
                  </Text>
                </View>
              ) : (
                <>
              {isRestaurant && (
                <Pressable
                  onPress={() => setSendToKitchen((prev) => !prev)}
                  style={[styles.kitchenToggleRow, { borderColor, backgroundColor: cardBg === '#27272a' ? '#3f3f46' : '#f9fafb' }]}
                >
                  <View style={styles.kitchenToggleText}>
                    <View style={styles.kitchenToggleTitleRow}>
                      <AppIcon name="cutlery" size={16} color={colors.tint} />
                      <Text style={[styles.kitchenToggleTitle, { color: textColor }]}>Send to kitchen</Text>
                    </View>
                    <Text style={[styles.kitchenToggleHint, { color: mutedColor }]}>
                      {sendToKitchen
                        ? 'Order will appear in kitchen'
                        : 'Skip kitchen (e.g. water only)'}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.kitchenSwitch,
                      { borderColor: sendToKitchen ? colors.tint : borderColor, backgroundColor: sendToKitchen ? colors.tint : 'transparent' },
                    ]}
                  >
                    {sendToKitchen ? <AppIcon name="check" size={14} color="#fff" /> : null}
                  </View>
                </Pressable>
              )}

              <Text style={[styles.inputLabel, { color: textColor }]}>{FORM_LABELS.cart.paymentMethod}</Text>
              <View style={styles.paymentMethods}>
                {(['cash', 'mobile_money', 'card', 'credit'] as const).map((method) => (
                  <Pressable
                    key={method}
                    onPress={() => setPaymentMethod(method)}
                    style={[
                      styles.paymentMethodBtn,
                      { borderColor },
                      paymentMethod === method && { backgroundColor: colors.tint, borderColor: colors.tint },
                    ]}
                  >
                    <Text
                      style={[
                        styles.paymentMethodText,
                        { color: paymentMethod === method ? '#fff' : textColor },
                      ]}
                    >
                      {method === 'cash'
                        ? 'Cash'
                        : method === 'mobile_money'
                          ? 'Mobile Money'
                          : method === 'card'
                            ? 'Card'
                            : 'Credit'}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {/* Cash Payment */}
              {paymentMethod === 'cash' && (
                <View style={styles.paymentInput}>
                  <Text style={[styles.inputLabel, { color: textColor }]}>{FORM_LABELS.cart.amountTendered}</Text>
                  <TextInput
                    style={[styles.input, { color: textColor, borderColor }]}
                    placeholder="0.00"
                    placeholderTextColor={mutedColor}
                    value={amountTendered}
                    onChangeText={setAmountTendered}
                    keyboardType="decimal-pad"
                  />
                  {amountTendered.trim() && (parseDecimalInput(amountTendered) || 0) >= payableTotal ? (
                    <Text style={[styles.changeText, { color: '#16a34a' }]}>
                      Change: {CURRENCY.SYMBOL}{' '}
                      {((parseDecimalInput(amountTendered) || 0) - payableTotal).toFixed(CURRENCY.DECIMAL_PLACES)}
                    </Text>
                  ) : null}
                </View>
              )}

              {/* Mobile Money */}
              {paymentMethod === 'mobile_money' && (
                <View style={styles.paymentInput}>
                  <Text style={[styles.inputLabel, { color: textColor }]}>{FORM_LABELS.cart.mobileMoneyNumber}</Text>
                  <TextInput
                    style={[styles.input, { color: textColor, borderColor }]}
                    placeholder="0XX XXX XXXX"
                    placeholderTextColor={mutedColor}
                    value={mobileMoneyNumber}
                    onChangeText={setMobileMoneyNumber}
                    keyboardType="phone-pad"
                  />
                </View>
              )}

              {/* Credit Note */}
              {paymentMethod === 'credit' && (
                <View style={styles.paymentNote}>
                  <AppIcon name="info-circle" size={20} color={colors.tint} />
                  <Text style={[styles.noteText, { color: mutedColor }]}>
                    An invoice will be created for this sale. Payment can be made later.
                  </Text>
                </View>
              )}
                </>
              )}
      </FormSheetModal>

      <CartQuantitySheet
        visible={!!quantityEditItem}
        item={quantityEditItem}
        onClose={() => setQuantityEditItem(null)}
        onApply={updateQuantity}
        cardBg={cardBg}
        borderColor={borderColor}
        textColor={textColor}
        mutedColor={mutedColor}
        inputBg={inputBg}
        tintColor={colors.tint}
      />

      <CartAmountSheet
        visible={!!amountEdit}
        mode={amountEdit?.mode || 'price'}
        item={amountEdit?.item || null}
        onClose={() => setAmountEdit(null)}
        onApply={(itemId, amount) => {
          if (amountEdit?.mode === 'discount') {
            updateDiscount(itemId, amount);
          } else {
            updateUnitPrice(itemId, amount);
          }
        }}
        cardBg={cardBg}
        borderColor={borderColor}
        textColor={textColor}
        mutedColor={mutedColor}
        inputBg={inputBg}
        tintColor={colors.tint}
      />
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollView: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 120 },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyTitle: {
    fontFamily: FontFamily.semiBold,
    fontSize: FontSize.xl,
    fontWeight: '600',
    marginTop: 16,
  },
  emptySubtitle: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.md,
    marginTop: 8,
    textAlign: 'center',
  },
  emptyButton: {
    marginTop: 24,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  emptyButtonText: {
    color: '#fff',
    fontFamily: FontFamily.semiBold,
    fontSize: FontSize.body,
    fontWeight: '600',
  },
  customerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 16,
    gap: 12,
  },
  customerAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  customerInfo: { flex: 1, minWidth: 0 },
  customerLabel: {
    fontFamily: FontFamily.medium,
    fontSize: FontSize.xs,
    marginBottom: 2,
  },
  customerName: {
    fontFamily: FontFamily.semiBold,
    fontSize: FontSize.body,
    fontWeight: '600',
  },
  dealerMeta: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.sm,
    marginTop: 4,
  },
  dealerChargeCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginTop: 12,
  },
  dealerChargeTitle: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.body,
    fontWeight: '700',
    marginBottom: 6,
  },
  dealerChargeCopy: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.md,
    lineHeight: 20,
  },
  itemsContainer: { gap: 12, marginBottom: 16 },
  cartItem: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
  itemTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 14,
    gap: 12,
  },
  itemImage: { width: 64, height: 64, borderRadius: 10 },
  itemImagePlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemDetails: { flex: 1, minWidth: 0, gap: 4 },
  itemName: {
    fontFamily: FontFamily.semiBold,
    fontSize: FontSize.body,
    fontWeight: '600',
  },
  itemPrice: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.sm,
  },
  stockBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    marginTop: 2,
  },
  stockBadgeText: {
    fontFamily: FontFamily.semiBold,
    fontSize: 11,
    fontWeight: '600',
  },
  itemDiscount: {
    fontFamily: FontFamily.medium,
    fontSize: FontSize.sm,
    color: '#16a34a',
    marginTop: 2,
  },
  itemRightCol: {
    alignItems: 'flex-end',
    gap: 8,
    flexShrink: 0,
  },
  quantityControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  quantityBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quantityValueBtn: {
    minWidth: 40,
    height: 36,
    paddingHorizontal: 8,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quantityText: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.body,
    fontWeight: '700',
    minWidth: 20,
    textAlign: 'center',
  },
  itemTotal: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.lg,
    fontWeight: '700',
  },
  qtyPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  qtyPillText: {
    fontFamily: FontFamily.medium,
    fontSize: 11,
    fontWeight: '500',
  },
  itemActionRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    paddingVertical: 4,
  },
  itemActionBtn: {
    flex: 1,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
  },
  itemActionLabel: {
    fontFamily: FontFamily.medium,
    fontSize: FontSize.sm,
    fontWeight: '500',
  },
  totalsCard: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
    paddingTop: 16,
    gap: 12,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  totalDivider: {
    marginTop: 4,
    marginHorizontal: 16,
    borderTopWidth: 1,
    borderStyle: 'dashed',
  },
  totalFinalBand: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginTop: 0,
  },
  totalLabel: {
    fontFamily: FontFamily.medium,
    fontSize: FontSize.body,
  },
  totalValue: {
    fontFamily: FontFamily.semiBold,
    fontSize: FontSize.body,
    fontWeight: '600',
  },
  totalFinalLabel: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.lg,
    fontWeight: '700',
  },
  totalFinalValue: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.xl,
    fontWeight: '700',
  },
  checkoutFooter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    borderTopWidth: 1,
  },
  checkoutActions: {
    flexDirection: 'row',
    gap: 10,
  },
  addProductsButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1.5,
    gap: 8,
  },
  addProductsButtonText: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.body,
    fontWeight: '700',
  },
  checkoutButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: 12,
    borderRadius: 14,
    gap: 8,
  },
  checkoutButtonText: {
    color: '#fff',
    fontFamily: FontFamily.semiBold,
    fontSize: FontSize.lg,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  modalTitle: { fontSize: 18, fontWeight: '700' },
  modalBody: { padding: 20 },
  findCustomerBtn: {
    marginTop: 12,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  findCustomerBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  customerOption: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  customerOptionText: { fontSize: 16, fontWeight: '600' },
  customerOptionSubtext: { fontSize: 14, marginTop: 4 },
  paymentTotal: {
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 24,
  },
  kitchenToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
    gap: 12,
  },
  kitchenToggleText: { flex: 1 },
  kitchenToggleTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  kitchenToggleTitle: { fontSize: 15, fontWeight: '600' },
  kitchenToggleHint: { fontSize: 12 },
  kitchenSwitch: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paymentMethods: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 24,
  },
  paymentMethodBtn: {
    flex: 1,
    minWidth: '45%',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  paymentMethodText: { fontSize: 14, fontWeight: '600' },
  paymentInput: { marginBottom: 24 },
  inputLabel: { fontSize: 14, fontWeight: '500', marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  changeText: { fontSize: 14, marginTop: 8, fontWeight: '600' },
  paymentNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#f3f4f6',
    marginBottom: 24,
  },
  noteText: { flex: 1, fontSize: 14, lineHeight: 20 },
  payButton: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  payButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  paymentFooterActions: {
    flexDirection: 'row',
    gap: 10,
  },
  paymentSecondaryButton: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  paymentSecondaryButtonText: { fontSize: 16, fontWeight: '700' },
});
