'use client';

import { BrainCircuit, LoaderCircle, RotateCcw, Save, Sparkles, X } from 'lucide-react';
import type { Dispatch, SetStateAction } from 'react';

type FlashcardDraft = {
  id: string;
  subjectId?: string;
  subjectName?: string;
  topicId?: string;
  topicName: string;
  sourceDocName: string;
  originType: 'source_doc' | 'ai_generated';
  front: string;
  back: string;
  difficulty: 'Fácil' | 'Médio' | 'Difícil';
  status: 'pending_review' | 'approved' | 'reported' | 'rejected';
};

type Props = {
  editFlashcardDraft: FlashcardDraft;
  editingFlashcardId: string | null;
  isSavingFlashcard: boolean;
  previewSide: 'front' | 'back';
  setEditFlashcardDraft: Dispatch<SetStateAction<FlashcardDraft | null>>;
  setPreviewSide: (side: 'front' | 'back' | ((current: 'front' | 'back') => 'front' | 'back')) => void;
  handleCancelEditFlashcard: () => void;
  handleSaveFlashcardEdit: () => void;
  showAlert: (title: string, message: string, type?: 'error' | 'success' | 'warning' | 'info') => void;
  teacherFullName?: string | null;
};

export function MonitorFlashcardEditorModal({
  editFlashcardDraft,
  editingFlashcardId,
  isSavingFlashcard,
  previewSide,
  setEditFlashcardDraft,
  setPreviewSide,
  handleCancelEditFlashcard,
  handleSaveFlashcardEdit,
  showAlert,
  teacherFullName,
}: Props) {
  return (
                  <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto animate-fadeIn">
                    <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col my-6 max-h-[92vh]">
                      {/* Modal Header */}
                      <div className="flex items-center justify-between border-b border-emerald-950 bg-gradient-to-r from-emerald-900 to-emerald-950 px-6 py-4 text-white shrink-0">
                        <div className="flex items-center gap-3">
                          <div className="p-2.5 bg-emerald-800/80 rounded-xl border border-emerald-700/50">
                            <BrainCircuit className="h-5 w-5 text-emerald-300" />
                          </div>
                          <div>
                            <h2 className="text-sm font-extrabold text-white uppercase tracking-wide">
                              {editingFlashcardId ? 'Editar Flashcard' : 'Novo Flashcard Manual'}
                            </h2>
                            <p className="text-xs text-emerald-100/90 font-medium">
                              Preencha os campos e confira a pré-visualização retangular do card abaixo
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={handleCancelEditFlashcard}
                          className="p-2 rounded-xl text-emerald-200 hover:text-white hover:bg-emerald-800/50 transition-all cursor-pointer"
                        >
                          <X className="h-5 w-5" />
                        </button>
                      </div>

                      {/* Modal Body: Stacked Sections with Scroll */}
                      <div className="p-6 overflow-y-auto space-y-6 flex-1">
                        {/* Seção 1: Formulário de Informações */}
                        <div className="space-y-4 bg-slate-50/60 p-5 rounded-2xl border border-slate-200/80">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {/* Tópico */}
                            <div>
                              <label className="text-xs font-bold uppercase tracking-wider text-slate-600 block mb-1.5">
                                Tópico / Conteúdo Associado:
                              </label>
                              <input
                                type="text"
                                value={editFlashcardDraft.topicName || ''}
                                onChange={(e) => setEditFlashcardDraft({ ...editFlashcardDraft, topicName: e.target.value })}
                                placeholder="Ex: Razão, Proporção e Porcentagem"
                                className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-800 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 outline-none transition-all"
                              />
                            </div>

                            {/* Dificuldade */}
                            <div>
                              <label className="text-xs font-bold uppercase tracking-wider text-slate-600 block mb-1.5">
                                Nível de Dificuldade:
                              </label>
                              <div className="grid grid-cols-3 gap-2">
                                {(['Fácil', 'Médio', 'Difícil'] as const).map((diff) => (
                                  <button
                                    key={diff}
                                    type="button"
                                    onClick={() => setEditFlashcardDraft({ ...editFlashcardDraft, difficulty: diff })}
                                    className={`py-2 px-2 text-xs font-bold rounded-xl border transition-all cursor-pointer text-center ${
                                      editFlashcardDraft.difficulty === diff
                                        ? diff === 'Fácil'
                                          ? 'bg-emerald-700 text-white border-emerald-800 shadow-2xs'
                                          : diff === 'Médio'
                                          ? 'bg-amber-600 text-white border-amber-700 shadow-2xs'
                                          : 'bg-rose-700 text-white border-rose-800 shadow-2xs'
                                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                                    }`}
                                  >
                                    {diff}
                                  </button>
                                ))}
                              </div>
                            </div>
                          </div>

                          {/* Frente (Pergunta) */}
                          <div>
                            <div className="flex items-center justify-between mb-1.5">
                              <label className="text-xs font-bold uppercase tracking-wider text-emerald-800 flex items-center gap-1.5">
                                <span>Frente (Pergunta / Conceito Principal):</span>
                              </label>
                              <span className="text-[10px] text-slate-400 font-semibold">{editFlashcardDraft.front.length} caracteres</span>
                            </div>
                            <textarea
                              value={editFlashcardDraft.front}
                              onChange={(e) => setEditFlashcardDraft({ ...editFlashcardDraft, front: e.target.value })}
                              placeholder="Digite a pergunta, fórmula ou conceito principal..."
                              rows={2}
                              className="w-full rounded-xl border border-slate-300 bg-white p-3.5 text-xs font-bold text-slate-900 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-200 outline-none transition-all resize-y min-h-[75px]"
                            />
                          </div>

                          {/* Verso (Resposta) */}
                          <div>
                            <div className="flex items-center justify-between mb-1.5">
                              <label className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                                <span>Verso (Resposta / Explicação Detalhada):</span>
                              </label>
                              <span className="text-[10px] text-slate-400 font-semibold">{editFlashcardDraft.back.length} caracteres</span>
                            </div>
                            <textarea
                              value={editFlashcardDraft.back}
                              onChange={(e) => setEditFlashcardDraft({ ...editFlashcardDraft, back: e.target.value })}
                              placeholder="Escreva a resposta completa, passos de resolução ou dica de memorização..."
                              rows={3}
                              className="w-full rounded-xl border border-slate-300 bg-white p-3.5 text-xs font-medium text-slate-800 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-200 outline-none transition-all resize-y min-h-[90px]"
                            />
                          </div>
                        </div>

                        {/* Seção 2: Pré-Visualização Retangular (Abaixo do Formulário) */}
                        <div className="space-y-3 pt-2">
                          {/* Header da Área de Pré-Visualização (Sem Caixas de Fundo Redundantes) */}
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-xs font-extrabold uppercase tracking-wider text-slate-800 flex items-center gap-2">
                              <Sparkles className="h-4 w-4 text-emerald-600" /> Pré-Visualização do Aluno (Card Físico Retangular)
                            </span>

                            {/* Seleção de Lado da Pré-visualização sem container cinza */}
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => setPreviewSide('front')}
                                className={`text-xs font-extrabold px-3 py-1.5 rounded-xl transition-all cursor-pointer ${
                                  previewSide === 'front'
                                    ? 'bg-emerald-800 text-white shadow-2xs'
                                    : 'text-slate-500 hover:text-slate-900 bg-transparent hover:bg-slate-100'
                                }`}
                              >
                                👁️ Frente (Pergunta)
                              </button>
                              <button
                                type="button"
                                onClick={() => setPreviewSide('back')}
                                className={`text-xs font-extrabold px-3 py-1.5 rounded-xl transition-all cursor-pointer flex items-center gap-1 ${
                                  previewSide === 'back'
                                    ? 'bg-emerald-800 text-white shadow-2xs'
                                    : 'text-slate-500 hover:text-slate-900 bg-transparent hover:bg-slate-100'
                                }`}
                              >
                                💡 Verso (Resposta + Botões)
                              </button>
                              <button
                                type="button"
                                onClick={() => setPreviewSide((s) => (s === 'front' ? 'back' : 'front'))}
                                className="text-xs font-bold text-slate-500 hover:text-emerald-700 bg-transparent hover:bg-slate-100 p-1.5 rounded-xl transition-all cursor-pointer flex items-center justify-center"
                                title="Virar Card"
                              >
                                <RotateCcw className="h-4 w-4" />
                              </button>
                            </div>
                          </div>

                          {/* Card Retangular Horizontal Minimalista - Verde Escuro Padrão */}
                          <div
                            onClick={() => setPreviewSide((s) => (s === 'front' ? 'back' : 'front'))}
                            className="group cursor-pointer w-full min-h-[220px] bg-emerald-950 rounded-2xl p-6 text-white shadow-lg border border-emerald-800/60 relative flex flex-col justify-between transition-all hover:border-emerald-700 overflow-hidden"
                          >
                            {/* Top Bar Minimalista sem caixas pesadas */}
                            <div className="flex items-center justify-between gap-3 relative z-10">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-white/90 truncate max-w-[280px]">
                                  {editFlashcardDraft.topicName || 'Tópico do Conteúdo'}
                                </span>
                                <div className="flex items-center gap-1.5 ml-1">
                                  <span
                                    className={`h-2 w-2 rounded-full inline-block ${
                                      (editFlashcardDraft.difficulty || 'Médio') === 'Fácil'
                                        ? 'bg-emerald-400'
                                        : (editFlashcardDraft.difficulty || 'Médio') === 'Médio'
                                        ? 'bg-amber-400'
                                        : 'bg-rose-400'
                                    }`}
                                  />
                                  <span className="text-xs font-semibold text-white/90">
                                    {editFlashcardDraft.difficulty || 'Médio'}
                                  </span>
                                </div>
                              </div>

                              {/* Indicador interativo limpo (Clique no card para virar) */}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setPreviewSide((s) => (s === 'front' ? 'back' : 'front'));
                                }}
                                className="text-xs font-bold text-white hover:text-emerald-200 flex items-center gap-1.5 transition-colors cursor-pointer group/flip"
                              >
                                <RotateCcw className="h-3.5 w-3.5 text-emerald-300 group-hover/flip:rotate-180 transition-transform duration-300" />
                                <span>Clique no card para virar ({previewSide === 'front' ? 'Ver Verso' : 'Ver Frente'})</span>
                              </button>
                            </div>

                            {/* Conteúdo Central - Texto 100% Branco e Minimalista */}
                            <div className="my-5 relative z-10 min-h-[85px] flex items-center justify-center text-center px-4">
                              {previewSide === 'front' ? (
                                <div className="space-y-2 w-full max-w-2xl">
                                  <span className="text-[10px] uppercase font-bold tracking-widest text-emerald-200/80 block">Pergunta:</span>
                                  <p className="text-base sm:text-lg font-medium text-white leading-relaxed">
                                    {editFlashcardDraft.front?.trim() ? editFlashcardDraft.front : 'Digite a pergunta na caixa acima para visualizar...'}
                                  </p>
                                </div>
                              ) : (
                                <div className="space-y-2 w-full max-w-2xl text-center">
                                  <span className="text-[10px] uppercase font-bold tracking-widest text-emerald-200/80 block">Resposta / Explicação:</span>
                                  <p className="text-base sm:text-lg font-medium text-white leading-relaxed">
                                    {editFlashcardDraft.back?.trim() ? editFlashcardDraft.back : 'Digite a resposta/explicação na caixa acima...'}
                                  </p>
                                </div>
                              )}
                            </div>

                            {/* Botões de Auto-Avaliação de Aprendizado (SRS) - Exibidos APENAS no Verso */}
                            {previewSide === 'back' && (
                              <div className="relative z-10 pt-3 border-t border-emerald-800/60 mb-2" onClick={(e) => e.stopPropagation()}>
                                <span className="text-[10px] uppercase font-bold tracking-wider text-emerald-200/80 block text-center mb-2">
                                  Como foi sua resposta? (Auto-Avaliação do Aluno):
                                </span>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                  {/* 1. Não Lembrei */}
                                  <button
                                    type="button"
                                    onClick={() => showAlert('Sucesso', 'Simulação SRS: Card agendado para revisão imediata (Não lembrei).')}
                                    className="flex flex-col items-center justify-center p-2.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 border border-rose-400/40 text-white transition-all cursor-pointer group/btn"
                                    title="Errou ou não conseguiu recordar. Card volta para revisão em breve."
                                  >
                                    <span className="text-xs font-bold text-white group-hover/btn:scale-105 transition-transform">Não lembrei</span>
                                    <span className="text-[9px] text-white/80 font-normal mt-0.5 text-center line-clamp-1">Revisão em breve</span>
                                  </button>

                                  {/* 2. Hard / Difícil */}
                                  <button
                                    type="button"
                                    onClick={() => showAlert('Sucesso', 'Simulação SRS: Card agendado para revisão intermediária (Difícil).')}
                                    className="flex flex-col items-center justify-center p-2.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/40 text-white transition-all cursor-pointer group/btn"
                                    title="Foi difícil: Acertou, mas demorou ou teve muita dúvida."
                                  >
                                    <span className="text-xs font-bold text-white group-hover/btn:scale-105 transition-transform">Difícil (Hard)</span>
                                    <span className="text-[9px] text-white/80 font-normal mt-0.5 text-center line-clamp-1">Com esforço/dúvida</span>
                                  </button>

                                  {/* 3. Good / Bom */}
                                  <button
                                    type="button"
                                    onClick={() => showAlert('Sucesso', 'Simulação SRS: Card avançou no ciclo normal de repetição (Bom).')}
                                    className="flex flex-col items-center justify-center p-2.5 rounded-xl bg-blue-500/20 hover:bg-blue-500/30 border border-blue-400/40 text-white transition-all cursor-pointer group/btn"
                                    title="Good: Lembrei com esforço normal. Card avança no ciclo normal."
                                  >
                                    <span className="text-xs font-bold text-white group-hover/btn:scale-105 transition-transform">Bom (Good)</span>
                                    <span className="text-[9px] text-white/80 font-normal mt-0.5 text-center line-clamp-1">Ciclo normal</span>
                                  </button>

                                  {/* 4. Easy / Fácil */}
                                  <button
                                    type="button"
                                    onClick={() => showAlert('Sucesso', 'Simulação SRS: Card avançou para o ciclo estendido (Muito fácil).')}
                                    className="flex flex-col items-center justify-center p-2.5 rounded-xl bg-emerald-500/25 hover:bg-emerald-500/35 border border-emerald-400/40 text-white transition-all cursor-pointer group/btn"
                                    title="Easy: Muito fácil! Acertou sem nenhum esforço."
                                  >
                                    <span className="text-xs font-bold text-white group-hover/btn:scale-105 transition-transform">Fácil (Easy)</span>
                                    <span className="text-[9px] text-white/80 font-normal mt-0.5 text-center line-clamp-1">Muito fácil</span>
                                  </button>
                                </div>
                              </div>
                            )}

                            {/* Rodapé Minimalista do Card */}
                            <div className="flex items-center justify-between text-[11px] text-white/80 relative z-10 pt-3 border-t border-emerald-800/60 mt-1">
                              <span className="font-semibold text-white truncate max-w-[280px]">
                                {teacherFullName
                                  ? (teacherFullName.toLowerCase().startsWith('prof') ? teacherFullName : `Prof. ${teacherFullName}`)
                                  : 'Prof. Professor(a)'}
                              </span>
                              <span className="font-mono text-[10px] text-white/70">MeuMonitor AI · Flashcard</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Botões de Ação no Rodapé do Modal */}
                      <div className="flex items-center justify-end gap-3 px-6 py-4 bg-slate-50 border-t border-slate-200 shrink-0">
                        <button
                          type="button"
                          onClick={handleCancelEditFlashcard}
                          disabled={isSavingFlashcard}
                          className="px-5 py-2.5 text-xs font-bold text-slate-600 hover:text-slate-900 bg-white border border-slate-300 hover:bg-slate-100 rounded-xl transition-all cursor-pointer shadow-2xs"
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          onClick={handleSaveFlashcardEdit}
                          disabled={isSavingFlashcard || !editFlashcardDraft.front?.trim() || !editFlashcardDraft.back?.trim()}
                          className="px-6 py-2.5 text-xs font-bold text-white bg-emerald-800 hover:bg-emerald-900 rounded-xl shadow-md hover:shadow-lg transition-all cursor-pointer flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isSavingFlashcard ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                          <span>{editingFlashcardId ? 'Salvar Alterações' : 'Criar Flashcard'}</span>
                        </button>
                      </div>
                    </div>
                  </div>

  );
}
