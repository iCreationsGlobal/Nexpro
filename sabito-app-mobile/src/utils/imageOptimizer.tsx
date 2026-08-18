/**
 * Image Optimizer Utility
 * Provides optimized Image component with caching and lazy loading
 */

import React from 'react';
import { Image, ImageProps } from 'expo-image';
import { StyleProp, ImageStyle } from 'react-native';

export interface OptimizedImageProps extends Omit<ImageProps, 'source' | 'style'> {
  source: { uri: string } | number;
  style?: StyleProp<ImageStyle>;
}

/**
 * Optimized Image component with built-in caching and lazy loading
 */
export const OptimizedImage: React.FC<OptimizedImageProps> = ({ source, style, ...props }) => {
  return (
    <Image
      source={source}
      style={style}
      contentFit="cover"
      transition={200}
      cachePolicy="memory-disk"
      placeholder={{ blurhash: 'L6PZfSi_.AyE_3t7t7R**0o#DgR4' }}
      recyclingKey={typeof source === 'object' && 'uri' in source ? source.uri : undefined}
      {...props}
    />
  );
};

export default OptimizedImage;





