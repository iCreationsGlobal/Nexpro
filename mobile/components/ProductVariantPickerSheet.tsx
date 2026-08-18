import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { FormSheetModal } from '@/components/FormSheetModal';
import { productService } from '@/services/productService';
import { formatCurrency } from '@/utils/formatCurrency';
import {
  getActiveVariants,
  getVariantLabel,
  isVariantOutOfStock,
  type ProductStockInput,
  type ProductVariantStockInput,
} from '@/utils/productStock';

export type PickerProduct = ProductStockInput & {
  id: string;
  name: string;
  sellingPrice?: number;
  selectedVariant?: ProductVariantStockInput | null;
};

type ProductVariantPickerSheetProps = {
  visible: boolean;
  product: PickerProduct | null;
  onClose: () => void;
  onSelect: (variant: ProductVariantStockInput) => void;
  cardBg: string;
  borderColor: string;
  textColor: string;
  mutedColor: string;
  inputBg: string;
  tintColor: string;
};

/**
 * Bottom sheet to pick a product variant before adding to cart (web POS parity).
 */
export function ProductVariantPickerSheet({
  visible,
  product,
  onClose,
  onSelect,
  cardBg,
  borderColor,
  textColor,
  mutedColor,
  inputBg,
  tintColor,
}: ProductVariantPickerSheetProps) {
  const [variants, setVariants] = useState<ProductVariantStockInput[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadVariants = useCallback(async (seed: PickerProduct) => {
    setLoading(true);
    setError(null);
    try {
      const seeded = getActiveVariants(seed);
      if (seeded.length > 0) {
        setVariants(seeded);
        return seeded;
      }

      const [detailRes, variantsRes] = await Promise.all([
        productService.getProductById(seed.id).catch(() => null),
        productService.getProductVariants(seed.id).catch(() => null),
      ]);

      const detailBody = detailRes && typeof detailRes === 'object'
        ? (detailRes as Record<string, unknown>)
        : {};
      const detailData = detailBody.data && typeof detailBody.data === 'object'
        ? (detailBody.data as PickerProduct)
        : (detailBody as PickerProduct);
      const fromDetail = getActiveVariants(detailData);

      const listBody = variantsRes && typeof variantsRes === 'object'
        ? (variantsRes as Record<string, unknown>)
        : {};
      const listData = listBody.data;
      const fromListRaw = Array.isArray(listData)
        ? listData
        : Array.isArray(variantsRes)
          ? variantsRes
          : [];
      const fromList = getActiveVariants({ variants: fromListRaw as ProductVariantStockInput[] });

      const next = fromList.length > 0 ? fromList : fromDetail;
      setVariants(next);
      return next;
    } catch {
      setError('Could not load variants');
      setVariants([]);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!visible || !product?.id) return;
    let cancelled = false;
    setVariants(getActiveVariants(product));
    setError(null);
    (async () => {
      const loaded = await loadVariants(product);
      if (cancelled) return;
      setVariants(loaded);
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, product?.id, loadVariants]);

  const title = useMemo(
    () => (product?.name ? `Select variant` : 'Select Variant'),
    [product?.name]
  );

  return (
    <FormSheetModal
      visible={visible}
      title={title}
      onClose={onClose}
      cardBg={cardBg}
      borderColor={borderColor}
      textColor={textColor}
      mutedColor={mutedColor}
    >
      <Text style={[styles.hint, { color: mutedColor }]}>
        Choose a variant for {product?.name || 'this product'}.
      </Text>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={tintColor} />
          <Text style={[styles.hint, { color: mutedColor, marginTop: 8 }]}>Loading variants…</Text>
        </View>
      ) : null}

      {error ? <Text style={[styles.errorText, { color: '#b91c1c' }]}>{error}</Text> : null}

      {!loading && variants.length === 0 ? (
        <Text style={[styles.hint, { color: mutedColor }]}>
          No variants available for this product yet.
        </Text>
      ) : null}

      {!loading
        ? variants.map((variant) => {
            const outOfStock = isVariantOutOfStock(product, variant);
            const price = Number(variant.sellingPrice ?? product?.sellingPrice ?? 0);
            return (
              <Pressable
                key={variant.id || variant.name}
                disabled={outOfStock}
                onPress={() => {
                  if (!variant.id || outOfStock) return;
                  onSelect(variant);
                }}
                style={[
                  styles.variantRow,
                  {
                    borderColor,
                    backgroundColor: outOfStock ? inputBg : cardBg,
                    opacity: outOfStock ? 0.55 : 1,
                  },
                ]}
                accessibilityRole="button"
                accessibilityState={{ disabled: outOfStock }}
                accessibilityLabel={`Select variant ${getVariantLabel(variant)}`}
              >
                <View style={styles.variantMain}>
                  <Text style={[styles.variantName, { color: textColor }]} numberOfLines={2}>
                    {getVariantLabel(variant)}
                  </Text>
                  <Text style={[styles.variantMeta, { color: mutedColor }]}>
                    {variant.sku ? `SKU: ${variant.sku}` : 'No SKU'}
                    {variant.barcode ? ` · ${variant.barcode}` : ''}
                  </Text>
                </View>
                <View style={styles.variantEnd}>
                  <Text style={[styles.variantPrice, { color: tintColor }]}>
                    {formatCurrency(Number.isFinite(price) ? price : 0)}
                  </Text>
                  <Text style={[styles.variantMeta, { color: mutedColor }]}>
                    {outOfStock ? 'Out of stock' : `Stock: ${Number(variant.quantityOnHand ?? 0)}`}
                  </Text>
                </View>
              </Pressable>
            );
          })
        : null}
    </FormSheetModal>
  );
}

const styles = StyleSheet.create({
  hint: { fontSize: 13, lineHeight: 18, marginBottom: 12 },
  errorText: { fontSize: 13, marginBottom: 12 },
  loading: { alignItems: 'center', marginVertical: 16 },
  variantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 10,
    minHeight: 64,
  },
  variantMain: { flex: 1, minWidth: 0 },
  variantEnd: { alignItems: 'flex-end' },
  variantName: { fontSize: 15, fontWeight: '600' },
  variantPrice: { fontSize: 14, fontWeight: '700' },
  variantMeta: { fontSize: 12, marginTop: 3 },
});
