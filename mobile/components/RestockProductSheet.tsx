import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { FormSheetModal } from '@/components/FormSheetModal';
import { productService } from '@/services/productService';

export type RestockVariant = {
  id: string;
  name: string;
  quantityOnHand?: number | null;
  isActive?: boolean;
};

export type RestockProduct = {
  id: string;
  name: string;
  quantityOnHand?: number | null;
  unit?: string | null;
  hasVariants?: boolean;
  variants?: RestockVariant[];
};

export type RestockSubmitPayload = {
  quantity: number;
  variantId?: string;
  variantName?: string;
};

type RestockProductSheetProps = {
  visible: boolean;
  product: RestockProduct | null;
  onClose: () => void;
  onSubmit: (payload: RestockSubmitPayload) => void;
  isSubmitting?: boolean;
  /** Prefill a variant (e.g. opened from variant detail). */
  initialVariantId?: string | null;
  cardBg: string;
  borderColor: string;
  textColor: string;
  mutedColor: string;
  inputBg: string;
  tintColor: string;
};

const activeVariants = (list: RestockVariant[] = []) =>
  list.filter((v) => v && v.isActive !== false);

/**
 * Bottom sheet to receive stock. When the product has variants, a variant must be selected.
 */
export function RestockProductSheet({
  visible,
  product,
  onClose,
  onSubmit,
  isSubmitting = false,
  initialVariantId = null,
  cardBg,
  borderColor,
  textColor,
  mutedColor,
  inputBg,
  tintColor,
}: RestockProductSheetProps) {
  const [quantity, setQuantity] = useState('1');
  const [variants, setVariants] = useState<RestockVariant[]>([]);
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [variantsLoading, setVariantsLoading] = useState(false);
  const [variantsError, setVariantsError] = useState<string | null>(null);

  const loadVariants = useCallback(async (productId: string, seed: RestockProduct) => {
    setVariantsLoading(true);
    setVariantsError(null);
    try {
      const seeded = activeVariants(seed.variants || []);
      if (seeded.length > 0) {
        setVariants(seeded);
        return seeded;
      }
      if (seed.hasVariants === false) {
        setVariants([]);
        return [];
      }

      const [detailRes, variantsRes] = await Promise.all([
        productService.getProductById(productId).catch(() => null),
        productService.getProductVariants(productId).catch(() => null),
      ]);

      const detailBody = detailRes && typeof detailRes === 'object'
        ? (detailRes as Record<string, unknown>)
        : {};
      const detailData = detailBody.data && typeof detailBody.data === 'object'
        ? (detailBody.data as RestockProduct)
        : (detailBody as RestockProduct);
      const fromDetail = activeVariants(detailData?.variants || []);

      const listBody = variantsRes && typeof variantsRes === 'object'
        ? (variantsRes as Record<string, unknown>)
        : {};
      const listData = listBody.data;
      const fromListRaw = Array.isArray(listData)
        ? listData
        : Array.isArray((listData as { variants?: RestockVariant[] } | undefined)?.variants)
          ? (listData as { variants: RestockVariant[] }).variants
          : Array.isArray(variantsRes)
            ? variantsRes
            : [];
      const fromList = activeVariants(fromListRaw as RestockVariant[]);

      const next = fromList.length > 0 ? fromList : fromDetail;
      setVariants(next);
      return next;
    } catch {
      setVariantsError('Could not load variants');
      setVariants([]);
      return [];
    } finally {
      setVariantsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!visible || !product?.id) return;

    const seed = product;
    const productId = product.id;
    const preferredInitial = initialVariantId || null;
    let cancelled = false;

    setQuantity('1');
    setSelectedVariantId(preferredInitial);
    setVariants(activeVariants(seed.variants || []));
    setVariantsError(null);

    (async () => {
      const loaded = await loadVariants(productId, seed);
      if (cancelled) return;

      const preferred = preferredInitial && loaded.some((v) => v.id === preferredInitial)
        ? preferredInitial
        : loaded.length === 1
          ? loaded[0].id
          : preferredInitial;
      setSelectedVariantId(preferred);
    })();

    return () => {
      cancelled = true;
    };
  }, [visible, product?.id, initialVariantId, loadVariants]);

  const selectedVariant = useMemo(
    () => variants.find((v) => v.id === selectedVariantId) || null,
    [variants, selectedVariantId]
  );

  const requiresVariant = variants.length > 0 || Boolean(product?.hasVariants);

  const currentStock = useMemo(() => {
    if (selectedVariant) {
      const stock = Number(selectedVariant.quantityOnHand ?? 0);
      return Number.isFinite(stock) ? stock : 0;
    }
    const stock = Number(product?.quantityOnHand ?? 0);
    return Number.isFinite(stock) ? stock : 0;
  }, [product?.quantityOnHand, selectedVariant]);

  const canSubmit =
    Boolean(product) &&
    !isSubmitting &&
    !variantsLoading &&
    (!requiresVariant || Boolean(selectedVariantId));

  const handleSubmit = () => {
    const parsedQuantity = Number(quantity);
    if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0) {
      Alert.alert('Invalid quantity', 'Enter a quantity greater than zero.');
      return;
    }
    if (requiresVariant && !selectedVariantId) {
      Alert.alert('Select a variant', 'Choose which variant to restock.');
      return;
    }
    onSubmit({
      quantity: parsedQuantity,
      variantId: selectedVariantId || undefined,
      variantName: selectedVariant?.name,
    });
  };

  return (
    <FormSheetModal
      visible={visible}
      title="Restock product"
      onClose={onClose}
      cardBg={cardBg}
      borderColor={borderColor}
      textColor={textColor}
      mutedColor={mutedColor}
      footer={
        <Pressable
          onPress={handleSubmit}
          disabled={!canSubmit}
          style={[
            styles.submitButton,
            { backgroundColor: tintColor },
            !canSubmit && styles.submitButtonDisabled,
          ]}
        >
          {isSubmitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitButtonText}>Add stock</Text>
          )}
        </Pressable>
      }
    >
      <View style={[styles.summaryCard, { borderColor, backgroundColor: inputBg }]}>
        <Text style={[styles.productName, { color: textColor }]} numberOfLines={2}>
          {product?.name || 'Product'}
          {selectedVariant?.name ? ` — ${selectedVariant.name}` : ''}
        </Text>
        <Text style={[styles.currentStock, { color: mutedColor }]}>
          Current stock: {currentStock} {product?.unit || 'units'}
        </Text>
      </View>

      {variantsLoading ? (
        <View style={styles.variantsLoading}>
          <ActivityIndicator color={tintColor} />
          <Text style={[styles.hint, { color: mutedColor, marginTop: 8 }]}>Loading variants…</Text>
        </View>
      ) : null}

      {variantsError ? (
        <Text style={[styles.errorText, { color: '#b91c1c' }]}>{variantsError}</Text>
      ) : null}

      {requiresVariant && !variantsLoading ? (
        <View style={styles.formGroup}>
          <Text style={[styles.formLabel, { color: textColor }]}>Variant</Text>
          {variants.length === 0 ? (
            <Text style={[styles.hint, { color: mutedColor }]}>
              This product has variants, but none are available to restock.
            </Text>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.variantChips}
            >
              {variants.map((variant) => {
                const selected = variant.id === selectedVariantId;
                return (
                  <Pressable
                    key={variant.id}
                    onPress={() => setSelectedVariantId(variant.id)}
                    style={[
                      styles.variantChip,
                      {
                        borderColor: selected ? tintColor : borderColor,
                        backgroundColor: selected ? `${tintColor}18` : inputBg,
                      },
                    ]}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    accessibilityLabel={`Select variant ${variant.name}`}
                  >
                    <Text
                      style={[
                        styles.variantChipName,
                        { color: selected ? tintColor : textColor },
                      ]}
                      numberOfLines={1}
                    >
                      {variant.name}
                    </Text>
                    <Text style={[styles.variantChipStock, { color: mutedColor }]}>
                      Stock {Number(variant.quantityOnHand ?? 0)}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
        </View>
      ) : null}

      <View style={styles.formGroup}>
        <Text style={[styles.formLabel, { color: textColor }]}>Quantity received</Text>
        <TextInput
          style={[styles.formInput, { color: textColor, borderColor, backgroundColor: inputBg }]}
          placeholder="1"
          placeholderTextColor={mutedColor}
          value={quantity}
          onChangeText={setQuantity}
          keyboardType="decimal-pad"
          autoFocus={!requiresVariant}
        />
      </View>

      <Text style={[styles.hint, { color: mutedColor }]}>
        This adds to the current stock and records the change as received stock.
      </Text>
    </FormSheetModal>
  );
}

const styles = StyleSheet.create({
  summaryCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    marginBottom: 16,
  },
  productName: { fontSize: 18, fontWeight: '700' },
  currentStock: { fontSize: 14, marginTop: 6 },
  formGroup: { marginBottom: 12 },
  formLabel: { fontSize: 14, fontWeight: '600', marginBottom: 8 },
  formInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  hint: { fontSize: 13, lineHeight: 18 },
  errorText: { fontSize: 13, marginBottom: 12 },
  variantsLoading: { alignItems: 'center', marginBottom: 12 },
  variantChips: { gap: 8, paddingVertical: 2 },
  variantChip: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minWidth: 110,
    maxWidth: 160,
  },
  variantChipName: { fontSize: 14, fontWeight: '600' },
  variantChipStock: { fontSize: 12, marginTop: 4 },
  submitButton: {
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  submitButtonDisabled: { opacity: 0.6 },
});
