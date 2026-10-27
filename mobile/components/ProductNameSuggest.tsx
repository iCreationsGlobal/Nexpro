import React, { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, TextInput, View, type StyleProp, type TextStyle } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { AppIcon } from '@/components/AppIcon';
import { useAuth } from '@/context/AuthContext';
import { useShopOptional } from '@/context/ShopContext';
import { useDebounce } from '@/hooks/useDebounce';
import { useScreenColors } from '@/hooks/useScreenColors';
import { productService } from '@/services/productService';
import { resolveImageUrl } from '@/utils/fileUtils';
import { formatCurrency } from '@/utils/formatCurrency';
import { parseApiListResponse } from '@/utils/parseApiListResponse';
import { productNameKey } from '@/utils/productNameMatch';
import { FontFamily } from '@/constants/typography';

type AnyProduct = Record<string, any>;

const stockText = (product: AnyProduct) => {
  if (product?.hasVariants) return 'Sizes & colours';
  if (product?.trackStock === false) return null;
  const qty = Number(product?.quantityOnHand || 0);
  return qty > 0 ? `${qty} in stock` : 'Out of stock';
};

const productSummary = (product: AnyProduct) => [
  stockText(product),
  Number(product?.sellingPrice) > 0 ? formatCurrency(product.sellingPrice) : null,
].filter(Boolean).join(' · ');

function Thumb({ url, size }: { url?: string | null; size: number }) {
  const [failed, setFailed] = useState(false);
  const { borderColor, mutedColor } = useScreenColors();
  const uri = resolveImageUrl(url);
  return (
    <View style={[styles.thumb, { width: size, height: size, borderColor }]}>
      {uri && !failed
        ? <Image source={{ uri }} style={styles.thumbImage} onError={() => setFailed(true)} />
        : <AppIcon name="package" size={size / 2} color={mutedColor} />}
    </View>
  );
}

/**
 * Product name box for adding a product: as a name is typed it lists the products already there
 * with similar names (closest first), and warns when the exact name is already there, so the same
 * product isn't added twice. Picking one offers to add stock to it or open it instead; "It's a
 * different product" lets the new one through.
 *
 * - enabled: off when editing (the list would only show the product being edited).
 * - conflict: the product the server returned when it refused the save for its name; its card
 *   offers "Add it anyway" instead.
 * - onAddStock / onOpen: each button shows only when its handler is given.
 * - onDifferent: the user says this name is a different product; save it without the check.
 */
export function ProductNameSuggest({
  value,
  onChangeText,
  enabled = true,
  conflict = null,
  onAddStock,
  onOpen,
  onDifferent,
  inputStyle,
  placeholder,
  placeholderTextColor,
  accessibilityLabel = 'Product name',
}: {
  value: string;
  onChangeText: (text: string) => void;
  enabled?: boolean;
  conflict?: AnyProduct | null;
  onAddStock?: (product: AnyProduct) => void;
  onOpen?: (product: AnyProduct) => void;
  onDifferent?: (name: string) => void;
  inputStyle?: StyleProp<TextStyle>;
  placeholder?: string;
  placeholderTextColor?: string;
  accessibilityLabel?: string;
}) {
  const { activeTenantId } = useAuth();
  const shop = useShopOptional();
  const { colors, onTint, textColor, mutedColor, borderColor, cardBg, resolvedTheme } = useScreenColors();
  const [focused, setFocused] = useState(false);
  const [picked, setPicked] = useState<AnyProduct | null>(null);
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);
  const key = productNameKey(value);
  const term = useDebounce(String(value ?? '').trim(), 250);

  const { data } = useQuery({
    queryKey: ['products', 'name-suggest', activeTenantId, shop?.activeShopId ?? null, term],
    queryFn: () => productService.getProducts({ search: term, limit: 5, isActive: true, sort: 'relevance' }),
    enabled: enabled && Boolean(activeTenantId) && Boolean(term),
    staleTime: 30 * 1000,
  });
  const results = enabled && term ? parseApiListResponse<AnyProduct>(data).filter((p) => p?.id) : [];

  // A pick belongs to the name it was picked for.
  useEffect(() => { setPicked(null); }, [key]);

  const serverConflict = enabled && conflict && productNameKey(conflict.name) === key ? conflict : null;
  const exact = key && key !== dismissedKey ? results.find((p) => productNameKey(p.name) === key) : null;
  const card = enabled ? (serverConflict || picked || exact || null) : null;
  const showList = enabled && focused && !card && Boolean(key) && results.length > 0;

  const different = () => {
    if (!card) return;
    if (productNameKey(card.name) === key) {
      setDismissedKey(key);
      onDifferent?.(value);
    }
    setPicked(null);
  };

  const isDark = resolvedTheme === 'dark';
  const warn = isDark
    ? { bg: 'rgba(120, 53, 15, 0.35)', border: '#b45309', text: '#fef3c7' }
    : { bg: '#fffbeb', border: '#fcd34d', text: '#78350f' };

  return (
    <View>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder}
        placeholderTextColor={placeholderTextColor}
        style={inputStyle}
        accessibilityLabel={accessibilityLabel}
        autoCorrect={false}
      />

      {showList ? (
        <View style={[styles.list, { borderColor, backgroundColor: cardBg }]}>
          <Text style={[styles.listTitle, { color: mutedColor }]}>Already in your products</Text>
          {results.map((product) => (
            <Pressable
              key={String(product.id)}
              onPress={() => setPicked(product)}
              style={({ pressed }) => [styles.option, pressed && { opacity: 0.6 }]}
              accessibilityRole="button"
              accessibilityLabel={`${product.name}, ${productSummary(product)}`}
            >
              <Thumb url={product.imageUrl} size={36} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.optionName, { color: textColor }]} numberOfLines={1}>{product.name}</Text>
                <Text style={[styles.optionMeta, { color: mutedColor }]} numberOfLines={1}>{productSummary(product)}</Text>
              </View>
            </Pressable>
          ))}
        </View>
      ) : null}

      {card ? (
        <View
          style={[styles.card, { backgroundColor: warn.bg, borderColor: warn.border }]}
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
        >
          <View style={styles.cardRow}>
            <Thumb url={card.imageUrl} size={48} />
            <View style={{ flex: 1 }}>
              <View style={styles.cardTitleRow}>
                <AppIcon name="exclamation-triangle" size={14} color={warn.text} />
                <Text style={[styles.cardTitle, { color: warn.text }]}>
                  {serverConflict ? 'Already in your products' : 'You already have this product'}
                </Text>
              </View>
              <Text style={[styles.cardName, { color: warn.text }]} numberOfLines={1}>{card.name}</Text>
              <Text style={[styles.optionMeta, { color: warn.text }]} numberOfLines={1}>{productSummary(card)}</Text>
            </View>
          </View>
          <View style={styles.actions}>
            {onAddStock ? (
              <Pressable
                onPress={() => onAddStock(card)}
                style={[styles.action, { backgroundColor: colors.tint, borderColor: colors.tint }]}
                accessibilityRole="button"
              >
                <Text style={[styles.actionText, { color: onTint }]}>Add stock to it</Text>
              </Pressable>
            ) : null}
            {onOpen ? (
              <Pressable onPress={() => onOpen(card)} style={[styles.action, { borderColor: warn.border }]} accessibilityRole="button">
                <Text style={[styles.actionText, { color: warn.text }]}>Open it</Text>
              </Pressable>
            ) : null}
            <Pressable onPress={different} style={[styles.action, { borderColor: 'transparent' }]} accessibilityRole="button">
              <Text style={[styles.actionText, { color: warn.text }]}>
                {serverConflict ? 'Add it anyway' : "It's a different product"}
              </Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  thumb: { borderWidth: 1, borderRadius: 10, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  thumbImage: { width: '100%', height: '100%' },
  list: { marginTop: 6, borderWidth: 1, borderRadius: 12, paddingVertical: 4 },
  listTitle: { fontSize: 12, fontFamily: FontFamily.medium, paddingHorizontal: 12, paddingTop: 6, paddingBottom: 2 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 8, minHeight: 48 },
  optionName: { fontSize: 15, fontFamily: FontFamily.semiBold },
  optionMeta: { fontSize: 13, fontFamily: FontFamily.regular },
  card: { marginTop: 8, borderWidth: 1, borderRadius: 14, padding: 12, gap: 10 },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardTitle: { fontSize: 13, fontFamily: FontFamily.medium },
  cardName: { fontSize: 16, fontFamily: FontFamily.semiBold },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  action: { minHeight: 44, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  actionText: { fontSize: 14, fontFamily: FontFamily.semiBold },
});
