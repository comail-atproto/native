import { Alert } from 'react-native';
import type { DeleteAction } from '../stores/settings-store';

/**
 * Whether a delete would destroy the message outright rather than move it to
 * Trash. Mirrors the rule in `email-store.deleteEmail`/`deleteEmailsBatch`:
 * already in Trash, the global "permanent" delete action, or junk with the
 * "permanently delete junk" option.
 */
export function isPermanentDelete(opts: {
  inTrash: boolean;
  inJunk: boolean;
  deleteAction: DeleteAction;
  permanentlyDeleteJunk: boolean;
}): boolean {
  return opts.inTrash || opts.deleteAction === 'permanent' || (opts.permanentlyDeleteJunk && opts.inJunk);
}

type Translate = (key: string, fallback?: string, params?: Record<string, string | number>) => string;

/**
 * Confirm dialog shown before any permanent destroy (webmail parity:
 * `mail-app.tsx` / `email-list.tsx` confirm before a destroy). Resolves true
 * when the user picked Delete.
 */
export function confirmPermanentDelete(count: number, t: Translate): Promise<boolean> {
  return new Promise((resolve) => {
    const message = count === 1
      ? t('email_list.permanent_delete_confirm_message', 'This email will be permanently deleted. This action cannot be undone.')
      : t('email_list.permanent_delete_confirm_batch_message', `These ${count} emails will be permanently deleted. This action cannot be undone.`, { count });
    Alert.alert(
      t('email_list.permanent_delete_confirm_title', 'Delete permanently?'),
      message,
      [
        { text: t('common.cancel', 'Cancel'), style: 'cancel', onPress: () => resolve(false) },
        { text: t('common.delete', 'Delete'), style: 'destructive', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}
