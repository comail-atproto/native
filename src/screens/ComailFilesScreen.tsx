import React from 'react';
import { Alert, FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import Button from '../components/Button';
import ComailServiceAccess from '../components/ComailServiceAccess';
import { useColors } from '../theme/colors';
import { useAuthStore } from '../stores/auth-store';
import { randomHex } from '../lib/random';
import { jmapClient } from '../api/jmap-client';
import {
  deleteComailFile,
  downloadComailFile,
  listComailFiles,
  prepareComailUpload,
  uploadComailFile,
  MAX_COMAIL_FILE_BYTES,
  type ComailFile,
  type ComailUpload,
} from '../api/comail-files';

export default function ComailFilesScreen() {
  const colors = useColors();
  const accountId = useAuthStore((state) => state.activeAccountId);
  const [files, setFiles] = React.useState<ComailFile[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string>();
  const pending = React.useRef<ComailUpload | null>(null);
  const generation = React.useRef(0);
  const reload = React.useCallback(async () => {
    const version = generation.current;
    setBusy(true);
    setError(undefined);
    try {
      const next = await listComailFiles();
      if (version === generation.current) setFiles(next);
    } catch (cause) {
      if (version === generation.current)
        setError(
          cause instanceof Error ? cause.message : 'Files are unavailable.',
        );
    } finally {
      if (version === generation.current) setBusy(false);
    }
  }, []);
  React.useEffect(() => {
    generation.current += 1;
    setFiles([]);
    pending.current = null;
    void reload();
    return () => {
      generation.current += 1;
    };
  }, [accountId, reload]);

  const upload = async () => {
    const version = generation.current;
    setBusy(true);
    setError(undefined);
    try {
      if (!pending.current) {
        const picker = await import('expo-document-picker');
        const result = await picker.getDocumentAsync({
          copyToCacheDirectory: true,
          multiple: false,
        });
        if (result.canceled || version !== generation.current) return;
        const selected = result.assets[0];
        const local = new File(selected.uri);
        if (local.size > MAX_COMAIL_FILE_BYTES)
          throw new Error('Choose a file up to 35 MB.');
        const bytes = await local.bytes();
        if (version !== generation.current) return;
        pending.current = prepareComailUpload(
          selected.name,
          selected.mimeType || 'application/octet-stream',
          bytes,
        );
      }
      if (version !== generation.current) return;
      await uploadComailFile(pending.current);
      if (version !== generation.current) return;
      pending.current = null;
      await reload();
    } catch (cause) {
      if (version === generation.current)
        setError(cause instanceof Error ? cause.message : 'Upload failed.');
    } finally {
      if (version === generation.current) setBusy(false);
    }
  };
  const download = async (file: ComailFile) => {
    const version = generation.current;
    setBusy(true);
    setError(undefined);
    let local: File | undefined;
    try {
      const bytes = await downloadComailFile(file);
      if (version !== generation.current) return;
      const name =
        file.name.replace(/[^\p{L}\p{N}._ -]/gu, '_').slice(0, 128) ||
        'download';
      local = new File(Paths.cache, `comail-${randomHex(8)}-${name}`);
      local.create();
      local.write(bytes);
      if (!(await Sharing.isAvailableAsync()))
        throw new Error('Sharing is unavailable on this device.');
      if (version !== generation.current) return;
      await Sharing.shareAsync(local.uri, {
        mimeType: file.mimeType,
        dialogTitle: file.name,
      });
    } catch (cause) {
      if (version === generation.current)
        setError(cause instanceof Error ? cause.message : 'Download failed.');
    } finally {
      local?.delete();
      if (version === generation.current) setBusy(false);
    }
  };
  const remove = (file: ComailFile) => {
    const identity = jmapClient.comailAccount;
    Alert.alert('Delete file?', `Delete ${file.name} from your Comail files?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          if (jmapClient.comailAccount !== identity) return;
          setBusy(true);
          void deleteComailFile(file)
            .then(async () => {
              if (jmapClient.comailAccount === identity) await reload();
            })
            .catch((cause) => {
              if (jmapClient.comailAccount === identity)
                setError(
                  cause instanceof Error ? cause.message : 'Delete failed.',
                );
            })
            .finally(() => {
              if (jmapClient.comailAccount === identity) setBusy(false);
            });
        },
      },
    ]);
  };
  return (
    <SafeAreaView
      style={[styles.root, { backgroundColor: colors.background }]}
      edges={['top']}
    >
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>Files</Text>
        <Button onPress={() => void upload()} disabled={busy || !!error}>
          {pending.current ? 'Retry upload' : 'Upload'}
        </Button>
      </View>
      {error ? (
        <View style={styles.error}>
          <Text accessibilityRole="alert" style={{ color: colors.error }}>
            {error}
          </Text>
          <ComailServiceAccess service="files" onAuthorized={reload} />
          <Button
            variant="outline"
            onPress={() => void reload()}
            disabled={busy}
          >
            Retry
          </Button>
        </View>
      ) : null}
      <FlatList
        data={files}
        keyExtractor={(file) => file.fileId}
        refreshing={busy}
        onRefresh={() => void reload()}
        ListEmptyComponent={
          <Text style={[styles.empty, { color: colors.textMuted }]}>
            {busy
              ? 'Loading files…'
              : error
                ? ''
                : 'Your Comail files will appear here.'}
          </Text>
        }
        renderItem={({ item }) => (
          <View style={[styles.row, { borderBottomColor: colors.border }]}>
            <View style={styles.name}>
              <Text style={{ color: colors.text }} numberOfLines={2}>
                {item.name}
              </Text>
              <Text style={{ color: colors.textMuted }}>
                {Math.ceil(item.size / 1024)} KB
              </Text>
            </View>
            <Button
              variant="outline"
              disabled={busy || !!error}
              onPress={() => void download(item)}
            >
              Open
            </Button>
            <Button
              variant="ghost"
              disabled={busy || !!error}
              onPress={() => remove(item)}
              accessibilityLabel={`Delete ${item.name}`}
            >
              Delete
            </Button>
          </View>
        )}
      />
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
  },
  title: { fontSize: 26, fontWeight: '700' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  name: { flex: 1, gap: 5 },
  error: { padding: 16, gap: 12 },
  empty: { padding: 20, textAlign: 'center' },
});
