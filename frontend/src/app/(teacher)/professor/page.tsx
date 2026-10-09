'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { TeacherHeader } from '@/modules/teacher/components/TeacherHeader';
import type { ReportedQuestionNotification } from '@/modules/teacher/components/TeacherHeader';
import { TeacherDashboardOverview } from '@/modules/teacher/components/TeacherDashboardOverview';
import { TeacherOnboardingWizardModal } from '@/modules/teacher/components/TeacherOnboardingWizardModal';
import { TeacherProfileService, TeacherProfile, UserInfo } from '@/modules/teacher/services/TeacherProfileService';
import { BookOpen, Loader2 } from 'lucide-react';

export default function TeacherDashboardPage() {
  const router = useRouter();
  const [teacher, setTeacher] = useState<TeacherProfile | null>(null);
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [hasProfile, setHasProfile] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [isOnboardingModalOpen, setIsOnboardingModalOpen] = useState<boolean>(false);
  const [reportedQuestions, setReportedQuestions] = useState<ReportedQuestionNotification[]>([]);

  useEffect(() => {
    async function loadTeacherProfile() {
      setLoading(true);
      try {
        const res = await TeacherProfileService.getMyProfile();
        setHasProfile(res.hasProfile);
        setTeacher(res.teacher || null);
        setUserInfo(res.user || null);

        // If the teacher has no profile in teachers table, automatically open onboarding modal
        if (!res.hasProfile) {
          setIsOnboardingModalOpen(true);
        }
      } catch (err) {
        console.warn('Erro ao carregar dados do professor:', err);
        router.replace('/?login=true&perfil=professor&session=expired');
      } finally {
        setLoading(false);
      }
    }

    loadTeacherProfile();
  }, [router]);

  const handleOnboardingSuccess = (updatedTeacher: TeacherProfile) => {
    setTeacher(updatedTeacher);
    setHasProfile(true);
  };

  return (
    <div className="min-h-screen bg-[#F5F1E8] text-[#132E20] font-sans flex flex-col selection:bg-[#2E5B37] selection:text-white">
      
      {/* Top Header */}
      <TeacherHeader
        teacher={teacher}
        user={userInfo}
        hasProfile={hasProfile}
        onOpenOnboarding={() => setIsOnboardingModalOpen(true)}
        reportedQuestions={reportedQuestions}
      />

      {/* Main Content Area */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        
        {/* Loading Spinner Screen */}
        {loading ? (
          <div className="min-h-[50vh] flex flex-col items-center justify-center space-y-4 py-16">
            <div className="p-8 rounded-3xl bg-white border border-slate-200 shadow-md flex flex-col items-center space-y-4 text-center max-w-sm w-full">
              <Loader2 className="w-10 h-10 text-[#132E20] animate-spin" />
              <div>
                <h3 className="text-base font-bold text-[#0F2942]">Carregando seu painel...</h3>
                <p className="text-xs text-slate-500 mt-1">Buscando informações do seu perfil e monitores.</p>
              </div>
            </div>
          </div>
        ) : (
          /* Dashboard Main Overview (inclui banner de onboarding quando pendente) */
          <TeacherDashboardOverview
            teacher={teacher}
            hasProfile={hasProfile}
            onOpenOnboarding={() => setIsOnboardingModalOpen(true)}
            onReportedQuestionsChange={setReportedQuestions}
          />
        )}

      </main>

      {/* Interactive Onboarding Wizard Modal */}
      <TeacherOnboardingWizardModal
        isOpen={isOnboardingModalOpen}
        onClose={() => setIsOnboardingModalOpen(false)}
        onSuccess={handleOnboardingSuccess}
        user={userInfo}
      />

      {/* Subtle Footer */}
      <footer className="w-full py-6 border-t border-slate-300/60 text-center text-xs text-slate-500 mt-auto">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center space-x-2">
            <BookOpen className="w-4 h-4 text-[#2E5B37]" />
            <span className="font-semibold text-[#132E20]">MeuMonitor AI</span>
            <span>— Plataforma Operacional do Professor</span>
          </div>
          <p>© {new Date().getFullYear()} MeuMonitor AI. Todos os direitos reservados.</p>
        </div>
      </footer>

    </div>
  );
};
