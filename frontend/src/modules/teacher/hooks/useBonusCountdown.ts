'use client';

import { useState, useEffect } from 'react';

export interface BonusTimeLeft {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

export function useBonusCountdown(): BonusTimeLeft {
  const [timeLeft, setTimeLeft] = useState<BonusTimeLeft>({
    days: 6,
    hours: 23,
    minutes: 59,
    seconds: 59,
  });

  useEffect(() => {
    let targetTime: number;
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('mm_teacher_bonus_end_time');
      if (stored) {
        targetTime = parseInt(stored, 10);
      } else {
        // Set default bonus expiration to 7 days from now
        targetTime = Date.now() + 7 * 24 * 60 * 60 * 1000;
        localStorage.setItem('mm_teacher_bonus_end_time', targetTime.toString());
      }
    } else {
      targetTime = Date.now() + 7 * 24 * 60 * 60 * 1000;
    }

    const updateTimer = () => {
      const now = Date.now();
      const diff = Math.max(0, targetTime - now);
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
      const minutes = Math.floor((diff / (1000 * 60)) % 60);
      const seconds = Math.floor((diff / 1000) % 60);
      setTimeLeft({ days, hours, minutes, seconds });
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, []);

  return timeLeft;
}
