import { Animated, Easing } from 'react-native';

const DURATION = 36000;

// Finish the visible cycle before entering the native loop. Resetting to zero
// at mount/resume makes the whole particle field drop to a different position.
export function startParticleDrift(phase: Animated.Value): () => void {
  let disposed = false;
  let tail: Animated.CompositeAnimation | undefined;
  let loop: Animated.CompositeAnimation | undefined;
  const timing = (duration: number) => Animated.timing(phase, {
    toValue: 1, duration, easing: Easing.linear, useNativeDriver: true, isInteraction: false,
  });
  phase.stopAnimation(value => {
    if (disposed) return;
    tail = timing(Math.max(1, (1 - value) * DURATION));
    tail.start(({ finished }) => {
      if (!finished || disposed) return;
      // Progress 1 and 0 have the same rendered positions at the loop seam.
      phase.setValue(0);
      loop = Animated.loop(timing(DURATION));
      loop.start();
    });
  });
  return () => {
    disposed = true;
    tail?.stop();
    loop?.stop();
    phase.stopAnimation();
  };
}
