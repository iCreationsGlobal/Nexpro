import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { LynkWebView, type LynkMessage } from '@/components/LynkWebView';
import { ScreenShell } from '@/components/ScreenShell';
import { StackPageHeader } from '@/components/StackPageHeader';
import { useAuth } from '@/context/AuthContext';
import { useScreenColors } from '@/hooks/useScreenColors';
import { lynkAiService, pageFromPath } from '@/services/lynkAiService';
import { getApiErrorMessage } from '@/utils/parseApiListResponse';

const TABS = ['ask', 'insights', 'design', 'import'] as const;

/**
 * Lynk AI (the web's /lynk page): Lynk's screen with Ask, Insights, Design and Import, for owners, admins and
 * managers. Its buttons open the app's own screens on top (Back returns here); "Bring in products" opens the
 * Lynk import screen. Opened with ?from=<the screen they were on> so "this invoice" works.
 */
export default function LynkAiScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ from?: string; tab?: string }>();
  const { isAdmin, isManager } = useAuth();
  const { colors, bg, textColor, mutedColor } = useScreenColors();
  const [state, setState] = useState<{ status: 'starting' | 'open' | 'error'; url?: string; error?: string }>({ status: 'starting' });
  const [attempt, setAttempt] = useState(0);
  const mounted = useRef(true);
  const allowed = isAdmin || isManager;
  const tab = (TABS as readonly string[]).includes(String(params.tab)) ? (params.tab as (typeof TABS)[number]) : 'ask';
  const from = typeof params.from === 'string' ? params.from : null;

  useEffect(() => () => { mounted.current = false; }, []);
  useEffect(() => {
    if (!allowed) return;
    lynkAiService.start({ tab, page: pageFromPath(from) })
      .then((res) => { if (mounted.current) setState({ status: 'open', url: res.screenUrl }); })
      .catch((err) => { if (mounted.current) setState({ status: 'error', error: getApiErrorMessage(err, "Lynk AI isn't available right now. Try again in a moment.") }); });
  }, [allowed, tab, from, attempt]);

  const onMessage = useCallback((message: LynkMessage) => {
    if (message.source !== 'lynk-ai') return;
    const path = typeof message.path === 'string' ? message.path : '';
    if (message.event === 'navigate' && path.startsWith('/') && !path.startsWith('//') && !path.includes('..')) router.push(path as never);
    else if (message.event === 'open' && message.what === 'import') router.push('/lynk-import');
    else if (message.event === 'closed') router.back();
  }, [router]);

  const header = <StackPageHeader title="Lynk AI" subtitle="Ask about your business, see what needs attention" />;

  if (!allowed) {
    return (
      <ScreenShell style={{ flex: 1, backgroundColor: bg }}>
        {header}
        <View style={styles.centre}>
          <Text style={[styles.body, { color: textColor }]}>Lynk AI is for the business owner and managers.</Text>
        </View>
      </ScreenShell>
    );
  }
  if (state.status === 'open' && state.url) {
    return (
      <View style={{ flex: 1, backgroundColor: bg }}>
        {header}
        <LynkWebView url={state.url} onMessage={onMessage} />
      </View>
    );
  }
  return (
    <ScreenShell style={{ flex: 1, backgroundColor: bg }}>
      {header}
      <View style={styles.centre}>
        {state.status === 'error' ? (
          <>
            <Text style={[styles.body, { color: textColor }]}>{state.error}</Text>
            <Pressable onPress={() => { setState({ status: 'starting' }); setAttempt((n) => n + 1); }} style={({ pressed }) => [styles.button, { borderColor: colors.tint }, pressed && { opacity: 0.85 }]}>
              <Text style={[styles.buttonText, { color: colors.tint }]}>Try again</Text>
            </Pressable>
          </>
        ) : (
          <>
            <ActivityIndicator color={colors.tint} />
            <Text style={[styles.body, { color: mutedColor }]}>Opening Lynk AI…</Text>
          </>
        )}
      </View>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 14 },
  body: { fontSize: 15, textAlign: 'center' },
  button: { minHeight: 48, borderWidth: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  buttonText: { fontSize: 15, fontWeight: '600' },
});
