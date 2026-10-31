import { AbortController as NativeAbortController, AbortSignal as NativeAbortSignal } from 'abort-controller';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../lib/client-cert', () => ({ secureFetch: vi.fn() }));
import { secureFetch } from '../../lib/client-cert';
import { comailFetch, type ComailConnection } from '../comail';

const request = vi.mocked(secureFetch);
const connection = (): ComailConnection => ({
  accountId: 'mailbox-1',
  authHeader: 'Basic synthetic',
  comailAccount: {
    inboxUrl: 'https://inbox.comail.at',
    did: 'did:plc:owner',
    groupwareEnabled: true,
    sessionToken: 'synthetic-native-session',
  },
});
beforeEach(() => vi.clearAllMocks());

it('uses Inbox and never falls back to Stalwart on a provider failure', async () => {
  request.mockResolvedValue(new Response('{}', { status: 503 }));
  await expect(comailFetch(connection(), '/contacts/book')).rejects.toThrow(
    '503',
  );
  expect(request).toHaveBeenCalledTimes(1);
  expect(request.mock.calls[0][0]).toBe(
    'https://inbox.comail.at/webmail/native/contacts/book',
  );
});

it('rejects service redirects, disabled accounts and foreign service origins', async () => {
  const client = connection();
  client.comailAccount!.groupwareEnabled = false;
  await expect(comailFetch(client, '/contacts/book')).rejects.toThrow(
    'not enabled',
  );
  client.comailAccount!.groupwareEnabled = true;
  client.comailAccount!.inboxUrl = 'https://foreign.test';
  await expect(comailFetch(client, '/contacts/book')).rejects.toThrow();
  await expect(
    comailFetch(connection(), '/contacts/../../admin'),
  ).rejects.toThrow();
  expect(request).not.toHaveBeenCalled();
});

it('discards a reply after switching accounts', async () => {
  const client = connection();
  request.mockImplementation(async () => {
    client.accountId = 'mailbox-2';
    return new Response('{}');
  });
  await expect(comailFetch(client, '/contacts/book')).rejects.toThrow(
    'account changed',
  );
});

// Use the same abort implementation as React Native, rather than Node's richer API.
beforeEach(() => {
  vi.stubGlobal('AbortController', NativeAbortController);
  vi.stubGlobal('AbortSignal', NativeAbortSignal);
});

afterEach(() => vi.unstubAllGlobals());

it('preserves Calendar consent requirements without treating other conflicts as consent', async () => {
  request.mockResolvedValueOnce(new Response(JSON.stringify({
    error: 'authorization_required', authorizationProfile: 'owner-data',
  }), { status: 409 }));
  await expect(comailFetch(connection(), '/calendar/calendars')).rejects.toMatchObject({
    status: 409, code: 'authorization_required', authorizationProfile: 'owner-data',
  });
  request.mockResolvedValueOnce(new Response(JSON.stringify({ error: 'conflict' }), { status: 409 }));
  await expect(comailFetch(connection(), '/calendar/calendars')).rejects.toMatchObject({ status: 409, code: 'conflict' });
});

it('distinguishes missing Contacts setup from an unavailable Files service', async () => {
  request.mockResolvedValueOnce(new Response(JSON.stringify({ error: 'not_configured' }), { status: 404 }));
  await expect(comailFetch(connection(), '/contacts/book')).rejects.toThrow('Contacts is not set up for this account yet.');
  request.mockResolvedValueOnce(new Response('404 page not found', { status: 404 }));
  await expect(comailFetch(connection(), '/files/inventory')).rejects.toThrow('Files is not available on this server yet.');
});

it('discards an in-flight service reply after signing back into the same account', async () => {
  const client = connection();
  request.mockImplementationOnce(async () => {
    client.comailAccount = { ...client.comailAccount!, sessionToken: 'new-session' };
    return new Response('{}');
  });
  await expect(comailFetch(client, '/contacts/book')).rejects.toThrow('account changed');
});
