import { jmapClient } from './jmap-client';
import { comailFetch } from './comail';
import {
  SpaceContactAdapter,
  SpaceContactError,
} from './comail-contacts/adapter';
import type { AddressBook, ContactCard } from './types';

let active: { identity: object; adapter: SpaceContactAdapter } | undefined;

export function comailContacts(accountId?: string): SpaceContactAdapter {
  const identity = jmapClient.comailAccount;
  if (!identity) throw new SpaceContactError('account_unavailable');
  if (accountId && accountId !== jmapClient.accountId)
    throw new SpaceContactError('unsupported_account');
  if (active?.identity !== identity)
    active = {
      identity,
      adapter: new SpaceContactAdapter(
        () =>
          jmapClient.comailAccount === identity
            ? jmapClient.accountId
            : undefined,
        (path, init) => comailFetch(jmapClient, path, init),
      ),
    };
  return active.adapter;
}

export async function comailAddressBooks(
  accountId?: string,
): Promise<AddressBook[]> {
  return (await comailContacts(accountId).addressBooks()) ?? [];
}

export async function comailContactList(
  accountId?: string,
): Promise<ContactCard[]> {
  return (await comailContacts(accountId).contacts()) ?? [];
}
