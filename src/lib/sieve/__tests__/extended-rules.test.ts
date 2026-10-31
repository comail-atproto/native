import { describe, it, expect } from 'vitest';
import { generateScript } from '../generator';
import { parseScript } from '../parser';
import type { FilterRule } from '../types';

// Coverage for the 1.7.3 "extended rules" format shared with the webmail:
// multi-value conditions (Sieve string lists) and the attachment field
// (`header :mime :anychild`). Both clients write the same active script, so
// the mobile port must read and emit these byte-for-byte like the web does.

function makeRule(overrides: Partial<FilterRule> = {}): FilterRule {
  return {
    id: 'rule-1',
    name: 'Test Rule',
    enabled: true,
    matchType: 'all',
    conditions: [{ field: 'from', comparator: 'contains', value: 'test@example.com' }],
    actions: [{ type: 'move', value: 'Archive' }],
    stopProcessing: false,
    ...overrides,
  };
}

function stripMetadata(script: string): string {
  return script.replace(/\/\* @metadata:begin[\s\S]*?@metadata:end \*\/\n?/, '');
}

describe('multi-value conditions', () => {
  it('emits a Sieve string list for array values', () => {
    const script = generateScript([makeRule({
      conditions: [{ field: 'from', comparator: 'contains', value: ['@a.com', '@b.com'] }],
    })]);
    expect(script).toContain('if header :contains "From" ["@a.com", "@b.com"]');
  });

  it('keeps the single-string form for one-element arrays', () => {
    const script = generateScript([makeRule({
      conditions: [{ field: 'from', comparator: 'contains', value: ['only@a.com'] }],
    })]);
    expect(script).toContain('if header :contains "From" "only@a.com"');
  });

  it('drops empty items from the list', () => {
    const script = generateScript([makeRule({
      conditions: [{ field: 'subject', comparator: 'is', value: ['Hi', '', 'Hello'] }],
    })]);
    expect(script).toContain('header :is "Subject" ["Hi", "Hello"]');
  });

  it('applies the wildcard transform to every list item', () => {
    const starts = generateScript([makeRule({
      conditions: [{ field: 'subject', comparator: 'starts_with', value: ['[list]', 'RE:'] }],
    })]);
    expect(starts).toContain('header :matches "Subject" ["[list]*", "RE:*"]');

    const ends = generateScript([makeRule({
      conditions: [{ field: 'from', comparator: 'ends_with', value: ['@a.com', '@b.com'] }],
    })]);
    expect(ends).toContain('header :matches "From" ["*@a.com", "*@b.com"]');
  });

  it('escapes quotes and backslashes inside list items', () => {
    const script = generateScript([makeRule({
      conditions: [{ field: 'subject', comparator: 'contains', value: ['say "hi"', 'back\\slash'] }],
    })]);
    expect(script).toContain('["say \\"hi\\"", "back\\\\slash"]');
  });

  it('supports lists for body and negated tests', () => {
    const script = generateScript([makeRule({
      conditions: [
        { field: 'body', comparator: 'contains', value: ['unsubscribe', 'opt out'] },
        { field: 'to', comparator: 'not_is', value: ['x@a.com', 'y@a.com'] },
      ],
    })]);
    expect(script).toContain('body :contains ["unsubscribe", "opt out"]');
    expect(script).toContain('not header :is "To" ["x@a.com", "y@a.com"]');
  });

  it('uses only the first item for numeric size conditions', () => {
    const script = generateScript([makeRule({
      conditions: [{ field: 'size', comparator: 'greater_than', value: ['1000', '2000'] }],
    })]);
    expect(script).toContain('size :over 1000');
  });

  it('round-trips array values through the metadata block', () => {
    const rules = [makeRule({
      conditions: [{ field: 'from', comparator: 'contains', value: ['@a.com', '@b.com'] }],
    })];
    const result = parseScript(generateScript(rules));
    expect(result.isOpaque).toBe(false);
    expect(result.rules[0].conditions[0].value).toEqual(['@a.com', '@b.com']);
  });

  it('accepts list literals in external scripts without metadata', () => {
    const script = [
      'require ["fileinto"];',
      '# rule:[Vendors]',
      'if header :contains "From" ["@a.com", "@b.com"] {',
      '    fileinto "Vendors";',
      '}',
      '',
    ].join('\n');
    const result = parseScript(script);
    expect(result.isOpaque).toBe(false);
    expect(result.rules).toHaveLength(1);
    expect(result.rules[0].origin).toBe('external');
    expect(result.rules[0].conditions[0]).toEqual({
      field: 'from', comparator: 'contains', value: ['@a.com', '@b.com'],
    });
  });

  it('classifies uniform wildcard lists as starts_with / ends_with', () => {
    const script = [
      'if anyof(header :matches "Subject" ["RE:*", "FW:*"], header :matches "From" ["*@a.com", "*@b.com"]) {',
      '    discard;',
      '}',
      '',
    ].join('\n');
    const result = parseScript(script);
    expect(result.rules[0].conditions).toEqual([
      { field: 'subject', comparator: 'starts_with', value: ['RE:', 'FW:'] },
      { field: 'from', comparator: 'ends_with', value: ['@a.com', '@b.com'] },
    ]);
  });

  it('keeps mixed wildcard lists as matches with wildcards verbatim', () => {
    const script = 'if header :matches "Subject" ["RE:*", "*FW"] {\n    discard;\n}\n';
    const result = parseScript(script);
    expect(result.rules[0].conditions[0]).toEqual({
      field: 'subject', comparator: 'matches', value: ['RE:*', '*FW'],
    });
  });

  it('does not treat metadata rules with array values as corrupt', () => {
    const script = generateScript([makeRule({
      conditions: [{ field: 'body', comparator: 'is', value: ['a', 'b'] }],
    })]);
    const result = parseScript(script);
    expect(result.isOpaque).toBe(false);
    expect(result.rules[0].conditions[0].value).toEqual(['a', 'b']);
  });

  it('does not emit "undefined" for a field this client does not know', () => {
    const rule = makeRule({
      conditions: [{ field: 'future' as never, comparator: 'contains', value: 'x' }],
    });
    expect(() => generateScript([rule])).toThrow(/Unsupported filter condition field/);
  });
});

describe('attachment conditions', () => {
  it('emits :mime :anychild for has_any and requires mime', () => {
    const script = generateScript([makeRule({
      conditions: [{ field: 'attachment', comparator: 'has_any', value: '' }],
    })]);
    expect(script).toContain('require ["fileinto", "mime"];');
    expect(script).toContain('if header :mime :anychild :contains "Content-Disposition" "attachment"');
  });

  it('emits a filename wildcard across both headers for has_type', () => {
    const script = generateScript([makeRule({
      conditions: [{ field: 'attachment', comparator: 'has_type', value: 'pdf' }],
    })]);
    expect(script).toContain(
      'if header :mime :anychild :matches ["Content-Disposition", "Content-Type"] "*.pdf*"',
    );
  });

  it('normalises leading dots/stars and emits a list for several types', () => {
    const script = generateScript([makeRule({
      conditions: [{ field: 'attachment', comparator: 'has_type', value: ['.pdf', '*.xml', ' docx '] }],
    })]);
    expect(script).toContain(
      ':matches ["Content-Disposition", "Content-Type"] ["*.pdf*", "*.xml*", "*.docx*"]',
    );
  });

  it('does not require mime when the attachment rule is disabled', () => {
    const script = generateScript([makeRule({
      enabled: false,
      conditions: [{ field: 'attachment', comparator: 'has_any', value: '' }],
    })]);
    expect(script).not.toContain('"mime"');
  });

  it('round-trips attachment rules through the metadata block', () => {
    const rules = [makeRule({
      conditions: [
        { field: 'attachment', comparator: 'has_any', value: '' },
        { field: 'attachment', comparator: 'has_type', value: ['pdf', 'xml'] },
      ],
    })];
    const script = generateScript(rules);
    const result = parseScript(script);
    expect(result.isOpaque).toBe(false);
    expect(result.rules[0].conditions).toEqual(rules[0].conditions);
    // Regenerating must be stable, i.e. saving on mobile keeps the web's script.
    expect(generateScript(result.rules, result.vacation, { externalRequires: result.externalRequires }))
      .toBe(script);
  });

  it('parses the body of a web-authored attachment rule without metadata', () => {
    const script = stripMetadata(generateScript([makeRule({
      name: 'PDFs',
      conditions: [{ field: 'attachment', comparator: 'has_type', value: ['pdf', 'xml'] }],
    })]));
    const result = parseScript(script);
    expect(result.isOpaque).toBe(false);
    expect(result.rules[0].conditions[0]).toEqual({
      field: 'attachment', comparator: 'has_type', value: ['pdf', 'xml'],
    });
    expect(result.externalRequires).toContain('mime');
  });

  it('still recognises the legacy single-header has_type form', () => {
    const script = 'if header :mime :anychild :matches "Content-Disposition" "*.pdf*" {\n    discard;\n}\n';
    const result = parseScript(script);
    expect(result.rules[0].conditions[0]).toEqual({
      field: 'attachment', comparator: 'has_type', value: 'pdf',
    });
  });

  it('parses has_any from a script without metadata', () => {
    const script = 'if header :mime :anychild :contains "Content-Disposition" "attachment" {\n    fileinto "Attachments";\n}\n';
    const result = parseScript(script);
    expect(result.rules[0].conditions[0]).toEqual({
      field: 'attachment', comparator: 'has_any', value: '',
    });
  });

  it('keeps unknown :mime tests opaque instead of misreading them', () => {
    const script = 'if header :mime :param "filename" :contains "Content-Type" "x" {\n    discard;\n}\n';
    const result = parseScript(script);
    // The rule is preserved as a raw block, never as a structured header test.
    for (const rule of result.rules) {
      for (const cond of rule.conditions) {
        expect(cond.field).not.toBe('header');
      }
      if (rule.origin === 'opaque') expect(rule.rawBlock).toContain(':mime');
    }
  });
});
