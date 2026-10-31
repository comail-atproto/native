import React from 'react';
import { Alert } from 'react-native';
import Button from './Button';
import { authorizeComailService, type ComailService } from '../api/comail-service-access';
import { jmapClient } from '../api/jmap-client';
import { HandoffCancelledError } from '../lib/oauth';
import { useAuthStore } from '../stores/auth-store';
import { useLocaleStore } from '../stores/locale-store';

export default function ComailServiceAccess({ service, onAuthorized }: {
  service: ComailService;
  onAuthorized: () => Promise<void>;
}) {
  const [busy, setBusy] = React.useState(false);
  const t = useLocaleStore((s) => s.t);
  const activeAccountId = useAuthStore((s) => s.activeAccountId);
  const activeAccount = React.useRef(activeAccountId);
  activeAccount.current = activeAccountId;

  const connect = async () => {
    if (busy) return;
    const accountId = activeAccountId;
    setBusy(true);
    try {
      await authorizeComailService(jmapClient, service, async (result) => {
        await useAuthStore.getState().login(result.serverUrl, result.username, result.password, {
          addAccount: true, comail: result.comail,
        });
      });
      if (activeAccount.current === accountId) await onAuthorized();
    } catch (cause) {
      if (cause instanceof HandoffCancelledError || activeAccount.current !== accountId) return;
      Alert.alert(t('common.error', 'Error'),
        cause instanceof Error ? cause.message : t('identities.validation_errors.unknown_error', 'Unknown error'));
    } finally {
      setBusy(false);
    }
  };

  if (!jmapClient.comailAccount) return null;
  return (
    <Button variant="outline" disabled={busy} onPress={() => void connect()}>
      {busy
        ? t('calendar.authorization.checking', 'Connecting…')
        : t('calendar.authorization.check', 'Login with Atmosphere')}
    </Button>
  );
}
