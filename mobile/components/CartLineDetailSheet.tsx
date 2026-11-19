import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useQuery } from '@tanstack/react-query';

import { AppBottomSheet } from '@/components/AppBottomSheet';
import { AppIcon } from '@/components/AppIcon';
import { useCart } from '@/context/CartContext';
import { useScreenColors } from '@/hooks/useScreenColors';
import { productService } from '@/services/productService';
import { buildCartLineDetails, findLineVariant, type CartLineProduct } from '@/utils/cartLineDetails';
import { resolveImageUrl } from '@/utils/fileUtils';
import { formatCurrency, formatInteger } from '@/utils/formatCurrency';
import { parseApiEntity, parseApiListResponse } from '@/utils/parseApiListResponse';
import type { ProductVariantStockInput } from '@/utils/productStock';

const PHOTO_HEIGHT = 260;

function PhotoPager({ photos, borderColor, mutedColor }: { photos: string[]; borderColor: string; mutedColor: string }) {
  const [width, setWidth] = useState(0);
  const [page, setPage] = useState(0);
  if (photos.length === 0) {
    return (
      <View style={[styles.photoEmpty, { borderColor }]}>
        <AppIcon name="package" size={48} color={mutedColor} />
      </View>
    );
  }
  return (
    <View onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(event) => {
          if (width > 0) setPage(Math.round(event.nativeEvent.contentOffset.x / width));
        }}
        style={[styles.photoPager, { borderColor }]}
      >
        {photos.map((uri, index) => (
          <Image
            key={uri}
            source={{ uri: resolveImageUrl(uri) }}
            style={{ width: width || 1, height: PHOTO_HEIGHT }}
            contentFit="contain"
            accessibilityLabel={`Photo ${index + 1} of ${photos.length}`}
          />
        ))}
      </ScrollView>
      {photos.length > 1 ? (
        <View style={styles.dots}>
          {photos.map((uri, index) => (
            <View
              key={uri}
              style={[styles.dot, { backgroundColor: index === page ? mutedColor : borderColor }]}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

/**
 * Pop-up for a line in the cart: the product's photos and details so the seller can check it is
 * the right one, the quantity with − / +, and Remove from cart. Fetches the product when it opens;
 * offline it shows what the cart line has.
 */
export function CartLineDetailSheet({ itemId, onClose }: { itemId: string | null; onClose: () => void }) {
  const { items, updateQuantity, removeItem } = useCart();
  const { colors, cardBg, borderColor, textColor, mutedColor, inputBg, onTint } = useScreenColors();
  const line = useMemo(() => (itemId ? items.find((item) => item.id === itemId) ?? null : null), [items, itemId]);
  const visible = !!line;

  // The line went away (removed here or elsewhere): close.
  useEffect(() => {
    if (itemId && !line) onClose();
  }, [itemId, line, onClose]);

  const productId = line?.productId ?? '';
  const productQuery = useQuery({
    queryKey: ['product', productId],
    queryFn: () => productService.getProductById(productId),
    enabled: visible && !!productId,
    staleTime: 60_000,
    retry: false,
  });
  const product = parseApiEntity<CartLineProduct>(productQuery.data);
  const variantFromProduct = line && product ? findLineVariant(line, product) : null;
  const needsVariantList = visible && !!line?.productVariantId && !!product && !variantFromProduct;
  const variantsQuery = useQuery({
    queryKey: ['product', productId, 'variants'],
    queryFn: () => productService.getProductVariants(productId),
    enabled: needsVariantList,
    staleTime: 60_000,
    retry: false,
  });
  const variant =
    variantFromProduct
    ?? (line ? findLineVariant(line, null, parseApiListResponse<ProductVariantStockInput>(variantsQuery.data)) : null);

  const details = line ? buildCartLineDetails(line, product, variant) : null;
  const loading = productQuery.isLoading || (needsVariantList && variantsQuery.isLoading);
  const offline = !!productQuery.error && !product;

  const confirmRemove = () => {
    if (!line || !details) return;
    const label = details.variantName ? `${details.name} – ${details.variantName}` : details.name;
    Alert.alert('Remove from cart?', `${label} will be taken out of the cart.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => removeItem(line.id) },
    ]);
  };

  const atMax = !!details && details.maxQuantity !== null && details.quantity >= details.maxQuantity;

  return (
    <AppBottomSheet
      visible={visible}
      title="Item in the cart"
      onClose={onClose}
      cardBg={cardBg}
      borderColor={borderColor}
      textColor={textColor}
      mutedColor={mutedColor}
      footer={
        line ? (
          <Pressable
            onPress={confirmRemove}
            style={({ pressed }) => [styles.removeBtn, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Remove from cart"
          >
            <AppIcon name="trash" size={18} color="#dc2626" />
            <Text style={styles.removeText}>Remove from cart</Text>
          </Pressable>
        ) : null
      }
    >
      {line && details ? (
        <View style={styles.body}>
          <PhotoPager photos={details.photos} borderColor={borderColor} mutedColor={mutedColor} />

          <View style={styles.titleBlock}>
            <Text style={[styles.name, { color: textColor }]}>{details.name}</Text>
            {details.variantName ? (
              <Text style={[styles.variant, { color: textColor }]}>{details.variantName}</Text>
            ) : null}
            {details.attributes.map((row) => (
              <Text key={row.label} style={[styles.meta, { color: mutedColor }]}>
                {row.label}: {row.value}
              </Text>
            ))}
            <Text style={[styles.price, { color: colors.tint }]}>{formatCurrency(details.unitPrice)} each</Text>
          </View>

          {loading ? (
            <View style={styles.status}>
              <ActivityIndicator color={colors.tint} />
              <Text style={[styles.meta, { color: mutedColor }]}>Loading product details…</Text>
            </View>
          ) : offline ? (
            <Text style={[styles.meta, { color: mutedColor }]}>
              Showing what the cart has saved. More details need the internet.
            </Text>
          ) : null}

          <View style={[styles.qtyCard, { borderColor, backgroundColor: inputBg }]}>
            <Text style={[styles.qtyLabel, { color: mutedColor }]}>In the cart</Text>
            <View style={styles.qtyRow}>
              <Pressable
                onPress={() => (details.quantity <= 1 ? confirmRemove() : updateQuantity(line.id, details.quantity - 1))}
                style={({ pressed }) => [styles.qtyBtn, { borderColor: colors.tint }, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel={`Decrease quantity for ${details.name}`}
              >
                <AppIcon name="minus" size={22} color={colors.tint} />
              </Pressable>
              <Text style={[styles.qtyValue, { color: textColor }]} accessibilityLabel={`Quantity ${details.quantity}`}>
                {formatInteger(details.quantity)}
              </Text>
              <Pressable
                onPress={() => updateQuantity(line.id, details.quantity + 1)}
                disabled={atMax}
                style={({ pressed }) => [
                  styles.qtyBtn,
                  { borderColor: colors.tint, backgroundColor: atMax ? borderColor : colors.tint },
                  pressed && styles.pressed,
                ]}
                accessibilityRole="button"
                accessibilityState={{ disabled: atMax }}
                accessibilityLabel={`Increase quantity for ${details.name}`}
              >
                <AppIcon name="plus" size={22} color={atMax ? mutedColor : onTint} />
              </Pressable>
              <View style={styles.lineTotalWrap}>
                <Text style={[styles.qtyLabel, { color: mutedColor }]}>Line total</Text>
                <Text style={[styles.lineTotal, { color: textColor }]}>{formatCurrency(details.lineTotal)}</Text>
              </View>
            </View>
            {atMax ? (
              <Text style={styles.stockHint}>
                {details.maxQuantity === 0 ? 'Out of stock' : `Only ${formatInteger(details.maxQuantity)} in stock`}
              </Text>
            ) : null}
          </View>

          {details.facts.length > 0 ? (
            <View style={[styles.facts, { borderColor }]}>
              {details.facts.map((fact, index) => (
                <View
                  key={fact.label}
                  style={[styles.factRow, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: borderColor }]}
                >
                  <Text style={[styles.factLabel, { color: mutedColor }]}>{fact.label}</Text>
                  <Text style={[styles.factValue, { color: textColor }]} selectable>{fact.value}</Text>
                </View>
              ))}
            </View>
          ) : null}

          {details.description ? (
            <View style={styles.description}>
              <Text style={[styles.qtyLabel, { color: mutedColor }]}>Description</Text>
              <Text style={[styles.descriptionText, { color: textColor }]}>{details.description}</Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </AppBottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: 16 },
  photoPager: { borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  photoEmpty: {
    height: 160,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  titleBlock: { gap: 4 },
  name: { fontSize: 22, fontWeight: '700' },
  variant: { fontSize: 17, fontWeight: '600' },
  meta: { fontSize: 15 },
  price: { fontSize: 18, fontWeight: '700', marginTop: 4 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  qtyCard: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 8 },
  qtyLabel: { fontSize: 13, fontWeight: '600' },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  qtyBtn: {
    width: 48,
    height: 48,
    borderRadius: 14,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyValue: { fontSize: 22, fontWeight: '700', minWidth: 36, textAlign: 'center' },
  lineTotalWrap: { flex: 1, alignItems: 'flex-end' },
  lineTotal: { fontSize: 18, fontWeight: '700' },
  stockHint: { color: '#b45309', fontSize: 14, fontWeight: '600' },
  facts: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 14 },
  factRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 12 },
  factLabel: { fontSize: 15 },
  factValue: { fontSize: 15, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
  description: { gap: 4 },
  descriptionText: { fontSize: 15, lineHeight: 22 },
  removeBtn: {
    minHeight: 52,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#fecaca',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  removeText: { color: '#dc2626', fontSize: 16, fontWeight: '700' },
  pressed: { opacity: 0.75 },
});
