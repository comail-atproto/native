import standard from '../../assets/comail/theme-default.json';
import spooky from '../../assets/comail/theme-spooky.json';
import { BUILTIN_THEMES, type BuiltinTheme, type PaletteOverride } from './builtin-themes';

export interface AppTheme extends BuiltinTheme {
  colorScheme?: 'light' | 'dark';
}

// Adapt the pinned site palette to native roles without changing the generated
// upstream themes. Spooky intentionally uses charcoal in both system modes.
function palette(theme: typeof standard, scheme: 'light' | 'dark'): PaletteOverride {
  const { brand, semantic, docs } = theme.colors;
  const ui = docs[scheme];
  const seasonal = theme.name === 'halloween';
  const dark = seasonal || scheme === 'dark';
  const primary = dark ? brand.lightBlue : brand.darkestBlue;
  const secondaryText = seasonal ? semantic.muted : ui.gray3;
  const surface = dark ? ui.bgInlineCode : semantic.surface;
  return {
    primary, primaryDark: primary, primaryLight: ui.textAccent,
    primaryForeground: dark ? ui.bg : '#ffffff',
    primaryBg: ui.accentLow, primaryBgHover: ui.bgInlineCode, primaryBorder: ui.textAccent,
    background: ui.bg, surface, surfaceHover: ui.bgInlineCode, surfaceActive: ui.gray6,
    card: surface, cardForeground: ui.text,
    text: ui.text, textSecondary: secondaryText, textMuted: secondaryText,
    textInverse: ui.bg, textLink: dark ? ui.textAccent : '#1a5e6f',
    border: secondaryText, borderLight: ui.hairline, borderFocus: ui.textAccent,
    error: dark ? '#f87171' : '#b23b30',
    errorBg: dark ? '#450a0a' : '#fef2f2',
    unread: ui.textAccent, read: secondaryText,
    navActive: ui.textAccent, navInactive: secondaryText,
    secondary: surface, secondaryForeground: ui.text,
    muted: ui.gray6, mutedForeground: secondaryText,
    accent: ui.accentLow, accentForeground: ui.textAccent,
    selection: semantic.selectionBg, selectionForeground: semantic.selectionInk,
    popover: surface, popoverForeground: ui.text,
    chart1: brand.lightBlue, chart3: brand.yellow,
  };
}

export const DEFAULT_THEME_ID = 'builtin-comail';
export const SPOOKY_THEME_ID = 'builtin-comail-spooky';

const COMAIL_THEMES: AppTheme[] = [
  {
    id: DEFAULT_THEME_ID,
    name: 'Comail',
    description: 'Sage paper, Cammie blue and charcoal after dark.',
    light: palette(standard, 'light'),
    dark: palette(standard, 'dark'),
  },
  {
    id: SPOOKY_THEME_ID,
    name: 'Comail Spooky',
    description: 'Seasonal charcoal, pumpkin orange and warm cream.',
    colorScheme: 'dark',
    light: palette(spooky, 'light'),
    dark: palette(spooky, 'dark'),
  },
];

const ALL_THEMES: AppTheme[] = [...COMAIL_THEMES, ...BUILTIN_THEMES];

// The seasonal palette is available to login but stays out of app settings.
export const APP_THEMES = ALL_THEMES.filter(theme => theme.id !== SPOOKY_THEME_ID);

export function getAppTheme(id: string | null): AppTheme {
  return ALL_THEMES.find(theme => theme.id === id) ?? COMAIL_THEMES[0];
}
