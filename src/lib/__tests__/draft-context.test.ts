import { describe, it, expect } from 'vitest';
import { draftBodies, draftContextFromEmail, isDraftEmail } from '../draft-context';
import type { Email } from '../../api/types';

const base: Email = {
  id: 'e1',
  threadId: 't1',
  mailboxIds: { drafts: true },
  keywords: { $draft: true },
  size: 1,
  receivedAt: '2026-01-01T00:00:00Z',
  hasAttachment: false,
  subject: 'S',
  from: [{ name: 'Me', email: 'me@x.y' }],
  to: [{ email: 'a@b.c' }],
  messageId: ['m1@x.y'],
  inReplyTo: ['p1@x.y'],
  references: ['r0@x.y', 'p1@x.y'],
};

describe('draft-context', () => {
  it('routes bodies by MIME type (text-only drafts list text/plain under htmlBody)', () => {
    const textOnly = {
      textBody: [{ partId: '1', type: 'text/plain' }],
      htmlBody: [{ partId: '1', type: 'text/plain' }],
      bodyValues: { '1': { value: 'hello' } },
    };
    expect(draftBodies(textOnly)).toEqual({ htmlBody: undefined, textBody: 'hello' });
    const both = {
      textBody: [{ partId: '1', type: 'text/plain' }],
      htmlBody: [{ partId: '2', type: 'text/html' }],
      bodyValues: { '1': { value: 'hello' }, '2': { value: '<p>hello</p>' } },
    };
    expect(draftBodies(both)).toEqual({ htmlBody: '<p>hello</p>', textBody: 'hello' });
  });

  it('carries recipients, threading headers and attachments into the route param', () => {
    const ctx = draftContextFromEmail({ ...base, attachments: [{ blobId: 'b', name: 'f', type: 'text/plain', size: 1 }] } as Email, 'acc');
    expect(ctx).toMatchObject({
      id: 'e1', jmapAccountId: 'acc', subject: 'S',
      from: [{ name: 'Me', email: 'me@x.y' }], to: [{ email: 'a@b.c' }],
      messageId: ['m1@x.y'], inReplyTo: ['p1@x.y'], references: ['r0@x.y', 'p1@x.y'],
    });
    expect(ctx.attachments?.[0].blobId).toBe('b');
  });

  it('recognises drafts by folder role or keyword', () => {
    expect(isDraftEmail(base, 'drafts')).toBe(true);
    expect(isDraftEmail(base, 'inbox')).toBe(true);
    expect(isDraftEmail({ keywords: {} }, 'inbox')).toBe(false);
  });
});
