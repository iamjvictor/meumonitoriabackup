'use client';

import { AlertCircle, BookOpen, Check, LoaderCircle, Plus, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { TeacherMonitorService } from '@/modules/teacher/services/TeacherMonitorService';
import type { ExamProfile, QuestionBankSubject } from '@/modules/teacher/components/question-bank-catalog';

type Props = {
  newSubjectModalName: string;
  newSubjectModalTopics: string[];
  addSubjectModalError: string | null;
  isSubmittingSubjectModal: boolean;
  setNewSubjectModalName: (value: string) => void;
  handleAddTopicInputInModal: () => void;
  handleRemoveTopicInputInModal: (index: number) => void;
  handleTopicChangeInModal: (index: number, value: string) => void;
  closeAddSubjectModal: () => void;
  handleSubmitSubjectModal: (profiles: Array<{ subject: string; examType: string; board?: string | null }>) => void;
};

export function AddSubjectModal({
  newSubjectModalName,
  newSubjectModalTopics,
  addSubjectModalError,
  isSubmittingSubjectModal,
  setNewSubjectModalName,
  handleAddTopicInputInModal,
  handleRemoveTopicInputInModal,
  handleTopicChangeInModal,
  closeAddSubjectModal,
  handleSubmitSubjectModal,
}: Props) {
  const [catalogSubjects, setCatalogSubjects] = useState<QuestionBankSubject[]>([]);
  const [examProfiles, setExamProfiles] = useState<ExamProfile[]>([]);
  const [catalogSubjectId, setCatalogSubjectId] = useState('');
  const [selectedProfileIds, setSelectedProfileIds] = useState<string[]>([]);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    TeacherMonitorService.getQuestionBankCatalog().then((catalog) => {
      if (!active) return;
      setCatalogSubjects(catalog.subjects);
      setExamProfiles(catalog.examProfiles);
      setCatalogSubjectId(catalog.subjects[0]?.id ?? '');
    }).catch(() => {
      if (active) setCatalogError('Não foi possível carregar as bancas do acervo. Você ainda pode criar a matéria e seus tópicos.');
    });
    return () => { active = false; };
  }, []);

  const selectedCatalogSubject = catalogSubjects.find((subject) => subject.id === catalogSubjectId);
  const availableProfiles = examProfiles.filter((profile) => selectedCatalogSubject?.examProfileIds.includes(profile.id));
  const selectedProfiles = availableProfiles.filter((profile) => selectedProfileIds.includes(profile.id));

  return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-emerald-950 bg-gradient-to-r from-emerald-900 to-emerald-950 px-6 py-4 text-white">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-emerald-800/80 border border-emerald-700/50 text-white">
                  <BookOpen className="h-5 w-5 text-emerald-300" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-white uppercase tracking-wide">Adicionar Nova Matéria</h3>
                  <p className="text-xs text-emerald-100/90 font-medium">Escolha bancas e personalize os tópicos iniciais</p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeAddSubjectModal}
                className="p-2 rounded-xl text-emerald-200 hover:text-white hover:bg-emerald-800/50 transition-all cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {addSubjectModalError && (
              <div className="mx-6 mt-4 flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{addSubjectModalError}</span>
              </div>
            )}

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                  Matéria do acervo
                  <select value={catalogSubjectId} onChange={(event) => setCatalogSubjectId(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-medium normal-case tracking-normal">
                    <option value="">Selecione a matéria do banco</option>
                    {catalogSubjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
                  </select>
                </label>
                <div className="text-xs text-slate-500 self-end pb-2">A matéria escolhida vincula os tópicos às questões oficiais.</div>
              </div>
              {catalogError && <p role="status" className="text-xs text-amber-800">{catalogError}</p>}
              <fieldset className="space-y-2">
                <legend className="mb-1.5 text-xs font-bold uppercase tracking-wider text-slate-700">Bancas e perfis</legend>
                <div className="grid max-h-36 gap-1 overflow-y-auto rounded-xl border border-slate-200 p-2 sm:grid-cols-2">
                  {availableProfiles.map((profile) => (
                    <label key={profile.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-slate-700 hover:bg-emerald-50">
                      <input type="checkbox" checked={selectedProfileIds.includes(profile.id)} onChange={() => setSelectedProfileIds((current) => current.includes(profile.id) ? current.filter((id) => id !== profile.id) : [...current, profile.id])} />
                      <span className="min-w-0 flex-1 truncate">{profile.name}</span><span className="text-slate-400">{profile.questionCount.toLocaleString('pt-BR')}</span>
                    </label>
                  ))}
                  {examProfiles.length === 0 && <p className="p-2 text-xs text-slate-500">Carregando bancas do acervo…</p>}
                  {examProfiles.length > 0 && availableProfiles.length === 0 && <p className="p-2 text-xs text-slate-500">Não há bancas disponíveis para esta matéria do acervo.</p>}
                </div>
              </fieldset>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                  Nome da Matéria <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Ex: Física Quântica, Álgebra Linear..."
                  value={newSubjectModalName}
                  onChange={(e) => setNewSubjectModalName(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-800 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 focus:outline-hidden"
                  autoFocus
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                    Tópicos <span className="text-rose-500">* (mínimo 1)</span>
                  </label>
                  <button
                    type="button"
                    onClick={handleAddTopicInputInModal}
                    className="flex items-center gap-1 text-xs font-bold text-emerald-700 hover:text-emerald-800 transition-colors cursor-pointer"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Adicionar outro tópico</span>
                  </button>
                </div>

                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {newSubjectModalTopics.map((topic, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-400 w-5 text-right">{index + 1}.</span>
                      <input
                        type="text"
                        placeholder={`Nome do Tópico ${index + 1}...`}
                        value={topic}
                        onChange={(e) => handleTopicChangeInModal(index, e.target.value)}
                        className="flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 focus:border-emerald-600 focus:outline-hidden"
                      />
                      {newSubjectModalTopics.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveTopicInputInModal(index)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                          title="Remover Tópico"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex shrink-0 items-center justify-end gap-2.5 border-t border-slate-100 px-6 py-4">
              <button
                type="button"
                onClick={closeAddSubjectModal}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isSubmittingSubjectModal}
                onClick={() => handleSubmitSubjectModal(selectedProfiles.map((profile) => ({ subject: catalogSubjects.find((subject) => subject.id === catalogSubjectId)?.name ?? '', examType: profile.examType || profile.name, board: profile.board ?? null })).filter((profile) => profile.subject))}
                className="flex items-center gap-2 rounded-xl bg-emerald-700 px-5 py-2 text-xs font-bold text-white hover:bg-emerald-800 transition-colors cursor-pointer disabled:opacity-50"
              >
                {isSubmittingSubjectModal ? (
                  <>
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                    <span>Criando...</span>
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4" />
                    <span>Criar Matéria</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
  );
}
