import { jmapClient } from './jmap-client';
import { CAPABILITIES } from './types';
import type { EmailAddress } from './types';

export interface RecentRecipient {
  name: string;
  email: string;
}

const USING = [CAPABILITIES.CORE, CAPABILITIES.MAIL];

function collect(
  emails: Array<{ to?: EmailAddress[] | null; cc?: EmailAddress[] | null }>,
  keep: (key: string, name: string) => boolean = () => true,
): RecentRecipient[] {
  // Messages arrive newest-first, so the first occurrence per address is the
  // most recent one and carries the freshest display name.
  const byEmail = new Map<string, RecentRecipient>();
  for (const email of emails) {
    for (const r of [...(email.to || []), ...(email.cc || [])]) {
      if (!r?.email) continue;
      const key = r.email.toLowerCase().trim();
      if (!key || byEmail.has(key)) continue;
      const name = (r.name || '').trim();
      if (!keep(key, name)) continue;
      byEmail.set(key, { name, email: r.email });
    }
  }
  return Array.from(byEmail.values());
}

/**
 * The people the user has written to: scans the newest `limit` messages of the
 * Sent mailbox and returns each To/Cc address once (OWA-style autocomplete
 * cache). Only the recipient headers are fetched - no subject, preview or body.
 */
export async function queryRecentRecipients(
  sentMailboxId: string,
  limit = 300,
  accountId?: string,
): Promise<RecentRecipient[]> {
  if (!sentMailboxId) return [];
  const account = accountId || jmapClient.accountId;
  const res = await jmapClient.request([
    ['Email/query', {
      accountId: account,
      filter: { inMailbox: sentMailboxId },
      sort: [{ property: 'receivedAt', isAscending: false }],
      limit,
    }, '0'],
    ['Email/get', {
      accountId: account,
      '#ids': { resultOf: '0', name: 'Email/query', path: '/ids' },
      properties: ['to', 'cc'],
    }, '1'],
  ], USING);
  const getResponse = res.methodResponses?.find((r: unknown[]) => r[0] === 'Email/get');
  const list = ((getResponse?.[1] as { list?: unknown[] } | undefined)?.list ?? []) as Array<{
    to?: EmailAddress[] | null;
    cc?: EmailAddress[] | null;
  }>;
  return collect(list);
}

/**
 * On-demand server search of the Sent mailbox for recipients matching `query`
 * (used when the local caches have no hit). Keeps only the addresses that
 * actually match, not every co-recipient of a matching message.
 */
export async function searchSentRecipients(
  query: string,
  sentMailboxId: string,
  limit = 60,
  accountId?: string,
): Promise<RecentRecipient[]> {
  const q = query.trim();
  if (!q || !sentMailboxId) return [];
  const account = accountId || jmapClient.accountId;
  const res = await jmapClient.request([
    ['Email/query', {
      accountId: account,
      filter: {
        operator: 'AND',
        conditions: [
          { inMailbox: sentMailboxId },
          { operator: 'OR', conditions: [{ to: q }, { cc: q }] },
        ],
      },
      sort: [{ property: 'receivedAt', isAscending: false }],
      limit,
    }, '0'],
    ['Email/get', {
      accountId: account,
      '#ids': { resultOf: '0', name: 'Email/query', path: '/ids' },
      properties: ['to', 'cc'],
    }, '1'],
  ], USING);
  const getResponse = res.methodResponses?.find((r: unknown[]) => r[0] === 'Email/get');
  const list = ((getResponse?.[1] as { list?: unknown[] } | undefined)?.list ?? []) as Array<{
    to?: EmailAddress[] | null;
    cc?: EmailAddress[] | null;
  }>;
  const lower = q.toLowerCase();
  return collect(list, (key, name) => key.includes(lower) || name.toLowerCase().includes(lower));
}
