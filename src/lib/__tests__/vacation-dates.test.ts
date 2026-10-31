import { describe, it, expect } from 'vitest';
import {
  parseLocalInput,
  localInputToUtcIso,
  utcIsoToLocalInput,
  isValidLocalInput,
  normalizeUtcIso,
} from '../vacation-dates';

describe('vacation date helpers', () => {
  it('parses local wall-clock input in the device time zone', () => {
    const d = parseLocalInput('2026-03-01 09:30');
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2026);
    expect(d!.getMonth()).toBe(2);
    expect(d!.getDate()).toBe(1);
    expect(d!.getHours()).toBe(9);
    expect(d!.getMinutes()).toBe(30);
  });

  it('accepts date-only and T-separated forms, rejects garbage and overflow', () => {
    expect(parseLocalInput('2026-03-01')!.getHours()).toBe(0);
    expect(parseLocalInput('2026-03-01T09:30:15')!.getSeconds()).toBe(15);
    expect(parseLocalInput('tomorrow')).toBeNull();
    expect(parseLocalInput('2026-13-45 09:30')).toBeNull();
    expect(parseLocalInput('2026-03-01 25:00')).toBeNull();
  });

  it('emits a real UTCDate with a Z designator', () => {
    const iso = localInputToUtcIso('2026-03-01 09:30');
    expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(iso).toBe(new Date(2026, 2, 1, 9, 30).toISOString());
    expect(localInputToUtcIso('')).toBeNull();
    expect(localInputToUtcIso('   ')).toBeNull();
  });

  it('round-trips through local display', () => {
    const iso = localInputToUtcIso('2026-03-01 09:30')!;
    expect(utcIsoToLocalInput(iso)).toBe('2026-03-01 09:30');
    expect(utcIsoToLocalInput(null)).toBe('');
    expect(utcIsoToLocalInput('not a date')).toBe('');
  });

  it('shows a server UTC date in local time, not as UTC wall time', () => {
    const local = utcIsoToLocalInput('2026-03-01T09:30:00Z');
    const expected = new Date('2026-03-01T09:30:00Z');
    expect(local).toBe(
      `${expected.getFullYear()}-${String(expected.getMonth() + 1).padStart(2, '0')}-${String(expected.getDate()).padStart(2, '0')} ${String(expected.getHours()).padStart(2, '0')}:${String(expected.getMinutes()).padStart(2, '0')}`,
    );
  });

  it('validates input (empty is valid = unset)', () => {
    expect(isValidLocalInput('')).toBe(true);
    expect(isValidLocalInput('2026-03-01 09:30')).toBe(true);
    expect(isValidLocalInput('03/01/2026')).toBe(false);
  });

  it('normalises stored dates for change detection', () => {
    expect(normalizeUtcIso(null)).toBeNull();
    expect(normalizeUtcIso('2026-03-01T09:30:00Z')).toBe('2026-03-01T09:30:00.000Z');
    expect(normalizeUtcIso('garbage')).toBeNull();
  });
});
