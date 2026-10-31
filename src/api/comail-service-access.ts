import { loginToComail } from '../lib/comail-login';
import { comailFetch, ComailServiceError, type ComailConnection } from './comail';

export type ComailService = 'calendar' | 'contacts' | 'files';
const servicePaths: Record<ComailService, string> = {
  calendar: '/calendar/calendars',
  contacts: '/contacts/book',
  files: '/files/inventory',
};

// Explicit account setup uses the same grant as initial Login with Atmosphere.
export async function authorizeComailService(
  client: ComailConnection,
  service: ComailService,
  completeLogin: (result: Awaited<ReturnType<typeof loginToComail>>) => Promise<void>,
): Promise<void> {
  const path = servicePaths[service];
  const account = client.comailAccount;
  const accountId = client.accountId;
  const authHeader = client.authHeader;
  const checkAccount = () => {
    if (client.comailAccount !== account || client.accountId !== accountId || client.authHeader !== authHeader)
      throw new Error('The active account changed. Reopen this screen.');
  };
  if (account?.sessionToken) {
    try {
      await comailFetch(client, path);
      return;
    } catch (error) {
      if (!(error instanceof ComailServiceError)) throw error;
      if (error.status !== 401) {
        if (error.status !== 409 || error.code !== 'authorization_required') throw error;
        // The shared owner grant includes calendar data, properties and sources.
        const supported = service === 'calendar'
          ? ['owner-data', 'owner-personal', 'owner-source'].includes(error.authorizationProfile ?? '')
          : error.authorizationProfile === undefined;
        if (!supported) throw new Error('This authorization step is not supported in the app yet.');
      }
    }
  } else if (!account) {
    throw new Error('Comail account required.');
  }
  checkAccount();
  const result = await loginToComail();
  checkAccount();
  if (result.comail.did !== account?.did)
    throw new Error('Choose the same Comail account to update its access.');
  await completeLogin(result);
  if (client.accountId !== accountId || client.comailAccount?.did !== account.did)
    throw new Error('The active account changed. Reopen this screen.');
  await comailFetch(client, path);
}
