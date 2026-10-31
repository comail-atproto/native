import type { BodyPart, Email } from '../api/types';

/**
 * True when the message is S/MIME signed or encrypted (pkcs7 parts). Port of
 * the webmail client's `isSmimeEmail`. The mobile app has no crypto path, so
 * the reader only shows a "not supported" note for these.
 */
export function isSmimeEmail(email: Pick<Email, 'bodyStructure' | 'attachments'>): boolean {
  const types: string[] = [];
  const collect = (part: (BodyPart & { subParts?: BodyPart[] }) | undefined): void => {
    if (!part) return;
    if (part.type) types.push(part.type.toLowerCase());
    part.subParts?.forEach(collect);
  };
  collect(email.bodyStructure as (BodyPart & { subParts?: BodyPart[] }) | undefined);
  email.attachments?.forEach((att) => types.push((att.type || '').toLowerCase()));
  return types.some((type) =>
    type.includes('pkcs7')
    || type.includes('x-pkcs7')
    || type === 'application/pkcs7-mime'
    || type === 'application/pkcs7-signature',
  );
}
