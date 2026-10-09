'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { AUTH_REQUIRED_EVENT } from './SessionAuthInterceptor';

const LoginModal = dynamic(
  () => import('@/modules/marketing/components/LoginModal').then((module) => module.LoginModal),
  { ssr: false },
);

export function SessionLoginModal() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const openLogin = () => setIsOpen(true);
    window.addEventListener(AUTH_REQUIRED_EVENT, openLogin);
    return () => window.removeEventListener(AUTH_REQUIRED_EVENT, openLogin);
  }, []);

  return (
    <LoginModal
      isOpen={isOpen}
      onClose={() => setIsOpen(false)}
    />
  );
}
