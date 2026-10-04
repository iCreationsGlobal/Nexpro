import React, { useEffect, useState } from 'react';
import { Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { AppIcon } from '@/components/AppIcon';
import { useAuth } from '@/context/AuthContext';
import { useShopOptional } from '@/context/ShopContext';
import { useScreenColors } from '@/hooks/useScreenColors';
import { productService } from '@/services/productService';
import { formatCurrency } from '@/utils/formatCurrency';
import { resolveImageUrl } from '@/utils/fileUtils';
import { FontFamily } from '@/constants/typography';
import {
  SimpleBigButton, SimpleEmpty, SimpleList, SimplePager, SimpleRow, SimpleSearch, SimpleTitle, simpleStyles,
} from '@/components/simple/SimpleUI';
import { SimpleProductSheet } from '@/components/simple/SimpleProductSheet';

const PAGE_SIZE = 20;
const PRODUCT_SORTS = [
  { value: 'name_asc', label: 'Name' },
  { value: 'price_asc', label: 'Price low–high' },
  { value: 'price_desc', label: 'Price high–low' },
] as const;

/** Stock label for a row. Variant products point at their sizes; products that don't track stock show nothing. */
export function simpleStockLabel(product: Record<string, any>): { text: string; color: string } | null {
  if (product?.hasVariants) return { text: 'Sizes & colours', color: '#6b7280' };
  if (product?.trackStock === false) return null;
  const qty = Number(product?.quantityOnHand || 0);
  const reorder = Number(product?.reorderLevel || 0);
  if (qty <= 0) return { text: 'Out of stock', color: '#b91c1c' };
  if (reorder > 0 && qty <= reorder) return { text: `Low · ${qty} left`, color: '#b45309' };
  return { text: `${qty} in stock`, color: '#6b7280' };
}

function Thumb({ url }: { url?: string | null }) {
  const [failed, setFailed] = useState(false);
  const { borderColor, mutedColor } = useScreenColors();
  const uri = resolveImageUrl(url);
  return (
    <View style={[styles.thumb, { borderColor }]}>
      {uri && !failed
        ? <Image source={{ uri }} style={styles.thumbImage} onError={() => setFailed(true)} />
        : <AppIcon name="package" size={24} color={mutedColor} />}
    </View>
  );
}

/** Simple Mode Products: big Add product, search, and a list with price and stock left. */
export function SimpleProductsScreen() {
  const { activeTenantId } = useAuth();
  const shop = useShopOptional();
  const { bg, mutedColor } = useScreenColors();
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [sort, setSort] = useState<(typeof PRODUCT_SORTS)[number]['value']>('name_asc');
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Record<string, any> | null>(null);

  useEffect(() => {
    const id = setTimeout(() => { setDebounced(search.trim()); setPage(1); }, 350);
    return () => clearTimeout(id);
  }, [search]);

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['simple', 'products', activeTenantId, shop?.activeShopId ?? null, debounced, sort, page],
    queryFn: () => productService.getProducts({ page, limit: PAGE_SIZE, isActive: true, sort, ...(debounced ? { search: debounced } : {}) }),
    enabled: !!activeTenantId,
  });
  const body = (data || {}) as { data?: any[]; count?: number };
  const products = Array.isArray(body.data) ? body.data : [];
  const count = Number(body.count ?? products.length);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: bg }}
      contentContainerStyle={simpleStyles.screen}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} />}
    >
      <SimpleTitle>Products</SimpleTitle>
      <SimpleBigButton label="Add product" icon="plus" onPress={() => { setEditing(null); setFormOpen(true); }} />
      <SimpleSearch value={search} onChange={setSearch} placeholder="Search products" />
      <View style={styles.sortRow}>
        {PRODUCT_SORTS.map((option) => {
          const selected = sort === option.value;
          return (
            <Pressable
              key={option.value}
              onPress={() => { setSort(option.value); setPage(1); }}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`Sort by ${option.label}`}
              style={[styles.sortChip, { borderColor: selected ? '#166534' : '#e5e7eb', backgroundColor: selected ? '#f0fdf4' : '#fff' }]}
            >
              <Text style={{ color: selected ? '#166534' : mutedColor, fontFamily: FontFamily.semiBold }}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={{ color: mutedColor, fontFamily: FontFamily.regular }}>
        {isLoading ? 'Loading…' : `${count} ${count === 1 ? 'product' : 'products'}${debounced ? ' found' : ''}`}
      </Text>
      {!isLoading && products.length === 0 ? (
        <SimpleEmpty text={debounced ? 'No product matches that search.' : 'No products yet. Tap Add product to add one.'} />
      ) : (
        <SimpleList>
          {products.map((product) => {
            const stock = simpleStockLabel(product);
            return (
              <SimpleRow
                key={product.id}
                leading={<Thumb url={product.imageUrl} />}
                title={product.name}
                // Normal stock reads quietly under the name; low / out of stock is flagged on the right.
                subtitle={stock && stock.color === '#6b7280' ? stock.text : undefined}
                right={formatCurrency(product.sellingPrice)}
                rightNote={stock && stock.color !== '#6b7280' ? stock.text : undefined}
                rightNoteColor={stock?.color}
                onPress={() => { setEditing(product); setFormOpen(true); }}
              />
            );
          })}
        </SimpleList>
      )}
      <SimplePager page={page} totalPages={Math.max(Math.ceil(count / PAGE_SIZE), 1)} onChange={setPage} />
      <SimpleProductSheet visible={formOpen} product={editing} onClose={() => { setFormOpen(false); setEditing(null); }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  sortRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  sortChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  thumb: { width: 52, height: 52, borderRadius: 12, borderWidth: 1, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  thumbImage: { width: '100%', height: '100%' },
});
