import { describe, it, expect } from 'vitest';
import {
  findTasksOnlyCalendarIds,
  isTaskLikeObject,
  type ScannedCalendarObject,
} from '../calendar-component-detection';

describe('isTaskLikeObject', () => {
  it('matches explicit Task objects', () => {
    expect(isTaskLikeObject({ '@type': 'Task' })).toBe(true);
    expect(isTaskLikeObject({ '@type': 'task' })).toBe(true);
  });

  it('matches CalDAV tasks without @type by task-only keys', () => {
    expect(isTaskLikeObject({ due: '2026-03-01T00:00:00' })).toBe(true);
    expect(isTaskLikeObject({ progress: 'needs-action' })).toBe(true);
    expect(isTaskLikeObject({ percentComplete: 0 })).toBe(true);
  });

  it('never treats an explicit Event as a task', () => {
    expect(isTaskLikeObject({ '@type': 'Event', due: 'x' })).toBe(false);
    expect(isTaskLikeObject({ '@type': 'Event' })).toBe(false);
    expect(isTaskLikeObject({ start: '2026-03-01T09:00:00' } as ScannedCalendarObject)).toBe(false);
  });
});

describe('findTasksOnlyCalendarIds', () => {
  it('returns calendars that only hold tasks, ignoring empty ones', () => {
    const objects: ScannedCalendarObject[] = [
      { '@type': 'Task', calendarIds: { tasks: true } },
      { due: '2026-03-01T00:00:00', calendarIds: { tasks: true } },
      { '@type': 'Event', calendarIds: { mixed: true } },
      { '@type': 'Task', calendarIds: { mixed: true } },
    ];
    const result = findTasksOnlyCalendarIds(objects, ['tasks', 'mixed', 'empty']);
    expect([...result]).toEqual(['tasks']);
  });
});
