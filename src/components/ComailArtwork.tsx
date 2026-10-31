import React from 'react';
import { Image, type ImageProps } from 'expo-image';

const ARTWORK = {
  cammie: { still: require('../../assets/comail/wiggle/cammie.png'), animated: require('../../assets/comail/wiggle/cammie.webp') },
  spooky: { still: require('../../assets/comail/wiggle/spooky.png'), animated: require('../../assets/comail/wiggle/spooky.webp') },
  leaf1: { still: require('../../assets/comail/wiggle/leaf1.png'), animated: require('../../assets/comail/wiggle/leaf1.webp') },
  leaf2: { still: require('../../assets/comail/wiggle/leaf2.png'), animated: require('../../assets/comail/wiggle/leaf2.webp') },
  leaf3: { still: require('../../assets/comail/wiggle/leaf3.png'), animated: require('../../assets/comail/wiggle/leaf3.webp') },
  mail1: { still: require('../../assets/comail/wiggle/mail1.png'), animated: require('../../assets/comail/wiggle/mail1.webp') },
  mail2: { still: require('../../assets/comail/wiggle/mail2.png'), animated: require('../../assets/comail/wiggle/mail2.webp') },
  mail3: { still: require('../../assets/comail/wiggle/mail3.png'), animated: require('../../assets/comail/wiggle/mail3.webp') },
  'wordmark-light': { still: require('../../assets/comail/wiggle/wordmark-light.png'), animated: require('../../assets/comail/wiggle/wordmark-light.webp') },
  'wordmark-dark': { still: require('../../assets/comail/wiggle/wordmark-dark.png'), animated: require('../../assets/comail/wiggle/wordmark-dark.webp') },
  'wordmark-spooky': { still: require('../../assets/comail/wiggle/wordmark-spooky.png'), animated: require('../../assets/comail/wiggle/wordmark-spooky.webp') },
} as const;

export type ComailArtworkKind = keyof typeof ARTWORK;

export default function ComailArtwork({ kind, animate, style, accessibilityLabel }: {
  kind: ComailArtworkKind;
  animate: boolean;
} & Pick<ImageProps, 'style' | 'accessibilityLabel'>) {
  const artwork = ARTWORK[kind];
  return <Image source={animate ? artwork.animated : artwork.still} autoplay={animate}
    contentFit="contain" transition={0} style={style} accessibilityLabel={accessibilityLabel} accessible={!!accessibilityLabel} />;
}
