'use client';
import { OptimizedImage } from '@/shared';

import React, { useState } from 'react';
import {
  X,
  BookOpen,
  User,
  CheckCircle2,
  Check,
  Camera,
  Globe,
  Sparkles,
  AlertCircle,
  ArrowRight,
  ArrowLeft,
  Loader2,
} from 'lucide-react';
import { TeacherProfileService, TeacherProfile, UserInfo } from '../services/TeacherProfileService';

const InstagramIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect>
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path>
    <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line>
  </svg>
);

const YouTubeIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
  </svg>
);

const TikTokIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12.525 0h3.08c.12 1.05.61 2.06 1.39 2.8 1.07 1.01 2.5 1.57 3.98 1.57v3.13c-1.92-.02-3.76-.7-5.18-1.93v8.52c0 1.56-.5 3.07-1.42 4.31-1.39 1.86-3.62 2.94-5.96 2.87-2.67-.08-5.06-1.57-6.24-3.87-1.18-2.3-.87-5.08.78-7.07 1.54-1.86 3.88-2.82 6.27-2.54v3.25c-1.18-.18-2.37.28-3.13 1.22-.76.94-.9 2.24-.36 3.32.54 1.08 1.68 1.74 2.89 1.67 1.45-.08 2.64-1.2 2.75-2.65V0z"/>
  </svg>
);

interface TeacherOnboardingWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (updatedTeacher: TeacherProfile) => void;
  user?: UserInfo | null;
}

export const TeacherOnboardingWizardModal: React.FC<TeacherOnboardingWizardModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  user,
}) => {
  const [currentStep, setCurrentStep] = useState<number>(2); // 1 = Informacoes (completed), 2 = Perfil, 3 = Redes Sociais, 4 = Status
  const [username, setUsername] = useState('');
  const [area, setArea] = useState('Concursos Públicos');
  const [customArea, setCustomArea] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUrl] = useState('');
  const [instagram, setInstagram] = useState('');
  const [tiktok, setTiktok] = useState('');
  const [youtube, setYoutube] = useState('');
  const [agreedTerms, setAgreedTerms] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const areaOptions = [
    'Concursos Públicos',
    'ENEM e Vestibulares',
    'OAB e Carreiras Jurídicas',
    'Residência Médica',
    'Reforço Escolar',
    'Idiomas',
    'Programação e Tecnologia',
    'Outros',
  ];

  const teacherName = user?.fullName || 'Seu Nome';

  const generatedSlug = username
    ? username.toLowerCase().replace(/[^a-z0-9_-]/g, '')
    : 'seu-username';

  const handleNextStep = () => {
    setError(null);
    if (currentStep === 2) {
      if (!username.trim()) {
        setError('Digite seu nome de usuário (slug).');
        return;
      }
      if (area === 'Outros' && !customArea.trim()) {
        setError('Por favor, especifique a sua área de atuação.');
        return;
      }
      setCurrentStep(3);
    } else if (currentStep === 3) {
      setCurrentStep(4);
    }
  };

  const handlePrevStep = () => {
    setError(null);
    if (currentStep > 2) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) {
      setError('Por favor, informe seu nome de usuário (slug).');
      return;
    }
    if (!agreedTerms) {
      setError('Você precisa concordar com os termos para concluir.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const payload: Partial<TeacherProfile> & { agreedTerms: boolean } = {
        username: username.trim(),
        pageSlug: generatedSlug,
        area: area === 'Outros' ? customArea || 'Geral' : area,
        customArea: area === 'Outros' ? customArea : null,
        bio: bio.trim() || undefined,
        avatarUrl: avatarUrl.trim() || undefined,
        instagram: instagram.trim() || undefined,
        tiktok: tiktok.trim() || undefined,
        youtube: youtube.trim() || undefined,
        agreedTerms: true,
      };

      const result = await TeacherProfileService.saveOnboardingProfile(payload);
      onSuccess(result);
      onClose();
    } catch (err: unknown) {
      console.warn('Erro ao salvar onboarding do professor:', err instanceof Error ? err.message : err);
      setError(err instanceof Error ? err.message : 'Não foi possível salvar seu perfil. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6 bg-slate-900/70 backdrop-blur-md transition-all animate-fadeIn">
      <div className="relative w-full max-w-3xl bg-white border border-slate-200 rounded-3xl shadow-2xl overflow-hidden my-4 max-h-[92vh] flex flex-col">
        
        {/* Top Header Bar with Steps */}
        <div className="bg-[#F8FAFC] border-b border-slate-200 px-6 py-4 flex items-center justify-between shrink-0">
          
          {/* Steps Indicator */}
          <div className="flex items-center space-x-4 sm:space-x-8 text-xs font-semibold">
            
            {/* Step 1: Informações (Done) */}
            <div className="flex items-center space-x-2 text-emerald-700 font-bold">
              <div className="w-6 h-6 rounded-full bg-emerald-600 flex items-center justify-center text-white text-xs">
                <Check className="w-3.5 h-3.5 stroke-[3]" />
              </div>
              <span className="hidden sm:inline">Informações</span>
            </div>

            {/* Step 2: Perfil */}
            <div className={`flex items-center space-x-2 ${currentStep === 2 ? 'text-[#132E20] font-bold' : currentStep > 2 ? 'text-emerald-700 font-bold' : 'text-slate-400'}`}>
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${currentStep === 2 ? 'bg-[#132E20] text-white ring-4 ring-[#132E20]/10' : currentStep > 2 ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
                {currentStep > 2 ? <Check className="w-3.5 h-3.5 stroke-[3]" /> : '2'}
              </div>
              <span>Perfil</span>
            </div>

            {/* Step 3: Redes Sociais */}
            <div className={`flex items-center space-x-2 ${currentStep === 3 ? 'text-[#132E20] font-bold' : currentStep > 3 ? 'text-emerald-700 font-bold' : 'text-slate-400'}`}>
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${currentStep === 3 ? 'bg-[#132E20] text-white ring-4 ring-[#132E20]/10' : currentStep > 3 ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
                {currentStep > 3 ? <Check className="w-3.5 h-3.5 stroke-[3]" /> : '3'}
              </div>
              <span className="hidden sm:inline">Redes Sociais</span>
            </div>

            {/* Step 4: Status */}
            <div className={`flex items-center space-x-2 ${currentStep === 4 ? 'text-[#132E20] font-bold' : 'text-slate-400'}`}>
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${currentStep === 4 ? 'bg-[#132E20] text-white ring-4 ring-[#132E20]/10' : 'bg-slate-200 text-slate-600'}`}>
                4
              </div>
              <span className="hidden sm:inline">Status</span>
            </div>

          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step Guide Banner */}
        <div className="mx-6 mt-6 px-4 py-3 rounded-2xl bg-[#EFF6FF] border border-blue-200/70 text-[#1E3A8A] text-xs font-medium flex items-center space-x-2.5">
          <BookOpen className="w-4 h-4 text-[#132E20] shrink-0" />
          <span>
            {currentStep === 2 && 'Passo 2 de 4: Foto de Perfil, URL Personalizada, Área de Atuação e Biografia.'}
            {currentStep === 3 && 'Passo 3 de 4: Redes Sociais e Canas de Divulgação.'}
            {currentStep === 4 && 'Passo 4 de 4: Aceite de Termos e Conclusão do Cadastro.'}
          </span>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6 overflow-y-auto flex-1">
          
          {error && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start space-x-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span className="font-medium">{error}</span>
            </div>
          )}

          {/* STEP 2: PERFIL */}
          {currentStep === 2 && (
            <div className="space-y-6">
              
              {/* Photo & Live Simulation Card */}
              <div className="p-5 rounded-2xl border border-slate-200 bg-white shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <span className="text-[11px] font-extrabold text-slate-700 uppercase tracking-wider">
                    FOTO & USERNAME DO PROFESSOR (URL PERSONALIZADA) *
                  </span>
                  <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <Globe className="w-3 h-3 text-emerald-600" />
                    <span>Simulação Live</span>
                  </span>
                </div>

                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 flex items-center space-x-4">
                  <div className="relative group shrink-0">
                    <div className="w-16 h-16 rounded-full bg-white border-2 border-emerald-600 flex items-center justify-center overflow-hidden shadow-inner text-slate-400">
                      {avatarUrl ? (
                        <OptimizedImage src={avatarUrl} alt="Preview Avatar" className="w-full h-full object-cover" />
                      ) : (
                        <User className="w-8 h-8 text-slate-300" />
                      )}
                    </div>
                    <button
                      type="button"
                      className="absolute bottom-0 right-0 w-6 h-6 rounded-full bg-[#132E20] text-white flex items-center justify-center shadow hover:bg-emerald-700 transition-colors"
                      title="Alterar foto de perfil"
                    >
                      <Camera className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="space-y-1 overflow-hidden">
                    <h4 className="font-bold text-slate-900 text-sm leading-tight">
                      Prof. {teacherName}
                    </h4>
                    <p className="text-xs font-semibold text-emerald-700 truncate">
                      @{username || 'username'}
                    </p>
                    <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-lg bg-white border border-slate-200 text-[11px] font-medium text-slate-600 shadow-2xs">
                      <Globe className="w-3 h-3 text-slate-400 shrink-0" />
                      <span className="truncate">https://meumonitor.ai/p/<strong>{generatedSlug}</strong></span>
                    </div>
                  </div>
                </div>

                {/* Username Input with Prefix Box */}
                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1.5">
                    Digite seu Username (Slug da URL):
                  </label>
                  <div className="flex rounded-xl overflow-hidden border border-slate-300 focus-within:border-[#132E20] transition-colors">
                    <span className="bg-slate-100 px-3.5 py-3 text-xs font-medium text-slate-500 border-r border-slate-300 flex items-center shrink-0">
                      https://meumonitor.ai/p/
                    </span>
                    <input
                      type="text"
                      required
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="joaovictor"
                      className="w-full bg-white px-3.5 py-3 text-sm font-semibold text-slate-900 placeholder-slate-400 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Area of Expertise Dropdown */}
              <div>
                <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-1.5">
                  ÁREA DE ATUAÇÃO PRINCIPAL *
                </label>
                <div className="relative">
                  <select
                    value={area}
                    onChange={(e) => setArea(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3.5 text-sm text-slate-800 focus:outline-none focus:border-[#132E20] cursor-pointer shadow-2xs"
                  >
                    {areaOptions.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {area === 'Outros' && (
                <div>
                  <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-1.5">
                    Especifique a Sua Área *
                  </label>
                  <input
                    type="text"
                    required
                    value={customArea}
                    onChange={(e) => setCustomArea(e.target.value)}
                    placeholder="Ex: Pós-graduação em Odontologia"
                    className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-sm text-slate-800 focus:outline-none focus:border-[#132E20]"
                  />
                </div>
              )}

              {/* Short Bio */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider">
                    BIOGRAFIA CURTA / APRESENTAÇÃO *
                  </label>
                  <span className="text-[11px] font-semibold text-slate-400">
                    {bio.length}/300 caracteres
                  </span>
                </div>
                <textarea
                  rows={4}
                  maxLength={300}
                  value={bio}
                  onChange={(e) => setBio(e.target.value.slice(0, 300))}
                  placeholder="Ex: Professor especialista em Gramática e Redação para concursos federais há mais de 12 anos. Autor de 3 apostilas preparatórias."
                  className="w-full bg-white border border-slate-300 rounded-2xl px-4 py-3 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#132E20] shadow-2xs"
                />
              </div>

            </div>
          )}

          {/* STEP 3: REDES SOCIAIS */}
          {currentStep === 3 && (
            <div className="space-y-5">
              <div className="p-4 rounded-2xl bg-[#E8F0FA]/60 border border-[#173C67]/15 text-[#0F2942] text-xs flex items-center space-x-2 font-medium">
                <Sparkles className="w-4 h-4 text-[#173C67] shrink-0" />
                <span>Adicione suas redes sociais para integrar à sua landing page de vendas.</span>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-1.5">
                  Instagram
                </label>
                <div className="relative">
                  <InstagramIcon className="w-4 h-4 text-pink-500 absolute left-3.5 top-3.5" />
                  <input
                    type="text"
                    value={instagram}
                    onChange={(e) => setInstagram(e.target.value)}
                    placeholder="@seu_instagram"
                    className="w-full bg-white border border-slate-300 rounded-xl pl-10 pr-4 py-3 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#132E20]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-1.5">
                  Canal no YouTube
                </label>
                <div className="relative">
                  <YouTubeIcon className="w-4 h-4 text-rose-600 absolute left-3.5 top-3.5" />
                  <input
                    type="text"
                    value={youtube}
                    onChange={(e) => setYoutube(e.target.value)}
                    placeholder="canal_prof"
                    className="w-full bg-white border border-slate-300 rounded-xl pl-10 pr-4 py-3 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#132E20]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-1.5">
                  TikTok
                </label>
                <div className="relative">
                  <TikTokIcon className="w-4 h-4 text-slate-800 absolute left-3.5 top-3.5" />
                  <input
                    type="text"
                    value={tiktok}
                    onChange={(e) => setTiktok(e.target.value)}
                    placeholder="@seu_tiktok"
                    className="w-full bg-white border border-slate-300 rounded-xl pl-10 pr-4 py-3 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#132E20]"
                  />
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: STATUS & FINALIZAÇÃO */}
          {currentStep === 4 && (
            <div className="space-y-5">
              <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-medium space-y-2">
                <div className="flex items-center space-x-2 font-bold text-emerald-800 text-sm">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  <span>Resumo das Informações do Professor</span>
                </div>
                <ul className="pl-7 list-disc space-y-1 text-slate-700 text-xs">
                  <li><strong>Nome:</strong> Prof. {teacherName}</li>
                  <li><strong>Email:</strong> {user?.email || 'Cadastrado'}</li>
                  <li><strong>Username:</strong> @{username}</li>
                  <li><strong>Página Pública:</strong> https://meumonitor.ai/p/{generatedSlug}</li>
                  <li><strong>Área:</strong> {area === 'Outros' ? customArea : area}</li>
                </ul>
              </div>

              <div className="pt-2">
                <label className="flex items-start space-x-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={agreedTerms}
                    onChange={(e) => setAgreedTerms(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-[#132E20] focus:ring-[#132E20] mt-0.5 cursor-pointer"
                  />
                  <span className="text-xs text-slate-600 font-medium leading-relaxed">
                    Declaro que li e concordo com os Termos de Uso e Política de Privacidade da plataforma MeuMonitor AI para professores.
                  </span>
                </label>
              </div>
            </div>
          )}

        </form>

        {/* Footer Navigation Buttons */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
          {currentStep > 2 ? (
            <button
              type="button"
              onClick={handlePrevStep}
              className="px-5 py-2.5 rounded-xl text-xs font-bold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 transition-colors flex items-center space-x-1.5 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Voltar</span>
            </button>
          ) : (
            <button
              type="button"
              disabled
              className="px-5 py-2.5 rounded-xl text-xs font-bold text-slate-400 bg-slate-100 border border-slate-200 cursor-not-allowed opacity-50 flex items-center space-x-1.5"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Voltar</span>
            </button>
          )}

          {currentStep < 4 ? (
            <button
              type="button"
              onClick={handleNextStep}
              className="px-6 py-2.5 rounded-xl text-xs font-bold text-white bg-[#132E20] hover:bg-[#1E432D] transition-all shadow-md flex items-center space-x-1.5 cursor-pointer"
            >
              <span>Avançar</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="px-6 py-2.5 rounded-xl text-xs font-bold text-white bg-[#132E20] hover:bg-[#1E432D] transition-all shadow-md flex items-center space-x-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Salvando...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>Concluir Cadastro</span>
                </>
              )}
            </button>
          )}
        </div>

      </div>
    </div>
  );
};
