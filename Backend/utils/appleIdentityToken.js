const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const axios = require('axios');

/**
 * Sign in with Apple: check the identity token the iOS app gets from Apple.
 *
 * The token is a JWT signed with one of Apple's published keys. It must come from Apple
 * (issuer), be meant for our app (audience = bundle ID), not be expired, and carry the nonce
 * the app asked for: the app sends Apple the SHA-256 of a random string and sends us the
 * string itself, so we hash it and compare.
 */

const APPLE_ISSUER = 'https://appleid.apple.com';
const APPLE_KEYS_URL = 'https://appleid.apple.com/auth/keys';
const KEYS_CACHE_MS = 6 * 60 * 60 * 1000;
const DEFAULT_AUDIENCES = ['com.absghana.app'];

class AppleTokenError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AppleTokenError';
  }
}

let cachedKeys = null;
let cachedAt = 0;

async function fetchAppleKeys({ force = false } = {}) {
  if (!force && cachedKeys && Date.now() - cachedAt < KEYS_CACHE_MS) return cachedKeys;
  const res = await axios.get(APPLE_KEYS_URL, { timeout: 10000 });
  const keys = Array.isArray(res?.data?.keys) ? res.data.keys : [];
  if (!keys.length) throw new Error('Apple returned no signing keys');
  cachedKeys = keys;
  cachedAt = Date.now();
  return keys;
}

/** Bundle IDs (and Services IDs, for web) whose tokens we accept. `APPLE_AUDIENCES` is comma-separated. */
function getAppleAudiences() {
  const fromEnv = String(process.env.APPLE_AUDIENCES || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  return fromEnv.length ? fromEnv : DEFAULT_AUDIENCES;
}

const sha256Hex = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');

/** Apple sends these booleans as true/false or as the strings "true"/"false". */
const claimIsTrue = (value) => value === true || value === 'true';

/**
 * @param {string} identityToken
 * @param {{ rawNonce?: string, audiences?: string[], getKeys?: (opts?: { force?: boolean }) => Promise<object[]> }} [options]
 * @returns {Promise<{ sub: string, email: string, emailVerified: boolean, isPrivateEmail: boolean }>}
 */
async function verifyAppleIdentityToken(identityToken, options = {}) {
  const { rawNonce, audiences = getAppleAudiences(), getKeys = fetchAppleKeys } = options;

  if (!identityToken || typeof identityToken !== 'string') {
    throw new AppleTokenError('Apple identity token is required');
  }
  const decoded = jwt.decode(identityToken, { complete: true });
  const kid = decoded?.header?.kid;
  if (!kid) throw new AppleTokenError('Invalid Apple identity token');

  // Apple rotates keys: on an unknown key ID, fetch the list again once.
  let jwk = (await getKeys()).find((key) => key.kid === kid);
  if (!jwk) jwk = (await getKeys({ force: true })).find((key) => key.kid === kid);
  if (!jwk) throw new AppleTokenError('Invalid Apple identity token');

  let payload;
  try {
    const publicKey = crypto.createPublicKey({ key: jwk, format: 'jwk' });
    payload = jwt.verify(identityToken, publicKey, {
      algorithms: ['RS256'],
      issuer: APPLE_ISSUER,
      audience: audiences,
      clockTolerance: 60,
    });
  } catch (err) {
    throw new AppleTokenError('Invalid or expired Apple token');
  }

  if (!payload?.sub) throw new AppleTokenError('Invalid Apple identity token');

  if (payload.nonce || rawNonce) {
    if (!rawNonce || typeof rawNonce !== 'string' || payload.nonce !== sha256Hex(rawNonce)) {
      throw new AppleTokenError('Apple sign-in could not be verified. Please try again.');
    }
  }

  return {
    sub: String(payload.sub),
    email: String(payload.email || '').trim().toLowerCase(),
    emailVerified: claimIsTrue(payload.email_verified),
    isPrivateEmail: claimIsTrue(payload.is_private_email),
  };
}

/** Hide My Email addresses end in this domain. */
const isApplePrivateRelayEmail = (email) => /@privaterelay\.appleid\.com$/i.test(String(email || '').trim());

/**
 * The name the app passes on: Apple only shares it on the very first sign-in, so it can be missing.
 * Falls back to the email's first part, except for Hide My Email addresses, which are random letters.
 */
function resolveAppleDisplayName(fullName, email) {
  let name = '';
  if (fullName && typeof fullName === 'object') {
    name = [fullName.givenName, fullName.familyName]
      .map((part) => (typeof part === 'string' ? part.trim() : ''))
      .filter(Boolean)
      .join(' ');
  } else if (typeof fullName === 'string') {
    name = fullName.trim();
  }
  name = name.replace(/\s+/g, ' ').slice(0, 100);
  if (name) return name;
  const localPart = String(email || '').split('@')[0].trim();
  if (localPart && !isApplePrivateRelayEmail(email)) return localPart.slice(0, 100);
  return 'ABS user';
}

module.exports = {
  APPLE_ISSUER,
  AppleTokenError,
  fetchAppleKeys,
  getAppleAudiences,
  isApplePrivateRelayEmail,
  resolveAppleDisplayName,
  sha256Hex,
  verifyAppleIdentityToken,
};
