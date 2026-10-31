import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { sha256Hex } from '../sha256';

const expected = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

describe('SHA-256 byte hashing', () => {
  it('matches the platform digest across padding and block boundaries', () => {
    for (const length of [0, 1, 3, 55, 56, 63, 64, 65, 127, 128, 1024, 1024 * 1024]) {
      const bytes = Uint8Array.from({ length }, (_, i) => (i * 79 + 13) & 255);
      expect(sha256Hex(bytes)).toBe(expected(bytes));
    }
  });
});
