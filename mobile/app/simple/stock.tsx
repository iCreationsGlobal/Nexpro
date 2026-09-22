import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Boxes, ImageOff, ShoppingCart } from 'lucide-react-native';
import { SimpleHeader } from '@/components/simple/SimpleHeader';
import { NumberPadModal } from '@/components/simple/NumberPad';
import { productService } from '@/services/productService';
import { resolveDisplayImageUrl } from '@/utils/fileUtils';
import { FontFamily } from '@/constants/typography';

type Product = {
  id: string;
  name: string;
  imageUrl?: string | null;
  quantityOnHand?: number | null;
  reorderLevel?: number | null;
  trackStock?: boolean;
  hasVariants?: boolean;
};

/**
 * Stock — same photo grid as Sell, but each tile shows quantity on hand instead of price.
 * Tapping opens the number pad to add received stock. Transfers, stock-takes and suppliers
 * stay in Full Mode.
 */
export default function SimpleStock() {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Product | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['simple', 'products'],
    queryFn: () => productService.getProducts({ page: 1, limit: 60, isActive: true }),
    staleTime: 30_000,
  });

  const products: Product[] = useMemo(() => {
    const list = data?.data ?? data ?? [];
    return Array.isArray(list) ? list.filter((p: Product) => !p.hasVariants && p.trackStock !== false) : [];
  }, [data]);

  const restockMutation = useMutation({
    mutationFn: ({ id, quantity }: { id: string; quantity: number }) =>
      productService.adjustStock(id, quantity, 'delta', 'Restock', { type: 'receive' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['simple', 'products'] });
    },
  });

  const handleConfirm = useCallback(
    (quantity: number) => {
      if (!selected) return;
      restockMutation.mutate({ id: selected.id, quantity });
      setSelected(null);
    },
    [selected, restockMutation]
  );

  const renderTile = useCallback(
    ({ item }: { item: Product }) => {
      const uri = resolveDisplayImageUrl(item.imageUrl);
      const qty = Number(item.quantityOnHand ?? 0);
      const reorderLevel = Number(item.reorderLevel ?? 10);
      const low = qty <= (Number.isFinite(reorderLevel) && reorderLevel > 0 ? reorderLevel : 10);
      return (
        <Pressable onPress={() => setSelected(item)} style={styles.tile}>
          <View style={styles.tileImageWrap}>
            {uri ? (
              <Image source={{ uri }} style={styles.tileImage} resizeMode="cover" />
            ) : (
              <ImageOff size={32} color="#9ca3af" />
            )}
          </View>
          <Text style={[styles.qtyText, low && styles.qtyTextLow]}>{qty}</Text>
        </Pressable>
      );
    },
    []
  );

  return (
    <View style={styles.screen}>
      <SimpleHeader>
        <Pressable
          style={styles.modeBtn}
          accessibilityLabel="Sell"
          onPress={() => router.push('/simple')}
        >
          <ShoppingCart size={22} color="#166534" />
        </Pressable>
        <Pressable style={[styles.modeBtn, styles.modeBtnActive]} accessibilityLabel="Stock">
          <Boxes size={22} color="#fff" />
        </Pressable>
      </SimpleHeader>

      <FlatList
        data={products}
        keyExtractor={(item) => item.id}
        renderItem={renderTile}
        numColumns={3}
        contentContainerStyle={styles.grid}
        refreshing={isLoading}
        columnWrapperStyle={{ gap: 12 }}
      />

      <NumberPadModal
        visible={!!selected}
        title="Add stock received"
        onConfirm={handleConfirm}
        onCancel={() => setSelected(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },
  grid: { padding: 8, paddingBottom: 24 },
  tile: {
    flex: 1,
    margin: 4,
    aspectRatio: 1,
    borderRadius: 16,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  tileImageWrap: { flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center' },
  tileImage: { width: '100%', height: '100%' },
  qtyText: {
    fontSize: 20,
    fontFamily: FontFamily.bold,
    color: '#000',
    paddingVertical: 6,
  },
  qtyTextLow: { color: '#dc2626' },
  modeBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f0fdf4',
  },
  modeBtnActive: { backgroundColor: '#166534' },
});
