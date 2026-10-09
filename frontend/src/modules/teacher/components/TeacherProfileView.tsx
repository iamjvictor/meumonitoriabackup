'use client';
import { OptimizedImage, ImageCropModal } from '@/shared';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { 
  User, 
  Camera, 
  Trash2, 
  Save, 
  ArrowLeft, 
  CheckCircle2, 
  AlertCircle, 
  AlertTriangle,
  X, 
  Globe, 
  AtSign, 
  Video, 
  PlayCircle, 
  Mail, 
  Phone, 
  Briefcase,
  Loader2,
  Crop,
  Image as ImageIcon
} from 'lucide-react';
import { TeacherProfile, TeacherProfileService, UserInfo } from '../services/TeacherProfileService';
import { TeacherSessionError } from '../services/TeacherSessionError';

interface TeacherProfileViewProps {
  initialTeacher?: TeacherProfile | null;
  initialUser?: UserInfo | null;
}

const AREAS = [
  'Medicina & Enem',
  'Concursos Públicos',
  'Exame da OAB / Direito',
  'Idiomas & Lingua Estrangeira',
  'Exatas & Engenharia',
  'Negócios & Carreira',
  'Outros'
];

function formatPhone(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 2) return digits.length > 0 ? `(${digits}` : '';
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

export const TeacherProfileView: React.FC<TeacherProfileViewProps> = ({
  initialTeacher,
  initialUser,
}) => {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showErrorModal, setShowErrorModal] = useState(false);

  // Crop Modal State
  const [isCropModalOpen, setIsCropModalOpen] = useState(false);
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
  const [cropType, setCropType] = useState<'avatar' | 'banner'>('avatar');

  // Form State
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [username, setUsername] = useState('');
  const [area, setArea] = useState('Medicina & Enem');
  const [customArea, setCustomArea] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [bannerUrl, setBannerUrl] = useState<string | null>(null);
  const [instagram, setInstagram] = useState('');
  const [tiktok, setTiktok] = useState('');
  const [youtube, setYoutube] = useState('');

  // Carrega dados iniciais do perfil
  useEffect(() => {
    const loadProfile = async () => {
      setLoading(true);
      try {
        let prof: TeacherProfile | null = initialTeacher || null;
        let fetchedUser: UserInfo | null = initialUser || null;

        // Sempre busca o perfil atualizado do professor logado no backend
        const res = await TeacherProfileService.getMyProfile();
        if (res.teacher) {
          prof = res.teacher;
        } else if (!initialTeacher) {
          // Se não há perfil criado no backend para esta conta, não usa cache legado
          prof = null;
        }

        if (res.user) {
          fetchedUser = res.user;
        }

        const nameVal = prof?.fullName || fetchedUser?.fullName || '';
        const emailVal = prof?.email || fetchedUser?.email || '';

        setFullName(nameVal);
        setEmail(emailVal);
        setPhone(formatPhone(prof?.phone || ''));
        setUsername(prof?.username || prof?.pageSlug || '');
        setArea(prof?.area || 'Medicina & Enem');
        setCustomArea(prof?.customArea || '');
        setBio(prof?.bio || '');
        setAvatarUrl(prof?.avatarUrl || null);
        setBannerUrl(prof?.bannerUrl || null);
        setInstagram(prof?.instagram || '');
        setTiktok(prof?.tiktok || '');
        setYoutube(prof?.youtube || '');
      } catch (err) {
        if (err instanceof TeacherSessionError) {
          router.replace('/?login=true&perfil=professor&session=expired');
          return;
        }
        console.error('Erro ao carregar dados do perfil:', err);
      } finally {
        setLoading(false);
      }
    };

    loadProfile();
  }, [initialTeacher, initialUser, router]);

  // Manipulador de upload de foto de perfil
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      const msg = 'A imagem deve ter no máximo 5MB.';
      setErrorMessage(msg);
      setShowErrorModal(true);
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      setCropImageSrc(reader.result as string);
      setCropType('avatar');
      setIsCropModalOpen(true);
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsDataURL(file);
  };

  const handleRemovePhoto = () => {
    setAvatarUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Manipulador de upload de banner
  const handleBannerUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      const msg = 'A imagem da capa deve ter no máximo 5MB.';
      setErrorMessage(msg);
      setShowErrorModal(true);
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      setCropImageSrc(reader.result as string);
      setCropType('banner');
      setIsCropModalOpen(true);
      if (bannerInputRef.current) bannerInputRef.current.value = '';
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveBanner = () => {
    setBannerUrl(null);
    if (bannerInputRef.current) bannerInputRef.current.value = '';
  };

  // Confirmação do recorte vindo do modal
  const handleConfirmCrop = (croppedDataUrl: string) => {
    if (cropType === 'avatar') {
      setAvatarUrl(croppedDataUrl);
      setSuccessMessage('Nova foto de perfil ajustada! Clique em "Salvar Alterações" para aplicar.');
    } else {
      setBannerUrl(croppedDataUrl);
      setSuccessMessage('Nova foto de capa ajustada! Clique em "Salvar Alterações" para aplicar.');
    }
    setIsCropModalOpen(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSuccessMessage(null);
    setErrorMessage(null);

    const cleanUsername = username.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');

    if (!fullName.trim()) {
      const msg = 'Por favor, informe seu nome completo.';
      setErrorMessage(msg);
      setShowErrorModal(true);
      setSaving(false);
      return;
    }

    if (!cleanUsername) {
      const msg = 'Por favor, escolha um nome de usuário válido.';
      setErrorMessage(msg);
      setShowErrorModal(true);
      setSaving(false);
      return;
    }

    try {
      const payload: Partial<TeacherProfile> = {
        fullName: fullName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        username: cleanUsername,
        pageSlug: cleanUsername,
        area,
        customArea: area === 'Outros' ? customArea.trim() : null,
        bio: bio.trim(),
        avatarUrl,
        bannerUrl,
        instagram: instagram.trim(),
        tiktok: tiktok.trim(),
        youtube: youtube.trim(),
      };

      await TeacherProfileService.updateProfile(payload);
      setSuccessMessage('Seu perfil foi atualizado com sucesso! Redirecionando...');
      
      setTimeout(() => {
        router.push('/professor');
      }, 500);
    } catch (err: unknown) {
      if (err instanceof TeacherSessionError) {
        router.replace('/?login=true&perfil=professor&session=expired');
        return;
      }
      console.error('Erro ao atualizar perfil:', err);
      const msg = err instanceof Error ? err.message : 'Ocorreu um erro ao salvar as alterações. Tente novamente.';
      setErrorMessage(msg);
      setShowErrorModal(true);
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F5F1E8] flex items-center justify-center">
        <div className="flex flex-col items-center space-y-3">
          <Loader2 className="w-8 h-8 text-[#132E20] animate-spin" />
          <span className="text-sm font-semibold text-[#0F2942]">Carregando seu perfil...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F1E8] pb-16">
      
      {/* Header Bar */}
      <div className="bg-[#132E20] text-white border-b border-emerald-950 shadow-md">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <Link
              href="/professor"
              className="inline-flex items-center space-x-2 text-xs font-semibold text-emerald-300 hover:text-white transition-colors cursor-pointer bg-emerald-950/60 px-3 py-1.5 rounded-lg border border-emerald-800/40"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Voltar ao Painel</span>
            </Link>

            <span className="text-xs font-bold px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 uppercase tracking-wider">
              Configurações de Conta
            </span>
          </div>

          <div className="mt-4">
            <h1 className="text-2xl sm:text-3xl font-extrabold font-heading text-white tracking-tight">
              Perfil do Professor
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-2xl">
              Atualize sua foto de exibição, dados acadêmicos e links sociais para apresentar uma página profissional aos seus alunos.
            </p>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 mt-8">

        {/* Feedback Banners */}
        {successMessage && (
          <div className="mb-6 p-4 rounded-2xl bg-emerald-50 border border-emerald-300 text-emerald-900 flex items-start space-x-3 shadow-sm animate-fadeIn">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            <div className="text-xs sm:text-sm font-semibold">
              {successMessage}
            </div>
          </div>
        )}

        {errorMessage && (
          <div className="mb-6 p-4 rounded-2xl bg-rose-50 border border-rose-300 text-rose-900 flex items-start space-x-3 shadow-sm animate-fadeIn">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div className="text-xs sm:text-sm font-semibold">
              {errorMessage}
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-8">

          {/* Card 1: Foto de Perfil */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-6 sm:p-8 shadow-sm">
            <h2 className="text-lg font-bold font-heading text-[#0F2942] mb-1 flex items-center space-x-2">
              <Camera className="w-5 h-5 text-[#2E5B37]" />
              <span>Foto de Perfil</span>
            </h2>
            <p className="text-xs text-slate-500 mb-6">
              Sua foto será exibida no painel de controle e na página pública dos seus assistentes de IA.
            </p>

            <div className="flex flex-col sm:flex-row items-center space-y-4 sm:space-y-0 sm:space-x-6">
              {/* Avatar Box */}
              <div className="relative group shrink-0">
                {avatarUrl ? (
                  <OptimizedImage
                    src={avatarUrl}
                    alt="Foto de Perfil"
                    className="w-28 h-28 rounded-full object-cover border-4 border-emerald-100 shadow-md"
                  />
                ) : (
                  <div className="w-28 h-28 rounded-full bg-gradient-to-tr from-[#132E20] to-[#2E5B37] flex items-center justify-center text-white text-3xl font-extrabold border-4 border-emerald-100 shadow-md">
                    {fullName ? fullName.charAt(0).toUpperCase() : <User className="w-12 h-12 text-slate-200" />}
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute bottom-0 right-0 p-2.5 rounded-full bg-[#132E20] text-white hover:bg-[#2E5B37] shadow-lg transition-transform hover:scale-110 cursor-pointer"
                  title="Alterar foto"
                >
                  <Camera className="w-4 h-4" />
                </button>
              </div>

              {/* Upload Actions */}
              <div className="flex flex-col space-y-2 text-center sm:text-left">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleImageUpload}
                  accept="image/png, image/jpeg, image/webp"
                  className="hidden"
                />

                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-[#132E20] hover:bg-[#2E5B37] transition-all shadow-sm cursor-pointer"
                  >
                    Carregar nova foto
                  </button>

                  {avatarUrl && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setCropImageSrc(avatarUrl);
                          setCropType('avatar');
                          setIsCropModalOpen(true);
                        }}
                        className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 transition-all cursor-pointer flex items-center space-x-1.5"
                        title="Ajustar enquadramento e corte"
                      >
                        <Crop className="w-3.5 h-3.5 text-slate-600" />
                        <span>Ajustar corte</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleRemovePhoto}
                        className="px-4 py-2 rounded-xl text-xs font-semibold text-rose-600 bg-rose-50 border border-rose-200 hover:bg-rose-100 transition-all cursor-pointer flex items-center space-x-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Remover</span>
                      </button>
                    </>
                  )}
                </div>

                <span className="text-[11px] text-slate-400">
                  Formatos aceitos: JPG, PNG ou WEBP. Tamanho máximo: 5MB.
                </span>
              </div>
            </div>
          </div>

          {/* Card: Foto de Capa (Banner da Página de Vendas) */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-6 sm:p-8 shadow-sm">
            <h2 className="text-lg font-bold font-heading text-[#0F2942] mb-1 flex items-center space-x-2">
              <ImageIcon className="w-5 h-5 text-[#2E5B37]" />
              <span>Foto de Capa (Banner da Página de Vendas)</span>
            </h2>
            <p className="text-xs text-slate-500 mb-6">
              Esta imagem será exibida como o cabeçalho de destaque no topo da sua página pública de vendas dos seus assistentes de IA.
            </p>

            <div className="space-y-4">
              {/* Banner Preview Box */}
              <div className={`relative h-36 sm:h-48 rounded-2xl overflow-hidden border-2 border-dashed border-slate-300 flex items-center justify-center text-white shadow-inner group ${
                !bannerUrl ? 'bg-gradient-to-r from-[#1F130B] via-[#362114] to-[#4E2E1C]' : 'bg-[#2A1810]'
              }`}>
                {bannerUrl ? (
                  <>
                    <OptimizedImage
                      src={bannerUrl}
                      alt="Foto de Capa da Página de Vendas"
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px] opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2.5">
                      <button
                        type="button"
                        onClick={() => bannerInputRef.current?.click()}
                        className="px-3.5 py-2 rounded-xl text-xs font-bold text-white bg-[#132E20] hover:bg-[#2E5B37] transition-all shadow-md cursor-pointer flex items-center space-x-1.5"
                      >
                        <Camera className="w-4 h-4" />
                        <span>Alterar Capa</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setCropImageSrc(bannerUrl);
                          setCropType('banner');
                          setIsCropModalOpen(true);
                        }}
                        className="px-3.5 py-2 rounded-xl text-xs font-bold text-slate-800 bg-white hover:bg-slate-100 transition-all shadow-md cursor-pointer flex items-center space-x-1.5"
                      >
                        <Crop className="w-4 h-4 text-slate-700" />
                        <span>Ajustar Corte</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleRemoveBanner}
                        className="px-3.5 py-2 rounded-xl text-xs font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 transition-all shadow-md cursor-pointer flex items-center space-x-1.5"
                      >
                        <Trash2 className="w-4 h-4" />
                        <span>Remover</span>
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="text-center p-6 flex flex-col items-center">
                    <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center mb-3 border border-amber-400/20">
                      <ImageIcon className="w-6 h-6 text-amber-200" />
                    </div>
                    <span className="text-sm font-bold text-white">Nenhuma foto de capa definida</span>
                    <span className="text-xs text-amber-100/80 mt-1 max-w-md">
                      Sua página pública de vendas exibirá a imagem da sua foto de capa limpa em destaque.
                    </span>
                  </div>
                )}
              </div>

              {/* Upload Actions & Guidelines */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
                <input
                  type="file"
                  ref={bannerInputRef}
                  onChange={handleBannerUpload}
                  accept="image/png, image/jpeg, image/webp"
                  className="hidden"
                />

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => bannerInputRef.current?.click()}
                    className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-[#132E20] hover:bg-[#2E5B37] transition-all shadow-sm cursor-pointer flex items-center space-x-1.5"
                  >
                    <Camera className="w-4 h-4" />
                    <span>{bannerUrl ? 'Alterar foto de capa' : 'Carregar foto de capa'}</span>
                  </button>

                  {bannerUrl && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setCropImageSrc(bannerUrl);
                          setCropType('banner');
                          setIsCropModalOpen(true);
                        }}
                        className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 transition-all cursor-pointer flex items-center space-x-1.5"
                        title="Ajustar enquadramento e corte da capa"
                      >
                        <Crop className="w-3.5 h-3.5 text-slate-600" />
                        <span>Ajustar corte</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleRemoveBanner}
                        className="px-4 py-2 rounded-xl text-xs font-semibold text-rose-600 bg-rose-50 border border-rose-200 hover:bg-rose-100 transition-all cursor-pointer flex items-center space-x-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Remover</span>
                      </button>
                    </>
                  )}
                </div>

                <span className="text-[11px] text-slate-400">
                  Recomendado: 1200x400px. Formatos: JPG, PNG ou WEBP (máx. 5MB).
                </span>
              </div>
            </div>
          </div>

          {/* Card 2: Informações Pessoais e de Contato */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-6 sm:p-8 shadow-sm">
            <h2 className="text-lg font-bold font-heading text-[#0F2942] mb-1 flex items-center space-x-2">
              <User className="w-5 h-5 text-[#2E5B37]" />
              <span>Informações Pessoais</span>
            </h2>
            <p className="text-xs text-slate-500 mb-6">
              Dados fundamentais para identificação da sua conta e comunicações com alunos.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {/* Nome Completo */}
              <div>
                <label className="block text-xs font-bold text-[#0F2942] mb-1.5">
                  Nome Completo *
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Prof. João Silva"
                    required
                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-300 text-sm text-slate-800 bg-slate-50/50 focus:bg-white focus:border-[#132E20] focus:ring-2 focus:ring-[#132E20]/10 transition-all font-medium"
                  />
                  <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                </div>
              </div>

              {/* Email */}
              <div>
                <label className="block text-xs font-bold text-[#0F2942] mb-1.5">
                  E-mail Principal *
                </label>
                <div className="relative">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="professor@email.com"
                    required
                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-300 text-sm text-slate-800 bg-slate-50/50 focus:bg-white focus:border-[#132E20] focus:ring-2 focus:ring-[#132E20]/10 transition-all font-medium"
                  />
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                </div>
              </div>

              {/* Telefone / WhatsApp */}
              <div>
                <label className="block text-xs font-bold text-[#0F2942] mb-1.5">
                  Telefone / WhatsApp
                </label>
                <div className="relative">
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(formatPhone(e.target.value))}
                    placeholder="(11) 99999-9999"
                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-300 text-sm text-slate-800 bg-slate-50/50 focus:bg-white focus:border-[#132E20] focus:ring-2 focus:ring-[#132E20]/10 transition-all font-medium"
                  />
                  <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                </div>
              </div>

              {/* Nome de Usuário / Slug */}
              <div>
                <label className="block text-xs font-bold text-[#0F2942] mb-1.5">
                  Nome de Usuário / Link da Página *
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="prof-joao"
                    required
                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-300 text-sm text-slate-800 bg-slate-50/50 focus:bg-white focus:border-[#132E20] focus:ring-2 focus:ring-[#132E20]/10 transition-all font-medium"
                  />
                  <Globe className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                </div>
                {username && (
                  <p className="text-[11px] text-[#2E5B37] font-semibold mt-1">
                    Sua página: <span className="underline">meumonitor.ai/p/@{username.toLowerCase().replace(/[^a-z0-9_-]/g, '')}</span>
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Card 3: Perfil Acadêmico e Biografia */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-6 sm:p-8 shadow-sm">
            <h2 className="text-lg font-bold font-heading text-[#0F2942] mb-1 flex items-center space-x-2">
              <Briefcase className="w-5 h-5 text-[#2E5B37]" />
              <span>Área de Atuação e Biografia</span>
            </h2>
            <p className="text-xs text-slate-500 mb-6">
              Apresente suas qualificações para transmitir confiança aos estudantes.
            </p>

            <div className="space-y-6">
              {/* Área Principal */}
              <div>
                <label className="block text-xs font-bold text-[#0F2942] mb-1.5">
                  Área de Ensino Principal
                </label>
                <select
                  value={area}
                  onChange={(e) => setArea(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-slate-300 text-sm text-slate-800 bg-slate-50/50 focus:bg-white focus:border-[#132E20] focus:ring-2 focus:ring-[#132E20]/10 transition-all font-medium cursor-pointer"
                >
                  {AREAS.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </div>

              {area === 'Outros' && (
                <div>
                  <label className="block text-xs font-bold text-[#0F2942] mb-1.5">
                    Especifique sua Área
                  </label>
                  <input
                    type="text"
                    value={customArea}
                    onChange={(e) => setCustomArea(e.target.value)}
                    placeholder="Ex: Programação, Música, Filosofia"
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 text-sm text-slate-800 bg-slate-50/50 focus:bg-white focus:border-[#132E20] focus:ring-2 focus:ring-[#132E20]/10 transition-all font-medium"
                  />
                </div>
              )}

              {/* Biografia */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-bold text-[#0F2942]">
                    Mini Biografia / Apresentação
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
                  placeholder="Escreva um breve resumo da sua experiência de ensino, conquistas de alunos e metodologia..."
                  className="w-full px-4 py-3 rounded-xl border border-slate-300 text-sm text-slate-800 bg-slate-50/50 focus:bg-white focus:border-[#132E20] focus:ring-2 focus:ring-[#132E20]/10 transition-all font-medium resize-y"
                />
              </div>
            </div>
          </div>

          {/* Card 4: Redes Sociais */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-6 sm:p-8 shadow-sm">
            <h2 className="text-lg font-bold font-heading text-[#0F2942] mb-1 flex items-center space-x-2">
              <Globe className="w-5 h-5 text-[#2E5B37]" />
              <span>Redes Sociais & Presença Digital</span>
            </h2>
            <p className="text-xs text-slate-500 mb-6">
              Adicione os perfis onde seus alunos podem encontrar mais sobre seu conteúdo.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              {/* Instagram */}
              <div>
                <label className="block text-xs font-bold text-[#0F2942] mb-1.5">
                  Instagram
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={instagram}
                    onChange={(e) => setInstagram(e.target.value)}
                    placeholder="@seu.instagram"
                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-300 text-sm text-slate-800 bg-slate-50/50 focus:bg-white focus:border-[#132E20] focus:ring-2 focus:ring-[#132E20]/10 transition-all font-medium"
                  />
                  <AtSign className="w-4 h-4 text-pink-600 absolute left-3.5 top-3.5" />
                </div>
              </div>

              {/* TikTok */}
              <div>
                <label className="block text-xs font-bold text-[#0F2942] mb-1.5">
                  TikTok
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={tiktok}
                    onChange={(e) => setTiktok(e.target.value)}
                    placeholder="@seu.tiktok"
                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-300 text-sm text-slate-800 bg-slate-50/50 focus:bg-white focus:border-[#132E20] focus:ring-2 focus:ring-[#132E20]/10 transition-all font-medium"
                  />
                  <Video className="w-4 h-4 text-slate-800 absolute left-3.5 top-3.5" />
                </div>
              </div>

              {/* YouTube */}
              <div>
                <label className="block text-xs font-bold text-[#0F2942] mb-1.5">
                  Canal do YouTube
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={youtube}
                    onChange={(e) => setYoutube(e.target.value)}
                    placeholder="youtube.com/@seuCanal"
                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-300 text-sm text-slate-800 bg-slate-50/50 focus:bg-white focus:border-[#132E20] focus:ring-2 focus:ring-[#132E20]/10 transition-all font-medium"
                  />
                  <PlayCircle className="w-4 h-4 text-red-600 absolute left-3.5 top-3.5" />
                </div>
              </div>
            </div>
          </div>

          {/* Action Bar Footer */}
          <div className="flex items-center justify-end space-x-4 pt-4 border-t border-slate-300/80">
            <Link
              href="/professor"
              className="px-6 py-3 rounded-xl font-bold text-xs sm:text-sm text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 transition-colors shadow-xs"
            >
              Cancelar
            </Link>

            <button
              type="submit"
              disabled={saving}
              className="px-7 py-3 rounded-xl font-bold text-xs sm:text-sm text-white bg-[#132E20] hover:bg-[#2E5B37] transition-all shadow-md flex items-center space-x-2 cursor-pointer disabled:opacity-50"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Salvando...</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>Salvar Alterações</span>
                </>
              )}
            </button>
          </div>

        </form>
      </div>

      {/* Modal de Avisos e Erros */}
      {showErrorModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 flex flex-col items-center text-center relative animate-scaleUp">
            <button
              type="button"
              onClick={() => setShowErrorModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-1.5 rounded-full hover:bg-slate-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="w-14 h-14 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center mb-4 border border-amber-200 shadow-sm">
              <AlertTriangle className="w-7 h-7" />
            </div>
            <h3 className="text-lg font-extrabold font-heading text-slate-900 mb-2">
              Atenção ao Salvar Alterações
            </h3>
            <p className="text-xs sm:text-sm text-slate-600 font-medium leading-relaxed mb-6">
              {errorMessage || 'Ocorreu um erro ao salvar as alterações do seu perfil. Verifique os campos e tente novamente.'}
            </p>
            <button
              type="button"
              onClick={() => setShowErrorModal(false)}
              className="w-full py-3 rounded-xl font-bold text-xs sm:text-sm text-white bg-[#132E20] hover:bg-[#2E5B37] transition-all shadow-md cursor-pointer"
            >
              Entendido
            </button>
          </div>
        </div>
      )}

      {/* Modal para redimensionar e recortar Foto de Perfil ou Capa */}
      <ImageCropModal
        isOpen={isCropModalOpen}
        imageSrc={cropImageSrc}
        cropType={cropType}
        title={cropType === 'avatar' ? 'Enquadrar Foto de Perfil' : 'Enquadrar Foto de Capa (Banner)'}
        onClose={() => setIsCropModalOpen(false)}
        onConfirm={handleConfirmCrop}
      />

    </div>
  );
};
