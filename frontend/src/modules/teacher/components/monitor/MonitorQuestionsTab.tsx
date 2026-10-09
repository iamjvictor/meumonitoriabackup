'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { TeacherMonitor, TeacherMonitorService } from '@/modules/teacher/services/TeacherMonitorService';
import { MonitorHeader } from './MonitorHeader';
import { MonitorTabs } from './MonitorTabs';
import { MonitorFilters } from './MonitorFilters';
import { MonitorFlashcardsTab } from './MonitorFlashcardsTab';
import { MonitorSettingsTab } from './MonitorSettingsTab';
import { MonitorStatsTab } from './MonitorStatsTab';
import { QuestionCard } from './QuestionCard';
import { FlashcardCard } from './FlashcardCard';
import { QuestionUploadZone } from './QuestionUploadZone';
import { useMonitorQuestions } from '../../hooks/useMonitorQuestions';
import { useMonitorFlashcards } from '../../hooks/useMonitorFlashcards';
import { useQuestionUpload } from '../../hooks/useQuestionUpload';

type Item = { id: string; topicName?: string; prompt?: string; front?: string; back?: string; status?: string; explanation?: string };
export function MonitorQuestionsTab() {
  const { monitorId } = useParams<{ monitorId: string }>();
  const [monitor, setMonitor] = useState<TeacherMonitor | null>(null);
  const [view, setView] = useState<'knowledge'|'questions'|'flashcards'|'settings'|'stats'>('knowledge');
  const [error, setError] = useState<string | null>(null);
  const { questions, load: loadQuestions } = useMonitorQuestions<Item>();
  const { flashcards, load: loadFlashcards } = useMonitorFlashcards<Item>();
  const { upload, uploading } = useQuestionUpload();
  useEffect(() => { let active = true; Promise.all([TeacherMonitorService.getMine(monitorId), loadQuestions(monitorId), loadFlashcards(monitorId)]).then(([m]) => active && setMonitor(m)).catch((e) => active && setError(e instanceof Error ? e.message : 'Falha ao carregar o monitor.')); return () => { active = false; }; }, [monitorId, loadQuestions, loadFlashcards]);
  if (error) return <main className="grid min-h-screen place-items-center bg-[#F5F1E8] text-rose-700">{error}</main>;
  if (!monitor) return <main className="grid min-h-screen place-items-center bg-[#F5F1E8] text-emerald-900">Carregando Monitor de IA...</main>;
  const chooseFile = async (file: File) => { const subject = monitor.subjects[0]; const topic = subject?.topicRefs[0]; const tag = view === 'knowledge' ? 'knowledge' : view === 'flashcards' ? 'flashcards' : 'questions'; if (subject && topic) await upload(monitor.id, file, subject.id, topic.id, tag); };
  return <main className="flex min-h-screen min-w-0 flex-col bg-[#F5F1E8] text-[#132E20]">
    <MonitorHeader title={monitor.name} status={monitor.status} />
    <MonitorTabs active={view} tabs={[['knowledge','Base de Conhecimento'],['questions',`Questões (${questions.length})`],['flashcards',`Flashcards (${flashcards.length})`],['stats','Estatísticas'],['settings','Configurações']]} onChange={(next) => setView(next as typeof view)} />
    <section className="mx-auto w-full max-w-7xl min-w-0 flex-1 space-y-5 overflow-x-hidden overflow-y-auto p-4 sm:p-6 md:p-8">
      <MonitorFilters><span className="text-sm font-semibold text-slate-600">{monitor.subjects.length} matérias</span><span className="text-sm text-slate-500">Selecione um arquivo para atualizar o monitor</span></MonitorFilters>
      {view === 'knowledge' && <QuestionUploadZone disabled={uploading} onSelect={chooseFile} label="Adicionar material à base de conhecimento" />}
      {view === 'questions' && <><QuestionUploadZone disabled={uploading} onSelect={chooseFile} label="Gerar questões a partir de um arquivo" />{questions.map((q) => <QuestionCard key={q.id} prompt={q.prompt || 'Questão sem enunciado'} topic={q.topicName} status={q.status} explanation={q.explanation} />)}</>}
      {view === 'flashcards' && <MonitorFlashcardsTab><QuestionUploadZone disabled={uploading} onSelect={chooseFile} label="Gerar flashcards a partir de um arquivo" />{flashcards.map((f) => <FlashcardCard key={f.id} front={f.front} back={f.back} topic={f.topicName} />)}</MonitorFlashcardsTab>}
      {view === 'stats' && <MonitorStatsTab questions={questions.length} flashcards={flashcards.length} documents={monitor.knowledgeBaseCount || 0} />}
      {view === 'settings' && <MonitorSettingsTab monitor={monitor} />}
    </section>
  </main>;
}
