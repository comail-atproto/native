// Cryptographically strong random bytes for OAuth `state`, PKCE verifiers,
// TOTP secrets and UUIDs. Hermes exposes no `crypto` global by default, so
// the previous helpers quietly fell back to Math.random — fine for a cache
// key, not for a long-lived 2FA secret or the only guard against a forged
// `bulwarkmobile://` redirect. `expo-crypto` is the platform CSPRNG; the web
// / test fallbacks below keep the module usable off-device.

let expoCrypto: { getRandomValues?: <T extends ArrayBufferView>(a: T) => T; getRandomBytes?: (n: number) => Uint8Array; randomUUID?: () => string } | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  expoCrypto = require('expo-crypto');
} catch {
  expoCrypto = null;
}

export function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);

  if (expoCrypto?.getRandomValues) {
    try {
      expoCrypto.getRandomValues(bytes);
      return bytes;
    } catch {
      // fall through
    }
  }
  if (expoCrypto?.getRandomBytes) {
    try {
      const out = expoCrypto.getRandomBytes(length);
      if (out?.length === length) return out;
    } catch {
      // fall through
    }
  }

  const c = (globalThis as {
    crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array; randomUUID?: () => string };
  }).crypto;
  if (c?.getRandomValues) {
    try {
      c.getRandomValues(bytes);
      return bytes;
    } catch {
      // fall through
    }
  }
  if (c?.randomUUID) {
    try {
      let hex = '';
      while (hex.length < length * 2) hex += c.randomUUID().replace(/-/g, '');
      for (let i = 0; i < length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
      return bytes;
    } catch {
      // fall through
    }
  }

  throw new Error('No secure random source available');
}

/** Lowercase hex of `length` random bytes. */
export function randomHex(length: number): string {
  let s = '';
  for (const b of randomBytes(length)) s += b.toString(16).padStart(2, '0');
  return s;
}

/** RFC 4648 §5 base64url without padding. */
export function base64UrlEncode(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  const b64 = typeof btoa === 'function' ? btoa(bin) : Buffer.from(bin, 'binary').toString('base64');
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** RFC 4122 v4 UUID from the secure source. */
export function secureRandomUUID(): string {
  if (expoCrypto?.randomUUID) {
    try {
      return expoCrypto.randomUUID();
    } catch {
      // fall through
    }
  }
  const b = randomBytes(16);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const hex = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
