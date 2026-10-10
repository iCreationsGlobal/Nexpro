import { collapseRepeatedDialCode, joinDialCode } from '@/utils/displayPhone';
import { isValidDirectMomoPhone, normalizeDirectMomoPhone } from '@/utils/paymentCollection';
import { normalizePhoneForWhatsApp } from '@/utils/whatsapp';

jest.mock('react-native', () => ({
  Alert: { alert: jest.fn() },
  Linking: { openURL: jest.fn(), canOpenURL: jest.fn() },
}));

describe('collapseRepeatedDialCode', () => {
  it.each([
    ['+233+233555155979', '+233555155979'],
    ['+233 +233 55 515 5979', '+233 55 515 5979'],
    ['+233233555155979', '+233555155979'],
  ])('collapses %s', (input, expected) => {
    expect(collapseRepeatedDialCode(input)).toBe(expected);
  });

  it.each(['+233555155979', '0555155979', '+44 7700 900123'])('leaves %s unchanged', (input) => {
    expect(collapseRepeatedDialCode(input)).toBe(input);
  });
});

describe('joinDialCode', () => {
  it.each([
    ['+233', '0555155979', '+233 555155979'],
    ['+233', '555155979', '+233 555155979'],
    ['+233', '+233555155979', '+233555155979'],
    ['+233', '+233 55 515 5979', '+233 55 515 5979'],
    ['+233', '233555155979', '+233 555155979'],
    ['+233', '+44 7700 900123', '+44 7700 900123'],
  ])('joins %s with %s', (code, number, expected) => {
    expect(joinDialCode(code, number)).toBe(expected);
  });
});

describe('numbers saved with the dial code twice', () => {
  it('still produce a working WhatsApp link number', () => {
    expect(normalizePhoneForWhatsApp('+233+233555155979', '233')).toBe('233555155979');
  });

  it('still produce a valid MoMo number', () => {
    expect(normalizeDirectMomoPhone('+233+233555155979')).toBe('233555155979');
    expect(isValidDirectMomoPhone('+233+233555155979')).toBe(true);
  });
});
