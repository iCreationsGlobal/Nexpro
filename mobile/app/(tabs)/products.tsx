import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { useLocalSearchParams } from 'expo-router';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  RefreshControl,
  ActivityIndicator,
  TextInput,
  Alert,
  Dimensions,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';

import { AppIcon } from '@/components/AppIcon';
import { FormSheetModal } from '@/components/FormSheetModal';
import { FORM_LABELS } from '@/constants/formLabels';
import { productService } from '@/services/productService';
import { useDebounce } from '@/hooks/useDebounce';
import { useAuth } from '@/context/AuthContext';
import { useWorkspaceScope } from '@/hooks/useWorkspaceScope';
import { FeatureAccessDenied } from '@/components/FeatureAccessDenied';
import { useScreenColors } from '@/hooks/useScreenColors';
import { ScreenShell } from '@/components/ScreenShell';
import { RestockProductSheet } from '@/components/RestockProductSheet';
import { SHOP_TYPES, resolveBusinessType } from '@/constants';
import { formatCurrency } from '@/utils/formatCurrency';
import { resolveDisplayImageUrl } from '@/utils/fileUtils';
import { useRouter } from 'expo-router';
import { useIsStoreSetupRoute } from '@/hooks/useIsStoreSetupRoute';

import { ListEmptyState, EmptyStateActionButton, ListActionButton } from '@/components/ListEmptyState';
import { SEARCH_PLACEHOLDERS } from '@/constants/searchPlaceholders';
import { useSmartSearch } from '@/context/SmartSearchContext';
import { useRegisterPageSearch } from '@/hooks/useRegisterPageSearch';
import { getApiErrorMessage, parseApiListResponse } from '@/utils/parseApiListResponse';
import { ListLoadingState, ListErrorState } from '@/components/ListScreenStates';
import { refreshAfterInventoryChange, QUERY_STALE } from '@/utils/queryInvalidation';

type Product = {
  id: string;
  name: string;
  sku?: string;
  barcode?: string;
  sellingPrice: number;
  costPrice?: number;
  quantityOnHand?: number;
  reorderLevel?: number;
  trackStock?: boolean;
  unit?: string;
  imageUrl?: string | null;
  shopId?: string | null;
  category?: { id: string; name: string };
  isActive?: boolean;
  hasVariants?: boolean;
  variants?: Array<{
    id: string;
    name: string;
    quantityOnHand?: number;
    isActive?: boolean;
  }>;
};

export default function ProductsScreen() {
  const params = useLocalSearchParams<{ search?: string; add?: string }>();
  const router = useRouter();
  const { colors, bg, cardBg, borderColor, textColor, mutedColor, inputBg } = useScreenColors();
  const queryClient = useQueryClient();
  const { activeTenant, activeTenantId, hasFeature } = useAuth();
  const { activeShopId, activeStudioLocationId, isShopWorkspace, scopeReady } = useWorkspaceScope();
  const resolvedType = resolveBusinessType(activeTenant?.businessType);
  const isShop = resolvedType === 'shop';
  const isPharmacy = resolvedType === 'pharmacy';
  const isRetailLike = isShop || isPharmacy;
  const inStoreSetup = useIsStoreSetupRoute();

  const { searchValue, setSearchValue } = useSmartSearch();
  useRegisterPageSearch({ scope: 'products', placeholder: SEARCH_PLACEHOLDERS.PRODUCTS });
  const [addModalVisible, setAddModalVisible] = useState(params.add === '1');
  const [formData, setFormData] = useState({
    name: '',
    sku: '',
    barcode: '',
    alternateBarcode: '',
    description: '',
    sellingPrice: '',
    costPrice: '',
    quantityOnHand: '',
    imageUrl: '',
    allergens: '',
    optionalFoods: '',
  });
  const [imagePreviewUri, setImagePreviewUri] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [productToRestock, setProductToRestock] = useState<Product | null>(null);

  useEffect(() => {
    if (params.search) setSearchValue(String(params.search));
    if (params.add === '1') setAddModalVisible(true);
  }, [params.search, params.add, setSearchValue]);

  const debouncedSearch = useDebounce(searchValue, 400);

  const { data: response, isLoading, refetch, isRefetching, error, isError } = useQuery({
    queryKey: ['products', activeTenantId, activeShopId, activeStudioLocationId, debouncedSearch],
    queryFn: () =>
      productService.getProducts({
        page: 1,
        limit: 20,
        search: debouncedSearch || undefined,
        isActive: true,
      }),
    enabled: !!activeTenantId && isRetailLike && hasFeature('products') && scopeReady && !inStoreSetup,
    staleTime: QUERY_STALE.LIST,
    gcTime: 2 * 60 * 60 * 1000,
  });

  const shopType = activeTenant?.metadata?.shopType;
  const isRestaurant = shopType === SHOP_TYPES.RESTAURANT;

  const resetAddForm = useCallback(() => {
    setFormData({
      name: '',
      sku: '',
      barcode: '',
      alternateBarcode: '',
      description: '',
      sellingPrice: '',
      costPrice: '',
      quantityOnHand: '',
      imageUrl: '',
      allergens: '',
      optionalFoods: '',
    });
    setImagePreviewUri(null);
    setUploadingImage(false);
  }, []);

  const createProductMutation = useMutation({
    mutationFn: (data: Parameters<typeof productService.createProduct>[0]) =>
      productService.createProduct(data),
    onSuccess: async () => {
      await refreshAfterInventoryChange(queryClient);
      setAddModalVisible(false);
      resetAddForm();
      Alert.alert('Success', 'Product created successfully');
    },
    onError: (error: unknown) => {
      Alert.alert('Error', getApiErrorMessage(error, 'Failed to create product'));
    },
  });

  const restockProductMutation = useMutation({
    mutationFn: ({
      productId,
      quantity,
      variantId,
    }: {
      productId: string;
      quantity: number;
      variantId?: string;
      variantName?: string;
    }) =>
      productService.adjustStock(productId, quantity, 'delta', 'Receive stock', {
        variantId,
        type: 'receive',
        shopId: productToRestock?.shopId || activeShopId || undefined,
      }),
    onSuccess: async (_, variables) => {
      await refreshAfterInventoryChange(queryClient);
      const baseName = productToRestock?.name || 'Product';
      const label = variables.variantName ? `${baseName} — ${variables.variantName}` : baseName;
      setProductToRestock(null);
      Alert.alert('Success', `Added ${variables.quantity} to ${label}`);
    },
    onError: (error: unknown) => {
      Alert.alert('Error', getApiErrorMessage(error, 'Failed to restock product'));
    },
  });

  const products = useMemo(() => {
    const list = parseApiListResponse<Product>(response);
    // Drop malformed rows so FlatList keyExtractor / render never throw.
    return list.filter((item): item is Product => Boolean(item && typeof item === 'object' && item.id));
  }, [response]);
  const loadErrorMessage = useMemo(
    () => getApiErrorMessage(error, 'Could not load products. Pull to refresh.'),
    [error]
  );
  const onRefresh = useCallback(() => refetch(), [refetch]);

  const handleProductPress = useCallback(
    (product: Product) => {
      router.push(`/product/${product.id}` as never);
    },
    [router]
  );

  const handleOpenRestock = useCallback((product: Product) => {
    setProductToRestock(product);
  }, []);

  const handleRestockSubmit = useCallback(
    (payload: { quantity: number; variantId?: string; variantName?: string }) => {
      if (!productToRestock?.id) return;
      restockProductMutation.mutate({
        productId: productToRestock.id,
        quantity: payload.quantity,
        variantId: payload.variantId,
        variantName: payload.variantName,
      });
    },
    [productToRestock?.id, restockProductMutation]
  );

  const uploadProductImageFromAsset = useCallback(async (asset: ImagePicker.ImagePickerAsset) => {
    setImagePreviewUri(asset.uri);
    setUploadingImage(true);
    try {
      const imageUrl = await productService.uploadProductImage(asset.uri, asset.mimeType ?? 'image/jpeg');
      setFormData((prev) => ({ ...prev, imageUrl }));
    } catch (err) {
      setImagePreviewUri(null);
      setFormData((prev) => ({ ...prev, imageUrl: '' }));
      Alert.alert('Upload failed', getApiErrorMessage(err, 'Could not upload product image.'));
    } finally {
      setUploadingImage(false);
    }
  }, []);

  const handleTakeProductPhoto = useCallback(async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Allow camera access to take a product photo.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.55,
      });
      if (result.canceled || !result.assets[0]?.uri) return;
      await uploadProductImageFromAsset(result.assets[0]);
    } catch (err) {
      Alert.alert('Camera failed', getApiErrorMessage(err, 'Could not take product photo.'));
    }
  }, [uploadProductImageFromAsset]);

  const handleChooseProductImage = useCallback(async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Allow photo library access to add a product image.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.55,
      });
      if (result.canceled || !result.assets[0]?.uri) return;
      await uploadProductImageFromAsset(result.assets[0]);
    } catch (err) {
      Alert.alert('Photo picker failed', getApiErrorMessage(err, 'Could not choose product image.'));
    }
  }, [uploadProductImageFromAsset]);

  const handlePickProductImage = useCallback(() => {
    Alert.alert('Product photo', 'Add a product photo using your camera or photo library.', [
      { text: 'Take photo', onPress: handleTakeProductPhoto },
      { text: 'Choose from library', onPress: handleChooseProductImage },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [handleChooseProductImage, handleTakeProductPhoto]);

  const handleRemoveProductImage = useCallback(() => {
    setImagePreviewUri(null);
    setFormData((prev) => ({ ...prev, imageUrl: '' }));
  }, []);

  const handleCreateProduct = useCallback(() => {
    if (uploadingImage) return;
    if (!formData.name.trim()) {
      Alert.alert('Error', 'Product name is required');
      return;
    }
    if (!formData.sellingPrice) {
      Alert.alert('Error', 'Selling price is required');
      return;
    }
    const primaryBarcode = formData.barcode.trim();
    const alternateBarcode = formData.alternateBarcode.trim();
    if (primaryBarcode && alternateBarcode && primaryBarcode === alternateBarcode) {
      Alert.alert('Error', 'Product code must be different from the primary barcode');
      return;
    }

    const metadata: Record<string, unknown> = {};
    if (isRestaurant) {
      if (formData.allergens.trim()) metadata.allergens = formData.allergens.trim();
      if (formData.optionalFoods.trim()) metadata.optionalFoods = formData.optionalFoods.trim();
    }

    createProductMutation.mutate({
      name: formData.name.trim(),
      sku: formData.sku.trim() || undefined,
      barcode: primaryBarcode || undefined,
      barcodeAliases: alternateBarcode ? [alternateBarcode] : undefined,
      description: formData.description.trim() || undefined,
      sellingPrice: parseFloat(formData.sellingPrice),
      costPrice: formData.costPrice ? parseFloat(formData.costPrice) : undefined,
      quantityOnHand: formData.quantityOnHand ? parseFloat(formData.quantityOnHand) : undefined,
      imageUrl: formData.imageUrl.trim() || undefined,
      unit: isRestaurant ? 'serving' : undefined,
      metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
    });
  }, [formData, createProductMutation, uploadingImage, isRestaurant]);

  // Must stay above early returns — auth/businessType can resolve after first paint.
  const addFormImageUri = useMemo(() => {
    if (imagePreviewUri) return imagePreviewUri;
    if (formData.imageUrl.trim()) return resolveDisplayImageUrl(formData.imageUrl) || null;
    return null;
  }, [imagePreviewUri, formData.imageUrl]);

  if (!hasFeature('products')) {
    return <FeatureAccessDenied message="Products are not enabled for this workspace." />;
  }

  if (!isRetailLike) {
    return (
      <View style={[styles.center, { backgroundColor: bg }]}>
        <Text style={[styles.emptyTitle, { color: textColor }]}>Products</Text>
        <Text style={[styles.emptySubtitle, { color: mutedColor }]}>
          Products are available for shop and pharmacy businesses.
        </Text>
      </View>
    );
  }

  const awaitingShop = isShopWorkspace && !scopeReady;

  const screenWidth = Dimensions.get('window').width;
  const cardWidth = (screenWidth - 16 * 2 - 12) / 2; // padding + gap between cards

  const renderProductItem = ({ item }: { item: Product }) => {
    const displayImageUrl = resolveDisplayImageUrl(item.imageUrl);
    const hasImage = Boolean(displayImageUrl);
    const quantityOnHand = Number(item.quantityOnHand ?? 0);
    const reorderLevel = Number(item.reorderLevel ?? 10);
    const shouldShowRestock =
      item.trackStock !== false &&
      Number.isFinite(quantityOnHand) &&
      quantityOnHand <= (Number.isFinite(reorderLevel) && reorderLevel > 0 ? reorderLevel : 10);

    return (
      <Pressable
        onPress={() => handleProductPress(item)}
        style={({ pressed }) => [
          styles.productCard,
          { width: cardWidth, backgroundColor: cardBg, borderColor },
          pressed && styles.pressed,
        ]}
      >
        {/* Image container - always visible */}
        <View style={styles.cardImageContainer}>
          {hasImage ? (
            <Image
              source={{ uri: displayImageUrl }}
              style={styles.cardImage}
              contentFit="cover"
            />
          ) : (
            <View style={[styles.cardImagePlaceholder, { backgroundColor: inputBg }]}>
              <AppIcon name="image" size={32} color={mutedColor} />
            </View>
          )}
          {item.trackStock === false ? (
            <View style={[styles.stockBadge, { backgroundColor: 'rgba(100,116,139,0.9)' }]}>
              <Text style={styles.stockBadgeText}>MTO</Text>
            </View>
          ) : item.quantityOnHand !== undefined && item.quantityOnHand !== null && (
            <View
              style={[
                styles.stockBadge,
                {
                  backgroundColor:
                    quantityOnHand === 0
                      ? 'rgba(239,68,68,0.9)'
                      : quantityOnHand < 10
                      ? 'rgba(245,158,11,0.9)'
                      : 'rgba(16,185,129,0.9)',
                },
              ]}
            >
              <Text style={styles.stockBadgeText}>{quantityOnHand}</Text>
            </View>
          )}
        </View>
        {/* Product info */}
        <View style={styles.cardContent}>
          <Text style={[styles.cardProductName, { color: textColor }]} numberOfLines={2}>
            {item.name || 'Unnamed Product'}
          </Text>
          {item.sku ? (
            <Text style={[styles.cardSku, { color: mutedColor }]} numberOfLines={1}>
              {item.sku}
            </Text>
          ) : null}
          <Text style={[styles.cardPrice, { color: colors.tint }]}>
            {formatCurrency(item.sellingPrice)}
          </Text>
          {shouldShowRestock ? (
            <Pressable
              onPress={() => handleOpenRestock(item)}
              style={[styles.restockPill, { borderColor: colors.tint }]}
            >
              <AppIcon name="download" size={14} color={colors.tint} />
              <Text style={[styles.restockPillText, { color: colors.tint }]}>Restock</Text>
            </Pressable>
          ) : null}
        </View>
      </Pressable>
    );
  };

  return (
    <ScreenShell style={styles.container}>
      {/* Add product — hide when empty (empty state has its own CTA) */}
      {!isLoading && !isError && products.length > 0 && (
        <ListActionButton
          label="Add Product"
          onPress={() => setAddModalVisible(true)}
          backgroundColor={colors.tint}
        />
      )}

      {awaitingShop ? (
        <ListLoadingState message="Loading shop..." />
      ) : isLoading && !response ? (
        <ListLoadingState message="Loading products..." />
      ) : isError ? (
        <ListErrorState title="Failed to load products" message={loadErrorMessage} onRetry={refetch} />
      ) : products.length === 0 ? (
        <ListEmptyState
          fill
          imageKey="PRODUCTS"
          title="Your catalog is empty"
          subtitle="Add products to start selling"
          titleColor={textColor}
          subtitleColor={mutedColor}
        >
          <EmptyStateActionButton
            label="Add Product"
            onPress={() => setAddModalVisible(true)}
            backgroundColor={colors.tint}
          />
        </ListEmptyState>
      ) : (
        <FlatList
          data={products}
          keyExtractor={(item) => item.id}
          renderItem={renderProductItem}
          numColumns={2}
          columnWrapperStyle={styles.row}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={onRefresh} tintColor={colors.tint} />
          }
        />
      )}

      <FormSheetModal
        visible={addModalVisible}
        title={FORM_LABELS.product.addTitle}
        onClose={() => {
          setAddModalVisible(false);
          resetAddForm();
        }}
        cardBg={cardBg}
        borderColor={borderColor}
        textColor={textColor}
        mutedColor={mutedColor}
        footer={
          <Pressable
            onPress={handleCreateProduct}
            disabled={createProductMutation.isPending || uploadingImage}
            style={[
              styles.submitButton,
              { backgroundColor: colors.tint },
              (createProductMutation.isPending || uploadingImage) && styles.submitButtonDisabled,
            ]}
          >
            {createProductMutation.isPending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.submitButtonText}>{FORM_LABELS.product.create}</Text>
            )}
          </Pressable>
        }
      >
                <View style={styles.formGroup}>
                  <Text style={[styles.formLabel, { color: textColor }]}>{FORM_LABELS.product.image}</Text>
                  <Pressable
                    onPress={handlePickProductImage}
                    disabled={uploadingImage}
                    style={[
                      styles.imagePicker,
                      { borderColor, backgroundColor: inputBg },
                    ]}
                  >
                    {addFormImageUri ? (
                      <Image source={{ uri: addFormImageUri }} style={styles.imagePickerPreview} contentFit="cover" />
                    ) : (
                      <View style={styles.imagePickerPlaceholder}>
                        <AppIcon name="image" size={28} color={mutedColor} />
                        <Text style={[styles.imagePickerText, { color: mutedColor }]}>Tap to add photo</Text>
                      </View>
                    )}
                    {uploadingImage ? (
                      <View style={styles.imagePickerOverlay}>
                        <ActivityIndicator color="#fff" />
                      </View>
                    ) : null}
                  </Pressable>
                  {addFormImageUri && !uploadingImage ? (
                    <Pressable onPress={handleRemoveProductImage} style={styles.removeImageBtn}>
                      <Text style={styles.removeImageText}>Remove image</Text>
                    </Pressable>
                  ) : null}
                </View>
                <View style={styles.formGroup}>
                  <Text style={[styles.formLabel, { color: textColor }]}>{FORM_LABELS.product.name}</Text>
                  <TextInput
                    style={[styles.formInput, { color: textColor, borderColor, backgroundColor: inputBg }]}
                    placeholder="Product name"
                    placeholderTextColor={mutedColor}
                    value={formData.name}
                    onChangeText={(text) => setFormData({ ...formData, name: text })}
                  />
                </View>
                <View style={styles.formGroup}>
                  <Text style={[styles.formLabel, { color: textColor }]}>{FORM_LABELS.product.sku}</Text>
                  <TextInput
                    style={[styles.formInput, { color: textColor, borderColor, backgroundColor: inputBg }]}
                    placeholder="SKU"
                    placeholderTextColor={mutedColor}
                    value={formData.sku}
                    onChangeText={(text) => setFormData({ ...formData, sku: text })}
                  />
                </View>
                <View style={styles.formGroup}>
                  <Text style={[styles.formLabel, { color: textColor }]}>{FORM_LABELS.product.barcode}</Text>
                  <TextInput
                    style={[styles.formInput, { color: textColor, borderColor, backgroundColor: inputBg }]}
                    placeholder="Barcode"
                    placeholderTextColor={mutedColor}
                    value={formData.barcode}
                    onChangeText={(text) => setFormData({ ...formData, barcode: text })}
                  />
                </View>
                <View style={styles.formGroup}>
                  <Text style={[styles.formLabel, { color: textColor }]}>{FORM_LABELS.product.alternateBarcode}</Text>
                  <TextInput
                    style={[styles.formInput, { color: textColor, borderColor, backgroundColor: inputBg }]}
                    placeholder="Product code"
                    placeholderTextColor={mutedColor}
                    value={formData.alternateBarcode}
                    onChangeText={(text) => setFormData({ ...formData, alternateBarcode: text })}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>
                {isRestaurant && (
                  <>
                    <View style={styles.formGroup}>
                      <Text style={[styles.formLabel, { color: textColor }]}>Description (optional)</Text>
                      <TextInput
                        style={[styles.formInput, styles.formTextArea, { color: textColor, borderColor, backgroundColor: inputBg }]}
                        placeholder="e.g. Delicious West African jollof rice"
                        placeholderTextColor={mutedColor}
                        value={formData.description}
                        onChangeText={(text) => setFormData({ ...formData, description: text })}
                        multiline
                      />
                    </View>
                    <View style={styles.formGroup}>
                      <Text style={[styles.formLabel, { color: textColor }]}>Allergens (optional)</Text>
                      <TextInput
                        style={[styles.formInput, { color: textColor, borderColor, backgroundColor: inputBg }]}
                        placeholder="e.g. milk, peanuts"
                        placeholderTextColor={mutedColor}
                        value={formData.allergens}
                        onChangeText={(text) => setFormData({ ...formData, allergens: text })}
                      />
                    </View>
                    <View style={styles.formGroup}>
                      <Text style={[styles.formLabel, { color: textColor }]}>Add-ons (optional)</Text>
                      <TextInput
                        style={[styles.formInput, { color: textColor, borderColor, backgroundColor: inputBg }]}
                        placeholder="e.g. extra chicken, plantain"
                        placeholderTextColor={mutedColor}
                        value={formData.optionalFoods}
                        onChangeText={(text) => setFormData({ ...formData, optionalFoods: text })}
                      />
                    </View>
                  </>
                )}
                <View style={styles.formGroup}>
                  <Text style={[styles.formLabel, { color: textColor }]}>
                    {isRestaurant ? 'Cost price (optional)' : FORM_LABELS.product.costPrice}
                  </Text>
                  <TextInput
                    style={[styles.formInput, { color: textColor, borderColor, backgroundColor: inputBg }]}
                    placeholder="0.00"
                    placeholderTextColor={mutedColor}
                    value={formData.costPrice}
                    onChangeText={(text) => setFormData({ ...formData, costPrice: text })}
                    keyboardType="decimal-pad"
                  />
                </View>
                <View style={styles.formGroup}>
                  <Text style={[styles.formLabel, { color: textColor }]}>{FORM_LABELS.product.sellingPrice}</Text>
                  <TextInput
                    style={[styles.formInput, { color: textColor, borderColor, backgroundColor: inputBg }]}
                    placeholder="0.00"
                    placeholderTextColor={mutedColor}
                    value={formData.sellingPrice}
                    onChangeText={(text) => setFormData({ ...formData, sellingPrice: text })}
                    keyboardType="decimal-pad"
                  />
                </View>
                <View style={styles.formGroup}>
                  <Text style={[styles.formLabel, { color: textColor }]}>{FORM_LABELS.product.quantityOnHand}</Text>
                  <TextInput
                    style={[styles.formInput, { color: textColor, borderColor, backgroundColor: inputBg }]}
                    placeholder="0"
                    placeholderTextColor={mutedColor}
                    value={formData.quantityOnHand}
                    onChangeText={(text) => setFormData({ ...formData, quantityOnHand: text })}
                    keyboardType="number-pad"
                  />
                </View>
      </FormSheetModal>
      <RestockProductSheet
        visible={!!productToRestock}
        product={productToRestock}
        onClose={() => {
          if (!restockProductMutation.isPending) setProductToRestock(null);
        }}
        onSubmit={handleRestockSubmit}
        isSubmitting={restockProductMutation.isPending}
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
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  loadingText: { marginTop: 12, fontSize: 14 },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, fontSize: 16 },
  listContent: { padding: 16, paddingBottom: 32 },
  row: { justifyContent: 'space-between', marginBottom: 12 },
  productCard: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  cardImageContainer: {
    width: '100%',
    aspectRatio: 1,
    position: 'relative',
    backgroundColor: '#f3f4f6',
    minHeight: 120,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    overflow: 'hidden',
  },
  cardImage: {
    width: '100%',
    height: '100%',
    backgroundColor: '#f3f4f6',
  },
  cardImagePlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f3f4f6',
    minHeight: 120,
  },
  cardContent: {
    padding: 12,
  },
  cardProductName: { fontSize: 14, fontWeight: '600', marginBottom: 2 },
  cardSku: { fontSize: 11, marginBottom: 4 },
  cardPrice: { fontSize: 15, fontWeight: '700' },
  restockPill: {
    marginTop: 10,
    minHeight: 34,
    borderWidth: 1,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  restockPillText: { fontSize: 12, fontWeight: '700' },
  stockBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  stockBadgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  pressed: { opacity: 0.8 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 32, paddingHorizontal: 24 },
  emptyImage: { width: 280, height: 220, maxWidth: '100%' },
  emptyTitle: { fontSize: 18, fontWeight: '600', marginTop: 16, textAlign: 'center' },
  emptySubtitle: { fontSize: 14, marginTop: 8, textAlign: 'center' },
  retryButton: {
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalSheetWrap: {
    width: '100%',
    maxHeight: '85%',
  },
  modalContent: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    width: '100%',
    overflow: 'hidden',
  },
  modalScroll: {},
  modalFormContent: {
    padding: 20,
    paddingBottom: 32,
  },
  modalContentInner: {
    flex: 1,
    flexDirection: 'column',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
  },
  modalTitle: { fontSize: 18, fontWeight: '700' },
  modalBody: { maxHeight: Dimensions.get('window').height * 0.62 },
  modalBodyContent: { padding: 20 },
  modalFooter: {
    flexDirection: 'row',
    gap: 12,
    padding: 20,
    paddingTop: 16,
    borderTopWidth: 1,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  actionButtonTextPrimary: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  detailImage: { width: '100%', height: 200, borderRadius: 12, marginBottom: 20 },
  detailRow: { marginBottom: 16 },
  detailLabel: { fontSize: 12, marginBottom: 4 },
  detailValue: { fontSize: 16, fontWeight: '500' },
  formGroup: { marginBottom: 16 },
  imagePicker: {
    borderWidth: 1,
    borderRadius: 12,
    height: 160,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  imagePickerPreview: { width: '100%', height: '100%' },
  imagePickerPlaceholder: { alignItems: 'center', gap: 8 },
  imagePickerText: { fontSize: 14, fontWeight: '500' },
  imagePickerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeImageBtn: { marginTop: 10, alignSelf: 'flex-start' },
  removeImageText: { color: '#dc2626', fontSize: 14, fontWeight: '600' },
  formLabel: { fontSize: 14, fontWeight: '600', marginBottom: 8 },
  formInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  formTextArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  submitButton: {
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  submitButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  submitButtonDisabled: { opacity: 0.6 },
  editFooterRow: { flexDirection: 'row', gap: 10 },
  editFooterBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
  },
  editDeleteBtn: { backgroundColor: 'transparent' },
});
