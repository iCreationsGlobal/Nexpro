/**
 * Merge {{placeholder}} tokens into an SMS body.
 * Unknown tokens are left blank (empty string).
 *
 * @param {string} template
 * @param {Record<string, string|number|null|undefined>} [vars]
 * @returns {string}
 * @example
 * applySmsTemplate('Hi {{name}}', { name: 'Ama' }) // 'Hi Ama'
 */
function applySmsTemplate(template, vars = {}) {
  const source = String(template || '');
  return source.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => {
    const value = vars[key];
    if (value == null) return '';
    return String(value);
  });
}

/**
 * Estimate GSM-7 SMS segments (rough; UCS-2 treated as 70/67).
 * @param {string} message
 * @returns {{ length: number, segments: number, encoding: 'gsm7'|'ucs2' }}
 */
function estimateSmsSegments(message) {
  const text = String(message || '');
  const length = text.length;
  const hasUnicode = /[^\x00-\x7F]/.test(text);
  if (hasUnicode) {
    const segments = length <= 70 ? 1 : Math.ceil(length / 67);
    return { length, segments: Math.max(1, segments), encoding: 'ucs2' };
  }
  const segments = length <= 160 ? 1 : Math.ceil(length / 153);
  return { length, segments: Math.max(1, segments), encoding: 'gsm7' };
}

module.exports = {
  applySmsTemplate,
  estimateSmsSegments,
};
