/**
 * ABS's own WhatsApp number (Meta's WhatsApp Cloud API): sending text, buttons, lists and links, and fetching voice
 * notes. Only for owners asking about their business (services/whatsappAssistant.js); it never messages a business's
 * customers. A business's own number is services/whatsappService.js.
 *
 * Settings: ABS_WHATSAPP_ASSISTANT=true, ABS_WHATSAPP_NUMBER (the number people message), WHATSAPP_PHONE_NUMBER_ID,
 * WHATSAPP_ACCESS_TOKEN and WHATSAPP_APP_SECRET (Meta signs what it sends with it).
 */
const { BODY_LIMIT, cut, parts } = require('../utils/whatsappText');

const MAX_AUDIO_BYTES = 8 * 1024 * 1024;

const env = (name) => String(process.env[name] || '').trim();

/** Whether ABS on WhatsApp is switched on and has everything it needs. */
const assistantReady = () => env('ABS_WHATSAPP_ASSISTANT') === 'true'
  && ['ABS_WHATSAPP_NUMBER', 'WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_APP_SECRET'].every((name) => env(name));

/** The number people message, as digits. */
const absNumber = () => env('ABS_WHATSAPP_NUMBER').replace(/\D/g, '');

const isAbsNumber = (phoneNumberId) => assistantReady() && String(phoneNumberId || '') === env('WHATSAPP_PHONE_NUMBER_ID');

/** A link that opens WhatsApp with ABS's number (and some words ready to send). */
const chatLink = (words) => `https://wa.me/${absNumber()}${words ? `?text=${encodeURIComponent(words)}` : ''}`;

const graph = (path) => `https://graph.facebook.com/${env('WHATSAPP_API_VERSION') || 'v21.0'}/${path}`;

async function callMeta(path, body) {
  const request = () => fetch(graph(path), {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${env('WHATSAPP_ACCESS_TOKEN')}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  let res = await request();
  if (res.status === 429 || res.status >= 500) res = await request();
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Meta answered ${res.status}: ${json?.error?.message || 'no reason given'}`);
  return json;
}

const send = (to, message) => callMeta(`${env('WHATSAPP_PHONE_NUMBER_ID')}/messages`, {
  messaging_product: 'whatsapp',
  recipient_type: 'individual',
  to,
  ...message,
});

const sendInteractive = (to, type, text, action) => send(to, {
  type: 'interactive',
  interactive: { type, body: { text: cut(text, BODY_LIMIT) }, action },
});

async function sendText(to, text) {
  for (const body of parts(text)) await send(to, { type: 'text', text: { preview_url: false, body } });
}

/** The words first when they don't fit with the buttons; what's left is the message the buttons go under. */
async function bodyFor(to, text, short) {
  if (text.length <= BODY_LIMIT) return text;
  await sendText(to, text);
  return short;
}

/** Up to three buttons under a message. */
async function sendButtons(to, text, buttons) {
  const body = await bodyFor(to, text, 'What next?');
  return sendInteractive(to, 'button', body, {
    buttons: buttons.slice(0, 3).map(({ id, title }) => ({ type: 'reply', reply: { id, title: cut(title, 20) } })),
  });
}

/** A button that opens up to ten choices. */
async function sendList(to, text, button, rows) {
  const body = await bodyFor(to, text, 'Choose one:');
  return sendInteractive(to, 'list', body, {
    button: cut(button, 20),
    sections: [{ rows: rows.slice(0, 10).map(({ id, title, detail }) => ({ id, title: cut(title, 24), ...(detail ? { description: cut(detail, 72) } : {}) })) }],
  });
}

/** A button that opens a web page. */
async function sendLink(to, text, label, url) {
  const body = await bodyFor(to, text, 'See more in ABS:');
  return sendInteractive(to, 'cta_url', body, { name: 'cta_url', parameters: { display_text: cut(label, 20), url } });
}

/** Blue ticks on their message, and "typing…" while the answer is made. */
const markRead = (messageId) => callMeta(`${env('WHATSAPP_PHONE_NUMBER_ID')}/messages`, {
  messaging_product: 'whatsapp',
  status: 'read',
  message_id: messageId,
  typing_indicator: { type: 'text' },
});

/** A voice note's audio. */
async function fetchAudio(mediaId) {
  if (!/^\w{1,100}$/.test(String(mediaId || ''))) throw new Error('Not a media id');
  const media = await callMeta(mediaId);
  const tooBig = () => Object.assign(new Error('The voice note is too long'), { tooBig: true });
  if (Number(media.file_size) > MAX_AUDIO_BYTES) throw tooBig();
  if (!/^https:\/\//.test(String(media.url || ''))) throw new Error('Meta gave no address for the audio');
  const res = await fetch(media.url, { headers: { Authorization: `Bearer ${env('WHATSAPP_ACCESS_TOKEN')}` }, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`Meta answered ${res.status} for the audio`);
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length > MAX_AUDIO_BYTES) throw tooBig();
  return { bytes, mime: String(media.mime_type || 'audio/ogg').split(';')[0].trim() };
}

module.exports = { absNumber, assistantReady, chatLink, fetchAudio, isAbsNumber, markRead, sendButtons, sendLink, sendList, sendText };
