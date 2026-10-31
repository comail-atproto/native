import { describe, it, expect } from 'vitest';
import {
  extractPlaceholders,
  substitutePlaceholders,
  hasUnresolvedPlaceholders,
  getAutoFilledPlaceholders,
  exportTemplates,
  importTemplates,
  templateBodyToHtml,
  validateTemplateName,
} from '../template-utils';

describe('placeholders', () => {
  it('extracts unique placeholder names', () => {
    expect(extractPlaceholders('Hi {{recipient_name}}, {{date}} {{recipient_name}}')).toEqual(['recipient_name', 'date']);
  });

  it('substitutes known values and strips tags from them', () => {
    expect(substitutePlaceholders('Hi {{a}} {{b}}', { a: '<b>x</b>' })).toBe('Hi x {{b}}');
    expect(hasUnresolvedPlaceholders('Hi {{b}}')).toBe(true);
    expect(hasUnresolvedPlaceholders('Hi')).toBe(false);
  });

  it('auto-fills date, weekday and sender', () => {
    const v = getAutoFilledPlaceholders({ senderName: 'Jane', locale: 'en' });
    expect(v.sender_name).toBe('Jane');
    expect(v.date.length).toBeGreaterThan(0);
    expect(v.day_of_week.length).toBeGreaterThan(0);
  });

  it('validates names', () => {
    expect(validateTemplateName('  ')).toBe('empty');
    expect(validateTemplateName('x'.repeat(201))).toBe('too_long');
    expect(validateTemplateName('ok')).toBeNull();
  });
});

describe('export / import', () => {
  const tpl = {
    id: 't1', name: 'Hello', subject: 'S', body: 'B', category: 'c', isFavorite: true,
    isHTML: false, defaultRecipients: { to: ['a@b.c'] }, identityId: 'id1',
    createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
  };

  it('emits the webmail envelope', () => {
    const parsed = JSON.parse(exportTemplates([tpl]));
    expect(parsed.type).toBe('webmail-templates');
    expect(parsed.version).toBe(1);
    expect(typeof parsed.exportedAt).toBe('string');
    expect(parsed.templates[0].defaultRecipients).toEqual({ to: ['a@b.c'] });
  });

  it('round-trips isHTML / defaultRecipients / identityId with fresh ids', () => {
    const { templates, errors } = importTemplates(exportTemplates([tpl]));
    expect(errors).toEqual([]);
    expect(templates).toHaveLength(1);
    expect(templates[0].id).not.toBe('t1');
    expect(templates[0]).toMatchObject({ name: 'Hello', isHTML: false, identityId: 'id1', defaultRecipients: { to: ['a@b.c'] }, isFavorite: true });
  });

  it('rejects foreign envelopes and bad JSON', () => {
    expect(importTemplates('{"type":"other","templates":[]}').errors).toEqual(['invalid_type']);
    expect(importTemplates('nope').errors).toEqual(['invalid_json']);
    expect(importTemplates('{"templates":[{"body":"x"}]}').errors).toEqual(['missing_template_name']);
  });

  it('accepts the legacy RN export without a type', () => {
    expect(importTemplates('{"version":1,"templates":[{"name":"n","body":"b"}]}').templates).toHaveLength(1);
  });

  it('escapes plain-text bodies for the editor', () => {
    expect(templateBodyToHtml({ body: 'a<b\nc', isHTML: false })).toBe('<p>a&lt;b<br>c</p>');
    expect(templateBodyToHtml({ body: '<p>x</p>', isHTML: true })).toBe('<p>x</p>');
  });
});
