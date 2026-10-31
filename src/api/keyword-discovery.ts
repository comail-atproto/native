import { jmapClient } from './jmap-client';

// Port of the webmail's JMAPClient.discoverKeywords (#658): page through the
// account's messages newest-first (query + back-referenced Email/get of the
// keywords only) and count every keyword that is set. Capped like the
// offline sync so a noisy account can't be enumerated end to end.

export const DEFAULT_KEYWORD_SCAN_LIMIT = 5000;

export interface KeywordScanResult {
  /** keyword → number of scanned messages carrying it. */
  keywords: Record<string, number>;
  scanned: number;
  total: number;
  /** False when the cap stopped the scan before the end of the list. */
  complete: boolean;
}

export async function discoverKeywords(options?: {
  limit?: number;
  onProgress?: (scanned: number, total: number) => void;
  signal?: { aborted: boolean };
  accountId?: string;
}): Promise<KeywordScanResult> {
  const accountId = options?.accountId ?? jmapClient.accountId;
  const cap = Math.max(0, options?.limit ?? DEFAULT_KEYWORD_SCAN_LIMIT);
  const pageSize = Math.max(1, Math.min(500, jmapClient.getMaxObjectsInGet()));
  const keywords: Record<string, number> = {};
  let scanned = 0;
  let total = 0;
  let complete = false;

  while (scanned < cap) {
    if (options?.signal?.aborted) break;
    const limit = Math.min(pageSize, cap - scanned);
    const res = await jmapClient.request([
      ['Email/query', {
        accountId,
        sort: [{ property: 'receivedAt', isAscending: false }],
        limit,
        position: scanned,
        calculateTotal: scanned === 0,
      }, '0'],
      ['Email/get', {
        accountId,
        '#ids': { resultOf: '0', name: 'Email/query', path: '/ids' },
        properties: ['keywords'],
      }, '1'],
    ]);
    const query = res.methodResponses?.[0]?.[1] ?? {};
    const got = res.methodResponses?.[1]?.[1] ?? {};
    const ids: string[] = (query.ids as string[] | undefined) ?? [];
    if (scanned === 0) total = (query.total as number | undefined) ?? 0;

    for (const email of (got.list as Array<{ keywords?: Record<string, boolean> }> | undefined) ?? []) {
      for (const [keyword, isSet] of Object.entries(email.keywords ?? {})) {
        if (isSet) keywords[keyword] = (keywords[keyword] ?? 0) + 1;
      }
    }

    // Page by what the query returned, not by what the get did: a message
    // destroyed between the two lands in `notFound` and would otherwise
    // shift every later page by one.
    scanned += ids.length;
    options?.onProgress?.(scanned, Math.max(total, scanned));

    // A short page is the end of the list, however much `total` claimed.
    if (ids.length === 0 || ids.length < limit) {
      complete = true;
      break;
    }
  }

  return { keywords, scanned, total: Math.max(total, scanned), complete };
}
