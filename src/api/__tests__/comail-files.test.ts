import { afterEach, beforeEach, expect, it, vi } from 'vitest';
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
  },
}));
vi.mock('../comail', () => ({ comailFetch: vi.fn() }));
import { comailFetch } from '../comail';
import { jmapClient } from '../jmap-client';
import {
  listComailFiles,
  downloadComailFile,
  deleteComailFile,
  prepareComailUpload,
  uploadComailFile,
  MAX_COMAIL_FILE_BYTES,
} from '../comail-files';
const request = vi.mocked(comailFetch);
const file = {
  fileId: `file-${'a'.repeat(64)}`,
  revisionId: `revision-${'b'.repeat(64)}`,
  operationId: `op-${'c'.repeat(64)}`,
  name: 'hello.txt',
  mimeType: 'text/plain',
  size: 5,
  sha256: '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
  parents: [],
  blob: { cid: 'opaque', mimeType: 'text/plain', size: 5 },
  $type: 'email.atmos.filePersonal.file',
};
beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllGlobals());

it.each([1, 2, 3, 16_382, 16_383, 16_384, 1024 * 1024])(
  'encodes %i binary bytes without browser base64 globals',
  (size) => {
    vi.stubGlobal('btoa', undefined);
    const bytes = Uint8Array.from({ length: size }, (_, index) => index % 256);
    const upload = prepareComailUpload('binary.dat', '', bytes);
    expect(upload.bytes).toBe(Buffer.from(bytes).toString('base64'));
    expect(upload.mimeType).toBe('application/octet-stream');
    expect(upload.fileId).toMatch(/^file-[a-f0-9]{64}$/);
    expect(upload.operationId).toMatch(/^op-[a-f0-9]{64}$/);
  },
);

it('rejects empty and oversized uploads before encoding', () => {
  expect(() => prepareComailUpload('empty', '', new Uint8Array())).toThrow(
    '35 MB',
  );
  expect(() =>
    prepareComailUpload('large', '', new Uint8Array(MAX_COMAIL_FILE_BYTES + 1)),
  ).toThrow('35 MB');
});

it('verifies upload responses without browser base64 globals', async () => {
  vi.stubGlobal('atob', undefined);
  const input = {
    fileId: file.fileId,
    operationId: file.operationId,
    name: file.name,
    mimeType: file.mimeType,
    bytes: 'aGVsbG8=',
    parents: [],
  };
  request.mockResolvedValueOnce(new Response(JSON.stringify(file)));
  await expect(uploadComailFile(input)).resolves.toMatchObject(file);

  request.mockResolvedValueOnce(
    new Response(JSON.stringify({ ...file, size: 4 })),
  );
  await expect(uploadComailFile(input)).rejects.toThrow('verification failed');
  request.mockResolvedValueOnce(
    new Response(JSON.stringify({ ...file, sha256: '0'.repeat(64) })),
  );
  await expect(uploadComailFile(input)).rejects.toThrow('verification failed');
});

it('accepts only the active DID inventory and verifies downloaded content', async () => {
  request.mockResolvedValueOnce(
    new Response(JSON.stringify({ actorDID: 'did:plc:owner', files: [file] })),
  );
  expect((await listComailFiles())[0].fileId).toBe(file.fileId);
  request.mockResolvedValueOnce(new Response('hello'));
  expect(new TextDecoder().decode(await downloadComailFile(file))).toBe(
    'hello',
  );
  request.mockResolvedValueOnce(new Response('other'));
  await expect(downloadComailFile(file)).rejects.toThrow('verification');
});

it('uses the observed revision when deleting and rejects another DID inventory', async () => {
  request.mockResolvedValueOnce(
    new Response(
      JSON.stringify({ actorDID: 'did:plc:foreign', files: [file] }),
    ),
  );
  await expect(listComailFiles()).rejects.toThrow();
  request.mockResolvedValueOnce(new Response('{"deleted":true}'));
  await deleteComailFile(file);
  const body = JSON.parse(String(request.mock.calls[1][2]?.body));
  expect(body.expectedHeads).toEqual([file.revisionId]);
});

it('discards file content if the account changes while the body is read', async () => {
  const original = jmapClient.comailAccount;
  request.mockResolvedValueOnce({
    arrayBuffer: async () => {
      Object.assign(jmapClient, {
        comailAccount: { ...original, did: 'did:plc:other' },
      });
      return new TextEncoder().encode('hello').buffer;
    },
  } as Response);
  try {
    await expect(downloadComailFile(file)).rejects.toThrow('account changed');
  } finally {
    Object.assign(jmapClient, { comailAccount: original });
  }
});
