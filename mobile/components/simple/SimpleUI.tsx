import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { AppIcon, type AppIconName } from '@/components/AppIcon';
import { useScreenColors } from '@/hooks/useScreenColors';
import { FontFamily } from '@/constants/typography';
import type { SimplePeriodKey } from '@/utils/simplePeriods';

/** Shared building blocks for the Simple Mode screens (mirrors the web Simple Mode pages). */

export const SIMPLE_PERIOD_TABS: { key: SimplePeriodKey; label: string; filterType: string; phrase: string }[] = [
  { key: 'today', label: 'Today', filterType: 'today', phrase: 'today' },
  { key: 'week', label: 'This week', filterType: 'thisWeek', phrase: 'this week' },
  { key: 'month', label: 'This month', filterType: 'thisMonth', phrase: 'this month' },
];

export function SimpleTitle({ children }: { children: React.ReactNode }) {
  const { textColor } = useScreenColors();
  return <Text style={[styles.title, { color: textColor }]}>{children}</Text>;
}

export function SimpleBigButton({ label, icon, onPress, variant = 'primary', disabled = false, loading = false }: {
  label: string; icon?: AppIconName; onPress: () => void; variant?: 'primary' | 'outline' | 'danger';
  disabled?: boolean; loading?: boolean;
}) {
  const { colors, onTint, cardBg, borderColor, textColor } = useScreenColors();
  const primary = variant === 'primary';
  const danger = variant === 'danger';
  const fg = primary ? onTint : danger ? '#b91c1c' : textColor;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.bigButton,
        primary
          ? { backgroundColor: colors.tint }
          : { backgroundColor: cardBg, borderColor: danger ? '#fecaca' : borderColor, borderWidth: 1.5 },
        !primary && styles.bigButtonOutline,
        (pressed || disabled) && { opacity: 0.8 },
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : icon ? <AppIcon name={icon} size={primary ? 28 : 22} color={fg} /> : null}
      <Text style={[primary ? styles.bigButtonText : styles.bigButtonTextOutline, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

export function SimplePeriodTabs({ value, onChange, tabs = SIMPLE_PERIOD_TABS }: {
  value: SimplePeriodKey; onChange: (key: SimplePeriodKey) => void; tabs?: { key: SimplePeriodKey; label: string }[];
}) {
  const { borderColor, cardBg, textColor, mutedColor } = useScreenColors();
  return (
    <View style={[styles.periods, { backgroundColor: borderColor }]} accessibilityRole="tablist">
      {tabs.map((tab) => {
        const active = tab.key === value;
        return (
          <Pressable
            key={tab.key}
            onPress={() => onChange(tab.key)}
            style={[styles.period, active && { backgroundColor: cardBg }]}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
          >
            <Text style={[styles.periodText, { color: active ? textColor : mutedColor }]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function SimpleSummary({ caption, value, loading }: { caption: string; value: string; loading?: boolean }) {
  const { cardBg, borderColor, textColor, mutedColor } = useScreenColors();
  return (
    <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
      <Text style={[styles.caption, { color: mutedColor }]}>{caption}</Text>
      {loading ? <ActivityIndicator style={{ alignSelf: 'flex-start', marginTop: 8 }} /> : (
        <Text style={[styles.summaryValue, { color: textColor }]}>{value}</Text>
      )}
    </View>
  );
}

export function SimpleSearch({ value, onChange, placeholder }: {
  value: string; onChange: (text: string) => void; placeholder: string;
}) {
  const { cardBg, borderColor, textColor, mutedColor } = useScreenColors();
  return (
    <View style={[styles.search, { backgroundColor: cardBg, borderColor }]}>
      <AppIcon name="search" size={20} color={mutedColor} />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={mutedColor}
        style={[styles.searchInput, { color: textColor }]}
        autoCorrect={false}
        returnKeyType="search"
        accessibilityLabel={placeholder}
      />
    </View>
  );
}

/** One tappable row in a Simple Mode list. */
export function SimpleRow({ title, subtitle, right, rightNote, rightNoteColor, leading, onPress, busy }: {
  title: string; subtitle?: string; right?: string; rightNote?: string; rightNoteColor?: string;
  leading?: React.ReactNode; onPress: () => void; busy?: boolean;
}) {
  const { textColor, mutedColor, borderColor } = useScreenColors();
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      style={({ pressed }) => [styles.row, { borderBottomColor: borderColor }, pressed && { opacity: 0.7 }]}
      accessibilityRole="button"
      accessibilityLabel={title}
    >
      {leading}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={[styles.rowTitle, { color: textColor }]}>{title}</Text>
        {subtitle ? <Text numberOfLines={1} style={[styles.rowSub, { color: mutedColor }]}>{subtitle}</Text> : null}
      </View>
      {right || rightNote ? (
        <View style={{ alignItems: 'flex-end' }}>
          {right ? <Text style={[styles.rowRight, { color: textColor }]}>{right}</Text> : null}
          {rightNote ? <Text style={[styles.rowNote, { color: rightNoteColor || '#b45309' }]}>{rightNote}</Text> : null}
        </View>
      ) : null}
      {busy ? <ActivityIndicator /> : <AppIcon name="chevron-right" size={20} color={mutedColor} />}
    </Pressable>
  );
}

export function SimpleList({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const { cardBg, borderColor } = useScreenColors();
  return <View style={[styles.list, { backgroundColor: cardBg, borderColor }, style]}>{children}</View>;
}

export function SimpleEmpty({ text }: { text: string }) {
  const { borderColor, mutedColor } = useScreenColors();
  return (
    <View style={[styles.empty, { borderColor }]}>
      <Text style={[styles.emptyText, { color: mutedColor }]}>{text}</Text>
    </View>
  );
}

export function SimplePager({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (page: number) => void }) {
  const { mutedColor } = useScreenColors();
  if (totalPages <= 1) return null;
  return (
    <View style={styles.pager}>
      <Text style={{ color: mutedColor, fontFamily: FontFamily.regular }}>Page {page} of {totalPages}</Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <SimplePagerButton label="Previous" disabled={page <= 1} onPress={() => onChange(page - 1)} />
        <SimplePagerButton label="Next" disabled={page >= totalPages} onPress={() => onChange(page + 1)} />
      </View>
    </View>
  );
}

function SimplePagerButton({ label, disabled, onPress }: { label: string; disabled: boolean; onPress: () => void }) {
  const { borderColor, textColor } = useScreenColors();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[styles.pagerButton, { borderColor }, disabled && { opacity: 0.4 }]}
      accessibilityRole="button"
    >
      <Text style={{ color: textColor, fontFamily: FontFamily.medium }}>{label}</Text>
    </Pressable>
  );
}

/** Labelled input box used by the Simple Mode forms. */
export function SimpleField({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  const { textColor, mutedColor } = useScreenColors();
  return (
    <View style={{ gap: 6 }}>
      <Text style={[styles.fieldLabel, { color: textColor }]}>{label}</Text>
      {children}
      {hint ? <Text style={{ color: mutedColor, fontSize: 13, fontFamily: FontFamily.regular }}>{hint}</Text> : null}
    </View>
  );
}

export const simpleStyles = StyleSheet.create({
  screen: { padding: 20, gap: 16, paddingBottom: 48 },
  input: {
    height: 60,
    borderRadius: 16,
    borderWidth: 2,
    paddingHorizontal: 18,
    fontSize: 18,
    fontFamily: FontFamily.medium,
  },
  error: { color: '#b91c1c', fontSize: 15, fontFamily: FontFamily.semiBold },
});

const styles = StyleSheet.create({
  title: { fontSize: 26, fontFamily: FontFamily.semiBold },
  bigButton: {
    minHeight: 76,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 20,
  },
  bigButtonOutline: { minHeight: 58 },
  bigButtonText: { fontSize: 24, fontFamily: FontFamily.bold },
  bigButtonTextOutline: { fontSize: 17, fontFamily: FontFamily.semiBold },
  periods: { flexDirection: 'row', borderRadius: 14, padding: 4, gap: 4 },
  period: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  periodText: { fontSize: 15, fontFamily: FontFamily.medium },
  card: { borderWidth: 1, borderRadius: 20, padding: 18 },
  caption: { fontSize: 15, fontFamily: FontFamily.regular },
  summaryValue: { fontSize: 30, fontFamily: FontFamily.bold, marginTop: 4 },
  search: {
    height: 56,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 10,
  },
  searchInput: { flex: 1, fontSize: 16, fontFamily: FontFamily.regular, height: '100%' },
  list: { borderWidth: 1, borderRadius: 20, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowTitle: { fontSize: 16, fontFamily: FontFamily.semiBold },
  rowSub: { fontSize: 14, fontFamily: FontFamily.regular, marginTop: 2 },
  rowRight: { fontSize: 17, fontFamily: FontFamily.bold },
  rowNote: { fontSize: 12, fontFamily: FontFamily.semiBold, marginTop: 2 },
  empty: { borderWidth: 1, borderStyle: 'dashed', borderRadius: 20, padding: 28 },
  emptyText: { textAlign: 'center', fontSize: 15, fontFamily: FontFamily.regular },
  pager: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pagerButton: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  fieldLabel: { fontSize: 16, fontFamily: FontFamily.semiBold },
});
