import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as SecureStore from 'expo-secure-store';
import { JMAPClient, type StoredCredentials } from '../jmap-client';
import { generateAccountId } from '../../lib/account-utils';

vi.mock('../../lib/client-cert', () => ({ secureFetch: vi.fn(), mayFollowRedirect: vi.fn() }));
import { secureFetch } from '../../lib/client-cert';

const request = vi.mocked(secureFetch);
const storage = new Map<string, string>();
const origin = 'https://inbox.comail.at';

function credentials(username = 'alice@comail.at', credentialId = 'alice-device'): StoredCredentials {
  const account = { inboxUrl: origin, did: 'did:web:alice.example', groupwareEnabled: false, sessionToken: `grant-${credentialId}`, credentialId };
  return { serverUrl: origin, username, password: `secret-${credentialId}`, comail: account };
}

beforeEach(() => {
  vi.clearAllMocks();
  storage.clear();
  vi.mocked(SecureStore.setItemAsync).mockImplementation(async (key, value) => { storage.set(key, value); });
  vi.mocked(SecureStore.getItemAsync).mockImplementation(async (key) => storage.get(key) ?? null);
  vi.mocked(SecureStore.deleteItemAsync).mockImplementation(async (key) => { storage.delete(key); });
  request.mockResolvedValue(new Response(null, { status: 204 }));
});

describe('Comail device credential cleanup', () => {
  it('releases a freshly issued credential if the native session cannot connect', async () => {
    const client = new JMAPClient();
    const alice = credentials();
    request.mockResolvedValueOnce(new Response(null, { status: 503 }));
    await expect(client.connect(origin, alice.username, alice.password, undefined, alice.comail)).rejects.toThrow('Session discovery failed');
    expect(request).toHaveBeenLastCalledWith(`${origin}/webmail/native/app-passwords/alice-device`, expect.objectContaining({ method: 'DELETE' }));
    expect(storage.size).toBe(0);
  });

  it('revokes the removed account using its own stored password and grant before clearing storage', async () => {
    const client = new JMAPClient();
    const alice = credentials();
    const bob = credentials('bob@comail.at', 'bob-device');
    const aliceId = generateAccountId(alice.username, origin);
    const bobId = generateAccountId(bob.username, origin);
    await client.setStoredCredentials(aliceId, alice);
    await client.setStoredCredentials(bobId, bob);
    await client.clearAccountCredentials(aliceId);
    expect(request).toHaveBeenCalledExactlyOnceWith(`${origin}/webmail/native/app-passwords/alice-device`, expect.objectContaining({
      method: 'DELETE', redirect: 'error', timeoutMs: 3000,
      headers: expect.objectContaining({ Authorization: `Basic ${btoa(`${alice.username}:${alice.password}`)}`, 'X-Comail-Native-Session': alice.comail!.sessionToken }),
    }));
    expect(request.mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(SecureStore.deleteItemAsync).mock.invocationCallOrder[0]);
    expect(await client.getStoredCredentials(aliceId)).toBeNull();
    expect(await client.getStoredCredentials(bobId)).toEqual(bob);
  });

  it('revokes each stored Comail device on sign-out of all accounts', async () => {
    const client = new JMAPClient();
    const alice = credentials();
    const bob = credentials('bob@comail.at', 'bob-device');
    const ids = [generateAccountId(alice.username, origin), generateAccountId(bob.username, origin)];
    await client.setStoredCredentials(ids[0], alice);
    await client.setStoredCredentials(ids[1], bob);
    await client.clearAllCredentials(ids);
    expect(request.mock.calls.map(([url]) => url).sort()).toEqual([`${origin}/webmail/native/app-passwords/alice-device`, `${origin}/webmail/native/app-passwords/bob-device`]);
    expect(storage.size).toBe(0);
  });

  it.each(['offline', 'rejected'])('still removes local credentials if remote cleanup is %s', async (failure) => {
    const client = new JMAPClient();
    const alice = credentials();
    const id = generateAccountId(alice.username, origin);
    await client.setStoredCredentials(id, alice);
    if (failure === 'offline') request.mockRejectedValueOnce(new Error('offline'));
    else request.mockResolvedValueOnce(new Response(null, { status: 503 }));
    await client.clearAccountCredentials(id);
    expect(request).toHaveBeenCalledOnce();
    expect(await client.getStoredCredentials(id)).toBeNull();
  });

  it.each(['legacy', 'foreign-origin', 'unsafe-id', 'password-login'])('does not revoke credentials without verified Comail ownership: %s', async (kind) => {
    const client = new JMAPClient();
    const alice = credentials();
    if (kind === 'legacy') delete (alice.comail as { credentialId?: string }).credentialId;
    if (kind === 'foreign-origin') alice.comail!.inboxUrl = 'https://foreign.example';
    if (kind === 'unsafe-id') Object.assign(alice.comail!, { credentialId: '../another-device' });
    if (kind === 'password-login') delete alice.comail;
    const id = generateAccountId(alice.username, origin);
    await client.setStoredCredentials(id, alice);
    await client.clearAccountCredentials(id);
    expect(request).not.toHaveBeenCalled();
    expect(await client.getStoredCredentials(id)).toBeNull();
  });
});
