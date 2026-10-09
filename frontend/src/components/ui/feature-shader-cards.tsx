"use client"

import React from "react"
import { Sparkles } from "lucide-react"

export interface ShaderFeature {
  title: string
  description: string
  icon: React.ReactNode
  badge?: string
  actionText?: string
  onClick?: () => void
}

export interface FeaturesCardsProps {
  features?: ShaderFeature[]
  title?: string
  subtitle?: string
  headerBadge?: string
}

export default function FeaturesCards({
  features = [],
  title,
  subtitle,
  headerBadge,
}: FeaturesCardsProps) {
  return (
    <div className="w-full max-w-7xl mx-auto">
      {/* Card Único Compacto no Verde Musgo (#2E5B37) */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#16351F] via-[#2E5B37] to-[#183821] text-white shadow-lg border border-emerald-600/30 p-4 md:p-5">
        
        {/* Efeitos de Iluminação e Brilho de Fundo */}
        <div className="absolute top-0 right-0 -mt-16 -mr-16 w-64 h-64 rounded-full bg-emerald-400/10 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 -mb-16 -ml-16 w-64 h-64 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />

        {/* Cabeçalho Integrado no Card Único */}
        {(headerBadge || title || subtitle) && (
          <div className="mb-4 border-b border-white/15 pb-3.5 text-center sm:text-left relative z-10">
            {headerBadge && (
              <span className="text-[10px] font-extrabold uppercase tracking-widest text-emerald-300 bg-emerald-950/70 px-3 py-1 rounded-full border border-emerald-500/30 inline-flex items-center gap-1 shadow-sm mb-2">
                <Sparkles className="w-3 h-3 text-emerald-400" />
                {headerBadge}
              </span>
            )}
            {title && (
              <h3 className="text-base md:text-lg font-bold text-white tracking-tight leading-snug">
                {title}
              </h3>
            )}
            {subtitle && (
              <p className="text-xs text-emerald-100/80 font-normal mt-1 leading-relaxed">
                {subtitle}
              </p>
            )}
          </div>
        )}

        {/* 4 Seções Internas Compactas */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 relative z-10">
          {features.map((feature, index) => (
            <div 
              key={index}
              onClick={feature.onClick}
              role="button"
              tabIndex={0}
              className="relative p-3.5 md:p-4 rounded-xl bg-white/10 backdrop-blur-md border border-white/15 hover:bg-white/20 hover:border-emerald-300/40 shadow-xs hover:shadow-lg hover:shadow-black/20 hover:-translate-y-0.5 active:scale-[0.98] transition-all duration-200 flex flex-col justify-between group cursor-pointer overflow-hidden"
            >
              {/* Linha de destaque no hover */}
              <div className="absolute top-0 left-0 right-0 h-0.5 bg-emerald-400 opacity-0 group-hover:opacity-100 transition-opacity duration-200" />

              <div>
                <div className="flex items-center justify-between gap-2 mb-2.5">
                  {feature.icon && (
                    <div className="w-8 h-8 rounded-lg bg-emerald-950/80 text-emerald-300 group-hover:bg-emerald-400 group-hover:text-[#0F2942] group-hover:scale-105 flex items-center justify-center shrink-0 border border-emerald-500/30 transition-all duration-200 shadow-xs">
                      {React.isValidElement(feature.icon) 
                        ? React.cloneElement(feature.icon as React.ReactElement<{ className?: string }>, {
                            className: `${(feature.icon as React.ReactElement<{ className?: string }>).props.className || ''} w-4 h-4 group-hover:text-[#0F2942] transition-colors duration-200`
                          })
                        : feature.icon}
                    </div>
                  )}
                  {feature.badge && (
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-white opacity-95 transition-all duration-200">
                      {feature.badge}
                    </span>
                  )}
                </div>

                <h4 className="text-xs md:text-sm font-extrabold text-white tracking-tight mb-1 group-hover:text-emerald-200 transition-colors leading-snug">
                  {feature.title}
                </h4>
                <p className="text-[11px] leading-relaxed text-emerald-100/80 font-normal group-hover:text-white transition-colors">
                  {feature.description}
                </p>
              </div>

              <div className="mt-3 pt-2.5 border-t border-white/10 flex items-center text-[11px] font-bold text-emerald-300 group-hover:text-white transition-all duration-200">
                <span className="group-hover:translate-x-0.5 transition-transform duration-200">{feature.actionText || "SABER MAIS"}</span>
                <svg className="w-3 h-3 ml-1 transform group-hover:translate-x-1 transition-transform duration-200 text-emerald-300 group-hover:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </div>
          ))}
        </div>

      </div>
    </div>
  )
}
