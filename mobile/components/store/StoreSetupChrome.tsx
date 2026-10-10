import React, { useCallback, useMemo } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon, type AppIconName } from '@/components/AppIcon';
import { BackButton } from '@/components/BackButton';
import { useStoreSetup } from '@/context/StoreSetupContext';
import { useScreenColors } from '@/hooks/useScreenColors';
import { BRAND_GREEN } from '@/constants/brand';
import {
  canVisitSetupStep,
  getStepProgress,
  STORE_SETUP_STEP_META,
  type StoreSetupStepId,
} from '@/utils/storeSetupFlow';

type StoreSetupChromeProps = {
  stepId: StoreSetupStepId;
  /** @deprecated Gap flags no longer filter progress; kept for call-site compat. */
  gapFlags?: unknown;
  children: React.ReactNode;
  onBack?: () => void;
  /** Secondary Skip — rendered below primary Continue as text-only. */
  onSkip?: () => void;
  skipLabel?: string;
  skipDisabled?: boolean;
  onContinue: () => void;
  continueLabel?: string;
  /** Optional leading icon on the primary CTA (e.g. rocket on Go live). */
  continueIcon?: AppIconName;
  continueDisabled?: boolean;
  continuing?: boolean;
  hideFooter?: boolean;
  /** Editing a live store: no wizard progress, and Back returns to where the editor was opened. */
  editing?: boolean;
};

/**
 * Flat wizard chrome: tappable full-step progress + back + content + Continue / Skip.
 * In edit mode (live store) it is a plain editor: title, back, content, Save.
 */
export function StoreSetupChrome({
  stepId,
  children,
  onBack,
  onSkip,
  skipLabel = 'Skip',
  skipDisabled,
  onContinue,
  continueLabel = 'Continue',
  continueIcon,
  continueDisabled,
  continuing,
  hideFooter,
  editing = false,
}: StoreSetupChromeProps) {
  const insets = useSafeAreaInsets();
  const { bg, textColor, mutedColor, borderColor, headerBg } = useScreenColors();
  const { hasBasics, goToStep, goBackFrom, closeEditor } = useStoreSetup();
  const progress = getStepProgress(stepId);
  const title = STORE_SETUP_STEP_META[stepId]?.title || 'Store setup';

  const handleBack = useCallback(() => {
    if (onBack) {
      onBack();
      return;
    }
    if (editing) {
      closeEditor();
      return;
    }
    goBackFrom(stepId);
  }, [closeEditor, editing, goBackFrom, onBack, stepId]);

  const steps = progress.steps;

  const segmentStates = useMemo(
    () =>
      steps.map((step, i) => {
        const reachable = canVisitSetupStep(step, { hasBasics });
        const isCurrent = step === stepId;
        const isPast = i < progress.index - 1;
        return { step, reachable, isCurrent, isPast };
      }),
    [hasBasics, progress.index, stepId, steps]
  );

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View
        style={[
          styles.header,
          {
            backgroundColor: headerBg,
            borderBottomColor: borderColor,
            paddingTop: insets.top > 0 ? insets.top : 12,
          },
        ]}
      >
        <View style={styles.headerRow}>
          <BackButton onPress={handleBack} />
          <View style={styles.titleWrap}>
            <Text style={[styles.title, { color: textColor }]} numberOfLines={1}>
              {title}
            </Text>
            {editing ? null : (
              <Text style={[styles.progress, { color: BRAND_GREEN }]}>
                {progress.index} of {progress.total}
              </Text>
            )}
          </View>
          <View style={styles.rightPlaceholder} />
        </View>

        {editing ? null : (
          <View style={styles.segmentTrack}>
            {segmentStates.map(({ step, reachable, isCurrent, isPast }) => {
              const fill = isCurrent || isPast ? BRAND_GREEN : borderColor;
              const label = STORE_SETUP_STEP_META[step]?.progressLabel || '';
              return (
                <Pressable
                  key={step}
                  onPress={() => {
                    if (!reachable || isCurrent || continuing) return;
                    goToStep(step);
                  }}
                  disabled={!reachable || isCurrent || continuing}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isCurrent, disabled: !reachable }}
                  accessibilityLabel={`${label} step${isCurrent ? ', current' : ''}${reachable ? '' : ', unlock after saving store name'}`}
                  hitSlop={{ top: 8, bottom: 8 }}
                  style={({ pressed }) => [
                    styles.segmentHit,
                    pressed && reachable && !isCurrent && styles.pressed,
                    !reachable && styles.segmentLocked,
                  ]}
                >
                  <View style={[styles.segment, { backgroundColor: fill }]} />
                  <Text
                    style={[
                      styles.segmentLabel,
                      {
                        color: isCurrent ? BRAND_GREEN : mutedColor,
                        fontWeight: isCurrent ? '700' : '500',
                      },
                    ]}
                    numberOfLines={1}
                  >
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>

      {!hideFooter ? (
        <View
          style={[
            styles.footer,
            {
              borderTopColor: borderColor,
              paddingBottom: Math.max(insets.bottom, 16),
              backgroundColor: bg,
            },
          ]}
        >
          <Pressable
            onPress={onContinue}
            disabled={continueDisabled || continuing}
            accessibilityRole="button"
            accessibilityLabel={continueLabel}
            style={({ pressed }) => [
              styles.primaryBtn,
              (pressed || continueDisabled || continuing) && styles.pressed,
              continueDisabled && styles.primaryDisabled,
            ]}
          >
            {continuing ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <View style={styles.primaryContent}>
                {continueIcon ? <AppIcon name={continueIcon} size={20} color="#fff" /> : null}
                <Text style={styles.primaryLabel}>{continueLabel}</Text>
              </View>
            )}
          </Pressable>
          {onSkip ? (
            <Pressable
              onPress={onSkip}
              disabled={skipDisabled || continuing}
              accessibilityRole="button"
              accessibilityLabel={skipLabel}
              style={({ pressed }) => [
                styles.skipBtn,
                (pressed || skipDisabled || continuing) && styles.pressed,
              ]}
            >
              <Text style={[styles.skipLabel, { color: mutedColor }]}>{skipLabel}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingBottom: 10,
    paddingHorizontal: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  titleWrap: {
    flex: 1,
    alignItems: 'center',
    minWidth: 0,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  progress: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 2,
    textAlign: 'center',
  },
  rightPlaceholder: { width: 40 },
  segmentTrack: {
    flexDirection: 'row',
    gap: 4,
    marginTop: 10,
  },
  segmentHit: {
    flex: 1,
    minHeight: 28,
    justifyContent: 'center',
    gap: 4,
  },
  segment: {
    height: 4,
    borderRadius: 2,
  },
  segmentLabel: {
    fontSize: 9,
    textAlign: 'center',
  },
  segmentLocked: {
    opacity: 0.45,
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 24,
    gap: 16,
  },
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 24,
    paddingTop: 12,
    gap: 10,
  },
  skipBtn: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  skipLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
  primaryBtn: {
    minHeight: 52,
    borderRadius: 12,
    backgroundColor: BRAND_GREEN,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  primaryContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  primaryDisabled: {
    opacity: 0.45,
  },
  primaryLabel: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.85,
  },
});
