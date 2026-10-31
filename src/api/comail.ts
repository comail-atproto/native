import { abortAfter } from '../lib/abort-timeout';
import type { ComailAccount } from '../lib/comail-config';
import { COMAIL_INBOX_URL } from '../lib/comail-config';
import { secureFetch } from '../lib/client-cert';

export interface ComailConnection {
  accountId: string;
  authHeader: string;
  comailAccount: ComailAccount | null;
}

export class ComailServiceError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly authorizationProfile?: string,
  ) {
    super(message);
    this.name = 'ComailServiceError';
  }
}

export async function comailFetch(
  client: ComailConnection,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const account = client.comailAccount;
  if (!account || account.inboxUrl !== COMAIL_INBOX_URL)
    throw new Error('Comail account required.');
  if (!account.sessionToken)
    throw new Error('Sign in to Comail again to access your account services.');
  if (!account.groupwareEnabled && /^\/(calendar|contacts|files)\//.test(path))
    throw new Error('Groupware is not enabled for this Comail account.');
  if (
    !/^\/(calendar|contacts|files|app-passwords|access-approvals)(\/[A-Za-z0-9_-]+)*$/.test(
      path,
    ) ||
    path.includes('..')
  )
    throw new Error('Invalid Comail service path.');
  const accountId = client.accountId;
  const authHeader = client.authHeader;
  const response = await secureFetch(
    `${account.inboxUrl}/webmail/native${path}`,
    {
      ...init,
      redirect: 'error',
      headers: {
        ...init?.headers,
        Authorization: authHeader,
        'X-Comail-Native-Session': account.sessionToken,
        Accept: 'application/json',
      },
      signal: init?.signal ?? abortAfter(30_000),
      timeoutMs: 30_000,
    },
  );
  if (client.comailAccount !== account || client.accountId !== accountId || client.authHeader !== authHeader)
    throw new Error('The active account changed. Reopen this screen.');
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    const problem = body && typeof body === 'object' ? body as Record<string, unknown> : {};
    const code = typeof problem.error === 'string' ? problem.error : 'unavailable';
    let message = `Comail service request failed (${response.status}).`;
    if (response.status === 401) message = 'Your Comail session expired. Sign in again.';
    else if (response.status === 409 && code === 'authorization_required' && /^\/(calendar|contacts|files)\//.test(path))
      message = 'Sign in with Atmosphere to update access to Calendar, Contacts and Files.';
    else if (response.status === 404 && code === 'not_configured' && path.startsWith('/contacts/'))
      message = 'Contacts is not set up for this account yet.';
    else if (response.status === 404 && path.startsWith('/files/'))
      message = 'Files is not available on this server yet.';
    else if (response.status === 403 || response.status === 404)
      message = 'This Comail service is not enabled for your account.';
    throw new ComailServiceError(response.status, code, message,
      typeof problem.authorizationProfile === 'string' ? problem.authorizationProfile : undefined);
  }
  return response;
}
