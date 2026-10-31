// Bridge to the native BulwarkClientCert module. Wraps the alias pick / get /
// clear flow and exposes a `secureFetch` that mirrors the global `fetch` API
// closely enough that callers can swap them out.
//
// On non-Android platforms (or when the user has not picked a cert) we fall
// straight back to the global `fetch` so we don't pay any bridge overhead.

type Native = {
  getAlias(): Promise<string | null>;
  pickAlias(host: string | null): Promise<string | null>;
  clearAlias(): Promise<void>;
  fetchSecure(request: {
    url: string;
    method: string;
    headers: Record<string, string>;
    bodyBase64: string | null;
    timeoutMs: number;
  }): Promise<{
    status: number;
    statusText: string;
    headers: Record<string, string>;
    bodyBase64: string;
  }>;
};

// Lazy-loaded so unit tests (which run in plain Node) don't have to parse the
// `react-native` entry point. We resolve the module on first access; the
// result is cached by the require cache.
let nativeProbed = false;
let nativeModule: Native | null = null;

function getNative(): Native | null {
  if (nativeProbed) return nativeModule;
  nativeProbed = true;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const rn = require('react-native') as {
      Platform: { OS: string };
      NativeModules: Record<string, unknown>;
    };
    if (rn.Platform.OS !== 'android') return (nativeModule = null);
    nativeModule = (rn.NativeModules.BulwarkClientCert as Native | undefined) ?? null;
  } catch {
    nativeModule = null;
  }
  return nativeModule;
}

// Cached so the hot path can short-circuit without a bridge round-trip.
let cachedAlias: string | null | undefined;

export function isClientCertSupported(): boolean {
  return getNative() != null;
}

export async function getClientCertAlias(): Promise<string | null> {
  const native = getNative();
  if (!native) return null;
  if (cachedAlias !== undefined) return cachedAlias;
  cachedAlias = await native.getAlias();
  return cachedAlias;
}

export async function pickClientCertAlias(host: string | null): Promise<string | null> {
  const native = getNative();
  if (!native) throw new Error('Client certificates require Android');
  const alias = await native.pickAlias(host);
  cachedAlias = alias;
  return alias;
}

export async function clearClientCertAlias(): Promise<void> {
  const native = getNative();
  if (!native) return;
  await native.clearAlias();
  cachedAlias = null;
}

// ── secureFetch ───────────────────────────────────────────────

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
  }
  return globalThis.btoa ? globalThis.btoa(bin) : btoa(bin);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = globalThis.atob ? globalThis.atob(b64) : atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function bodyToBase64(body: BodyInit | null | undefined): Promise<string | null> {
  if (body == null) return null;
  if (typeof body === 'string') {
    // UTF-8 encode then base64.
    const encoder = new TextEncoder();
    return bytesToBase64(encoder.encode(body));
  }
  if (body instanceof ArrayBuffer) {
    return bytesToBase64(new Uint8Array(body));
  }
  if (ArrayBuffer.isView(body)) {
    const view = body as ArrayBufferView;
    return bytesToBase64(new Uint8Array(view.buffer, view.byteOffset, view.byteLength));
  }
  // Blob / FormData / URLSearchParams / ReadableStream are not used in the
  // current code paths. If they appear, the caller should pre-serialize.
  throw new Error(`secureFetch: unsupported body type ${(body as object).constructor?.name}`);
}

function flattenHeaders(input: HeadersInit | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!input) return out;
  if (Array.isArray(input)) {
    for (const [k, v] of input) out[k] = v;
    return out;
  }
  if (typeof Headers !== 'undefined' && input instanceof Headers) {
    input.forEach((v, k) => { out[k] = v; });
    return out;
  }
  return { ...(input as Record<string, string>) };
}

function buildResponse(raw: {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  bodyBase64: string;
}): Response {
  const bytes = raw.bodyBase64 ? base64ToBytes(raw.bodyBase64) : new Uint8Array(0);
  const blob = new Blob([bytes as unknown as BlobPart]);
  return new Response(blob, {
    status: raw.status,
    statusText: raw.statusText,
    headers: raw.headers,
  });
}

/**
 * Drop-in replacement for `fetch` that routes through the native client when
 * the user has selected a client certificate. When no cert is set (or we're
 * on iOS), it just calls the platform `fetch` and the caller pays no
 * bridge overhead.
 */
export interface SecureFetchInit extends RequestInit {
  /** Native-path deadline (ms); blob transfers pass a longer one. */
  timeoutMs?: number;
}

const MAX_REDIRECTS = 5;

function originOf(url: string): string {
  const m = /^(https?):\/\/([^/?#]+)/i.exec(url);
  return m ? `${m[1].toLowerCase()}://${m[2].toLowerCase()}` : '';
}

function hostOnly(origin: string): string {
  return origin.replace(/^https?:\/\//, '').replace(/:\d+$/, '');
}

/**
 * May the Authorization header (and the original method + body) follow a
 * redirect to `target`? Only within the same host, or an http→https upgrade
 * of it - the same rule the webmail's Stalwart passthrough applies.
 */
export function mayFollowRedirect(from: string, target: string): boolean {
  const a = originOf(from);
  const b = originOf(target);
  if (!a || !b) return false;
  if (a === b) return true;
  return hostOnly(a) === hostOnly(b) && a.startsWith('http://') && b.startsWith('https://');
}

function resolveRedirect(base: string, location: string): string {
  if (/^https?:\/\//i.test(location)) return location;
  const origin = originOf(base);
  if (location.startsWith('/')) return origin + location;
  const path = base.slice(origin.length).replace(/[?#].*$/, '');
  const dir = path.slice(0, path.lastIndexOf('/') + 1) || '/';
  return origin + dir + location;
}

export async function secureFetch(
  url: string,
  init?: SecureFetchInit,
): Promise<Response> {
  const native = getNative();
  if (!native) return fetch(url, init);
  const alias = await getClientCertAlias();
  if (!alias) return fetch(url, init);

  const method = init?.method ?? 'GET';
  const headers = flattenHeaders(init?.headers);
  const bodyBase64 = await bodyToBase64(init?.body);
  // Force Content-Length to come from the body bytes - some servers (Stalwart
  // behind nginx in particular) reject chunked uploads when an explicit
  // length isn't provided alongside the bytes.
  if (bodyBase64 != null) {
    const decoded = base64ToBytes(bodyBase64);
    headers['Content-Length'] = String(decoded.byteLength);
  }
  const timeoutMs = init?.timeoutMs ?? 30_000;

  // Redirects are handled here rather than by HttpURLConnection, which would
  // turn a POST into a GET on 301/302 (Stalwart answers a GET /jmap/ with a
  // 404 problem+json, #627) and re-send the Authorization header to a
  // foreign host. Same host / https upgrade keeps method, body and header;
  // anything else is returned to the caller as the 3xx it is.
  let currentUrl = url;
  for (let hop = 0; ; hop++) {
    let raw: Awaited<ReturnType<typeof native.fetchSecure>>;
    try {
      raw = await native.fetchSecure({ url: currentUrl, method, headers, bodyBase64, timeoutMs });
    } catch (err) {
      // Surface as a TypeError to mimic fetch's network-error contract; keep
      // the original message for diagnostics.
      const msg = err instanceof Error ? err.message : String(err);
      throw new TypeError(`secureFetch failed: ${msg}`);
    }
    const status = raw.status;
    const location = raw.headers?.Location ?? raw.headers?.location;
    if (
      (status === 301 || status === 302 || status === 303 || status === 307 || status === 308) &&
      location &&
      hop < MAX_REDIRECTS
    ) {
      const next = resolveRedirect(currentUrl, location);
      if (mayFollowRedirect(currentUrl, next)) {
        currentUrl = next;
        continue;
      }
    }
    return buildResponse(raw);
  }
}
