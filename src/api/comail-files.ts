import { jmapClient } from './jmap-client';
import { comailFetch } from './comail';
import { randomHex } from '../lib/random';
import { sha256Hex } from '../lib/sha256';
import { fromByteArray, toByteArray } from 'base64-js';

export interface ComailFile {
  fileId: string;
  revisionId: string;
  operationId: string;
  name: string;
  mimeType: string;
  size: number;
  sha256: string;
  parents: string[];
}
export interface ComailUpload {
  fileId: string;
  operationId: string;
  name: string;
  mimeType: string;
  bytes: string;
  parents: string[];
}
export const MAX_COMAIL_FILE_BYTES = 35 * 1024 * 1024;

function validFile(value: unknown): value is ComailFile {
  if (!value || typeof value !== 'object') return false;
  const file = value as ComailFile;
  return (
    /^file-[a-f0-9]{64}$/.test(file.fileId) &&
    /^revision-[a-f0-9]{64}$/.test(file.revisionId) &&
    /^op-[a-f0-9]{64}$/.test(file.operationId) &&
    typeof file.name === 'string' &&
    !!file.name &&
    file.name.length <= 1024 &&
    typeof file.mimeType === 'string' &&
    !!file.mimeType &&
    file.mimeType.length <= 255 &&
    Number.isSafeInteger(file.size) &&
    file.size > 0 &&
    file.size <= MAX_COMAIL_FILE_BYTES &&
    /^[a-f0-9]{64}$/.test(file.sha256) &&
    Array.isArray(file.parents) &&
    file.parents.every((parent) => typeof parent === 'string')
  );
}

export async function listComailFiles(): Promise<ComailFile[]> {
  const identity = jmapClient.comailAccount;
  const response = await comailFetch(jmapClient, '/files/inventory');
  const value = await response.json();
  requireSameAccount(identity);
  if (
    !identity ||
    value.actorDID !== identity.did ||
    !Array.isArray(value.files) ||
    value.files.length > 10_000 ||
    !value.files.every(validFile) ||
    new Set(value.files.map((file: ComailFile) => file.fileId)).size !==
      value.files.length
  )
    throw new Error('Invalid Comail file inventory.');
  return value.files;
}

export function prepareComailUpload(
  name: string,
  mimeType: string,
  bytes: Uint8Array,
): ComailUpload {
  if (bytes.length === 0 || bytes.length > MAX_COMAIL_FILE_BYTES)
    throw new Error('Choose a file between 1 byte and 35 MB.');
  return {
    fileId: `file-${randomHex(32)}`,
    operationId: `op-${randomHex(32)}`,
    name,
    mimeType: mimeType || 'application/octet-stream',
    bytes: fromByteArray(bytes),
    parents: [],
  };
}

export async function uploadComailFile(
  input: ComailUpload,
): Promise<ComailFile> {
  const identity = jmapClient.comailAccount;
  const response = await comailFetch(jmapClient, '/files/put', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const value = await response.json();
  requireSameAccount(identity);
  const bytes = toByteArray(input.bytes);
  if (
    !validFile(value) ||
    value.fileId !== input.fileId ||
    value.operationId !== input.operationId ||
    value.name !== input.name ||
    value.mimeType !== input.mimeType ||
    value.size !== bytes.length ||
    value.sha256 !== sha256Hex(bytes)
  )
    throw new Error('Comail upload verification failed. Retry this upload.');
  return value;
}

export async function downloadComailFile(
  file: ComailFile,
): Promise<Uint8Array> {
  if (!validFile(file)) throw new Error('Invalid Comail file.');
  const identity = jmapClient.comailAccount;
  const response = await comailFetch(jmapClient, '/files/download', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileId: file.fileId, revisionId: file.revisionId }),
  });
  const bytes = new Uint8Array(await response.arrayBuffer());
  requireSameAccount(identity);
  if (bytes.length !== file.size || sha256Hex(bytes) !== file.sha256)
    throw new Error('Comail download verification failed.');
  return bytes;
}

export async function deleteComailFile(
  file: ComailFile,
  operationId = `op-${randomHex(32)}`,
): Promise<void> {
  if (!validFile(file)) throw new Error('Invalid Comail file.');
  const identity = jmapClient.comailAccount;
  const response = await comailFetch(jmapClient, '/files/tombstone', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fileId: file.fileId,
      operationId,
      expectedHeads: [file.revisionId],
    }),
  });
  const value = await response.json();
  requireSameAccount(identity);
  if (value.deleted !== true)
    throw new Error(
      'Comail did not confirm deletion. Refresh Files before retrying.',
    );
}

function requireSameAccount(identity: typeof jmapClient.comailAccount): void {
  if (jmapClient.comailAccount !== identity)
    throw new Error('The active account changed. Reopen this screen.');
}
