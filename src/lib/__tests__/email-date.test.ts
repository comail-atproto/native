import { describe, it, expect } from 'vitest';
import { emailDisplayDate, formatHeaderTime, MAX_FUTURE_SENT_AT_MS } from '../email-date';

describe('emailDisplayDate', () => {
  it('prefers sentAt over receivedAt (#891)', () => {
    expect(emailDisplayDate({ sentAt: '2024-01-01T00:00:00Z', receivedAt: '2026-06-01T00:00:00Z' })).toBe('2024-01-01T00:00:00Z');
  });

  it('falls back when sentAt is missing, unparsable or forged into the future', () => {
    expect(emailDisplayDate({ receivedAt: '2026-06-01T00:00:00Z' })).toBe('2026-06-01T00:00:00Z');
    expect(emailDisplayDate({ sentAt: 'garbage', receivedAt: '2026-06-01T00:00:00Z' })).toBe('2026-06-01T00:00:00Z');
    const received = Date.parse('2026-06-01T00:00:00Z');
    const future = new Date(received + MAX_FUTURE_SENT_AT_MS + 1000).toISOString();
    expect(emailDisplayDate({ sentAt: future, receivedAt: '2026-06-01T00:00:00Z' })).toBe('2026-06-01T00:00:00Z');
    const slightlyAhead = new Date(received + 60_000).toISOString();
    expect(emailDisplayDate({ sentAt: slightlyAhead, receivedAt: '2026-06-01T00:00:00Z' })).toBe(slightlyAhead);
  });
});

describe('formatHeaderTime', () => {
  it('honours the time-format setting', () => {
    const iso = '2026-06-01T15:07:00';
    expect(formatHeaderTime(iso, '24h', 'en')).toMatch(/15:07/);
    expect(formatHeaderTime(iso, '12h', 'en')).toMatch(/3:07\s?PM/i);
    expect(formatHeaderTime(undefined, '24h')).toBe('');
  });
});
