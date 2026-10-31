export interface HandleSuggestion {
  did: string;
  handle: string;
  displayName?: string;
}

// Match Comail web's public account search. Never attach mailbox credentials.
export async function searchHandleSuggestions(
  query: string,
  signal?: AbortSignal,
): Promise<HandleSuggestion[]> {
  const q = query.trim().replace(/^@/, '').toLowerCase();
  if (q.length < 2 || q.length > 253 || q.startsWith('did:') || signal?.aborted)
    return [];
  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal?.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(cancel, 4000);
  try {
    const url = new URL('https://typeahead.waow.tech/xrpc/tech.waow.typeahead.searchActors');
    url.searchParams.set('q', q);
    url.searchParams.set('limit', '8');
    const response = await fetch(url.toString(), {
      signal: controller.signal,
      credentials: 'omit',
      redirect: 'error',
      headers: { Accept: 'application/json', 'X-Client': 'comail.at' },
    });
    if (!response.ok) return [];
    const body = await response.json();
    if (controller.signal.aborted || !Array.isArray(body?.actors)) return [];
    const results: HandleSuggestion[] = [];
    const seen = new Set<string>();
    for (const actor of body.actors.slice(0, 32)) {
      if (
        !actor || typeof actor.did !== 'string' ||
        actor.did.length > 2048 || !/^did:(plc|web):[^\s]+$/.test(actor.did) ||
        typeof actor.handle !== 'string' || actor.handle.length > 253 ||
        !/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(actor.handle) ||
        seen.has(actor.handle)
      ) continue;
      seen.add(actor.handle);
      results.push({
        did: actor.did,
        handle: actor.handle,
        ...(typeof actor.displayName === 'string' && actor.displayName.length <= 256
          ? { displayName: actor.displayName } : {}),
      });
      if (results.length === 8) break;
    }
    return results;
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
  }
}
