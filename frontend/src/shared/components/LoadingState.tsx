'use client';

import React from 'react';
import { Loader2, type LucideIcon } from 'lucide-react';

export interface LoadingStateProps {
  /**
   * Mensagem principal exibida no estado de carregamento.
   * @default 'Carregando...'
   */
  message?: string;
  /**
   * Descrição secundária ou instrução opcional.
   */
  description?: string;
  /**
   * Estilo e layout do container de carregamento:
   * - 'page': Bloco principal de página (dentro da área com cabeçalho/sidebar).
   * - 'fullscreen': Ocupa a tela inteira (ótimo para guards de autenticação).
   * - 'card': Para seções menores ou dentro de tabelas/cards.
   * - 'inline': Loader compacto horizontal (para barras laterais, cabeçalhos, rodapés).
   * @default 'page'
   */
  variant?: 'page' | 'fullscreen' | 'card' | 'inline';
  /**
   * Tamanho do spinner / ícone.
   * @default 'md'
   */
  size?: 'sm' | 'md' | 'lg';
  /**
   * Ícone customizado opcional. Padrão: Loader2 animado.
   */
  icon?: LucideIcon;
  /**
   * Classes extras para estilização do container.
   */
  className?: string;
}

const sizeConfig = {
  sm: {
    spinner: 'h-4 w-4',
    badge: 'h-8 w-8 rounded-xl',
    title: 'text-xs',
    desc: 'text-[11px]',
  },
  md: {
    spinner: 'h-6 w-6',
    badge: 'h-12 w-12 rounded-2xl',
    title: 'text-sm sm:text-base',
    desc: 'text-xs',
  },
  lg: {
    spinner: 'h-8 w-8',
    badge: 'h-16 w-16 rounded-[22px]',
    title: 'text-base sm:text-lg',
    desc: 'text-xs sm:text-sm',
  },
};

export function LoadingState({
  message = 'Carregando...',
  description,
  variant = 'page',
  size = 'md',
  icon: CustomIcon,
  className = '',
}: LoadingStateProps) {
  const currentSize = sizeConfig[size] || sizeConfig.md;
  const IconComponent = CustomIcon || Loader2;

  if (variant === 'inline') {
    return (
      <div
        role="status"
        aria-live="polite"
        className={`flex items-center gap-2.5 text-[#0F2942]/70 ${className}`}
      >
        <IconComponent
          className={`${currentSize.spinner} animate-spin text-[#2E5B37] shrink-0`}
          aria-hidden="true"
        />
        <span className={`font-semibold ${currentSize.title} text-[#0F2942]`}>
          {message}
        </span>
        <span className="sr-only">Carregando dados</span>
      </div>
    );
  }

  const spinnerBadge = (
    <div className="relative flex items-center justify-center">
      {/* Halo de pulso sutil da marca */}
      <span className="absolute -inset-1 rounded-full bg-[#2E5B37]/10 animate-ping opacity-75" />
      <div
        className={`relative flex items-center justify-center bg-[#2E5B37]/10 border border-[#2E5B37]/20 shadow-xs ${currentSize.badge}`}
      >
        <IconComponent
          className={`${currentSize.spinner} animate-spin text-[#2E5B37]`}
          aria-hidden="true"
        />
      </div>
    </div>
  );

  const textContent = (
    <div className="mt-4 flex flex-col items-center text-center">
      <h3 className={`font-heading font-bold text-[#0F2942] ${currentSize.title}`}>
        {message}
      </h3>
      {description && (
        <p className={`mt-1.5 max-w-md text-[#0F2942]/60 leading-relaxed ${currentSize.desc}`}>
          {description}
        </p>
      )}
      <span className="sr-only">Carregando dados</span>
    </div>
  );

  if (variant === 'fullscreen') {
    return (
      <main
        role="status"
        aria-live="polite"
        className={`flex min-h-screen w-full flex-col items-center justify-center bg-[#F5F1E8] p-6 text-center text-[#0F2942] ${className}`}
      >
        {spinnerBadge}
        {textContent}
      </main>
    );
  }

  if (variant === 'card') {
    return (
      <div
        role="status"
        aria-live="polite"
        className={`flex min-h-[220px] w-full flex-col items-center justify-center rounded-2xl border border-[#0F2942]/10 bg-white/70 p-6 shadow-2xs backdrop-blur-xs ${className}`}
      >
        {spinnerBadge}
        {textContent}
      </div>
    );
  }

  // Variant 'page' (default)
  return (
    <div
      role="status"
      aria-live="polite"
      className={`mt-6 flex min-h-[380px] sm:min-h-[440px] w-full flex-col items-center justify-center rounded-[26px] border border-[#0F2942]/10 bg-white p-8 sm:p-12 text-center shadow-xs ${className}`}
    >
      {spinnerBadge}
      {textContent}
    </div>
  );
}

/**
 * Placeholder esqueleto reutilizável para cards de monitores/conteúdo.
 */
export function LoadingSkeletonCard({ count = 3 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className="h-44 rounded-2xl bg-white/60 animate-pulse border border-[#0F2942]/10 p-5 flex flex-col justify-between"
        >
          <div className="flex items-center justify-between">
            <div className="h-4 w-20 rounded-md bg-[#0F2942]/10" />
            <div className="h-4 w-14 rounded-md bg-[#2E5B37]/15" />
          </div>
          <div className="space-y-2">
            <div className="h-5 w-3/4 rounded-md bg-[#0F2942]/10" />
            <div className="h-3 w-1/2 rounded bg-[#0F2942]/08" />
          </div>
          <div className="h-8 w-full rounded-xl bg-[#0F2942]/05" />
        </div>
      ))}
    </div>
  );
}
