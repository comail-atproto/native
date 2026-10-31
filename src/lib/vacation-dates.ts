// Date helpers for the vacation responder. RFC 8621 `VacationResponse.fromDate`
// / `toDate` are UTCDate values ("2026-03-01T09:00:00Z"); the user types a
// local wall-clock time. Mirrors the webmail, which feeds a datetime-local
// input through `new Date(local).toISOString()` and displays with
// `utcToLocalDatetime`.

const pad = (n: number) => String(n).padStart(2, '0');

/** Accepts "YYYY-MM-DD", "YYYY-MM-DD HH:MM", "YYYY-MM-DDTHH:MM[:SS]". */
export function parseLocalInput(input: string): Date | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(trimmed);
  if (!m) return null;
  const [, y, mo, d, hh = '0', mm = '0', ss = '0'] = m;
  const date = new Date(Number(y), Number(mo) - 1, Number(d), Number(hh), Number(mm), Number(ss));
  // Reject overflowed fields such as 2026-13-45.
  if (
    date.getFullYear() !== Number(y) ||
    date.getMonth() !== Number(mo) - 1 ||
    date.getDate() !== Number(d) ||
    date.getHours() !== Number(hh) ||
    date.getMinutes() !== Number(mm)
  ) {
    return null;
  }
  return date;
}

/** Local wall-clock input -> JMAP UTCDate ISO string (or null when empty). */
export function localInputToUtcIso(input: string): string | null {
  const date = parseLocalInput(input);
  return date ? date.toISOString() : null;
}

/** Whether a non-empty input is syntactically valid. Empty is valid (unset). */
export function isValidLocalInput(input: string): boolean {
  return !input.trim() || parseLocalInput(input) !== null;
}

/** JMAP UTCDate -> "YYYY-MM-DD HH:MM" in the device's local time zone. */
export function utcIsoToLocalInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Normalise a stored date for change detection (null when unset/invalid). */
export function normalizeUtcIso(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
