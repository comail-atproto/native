import React from 'react';
import { Animated, AppState, StyleSheet, View, type GestureResponderEvent } from 'react-native';
import { useSettingsStore } from '../stores/settings-store';
import { SPOOKY_THEME_ID, getAppTheme } from '../theme/comail-themes';
import { useThemeId } from '../theme/colors';
import { useArtworkMotion } from '../theme/dynamic';
import { createLeafHaptics } from '../lib/leaf-haptics';
import { startParticleDrift } from '../lib/comail-drift';
import ComailArtwork from './ComailArtwork';
import { createParticles, particleFrame, particleTouches, type Bounds, type Rect } from '../lib/comail-particles';

const ARTWORK = { leaves: ['leaf1', 'leaf2', 'leaf3'], mail: ['mail1', 'mail2', 'mail3'] } as const;
const NO_QUIET_RECTS: Rect[] = [];

export default function ComailBackdrop({ children, quietRects = NO_QUIET_RECTS, active = true }: {
  children: React.ReactNode;
  quietRects?: Rect[];
  active?: boolean;
}) {
  const root = React.useRef<View>(null);
  const origin = React.useRef({ x: 0, y: 0 });
  const [bounds, setBounds] = React.useState<Bounds>({ width: 0, height: 0 });
  const hapticsEnabled = useSettingsStore(s => s.hapticsEnabled);
  const feedback = React.useRef(createLeafHaptics()).current;
  const themeId = useThemeId();
  const animate = useArtworkMotion(active);
  const spooky = getAppTheme(themeId).id === SPOOKY_THEME_ID;
  const artwork = spooky ? ARTWORK.leaves : ARTWORK.mail;
  const phase = React.useRef(new Animated.Value(0.27)).current;
  const currentPhase = React.useRef(0.27);
  const lastTouch = React.useRef(0);
  const particles = React.useMemo(() => createParticles(bounds), [bounds]);
  const nodes = React.useMemo(() => particles.map(() => ({ offset: new Animated.ValueXY(), interaction: undefined as Animated.CompositeAnimation | undefined })), [particles]);

  React.useEffect(() => {
    const listener = phase.addListener(({ value }) => { currentPhase.current = value; });
    const stop = animate && bounds.width > 0 ? startParticleDrift(phase) : undefined;
    return () => {
      stop?.();
      phase.removeListener(listener);
      nodes.forEach(node => { node.interaction?.stop(); node.offset.setValue({ x: 0, y: 0 }); });
    };
  }, [animate, bounds.width, nodes, phase]);

  const tracks = React.useMemo(() => particles.map(p => {
    const wrap = 1 - p.phase;
    const times = [...new Set([...Array.from({ length: 65 }, (_, i) => i / 64), wrap - 0.001, wrap, wrap + 0.001])]
      .filter(t => t >= 0 && t <= 1).sort((a, b) => a - b);
    const frames = times.map(t => particleFrame(p, t, bounds, quietRects));
    return {
      x: phase.interpolate({ inputRange: times, outputRange: frames.map(f => f.x - p.size / 2) }),
      y: phase.interpolate({ inputRange: times, outputRange: frames.map(f => f.y - p.size / 2) }),
      rotation: phase.interpolate({ inputRange: times, outputRange: frames.map(f => `${f.rotation}deg`) }),
      opacity: phase.interpolate({ inputRange: times, outputRange: frames.map(f => f.opacity) }),
    };
  }), [particles, bounds, quietRects, phase]);

  const nudge = (event: GestureResponderEvent) => {
    if (!active || AppState.currentState !== 'active' || Date.now() - lastTouch.current < 60) return;
    lastTouch.current = Date.now();
    const touch = { x: event.nativeEvent.pageX - origin.current.x, y: event.nativeEvent.pageY - origin.current.y };
    const hits = particleTouches(particles.map(p => particleFrame(p, currentPhase.current, bounds, quietRects)), touch, quietRects);
    feedback.touch(spooky ? hits[0]?.index ?? null : null, hapticsEnabled);
    hits.forEach(({ index: i, offset: target }) => {
      if (!animate) return;
      const node = nodes[i];
      node.interaction?.stop();
      node.interaction = Animated.sequence([
        Animated.spring(node.offset, { toValue: target, speed: 20, bounciness: 3, useNativeDriver: true, isInteraction: false }),
        Animated.delay(120),
        Animated.spring(node.offset, { toValue: { x: 0, y: 0 }, speed: 4, bounciness: 2, useNativeDriver: true, isInteraction: false }),
      ]);
      node.interaction.start();
    });
  };

  return (
    <View ref={root} style={styles.root}
      onLayout={event => {
        const { width, height } = event.nativeEvent.layout;
        setBounds(previous => previous.width === width && previous.height === height ? previous : { width, height });
        root.current?.measureInWindow((x, y) => { origin.current = { x, y }; });
      }}
      onTouchStart={event => { feedback.touch(null, false); lastTouch.current = 0; nudge(event); }}
      onTouchMove={nudge}
    >
      <View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={StyleSheet.absoluteFill}>
        {bounds.width > 0 && particles.map((p, i) => (
          <Animated.View key={i} style={[styles.particle, { opacity: tracks[i].opacity, transform: [{ translateX: tracks[i].x }, { translateY: tracks[i].y }] }]}>
            <Animated.View style={{ transform: [{ translateX: nodes[i].offset.x }, { translateY: nodes[i].offset.y }, { rotate: tracks[i].rotation }] }}>
              <ComailArtwork kind={artwork[p.sprite]} animate={animate} style={{ width: p.size, height: p.size }} />
            </Animated.View>
          </Animated.View>
        ))}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, overflow: 'hidden' },
  particle: { position: 'absolute', left: 0, top: 0 },
});
