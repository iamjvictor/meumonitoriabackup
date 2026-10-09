'use client';

import React, { useState } from 'react';
import { ChevronDown, HelpCircle } from 'lucide-react';

const STUDENT_FAQ_ITEMS = [
  {
    question: 'Como faço para ter acesso ao assistente do meu professor?',
    answer: 'Cada professor possui um link público exclusivo (ex: meumonitor.ai/p/prof-nome). Basta clicar no link compartilhado pelo seu professor nas redes sociais, canal ou curso para visualizar os agentes disponíveis e realizar sua assinatura.',
  },
  {
    question: 'Como funciona a assinatura para o aluno?',
    answer: 'A assinatura é mensal (R$ 59,90/mês por agente) e concede acesso ilimitado ao Chat RAG de dúvidas, banco de questões da matéria, simulados adaptativos ilimitados e ao Desafio Diário com ranking.',
  },
  {
    question: 'O assistente de IA pode me dar respostas erradas?',
    answer: 'Nossa tecnologia de RAG força a inteligência artificial a consultar exclusivamente o material cadastrado pelo seu professor. Se uma dúvida não estiver contemplada nas apostilas e PDFs do seu professor, a IA informará expressamente que não tem base de conhecimento para responder, prevenindo alucinações.',
  },
  {
    question: 'Já sou aluno cadastrado. Como faço login?',
    answer: 'Clique no botão "Entrar como Aluno" no topo da página e digite seu e-mail e senha cadastrados para acessar imediatamente seu painel de estudos.',
  },
];

export const StudentFAQSection: React.FC = () => {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const toggleFAQ = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <section id="faq-aluno" className="snap-section pt-20 pb-10 flex flex-col justify-between">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 my-auto w-full">
        
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-teal-500/10 border border-teal-500/20 text-xs font-semibold text-teal-300 mb-3">
            <HelpCircle className="w-3.5 h-3.5" />
            <span>Dúvidas Frequentes do Aluno</span>
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white tracking-tight mb-2">
            Perguntas Frequentes
          </h2>
          <p className="text-slate-300 text-xs sm:text-sm">
            Tire suas dúvidas sobre o acesso e o funcionamento do seu assistente de estudos.
          </p>
        </div>

        {/* Accordion */}
        <div className="space-y-3">
          {STUDENT_FAQ_ITEMS.map((item, index) => {
            const isOpen = openIndex === index;
            return (
              <div
                key={index}
                className="glass-panel rounded-xl border border-slate-800/80 overflow-hidden transition-all duration-200"
              >
                <button
                  onClick={() => toggleFAQ(index)}
                  className="w-full p-4 text-left flex items-center justify-between space-x-4 hover:bg-slate-900/50 transition-colors"
                >
                  <span className="font-bold text-white text-xs sm:text-sm pr-2">
                    {item.question}
                  </span>
                  <div className={`w-6 h-6 rounded-lg bg-slate-900 border border-slate-800 text-emerald-400 flex items-center justify-center shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180 bg-emerald-500 text-slate-950 border-emerald-400' : ''}`}>
                    <ChevronDown className="w-4 h-4" />
                  </div>
                </button>

                {isOpen && (
                  <div className="px-4 pb-4 text-slate-300 text-xs leading-relaxed border-t border-slate-800/50 pt-3">
                    <p>{item.answer}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>

      </div>
    </section>
  );
};
