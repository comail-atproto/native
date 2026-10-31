import React from 'react';
import { useIsFocused } from '@react-navigation/native';
import { StyleSheet, View } from 'react-native';
import ComailBackdrop from './ComailBackdrop';
import ComailArtwork from './ComailArtwork';
import { useArtworkMotion } from '../theme/dynamic';

export default function ComailEmptyArtwork() {
  const focused = useIsFocused();
  const animate = useArtworkMotion(focused);
  return (
    <View style={styles.artwork} accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <ComailBackdrop active={focused}>
        <View style={styles.mascot} pointerEvents="none">
          <ComailArtwork kind="cammie" animate={animate} style={styles.image} />
        </View>
      </ComailBackdrop>
    </View>
  );
}

const styles = StyleSheet.create({
  artwork: { width: 280, maxWidth: '100%', height: 180, marginBottom: 16 },
  mascot: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  image: { width: 116, height: 116 },
});
