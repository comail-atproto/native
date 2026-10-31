/**
 * RFC 5322 §3.6.4 reply threading. Port of the webmail's lib/email-threading.ts.
 *
 * Computes the In-Reply-To and References headers an outgoing reply must
 * carry so MUAs can stitch the conversation back together.
 *
 *   In-Reply-To = parent.Message-ID
 *   References  = parent.References (if any) + parent.Message-ID
 *
 * Bare msg-ids only - angle brackets are stripped because JMAP RFC 8621
 * §4.1.2.3 stores Message-IDs without them. The JMAP *object id* of the parent
 * is never a valid msg-id and must not be used here.
 */

import { generateUUID } from './uuid';

export interface ParentThreadingInfo {
  // JMAP RFC 8621 §4.1.2.3 specifies messageId as String[]|null; accept a
  // bare string too for callers that flattened it.
  messageId?: string | string[] | null;
  references?: string[] | null;
}

export interface ReplyThreadingHeaders {
  inReplyTo: string[];
  references: string[];
}

export function stripMessageIdBrackets(id: string): string {
  return id.trim().replace(/^<+/, '').replace(/>+$/, '').trim();
}

export function computeReplyThreadingHeaders(
  parent: ParentThreadingInfo | undefined | null,
): ReplyThreadingHeaders | null {
  const rawId = Array.isArray(parent?.messageId) ? parent.messageId[0] : parent?.messageId;
  const parentId = rawId ? stripMessageIdBrackets(rawId) : '';
  if (!parentId) return null;

  const ancestors = (parent?.references ?? [])
    .map(stripMessageIdBrackets)
    .filter(Boolean);

  // De-dupe while preserving order; the parent's id closes the chain.
  const seen = new Set<string>();
  const references: string[] = [];
  for (const id of [...ancestors, parentId]) {
    if (seen.has(id)) continue;
    seen.add(id);
    references.push(id);
  }

  return { inReplyTo: [parentId], references };
}

/**
 * Message-ID for outgoing mail (bare msg-id, no angle brackets, per RFC 8621
 * §4.1.2.3). Without one the server synthesizes it from its OS hostname,
 * which leaks internal names into headers - an anti-spam signal and an
 * information disclosure. Use the sender's domain instead.
 */
export function generateMessageId(fromEmail: string): string {
  const at = fromEmail.lastIndexOf('@');
  const domain = at > 0 ? fromEmail.slice(at + 1) : 'localhost';
  return `${Date.now().toString(36)}.${generateUUID()}@${domain}`;
}
