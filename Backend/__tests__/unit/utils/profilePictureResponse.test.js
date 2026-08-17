const {
  attachSafeProfilePicture,
  sanitizeProfilePictureForClient,
  MAX_INLINE_PROFILE_PICTURE_CHARS,
} = require('../../../utils/profilePictureResponse');

describe('profilePictureResponse', () => {
  it('passes through http and relative upload paths', () => {
    expect(sanitizeProfilePictureForClient('https://cdn.example.com/a.png')).toBe(
      'https://cdn.example.com/a.png'
    );
    expect(sanitizeProfilePictureForClient('/uploads/avatars/u.jpg')).toBe('/uploads/avatars/u.jpg');
  });

  it('passes through small data URLs', () => {
    const small = 'data:image/png;base64,abc';
    expect(sanitizeProfilePictureForClient(small)).toBe(small);
  });

  it('omits oversized data URLs that crash mobile Profile', () => {
    const huge = `data:image/jpeg;base64,${'a'.repeat(MAX_INLINE_PROFILE_PICTURE_CHARS + 1)}`;
    expect(sanitizeProfilePictureForClient(huge)).toBeNull();
    expect(attachSafeProfilePicture({ id: '1', profilePicture: huge }).profilePicture).toBeNull();
  });
});
