'use client';

import type { ChangeEvent, Dispatch, RefObject, SetStateAction } from 'react';
import { AlertCircle, AlertTriangle, BrainCircuit, Check, CheckCircle2, Clock, Edit3, FileText, Filter, HelpCircle, LoaderCircle, Plus, Send, Sparkles, Trash2, Upload, XCircle, RotateCcw } from 'lucide-react';

type UploadStatus = 'staged' | 'uploading' | 'uploaded' | 'failed';
type UploadItem = { id: string; file: File; topicId: string; status: UploadStatus; error?: string };
type FlashcardItem = {
  id: string;
  topicName: string;
  sourceDocName: string;
  originType: 'source_doc' | 'ai_generated';
  difficulty: 'Fácil' | 'Médio' | 'Difícil' | string;
  status: 'pending_review' | 'approved' | 'rejected' | string;
  front: string;
  back: string;
};

type FlashcardReviewProps = {
  // The extracted JSX forwards the remaining page-local values without changing their runtime behavior.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
  flashcardFileInputRef: RefObject<HTMLInputElement | null>;
  selectedTopicId: string | null | undefined;
  isSubmittingUploads: boolean;
  handleFilesSelected: (event: ChangeEvent<HTMLInputElement>) => void;
  showAlert: (title: string, message: string, type?: 'error' | 'success' | 'warning' | 'info') => void;
  queuedUploads: UploadItem[];
  setUploadsByView: Dispatch<SetStateAction<Record<'knowledge' | 'questions' | 'flashcards', UploadItem[]>>>;
  setSelectedFlashcardIds: Dispatch<SetStateAction<string[]>>;
  selectedFlashcardIds: string[];
  scopeFlashcards: FlashcardItem[];
  filteredFlashcards: FlashcardItem[];
};

// Kept as an interface because the extraction contract exposes this named extension point.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface MonitorFlashcardsReviewTabProps extends FlashcardReviewProps {}

export function MonitorFlashcardsReviewTab(props: MonitorFlashcardsReviewTabProps) {
  const { flashcardFileInputRef, selectedTopicId, isSubmittingUploads, handleFilesSelected, showAlert, queuedUploads, setUploadsByView, formatFileSize, stagedCount, setIsUploadConfirmModalOpen, isDraggingFiles, setIsDraggingFiles, queueFiles, reviewFilter, setReviewFilter, pendingFlashcardsCount, approvedFlashcardsCount, sourceDocFlashcardsCount, aiGeneratedFlashcardsCount, handleOpenCreateFlashcardModal, filteredFlashcards, scopeFlashcards, selectedFlashcardIds, setSelectedFlashcardIds, isBulkProcessing, handleBulkApproveFlashcards, handleBulkRejectFlashcards, toggleSelectFlashcard, isFlashcardNoTopic, handleStartEditFlashcard, handleFlashcardAction } = props;
  return (
    <div className="max-w-5xl mx-auto space-y-6">
    <input
      ref={flashcardFileInputRef}
      type="file"
      multiple
      accept=".pdf,.doc,.docx,.txt"
      className="sr-only"
      disabled={!selectedTopicId || isSubmittingUploads}
      onChange={handleFilesSelected}
    />

    {/* 1. ACIMA: Bloco de Upload / Fila de Documentos para Flashcards via IA */}
    <div className="bg-white rounded-2xl border border-purple-200/80 p-5 shadow-xs space-y-4 bg-gradient-to-r from-purple-50/30 to-white">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2.5 rounded-xl bg-purple-100 text-purple-800 border border-purple-200 shadow-2xs">
            <Sparkles className="h-4 w-4 text-purple-700" />
          </div>
          <div>
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-purple-950">Geração Inteligente de Flashcards via IA</h3>
            <p className="text-[11px] font-medium text-slate-500">Envie arquivos (PDF, DOC, DOCX, TXT) associados a este tópico para extrair flashcards com a tag <span className="font-mono text-purple-700 font-bold">flashcards</span>.</p>
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
            flashcardFileInputRef.current?.click();
          }}
          className="inline-flex items-center gap-1.5 rounded-xl bg-purple-700 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-purple-800 transition-all cursor-pointer disabled:opacity-50 shadow-2xs"
        >
          <Upload className="h-3.5 w-3.5" />
          <span>Selecionar Arquivo</span>
        </button>
      </div>

      {/* Fila de arquivos selecionados */}
      {queuedUploads.length > 0 ? (
        <div className="overflow-hidden rounded-xl border border-purple-200 bg-white shadow-xs">
          <div className="flex items-center justify-between border-b border-purple-100 bg-purple-50/80 px-4 py-2.5">
            <p className="text-xs font-bold text-purple-950 flex items-center gap-2">
              <FileText className="h-3.5 w-3.5 text-purple-700" />
              Arquivos na Fila de Flashcards ({queuedUploads.length})
            </p>
            {!isSubmittingUploads && (
              <button
                type="button"
                onClick={() => setUploadsByView((u) => ({ ...u, flashcards: [] }))}
                className="text-[11px] font-semibold text-slate-400 hover:text-rose-700 transition-colors cursor-pointer"
              >
                Limpar fila
              </button>
            )}
          </div>

          <ul className="divide-y divide-purple-50 max-h-48 overflow-y-auto">
            {queuedUploads.map(({ id, file, status, error: uploadError }) => (
              <li key={id} className="flex items-center justify-between px-4 py-2.5 hover:bg-purple-50/30">
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="h-4 w-4 text-purple-700 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-800 truncate max-w-[200px]" title={file.name}>{file.name}</p>
                    <p className="text-[10px] text-slate-400">{formatFileSize(file.size)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {status === 'staged' && (
                    <span className="text-[10px] font-bold text-purple-900 bg-purple-100 px-2.5 py-1 rounded-full flex items-center gap-1 border border-purple-200">
                      <Clock className="h-3 w-3 text-purple-600" /> Pronto p/ Enviar (tag: flashcards)
                    </span>
                  )}
                  {status === 'uploading' && (
                    <span className="text-[10px] font-bold text-purple-900 bg-purple-100 px-2.5 py-1 rounded-full flex items-center gap-1.5 border border-purple-200">
                      <LoaderCircle className="h-3 w-3 animate-spin text-purple-700" /> Enviando...
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

          <div className="flex items-center justify-between border-t border-purple-100 bg-purple-50/50 px-4 py-2.5">
            <p className="text-[10px] text-slate-500 font-medium">{stagedCount} arquivo(s) pronto(s) para envio ao fluxo de Flashcards</p>
            <button
              type="button"
              onClick={() => setIsUploadConfirmModalOpen(true)}
              disabled={isSubmittingUploads || stagedCount === 0}
              className="inline-flex items-center gap-1.5 rounded-lg bg-purple-700 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-purple-800 disabled:opacity-50 transition-all cursor-pointer"
            >
              {isSubmittingUploads ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              <span>Enviar para Gerar Flashcards</span>
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
            flashcardFileInputRef.current?.click();
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
              ? 'border-purple-600 bg-purple-100/70 shadow-inner scale-[0.99]'
              : 'border-purple-200 bg-purple-50/40 hover:border-purple-500 hover:bg-purple-50/80 hover:shadow-xs'
          }`}
        >
          <div className="p-2 bg-white rounded-full shadow-2xs mb-2 text-purple-700 border border-purple-100">
            <Upload className="h-5 w-5" />
          </div>
          <span className="text-xs font-bold text-purple-950">Arraste arquivos de estudo aqui ou clique para selecionar</span>
          <span className="mt-0.5 text-[10px] text-slate-500">PDF, DOC, DOCX ou TXT serão enviados ao fluxo com a tag <strong className="text-purple-700">flashcards</strong></span>
        </button>
      )}
    </div>

    {/* 2. ABAIXO DO UPLOAD: UMA ÚNICA LINHA COM OS FILTROS E AÇÕES */}
    <div className="bg-white rounded-2xl border border-slate-200 p-3.5 px-4 flex items-center justify-between gap-3 shadow-xs flex-nowrap overflow-x-auto">
      <div className="flex items-center gap-2.5 shrink-0 min-w-0">
        <div className="flex items-center gap-1.5 text-slate-500 shrink-0">
          <Filter className="h-4 w-4 text-slate-400" />
          <span className="text-xs font-bold uppercase tracking-wider hidden sm:inline">Filtrar:</span>
        </div>

        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl flex-nowrap overflow-x-auto">
          <button
            type="button"
            onClick={() => setReviewFilter('all')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer whitespace-nowrap ${
              reviewFilter === 'all' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Todos ({scopeFlashcards.length})
          </button>
          <button
            type="button"
            onClick={() => setReviewFilter('pending')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
              reviewFilter === 'pending' ? 'bg-amber-500 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Clock className="h-3.5 w-3.5" />
            Pendentes ({pendingFlashcardsCount})
          </button>
          <button
            type="button"
            onClick={() => setReviewFilter('approved')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
              reviewFilter === 'approved' ? 'bg-emerald-700 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            Aprovados ({approvedFlashcardsCount})
          </button>
          <button
            type="button"
            onClick={() => setReviewFilter('source_doc')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
              reviewFilter === 'source_doc' ? 'bg-blue-700 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
            }`}
            title="Flashcards extraídos com embasamento direto em documentos"
          >
            <FileText className="h-3.5 w-3.5" />
            Revisão Simples ({sourceDocFlashcardsCount})
          </button>
          <button
            type="button"
            onClick={() => setReviewFilter('ai_generated')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
              reviewFilter === 'ai_generated' ? 'bg-purple-700 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
            }`}
            title="Flashcards gerados autonomamente por IA"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Revisão de IA ({aiGeneratedFlashcardsCount})
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={handleOpenCreateFlashcardModal}
          className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-800 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-900 transition-all cursor-pointer shadow-md hover:shadow-lg active:scale-95 whitespace-nowrap"
        >
          <Plus className="h-4 w-4" />
          <span>Adicionar Flashcard Manual</span>
        </button>
      </div>
    </div>

    {/* BARRA DE AÇÕES EM LOTE PARA FLASHCARDS */}
    {filteredFlashcards.length > 0 && (
      <div className="sticky top-0 z-40 bg-white/95 backdrop-blur-md rounded-xl border border-slate-200/90 px-4 py-3 flex flex-wrap items-center justify-between gap-4 shadow-md transition-all">
        <div className="flex items-center gap-3">
          <label className="inline-flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-700 hover:text-slate-900 select-none">
            <input
              type="checkbox"
              checked={
                filteredFlashcards.length > 0 &&
                filteredFlashcards.every((fc) => selectedFlashcardIds.includes(fc.id))
              }
              onChange={() => {
                const visibleIds = filteredFlashcards.map((fc) => fc.id);
                const isAllSelected =
                  visibleIds.length > 0 && visibleIds.every((id) => selectedFlashcardIds.includes(id));
                if (isAllSelected) {
                  setSelectedFlashcardIds((prev) => prev.filter((id) => !visibleIds.includes(id)));
                } else {
                  setSelectedFlashcardIds((prev) => Array.from(new Set([...prev, ...visibleIds])));
                }
              }}
              className="h-4 w-4 rounded border-slate-300 text-emerald-700 focus:ring-emerald-500 cursor-pointer"
            />
            <span>Selecionar Todos os Flashcards ({filteredFlashcards.length})</span>
          </label>

          {selectedFlashcardIds.length > 0 && (
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-extrabold text-emerald-900 border border-emerald-200">
              {selectedFlashcardIds.length} selecionado(s)
            </span>
          )}
        </div>

        {selectedFlashcardIds.length > 0 ? (
          <div className="flex items-center gap-2 animate-in fade-in duration-150">
            <button
              type="button"
              disabled={isBulkProcessing}
              onClick={handleBulkApproveFlashcards}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-700 px-4 py-2 text-xs font-extrabold text-white hover:bg-emerald-800 disabled:opacity-50 cursor-pointer shadow-xs transition-all"
            >
              <CheckCircle2 className="h-4 w-4" />
              Aprovar Selecionados ({selectedFlashcardIds.length})
            </button>
            <button
              type="button"
              disabled={isBulkProcessing}
              onClick={handleBulkRejectFlashcards}
              className="inline-flex items-center gap-1.5 rounded-xl bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-100 border border-rose-200 disabled:opacity-50 cursor-pointer transition-all"
            >
              <XCircle className="h-4 w-4 text-rose-600" />
              Descartar Selecionados
            </button>
            <button
              type="button"
              onClick={() => setSelectedFlashcardIds([])}
              className="text-xs font-bold text-slate-500 hover:text-slate-800 px-2 py-1 cursor-pointer"
            >
              Limpar Seleção
            </button>
          </div>
        ) : (
          <span className="text-xs font-medium text-slate-400">
            Marque os flashcards para aprovar vários de uma só vez
          </span>
        )}
      </div>
    )}

    {/* LISTA DE FLASHCARDS ESTICADOS (MESMO DESIGN DAS OUTRAS TELAS, COM SIMULAÇÃO DE FLASHCARD REAL) */}
    <div className="space-y-5">
      {filteredFlashcards.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center shadow-xs">
          <BrainCircuit className="mx-auto h-12 w-12 text-emerald-300" />
          <p className="mt-3 text-sm font-bold text-slate-700">Nenhum flashcard nesta categoria.</p>
          <p className="text-xs text-slate-400 mt-1">Clique em &quot;+ Adicionar Flashcard Manual&quot; ou envie um arquivo para gerar via IA.</p>
        </div>
      ) : (
        filteredFlashcards.map((fc) => {
          return (
            <div
              key={fc.id}
              className={`bg-white rounded-2xl border transition-all overflow-hidden shadow-xs hover:shadow-md ${
                fc.status === 'pending_review'
                  ? 'border-amber-300 ring-2 ring-amber-100/60'
                  : 'border-slate-200'
              }`}
            >
              {/* Header do Card (mesmo design das outras telas) */}
              <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/60 px-6 py-3.5">
                <div className="flex flex-wrap items-center gap-2.5">
                  <input
                    type="checkbox"
                    checked={selectedFlashcardIds.includes(fc.id)}
                    onChange={() => toggleSelectFlashcard(fc.id)}
                    className="h-4 w-4 rounded border-slate-300 text-emerald-700 focus:ring-emerald-500 cursor-pointer shrink-0"
                    title="Selecionar este flashcard"
                  />
                  <span className="rounded-md bg-emerald-50 text-emerald-900 px-2.5 py-1 text-xs font-bold border border-emerald-100">
                    {fc.topicName}
                  </span>
                  <span className="text-xs text-slate-400 truncate max-w-xs" title={fc.sourceDocName}>
                    Origem: <strong>{fc.sourceDocName}</strong>
                  </span>
                  {fc.originType === 'source_doc' ? (
                    <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-800 border border-blue-200" title="Flashcard com embasamento em documento fonte">
                      <FileText className="h-3 w-3 text-blue-700" /> Revisão Simples (Doc Fonte)
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-md bg-purple-50 px-2 py-0.5 text-[11px] font-bold text-purple-800 border border-purple-200" title="Flashcard gerado autonomamente por IA">
                      <Sparkles className="h-3 w-3 text-purple-700" /> Revisão de IA (Sintética)
                    </span>
                  )}
                  {isFlashcardNoTopic(fc) && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-rose-50 px-2 py-0.5 text-[11px] font-bold text-rose-800 border border-rose-200" title="Sem categoria/tópico associado">
                      <AlertTriangle className="h-3 w-3 text-rose-600" /> Sem Tópico
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-extrabold ${
                    fc.difficulty === 'Fácil'
                      ? 'bg-emerald-100 text-emerald-900'
                      : fc.difficulty === 'Médio'
                      ? 'bg-amber-100 text-amber-900'
                      : 'bg-rose-100 text-rose-900'
                  }`}>
                    {fc.difficulty}
                  </span>

                  {fc.status === 'pending_review' ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-extrabold text-amber-900 border border-amber-200">
                      <Clock className="h-3.5 w-3.5 text-amber-700" />
                      Aguardando Aprovação
                    </span>
                  ) : fc.status === 'approved' ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-extrabold text-emerald-900 border border-emerald-200">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-700" />
                      Aprovado para Alunos
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-100 px-3 py-1 text-xs font-extrabold text-rose-900 border border-rose-200">
                      Descartado
                    </span>
                  )}
                </div>
              </div>

              {/* Body: SIMULAÇÃO DO FLASHCARD REAL DENTRO DO CARTÃO ESTICADO */}
              <div className="p-6">
                <div className="relative w-full rounded-2xl bg-gradient-to-br from-[#FAF9F6] to-white border border-amber-200/80 p-6 shadow-xs hover:shadow-md transition-all overflow-hidden group">
                  {/* Top accent: linha superior simulando topo da ficha de estudo */}
                  <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-emerald-600 via-teal-500 to-emerald-700" />

                  {/* Header visual do flashcard real */}
                  <div className="flex items-center justify-between border-b border-amber-100 pb-3 mb-4">
                    <div className="flex items-center gap-2">
                      <div className="h-3 w-3 rounded-full bg-emerald-600/30 border border-emerald-600/50 flex items-center justify-center">
                        <div className="h-1.5 w-1.5 rounded-full bg-emerald-700" />
                      </div>
                      <span className="text-[11px] font-extrabold uppercase tracking-widest text-slate-500 flex items-center gap-1.5">
                        <BrainCircuit className="h-3.5 w-3.5 text-emerald-700" />
                        Ficha de Estudo · Flashcard Real
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleStartEditFlashcard(fc)}
                      className="text-[11px] font-bold text-emerald-800 hover:text-emerald-950 flex items-center gap-1 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200/60 transition-all cursor-pointer hover:bg-emerald-100"
                    >
                      <RotateCcw className="h-3 w-3 text-emerald-700" />
                      <span>Simular / Testar no Modal</span>
                    </button>
                  </div>

                  {/* Grid Frente (Pergunta) e Verso (Resposta/Explicação) lado a lado no cartão esticado */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                    {/* LADO FRENTE (PERGUNTA) */}
                    <div className="bg-white rounded-xl p-4.5 border border-slate-200/90 shadow-2xs space-y-2 flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-900 border border-emerald-200/70 text-[10px] font-black uppercase tracking-wider">
                            <HelpCircle className="h-3 w-3 text-emerald-700" />
                            Frente (Pergunta)
                          </span>
                          <span className="text-[10px] font-bold text-slate-400">Lado 1</span>
                        </div>
                        <p className="text-sm sm:text-base font-bold text-[#132E20] leading-relaxed pt-1">
                          {fc.front}
                        </p>
                      </div>
                    </div>

                    {/* LADO VERSO (RESPOSTA / EXPLICAÇÃO) */}
                    <div className="bg-emerald-50/40 rounded-xl p-4.5 border border-emerald-200/60 shadow-2xs space-y-2 flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white text-emerald-900 border border-emerald-200 text-[10px] font-black uppercase tracking-wider shadow-2xs">
                            <Sparkles className="h-3 w-3 text-emerald-700" />
                            Verso (Resposta / Explicação)
                          </span>
                          <span className="text-[10px] font-bold text-slate-400">Lado 2</span>
                        </div>
                        <p className="text-xs sm:text-sm font-semibold text-slate-700 leading-relaxed pt-1">
                          {fc.back}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer do Card (mesmo design das outras telas) */}
              <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/40 px-6 py-3.5">
                <button
                  type="button"
                  onClick={() => handleFlashcardAction(fc.id, 'rejected')}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-600 hover:text-rose-800 transition-colors cursor-pointer"
                >
                  <Trash2 className="h-4 w-4" />
                  <span>Descartar</span>
                </button>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => handleStartEditFlashcard(fc)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 shadow-2xs transition-all cursor-pointer"
                  >
                    <Edit3 className="h-3.5 w-3.5 text-emerald-700" />
                    <span>Editar</span>
                  </button>

                  {fc.status !== 'approved' && (
                    <button
                      type="button"
                      onClick={() => handleFlashcardAction(fc.id, 'approved')}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-800 px-5 py-2 text-xs font-bold text-white hover:bg-emerald-900 shadow-2xs transition-all cursor-pointer"
                    >
                      <Check className="h-4 w-4" />
                      <span>Aprovar Flashcard</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })
      )}
    </div>


    </div>
  );
}
