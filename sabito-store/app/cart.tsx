import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { EmptyState, PrimaryButton, Screen, SecondaryButton } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { useCart } from '@/context/CartContext';
import { BRAND, STORAGE_KEYS } from '@/constants';
import { formatCurrency, resolveImageUrl } from '@/utils/format';
import { Image } from 'expo-image';

export default function CartScreen() {
  const { items, cartSummary, updateQuantity, removeItem } = useCart();
  const { isAuthenticated } = useAuth();

  const startAuthForCheckout = async (destination: '/login' | '/signup') => {
    await AsyncStorage.setItem(STORAGE_KEYS.checkoutIntent, '/checkout');
    router.push(destination);
  };

  if (items.length === 0) {
    return (
      <Screen>
        <EmptyState title="Your cart is empty" message="Browse products and add items from one store at a time." />
      </Screen>
    );
  }

  return (
    <Screen>
      <FlatList
        data={items}
        keyExtractor={(item) => item.listingId}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.storeLabel}>From {cartSummary.store?.displayName}</Text>
            <Text style={styles.singleStoreNote}>One store per order. Adding from another store replaces your current cart.</Text>
            {cartSummary.store?.deliveryEnabled ? (
              <Text style={styles.fulfillmentHint}>Delivery fee is calculated at checkout when you choose delivery.</Text>
            ) : cartSummary.store?.pickupEnabled ? (
              <Text style={styles.fulfillmentHint}>This order will be prepared for pickup.</Text>
            ) : null}
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.row}>
            {item.image ? (
              <Image source={{ uri: resolveImageUrl(item.image) || undefined }} style={styles.thumb} />
            ) : (
              <View style={[styles.thumb, styles.thumbPlaceholder]} />
            )}
            <View style={styles.info}>
              <Text style={styles.title}>{item.title}</Text>
              <Text style={styles.price}>{formatCurrency(item.unitPrice, item.storeCurrency)}</Text>
              <View style={styles.qtyRow}>
                <Pressable style={styles.qtyBtn} onPress={() => updateQuantity(item.listingId, item.quantity - 1)}>
                  <Text>-</Text>
                </Pressable>
                <Text style={styles.qty}>{item.quantity}</Text>
                <Pressable style={styles.qtyBtn} onPress={() => updateQuantity(item.listingId, item.quantity + 1)}>
                  <Text>+</Text>
                </Pressable>
                <Pressable onPress={() => removeItem(item.listingId)}>
                  <Text style={styles.remove}>Remove</Text>
                </Pressable>
              </View>
            </View>
          </View>
        )}
        ListFooterComponent={
          <View style={styles.footer}>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Subtotal</Text>
              <Text style={styles.totalValue}>{formatCurrency(cartSummary.subtotal, cartSummary.currency)}</Text>
            </View>
            {isAuthenticated ? (
              <PrimaryButton label="Proceed to checkout" onPress={() => router.push('/checkout')} />
            ) : (
              <>
                <SecondaryButton label="Sign in to checkout" onPress={() => startAuthForCheckout('/login')} />
                <PrimaryButton label="Create account to checkout" onPress={() => startAuthForCheckout('/signup')} />
              </>
            )}
          </View>
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { padding: 16 },
  header: { marginBottom: 12, gap: 6 },
  storeLabel: { fontWeight: '700', color: BRAND.text },
  singleStoreNote: { color: BRAND.muted, lineHeight: 20 },
  fulfillmentHint: { color: BRAND.primary, fontSize: 13, fontWeight: '600' },
  row: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: BRAND.border,
  },
  thumb: { width: 72, height: 72, borderRadius: 8 },
  thumbPlaceholder: { backgroundColor: '#e2e8f0' },
  info: { flex: 1, marginLeft: 12 },
  title: { fontWeight: '600', color: BRAND.text },
  price: { marginTop: 4, fontWeight: '700', color: BRAND.primary },
  qtyRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 8 },
  qtyBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: BRAND.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qty: { fontWeight: '700', minWidth: 20, textAlign: 'center' },
  remove: { marginLeft: 8, color: BRAND.danger, fontWeight: '600' },
  footer: { marginTop: 16, gap: 12 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  totalLabel: { fontSize: 16, color: BRAND.muted },
  totalValue: { fontSize: 18, fontWeight: '800', color: BRAND.text },
});
