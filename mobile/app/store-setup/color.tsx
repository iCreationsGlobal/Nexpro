import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Alert, ActivityIndicator } from 'react-native';

import { FeatureAccessDenied } from '@/components/FeatureAccessDenied';
import { StoreSetupChrome } from '@/components/store/StoreSetupChrome';
import { useAuth } from '@/context/AuthContext';
import { useStoreSetup, useStoreSetupEditing } from '@/context/StoreSetupContext';
import { useScreenColors } from '@/hooks/useScreenColors';
import { STORE_PRIMARY_FALLBACK } from '@/utils/onlineStoreDefaults';
import { BRAND_GREEN } from '@/constants/brand';
import { AppIcon } from '@/components/AppIcon';
import { getErrorMessage } from '@/utils/errorMessages';

const THEME_PRESETS = [
  { label: 'ABS Green', value: '#166534' },
  { label: 'Forest', value: '#14532d' },
  { label: 'Emerald', value: '#047857' },
  { label: 'Dark Green', value: '#064e3b' },
  { label: 'Sky', value: '#0369a1' },
  { label: 'Amber', value: '#b45309' },
  { label: 'Violet', value: '#7c3aed' },
  { label: 'Slate', value: '#0f172a' },
];

/**
 * Step 4 — Brand color presets when org has no primary color. Skip → #166534.
 * Navigate first; color save runs in the background.
 */
export default function StoreSetupColorScreen() {
  const { hasFeature } = useAuth();
  const { textColor, mutedColor, borderColor } = useScreenColors();
  const { loading, gapFlags, defaults, settings, persistSoftAndAdvance, saveLiveEdit, closeEditor } =
    useStoreSetup();
  const editing = useStoreSetupEditing();
  const [selected, setSelected] = useState(
    () => String(settings?.primaryColor || defaults.primaryColor || STORE_PRIMARY_FALLBACK)
  );
  const [saving, setSaving] = useState(false);
  const seededFromSavedRef = useRef(false);

  // Editors open before the saved settings arrive; start from the saved colour once they do.
  useEffect(() => {
    if (!editing || loading || seededFromSavedRef.current) return;
    seededFromSavedRef.current = true;
    if (settings?.primaryColor) setSelected(String(settings.primaryColor));
  }, [editing, loading, settings?.primaryColor]);

  const persistAndAdvance = useCallback(
    (color: string) => {
      persistSoftAndAdvance('color', { primaryColor: color }, { primaryColor: color });
    },
    [persistSoftAndAdvance]
  );

  const onContinue = useCallback(async () => {
    if (editing) {
      if (selected.toLowerCase() === String(settings?.primaryColor || '').toLowerCase()) {
        closeEditor();
        return;
      }
      setSaving(true);
      try {
        await saveLiveEdit({ primaryColor: selected });
        closeEditor();
      } catch (error) {
        Alert.alert('Could not save', getErrorMessage(error, 'Failed to save brand color.'));
      } finally {
        setSaving(false);
      }
      return;
    }
    persistAndAdvance(selected);
  }, [closeEditor, editing, persistAndAdvance, saveLiveEdit, selected, settings?.primaryColor]);

  const onSkip = useCallback(() => {
    persistAndAdvance(STORE_PRIMARY_FALLBACK);
  }, [persistAndAdvance]);

  if (!hasFeature('paymentsExpenses')) {
    return <FeatureAccessDenied message="Online store is not enabled for your workspace." />;
  }

  if (editing && loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={BRAND_GREEN} />
      </View>
    );
  }

  return (
    <StoreSetupChrome
      stepId="color"
      gapFlags={gapFlags}
      onSkip={editing ? undefined : onSkip}
      skipLabel="Skip"
      onContinue={() => {
        void onContinue();
      }}
      continueLabel={editing ? 'Save' : 'Continue'}
      continuing={saving}
      editing={editing}
    >
      <Text style={[styles.headline, { color: textColor }]}>{editing ? 'Brand color' : 'Pick a brand color'}</Text>
      <Text style={[styles.body, { color: mutedColor }]}>
        {editing
          ? 'Used for buttons and accents on your store.'
          : 'Used for buttons and accents on your store. Skip to use ABS green.'}
      </Text>

      <View style={styles.grid}>
        {THEME_PRESETS.map((preset) => {
          const active = selected.toLowerCase() === preset.value.toLowerCase();
          return (
            <Pressable
              key={preset.value}
              onPress={() => setSelected(preset.value)}
              style={({ pressed }) => [
                styles.swatch,
                { borderColor: active ? BRAND_GREEN : borderColor },
                active && styles.swatchActive,
                pressed && styles.pressed,
              ]}
            >
              <View style={[styles.dot, { backgroundColor: preset.value }]}>
                {active ? <AppIcon name="check" size={16} color="#fff" /> : null}
              </View>
              <Text style={[styles.swatchLabel, { color: textColor }]} numberOfLines={1}>
                {preset.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </StoreSetupChrome>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  headline: {
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.4,
    lineHeight: 34,
  },
  body: {
    fontSize: 16,
    lineHeight: 24,
    marginTop: -4,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  swatch: {
    width: '47%',
    flexGrow: 1,
    minHeight: 64,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  swatchActive: {
    borderWidth: 2,
  },
  dot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatchLabel: {
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
  },
  pressed: { opacity: 0.85 },
});
