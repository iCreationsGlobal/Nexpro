import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Alert } from 'react-native';

import { AppIcon } from '@/components/AppIcon';
import { useAuth } from '@/context/AuthContext';
import { useFocusAreas } from '@/hooks/useFocusAreas';
import { useScreenColors } from '@/hooks/useScreenColors';
import { ScreenShell } from '@/components/ScreenShell';
import { StackPageHeader } from '@/components/StackPageHeader';
import { standaloneButtonStyles } from '@/styles/standaloneButton';
import { getErrorMessage } from '@/utils/errorMessages';
import { getAvailableFocusAreas, MAX_FOCUS_AREAS, type FocusAreaId } from '@/constants/focusAreas';
import { markFocusAreaPromptSeen } from '@/utils/focusAreaPrompt';

export default function FocusAreasScreen() {
  const { activeTenant, hasFeature } = useAuth();
  const { colors, cardBg, borderColor, textColor, mutedColor, onTint } = useScreenColors();
  const { focusAreas, isLoading, save, isSaving } = useFocusAreas();
  const [selected, setSelected] = useState<FocusAreaId[]>([]);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!isLoading) setSelected(focusAreas);
    // Only seed from the server once per screen visit — don't stomp local taps on refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading]);

  const options = getAvailableFocusAreas(activeTenant?.businessType, hasFeature);

  const toggle = (id: FocusAreaId) => {
    setDirty(true);
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((v) => v !== id);
      if (prev.length >= MAX_FOCUS_AREAS) {
        Alert.alert('Limit reached', `You can pick up to ${MAX_FOCUS_AREAS}.`);
        return prev;
      }
      return [...prev, id];
    });
  };

  const handleSave = async () => {
    try {
      await save(selected);
      await markFocusAreaPromptSeen();
      setDirty(false);
      Alert.alert('Saved', 'Your dashboard and menu are now personalized.');
    } catch (err) {
      Alert.alert('Error', getErrorMessage(err, 'Failed to save'));
    }
  };

  return (
    <ScreenShell style={styles.screen}>
      <StackPageHeader
        title="What matters most to you?"
        subtitle={`Pick up to ${MAX_FOCUS_AREAS}. This personalizes your menu and dashboard — you can change it anytime.`}
      />

      {isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.tint} />
        </View>
      ) : (
        <ScrollView style={styles.container} contentContainerStyle={styles.content}>
          {options.map((option) => {
            const active = selected.includes(option.id);
            return (
              <Pressable
                key={option.id}
                onPress={() => toggle(option.id)}
                style={[
                  styles.optionCard,
                  { backgroundColor: cardBg, borderColor: active ? colors.tint : borderColor },
                  active && { borderWidth: 2 },
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <View
                  style={[
                    styles.iconCircle,
                    { backgroundColor: active ? colors.tint : (borderColor as string) + '33' },
                  ]}
                >
                  <AppIcon name={option.icon} size={20} color={active ? onTint : mutedColor} />
                </View>
                <View style={styles.optionTextCol}>
                  <Text style={[styles.optionLabel, { color: textColor }]}>{option.label}</Text>
                  <Text style={[styles.optionDescription, { color: mutedColor }]}>{option.description}</Text>
                </View>
                <View
                  style={[
                    styles.radio,
                    { borderColor: active ? colors.tint : borderColor },
                  ]}
                >
                  {active ? <View style={[styles.radioDot, { backgroundColor: colors.tint }]} /> : null}
                </View>
              </Pressable>
            );
          })}

          {options.length === 0 ? (
            <Text style={[styles.emptyText, { color: mutedColor }]}>
              Nothing to personalize yet — enable more features for your workspace first.
            </Text>
          ) : null}

          <Pressable
            onPress={handleSave}
            disabled={isSaving || !dirty}
            style={({ pressed }) => [
              standaloneButtonStyles.primary,
              { backgroundColor: colors.tint, marginTop: 16 },
              pressed && styles.pressed,
              (isSaving || !dirty) && styles.disabled,
            ]}
          >
            {isSaving ? (
              <ActivityIndicator color={onTint} size="small" />
            ) : (
              <Text style={[styles.saveText, { color: onTint }]}>Save</Text>
            )}
          </Pressable>
        </ScrollView>
      )}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionTextCol: { flex: 1, minWidth: 0 },
  optionLabel: { fontSize: 15, fontWeight: '600' },
  optionDescription: { fontSize: 12, marginTop: 2 },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  emptyText: { fontSize: 13, textAlign: 'center', marginTop: 24 },
  saveText: { fontSize: 15, fontWeight: '600' },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.5 },
});
