import { jmapClient } from './jmap-client';
import { CAPABILITIES } from './types';

// RFC 9425 Quota object (Stalwart reports storage as resourceType "octets"
// with scope "account"); older servers used a pre-RFC "mail" shape.
interface JMAPQuota {
  id: string;
  resourceType?: string;
  used?: number;
  hardLimit?: number;
  warnLimit?: number;
  softLimit?: number;
  // pre-RFC shape
  limit?: number;
  scope?: string;
  types?: string[];
  name?: string;
}

export interface MailQuota {
  used: number;
  total: number;
}

export function serverSupportsQuota(): boolean {
  return Boolean(jmapClient.currentSession?.capabilities?.[CAPABILITIES.QUOTA]);
}

/**
 * Storage usage for the primary account, or null when the server does not
 * advertise urn:ietf:params:jmap:quota or reports no mail storage quota.
 * Mirrors the webmail's client.getQuota().
 */
export async function fetchMailQuota(): Promise<MailQuota | null> {
  if (!serverSupportsQuota()) return null;
  try {
    const res = await jmapClient.request(
      [['Quota/get', { accountId: jmapClient.accountId }, '0']],
      [CAPABILITIES.CORE, CAPABILITIES.QUOTA],
    );
    const [name, body] = res.methodResponses[0] ?? [];
    if (name !== 'Quota/get') return null;
    const quotas = (body?.list ?? []) as JMAPQuota[];
    const coversMail = (q: JMAPQuota) =>
      !q.types?.length || q.types.some((t) => t === 'Email' || t === 'Mail');
    const mailQuota =
      quotas.find((q) => q.resourceType === 'octets' && coversMail(q))
      || quotas.find((q) => q.resourceType === 'mail' || q.scope === 'mail');
    if (!mailQuota) return null;
    const total = mailQuota.hardLimit ?? mailQuota.limit ?? 0;
    return { used: mailQuota.used ?? 0, total };
  } catch {
    return null;
  }
}
