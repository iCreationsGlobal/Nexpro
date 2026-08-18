import React from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { StackPageHeader } from '@/components/StackPageHeader';
import { useScreenColors } from '@/hooks/useScreenColors';
import { ScreenShell } from '@/components/ScreenShell';
import { PUBLIC_PRIVACY_POLICY_URL } from '@/constants/legal';

const sections = [
  {
    title: 'Information we collect',
    body:
      'We collect account information such as your name, email address, profile photo, business name, phone number, address, logo, and workspace settings. We also process business records you add, including customers, products, sales, invoices, expenses, quotes, jobs, and related files.',
  },
  {
    title: 'How we use information',
    body:
      'We use this information to provide business management features, keep your workspace secure, sync your data across devices, send account and business notifications, and improve African Business Suite (ABS).',
  },
  {
    title: 'Photos, files, and camera',
    body:
      'When you choose to upload logos, receipts, profile images, or scan products, the app may request access to your camera or photo library. We only use those permissions for the feature you select.',
  },
  {
    title: 'Sharing',
    body:
      'We do not sell personal information. We may share data with service providers that help run the app, such as hosting, analytics, email, messaging, payment, and storage providers, only as needed to deliver the service.',
  },
  {
    title: 'Retention and deletion',
    body:
      'We retain account and business data while your account is active or as needed for legal, security, accounting, and operational reasons. You can request account and data deletion from the app under Account or Settings.',
  },
  {
    title: 'Contact',
    body:
      'For privacy questions or deletion requests, contact support through the app or email the African Business Suite (ABS) support team.',
  },
];

export default function PrivacyPolicyScreen() {
  const { colors, textColor, mutedColor } = useScreenColors();

  return (
    <ScreenShell style={styles.screen}>
      <StackPageHeader title="Privacy Policy" subtitle="Last updated: May 20, 2026" />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={[styles.intro, { color: mutedColor }]}>
          This policy explains how African Business Suite (ABS) collects, uses, and protects information in the mobile app.
        </Text>
        <Pressable
          onPress={() => Linking.openURL(PUBLIC_PRIVACY_POLICY_URL)}
          accessibilityRole="link"
          style={styles.webLinkWrap}
        >
          <Text style={[styles.webLink, { color: colors.tint }]}>
            View full privacy policy on the web
          </Text>
          <Text style={[styles.webUrl, { color: mutedColor }]}>{PUBLIC_PRIVACY_POLICY_URL}</Text>
        </Pressable>
        {sections.map((section) => (
          <View key={section.title} style={styles.section}>
            <Text style={[styles.sectionTitle, { color: textColor }]}>{section.title}</Text>
            <Text style={[styles.sectionBody, { color: mutedColor }]}>{section.body}</Text>
          </View>
        ))}
      </ScrollView>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 20, paddingBottom: 40 },
  intro: { fontSize: 15, lineHeight: 22, marginBottom: 12 },
  webLinkWrap: { marginBottom: 20 },
  webLink: { fontSize: 15, fontWeight: '600', marginBottom: 4 },
  webUrl: { fontSize: 13, lineHeight: 18 },
  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 17, fontWeight: '700', marginBottom: 8 },
  sectionBody: { fontSize: 15, lineHeight: 22 },
});
