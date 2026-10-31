// RFC 4122 v4 UUID generator backed by the platform CSPRNG (expo-crypto, or
// the web crypto global off-device). Used for contact UIDs (#644), outbox
// entry ids and client-generated Message-IDs, so the old Math.random fallback
// only remains as a last resort for ephemeral client-side keys when no secure
// source exists at all.
import { secureRandomUUID } from './random';

export function generateUUID(): string {
  try {
    return secureRandomUUID();
  } catch {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
      const r = (Math.random() * 16) | 0;
      const v = ch === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }
}
