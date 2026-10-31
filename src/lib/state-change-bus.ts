// Fan-out of JMAP StateChange events to screens that have no store of their
// own (Scheduled list, Files). The mail/contacts/calendar stores subscribe
// directly in App.tsx; anything else listens here for the type it cares about.

import type { StateChange } from '../api/types';

type Listener = (accountId: string, state: string, change: StateChange) => void;

const listeners = new Map<string, Set<Listener>>();

/** Subscribe to changes of one JMAP type (e.g. `EmailSubmission`, `FileNode`). */
export function onStateChangeType(type: string, listener: Listener): () => void {
  let set = listeners.get(type);
  if (!set) {
    set = new Set();
    listeners.set(type, set);
  }
  set.add(listener);
  return () => {
    set?.delete(listener);
  };
}

export function dispatchStateChange(change: StateChange): void {
  for (const [accountId, types] of Object.entries(change.changed ?? {})) {
    for (const [type, state] of Object.entries(types ?? {})) {
      const set = listeners.get(type);
      if (!set) continue;
      for (const l of set) {
        try {
          l(accountId, state, change);
        } catch {
          // a broken listener must not break the others
        }
      }
    }
  }
}
