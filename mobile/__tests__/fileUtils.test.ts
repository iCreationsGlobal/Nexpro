jest.mock('@/services/api', () => ({
  API_BASE_URL: 'http://localhost:5001',
}));

import {
  MAX_INLINE_IMAGE_DATA_URL_LENGTH,
  resolveDisplayImageUrl,
  resolveImageUrl,
} from '@/utils/fileUtils';

describe('resolveDisplayImageUrl', () => {
  it('returns empty for nullish input', () => {
    expect(resolveDisplayImageUrl(null)).toBe('');
    expect(resolveDisplayImageUrl(undefined)).toBe('');
    expect(resolveDisplayImageUrl('')).toBe('');
  });

  it('passes through http urls', () => {
    expect(resolveDisplayImageUrl('https://cdn.example.com/a.png')).toBe(
      'https://cdn.example.com/a.png'
    );
  });

  it('passes through small data urls', () => {
    const small = 'data:image/png;base64,abc';
    expect(resolveDisplayImageUrl(small)).toBe(small);
  });

  it('rejects oversized data urls that can OOM Profile Image', () => {
    const huge = `data:image/jpeg;base64,${'a'.repeat(MAX_INLINE_IMAGE_DATA_URL_LENGTH)}`;
    expect(resolveImageUrl(huge)).toBe(huge);
    expect(resolveDisplayImageUrl(huge)).toBe('');
  });

  it('rejects data urls just over the safe display limit', () => {
    const over = `data:image/png;base64,${'b'.repeat(MAX_INLINE_IMAGE_DATA_URL_LENGTH + 1)}`;
    expect(resolveDisplayImageUrl(over)).toBe('');
  });

  it('unwraps { url } objects', () => {
    expect(resolveDisplayImageUrl({ url: 'https://cdn.example.com/b.jpg' })).toBe(
      'https://cdn.example.com/b.jpg'
    );
  });
});
