import React from 'react';
import {
  View,
  Text,
  Pressable,
  Modal,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon } from '@/components/AppIcon';
import { useScreenColors } from '@/hooks/useScreenColors';
import { FontFamily, FontSize } from '@/constants/typography';

export const APP_SHEET_HEIGHT_TALL = '90%';
export const APP_SHEET_HEIGHT_MEDIUM = '70%';
export const APP_SHEET_HEIGHT_COMPACT = '55%';

export type AppBottomSheetProps = {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  /** Sticky footer (actions). */
  footer?: React.ReactNode;
  /** Sheet height — tall for forms, medium/compact for pickers. */
  height?: `${number}%` | number;
  /** Scroll body (default true). Set false for FlatList children. */
  scrollable?: boolean;
  keyboardVerticalOffset?: number;
  /** Hide the top drag handle. */
  hideHandle?: boolean;
  /** Extra style on the sheet card. */
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  cardBg?: string;
  borderColor?: string;
  textColor?: string;
  mutedColor?: string;
};

/**
 * Shared ABS bottom sheet — Menu-style chrome:
 * dimmed backdrop, drag handle, title + X, Inter typography.
 */
export function AppBottomSheet({
  visible,
  title,
  onClose,
  children,
  footer,
  height = APP_SHEET_HEIGHT_TALL,
  scrollable = true,
  keyboardVerticalOffset = 0,
  hideHandle = false,
  style,
  contentContainerStyle,
  cardBg: cardBgProp,
  borderColor: borderColorProp,
  textColor: textColorProp,
  mutedColor: mutedColorProp,
}: AppBottomSheetProps) {
  const insets = useSafeAreaInsets();
  const theme = useScreenColors();
  const cardBg = cardBgProp ?? theme.cardBg;
  const borderColor = borderColorProp ?? theme.borderColor;
  const textColor = textColorProp ?? theme.textColor;
  const mutedColor = mutedColorProp ?? theme.mutedColor;
  const handleColor = theme.resolvedTheme === 'dark' ? '#52525b' : '#d4d4d8';

  const body = scrollable ? (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[styles.content, contentContainerStyle]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.body, contentContainerStyle]}>{children}</View>
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={keyboardVerticalOffset}
          style={[styles.sheetWrap, { height }]}
        >
          <View style={[styles.sheet, { backgroundColor: cardBg }, style]}>
            {!hideHandle ? (
              <View style={styles.handleWrap}>
                <View style={[styles.handle, { backgroundColor: handleColor }]} />
              </View>
            ) : null}

            <View style={styles.header}>
              <Text style={[styles.title, { color: textColor }]} numberOfLines={1}>
                {title}
              </Text>
              <Pressable
                onPress={onClose}
                hitSlop={12}
                accessibilityLabel="Close"
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.closeBtn,
                  { backgroundColor: theme.inputBg, opacity: pressed ? 0.7 : 1 },
                ]}
              >
                <AppIcon name="times" size={22} color={mutedColor} />
              </Pressable>
            </View>

            {body}

            {footer ? (
              <View
                style={[
                  styles.footer,
                  {
                    borderTopColor: borderColor,
                    backgroundColor: cardBg,
                    paddingBottom: Math.max(insets.bottom, 16),
                  },
                ]}
              >
                {footer}
              </View>
            ) : (
              <View style={{ height: Math.max(insets.bottom, 8) }} />
            )}
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

/** Section label matching Menu sheet (STORE / WORK / …). */
export function SheetSectionLabel({
  children,
  color,
}: {
  children: string;
  color?: string;
}) {
  const { mutedColor } = useScreenColors();
  return (
    <Text style={[styles.sectionLabel, { color: color ?? mutedColor }]}>{children}</Text>
  );
}

/** Selectable row matching Menu sheet (optional green active state). */
export function SheetMenuRow({
  label,
  icon,
  active = false,
  danger = false,
  disabled = false,
  onPress,
  trailing,
}: {
  label: string;
  icon?: React.ReactNode;
  active?: boolean;
  /** Red label for destructive actions. */
  danger?: boolean;
  disabled?: boolean;
  onPress: () => void;
  trailing?: React.ReactNode;
}) {
  const { textColor, mutedColor } = useScreenColors();
  const selectedBg = '#166534';
  const selectedFg = '#ffffff';
  const idleColor = danger ? '#dc2626' : textColor;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.menuRow,
        active && { backgroundColor: selectedBg },
        pressed && !active && { opacity: 0.7 },
        disabled && styles.menuRowDisabled,
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected: active, disabled }}
    >
      {icon}
      <Text
        style={[
          styles.menuRowLabel,
          { color: active ? selectedFg : idleColor },
          active && styles.menuRowLabelActive,
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
      {trailing}
      {!trailing && !active ? (
        <AppIcon name="chevron-right" size={16} color={mutedColor} />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheetWrap: {
    width: '100%',
  },
  sheet: {
    flex: 1,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    width: '100%',
    overflow: 'hidden',
  },
  handleWrap: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 4,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
  },
  title: {
    flex: 1,
    marginRight: 12,
    fontFamily: FontFamily.bold,
    fontSize: FontSize.title,
    fontWeight: '700',
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: { flex: 1 },
  body: { flex: 1 },
  content: { paddingHorizontal: 16, paddingBottom: 8 },
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 20,
    paddingTop: 16,
    alignItems: 'stretch',
  },
  sectionLabel: {
    fontFamily: FontFamily.semiBold,
    fontSize: FontSize.xs,
    fontWeight: '600',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    paddingHorizontal: 12,
    paddingTop: 14,
    paddingBottom: 8,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minHeight: 48,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
  },
  menuRowLabel: {
    flex: 1,
    fontFamily: FontFamily.medium,
    fontSize: FontSize.body,
    fontWeight: '500',
  },
  menuRowLabelActive: {
    fontFamily: FontFamily.semiBold,
    fontWeight: '600',
  },
  menuRowDisabled: {
    opacity: 0.55,
  },
});
