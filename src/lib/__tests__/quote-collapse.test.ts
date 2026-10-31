import { describe, it, expect } from 'vitest';
import { collapsePlainTextQuotes, buildQuoteCollapseScript, QUOTE_TOGGLE_ATTR } from '../quote-collapse';

const labels = { show: 'Show quoted text', hide: 'Hide quoted text' };

describe('collapsePlainTextQuotes', () => {
  it('wraps the trailing quote run in <details>', () => {
    const html = 'Thanks!\n\nOn Monday, Bob wrote:\n&gt; original line 1\n&gt;\n&gt; original line 2';
    const out = collapsePlainTextQuotes(html, labels);
    expect(out).toContain('<details><summary title="Show quoted text"');
    expect(out).toContain('&gt; original line 1\n&gt;\n&gt; original line 2</details>');
    expect(out.startsWith('Thanks!\n\nOn Monday, Bob wrote:\n')).toBe(true);
  });

  it('keeps a trailing signature block visible', () => {
    const html = 'Hi\n&gt; quoted\n\n-- \nBob';
    const out = collapsePlainTextQuotes(html, labels);
    expect(out).toContain('</details>\n\n-- \nBob');
  });

  it('is a no-op for interleaved replies and quote-only bodies', () => {
    expect(collapsePlainTextQuotes('&gt; a\nreply below', labels)).toBe('&gt; a\nreply below');
    expect(collapsePlainTextQuotes('&gt; only quote', labels)).toBe('&gt; only quote');
    expect(collapsePlainTextQuotes('no quotes here', labels)).toBe('no quotes here');
  });

  it('escapes the label', () => {
    const out = collapsePlainTextQuotes('a\n&gt; b', { show: 'x"<y', hide: 'h' });
    expect(out).toContain('title="x&quot;&lt;y"');
  });
});

describe('buildQuoteCollapseScript', () => {
  it('embeds the selectors and labels as JSON', () => {
    const script = buildQuoteCollapseScript(labels);
    expect(script).toContain('"div.gmail_quote"');
    expect(script).toContain('"#divRplyFwdMsg"');
    expect(script).toContain(`"${QUOTE_TOGGLE_ATTR}"`);
    expect(script).toContain('"Show quoted text"');
    expect(script).toContain('"Hide quoted text"');
  });
});
