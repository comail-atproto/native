import { jmapClient } from './jmap-client';
import { comailFetch } from './comail';

export interface ComailAppPassword {
  id: string;
  label: string;
}
export interface ComailAccessRequest {
  id: number;
  clientName: string;
  deviceLabel: string;
  numberMatch: string;
  scopes: string[];
  expiresAt: string;
  status: string;
}

async function request(path: string, init?: RequestInit): Promise<unknown> {
  const identity = jmapClient.comailAccount;
  const response = await comailFetch(jmapClient, path, init);
  const value: unknown = await response.json();
  if (jmapClient.comailAccount !== identity)
    throw new Error('The active account changed. Reopen Account.');
  return value;
}

export async function getComailIdentity(): Promise<{
  did: string;
  groupware_enabled: boolean;
}> {
  const value = await request('/access-approvals/identity');
  if (
    !value ||
    typeof value !== 'object' ||
    !('did' in value) ||
    value.did !== jmapClient.comailAccount?.did ||
    !('groupware_enabled' in value) ||
    typeof value.groupware_enabled !== 'boolean'
  )
    throw new Error('Comail account identity could not be verified.');
  return value as { did: string; groupware_enabled: boolean };
}

export async function listComailAppPasswords(): Promise<ComailAppPassword[]> {
  const value = await request('/app-passwords');
  if (
    !Array.isArray(value) ||
    value.length > 100 ||
    value.some(
      (row) =>
        !row ||
        typeof row.id !== 'string' ||
        !/^[A-Za-z0-9_-]+$/.test(row.id) ||
        typeof row.label !== 'string',
    )
  )
    throw new Error('Invalid Comail mail-client response.');
  return value;
}

export async function createComailAppPassword(
  label: string,
): Promise<{ id: string; password: string }> {
  const value = await request('/app-passwords', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ label: label.trim().slice(0, 64) }),
  });
  if (
    !value ||
    typeof value !== 'object' ||
    !('id' in value) ||
    typeof value.id !== 'string' ||
    !('password' in value) ||
    typeof value.password !== 'string' ||
    !value.password
  )
    throw new Error('Comail did not return a mail-client password.');
  return value as { id: string; password: string };
}

export async function revokeComailAppPassword(id: string): Promise<void> {
  if (!/^[A-Za-z0-9_-]+$/.test(id))
    throw new Error('Invalid mail-client password ID.');
  const response = await comailFetch(jmapClient, `/app-passwords/${id}`, {
    method: 'DELETE',
  });
  if (response.status !== 200 && response.status !== 204)
    throw new Error('Comail did not confirm revocation.');
}

export async function listComailAccessRequests(): Promise<
  ComailAccessRequest[]
> {
  const value = await request('/access-approvals');
  if (
    !value ||
    typeof value !== 'object' ||
    !('authoritative' in value) ||
    value.authoritative !== true ||
    !('accessRequests' in value) ||
    !Array.isArray(value.accessRequests) ||
    value.accessRequests.length > 100 ||
    value.accessRequests.some(
      (row) =>
        !row ||
        row.authoritative !== true ||
        !Number.isSafeInteger(row.id) ||
        row.id <= 0 ||
        typeof row.clientName !== 'string' ||
        typeof row.deviceLabel !== 'string' ||
        typeof row.numberMatch !== 'string' ||
        typeof row.expiresAt !== 'string' ||
        !Number.isFinite(Date.parse(row.expiresAt)) ||
        row.status !== 'pending' ||
        !Array.isArray(row.scopes) ||
        row.scopes.some((scope: unknown) => typeof scope !== 'string'),
    )
  )
    throw new Error('Invalid Comail access requests.');
  return value.accessRequests;
}

export async function decideComailAccessRequest(
  id: number,
  decision: 'approve' | 'deny',
): Promise<void> {
  if (!Number.isSafeInteger(id) || id <= 0)
    throw new Error('Invalid access request.');
  const value = await request(`/access-approvals/${id}/decision`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      decision: decision === 'approve' ? 'approved' : 'denied',
    }),
  });
  if (
    !value ||
    typeof value !== 'object' ||
    !('authoritative' in value) ||
    value.authoritative !== true ||
    !('id' in value) ||
    value.id !== id ||
    !('status' in value) ||
    !['approved', 'denied', 'expired'].includes(String(value.status))
  )
    throw new Error('Comail did not confirm the access decision.');
}
