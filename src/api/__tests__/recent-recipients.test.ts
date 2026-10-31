import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../jmap-client', () => ({
  jmapClient: {
    accountId: 'acc-1',
    request: vi.fn(),
  },
}));

import { jmapClient } from '../jmap-client';
import { queryRecentRecipients, searchSentRecipients } from '../recent-recipients';

const mockRequest = jmapClient.request as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('queryRecentRecipients', () => {
  it('scans Sent To/Cc newest-first and keeps the first name per address', async () => {
    mockRequest.mockResolvedValue({
      methodResponses: [
        ['Email/query', { ids: ['m1', 'm2'] }, '0'],
        ['Email/get', {
          list: [
            { id: 'm1', to: [{ name: 'Jane Doe', email: 'jane@x.com' }], cc: [{ email: 'cc@x.com' }] },
            { id: 'm2', to: [{ name: 'Old Jane', email: 'JANE@x.com' }, { name: 'Bob', email: 'bob@x.com' }] },
          ],
        }, '1'],
      ],
    });

    const result = await queryRecentRecipients('sent-1');
    expect(result).toEqual([
      { name: 'Jane Doe', email: 'jane@x.com' },
      { name: '', email: 'cc@x.com' },
      { name: 'Bob', email: 'bob@x.com' },
    ]);

    const [query, get] = mockRequest.mock.calls[0][0];
    expect(query[1]).toMatchObject({
      accountId: 'acc-1',
      filter: { inMailbox: 'sent-1' },
      sort: [{ property: 'receivedAt', isAscending: false }],
      limit: 300,
    });
    expect(get[1].properties).toEqual(['to', 'cc']);
    expect(get[1]['#ids']).toEqual({ resultOf: '0', name: 'Email/query', path: '/ids' });
  });

  it('returns nothing without a Sent mailbox', async () => {
    expect(await queryRecentRecipients('')).toEqual([]);
    expect(mockRequest).not.toHaveBeenCalled();
  });
});

describe('searchSentRecipients', () => {
  it('only keeps the recipients that match the query', async () => {
    mockRequest.mockResolvedValue({
      methodResponses: [
        ['Email/query', { ids: ['m1'] }, '0'],
        ['Email/get', {
          list: [{ id: 'm1', to: [{ name: 'Jane', email: 'jane@x.com' }, { name: 'Bob', email: 'bob@x.com' }] }],
        }, '1'],
      ],
    });
    expect(await searchSentRecipients('jan', 'sent-1')).toEqual([{ name: 'Jane', email: 'jane@x.com' }]);
    const query = mockRequest.mock.calls[0][0][0];
    expect(query[1].filter).toEqual({
      operator: 'AND',
      conditions: [{ inMailbox: 'sent-1' }, { operator: 'OR', conditions: [{ to: 'jan' }, { cc: 'jan' }] }],
    });
  });
});
