import { sanitizeAssistantDisplayName } from '@/constants/ibis';

/**
 * Format assistant message text to safe HTML with lightweight markdown support.
 * Supports headings, bullets, numbered lists, bold, and italics.
 * @param {string} text
 * @returns {string}
 */
export function formatAssistantMessage(text) {
  if (!text || typeof text !== 'string') return '';
  text = sanitizeAssistantDisplayName(text);

  const escapeHtml = (s) =>
    String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  const applyInline = (line) =>
    line
      .replace(/\*\*([^*]+)\*\*/g, '<strong class="font-semibold">$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>');

  const lines = text.split(/\r?\n/);
  const out = [];
  let inUl = false;
  let inOl = false;

  const closeLists = () => {
    if (inUl) {
      out.push('</ul>');
      inUl = false;
    }
    if (inOl) {
      out.push('</ol>');
      inOl = false;
    }
  };

  for (const raw of lines) {
    const escaped = escapeHtml(raw);
    const trimmed = escaped.trim();

    if (!trimmed) {
      closeLists();
      out.push('<div class="h-2"></div>');
      continue;
    }

    const headerMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (headerMatch) {
      closeLists();
      const level = Math.min(headerMatch[1].length, 4);
      out.push(`<h${level} class="font-semibold mt-1 mb-1">${applyInline(headerMatch[2])}</h${level}>`);
      continue;
    }

    const bulletMatch = trimmed.match(/^[-*•]\s+(.*)$/);
    if (bulletMatch) {
      if (inOl) {
        out.push('</ol>');
        inOl = false;
      }
      if (!inUl) {
        out.push('<ul class="list-disc pl-5 my-1 space-y-1">');
        inUl = true;
      }
      out.push(`<li>${applyInline(bulletMatch[1])}</li>`);
      continue;
    }

    const orderedMatch = trimmed.match(/^\d+\.\s+(.*)$/);
    if (orderedMatch) {
      if (inUl) {
        out.push('</ul>');
        inUl = false;
      }
      if (!inOl) {
        out.push('<ol class="list-decimal pl-5 my-1 space-y-1">');
        inOl = true;
      }
      out.push(`<li>${applyInline(orderedMatch[1])}</li>`);
      continue;
    }

    closeLists();
    out.push(`<p class="my-1">${applyInline(trimmed)}</p>`);
  }

  closeLists();
  return out.join('');
}

