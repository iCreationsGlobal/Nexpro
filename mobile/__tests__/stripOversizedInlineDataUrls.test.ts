import {
  MAX_INLINE_IMAGE_DATA_URL_LENGTH,
  parseJsonStrippingOversizedInlineDataUrls,
  stripOversizedInlineDataUrlsFromJsonText,
} from '@/utils/stripOversizedInlineDataUrls';

describe('stripOversizedInlineDataUrlsFromJsonText', () => {
  it('leaves small JSON unchanged', () => {
    const raw = JSON.stringify({ profilePicture: 'data:image/png;base64,abc', name: 'Ama' });
    expect(stripOversizedInlineDataUrlsFromJsonText(raw)).toBe(raw);
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
});
