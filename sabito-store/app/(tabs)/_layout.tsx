import { Image } from 'expo-image';
import { router, Tabs } from 'expo-router';
import { Home, Package, Search, ShoppingBag, ShoppingCart, Store, User, Utensils } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BRAND } from '@/constants';
import { useCart } from '@/context/CartContext';

function HeaderTitle() {
  return (
    <View style={styles.headerTitle}>
      <Image source={require('../../assets/images/icon.png')} style={styles.headerLogo} contentFit="contain" />
      <Text style={styles.headerText}>Sabito Store</Text>
    </View>
  );
}

function HeaderActions() {
  const { cartSummary } = useCart();
  return (
    <View style={styles.headerActions}>
      <Pressable accessibilityLabel="Search" style={styles.headerIcon} onPress={() => router.push('/search')}>
        <Search color={BRAND.primary} size={20} />
      </Pressable>
      <Pressable accessibilityLabel="Cart" style={styles.headerIcon} onPress={() => router.push('/cart')}>
        <ShoppingCart color={BRAND.primary} size={20} />
        {cartSummary.itemCount > 0 ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{Math.min(cartSummary.itemCount, 99)}</Text>
          </View>
        ) : null}
      </Pressable>
      <Pressable accessibilityLabel="Account" style={styles.headerIcon} onPress={() => router.push('/account')}>
        <User color={BRAND.primary} size={20} />
      </Pressable>
    </View>
  );
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: BRAND.primary,
        tabBarInactiveTintColor: BRAND.muted,
        headerStyle: { backgroundColor: '#fff' },
        headerTintColor: BRAND.primary,
        headerTitleStyle: { fontWeight: '700' },
        headerTitle: () => <HeaderTitle />,
        headerRight: () => <HeaderActions />,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => <Home color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="store"
        options={{
          title: 'Store',
          tabBarIcon: ({ color, size }) => <Store color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="services"
        options={{
          title: 'Services',
          tabBarIcon: ({ color, size }) => <ShoppingBag color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="food"
        options={{
          title: 'Food',
          tabBarIcon: ({ color, size }) => <Utensils color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{
          title: 'Orders',
          tabBarIcon: ({ color, size }) => <Package color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  headerTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerLogo: {
    width: 30,
    height: 30,
  },
  headerText: {
    color: BRAND.text,
    fontWeight: '800',
    fontSize: 16,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingRight: 8,
  },
  headerIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    right: 2,
    top: 2,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: BRAND.danger,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
  },
});
