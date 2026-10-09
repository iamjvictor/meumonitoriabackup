'use client';
import { OptimizedImage } from '@/shared';
/* eslint-disable react-hooks/set-state-in-effect -- Form state mirrors the authenticated profile. */

import { useState, useEffect, useRef } from 'react';
import {
  User, Mail, Phone, ShieldCheck, CheckCircle2, AlertCircle,
  Save, Loader2, Lock, Sparkles, Camera, Trophy, Zap
} from 'lucide-react';
import { StudentHeader, StudentRightSidebar, StudentSidebar, useStudent } from '@/modules/student';

async function compressImageClient(file: File, maxWidth = 800, quality = 0.82): Promise<Blob> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;

      if (width > maxWidth || height > maxWidth) {
        if (width > height) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        } else {
          width = Math.round((width * maxWidth) / height);
          height = maxWidth;
        }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(file);
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else resolve(file);
        },
        'image/jpeg',
        quality
      );
    };
    img.onerror = () => resolve(file);
    img.src = url;
  });
}

export default function StudentProfilePage() {
  const { student, updateProfile, refreshSession } = useStudent();

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [cpf, setCpf] = useState('');

  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const [experience, setExperience] = useState<{ totalXp: number; level: number } | null>(null);
  const [isLoadingExperience, setIsLoadingExperience] = useState(true);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (student) {
      setFullName(student.fullName || '');
      setPhone(student.whatsapp || '');
      setCpf(student.cpf || '');
    }
  }, [student]);

  useEffect(() => {
    let active = true;
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8443';
    fetch(`${apiUrl}/api/v1/student/experience`, { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => {
        if (active && body?.data) {
          setExperience({
            totalXp: body.data.totalXp ?? 0,
            level: body.data.level ?? 1,
          });
        }
      })
      .catch(() => {})
      .finally(() => {
        if (active) setIsLoadingExperience(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setFeedback({ type: 'error', message: 'Selecione um arquivo de imagem válido.' });
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setFeedback({ type: 'error', message: 'A foto de perfil deve ter no máximo 10 MB.' });
      return;
    }

    const formatBytes = (bytes: number) => {
      if (bytes < 1024) return `${bytes} B`;
      if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
      return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    };

    console.log(`📷 [AVATAR CLIENT] Foto original selecionada: ${file.name} | Tamanho: ${formatBytes(file.size)} | Tipo: ${file.type}`);

    setIsUploadingPhoto(true);
    setFeedback(null);

    try {
      const compressedBlob = await compressImageClient(file, 800, 0.82);
      const reduction = (((file.size - compressedBlob.size) / file.size) * 100).toFixed(1);

      console.log(`✨ [AVATAR CLIENT COMPACTADO] Tamanho apos canvas (max 800px): ${formatBytes(compressedBlob.size)} | Reducao: ${reduction}%`);

      const formData = new FormData();
      formData.append('file', compressedBlob, 'avatar.jpg');

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8443';
      const res = await fetch(`${apiUrl}/api/v1/me/avatar`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      if (res.ok) {
        await refreshSession();
        setFeedback({ type: 'success', message: 'Foto de perfil atualizada com sucesso!' });
        setTimeout(() => setFeedback(null), 4000);
      } else {
        const errorData = await res.json().catch(() => ({}));
        setFeedback({
          type: 'error',
          message: errorData.message || 'Erro ao fazer upload da imagem. Tente novamente.',
        });
      }
    } catch (err) {
      console.error('Erro ao enviar imagem de perfil:', err);
      setFeedback({ type: 'error', message: 'Falha de conexão ao enviar imagem.' });
    } finally {
      setIsUploadingPhoto(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setFeedback(null);

    const success = await updateProfile({
      fullName,
      phone,
      cpf,
    });

    setIsSaving(false);

    if (success) {
      setFeedback({
        type: 'success',
        message: 'Seus dados de perfil foram atualizados com sucesso!',
      });
      setTimeout(() => setFeedback(null), 4000);
    } else {
      setFeedback({
        type: 'error',
        message: 'Ocorreu um erro ao salvar seu perfil. Tente novamente.',
      });
    }
  };

  return (
    <main className="min-h-screen bg-[#F5F1E8] text-[#0F2942]">
      <div className="flex min-h-screen w-full">
        <StudentSidebar activeNav="overview" />

        <section className="min-w-0 flex-1 px-5 py-5 sm:px-8 lg:px-12 lg:py-8">
          <StudentHeader
            title="Meu Perfil"
            breadcrumbs={[
              { label: 'Área do aluno', href: '/areadoaluno' },
              { label: 'Meu perfil' },
            ]}
          />

          {/* Page Container */}
          <div className="mt-8 grid gap-8 xl:grid-cols-[1fr_340px]">
            {/* Main Form Column */}
            <div className="space-y-6">
              {/* Input de arquivo invisível para o upload de foto */}
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleAvatarChange}
                accept="image/*"
                className="hidden"
              />

              {/* Profile Header Block: Circular Photo + Blue Banner on the right */}
              <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center sm:gap-6">
                {/* Circular Profile Photo (Left of Blue Banner) */}
                <div className="relative h-24 w-24 shrink-0 sm:h-28 sm:w-28">
                  {student?.avatarUrl ? (
                    <OptimizedImage
                      src={student.avatarUrl}
                      alt="Foto de perfil"
                      className="h-24 w-24 sm:h-28 sm:w-28 rounded-full object-cover ring-4 ring-[#0F2942]/10 shadow-lg"
                    />
                  ) : (
                    <div className="flex h-24 w-24 sm:h-28 sm:w-28 items-center justify-center rounded-full bg-[#76D69B] font-heading text-2xl sm:text-3xl font-bold text-[#0F2942] shadow-lg ring-4 ring-[#0F2942]/10">
                      {student?.initials || 'ST'}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploadingPhoto}
                    title="Alterar foto de perfil"
                    className="absolute bottom-0 right-0 flex h-8 w-8 items-center justify-center rounded-full bg-[#2E5B37] text-white shadow-md transition hover:bg-[#2E5B37]/90 hover:scale-105 active:scale-95 disabled:opacity-50 ring-2 ring-white"
                  >
                    {isUploadingPhoto ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Camera className="h-4 w-4" />
                    )}
                  </button>
                </div>

                {/* Blue Banner Header (To the right of the photo) */}
                <div className="relative flex-1 w-full overflow-hidden rounded-[28px] bg-[#0F2942] p-6 text-white shadow-[0_20px_40px_rgba(15,41,66,0.12)] sm:p-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="pointer-events-none absolute -right-12 -top-12 h-44 w-44 rounded-full bg-[#76D69B]/15 blur-2xl" />

                  <div className="relative">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-heading text-xl font-bold text-white sm:text-2xl">
                        {student?.fullName || student?.firstName || 'Estudante'}
                      </h2>
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#76D69B]/20 px-2.5 py-0.5 text-[10px] font-bold text-[#76D69B]">
                        <Sparkles className="h-3 w-3" /> Conta Ativa
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-white/60 sm:text-sm">{student?.email}</p>
                  </div>

                  {/* Badges de Nível e XP do Usuário */}
                  <div className="relative flex flex-wrap items-center gap-3 self-start sm:self-center">
                    {/* Level Badge */}
                    <div className="flex items-center gap-2.5 rounded-2xl bg-white/10 px-3.5 py-2 backdrop-blur-md border border-white/10 shadow-sm">
                      <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-[#76D69B]/20 text-[#76D69B]">
                        <Trophy className="h-3.5 w-3.5" />
                      </div>
                      <div className="text-left">
                        <p className="text-[9px] font-bold uppercase tracking-wider text-white/50">Nível</p>
                        <p className="font-heading text-xs font-bold text-white">
                          {isLoadingExperience ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            `Nível ${experience?.level ?? 1}`
                          )}
                        </p>
                      </div>
                    </div>

                    {/* XP Badge */}
                    <div className="flex items-center gap-2.5 rounded-2xl bg-white/10 px-3.5 py-2 backdrop-blur-md border border-white/10 shadow-sm">
                      <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-[#76D69B] text-[#0F2942]">
                        <Zap className="h-3.5 w-3.5 fill-current" />
                      </div>
                      <div className="text-left">
                        <p className="text-[9px] font-bold uppercase tracking-wider text-white/50">Experiência</p>
                        <p className="font-heading text-xs font-bold text-[#76D69B]">
                          {isLoadingExperience ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            `${(experience?.totalXp ?? 0).toLocaleString('pt-BR')} XP`
                          )}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Feedback Alert */}
              {feedback && (
                <div
                  className={`flex items-center gap-3 rounded-2xl p-4 text-xs font-semibold shadow-sm transition-all animate-fade-in ${
                    feedback.type === 'success'
                      ? 'bg-[#DCEBDD] text-[#1E4327] border border-[#2E5B37]/30'
                      : 'bg-rose-50 text-rose-800 border border-rose-200'
                  }`}
                >
                  {feedback.type === 'success' ? (
                    <CheckCircle2 className="h-5 w-5 shrink-0 text-[#2E5B37]" />
                  ) : (
                    <AlertCircle className="h-5 w-5 shrink-0 text-rose-600" />
                  )}
                  <span>{feedback.message}</span>
                </div>
              )}

              {/* Edit Profile Form */}
              <form onSubmit={handleSubmit} className="rounded-[28px] border border-[#0F2942]/10 bg-white p-6 shadow-sm sm:p-8 space-y-6">
                <div className="border-b border-[#0F2942]/08 pb-4">
                  <h3 className="font-heading text-lg font-bold text-[#0F2942]">
                    Informações Pessoais
                  </h3>
                  <p className="mt-1 text-xs text-[#0F2942]/55">
                    Mantenha seus dados cadastrais atualizados para garantir melhor suporte e emissão de certificados.
                  </p>
                </div>

                <div className="grid gap-6 sm:grid-cols-2">
                  {/* Full Name Input */}
                  <div className="sm:col-span-2 space-y-2">
                    <label className="block text-xs font-bold uppercase tracking-wider text-[#0F2942]/70">
                      Nome Completo
                    </label>
                    <div className="relative">
                      <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-[#0F2942]/40">
                        <User className="h-4 w-4" />
                      </div>
                      <input
                        type="text"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="Seu nome completo"
                        required
                        className="w-full rounded-xl border border-[#0F2942]/15 bg-[#F5F1E8]/30 py-3 pl-10 pr-4 text-sm font-semibold text-[#0F2942] placeholder-[#0F2942]/35 outline-none transition focus:border-[#2E5B37] focus:bg-white focus:ring-2 focus:ring-[#2E5B37]/20"
                      />
                    </div>
                  </div>

                  {/* Email Input (Disabled/Read-only) */}
                  <div className="sm:col-span-2 space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-bold uppercase tracking-wider text-[#0F2942]/70">
                        E-mail de Acesso
                      </label>
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#0F2942]/45">
                        <Lock className="h-3 w-3" /> Gerenciado pela conta
                      </span>
                    </div>
                    <div className="relative">
                      <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-[#0F2942]/30">
                        <Mail className="h-4 w-4" />
                      </div>
                      <input
                        type="email"
                        value={student?.email || ''}
                        disabled
                        className="w-full cursor-not-allowed rounded-xl border border-[#0F2942]/10 bg-[#0F2942]/05 py-3 pl-10 pr-4 text-sm font-medium text-[#0F2942]/60 select-none"
                      />
                    </div>
                  </div>

                  {/* WhatsApp / Telefone */}
                  <div className="space-y-2">
                    <label className="block text-xs font-bold uppercase tracking-wider text-[#0F2942]/70">
                      WhatsApp / Telefone
                    </label>
                    <div className="relative">
                      <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-[#0F2942]/40">
                        <Phone className="h-4 w-4" />
                      </div>
                      <input
                        type="text"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="(00) 90000-0000"
                        className="w-full rounded-xl border border-[#0F2942]/15 bg-[#F5F1E8]/30 py-3 pl-10 pr-4 text-sm font-semibold text-[#0F2942] placeholder-[#0F2942]/35 outline-none transition focus:border-[#2E5B37] focus:bg-white focus:ring-2 focus:ring-[#2E5B37]/20"
                      />
                    </div>
                  </div>

                  {/* CPF */}
                  <div className="space-y-2">
                    <label className="block text-xs font-bold uppercase tracking-wider text-[#0F2942]/70">
                      CPF
                    </label>
                    <div className="relative">
                      <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-[#0F2942]/40">
                        <ShieldCheck className="h-4 w-4" />
                      </div>
                      <input
                        type="text"
                        value={cpf}
                        onChange={(e) => setCpf(e.target.value)}
                        placeholder="000.000.000-00"
                        className="w-full rounded-xl border border-[#0F2942]/15 bg-[#F5F1E8]/30 py-3 pl-10 pr-4 text-sm font-semibold text-[#0F2942] placeholder-[#0F2942]/35 outline-none transition focus:border-[#2E5B37] focus:bg-white focus:ring-2 focus:ring-[#2E5B37]/20"
                      />
                    </div>
                  </div>
                </div>

                {/* Submit Action Button */}
                <div className="flex justify-end pt-4 border-t border-[#0F2942]/08">
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="inline-flex items-center gap-2 rounded-xl bg-[#2E5B37] px-6 py-3 text-sm font-bold text-white shadow-md transition hover:bg-[#2E5B37]/90 active:scale-[0.98] disabled:opacity-50"
                  >
                    {isSaving ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" /> Salvando...
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4" /> Salvar Alterações
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>

            {/* Sidebar Column: Account Details & Quick Help */}
            <div className="space-y-6">
              <div className="rounded-[28px] border border-[#0F2942]/10 bg-white p-6 shadow-sm space-y-4">
                <h4 className="font-heading text-sm font-bold text-[#0F2942] uppercase tracking-wider">
                  Resumo da Conta
                </h4>

                <div className="space-y-3 text-xs">
                  <div className="flex items-center justify-between py-2 border-b border-[#0F2942]/05">
                    <span className="text-[#0F2942]/60 font-medium">Tipo de Conta</span>
                    <span className="font-bold text-[#0F2942]">Estudante</span>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b border-[#0F2942]/05">
                    <span className="text-[#0F2942]/60 font-medium">Status</span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-[#DCEBDD] px-2 py-0.5 font-bold text-[#2E5B37]">
                      Ativo
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <span className="text-[#0F2942]/60 font-medium">ID da Conta</span>
                    <span className="font-mono text-[10px] font-bold text-[#0F2942]/50 truncate max-w-[120px]">
                      {student?.userId}
                    </span>
                  </div>
                </div>
              </div>

              {/* Support Info Card */}
              <div className="rounded-[28px] bg-[#2E5B37]/08 border border-[#2E5B37]/20 p-6 space-y-3">
                <div className="flex items-center gap-2 text-[#2E5B37]">
                  <Sparkles className="h-5 w-5" />
                  <h4 className="font-heading text-sm font-bold">Precisa de Ajuda?</h4>
                </div>
                <p className="text-xs text-[#0F2942]/70 leading-relaxed">
                  Para alterar seu e-mail de acesso ou tirar dúvidas sobre sua assinatura, fale diretamente com a nossa equipe de suporte.
                </p>
              </div>
            </div>
          </div>
        </section>

        <StudentRightSidebar />
      </div>
    </main>
  );
}
