'use client';
/* eslint-disable react-hooks/set-state-in-effect -- sincroniza o query param legado de login com o modal. */

import dynamic from 'next/dynamic';
import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Navbar } from '@/modules/marketing/components/Navbar';
import { LoginModal as LoginModalComponent } from '@/modules/marketing/components/LoginModal';
import { TeacherRegistrationModal as TeacherRegistrationModalComponent } from '@/modules/marketing/components/TeacherRegistrationModal';
import { HeroSection } from '@/modules/marketing/components/HeroSection';
import { WhatWeAreSection } from '@/modules/marketing/components/WhatWeAreSection';
import { FocusOnTeachingSection } from '@/modules/marketing/components/FocusOnTeachingSection';
import { HowItWorks } from '@/modules/marketing/components/HowItWorks';
import { FAQSection } from '@/modules/marketing/components/FAQSection';
import { Footer } from '@/modules/marketing/components/Footer';
import { SectionDotsNav } from '@/modules/marketing/components/SectionDotsNav';

const ModalLoading = () => null;
const TeacherRegistrationModal = dynamic(
  () => import('@/modules/marketing/components/TeacherRegistrationModal').then((mod) => mod.TeacherRegistrationModal),
  { ssr: false, loading: ModalLoading },
);
const LoginModal = dynamic(
  () => import('@/modules/marketing/components/LoginModal').then((mod) => mod.LoginModal),
  { ssr: false, loading: ModalLoading },
);
// Keep the lazy boundaries available for routes that opt into them while the
// landing shell renders the interactive modal synchronously after hydration.
void TeacherRegistrationModal;
void LoginModal;

function HomeContent() {
  const searchParams = useSearchParams();
  const shouldOpenLogin = searchParams.get('login') === 'true' || searchParams.get('login') === '1';
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState<boolean>(false);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState<boolean>(shouldOpenLogin);

  useEffect(() => {
    if (shouldOpenLogin) {
      setIsLoginModalOpen(true);
    }
  }, [searchParams, shouldOpenLogin]);

  const handleOpenRegister = () => {
    setIsRegisterModalOpen(true);
    setIsLoginModalOpen(false);
  };

  const handleCloseRegister = () => {
    setIsRegisterModalOpen(false);
  };

  const handleOpenLogin = () => {
    setIsLoginModalOpen(true);
    setIsRegisterModalOpen(false);
  };

  const handleCloseLogin = () => {
    setIsLoginModalOpen(false);
  };

  return (
    <div className="min-h-screen w-full bg-[#F5F1E8] text-[#0F2942] font-sans selection:bg-[#2E5B37] selection:text-white relative">
      {/* Top Fixed Navigation Bar */}
      <Navbar onOpenRegister={handleOpenRegister} onOpenLogin={handleOpenLogin} />

      {/* Floating Section Indicators */}
      <SectionDotsNav />

      {/* Main Sections Container */}
      <main className="w-full">
        {/* Seção 1: Hero Section */}
        <HeroSection onStartRegistration={handleOpenRegister} />

        {/* Seção 1.5: O que somos? (Dividida para Professor e Aluno) */}
        <WhatWeAreSection onStartRegistration={handleOpenRegister} />

        {/* Seção 3: Como funciona na prática */}
        <HowItWorks />

        {/* Seção 4: Parceria para Educação */}
        <FocusOnTeachingSection onStartRegistration={handleOpenRegister} />

        {/* Seção 5: Chamada Final Cadastro Professor */}
        <FAQSection onStartRegistration={handleOpenRegister} />

        {/* Seção 6: Footer / Fechamento */}
        <Footer onOpenRegister={handleOpenRegister} />
      </main>

      {/* Teacher Multi-Step Registration Wizard Modal */}
      <TeacherRegistrationModalComponent
        isOpen={isRegisterModalOpen}
        onClose={handleCloseRegister}
      />

      {/* Login Modal */}
      <LoginModalComponent
        isOpen={isLoginModalOpen}
        onClose={handleCloseLogin}
        onSwitchToRegister={handleOpenRegister}
      />
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#F5F1E8]" />}>
      <HomeContent />
    </Suspense>
  );
}
