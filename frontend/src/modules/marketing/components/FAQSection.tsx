'use client';

import React from 'react';
import { ArrowRight } from 'lucide-react';
import { ScrollRevealSection } from './ScrollRevealSection';

interface FAQSectionProps {
  onStartRegistration: () => void;
}

export const FAQSection: React.FC<FAQSectionProps> = ({ onStartRegistration }) => {
  return (
    <ScrollRevealSection id="faq" className="py-16 flex flex-col justify-center bg-[#EFEAE1]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
        {/* Final Registration CTA */}
        <div className="glass-panel p-8 sm:p-12 rounded-3xl border border-slate-200 bg-white text-center max-w-3xl mx-auto shadow-md">
          <h3 className="font-heading text-2xl sm:text-3xl font-extrabold text-[#0F2942] mb-3">
            Pronto para criar seu assistente com IA?
          </h3>
          <p className="text-slate-600 text-sm sm:text-base mb-6 font-medium">
            Junte-se aos professores que já estão transformando seus materiais em receita recorrente.
          </p>
          <button
            onClick={onStartRegistration}
            className="px-8 py-3.5 rounded-xl font-bold text-sm text-white bg-gradient-to-r from-[#0F2942] via-[#1E3A8A] to-[#2E5B37] hover:from-[#172554] hover:to-[#1E4620] shadow-lg shadow-[#0F2942]/20 transition-all inline-flex items-center space-x-2"
          >
            <span>Criar Meu Assistente Agora</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </ScrollRevealSection>
  );
};
