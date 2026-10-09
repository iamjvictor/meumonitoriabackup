'use client';

import React, { useState, useEffect } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';

const SECTIONS = [
  { id: 'hero', label: '1. Hero' },
  { id: 'o-que-somos', label: '2. O que Somos' },
  { id: 'como-funciona', label: '3. Como Funciona' },
  { id: 'foco-ensinar', label: '4. Parceria para Educação' },
  { id: 'faq', label: '5. Cadastro' },
  { id: 'footer', label: '6. Rodapé' },
];

export const SectionDotsNav: React.FC = () => {
  const [activeSection, setActiveSection] = useState<string>('hero');
  const [currentIndex, setCurrentIndex] = useState<number>(0);

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      const navbarHeight = 70;
      const y = el.getBoundingClientRect().top + window.scrollY - (id === 'hero' ? 0 : navbarHeight);
      window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
    }
  };

  useEffect(() => {
    const handleScroll = () => {
      const viewportHeight = window.innerHeight;
      const triggerPoint = viewportHeight * 0.4;

      let closestIndex = 0;
      let minDistance = Infinity;

      SECTIONS.forEach((sec, idx) => {
        const el = document.getElementById(sec.id);
        if (el) {
          const rect = el.getBoundingClientRect();
          const distance = Math.abs(rect.top - triggerPoint);
          
          // Check if section is overlapping the middle threshold
          if (rect.top <= viewportHeight * 0.7 && rect.bottom >= viewportHeight * 0.15) {
            if (distance < minDistance) {
              minDistance = distance;
              closestIndex = idx;
            }
          }
        }
      });

      if (SECTIONS[closestIndex]) {
        setActiveSection(SECTIONS[closestIndex].id);
        setCurrentIndex(closestIndex);
      }
    };

    // Keyboard Arrow & Page Navigation
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }

      if (e.key === 'ArrowDown' || e.key === 'PageDown') {
        if (currentIndex < SECTIONS.length - 1) {
          e.preventDefault();
          scrollToSection(SECTIONS[currentIndex + 1].id);
        }
      } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
        if (currentIndex > 0) {
          e.preventDefault();
          scrollToSection(SECTIONS[currentIndex - 1].id);
        }
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('keydown', handleKeyDown);

    handleScroll();

    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [currentIndex]);

  return (
    <div className="fixed right-4 top-1/2 -translate-y-1/2 z-40 hidden lg:flex flex-col items-center space-y-3">
      {/* Scroll Up Button */}
      {currentIndex > 0 && (
        <button
          onClick={() => scrollToSection(SECTIONS[currentIndex - 1].id)}
          className="p-1.5 rounded-full bg-[#0F2942] text-white hover:bg-[#2E5B37] transition-all shadow-md hover:scale-110 active:scale-95"
          title="Seção Anterior"
        >
          <ChevronUp className="w-3.5 h-3.5" />
        </button>
      )}

      {/* Section Dots */}
      <div className="flex flex-col space-y-2.5 p-1.5 bg-white/80 backdrop-blur-md rounded-full border border-[#0F2942]/10 shadow-lg">
        {SECTIONS.map((sec, _idx) => {
          const isActive = activeSection === sec.id;
          return (
            <button
              key={sec.id}
              onClick={() => scrollToSection(sec.id)}
              className="group relative flex items-center justify-center p-1 focus:outline-none"
              title={sec.label}
            >
              {/* Tooltip on hover */}
              <span className="absolute right-8 px-2.5 py-1 rounded-lg bg-[#0F2942] text-[10px] font-semibold text-white opacity-0 group-hover:opacity-100 transition-all duration-200 whitespace-nowrap pointer-events-none shadow-lg">
                {sec.label}
              </span>

              {/* Indicator Dot */}
              <div
                className={`transition-all duration-300 rounded-full ${
                  isActive
                    ? 'w-3 h-3 bg-[#2E5B37] scale-125 ring-4 ring-[#2E5B37]/30 shadow-md'
                    : 'w-2 h-2 bg-[#0F2942]/40 hover:bg-[#0F2942] hover:scale-110'
                }`}
              />
            </button>
          );
        })}
      </div>

      {/* Scroll Down Button */}
      {currentIndex < SECTIONS.length - 1 && (
        <button
          onClick={() => scrollToSection(SECTIONS[currentIndex + 1].id)}
          className="p-1.5 rounded-full bg-[#0F2942] text-white hover:bg-[#2E5B37] transition-all shadow-md hover:scale-110 active:scale-95"
          title="Próxima Seção"
        >
          <ChevronDown className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
};
