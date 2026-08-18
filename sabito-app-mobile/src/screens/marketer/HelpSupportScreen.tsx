import React from 'react';
import { View, Text, StyleSheet, StatusBar, Linking, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MessageCircle, Mail, ExternalLink } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { getTheme } from '../../constants/themes';
import COLORS from '../../constants/colors';
import { SPACING, FONT_SIZES, FONT_WEIGHTS } from '../../constants/sizes';
import BackButton from '../../components/common/BackButton';

type Props = { navigation: any };

const WHATSAPP = '233269056851';
const SUPPORT_EMAIL = 'support@sabito.app';

const HelpSupportScreen: React.FC<Props> = ({ navigation }) => {
  const { theme, effectiveTheme } = useTheme();
  const { colors, isDark } = getTheme(effectiveTheme || theme);

  const openWhatsApp = () => {
    Linking.openURL(`https://wa.me/${WHATSAPP}?text=${encodeURIComponent('Hi Sabito support')}`);
  };

  const openEmail = () => {
    Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Sabito marketer support')}`);
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={[styles.headerTitle, { color: colors.text }]}>Help & support</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.content}>
        <Text style={[styles.intro, { color: colors.textSecondary }]}>
          Need help with partnerships, referrals, or cashouts? Reach the Sabito team.
        </Text>

        <TouchableOpacity
          style={[styles.row, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}
          onPress={openWhatsApp}
        >
          <MessageCircle size={22} color={COLORS.APP_GREEN} strokeWidth={1.5} />
          <View style={styles.rowText}>
            <Text style={[styles.label, { color: colors.text }]}>WhatsApp</Text>
            <Text style={[styles.sub, { color: colors.textSecondary }]}>Chat with support</Text>
          </View>
          <ExternalLink size={18} color={colors.iconSecondary} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.row, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}
          onPress={openEmail}
        >
          <Mail size={22} color={COLORS.APP_GREEN} strokeWidth={1.5} />
          <View style={styles.rowText}>
            <Text style={[styles.label, { color: colors.text }]}>Email</Text>
            <Text style={[styles.sub, { color: colors.textSecondary }]}>{SUPPORT_EMAIL}</Text>
          </View>
          <ExternalLink size={18} color={colors.iconSecondary} />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
  },
  headerTitle: { fontSize: FONT_SIZES.lg, fontWeight: FONT_WEIGHTS.semibold },
  content: { padding: 16, gap: 12 },
  intro: { fontSize: FONT_SIZES.md, lineHeight: 22, marginBottom: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
  },
  rowText: { flex: 1 },
  label: { fontSize: FONT_SIZES.md, fontWeight: FONT_WEIGHTS.semibold },
  sub: { fontSize: FONT_SIZES.sm, marginTop: 2 },
});

export default HelpSupportScreen;
