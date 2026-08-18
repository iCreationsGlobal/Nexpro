import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  ActivityIndicator,
  ScrollView,
  Alert,
  FlatList,
  DeviceEventEmitter,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { AppIcon, type AppIconName } from '@/components/AppIcon';
import { ListEmptyState, EmptyStateActionButton } from '@/components/ListEmptyState';
import { useAuth } from '@/context/AuthContext';
import { useWorkspaceScope } from '@/hooks/useWorkspaceScope';
import { useCart } from '@/context/CartContext';
import { FeatureAccessDenied } from '@/components/FeatureAccessDenied';
import { productService } from '@/services/productService';
import { jobService } from '@/services/jobService';
import { customerService } from '@/services/customerService';
import { userWorkspaceService } from '@/services/userWorkspaceService';
import { CURRENCY, resolveBusinessType } from '@/constants';
import { useScreenColors } from '@/hooks/useScreenColors';
import { ScreenShell } from '@/components/ScreenShell';
import { FormInput, FormLabel } from '@/components/FormField';
import { BarcodeScanner } from '@/components/BarcodeScanner';
import { CartQuantitySheet } from '@/components/CartQuantitySheet';
import { ProductVariantPickerSheet } from '@/components/ProductVariantPickerSheet';
import { parseProductQRPayload, isProductQRCode } from '@/utils/productQR';
import { parseApiEntity, parseApiListResponse } from '@/utils/parseApiListResponse';
import { useDebounce } from '@/hooks/useDebounce';
import { useScanningEnabled } from '@/hooks/useScanningEnabled';
import { resolveImageUrl } from '@/utils/fileUtils';
import { refreshAfterJobChange, QUERY_STALE } from '@/utils/queryInvalidation';
import {
  JOB_CREATE_PAYMENT_DEFAULTS,
  JOB_CREATE_PAYMENT_METHODS,
  JOB_CREATE_PAYMENT_STATUSES,
  buildJobCreatePaymentPayload,
  validateJobCreatePayment,
} from '@/utils/jobCreatePayment';
import { OPEN_SCAN_CAMERA_EVENT } from '@/utils/scanTabEvents';
import {
  getOutOfStockMessage,
  isProductOutOfStock,
  isVariantOutOfStock,
  productRequiresVariantSelection,
  type ProductVariantStockInput,
} from '@/utils/productStock';
import { deriveBarcodeSearchCandidates } from '@/utils/barcodeSearchCandidates';
import { Image } from 'expo-image';

type ScanProduct = {
  id: string;
  name: string;
  sellingPrice?: number;
  costPrice?: number;
  price?: number;
  barcode?: string;
  sku?: string;
  quantityOnHand?: number;
  trackStock?: boolean;
  imageUrl?: string;
  hasVariants?: boolean;
  variants?: ProductVariantStockInput[];
  selectedVariant?: ProductVariantStockInput | null;
};

type JobItemDraft = {
  category: string;
  description: string;
  quantity: string;
  unitPrice: string;
};

const createDefaultJobItem = (): JobItemDraft => ({
  category: '',
  description: '',
  quantity: '1',
  unitPrice: '',
});

export default function ScanScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ customerId?: string; customerName?: string }>();
  const queryClient = useQueryClient();
  const { activeTenant, activeTenantId, hasFeature } = useAuth();
  const { activeShopId, activeStudioLocationId, scopeReady } = useWorkspaceScope();
  const { items: cartItems, getItemCount, addItem, updateQuantity } = useCart();
  const { colors, bg, cardBg, borderColor, textColor, mutedColor, inputBg } = useScreenColors();
  const { scanningEnabled } = useScanningEnabled();
  const cartItemCount = getItemCount();
  const selectedCartItemByProductId = useMemo(() => {
    const map = new Map<string, string>();
    cartItems.forEach((item) => {
      map.set(item.productId, item.id);
    });
    return map;
  }, [cartItems]);
  const cartQuantityByProductId = useMemo(() => {
    const map = new Map<string, number>();
    cartItems.forEach((item) => {
      map.set(item.productId, (map.get(item.productId) || 0) + item.quantity);
    });
    return map;
  }, [cartItems]);
  const cartItemByProductId = useMemo(() => {
    const map = new Map<string, (typeof cartItems)[number]>();
    cartItems.forEach((item) => {
      map.set(item.productId, item);
    });
    return map;
  }, [cartItems]);

  const businessType = activeTenant?.businessType ?? 'printing_press';
  const isStudio = resolveBusinessType(businessType) === 'studio';
  const productQueriesEnabled =
    !!activeTenantId && !isStudio && hasFeature('products') && scopeReady;
  const studioCustomerQueryEnabled =
    !!activeTenantId && isStudio && hasFeature('crm') && scopeReady;

  const [searchQuery, setSearchQuery] = useState('');
  const [scannerVisible, setScannerVisible] = useState(false);
  const [scannedProduct, setScannedProduct] = useState<any>(null);
  const [quantityEditItem, setQuantityEditItem] = useState<(typeof cartItems)[number] | null>(null);
  const [variantPickerProduct, setVariantPickerProduct] = useState<ScanProduct | null>(null);
  const [jobForm, setJobForm] = useState({
    customerId: '',
    title: '',
    description: '',
    dueDate: '',
    priority: 'medium',
    assignedTo: '',
    items: [createDefaultJobItem()],
    ...JOB_CREATE_PAYMENT_DEFAULTS,
  });

  useEffect(() => {
    if (!params.customerId) return;
    setJobForm((prev) => ({
      ...prev,
      customerId: String(params.customerId),
    }));
  }, [params.customerId]);

  useEffect(() => {
    const subscription = DeviceEventEmitter.addListener(OPEN_SCAN_CAMERA_EVENT, () => {
      if (!isStudio && scanningEnabled) {
        setScannerVisible(true);
      }
    });
    return () => subscription.remove();
  }, [isStudio, scanningEnabled]);

  // Debounce search query for unified search (name or barcode)
  const debouncedSearch = useDebounce(searchQuery, 500);
  const barcodeSearchCandidates = useMemo(
    () => deriveBarcodeSearchCandidates(debouncedSearch),
    [debouncedSearch]
  );

  // Check if search query looks like a barcode (numeric or alphanumeric, typically longer)
  const isLikelyBarcode = barcodeSearchCandidates.some((candidate) => /^[A-Z0-9]{6,}$/i.test(candidate));

  // Fetch default product list (most frequent/popular products) when no search
  const { data: defaultProductsResponse, isLoading: loadingDefaultProducts } = useQuery({
    queryKey: ['products', 'default', activeTenantId, activeShopId, activeStudioLocationId],
    queryFn: () =>
      productService.getProducts({
        limit: 30,
        isActive: true,
      }),
    enabled: productQueriesEnabled && !debouncedSearch && !scannedProduct,
    staleTime: QUERY_STALE.LIST,
    gcTime: 60 * 60 * 1000, // 1 hour
  });

  const { data: productsResponse, isLoading: loadingProducts } = useQuery({
    queryKey: ['products', 'search', activeTenantId, activeShopId, activeStudioLocationId, debouncedSearch],
    queryFn: () =>
      productService.getProducts({
        search: debouncedSearch || undefined,
        limit: 20,
        isActive: true,
      }),
    enabled:
      productQueriesEnabled &&
      !!debouncedSearch &&
      debouncedSearch.length >= 2 &&
      !scannedProduct,
    staleTime: QUERY_STALE.LIST,
    gcTime: 60 * 60 * 1000, // 1 hour
  });

  const { data: barcodeResponse, isLoading: loadingBarcode, isError: barcodeError } = useQuery({
    queryKey: ['product', 'barcode', activeTenantId, activeShopId, activeStudioLocationId, barcodeSearchCandidates],
    queryFn: () => productService.getProductByBarcodeCandidates(barcodeSearchCandidates),
    enabled:
      productQueriesEnabled &&
      !!debouncedSearch &&
      debouncedSearch.length >= 2 &&
      !scannedProduct &&
      isLikelyBarcode &&
      barcodeSearchCandidates.length > 0,
    staleTime: 0,
    retry: false,
  });

  const { data: customersResponse } = useQuery({
    queryKey: ['customers', 'list', activeTenantId, activeShopId, activeStudioLocationId],
    queryFn: () => customerService.getCustomers({ limit: 50 }),
    enabled: studioCustomerQueryEnabled,
    // Customer list for dropdowns can be stale for 5 minutes
    staleTime: 5 * 60 * 1000,
    // Keep in cache for 2 hours
    gcTime: 2 * 60 * 60 * 1000,
  });

  const { data: membersResponse } = useQuery({
    queryKey: ['task-members', activeTenantId],
    queryFn: () => userWorkspaceService.getTaskMembers(),
    enabled: !!activeTenantId && isStudio,
    staleTime: 5 * 60 * 1000,
    gcTime: 2 * 60 * 60 * 1000,
  });

  const jobTotal = useMemo(
    () =>
      jobForm.items.reduce((sum, item) => {
        const quantity = Math.max(0, parseFloat(item.quantity) || 0);
        const unitPrice = Math.max(0, parseFloat(item.unitPrice) || 0);
        return sum + quantity * unitPrice;
      }, 0),
    [jobForm.items]
  );

  const jobQuantity = useMemo(
    () => jobForm.items.reduce((sum, item) => sum + Math.max(0, parseFloat(item.quantity) || 0), 0),
    [jobForm.items]
  );

  const createJobMutation = useMutation({
    mutationFn: (d: Parameters<typeof jobService.createJob>[0]) => jobService.createJob(d),
    onSuccess: async () => {
      await refreshAfterJobChange(queryClient);
      setJobForm({
        customerId: '',
        title: '',
        description: '',
        dueDate: '',
        priority: 'medium',
        assignedTo: '',
        items: [createDefaultJobItem()],
        ...JOB_CREATE_PAYMENT_DEFAULTS,
      });
      Alert.alert('Success', 'Job created successfully');
    },
    onError: (err: Error) => {
      Alert.alert('Error', err?.message ?? 'Failed to create job');
    },
  });


  const handleScan = useCallback((scannedData: string) => {
    const candidates = deriveBarcodeSearchCandidates(scannedData);
    console.info('[Scan] Barcode candidates', { raw: scannedData, candidates });

    // Check if scanned data is a product QR code (JSON) or a regular barcode
    if (isProductQRCode(scannedData)) {
      const result = parseProductQRPayload(scannedData);
      if (result.success && result.data) {
        // Use product data directly from QR code
        setScannedProduct(result.data);
        // Set search query to barcode if available, otherwise clear
        setSearchQuery(result.data.barcode || '');
      } else {
        // Fallback to barcode search if parsing fails
        setSearchQuery(scannedData);
        setScannedProduct(null);
      }
    } else {
      // Regular barcode - set in unified search
      setSearchQuery(scannedData);
      setScannedProduct(null);
    }
  }, []);

  const handleCreateJob = useCallback(() => {
    if (!jobForm.customerId) {
      Alert.alert('Error', 'Please select a customer');
      return;
    }
    if (!jobForm.title.trim()) {
      Alert.alert('Error', 'Please enter a title');
      return;
    }
    const items = jobForm.items.map((item) => ({
      category: item.category.trim(),
      description: item.description.trim() || item.category.trim(),
      quantity: Math.max(1, parseFloat(item.quantity) || 0),
      unitPrice: Math.max(0, parseFloat(item.unitPrice) || 0),
    }));
    if (items.some((item) => !item.category || item.quantity < 1 || item.unitPrice <= 0)) {
      Alert.alert('Error', 'Add at least one priced line item with category, quantity, and unit price');
      return;
    }
    const paymentError = validateJobCreatePayment(jobForm, jobTotal);
    if (paymentError) {
      Alert.alert('Payment', paymentError);
      return;
    }
    createJobMutation.mutate({
      customerId: jobForm.customerId,
      title: jobForm.title.trim(),
      description: jobForm.description.trim() || undefined,
      dueDate: jobForm.dueDate || undefined,
      status: 'new',
      priority: jobForm.priority,
      assignedTo: jobForm.assignedTo || undefined,
      jobType: items[0]?.category,
      quantity: Math.max(1, Math.round(jobQuantity || 1)),
      quotedPrice: jobTotal,
      finalPrice: jobTotal,
      items,
      ...buildJobCreatePaymentPayload(jobForm),
    });
  }, [jobForm, createJobMutation, jobQuantity, jobTotal]);

  const handleUpdateJobItem = useCallback(
    (index: number, field: keyof JobItemDraft, value: string) => {
      setJobForm((prev) => ({
        ...prev,
        items: prev.items.map((item, itemIndex) =>
          itemIndex === index ? { ...item, [field]: value } : item
        ),
      }));
    },
    []
  );

  const handleAddJobItem = useCallback(() => {
    setJobForm((prev) => ({ ...prev, items: [...prev.items, createDefaultJobItem()] }));
  }, []);

  const handleRemoveJobItem = useCallback((index: number) => {
    setJobForm((prev) => ({
      ...prev,
      items: prev.items.length === 1 ? prev.items : prev.items.filter((_, itemIndex) => itemIndex !== index),
    }));
  }, []);

  const handleProductSelect = useCallback(
    (selectedProduct: ScanProduct) => {
      if (selectedProduct.selectedVariant?.id) {
        if (isVariantOutOfStock(selectedProduct, selectedProduct.selectedVariant)) {
          Alert.alert('Out of stock', getOutOfStockMessage(selectedProduct.name));
          return;
        }
        const added = addItem({
          id: selectedProduct.id,
          name: selectedProduct.name,
          sellingPrice: selectedProduct.selectedVariant.sellingPrice
            ?? selectedProduct.sellingPrice
            ?? selectedProduct.price
            ?? selectedProduct.costPrice,
          price: selectedProduct.price,
          costPrice: selectedProduct.costPrice,
          imageUrl: selectedProduct.imageUrl,
          sku: selectedProduct.selectedVariant.sku || selectedProduct.sku,
          barcode: selectedProduct.selectedVariant.barcode || selectedProduct.barcode,
          trackStock: selectedProduct.selectedVariant.trackStock ?? selectedProduct.trackStock,
          quantityOnHand:
            selectedProduct.selectedVariant.quantityOnHand ?? selectedProduct.quantityOnHand,
          selectedVariant: selectedProduct.selectedVariant,
          hasVariants: selectedProduct.hasVariants,
          variants: selectedProduct.variants,
        });
        if (!added) {
          Alert.alert('Out of stock', getOutOfStockMessage(selectedProduct.name));
          return;
        }
        setSearchQuery('');
        setScannedProduct(null);
        return;
      }

      if (productRequiresVariantSelection(selectedProduct)) {
        setVariantPickerProduct(selectedProduct);
        return;
      }

      if (isProductOutOfStock(selectedProduct)) {
        Alert.alert('Out of stock', getOutOfStockMessage(selectedProduct.name));
        return;
      }
      const added = addItem({
        id: selectedProduct.id,
        name: selectedProduct.name,
        sellingPrice: selectedProduct.sellingPrice,
        price: selectedProduct.price,
        costPrice: selectedProduct.costPrice,
        imageUrl: selectedProduct.imageUrl,
        sku: selectedProduct.sku,
        barcode: selectedProduct.barcode,
        trackStock: selectedProduct.trackStock,
        quantityOnHand: selectedProduct.quantityOnHand,
        hasVariants: selectedProduct.hasVariants,
        variants: selectedProduct.variants,
      });
      if (!added) {
        Alert.alert('Out of stock', getOutOfStockMessage(selectedProduct.name));
        return;
      }
      setSearchQuery('');
      setScannedProduct(null);
    },
    [addItem]
  );

  const handleSelectVariantForCart = useCallback(
    (variant: ProductVariantStockInput) => {
      if (!variantPickerProduct) return;
      const added = addItem({
        id: variantPickerProduct.id,
        name: variantPickerProduct.name,
        sellingPrice: variant.sellingPrice
          ?? variantPickerProduct.sellingPrice
          ?? variantPickerProduct.price
          ?? variantPickerProduct.costPrice,
        imageUrl: variantPickerProduct.imageUrl,
        sku: variant.sku || variantPickerProduct.sku,
        barcode: variant.barcode || variantPickerProduct.barcode,
        trackStock: variant.trackStock ?? variantPickerProduct.trackStock,
        quantityOnHand: variant.quantityOnHand ?? variantPickerProduct.quantityOnHand,
        selectedVariant: variant,
        hasVariants: true,
        variants: variantPickerProduct.variants,
      });
      setVariantPickerProduct(null);
      if (!added) {
        Alert.alert('Out of stock', getOutOfStockMessage(variantPickerProduct.name));
        return;
      }
      setSearchQuery('');
      setScannedProduct(null);
    },
    [addItem, variantPickerProduct]
  );

  const handleAdjustProductQuantity = useCallback(
    (product: ScanProduct, delta: number) => {
      if (delta > 0 && productRequiresVariantSelection(product)) {
        handleProductSelect(product);
        return;
      }
      const cartItemId = selectedCartItemByProductId.get(product.id);
      if (!cartItemId) return;
      const currentQty = cartQuantityByProductId.get(product.id) || 0;
      updateQuantity(cartItemId, currentQty + delta);
    },
    [selectedCartItemByProductId, cartQuantityByProductId, updateQuantity, handleProductSelect]
  );

  const handleOpenQuantityEditor = useCallback(
    (product: {
      id: string;
      name: string;
      trackStock?: boolean;
      quantityOnHand?: number | null;
    }) => {
      const cartItem = cartItemByProductId.get(product.id);
      if (!cartItem) return;
      setQuantityEditItem({
        ...cartItem,
        trackStock: product.trackStock ?? cartItem.trackStock,
        quantityOnHand: product.quantityOnHand ?? cartItem.quantityOnHand,
      });
    },
    [cartItemByProductId]
  );

  const handleOpenProducts = useCallback(() => {
    router.push('/(tabs)/products');
  }, [router]);

  // Match web app pattern: response?.data || []
  const customers = (customersResponse?.data || []) as Array<{ id: string; name: string }>;
  const members = parseApiListResponse<{ id: string; name: string; email?: string }>(membersResponse);
  
  // Default products (when no search) - sorted by stock quantity (most stock = likely most popular)
  const defaultProducts = useMemo(() => {
    const products = parseApiListResponse<ScanProduct>(defaultProductsResponse);
    // Sort by stock quantity (descending), then by name (ascending). Made-to-order (trackStock false) treated as high stock.
    return [...products].sort((a, b) => {
      const stockA = a.trackStock === false ? Infinity : (a.quantityOnHand ?? 0);
      const stockB = b.trackStock === false ? Infinity : (b.quantityOnHand ?? 0);
      if (stockB !== stockA) {
        return stockB - stockA; // Higher stock first
      }
      return (a.name || '').localeCompare(b.name || ''); // Alphabetical if same stock
    });
  }, [defaultProductsResponse]);

  // Products from search
  const products = parseApiListResponse<ScanProduct>(productsResponse);

  // Single product from barcode search
  const barcodeProduct = parseApiEntity<ScanProduct>(barcodeResponse);
  const foundBarcodeProduct = !barcodeError && !!barcodeProduct;
  
  // Determine which products to show
  const productsToShow = debouncedSearch ? products : defaultProducts;
  const isLoadingProductsList = debouncedSearch ? loadingProducts : loadingDefaultProducts;

  if (isStudio && !hasFeature('jobAutomation')) {
    return (
      <FeatureAccessDenied message="Jobs are not enabled for this workspace." />
    );
  }

  if (!isStudio && !hasFeature('products')) {
    return (
      <FeatureAccessDenied message="Products are not enabled for this workspace." />
    );
  }

  if (isStudio) {
    return (
      <ScreenShell scrollable style={styles.container} contentContainerStyle={styles.content}>
        <Text style={[styles.title, { color: textColor }]}>New job</Text>
        <Text style={[styles.subtitle, { color: mutedColor }]}>Create a studio job with pricing and assignment</Text>

        <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
          <FormLabel>Customer</FormLabel>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.customerScroll}>
            {customers.map((c: { id: string; name: string }) => (
              <Pressable
                key={c.id}
                onPress={() => setJobForm((p) => ({ ...p, customerId: c.id }))}
                style={[
                  styles.customerChip,
                  { borderColor },
                  jobForm.customerId === c.id && { backgroundColor: colors.tint, borderColor: colors.tint },
                ]}
              >
                <Text
                  style={[
                    styles.customerChipText,
                    { color: jobForm.customerId === c.id ? '#fff' : textColor },
                  ]}
                  numberOfLines={1}
                >
                  {c.name}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
          {customers.length === 0 && (
            <Text style={[styles.hint, { color: mutedColor }]}>Add customers first in the Customers tab</Text>
          )}

          <FormLabel>Title</FormLabel>
          <FormInput
            placeholder="Job title"
            value={jobForm.title}
            onChangeText={(t) => setJobForm((p) => ({ ...p, title: t }))}
          />
          <FormLabel optional>Description</FormLabel>
          <FormInput
            placeholder="Notes or description"
            value={jobForm.description}
            onChangeText={(t) => setJobForm((p) => ({ ...p, description: t }))}
            multiline
          />
          <FormLabel optional>Due date</FormLabel>
          <FormInput
            placeholder="YYYY-MM-DD"
            value={jobForm.dueDate}
            onChangeText={(t) => setJobForm((p) => ({ ...p, dueDate: t }))}
          />
          <FormLabel>Priority</FormLabel>
          <View style={styles.chipRow}>
            {['low', 'medium', 'high', 'urgent'].map((priority) => (
              <Pressable
                key={priority}
                onPress={() => setJobForm((p) => ({ ...p, priority }))}
                style={[
                  styles.customerChip,
                  { borderColor },
                  jobForm.priority === priority && { backgroundColor: colors.tint, borderColor: colors.tint },
                ]}
              >
                <Text style={[styles.customerChipText, { color: jobForm.priority === priority ? '#fff' : textColor }]}>
                  {priority.replace('_', ' ')}
                </Text>
              </Pressable>
            ))}
          </View>

          <FormLabel optional>Assignee</FormLabel>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.customerScroll}>
            <Pressable
              onPress={() => setJobForm((p) => ({ ...p, assignedTo: '' }))}
              style={[
                styles.customerChip,
                { borderColor },
                !jobForm.assignedTo && { backgroundColor: colors.tint, borderColor: colors.tint },
              ]}
            >
              <Text style={[styles.customerChipText, { color: !jobForm.assignedTo ? '#fff' : textColor }]}>
                Unassigned
              </Text>
            </Pressable>
            {members.map((member) => (
              <Pressable
                key={member.id}
                onPress={() => setJobForm((p) => ({ ...p, assignedTo: member.id }))}
                style={[
                  styles.customerChip,
                  { borderColor },
                  jobForm.assignedTo === member.id && { backgroundColor: colors.tint, borderColor: colors.tint },
                ]}
              >
                <Text
                  style={[
                    styles.customerChipText,
                    { color: jobForm.assignedTo === member.id ? '#fff' : textColor },
                  ]}
                  numberOfLines={1}
                >
                  {member.name}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: textColor, marginBottom: 0 }]}>Line items</Text>
            <Pressable onPress={handleAddJobItem} style={[styles.secondaryBtn, { borderColor }]}>
              <AppIcon name="plus" size={14} color={colors.tint} />
              <Text style={[styles.secondaryBtnText, { color: colors.tint }]}>Add item</Text>
            </Pressable>
          </View>
          {jobForm.items.map((item, index) => {
            const lineTotal =
              Math.max(0, parseFloat(item.quantity) || 0) * Math.max(0, parseFloat(item.unitPrice) || 0);
            return (
              <View key={index} style={[styles.lineItemCard, { borderColor, backgroundColor: inputBg }]}>
                <View style={styles.lineItemHeader}>
                  <Text style={[styles.lineItemTitle, { color: textColor }]}>Item {index + 1}</Text>
                  {jobForm.items.length > 1 ? (
                    <Pressable onPress={() => handleRemoveJobItem(index)} style={styles.removeBtn}>
                      <AppIcon name="times" size={14} color="#ef4444" />
                    </Pressable>
                  ) : null}
                </View>
                <FormLabel>Category</FormLabel>
                <FormInput
                  placeholder="e.g., Banner, Flyer, Business cards"
                  value={item.category}
                  onChangeText={(t) => handleUpdateJobItem(index, 'category', t)}
                />
                <FormLabel optional>Description</FormLabel>
                <FormInput
                  placeholder="Size, specs, or service details"
                  value={item.description}
                  onChangeText={(t) => handleUpdateJobItem(index, 'description', t)}
                />
                <View style={styles.lineItemFieldsRow}>
                  <View style={styles.lineItemField}>
                    <FormLabel>Qty</FormLabel>
                    <FormInput
                      placeholder="1"
                      value={item.quantity}
                      onChangeText={(t) => handleUpdateJobItem(index, 'quantity', t)}
                      keyboardType="numeric"
                    />
                  </View>
                  <View style={styles.lineItemField}>
                    <FormLabel>Unit price</FormLabel>
                    <FormInput
                      placeholder="0.00"
                      value={item.unitPrice}
                      onChangeText={(t) => handleUpdateJobItem(index, 'unitPrice', t)}
                      keyboardType="decimal-pad"
                    />
                  </View>
                </View>
                <Text style={[styles.lineTotal, { color: textColor }]}>
                  Line total: {CURRENCY.SYMBOL} {lineTotal.toFixed(CURRENCY.DECIMAL_PLACES)}
                </Text>
              </View>
            );
          })}
          <View style={[styles.totalRow, { borderColor }]}>
            <Text style={[styles.totalLabel, { color: mutedColor }]}>Job total</Text>
            <Text style={[styles.totalValue, { color: colors.tint }]}>
              {CURRENCY.SYMBOL} {jobTotal.toFixed(CURRENCY.DECIMAL_PLACES)}
            </Text>
          </View>
          <FormLabel>Payment</FormLabel>
          <View style={styles.chipRow}>
            {JOB_CREATE_PAYMENT_STATUSES.map((option) => {
              const selected = jobForm.paymentStatus === option.value;
              return (
                <Pressable
                  key={option.value}
                  onPress={() => setJobForm((prev) => ({ ...prev, paymentStatus: option.value }))}
                  style={[
                    styles.customerChip,
                    { borderColor },
                    selected && { backgroundColor: colors.tint, borderColor: colors.tint },
                  ]}
                >
                  <Text style={[styles.customerChipText, { color: selected ? '#fff' : textColor }]}>
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {jobForm.paymentStatus !== 'unpaid' ? (
            <>
              {jobForm.paymentStatus === 'deposit' ? (
                <>
                  <FormLabel>Deposit amount</FormLabel>
                  <FormInput
                    value={jobForm.paymentAmount}
                    onChangeText={(text) => setJobForm((prev) => ({ ...prev, paymentAmount: text }))}
                    keyboardType="decimal-pad"
                    placeholder="0.00"
                  />
                </>
              ) : (
                <Text style={[styles.hint, { color: mutedColor }]}>
                  Amount: {CURRENCY.SYMBOL} {jobTotal.toFixed(CURRENCY.DECIMAL_PLACES)} (job total)
                </Text>
              )}
              <FormLabel>Payment method</FormLabel>
              <View style={styles.chipRow}>
                {JOB_CREATE_PAYMENT_METHODS.map((option) => {
                  const selected = jobForm.paymentMethod === option.value;
                  return (
                    <Pressable
                      key={option.value}
                      onPress={() => setJobForm((prev) => ({ ...prev, paymentMethod: option.value }))}
                      style={[
                        styles.customerChip,
                        { borderColor },
                        selected && { backgroundColor: colors.tint, borderColor: colors.tint },
                      ]}
                    >
                      <Text style={[styles.customerChipText, { color: selected ? '#fff' : textColor }]}>
                        {option.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <FormLabel optional>Reference</FormLabel>
              <FormInput
                value={jobForm.paymentReference}
                onChangeText={(text) => setJobForm((prev) => ({ ...prev, paymentReference: text }))}
                placeholder="Receipt or transfer reference"
              />
              <FormLabel optional>Notes</FormLabel>
              <FormInput
                value={jobForm.paymentNotes}
                onChangeText={(text) => setJobForm((prev) => ({ ...prev, paymentNotes: text }))}
                placeholder="Optional note for this payment"
                multiline
              />
            </>
          ) : null}
          <Pressable
            onPress={handleCreateJob}
            disabled={createJobMutation.isPending}
            style={[styles.primaryBtn, { backgroundColor: colors.tint }]}
          >
            {createJobMutation.isPending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryBtnText}>Create job</Text>
            )}
          </Pressable>
        </View>
      </ScreenShell>
    );
  }

  return (
    <>
      {/* Cart FAB */}
      {cartItemCount > 0 && (
        <Pressable
          onPress={() => router.push('/(tabs)/cart')}
          style={[styles.cartFAB, { backgroundColor: colors.tint }]}
        >
          <AppIcon name="shopping-cart" size={20} color="#fff" />
          {cartItemCount > 0 && (
            <View style={styles.cartBadge}>
              <Text style={styles.cartBadgeText}>{cartItemCount > 99 ? '99+' : cartItemCount}</Text>
            </View>
          )}
        </Pressable>
      )}

      <ScreenShell scrollable style={styles.container} contentContainerStyle={styles.content}>
        <Text style={[styles.title, { color: textColor }]}>Select Product</Text>
        <Text style={[styles.subtitle, { color: mutedColor }]}>
          Search, scan, or browse products to add them to cart
        </Text>

        {/* Unified Search Bar */}
        <View style={[styles.searchCard, { backgroundColor: cardBg, borderColor }]}>
          <View style={[styles.searchRow, { backgroundColor: inputBg }]}>
            <AppIcon name="search" size={18} color={mutedColor} style={styles.searchIcon} />
            <TextInput
              style={[styles.searchInput, { color: textColor }]}
              placeholder="Search by name or barcode..."
              placeholderTextColor={mutedColor}
              value={searchQuery}
              onChangeText={(text) => {
                setSearchQuery(text);
                setScannedProduct(null);
              }}
              onSubmitEditing={() => {
                // Search is handled automatically via debounced query
              }}
              returnKeyType="search"
              autoCapitalize="none"
              autoCorrect={false}
            />
            {searchQuery.length > 0 && (
              <Pressable
                onPress={() => {
                  setSearchQuery('');
                  setScannedProduct(null);
                }}
                style={styles.clearBtn}
              >
                <AppIcon name="times" size={16} color={mutedColor} />
              </Pressable>
            )}
            {scanningEnabled && (
              <Pressable
                onPress={() => setScannerVisible(true)}
                style={[styles.scanBtn, { backgroundColor: colors.tint }]}
              >
                <AppIcon name="camera" size={18} color="#fff" />
              </Pressable>
            )}
          </View>
        </View>

        {/* Loading state */}
        {(isLoadingProductsList || loadingBarcode) && (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.tint} />
            <Text style={[styles.loadingText, { color: mutedColor }]}>
              {debouncedSearch ? 'Searching products...' : 'Loading products...'}
            </Text>
          </View>
        )}

        {/* Show barcode product first if found (exact match) */}
        {!loadingBarcode && foundBarcodeProduct && (
          <View style={styles.productResult}>
            {(barcodeProduct as { imageUrl?: string }).imageUrl && (
              <Image
                source={{ uri: resolveImageUrl((barcodeProduct as { imageUrl?: string }).imageUrl) }}
                style={styles.productResultImage}
                contentFit="cover"
                transition={200}
              />
            )}
            <Text style={[styles.productName, { color: textColor }]}>
              {(barcodeProduct as { name?: string }).name ?? 'Product'}
            </Text>
            <Text style={[styles.productPrice, { color: colors.tint }]}>
              {CURRENCY.SYMBOL}{' '}
              {Number(
                (barcodeProduct as { sellingPrice?: number; price?: number }).sellingPrice ??
                  (barcodeProduct as { price?: number }).price ??
                  0
              ).toFixed(CURRENCY.DECIMAL_PLACES)}
            </Text>
            {(barcodeProduct as { barcode?: string }).barcode && (
              <Text style={[styles.productBarcode, { color: mutedColor }]}>
                Barcode: {(barcodeProduct as { barcode?: string }).barcode}
              </Text>
            )}
            <Pressable
              style={[
                styles.addBtn,
                {
                  backgroundColor: isProductOutOfStock(barcodeProduct) ? mutedColor : colors.tint,
                },
              ]}
              disabled={isProductOutOfStock(barcodeProduct)}
              onPress={() => handleProductSelect(barcodeProduct)}
            >
              <Text style={styles.addBtnText}>
                {isProductOutOfStock(barcodeProduct) ? 'Out of stock' : 'Add to cart'}
              </Text>
            </Pressable>
          </View>
        )}

        {/* Product list - default list or search results */}
        {!isLoadingProductsList &&
          !foundBarcodeProduct &&
          !scannedProduct &&
          productsToShow.length > 0 && (
            <View style={styles.productListContainer}>
              <Text style={[styles.sectionTitle, { color: textColor }]}>
                {debouncedSearch
                  ? `Found ${productsToShow.length} product${productsToShow.length !== 1 ? 's' : ''}`
                  : 'Frequently used products'}
              </Text>
              <FlatList
                data={productsToShow}
                numColumns={2}
                keyExtractor={(item) => item.id}
                scrollEnabled={false}
                columnWrapperStyle={styles.productRow}
                renderItem={({ item: p }) => {
                  const quantityInCart = cartQuantityByProductId.get(p.id) || 0;
                  const isSelected = quantityInCart > 0;
                  const isOutOfStock = isProductOutOfStock(p);

                  return (
                    <Pressable
                      onPress={() => {
                        if (isOutOfStock && !isSelected) {
                          Alert.alert('Out of stock', getOutOfStockMessage(p.name));
                          return;
                        }
                        handleProductSelect(p);
                      }}
                      disabled={isOutOfStock && !isSelected}
                      style={[
                        styles.productCard,
                        { backgroundColor: cardBg, borderColor },
                        isSelected && { borderColor: colors.tint, borderWidth: 2 },
                        isOutOfStock && !isSelected && styles.productCardDisabled,
                      ]}
                    >
                      {isSelected ? (
                        <View style={[styles.quantityBadge, { backgroundColor: colors.tint }]}>
                          <Text style={styles.quantityBadgeText}>{quantityInCart}</Text>
                        </View>
                      ) : null}
                      {/* Product Image */}
                      <View style={styles.productImageContainer}>
                        {p.imageUrl ? (
                          <Image
                            source={{ uri: resolveImageUrl(p.imageUrl) }}
                            style={styles.productImage}
                            contentFit="cover"
                            transition={200}
                            placeholder={require('@/assets/images/icon.png')}
                          />
                        ) : (
                          <View style={[styles.productImagePlaceholder, { backgroundColor: inputBg }]}>
                            <AppIcon name="archive" size={20} color={mutedColor} />
                          </View>
                        )}
                      </View>
                      <View style={styles.productInfo}>
                        <Text style={[styles.productName, { color: textColor }]} numberOfLines={2}>
                          {p.name}
                        </Text>
                        <Text style={[styles.productPrice, { color: colors.tint }]}>
                          {CURRENCY.SYMBOL}{' '}
                          {Number(p.sellingPrice ?? p.price ?? p.costPrice ?? 0).toFixed(CURRENCY.DECIMAL_PLACES)}
                        </Text>
                        {p.trackStock === false ? (
                          <Text style={[styles.productStock, { color: mutedColor }]}>
                            Made to order
                          </Text>
                        ) : isOutOfStock ? (
                          <Text style={[styles.productStock, { color: '#ef4444' }]}>Out of stock</Text>
                        ) : p.quantityOnHand !== undefined ? (
                          <Text style={[styles.productStock, { color: mutedColor }]}>
                            Stock: {p.quantityOnHand}
                          </Text>
                        ) : null}
                      </View>
                      {/* Add to cart / quantity controls */}
                      {isSelected ? (
                        <View style={styles.cartQuantityControls}>
                          <Pressable
                            onPress={(e) => {
                              e.stopPropagation();
                              handleAdjustProductQuantity(p, -1);
                            }}
                            style={[styles.cartQuantityBtn, { borderColor, backgroundColor: '#14532d' }]}
                            accessibilityLabel="Decrease quantity"
                          >
                            <AppIcon name="minus" size={16} color="#fff" />
                          </Pressable>
                          <Pressable
                            onPress={(e) => {
                              e.stopPropagation();
                              handleOpenQuantityEditor(p);
                            }}
                            style={styles.cartQuantityValueBtn}
                            accessibilityLabel={`Edit quantity for ${p.name}`}
                            accessibilityRole="button"
                          >
                            <Text style={[styles.cartQuantityValue, { color: textColor }]}>
                              {quantityInCart}
                            </Text>
                          </Pressable>
                          <Pressable
                            onPress={(e) => {
                              e.stopPropagation();
                              if (isOutOfStock) {
                                Alert.alert('Out of stock', getOutOfStockMessage(p.name));
                                return;
                              }
                              handleAdjustProductQuantity(p, 1);
                            }}
                            disabled={isOutOfStock}
                            style={[
                              styles.cartQuantityBtn,
                              {
                                borderColor: colors.tint,
                                backgroundColor: isOutOfStock ? mutedColor : colors.tint,
                              },
                            ]}
                            accessibilityLabel="Increase quantity"
                          >
                            <AppIcon name="plus" size={16} color="#fff" />
                          </Pressable>
                        </View>
                      ) : (
                        <Pressable
                          onPress={(e) => {
                            e.stopPropagation();
                            if (isOutOfStock) {
                              Alert.alert('Out of stock', getOutOfStockMessage(p.name));
                              return;
                            }
                            handleProductSelect(p);
                          }}
                          disabled={isOutOfStock}
                          style={[
                            styles.addToCartBtn,
                            { backgroundColor: isOutOfStock ? mutedColor : colors.tint },
                          ]}
                          accessibilityLabel="Add to cart"
                        >
                          <AppIcon name="plus" size={16} color="#fff" />
                        </Pressable>
                      )}
                    </Pressable>
                  );
                }}
              />
            </View>
          )}

        {/* No products found (only show when searching) */}
        {!isLoadingProductsList &&
          !loadingBarcode &&
          debouncedSearch &&
          productsToShow.length === 0 &&
          !scannedProduct &&
          !foundBarcodeProduct && (
            <ListEmptyState
              imageKey="SEARCH_NO_RESULTS"
              title="No products found"
              subtitle="Try a different search term or scan a barcode"
              titleColor={textColor}
              subtitleColor={mutedColor}
              style={styles.emptyState}
            />
          )}

        {/* Empty state when no products at all */}
        {!isLoadingProductsList &&
          !loadingBarcode &&
          !debouncedSearch &&
          productsToShow.length === 0 &&
          !scannedProduct &&
          !foundBarcodeProduct && (
            <ListEmptyState
              imageKey="PRODUCTS"
              title="No products available"
              subtitle="Add products to your catalog, then search or scan them here"
              titleColor={textColor}
              subtitleColor={mutedColor}
              style={styles.emptyState}
            >
              <EmptyStateActionButton
                label="Open Products"
                onPress={handleOpenProducts}
                backgroundColor={colors.tint}
              />
            </ListEmptyState>
          )}

        {/* Show scanned product from QR code */}
        {!loadingProducts && !loadingBarcode && scannedProduct && (
          <View style={styles.productResult}>
            {scannedProduct.imageUrl && (
              <Image
                source={{ uri: resolveImageUrl(scannedProduct.imageUrl) }}
                style={styles.productResultImage}
                contentFit="cover"
                transition={200}
              />
            )}
            <Text style={[styles.productName, { color: textColor }]}>
              {scannedProduct.name ?? 'Product'}
            </Text>
            <Text style={[styles.productPrice, { color: colors.tint }]}>
              {CURRENCY.SYMBOL}{' '}
              {Number(scannedProduct.sellingPrice ?? scannedProduct.costPrice ?? 0).toFixed(
                CURRENCY.DECIMAL_PLACES
              )}
            </Text>
            {scannedProduct.barcode && (
              <Text style={[styles.productBarcode, { color: mutedColor }]}>
                Barcode: {scannedProduct.barcode}
              </Text>
            )}
            <Pressable
              style={[
                styles.addBtn,
                {
                  backgroundColor: isProductOutOfStock(scannedProduct) ? mutedColor : colors.tint,
                },
              ]}
              disabled={isProductOutOfStock(scannedProduct)}
              onPress={() => handleProductSelect(scannedProduct)}
            >
              <Text style={styles.addBtnText}>
                {isProductOutOfStock(scannedProduct) ? 'Out of stock' : 'Add to cart'}
              </Text>
            </Pressable>
          </View>
        )}
      </ScreenShell>

      {scanningEnabled && (
        <BarcodeScanner
          visible={scannerVisible}
          onClose={() => setScannerVisible(false)}
          onScan={handleScan}
        />
      )}

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

      <ProductVariantPickerSheet
        visible={!!variantPickerProduct}
        product={variantPickerProduct}
        onClose={() => setVariantPickerProduct(null)}
        onSelect={handleSelectVariantForCart}
        cardBg={cardBg}
        borderColor={borderColor}
        textColor={textColor}
        mutedColor={mutedColor}
        inputBg={inputBg}
        tintColor={colors.tint}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 8 },
  subtitle: { fontSize: 15, marginBottom: 20 },
  card: {
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
  },
  searchCard: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  label: { fontSize: 14, fontWeight: '500', marginBottom: 8, marginTop: 16 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  textArea: { minHeight: 80, textAlignVertical: 'top' },
  customerScroll: { marginBottom: 8, maxHeight: 44 },
  customerChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    marginRight: 8,
  },
  customerChipText: { fontSize: 14, fontWeight: '500' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  hint: { fontSize: 13, marginTop: 4 },
  sectionHeader: {
    marginTop: 20,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  secondaryBtnText: { fontSize: 13, fontWeight: '600' },
  lineItemCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  lineItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  lineItemTitle: { fontSize: 15, fontWeight: '700' },
  removeBtn: { padding: 6 },
  lineItemFieldsRow: { flexDirection: 'row', gap: 12 },
  lineItemField: { flex: 1 },
  lineTotal: { marginTop: 10, fontSize: 14, fontWeight: '600', textAlign: 'right' },
  totalRow: {
    marginTop: 4,
    paddingTop: 14,
    borderTopWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  totalLabel: { fontSize: 15, fontWeight: '600' },
  totalValue: { fontSize: 18, fontWeight: '700' },
  primaryBtn: {
    marginTop: 24,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    paddingHorizontal: 10,
    minHeight: 44,
  },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, fontSize: 16, paddingVertical: 8 },
  clearBtn: { padding: 6, marginRight: 2 },
  scanBtn: {
    padding: 8,
    borderRadius: 8,
    marginLeft: 4,
  },
  loading: { padding: 24, alignItems: 'center' },
  loadingText: { marginTop: 12, fontSize: 14 },
  productListContainer: { marginTop: 20 },
  sectionTitle: { fontSize: 16, fontWeight: '600', marginBottom: 12 },
  productRow: {
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 12,
  },
  productCardDisabled: {
    opacity: 0.6,
  },
  productCard: {
    flex: 1,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    minWidth: 0, // Important for flex items to shrink properly
    maxWidth: '48%', // Ensure two items fit per row
    position: 'relative', // For absolute positioned button
  },
  selectedBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
    zIndex: 2,
  },
  quantityBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    minWidth: 28,
    height: 28,
    paddingHorizontal: 8,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
    zIndex: 2,
  },
  quantityBadgeText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  productImageContainer: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#f3f4f6',
    marginBottom: 8,
  },
  productImage: {
    width: '100%',
    height: '100%',
  },
  productImagePlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  productInfo: { alignItems: 'flex-start' },
  productName: { fontSize: 14, fontWeight: '600', marginBottom: 4 },
  productSku: { fontSize: 11, marginTop: 2 },
  productBarcode: { fontSize: 11, marginTop: 2 },
  productPrice: { fontSize: 16, fontWeight: '700', marginTop: 4 },
  productStock: { fontSize: 11, marginTop: 2 },
  addToCartBtn: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  cartQuantityControls: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    left: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  cartQuantityBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cartQuantityValueBtn: {
    minWidth: 44,
    minHeight: 44,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cartQuantityValue: {
    minWidth: 28,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '700',
  },
  productResult: {
    marginTop: 20,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    alignItems: 'center',
  },
  productResultImage: {
    width: 120,
    height: 120,
    borderRadius: 12,
    marginBottom: 12,
  },
  addBtn: {
    marginTop: 16,
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  addBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  emptyState: { alignItems: 'center', paddingVertical: 48, marginTop: 20 },
  emptyTitle: { fontSize: 18, fontWeight: '600', marginTop: 16 },
  emptySubtitle: { fontSize: 14, marginTop: 8, textAlign: 'center', paddingHorizontal: 24 },
  scanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
    borderRadius: 12,
    gap: 8,
  },
  scanButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  cartFAB: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    borderWidth: 2,
    borderColor: '#fff',
  },
  cartBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#ef4444',
    borderRadius: 12,
    minWidth: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    borderWidth: 2,
    borderColor: '#fff',
  },
  cartBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
});
