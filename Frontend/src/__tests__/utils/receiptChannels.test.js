import { describe, it, expect } from 'vitest';
import {
  getEffectiveReceiptChannels,
  getIntegratedSendChannels,
  shouldSkipReceiptModal,
} from '../../utils/receiptChannels';

describe('receiptChannels', () => {
  const baseConfig = {
    receipt: { mode: 'ask', channels: ['sms', 'print', 'email'] },
    receiptChannelsAvailable: { sms: true, whatsapp: false, email: true },
  };

  it('returns every configured channel that is set up', () => {
    const config = {
      receipt: { mode: 'ask', channels: ['sms', 'whatsapp', 'email', 'print'] },
      receiptChannelsAvailable: { sms: true, whatsapp: true, email: true },
    };

    expect(getEffectiveReceiptChannels(config)).toEqual(['sms', 'whatsapp', 'email', 'print']);
    expect(getIntegratedSendChannels(config)).toEqual(['sms', 'whatsapp', 'email']);
  });

  it('drops configured channels that are not integrated but keeps print', () => {
    const config = {
      ...baseConfig,
      receiptChannelsAvailable: { sms: false, whatsapp: false, email: true },
    };

    expect(getEffectiveReceiptChannels(config)).toEqual(['print', 'email']);
    expect(getIntegratedSendChannels(config)).toEqual(['email']);
  });

  it('does not open the ask-mode modal when no configured channel is usable', () => {
    const config = {
      receipt: { mode: 'ask', channels: ['sms'] },
      receiptChannelsAvailable: { sms: false, whatsapp: false, email: false },
    };

    expect(shouldSkipReceiptModal(config)).toBe(true);
  });

  it('does not open the auto_send modal when no send channel is integrated', () => {
    const config = {
      receipt: { mode: 'auto_send', channels: ['sms', 'print'] },
      receiptChannelsAvailable: { sms: false, whatsapp: false, email: false },
    };

    expect(shouldSkipReceiptModal(config)).toBe(true);
  });

  it('opens the modal when a configured channel is available', () => {
    expect(shouldSkipReceiptModal(baseConfig)).toBe(false);
    expect(
      shouldSkipReceiptModal({ ...baseConfig, receipt: { mode: 'auto_send', channels: ['sms', 'print'] } })
    ).toBe(false);
  });
});
