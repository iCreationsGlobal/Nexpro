import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ChevronRight,
  Loader2,
  Paperclip,
  Send,
  Shield,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import assistantService from '@/services/assistantService';
import settingsService from '@/services/settingsService';
import { generatePDF } from '@/utils/pdfUtils';
import { buildAssistantReportHtml } from '@/utils/buildAssistantReportHtml';
import { showError, showSuccess } from '@/utils/toast';
import { getAiProviderErrorMessage, AI_SETTINGS_PATH } from '@/utils/aiProviderErrors';
import { PRIVACY_POLICY_URL } from '@/constants/legal';
import { cn } from '@/lib/utils';
import { formatAssistantMessage } from '@/utils/assistantMessageFormatter';
import { queryKeys } from '@/utils/queryKeys';
import { useAuth } from '@/context/AuthContext';
import {
  getAssistantPromptSets,
  getAssistantSuggestionCards,
  getPagePrompts,
} from '@/constants/assistantPrompts';
import {
  DEFAULT_ASSISTANT_PERIOD,
  inferAssistantPeriodKey,
  resolveAssistantPeriod,
  resolveAssistantPeriodForMessage,
} from '@/utils/assistantPeriod';
import { IBIS_ASK_LABEL, IBIS_NAME } from '@/constants/ibis';

/**
 * Time-of-day greeting for Ask AI empty state.
 * @returns {'Good morning'|'Good afternoon'|'Good evening'}
 */
function getTimeOfDayGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

const extractMarketingDraft = (content = '') => {
  const text = String(content || '').trim();
  const subjectMatch = text.match(/^subject:\s*(.+)$/im);
  const subject = (subjectMatch?.[1] || '').trim();
  const withoutMetaTail = text
    .split(/^---$/m)[0]
    .split(/quick question:/i)[0]
    .trim();
  return {
    subject,
    emailBody: withoutMetaTail,
  };
};

const isMarketingDraft = (content = '') => {
  const text = String(content || '').trim();
  const draft = extractMarketingDraft(text);
  if (!draft.subject) return false;
  return /promotional|campaign|offer|newsletter|email/i.test(text);
};

function SuggestionCard({ card, onSelect, disabled }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onSelect(card.prompt)}
      className={cn(
        'inline-flex max-w-[200px] shrink-0 items-center rounded-full border border-border bg-white px-2.5 py-1.5 text-left transition-colors',
        'hover:border-[#166534]/40 hover:bg-[#f0fdf4]/50',
        'disabled:opacity-50 disabled:pointer-events-none'
      )}
    >
      <span className="line-clamp-2 text-xs font-medium leading-snug text-foreground">
        {card.prompt}
      </span>
    </button>
  );
}

/**
 * Ask iBIS page — business insights, support, and drafts.
 */
export default function AskAI() {
  const navigate = useNavigate();
  const { activeTenant, user } = useAuth();
  const [searchParams] = useSearchParams();
  const pageContext = searchParams.get('from') || searchParams.get('pageContext') || undefined;
  const initialPrompt = searchParams.get('prompt') || undefined;
  const urlStartDate = searchParams.get('startDate') || undefined;
  const urlEndDate = searchParams.get('endDate') || undefined;
  const urlPeriodLabel = searchParams.get('periodLabel') || undefined;

  const businessType = activeTenant?.businessType || 'printing_press';
  const shopType = activeTenant?.metadata?.shopType || null;
  const firstName = String(user?.name || '').trim().split(/\s+/)[0] || 'there';
  const activeTenantId = activeTenant?.id;

  const { data: organizationData } = useQuery({
    queryKey: queryKeys.settings.organization(activeTenantId),
    queryFn: () => settingsService.getOrganization(),
    staleTime: 5 * 60 * 1000,
    enabled: Boolean(activeTenantId),
  });
  const organization = organizationData?.data?.data || organizationData?.data || {};

  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef(null);
  const cardsScrollRef = useRef(null);
  const textareaRef = useRef(null);
  const handledInitialPromptRef = useRef(null);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  const defaultPeriodKey = useMemo(
    () =>
      urlStartDate || urlEndDate || urlPeriodLabel
        ? inferAssistantPeriodKey(urlStartDate, urlEndDate, urlPeriodLabel)
        : DEFAULT_ASSISTANT_PERIOD,
    [urlStartDate, urlEndDate, urlPeriodLabel]
  );
  const defaultPeriodRange = useMemo(
    () => resolveAssistantPeriod(defaultPeriodKey),
    [defaultPeriodKey]
  );

  const promptSets = useMemo(
    () => getAssistantPromptSets({ businessType, shopType }),
    [businessType, shopType]
  );

  const emptyStateSubcopy = useMemo(() => {
    if (promptSets.kind === 'studio') {
      return 'I can answer questions about revenue, jobs, customers, reports, expenses, employees and profits.';
    }
    if (promptSets.kind === 'restaurant') {
      return 'I can answer questions about food sales, inventory, customers, reports, expenses, employees and profits.';
    }
    return 'I can answer questions about sales, inventory, customers, reports, expenses, employees and profits.';
  }, [promptSets.kind]);

  const timeGreeting = useMemo(() => getTimeOfDayGreeting(), []);

  const suggestionCards = useMemo(
    () => getAssistantSuggestionCards({ businessType, shopType, limit: 5 }),
    [businessType, shopType]
  );

  const pagePrompts = useMemo(() => {
    if (!pageContext) return [];
    if (urlStartDate && urlEndDate && (pageContext === 'reports' || pageContext === 'dashboard')) {
      const period = urlPeriodLabel || defaultPeriodRange.periodLabel || 'this period';
      return getPagePrompts(pageContext, {
        businessType,
        shopType,
        periodLabel: period,
      }).length
        ? [
          `Summarize performance for ${period}`,
          `What should I focus on for ${period}?`,
          'Compare this period to the previous period',
        ].filter((p) => {
          if (promptSets.kind === 'studio' && /restock|stock/i.test(p)) return false;
          return true;
        })
        : [];
    }
    return getPagePrompts(pageContext, {
      businessType,
      shopType,
      periodLabel: defaultPeriodRange.periodLabel,
    });
  }, [
    pageContext,
    urlStartDate,
    urlEndDate,
    urlPeriodLabel,
    businessType,
    shopType,
    defaultPeriodRange.periodLabel,
    promptSets.kind,
  ]);

  const scrollToBottom = useCallback(() => {
    const viewport = scrollRef.current?.querySelector('[data-radix-scroll-area-viewport]');
    if (viewport) viewport.scrollTop = viewport.scrollHeight;
  }, []);

  const scrollCards = useCallback((direction) => {
    const el = cardsScrollRef.current;
    if (!el) return;
    el.scrollBy({ left: direction * 220, behavior: 'smooth' });
  }, []);

  const sendMessage = useCallback(
    async (rawText) => {
      const text = String(rawText || '').trim();
      if (!text || loading) return;

      const userMessage = { role: 'user', content: text };
      const nextConversation = [...messagesRef.current, userMessage];
      setMessages(nextConversation);
      setInputValue('');
      setLoading(true);

      try {
        const periodRange = resolveAssistantPeriodForMessage(text, defaultPeriodKey);
        const res = await assistantService.chat(nextConversation, {
          pageContext,
          period: periodRange.period,
          startDate: periodRange.startDate,
          endDate: periodRange.endDate,
          periodLabel: periodRange.periodLabel,
        });
        const content = res?.message || 'No response from assistant.';
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content,
            meta: res?.meta || null,
            insight: res?.insight || null,
          },
        ]);
        requestAnimationFrame(scrollToBottom);
      } catch (err) {
        const aiMessage = getAiProviderErrorMessage(err);
        if (aiMessage) {
          setMessages((prev) => [...prev, { role: 'assistant', content: aiMessage }]);
          requestAnimationFrame(scrollToBottom);
        } else {
          showError(err, 'Failed to get AI response');
          setMessages((prev) => prev.slice(0, -1));
        }
      } finally {
        setLoading(false);
      }
    },
    [defaultPeriodKey, loading, pageContext, scrollToBottom]
  );

  useEffect(() => {
    if (!initialPrompt || handledInitialPromptRef.current === initialPrompt) return;
    handledInitialPromptRef.current = initialPrompt;
    sendMessage(initialPrompt);
  }, [initialPrompt, sendMessage]);

  const emptyState = messages.length === 0;

  const handleNewChat = useCallback(() => {
    if (loading) return;
    setMessages([]);
    setInputValue('');
    handledInitialPromptRef.current = null;
  }, [loading]);

  const handleCopy = useCallback(async (content) => {
    try {
      await navigator.clipboard.writeText(String(content || ''));
      showSuccess('Copied to clipboard');
    } catch (err) {
      showError(err, 'Failed to copy text');
    }
  }, []);

  const handlePostToMarketing = useCallback(
    (content) => {
      const draft = extractMarketingDraft(content);
      navigate('/marketing', {
        state: {
          prefill: {
            channelEmail: true,
            subject: draft.subject,
            emailBody: draft.emailBody,
          },
        },
      });
    },
    [navigate]
  );

  const handleExportPdf = useCallback(async (content, question = '') => {
    const companySlug = String(organization?.name || 'ai-insight')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'ai-insight';
    const printable = document.createElement('div');
    printable.style.background = '#ffffff';
    printable.style.color = '#111827';
    printable.innerHTML = buildAssistantReportHtml({
      content,
      organization,
      question,
      periodLabel: defaultPeriodRange.periodLabel,
      generatedAt: new Date(),
    });

    document.body.appendChild(printable);
    try {
      await generatePDF(printable, {
        filename: `${companySlug}-ai-insight-${new Date().toISOString().split('T')[0]}.pdf`,
      });
      showSuccess('Exported as PDF');
    } catch (err) {
      showError(err, 'Failed to export PDF');
    } finally {
      document.body.removeChild(printable);
    }
  }, [organization, defaultPeriodRange.periodLabel]);

  const handleComposerKeyDown = useCallback(
    (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendMessage(inputValue);
      }
    },
    [inputValue, sendMessage]
  );

  const composer = (
    <div
      className={cn(
        'rounded-2xl border border-border bg-white p-3 md:p-4',
        emptyState ? 'mx-auto w-full max-w-3xl' : 'w-full'
      )}
    >
      <Textarea
        ref={textareaRef}
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleComposerKeyDown}
        placeholder={`Ask ${IBIS_NAME} anything about your business...`}
        disabled={loading}
        rows={emptyState ? 3 : 2}
        className="min-h-[72px] resize-none border-0 bg-transparent p-0 text-base shadow-none focus-visible:ring-0"
      />
      <div className="mt-3 flex items-center justify-between gap-2">
        <button
          type="button"
          disabled
          title="Attachments coming soon"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-muted-foreground opacity-60"
          aria-label="Attach file (coming soon)"
        >
          <Paperclip className="h-4 w-4" />
        </button>
        <Button
          type="button"
          size="icon"
          className="h-10 w-10 rounded-full bg-[#166534] hover:bg-[#14532d]"
          disabled={loading || !inputValue.trim()}
          onClick={() => sendMessage(inputValue)}
          aria-label="Send message"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );

  return (
    <div className={cn('w-full', emptyState ? 'min-h-[calc(100vh-8rem)]' : 'space-y-4')}>
      {emptyState ? (
        <div className="flex min-h-[calc(100vh-8rem)] flex-col items-center justify-center px-4 py-8">
          <div className="flex flex-col items-center">
            <Sparkles className="mb-3 h-5 w-5 text-[#166534]" aria-hidden />
            <span className="inline-flex items-center rounded-full bg-[#dcfce7] px-3 py-1 text-xs font-semibold tracking-wide text-[#166534]">
              {IBIS_ASK_LABEL}
            </span>
          </div>

          <h1 className="mt-5 max-w-2xl text-center text-3xl font-bold tracking-tight text-foreground md:text-4xl">
            {timeGreeting},{' '}
            <span className="text-[#166534]">{firstName}.</span>
          </h1>
          <p className="mt-3 max-w-xl text-center text-base text-muted-foreground md:text-lg">
            How can I help with your business today?
          </p>
          <p className="mt-2 max-w-xl text-center text-sm text-muted-foreground">
            {emptyStateSubcopy}
          </p>

          <div className="mt-8 w-full">{composer}</div>

          {pagePrompts.length > 0 ? (
            <div className="mt-6 flex max-w-3xl flex-wrap justify-center gap-2">
              {pagePrompts.slice(0, 3).map((prompt) => (
                <Button
                  key={prompt}
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={loading}
                  onClick={() => sendMessage(prompt)}
                  className="h-auto whitespace-normal py-2 text-left"
                >
                  {prompt}
                </Button>
              ))}
            </div>
          ) : null}

          <div className="mt-8 w-full max-w-5xl">
            <div className="relative">
              <div
                ref={cardsScrollRef}
                className="flex justify-start gap-3 overflow-x-auto pb-1 md:justify-center [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                {suggestionCards.map((card) => (
                  <SuggestionCard
                    key={card.id}
                    card={card}
                    onSelect={sendMessage}
                    disabled={loading}
                  />
                ))}
              </div>
              {suggestionCards.length > 4 ? (
                <button
                  type="button"
                  onClick={() => scrollCards(1)}
                  className="absolute right-0 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-white text-foreground md:hidden"
                  aria-label="Show more suggestions"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              ) : null}
            </div>
          </div>

          <p className="mt-10 flex items-center justify-center gap-2 text-center text-xs text-muted-foreground">
            <Shield className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>
              {IBIS_NAME} only accesses data in your workspace.{' '}
              <a
                href={PRIVACY_POLICY_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-foreground underline underline-offset-2"
              >
                Learn more
              </a>
            </span>
          </p>
        </div>
      ) : (
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-2 md:px-0">
          <div className="sticky top-0 z-10 -mx-1 flex items-center justify-end gap-2 bg-background px-1 py-2">
            <button
              type="button"
              onClick={handleNewChat}
              disabled={loading}
              className="shrink-0 rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
              aria-label="New chat"
            >
              New chat
            </button>
          </div>

          <ScrollArea ref={scrollRef} className="h-[min(58vh,640px)]">
            <div className="space-y-6 px-1 pb-4">
              {messages.map((msg, i) => {
                const needsTenantKey = msg.meta?.source === 'tenant_key_required';
                const showReasons =
                  msg.role === 'assistant' &&
                  Array.isArray(msg.meta?.reasons) &&
                  msg.meta.reasons.length > 0;
                const precedingQuestion =
                  msg.role === 'assistant'
                    ? (() => {
                        for (let j = i - 1; j >= 0; j -= 1) {
                          if (messages[j].role === 'user') return messages[j].content;
                        }
                        return '';
                      })()
                    : '';

                if (msg.role === 'user') {
                  return (
                    <div key={`user-${i}`} className="flex justify-end">
                      <div className="max-w-[85%] rounded-3xl bg-muted px-4 py-2.5 text-[15px] leading-relaxed text-foreground">
                        <div className="whitespace-pre-wrap">{msg.content}</div>
                      </div>
                    </div>
                  );
                }

                return (
                  <div key={`assistant-${i}`} className="w-full space-y-2">
                    <div
                      className="prose prose-sm max-w-none text-[15px] leading-7 text-foreground [&_li]:my-0.5 [&_ol]:my-2 [&_p]:my-2 [&_strong]:font-semibold [&_ul]:my-2"
                      dangerouslySetInnerHTML={{ __html: formatAssistantMessage(msg.content) }}
                    />
                    {showReasons && (
                      <ul className="space-y-1 text-sm text-muted-foreground">
                        {msg.meta.reasons.slice(0, 5).map((reason) => (
                          <li key={reason.code || reason.label}>
                            <span className="font-medium text-foreground">{reason.label}</span>
                            {reason.detail ? ` — ${reason.detail}` : ''}
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="flex flex-wrap items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleCopy(msg.content)}
                        className="rounded-full border border-border px-2 py-0.5 text-[11px] leading-4 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      >
                        Copy
                      </button>
                      <button
                        type="button"
                        onClick={() => handleExportPdf(msg.content, precedingQuestion)}
                        className="rounded-full border border-border px-2 py-0.5 text-[11px] leading-4 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      >
                        Export PDF
                      </button>
                      {isMarketingDraft(msg.content) && (
                        <button
                          type="button"
                          onClick={() => handlePostToMarketing(msg.content)}
                          className="rounded-full border border-border px-2 py-0.5 text-[11px] leading-4 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        >
                          Post to Marketing
                        </button>
                      )}
                      {needsTenantKey && (
                        <button
                          type="button"
                          onClick={() => navigate(AI_SETTINGS_PATH)}
                          className="rounded-full border border-[#166534]/30 bg-[#f0fdf4] px-2 py-0.5 text-[11px] leading-4 font-medium text-[#166534] transition-colors hover:bg-[#dcfce7]"
                        >
                          Open AI Settings
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
              {loading && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Thinking…
                </div>
              )}
            </div>
          </ScrollArea>

          {composer}
        </div>
      )}
    </div>
  );
}
