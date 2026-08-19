/**
 * Rules-first small talk for Ask Ayebia.
 * Greetings / identity / thanks — no LLM, no business numbers.
 * Internal IBIS_* keys stay elsewhere; display name is Ayebia.
 */

const { getFallbackSuggestedQuestions } = require('../analysis/intentCatalog');
const { ASSISTANT_DISPLAY_NAME } = require('../../utils/assistantIdentity');

/** Ghana-first clock until a tenant timezone exists. */
const DEFAULT_TIME_ZONE = 'Africa/Accra';

const SMALL_TALK_INTENTS = Object.freeze({
  GREETING: 'small_talk_greeting',
  HOW_ARE_YOU: 'small_talk_how_are_you',
  IDENTITY: 'small_talk_identity',
  IDENTITY_BIO: 'small_talk_identity_bio',
  INTELLIGENCE: 'small_talk_intelligence',
  CHATTER: 'small_talk_chatter',
  KNOWLEDGE: 'small_talk_knowledge',
  CREATOR: 'small_talk_creator',
  SEE_DATA: 'small_talk_see_data',
  ACK: 'small_talk_ack',
  PRAISE: 'small_talk_praise',
  COMPLAINT: 'small_talk_complaint',
  COURTESY: 'small_talk_courtesy',
  AFFIRM: 'small_talk_affirm',
  FAREWELL: 'small_talk_farewell',
  HELP: 'small_talk_help',
  WHATSAPP: 'small_talk_whatsapp',
  TIME: 'small_talk_time',
  SEASONAL: 'small_talk_seasonal',
});

const BUSINESS_ASK_RE =
  /\b(sales?|revenue|owe[sd]?|owing|stock|invoices?|jobs?|customers?|expenses?|quotes?|profit|inventory|receivables?|payroll|products?)\b/;
const HOW_TO_RE = /\b(how do i|how to)\b/;
const DRAFT_WHATSAPP_RE = /\bdraft\b[\s\S]{0,40}\bwhatsapp\b|\bwhatsapp\b[\s\S]{0,40}\bdraft\b/;
const WHATSAPP_TASK_RE = /\b(reminders?|send)\b[\s\S]{0,40}\bwhatsapp\b|\bwhatsapp\b[\s\S]{0,40}\b(reminders?|send)\b/;

const SOCIAL_PREFIX_RE = /^(hi|hello|hey|yo)\s+/;

const GREETING_RE =
  /^(hi|hello|hey|hiya|howdy|yo|gm|morning|afternoon|evening|good (morning|afternoon|evening|day))( (there|ayebia|abs|assistant))?$/;
const HOW_ARE_YOU_RE =
  /^(how are you( doing)?( today)?|how are things|how('?s| is) it going|how far|you good|you dey|wassup|what'?s up|whats up|sup)$/;
const SEE_DATA_RE = /^can you see my (sales|data)$/;
const WHATSAPP_CHAT_RE = /^(whatsapp|is this whatsapp)$/;
const TIME_RE = /^(what time is it|what('?s| is) the time)$/;
const SEASONAL_RE = /^(happy new year|merry christmas|merry xmas)$/;
const CREATOR_RE = /^(who (made|built|created) you)$/;
const INTELLIGENCE_RE =
  /^(are you smart|how smart are you|are you (an? )?(ai|bot|human)|can you think|do you have feelings)$/;
const CHATTER_RE = /^(talk to me|let'?s talk|lets talk|i('?m| am) bored)$/;
const KNOWLEDGE_RE = /^(what do you know( about me)?)$/;
const HELP_RE =
  /^(what can you do|what do you do|how can you help|help( me)?|capabilities|please help( me)?|what can you (do|help)|what do you (do|help with))$/;
const FAREWELL_RE = /^(bye|goodbye|good bye|see you|see ya|see you later|later|bye bye)$/;
const COURTESY_RE = /^(pls|please|sorry|excuse me|pardon)$/;
const AFFIRM_RE = /^(yes|yeah|yep|yup|no|nope)$/;
const PRAISE_RE = /^(i love you|you('?re| are) the best|this is great)$/;
const COMPLAINT_RE = /^(this is wrong|you('?re| are) useless)$/;
const WOW_RE =
  /^(wow|woah|whoa|amazing|impressive|nice one|well done|congratulations|congrats)$/;
const THANKS_RE = /^(thanks|thank you|thx|cheers)( (so much|a lot))?$/;
const LIGHT_ACK_RE = /^(ok|okay|cool|great|nice|awesome)$/;

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
 * @param {string} message
 * @returns {string}
 */
function normalizeSmallTalk(message) {
  return String(message || '')
    .trim()
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[!?.,~:;]+/g, ' ')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\uFE0F\u200D]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Local hour (0–23) in a timezone. Used when we echo time of day.
 * @param {Date} [now]
 * @param {string} [timeZone]
 * @returns {number}
 */
function getHourInTimeZone(now = new Date(), timeZone = DEFAULT_TIME_ZONE) {
  const hourStr = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: 'numeric',
    hourCycle: 'h23',
  }).format(now);
  const hour = parseInt(hourStr, 10);
  return Number.isFinite(hour) ? hour : now.getUTCHours();
}

/**
 * @param {Date} [now]
 * @param {string} [timeZone]
 * @returns {string}
 */
function formatClockTime(now = new Date(), timeZone = DEFAULT_TIME_ZONE) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
    hourCycle: 'h12',
  }).format(now);
}

/**
 * @param {string} [timeZone]
 * @returns {string}
 */
function zoneCity(timeZone = DEFAULT_TIME_ZONE) {
  if (!timeZone || timeZone === DEFAULT_TIME_ZONE) return 'Accra';
  const city = String(timeZone).split('/').pop() || timeZone;
  return city.replace(/_/g, ' ');
}

/**
 * @param {Date} [now]
 * @param {string} [timeZone]
 * @returns {'Good morning'|'Good afternoon'|'Good evening'}
 */
function timeOfDayOpener(now = new Date(), timeZone = DEFAULT_TIME_ZONE) {
  const hour = getHourInTimeZone(now, timeZone);
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

/**
 * Capability questions about visibility must not be treated as ledger asks.
 * @param {string} text normalized
 * @returns {boolean}
 */
function isSeeDataAsk(text) {
  return SEE_DATA_RE.test(text);
}

/**
 * Business questions must reach analysis/support — never greetings.
 * @param {string} text normalized
 * @returns {boolean}
 */
function hasBusinessAsk(text) {
  return (
    BUSINESS_ASK_RE.test(text)
    || HOW_TO_RE.test(text)
    || DRAFT_WHATSAPP_RE.test(text)
    || WHATSAPP_TASK_RE.test(text)
  );
}

/**
 * Strip a leading hi/hello so compound social still matches.
 * @param {string} text
 * @returns {string}
 */
function stripSocialPrefix(text) {
  return text.replace(SOCIAL_PREFIX_RE, '').trim();
}

/**
 * Classify small-talk intents. Returns null when the message is not small talk.
 *
 * @param {string} message
 * @returns {{ intent: string, confidence: number } | null}
 */
function classifySmallTalk(message) {
  const text = normalizeSmallTalk(message);
  if (!text) return null;

  // Keep short; long messages with greeting words are unlikely pure small talk
  if (text.length > 120) return null;

  // Before the sales/stock guard — this is capability, not a figures request
  if (isSeeDataAsk(text)) {
    return { intent: SMALL_TALK_INTENTS.SEE_DATA, confidence: 0.96 };
  }

  if (hasBusinessAsk(text)) return null;

  if (WHATSAPP_CHAT_RE.test(text)) {
    return { intent: SMALL_TALK_INTENTS.WHATSAPP, confidence: 0.96 };
  }

  const core = stripSocialPrefix(text);

  if (TIME_RE.test(core) || TIME_RE.test(text)) {
    return { intent: SMALL_TALK_INTENTS.TIME, confidence: 0.96 };
  }

  if (SEASONAL_RE.test(core) || SEASONAL_RE.test(text)) {
    return { intent: SMALL_TALK_INTENTS.SEASONAL, confidence: 0.95 };
  }

  if (CREATOR_RE.test(core) || CREATOR_RE.test(text)) {
    return { intent: SMALL_TALK_INTENTS.CREATOR, confidence: 0.95 };
  }

  if (INTELLIGENCE_RE.test(core) || INTELLIGENCE_RE.test(text)) {
    return { intent: SMALL_TALK_INTENTS.INTELLIGENCE, confidence: 0.95 };
  }

  if (CHATTER_RE.test(core) || CHATTER_RE.test(text)) {
    return { intent: SMALL_TALK_INTENTS.CHATTER, confidence: 0.94 };
  }

  if (KNOWLEDGE_RE.test(core) || KNOWLEDGE_RE.test(text)) {
    return { intent: SMALL_TALK_INTENTS.KNOWLEDGE, confidence: 0.94 };
  }

  if (/^tell me about (you|yourself)$/.test(core) || /^tell me about (you|yourself)$/.test(text)) {
    return { intent: SMALL_TALK_INTENTS.IDENTITY_BIO, confidence: 0.95 };
  }

  if (
    /^(who are you|what are you|what('?s| is) your name|are you (an? )?assistant)$/.test(core)
    || /\bwho are you\b/.test(text)
  ) {
    if (/\bwhat can you do\b/.test(text)) {
      return { intent: SMALL_TALK_INTENTS.IDENTITY_BIO, confidence: 0.94 };
    }
    return { intent: SMALL_TALK_INTENTS.IDENTITY, confidence: 0.95 };
  }

  if (HOW_ARE_YOU_RE.test(core)) {
    return { intent: SMALL_TALK_INTENTS.HOW_ARE_YOU, confidence: 0.95 };
  }

  if (WOW_RE.test(core) || THANKS_RE.test(core)) {
    return { intent: SMALL_TALK_INTENTS.ACK, confidence: 0.94 };
  }

  if (PRAISE_RE.test(core) || PRAISE_RE.test(text)) {
    return { intent: SMALL_TALK_INTENTS.PRAISE, confidence: 0.94 };
  }

  if (COMPLAINT_RE.test(core) || COMPLAINT_RE.test(text)) {
    return { intent: SMALL_TALK_INTENTS.COMPLAINT, confidence: 0.94 };
  }

  if (LIGHT_ACK_RE.test(core)) {
    return { intent: SMALL_TALK_INTENTS.ACK, confidence: 0.9 };
  }

  if (AFFIRM_RE.test(core) || AFFIRM_RE.test(text)) {
    return { intent: SMALL_TALK_INTENTS.AFFIRM, confidence: 0.93 };
  }

  if (COURTESY_RE.test(core) || COURTESY_RE.test(text)) {
    return { intent: SMALL_TALK_INTENTS.COURTESY, confidence: 0.93 };
  }

  if (FAREWELL_RE.test(core) || FAREWELL_RE.test(text)) {
    return { intent: SMALL_TALK_INTENTS.FAREWELL, confidence: 0.95 };
  }

  if (HELP_RE.test(core) || HELP_RE.test(text)) {
    return { intent: SMALL_TALK_INTENTS.HELP, confidence: 0.94 };
  }

  if (GREETING_RE.test(text)) {
    return { intent: SMALL_TALK_INTENTS.GREETING, confidence: 0.96 };
  }

  return null;
}

/**
 * @param {string} text normalized
 * @param {{ now?: Date, timeZone?: string }} options
 * @returns {string}
 */
function greetingOpener(text, options = {}) {
  if (text === 'gm' || /\bmorning\b/.test(text)) return 'Good morning';
  if (/\bafternoon\b/.test(text)) return 'Good afternoon';
  if (/\bevening\b/.test(text)) return 'Good evening';
  if (/\bgood day\b/.test(text)) {
    return timeOfDayOpener(options.now, options.timeZone || DEFAULT_TIME_ZONE);
  }
  return 'Hi';
}

/**
 * @param {string} intent
 * @param {{ businessType?: string, message?: string, now?: Date, timeZone?: string }} [options]
 * @returns {string}
 */
function buildReplyMarkdown(intent, options = {}) {
  const name = ASSISTANT_DISPLAY_NAME;
  const text = normalizeSmallTalk(options.message);
  const shopWord = isStudioLike(options.businessType) ? 'studio' : 'shop';
  const studio = isStudioLike(options.businessType);
  const timeZone = options.timeZone || DEFAULT_TIME_ZONE;
  const now = options.now || new Date();

  if (intent === SMALL_TALK_INTENTS.WHATSAPP) {
    return `This isn't WhatsApp — you're chatting with **${name}** in ABS. I can still draft a WhatsApp to a customer if you want.`;
  }

  if (intent === SMALL_TALK_INTENTS.SEE_DATA) {
    return `Yes — I can see your live workspace. I don't invent figures. What should I check?`;
  }

  if (intent === SMALL_TALK_INTENTS.TIME) {
    return `It's ${formatClockTime(now, timeZone)} in ${zoneCity(timeZone)}. What would you like to check in the business?`;
  }

  if (intent === SMALL_TALK_INTENTS.SEASONAL) {
    if (/new year/.test(text)) {
      return `Happy New Year. When you're ready, I can help with the ${shopWord}.`;
    }
    return `Merry Christmas. When you're ready, I can help with the ${shopWord}.`;
  }

  if (intent === SMALL_TALK_INTENTS.CREATOR) {
    return `I'm **${name}**, built into African Business Suite by iCreations. What would you like to check?`;
  }

  if (intent === SMALL_TALK_INTENTS.INTELLIGENCE) {
    if (/feelings/.test(text)) {
      return `I don't have feelings. I can still help with the ${shopWord} — what do you want to check?`;
    }
    if (/think/.test(text)) {
      return `I don't think the way people do. I read your live workspace and help with the business.`;
    }
    if (/human/.test(text)) {
      return `I'm not human — I'm **${name}**, your AI assistant in ABS.`;
    }
    if (/\b(ai|bot)\b/.test(text)) {
      return `I'm **${name}**, an AI assistant in African Business Suite — not a person. I work from your live workspace.`;
    }
    return `I'm built to read your live workspace and help with the business. Ask a numbers question — I'll use real data, not invented figures.`;
  }

  if (intent === SMALL_TALK_INTENTS.CHATTER) {
    return `I'm here. I can check the business or help with ABS — what do you feel like?`;
  }

  if (intent === SMALL_TALK_INTENTS.KNOWLEDGE) {
    if (/about me/.test(text)) {
      return `I know what's in your live workspace — not personal details unless they're in ABS. What should we check?`;
    }
    return `I know your live workspace and how ABS works. Ask about the business or how to do something.`;
  }

  if (intent === SMALL_TALK_INTENTS.IDENTITY) {
    return `I'm **${name}**, your assistant in African Business Suite. I read your live workspace — I don't invent numbers.`;
  }

  if (intent === SMALL_TALK_INTENTS.IDENTITY_BIO) {
    const focus = studio ? 'sales, collections, open jobs' : 'sales, collections, stock';
    return `I'm **${name}**, your assistant in African Business Suite. I read your live workspace — ${focus} — and I don't invent numbers. Ask a business question, a how-to, or a message draft.`;
  }

  if (intent === SMALL_TALK_INTENTS.HOW_ARE_YOU) {
    return `I'm doing well, thanks. How can I help the ${shopWord} today?`;
  }

  if (intent === SMALL_TALK_INTENTS.PRAISE) {
    return `Thanks — that means a lot. What should we look at next?`;
  }

  if (intent === SMALL_TALK_INTENTS.COMPLAINT) {
    return `Sorry that missed. Try another question — I can check the business or walk you through ABS.`;
  }

  if (intent === SMALL_TALK_INTENTS.COURTESY) {
    if (/sorry|excuse|pardon/.test(text)) {
      return `No worries. What can I help with?`;
    }
    return `Go ahead — what do you need?`;
  }

  if (intent === SMALL_TALK_INTENTS.AFFIRM) {
    if (/^(no|nope)$/.test(text)) {
      return `Alright. What would you like instead?`;
    }
    return `Okay. What do you need?`;
  }

  if (intent === SMALL_TALK_INTENTS.FAREWELL) {
    return `See you. I'm here when you need the ${shopWord}.`;
  }

  if (intent === SMALL_TALK_INTENTS.ACK) {
    if (/^(thanks|thank you|thx|cheers)/.test(text)) {
      return "You're welcome. Want to look at sales, who owes you, or something else?";
    }
    if (/^(ok|okay)$/.test(text)) {
      return `Got it. What would you like to check in the business?`;
    }
    if (/congrat|well done/.test(text)) {
      return `Well done. Want to look at sales, who owes you, or something else?`;
    }
    return 'Glad that landed. Want to look at sales, who owes you, or something else?';
  }

  if (intent === SMALL_TALK_INTENTS.HELP) {
    const focus = studio ? 'sales, collections, jobs' : 'sales, collections, stock';
    return `I can check your live workspace (${focus}), walk you through ABS, and draft short messages. What do you want to look at?`;
  }

  const opener = greetingOpener(text, options);
  if (opener === 'Hi') {
    return `Hi 👋 I'm **${name}**, your business intelligence assistant.

I'm here to help you understand and manage your business with ABS. You can ask me about your sales, customers, debts, expenses, jobs, reports, or even ask me to draft a message.`;
  }
  return `${opener}. I'm **${name}** — happy to help.`;
}

/**
 * Build a chat response DTO for small talk (same shape as analysis replies).
 *
 * @param {string} message
 * @param {{ businessType?: string, now?: Date, timeZone?: string }} [options]
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

  const answerMarkdown = buildReplyMarkdown(classification.intent, {
    ...options,
    message,
    timeZone: options.timeZone || DEFAULT_TIME_ZONE,
  });
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
  DEFAULT_TIME_ZONE,
  SMALL_TALK_INTENTS,
  classifySmallTalk,
  buildReplyMarkdown,
  trySmallTalk,
  exampleQuestions,
  getHourInTimeZone,
  timeOfDayOpener,
  formatClockTime,
};
