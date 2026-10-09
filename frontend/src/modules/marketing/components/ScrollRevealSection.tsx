'use client';
/* eslint-disable react-hooks/set-state-in-effect -- Observer callbacks update visibility from browser events. */

import React, { useEffect, useRef, useState } from 'react';

interface ScrollRevealSectionProps {
  children: React.ReactNode;
  id: string;
  className?: string;
}

export const ScrollRevealSection: React.FC<ScrollRevealSectionProps> = ({
  children,
  id,
  className = '',
}) => {
  const sectionRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const currentEl = sectionRef.current;
    if (!currentEl) return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (reducedMotion.matches) {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.unobserve(entry.target);
        }
      },
      {
        root: null, // observe viewport relative to window
        rootMargin: '100px 0px 100px 0px', // trigger before entering viewport
        threshold: 0.01, // trigger as soon as 1% is near/in viewport
      }
    );

    observer.observe(currentEl);

    // Safety fallback: reveal after 400ms regardless to prevent stuck hidden states
    const timer = setTimeout(() => {
      setIsVisible(true);
    }, 400);

    return () => {
      observer.disconnect();
      clearTimeout(timer);
    };
  }, []);

  return (
    <div
      ref={sectionRef}
      id={id}
      data-reveal-state={isVisible ? 'visible' : 'hidden'}
      className={`snap-section scroll-reveal ${className}`}
    >
      {children}
    </div>
  );
};
