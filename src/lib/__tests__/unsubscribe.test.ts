import { describe, it, expect } from 'vitest';
import {
  parseUnsubscribeUrls, isValidUnsubscribeUrl, parseMailtoUrl, isOneClickUnsubscribe,
} from '../unsubscribe';

describe('parseUnsubscribeUrls', () => {
  it('prefers http over mailto and validates both', () => {
    const r = parseUnsubscribeUrls('<mailto:unsub@list.example?subject=stop>, <https://list.example/u?x=1>');
    expect(r.preferred).toBe('http');
    expect(r.http).toBe('https://list.example/u?x=1');
    expect(r.mailto).toBe('mailto:unsub@list.example?subject=stop');
  });

  it('falls back to mailto and ignores junk', () => {
    expect(parseUnsubscribeUrls('<mailto:a@b.co>').preferred).toBe('mailto');
    expect(parseUnsubscribeUrls('<ftp://x>').preferred).toBeUndefined();
    expect(parseUnsubscribeUrls('')).toEqual({});
  });
});

describe('isValidUnsubscribeUrl', () => {
  it('accepts http(s) and mailto with a valid address only', () => {
    expect(isValidUnsubscribeUrl('https://x.example/u')).toBe(true);
    expect(isValidUnsubscribeUrl('mailto:a@b.co?subject=x')).toBe(true);
    expect(isValidUnsubscribeUrl('mailto:not-an-address')).toBe(false);
    expect(isValidUnsubscribeUrl('javascript:alert(1)')).toBe(false);
  });
});

describe('parseMailtoUrl', () => {
  it('parses recipients, subject and body without turning + into spaces', () => {
    const r = parseMailtoUrl('mailto:a+tag@b.co,c@d.co?subject=Hi%20there&body=Line%0Atwo&cc=e@f.co');
    expect(r).toEqual({ to: ['a+tag@b.co', 'c@d.co'], cc: ['e@f.co'], subject: 'Hi there', body: 'Line\ntwo' });
  });

  it('returns null without a recipient', () => {
    expect(parseMailtoUrl('mailto:?subject=x')).toBeNull();
    expect(parseMailtoUrl('https://x')).toBeNull();
  });
});

describe('isOneClickUnsubscribe', () => {
  it('requires the RFC 8058 header and an https URL', () => {
    expect(isOneClickUnsubscribe('List-Unsubscribe=One-Click', 'https://x/u')).toBe(true);
    expect(isOneClickUnsubscribe('List-Unsubscribe=One-Click', 'http://x/u')).toBe(false);
    expect(isOneClickUnsubscribe(undefined, 'https://x/u')).toBe(false);
  });
});
