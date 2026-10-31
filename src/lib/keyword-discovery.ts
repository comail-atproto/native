import { colors } from '../theme/tokens';
import type { KeywordDef, KeywordColor } from '../stores/keywords-store';
import { KEYWORD_PREFIX, tagIdFromKeyword } from './thread-utils';

// Port of the webmail's lib/keyword-discovery.ts (#658): propose a label and
// colour for `$label:` / `$color:` keywords found on the server that no local
// tag definition explains, so a reinstalled app can recover its tags without
// retyping every id.

/** A keyword found on the server that no tag definition accounts for. */
export interface UnrecognizedKeyword {
  /** The tag id: the keyword with its prefix removed. Fixed - never reworded. */
  id: string;
  /** The keyword as it is stored on messages, prefix included. */
  keyword: string;
  /** Proposed display name, derived from the id. */
  label: string;
  /** Proposed colour, a key of the tag palette. */
  color: KeywordColor;
  /**
   * How many scanned messages carry the tag, under either prefix. A floor
   * rather than a total when the scan that produced it was incomplete.
   */
  count: number;
}

const KEYWORD_SEPARATOR = '/';
const PALETTE_KEYS = Object.keys(colors.tags) as KeywordColor[];

function keywordLevels(id: string): string[] {
  return id.split(KEYWORD_SEPARATOR).filter(Boolean);
}

/** Turns one level of an id into words: `q3-invoices` -> `Q3 Invoices`. */
function humanizeLevel(level: string): string {
  const words = level
    .split(/[-_]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1));
  return words.length > 0 ? words.join(' ') : level;
}

/**
 * The name to propose for a tag whose definition is gone. The native app has
 * no tag nesting, so the whole id is one opaque token: every level is named.
 */
export function suggestKeywordLabel(id: string): string {
  const levels = keywordLevels(id);
  if (levels.length === 0) return id;
  return levels.map(humanizeLevel).join(KEYWORD_SEPARATOR);
}

/** A small stable spread over `range`, so the same id always starts at the same hue. */
function hashIndex(id: string, range: number): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % Math.max(1, range);
}

/**
 * The colour to propose for a tag whose definition is gone. An id that is
 * itself a palette key keeps that colour (the default tags are named after
 * their colour, `$label:blue`); otherwise a hue is picked by hashing the id
 * and walked forward past any colour in `taken`.
 */
export function suggestKeywordColor(id: string, taken: Iterable<string> = []): KeywordColor {
  const levels = keywordLevels(id);
  const own = levels.length > 0 ? levels[levels.length - 1] : id;
  if ((PALETTE_KEYS as string[]).includes(own)) return own as KeywordColor;

  const used = new Set(taken);
  const start = hashIndex(id, PALETTE_KEYS.length);
  for (let step = 0; step < PALETTE_KEYS.length; step++) {
    const candidate = PALETTE_KEYS[(start + step) % PALETTE_KEYS.length];
    if (!used.has(candidate)) return candidate;
  }
  return PALETTE_KEYS[start];
}

/**
 * The tags in `keywords` (a keyword-to-message-count map, as
 * `discoverKeywords` returns) that no definition in `defined` explains, each
 * with a name and colour to propose. Keywords are compared case-insensitively
 * and `$label:` / legacy `$color:` spellings are folded into one tag; results
 * are ordered by descending count, then id.
 */
export function findUnrecognizedKeywords(
  keywords: Record<string, number>,
  defined: KeywordDef[],
): UnrecognizedKeyword[] {
  const known = new Set(defined.map((keyword) => keyword.id.toLowerCase()));
  const taken = new Set<string>(defined.map((keyword) => keyword.color));

  const unrecognized = new Map<string, { id: string; count: number }>();
  for (const [keyword, count] of Object.entries(keywords)) {
    const id = tagIdFromKeyword(keyword);
    if (!id) continue;
    const folded = id.toLowerCase();
    if (known.has(folded)) continue;
    const existing = unrecognized.get(folded);
    if (existing) existing.count += count;
    else unrecognized.set(folded, { id, count });
  }

  return [...unrecognized.values()]
    .sort((a, b) => b.count - a.count || a.id.localeCompare(b.id))
    .map(({ id, count }) => {
      const color = suggestKeywordColor(id, taken);
      taken.add(color);
      return {
        id,
        keyword: KEYWORD_PREFIX + id,
        label: suggestKeywordLabel(id),
        color,
        count,
      };
    });
}
