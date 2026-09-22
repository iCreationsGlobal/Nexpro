import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { Boxes, Calculator, ImageOff, Minus, Plus, ShoppingCart } from 'lucide-react-native';
import { SimpleHeader } from '@/components/simple/SimpleHeader';
import { NumberPadModal } from '@/components/simple/NumberPad';
import { useAuth } from '@/context/AuthContext';
import { useCart } from '@/context/CartContext';
import { productService } from '@/services/productService';
import { getOrCreateQuickSaleProduct } from '@/utils/quickSaleProduct';
import { resolveDisplayImageUrl } from '@/utils/fileUtils';
import { formatCurrency } from '@/utils/formatCurrency';
import { FontFamily } from '@/constants/typography';

type Product = {
  id: string;
  name: string;
  sellingPrice: number;
  imageUrl?: string | null;
  sku?: string;
  barcode?: string;
  trackStock?: boolean;
  quantityOnHand?: number | null;
  hasVariants?: boolean;
  isActive?: boolean;
};

/**
 * Sell home — a photo grid, not a menu. Tapping a tile adds one unit to the running cart at
 * the bottom; the cart, price and quantities are numbers, which this design treats as fine
 * (only text/typing is the literacy barrier being designed around).
 */
export default function SimpleSell() {
  const { activeTenantId } = useAuth();
  const { items, addItem, addCustomAmountItem, updateQuantity, getTotal } = useCart();
  const [quickSaleVisible, setQuickSaleVisible] = useState(false);
  const [quickSaleBusy, setQuickSaleBusy] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['simple', 'products'],
    queryFn: () => productService.getProducts({ page: 1, limit: 60, isActive: true }),
    staleTime: 30_000,
  });

  const products: Product[] = useMemo(() => {
    const list = data?.data ?? data ?? [];
    return Array.isArray(list) ? list.filter((p: Product) => !p.hasVariants) : [];
  }, [data]);

  const handleTap = useCallback(
    (product: Product) => {
      const ok = addItem({
        id: product.id,
        name: product.name,
        sellingPrice: product.sellingPrice,
        imageUrl: product.imageUrl || undefined,
        sku: product.sku,
        barcode: product.barcode,
        trackStock: product.trackStock,
        quantityOnHand: product.quantityOnHand,
      });
      if (ok) {
        void Haptics.selectionAsync().catch(() => {});
      } else {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      }
    },
    [addItem]
  );

  const handleQuickSaleConfirm = useCallback(
    async (amount: number) => {
      setQuickSaleVisible(false);
      if (!activeTenantId) return;
      setQuickSaleBusy(true);
      try {
        const product = await getOrCreateQuickSaleProduct(activeTenantId);
        addCustomAmountItem({ id: product.id, name: product.name, unitPrice: amount });
        void Haptics.selectionAsync().catch(() => {});
      } catch {
        Alert.alert('Could not add quick sale', 'Please try again.');
      } finally {
        setQuickSaleBusy(false);
      }
    },
    [activeTenantId, addCustomAmountItem]
  );

  const renderTile = useCallback(
    ({ item }: { item: Product }) => {
      const uri = resolveDisplayImageUrl(item.imageUrl);
      const outOfStock =
        item.trackStock !== false && (item.quantityOnHand ?? 0) <= 0;
      return (
        <Pressable
          onPress={() => handleTap(item)}
          disabled={outOfStock}
          style={({ pressed }) => [
            styles.tile,
            outOfStock && styles.tileDisabled,
            pressed && !outOfStock && styles.tilePressed,
          ]}
        >
          <View style={styles.tileImageWrap}>
            {uri ? (
              <Image source={{ uri }} style={styles.tileImage} resizeMode="cover" />
            ) : (
              <ImageOff size={32} color="#9ca3af" />
            )}
          </View>
          <Text style={styles.tilePrice}>{formatCurrency(item.sellingPrice)}</Text>
        </Pressable>
      );
    },
    [handleTap]
  );

  const total = getTotal();

  return (
    <View style={styles.screen}>
      <SimpleHeader>
        <Pressable
          style={styles.modeBtn}
          accessibilityLabel="Quick sale"
          disabled={quickSaleBusy}
          onPress={() => setQuickSaleVisible(true)}
        >
          <Calculator size={22} color="#166534" />
        </Pressable>
        <Pressable style={[styles.modeBtn, styles.modeBtnActive]} accessibilityLabel="Sell">
          <ShoppingCart size={22} color="#fff" />
        </Pressable>
        <Pressable
          style={styles.modeBtn}
          accessibilityLabel="Stock"
          onPress={() => router.push('/simple/stock')}
        >
          <Boxes size={22} color="#166534" />
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

      {items.length > 0 && (
        <View style={styles.cartBar}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.cartRow}>
            {items.map((item) => (
              <View key={item.id} style={styles.cartItem}>
                {resolveDisplayImageUrl(item.imageUrl) ? (
                  <Image source={{ uri: resolveDisplayImageUrl(item.imageUrl)! }} style={styles.cartItemImage} />
                ) : (
                  <View style={[styles.cartItemImage, styles.cartItemImagePlaceholder]}>
                    <ImageOff size={18} color="#9ca3af" />
                  </View>
                )}
                <View style={styles.qtyRow}>
                  <Pressable
                    style={styles.qtyBtn}
                    accessibilityLabel="Decrease quantity"
                    onPress={() => updateQuantity(item.id, item.quantity - 1)}
                  >
                    <Minus size={16} color="#166534" />
                  </Pressable>
                  <Text style={styles.qtyText}>{item.quantity}</Text>
                  <Pressable
                    style={styles.qtyBtn}
                    accessibilityLabel="Increase quantity"
                    onPress={() => updateQuantity(item.id, item.quantity + 1)}
                  >
                    <Plus size={16} color="#166534" />
                  </Pressable>
                </View>
              </View>
            ))}
          </ScrollView>
          <Pressable
            style={styles.chargeBtn}
            accessibilityRole="button"
            onPress={() => router.push('/simple/charge')}
          >
            <Text style={styles.chargeLabel}>CHARGE</Text>
            <Text style={styles.chargeTotal}>{formatCurrency(total)}</Text>
          </Pressable>
        </View>
      )}

      <NumberPadModal
        visible={quickSaleVisible}
        title="Quick sale amount"
        onConfirm={handleQuickSaleConfirm}
        onCancel={() => setQuickSaleVisible(false)}
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
  tilePressed: { opacity: 0.7 },
  tileDisabled: { opacity: 0.35 },
  tileImageWrap: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileImage: { width: '100%', height: '100%' },
  tilePrice: {
    fontSize: 18,
    fontFamily: FontFamily.bold,
    color: '#000',
    paddingVertical: 6,
  },
  cartBar: {
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    backgroundColor: '#fff',
    paddingBottom: 8,
  },
  cartRow: { paddingHorizontal: 8, paddingTop: 8 },
  cartItem: { alignItems: 'center', marginHorizontal: 6, width: 64 },
  cartItemImage: { width: 48, height: 48, borderRadius: 10 },
  cartItemImagePlaceholder: {
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 4 },
  qtyBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#f0fdf4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyText: { fontSize: 16, fontFamily: FontFamily.bold, minWidth: 20, textAlign: 'center' },
  chargeBtn: {
    marginHorizontal: 16,
    marginTop: 8,
    backgroundColor: '#166534',
    borderRadius: 20,
    paddingVertical: 18,
    alignItems: 'center',
  },
  chargeLabel: {
    color: '#b5ed00',
    fontSize: 14,
    fontFamily: FontFamily.semiBold,
    letterSpacing: 1,
  },
  chargeTotal: {
    color: '#fff',
    fontSize: 34,
    fontFamily: FontFamily.bold,
  },
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
