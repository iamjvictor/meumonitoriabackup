'use client';
import { OptimizedImage } from '@/shared';

import type { ChangeEvent, Dispatch, RefObject, SetStateAction } from 'react';
import { BookOpen, Bot, Edit3, HelpCircle, Layers, LoaderCircle, Save, ShoppingCart, Sparkles, Star, Trash2 } from 'lucide-react';
import type { TeacherMonitor } from '@/modules/teacher/services/TeacherMonitorService';
import type { TeacherProfile } from '@/modules/teacher/services/TeacherProfileService';

export interface MonitorSettingsPanelProps {
  monitor: TeacherMonitor;
  teacher: TeacherProfile | null;
  isEditingInfo: boolean;
  setIsEditingInfo: Dispatch<SetStateAction<boolean>>;
  editInfoName: string;
  setEditInfoName: Dispatch<SetStateAction<string>>;
  editInfoDescription: string;
  setEditInfoDescription: Dispatch<SetStateAction<string>>;
  editInfoAvatarUrl: string;
  setEditInfoAvatarUrl: Dispatch<SetStateAction<string>>;
  editInfoDetailedDescription: string;
  setEditInfoDetailedDescription: Dispatch<SetStateAction<string>>;
  isSavingInfo: boolean;
  handleAvatarImageUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  handleRemoveAvatarPhoto: () => void;
  handleSaveMonitorInfo: () => void;
  avatarFileInputRef: RefObject<HTMLInputElement | null>;
  scopeDocuments: unknown[];
  scopeQuestions: unknown[];
  scopeFlashcards: unknown[];
  totalApprovedQuestionsCount: number;
  totalApprovedFlashcardsCount: number;
}

export function MonitorSettingsPanel({
  monitor,
  teacher,
  isEditingInfo,
  setIsEditingInfo,
  editInfoName,
  setEditInfoName,
  editInfoDescription,
  setEditInfoDescription,
  editInfoAvatarUrl,
  setEditInfoAvatarUrl,
  editInfoDetailedDescription,
  setEditInfoDetailedDescription,
  isSavingInfo,
  handleAvatarImageUpload,
  handleRemoveAvatarPhoto,
  handleSaveMonitorInfo,
  avatarFileInputRef,
  scopeDocuments,
  scopeQuestions,
  scopeFlashcards,
  totalApprovedQuestionsCount,
  totalApprovedFlashcardsCount,
}: MonitorSettingsPanelProps) {
  return (
<div className="flex-1 flex flex-col overflow-y-auto bg-slate-50/50 p-6 sm:p-10 animate-in fade-in duration-200">
  {/* Dashboard Grid */}
  <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 w-full">
      {/* LEFT SIDE: Settings, Stats and Metadata */}
      <div className="xl:col-span-7 space-y-6">
        {/* Edit Info Card */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <h2 className="font-heading font-bold text-slate-800 flex items-center gap-2">
              <Edit3 className="h-5 w-5 text-emerald-700" />
              Informações Básicas
            </h2>
            {!isEditingInfo && (
              <button
                type="button"
                onClick={() => {
                  setIsEditingInfo(true);
                  setEditInfoName(monitor.name);
                  setEditInfoDescription(monitor.description || '');
                  setEditInfoAvatarUrl(monitor.avatarUrl || '');
                  setEditInfoDetailedDescription(monitor.detailedDescription || '');
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 hover:text-emerald-800 transition-all cursor-pointer"
              >
                <Edit3 className="h-3.5 w-3.5" />
                <span>Editar</span>
              </button>
            )}
          </div>
           {isEditingInfo ? (
            <div className="space-y-5">
              <div className="space-y-2">
                <label htmlFor="agentName" className="text-xs font-bold text-slate-600 uppercase tracking-wider block">
                  Nome do Agente
                </label>
                <input
                  id="agentName"
                  type="text"
                  value={editInfoName}
                  onChange={(e) => setEditInfoName(e.target.value)}
                  placeholder="Nome do agente"
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm text-[#132E20] focus:border-emerald-500 focus:outline-hidden transition-all bg-white"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-600 uppercase tracking-wider block">
                  Foto de Perfil / Avatar do Monitor
                </label>
                <div className="flex items-center gap-4 p-4 rounded-xl border border-slate-100 bg-slate-50/50">
                  {/* Avatar Preview */}
                  <div className="relative w-16 h-16 rounded-full overflow-hidden border-2 border-emerald-100 shadow-xs bg-gradient-to-tr from-[#132E20] to-[#2E5B37] flex items-center justify-center text-white shrink-0">
                    {editInfoAvatarUrl || teacher?.avatarUrl ? (
                      <OptimizedImage
                        src={editInfoAvatarUrl || teacher?.avatarUrl || ''}
                        alt="Avatar do Agente"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Bot className="w-8 h-8 text-white/95" />
                    )}
                  </div>
                  
                  {/* Controls */}
                  <div className="flex flex-col gap-1.5">
                    <input
                      type="file"
                      ref={avatarFileInputRef}
                      onChange={handleAvatarImageUpload}
                      accept="image/png, image/jpeg, image/webp"
                      className="hidden"
                    />
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => avatarFileInputRef.current?.click()}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-[#132E20] hover:bg-[#2E5B37] transition-all cursor-pointer shadow-2xs"
                      >
                        Escolher Imagem
                      </button>
                      {editInfoAvatarUrl && (
                        <button
                          type="button"
                          onClick={handleRemoveAvatarPhoto}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold text-rose-600 bg-rose-50 border border-rose-200 hover:bg-rose-100 transition-all cursor-pointer flex items-center gap-1 shadow-2xs"
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>Remover</span>
                        </button>
                      )}
                    </div>
                    <span className="text-[10px] text-slate-400">
                      Deixe em branco para usar a foto do professor. JPG, PNG ou WEBP até 5MB.
                    </span>
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <label htmlFor="agentDesc" className="text-xs font-bold text-slate-600 uppercase tracking-wider block">
                  Descrição Curta do Agente
                </label>
                <textarea
                  id="agentDesc"
                  rows={3}
                  value={editInfoDescription}
                  onChange={(e) => setEditInfoDescription(e.target.value)}
                  placeholder="Breve descrição do agente"
                  maxLength={500}
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm text-[#132E20] focus:border-emerald-500 focus:outline-hidden transition-all resize-none bg-white"
                />
                <div className="text-right text-xs text-slate-400 font-medium">
                  {editInfoDescription.length}/500
                </div>
              </div>
              <div className="space-y-2">
                <label htmlFor="agentDetailedDesc" className="text-xs font-bold text-slate-600 uppercase tracking-wider block">
                  Descrição Detalhada do Agente (Página de Vendas)
                </label>
                <textarea
                  id="agentDetailedDesc"
                  rows={5}
                  value={editInfoDetailedDescription}
                  onChange={(e) => setEditInfoDetailedDescription(e.target.value)}
                  placeholder="Descrição completa exibida nos detalhes do produto na página de vendas"
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm text-[#132E20] focus:border-emerald-500 focus:outline-hidden transition-all resize-none bg-white"
                />
              </div>
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsEditingInfo(false)}
                  className="rounded-xl border border-slate-200 px-6 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50 transition-all cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSaveMonitorInfo}
                  disabled={isSavingInfo || !editInfoName.trim()}
                  className="rounded-xl bg-emerald-800 px-6 py-2.5 text-xs font-bold text-white hover:bg-emerald-900 disabled:opacity-50 transition-all cursor-pointer flex items-center justify-center gap-1.5"
                >
                  {isSavingInfo ? (
                    <>
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                      <span>Salvando...</span>
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4" />
                      <span>Salvar Alterações</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="flex items-center gap-4">
                <div className="relative w-16 h-16 rounded-2xl overflow-hidden border border-slate-200 bg-slate-100 flex items-center justify-center shrink-0">
                  {monitor.avatarUrl || teacher?.avatarUrl ? (
                    <OptimizedImage
                      src={monitor.avatarUrl || teacher?.avatarUrl || ''}
                      alt={monitor.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <BookOpen className="w-8 h-8 text-slate-400" />
                  )}
                </div>
                <div className="space-y-1">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Nome do Agente</span>
                  <h3 className="font-heading text-lg font-extrabold text-[#132E20]">{monitor.name}</h3>
                </div>
              </div>
              <div className="space-y-1">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Descrição Curta</span>
                <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">
                  {monitor.description || 'Sem descrição cadastrada.'}
                </p>
              </div>
              <div className="space-y-1">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Descrição Detalhada</span>
                <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">
                  {monitor.detailedDescription || 'Sem descrição detalhada cadastrada.'}
                </p>
              </div>
            </div>
          )}
        </div>
         {/* Stats and Metadata Stacked */}
        <div className="space-y-6">
           {/* Statistics Card */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Resumo de Conteúdo</h3>
            <div className="space-y-3 text-sm text-slate-600 font-medium">
              <div className="flex justify-between items-center py-1.5 border-b border-slate-50">
                <span>Matérias</span>
                <span className="font-bold text-[#132E20]">{monitor.subjects.length}</span>
              </div>
              <div className="flex justify-between items-center py-1.5 border-b border-slate-50">
                <span>Tópicos específicos</span>
                <span className="font-bold text-[#132E20]">
                  {monitor.subjects.reduce((acc, s) => acc + s.topics.length, 0)}
                </span>
              </div>
              <div className="flex justify-between items-center py-1.5 border-b border-slate-50">
                <span>Arquivos na base</span>
                <span className="font-bold text-[#132E20]">{scopeDocuments.length}</span>
              </div>
              <div className="flex justify-between items-center py-1.5 border-b border-slate-50">
                <span>Questões geradas</span>
                <span className="font-bold text-[#132E20]">{scopeQuestions.length}</span>
              </div>
              <div className="flex justify-between items-center py-1.5 border-b border-slate-50">
                <span>Flashcards gerados</span>
                <span className="font-bold text-[#132E20]">{scopeFlashcards.length}</span>
              </div>
            </div>
             {/* Matérias e Tópicos Badges */}
            {monitor.subjects && monitor.subjects.length > 0 && (
              <div className="border-t border-slate-100 pt-4 mt-4 space-y-3">
                <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Matérias e Tópicos Ativos
                </h4>
                <div className="flex flex-col gap-3">
                  {monitor.subjects.map((subj, index) => {
                    const themes = [
                      {
                        bg: 'bg-emerald-50 border-emerald-200 text-emerald-800',
                        dot: 'bg-emerald-600',
                        topic: 'bg-emerald-50/50 text-emerald-800 border-emerald-100/60'
                      },
                      {
                        bg: 'bg-blue-50 border-blue-200 text-blue-800',
                        dot: 'bg-blue-600',
                        topic: 'bg-blue-50/50 text-blue-800 border-blue-100/60'
                      },
                      {
                        bg: 'bg-purple-50 border-purple-200 text-purple-800',
                        dot: 'bg-purple-600',
                        topic: 'bg-purple-50/50 text-purple-800 border-purple-100/60'
                      },
                      {
                        bg: 'bg-amber-50 border-amber-200 text-amber-800',
                        dot: 'bg-amber-600',
                        topic: 'bg-amber-50/50 text-amber-800 border-amber-100/60'
                      },
                      {
                        bg: 'bg-rose-50 border-rose-200 text-rose-800',
                        dot: 'bg-rose-600',
                        topic: 'bg-rose-50/50 text-rose-800 border-rose-100/60'
                      },
                      {
                        bg: 'bg-indigo-50 border-indigo-200 text-indigo-800',
                        dot: 'bg-indigo-600',
                        topic: 'bg-indigo-50/50 text-indigo-800 border-indigo-100/60'
                      },
                    ];
                    const theme = themes[index % themes.length];
                     return (
                      <div key={subj.id} className="space-y-1.5">
                        {/* Subject Badge */}
                        <div className="flex">
                          <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${theme.bg}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${theme.dot}`} />
                            {subj.name}
                          </div>
                        </div>
                         {/* Topic list written under */}
                        {subj.topicRefs && subj.topicRefs.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5 pl-1.5">
                            {subj.topicRefs.map((topic) => (
                              <span
                                key={topic.id}
                                className={`inline-flex items-center rounded-lg border px-2 py-0.5 text-[10px] font-medium ${theme.topic}`}
                              >
                                {topic.name}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-[10px] text-slate-400 italic pl-1.5">
                            Nenhum tópico cadastrado
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
           {/* Metadata Card */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-3 text-xs text-slate-500 font-medium">
            <div className="flex justify-between">
              <span>Criado em:</span>
              <span className="text-[#132E20]">{new Date(monitor.createdAt).toLocaleDateString('pt-BR')}</span>
            </div>
            <div className="flex justify-between">
              <span>Última alteração:</span>
              <span className="text-[#132E20]">{new Date(monitor.updatedAt).toLocaleDateString('pt-BR')}</span>
            </div>
          </div>
        </div>
      </div>
       {/* RIGHT SIDE: Storefront Live Previews */}
      <div className="xl:col-span-5 bg-[#F5F1E8] rounded-3xl p-6 sm:p-8 border border-[#0f29420a] space-y-8 text-[#0F2942]">
        <div>
          <h2 className="font-heading text-lg font-bold tracking-tight text-[#0F2942] flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-[#2E5B37]" />
            Visualização na Página de Vendas
          </h2>
          <p className="text-xs text-[#0f294270] mt-1">Como seu agente aparecerá para os alunos na vitrine.</p>
        </div>
         <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
          {/* 1. Card na Vitrine */}
          <div className="space-y-3">
            <span className="text-[10px] font-bold text-[#0f294260] uppercase tracking-wider block">
              1. Card na Vitrine de Monitores
            </span>
            <div className="bg-white rounded-2xl border border-[#0f294208] shadow-sm overflow-hidden flex flex-col justify-between w-full max-w-sm mx-auto">
              {/* Product Visual Container */}
              <div className="p-4 bg-[#0f294202] border-b border-[#0f294205] h-40 relative flex items-center justify-center overflow-hidden">
                <span className="absolute top-3 left-3 bg-[#e47911] text-white text-[10px] font-bold px-2 py-0.5 rounded shadow-sm z-10">
                  Destaque
                </span>
                <span className="absolute top-3 right-3 bg-[#2E5B37] text-white text-[9px] font-bold px-2 py-0.5 rounded-full z-10">
                  Material IA
                </span>
                {/* Book / AI Visual Graphic or Avatar */}
                {isEditingInfo ? (
                  editInfoAvatarUrl || teacher?.avatarUrl ? (
                    <OptimizedImage src={editInfoAvatarUrl || teacher?.avatarUrl || ''} alt="Avatar" className="absolute inset-0 w-full h-full object-cover" />
                  ) : (
                    <div className="relative w-16 h-16 rounded-xl bg-white border border-[#0f29420a] shadow-sm flex items-center justify-center">
                      <BookOpen className="w-8 h-8 text-[#0F2942]" />
                      <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-[#2E5B37] flex items-center justify-center text-white border border-white">
                        <Sparkles className="w-2.5 h-2.5 animate-pulse" />
                      </div>
                    </div>
                  )
                ) : (
                  monitor.avatarUrl || teacher?.avatarUrl ? (
                    <OptimizedImage src={monitor.avatarUrl || teacher?.avatarUrl || ''} alt={monitor.name} className="absolute inset-0 w-full h-full object-cover" />
                  ) : (
                    <div className="relative w-16 h-16 rounded-xl bg-white border border-[#0f29420a] shadow-sm flex items-center justify-center">
                      <BookOpen className="w-8 h-8 text-[#0F2942]" />
                      <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-[#2E5B37] flex items-center justify-center text-white border border-white">
                        <Sparkles className="w-2.5 h-2.5 animate-pulse" />
                      </div>
                    </div>
                  )
                )}
              </div>
               {/* Product Details Section */}
              <div className="p-5 flex-1 flex flex-col justify-between">
                <div>
                  <div className="flex justify-start items-start gap-2.5">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[#0f294208] flex items-center justify-center text-[#0F2942] mt-0.5 border border-[#0f294208]" title="Assistente Virtual de IA">
                      <Bot className="w-4 h-4" />
                    </div>
                    <div className="flex-1">
                      {/* Rating (Stars) */}
                      <div className="flex items-center gap-1 mb-1.5">
                        <div className="flex items-center text-[#ff9900]">
                          <Star className="w-3.5 h-3.5 fill-current" />
                          <Star className="w-3.5 h-3.5 fill-current" />
                          <Star className="w-3.5 h-3.5 fill-current" />
                          <Star className="w-3.5 h-3.5 fill-current" />
                          <Star className="w-3.5 h-3.5 fill-current" />
                        </div>
                        <span className="text-[11px] font-semibold text-[#007185]">
                          42 avaliações
                        </span>
                      </div>
                       {/* Title */}
                      <h4 className="text-sm font-bold text-[#0F2942] line-clamp-2 min-h-[40px] leading-tight">
                        {isEditingInfo ? editInfoName : monitor.name}
                      </h4>
                    </div>
                  </div>
                   {/* Description */}
                  <p className="mt-2 text-xs text-[#0f294270] line-clamp-3 leading-relaxed">
                    {isEditingInfo ? editInfoDescription : (monitor.description || 'Sem descrição cadastrada.')}
                  </p>
                </div>
                 {/* Pricing and Button */}
                <div className="mt-5 border-t border-[#0f294208] pt-4">
                  <div className="mb-4">
                    <div className="text-[11px] text-[#565959] line-through leading-none">
                      De: R$ 59,90
                    </div>
                    <div className="flex items-baseline gap-1 mt-0.5">
                      <span className="text-[12px] font-semibold text-[#565959]">Por:</span>
                      <span className="text-xl font-extrabold text-[#B12704]">R$ 29,90</span>
                      <span className="text-[11px] font-medium text-[#565959]">/mês</span>
                    </div>
                  </div>
                   <div className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#F0C14B] border border-[#a88734] px-4 py-2 text-xs font-bold text-[#111111] shadow-sm">
                    <ShoppingCart className="w-3.5 h-3.5 text-[#111111]" />
                    <span>Adicionar ao Carrinho</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
           {/* 2. Modal/Detalhes do Agente */}
          <div className="space-y-3">
            <span className="text-[10px] font-bold text-[#0f294260] uppercase tracking-wider block">
              2. Detalhes (Modal de Mais Informações)
            </span>
            <div className="bg-[#F5F1E8] rounded-2xl border border-[#0f29420d] p-5 shadow-xs w-full max-w-sm mx-auto space-y-4">
              <div className="flex items-center gap-3">
                {isEditingInfo ? (
                  editInfoAvatarUrl || teacher?.avatarUrl ? (
                    <div className="w-10 h-10 rounded-xl overflow-hidden border border-[#0f29420d] shadow-sm shrink-0">
                      <OptimizedImage src={editInfoAvatarUrl || teacher?.avatarUrl || ''} alt="Avatar" className="w-full h-full object-cover" />
                    </div>
                  ) : (
                    <div className="w-10 h-10 rounded-xl bg-[#0F2942] flex items-center justify-center text-white shrink-0">
                      <BookOpen className="w-5 h-5" />
                    </div>
                  )
                ) : (
                  monitor.avatarUrl || teacher?.avatarUrl ? (
                    <div className="w-10 h-10 rounded-xl overflow-hidden border border-[#0f29420d] shadow-sm shrink-0">
                      <OptimizedImage src={monitor.avatarUrl || teacher?.avatarUrl || ''} alt={monitor.name} className="w-full h-full object-cover" />
                    </div>
                  ) : (
                    <div className="w-10 h-10 rounded-xl bg-[#0F2942] flex items-center justify-center text-white shrink-0">
                      <BookOpen className="w-5 h-5" />
                    </div>
                  )
                )}
                <div>
                  <span className="text-[8px] bg-[#2E5B37] text-white font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wider">
                    Assistente de Estudos IA
                  </span>
                  <h3 className="text-xs font-extrabold text-[#0F2942] mt-0.5 truncate max-w-[200px]">
                    {isEditingInfo ? editInfoName : monitor.name}
                  </h3>
                </div>
              </div>
               {/* Content Box */}
              <div className="bg-white rounded-xl border border-[#0f294208] p-4 space-y-3">
                <div>
                  <h4 className="text-[10px] font-bold text-[#0f294260] uppercase tracking-wider">Sobre este Monitor</h4>
                  <p className="text-xs text-[#0f2942b0] mt-1 leading-relaxed line-clamp-4 whitespace-pre-wrap">
                    {isEditingInfo
                      ? (editInfoDetailedDescription || editInfoDescription || 'Sem descrição detalhada cadastrada.')
                      : (monitor.detailedDescription || monitor.description || 'Sem descrição detalhada cadastrada.')}
                  </p>
                </div>
                 {/* Stats / Numbers available */}
                <div className="grid grid-cols-2 gap-3.5 pt-3 border-t border-[#0f294208]">
                  <div className="bg-[#0f294203] border border-[#0f294205] rounded-xl p-2.5 flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded bg-[#0F2942]/5 flex items-center justify-center text-[#0F2942] shrink-0">
                      <HelpCircle className="w-4 h-4 text-[#0F2942]/70" />
                    </div>
                    <div>
                      <span className="block text-[8px] font-bold text-[#0f294260] uppercase tracking-wider">Questões</span>
                      <span className="block text-[10px] font-black text-[#0F2942]">
                        {totalApprovedQuestionsCount} disponíveis
                      </span>
                    </div>
                  </div>
                   <div className="bg-[#0f294203] border border-[#0f294205] rounded-xl p-2.5 flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded bg-[#0F2942]/5 flex items-center justify-center text-[#0F2942] shrink-0">
                      <Layers className="w-4 h-4 text-[#0F2942]/70" />
                    </div>
                    <div>
                      <span className="block text-[8px] font-bold text-[#0f294260] uppercase tracking-wider">Flashcards</span>
                      <span className="block text-[10px] font-black text-[#0F2942]">
                        {totalApprovedFlashcardsCount} disponíveis
                      </span>
                    </div>
                  </div>
                </div>
                 {monitor.subjects && monitor.subjects.length > 0 && (
                  <div className="border-t border-[#0f294208] pt-3">
                    <h4 className="text-[10px] font-bold text-[#0f294260] uppercase tracking-wider mb-2">Matérias e Tópicos</h4>
                    <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1">
                      {monitor.subjects.map((subj) => (
                        <div key={subj.id} className="bg-[#0f294203] border border-[#0f294205] rounded-lg p-2.5">
                          <div className="flex items-center gap-1 text-[10px] font-bold text-[#0F2942]">
                            <BookOpen className="w-3 h-3 text-[#0F2942]/60" />
                            <span>{subj.name}</span>
                          </div>
                          {subj.topicRefs && subj.topicRefs.length > 0 ? (
                            <div className="mt-1.5 flex flex-wrap gap-1 pl-4">
                              {subj.topicRefs.map((topic) => (
                                <span key={topic.id} className="inline-flex items-center rounded bg-[#0F2942]/5 px-1.5 py-0.5 text-[9px] font-medium text-[#0F2942]/80 border border-[#0F2942]/10">
                                  {topic.name}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <p className="text-[9px] text-[#0f294250] mt-0.5 pl-4 italic">Nenhum tópico cadastrado.</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                 <div className="border-t border-[#0f294208] pt-3 flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <div className="flex items-center text-[#ff9900]">
                      <Star className="w-3.5 h-3.5 fill-current" />
                      <Star className="w-3.5 h-3.5 fill-current" />
                      <Star className="w-3.5 h-3.5 fill-current" />
                      <Star className="w-3.5 h-3.5 fill-current" />
                      <Star className="w-3.5 h-3.5 fill-current" />
                    </div>
                    <span className="text-[10px] font-semibold text-[#007185]">
                      (42) avaliações
                    </span>
                  </div>
                  <span className="text-[10px] text-[#007600] font-bold">
                    Início imediato
                  </span>
                </div>
              </div>
               <div className="flex flex-col gap-2">
                <div className="flex items-baseline justify-between px-1">
                  <span className="text-[10px] text-[#0f294260] font-bold">Preço de assinatura:</span>
                  <div className="flex items-baseline gap-0.5">
                    <span className="text-[10px] text-[#565959] mr-0.5">Apenas</span>
                    <span className="text-lg font-black text-[#B12704]">R$ 29,90</span>
                    <span className="text-[10px] text-[#565959]">/mês</span>
                  </div>
                </div>
                 <div className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#F0C14B] border border-[#a88734] px-4 py-2 text-xs font-bold text-[#111111] shadow-sm">
                  <ShoppingCart className="w-3.5 h-3.5 text-[#111111]" />
                  <span>Adicionar ao Carrinho</span>
                </div>
              </div>
            </div>
          </div>
        </div>
       </div>
    </div>
  </div>
  );
}
