import React, { useState } from 'react';
import { AlertTriangle, BookOpen, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, FolderTree, Plus, Trash2, X } from 'lucide-react';
import type { TeacherMonitor } from '@/modules/teacher/services/TeacherMonitorService';
import { isTeacherDocumentProcessing, isTeacherDocumentValid, type TeacherDocumentStatus } from '@/modules/teacher/models/document-status';

type SidebarItem = { subjectId?: string; subjectName?: string; topicId?: string; topicName?: string; status: TeacherDocumentStatus | string };
type PublishValidation = { canPublish: boolean; reason: string; completedTopics: number; totalTopics: number };

export interface MonitorStructureSidebarProps {
  monitor: TeacherMonitor;
  selectedSubject: TeacherMonitor['subjects'][number] | null;
  selectedSubjectId: string | null;
  selectedTopic: string | null;
  selectedTopicId?: string;
  sidebarView: 'structure' | 'settings';
  publishValidation: PublishValidation;
  documents: SidebarItem[];
  questions: SidebarItem[];
  flashcards: SidebarItem[];
  activeTopicInputSubjectId: string | null;
  newTopicName: string;
  newTopicDefinition: string;
  openAddSubjectModal: () => void;
  selectSubject: (subjectId: string) => void;
  setActiveTopicInputSubjectId: (subjectId: string | null) => void;
  setNewTopicName: (value: string) => void;
  setNewTopicDefinition: (value: string) => void;
  handleDeleteSubject: (subjectId: string) => void;
  handleAddTopic: (subjectId: string) => void;
  setSelectedSubjectId: (subjectId: string) => void;
  setSelectedTopic: (topic: string) => void;
  handleDeleteTopic: (subjectId: string, topicId: string | undefined, topic: string) => void;
}

export function MonitorStructureSidebar({
  monitor, selectedSubject, selectedSubjectId, selectedTopic, selectedTopicId, sidebarView, publishValidation,
  documents, questions, flashcards, activeTopicInputSubjectId, newTopicName, newTopicDefinition,
  openAddSubjectModal, selectSubject, setActiveTopicInputSubjectId, setNewTopicName, setNewTopicDefinition,
  handleDeleteSubject, handleAddTopic, setSelectedSubjectId, setSelectedTopic, handleDeleteTopic,
}: MonitorStructureSidebarProps) {
  void selectedSubjectId;
  void selectedTopicId;

  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);
  const [expandedTopics, setExpandedTopics] = useState<Record<string, boolean>>({});
  const [expandedSubtopics, setExpandedSubtopics] = useState<Record<string, boolean>>({});

  const renderStatus = (topicDocs: SidebarItem[], topicQuestions: SidebarItem[]) => {
    const hasReported = topicQuestions.some((question) => question.status === 'reported');
    if (hasReported) {
      return <span className="text-[9px] font-extrabold text-rose-700 bg-rose-100 px-1.5 py-0.5 rounded border border-rose-300 shrink-0 ml-1.5">Reportada</span>;
    }
    if (topicDocs.length > 0 && topicQuestions.length > 0) {
      return <span title="Tópico pronto: Base de Conhecimento e Questões verificadas"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0 ml-1.5" aria-label="Tópico pronto: Base de Conhecimento e Questões verificadas" /></span>;
    }
    if (topicDocs.length === 0 && topicQuestions.length === 0) {
      return <span className="text-[9px] font-bold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200 shrink-0 ml-1.5" title="Tópico sem Base de Conhecimento e sem Questões">Vazio</span>;
    }
    return topicDocs.length === 0
      ? <span className="text-[9px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 shrink-0 ml-1.5">Falta Base</span>
      : <span className="text-[9px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 shrink-0 ml-1.5">Falta Questões</span>;
  };

  // Render quando a sidebar está recolhida (Compact Mode)
  if (isCollapsed) {
    return (
      <aside className={`w-full shrink-0 bg-white border-b border-slate-200 flex flex-col overflow-hidden shadow-2xs z-10 lg:h-full lg:w-16 lg:border-b-0 lg:border-r transition-all duration-300 ${sidebarView === 'settings' ? 'hidden' : ''}`}>
        {/* Header Recolhido (Botão para Expandir) */}
        <div className="p-3 border-b border-slate-100 flex items-center justify-center bg-slate-50/80 shrink-0">
          <button
            type="button"
            onClick={() => setIsCollapsed(false)}
            className="p-2 rounded-xl bg-emerald-50 text-emerald-800 hover:bg-emerald-100 transition-colors cursor-pointer border border-emerald-200/80 shadow-2xs flex items-center justify-center"
            title="Expandir Estrutura do Monitor"
          >
            <ChevronRight className="h-5 w-5 stroke-[2.5px]" />
          </button>
        </div>

        {/* Adicionar Matéria - Botão Compacto */}
        <div className="p-2 border-b border-slate-100 bg-slate-50/40 shrink-0 flex justify-center">
          <button
            type="button"
            onClick={openAddSubjectModal}
            className="p-2 rounded-xl border border-dashed border-emerald-300 bg-emerald-50/50 text-emerald-800 hover:bg-emerald-100 transition-all cursor-pointer"
            title="Adicionar Nova Matéria"
          >
            <Plus className="h-4 w-4 text-emerald-700" />
          </button>
        </div>

        {/* Lista Compacta de Matérias (Atalhos) */}
        <div className="flex-1 overflow-y-auto p-2 space-y-2.5 flex flex-col items-center">
          {monitor.subjects.map((subject) => {
            const isCurrentSubject = selectedSubject?.id === subject.id;

            const subjectDocuments = documents.filter(
              (d) => d.subjectId === subject.id || d.subjectName === subject.name || (d.topicName && subject.topics.includes(d.topicName))
            );
            const subjectDocs = subjectDocuments.filter((document) => isTeacherDocumentValid(document.status as TeacherDocumentStatus));
            const subjectQuestions = questions.filter(
              (q) => q.subjectId === subject.id || q.subjectName === subject.name || (q.topicName && subject.topics.includes(q.topicName))
            );
            const subjectFlashcards = flashcards.filter(
              (fc) => fc.subjectId === subject.id || fc.subjectName === subject.name || (fc.topicName && subject.topics.includes(fc.topicName))
            );

            const hasSubjectPending =
              subjectQuestions.some((q) => q.status === 'pending_review') ||
              subjectFlashcards.some((fc) => fc.status === 'pending_review') ||
              subjectDocuments.some((d) => isTeacherDocumentProcessing(d.status as TeacherDocumentStatus));
            const hasSubjectReported = subjectQuestions.some((q) => q.status === 'reported');
            const isSubjectEmpty =
              subject.topics.length === 0 ||
              subjectDocs.length + subjectQuestions.length + subjectFlashcards.length === 0;

            return (
              <button
                key={subject.id}
                type="button"
                onClick={() => {
                  selectSubject(subject.id);
                  setIsCollapsed(false);
                }}
                className={`relative p-2.5 rounded-xl border transition-all cursor-pointer flex flex-col items-center justify-center ${
                  isCurrentSubject
                    ? 'bg-emerald-800 text-white border-emerald-900 shadow-xs'
                    : hasSubjectReported
                    ? 'bg-rose-50 border-rose-300 text-rose-900'
                    : hasSubjectPending
                    ? 'bg-amber-50 border-amber-300 text-amber-900'
                    : isSubjectEmpty
                    ? 'bg-white border-rose-200 text-slate-700 hover:bg-slate-50'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
                title={`Matéria: ${subject.name} (${subject.topics.length} tópicos) - Clique para expandir`}
              >
                <BookOpen className={`h-4 w-4 ${isCurrentSubject ? 'text-emerald-200' : hasSubjectReported ? 'text-rose-700' : 'text-emerald-700'}`} />
                <span className="text-[9px] font-extrabold mt-0.5">{subject.topics.length}</span>

                {/* Dot Indicador */}
                {hasSubjectReported ? (
                  <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-600"></span>
                  </span>
                ) : hasSubjectPending ? (
                  <span className="absolute -top-1 -right-1 flex h-2 w-2">
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </aside>
    );
  }

  return (
    <aside className={`h-[40vh] w-full shrink-0 bg-white border-b border-slate-200 flex flex-col overflow-hidden shadow-2xs z-10 lg:h-full lg:w-80 lg:border-b-0 lg:border-r transition-all duration-300 ${sidebarView === 'settings' ? 'hidden' : ''}`}>
      <div className="px-4 py-3.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <FolderTree className="h-4 w-4 text-emerald-700 shrink-0" aria-hidden="true" />
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 truncate">Estrutura do Monitor</h2>
        </div>
        
        <div className="flex items-center gap-2 shrink-0">
          {publishValidation.canPublish ? (
            <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold text-emerald-800 border border-emerald-200 flex items-center gap-1" title="Todos os tópicos contêm Base de Conhecimento e Questões">
              <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Pronto
            </span>
          ) : (
            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-800 border border-amber-200 flex items-center gap-1" title={publishValidation.reason}>
              <AlertTriangle className="w-3 h-3 text-amber-600" /> {publishValidation.completedTopics}/{publishValidation.totalTopics}
            </span>
          )}

          {/* Botão de Recolher Sidebar */}
          <button
            type="button"
            onClick={() => setIsCollapsed(true)}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-200/70 transition-colors cursor-pointer"
            title="Recolher Estrutura do Monitor"
          >
            <ChevronLeft className="h-4 w-4 stroke-[2.5px]" />
          </button>
        </div>
      </div>

          {/* Adicionar Nova Matéria Button (Abre o Modal) */}
          <div className="p-3 border-b border-slate-100 bg-slate-50/40 shrink-0">
            <button
              type="button"
              onClick={openAddSubjectModal}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-emerald-300 bg-emerald-50/50 py-2 text-xs font-bold text-emerald-900 hover:bg-emerald-100/70 transition-all cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5 text-emerald-700" />
              <span>Adicionar Nova Matéria</span>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
            {monitor.subjects.map((subject) => {
              const isCurrentSubject = selectedSubject?.id === subject.id;
              const isDirectSubjectSelected = isCurrentSubject && selectedTopic === null;
              const isParentSubjectOfActiveTopic = isCurrentSubject && selectedTopic !== null;

              // Status de conteúdo da Matéria
              const subjectDocuments = documents.filter(
                (d) => d.subjectId === subject.id || d.subjectName === subject.name || (d.topicName && subject.topics.includes(d.topicName))
              );
              const subjectDocs = subjectDocuments.filter((document) => isTeacherDocumentValid(document.status as TeacherDocumentStatus));
              const subjectQuestions = questions.filter(
                (q) => q.subjectId === subject.id || q.subjectName === subject.name || (q.topicName && subject.topics.includes(q.topicName))
              );
              const subjectFlashcards = flashcards.filter(
                (fc) => fc.subjectId === subject.id || fc.subjectName === subject.name || (fc.topicName && subject.topics.includes(fc.topicName))
              );

              const hasSubjectPending =
                subjectQuestions.some((q) => q.status === 'pending_review') ||
                subjectFlashcards.some((fc) => fc.status === 'pending_review') ||
                subjectDocuments.some((d) => isTeacherDocumentProcessing(d.status as TeacherDocumentStatus));
              const hasSubjectReported = subjectQuestions.some((q) => q.status === 'reported');

              const isSubjectEmpty =
                subject.topics.length === 0 ||
                subjectDocs.length + subjectQuestions.length + subjectFlashcards.length === 0;

              return (
                <div
                  key={subject.id}
                  className={`rounded-xl border overflow-hidden shadow-2xs group transition-all ${
                    hasSubjectReported
                      ? 'border-rose-400/90 bg-rose-50/30 ring-2 ring-rose-200/70 animate-pulse'
                      : hasSubjectPending
                      ? 'border-amber-300/80 bg-white ring-1 ring-amber-200/50'
                      : isSubjectEmpty
                      ? 'border-rose-200/90 bg-white'
                      : 'border-slate-200/90 bg-white'
                  }`}
                >
                  <div
                    className={`flex w-full items-center justify-between px-3.5 py-3 text-left text-sm font-semibold transition-all ${
                      isDirectSubjectSelected
                        ? 'bg-emerald-800 text-white shadow-xs'
                        : isParentSubjectOfActiveTopic
                        ? 'bg-emerald-50/90 text-emerald-950 font-bold border-b border-emerald-100'
                        : hasSubjectReported
                        ? 'bg-rose-50/80 text-rose-950 border-b border-rose-200'
                        : 'text-slate-800 hover:bg-slate-50'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => selectSubject(subject.id)}
                      className="flex items-center gap-2 min-w-0 flex-1 text-left cursor-pointer"
                    >
                      <BookOpen className={`h-4 w-4 shrink-0 ${isDirectSubjectSelected ? 'text-emerald-200' : hasSubjectReported ? 'text-rose-700' : 'text-emerald-700'}`} aria-hidden="true" />
                      <span className="truncate">{subject.name}</span>
                      <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                        isDirectSubjectSelected ? 'bg-emerald-900 text-emerald-100' : 'bg-slate-100 text-slate-600'
                      }`}>
                        {subject.topics.length}
                      </span>

                      {/* Indicador Flashing Orange (Pendente) ou Red (Vazio) */}
                      {hasSubjectReported ? (
                        <span className="relative ml-1 flex h-2.5 w-2.5 shrink-0" title="Matéria possui questões reportadas para revisão">
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75" />
                          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-rose-600" />
                        </span>
                      ) : hasSubjectPending ? (
                        <span className="relative flex h-2.5 w-2.5 shrink-0 ml-1" title="Matéria possui conteúdos pendentes de revisão">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500"></span>
                        </span>
                      ) : isSubjectEmpty ? (
                        <span className="relative flex h-2.5 w-2.5 shrink-0 ml-1" title="Matéria vazia (sem tópicos ou sem conteúdos cadastrados)">
                          <span className="animate-pulse absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-600"></span>
                        </span>
                      ) : null}
                    </button>

                    <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={() => {
                          setActiveTopicInputSubjectId(activeTopicInputSubjectId === subject.id ? null : subject.id);
                          setNewTopicName('');
                          setNewTopicDefinition('');
                        }}
                        className={`p-1 rounded-md transition-colors cursor-pointer ${
                          isDirectSubjectSelected
                            ? 'text-emerald-100 hover:bg-emerald-700'
                            : 'text-slate-400 hover:text-emerald-700 hover:bg-slate-100'
                        }`}
                        title="Adicionar Tópico"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteSubject(subject.id)}
                        className={`p-1 rounded-md transition-colors cursor-pointer ${
                          isDirectSubjectSelected
                            ? 'text-emerald-200 hover:text-rose-200 hover:bg-emerald-700'
                            : 'text-slate-400 hover:text-rose-600 hover:bg-slate-100'
                        }`}
                        title="Remover Matéria"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Input inline de Adicionar Tópico */}
                  {activeTopicInputSubjectId === subject.id && (
                    <div className="p-2 bg-emerald-50/70 border-b border-emerald-100 space-y-1.5 animate-in fade-in">
                      <input
                        type="text"
                        placeholder="Nome do Tópico..."
                        value={newTopicName}
                        onChange={(e) => setNewTopicName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleAddTopic(subject.id);
                          else if (e.key === 'Escape') {
                            setActiveTopicInputSubjectId(null);
                            setNewTopicName('');
                          }
                        }}
                        className="flex-1 rounded-md border border-emerald-300 bg-white px-2 py-1 text-xs text-slate-800 focus:border-emerald-600 focus:outline-hidden"
                        autoFocus
                      />
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleAddTopic(subject.id)}
                          className="rounded-md bg-emerald-700 p-1 text-white hover:bg-emerald-800 transition-colors cursor-pointer"
                          title="Salvar Tópico"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setActiveTopicInputSubjectId(null);
                            setNewTopicName('');
                            setNewTopicDefinition('');
                          }}
                          className="rounded-md bg-slate-200 p-1 text-slate-600 hover:bg-slate-300 transition-colors cursor-pointer"
                          title="Cancelar"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <textarea
                        value={newTopicDefinition}
                        onChange={(event) => setNewTopicDefinition(event.target.value)}
                        placeholder="Definição do tópico (opcional)"
                        maxLength={4000}
                        className="min-h-16 w-full rounded-md border border-emerald-300 bg-white px-2 py-1.5 text-xs text-slate-800 focus:border-emerald-600 focus:outline-hidden"
                      />
                    </div>
                  )}

                  {/* Árvore de Tópicos: tópico raiz → subtópico → subsubtópico */}
                  <div className="p-2 space-y-1 bg-slate-50/40">
                    {subject.topicRefs.map((topicRef) => {
                      const topic = topicRef.name;
                      const topicId = topicRef.id;
                      const topicKey = `${subject.id}:${topicId}`;
                      const isExpanded = expandedTopics[topicKey] ?? false;
                      const isTopicSelected = selectedTopic === topic && isCurrentSubject;
                      const topicDocs = documents.filter((item) =>
                        (item.topicName === topic || item.topicId === topicId)
                        && isTeacherDocumentValid(item.status as TeacherDocumentStatus)
                      );
                      const topicQuestions = questions.filter((item) => item.topicName === topic || item.topicId === topicId);
                      const hasTopicReported = topicQuestions.some((question) => question.status === 'reported');
                      const subtopics = topicRef.subtopics ?? [];

                      return (
                        <div key={topicKey} className="space-y-0.5">
                          <div className={`flex items-center rounded-lg text-xs transition-all group/topic ${hasTopicReported ? 'border border-rose-300 bg-rose-50 text-rose-950 font-bold shadow-2xs animate-pulse' : isTopicSelected ? 'bg-emerald-100 text-emerald-950 font-bold shadow-2xs border border-emerald-200' : 'text-slate-700 hover:bg-white hover:text-slate-900 hover:shadow-2xs'}`}>
                            <button type="button" onClick={() => setExpandedTopics((current) => ({ ...current, [topicKey]: !isExpanded }))} className="p-1.5 text-slate-400 hover:text-emerald-700 cursor-pointer" aria-label={`${isExpanded ? 'Recolher' : 'Expandir'} ${topic}`}>
                              {subtopics.length > 0 ? (isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />) : <span className="inline-block w-3.5" />}
                            </button>
                            <button type="button" onClick={() => { setSelectedSubjectId(subject.id); setSelectedTopic(topic); }} className={`flex min-w-0 flex-1 items-center justify-between py-1.5 pr-1 text-left cursor-pointer ${hasTopicReported ? 'border-l-2 border-rose-500 pl-2' : 'border-l-2 border-slate-300 pl-2'}`}>
                              <span className="truncate">{topic}</span>
                              {renderStatus(topicDocs, topicQuestions)}
                            </button>
                            <button type="button" onClick={() => handleDeleteTopic(subject.id, topicId, topic)} className="mr-1 p-0.5 text-slate-400 opacity-0 group-hover/topic:opacity-100 hover:text-rose-600 rounded transition-all cursor-pointer" title="Remover Tópico"><X className="h-3.5 w-3.5" /></button>
                          </div>

                          {isExpanded && subtopics.length > 0 && (
                            <div className="ml-4 space-y-0.5 border-l border-slate-200 pl-1.5">
                              {subtopics.map((subtopic) => {
                                const subtopicKey = `${topicKey}:${subtopic.id}`;
                                const subtopicExpanded = expandedSubtopics[subtopicKey] ?? false;
                                const subsubtopics = subtopic.subsubtopics ?? [];
                                const selectionName = `${topic} > ${subtopic.name}`;
                                return (
                                  <div key={subtopicKey}>
                                    <div className={`flex items-center rounded-md text-xs ${selectedTopic === selectionName && isCurrentSubject ? 'bg-emerald-100 text-emerald-950 font-semibold' : 'text-slate-600 hover:bg-white'}`}>
                                      <button type="button" onClick={() => setExpandedSubtopics((current) => ({ ...current, [subtopicKey]: !subtopicExpanded }))} className="p-1.5 text-slate-400 hover:text-emerald-700 cursor-pointer" aria-label={`${subtopicExpanded ? 'Recolher' : 'Expandir'} ${subtopic.name}`}>
                                        {subsubtopics.length > 0 ? (subtopicExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />) : <span className="inline-block w-3.5" />}
                                      </button>
                                      <button type="button" onClick={() => { setSelectedSubjectId(subject.id); setSelectedTopic(selectionName); }} className="flex min-w-0 flex-1 items-center justify-between py-1.5 pr-1 text-left cursor-pointer">
                                        <span className="truncate">{subtopic.name}</span>
                                      </button>
                                    </div>
                                    {subtopicExpanded && subsubtopics.length > 0 && (
                                      <div className="ml-5 space-y-0.5 border-l border-slate-200 pl-2">
                                        {subsubtopics.map((subsubtopic) => {
                                          const leafName = `${selectionName} > ${subsubtopic.name}`;
                                          return (
                                            <button key={subsubtopic.id} type="button" onClick={() => { setSelectedSubjectId(subject.id); setSelectedTopic(leafName); }} className={`flex w-full items-center justify-between rounded-md py-1.5 pl-2 pr-1 text-left text-xs cursor-pointer ${selectedTopic === leafName && isCurrentSubject ? 'bg-emerald-100 text-emerald-950 font-semibold' : 'text-slate-600 hover:bg-white hover:text-slate-900'}`}>
                                              <span className="truncate">{subsubtopic.name}</span>
                                            </button>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
    </aside>
  );
}
