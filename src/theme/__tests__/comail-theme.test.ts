import { describe, expect, it } from 'vitest';
import { resolvePalette, resolveThemeScheme } from '../colors';
import { APP_THEMES, SPOOKY_THEME_ID } from '../comail-themes';
import { parseColor, relativeLuminance } from '../../lib/event-colors';

describe('Comail themes', () => {
  it.each(['light', 'dark'] as const)('defaults to regular Comail in %s mode', scheme => {
    expect(resolvePalette(scheme, null)).toEqual(resolvePalette(scheme, 'builtin-comail'));
  });

  it('offers the regular Comail paper and charcoal palettes', () => {
    const light = resolvePalette('light', 'builtin-comail');
    expect(light.background).toBe('#dfe0c0');
    expect(light.card).toBe('#f5f5e0');
    expect(light.text).toBe('#012102');
    const dark = resolvePalette('dark', 'builtin-comail');
    expect(dark.background).toBe('#1c1f24');
    expect(dark.text).toBe('#e7e9ea');
    expect(dark.primary).toBe('#3fa1c0');
  });

  it('preserves a chosen built-in palette', () => {
    expect(resolvePalette('dark', 'builtin-nord').background).toBe('#2e3440');
    expect(resolvePalette('light', 'builtin-nord').background).toBe('#eceff4');
  });

  it('uses light status-bar content for Spooky even when the device is light', () => {
    expect(resolveThemeScheme('light', 'light', 'builtin-comail-spooky')).toBe('dark');
    expect(resolveThemeScheme('light', 'light', null)).toBe('light');
    expect(resolveThemeScheme('light', 'light', 'builtin-comail')).toBe('light');
    expect(resolveThemeScheme('system', 'dark', 'builtin-nord')).toBe('dark');
  });
});

it('keeps the holiday palette out of the app theme picker', async () => {
  const { APP_THEMES, getAppTheme } = await import('../comail-themes');
  expect(APP_THEMES.some(theme => theme.id === 'builtin-comail-spooky')).toBe(false);
  expect(getAppTheme(null).id).toBe('builtin-comail');
  expect(resolvePalette('light', 'builtin-comail-spooky').primary).toBe('#ffad3b');
});

it('keeps service error messages readable across every selectable palette and login', () => {
  for (const id of [...APP_THEMES.map(theme => theme.id), SPOOKY_THEME_ID]) {
    for (const scheme of ['light', 'dark'] as const) {
      const palette = resolvePalette(scheme, id);
      const text = parseColor(palette.errorForeground);
      const background = parseColor(palette.errorBg);
      expect(text).not.toBeNull();
      expect(background).not.toBeNull();
      const a = relativeLuminance(text!);
      const b = relativeLuminance(background!);
      expect((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05), `${id} ${scheme}`).toBeGreaterThanOrEqual(4.5);
    }
  }
});
