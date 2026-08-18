import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { PrimaryButton, Screen, SecondaryButton } from '@/components/ui';
import { BRAND, STORAGE_KEYS } from '@/constants';

const STEPS = [
  {
    eyebrow: 'Food-first marketplace',
    title: 'Order meals, groceries, and drinks from Sabito vendors.',
    body: 'Discover restaurants, browse menus, add items to one vendor cart, and checkout with Paystack.',
  },
  {
    eyebrow: 'Delivery made clear',
    title: 'Save your delivery details once.',
    body: 'Use your default address at checkout, see delivery fees early, and unlock free-delivery offers when vendors add them.',
  },
  {
    eyebrow: 'Track every order',
    title: 'Follow active orders from payment to delivery.',
    body: 'See status updates, contact the seller, confirm receipt, and open an issue when something needs attention.',
  },
];

export default function OnboardingScreen() {
  const [index, setIndex] = useState(0);
  const step = STEPS[index];
  const isLast = index === STEPS.length - 1;

  const progress = useMemo(() => STEPS.map((_, itemIndex) => itemIndex <= index), [index]);

  const completeOnboarding = async (destination: '/(tabs)' | '/signup' | '/login') => {
    await AsyncStorage.setItem(STORAGE_KEYS.onboardingComplete, 'true');
    router.replace(destination);
  };

  return (
    <Screen style={styles.container}>
      <View style={styles.hero}>
        <Text style={styles.brand}>Sabito Store</Text>
        <Text style={styles.eyebrow}>{step.eyebrow}</Text>
        <Text style={styles.title}>{step.title}</Text>
        <Text style={styles.body}>{step.body}</Text>

        <View style={styles.progressRow}>
          {progress.map((active, itemIndex) => (
            <View key={itemIndex} style={[styles.progressDot, active && styles.progressDotActive]} />
          ))}
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Set up faster</Text>
        <Text style={styles.cardText}>Create an account now to save addresses, manage orders, and keep your wishlist synced.</Text>
      </View>

      <View style={styles.actions}>
        {isLast ? (
          <>
            <SecondaryButton label="Browse first" onPress={() => completeOnboarding('/(tabs)')} />
            <SecondaryButton label="Sign in" onPress={() => completeOnboarding('/login')} />
            <PrimaryButton label="Create account" onPress={() => completeOnboarding('/signup')} />
          </>
        ) : (
          <>
            <Pressable style={styles.skip} onPress={() => completeOnboarding('/(tabs)')}>
              <Text style={styles.skipText}>Skip for now</Text>
            </Pressable>
            <PrimaryButton label="Next" onPress={() => setIndex((current) => current + 1)} />
          </>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, justifyContent: 'space-between' },
  hero: {
    marginTop: 36,
    borderRadius: 24,
    backgroundColor: '#ecfccb',
    borderWidth: 1,
    borderColor: '#bef264',
    padding: 22,
  },
  brand: { color: BRAND.primary, fontWeight: '900', fontSize: 16, marginBottom: 28 },
  eyebrow: { color: BRAND.primary, fontWeight: '800', textTransform: 'uppercase', fontSize: 12 },
  title: { marginTop: 10, color: BRAND.text, fontSize: 29, lineHeight: 36, fontWeight: '900' },
  body: { marginTop: 12, color: BRAND.muted, lineHeight: 22, fontSize: 15 },
  progressRow: { flexDirection: 'row', gap: 8, marginTop: 28 },
  progressDot: { width: 22, height: 6, borderRadius: 999, backgroundColor: '#d9f99d' },
  progressDotActive: { width: 34, backgroundColor: BRAND.primary },
  card: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: BRAND.border,
    borderRadius: 16,
    padding: 16,
  },
  cardTitle: { color: BRAND.text, fontSize: 16, fontWeight: '800' },
  cardText: { color: BRAND.muted, marginTop: 6, lineHeight: 20 },
  actions: { gap: 10 },
  skip: { alignItems: 'center', paddingVertical: 12 },
  skipText: { color: BRAND.muted, fontWeight: '700' },
});

