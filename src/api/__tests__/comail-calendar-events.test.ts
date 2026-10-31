import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../jmap-client', () => ({ jmapClient: {
  accountId: 'mail', comailAccount: { inboxUrl: 'https://inbox.comail.at' }, request: vi.fn(),
} }));
import { jmapClient } from '../jmap-client';
import { getEvents } from '../calendar';
import type { CalendarEvent, JMAPMethodCall, JMAPResponseBody } from '../types';
const request = vi.mocked(jmapClient.request);
const event: Partial<CalendarEvent> = {
  id: 'event-one', title: 'Recurring event', start: '2026-10-18T09:00:00', duration: 'PT1H',
  utcStart: '2026-10-18T16:00:00Z', utcEnd: '2026-10-18T17:00:00Z',
  recurrenceOverrides: { '2026-10-19T09:00:00': { title: 'Moved event', start: '2026-10-19T10:00:00' } },
};
beforeEach(() => vi.clearAllMocks());

function response(calls: JMAPMethodCall[], changed = false): JMAPResponseBody {
  return { methodResponses: calls.map(([name, args, tag], index): [string, Record<string, unknown>, string] => {
    const properties = args.properties as string[];
    // Comail deliberately rejects UTC projections combined with recurrence overrides.
    if (properties.includes('recurrenceOverrides') && properties.some(p => p === 'utcStart' || p === 'utcEnd'))
      return ['error', { type: 'invalidArguments' }, tag];
    const selected = Object.fromEntries(Object.entries(event).filter(([key]) => key === 'id' || properties.includes(key)));
    return [name, { accountId: 'mail', state: changed && index ? 'new-state' : 'state', list: [selected] }, tag];
  }) };
}

it('loads UTC times and recurrence overrides through valid Comail projections', async () => {
  request.mockImplementation(async calls => response(calls));
  expect(await getEvents(['event-one'])).toMatchObject([event]);
});

it('does not combine recurrence data from a different calendar revision', async () => {
  request.mockImplementation(async calls => response(calls, true));
  await expect(getEvents(['event-one'])).rejects.toThrow('Calendar changed while loading');
});
