import { expect, it, vi } from 'vitest';
vi.mock('../jmap-client', () => ({
  jmapClient: {
    comailAccount: {
      did: 'did:plc:owner',
      inboxUrl: 'https://inbox.comail.at',
      groupwareEnabled: false,
      sessionToken: 'synthetic-native-session',
    },
  },
}));
vi.mock('../comail', () => ({ comailFetch: vi.fn() }));
import { comailFetch } from '../comail';
import {
  decideComailAccessRequest,
  listComailAccessRequests,
} from '../comail-account';

it('keeps the authoritative device label and number match in access requests', async () => {
  vi.mocked(comailFetch).mockResolvedValueOnce(
    new Response(
      JSON.stringify({
        authoritative: true,
        accessRequests: [
          {
            id: 12,
            clientName: 'Desktop',
            deviceLabel: 'Laptop',
            numberMatch: '42',
            scopes: ['mail:read'],
            status: 'pending',
            expiresAt: '2099-01-01T00:00:00Z',
            authoritative: true,
          },
        ],
      }),
    ),
  );
  const rows = await listComailAccessRequests();
  expect(rows[0].numberMatch).toBe('42');
});

it('uses Inbox decision values and converges when a request was already decided elsewhere', async () => {
  vi.mocked(comailFetch).mockResolvedValueOnce(
    new Response('{"id":12,"authoritative":true,"status":"denied"}'),
  );
  await expect(decideComailAccessRequest(12, 'deny')).resolves.toBeUndefined();
  expect(
    JSON.parse(String(vi.mocked(comailFetch).mock.calls.at(-1)![2]?.body))
      .decision,
  ).toBe('denied');
});
