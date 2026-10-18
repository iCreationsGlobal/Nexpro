const DEFAULT_RECEIPT_CHANNELS = ['sms', 'print'];
const DEFAULT_CHANNELS_AVAILABLE = { sms: false, whatsapp: false, email: false };

/**
 * Receipt channels the cashier can manually choose after a sale.
 * Print is kept when configured; SMS/email/WhatsApp only when the channel is integrated.
 * @param {Object} [posConfig]
 * @returns {string[]}
 */
export function getEffectiveReceiptChannels(posConfig) {
  const rawChannels = posConfig?.receipt?.channels || DEFAULT_RECEIPT_CHANNELS;
  const available = posConfig?.receiptChannelsAvailable || DEFAULT_CHANNELS_AVAILABLE;

  return rawChannels.filter((channel) => channel === 'print' || available[channel] === true);
}

/**
 * Integrated send channels (excluding print) available for manual or POS auto-send.
 * @param {Object} [posConfig]
 * @returns {string[]}
 */
export function getIntegratedSendChannels(posConfig) {
  return getEffectiveReceiptChannels(posConfig).filter((channel) => channel !== 'print');
}

/**
 * Whether the post-sale receipt dialog should be skipped entirely.
 * Auto modes still open the modal when it must run print/send side effects.
 * @param {Object} [posConfig]
 * @returns {boolean}
 */
export function shouldSkipReceiptModal(posConfig) {
  const receiptMode = posConfig?.receipt?.mode || 'ask';
  const effectiveChannels = getEffectiveReceiptChannels(posConfig);
  const integratedSend = getIntegratedSendChannels(posConfig);

  if (receiptMode === 'auto_send' && integratedSend.length === 0) {
    return true;
  }
  if (receiptMode === 'ask' && effectiveChannels.length === 0) {
    return true;
  }

  return false;
}
