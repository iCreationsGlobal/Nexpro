import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';

import { AppIcon } from '@/components/AppIcon';
import { FormSheetModal } from '@/components/FormSheetModal';
import { ProductVariantPickerSheet } from '@/components/ProductVariantPickerSheet';
import { RestockProductSheet } from '@/components/RestockProductSheet';
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
import { FORM_LABELS } from '@/constants/formLabels';
import { useAuth } from '@/context/AuthContext';
import { useCart } from '@/context/CartContext';
import { useWorkspaceScope } from '@/hooks/useWorkspaceScope';
import { productService } from '@/services/productService';
import { resolveDisplayImageUrl } from '@/utils/fileUtils';
import { formatCurrency } from '@/utils/formatCurrency';
import { getApiErrorMessage, parseApiEntity } from '@/utils/parseApiListResponse';
import { refreshAfterInventoryChange } from '@/utils/queryInvalidation';
import {
  getOutOfStockMessage,
  getProductStockQuantity,
  getVariantLabel,
  isProductOutOfStock,
  isVariantOutOfStock,
  productRequiresVariantSelection,
  type ProductVariantStockInput,
} from '@/utils/productStock';

type ProductVariant = {
  id: string;
  name: string;
  sku?: string;
  barcode?: string;
  sellingPrice?: number;
  costPrice?: number;
  quantityOnHand?: number;
  trackStock?: boolean | null;
  attributes?: {
    size?: string;
    color?: string;
    model?: string;
  };
};

type ProductDetail = {
  id: string;
  name: string;
  sku?: string;
  barcode?: string;
  barcodes?: Array<{ id?: string; barcode?: string; isActive?: boolean }>;
  sellingPrice: number;
  costPrice?: number;
  quantityOnHand?: number;
  unit?: string;
  trackStock?: boolean;
  imageUrl?: string | null;
  category?: { id: string; name: string };
  isActive?: boolean;
  hasVariants?: boolean;
  variants?: ProductVariant[];
};

const getAlternateBarcode = (product?: ProductDetail | null) => {
  if (!product?.barcodes?.length) return '';
  const primaryBarcode = product.barcode?.trim();
  return (
    product.barcodes.find((item) => {
      const barcode = item.barcode?.trim();
      return barcode && item.isActive !== false && barcode !== primaryBarcode;
    })?.barcode?.trim() || ''
  );
};

export default function ProductDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { addItem } = useCart();
  const { isManager, tenantRole } = useAuth();
  const { activeShopId } = useWorkspaceScope();
  const canDeleteProduct = isManager || tenantRole === 'staff';
  const { colors, bg, cardBg, borderColor, textColor, mutedColor } = useEntityDetailTheme();
  const inputBg = bg === '#f9fafb' ? '#f9fafb' : '#18181b';

  const [editOpen, setEditOpen] = useState(false);
  const [restockOpen, setRestockOpen] = useState(false);
  const [restockVariantId, setRestockVariantId] = useState<string | null>(null);
  const [variantDetailOpen, setVariantDetailOpen] = useState(false);
  const [variantEditOpen, setVariantEditOpen] = useState(false);
  const [variantPickerOpen, setVariantPickerOpen] = useState(false);
  const [isCreatingVariant, setIsCreatingVariant] = useState(false);
  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | null>(null);
  const [variantEditForm, setVariantEditForm] = useState({
    size: '',
    color: '',
    model: '',
    sku: '',
    barcode: '',
    sellingPrice: '',
    costPrice: '',
    quantityOnHand: '',
  });
  const [editForm, setEditForm] = useState({
    name: '',
    sku: '',
    barcode: '',
    alternateBarcode: '',
    sellingPrice: '',
    costPrice: '',
    quantityOnHand: '',
  });

  const { data, isLoading } = useQuery({
    queryKey: ['product', id],
    queryFn: () => productService.getProductById(String(id)),
    enabled: !!id,
  });

  const product = useMemo(() => parseApiEntity<ProductDetail>(data), [data]);
  const variants = useMemo(() => product?.variants ?? [], [product?.variants]);
  const totalStock = useMemo(() => getProductStockQuantity(product), [product]);

  const buildEmptyVariantForm = useCallback(
    () => ({
      size: '',
      color: '',
      model: '',
      sku: '',
      barcode: '',
      sellingPrice: product?.sellingPrice?.toString() || '',
      costPrice: product?.costPrice?.toString() || '',
      quantityOnHand: '0',
    }),
    [product?.costPrice, product?.sellingPrice]
  );

  const openVariantDetail = useCallback((variant: ProductVariant) => {
    setSelectedVariant(variant);
    setVariantDetailOpen(true);
  }, []);

  const closeVariantDetail = useCallback(() => {
    setVariantDetailOpen(false);
    setSelectedVariant(null);
  }, []);

  const openVariantCreate = useCallback(() => {
    setIsCreatingVariant(true);
    setSelectedVariant(null);
    setVariantEditForm(buildEmptyVariantForm());
    setVariantDetailOpen(false);
    setVariantEditOpen(true);
  }, [buildEmptyVariantForm]);

  const openVariantEdit = useCallback((variant: ProductVariant) => {
    setIsCreatingVariant(false);
    setSelectedVariant(variant);
    setVariantEditForm({
      size: variant.attributes?.size || '',
      color: variant.attributes?.color || '',
      model: variant.attributes?.model || '',
      sku: variant.sku || '',
      barcode: variant.barcode || '',
      sellingPrice: variant.sellingPrice?.toString() || product?.sellingPrice?.toString() || '',
      costPrice: variant.costPrice?.toString() || '',
      quantityOnHand: variant.quantityOnHand?.toString() || '0',
    });
    setVariantDetailOpen(false);
    setVariantEditOpen(true);
  }, [product?.sellingPrice]);

  const closeVariantEdit = useCallback(() => {
    setVariantEditOpen(false);
    setIsCreatingVariant(false);
    setSelectedVariant(null);
  }, []);

  const openEdit = useCallback(() => {
    if (!product) return;
    setEditForm({
      name: product.name || '',
      sku: product.sku || '',
      barcode: product.barcode || '',
      alternateBarcode: getAlternateBarcode(product),
      sellingPrice: product.sellingPrice?.toString() || '',
      costPrice: product.costPrice?.toString() || '',
      quantityOnHand: product.quantityOnHand?.toString() || '',
    });
    setEditOpen(true);
  }, [product]);

  const buildVariantPayload = useCallback(() => {
    const variantName =
      variantEditForm.model.trim() ||
      variantEditForm.size.trim() ||
      variantEditForm.color.trim() ||
      selectedVariant?.name ||
      '';
    const attributes: Record<string, string> = {};
    if (variantEditForm.size.trim()) attributes.size = variantEditForm.size.trim();
    if (variantEditForm.color.trim()) attributes.color = variantEditForm.color.trim();
    if (variantEditForm.model.trim()) attributes.model = variantEditForm.model.trim();
    return {
      name: variantName,
      sku: variantEditForm.sku.trim() || undefined,
      barcode: variantEditForm.barcode.trim() || undefined,
      sellingPrice: variantEditForm.sellingPrice.trim()
        ? parseFloat(variantEditForm.sellingPrice)
        : undefined,
      costPrice: variantEditForm.costPrice.trim()
        ? parseFloat(variantEditForm.costPrice)
        : undefined,
      quantityOnHand: variantEditForm.quantityOnHand
        ? parseFloat(variantEditForm.quantityOnHand)
        : 0,
      attributes,
    };
  }, [selectedVariant?.name, variantEditForm]);

  const updateMutation = useMutation({
    mutationFn: () =>
      productService.updateProduct(String(id), {
        name: editForm.name.trim(),
        sku: editForm.sku.trim() || undefined,
        barcode: editForm.barcode.trim() || undefined,
        barcodeAliases: editForm.alternateBarcode.trim() ? [editForm.alternateBarcode.trim()] : [],
        sellingPrice: parseFloat(editForm.sellingPrice),
        costPrice: editForm.costPrice ? parseFloat(editForm.costPrice) : undefined,
        quantityOnHand: editForm.quantityOnHand ? parseFloat(editForm.quantityOnHand) : undefined,
      }),
    onSuccess: async () => {
      await refreshAfterInventoryChange(queryClient);
      setEditOpen(false);
      Alert.alert('Success', 'Product updated successfully');
    },
    onError: (err: unknown) => {
      Alert.alert('Error', getApiErrorMessage(err, 'Failed to update product'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => productService.deleteProduct(String(id)),
    onSuccess: async () => {
      await refreshAfterInventoryChange(queryClient);
      router.back();
      Alert.alert('Success', 'Product deleted successfully');
    },
    onError: (err: unknown) => {
      Alert.alert('Error', getApiErrorMessage(err, 'Failed to delete product'));
    },
  });

  const createVariantMutation = useMutation({
    mutationFn: () => {
      const payload = buildVariantPayload();
      if (!payload.name) throw new Error('Variant name is required');
      return productService.createProductVariant(String(id), payload);
    },
    onSuccess: async () => {
      await refreshAfterInventoryChange(queryClient);
      await queryClient.invalidateQueries({ queryKey: ['product', id] });
      closeVariantEdit();
      Alert.alert('Success', 'Variant added successfully');
    },
    onError: (err: unknown) => {
      Alert.alert('Error', getApiErrorMessage(err, 'Failed to add variant'));
    },
  });

  const updateVariantMutation = useMutation({
    mutationFn: () => {
      if (!selectedVariant) throw new Error('No variant selected');
      const payload = buildVariantPayload();
      if (!payload.name) throw new Error('Variant name is required');
      return productService.updateProductVariant(selectedVariant.id, payload);
    },
    onSuccess: async () => {
      await refreshAfterInventoryChange(queryClient);
      await queryClient.invalidateQueries({ queryKey: ['product', id] });
      closeVariantEdit();
      Alert.alert('Success', 'Variant updated successfully');
    },
    onError: (err: unknown) => {
      Alert.alert('Error', getApiErrorMessage(err, 'Failed to update variant'));
    },
  });

  const deleteVariantMutation = useMutation({
    mutationFn: () => {
      if (!selectedVariant) throw new Error('No variant selected');
      return productService.deleteProductVariant(selectedVariant.id);
    },
    onSuccess: async () => {
      await refreshAfterInventoryChange(queryClient);
      await queryClient.invalidateQueries({ queryKey: ['product', id] });
      closeVariantDetail();
      closeVariantEdit();
      Alert.alert('Success', 'Variant deleted successfully');
    },
    onError: (err: unknown) => {
      Alert.alert('Error', getApiErrorMessage(err, 'Failed to delete variant'));
    },
  });

  const restockMutation = useMutation({
    mutationFn: ({
      quantity,
      variantId,
    }: {
      quantity: number;
      variantId?: string;
      variantName?: string;
    }) =>
      productService.adjustStock(String(id), quantity, 'delta', 'Receive stock', {
        variantId,
        type: 'receive',
        shopId: (product as { shopId?: string } | undefined)?.shopId || activeShopId || undefined,
      }),
    onSuccess: async (_, variables) => {
      await refreshAfterInventoryChange(queryClient);
      await queryClient.invalidateQueries({ queryKey: ['product', id] });
      setRestockOpen(false);
      setRestockVariantId(null);
      const label = variables.variantName
        ? `${product?.name || 'product'} — ${variables.variantName}`
        : product?.name || 'product';
      Alert.alert('Success', `Added ${variables.quantity} to ${label}`);
    },
    onError: (err: unknown) => {
      Alert.alert('Error', getApiErrorMessage(err, 'Failed to restock product'));
    },
  });

  const addProductToCart = useCallback(
    (variant?: ProductVariantStockInput | null) => {
      if (!product) return;
      if (variant?.id) {
        if (isVariantOutOfStock(product, variant)) {
          Alert.alert('Out of stock', getOutOfStockMessage(`${product.name} — ${getVariantLabel(variant)}`));
          return;
        }
        const added = addItem({
          id: product.id,
          name: product.name,
          sellingPrice: variant.sellingPrice ?? product.sellingPrice,
          imageUrl: product.imageUrl ?? undefined,
          sku: variant.sku || product.sku,
          barcode: variant.barcode || product.barcode,
          productCode: getAlternateBarcode(product) || undefined,
          trackStock: variant.trackStock ?? product.trackStock,
          quantityOnHand: variant.quantityOnHand ?? product.quantityOnHand,
          selectedVariant: variant,
        });
        if (!added) {
          Alert.alert('Out of stock', getOutOfStockMessage(`${product.name} — ${getVariantLabel(variant)}`));
          return;
        }
        Alert.alert('Success', `${product.name} — ${getVariantLabel(variant)} added to cart`);
        return;
      }

      if (isProductOutOfStock(product)) {
        Alert.alert('Out of stock', getOutOfStockMessage(product.name));
        return;
      }
      const added = addItem({
        id: product.id,
        name: product.name,
        sellingPrice: product.sellingPrice,
        imageUrl: product.imageUrl ?? undefined,
        sku: product.sku ?? undefined,
        barcode: product.barcode ?? undefined,
        productCode: getAlternateBarcode(product) || undefined,
        trackStock: product.trackStock,
        quantityOnHand: product.quantityOnHand,
        hasVariants: product.hasVariants,
        variants,
      });
      if (!added) {
        Alert.alert('Out of stock', getOutOfStockMessage(product.name));
        return;
      }
      Alert.alert('Success', `${product.name} added to cart`);
    },
    [addItem, product, variants]
  );

  const handleAddToCart = useCallback(() => {
    if (!product) return;
    if (productRequiresVariantSelection(product)) {
      setVariantPickerOpen(true);
      return;
    }
    addProductToCart(null);
  }, [addProductToCart, product]);

  const handleOpenRestock = useCallback((variantId?: string | null) => {
    if (!product || product.trackStock === false) return;
    setRestockVariantId(variantId || null);
    setRestockOpen(true);
  }, [product]);

  const handleSave = useCallback(() => {
    if (!editForm.name.trim()) {
      Alert.alert('Error', 'Product name is required');
      return;
    }
    if (!editForm.sellingPrice) {
      Alert.alert('Error', 'Selling price is required');
      return;
    }
    const primaryBarcode = editForm.barcode.trim();
    const alternateBarcode = editForm.alternateBarcode.trim();
    if (primaryBarcode && alternateBarcode && primaryBarcode === alternateBarcode) {
      Alert.alert('Error', 'Product code must be different from the primary barcode');
      return;
    }
    updateMutation.mutate();
  }, [editForm, updateMutation]);

  const handleDelete = useCallback(() => {
    if (!product) return;
    Alert.alert(
      'Delete Product',
      `Are you sure you want to delete "${product.name}"? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteMutation.mutate() },
      ]
    );
  }, [deleteMutation, product]);

  const handleDeleteVariant = useCallback(() => {
    if (!selectedVariant) return;
    Alert.alert(
      'Delete Variant',
      `Are you sure you want to delete "${selectedVariant.name}"? Past sales that used this variant will keep their records.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteVariantMutation.mutate() },
      ]
    );
  }, [deleteVariantMutation, selectedVariant]);

  const handleSaveVariant = useCallback(() => {
    if (!variantEditForm.sellingPrice) {
      Alert.alert('Error', 'Selling price is required');
      return;
    }
    if (!variantEditForm.size.trim() && !variantEditForm.color.trim() && !variantEditForm.model.trim()) {
      Alert.alert('Error', 'At least one of size, color, or model is required');
      return;
    }
    if (isCreatingVariant) {
      createVariantMutation.mutate();
      return;
    }
    updateVariantMutation.mutate();
  }, [createVariantMutation, isCreatingVariant, updateVariantMutation, variantEditForm]);

  if (isLoading) return <DetailLoading title="Product" />;
  if (!product) return <DetailNotFound title="Product" entityLabel="Product" />;

  const stockColor =
    product.trackStock === false
      ? mutedColor
      : totalStock === 0
        ? '#ef4444'
        : totalStock < 10
          ? '#f59e0b'
          : '#10b981';
  const outOfStock = isProductOutOfStock(product);
  const alternateBarcode = getAlternateBarcode(product);
  const productMoreActions: DetailMoreAction[] = [
    ...(product.trackStock === false
      ? []
      : [
          {
            key: 'restock',
            label: 'Restock',
            icon: 'download' as const,
            onPress: () => handleOpenRestock(),
            loading: restockMutation.isPending,
          },
        ]),
    {
      key: 'add-variant',
      label: 'Add variant',
      icon: 'plus',
      onPress: openVariantCreate,
    },
    {
      key: 'edit',
      label: 'Edit',
      icon: 'edit',
      onPress: openEdit,
    },
  ];

  return (
    <>
      <EntityDetailHeader title={product.name || 'Product'} />
      <ScreenShell style={styles.screen}>
        <ScrollView contentContainerStyle={styles.content}>
          <DetailHeroCard
            eyebrow={product.sku || product.barcode || 'Product'}
            title={outOfStock ? 'Out of Stock' : product.isActive === false ? 'Inactive' : 'Available'}
            message={product.name}
            metricLabel="Selling Price"
            metricValue={formatCurrency(product.sellingPrice)}
            secondaryIcon="archive"
            secondaryLabel="Stock"
            secondaryValue={
              product.trackStock === false
                ? 'Made to order'
                : `${totalStock} Units`
            }
            showCheck={!outOfStock && product.isActive !== false}
          />

          {resolveDisplayImageUrl(product.imageUrl) ? (
            <DetailSectionCard title="Product Image" icon="image">
              <Image
                source={{ uri: resolveDisplayImageUrl(product.imageUrl) }}
                style={[styles.heroImage, { borderColor }]}
                contentFit="cover"
              />
            </DetailSectionCard>
          ) : null}

          <DetailSectionCard title="Product Details" icon="archive">
            <DetailInfoRow icon="archive" label="Name" value={product.name} />
            {product.sku ? <DetailInfoRow icon="tag" label="SKU" value={product.sku} /> : null}
            {product.barcode ? <DetailInfoRow icon="tag" label="Barcode" value={product.barcode} /> : null}
            {alternateBarcode ? <DetailInfoRow icon="tag" label="Product Code" value={alternateBarcode} /> : null}
            {product.costPrice != null ? (
              <DetailInfoRow icon="money" label="Cost Price" value={formatCurrency(product.costPrice)} />
            ) : null}
            <DetailInfoRow
              icon="money"
              label="Selling Price"
              value={formatCurrency(product.sellingPrice)}
              valueColor={colors.tint}
            />
            {(product.trackStock === false || product.quantityOnHand !== undefined || product.hasVariants) && (
              <DetailInfoRow icon="archive" label="Stock">
                <Text style={[styles.stockValue, { color: stockColor }]}>
                  {product.trackStock === false
                    ? 'Made to order'
                    : `${totalStock} units`}
                </Text>
              </DetailInfoRow>
            )}
            {product.category ? (
              <DetailInfoRow icon="list" label="Category" value={product.category.name} />
            ) : null}
          </DetailSectionCard>

          <DetailSectionCard title={`Variants (${variants.length})`} icon="list">
            <Pressable
              onPress={openVariantCreate}
              style={[styles.addVariantBtn, { borderColor: colors.tint }]}
              accessibilityRole="button"
              accessibilityLabel="Add variant"
            >
              <AppIcon name="plus" size={16} color={colors.tint} />
              <Text style={[styles.addVariantText, { color: colors.tint }]}>
                {FORM_LABELS.variant.create}
              </Text>
            </Pressable>
            {variants.length > 0 ? (
              variants.map((variant) => (
                <Pressable
                  key={variant.id}
                  onPress={() => openVariantDetail(variant)}
                  style={[styles.variantRow, { borderColor }]}
                  accessibilityRole="button"
                  accessibilityLabel={`View variant ${variant.name}`}
                >
                  <View style={styles.variantRowMain}>
                    <Text style={[styles.variantName, { color: textColor }]}>{variant.name}</Text>
                    {variant.sku ? (
                      <Text style={[styles.variantMeta, { color: mutedColor }]}>SKU: {variant.sku}</Text>
                    ) : null}
                  </View>
                  <View style={styles.variantRowEnd}>
                    <Text style={[styles.variantPrice, { color: textColor }]}>
                      {formatCurrency(variant.sellingPrice ?? product.sellingPrice)}
                    </Text>
                    <Text style={[styles.variantMeta, { color: mutedColor }]}>
                      Stock: {variant.quantityOnHand ?? 0}
                    </Text>
                  </View>
                  <AppIcon name="chevron-right" size={16} color={mutedColor} />
                </Pressable>
              ))
            ) : (
              <Text style={[styles.variantEmpty, { color: mutedColor }]}>
                {FORM_LABELS.variant.emptyHint}
              </Text>
            )}
          </DetailSectionCard>
        </ScrollView>
        <DetailFooter>
          <DetailActionButton
            label={outOfStock ? 'Restock' : 'Add to Cart'}
            icon={outOfStock ? 'download' : 'shopping-cart'}
            variant="primary"
            onPress={outOfStock ? () => handleOpenRestock() : handleAddToCart}
          />
          <DetailMoreActions actions={productMoreActions} />
        </DetailFooter>
      </ScreenShell>

      <FormSheetModal
        visible={editOpen}
        title={FORM_LABELS.product.editTitle}
        onClose={() => setEditOpen(false)}
        cardBg={cardBg}
        borderColor={borderColor}
        textColor={textColor}
        mutedColor={mutedColor}
        footer={
          <View style={styles.editFooter}>
            {canDeleteProduct ? (
              <Pressable
                onPress={handleDelete}
                disabled={deleteMutation.isPending}
                style={[styles.editBtn, styles.deleteBtn, { borderColor: '#ef4444' }]}
              >
                {deleteMutation.isPending ? (
                  <ActivityIndicator color="#ef4444" />
                ) : (
                  <Text style={styles.deleteText}>{FORM_LABELS.product.delete}</Text>
                )}
              </Pressable>
            ) : null}
            <Pressable
              onPress={handleSave}
              disabled={updateMutation.isPending}
              style={[styles.editBtn, { backgroundColor: colors.tint, borderColor: colors.tint }]}
            >
              {updateMutation.isPending ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.saveText}>{FORM_LABELS.product.save}</Text>
              )}
            </Pressable>
          </View>
        }
      >
        <View style={styles.formGroup}>
          <Text style={[styles.formLabel, { color: textColor }]}>{FORM_LABELS.product.name}</Text>
          <TextInput
            style={[styles.formInput, { color: textColor, borderColor, backgroundColor: inputBg }]}
            value={editForm.name}
            onChangeText={(t) => setEditForm((p) => ({ ...p, name: t }))}
          />
        </View>
        <View style={styles.formGroup}>
          <Text style={[styles.formLabel, { color: textColor }]}>{FORM_LABELS.product.sku}</Text>
          <TextInput
            style={[styles.formInput, { color: textColor, borderColor, backgroundColor: inputBg }]}
            value={editForm.sku}
            onChangeText={(t) => setEditForm((p) => ({ ...p, sku: t }))}
          />
        </View>
        <View style={styles.formGroup}>
          <Text style={[styles.formLabel, { color: textColor }]}>{FORM_LABELS.product.barcode}</Text>
          <TextInput
            style={[styles.formInput, { color: textColor, borderColor, backgroundColor: inputBg }]}
            value={editForm.barcode}
            onChangeText={(t) => setEditForm((p) => ({ ...p, barcode: t }))}
          />
        </View>
        <View style={styles.formGroup}>
          <Text style={[styles.formLabel, { color: textColor }]}>{FORM_LABELS.product.alternateBarcode}</Text>
          <TextInput
            style={[styles.formInput, { color: textColor, borderColor, backgroundColor: inputBg }]}
            value={editForm.alternateBarcode}
            onChangeText={(t) => setEditForm((p) => ({ ...p, alternateBarcode: t }))}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
        <View style={styles.formGroup}>
          <Text style={[styles.formLabel, { color: textColor }]}>{FORM_LABELS.product.costPrice}</Text>
          <TextInput
            style={[styles.formInput, { color: textColor, borderColor, backgroundColor: inputBg }]}
            value={editForm.costPrice}
            onChangeText={(t) => setEditForm((p) => ({ ...p, costPrice: t }))}
            keyboardType="decimal-pad"
          />
        </View>
        <View style={styles.formGroup}>
          <Text style={[styles.formLabel, { color: textColor }]}>{FORM_LABELS.product.sellingPrice}</Text>
          <TextInput
            style={[styles.formInput, { color: textColor, borderColor, backgroundColor: inputBg }]}
            value={editForm.sellingPrice}
            onChangeText={(t) => setEditForm((p) => ({ ...p, sellingPrice: t }))}
            keyboardType="decimal-pad"
          />
        </View>
        <View style={styles.formGroup}>
          <Text style={[styles.formLabel, { color: textColor }]}>{FORM_LABELS.product.quantityOnHand}</Text>
          <TextInput
            style={[styles.formInput, { color: textColor, borderColor, backgroundColor: inputBg }]}
            value={editForm.quantityOnHand}
            onChangeText={(t) => setEditForm((p) => ({ ...p, quantityOnHand: t }))}
            keyboardType="number-pad"
          />
        </View>
      </FormSheetModal>
      <RestockProductSheet
        visible={restockOpen}
        product={product}
        initialVariantId={restockVariantId}
        onClose={() => {
          if (!restockMutation.isPending) {
            setRestockOpen(false);
            setRestockVariantId(null);
          }
        }}
        onSubmit={(payload) => restockMutation.mutate(payload)}
        isSubmitting={restockMutation.isPending}
        cardBg={cardBg}
        borderColor={borderColor}
        textColor={textColor}
        mutedColor={mutedColor}
        inputBg={inputBg}
        tintColor={colors.tint}
      />

      <FormSheetModal
        visible={variantDetailOpen}
        title={selectedVariant?.name || FORM_LABELS.variant.detailTitle}
        onClose={closeVariantDetail}
        cardBg={cardBg}
        borderColor={borderColor}
        textColor={textColor}
        mutedColor={mutedColor}
        footer={
          <View style={styles.editFooter}>
            {product.trackStock !== false ? (
              <Pressable
                onPress={() => {
                  if (!selectedVariant) return;
                  closeVariantDetail();
                  handleOpenRestock(selectedVariant.id);
                }}
                style={[styles.editBtn, styles.deleteBtn, { borderColor: colors.tint }]}
              >
                <Text style={[styles.saveText, { color: colors.tint }]}>Restock</Text>
              </Pressable>
            ) : null}
            <Pressable
              onPress={() => {
                if (!selectedVariant) return;
                closeVariantDetail();
                addProductToCart(selectedVariant);
              }}
              style={[styles.editBtn, styles.deleteBtn, { borderColor: colors.tint }]}
            >
              <Text style={[styles.saveText, { color: colors.tint }]}>Add to Cart</Text>
            </Pressable>
            <Pressable
              onPress={handleDeleteVariant}
              disabled={deleteVariantMutation.isPending}
              style={[styles.editBtn, styles.deleteBtn, { borderColor: '#ef4444' }]}
            >
              {deleteVariantMutation.isPending ? (
                <ActivityIndicator color="#ef4444" />
              ) : (
                <Text style={styles.deleteText}>{FORM_LABELS.variant.delete}</Text>
              )}
            </Pressable>
            <Pressable
              onPress={() => selectedVariant && openVariantEdit(selectedVariant)}
              style={[styles.editBtn, { backgroundColor: colors.tint, borderColor: colors.tint }]}
            >
              <Text style={styles.saveText}>Edit</Text>
            </Pressable>
          </View>
        }
      >
        {selectedVariant ? (
          <>
            {selectedVariant.sku ? (
              <DetailInfoRow icon="tag" label="SKU" value={selectedVariant.sku} />
            ) : null}
            {selectedVariant.barcode ? (
              <DetailInfoRow icon="tag" label="Barcode" value={selectedVariant.barcode} />
            ) : null}
            {selectedVariant.attributes?.size ? (
              <DetailInfoRow icon="list" label="Size" value={selectedVariant.attributes.size} />
            ) : null}
            {selectedVariant.attributes?.color ? (
              <DetailInfoRow icon="list" label="Color" value={selectedVariant.attributes.color} />
            ) : null}
            {selectedVariant.attributes?.model ? (
              <DetailInfoRow icon="list" label="Model" value={selectedVariant.attributes.model} />
            ) : null}
            <DetailInfoRow
              icon="money"
              label="Selling Price"
              value={formatCurrency(selectedVariant.sellingPrice ?? product.sellingPrice)}
              valueColor={colors.tint}
            />
            {selectedVariant.costPrice != null ? (
              <DetailInfoRow icon="money" label="Cost Price" value={formatCurrency(selectedVariant.costPrice)} />
            ) : null}
            <DetailInfoRow icon="archive" label="Stock" value={`${selectedVariant.quantityOnHand ?? 0} units`} />
          </>
        ) : null}
      </FormSheetModal>

      <FormSheetModal
        visible={variantEditOpen}
        title={isCreatingVariant ? FORM_LABELS.variant.addTitle : FORM_LABELS.variant.editTitle}
        onClose={closeVariantEdit}
        cardBg={cardBg}
        borderColor={borderColor}
        textColor={textColor}
        mutedColor={mutedColor}
        footer={
          <View style={styles.editFooter}>
            {!isCreatingVariant ? (
              <Pressable
                onPress={handleDeleteVariant}
                disabled={deleteVariantMutation.isPending}
                style={[styles.editBtn, styles.deleteBtn, { borderColor: '#ef4444' }]}
              >
                {deleteVariantMutation.isPending ? (
                  <ActivityIndicator color="#ef4444" />
                ) : (
                  <Text style={styles.deleteText}>{FORM_LABELS.variant.delete}</Text>
                )}
              </Pressable>
            ) : null}
            <Pressable
              onPress={handleSaveVariant}
              disabled={createVariantMutation.isPending || updateVariantMutation.isPending}
              style={[styles.editBtn, { backgroundColor: colors.tint, borderColor: colors.tint }]}
            >
              {createVariantMutation.isPending || updateVariantMutation.isPending ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.saveText}>
                  {isCreatingVariant ? FORM_LABELS.variant.create : FORM_LABELS.variant.save}
                </Text>
              )}
            </Pressable>
          </View>
        }
      >
        <View style={styles.formGroup}>
          <Text style={[styles.formLabel, { color: textColor }]}>{FORM_LABELS.variant.size}</Text>
          <TextInput
            style={[styles.formInput, { color: textColor, borderColor, backgroundColor: inputBg }]}
            value={variantEditForm.size}
            onChangeText={(t) => setVariantEditForm((p) => ({ ...p, size: t }))}
          />
        </View>
        <View style={styles.formGroup}>
          <Text style={[styles.formLabel, { color: textColor }]}>{FORM_LABELS.variant.color}</Text>
          <TextInput
            style={[styles.formInput, { color: textColor, borderColor, backgroundColor: inputBg }]}
            value={variantEditForm.color}
            onChangeText={(t) => setVariantEditForm((p) => ({ ...p, color: t }))}
          />
        </View>
        <View style={styles.formGroup}>
          <Text style={[styles.formLabel, { color: textColor }]}>{FORM_LABELS.variant.model}</Text>
          <TextInput
            style={[styles.formInput, { color: textColor, borderColor, backgroundColor: inputBg }]}
            value={variantEditForm.model}
            onChangeText={(t) => setVariantEditForm((p) => ({ ...p, model: t }))}
          />
        </View>
        <View style={styles.formGroup}>
          <Text style={[styles.formLabel, { color: textColor }]}>{FORM_LABELS.variant.sku}</Text>
          <TextInput
            style={[styles.formInput, { color: textColor, borderColor, backgroundColor: inputBg }]}
            value={variantEditForm.sku}
            onChangeText={(t) => setVariantEditForm((p) => ({ ...p, sku: t }))}
          />
        </View>
        <View style={styles.formGroup}>
          <Text style={[styles.formLabel, { color: textColor }]}>{FORM_LABELS.variant.barcode}</Text>
          <TextInput
            style={[styles.formInput, { color: textColor, borderColor, backgroundColor: inputBg }]}
            value={variantEditForm.barcode}
            onChangeText={(t) => setVariantEditForm((p) => ({ ...p, barcode: t }))}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
        <View style={styles.formGroup}>
          <Text style={[styles.formLabel, { color: textColor }]}>{FORM_LABELS.variant.costPrice}</Text>
          <TextInput
            style={[styles.formInput, { color: textColor, borderColor, backgroundColor: inputBg }]}
            value={variantEditForm.costPrice}
            onChangeText={(t) => setVariantEditForm((p) => ({ ...p, costPrice: t }))}
            keyboardType="decimal-pad"
          />
        </View>
        <View style={styles.formGroup}>
          <Text style={[styles.formLabel, { color: textColor }]}>{FORM_LABELS.variant.sellingPrice}</Text>
          <TextInput
            style={[styles.formInput, { color: textColor, borderColor, backgroundColor: inputBg }]}
            value={variantEditForm.sellingPrice}
            onChangeText={(t) => setVariantEditForm((p) => ({ ...p, sellingPrice: t }))}
            keyboardType="decimal-pad"
          />
        </View>
        <View style={styles.formGroup}>
          <Text style={[styles.formLabel, { color: textColor }]}>{FORM_LABELS.variant.quantityOnHand}</Text>
          <TextInput
            style={[styles.formInput, { color: textColor, borderColor, backgroundColor: inputBg }]}
            value={variantEditForm.quantityOnHand}
            onChangeText={(t) => setVariantEditForm((p) => ({ ...p, quantityOnHand: t }))}
            keyboardType="number-pad"
          />
        </View>
      </FormSheetModal>

      <ProductVariantPickerSheet
        visible={variantPickerOpen}
        product={product}
        onClose={() => setVariantPickerOpen(false)}
        onSelect={(variant) => {
          setVariantPickerOpen(false);
          addProductToCart(variant);
        }}
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
  screen: { flex: 1 },
  content: { padding: 16, paddingBottom: 24 },
  heroImage: { width: '100%', height: 220, borderRadius: 12, marginBottom: 16 },
  stockValue: { fontSize: 16, fontWeight: '600' },
  editFooter: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  editBtn: {
    flexGrow: 1,
    flexBasis: 100,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteBtn: { backgroundColor: 'transparent' },
  deleteText: { color: '#ef4444', fontWeight: '600', fontSize: 15 },
  saveText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  formGroup: { marginBottom: 16 },
  formLabel: { fontSize: 14, fontWeight: '600', marginBottom: 8 },
  formInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  variantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    minHeight: 44,
  },
  variantRowMain: { flex: 1, minWidth: 0 },
  variantRowEnd: { alignItems: 'flex-end' },
  variantName: { fontSize: 15, fontWeight: '600' },
  variantPrice: { fontSize: 14, fontWeight: '600' },
  variantMeta: { fontSize: 12, marginTop: 2 },
  variantEmpty: { fontSize: 13, lineHeight: 18, marginTop: 8 },
  addVariantBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 10,
    marginBottom: 8,
  },
  addVariantText: { fontSize: 14, fontWeight: '600' },
});
