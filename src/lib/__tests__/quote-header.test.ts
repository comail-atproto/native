import { describe, it, expect } from 'vitest';
import { buildQuoteHeader, formatQuoteSender } from '../quote-header';

describe('quote header', () => {
  it('renders Name <email> escaped in the reply line', () => {
    const h = buildQuoteHeader({
      mode: 'reply',
      email: { from: { name: 'Alice', email: 'a@b.com' }, receivedAt: '2026-04-27T10:00:00Z' },
      timeFormat: '24h',
      unknownLabel: 'Unknown',
    });
    expect(h.wrapInBlockquote).toBe(true);
    expect(h.html).toMatch(/^<div>On .+, Alice &lt;a@b\.com&gt; wrote:<br><\/div>$/);
    expect(h.text).toMatch(/Alice <a@b\.com> wrote:\n$/);
  });

  it('uses localized labels', () => {
    const h = buildQuoteHeader({
      mode: 'forward',
      email: { from: { email: 'a@b.com' }, subject: 'S' },
      timeFormat: '24h',
      unknownLabel: 'Unbekannt',
      labels: {
        replyLine: 'Am {date} schrieb {from}:',
        forwardedSeparator: '---------- Weitergeleitete Nachricht ----------',
        fromLabel: 'Von',
        dateLabel: 'Datum',
        subjectLabel: 'Betreff',
      },
    });
    expect(h.wrapInBlockquote).toBe(false);
    expect(h.html).toContain('Weitergeleitete Nachricht');
    expect(h.html).toContain('Von: a@b.com<br>Datum: <br>Betreff: S');
  });

  it('collapses the date when unknown', () => {
    const h = buildQuoteHeader({ mode: 'reply', email: { from: { email: 'a@b.com' } }, timeFormat: '24h', unknownLabel: 'U' });
    expect(h.html).toBe('<div>a@b.com wrote:<br></div>');
    expect(formatQuoteSender(undefined, 'U')).toBe('U');
  });
});
