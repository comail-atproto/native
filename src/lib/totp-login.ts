// Password + TOTP login against Stalwart's structured auth endpoint.
//
// Stalwart 0.16+ no longer accepts the legacy `password$totp` convention over
// HTTP Basic auth: its Basic decoder hardcodes `mfa_token: None`, so a TOTP
// appended to the password is verified verbatim against the password hash and
// fails. The MFA token must be supplied as a distinct field through
// `POST {server}/api/auth`, which answers with a short-lived authorization
// code that `POST {server}/auth/token` exchanges (with PKCE) for OAuth
// tokens. The webmail drives the same two steps server-side in
// app/api/auth/totp-token-exchange/route.ts; a native client has no CORS
// constraint and talks to the mail server directly.
//
// Token auth also survives TOTP rotation, unlike Basic auth, which would have
// to embed the ~30 s code in every request.

import { secureFetch } from './client-cert';
import { sha256Hex } from './sha256';
import { base64UrlEncode, randomBytes } from './random';
import { HANDOFF_REDIRECT_URI, type OAuthTokens } from './oauth';
import { NetworkError } from '../api/jmap-client';

// Stalwart's built-in OAuth accepts the webmail's public client id; using the
// same one keeps refresh behaviour identical to the browser-handoff bundle.
export const DEFAULT_CLIENT_ID = 'bulwark-webmail';

export class LoginEndpointMissingError extends Error {
  constructor() {
    super('Structured login endpoint not available');
    this.name = 'LoginEndpointMissingError';
  }
}

export class TotpLoginError extends Error {
  code: 'invalid_credentials' | 'totp_required' | 'login_failed' | 'token_exchange_failed';
  constructor(code: TotpLoginError['code'], message?: string) {
    super(message ?? code);
    this.name = 'TotpLoginError';
    this.code = code;
  }
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function generateCodeVerifier(): string {
  // 32 random bytes → 43 base64url chars, inside RFC 7636's 43..128 window.
  return base64UrlEncode(randomBytes(32));
}

export function generateCodeChallenge(verifier: string): string {
  const digest = sha256Hex(new TextEncoder().encode(verifier));
  return base64UrlEncode(hexToBytes(digest));
}

interface LoginResult {
  type?: string;
  // The response keeps snake_case: only the LoginResponse variant *tags* are
  // camelCased server-side, not the struct fields (the request fields are).
  client_code?: string;
}

/**
 * Exchange username + password (+ TOTP) for an OAuth token bundle. Throws
 * `LoginEndpointMissingError` when the server predates the structured
 * endpoint (404) so the caller can fall back to legacy Basic auth,
 * `TotpLoginError` for rejected credentials, `NetworkError` when unreachable.
 */
export async function exchangePasswordForTokens(
  serverUrl: string,
  username: string,
  password: string,
  totp?: string,
  opts?: { clientId?: string; redirectUri?: string },
): Promise<OAuthTokens> {
  const base = serverUrl.replace(/\/+$/, '');
  const clientId = opts?.clientId ?? DEFAULT_CLIENT_ID;
  const redirectUri = opts?.redirectUri ?? HANDOFF_REDIRECT_URI;
  const verifier = generateCodeVerifier();
  const challenge = generateCodeChallenge(verifier);

  let loginResponse: Response;
  try {
    loginResponse = await secureFetch(`${base}/api/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        type: 'authCode',
        accountName: username,
        accountSecret: password,
        ...(totp ? { mfaToken: totp } : {}),
        clientId,
        redirectUri,
        codeChallenge: challenge,
        codeChallengeMethod: 'S256',
      }),
    });
  } catch (err) {
    throw new NetworkError(err instanceof Error ? err.message : 'Server unreachable');
  }

  if (loginResponse.status === 404) throw new LoginEndpointMissingError();
  if (!loginResponse.ok) {
    throw new TotpLoginError('login_failed', `Login failed: ${loginResponse.status}`);
  }

  let login: LoginResult;
  try {
    login = (await loginResponse.json()) as LoginResult;
  } catch {
    throw new TotpLoginError('login_failed', 'Login response was not JSON');
  }

  switch (login.type) {
    case 'authenticated':
      break;
    case 'mfaRequired':
      throw new TotpLoginError('totp_required', 'TOTP_REQUIRED');
    case 'failure':
    default:
      throw new TotpLoginError('invalid_credentials', 'Invalid username, password or code');
  }
  if (!login.client_code) {
    throw new TotpLoginError('login_failed', 'Login response missing authorization code');
  }

  const tokenParams = new URLSearchParams({
    grant_type: 'authorization_code',
    code: login.client_code,
    client_id: clientId,
    redirect_uri: redirectUri,
    code_verifier: verifier,
  });

  let tokenResponse: Response;
  try {
    tokenResponse = await secureFetch(`${base}/auth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: tokenParams.toString(),
    });
  } catch (err) {
    throw new NetworkError(err instanceof Error ? err.message : 'Server unreachable');
  }
  if (!tokenResponse.ok) {
    throw new TotpLoginError('token_exchange_failed', `Token exchange failed: ${tokenResponse.status}`);
  }
  const tokens = (await tokenResponse.json()) as {
    access_token?: string;
    expires_in?: number;
    refresh_token?: string;
  };
  if (!tokens.access_token) {
    throw new TotpLoginError('token_exchange_failed', 'Token response missing access_token');
  }

  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: tokens.expires_in ? Date.now() + tokens.expires_in * 1000 : undefined,
    tokenEndpoint: `${base}/auth/token`,
    clientId,
    source: 'totp',
  };
}
