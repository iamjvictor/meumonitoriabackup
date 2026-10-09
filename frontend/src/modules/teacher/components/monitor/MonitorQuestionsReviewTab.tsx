'use client';

import type { ChangeEvent, Dispatch, RefObject, SetStateAction } from 'react';
import { AlertCircle, AlertTriangle, Check, CheckCircle2, ChevronDown, Clock, Edit3, FileText, Filter, HelpCircle, LoaderCircle, Plus, Save, Send, Sparkles, Trash2, Upload, X, XCircle } from 'lucide-react';

type ReviewStatus = 'pending_review' | 'approved' | 'reported' | 'rejected';
type ReviewFilter = 'all' | 'pending' | 'approved' | 'source_doc' | 'ai_generated' | 'incomplete' | 'no_topic' | 'no_options' | 'no_answer' | 'no_explanation';
type QuestionItem = { id: string; subjectId?: string; subjectName?: string; topicId?: string; topicName: string; sourceDocName: string; originType: 'source_doc' | 'ai_generated'; prompt: string; options: { letter: string; text: string }[]; correctAnswer: string; explanation: string; status: ReviewStatus };

export interface MonitorQuestionsReviewTabProps {
  // The view is a literal extraction of the legacy page block; the remaining callback props are intentionally forwarded unchanged.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
  showAlert: (title: string, message: string, type?: 'error' | 'success' | 'warning' | 'info') => void;
  questionFileInputRef: RefObject<HTMLInputElement | null>;
  selectedTopicId: string | null;
  isSubmittingUploads: boolean;
  handleFilesSelected: (event: ChangeEvent<HTMLInputElement>) => void;
  queuedUploads: Array<{ id: string; file: File; status: string; error?: string }>;
  filteredQuestions: QuestionItem[];
  questions: QuestionItem[];
  selectedQuestionIds: string[];
  editQuestionDraft: QuestionItem | null;
  monitor: { subjects?: Array<{ id: string; name: string; topicRefs?: Array<{ id: string; name: string }> }> } | null;
  setUploadsByView: Dispatch<SetStateAction<Record<'knowledge' | 'questions' | 'flashcards', Array<{ id: string; file: File; topicId: string; status: 'staged' | 'uploading' | 'uploaded' | 'failed'; error?: string }>>>>;
  setQuestions: Dispatch<SetStateAction<QuestionItem[]>>;
  setSelectedQuestionIds: Dispatch<SetStateAction<string[]>>;
  handleOpenCreateQuestion: () => void;
}

export function MonitorQuestionsReviewTab(props: MonitorQuestionsReviewTabProps) {
  const { questionFileInputRef, selectedTopicId, isSubmittingUploads, handleFilesSelected, showAlert, queuedUploads, setUploadsByView, formatFileSize, stagedCount, setIsUploadConfirmModalOpen, isDraggingFiles, setIsDraggingFiles, queueFiles, reviewFilter, setReviewFilter, pendingQuestionsCount, approvedQuestionsCount, incompleteQuestionsCount, noTopicQuestionsCount, noOptionsQuestionsCount, noAnswerQuestionsCount, noExplanationQuestionsCount, monitor, setEditingQuestionId, setEditQuestionDraft, filteredQuestions, questions, selectedQuestionIds, setSelectedQuestionIds, isBulkProcessing, handleBulkApproveQuestions, handleBulkRejectQuestions, editingQuestionId, editQuestionDraft, isQuestionIncomplete, toggleSelectQuestion, isQuestionNoTopic, isQuestionNoOptions, isQuestionNoAnswer, isQuestionNoExplanation, handleStartEditQuestion, handleOpenCreateQuestion, handleCancelEditQuestion, isSavingQuestion, handleSaveQuestionEdit, handleQuestionAction } = props;
  return (
              <div className="max-w-5xl mx-auto space-y-6">
                {editQuestionDraft?.id.startsWith('q-') && (
                  <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
                    <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
                      <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
                        <div>
                          <p className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-700">Nova questão</p>
                          <h3 className="mt-1 text-lg font-extrabold text-slate-900">Adicionar questão manual</h3>
                          <p className="mt-1 text-xs text-slate-500">Preencha os dados e salve para enviar a questão para aprovadas.</p>
                        </div>
                        <button type="button" onClick={handleCancelEditQuestion} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Fechar modal"><X className="h-5 w-5" /></button>
                      </div>

                      <div className="mt-5 space-y-4">
                        <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-700">
                          Enunciado
                          <textarea
                            value={editQuestionDraft.prompt}
                            onChange={(event) => setEditQuestionDraft({ ...editQuestionDraft, prompt: event.target.value })}
                            rows={5}
                            autoFocus
                            placeholder="Digite o enunciado da questão"
                            className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm font-normal normal-case tracking-normal text-slate-900 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
                          />
                        </label>

                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          {editQuestionDraft.options.map((option, index) => (
                            <label key={option.letter} className="text-xs font-extrabold uppercase tracking-wider text-slate-700">
                              Alternativa {option.letter}
                              <input
                                value={option.text}
                                onChange={(event) => setEditQuestionDraft({
                                  ...editQuestionDraft,
                                  options: editQuestionDraft.options.map((current, currentIndex) => currentIndex === index ? { ...current, text: event.target.value } : current),
                                })}
                                placeholder={`Texto da alternativa ${option.letter}`}
                                className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm font-normal normal-case tracking-normal text-slate-900 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
                              />
                            </label>
                          ))}
                        </div>

                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <label className="text-xs font-extrabold uppercase tracking-wider text-slate-700">
                            Gabarito
                            <select value={editQuestionDraft.correctAnswer} onChange={(event) => setEditQuestionDraft({ ...editQuestionDraft, correctAnswer: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-normal normal-case tracking-normal text-slate-900 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100">
                              {editQuestionDraft.options.map((option) => <option key={option.letter} value={option.letter}>{option.letter}</option>)}
                            </select>
                          </label>
                          <label className="text-xs font-extrabold uppercase tracking-wider text-slate-700">
                            Explicação (opcional)
                            <input value={editQuestionDraft.explanation} onChange={(event) => setEditQuestionDraft({ ...editQuestionDraft, explanation: event.target.value })} placeholder="Resolução ou comentário" className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm font-normal normal-case tracking-normal text-slate-900 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100" />
                          </label>
                        </div>
                      </div>

                      <div className="mt-6 flex justify-end gap-2 border-t border-slate-100 pt-4">
                        <button type="button" onClick={handleCancelEditQuestion} className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50">Cancelar</button>
                        <button type="button" onClick={handleSaveQuestionEdit} disabled={isSavingQuestion} className="rounded-xl bg-emerald-800 px-5 py-2.5 text-xs font-bold text-white hover:bg-emerald-900 disabled:cursor-not-allowed disabled:opacity-50">{isSavingQuestion ? 'Salvando...' : 'Salvar e aprovar'}</button>
                      </div>
                    </div>
                  </div>
                )}

                <input
                  ref={questionFileInputRef}
                  type="file"
                  multiple
                  accept=".pdf,.doc,.docx,.txt"
                  className="sr-only"
                  disabled={!selectedTopicId || isSubmittingUploads}
                  onChange={handleFilesSelected}
                />

                {/* 1. ACIMA: Bloco de Upload / Fila de Documentos para Questões via IA */}
                <div className="bg-white rounded-2xl border border-emerald-200/80 p-5 shadow-xs space-y-4 bg-gradient-to-r from-emerald-50/30 to-white">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2.5 rounded-xl bg-emerald-100 text-emerald-800 border border-emerald-200 shadow-2xs">
                        <Sparkles className="h-4 w-4 text-emerald-700" />
                      </div>
                      <div>
                        <h3 className="text-xs font-extrabold uppercase tracking-wider text-emerald-950">Geração Inteligente de Questões via IA</h3>
                        <p className="text-[11px] font-medium text-slate-500">Envie arquivos (PDF, DOC, DOCX, TXT) associados a este tópico para extrair questões com a tag <span className="font-mono text-emerald-700 font-bold">questions</span>.</p>
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={!selectedTopicId || isSubmittingUploads}
                      onClick={() => {
                        if (!selectedTopicId) {
                          showAlert('Selecione um Tópico', 'Escolha um tópico específico na estrutura do monitor para liberar o upload.', 'warning');
                          return;
                        }
                        questionFileInputRef.current?.click();
                      }}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-800 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-emerald-900 transition-all cursor-pointer disabled:opacity-50 shadow-2xs"
                    >
                      <Upload className="h-3.5 w-3.5" />
                      <span>Selecionar Arquivo</span>
                    </button>
                  </div>

                  {/* Fila de arquivos selecionados */}
                  {queuedUploads.length > 0 ? (
                    <div className="overflow-hidden rounded-xl border border-emerald-200 bg-white shadow-xs">
                      <div className="flex items-center justify-between border-b border-emerald-100 bg-emerald-50/80 px-4 py-2.5">
                        <p className="text-xs font-bold text-emerald-950 flex items-center gap-2">
                          <FileText className="h-3.5 w-3.5 text-emerald-700" />
                          Arquivos na Fila de Questões ({queuedUploads.length})
                        </p>
                        {!isSubmittingUploads && (
                          <button
                            type="button"
                            onClick={() => setUploadsByView((u) => ({ ...u, questions: [] }))}
                            className="text-[11px] font-semibold text-slate-400 hover:text-rose-700 transition-colors cursor-pointer"
                          >
                            Limpar fila
                          </button>
                        )}
                      </div>

                      <ul className="divide-y divide-emerald-50 max-h-48 overflow-y-auto">
                        {queuedUploads.map(({ id, file, status, error: uploadError }) => (
                          <li key={id} className="flex items-center justify-between px-4 py-2.5 hover:bg-emerald-50/30">
                            <div className="flex items-center gap-2 min-w-0">
                              <FileText className="h-4 w-4 text-emerald-700 shrink-0" />
                              <div className="min-w-0">
                                <p className="text-xs font-semibold text-slate-800 truncate max-w-[200px]" title={file.name}>{file.name}</p>
                                <p className="text-[10px] text-slate-400">{formatFileSize(file.size)}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {status === 'staged' && (
                                <span className="text-[10px] font-bold text-emerald-900 bg-emerald-100 px-2.5 py-1 rounded-full flex items-center gap-1 border border-emerald-200">
                                  <Clock className="h-3 w-3 text-emerald-600" /> Pronto p/ Enviar (tag: questions)
                                </span>
                              )}
                              {status === 'uploading' && (
                                <span className="text-[10px] font-bold text-emerald-900 bg-emerald-100 px-2.5 py-1 rounded-full flex items-center gap-1.5 border border-emerald-200">
                                  <LoaderCircle className="h-3 w-3 animate-spin text-emerald-700" /> Enviando...
                                </span>
                              )}
                              {status === 'uploaded' && (
                                <span className="text-[10px] font-bold text-amber-900 bg-amber-100/90 px-2.5 py-1 rounded-full flex items-center gap-1.5 border border-amber-200 shadow-2xs">
                                  <LoaderCircle className="h-3 w-3 animate-spin text-amber-700" />
                                  <span>Em Processamento</span>
                                </span>
                              )}
                              {status === 'failed' && (
                                <span className="text-[10px] font-bold text-rose-700 bg-rose-50 px-2.5 py-1 rounded-full flex items-center gap-1 border border-rose-200" title={uploadError}>
                                  <AlertCircle className="h-3 w-3" /> Falhou
                                </span>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>

                      <div className="flex items-center justify-between border-t border-emerald-100 bg-emerald-50/50 px-4 py-2.5">
                        <p className="text-[10px] text-slate-500 font-medium">{stagedCount} arquivo(s) pronto(s) para envio ao fluxo de Questões</p>
                        <button
                          type="button"
                          onClick={() => setIsUploadConfirmModalOpen(true)}
                          disabled={isSubmittingUploads || stagedCount === 0}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-800 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-emerald-900 disabled:opacity-50 transition-all cursor-pointer"
                        >
                          {isSubmittingUploads ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                          <span>Enviar para Gerar Questões</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={!selectedTopicId || isSubmittingUploads}
                      onClick={() => {
                        if (!selectedTopicId) {
                          showAlert('Selecione um Tópico', 'Escolha um tópico específico na estrutura do monitor para liberar o upload.', 'warning');
                          return;
                        }
                        questionFileInputRef.current?.click();
                      }}
                      onDragEnter={(e) => { e.preventDefault(); if (selectedTopicId) setIsDraggingFiles(true); }}
                      onDragOver={(e) => { e.preventDefault(); if (selectedTopicId) setIsDraggingFiles(true); }}
                      onDragLeave={(e) => { e.preventDefault(); setIsDraggingFiles(false); }}
                      onDrop={(e) => {
                        e.preventDefault();
                        setIsDraggingFiles(false);
                        if (selectedTopicId) queueFiles(Array.from(e.dataTransfer.files));
                      }}
                      className={`flex w-full flex-col items-center justify-center border-2 border-dashed rounded-xl px-6 py-6 text-center transition-all ${!selectedTopicId || isSubmittingUploads ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'} ${
                        isDraggingFiles
                          ? 'border-emerald-600 bg-emerald-100/70 shadow-inner scale-[0.99]'
                          : 'border-emerald-200 bg-emerald-50/40 hover:border-emerald-500 hover:bg-emerald-50/80 hover:shadow-xs'
                      }`}
                    >
                      <div className="p-2 bg-white rounded-full shadow-2xs mb-2 text-emerald-700 border border-emerald-100">
                        <Upload className="h-5 w-5" />
                      </div>
                      <span className="text-xs font-bold text-emerald-950">Arraste arquivos de estudo aqui ou clique para selecionar</span>
                      <span className="mt-0.5 text-[10px] text-slate-500">PDF, DOC, DOCX ou TXT serão enviados ao fluxo com a tag <strong className="text-emerald-700">questions</strong></span>
                    </button>
                  )}
                </div>

                {/* 2. ABAIXO DO UPLOAD: UMA ÚNICA LINHA COM OS FILTROS E AÇÕES */}
                <div className="bg-white rounded-2xl border border-slate-200 p-3.5 px-4 flex items-center justify-between gap-3 shadow-xs flex-nowrap overflow-x-auto">
                  <div className="flex items-center gap-3 overflow-x-auto">
                    <div className="flex items-center gap-1.5 text-slate-500 shrink-0">
                      <Filter className="h-4 w-4 text-slate-400" />
                      <span className="text-xs font-bold uppercase tracking-wider hidden sm:inline">Filtrar:</span>
                    </div>

                    <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl flex-nowrap overflow-x-auto">
                      <button
                        type="button"
                        onClick={() => setReviewFilter('pending')}
                        className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                          reviewFilter === 'pending' || reviewFilter === 'all' ? 'bg-amber-500 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        <Clock className="h-3.5 w-3.5" />
                        Pendentes ({pendingQuestionsCount})
                      </button>
                      <button
                        type="button"
                        onClick={() => setReviewFilter('approved')}
                        className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                          reviewFilter === 'approved' ? 'bg-emerald-700 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Aprovadas ({approvedQuestionsCount})
                      </button>

                      {/* Dropdown de Inconsistências / Incompletas */}
                      <div className="relative inline-flex items-center shrink-0">
                        <div
                          className={`inline-flex items-center rounded-lg px-2 py-1 transition-all ${
                            ['incomplete', 'no_topic', 'no_options', 'no_answer', 'no_explanation'].includes(reviewFilter)
                              ? 'bg-rose-700 text-white shadow-2xs'
                              : 'text-rose-700 hover:bg-rose-100/80'
                          }`}
                        >
                          <AlertTriangle
                            className={`h-3.5 w-3.5 shrink-0 ${
                              ['incomplete', 'no_topic', 'no_options', 'no_answer', 'no_explanation'].includes(reviewFilter)
                                ? 'text-white'
                                : 'text-rose-600'
                            }`}
                          />
                          <select
                            value={
                              ['incomplete', 'no_topic', 'no_options', 'no_answer', 'no_explanation'].includes(reviewFilter)
                                ? reviewFilter
                                : ''
                            }
                            onChange={(e) => {
                              if (e.target.value) {
                                setReviewFilter(e.target.value as ReviewFilter);
                              }
                            }}
                            className={`pl-1.5 pr-6 py-0.5 text-xs font-bold rounded-lg cursor-pointer outline-hidden bg-transparent appearance-none transition-all whitespace-nowrap ${
                              ['incomplete', 'no_topic', 'no_options', 'no_answer', 'no_explanation'].includes(reviewFilter)
                                ? 'text-white font-extrabold'
                                : 'text-rose-950 font-bold'
                            }`}
                          >
                            <option
                              value=""
                              disabled
                              hidden={['incomplete', 'no_topic', 'no_options', 'no_answer', 'no_explanation'].includes(reviewFilter)}
                            >
                              Incompletas ({incompleteQuestionsCount})
                            </option>
                            <option value="incomplete" className="bg-white text-slate-900 font-bold">
                              ⚠️ Todas Incompletas ({incompleteQuestionsCount})
                            </option>
                            <option value="no_topic" className="bg-white text-slate-900">
                              🏷️ Sem Categoria / Tópico ({noTopicQuestionsCount})
                            </option>
                            <option value="no_options" className="bg-white text-slate-900">
                              📋 Sem Alternativas ({noOptionsQuestionsCount})
                            </option>
                            <option value="no_answer" className="bg-white text-slate-900">
                              🎯 Sem Gabarito ({noAnswerQuestionsCount})
                            </option>
                            <option value="no_explanation" className="bg-white text-slate-900">
                              💡 Sem Explicação ({noExplanationQuestionsCount})
                            </option>
                          </select>
                          <ChevronDown
                            className={`h-3.5 w-3.5 pointer-events-none -ml-5 shrink-0 ${
                              ['incomplete', 'no_topic', 'no_options', 'no_answer', 'no_explanation'].includes(reviewFilter)
                                ? 'text-white'
                                : 'text-rose-600'
                            }`}
                          />
                          {['incomplete', 'no_topic', 'no_options', 'no_answer', 'no_explanation'].includes(reviewFilter) && (
                            <button
                              type="button"
                              onClick={() => setReviewFilter('pending')}
                              className="ml-1 p-1 rounded-md bg-rose-800 text-white hover:bg-rose-900 transition-colors cursor-pointer"
                              title="Limpar filtro de inconsistências"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button type="button" onClick={handleOpenCreateQuestion}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-800 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-900 transition-all cursor-pointer shadow-md hover:shadow-lg active:scale-95 whitespace-nowrap"
                    >
                      <Plus className="h-4 w-4" />
                      <span>Adicionar Questão Manual</span>
                    </button>
                  </div>
                </div>

                {/* Bar de Seleção & Ações em Lote (Flutuante acompanhando a rolagem) */}
                {filteredQuestions.length > 0 && (
                  <div className="sticky top-0 z-40 bg-white/95 backdrop-blur-md rounded-xl border border-slate-200/90 px-4 py-3 flex flex-wrap items-center justify-between gap-4 shadow-md transition-all">
                    <div className="flex items-center gap-3">
                      <label className="inline-flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-700 hover:text-slate-900 select-none">
                        <input
                          type="checkbox"
                          checked={
                            filteredQuestions.length > 0 &&
                            filteredQuestions.every((q) => selectedQuestionIds.includes(q.id))
                          }
                          onChange={() => {
                            const visibleIds = filteredQuestions.map((q) => q.id);
                            const isAllSelected =
                              visibleIds.length > 0 && visibleIds.every((id) => selectedQuestionIds.includes(id));
                            if (isAllSelected) {
                              setSelectedQuestionIds((prev) => prev.filter((id) => !visibleIds.includes(id)));
                            } else {
                              setSelectedQuestionIds((prev) => Array.from(new Set([...prev, ...visibleIds])));
                            }
                          }}
                          className="h-4 w-4 rounded border-slate-300 text-emerald-700 focus:ring-emerald-500 cursor-pointer"
                        />
                        <span>Selecionar Todas as Questões ({filteredQuestions.length})</span>
                      </label>

                      {selectedQuestionIds.length > 0 && (
                        <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-extrabold text-emerald-900 border border-emerald-200">
                          {selectedQuestionIds.length} selecionada(s)
                        </span>
                      )}
                    </div>

                    {selectedQuestionIds.length > 0 ? (
                      <div className="flex items-center gap-2 animate-in fade-in duration-150">
                        {(() => {
                          const selectedQuestions = questions.filter((q) => selectedQuestionIds.includes(q.id));
                          const hasIncompleteSelected = selectedQuestions.some(isQuestionIncomplete);
                          return (
                            <button
                              type="button"
                              disabled={isBulkProcessing || hasIncompleteSelected}
                              onClick={handleBulkApproveQuestions}
                              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-700 px-4 py-2 text-xs font-extrabold text-white hover:bg-emerald-800 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-emerald-700 cursor-pointer shadow-xs transition-all"
                              title={hasIncompleteSelected ? "Uma ou mais questões selecionadas estão incompletas" : undefined}
                            >
                              <CheckCircle2 className="h-4 w-4" />
                              Aprovar Selecionadas ({selectedQuestionIds.length})
                            </button>
                          );
                        })()}
                        <button
                          type="button"
                          disabled={isBulkProcessing}
                          onClick={handleBulkRejectQuestions}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-100 border border-rose-200 disabled:opacity-50 cursor-pointer transition-all"
                        >
                          <XCircle className="h-4 w-4 text-rose-600" />
                          Descartar Selecionadas
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedQuestionIds([])}
                          className="text-xs font-bold text-slate-500 hover:text-slate-800 px-2 py-1 cursor-pointer"
                        >
                          Limpar Seleção
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs font-medium text-slate-400">
                        Marque as questões para aprovar várias de uma só vez
                      </span>
                    )}
                  </div>
                )}

                {/* Lista Ampla de Questões */}
                <div className="space-y-5">
                  {filteredQuestions.length === 0 ? (
                    <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
                      <HelpCircle className="mx-auto h-10 w-10 text-slate-300" />
                      <p className="mt-3 text-sm font-bold text-slate-700">Nenhuma questão nesta categoria.</p>
                      <p className="mt-1 text-xs text-slate-400">Envie materiais na Base de Conhecimento para que a IA extraia questões automaticamente.</p>
                    </div>
                  ) : (
                    filteredQuestions.map((q) => {
                      const isEditing = editingQuestionId === q.id && editQuestionDraft !== null;
                      return (
                        <div
                          key={q.id}
                          className={`bg-white rounded-2xl border transition-all overflow-hidden shadow-xs ${
                            isEditing
                              ? 'border-emerald-500 ring-2 ring-emerald-200'
                            : q.status === 'reported'
                              ? 'border-rose-400 ring-2 ring-rose-200/70'
                            : q.status === 'pending_review'
                              ? 'border-amber-300 ring-2 ring-amber-100/60'
                              : 'border-slate-200'
                          }`}
                        >
                          {/* Status & Metadados do Card */}
                          <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/60 px-6 py-3.5">
                            <div className="flex flex-wrap items-center gap-2.5">
                              <input
                                type="checkbox"
                                checked={selectedQuestionIds.includes(q.id)}
                                onChange={() => toggleSelectQuestion(q.id)}
                                className="h-4 w-4 rounded border-slate-300 text-emerald-700 focus:ring-emerald-500 cursor-pointer shrink-0"
                                title="Selecionar esta questão"
                              />
                              <span className="rounded-md bg-emerald-50 text-emerald-900 px-2.5 py-1 text-xs font-bold border border-emerald-100">
                                {q.topicName}
                              </span>
                              <span className="text-xs text-slate-400 truncate max-w-xs" title={q.sourceDocName}>
                                Origem: <strong>{q.sourceDocName}</strong>
                              </span>
                              {q.originType === 'source_doc' ? (
                                <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-800 border border-blue-200" title="Questão com embasamento em documento fonte">
                                  <FileText className="h-3 w-3 text-blue-700" /> Revisão Simples (Doc Fonte)
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 rounded-md bg-purple-50 px-2 py-0.5 text-[11px] font-bold text-purple-800 border border-purple-200" title="Questão gerada autonomamente por IA">
                                  <Sparkles className="h-3 w-3 text-purple-700" /> Revisão de IA (Sintética)
                                </span>
                              )}
                              {isQuestionNoTopic(q) && (
                                <span className="inline-flex items-center gap-1 rounded-md bg-rose-50 px-2 py-0.5 text-[11px] font-bold text-rose-800 border border-rose-200" title="Sem categoria/tópico associado">
                                  <AlertTriangle className="h-3 w-3 text-rose-600" /> Sem Tópico
                                </span>
                              )}
                              {isQuestionNoOptions(q) && (
                                <span className="inline-flex items-center gap-1 rounded-md bg-rose-50 px-2 py-0.5 text-[11px] font-bold text-rose-800 border border-rose-200" title="Sem alternativas preenchidas">
                                  <AlertTriangle className="h-3 w-3 text-rose-600" /> Sem Alternativas
                                </span>
                              )}
                              {isQuestionNoAnswer(q) && (
                                <span className="inline-flex items-center gap-1 rounded-md bg-rose-50 px-2 py-0.5 text-[11px] font-bold text-rose-800 border border-rose-200" title="Sem gabarito / resposta correta">
                                  <AlertTriangle className="h-3 w-3 text-rose-600" /> Sem Gabarito
                                </span>
                              )}
                              {isQuestionNoExplanation(q) && (
                                <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-800 border border-amber-200" title="Sem explicação / resolução">
                                  <AlertTriangle className="h-3 w-3 text-amber-600" /> Sem Explicação
                                </span>
                              )}
                              {isEditing && (
                                <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100 px-2 py-0.5 text-[11px] font-extrabold text-emerald-900 animate-pulse">
                                  ✏️ Modo de Edição
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-2">
                              {q.status === 'reported' ? (
                                <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-100 px-3 py-1 text-xs font-extrabold text-rose-900 border border-rose-300 animate-pulse">
                                  <AlertCircle className="h-3.5 w-3.5 text-rose-700" />
                                  Reportada para revisão
                                </span>
                              ) : q.status === 'pending_review' ? (
                                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-extrabold text-amber-900 border border-amber-200">
                                  <Clock className="h-3.5 w-3.5 text-amber-700" />
                                  Aguardando Aprovação
                                </span>
                              ) : q.status === 'approved' ? (
                                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-extrabold text-emerald-900 border border-emerald-200">
                                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-700" />
                                  Aprovada para Alunos
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-100 px-3 py-1 text-xs font-extrabold text-rose-900 border border-rose-200">
                                  Descartada
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Enunciado e Opções */}
                          {isEditing ? (
                            <div className="p-6 space-y-5 bg-emerald-50/10">
                              {/* 0. Seletores de Matéria e Tópico */}
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 p-3.5 rounded-xl bg-white border border-slate-200 shadow-2xs">
                                <div>
                                  <label className="text-xs font-extrabold uppercase tracking-wider text-slate-700 block mb-1">
                                    Matéria / Disciplina:
                                  </label>
                                  <select
                                    value={editQuestionDraft.subjectId || ''}
                                    onChange={(e) => {
                                      const newSubId = e.target.value;
                                      const foundSub = monitor?.subjects?.find((s) => s.id === newSubId);
                                      setEditQuestionDraft({
                                        ...editQuestionDraft,
                                        subjectId: newSubId,
                                        subjectName: foundSub?.name,
                                        topicId: '',
                                        topicName: 'Sem Tópico',
                                      });
                                    }}
                                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-900 focus:border-emerald-600 focus:outline-hidden"
                                  >
                                    {!editQuestionDraft.subjectId && (
                                      <option value="">-- Selecione a Matéria --</option>
                                    )}
                                    {(monitor?.subjects || []).map((sub) => (
                                      <option key={sub.id} value={sub.id}>
                                        {sub.name}
                                      </option>
                                    ))}
                                  </select>
                                </div>

                                <div>
                                  <label className="text-xs font-extrabold uppercase tracking-wider text-slate-700 block mb-1">
                                    Tópico da Matéria:
                                  </label>
                                  <select
                                    value={editQuestionDraft.topicId || ''}
                                    onChange={(e) => {
                                      const newTopId = e.target.value;
                                      const currentSub = monitor?.subjects?.find(
                                        (s) => s.id === editQuestionDraft.subjectId
                                      );
                                      const foundTopic = currentSub?.topicRefs?.find((t) => t.id === newTopId);
                                      setEditQuestionDraft({
                                        ...editQuestionDraft,
                                        topicId: newTopId,
                                        topicName: foundTopic ? foundTopic.name : 'Sem Tópico',
                                      });
                                    }}
                                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-900 focus:border-emerald-600 focus:outline-hidden"
                                  >
                                    <option value="">⚠️ Não Categorizado (Selecione um Tópico)</option>
                                    {(() => {
                                      const currentSub = monitor?.subjects?.find(
                                        (s) => s.id === editQuestionDraft.subjectId
                                      );
                                      const topics = currentSub?.topicRefs || [];
                                      return topics.map((top) => (
                                        <option key={top.id} value={top.id}>
                                          {top.name}
                                        </option>
                                      ));
                                    })()}
                                  </select>
                                </div>
                              </div>

                              {/* 1. Título / Enunciado */}
                              <div className="space-y-1.5">
                                <label className="text-xs font-extrabold uppercase tracking-wider text-slate-700 block">
                                  Enunciado / Título da Pergunta:
                                </label>
                                <textarea
                                  value={editQuestionDraft.prompt}
                                  onChange={(e) => setEditQuestionDraft({ ...editQuestionDraft, prompt: e.target.value })}
                                  className="w-full rounded-xl border border-slate-300 bg-white p-3.5 text-sm font-bold text-slate-900 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-200 outline-none transition-all resize-y min-h-[90px] shadow-2xs"
                                  rows={3}
                                  placeholder="Digite o enunciado da questão..."
                                />
                              </div>

                              {/* 2. Alternativas */}
                              <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                  <label className="text-xs font-extrabold uppercase tracking-wider text-slate-700">
                                    Alternativas:
                                  </label>
                                  <span className="text-[11px] text-slate-500 font-medium">
                                    Clique na letra para definir como <strong>gabarito correto</strong>
                                  </span>
                                </div>

                                <div className="grid gap-2.5">
                                  {editQuestionDraft.options.map((opt, idx) => {
                                    const isCorrect = opt.letter === editQuestionDraft.correctAnswer;
                                    return (
                                      <div
                                        key={opt.letter}
                                        className={`flex items-center gap-3 p-2.5 rounded-xl border transition-all ${
                                          isCorrect
                                            ? 'bg-emerald-50 border-emerald-400 ring-2 ring-emerald-200/50'
                                            : 'bg-white border-slate-200 hover:border-slate-300'
                                        }`}
                                      >
                                        <button
                                          type="button"
                                          onClick={() => setEditQuestionDraft({ ...editQuestionDraft, correctAnswer: opt.letter })}
                                          className={`shrink-0 flex items-center justify-center h-8 w-8 rounded-lg text-xs font-black cursor-pointer transition-all ${
                                            isCorrect
                                              ? 'bg-emerald-700 text-white shadow-xs scale-105 ring-2 ring-emerald-600/30'
                                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                          }`}
                                          title={isCorrect ? 'Alternativa Correta (Gabarito)' : `Marcar ${opt.letter} como Gabarito`}
                                        >
                                          {opt.letter}
                                        </button>
                                        <input
                                          type="text"
                                          value={opt.text}
                                          onChange={(e) => {
                                            const newOptions = [...editQuestionDraft.options];
                                            newOptions[idx] = { ...opt, text: e.target.value };
                                            setEditQuestionDraft({ ...editQuestionDraft, options: newOptions });
                                          }}
                                          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-300 outline-none"
                                          placeholder={`Texto da alternativa ${opt.letter}...`}
                                        />
                                        {isCorrect && (
                                          <span className="shrink-0 text-[10px] font-extrabold text-emerald-800 uppercase tracking-wider bg-emerald-100 px-2 py-1 rounded-md border border-emerald-200">
                                            Gabarito
                                          </span>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>

                              {/* 3. Resolução Comentada */}
                              <div className="space-y-1.5 pt-1">
                                <label className="text-xs font-extrabold uppercase tracking-wider text-emerald-900 block">
                                  Resolução Comentada / Justificativa:
                                </label>
                                <textarea
                                  value={editQuestionDraft.explanation}
                                  onChange={(e) => setEditQuestionDraft({ ...editQuestionDraft, explanation: e.target.value })}
                                  className="w-full rounded-xl border border-slate-300 bg-white p-3 text-xs text-slate-800 font-medium focus:border-emerald-600 focus:ring-2 focus:ring-emerald-200 outline-none transition-all resize-y min-h-[75px] shadow-2xs"
                                  rows={3}
                                  placeholder="Digite a resolução ou justificativa pedagógica..."
                                />
                              </div>
                            </div>
                          ) : (
                            <div className="p-6 space-y-4">
                              <p className="text-base font-bold text-[#132E20] leading-relaxed">{q.prompt}</p>

                              <div className="grid gap-2.5 sm:grid-cols-2">
                                {q.options.map((opt) => {
                                  const isCorrect = opt.letter === q.correctAnswer;
                                  return (
                                    <div
                                      key={opt.letter}
                                      className={`flex items-start gap-3 p-3 rounded-xl border text-sm transition-all ${
                                        isCorrect
                                          ? 'bg-emerald-50/90 border-emerald-300 font-semibold text-emerald-950'
                                          : 'bg-slate-50/50 border-slate-200 text-slate-700'
                                      }`}
                                    >
                                      <span
                                        className={`shrink-0 flex items-center justify-center h-6 w-6 rounded-lg text-xs font-extrabold ${
                                          isCorrect ? 'bg-emerald-700 text-white' : 'bg-slate-200 text-slate-700'
                                        }`}
                                      >
                                        {opt.letter}
                                      </span>
                                      <span className="pt-0.5">{opt.text}</span>
                                    </div>
                                  );
                                })}
                              </div>

                              {/* Resolução Comentada */}
                              {q.explanation ? (
                                <div className="mt-4 rounded-xl bg-slate-50 p-4 border border-slate-200/70">
                                  <p className="text-xs font-bold uppercase tracking-wider text-emerald-800">Resolução Comentada / Justificativa IA:</p>
                                  <p className="mt-1 text-xs text-slate-600 leading-relaxed">{q.explanation}</p>
                                </div>
                              ) : (
                                <div className="mt-4 rounded-xl bg-amber-50/70 p-3.5 border border-amber-200/80 flex items-center justify-between gap-3">
                                  <div className="flex items-center gap-2">
                                    <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                                    <span className="text-xs font-bold text-amber-900">Esta questão não possui resolução/explicação cadastrada.</span>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => handleStartEditQuestion(q)}
                                    className="text-[11px] font-bold text-amber-800 underline hover:text-amber-950 cursor-pointer"
                                  >
                                    Adicionar Explicação
                                  </button>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Barra de Ações da Esteira do Professor */}
                          {isEditing ? (
                            <div className="flex items-center justify-between border-t border-slate-200 bg-slate-100/70 px-6 py-3.5">
                              <button
                                type="button"
                                onClick={handleCancelEditQuestion}
                                disabled={isSavingQuestion}
                                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-all cursor-pointer disabled:opacity-50"
                              >
                                <X className="h-4 w-4" />
                                <span>Cancelar</span>
                              </button>

                              <button
                                type="button"
                                onClick={handleSaveQuestionEdit}
                                disabled={isSavingQuestion}
                                className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-5 py-2 text-xs font-bold text-white hover:bg-emerald-800 shadow-xs transition-all cursor-pointer disabled:opacity-50"
                              >
                                {isSavingQuestion ? (
                                  <LoaderCircle className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Save className="h-4 w-4" />
                                )}
                                <span>Salvar Questão</span>
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/40 px-6 py-3.5">
                              <button
                                type="button"
                                onClick={() => handleQuestionAction(q.id, 'rejected')}
                                className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-600 hover:text-rose-800 transition-colors"
                              >
                                <Trash2 className="h-4 w-4" />
                                <span>Descartar</span>
                              </button>

                              <div className="flex items-center gap-3">
                                <button
                                  type="button"
                                  onClick={() => handleStartEditQuestion(q)}
                                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 shadow-2xs transition-all cursor-pointer"
                                >
                                  <Edit3 className="h-3.5 w-3.5" />
                                  <span>Editar</span>
                                </button>

                                {q.status !== 'approved' && (
                                  <button
                                    type="button"
                                    disabled={isQuestionIncomplete(q)}
                                    onClick={() => handleQuestionAction(q.id, 'approved')}
                                    className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-800 px-5 py-2 text-xs font-bold text-white hover:bg-emerald-900 shadow-2xs transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-emerald-800"
                                    title={isQuestionIncomplete(q) ? "Preencha todos os campos obrigatórios antes de aprovar" : undefined}
                                  >
                                    <Check className="h-4 w-4" />
                                    <span>Aprovar Questão</span>
                                  </button>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
  );
}
