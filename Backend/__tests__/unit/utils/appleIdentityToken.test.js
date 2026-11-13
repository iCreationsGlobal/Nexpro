const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const {
  AppleTokenError,
  isApplePrivateRelayEmail,
  resolveAppleDisplayName,
  sha256Hex,
  verifyAppleIdentityToken,
} = require('../../../utils/appleIdentityToken');

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const KID = 'test-key-1';
const appleJwk = { ...publicKey.export({ format: 'jwk' }), kid: KID, alg: 'RS256', use: 'sig' };
const getKeys = jest.fn(async () => [appleJwk]);

const RAW_NONCE = 'raw-nonce-from-the-app';

const signToken = (claims = {}, { kid = KID, key = privateKey, expiresIn = '10m' } = {}) =>
  jwt.sign(
    {
      iss: 'https://appleid.apple.com',
      aud: 'com.absghana.app',
      sub: '001234.abcdef.1234',
      email: 'Owner@Example.com',
      email_verified: 'true',
      nonce: sha256Hex(RAW_NONCE),
      ...claims,
    },
    key,
    { algorithm: 'RS256', keyid: kid, expiresIn }
  );

const verify = (token, options = {}) =>
  verifyAppleIdentityToken(token, { rawNonce: RAW_NONCE, audiences: ['com.absghana.app'], getKeys, ...options });

describe('verifyAppleIdentityToken', () => {
  beforeEach(() => getKeys.mockClear());

  it('accepts a token from Apple for our app and returns who it is', async () => {
    await expect(verify(signToken())).resolves.toEqual({
      sub: '001234.abcdef.1234',
      email: 'owner@example.com',
      emailVerified: true,
      isPrivateEmail: false,
    });
  });

  it('reads Hide My Email tokens', async () => {
    const token = signToken({ email: 'x7k2m9qz@privaterelay.appleid.com', is_private_email: true, email_verified: true });
    await expect(verify(token)).resolves.toMatchObject({
      email: 'x7k2m9qz@privaterelay.appleid.com',
      emailVerified: true,
      isPrivateEmail: true,
    });
  });

  it('rejects a token meant for another app', async () => {
    await expect(verify(signToken({ aud: 'com.someone.else' }))).rejects.toBeInstanceOf(AppleTokenError);
  });

  it('rejects a token not issued by Apple', async () => {
    await expect(verify(signToken({ iss: 'https://evil.example.com' }))).rejects.toBeInstanceOf(AppleTokenError);
  });

  it('rejects an expired token', async () => {
    await expect(verify(signToken({}, { expiresIn: '-5m' }))).rejects.toThrow('Invalid or expired Apple token');
  });

  it('rejects a token signed with a key that is not Apple’s', async () => {
    const { privateKey: otherKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    await expect(verify(signToken({}, { key: otherKey }))).rejects.toBeInstanceOf(AppleTokenError);
  });

  it('rejects a wrong or missing nonce', async () => {
    await expect(verify(signToken(), { rawNonce: 'something-else' })).rejects.toThrow(/could not be verified/);
    await expect(verify(signToken(), { rawNonce: undefined })).rejects.toThrow(/could not be verified/);
    await expect(verify(signToken({ nonce: undefined }))).rejects.toThrow(/could not be verified/);
  });

  it('fetches Apple’s keys again once when the key ID is new', async () => {
    const rotated = { ...appleJwk, kid: 'rotated-key' };
    const keys = jest.fn(async ({ force } = {}) => (force ? [appleJwk, rotated] : [appleJwk]));
    await expect(verify(signToken({}, { kid: 'rotated-key' }), { getKeys: keys })).resolves.toMatchObject({
      sub: '001234.abcdef.1234',
    });
    expect(keys).toHaveBeenCalledTimes(2);
    expect(keys).toHaveBeenLastCalledWith({ force: true });
  });

  it('rejects a token whose key Apple does not list', async () => {
    await expect(verify(signToken({}, { kid: 'unknown' }))).rejects.toBeInstanceOf(AppleTokenError);
  });

  it('rejects junk', async () => {
    await expect(verify('not-a-token')).rejects.toBeInstanceOf(AppleTokenError);
    await expect(verify('')).rejects.toBeInstanceOf(AppleTokenError);
  });
});

describe('resolveAppleDisplayName', () => {
  it('uses the name Apple shared on the first sign-in', () => {
    expect(resolveAppleDisplayName({ givenName: ' Ama ', familyName: 'Mensah' }, 'ama@example.com')).toBe('Ama Mensah');
    expect(resolveAppleDisplayName({ givenName: 'Kofi', familyName: null }, 'k@example.com')).toBe('Kofi');
  });

  it('falls back to the email, but not a Hide My Email address', () => {
    expect(resolveAppleDisplayName(null, 'kwame.owusu@example.com')).toBe('kwame.owusu');
    expect(resolveAppleDisplayName({}, 'x7k2m9qz@privaterelay.appleid.com')).toBe('ABS user');
    expect(resolveAppleDisplayName(undefined, '')).toBe('ABS user');
  });

  it('knows relay addresses', () => {
    expect(isApplePrivateRelayEmail('abc@privaterelay.appleid.com')).toBe(true);
    expect(isApplePrivateRelayEmail('abc@icloud.com')).toBe(false);
  });
});
