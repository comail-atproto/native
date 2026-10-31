import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../jmap-client', () => ({
  jmapClient: {
    comailAccount: {
      inboxUrl: 'https://inbox.comail.at',
      did: 'did:plc:owner',
      groupwareEnabled: true,
      sessionToken: 'synthetic-native-session',
    },
    accountId: 'mail',
    authHeader: 'Basic synthetic',
    request: vi.fn(),
  },
}));
vi.mock('../comail', () => ({ comailFetch: vi.fn() }));
import { jmapClient } from '../jmap-client';
import { comailFetch } from '../comail';
import { createAddressBook, getAddressBooks, getContacts, getAllContacts } from '../contacts';
const request = vi.mocked(comailFetch);
const id = 'urn:uuid:11111111-1111-4111-8111-111111111111';
beforeEach(() => {
  vi.resetAllMocks();
  Object.assign(jmapClient, { comailAccount: { ...jmapClient.comailAccount } });
});

it('loads the canonical PDS address book into the existing native contact screens', async () => {
  request.mockResolvedValue(
    new Response(
      JSON.stringify({
        actorDID: 'did:plc:owner',
        addressBookId: 'personal',
        state: 'revision-1',
        contacts: [
          {
            id,
            card: {
              '@type': 'Card',
              version: '1.0',
              uid: id,
              name: { full: 'Ada' },
            },
          },
        ],
      }),
    ),
  );
  const books = await getAddressBooks();
  expect(books[0].id).toBe('personal');
  request.mockResolvedValue(
    new Response(
      JSON.stringify({
        actorDID: 'did:plc:owner',
        addressBookId: 'personal',
        state: 'revision-1',
        contacts: [
          {
            id,
            card: {
              '@type': 'Card',
              version: '1.0',
              uid: id,
              name: { full: 'Ada' },
            },
          },
        ],
      }),
    ),
  );
  expect((await getContacts([id]))[0].name?.full).toBe('Ada');
  expect(jmapClient.request).not.toHaveBeenCalled();
});

it('keeps configured-provider errors and unsupported mutations out of Stalwart', async () => {
  request.mockRejectedValue(new Error('PDS unavailable'));
  await expect(getAddressBooks()).rejects.toThrow('PDS unavailable');
  await expect(createAddressBook('other')).rejects.toThrow();
  expect(jmapClient.request).not.toHaveBeenCalled();
});

function book() {
  return { actorDID: 'did:plc:owner', addressBookId: 'personal', state: 'revision-1', contacts: [
    { id, card: { '@type': 'Card', version: '1.0', uid: id, name: { full: 'Ada' } } },
  ] };
}

it('loads all Comail contacts in one read instead of downloading the book for query and get', async () => {
  request.mockImplementation(async () => new Response(JSON.stringify(book())));
  const cards = await getAllContacts();
  expect(cards[0].name?.full).toBe('Ada');
  expect(request).toHaveBeenCalledTimes(1);
});

it('shares the concurrent book and contact load but keeps a later refresh fresh', async () => {
  let release!: (response: Response) => void;
  request.mockImplementationOnce(() => new Promise<Response>(resolve => { release = resolve; }));
  const books = getAddressBooks();
  const contacts = getAllContacts();
  expect(request).toHaveBeenCalledTimes(1);
  release(new Response(JSON.stringify(book())));
  await Promise.all([books, contacts]);
  request.mockImplementation(async () => new Response(JSON.stringify({ ...book(), state: 'revision-2', contacts: [] })));
  expect(await getAllContacts()).toEqual([]);
  expect(request).toHaveBeenCalledTimes(2);
});

it('releases a failed shared Contacts read so the next refresh can recover', async () => {
  request.mockRejectedValueOnce(new Error('Access denied'));
  const results = await Promise.allSettled([getAddressBooks(), getAllContacts()]);
  expect(results.map(result => result.status)).toEqual(['rejected', 'rejected']);
  expect(request).toHaveBeenCalledTimes(1);
  request.mockResolvedValueOnce(new Response(JSON.stringify(book())));
  expect((await getAllContacts())[0].name?.full).toBe('Ada');
  expect(request).toHaveBeenCalledTimes(2);
  expect(jmapClient.request).not.toHaveBeenCalled();
});
