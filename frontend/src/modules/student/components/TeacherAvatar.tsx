'use client';
import { OptimizedImage } from '@/shared';

import React, { useState } from 'react';

interface TeacherAvatarProps {
  src?: string | null;
  alt?: string;
  initials: string;
  sizeClassName?: string;
  className?: string;
}

export function TeacherAvatar({
  src,
  alt = 'Professor',
  initials,
  sizeClassName = 'h-12 w-12',
  className = '',
}: TeacherAvatarProps) {
  const [hasError, setHasError] = useState(false);

  if (src && !hasError) {
    return (
      <OptimizedImage
        src={src}
        alt={alt}
        className={`${sizeClassName} rounded-full object-cover border-2 border-white shadow-md bg-[#0F2942] ${className}`}
        onError={() => setHasError(true)}
      />
    );
  }

  return (
    <div
      className={`${sizeClassName} flex items-center justify-center rounded-full border-2 border-white bg-[#0F2942] font-bold text-white shadow-md shrink-0 ${className}`}
    >
      {initials}
    </div>
  );
}
