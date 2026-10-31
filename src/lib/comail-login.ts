import { abortAfter } from './abort-timeout';
import * as WebBrowser from 'expo-web-browser';
import { secureFetch } from './client-cert';
import { randomHex } from './random';
import { generateCodeChallenge, generateCodeVerifier } from './totp-login';
import { HandoffCancelledError } from './oauth';

import {
  COMAIL_INBOX_URL,
  COMAIL_REDIRECT_URI,
  type ComailAccount,
} from './comail-config';

export async function loginToComail(
  handle = '',
  addAccount = false,
): Promise<{
  serverUrl: string;
  username: string;
  password: string;
  comail: ComailAccount;
}> {
  const identity = handle.trim().replace(/^@/, '');
  if (identity.length > 253 || /[\s\x00-\x1f]/.test(identity))
    throw new Error('Enter your atproto handle.');
  const metadata = await secureFetch(
    `${COMAIL_INBOX_URL}/webmail/native/auth/metadata`,
    {
      redirect: 'error',
      headers: { Accept: 'application/json' },
      signal: abortAfter(10_000),
      timeoutMs: 10_000,
    },
  );
  if (!metadata.ok || (await metadata.json()).protocol !== 'comail-native-v1')
    throw new Error(
      'Comail native sign-in is not available on the server yet.',
    );
  const state = randomHex(32);
  const verifier = generateCodeVerifier();
  const query = new URLSearchParams({
    state,
    code_challenge: generateCodeChallenge(verifier),
  });
  if (identity) query.set('handle', identity);
  if (addAccount) query.set('select_account', '1');
  const callback = await WebBrowser.openAuthSessionAsync(
    `${COMAIL_INBOX_URL}/webmail/native/auth/start?${query}`,
    COMAIL_REDIRECT_URI,
    { preferEphemeralSession: false },
  );
  if (callback.type === 'cancel' || callback.type === 'dismiss')
    throw new HandoffCancelledError();
  if (callback.type !== 'success')
    throw new Error('Comail sign-in did not finish.');
  const url = new URL(callback.url);
  if (
    `${url.protocol}//${url.host}${url.pathname}` !== COMAIL_REDIRECT_URI ||
    url.search
  )
    throw new Error('Invalid Comail callback.');
  const fragment = new URLSearchParams(url.hash.slice(1));
  if (fragment.getAll('state').length !== 1 || fragment.get('state') !== state)
    throw new Error('Comail sign-in state mismatch.');
  const code = fragment.get('code');
  if (
    fragment.getAll('code').length !== 1 ||
    !code ||
    !/^[a-f0-9]{64}$/.test(code)
  )
    throw new Error('Invalid Comail sign-in code.');
  const response = await secureFetch(
    `${COMAIL_INBOX_URL}/webmail/native/auth/redeem`,
    {
      method: 'POST',
      redirect: 'error',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ code, code_verifier: verifier }),
      signal: abortAfter(30_000),
      timeoutMs: 30_000,
    },
  );
  if (!response.ok) {
    if (response.status === 429 && (await response.json().catch(() => null))?.error === 'credential_capacity')
      throw new Error('Your account has reached its sign-in and mail-client limit. In an existing session, revoke an unused mail-client credential, then sign in again.');
    throw new Error(
      response.status === 404
        ? 'Comail native sign-in is not available on the server yet.'
        : response.status === 403
          ? 'Mobile access is not enabled for this account.'
          : 'Comail sign-in expired. Please sign in again.',
    );
  }
  const value = await response.json();
  if (
    value.flow !== 'password' ||
    value.server_url !== COMAIL_INBOX_URL ||
    value.comail?.inboxUrl !== COMAIL_INBOX_URL ||
    typeof value.username !== 'string' ||
    !value.username ||
    typeof value.password !== 'string' ||
    !value.password ||
    typeof value.comail?.did !== 'string' ||
    !/^did:(plc|web):[^\s]+$/.test(value.comail.did) ||
    typeof value.comail.groupwareEnabled !== 'boolean' ||
    typeof value.comail.sessionToken !== 'string' ||
    !value.comail.sessionToken ||
    value.comail.sessionToken.length > 4096 ||
    (value.comail.credentialId !== undefined &&
      (typeof value.comail.credentialId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(value.comail.credentialId)))
  )
    throw new Error('Invalid Comail sign-in response.');
  return {
    serverUrl: value.server_url,
    username: value.username,
    password: value.password,
    comail: value.comail,
  };
}
