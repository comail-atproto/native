import { createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { useSettingsStore } from '../stores/settings-store';
import { LIGHT_COLORS, DARK_COLORS, type ThemePalette } from './tokens';
import { getAppTheme } from './comail-themes';
import { readableTextOn } from '../lib/event-colors';

export type { ThemePalette };

// Login can use seasonal branding without changing the saved app palette.
export const ColorThemeContext = createContext<string | undefined>(undefined);

export function useThemeId(): string | null {
  const saved = useSettingsStore(s => s.activeThemeId);
  return useContext(ColorThemeContext) ?? saved;
}

const paletteCache = new Map<string, ThemePalette>();

/**
 * Base light/dark palette with the active built-in theme's overrides applied
 * (Settings → Themes). Memoised per (scheme, theme) pair so `useColors()`
 * keeps returning a stable object for `useMemo(() => makeStyles(c), [c])`.
 */
export function resolvePalette(scheme: 'light' | 'dark', themeId: string | null): ThemePalette {
  const theme = getAppTheme(themeId);
  scheme = theme.colorScheme ?? scheme;
  const base = scheme === 'light' ? LIGHT_COLORS : DARK_COLORS;
  const key = `${scheme}:${theme.id}`;
  const cached = paletteCache.get(key);
  if (cached) return cached;
  const merged: ThemePalette = { ...base, ...(scheme === 'light' ? theme.light : theme.dark) };
  // Service errors sit on a muted banner, which needs its own readable text.
  merged.errorForeground = readableTextOn(merged.errorBg);
  paletteCache.set(key, merged);
  return merged;
}

export function resolveThemeScheme(
  preference: 'light' | 'dark' | 'system',
  systemScheme: 'light' | 'dark' | null | undefined,
  themeId: string | null,
): 'light' | 'dark' {
  return getAppTheme(themeId).colorScheme
    ?? (preference === 'system' ? systemScheme === 'light' ? 'light' : 'dark' : preference);
}

/**
 * Returns the active palette for the current render. Resolves the user's
 * theme preference ('light' | 'dark' | 'system') against the OS scheme and
 * applies the selected built-in theme.
 *
 * Prefer this hook in new and migrated components. Static `import { colors }`
 * still works for not-yet-migrated code (it always returns the dark palette).
 */
export function useColors(): ThemePalette {
  const themePref = useSettingsStore((s) => s.theme);
  const activeThemeId = useThemeId();
  const systemScheme = useColorScheme();
  const resolved = resolveThemeScheme(themePref, systemScheme, activeThemeId);
  return useMemo(() => resolvePalette(resolved, activeThemeId), [resolved, activeThemeId]);
}

/**
 * Resolves the user's theme preference to a concrete 'light' | 'dark'.
 * Useful for components that need to choose icons/imagery rather than colors.
 */
export function useResolvedTheme(): 'light' | 'dark' {
  const themePref = useSettingsStore((s) => s.theme);
  const themeId = useThemeId();
  const systemScheme = useColorScheme();
  return resolveThemeScheme(themePref, systemScheme, themeId);
}
