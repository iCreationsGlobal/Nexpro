import { Link, router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { PrimaryButton, Screen, SecondaryButton } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { BRAND, STORAGE_KEYS } from '@/constants';

export default function AccountScreen() {
  const { customer, isAuthenticated, logout } = useAuth();
  const signInToAccount = async () => {
    await AsyncStorage.setItem(STORAGE_KEYS.authReturnTo, '/account');
    router.push('/login');
  };

  if (!isAuthenticated) {
    return (
      <Screen style={styles.center}>
        <Text style={styles.title}>Welcome to Sabito Store</Text>
        <Text style={styles.subtitle}>Sign in to manage orders, wishlist, and addresses.</Text>
        <SecondaryButton label="Sign in" onPress={signInToAccount} />
        <PrimaryButton label="Create account" onPress={() => router.push('/signup')} />
      </Screen>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.name}>{customer?.name}</Text>
        <Text style={styles.email}>{customer?.email}</Text>
        {!customer?.emailVerifiedAt ? (
          <Pressable style={styles.verifyBanner} onPress={() => router.push('/verify-email')}>
            <Text style={styles.verifyText}>Verify your email to keep your account secure</Text>
          </Pressable>
        ) : null}
      </View>

      {[
        { href: '/onboarding/address', label: 'Complete delivery setup' },
        { href: '/wishlist', label: 'Wishlist' },
        { href: '/addresses', label: 'Delivery addresses' },
        { href: '/disputes', label: 'Order issues' },
        { href: '/notifications-settings', label: 'Notifications' },
        { href: '/profile', label: 'Profile settings' },
        { href: '/track-order', label: 'Track order (guest)' },
      ].map((item) => (
        <Link key={item.href} href={item.href as never} asChild>
          <Pressable style={styles.linkRow}>
            <Text style={styles.linkLabel}>{item.label}</Text>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        </Link>
      ))}

      <Pressable style={styles.logout} onPress={logout}>
        <Text style={styles.logoutText}>Sign out</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16 },
  center: { flex: 1, justifyContent: 'center', padding: 24, gap: 12 },
  title: { fontSize: 24, fontWeight: '800', color: BRAND.text, textAlign: 'center' },
  subtitle: { color: BRAND.muted, textAlign: 'center', marginBottom: 12 },
  header: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: BRAND.border,
  },
  name: { fontSize: 20, fontWeight: '800', color: BRAND.text },
  email: { marginTop: 4, color: BRAND.muted },
  verifyBanner: {
    marginTop: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#bbf7d0',
    backgroundColor: '#f0fdf4',
    padding: 12,
  },
  verifyText: { color: BRAND.primary, fontWeight: '800' },
  linkRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: BRAND.border,
  },
  linkLabel: { fontSize: 16, fontWeight: '600', color: BRAND.text },
  chevron: { fontSize: 22, color: BRAND.muted },
  logout: { marginTop: 24, alignItems: 'center', padding: 12 },
  logoutText: { color: BRAND.danger, fontWeight: '700' },
});
