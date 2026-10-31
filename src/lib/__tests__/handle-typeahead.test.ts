import { afterEach, describe, expect, it, vi } from 'vitest';
import { searchHandleSuggestions } from '../handle-typeahead';

const actor = { did: 'did:plc:alice', handle: 'alice.example.test', displayName: 'Alice' };
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('Comail handle suggestions', () => {
  it('uses the same public search as Comail web without account credentials', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ actors: [actor] }));
    vi.stubGlobal('fetch', fetcher);
    expect(await searchHandleSuggestions(' @Ali ')).toEqual([actor]);
    const [url, options] = fetcher.mock.calls[0];
    expect(url).toBe('https://typeahead.waow.tech/xrpc/tech.waow.typeahead.searchActors?q=ali&limit=8');
    expect(options.credentials).toBe('omit');
    expect(options.redirect).toBe('error');
    expect(options.headers).toEqual({ Accept: 'application/json', 'X-Client': 'comail.at' });
  });

  it('ignores incomplete queries and raw DIDs', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    for (const query of ['', '@a', 'did:plc:alice']) expect(await searchHandleSuggestions(query)).toEqual([]);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('discards malformed entries, duplicates, and unbounded profile fields', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ actors: [
      null, {}, { ...actor, did: 42 }, { ...actor, handle: 'bad\n.test' }, actor, actor,
      { did: 'did:web:example.test', handle: 'other.example.test', displayName: 'x'.repeat(1000), avatar: 'http://untrusted.test' },
    ] })));
    expect(await searchHandleSuggestions('ali')).toEqual([actor, { did: 'did:web:example.test', handle: 'other.example.test' }]);
  });

  it('keeps manual entry usable when search fails', async () => {
    const fetcher = vi.fn().mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(new Response('invalid json'));
    vi.stubGlobal('fetch', fetcher);
    for (let n = 0; n < 3; n++) expect(await searchHandleSuggestions('ali')).toEqual([]);
  });

  it('cancels a superseded request and does not return a late response', async () => {
    const controller = new AbortController();
    let complete!: (value: Response) => void;
    const fetcher = vi.fn().mockImplementation(() => new Promise<Response>((resolve) => { complete = resolve; }));
    vi.stubGlobal('fetch', fetcher);
    const pending = searchHandleSuggestions('ali', controller.signal);
    controller.abort();
    expect(fetcher.mock.calls[0][1].signal.aborted).toBe(true);
    complete(Response.json({ actors: [actor] }));
    expect(await pending).toEqual([]);
  });

  it('bounds stalled searches to four seconds', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn((_url, options: RequestInit) => new Promise((_resolve, reject) => {
      options.signal!.addEventListener('abort', () => reject(new Error('aborted')));
    })));
    const pending = searchHandleSuggestions('ali');
    await vi.advanceTimersByTimeAsync(4000);
    expect(await pending).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });
});
