import {
  MAX_INLINE_IMAGE_DATA_URL_LENGTH,
  parseJsonStrippingOversizedInlineDataUrls,
  sanitizeAuthUserForMobile,
  stripInlineDataUrlsFromJsonText,
} from '@/utils/stripOversizedInlineDataUrls';

describe('stripInlineDataUrlsFromJsonText', () => {
  it('leaves JSON without inline data URLs unchanged', () => {
    const raw = JSON.stringify({ name: 'Ama', imageUrl: 'https://cdn.example.com/a.png' });
    expect(stripInlineDataUrlsFromJsonText(raw)).toBe(raw);
  });

  it('blanks any inline data URL before parse (not only multi-MB payloads)', () => {
    const small = 'data:image/png;base64,abc';
    const raw = JSON.stringify({ profilePicture: small, name: 'Ama' });
    expect(stripInlineDataUrlsFromJsonText(raw)).toBe(
      JSON.stringify({ profilePicture: '', name: 'Ama' })
    );
  });

  it('blanks oversized data URLs before parse so Profile/Products do not OOM', () => {
    const huge = `data:image/jpeg;base64,${'x'.repeat(MAX_INLINE_IMAGE_DATA_URL_LENGTH + 8)}`;
    const raw = JSON.stringify({
      success: true,
      data: { profilePicture: huge, imageUrl: huge, name: 'Ama' },
    });
    const parsed = parseJsonStrippingOversizedInlineDataUrls(raw) as {
      data: { profilePicture: string; imageUrl: string; name: string };
    };
    expect(parsed.data.name).toBe('Ama');
    expect(parsed.data.profilePicture).toBe('');
    expect(parsed.data.imageUrl).toBe('');
  });

  it('strips many medium inline images that together would OOM a phone', () => {
    const medium = `data:image/jpeg;base64,${'m'.repeat(80_000)}`;
    const rows = Array.from({ length: 12 }, (_, i) => ({
      id: `p${i}`,
      name: `Product ${i}`,
      imageUrl: medium,
    }));
    const raw = JSON.stringify({ success: true, data: rows });
    const parsed = parseJsonStrippingOversizedInlineDataUrls(raw) as {
      data: Array<{ imageUrl: string }>;
    };
    expect(parsed.data.every((row) => row.imageUrl === '')).toBe(true);
  });
});

describe('sanitizeAuthUserForMobile', () => {
  it('clears inline profilePicture on cached user objects', () => {
    const user = sanitizeAuthUserForMobile({
      id: 'u1',
      email: 'a@b.com',
      profilePicture: 'data:image/png;base64,abc',
    });
    expect(user.profilePicture).toBe('');
  });
});
