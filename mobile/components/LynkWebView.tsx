import React, { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import * as WebBrowser from 'expo-web-browser';

import { useScreenColors } from '@/hooks/useScreenColors';

/** A message from Lynk's screen ("ready", "finished", "closed", "credit_added", …). */
export type LynkMessage = { source: string; event: string; [key: string]: unknown };

type Props = {
  /** The address Lynk gave ABS's server for this screen (it carries its own one-time pass). */
  url: string;
  onMessage?: (message: LynkMessage) => void;
};

/**
 * Lynk's screens are written for a page that frames them or opened them (window.parent / window.opener). In the app
 * there is neither, so the page gets an "opener" that hands its messages to the app, and its own messages are
 * passed on too.
 */
const BRIDGE = `(function () {
  var send = function (data) {
    try { window.ReactNativeWebView.postMessage(JSON.stringify(data)); } catch (e) {}
  };
  try {
    Object.defineProperty(window, 'opener', { configurable: true, get: function () { return { postMessage: function (data) { send(data); } }; } });
  } catch (e) {}
  window.addEventListener('message', function (e) {
    if (e && e.data && typeof e.data === 'object' && /^lynk/.test(String(e.data.source || ''))) send(e.data);
  });
  true;
})();`;

const originOf = (url: string) => {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
};

/**
 * Lynk's ready-made screen inside the app: microphone for voice, files and the camera for what to bring in, and
 * Lynk's payment page (or any other address) in the phone's browser instead of on top of the screen.
 */
export function LynkWebView({ url, onMessage }: Props) {
  const { colors, bg, textColor, mutedColor } = useScreenColors();
  const webview = useRef<WebView>(null);
  const [failed, setFailed] = useState(false);
  const lynkOrigin = useMemo(() => originOf(url), [url]);

  const openOutside = useCallback((target: string) => {
    void WebBrowser.openBrowserAsync(target, {
      dismissButtonStyle: 'done',
      presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
    });
  }, []);

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      if (lynkOrigin && originOf(event.nativeEvent.url) !== lynkOrigin) return;
      try {
        const data = JSON.parse(event.nativeEvent.data) as LynkMessage;
        if (data && typeof data === 'object' && /^lynk/.test(String(data.source || ''))) onMessage?.(data);
      } catch {
        // Not one of Lynk's messages.
      }
    },
    [lynkOrigin, onMessage]
  );

  if (failed) {
    return (
      <View style={[styles.centre, { backgroundColor: bg }]}>
        <Text style={[styles.message, { color: textColor }]}>Lynk AI couldn't open. Check your connection.</Text>
        <Pressable
          onPress={() => { setFailed(false); webview.current?.reload(); }}
          style={({ pressed }) => [styles.retry, { borderColor: colors.tint }, pressed && { opacity: 0.8 }]}
        >
          <Text style={{ color: colors.tint, fontWeight: '600' }}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <WebView
      ref={webview}
      source={{ uri: url }}
      style={{ flex: 1, backgroundColor: bg }}
      injectedJavaScriptBeforeContentLoaded={BRIDGE}
      onMessage={handleMessage}
      // Only Lynk's own pages open here; anything else (a payment page, a help link) opens in the browser.
      originWhitelist={lynkOrigin ? [lynkOrigin] : ['https://*']}
      onShouldStartLoadWithRequest={(request) => {
        const target = originOf(request.url);
        if (!target || target === lynkOrigin || request.url.startsWith('about:') || request.url.startsWith('blob:') || request.url.startsWith('data:')) return true;
        openOutside(request.url);
        return false;
      }}
      onOpenWindow={(event) => openOutside(event.nativeEvent.targetUrl)}
      setSupportMultipleWindows
      javaScriptCanOpenWindowsAutomatically
      // Voice: the microphone (the phone still asks the first time), and Lynk's spoken replies.
      mediaCapturePermissionGrantType="grantIfSameHostElsePrompt"
      allowsInlineMediaPlayback
      mediaPlaybackRequiresUserAction={false}
      allowFileAccess
      startInLoadingState
      renderLoading={() => (
        <View style={[StyleSheet.absoluteFill, styles.centre, { backgroundColor: bg }]}>
          <ActivityIndicator color={colors.tint} />
          <Text style={[styles.hint, { color: mutedColor }]}>Opening Lynk AI…</Text>
        </View>
      )}
      onError={() => setFailed(true)}
      onHttpError={(event) => { if (event.nativeEvent.statusCode >= 500) setFailed(true); }}
    />
  );
}

const styles = StyleSheet.create({
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  message: { fontSize: 15, textAlign: 'center' },
  hint: { fontSize: 13 },
  retry: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 18, paddingVertical: 10 },
});
