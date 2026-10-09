'use client';

import Image, { type ImageProps } from 'next/image';

type OptimizedImageProps = Omit<ImageProps, 'src' | 'alt'> & {
  src?: string | null;
  alt?: string;
};

export function OptimizedImage({ src, alt = '', width = 1000, height = 1000, ...props }: OptimizedImageProps) {
  if (!src) return null;

  return (
    <Image
      {...props}
      src={src}
      alt={alt}
      width={width}
      height={height}
      unoptimized={src.startsWith('data:') || props.unoptimized}
    />
  );
}
