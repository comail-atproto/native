export const COMAIL_INBOX_URL = 'https://inbox.comail.at';
export const COMAIL_REDIRECT_URI = 'comailnative://auth/callback';

export interface ComailAccount {
  inboxUrl: string;
  did: string;
  groupwareEnabled: boolean;
  sessionToken: string;
  credentialId?: string;
}
