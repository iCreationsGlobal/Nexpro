import { describe, expect, it } from 'vitest';
import {
  collapseRepeatedDialCode,
  formatDisplayPhone,
  joinDialCode,
  normalizePhone,
} from '../../utils/phoneUtils';

describe('collapseRepeatedDialCode', () => {
  it.each([
    ['+233+233555155979', '+233555155979'],
    ['+233 +233 55 515 5979', '+233 55 515 5979'],
    ['+233233555155979', '+233555155979'],
  ])('collapses %s', (input, expected) => {
    expect(collapseRepeatedDialCode(input)).toBe(expected);
    expect(formatDisplayPhone(input)).toBe(expected);
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
    ['+233', '+233 +233555155979', '+233555155979'],
    ['+233', '233 555 155 979', '+233 555155979'],
    ['+233', '00233555155979', '+233555155979'],
    ['+233', '+44 7700 900123', '+44 7700 900123'],
    ['+233', '', ''],
  ])('joins %s with %s', (code, number, expected) => {
    expect(joinDialCode(code, number)).toBe(expected);
  });
});

describe('normalizePhone with a doubled dial code', () => {
  it('stores one dial code', () => {
    expect(normalizePhone('+233+233555155979')).toBe('+233555155979');
    expect(normalizePhone('+233 +233 55 515 5979')).toBe('+233555155979');
  });
});
