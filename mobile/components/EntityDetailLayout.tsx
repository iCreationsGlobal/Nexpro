import React from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { Stack, useRouter } from 'expo-router';

import { AppIcon } from '@/components/AppIcon';
import {
  AppBottomSheet,
  APP_SHEET_HEIGHT_COMPACT,
  SheetMenuRow,
} from '@/components/AppBottomSheet';
import { useScreenColors } from '@/hooks/useScreenColors';
import { FontFamily, FontSize } from '@/constants/typography';

type EntityDetailHeaderProps = {
  title: string;
  headerRight?: () => React.ReactNode;
};

export type DetailMoreAction = {
  key?: string;
  label: string;
  onPress: () => void;
  icon?: React.ComponentProps<typeof AppIcon>['name'];
  variant?: 'outline' | 'danger';
  disabled?: boolean;
  loading?: boolean;
};

/** @deprecated Prefer useScreenColors — kept for backward compatibility */
export function useEntityDetailTheme() {
  const screen = useScreenColors();
  return {
    colors: screen.colors,
    bg: screen.bg,
    cardBg: screen.cardBg,
    borderColor: screen.borderColor,
    textColor: screen.textColor,
    mutedColor: screen.mutedColor,
  };
}

export function EntityDetailHeader({ title, headerRight }: EntityDetailHeaderProps) {
  const router = useRouter();
  const { colors } = useScreenColors();
  return (
    <Stack.Screen
      options={{
        title,
        headerShown: true,
        headerBackTitle: 'Back',
        headerTintColor: colors.tint,
        headerRight,
        headerLeft: () => (
          <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
            <AppIcon name="chevron-left" size={18} color={colors.tint} />
          </Pressable>
        ),
      }}
    />
  );
}

export function DetailLoading({ title }: { title: string }) {
  const { bg, colors, mutedColor } = useScreenColors();
  return (
    <>
      <EntityDetailHeader title={title} />
      <View style={[styles.center, { backgroundColor: bg }]}>
        <ActivityIndicator color={colors.tint} />
        <Text style={[styles.loadingText, { color: mutedColor }]}>Loading...</Text>
      </View>
    </>
  );
}

export function DetailNotFound({ title, entityLabel }: { title: string; entityLabel: string }) {
  const router = useRouter();
  const { bg, colors, mutedColor } = useScreenColors();
  return (
    <>
      <EntityDetailHeader title={title} />
      <View style={[styles.center, { backgroundColor: bg }]}>
        <Text style={{ color: mutedColor }}>{entityLabel} not found</Text>
        <Pressable onPress={() => router.back()} style={{ marginTop: 16 }}>
          <Text style={{ color: colors.tint, fontWeight: '600' }}>Go back</Text>
        </Pressable>
      </View>
    </>
  );
}

export function DetailRow({
  label,
  value,
  valueColor,
  children,
}: {
  label: string;
  value?: string | number | null;
  valueColor?: string;
  children?: React.ReactNode;
}) {
  const { mutedColor, textColor } = useScreenColors();
  return (
    <View style={styles.row}>
      <Text style={[styles.label, { color: mutedColor }]}>{label}</Text>
      {children ?? (
        <Text style={[styles.value, { color: valueColor ?? textColor }]}>{value ?? '—'}</Text>
      )}
    </View>
  );
}

export function DetailCard({ children }: { children: React.ReactNode }) {
  const { cardBg, borderColor } = useScreenColors();
  return (
    <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>{children}</View>
  );
}

export function DetailHeroCard({
  eyebrow,
  title,
  message,
  metricLabel,
  metricValue,
  secondaryLabel,
  secondaryValue,
  secondaryIcon = 'archive',
  showCheck = true,
}: {
  eyebrow?: string;
  title: string;
  message?: string;
  metricLabel: string;
  metricValue: string;
  secondaryLabel?: string;
  secondaryValue?: string;
  secondaryIcon?: React.ComponentProps<typeof AppIcon>['name'];
  showCheck?: boolean;
}) {
  return (
    <View style={styles.heroCard}>
      <View style={styles.heroDecorOne} />
      <View style={styles.heroDecorTwo} />
      {eyebrow ? (
        <View style={styles.heroPill}>
          <Text style={styles.heroPillText}>{eyebrow}</Text>
        </View>
      ) : null}
      <View style={styles.heroStatusRow}>
        <Text style={styles.heroTitle}>{title}</Text>
        {showCheck ? (
          <View style={styles.heroCheckInline}>
            <AppIcon name="check" size={14} color="#047857" strokeWidth={3} />
          </View>
        ) : null}
      </View>
      {message ? <Text style={styles.heroMessage}>{message}</Text> : null}
      <View style={styles.heroDivider} />
      <View style={styles.heroMetrics}>
        <View style={styles.heroMetricBlock}>
          <Text style={styles.heroMetricLabel}>{metricLabel}</Text>
          <Text style={styles.heroAmount} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
            {metricValue}
          </Text>
        </View>
        {secondaryLabel || secondaryValue ? (
          <>
            <View style={styles.heroMetricDivider} />
            <View style={styles.heroSecondaryBlock}>
              <AppIcon name={secondaryIcon} size={18} color="#d1fae5" />
              <View style={styles.heroSecondaryTextBlock}>
                {secondaryLabel ? <Text style={styles.heroSecondaryLabel}>{secondaryLabel}</Text> : null}
                {secondaryValue ? <Text style={styles.heroSecondaryValue}>{secondaryValue}</Text> : null}
              </View>
            </View>
          </>
        ) : null}
      </View>
    </View>
  );
}

export function DetailSectionCard({
  title,
  icon,
  children,
  compact,
}: {
  title?: string;
  icon?: React.ComponentProps<typeof AppIcon>['name'];
  children: React.ReactNode;
  compact?: boolean;
}) {
  const { cardBg, borderColor, colors, textColor } = useScreenColors();
  return (
    <View style={[styles.card, compact && styles.compactCard, { backgroundColor: cardBg, borderColor }]}>
      {title ? (
        <View style={styles.cardHeadingRow}>
          {icon ? (
            <View style={styles.iconBadge}>
              <AppIcon name={icon} size={18} color={colors.tint} />
            </View>
          ) : null}
          <Text style={[styles.cardHeading, { color: textColor }]}>{title}</Text>
        </View>
      ) : null}
      <View style={title ? styles.cardBody : undefined}>{children}</View>
    </View>
  );
}

export function DetailInfoRow({
  label,
  value,
  valueColor,
  children,
}: {
  icon?: React.ComponentProps<typeof AppIcon>['name'];
  label: string;
  value?: string | number | null;
  valueColor?: string;
  children?: React.ReactNode;
}) {
  const { mutedColor, textColor } = useScreenColors();
  return (
    <View style={styles.infoRow}>
      <View style={styles.infoContent}>
        <Text style={[styles.infoLabel, { color: mutedColor }]}>{label}</Text>
        {children ?? (
          <Text style={[styles.infoText, { color: valueColor ?? textColor }]}>{value ?? '—'}</Text>
        )}
      </View>
    </View>
  );
}

export function DetailFooter({ children }: { children: React.ReactNode }) {
  const { cardBg, borderColor } = useScreenColors();
  return (
    <View style={[styles.footer, { backgroundColor: cardBg, borderTopColor: borderColor }]}>
      {children}
    </View>
  );
}

export function DetailActionButton({
  label,
  onPress,
  icon,
  variant = 'outline',
  disabled,
  loading,
}: {
  label: string;
  onPress: () => void;
  icon?: React.ComponentProps<typeof AppIcon>['name'];
  variant?: 'primary' | 'outline' | 'danger';
  disabled?: boolean;
  loading?: boolean;
}) {
  const { colors, borderColor, textColor } = useScreenColors();
  const isPrimary = variant === 'primary';
  const isDanger = variant === 'danger';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={[
        styles.actionBtn,
        isPrimary && { backgroundColor: colors.tint, borderColor: colors.tint },
        isDanger && { borderColor: '#ef4444' },
        !isPrimary && !isDanger && { borderColor },
        (disabled || loading) && { opacity: 0.6 },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={isPrimary ? '#fff' : colors.tint} size="small" />
      ) : (
        <>
          {icon ? (
            <AppIcon
              name={icon}
              size={18}
              color={isPrimary ? '#fff' : isDanger ? '#ef4444' : colors.tint}
            />
          ) : null}
          <Text
            style={[
              styles.actionText,
              { color: isPrimary ? '#fff' : isDanger ? '#ef4444' : textColor },
            ]}
          >
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

export function DetailMoreActions({
  actions,
  disabled,
  title = 'More actions',
  label = 'More',
}: {
  actions: DetailMoreAction[];
  disabled?: boolean;
  title?: string;
  label?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const { colors, cardBg, borderColor, textColor, mutedColor } = useScreenColors();
  const visibleActions = actions.filter(Boolean);

  if (visibleActions.length === 0) return null;

  return (
    <>
      <DetailActionButton
        label={label}
        icon="ellipsis-v"
        onPress={() => setOpen(true)}
        disabled={disabled}
      />
      <AppBottomSheet
        visible={open}
        title={title}
        onClose={() => {
          if (!disabled) setOpen(false);
        }}
        height={APP_SHEET_HEIGHT_COMPACT}
        cardBg={cardBg}
        borderColor={borderColor}
        textColor={textColor}
        mutedColor={mutedColor}
      >
        {visibleActions.map((action) => {
          const isDanger = action.variant === 'danger';
          const isDisabled = disabled || action.disabled || action.loading;
          return (
            <SheetMenuRow
              key={action.key ?? action.label}
              label={action.label}
              danger={isDanger}
              disabled={isDisabled}
              icon={
                action.icon ? (
                  <AppIcon
                    name={action.icon}
                    size={18}
                    color={isDanger ? '#dc2626' : colors.tint}
                  />
                ) : undefined
              }
              onPress={() => {
                setOpen(false);
                action.onPress();
              }}
              trailing={
                action.loading ? (
                  <ActivityIndicator size="small" color={isDanger ? '#dc2626' : colors.tint} />
                ) : undefined
              }
            />
          );
        })}
      </AppBottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  loadingText: {
    marginTop: 12,
    fontFamily: FontFamily.medium,
    fontSize: FontSize.sm,
    fontWeight: '500',
  },
  backBtn: { paddingHorizontal: 8, paddingVertical: 6 },
  heroCard: {
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: '#047857',
    borderColor: '#059669',
    borderWidth: 1,
    borderRadius: 14,
    padding: 22,
    marginBottom: 16,
    minHeight: 208,
  },
  heroDecorOne: {
    position: 'absolute',
    right: 28,
    top: 18,
    width: 104,
    height: 104,
    borderRadius: 52,
    borderWidth: 12,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  heroDecorTwo: {
    position: 'absolute',
    right: -30,
    bottom: -34,
    width: 172,
    height: 172,
    borderRadius: 86,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  heroPill: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.24)',
    backgroundColor: 'rgba(0,0,0,0.12)',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  heroPillText: {
    color: '#d1fae5',
    fontFamily: FontFamily.bold,
    fontSize: FontSize.xs,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  heroStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 18 },
  heroTitle: {
    flexShrink: 1,
    color: '#fff',
    fontFamily: FontFamily.bold,
    fontSize: FontSize.display,
    lineHeight: 34,
    fontWeight: '700',
  },
  heroCheckInline: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  heroMessage: {
    color: '#d1fae5',
    fontFamily: FontFamily.semiBold,
    fontSize: FontSize.sm,
    fontWeight: '600',
    marginTop: 8,
  },
  heroDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.16)', marginTop: 14, marginBottom: 12 },
  heroMetrics: { flexDirection: 'row', alignItems: 'center' },
  heroMetricBlock: { flex: 1.35, minWidth: 0, paddingRight: 8 },
  heroMetricLabel: {
    color: '#d1fae5',
    fontFamily: FontFamily.semiBold,
    fontSize: FontSize.xs,
    fontWeight: '600',
    marginBottom: 4,
  },
  heroAmount: {
    color: '#fff',
    fontFamily: FontFamily.bold,
    fontSize: FontSize.xl,
    lineHeight: 26,
    fontWeight: '700',
  },
  heroMetricDivider: { width: 1, height: 44, backgroundColor: 'rgba(255,255,255,0.15)', marginHorizontal: 12 },
  heroSecondaryBlock: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  heroSecondaryTextBlock: { flex: 1 },
  heroSecondaryLabel: {
    color: '#a7f3d0',
    fontFamily: FontFamily.semiBold,
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 3,
  },
  heroSecondaryValue: {
    color: '#d1fae5',
    fontFamily: FontFamily.bold,
    fontSize: FontSize.md,
    fontWeight: '700',
  },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    marginBottom: 14,
  },
  compactCard: { paddingVertical: 14 },
  cardHeadingRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconBadge: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#dcfce7',
  },
  cardHeading: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.md,
    fontWeight: '700',
  },
  cardBody: { marginTop: 16 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  infoContent: { flex: 1, minWidth: 0 },
  infoLabel: {
    fontFamily: FontFamily.semiBold,
    fontSize: FontSize.xs,
    fontWeight: '600',
    marginBottom: 4,
  },
  infoText: {
    fontFamily: FontFamily.semiBold,
    fontSize: FontSize.md,
    lineHeight: 20,
    fontWeight: '600',
  },
  row: { marginBottom: 14 },
  label: {
    fontFamily: FontFamily.medium,
    fontSize: FontSize.xs,
    marginBottom: 4,
    fontWeight: '500',
  },
  value: {
    fontFamily: FontFamily.medium,
    fontSize: FontSize.body,
    fontWeight: '500',
  },
  footer: {
    borderTopWidth: 1,
    padding: 16,
    paddingBottom: 24,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  actionBtn: {
    flex: 1,
    minWidth: 120,
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  actionText: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.md,
    fontWeight: '700',
  },
});
