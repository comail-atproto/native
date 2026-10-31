import { AbortController as NativeAbortController, AbortSignal as NativeAbortSignal } from 'abort-controller';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { JMAPClient } from '../jmap-client';
import { CAPABILITIES, type JMAPSession } from '../types';

const comail = {
  inboxUrl: 'https://inbox.comail.at',
  did: 'did:plc:owner',
  groupwareEnabled: true,
  sessionToken: 'synthetic-native-session',
};
const session: JMAPSession = {
  apiUrl: 'https://inbox.comail.at/jmap/',
  downloadUrl: '',
  uploadUrl: '',
  eventSourceUrl: '',
  capabilities: {
    [CAPABILITIES.CORE]: {},
    [CAPABILITIES.MAIL]: {},
    [CAPABILITIES.CALENDARS]: {},
  },
  accounts: { mail: { name: 'Owner', isPersonal: true, isReadOnly: false } },
  primaryAccounts: { [CAPABILITIES.MAIL]: 'mail' },
  state: 'mail-state',
};
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it('routes Comail calendar calls to Inbox with its own calendar account identity', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(new Response(JSON.stringify(session)))
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          accounts: { personal: {} },
          primaryAccounts: { [CAPABILITIES.CALENDARS]: 'personal' },
        }),
      ),
    )
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          methodResponses: [
            ['Calendar/get', { accountId: 'personal', list: [] }, '0'],
          ],
          sessionState: 'space-state',
        }),
      ),
    );
  vi.stubGlobal('fetch', fetch);
  const client = new JMAPClient();
  await client.connect(
    comail.inboxUrl,
    'owner@comail.at',
    'synthetic',
    undefined,
    comail,
  );
  const result = await client.request(
    [['Calendar/get', { accountId: 'mail' }, '0']],
    [CAPABILITIES.CORE, CAPABILITIES.CALENDARS],
  );
  expect(fetch.mock.calls[2][0]).toBe(
    'https://inbox.comail.at/webmail/calendar/jmap',
  );
  expect(
    JSON.parse(fetch.mock.calls[2][1].body).methodCalls[0][1].accountId,
  ).toBe('personal');
  expect(result.methodResponses[0][1].accountId).toBe('mail');
});

it('hides groupware for an account without the Comail entitlement', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response(JSON.stringify(session))),
  );
  const client = new JMAPClient();
  const connected = await client.connect(
    comail.inboxUrl,
    'owner@comail.at',
    'synthetic',
    undefined,
    {
      ...comail,
      groupwareEnabled: false,
      sessionToken: 'synthetic-native-session',
    },
  );
  expect(connected.capabilities).not.toHaveProperty(CAPABILITIES.CALENDARS);
  await expect(
    client.request([['Calendar/get', { accountId: 'mail' }, '0']]),
  ).rejects.toThrow('Groupware');
});

// Use the same abort implementation as React Native, rather than Node's richer API.
beforeEach(() => {
  vi.stubGlobal('AbortController', NativeAbortController);
  vi.stubGlobal('AbortSignal', NativeAbortSignal);
});

it('retrieves the actionable calendar consent requirement when JMAP discovery returns 409', async () => {
  const fetch = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify(session)))
    .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'conflict' }), { status: 409 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'authorization_required', authorizationProfile: 'owner-data' }), { status: 409 }));
  vi.stubGlobal('fetch', fetch);
  const client = new JMAPClient();
  await client.connect(comail.inboxUrl, 'owner@comail.at', 'synthetic', undefined, comail);
  await expect(client.request([['Calendar/get', { accountId: 'mail' }, '0']])).rejects.toMatchObject({
    code: 'authorization_required', status: 409, authorizationProfile: 'owner-data',
  });
  expect(fetch.mock.calls[2][0]).toBe('https://inbox.comail.at/webmail/native/calendar/calendars');
  expect(fetch.mock.calls[2][1].headers).toMatchObject({ 'X-Comail-Native-Session': comail.sessionToken });
});

it('reuses Calendar discovery across consecutive and concurrent requests within the session', async () => {
  const fetch = vi.fn(async (url: string | URL | Request) => {
    if (String(url).endsWith('/webmail/calendar/jmap/session')) return new Response(JSON.stringify({
      accounts: { personal: {} }, primaryAccounts: { [CAPABILITIES.CALENDARS]: 'personal' },
    }));
    if (String(url).endsWith('/webmail/calendar/jmap')) return new Response(JSON.stringify({
      methodResponses: [['Calendar/get', { accountId: 'personal', list: [] }, '0']], sessionState: 'state',
    }));
    return new Response(JSON.stringify(session));
  });
  vi.stubGlobal('fetch', fetch);
  const client = new JMAPClient();
  await client.connect(comail.inboxUrl, 'owner@comail.at', 'synthetic', undefined, comail);
  const read = () => client.request([['Calendar/get', { accountId: 'mail' }, '0']]);
  await Promise.all([read(), read()]);
  await read();
  expect(fetch.mock.calls.filter(([url]) => String(url).endsWith('/calendar/jmap/session'))).toHaveLength(1);
  expect(fetch.mock.calls.filter(([url]) => String(url).endsWith('/webmail/calendar/jmap'))).toHaveLength(3);
  await client.connect(comail.inboxUrl, 'owner@comail.at', 'new-synthetic', undefined, { ...comail, sessionToken: 'renewed' });
  await read();
  expect(fetch.mock.calls.filter(([url]) => String(url).endsWith('/calendar/jmap/session'))).toHaveLength(2);
});

it('surfaces a revoked grant after successful discovery without replaying a calendar write', async () => {
  const fetch = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify(session)))
    .mockResolvedValueOnce(new Response(JSON.stringify({ accounts: { personal: {} }, primaryAccounts: { [CAPABILITIES.CALENDARS]: 'personal' } })))
    .mockResolvedValueOnce(new Response('{}', { status: 409 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'authorization_required', authorizationProfile: 'owner-personal' }), { status: 409 }));
  vi.stubGlobal('fetch', fetch);
  const client = new JMAPClient();
  await client.connect(comail.inboxUrl, 'owner@comail.at', 'synthetic', undefined, comail);
  await expect(client.request([['CalendarEvent/set', { accountId: 'mail', create: { draft: { title: 'Synthetic event' } } }, '0']]))
    .rejects.toMatchObject({ code: 'authorization_required', status: 409 });
  expect(fetch.mock.calls.filter(([url]) => url === 'https://inbox.comail.at/webmail/calendar/jmap')).toHaveLength(1);
});

it('expires Calendar discovery metadata and does not retain a failed discovery', async () => {
  const clock = vi.spyOn(Date, 'now').mockReturnValue(1000);
  let denied = true;
  const fetch = vi.fn(async (url: string | URL | Request) => {
    if (String(url).endsWith('/webmail/calendar/jmap/session')) return denied
      ? new Response('{}', { status: 503 })
      : new Response(JSON.stringify({ accounts: { personal: {} }, primaryAccounts: { [CAPABILITIES.CALENDARS]: 'personal' } }));
    if (String(url).endsWith('/webmail/calendar/jmap')) return new Response(JSON.stringify({ methodResponses: [], sessionState: 'state' }));
    return new Response(JSON.stringify(session));
  });
  vi.stubGlobal('fetch', fetch);
  const client = new JMAPClient();
  await client.connect(comail.inboxUrl, 'owner@comail.at', 'synthetic', undefined, comail);
  const read = () => client.request([['Calendar/get', { accountId: 'mail' }, '0']]);
  await expect(read()).rejects.toThrow('503');
  denied = false;
  await read();
  await read();
  expect(fetch.mock.calls.filter(([url]) => String(url).endsWith('/calendar/jmap/session'))).toHaveLength(2);
  clock.mockReturnValue(61_001);
  await read();
  expect(fetch.mock.calls.filter(([url]) => String(url).endsWith('/calendar/jmap/session'))).toHaveLength(3);
  clock.mockRestore();
});

it('discards discovery from a previous account instead of caching it for the next account', async () => {
  let release!: (response: Response) => void;
  let discoveries = 0;
  const discovery = (id: string) => new Response(JSON.stringify({ accounts: { [id]: {} }, primaryAccounts: { [CAPABILITIES.CALENDARS]: id } }));
  const fetch = vi.fn(async (url: string | URL | Request, _init?: RequestInit) => {
    if (String(url).endsWith('/webmail/calendar/jmap/session')) {
      discoveries++;
      return discoveries === 1 ? new Promise<Response>(resolve => { release = resolve; }) : discovery('other-calendar');
    }
    if (String(url).endsWith('/webmail/calendar/jmap')) return new Response(JSON.stringify({ methodResponses: [], sessionState: 'state' }));
    return new Response(JSON.stringify(session));
  });
  vi.stubGlobal('fetch', fetch);
  const client = new JMAPClient();
  await client.connect(comail.inboxUrl, 'owner@comail.at', 'synthetic', undefined, comail);
  const pending = client.request([['Calendar/get', { accountId: 'mail' }, '0']]);
  const rejected = expect(pending).rejects.toThrow('account changed');
  await client.connect(comail.inboxUrl, 'other@example.test', 'other-synthetic', undefined, { ...comail, did: 'did:plc:other', sessionToken: 'other-session' });
  release(discovery('old-calendar'));
  await rejected;
  await client.request([['Calendar/get', { accountId: 'mail' }, '0']]);
  const posts = fetch.mock.calls.filter(([url]) => String(url).endsWith('/webmail/calendar/jmap'));
  expect(posts).toHaveLength(1);
  expect(JSON.parse(String(posts[0][1]?.body)).methodCalls[0][1].accountId).toBe('other-calendar');
});
