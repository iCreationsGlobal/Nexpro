/**
 * Profile avatars historically stored as data:image/...;base64,... in users.profilePicture.
 * Sending multi-MB strings in JSON OOMs React Native (Profile screen crash).
 */

/** Max chars for an inline data URL in API JSON (~150KB payload). */
const MAX_INLINE_PROFILE_PICTURE_CHARS = 200_000;

/**
 * @param {unknown} profilePicture
 * @returns {string|null}
 */
function sanitizeProfilePictureForClient(profilePicture) {
  if (profilePicture == null) return null;
  if (typeof profilePicture !== 'string') return null;
  const trimmed = profilePicture.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('data:') && trimmed.length > MAX_INLINE_PROFILE_PICTURE_CHARS) {
    return null;
  }
  return trimmed;
}

/**
 * Mutates a user JSON payload so oversized inline avatars are omitted.
 * @param {Record<string, unknown>|null|undefined} userJson
 * @returns {Record<string, unknown>|null|undefined}
 */
function attachSafeProfilePicture(userJson) {
  if (!userJson || typeof userJson !== 'object') return userJson;
  userJson.profilePicture = sanitizeProfilePictureForClient(userJson.profilePicture);
  return userJson;
}

module.exports = {
  MAX_INLINE_PROFILE_PICTURE_CHARS,
  sanitizeProfilePictureForClient,
  attachSafeProfilePicture,
};
