import { beforeEach, expect, it, vi } from 'vitest';
import { secureFetch } from '../../lib/client-cert';
import { loginToComail } from '../../lib/comail-login';
import { authorizeComailService } from '../comail-service-access';
import type { ComailConnection } from '../comail';

vi.mock('../../lib/client-cert', () => ({ secureFetch: vi.fn() }));
vi.mock('../../lib/comail-login', () => ({ loginToComail: vi.fn() }));
const fetch = vi.mocked(secureFetch);
const login = vi.mocked(loginToComail);
const client = (): ComailConnection => ({ accountId: 'mail', authHeader: 'Basic synthetic', comailAccount: {
  inboxUrl: 'https://inbox.comail.at', did: 'did:plc:owner', groupwareEnabled: true, sessionToken: 'synthetic-session',
} });
const consent = (profile = 'owner-data') => new Response(JSON.stringify({ error: 'authorization_required', authorizationProfile: profile }), { status: 409 });
const result = () => ({ serverUrl: 'https://inbox.comail.at', username: 'owner@example.test', password: 'synthetic-password', comail: client().comailAccount! });
beforeEach(() => { vi.clearAllMocks(); login.mockResolvedValue(result()); });

it('upgrades mail and calendar through Login with Atmosphere and rechecks service access', async () => {
  const connection = client();
  fetch.mockResolvedValueOnce(consent()).mockResolvedValueOnce(new Response('{}'));
  const complete = vi.fn(async (value: Awaited<ReturnType<typeof loginToComail>>) => {
    connection.comailAccount = value.comail;
    connection.authHeader = 'Basic refreshed';
  });
  await authorizeComailService(connection, 'calendar', complete);
  expect(login).toHaveBeenCalledWith();
  expect(complete).toHaveBeenCalledWith(result());
  expect(fetch.mock.calls.map(call => call[0])).toEqual([
    'https://inbox.comail.at/webmail/native/calendar/calendars',
    'https://inbox.comail.at/webmail/native/calendar/calendars',
  ]);
  expect(fetch.mock.calls[1][1]!.headers).toMatchObject({ Authorization: 'Basic refreshed' });
});

it('does not request another grant for an authorized calendar', async () => {
  fetch.mockResolvedValueOnce(new Response('{}'));
  const complete = vi.fn();
  await authorizeComailService(client(), 'calendar', complete);
  expect(login).not.toHaveBeenCalled();
  expect(complete).not.toHaveBeenCalled();
});

it('keeps the current account when the browser returns another account', async () => {
  fetch.mockResolvedValueOnce(consent());
  const other = result(); other.comail.did = 'did:plc:other';
  login.mockResolvedValueOnce(other);
  const complete = vi.fn();
  await expect(authorizeComailService(client(), 'calendar', complete)).rejects.toThrow('same Comail account');
  expect(complete).not.toHaveBeenCalled();
  expect(fetch).toHaveBeenCalledTimes(1);
});

it('discards a sign-in result after an account switch', async () => {
  const connection = client();
  fetch.mockResolvedValueOnce(consent());
  login.mockImplementationOnce(async () => { connection.accountId = 'other'; return result(); });
  const complete = vi.fn();
  await expect(authorizeComailService(connection, 'calendar', complete)).rejects.toThrow('account changed');
  expect(complete).not.toHaveBeenCalled();
});

it('does not claim authorization when sign-in is cancelled or access is still denied', async () => {
  fetch.mockResolvedValueOnce(consent());
  login.mockRejectedValueOnce(new Error('cancelled'));
  const complete = vi.fn();
  await expect(authorizeComailService(client(), 'calendar', complete)).rejects.toThrow('cancelled');
  expect(complete).not.toHaveBeenCalled();
  fetch.mockResolvedValueOnce(consent()).mockResolvedValueOnce(consent());
  await expect(authorizeComailService(client(), 'calendar', complete)).rejects.toMatchObject({ status: 409 });
});

it.each(['owner-membership', 'member-calendar', 'member-personal', 'unknown'])('does not add %s permissions to account login', async profile => {
  fetch.mockResolvedValueOnce(consent(profile));
  await expect(authorizeComailService(client(), 'calendar', vi.fn())).rejects.toThrow('not supported');
  expect(login).not.toHaveBeenCalled();
});

it.each([409, 503])('does not launch sign-in for a generic %s failure', async status => {
  fetch.mockResolvedValueOnce(new Response(JSON.stringify({ error: 'conflict' }), { status }));
  await expect(authorizeComailService(client(), 'calendar', vi.fn())).rejects.toThrow();
  expect(login).not.toHaveBeenCalled();
});

it.each([
  ['calendar', '/calendar/calendars', 'owner-personal'],
  ['calendar', '/calendar/calendars', 'owner-source'],
  ['contacts', '/contacts/book', undefined],
  ['files', '/files/inventory', undefined],
] as const)('renews %s access using the shared Inbox login', async (service, path, profile) => {
  const connection = client();
  fetch.mockResolvedValueOnce(new Response(JSON.stringify({
    error: 'authorization_required', authorizationProfile: profile,
  }), { status: 409 })).mockResolvedValueOnce(new Response('{}'));
  const complete = vi.fn(async (value: Awaited<ReturnType<typeof loginToComail>>) => {
    connection.comailAccount = value.comail;
  });
  await authorizeComailService(connection, service, complete);
  expect(login).toHaveBeenCalledOnce();
  expect(complete).toHaveBeenCalledOnce();
  expect(fetch.mock.calls.map(call => call[0])).toEqual([
    `https://inbox.comail.at/webmail/native${path}`,
    `https://inbox.comail.at/webmail/native${path}`,
  ]);
});

it.each(['calendar', 'contacts', 'files'] as const)('renews an expired native session for %s', async service => {
  fetch.mockResolvedValueOnce(new Response('{}', { status: 401 })).mockResolvedValueOnce(new Response('{}'));
  await authorizeComailService(client(), service, vi.fn());
  expect(login).toHaveBeenCalledOnce();
  expect(fetch).toHaveBeenCalledTimes(2);
});

it('lets an older account without a native session sign in again', async () => {
  const connection = client();
  connection.comailAccount!.sessionToken = '';
  fetch.mockResolvedValueOnce(new Response('{}'));
  const complete = vi.fn(async (value: Awaited<ReturnType<typeof loginToComail>>) => {
    connection.comailAccount = value.comail;
  });
  await authorizeComailService(connection, 'contacts', complete);
  expect(login).toHaveBeenCalledOnce();
  expect(fetch).toHaveBeenCalledOnce();
});
