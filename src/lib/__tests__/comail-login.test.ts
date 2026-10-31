import { AbortController as NativeAbortController, AbortSignal as NativeAbortSignal } from 'abort-controller';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as WebBrowser from 'expo-web-browser';

vi.mock('../client-cert', () => ({ secureFetch: vi.fn() }));
import { secureFetch } from '../client-cert';
import { loginToComail } from '../comail-login';

const browser = vi.mocked(WebBrowser.openAuthSessionAsync);
const request = vi.mocked(secureFetch);

describe('Comail native sign-in', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    request.mockResolvedValueOnce(
      new Response('{"protocol":"comail-native-v1"}'),
    );
  });

  it.each([undefined, 'owned-device'])('exchanges a state-bound code with PKCE and optional credential ID: %s', async (credentialId) => {
    browser.mockImplementation(async (url, redirect) => {
      const query = new URL(url).searchParams;
      expect(query.get('handle')).toBe('owner.example.test');
      expect(query.get('code_challenge')).toHaveLength(43);
      return {
        type: 'success',
        url: `${redirect}#code=${'a'.repeat(64)}&state=${query.get('state')}`,
      };
    });
    request.mockResolvedValue(
      new Response(
        JSON.stringify({
          flow: 'password',
          server_url: 'https://inbox.comail.at',
          username: 'owner@comail.at',
          password: 'synthetic',
          comail: {
            inboxUrl: 'https://inbox.comail.at',
            did: 'did:plc:test',
            groupwareEnabled: true,
            sessionToken: 'synthetic-native-session',
            ...(credentialId ? { credentialId } : {}),
          },
        }),
        { headers: { 'Content-Type': 'application/json' } },
      ),
    );
    const result = await loginToComail('@owner.example.test');
    expect(result.comail.did).toBe('did:plc:test');
    expect(result.comail.credentialId).toBe(credentialId);
    expect(request).toHaveBeenCalledWith(
      'https://inbox.comail.at/webmail/native/auth/redeem',
      expect.objectContaining({ method: 'POST', redirect: 'error' }),
    );
    const body = JSON.parse(String(request.mock.calls[1][1]?.body));
    expect(body.code_verifier).toHaveLength(43);
    expect(JSON.stringify(browser.mock.calls)).not.toContain('synthetic');
  });

  it.each(['../other-device', '', 42])('rejects an unsafe credential ID: %s', async (credentialId) => {
    browser.mockImplementation(async (url, redirect) => ({ type: 'success', url: `${redirect}#code=${'a'.repeat(64)}&state=${new URL(url).searchParams.get('state')}` }));
    request.mockResolvedValue(Response.json({
      flow: 'password', server_url: 'https://inbox.comail.at', username: 'owner@comail.at', password: 'synthetic',
      comail: { inboxUrl: 'https://inbox.comail.at', did: 'did:plc:test', groupwareEnabled: false, sessionToken: 'native-session', credentialId },
    }));
    await expect(loginToComail()).rejects.toThrow('Invalid Comail sign-in response');
  });

  it.each(['credential_capacity', 'rate_limited'])('distinguishes exhausted credentials from other limits: %s', async (error) => {
    browser.mockImplementation(async (url, redirect) => ({ type: 'success', url: `${redirect}#code=${'a'.repeat(64)}&state=${new URL(url).searchParams.get('state')}` }));
    request.mockResolvedValue(Response.json({ error }, { status: 429 }));
    await expect(loginToComail()).rejects.toThrow(error === 'credential_capacity' ? 'revoke an unused' : 'Comail sign-in expired');
  });

  it('opens shared web login without a required handle, including add-account mode', async () => {
    browser.mockRejectedValue(new Error('Browser closed'));
    await expect(loginToComail('', true)).rejects.toThrow();
    expect(browser).toHaveBeenCalledTimes(1);
    const [start, redirect, options] = browser.mock.calls[0];
    expect(new URL(start).searchParams.has('handle')).toBe(false);
    expect(new URL(start).searchParams.get('select_account')).toBe('1');
    expect(redirect).toBe('comailnative://auth/callback');
    expect(options?.preferEphemeralSession).not.toBe(true);
  });

  it('reports an unavailable native API before opening the browser', async () => {
    request.mockReset();
    request.mockResolvedValue(new Response('{}', { status: 404 }));
    await expect(loginToComail('owner.example.test')).rejects.toThrow(
      'not available',
    );
    expect(browser).not.toHaveBeenCalled();
  });

  it('rejects a forged callback before sending a credential request', async () => {
    browser.mockResolvedValue({
      type: 'success',
      url: `comailnative://auth/callback#code=${'a'.repeat(64)}&state=foreign`,
    });
    await expect(loginToComail('owner.example.test')).rejects.toThrow('state');
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('does not follow a callback to another app or trust another service origin', async () => {
    browser.mockImplementation(async (url) => ({
      type: 'success',
      url: `evil://auth/callback#code=${'a'.repeat(64)}&state=${new URL(url).searchParams.get('state')}`,
    }));
    await expect(loginToComail('owner.example.test')).rejects.toThrow();
    expect(request).toHaveBeenCalledTimes(1);
  });
});

// Use the same abort implementation as React Native, rather than Node's richer API.
beforeEach(() => {
  vi.stubGlobal('AbortController', NativeAbortController);
  vi.stubGlobal('AbortSignal', NativeAbortSignal);
});

afterEach(() => vi.unstubAllGlobals());
