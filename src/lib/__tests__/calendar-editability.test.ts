import { describe, it, expect } from 'vitest';
import type { Calendar, CalendarEvent } from '../../api/types';
import {
  canCreateEventsIn,
  eventHasNoOwner,
  getEventEditability,
  isWritableCalendar,
} from '../calendar-editability';

const base: CalendarEvent = {
  id: 'ev',
  uid: 'u',
  title: 'T',
  start: '2026-03-01T09:00:00',
  calendarIds: { 'cal-1': true },
};

function ctx(rights: Calendar['myRights'] | undefined, subs: string[] = []) {
  return {
    calendarsById: new Map([['cal-1', { myRights: rights }]]),
    userCalendarAddresses: ['me@example.com', 'alias@example.com'],
    isSubscriptionCalendar: (id: string) => subs.includes(id),
  };
}

describe('isWritableCalendar / canCreateEventsIn', () => {
  it('treats missing rights as writable and never reads mayWrite', () => {
    expect(isWritableCalendar({})).toBe(true);
    expect(isWritableCalendar({ myRights: { mayWriteOwn: true } })).toBe(true);
    expect(isWritableCalendar({ myRights: { mayReadItems: true } })).toBe(false);
  });

  it('excludes iCal subscriptions even when the calendar is writable (#762)', () => {
    const cal = { id: 'cal-1', myRights: { mayWriteAll: true } };
    expect(canCreateEventsIn(cal)).toBe(true);
    expect(canCreateEventsIn(cal, (id) => id === 'cal-1')).toBe(false);
  });
});

describe('getEventEditability', () => {
  it('is read-only on a subscription calendar regardless of rights', () => {
    expect(getEventEditability(base, ctx({ mayWriteAll: true }, ['cal-1']))).toBe('read-only');
  });

  it('is editable with mayWriteAll', () => {
    expect(getEventEditability(base, ctx({ mayWriteAll: true }))).toBe('editable');
  });

  it('is editable with mayWriteOwn only for own/ownerless events (alias organizer counts)', () => {
    expect(getEventEditability(base, ctx({ mayWriteOwn: true }))).toBe('editable');
    const foreign = { ...base, organizerCalendarAddress: 'mailto:other@example.com' };
    expect(getEventEditability(foreign, ctx({ mayWriteOwn: true }))).toBe('read-only');
    const mine = { ...base, organizerCalendarAddress: 'mailto:alias@example.com' };
    expect(getEventEditability(mine, ctx({ mayWriteOwn: true }))).toBe('editable');
  });

  it('is rsvp-only for a participant with mayRSVP but no write right', () => {
    const invited = {
      ...base,
      organizerCalendarAddress: 'mailto:other@example.com',
      participants: { p1: { calendarAddress: 'mailto:me@example.com', roles: { attendee: true } } },
    };
    expect(getEventEditability(invited, ctx({ mayRSVP: true }))).toBe('rsvp-only');
    expect(getEventEditability(invited, ctx({ mayReadItems: true }))).toBe('read-only');
  });

  it('falls back on ownership when rights are not loaded', () => {
    expect(getEventEditability(base, ctx(undefined))).toBe('editable');
    expect(getEventEditability({ ...base, isShared: true }, ctx(undefined))).toBe('read-only');
  });
});

describe('eventHasNoOwner', () => {
  it('detects plain events', () => {
    expect(eventHasNoOwner(base)).toBe(true);
    expect(eventHasNoOwner({ ...base, replyTo: { imip: 'mailto:x@y' } })).toBe(false);
    expect(eventHasNoOwner({ ...base, participants: { a: { roles: { owner: true } } } })).toBe(false);
  });
});
