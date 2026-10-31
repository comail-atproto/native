import { describe, it, expect } from 'vitest';
import {
  parseSubAddress,
  generateSubAddress,
  suggestTagsForDomain,
  getTagValidationError,
  isValidSubAddressDelimiter,
} from '../sub-addressing';

describe('sub-addressing', () => {
  it('parses the tag after the first delimiter', () => {
    expect(parseSubAddress('user+shop+x@example.com')).toMatchObject({ baseUser: 'user', tag: 'shop+x', domain: 'example.com' });
    expect(parseSubAddress('user@example.com').tag).toBeNull();
    expect(parseSubAddress('user-shop@example.com', '-').tag).toBe('shop');
  });

  it('generates and replaces tags', () => {
    expect(generateSubAddress('user@example.com', 'Shopping')).toBe('user+shopping@example.com');
    expect(generateSubAddress('user+old@example.com', 'new')).toBe('user+new@example.com');
    expect(generateSubAddress('user@example.com', '!!!')).toBe('user@example.com');
  });

  it('suggests tags for known and generic domains', () => {
    expect(suggestTagsForDomain('amazon.de')).toEqual(['amazon', 'shopping', 'orders']);
    expect(suggestTagsForDomain('mail.acme.io')).toEqual(['acme', 'newsletter', 'registration']);
  });

  it('validates tags and delimiters', () => {
    expect(getTagValidationError('')).toBe('EMPTY');
    expect(getTagValidationError('a'.repeat(31))).toBe('TOO_LONG');
    expect(getTagValidationError('a b')).toBe('INVALID_CHARS');
    expect(getTagValidationError('ok-1')).toBeNull();
    expect(isValidSubAddressDelimiter('+')).toBe(true);
    expect(isValidSubAddressDelimiter('@')).toBe(false);
    expect(isValidSubAddressDelimiter('++')).toBe(false);
  });
});
