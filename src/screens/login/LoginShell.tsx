import React from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  type LayoutChangeEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import { ArrowLeft, X } from '../../components/icons';
import { spacing, typography, componentSizes, type ThemePalette } from '../../theme/tokens';
import { useColors } from '../../theme/colors';
import ComailBackdrop from '../../components/ComailBackdrop';
import type { Rect } from '../../lib/comail-particles';
import { useLocaleStore } from '../../stores/locale-store';

const APP_VERSION = Constants.expoConfig?.version ?? '0.0.0';

interface LoginShellProps {
  children: React.ReactNode;
  /** Renders a back chevron. Omit on the first step of the flow. */
  onBack?: () => void;
  /** Renders a close X on the right — add-account mode only. */
  onClose?: () => void;
  /** Vertically centres the content instead of stacking from the top. */
  centered?: boolean;
  showFooter?: boolean;
  ambient?: boolean;
  quietRects?: Rect[];
  onContentLayout?: (event: LayoutChangeEvent) => void;
}

/**
 * Shared chrome for every sign-in step: safe area, keyboard avoidance, the
 * back/close affordances, and the version footer. Steps supply only their own
 * content so they all sit on the same grid.
 */
export default function LoginShell({
  children,
  onBack,
  onClose,
  centered = false,
  showFooter = false,
  ambient = false,
  quietRects,
  onContentLayout,
}: LoginShellProps) {
  const c = useColors();
  const styles = React.useMemo(() => makeStyles(c), [c]);
  const t = useLocaleStore((s) => s.t);
  const [content, setContent] = React.useState({ x: 0, y: 0 });
  const headerHeight = onBack || onClose ? componentSizes.headerHeight : 0;
  const regions = React.useMemo(() => quietRects?.map(rect => ({
    ...rect,
    x: rect.x + content.x,
    y: rect.y + content.y + headerHeight,
  })), [quietRects, content, headerHeight]);

  const body = (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.flex}
    >
      {headerHeight > 0 && <View style={styles.header}>
        {onBack ? (
          <Pressable
            onPress={onBack}
            hitSlop={12}
            style={styles.headerButton}
            accessibilityRole="button"
            accessibilityLabel={t('common.back', 'Back')}
          >
            <ArrowLeft size={22} color={c.textSecondary} />
          </Pressable>
        ) : (
          <View style={styles.headerButton} />
        )}
        {onClose ? (
          <Pressable
            onPress={onClose}
            hitSlop={12}
            style={styles.headerButton}
            accessibilityRole="button"
            accessibilityLabel={t('common.close', 'Close')}
          >
            <X size={22} color={c.textSecondary} />
          </Pressable>
        ) : (
          <View style={styles.headerButton} />
        )}
      </View>}

      <View style={[styles.content, centered && styles.contentCentered]} onLayout={onContentLayout}>
        <View onLayout={event => { const { x, y } = event.nativeEvent.layout; setContent(previous => previous.x === x && previous.y === y ? previous : { x, y }); }}>
          {children}
        </View>
      </View>

      {showFooter ? (
        <View style={styles.footer}>
          <Text style={styles.footerText}>Comail v{APP_VERSION}</Text>
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
  return (
    <SafeAreaView style={styles.container}>
      {ambient ? <ComailBackdrop quietRects={regions}>{body}</ComailBackdrop> : body}
    </SafeAreaView>
  );
}

function makeStyles(c: ThemePalette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    flex: { flex: 1 },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.lg,
      height: componentSizes.headerHeight,
    },
    headerButton: { width: componentSizes.buttonLg, height: componentSizes.buttonLg, alignItems: 'center', justifyContent: 'center' },
    // One readable column, centred on a tablet or a phone in landscape.
    content: {
      flex: 1,
      width: '100%',
      maxWidth: 480 + spacing.lg * 2,
      alignSelf: 'center',
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.xxxl,
    },
    contentCentered: { justifyContent: 'center' },
    footer: { alignItems: 'center', paddingBottom: spacing.lg, gap: spacing.xs },
    footerText: { ...typography.caption, color: c.textMuted },
  });
}
