import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ScrollView,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon } from '@/components/AppIcon';
import { IbisMoreSheet } from '@/components/IbisMoreSheet';
import { assistantService } from '@/services/assistantService';
import { useAuth } from '@/context/AuthContext';
import { useScreenColors } from '@/hooks/useScreenColors';
import { useIbisChatPreferences } from '@/hooks/useIbisChatPreferences';
import { logger } from '@/utils/logger';
import { getAiProviderErrorMessage } from '@/utils/aiProviderErrors';
import {
  getAssistantPromptSets,
  getPagePrompts,
} from '@/constants/assistantPrompts';
import { resolveAssistantPeriodForMessage } from '@/utils/assistantPeriod';

type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: number;
  status?: 'sending' | 'sent' | 'read';
  reasons?: Array<{ code?: string; label: string; detail?: string }>;
  intent?: string;
  source?: string;
};

type TextSegment = { text: string; bold: boolean };

const WA = {
  light: {
    wallpaper: '#EFEAE2',
    header: '#008069',
    headerText: '#FFFFFF',
    headerMuted: 'rgba(255,255,255,0.85)',
    outgoing: '#D9FDD3',
    incoming: '#FFFFFF',
    outgoingText: '#111B21',
    incomingText: '#111B21',
    meta: '#667781',
    tick: '#53BDEB',
    tickSent: '#8696A0',
    inputBar: '#F0F2F5',
    inputField: '#FFFFFF',
    send: '#00A884',
    chipBg: '#FFFFFF',
    chipBorder: '#E9EDEF',
    dateChip: 'rgba(255,255,255,0.92)',
    dateText: '#54656F',
    lock: '#54656F',
    typingDot: '#667781',
  },
  dark: {
    wallpaper: '#0B141A',
    header: '#1F2C34',
    headerText: '#E9EDEF',
    headerMuted: '#8696A0',
    outgoing: '#005C4B',
    incoming: '#202C33',
    outgoingText: '#E9EDEF',
    incomingText: '#E9EDEF',
    meta: '#8696A0',
    tick: '#53BDEB',
    tickSent: '#8696A0',
    inputBar: '#1F2C34',
    inputField: '#2A3942',
    send: '#00A884',
    chipBg: '#202C33',
    chipBorder: '#3B4A54',
    dateChip: '#182229',
    dateText: '#8696A0',
    lock: '#8696A0',
    typingDot: '#8696A0',
  },
} as const;

function formatMessageTime(ts: number) {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function parseBoldSegments(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  const regex = /\*\*(.*?)\*\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ text: text.slice(lastIndex, match.index), bold: false });
    }
    segments.push({ text: match[1], bold: true });
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex), bold: false });
  }

  return segments.length > 0 ? segments : [{ text, bold: false }];
}

function FormattedMessage({ content, color }: { content: string; color: string }) {
  const lines = content.replace(/\r\n/g, '\n').split('\n');

  return (
    <View>
      {lines.map((line, lineIndex) => {
        const trimmed = line.trim();
        const isBlank = trimmed.length === 0;
        const bulletMatch = trimmed.match(/^[-*•]\s+(.*)$/);
        const orderedMatch = trimmed.match(/^\d+\.\s+(.*)$/);
        const displayText = bulletMatch
          ? bulletMatch[1]
          : orderedMatch
            ? orderedMatch[1]
            : line;

        if (isBlank) {
          return <View key={`blank-${lineIndex}`} style={styles.messageSpacer} />;
        }

        const textNode = (
          <Text style={[styles.bubbleText, { color }]}>
            {parseBoldSegments(displayText).map((segment, segmentIndex) => (
              <Text
                key={`${lineIndex}-${segmentIndex}`}
                style={segment.bold ? styles.boldText : undefined}
              >
                {segment.text}
              </Text>
            ))}
          </Text>
        );

        if (bulletMatch || orderedMatch) {
          const prefix = orderedMatch ? `${trimmed.match(/^\d+/)?.[0]}.` : '•';
          return (
            <View key={`line-${lineIndex}`} style={styles.bulletRow}>
              <Text style={[styles.bulletDot, { color }]}>{prefix}</Text>
              <View style={styles.bulletText}>{textNode}</View>
            </View>
          );
        }

        return (
          <View key={`line-${lineIndex}`} style={styles.messageLine}>
            {textNode}
          </View>
        );
      })}
    </View>
  );
}

function TypingDots({ color }: { color: string }) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setStep((s) => (s + 1) % 3), 380);
    return () => clearInterval(id);
  }, []);
  return (
    <View style={styles.typingDots}>
      {[0, 1, 2].map((i) => (
        <View
          key={i}
          style={[
            styles.typingDot,
            { backgroundColor: color, opacity: step === i ? 1 : 0.35 },
          ]}
        />
      ))}
    </View>
  );
}

export default function ChatScreen() {
  const params = useLocalSearchParams<{ prompt?: string; pageContext?: string }>();
  const prompt = Array.isArray(params.prompt) ? params.prompt[0] : params.prompt;
  const pageContext = Array.isArray(params.pageContext) ? params.pageContext[0] : params.pageContext;
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { activeTenant } = useAuth();
  const { resolvedTheme } = useScreenColors();
  const {
    defaultPeriod,
    showSuggestionChips,
    setDefaultPeriod,
    setShowSuggestionChips,
  } = useIbisChatPreferences();
  const theme = WA[resolvedTheme === 'dark' ? 'dark' : 'light'];
  const businessType = activeTenant?.businessType || 'printing_press';
  const shopType = activeTenant?.metadata?.shopType || null;

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const handledInitialPromptRef = useRef<string | null>(null);
  const lastSendAtRef = useRef(0);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const SEND_DEBOUNCE_MS = 800;

  const promptSets = useMemo(
    () => getAssistantPromptSets({ businessType, shopType }),
    [businessType, shopType]
  );
  const pagePrompts = useMemo(
    () => getPagePrompts(pageContext, { businessType, shopType }),
    [pageContext, businessType, shopType]
  );

  const suggestionChips = useMemo(() => {
    const chips = [
      ...pagePrompts.slice(0, 2),
      ...promptSets.business.slice(0, 2),
      ...promptSets.support.slice(0, 1),
      ...promptSets.draft.slice(0, 1),
    ];
    return Array.from(new Set(chips)).slice(0, 8);
  }, [pagePrompts, promptSets]);

  const sendMessage = useCallback(
    async (content: string) => {
      const text = (content || input).trim();
      if (!text || loading) return;

      const now = Date.now();
      if (now - lastSendAtRef.current < SEND_DEBOUNCE_MS) return;
      lastSendAtRef.current = now;

      const tapAt = now;
      logger.info('Assistant', 'perf:send_tapped', { tapAt, textLength: text.length });

      setInput('');
      const userMsg: Message = {
        id: `u-${Date.now()}`,
        role: 'user',
        content: text,
        createdAt: tapAt,
        status: 'sending',
      };
      const nextMessages = [...messagesRef.current, userMsg];
      setMessages(nextMessages);
      setLoading(true);

      try {
        const history: { role: 'user' | 'assistant'; content: string }[] = nextMessages.map((m) => ({
          role: m.role,
          content: m.content,
        }));
        const uiPrepMs = Date.now() - tapAt;
        logger.info('Assistant', 'perf:history_ready', { tapAt, uiPrepMs, historyCount: history.length });

        const periodRange = resolveAssistantPeriodForMessage(text, defaultPeriod);
        const res = await assistantService.chat(history, {
          pageContext,
          period: periodRange.period,
          startDate: periodRange.startDate,
          endDate: periodRange.endDate,
          periodLabel: periodRange.periodLabel,
          clientSubmittedAt: tapAt,
        });
        const reply = res?.message || '';
        const reasons = Array.isArray(res?.meta?.reasons) ? res.meta.reasons : undefined;
        const assistantMsg: Message = {
          id: `a-${Date.now()}`,
          role: 'assistant',
          content: reply || 'No response.',
          createdAt: Date.now(),
          reasons,
          intent: res?.meta?.intent,
          source: res?.meta?.source,
        };
        setMessages((prev) =>
          prev
            .map((m) => (m.id === userMsg.id ? { ...m, status: 'read' as const } : m))
            .concat(assistantMsg)
        );
      } catch (err: unknown) {
        const responseData = (err as { response?: { data?: { error?: string; errorCode?: string; code?: string } } })
          ?.response?.data;
        const msg =
          responseData?.error ??
          (err as Error)?.message ??
          'Failed to get response';
        const errorCode = responseData?.errorCode || responseData?.code;
        const aiMessage = getAiProviderErrorMessage(err);
        const errContent = aiMessage || `Sorry, I couldn't process that. ${msg}`;
        logger.warn('Assistant', 'perf:send_failed', { tapAt, errorCode, msg: errContent });
        setMessages((prev) =>
          prev
            .map((m) => (m.id === userMsg.id ? { ...m, status: 'sent' as const } : m))
            .concat({
              id: `e-${Date.now()}`,
              role: 'assistant',
              content: errContent,
              createdAt: Date.now(),
            })
        );
      } finally {
        setLoading(false);
      }
    },
    [input, pageContext, loading, defaultPeriod]
  );

  useEffect(() => {
    if (messages.length > 0 || loading) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 80);
    }
  }, [messages, loading]);

  useEffect(() => {
    if (!prompt || handledInitialPromptRef.current === prompt) return;
    handledInitialPromptRef.current = prompt;
    sendMessage(prompt);
  }, [prompt, sendMessage]);

  const handleNewChat = useCallback(() => {
    if (loading) return;
    setMessages([]);
    setInput('');
    handledInitialPromptRef.current = null;
  }, [loading]);

  const renderItem = ({ item }: { item: Message }) => {
    const isUser = item.role === 'user';
    return (
      <View style={[styles.bubbleRow, isUser ? styles.bubbleRowRight : styles.bubbleRowLeft]}>
        <View
          style={[
            styles.bubble,
            isUser ? styles.bubbleOutgoing : styles.bubbleIncoming,
            {
              backgroundColor: isUser ? theme.outgoing : theme.incoming,
            },
          ]}
        >
          {!isUser ? <View style={[styles.tailLeft, { borderRightColor: theme.incoming }]} /> : null}
          {isUser ? <View style={[styles.tailRight, { borderLeftColor: theme.outgoing }]} /> : null}
          <FormattedMessage
            content={item.content}
            color={isUser ? theme.outgoingText : theme.incomingText}
          />
          <View style={styles.metaRow}>
            <Text style={[styles.metaTime, { color: theme.meta }]}>
              {formatMessageTime(item.createdAt)}
            </Text>
            {isUser ? (
              <AppIcon
                name={item.status === 'sending' ? 'check' : 'check-check'}
                size={14}
                color={item.status === 'read' ? theme.tick : theme.tickSent}
                strokeWidth={2.5}
              />
            ) : null}
          </View>
        </View>
      </View>
    );
  };

  const hasText = input.trim().length > 0;
  const statusLabel = loading ? 'typing…' : 'online';

  return (
    <View style={[styles.container, { backgroundColor: theme.header }]}>
      <StatusBar barStyle="light-content" backgroundColor={theme.header} />
      <View style={{ height: insets.top, backgroundColor: theme.header }} />

      {/* WhatsApp-style contact header */}
      <View style={[styles.header, { backgroundColor: theme.header }]}>
        <Pressable
          onPress={() => router.back()}
          style={styles.headerBack}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <AppIcon name="chevron-left" size={26} color={theme.headerText} strokeWidth={2.25} />
        </Pressable>

        <View style={styles.avatar}>
          <AppIcon name="brain" size={22} color="#fff" />
        </View>

        <View style={styles.headerTextBlock}>
          <Text style={[styles.headerTitle, { color: theme.headerText }]} numberOfLines={1}>
            iBIS
          </Text>
          <Text style={[styles.headerStatus, { color: theme.headerMuted }]} numberOfLines={1}>
            {statusLabel}
          </Text>
        </View>

        <Pressable
          onPress={() => setMoreOpen(true)}
          style={({ pressed }) => [styles.headerAction, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="iBIS settings"
        >
          <AppIcon name="ellipsis-v" size={20} color={theme.headerText} />
        </Pressable>
      </View>

      <KeyboardAvoidingView
        style={[styles.chatBody, { backgroundColor: theme.wallpaper }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        {messages.length === 0 && !loading ? (
          <ScrollView
            style={styles.scrollArea}
            contentContainerStyle={styles.emptyScroll}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            showsVerticalScrollIndicator={false}
          >
            <View style={[styles.dateChip, { backgroundColor: theme.dateChip }]}>
              <Text style={[styles.dateChipText, { color: theme.dateText }]}>Today</Text>
            </View>

            <View style={[styles.lockBanner, { backgroundColor: theme.dateChip }]}>
              <View style={styles.lockIconRow}>
                <AppIcon name="lock" size={12} color={theme.lock} />
              </View>
              <Text style={[styles.lockText, { color: theme.lock }]}>
                Messages to iBIS stay in your ABS workspace. Ask about sales, stock, jobs, or how to use ABS.
              </Text>
            </View>
          </ScrollView>
        ) : (
          <FlatList
            ref={flatListRef}
            style={styles.scrollArea}
            data={messages}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            contentContainerStyle={styles.list}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            showsVerticalScrollIndicator={false}
            ListHeaderComponent={
              <View style={[styles.dateChip, { backgroundColor: theme.dateChip, alignSelf: 'center' }]}>
                <Text style={[styles.dateChipText, { color: theme.dateText }]}>Today</Text>
              </View>
            }
            ListFooterComponent={
              loading ? (
                <View style={[styles.bubbleRow, styles.bubbleRowLeft]}>
                  <View
                    style={[
                      styles.bubble,
                      styles.bubbleIncoming,
                      styles.typingBubble,
                      { backgroundColor: theme.incoming },
                    ]}
                  >
                    <View style={[styles.tailLeft, { borderRightColor: theme.incoming }]} />
                    <TypingDots color={theme.typingDot} />
                  </View>
                </View>
              ) : null
            }
          />
        )}

        {/* Suggested replies — WhatsApp-style chips */}
        {messages.length === 0 && showSuggestionChips && suggestionChips.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.chipRow}
            style={styles.chipScroll}
          >
            {suggestionChips.map((chip) => (
              <Pressable
                key={chip}
                onPress={() => sendMessage(chip)}
                disabled={loading}
                style={({ pressed }) => [
                  styles.chip,
                  {
                    backgroundColor: theme.chipBg,
                    borderColor: theme.chipBorder,
                  },
                  pressed && styles.pressed,
                ]}
              >
                <Text style={[styles.chipText, { color: theme.incomingText }]} numberOfLines={2}>
                  {chip}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}

        {/* WhatsApp composer */}
        <View
          style={[
            styles.inputBar,
            {
              backgroundColor: theme.inputBar,
              paddingBottom: Math.max(insets.bottom, 8),
            },
          ]}
        >
          <View style={[styles.composer, { backgroundColor: theme.inputField }]}>
            <TextInput
              style={[styles.input, { color: theme.incomingText }]}
              placeholder="Message"
              placeholderTextColor={theme.meta}
              value={input}
              onChangeText={setInput}
              onSubmitEditing={() => sendMessage(input)}
              editable={!loading}
              multiline
              maxLength={500}
            />
          </View>

          <Pressable
            onPress={() => (hasText ? sendMessage(input) : undefined)}
            disabled={loading || !hasText}
            style={[
              styles.sendBtn,
              {
                backgroundColor: theme.send,
                opacity: loading || !hasText ? 0.55 : 1,
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Send"
          >
            <AppIcon name="send" size={20} color="#fff" />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
      <IbisMoreSheet
        visible={moreOpen}
        onClose={() => setMoreOpen(false)}
        loading={loading}
        onNewChat={handleNewChat}
        defaultPeriod={defaultPeriod}
        onDefaultPeriodChange={setDefaultPeriod}
        showSuggestionChips={showSuggestionChips}
        onShowSuggestionChipsChange={setShowSuggestionChips}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    paddingVertical: 8,
    minHeight: 56,
  },
  headerBack: {
    width: 40,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#25D366',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  headerTextBlock: { flex: 1, minWidth: 0, justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '600' },
  headerStatus: { fontSize: 13, marginTop: 1 },
  headerAction: {
    width: 40,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatBody: { flex: 1 },
  scrollArea: { flex: 1, minHeight: 0 },
  emptyScroll: {
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 12,
    alignItems: 'center',
  },
  dateChip: {
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 12,
  },
  dateChipText: { fontSize: 12, fontWeight: '600' },
  lockBanner: {
    alignItems: 'center',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    maxWidth: 320,
    gap: 6,
  },
  lockIconRow: { marginBottom: 2 },
  lockText: { fontSize: 12, lineHeight: 17, textAlign: 'center' },
  list: { paddingHorizontal: 10, paddingTop: 8, paddingBottom: 12 },
  bubbleRow: { marginBottom: 4, paddingHorizontal: 4 },
  bubbleRowLeft: { alignItems: 'flex-start' },
  bubbleRowRight: { alignItems: 'flex-end' },
  bubble: {
    maxWidth: '82%',
    paddingHorizontal: 10,
    paddingTop: 6,
    paddingBottom: 4,
    borderRadius: 8,
    position: 'relative',
  },
  bubbleOutgoing: {
    borderTopRightRadius: 0,
  },
  bubbleIncoming: {
    borderTopLeftRadius: 0,
  },
  typingBubble: {
    minWidth: 56,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  tailLeft: {
    position: 'absolute',
    left: -6,
    top: 0,
    width: 0,
    height: 0,
    borderTopWidth: 0,
    borderRightWidth: 8,
    borderBottomWidth: 8,
    borderLeftWidth: 0,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    borderLeftColor: 'transparent',
  },
  tailRight: {
    position: 'absolute',
    right: -6,
    top: 0,
    width: 0,
    height: 0,
    borderTopWidth: 0,
    borderLeftWidth: 8,
    borderBottomWidth: 8,
    borderRightWidth: 0,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    borderRightColor: 'transparent',
  },
  bubbleText: { fontSize: 15.5, lineHeight: 21 },
  boldText: { fontWeight: '700' },
  messageLine: { marginBottom: 2 },
  messageSpacer: { height: 6 },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginBottom: 2,
  },
  bulletDot: { fontSize: 15.5, lineHeight: 21, minWidth: 16 },
  bulletText: { flex: 1, minWidth: 0 },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 3,
    marginTop: 2,
    marginLeft: 8,
  },
  metaTime: { fontSize: 11, lineHeight: 14 },
  typingDots: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  typingDot: { width: 7, height: 7, borderRadius: 4 },
  chipScroll: { maxHeight: 88, flexGrow: 0 },
  chipRow: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 8,
    alignItems: 'center',
  },
  chip: {
    maxWidth: 220,
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  chipText: { fontSize: 13, lineHeight: 18 },
  pressed: { opacity: 0.75 },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 6,
    paddingTop: 6,
    gap: 6,
  },
  composer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderRadius: 24,
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 4,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    paddingHorizontal: 0,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    fontSize: 16,
    lineHeight: 20,
  },
  sendBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 0,
  },
});
