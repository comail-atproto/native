import React from 'react';
import { ActivityIndicator, Keyboard, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Button from '../components/Button';
import ComailArtwork from '../components/ComailArtwork';
import { useArtworkMotion } from '../theme/dynamic';
import type { Rect } from '../lib/comail-particles';
import Input from '../components/Input';
import LoginShell from './login/LoginShell';
import { StatusBar } from 'expo-status-bar';
import { ColorThemeContext, useColors } from '../theme/colors';
import { SPOOKY_THEME_ID } from '../theme/comail-themes';
import { typography } from '../theme/tokens';
import { loginToComail } from '../lib/comail-login';
import { searchHandleSuggestions, type HandleSuggestion } from '../lib/handle-typeahead';
import { HandoffCancelledError } from '../lib/oauth';
import { useAuthStore } from '../stores/auth-store';

export default function ComailLoginScreen(props: React.ComponentProps<typeof LoginContent>) {
  return (
    <ColorThemeContext.Provider value={SPOOKY_THEME_ID}>
      <StatusBar style="light" />
      <LoginContent {...props} />
    </ColorThemeContext.Provider>
  );
}

function LoginContent({
  onLogin,
  isAddMode = false,
  onCancel,
}: {
  onLogin?: () => void;
  isAddMode?: boolean;
  onCancel?: () => void;
}) {
  const colors = useColors();
  const [available, setAvailable] = React.useState({ width: 390, height: 700 });
  const compact = available.height < 540 || available.width < 360;
  const short = available.height < 320;
  const [regions, setRegions] = React.useState<Record<string, Rect>>({});
  const rememberRegion = (name: string) => (event: LayoutChangeEvent) => {
    const rect = event.nativeEvent.layout;
    setRegions(previous => ({ ...previous, [name]: rect }));
  };
  const quietRects = React.useMemo(() => [
    ...(short ? [] : compact ? ['title'] : ['title', 'subtitle']).flatMap(name => regions[name]
      ? [{ ...regions[name], x: regions[name].x + (regions.brand?.x ?? 0), y: regions[name].y + (regions.brand?.y ?? 0) }]
      : []),
    ...(regions.form ? [regions.form] : []),
    ...(!compact && regions.hint ? [regions.hint] : []),
  ].map(rect => ({ ...rect, x: rect.x + (regions.content?.x ?? 0), y: rect.y + (regions.content?.y ?? 0) })), [regions, compact, short]);
  const animate = useArtworkMotion();
  const [handle, setHandle] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const submitting = React.useRef(false);
  const [error, setError] = React.useState<string>();
  const [focused, setFocused] = React.useState(false);
  const [suggestions, setSuggestions] = React.useState<HandleSuggestion[]>([]);
  const [searching, setSearching] = React.useState(false);

  React.useEffect(() => {
    setSuggestions([]);
    setSearching(false);
    if (!focused || busy || handle.trim().replace(/^@/, '').length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setSearching(true);
      void searchHandleSuggestions(handle, controller.signal).then((actors) => {
        if (controller.signal.aborted) return;
        setSuggestions(actors.slice(0, 4));
        setSearching(false);
      });
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [handle, focused, busy]);

  const signIn = async () => {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setFocused(false);
    Keyboard.dismiss();
    setError(undefined);
    try {
      const result = await loginToComail(handle, isAddMode);
      await useAuthStore
        .getState()
        .login(result.serverUrl, result.username, result.password, {
          addAccount: isAddMode,
          comail: result.comail,
        });
      onLogin?.();
    } catch (cause) {
      if (!(cause instanceof HandoffCancelledError))
        setError(cause instanceof Error ? cause.message : 'Sign-in failed. Please try again.');
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };

  return (
    <LoginShell
      showFooter centered ambient quietRects={quietRects}
      onContentLayout={event => {
        const { width, height } = event.nativeEvent.layout;
        setAvailable(previous => previous.width === width && previous.height === height ? previous : { width, height });
      }}
      onClose={isAddMode && !busy ? onCancel : undefined}
    >
      <View style={[styles.content, compact && styles.compactContent]} onLayout={rememberRegion('content')}>
        {!short && <View style={[styles.brand, compact && styles.compactBrand]} onLayout={rememberRegion('brand')}>
          <View style={styles.brandRow}>
            <View>
              <ComailArtwork kind="wordmark-spooky" animate={animate} style={styles.wordmark} accessibilityLabel="comail" />
            </View>
            <ComailArtwork kind="spooky" animate={animate} style={[styles.logo, compact && styles.compactLogo]} />
          </View>
          <Text onLayout={rememberRegion('title')} style={[styles.title, { color: colors.text }]}>
            {isAddMode ? 'Add an account' : 'Sign in'}
          </Text>
          {!compact && <Text onLayout={rememberRegion('subtitle')} style={[styles.subtitle, { color: colors.textSecondary }]}>
            Continue with your Atmosphere account.
          </Text>}
        </View>}
        <View onLayout={rememberRegion('form')} style={[styles.form, compact && styles.compactForm]}>
          <View>
            <Input
              label="Your handle (optional)"
              accessibilityLabel="Your atproto handle"
              accessibilityHint="Type for account suggestions, or leave blank to use web sign-in."
              placeholder="you.bsky.social"
              value={handle}
              onChangeText={(value) => { setHandle(value); setError(undefined); }}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="off"
              spellCheck={false}
              keyboardType="url"
              textContentType="none"
              maxLength={253}
              editable={!busy}
              returnKeyType="go"
              style={styles.input}
              rightIcon={searching ? <ActivityIndicator color={colors.textMuted} accessibilityLabel="Finding accounts" /> : undefined}
              onSubmitEditing={() => void signIn()}
            />
            {suggestions.length > 0 && focused && !busy ? (
              <View style={[styles.suggestions, { borderColor: colors.border }]} accessibilityLabel="Account suggestions">
                {suggestions.slice(0, compact ? 1 : 4).map((actor) => (
                  <Pressable
                    key={actor.did + actor.handle}
                    accessibilityRole="button"
                    accessibilityLabel={`Use @${actor.handle}${actor.displayName ? `, ${actor.displayName}` : ''}`}
                    style={({ pressed }) => [styles.suggestion, { backgroundColor: pressed ? colors.border : colors.background }]}
                    onPress={() => {
                      setHandle(actor.handle);
                      setFocused(false);
                      setSuggestions([]);
                      Keyboard.dismiss();
                    }}
                  >
                    <Text numberOfLines={1} style={[styles.actorName, { color: colors.text }]}>
                      {actor.displayName || actor.handle}
                    </Text>
                    <Text numberOfLines={1} style={[typography.body, { color: colors.textSecondary }]}>@{actor.handle}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>
          <Button size="lg" loading={busy} disabled={busy} onPress={() => void signIn()}>
            {busy ? 'Connecting…' : 'Continue'}
          </Button>
          {error ? (
            <Text accessibilityRole="alert" style={[styles.error, { color: colors.error }]}>{error}</Text>
          ) : null}
        </View>
        {!compact && <Text onLayout={rememberRegion('hint')} style={[styles.hint, { color: colors.textMuted }]}>
          Web sign-in will bring you back here.
        </Text>}
      </View>
    </LoginShell>
  );
}

const styles = StyleSheet.create({
  content: { width: '100%', maxWidth: 420, alignSelf: 'center', gap: 24, paddingVertical: 20 },
  compactContent: { gap: 12, paddingVertical: 8 },
  compactBrand: { gap: 8, marginBottom: 0 },
  compactLogo: { width: 64, height: 64 },
  compactForm: { gap: 12 },
  brand: { gap: 16, marginBottom: 4 },
  brandRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' },
  wordmark: { width: 144, height: 46 },
  logo: { width: 168, height: 176 },
  title: { ...typography.h1 },
  subtitle: { ...typography.base, lineHeight: 23 },
  form: { gap: 20 },
  input: { fontSize: 17, minHeight: 48 },
  suggestions: { borderWidth: 1, borderRadius: 8, marginTop: 8, overflow: 'hidden' },
  suggestion: { minHeight: 54, paddingHorizontal: 12, paddingVertical: 8, gap: 2 },
  actorName: { ...typography.bodyMedium, fontSize: 15 },
  error: { ...typography.body },
  hint: { ...typography.body },
});
