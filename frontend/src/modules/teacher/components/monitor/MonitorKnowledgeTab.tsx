import type { ChangeEvent, DragEvent, RefObject } from 'react';
import { AlertCircle, CheckCircle2, Clock, FileText, FileUp, LoaderCircle, Send, Sparkles, Upload } from 'lucide-react';
import { isTeacherDocumentProcessing, type TeacherDocumentStatus } from '@/modules/teacher/models/document-status';

type UploadStatus = 'staged' | 'uploading' | 'uploaded' | 'failed';
export type MonitorKnowledgeDocument = {
  id: string;
  originalName: string;
  fileSize: number;
  status: TeacherDocumentStatus;
  subjectName?: string;
  topicName?: string;
};

export type MonitorKnowledgeUpload = {
  id: string;
  file: File;
  status: UploadStatus;
  error?: string;
};

export interface MonitorKnowledgeTabProps {
  filteredDocuments: MonitorKnowledgeDocument[];
  queuedUploads: MonitorKnowledgeUpload[];
  currentScope: string;
  selectedTopicId: string | null;
  isSubmittingUploads: boolean;
  isDraggingFiles: boolean;
  stagedCount: number;
  uploadInputRef: RefObject<HTMLInputElement | null>;
  formatFileSize: (bytes: number) => string;
  onFilesSelected: (event: ChangeEvent<HTMLInputElement>) => void;
  onQueueFiles: (files: File[]) => void;
  onDraggingChange: (isDragging: boolean) => void;
  onClearQueue: () => void;
  onOpenUploadConfirmation: () => void;
}

export function MonitorKnowledgeTab({
  filteredDocuments,
  queuedUploads,
  currentScope,
  selectedTopicId,
  isSubmittingUploads,
  isDraggingFiles,
  stagedCount,
  uploadInputRef,
  formatFileSize,
  onFilesSelected,
  onQueueFiles,
  onDraggingChange,
  onClearQueue,
  onOpenUploadConfirmation,
}: MonitorKnowledgeTabProps) {
  return (
    <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
      {/* Lista de Documentos Integrados ao Monitor - Coluna Esquerda */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs flex flex-col lg:col-span-6 min-h-[500px]">
        <div className="border-b border-slate-100 pb-4">
          <div className="flex items-center justify-between">
            <h4 className="text-base font-bold text-[#132E20] flex items-center gap-2">
              <FileText className="h-5 w-5 text-emerald-700" />
              <span>Documentos Integrados ({filteredDocuments.length})</span>
            </h4>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">Materiais já cadastrados na base de conhecimento deste monitor.</p>
          {(queuedUploads.length > 0 || filteredDocuments.some((d) => isTeacherDocumentProcessing(d.status))) && (
            <div className="mt-3 bg-amber-50/90 border border-amber-200/90 rounded-xl p-3 flex items-start gap-2.5 text-amber-900 shadow-2xs">
              <div className="p-1 bg-amber-100 rounded-lg text-amber-700 shrink-0 mt-0.5"><LoaderCircle className="h-4 w-4 animate-spin text-amber-700" /></div>
              <div className="text-xs">
                <p className="font-bold text-amber-950 flex items-center gap-1.5"><span>Analisando e processando seu documento</span></p>
                <p className="text-amber-800/90 text-[11px] mt-0.5 leading-snug">Estamos analisando o conteúdo para extrair o conhecimento. Seu documento ficará pronto em instantes!</p>
              </div>
            </div>
          )}
        </div>

        <div className="flex-1 mt-4 overflow-y-auto max-h-[600px] pr-1 space-y-3">
          {filteredDocuments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center bg-slate-50/50 rounded-xl border border-dashed border-slate-200 h-full min-h-[300px]">
              <FileText className="h-10 w-10 text-slate-300 mb-3" />
              <p className="text-xs font-semibold text-slate-600">Nenhum documento cadastrado nesta visão ainda.</p>
              <p className="text-[11px] text-slate-400 mt-1">Faça o upload de materiais ao lado para treinar o Monitor.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
              {filteredDocuments.map((doc) => (
                <div key={doc.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 hover:bg-slate-50/70 transition-colors">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="rounded-lg bg-emerald-50 p-2 text-emerald-700 shrink-0 mt-0.5"><FileText className="h-4.5 w-4.5" /></div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-800 truncate" title={doc.originalName}>{doc.originalName}</p>
                      <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-400 mt-1">
                        <span>{formatFileSize(doc.fileSize)}</span>
                        {doc.subjectName && <><span>•</span><span className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded text-[10px] font-semibold">{doc.subjectName}</span></>}
                        {doc.topicName && <><span>/</span><span className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded text-[10px] font-semibold">{doc.topicName}</span></>}
                      </div>
                    </div>
                  </div>
                  <div className="shrink-0 flex items-center self-end sm:self-center">
                    {doc.status === 'READY' && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-bold text-emerald-800"><CheckCircle2 className="h-3 w-3 text-emerald-700" /><span>Concluído</span></span>}
                    {doc.status === 'PROCESSING' && <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100/90 px-2.5 py-1 text-[11px] font-bold text-amber-900 shadow-2xs animate-pulse"><LoaderCircle className="h-3 w-3 animate-spin text-amber-700" /><span>Analisando • Pronto em instantes</span></span>}
                    {doc.status === 'QUEUED' && <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-800 border border-amber-200/60"><Clock className="h-3 w-3 text-amber-600 animate-spin" /><span>Enviado e Processando...</span></span>}
                    {doc.status === 'PARTIAL_SUCCESS' && <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-800 border border-amber-200"><AlertCircle className="h-3 w-3" /><span>Processamento parcial</span></span>}
                    {doc.status === 'NEEDS_OCR' && <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-800 border border-amber-200"><AlertCircle className="h-3 w-3" /><span>Requer OCR</span></span>}
                    {doc.status === 'FAILED' && <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-1 text-[11px] font-bold text-rose-700"><AlertCircle className="h-3 w-3" /><span>Erro</span></span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Upload de Materiais - Coluna Direita */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-5 lg:col-span-6">
        <div>
          <h4 className="text-base font-bold text-[#132E20] flex items-center gap-2"><FileUp className="h-5 w-5 text-emerald-700" /><span>Adicionar Materiais</span></h4>
          <p className="text-xs text-slate-500 mt-0.5">Envie apostilas, resumos ou livros que compõem a base de <strong className="text-emerald-950 font-semibold">{currentScope}</strong>.</p>
          {!selectedTopicId && <p className="mt-2 text-xs font-semibold text-amber-700">Selecione um tópico específico na estrutura do monitor para liberar o upload.</p>}
        </div>
        <input ref={uploadInputRef} type="file" multiple accept=".pdf,.doc,.docx,.txt" className="sr-only" disabled={!selectedTopicId || isSubmittingUploads} onChange={onFilesSelected} />
        <button type="button" disabled={!selectedTopicId || isSubmittingUploads} onClick={() => { if (selectedTopicId) uploadInputRef.current?.click(); }} onDragEnter={(e) => { e.preventDefault(); if (selectedTopicId) onDraggingChange(true); }} onDragOver={(e) => { e.preventDefault(); if (selectedTopicId) onDraggingChange(true); }} onDragLeave={(e) => { e.preventDefault(); onDraggingChange(false); }} onDrop={(e: DragEvent<HTMLButtonElement>) => { e.preventDefault(); onDraggingChange(false); if (selectedTopicId) onQueueFiles(Array.from(e.dataTransfer.files)); }} className={`flex w-full flex-col items-center justify-center border-2 border-dashed rounded-xl px-6 py-10 text-center transition-all ${!selectedTopicId || isSubmittingUploads ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'} ${isDraggingFiles ? 'border-emerald-700 bg-emerald-100/70 shadow-inner scale-[0.99]' : 'border-emerald-300 bg-emerald-50/40 hover:border-emerald-600 hover:bg-emerald-50/80 hover:shadow-xs'}`}>
          <div className="p-3 bg-white rounded-full shadow-2xs mb-3 text-emerald-700 border border-emerald-100"><Upload className="h-6 w-6" aria-hidden="true" /></div>
          <span className="text-sm font-bold text-emerald-950">Arraste arquivos aqui ou clique para selecionar</span>
          <span className="mt-1 text-[11px] text-slate-500 max-w-xs">PDF, DOC, DOCX ou TXT serão vetorizados e processados pela IA</span>
        </button>
        <div className="mt-3 rounded-xl border border-amber-200/80 bg-amber-50/70 p-3 text-[11px] text-amber-900 leading-relaxed flex items-start gap-2.5 shadow-2xs"><Sparkles className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" /><div><strong className="font-bold text-amber-950">Aviso sobre o envio:</strong> Esta é uma ferramenta de IA para auxiliar seu trabalho. O processamento dos materiais pode levar <strong>alguns minutos</strong> e, após a conclusão, você precisará <strong>revisar o conteúdo</strong> antes de liberá-lo.</div></div>
        {queuedUploads.length > 0 && (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs mt-4">
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/80 px-4 py-3"><p className="text-xs font-bold text-[#132E20]">Fila de Envio ({queuedUploads.length})</p>{!isSubmittingUploads && <button type="button" onClick={onClearQueue} className="text-[11px] font-semibold text-slate-400 hover:text-rose-700 transition-colors">Limpar fila</button>}</div>
            <ul className="divide-y divide-slate-100 max-h-48 overflow-y-auto">
              {queuedUploads.map(({ id, file, status, error: uploadError }) => (
                <li key={id} className="flex items-center justify-between px-4 py-2.5 hover:bg-slate-50/50"><div className="flex items-center gap-2 min-w-0"><FileText className="h-4 w-4 text-emerald-700 shrink-0" /><div className="min-w-0"><p className="text-xs font-semibold text-slate-800 truncate max-w-[180px]" title={file.name}>{file.name}</p><p className="text-[10px] text-slate-400">{formatFileSize(file.size)}</p></div></div><div className="flex items-center gap-2 shrink-0">{status === 'staged' && <span className="text-[10px] font-bold text-slate-700 bg-slate-100 px-2.5 py-1 rounded-full flex items-center gap-1"><Clock className="h-3 w-3 text-slate-500" /> Pronto p/ Enviar</span>}{status === 'uploading' && <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 px-2.5 py-1 rounded-full flex items-center gap-1.5"><LoaderCircle className="h-3 w-3 animate-spin text-emerald-700" /> Enviando...</span>}{status === 'uploaded' && <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100/90 px-2.5 py-1 rounded-full flex items-center gap-1.5 border border-emerald-200/80 shadow-2xs"><LoaderCircle className="h-3 w-3 animate-spin text-emerald-700" /><span>Enviado e Processando...</span></span>}{status === 'failed' && <span className="text-[10px] font-bold text-rose-700 bg-rose-50 px-2.5 py-1 rounded-full flex items-center gap-1" title={uploadError}><AlertCircle className="h-3 w-3" /> Falhou</span>}</div></li>
              ))}
            </ul>
            <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50/80 px-4 py-3"><p className="text-[10px] text-slate-500">{stagedCount} arquivos prontos</p><button type="button" onClick={onOpenUploadConfirmation} disabled={isSubmittingUploads || stagedCount === 0} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-800 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-emerald-900 disabled:opacity-50 transition-all cursor-pointer">{isSubmittingUploads ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}<span>Enviar para IA</span></button></div>
          </div>
        )}
      </div>
    </div>
  );
}
