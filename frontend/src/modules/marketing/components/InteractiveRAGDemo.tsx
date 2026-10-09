'use client';

import React, { useState } from 'react';
import { Bot, Send, ShieldAlert, Sparkles, FileCheck, CheckCircle2, ChevronDown } from 'lucide-react';

interface ChatMessage {
  sender: 'student' | 'agent';
  text: string;
  sourceAttribution?: string;
  isOutOfScope?: boolean;
}

export const InteractiveRAGDemo: React.FC = () => {
  const [activePreset, setActivePreset] = useState<number>(0);
  const [customInput, setCustomInput] = useState<string>('');

  const PRESETS = [
    {
      label: 'Dúvida sobre Regência (No Escopo)',
      question: 'Por que a alternativa B está incorreta na questão sobre o verbo "assistir"?',
      response:
        'Segundo a página 34 do capítulo 2 da sua apostila ("Regência Verbal FCC"), o verbo "assistir" no sentido de presenciar exige obrigatoriamente a preposição "a" (ex: Assistimos ao jogo). A alternativa B omitiu a preposição, violando a regra da banca.',
      source: 'Fonte: Apostila Prof. João Victor — Módulo de Português FCC (Pág. 34)',
      isOutOfScope: false,
    },
    {
      label: 'Teste de Recusa / Alucinação (Fora do Escopo)',
      question: 'Como faço para declarar Imposto de Renda Pessoa Física 2024?',
      response:
        'Não possuo base de conhecimento cadastrada pelo professor sobre declaração de Imposto de Renda. Meu escopo está estritamente restrito aos materiais de Gramática e Português para Concursos do Prof. João Victor.',
      source: 'Recusa por Regra RAG (PRD Sec. 2.2 — RAG Restrito às Fontes)',
      isOutOfScope: true,
    },
  ];

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      sender: 'student',
      text: PRESETS[0].question,
    },
    {
      sender: 'agent',
      text: PRESETS[0].response,
      sourceAttribution: PRESETS[0].source,
      isOutOfScope: false,
    },
  ]);

  const handleSelectPreset = (index: number) => {
    setActivePreset(index);
    const selected = PRESETS[index];
    setMessages([
      { sender: 'student', text: selected.question },
      {
        sender: 'agent',
        text: selected.response,
        sourceAttribution: selected.source,
        isOutOfScope: selected.isOutOfScope,
      },
    ]);
  };

  const handleSendCustom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customInput.trim()) return;

    const userText = customInput;
    setCustomInput('');

    const isGrammar = /crase|regência|verbo|questão|português|sintaxe|concordância/i.test(userText);

    setMessages((prev) => [
      ...prev,
      { sender: 'student', text: userText },
    ]);

    setTimeout(() => {
      if (isGrammar) {
        setMessages((prev) => [
          ...prev,
          {
            sender: 'agent',
            text: `Com base nas apostilas cadastradas pelo professor para esta subcategoria, a resposta para "${userText}" está fundamentada no capítulo de sintaxe.`,
            sourceAttribution: 'Fonte: Apostila de Sintaxe e Regência (Aprovada pelo Professor)',
            isOutOfScope: false,
          },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            sender: 'agent',
            text: 'Não encontrei amparo nos materiais cadastrados pelo professor para responder a esta pergunta com total segurança pedagógica.',
            sourceAttribution: 'Recusa Automática — Sem Alucinações (PRD Sec. 2.2)',
            isOutOfScope: true,
          },
        ]);
      }
    }, 600);
  };

  return (
    <section id="demo-rag" className="snap-section pt-20 pb-10 bg-slate-950/60 border-t border-b border-slate-900 flex flex-col justify-between">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 my-auto w-full">
        
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-8">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-xs font-semibold text-cyan-300 mb-3">
            <Bot className="w-3.5 h-3.5" />
            <span>Demonstração Interativa do RAG (PRD Sec. 2.2)</span>
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white tracking-tight mb-2">
            Testar Chat RAG Restrito sem Alucinações
          </h2>
          <p className="text-slate-300 text-xs sm:text-sm">
            Veja na prática como a IA do MeuMonitor responde com base 100% fiel nos seus PDFs e se recusa a responder tópicos fora do escopo.
          </p>

          {/* Preset Buttons */}
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {PRESETS.map((p, idx) => (
              <button
                key={idx}
                onClick={() => handleSelectPreset(idx)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                  activePreset === idx
                    ? 'bg-indigo-600 text-white border-indigo-500 shadow-lg shadow-indigo-500/25'
                    : 'glass-card text-slate-300 hover:text-white border-slate-800'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Interactive Chat Window */}
        <div className="max-w-3xl mx-auto glass-panel rounded-3xl border border-slate-800 shadow-2xl overflow-hidden">
          
          {/* Top Bar */}
          <div className="px-5 py-3 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center text-white font-bold">
                <Bot className="w-4 h-4" />
              </div>
              <div>
                <h4 className="font-bold text-white text-xs sm:text-sm">Agente: Português FCC — Prof. João Victor</h4>
                <div className="flex items-center space-x-2 text-[10px] text-slate-400">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span>RAG Ativo — Restrito a 14 PDFs Cadastrados</span>
                </div>
              </div>
            </div>

            <div className="hidden sm:flex items-center space-x-2 text-[10px] bg-slate-800/80 px-2.5 py-1 rounded-lg border border-slate-700 text-slate-300">
              <FileCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>Base Auditável</span>
            </div>
          </div>

          {/* Message Stream */}
          <div className="p-5 space-y-3 min-h-[220px] max-h-[300px] overflow-y-auto bg-slate-950/40">
            {messages.map((msg, index) => (
              <div
                key={index}
                className={`flex flex-col ${msg.sender === 'student' ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[88%] p-3.5 rounded-2xl text-xs sm:text-sm leading-relaxed ${
                    msg.sender === 'student'
                      ? 'bg-indigo-600 text-white rounded-br-none shadow-md'
                      : msg.isOutOfScope
                      ? 'bg-rose-950/40 border border-rose-500/40 text-rose-200 rounded-bl-none'
                      : 'bg-slate-900 border border-slate-800 text-slate-200 rounded-bl-none'
                  }`}
                >
                  {msg.sender === 'agent' && (
                    <div className="flex items-center space-x-1.5 mb-1 font-bold text-[10px]">
                      {msg.isOutOfScope ? (
                        <>
                          <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
                          <span className="text-rose-400">Recusa por Falta de Base:</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                          <span className="text-indigo-300">Resposta Fundamentada em PDF:</span>
                        </>
                      )}
                    </div>
                  )}

                  <p className="text-xs sm:text-sm">{msg.text}</p>

                  {msg.sourceAttribution && (
                    <div
                      className={`mt-2 pt-1.5 border-t text-[10px] font-mono flex items-center justify-between ${
                        msg.isOutOfScope
                          ? 'border-rose-500/20 text-rose-300'
                          : 'border-slate-800 text-indigo-300'
                      }`}
                    >
                      <span className="truncate mr-2">📌 {msg.sourceAttribution}</span>
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Chat Input Form */}
          <form onSubmit={handleSendCustom} className="p-3 bg-slate-900/90 border-t border-slate-800 flex space-x-2">
            <input
              type="text"
              value={customInput}
              onChange={(e) => setCustomInput(e.target.value)}
              placeholder="Digite uma pergunta para testar a busca vetorial (ex: O que é crase?)..."
              className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
            <button
              type="submit"
              className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center space-x-1 shadow-md shadow-indigo-500/20 transition-all"
            >
              <span>Enviar</span>
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>

        </div>

      </div>

      <div className="flex justify-center pb-4 text-slate-500 z-10 animate-bounce">
        <a href="#calculadora" className="flex flex-col items-center text-xs hover:text-indigo-400 transition-colors">
          <span>Calculadora de Ganhos</span>
          <ChevronDown className="w-4 h-4 mt-1" />
        </a>
      </div>
    </section>
  );
};
