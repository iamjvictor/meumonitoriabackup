'use client';

import { AlertCircle, BookOpen, Check, LoaderCircle, Plus, Trash2, X } from 'lucide-react';

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
  handleSubmitSubjectModal: () => void;
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
  return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-slate-100 overflow-hidden space-y-5">
            <div className="flex items-center justify-between border-b border-emerald-950 bg-gradient-to-r from-emerald-900 to-emerald-950 px-6 py-4 text-white">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-emerald-800/80 border border-emerald-700/50 text-white">
                  <BookOpen className="h-5 w-5 text-emerald-300" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-white uppercase tracking-wide">Adicionar Nova Matéria</h3>
                  <p className="text-xs text-emerald-100/90 font-medium">Defina o nome da disciplina e seus tópicos iniciais</p>
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
              <div className="flex items-center gap-2 rounded-xl bg-rose-50 p-3 text-xs font-semibold text-rose-700 border border-rose-200">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{addSubjectModalError}</span>
              </div>
            )}

            <div className="space-y-4">
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

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
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
                onClick={handleSubmitSubjectModal}
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
