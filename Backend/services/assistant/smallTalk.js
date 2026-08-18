/**
 * Rules-first small talk for Ask iBIS.
 * Greetings / identity / help — no LLM, no business numbers.
 */

const { getFallbackSuggestedQuestions } = require('../analysis/intentCatalog');

const SMALL_TALK_INTENTS = Object.freeze({
  GREETING: 'small_talk_greeting',
  IDENTITY: 'small_talk_identity',
  HELP: 'small_talk_help',
});

/**
 * @param {string|null|undefined} businessType
 * @returns {boolean}
 */
function isStudioLike(businessType) {
  return ['printing_press', 'mechanic', 'barber', 'salon', 'studio'].includes(businessType || '');
}

/**
 * Example questions tailored lightly by business type (no invented metrics).
 * @param {string|null|undefined} businessType
 * @returns {[string, string]}
 */
function exampleQuestions(businessType) {
  const suggestions = getFallbackSuggestedQuestions(businessType);
  return [suggestions[0], suggestions[2] || suggestions[1]].filter(Boolean);
}

/**
 * Classify small-talk intents. Returns null when the message is not small talk.
 *
 * @param {string} message
 * @returns {{ intent: string, confidence: number } | null}
 */
function classifySmallTalk(message) {
  const text = String(message || '').trim().toLowerCase();
  if (!text) return null;

  // Keep short; long messages with greeting words are unlikely pure small talk
  if (text.length > 120) return null;

  // Identity — before help so "who are you and what can you do" prefers identity
  if (
    /^(who are you|what are you|what('?s| is) your name|are you (an? )?(ai|bot|assistant)|tell me about yourself)[\s?.!]*$/i.test(
      text
    )
    || /\b(who are you|what are you|what('?s| is) your name)\b/.test(text)
  ) {
    // Avoid stealing analysis-ish questions that happen to include "who"
    if (/\b(owes|sales?|revenue|stock|invoice|customer)\b/.test(text)) return null;
    return { intent: SMALL_TALK_INTENTS.IDENTITY, confidence: 0.95 };
  }

  // Capabilities / help
  if (
    /^(what can you do|what do you do|how can you help|help( me)?|capabilities)[\s?.!]*$/i.test(text)
    || /\b(what can you (do|help)|how can you help|what do you (do|help with))\b/.test(text)
  ) {
    if (/\b(how do i|how to|create|add|record|draft)\b/.test(text)) return null;
    return { intent: SMALL_TALK_INTENTS.HELP, confidence: 0.94 };
  }

  // Pure greetings / light thanks
  if (
    /^(hi|hello|hey|hiya|howdy|yo|good (morning|afternoon|evening)|thanks|thank you|ok|okay|cool|great|nice)[\s!.]*$/i.test(
      text
    )
    || /^(hi|hello|hey)[\s,]+(there|abs|assistant|ibis|ayebia)?[\s!.]*$/i.test(text)
  ) {
    return { intent: SMALL_TALK_INTENTS.GREETING, confidence: 0.96 };
  }

  return null;
}

/**
 * @param {string} intent
 * @param {{ businessType?: string }} [options]
 * @returns {string}
 */
function buildReplyMarkdown(intent, options = {}) {
  const studio = isStudioLike(options.businessType);
  const [q1, q2] = exampleQuestions(options.businessType);
  const examples = q2
    ? `Try asking: “${q1}” or “${q2}”`
    : `Try asking: “${q1}”`;

  if (intent === SMALL_TALK_INTENTS.IDENTITY) {
    return [
      "I'm **Ayebia**, your business intelligence assistant. I help you make sense of your workspace and get things done in African Business Suite.",
      studio
        ? 'Ask me about sales and collections, open jobs, how to use ABS, or drafts like payment reminders.'
        : 'Ask me about sales insights, collections, stock, how to use ABS, or drafts like payment reminders.',
      examples,
    ].join(' ');
  }

  if (intent === SMALL_TALK_INTENTS.HELP) {
    return [
      "I'm **Ayebia**. I can help with business insights (sales, collections" +
        (studio ? ', jobs' : ', stock') +
        '), step-by-step ABS support, and short message drafts.',
      "I stick to your live workspace data for numbers — I won't invent figures.",
      examples,
    ].join(' ');
  }

  // Greeting (default)
  return [
    "Hi — I'm **Ayebia**, your business intelligence assistant. Happy to help.",
    studio
      ? 'Ask about today’s sales, who owes you, open jobs, how to use ABS, or a message draft.'
      : 'Ask about today’s sales, who owes you, stock, how to use ABS, or a message draft.',
    examples,
  ].join(' ');
}

/**
 * Build a chat response DTO for small talk (same shape as analysis replies).
 *
 * @param {string} message
 * @param {{ businessType?: string }} [options]
 * @returns {{
 *   matched: boolean,
 *   intent: string | null,
 *   answerMarkdown: string | null,
 *   meta: Object | null,
 * } }
 */
function trySmallTalk(message, options = {}) {
  const classification = classifySmallTalk(message);
  if (!classification) {
    return { matched: false, intent: null, answerMarkdown: null, meta: null };
  }

  const answerMarkdown = buildReplyMarkdown(classification.intent, options);
  const suggestedQuestions = getFallbackSuggestedQuestions(options.businessType);

  return {
    matched: true,
    intent: classification.intent,
    answerMarkdown,
    meta: {
      source: 'small_talk',
      intent: classification.intent,
      confidence: classification.confidence,
      suggestedQuestions,
      period: null,
    },
  };
}

module.exports = {
  SMALL_TALK_INTENTS,
  classifySmallTalk,
  buildReplyMarkdown,
  trySmallTalk,
  exampleQuestions,
};
