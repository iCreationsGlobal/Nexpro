/** Text as WhatsApp shows it: Lynk AI answers in Markdown; WhatsApp has its own bold, no headings and short limits. */

/** One WhatsApp text message holds 4096 characters, and a message with buttons 1024. */
const TEXT_LIMIT = 4000;
const BODY_LIMIT = 1000;

const cut = (value, max) => {
  const chars = Array.from(String(value ?? '').trim());
  return chars.length <= max ? chars.join('') : `${chars.slice(0, max - 1).join('').trimEnd()}…`;
};

/**
 * Markdown as WhatsApp text.
 * @param {string} markdown
 * @param {(path: string) => string} [absolute] - full address of a page of ABS
 */
function toWhatsApp(markdown, absolute = (path) => path) {
  return String(markdown || '')
    .replace(/\r\n/g, '\n')
    .replace(/```[a-z]*\n?|`/gi, '')
    .replace(/!?\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, url) => `${label}: ${url.startsWith('/') ? absolute(url) : url}`)
    .replace(/^#{1,6}[ \t]+(.+?)[ \t]*#*$/gm, (_, title) => `*${title.replace(/\*\*|__/g, '')}*`)
    .replace(/\*\*(.+?)\*\*|__(.+?)__/g, (_, a, b) => `*${a || b}*`)
    .replace(/^([ \t]*)[-*+][ \t]+/gm, '$1• ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** A long answer in parts WhatsApp takes, cut at a line or a space. */
function parts(text, limit = TEXT_LIMIT) {
  const out = [];
  let rest = String(text || '').trim();
  while (rest.length > limit) {
    const at = Math.max(rest.lastIndexOf('\n', limit), rest.lastIndexOf(' ', limit));
    const end = at > limit / 2 ? at : limit;
    out.push(rest.slice(0, end).trim());
    rest = rest.slice(end).trim();
  }
  if (rest) out.push(rest);
  return out;
}

module.exports = { BODY_LIMIT, TEXT_LIMIT, cut, parts, toWhatsApp };
