import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCheck, Loader2, Send, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import assistantService from '@/services/assistantService';
import { showError } from '@/utils/toast';
import { getAiProviderErrorMessage, AI_SETTINGS_PATH } from '@/utils/aiProviderErrors';
import { cn } from '@/lib/utils';
import { formatAssistantMessage } from '@/utils/assistantMessageFormatter';
import { useAuth } from '@/context/AuthContext';
import { getAssistantPromptSets } from '@/constants/assistantPrompts';
import { resolveAssistantPeriodForMessage } from '@/utils/assistantPeriod';
import { IBIS_ASK_LABEL, IBIS_NAME } from '@/constants/ibis';
import { IbisMoreMenu } from '@/components/IbisMoreMenu';
import { useIbisChatPreferences } from '@/hooks/useIbisChatPreferences';

/** Soft WhatsApp-style chat wallpaper (no external asset). */
const CHAT_WALLPAPER = {
  backgroundColor: '#efeae2',
  backgroundImage: `url("data:image/svg+xml,${encodeURIComponent(`
    <svg xmlns='http://www.w3.org/2000/svg' width='180' height='180' viewBox='0 0 180 180'>
      <g fill='none' stroke='%23d4cbc0' stroke-width='1.2' opacity='0.55'>
        <path d='M30 40c8-12 26-12 34 0'/>
        <circle cx='48' cy='28' r='4'/>
        <rect x='110' y='24' width='28' height='20' rx='4'/>
        <path d='M124 24v-6m0 32v-6m-14-10h6m22 0h6'/>
        <path d='M28 120l12-8 12 8v14H28z'/>
        <circle cx='140' cy='120' r='10'/>
        <path d='M134 120h12M140 114v12'/>
        <path d='M70 150c10 0 18-6 18-14s-8-14-18-14-18 6-18 14 8 14 18 14z'/>
      </g>
    </svg>
  `)}")`,
  backgroundRepeat: 'repeat',
  backgroundSize: '180px 180px',
};

/**
 * Format message clock time like WhatsApp (e.g. 10:58 AM).
 * @param {number|string|Date|undefined} value
 * @returns {string}
 */
function formatBubbleTime(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function PromptList({ title, prompts, onSelect, loading }) {
  if (!prompts?.length) return null;
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-[#667781]">{title}</p>
      <ul className="space-y-2">
        {prompts.map((prompt) => (
          <li key={prompt}>
            <button
              type="button"
              onClick={() => onSelect(prompt)}
              disabled={loading}
              className={cn(
                'w-full rounded-2xl border border-[#e9edef] bg-white px-3 py-2.5 text-left text-sm text-[#111b21]',
                'disabled:opacity-50 disabled:pointer-events-none'
              )}
            >
              {prompt}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ChatBubble({ role, content, createdAt, isHtml }) {
  const isUser = role === 'user';
  const timeLabel = formatBubbleTime(createdAt);

  return (
    <div className={cn('flex', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'relative max-w-[85%] px-3 pt-2 pb-1.5 text-[13.5px] leading-[1.4] text-[#111b21]',
          isUser
            ? 'rounded-2xl rounded-br-md bg-[#d9fdd3]'
            : 'rounded-2xl rounded-tl-md bg-white'
        )}
      >
        {/* Bubble tails */}
        {isUser ? (
          <span
            aria-hidden
            className="absolute -right-1.5 bottom-0 h-3 w-3 bg-[#d9fdd3]"
            style={{ clipPath: 'polygon(0 0, 0 100%, 100% 100%)' }}
          />
        ) : (
          <span
            aria-hidden
            className="absolute -left-1.5 top-0 h-3 w-3 bg-white"
            style={{ clipPath: 'polygon(100% 0, 0 0, 100% 100%)' }}
          />
        )}

        {isHtml ? (
          <div
            className="[&_ol]:my-1 [&_ol]:list-decimal [&_ol]:pl-4 [&_strong]:font-semibold [&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-4"
            dangerouslySetInnerHTML={{ __html: formatAssistantMessage(content) }}
          />
        ) : (
          <div className="whitespace-pre-wrap">{content}</div>
        )}

        <div className="mt-1 flex items-center justify-end gap-1">
          <span className="text-[10px] leading-none text-[#667781]">{timeLabel}</span>
          {isUser ? (
            <CheckCheck className="h-3.5 w-3.5 text-[#53bdeb]" aria-hidden />
          ) : null}
        </div>
      </div>
    </div>
  );
}

/**
 * Floating iBIS chat panel (web) — WhatsApp-style layout.
 */
export default function AssistantChatPanel({ open, onOpenChange, pageContext }) {
  const navigate = useNavigate();
  const { activeTenant, isManager } = useAuth();
  const {
    defaultPeriod,
    showSuggestionChips,
    setDefaultPeriod,
    setShowSuggestionChips,
  } = useIbisChatPreferences();
  const businessType = activeTenant?.businessType || 'printing_press';
  const shopType = activeTenant?.metadata?.shopType || null;

  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef(null);
  const lastSendAtRef = useRef(0);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const SEND_DEBOUNCE_MS = 800;

  const promptSets = useMemo(
    () => getAssistantPromptSets({ businessType, shopType }),
    [businessType, shopType]
  );

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      const viewport = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (viewport) viewport.scrollTop = viewport.scrollHeight;
    }
  }, []);

  useEffect(() => {
    if (open && messages.length > 0) {
      scrollToBottom();
    }
  }, [open, messages.length, scrollToBottom]);

  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') onOpenChange(false);
    };
    if (open) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [open, onOpenChange]);

  const handleSend = useCallback(
    async (text) => {
      const trimmed = (text || inputValue).trim();
      if (!trimmed || loading) return;

      const now = Date.now();
      if (now - lastSendAtRef.current < SEND_DEBOUNCE_MS) return;
      lastSendAtRef.current = now;

      const userMessage = { role: 'user', content: trimmed, createdAt: Date.now() };
      const conversation = [...messagesRef.current, userMessage];
      setMessages(conversation);
      setInputValue('');
      setLoading(true);

      try {
        const apiMessages = conversation.map(({ role, content }) => ({ role, content }));
        const periodRange = resolveAssistantPeriodForMessage(trimmed, defaultPeriod);
        const result = await assistantService.chat(apiMessages, {
          pageContext,
          period: periodRange.period,
          startDate: periodRange.startDate,
          endDate: periodRange.endDate,
          periodLabel: periodRange.periodLabel,
        });
        const assistantContent = result?.message ?? result?.error ?? 'No response from the assistant.';
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: assistantContent,
            meta: result?.meta || null,
            createdAt: Date.now(),
          },
        ]);
        scrollToBottom();
      } catch (err) {
        const aiMessage = getAiProviderErrorMessage(err);
        if (aiMessage) {
          setMessages((prev) => [
            ...prev,
            { role: 'assistant', content: aiMessage, createdAt: Date.now() },
          ]);
          scrollToBottom();
        } else {
          showError(err, 'Failed to get a response. Please try again.');
          setMessages((prev) => prev.slice(0, -1));
        }
      } finally {
        setLoading(false);
      }
    },
    [inputValue, loading, pageContext, scrollToBottom, defaultPeriod]
  );

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSuggestionClick = (prompt) => {
    handleSend(prompt);
  };

  const handleNewChat = useCallback(() => {
    if (loading) return;
    setMessages([]);
    setInputValue('');
  }, [loading]);

  // Lock page scroll while the floating chat is open
  useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    const previousPaddingRight = document.body.style.paddingRight;
    const scrollbarGap = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = 'hidden';
    if (scrollbarGap > 0) {
      document.body.style.paddingRight = `${scrollbarGap}px`;
    }
    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousPaddingRight;
    };
  }, [open]);

  if (!open) return null;

  return (
    <>
      <button
        type="button"
        aria-label="Close overlay"
        className="fixed inset-0 z-[100] bg-black/40 overscroll-none"
        onClick={() => onOpenChange(false)}
        onWheel={(e) => e.preventDefault()}
        onTouchMove={(e) => e.preventDefault()}
      />
      <div
        role="dialog"
        aria-label={IBIS_NAME}
        className={cn(
          'fixed z-[110] flex flex-col w-full max-w-md h-[70vh] max-h-[70vh]',
          'right-4 bottom-4 left-4 sm:left-auto',
          'overflow-hidden rounded-xl border border-[#d1d7db] bg-white',
          'flex flex-col p-0 gap-0'
        )}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[#e9edef] bg-white px-3 py-2.5">
          <div className="flex min-w-0 items-center gap-2">
            <Sparkles className="h-4 w-4 shrink-0 text-[#166534]" aria-hidden />
            <h2 className="truncate text-[15px] font-semibold text-[#111b21]">{IBIS_NAME}</h2>
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            <IbisMoreMenu
              loading={loading}
              onNewChat={handleNewChat}
              defaultPeriod={defaultPeriod}
              onDefaultPeriodChange={setDefaultPeriod}
              showSuggestionChips={showSuggestionChips}
              onShowSuggestionChipsChange={setShowSuggestionChips}
              showAiSettings={Boolean(isManager)}
              onOpenAiSettings={() => {
                onOpenChange(false);
                navigate(AI_SETTINGS_PATH);
              }}
              triggerClassName="h-8 w-8 text-[#54656f]"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Close"
              className="h-8 w-8 text-[#54656f]"
              onClick={() => onOpenChange(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Chat canvas */}
        <ScrollArea ref={scrollRef} className="min-h-0 flex-1" style={CHAT_WALLPAPER}>
          {messages.length === 0 ? (
            <div className="space-y-4 px-3 py-4">
              <div className="mx-auto max-w-[92%] rounded-2xl bg-white/90 px-3 py-2 text-center text-xs text-[#667781]">
                Say hi or ask about today’s sales, collections, stock or jobs, ABS how-tos, and drafts.
              </div>
              {showSuggestionChips ? (
                <>
                  <PromptList
                    title="Business insights"
                    prompts={promptSets.business.slice(0, 4)}
                    onSelect={handleSuggestionClick}
                    loading={loading}
                  />
                  <PromptList
                    title="ABS support"
                    prompts={promptSets.support.slice(0, 3)}
                    onSelect={handleSuggestionClick}
                    loading={loading}
                  />
                  <PromptList
                    title="Draft messages"
                    prompts={promptSets.draft.slice(0, 2)}
                    onSelect={handleSuggestionClick}
                    loading={loading}
                  />
                </>
              ) : null}
            </div>
          ) : (
            <div className="space-y-2 px-3 py-3 pb-4">
              {messages.map((msg, i) => (
                <ChatBubble
                  key={`${msg.role}-${i}-${msg.createdAt || i}`}
                  role={msg.role}
                  content={msg.content}
                  createdAt={msg.createdAt}
                  isHtml={msg.role === 'assistant'}
                />
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="relative rounded-2xl rounded-tl-md bg-white px-3 py-2.5 text-sm text-[#667781]">
                    <span
                      aria-hidden
                      className="absolute -left-1.5 top-0 h-3 w-3 bg-white"
                      style={{ clipPath: 'polygon(100% 0, 0 0, 100% 100%)' }}
                    />
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Thinking…
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}
        </ScrollArea>

        {/* Composer */}
        <div className="shrink-0 border-t border-[#e9edef] bg-[#f0f2f5] px-2.5 py-2">
          <div className="flex items-center gap-2">
            <input
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={`${IBIS_ASK_LABEL}...`}
              disabled={loading}
              className={cn(
                'h-10 flex-1 rounded-full border border-transparent bg-white px-4 text-sm text-[#111b21]',
                'placeholder:text-[#8696a0] outline-none focus:border-[#d1d7db]',
                'disabled:opacity-60'
              )}
            />
            <button
              type="button"
              onClick={() => handleSend()}
              disabled={loading || !inputValue.trim()}
              className={cn(
                'flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#166534] text-white',
                'disabled:opacity-50'
              )}
              aria-label="Send"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </div>
          <p className="mt-1.5 px-1 text-center text-[10px] leading-snug text-[#8696a0]">
            Business numbers come from your workspace data. Drafts are guidance.
          </p>
        </div>
      </div>
    </>
  );
}
