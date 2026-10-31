import type { Attachment, Email } from '../api/types';
import { buildForwardSubject } from './subject-prefix';
import { emailExportFilename, type EmailFilenameOptions } from './download-filename';

export interface ForwardAsAttachmentPayload {
  subject: string;
  attachment: Attachment & { type: 'message/rfc822' };
}

/**
 * Build the subject and synthetic attachment entry for forwarding a message
 * as a message/rfc822 attachment instead of inline-quoted text (e.g.
 * reporting spam to a gateway that expects the raw original, or preserving
 * exact formatting/headers). Port of the webmail's `lib/forward-as-attachment.ts`.
 *
 * Referenced by blobId, not re-uploaded - JMAP blobs are account-scoped, so
 * the blobId a message already has can be attached to a new outgoing email
 * directly (the composer re-uploads when the owner is a shared account).
 *
 * `filenameOptions` carries the user's space/case/diacritics transforms; its
 * `template` is ignored: the attachment goes out to a possibly external
 * recipient, so the filename is always "{date}-{subject}.eml" - never the
 * user's own from/to naming template, which could leak names.
 *
 * Returns null when the email has no blobId.
 */
export function buildForwardAsAttachmentPayload(
  email: Email,
  forwardPrefix: string,
  filenameOptions?: EmailFilenameOptions,
): ForwardAsAttachmentPayload | null {
  if (!email.blobId) return null;

  return {
    // Match the normal Forward flow, which leaves the subject blank rather
    // than prefix-only when the original has none.
    subject: email.subject ? buildForwardSubject(email.subject, forwardPrefix) : '',
    attachment: {
      blobId: email.blobId,
      name: emailExportFilename(email, { ...filenameOptions, template: '{date}-{subject}' }),
      type: 'message/rfc822',
      size: email.size,
    },
  };
}
