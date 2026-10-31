import React from 'react';
import { Alert, Text, View } from 'react-native';
import { AccountSettings } from './AccountSettings';
import { SettingsSection } from './settings-section';
import Button from '../Button';
import Input from '../Input';
import { useColors } from '../../theme/colors';
import { useAuthStore } from '../../stores/auth-store';
import { jmapClient } from '../../api/jmap-client';
import {
  createComailAppPassword,
  decideComailAccessRequest,
  getComailIdentity,
  listComailAccessRequests,
  listComailAppPasswords,
  revokeComailAppPassword,
  type ComailAccessRequest,
  type ComailAppPassword,
} from '../../api/comail-account';

function ComailServices() {
  const colors = useColors();
  const accountId = useAuthStore((state) => state.activeAccountId);
  const [identity, setIdentity] = React.useState<{
    did: string;
    groupware_enabled: boolean;
  }>();
  const [passwords, setPasswords] = React.useState<ComailAppPassword[]>([]);
  const [requests, setRequests] = React.useState<ComailAccessRequest[]>([]);
  const [label, setLabel] = React.useState('');
  const [secret, setSecret] = React.useState<string>();
  const [error, setError] = React.useState<string>();
  const [busy, setBusy] = React.useState(false);
  const generation = React.useRef(0);
  const run = async (action: () => Promise<void>) => {
    const version = generation.current;
    setBusy(true);
    setError(undefined);
    try {
      await action();
    } catch (cause) {
      if (version === generation.current)
        setError(
          cause instanceof Error ? cause.message : 'Comail is unavailable.',
        );
    } finally {
      if (version === generation.current) setBusy(false);
    }
  };
  React.useEffect(() => {
    generation.current += 1;
    const version = generation.current;
    setIdentity(undefined);
    setPasswords([]);
    setRequests([]);
    setSecret(undefined);
    setError(undefined);
    setBusy(false);
    void getComailIdentity()
      .then((value) => {
        if (version === generation.current) setIdentity(value);
      })
      .catch((cause) => {
        if (version === generation.current)
          setError(
            cause instanceof Error ? cause.message : 'Comail is unavailable.',
          );
      });
    return () => {
      generation.current += 1;
    };
  }, [accountId]);
  const reloadPasswords = async () => {
    const version = generation.current;
    const rows = await listComailAppPasswords();
    if (version === generation.current) setPasswords(rows);
  };
  const reloadRequests = async () => {
    const version = generation.current;
    const rows = await listComailAccessRequests();
    if (version === generation.current) setRequests(rows);
  };
  const decide = (row: ComailAccessRequest, decision: 'approve' | 'deny') => {
    const account = jmapClient.comailAccount;
    const message =
      decision === 'approve'
        ? `Only approve if you started this request and the other device shows ${row.numberMatch}.\n\n${row.clientName} · ${row.deviceLabel}\n${row.scopes.join(', ')}`
        : `Deny ${row.clientName} on ${row.deviceLabel}?`;
    Alert.alert(
      decision === 'approve' ? 'Approve access?' : 'Deny access?',
      message,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: decision === 'approve' ? 'Approve' : 'Deny',
          onPress: () => {
            if (jmapClient.comailAccount !== account) return;
            void run(async () => {
              await decideComailAccessRequest(row.id, decision);
              await reloadRequests();
            });
          },
        },
      ],
    );
  };
  return (
    <View style={{ gap: 20 }}>
      <SettingsSection title="Comail identity">
        <Text selectable style={{ color: colors.text }}>
          {identity?.did ?? jmapClient.comailAccount?.did}
        </Text>
        {identity ? (
          <Text style={{ color: colors.textSecondary }}>
            Groupware: {identity.groupware_enabled ? 'enabled' : 'disabled'}
          </Text>
        ) : null}
      </SettingsSection>
      <SettingsSection
        title="Mail clients"
        description="Create a separate password for each mail client. Your atproto password stays with your provider."
      >
        <Input
          label="Client name"
          value={label}
          onChangeText={setLabel}
          maxLength={64}
          editable={!busy}
          placeholder="Thunderbird laptop"
        />
        <Button
          disabled={busy || !label.trim()}
          onPress={() =>
            void run(async () => {
              const version = generation.current;
              const created = await createComailAppPassword(label);
              if (version !== generation.current) return;
              setSecret(created.password);
              setLabel('');
              await reloadPasswords();
            })
          }
        >
          Create app password
        </Button>
        {secret ? (
          <View style={{ gap: 8 }}>
            <Text style={{ color: colors.textSecondary }}>
              Save this password now. It is shown once.
            </Text>
            <Text selectable style={{ color: colors.text }}>
              {secret}
            </Text>
            <Button variant="outline" onPress={() => setSecret(undefined)}>
              Hide password
            </Button>
          </View>
        ) : null}
        <Button
          variant="outline"
          disabled={busy}
          onPress={() => void run(reloadPasswords)}
        >
          Show app passwords
        </Button>
        {passwords.map((password) => (
          <View
            key={password.id}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
          >
            <Text style={{ flex: 1, color: colors.text }}>
              {password.label}
            </Text>
            <Button
              variant="ghost"
              disabled={busy}
              onPress={() => {
                const account = jmapClient.comailAccount;
                Alert.alert(
                  'Revoke app password?',
                  `${password.label} will need a new password to connect.`,
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Revoke',
                      style: 'destructive',
                      onPress: () => {
                        if (jmapClient.comailAccount === account)
                          void run(async () => {
                            await revokeComailAppPassword(password.id);
                            await reloadPasswords();
                          });
                      },
                    },
                  ],
                );
              }}
            >
              Revoke
            </Button>
          </View>
        ))}
      </SettingsSection>
      <SettingsSection
        title="Access requests"
        description="Review requests for access to your Comail account."
      >
        <Button
          variant="outline"
          disabled={busy}
          onPress={() => void run(reloadRequests)}
        >
          Refresh requests
        </Button>
        {requests.map((row) => (
          <View key={row.id} style={{ gap: 10 }}>
            <Text style={{ color: colors.text }}>
              {row.clientName} · {row.deviceLabel}
            </Text>
            <Text style={{ color: colors.textSecondary }}>
              Match this number on your other device: {row.numberMatch}
            </Text>
            <Text style={{ color: colors.textSecondary }}>
              {row.scopes.join(', ')}
            </Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Button
                disabled={busy || Date.parse(row.expiresAt) <= Date.now()}
                onPress={() => decide(row, 'approve')}
              >
                Approve
              </Button>
              <Button
                variant="outline"
                disabled={busy}
                onPress={() => decide(row, 'deny')}
              >
                Deny
              </Button>
            </View>
          </View>
        ))}
      </SettingsSection>
      {error ? (
        <Text accessibilityRole="alert" style={{ color: colors.error }}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

export function ComailAccountSettings() {
  return (
    <View style={{ gap: 20 }}>
      <AccountSettings />
      {jmapClient.comailAccount ? <ComailServices /> : null}
    </View>
  );
}
