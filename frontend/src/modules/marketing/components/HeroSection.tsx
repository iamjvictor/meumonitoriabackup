import React from 'react';
import Image from 'next/image';
import { BookOpen, ArrowRight, ChevronDown } from 'lucide-react';
import { ScrollRevealSection } from './ScrollRevealSection';

interface HeroSectionProps {
  onStartRegistration: () => void;
}

export const HeroSection: React.FC<HeroSectionProps> = ({ onStartRegistration }) => {
  return (
    <ScrollRevealSection id="hero" className="pt-20 sm:pt-24 pb-8 sm:pb-12 overflow-hidden flex flex-col justify-between relative bg-[#F5F1E8] px-3 sm:px-6 lg:px-8">
      
      <div className="max-w-7xl mx-auto w-full relative z-10 my-auto">
        
        {/* Moldura de Madeira */}
        <div className="relative rounded-2xl sm:rounded-[2.5rem] p-3 sm:p-5 lg:p-6 bg-gradient-to-br from-[#965A2C] via-[#B5753C] to-[#6E3B15] shadow-[0_25px_60px_-15px_rgba(0,0,0,0.6),_inset_0_2px_4px_rgba(255,255,255,0.4)] border border-[#5C3317]">
          
          <div className="p-1 sm:p-1.5 bg-[#4A250D] rounded-xl sm:rounded-[1.75rem] shadow-inner">
            
            <div className="relative rounded-lg sm:rounded-2xl bg-gradient-to-br from-[#244E2B] via-[#1B3C21] to-[#122916] overflow-hidden p-5 sm:p-8 lg:p-10 text-white shadow-[inset_0_4px_20px_rgba(0,0,0,0.7)]">
              
              <div 
                className="absolute inset-0 pointer-events-none opacity-[0.12] z-0" 
                style={{
                  backgroundImage: `
                    linear-gradient(to right, rgba(255, 255, 255, 0.4) 1px, transparent 1px),
                    linear-gradient(to bottom, rgba(255, 255, 255, 0.4) 1px, transparent 1px)
                  `,
                  backgroundSize: '36px 36px'
                }}
              />

              <div className="relative z-10">
                <div className="lg:hidden">
                  <h1 className="font-chalk text-4xl sm:text-5xl mb-3 leading-[1.12] tracking-normal text-left">
                    <span className="block text-white">Crie sua monitor<span className="text-[#86EFAC]">IA</span>.</span>
                  </h1>
                  <p
                    style={{ fontFamily: "'Caveat', cursive", fontWeight: 700 }}
                    className="font-handwriting text-lg sm:text-2xl text-[#F5F1E8] text-left leading-relaxed font-bold tracking-normal"
                  >
                    Transforme seus materiais em um assistente de estudos com IA e tenha receita recorrente com seus alunos, sem se preocupar com tecnologia.
                  </p>
                </div>

                <div className="hidden lg:grid lg:grid-cols-12 gap-8 lg:gap-10 items-center">
                
                <div className="lg:col-span-6 text-left flex flex-col justify-center">
                  
                  <h1 className="font-chalk text-4xl sm:text-5xl lg:text-6xl mb-4 leading-[1.12] tracking-normal text-left">
                    <span className="block text-white">
                      Crie sua monitor<span className="text-[#86EFAC]">IA</span>.
                    </span>
                    <span className="block text-[#F5F1E8]/90">Venda seu produto.</span>
                    <span className="block text-[#86EFAC]">Ganhe todo mês.</span>
                  </h1>

                  <p 
                    style={{ fontFamily: "'Caveat', cursive", fontWeight: 700 }}
                    className="font-handwriting text-lg sm:text-2xl lg:text-3xl text-[#F5F1E8] mb-6 max-w-lg text-left leading-relaxed font-bold tracking-normal"
                  >
                    Transforme seus materiais em um assistente de estudos com IA e tenha receita recorrente com seus alunos, sem se preocupar com tecnologia.
                  </p>

                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-start gap-3.5">
                    <button
                      onClick={onStartRegistration}
                      className="px-6 py-3.5 rounded-xl font-bold text-xs sm:text-sm text-[#143018] bg-[#F5F1E8] hover:bg-white shadow-lg shadow-black/20 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] inline-flex items-center justify-center group"
                    >
                      <BookOpen className="w-4 h-4 mr-2 text-[#1B3C21]" />
                      <span>Quero criar meu assistente</span>
                      <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform text-[#1B3C21]" />
                    </button>

                    <a
                      href="#o-que-somos"
                      className="px-6 py-3.5 rounded-xl font-bold text-xs sm:text-sm text-white bg-white/10 hover:bg-white/20 border border-white/25 backdrop-blur-md transition-all inline-flex items-center justify-center shadow-sm"
                    >
                      <span>Ver como funciona na prática</span>
                    </a>
                  </div>

                </div>

                <div className="lg:col-span-6 relative mt-4 lg:mt-0 flex items-center justify-center">
                  <div className="relative mx-auto w-full max-w-xl lg:max-w-none transition-transform duration-300">
                    <div className="relative group">
                      <Image
                        src="/hero-image.png"
                        alt="Plataforma de Estudos com IA MeuMonitor AI"
                        width={1280}
                        height={720}
                        priority
                        className="w-full h-auto object-contain drop-shadow-2xl hover:scale-[1.02] transition-transform duration-300"
                      />
                    </div>
                  </div>
                </div>

                </div>
              </div>
            </div>

          </div>

          <div className="mt-4 lg:mt-2.5 sm:mt-3 h-5 sm:h-7 bg-gradient-to-r from-[#7A3E18] via-[#B5753C] to-[#683313] border-t-2 border-[#D98E4A] border-b border-[#3D1A07] shadow-xl rounded-md relative flex items-center justify-end px-4 sm:px-8 space-x-3">
            
            <div className="w-9 sm:w-14 h-3 sm:h-4 bg-gradient-to-b from-[#8A4E23] to-[#54280E] rounded-xs border-b-2 border-amber-950 shadow-md flex items-center justify-center">
              <div className="w-full h-1 bg-[#3A1B09] opacity-70" />
            </div>

            <div className="w-7 sm:w-11 h-2 sm:h-2.5 bg-gradient-to-r from-slate-100 via-white to-slate-200 rounded-full shadow-md transform -rotate-3 border border-slate-300/60" />
          </div>

        </div>

      </div>

      <div className="lg:hidden max-w-7xl mx-auto w-full relative z-10 flex flex-col gap-3 px-2 pt-4">
        <div className="relative mx-auto w-full max-w-md">
          <Image
            src="/hero-image.png"
            alt="Plataforma de Estudos com IA MeuMonitor AI"
            width={1280}
            height={720}
            priority
            className="w-full h-auto object-contain drop-shadow-xl"
          />
        </div>
        <button
          onClick={onStartRegistration}
          className="w-full px-5 py-3.5 rounded-xl font-bold text-sm text-[#143018] bg-[#F5F1E8] hover:bg-white shadow-lg shadow-black/20 transition-colors inline-flex items-center justify-center"
        >
          <BookOpen className="w-4 h-4 mr-2 text-[#1B3C21]" />
          <span>Quero criar meu assistente</span>
          <ArrowRight className="w-4 h-4 ml-2 text-[#1B3C21]" />
        </button>
        <a
          href="#o-que-somos"
          className="w-full px-5 py-3.5 rounded-xl font-bold text-sm text-[#143018] bg-white/70 border border-[#1B3C21]/20 transition-colors inline-flex items-center justify-center"
        >
          Ver como funciona na prática
        </a>
      </div>

      <div className="flex justify-center pb-1 pt-6 text-[#143018]/70 z-10 animate-bounce">
        <a href="#o-que-somos" className="flex flex-col items-center text-xs hover:text-[#1B3C21] transition-colors font-semibold">
          <span>Ver estrutura</span>
          <ChevronDown className="w-4 h-4 mt-1" />
        </a>
      </div>
    </ScrollRevealSection>
  );
};
