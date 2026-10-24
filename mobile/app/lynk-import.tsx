import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';

import { LynkWebView, type LynkMessage } from '@/components/LynkWebView';
import { ScreenShell } from '@/components/ScreenShell';
import { StackPageHeader } from '@/components/StackPageHeader';
import { useAuth } from '@/context/AuthContext';
import { useScreenColors } from '@/hooks/useScreenColors';
import { productService, type LynkImportStatus } from '@/services/productService';
import { getApiErrorMessage } from '@/utils/parseApiListResponse';
import { refreshAfterInventoryChange } from '@/utils/queryInvalidation';

type Stage =
  | { kind: 'starting' }
  | { kind: 'open'; importId: string; screenUrl: string }
  | { kind: 'saving'; importId: string }
  | { kind: 'done'; status: LynkImportStatus; undo?: { removed: number; restored: number; kept: { name: string; reason: string }[] } }
  | { kind: 'error'; message: string };

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * Bring in products with Lynk AI (the web's LynkImportDialog): Lynk's screen, where the owner gives any file, a photo
 * of their stock book, or says what they sell, answers Lynk's questions, and taps Add. Lynk sends the products to
 * ABS's server; this waits until they're in, then shows what happened, with Undo.
 */
export default function LynkImportScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isAdmin, isManager } = useAuth();
  const { colors, bg, cardBg, borderColor, textColor, mutedColor } = useScreenColors();
  const [stage, setStage] = useState<Stage>({ kind: 'starting' });
  const [undoing, setUndoing] = useState(false);
  const polling = useRef(false);
  const mounted = useRef(true);
  const allowed = isAdmin || isManager;

  useEffect(() => () => { mounted.current = false; }, []);

  useEffect(() => {
    if (!allowed) return;
    productService.startLynkImport()
      .then((res) => { if (mounted.current) setStage({ kind: 'open', importId: res.importId, screenUrl: res.screenUrl }); })
      .catch((err) => { if (mounted.current) setStage({ kind: 'error', message: getApiErrorMessage(err, "Lynk AI isn't available right now. Try again in a moment.") }); });
  }, [allowed]);

  const waitForProducts = useCallback(async (importId: string) => {
    if (polling.current) return;
    polling.current = true;
    setStage({ kind: 'saving', importId });
    // Lynk sends the products to ABS's server; wait until they're in (up to a minute and a half).
    for (let i = 0; i < 45 && mounted.current; i += 1) {
      try {
        const status = await productService.lynkImportStatus(importId);
        if (status?.finished) {
          await refreshAfterInventoryChange(queryClient);
          if (mounted.current) setStage({ kind: 'done', status });
          return;
        }
      } catch {
        // Try again.
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    if (mounted.current) setStage({ kind: 'error', message: "Lynk sent the products, but they aren't in ABS yet. Check Products in a few minutes." });
  }, [queryClient]);

  const onMessage = useCallback((message: LynkMessage) => {
    if (message.source !== 'lynk-import') return;
    if (message.event === 'closed') router.back();
    if (message.event === 'finished' && stage.kind === 'open') void waitForProducts(stage.importId);
  }, [router, stage, waitForProducts]);

  const undo = useCallback(async () => {
    if (stage.kind !== 'done' || !stage.status.batchId) return;
    setUndoing(true);
    try {
      const res = await productService.undoProductImport(stage.status.batchId);
      await refreshAfterInventoryChange(queryClient);
      setStage({ ...stage, undo: { removed: res.removedCount ?? 0, restored: res.restoredCount ?? 0, kept: res.kept ?? [] } });
    } catch (err) {
      setStage({ kind: 'error', message: getApiErrorMessage(err, 'Could not undo the import') });
    } finally {
      setUndoing(false);
    }
  }, [queryClient, stage]);

  const header = <StackPageHeader title="Bring in with Lynk AI" subtitle="Any file, a photo of your list, or just say what you sell" />;

  if (!allowed) {
    return (
      <ScreenShell style={{ flex: 1, backgroundColor: bg }}>
        {header}
        <View style={styles.centre}>
          <Text style={[styles.body, { color: textColor }]}>Only owners and managers can bring in products.</Text>
        </View>
      </ScreenShell>
    );
  }

  if (stage.kind === 'open') {
    return (
      <View style={{ flex: 1, backgroundColor: bg }}>
        {header}
        <LynkWebView url={stage.screenUrl} onMessage={onMessage} />
      </View>
    );
  }

  if (stage.kind === 'done') {
    const { status, undo: undone } = stage;
    const notIn = [...status.leftOut, ...status.skipped, ...status.failed];
    const changed = status.addedCount + status.updatedCount;
    const title = undone
      ? `Import undone: ${plural(undone.removed, 'product')} removed${undone.restored ? `, ${undone.restored} put back as they were` : ''}`
      : changed
        ? [status.addedCount ? `${plural(status.addedCount, 'product')} added` : null, status.updatedCount ? `${status.updatedCount} updated` : null].filter(Boolean).join(', ')
        : 'Nothing new to add';
    const list = undone ? undone.kept : notIn;
    return (
      <ScreenShell style={{ flex: 1, backgroundColor: bg }}>
        {header}
        <ScrollView contentContainerStyle={styles.result}>
          <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
            <Text style={[styles.title, { color: textColor }]}>{title}</Text>
            {!undone && notIn.length > 0 && (
              <Text style={[styles.body, { color: mutedColor }]}>{plural(notIn.length, 'product')} not brought in:</Text>
            )}
            {undone && undone.kept.length > 0 && (
              <Text style={[styles.body, { color: mutedColor }]}>Kept as they are now:</Text>
            )}
            {list.slice(0, 30).map((item, i) => (
              <Text key={i} style={[styles.item, { color: mutedColor }]}>
                {item.name ? `${item.name}: ` : ''}{item.reason}
              </Text>
            ))}
            {list.length > 30 && <Text style={[styles.item, { color: mutedColor }]}>… and {list.length - 30} more</Text>}
          </View>
          <View style={styles.actions}>
            {!undone && changed > 0 && (
              <Pressable
                onPress={undo}
                disabled={undoing}
                style={({ pressed }) => [styles.button, { borderColor: colors.tint }, pressed && { opacity: 0.85 }]}
              >
                {undoing ? <ActivityIndicator color={colors.tint} /> : <Text style={[styles.buttonText, { color: colors.tint }]}>Undo import</Text>}
              </Pressable>
            )}
            <Pressable
              onPress={() => router.back()}
              style={({ pressed }) => [styles.button, { backgroundColor: colors.tint, borderColor: colors.tint }, pressed && { opacity: 0.85 }]}
            >
              <Text style={[styles.buttonText, { color: '#fff' }]}>Done</Text>
            </Pressable>
          </View>
        </ScrollView>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell style={{ flex: 1, backgroundColor: bg }}>
      {header}
      <View style={styles.centre}>
        {stage.kind === 'error' ? (
          <>
            <Text style={[styles.body, { color: textColor }]}>{stage.message}</Text>
            <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.button, { borderColor: colors.tint }, pressed && { opacity: 0.85 }]}>
              <Text style={[styles.buttonText, { color: colors.tint }]}>Close</Text>
            </Pressable>
          </>
        ) : (
          <>
            <ActivityIndicator color={colors.tint} />
            <Text style={[styles.body, { color: mutedColor }]}>
              {stage.kind === 'saving' ? 'Adding your products to ABS…' : 'Opening Lynk AI…'}
            </Text>
          </>
        )}
      </View>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 14 },
  result: { padding: 16, gap: 16 },
  card: { borderWidth: 1, borderRadius: 14, padding: 16, gap: 8 },
  title: { fontSize: 17, fontWeight: '700' },
  body: { fontSize: 15, textAlign: 'center' },
  item: { fontSize: 13, lineHeight: 18 },
  actions: { flexDirection: 'row', gap: 12 },
  button: { flex: 1, minHeight: 48, borderWidth: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  buttonText: { fontSize: 15, fontWeight: '600' },
});
