'use client';

import { StudentNavbar } from '@/components/student-landing/StudentNavbar';
import { StudentHeroSection } from '@/components/student-landing/StudentHeroSection';
import { StudentFeaturesSection } from '@/components/student-landing/StudentFeaturesSection';
import { StudentFAQSection } from '@/components/student-landing/StudentFAQSection';
import { StudentFooter } from '@/components/student-landing/StudentFooter';

export default function StudentLandingPage() {
  return (
    <div className="h-screen w-screen overflow-hidden bg-slate-950 text-slate-100 font-sans selection:bg-emerald-500 selection:text-slate-950">
      {/* Navbar do Aluno */}
      <StudentNavbar />

      {/* Full Screen Snap Scroll Container */}
      <div className="snap-container h-full w-full">
        {/* Section 1: Hero do Aluno & Busca por Link do Professor */}
        <StudentHeroSection />

        {/* Section 2: Recursos Principais do Aluno */}
        <StudentFeaturesSection />

        {/* Section 3: FAQ do Aluno */}
        <StudentFAQSection />

        {/* Section 4: Rodapé */}
        <StudentFooter />
      </div>
    </div>
  );
}
