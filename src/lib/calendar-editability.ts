import type { CalendarEvent, Calendar, CalendarRights } from '../api/types';
import { isOrganizer, getUserParticipantId } from './calendar-participants';

// Port of the webmail's lib/calendar-editability.ts.

export type EventEditability = 'editable' | 'rsvp-only' | 'read-only';

export interface EditabilityContext {
  /** Viewer's calendars by id; only their `myRights` is read. */
  calendarsById: ReadonlyMap<string, Pick<Calendar, 'myRights'>>;
  /** Identities + aliases; only refines owner/participant detection, never the gate. */
  userCalendarAddresses: string[];
  /** Client-side external iCal (webcal/ICS) subscriptions - always read-only. */
  isSubscriptionCalendar: (calendarId: string) => boolean;
}

/**
 * Whether the viewer may write to this calendar at all. Stalwart never sends
 * a `mayWrite` flag; the RFC-style rights are `mayWriteAll` / `mayWriteOwn`.
 * Missing rights (older server, own calendars) count as writable.
 */
export function isWritableCalendar(calendar: Pick<Calendar, 'myRights'>): boolean {
  const r = calendar.myRights;
  return !r || !!r.mayWriteAll || !!r.mayWriteOwn;
}

/**
 * Whether new events may be created in / moved into this calendar: writable and
 * not a (read-only) iCal subscription. Bulwark subscriptions are real Stalwart
 * calendars with writable myRights, so the flag must be checked too (issue #762).
 */
export function canCreateEventsIn(
  calendar: Pick<Calendar, 'id' | 'myRights'>,
  isSubscriptionCalendar?: (calendarId: string) => boolean,
): boolean {
  if (isSubscriptionCalendar?.(calendar.id)) return false;
  return isWritableCalendar(calendar);
}

/** Ownerless (plain, non-scheduled) events are editable under `mayWriteOwn`. */
export function eventHasNoOwner(event: CalendarEvent): boolean {
  if (event.organizerCalendarAddress) return false;
  if (event.replyTo && Object.keys(event.replyTo).length > 0) return false;
  if (event.participants) {
    for (const p of Object.values(event.participants)) {
      if (p.roles?.owner) return false;
    }
  }
  return true;
}

/**
 * Editability gated on the calendar's `myRights` FIRST, then identity - so
 * read-only/subscription calendars stay read-only and an alias organizer can't
 * over-open events the user can't write. (Stalwart: organizer identity does not
 * confer calendar write; the ACL does.)
 */
export function getEventEditability(
  event: CalendarEvent,
  ctx: EditabilityContext,
): EventEditability {
  const calIds = Object.keys(event.calendarIds ?? {});

  // Subscriptions have no write path and myRights can't describe them.
  if (calIds.some((id) => ctx.isSubscriptionCalendar(id))) return 'read-only';

  const rights = calIds
    .map((id) => ctx.calendarsById.get(id)?.myRights)
    .filter((r): r is CalendarRights => Boolean(r));

  // Rights not loaded (own calendars on servers that omit them): the user's
  // own account is writable; a shared calendar without rights is not.
  if (rights.length === 0) return event.isShared ? 'read-only' : 'editable';

  // Every calendar must grant the right (a read-only member blocks edit).
  const may = (k: keyof CalendarRights) => rights.every((r) => r[k]);
  const isOwner =
    isOrganizer(event, ctx.userCalendarAddresses) || eventHasNoOwner(event);

  if (may('mayWriteAll')) return 'editable';
  if (may('mayWriteOwn') && isOwner) return 'editable';

  const isParticipant =
    getUserParticipantId(event, ctx.userCalendarAddresses) != null;
  if (may('mayRSVP') && isParticipant) return 'rsvp-only';

  return 'read-only';
}
