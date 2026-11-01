'use client';
import { OptimizedImage } from '@/shared';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import NextImage from 'next/image';
import { X, CheckCircle2, User, Mail, Lock, Phone, BookOpen, Sparkles, ArrowRight, ArrowLeft, ShieldCheck, Globe, Eye, EyeOff, Camera, ZoomIn, Crop, Check, RotateCcw, FileText, Building2, UserCheck } from 'lucide-react';
import confetti from 'canvas-confetti';
import type { TeacherRegistrationForm, RegistrationStep } from '@/types';
import { TeacherRegistrationService } from '../services/TeacherRegistrationService';
import { ApiErrorNotice } from '@/shared/errors/ApiErrorNotice';
import { createApiError, normalizeApiError, type ApiError } from '@/shared/errors/api-error';

interface TeacherRegistrationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const InstagramIcon: React.FC<{ className?: string }> = ({ className = "w-4 h-4" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
    <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
  </svg>
);

const TikTokIcon: React.FC<{ className?: string }> = ({ className = "w-4 h-4" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 1 1-2.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 1 0 5.55 6.34V9.43a8.28 8.28 0 0 0 4.77 1.47V7.45a4.86 4.86 0 0 1-1.04-.76z"/>
  </svg>
);

const YoutubeIcon: React.FC<{ className?: string }> = ({ className = "w-4 h-4" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
  </svg>
);

/* Document formatting helper for CPF and CNPJ */
const formatDocument = (value: string, type: 'CPF' | 'CNPJ') => {
  const digits = value.replace(/\D/g, '');
  if (type === 'CPF') {
    const d = digits.slice(0, 11);
    return d
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  } else {
    const d = digits.slice(0, 14);
    return d
      .replace(/^(\d{2})(\d)/, '$1.$2')
      .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/\.(\d{3})(\d)/, '.$1/$2')
      .replace(/(\d{4})(\d)/, '$1-$2');
  }
};

/* Phone formatting helper for BR phone numbers (10 or 11 digits) */
const formatPhone = (value: string) => {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length === 0) return '';
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
};

/* Sub-modal for interactive photo cropping & dragging */
interface AvatarCropModalProps {
  isOpen: boolean;
  imageSrc: string | null;
  onClose: () => void;
  onConfirm: (croppedDataUrl: string) => void;
  onError: () => void;
}

const AvatarCropModal: React.FC<AvatarCropModalProps> = ({
  isOpen,
  imageSrc,
  onClose,
  onConfirm,
  onError,
}) => {
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  if (!isOpen || !imageSrc) return null;

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setOffset({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      setIsDragging(true);
      setDragStart({
        x: e.touches[0].clientX - offset.x,
        y: e.touches[0].clientY - offset.y,
      });
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging || e.touches.length !== 1) return;
    setOffset({
      x: e.touches[0].clientX - dragStart.x,
      y: e.touches[0].clientY - dragStart.y,
    });
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
  };

  const handleCropSave = () => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const failToProcessImage = () => onError();
    img.onerror = failToProcessImage;
    img.onload = () => {
      try {
        const imageWidth = img.naturalWidth || img.width;
        const imageHeight = img.naturalHeight || img.height;
        if (imageWidth <= 0 || imageHeight <= 0) {
          failToProcessImage();
          return;
        }

        const canvas = document.createElement('canvas');
        const outputSize = 360;
        canvas.width = outputSize;
        canvas.height = outputSize;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          failToProcessImage();
          return;
        }

        ctx.beginPath();
        ctx.arc(outputSize / 2, outputSize / 2, outputSize / 2, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();

        const viewportSize = 220;
        const ratio = outputSize / viewportSize;

        const minDim = Math.min(imageWidth, imageHeight);
        const baseWidth = (imageWidth / minDim) * viewportSize;
        const baseHeight = (imageHeight / minDim) * viewportSize;

        const scaledW = baseWidth * zoom * ratio;
        const scaledH = baseHeight * zoom * ratio;

        const drawX = (outputSize - scaledW) / 2 + offset.x * ratio;
        const drawY = (outputSize - scaledH) / 2 + offset.y * ratio;

        ctx.drawImage(img, drawX, drawY, scaledW, scaledH);

        const croppedUrl = canvas.toDataURL('image/png');
        onConfirm(croppedUrl);
      } catch {
        failToProcessImage();
      }
    };
    try {
      img.src = imageSrc;
    } catch {
      failToProcessImage();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden p-6 space-y-5">
        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
          <div className="flex items-center space-x-2 text-[#0F2942]">
            <Crop className="w-5 h-5 text-[#2E5B37]" />
            <h4 className="font-heading font-bold text-base">Ajustar e Cortar Foto de Perfil</h4>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-xs text-slate-600 text-center">
          Clique e **arraste a foto** para posicionar o rosto. Use a barra para **ajustar o zoom**.
        </p>

        {/* Viewport Cropper Box */}
        <div
          className="relative w-[260px] h-[260px] mx-auto bg-slate-900 rounded-2xl overflow-hidden cursor-grab active:cursor-grabbing select-none border-2 border-slate-700 flex items-center justify-center shadow-inner"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <OptimizedImage
            src={imageSrc}
            alt="Preview"
            draggable={false}
            className="absolute max-w-none transition-transform duration-75 pointer-events-none"
            style={{
              width: '220px',
              height: 'auto',
              maxHeight: 'none',
              transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
            }}
          />

          <div className="absolute inset-0 pointer-events-none ring-[100px] ring-black/70 rounded-full border-2 border-emerald-400 shadow-2xl" />
        </div>

        {/* Zoom Slider & Reset */}
        <div className="space-y-2 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
          <div className="flex items-center justify-between text-xs text-slate-700 font-medium">
            <span className="flex items-center font-semibold text-[#0F2942]">
              <ZoomIn className="w-4 h-4 mr-1 text-[#2E5B37]" /> Zoom da Foto:
            </span>
            <span className="font-mono text-xs font-bold text-[#0F2942] bg-white px-2 py-0.5 rounded border border-slate-200">
              {zoom.toFixed(1)}x
            </span>
          </div>
          <div className="flex items-center space-x-3">
            <span className="text-xs font-bold text-slate-400">1x</span>
            <input
              type="range"
              min="1"
              max="3"
              step="0.05"
              value={zoom}
              onChange={(e) => setZoom(parseFloat(e.target.value))}
              className="w-full accent-[#0F2942] cursor-pointer"
            />
            <span className="text-xs font-bold text-slate-400">3x</span>
          </div>
        </div>

        {/* Buttons */}
        <div className="flex items-center justify-between pt-2">
          <button
            type="button"
            onClick={() => {
              setZoom(1);
              setOffset({ x: 0, y: 0 });
            }}
            className="text-xs font-semibold text-slate-500 hover:text-slate-800 flex items-center cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5 mr-1" /> Redefinir
          </button>

          <div className="flex space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleCropSave}
              className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-[#0F2942] hover:bg-[#1E3A8A] transition-all shadow-md flex items-center space-x-1 cursor-pointer"
            >
              <Check className="w-4 h-4 mr-1 text-emerald-400" />
              <span>Confirmar Foto</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const INITIAL_FORM: TeacherRegistrationForm = {
  fullName: '',
  email: '',
  password: '',
  phone: '',
  docType: 'CPF',
  documentNumber: '',
  username: '',
  area: 'Concursos Públicos',
  customArea: '',
  bio: '',
  pageSlug: '',
  avatarUrl: '',
  instagram: '',
  tiktok: '',
  youtube: '',
  agreedTerms: false,
};

const AREAS_LIST = [
  'Concursos Públicos',
  'Exame de Ordem (OAB)',
  'ENEM & Vestibulares',
  'Residência Médica & Saúde',
  'TI, Programação & Certificações',
  'Idiomas & Certificações Internacionais',
  'Outro (Especificar)',
];

const normalizeTeacherSlug = (value: string) => value
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 60)
  .replace(/-+$/g, '');

export const TeacherRegistrationModal: React.FC<TeacherRegistrationModalProps> = ({ isOpen, onClose }) => {
  const router = useRouter();
  const [step, setStep] = useState<RegistrationStep>(1);
  const [formData, setFormData] = useState<TeacherRegistrationForm>(INITIAL_FORM);
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submittingStep1, setSubmittingStep1] = useState(false);
  const [step1Error, setStep1Error] = useState<ApiError | null>(null);
  const [maxUnlockedStep, setMaxUnlockedStep] = useState<RegistrationStep>(1);
  const [submitError, setSubmitError] = useState<ApiError | null>(null);

  // Avatar cropping modal state
  const [rawImageSrc, setRawImageSrc] = useState<string | null>(null);
  const [isCropModalOpen, setIsCropModalOpen] = useState(false);

  if (!isOpen) return null;

  // Password verification calculations
  const password = formData.password || '';
  const hasMinLength = password.length >= 8;
  const hasUppercase = /[A-Z]/.test(password);
  const hasLowercase = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecialChar = /[^A-Za-z0-9]/.test(password);

  const passwordCriteriaMet = [
    hasMinLength,
    hasUppercase,
    hasLowercase,
    hasNumber,
    hasSpecialChar,
  ].filter(Boolean).length;

  const isPasswordValid = passwordCriteriaMet === 5;
  const passwordsMatch = password !== '' && password === confirmPassword;

  const handleChange = <Field extends keyof TeacherRegistrationForm>(
    field: Field,
    value: TeacherRegistrationForm[Field]
  ) => {
    setStep1Error(null);
    setSubmitError(null);
    setFormData((prev) => {
      const updated = { ...prev, [field]: value };
      if (field === 'fullName' && typeof value === 'string') {
        const slug = normalizeTeacherSlug(value);
        const previousGeneratedSlug = normalizeTeacherSlug(prev.fullName);
        if (!prev.username || prev.username === previousGeneratedSlug) {
          updated.username = slug;
          updated.pageSlug = slug;
        }
      }
      return updated;
    });
  };

  const handleDocumentTypeChange = (type: 'CPF' | 'CNPJ') => {
    setStep1Error(null);
    setFormData((prev) => ({
      ...prev,
      docType: type,
      documentNumber: '',
    }));
  };

  const handleDocumentNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatDocument(e.target.value, formData.docType);
    handleChange('documentNumber', formatted);
  };

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSubmitError(null);
      const reader = new FileReader();
      const reportReadFailure = () => setSubmitError(createApiError(
        'AVATAR_READ_FAILED',
        'Não foi possível ler a imagem selecionada.',
        { avatarUrl: ['Escolha outra imagem ou tente novamente.'] },
      ));
      reader.onload = () => {
        if (typeof reader.result !== 'string' || !reader.result.startsWith('data:image/')) {
          reportReadFailure();
          return;
        }
        setRawImageSrc(reader.result);
        setIsCropModalOpen(true);
      };
      reader.onerror = reportReadFailure;
      try {
        reader.readAsDataURL(file);
      } catch {
        reportReadFailure();
      }
    }
    e.target.value = '';
  };

  const handleConfirmCroppedPhoto = (croppedDataUrl: string) => {
    setSubmitError(null);
    setFormData((prev) => ({
      ...prev,
      avatarUrl: croppedDataUrl,
    }));
    setIsCropModalOpen(false);
  };

  const handleNext = async () => {
    if (step === 1) {
      setSubmittingStep1(true);
      setStep1Error(null);

      try {
        await TeacherRegistrationService.registerAccountStep1({
          fullName: formData.fullName,
          email: formData.email,
          password: formData.password || '',
          phone: formData.phone || undefined,
          docType: formData.docType,
          documentNumber: formData.documentNumber,
          role: 'teacher',
        });

        setMaxUnlockedStep(2);
        setStep(2);
      } catch (err: unknown) {
        const normalizedError = normalizeApiError(err, 'Não foi possível criar sua conta.');
        console.warn('Falha no cadastro da conta do professor:', normalizedError.code);
        setStep1Error(normalizedError);
      } finally {
        setSubmittingStep1(false);
      }
      return;
    }

    if (step === 2) {
      setMaxUnlockedStep(3);
      setStep(3);
    }
  };

  const handlePrev = () => {
    if (step > 1 && step < 4) {
      setStep((prev) => (prev - 1) as RegistrationStep);
    }
  };

  const handleConfirmSubmit = async () => {
    setSubmitting(true);
    setSubmitError(null);

    try {
      const profilePayload = {
        email: formData.email,
        username: formData.username || formData.fullName.toLowerCase().replace(/\s+/g, '-'),
        area: formData.area,
        customArea: formData.area === 'Outro (Especificar)' ? formData.customArea : undefined,
        bio: formData.bio || undefined,
        pageSlug: formData.username || formData.fullName.toLowerCase().replace(/\s+/g, '-'),
        avatarUrl: undefined,
        instagram: formData.instagram || undefined,
        tiktok: formData.tiktok || undefined,
        youtube: formData.youtube || undefined,
        agreedTerms: true,
      };

      // O perfil precisa existir antes do endpoint de imagem atualizar avatarUrl.
      await TeacherRegistrationService.updateProfileStep2(profilePayload);

      if (formData.avatarUrl) {
        const avatarUrl = await TeacherRegistrationService.uploadProfileImage(formData.avatarUrl);
        await TeacherRegistrationService.updateProfileStep2({ ...profilePayload, avatarUrl });
      }

      setMaxUnlockedStep(4);
      setStep(4);
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
      });
    } catch (err: unknown) {
      const normalizedError = normalizeApiError(err, 'Não foi possível concluir o cadastro. Seus dados continuam preenchidos.');
      console.warn('Falha no cadastro do perfil do professor:', normalizedError.code);
      setSubmitError(normalizedError);
    } finally {
      setSubmitting(false);
    }
  };

  const resetModal = () => {
    setStep(1);
    setMaxUnlockedStep(1);
    setFormData(INITIAL_FORM);
    setStep1Error(null);
    setSubmitError(null);
    setConfirmPassword('');
    setShowPassword(false);
    setShowConfirmPassword(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0F2942]/60 backdrop-blur-md overflow-y-auto">
      
      {/* Modal Container */}
      <div className="relative w-full max-w-3xl bg-white border border-slate-200 rounded-3xl shadow-2xl overflow-hidden my-8">
        
        {/* Header */}
        <div className="px-6 py-5 bg-[#0F2942] border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <NextImage src="/logoSemfundo.png" alt="MeuMonitor AI" width={40} height={40} className="w-10 h-10 object-contain" />
            <div>
              <h3 className="font-heading font-bold text-white text-lg">Cadastro de Professor & Criador</h3>
              <p className="text-xs text-slate-300">Crie seu perfil e receba sua página pública de vendas</p>
            </div>
          </div>
          <button
            onClick={resetModal}
            className="p-2 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Wizard Steps Indicator */}
        <div className="px-4 py-3 bg-slate-100 border-b border-slate-200 flex items-center justify-between text-xs font-semibold overflow-x-auto">
          {[
            { num: 1, label: 'Informações' },
            { num: 2, label: 'Perfil' },
            { num: 3, label: 'Redes Sociais' },
            { num: 4, label: 'Status' },
          ].map((s) => (
            <button
              key={s.num}
              type="button"
              onClick={() => {
                if (s.num <= maxUnlockedStep && !(s.num === 1 && maxUnlockedStep > 1)) {
                  setStep(s.num as RegistrationStep);
                }
              }}
              disabled={s.num > maxUnlockedStep || (s.num === 1 && maxUnlockedStep > 1)}
              aria-current={step === s.num ? 'step' : undefined}
              className="flex items-center space-x-1.5 focus:outline-none hover:opacity-80 transition-opacity cursor-pointer shrink-0 px-1 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold ${
                  step === s.num
                    ? 'bg-[#0F2942] text-white ring-2 ring-[#0F2942]/30'
                    : step > s.num
                    ? 'bg-[#2E5B37] text-white font-black'
                    : 'bg-slate-200 text-slate-500'
                }`}
              >
                {step > s.num ? '✓' : s.num}
              </div>
              <span className={`hidden sm:inline text-[11px] ${step === s.num ? 'text-[#0F2942] font-bold' : 'text-slate-500'}`}>
                {s.label}
              </span>
            </button>
          ))}
        </div>

        {/* Step Body */}
        <div className="p-6 sm:p-8 space-y-6 max-h-[70vh] overflow-y-auto">
          
          {/* STEP 1: Informações Pessoais & Documentos */}
          {step === 1 && (
            <div className="space-y-4">
              {step1Error && <ApiErrorNotice error={step1Error} />}
              <div className="p-3 rounded-xl bg-[#0F2942]/10 border border-[#0F2942]/20 text-[#0F2942] text-xs flex items-center space-x-2 font-medium">
                <Sparkles className="w-4 h-4 text-[#2E5B37] shrink-0" />
                <span>Passo 1 de 4: Informações Pessoais, Cadastro de Documento e Acesso.</span>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#0F2942] uppercase tracking-wider mb-1.5">
                  Nome Completo / Razão Social *
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                  <input
                    type="text"
                    value={formData.fullName}
                    onChange={(e) => handleChange('fullName', e.target.value)}
                    placeholder="Ex: Prof. João Victor Silva"
                    className="w-full bg-white border border-slate-300 rounded-xl pl-10 pr-4 py-3 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#0F2942]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-[#0F2942] uppercase tracking-wider mb-1.5">
                    E-mail Profissional *
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => handleChange('email', e.target.value)}
                      placeholder="joao@professor.com.br"
                      className="w-full bg-white border border-slate-300 rounded-xl pl-10 pr-4 py-3 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#0F2942]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#0F2942] uppercase tracking-wider mb-1.5">
                    WhatsApp / Telefone *
                  </label>
                  <div className="relative">
                    <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                    <input
                      type="text"
                      value={formData.phone}
                      onChange={(e) => handleChange('phone', formatPhone(e.target.value))}
                      placeholder="(11) 99999-8888"
                      maxLength={15}
                      className="w-full bg-white border border-slate-300 rounded-xl pl-10 pr-4 py-3 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#0F2942]"
                    />
                  </div>
                </div>
              </div>

              {/* Seletor CPF / CNPJ */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-[#0F2942] uppercase tracking-wider">
                    Documento do Professor (CPF ou CNPJ) *
                  </label>
                  <span className="text-[11px] font-semibold text-[#2E5B37] bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full">
                    {formData.docType === 'CPF' ? 'Pessoa Física' : 'Pessoa Jurídica'}
                  </span>
                </div>

                {/* Tab selector */}
                <div className="grid grid-cols-2 gap-2 bg-slate-200/70 p-1 rounded-xl">
                  <button
                    type="button"
                    onClick={() => handleDocumentTypeChange('CPF')}
                    className={`py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center space-x-1.5 cursor-pointer ${
                      formData.docType === 'CPF'
                        ? 'bg-white text-[#0F2942] shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <UserCheck className="w-3.5 h-3.5 text-[#2E5B37]" />
                    <span>CPF (Pessoa Física)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDocumentTypeChange('CNPJ')}
                    className={`py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center space-x-1.5 cursor-pointer ${
                      formData.docType === 'CNPJ'
                        ? 'bg-white text-[#0F2942] shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Building2 className="w-3.5 h-3.5 text-[#0F2942]" />
                    <span>CNPJ (Pessoa Jurídica)</span>
                  </button>
                </div>

                {/* Input do Documento */}
                <div className="relative">
                  <FileText className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                  <input
                    type="text"
                    value={formData.documentNumber}
                    onChange={handleDocumentNumberChange}
                    placeholder={
                      formData.docType === 'CPF'
                        ? '000.000.000-00'
                        : '00.000.000/0001-00'
                    }
                    className="w-full bg-white border border-slate-300 rounded-xl pl-10 pr-4 py-3 text-sm text-slate-800 font-mono placeholder-slate-400 focus:outline-none focus:border-[#0F2942]"
                  />
                </div>
              </div>

              {/* Password Creation, Confirmation & Verification */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Lock className="w-4 h-4 text-[#0F2942]" />
                    <span className="text-xs font-bold text-[#0F2942] uppercase tracking-wider">
                      Criação & Confirmação de Senha
                    </span>
                  </div>
                  {password !== '' && (
                    <span
                      className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${
                        isPasswordValid && passwordsMatch
                          ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                          : 'bg-amber-100 text-amber-800 border-amber-300'
                      }`}
                    >
                      {isPasswordValid && passwordsMatch ? '✓ Senha Verificada' : 'Em Verificação'}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Password Input */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Nova Senha *
                    </label>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={formData.password || ''}
                        onChange={(e) => handleChange('password', e.target.value)}
                        placeholder="••••••••••••"
                        className="w-full bg-white border border-slate-300 rounded-xl pl-10 pr-10 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#0F2942]"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-3 text-slate-400 hover:text-slate-600 focus:outline-none cursor-pointer"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Confirm Password Input */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Confirmar Senha *
                    </label>
                    <div className="relative">
                      <ShieldCheck className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                      <input
                        type={showConfirmPassword ? 'text' : 'password'}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="••••••••••••"
                        className={`w-full bg-white border rounded-xl pl-10 pr-10 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none ${
                          confirmPassword !== ''
                            ? passwordsMatch
                              ? 'border-emerald-500 focus:border-emerald-600'
                              : 'border-rose-400 focus:border-rose-500'
                            : 'border-slate-300 focus:border-[#0F2942]'
                        }`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-3 top-3 text-slate-400 hover:text-slate-600 focus:outline-none cursor-pointer"
                      >
                        {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Strength Meter */}
                {password !== '' && (
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center text-[11px] font-medium text-slate-600">
                      <span>Força da Senha:</span>
                      <span
                        className={`font-bold ${
                          passwordCriteriaMet <= 2
                            ? 'text-rose-600'
                            : passwordCriteriaMet <= 4
                            ? 'text-amber-600'
                            : 'text-emerald-600'
                        }`}
                      >
                        {passwordCriteriaMet <= 2
                          ? 'Fraca'
                          : passwordCriteriaMet <= 4
                          ? 'Média'
                          : 'Forte & Segura'}
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden flex">
                      <div
                        className={`h-full transition-all duration-300 ${
                          passwordCriteriaMet <= 2
                            ? 'bg-rose-500'
                            : passwordCriteriaMet <= 4
                            ? 'bg-amber-500'
                            : 'bg-emerald-500'
                        }`}
                        style={{ width: `${(passwordCriteriaMet / 5) * 100}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Password Requirements Checklist */}
                <div className="pt-2 border-t border-slate-200/80">
                  <p className="text-[11px] font-bold text-slate-600 mb-2">Requisitos de Verificação de Senha:</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[11px]">
                    <div className={`flex items-center space-x-1.5 ${hasMinLength ? 'text-emerald-700 font-medium' : 'text-slate-400'}`}>
                      <span className={`w-3.5 h-3.5 rounded-full flex items-center justify-center text-[9px] font-bold ${hasMinLength ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-400'}`}>
                        {hasMinLength ? '✓' : '•'}
                      </span>
                      <span>Mínimo de 8 caracteres</span>
                    </div>

                    <div className={`flex items-center space-x-1.5 ${hasUppercase && hasLowercase ? 'text-emerald-700 font-medium' : 'text-slate-400'}`}>
                      <span className={`w-3.5 h-3.5 rounded-full flex items-center justify-center text-[9px] font-bold ${hasUppercase && hasLowercase ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-400'}`}>
                        {hasUppercase && hasLowercase ? '✓' : '•'}
                      </span>
                      <span>Letra maiúscula e minúscula</span>
                    </div>

                    <div className={`flex items-center space-x-1.5 ${hasNumber && hasSpecialChar ? 'text-emerald-700 font-medium' : 'text-slate-400'}`}>
                      <span className={`w-3.5 h-3.5 rounded-full flex items-center justify-center text-[9px] font-bold ${hasNumber && hasSpecialChar ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-400'}`}>
                        {hasNumber && hasSpecialChar ? '✓' : '•'}
                      </span>
                      <span>Número (0-9) e caractere especial</span>
                    </div>

                    <div className={`flex items-center space-x-1.5 ${passwordsMatch ? 'text-emerald-700 font-medium' : confirmPassword !== '' ? 'text-rose-600 font-medium' : 'text-slate-400'}`}>
                      <span className={`w-3.5 h-3.5 rounded-full flex items-center justify-center text-[9px] font-bold ${passwordsMatch ? 'bg-emerald-100 text-emerald-700' : confirmPassword !== '' ? 'bg-rose-100 text-rose-600' : 'bg-slate-200 text-slate-400'}`}>
                        {passwordsMatch ? '✓' : confirmPassword !== '' ? '✕' : '•'}
                      </span>
                      <span>
                        {passwordsMatch
                          ? 'Senhas coincidem'
                          : confirmPassword !== ''
                          ? 'As senhas não coincidem'
                          : 'Confirmação de senha'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: Perfil Profissional & Foto */}
          {step === 2 && (
            <div className="space-y-5">
              {submitError && <ApiErrorNotice error={submitError} />}
              <div className="p-3 rounded-xl bg-[#2E5B37]/10 border border-[#2E5B37]/20 text-[#2E5B37] text-xs flex items-center space-x-2 font-medium">
                <BookOpen className="w-4 h-4 text-[#2E5B37] shrink-0" />
                <span>Passo 2 de 4: Foto de Perfil, URL Personalizada, Área de Atuação e Biografia.</span>
              </div>

              {/* Foto de Perfil & Username Unificados (Live Identity Preview) */}
              <div className="p-5 bg-gradient-to-br from-slate-50 to-emerald-50/20 border border-slate-200 rounded-2xl space-y-4">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-[#0F2942] uppercase tracking-wider">
                    Foto & Username do Professor (URL Personalizada) *
                  </label>
                  <span className="text-[11px] font-semibold text-[#2E5B37] bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full flex items-center">
                    <Globe className="w-3 h-3 mr-1 text-[#2E5B37]" /> Simulação Live
                  </span>
                </div>

                {/* Preview Card Integrado: Foto + Nome + @username + URL */}
                <div className="p-4 bg-white border border-slate-200/90 rounded-2xl shadow-sm flex flex-col sm:flex-row items-center sm:items-start space-y-3 sm:space-y-0 sm:space-x-4">
                  {/* Circular Avatar */}
                  <div className="relative group shrink-0">
                    <div className="w-20 h-20 rounded-full border-2 border-[#2E5B37] shadow-md overflow-hidden bg-slate-100 flex items-center justify-center relative ring-4 ring-[#2E5B37]/15">
                      {formData.avatarUrl ? (
                        <OptimizedImage
                          src={formData.avatarUrl}
                          alt="Foto de Perfil"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="flex flex-col items-center justify-center text-slate-400">
                          <User className="w-7 h-7 mb-0.5" />
                          <span className="text-[9px] font-medium">Sem Foto</span>
                        </div>
                      )}
                    </div>

                    <label className="absolute bottom-0 right-0 bg-[#0F2942] hover:bg-[#1E3A8A] text-white p-1.5 rounded-full shadow-md cursor-pointer transition-transform hover:scale-110">
                      <Camera className="w-3.5 h-3.5" />
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleAvatarUpload}
                        className="hidden"
                      />
                    </label>
                  </div>

                  {/* Informações da Identidade: Nome, @username e URL */}
                  <div className="flex-1 text-center sm:text-left space-y-1.5 min-w-0 w-full">
                    <div>
                      <h4 className="font-heading font-bold text-sm text-[#0F2942] truncate">
                        {formData.fullName || 'Prof. Seu Nome'}
                      </h4>
                      <p className="text-xs font-mono font-bold text-[#2E5B37]">
                        @{formData.username || 'username'}
                      </p>
                    </div>

                    {/* URL simulada em tempo real */}
                    <div className="pt-0.5">
                      <span className="inline-flex items-center space-x-1.5 text-[11px] font-mono text-slate-700 bg-slate-100 border border-slate-200 px-3 py-1.5 rounded-lg max-w-full truncate">
                        <Globe className="w-3.5 h-3.5 text-[#2E5B37] shrink-0" />
                        <span className="truncate">
                          https://meumonitor.ai/p/<strong className="text-[#0F2942]">{formData.username || 'seu-username'}</strong>
                        </span>
                      </span>
                    </div>

                    {/* Ações da Foto se Upload Realizado */}
                    {formData.avatarUrl && (
                      <div className="flex items-center space-x-3 text-[11px] pt-1">
                        <button
                          type="button"
                          onClick={() => {
                            setRawImageSrc(formData.avatarUrl || null);
                            setIsCropModalOpen(true);
                          }}
                          className="text-[#2E5B37] hover:underline font-semibold flex items-center cursor-pointer"
                        >
                          <Crop className="w-3 h-3 mr-1" /> Reajustar corte
                        </button>
                        <span className="text-slate-300">•</span>
                        <button
                          type="button"
                          onClick={() => setFormData((prev) => ({ ...prev, avatarUrl: '' }))}
                          className="text-rose-500 hover:underline font-semibold cursor-pointer"
                        >
                          Remover foto
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Input do Username */}
                <div className="space-y-1.5 pt-1">
                  <label className="block text-xs font-bold text-[#0F2942]">
                    Digite seu Username (Slug da URL):
                  </label>
                  <div className="flex items-center">
                    <span className="bg-white border border-r-0 border-slate-300 rounded-l-xl px-3 py-2.5 text-xs font-mono text-slate-500 select-none">
                      https://meumonitor.ai/p/
                    </span>
                    <input
                      type="text"
                      value={formData.username}
                      onChange={(e) => {
                        const val = e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, '');
                        handleChange('username', val);
                        handleChange('pageSlug', val);
                      }}
                      placeholder="joaovictor"
                      className="flex-1 bg-white border border-slate-300 rounded-r-xl px-3.5 py-2.5 text-sm text-slate-800 font-mono placeholder-slate-400 focus:outline-none focus:border-[#0F2942]"
                    />
                  </div>
                </div>
              </div>

              {/* Área de Atuação */}
              <div>
                <label className="block text-xs font-bold text-[#0F2942] uppercase tracking-wider mb-1.5">
                  Área de Atuação Principal *
                </label>
                <select
                  value={formData.area}
                  onChange={(e) => handleChange('area', e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-sm text-slate-800 focus:outline-none focus:border-[#0F2942]"
                >
                  {AREAS_LIST.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </div>

              {formData.area === 'Outro (Especificar)' && (
                <div>
                  <label className="block text-xs font-bold text-[#0F2942] uppercase tracking-wider mb-1.5">
                    Especifique a Área *
                  </label>
                  <input
                    type="text"
                    value={formData.customArea}
                    onChange={(e) => handleChange('customArea', e.target.value)}
                    placeholder="Ex: Medicina Veterinária / Revalida"
                    className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-sm text-slate-800 focus:outline-none focus:border-[#0F2942]"
                  />
                </div>
              )}

              {/* Biografia */}
              <div>
                <label className="block text-xs font-bold text-[#0F2942] uppercase tracking-wider mb-1.5">
                  Biografia Curta / Apresentação (Exibida na sua página pública de vendas) *
                </label>
                <textarea
                  rows={3}
                  value={formData.bio}
                  onChange={(e) => handleChange('bio', e.target.value)}
                  placeholder="Ex: Professor especialista em Gramática e Redação para concursos federais há mais de 12 anos. Autor de 3 apostilas preparatórias."
                  className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#0F2942]"
                />
              </div>

            </div>
          )}

          {/* STEP 3: Redes Sociais Opcionais */}
          {step === 3 && (
            <div className="space-y-5">
              {submitError && <ApiErrorNotice error={submitError} />}
              <div className="p-3 rounded-xl bg-purple-50 border border-purple-200 text-purple-900 text-xs flex items-center space-x-2 font-medium">
                <Sparkles className="w-4 h-4 text-purple-600 shrink-0" />
                <span>Passo 3 de 4: Conecte suas Redes Sociais (Opcional) para dar mais visibilidade ao seu perfil.</span>
              </div>

              <div className="p-5 bg-slate-50 border border-slate-200 rounded-2xl space-y-4">
                <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                  <div>
                    <h4 className="font-bold text-[#0F2942] text-sm">Links de Redes Sociais</h4>
                    <p className="text-xs text-slate-500">Seus alunos poderão encontrar seus canais oficiais através da sua página pública.</p>
                  </div>
                  <span className="text-[10px] font-bold bg-slate-200 text-slate-600 px-2.5 py-1 rounded-full uppercase">
                    Opcional
                  </span>
                </div>

                <div className="space-y-4">
                  {/* Instagram */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center">
                      <InstagramIcon className="w-4 h-4 mr-1.5 text-pink-600" /> Perfil no Instagram
                    </label>
                    <div className="relative">
                      <span className="absolute left-3.5 top-3 text-xs text-slate-400 font-mono">instagram.com/</span>
                      <input
                        type="text"
                        value={formData.instagram || ''}
                        onChange={(e) => handleChange('instagram', e.target.value.replace(/^@/, ''))}
                        placeholder="prof.joao"
                        className="w-full bg-white border border-slate-300 rounded-xl pl-32 pr-4 py-2.5 text-xs font-mono text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#0F2942]"
                      />
                    </div>
                  </div>

                  {/* TikTok */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center">
                      <TikTokIcon className="w-4 h-4 mr-1.5 text-slate-900" /> Perfil no TikTok
                    </label>
                    <div className="relative">
                      <span className="absolute left-3.5 top-3 text-xs text-slate-400 font-mono">tiktok.com/@</span>
                      <input
                        type="text"
                        value={formData.tiktok || ''}
                        onChange={(e) => handleChange('tiktok', e.target.value.replace(/^@/, ''))}
                        placeholder="prof.joao"
                        className="w-full bg-white border border-slate-300 rounded-xl pl-28 pr-4 py-2.5 text-xs font-mono text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#0F2942]"
                      />
                    </div>
                  </div>

                  {/* YouTube */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center">
                      <YoutubeIcon className="w-4 h-4 mr-1.5 text-red-600" /> Canal no YouTube
                    </label>
                    <div className="relative">
                      <span className="absolute left-3.5 top-3 text-xs text-slate-400 font-mono">youtube.com/@</span>
                      <input
                    className="w-full bg-white border border-slate-300 rounded-xl pl-32 pr-4 py-2.5 text-xs font-mono text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#0F2942]"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: Status & Redirecionamento para Área do Professor */}
          {step === 4 && (
            <div className="text-center py-6 space-y-6">
              <div className="w-20 h-20 rounded-full bg-[#2E5B37]/20 border-2 border-[#2E5B37] text-[#2E5B37] flex items-center justify-center mx-auto animate-bounce">
                <CheckCircle2 className="w-10 h-10 text-[#2E5B37]" />
              </div>

              <div>
                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200 mb-3">
                  Status: PENDING (Aguardando Aprovação de Perfil)
                </span>
                <h3 className="font-heading text-2xl font-bold text-[#0F2942] mb-2">
                  Cadastro Concluído com Sucesso, {formData.fullName || 'Professor'}!
                </h3>
                <p className="text-sm text-slate-600 max-w-md mx-auto">
                  Seus dados foram registrados com sucesso. Você já pode acessar o painel de desenvolvimento do professor.
                </p>
              </div>

              {/* Dev environment box */}
              <div className="p-4 bg-[#0F2942] text-white rounded-2xl border border-slate-700 text-xs text-center font-mono space-y-1.5 shadow-md max-w-md mx-auto">
                <span className="text-emerald-400 font-sans font-bold block text-xs">
                  🚀 Redirecionamento da Área do Professor:
                </span>
                <span className="text-slate-300 font-bold block truncate">
                  {`${process.env.NEXT_PUBLIC_APP_URL || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000')}/professor`}
                </span>
              </div>

              {/* Next Steps Checklist */}
              <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 text-left space-y-3 max-w-md mx-auto text-xs">
                <h4 className="font-heading font-bold text-[#0F2942] flex items-center">
                  <ShieldCheck className="w-4 h-4 text-[#2E5B37] mr-1.5" />
                  Resumo do Registro:
                </h4>
                <ul className="space-y-2 text-slate-600">
                  <li className="flex items-center text-[#2E5B37] font-semibold">
                    <span className="mr-2">✓</span> Documento <span className="font-mono ml-1 font-bold">({formData.docType}: {formData.documentNumber || 'Preenchido'})</span>
                  </li>
                  <li className="flex items-center text-[#2E5B37] font-semibold">
                    <span className="mr-2">✓</span> Perfil registrado como <code className="bg-slate-200 px-1.5 py-0.5 rounded text-slate-800 font-mono">@{formData.username || 'username'}</code>
                  </li>
                  <li className="flex items-center text-[#2E5B37] font-semibold">
                    <span className="mr-2">✓</span> Status inicial atribuído: <span className="text-amber-700 font-bold ml-1">PENDING</span>
                  </li>
                </ul>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => {
                    resetModal();
                    router.push('/professor');
                  }}
                  className="px-8 py-3.5 rounded-xl font-bold text-sm text-white bg-[#0F2942] hover:bg-[#1E3A8A] transition-all shadow-lg shadow-[#0F2942]/20 flex items-center justify-center space-x-2 mx-auto cursor-pointer"
                >
                  <span>Acessar Área do Professor</span>
                  <ArrowRight className="w-4 h-4 text-emerald-400" />
                </button>
              </div>
            </div>
          )}

        </div>

        {/* Footer Navigation Controls */}
        {step < 4 && (
          <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
            {step > 1 && !(step === 2 && maxUnlockedStep > 1) ? (
              <button
                type="button"
                onClick={handlePrev}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:text-[#0F2942] bg-slate-200 hover:bg-slate-300 transition-colors flex items-center space-x-1 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Voltar</span>
              </button>
            ) : (
              <div />
            )}

            {step < 3 && (
              <button
                type="button"
                onClick={handleNext}
                disabled={submittingStep1}
                className="px-6 py-2.5 rounded-xl text-xs font-bold text-white bg-[#0F2942] hover:bg-[#1E3A8A] transition-all flex items-center space-x-1 shadow-md shadow-[#0F2942]/20 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submittingStep1 ? (
                  <>
                    <Sparkles className="w-3.5 h-3.5 animate-spin mr-1" />
                    <span>Criando Conta...</span>
                  </>
                ) : (
                  <>
                    <span>Avançar</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            )}

            {step === 3 && (
              <button
                type="button"
                onClick={handleConfirmSubmit}
                disabled={submitting}
                className="px-7 py-3 rounded-xl text-xs font-bold bg-gradient-to-r from-[#0F2942] via-[#1E3A8A] to-[#2E5B37] text-white hover:from-[#172554] hover:to-[#1E4620] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2 shadow-lg shadow-[#0F2942]/20 cursor-pointer"
              >
                {submitting ? (
                  <>
                    <Sparkles className="w-4 h-4 animate-spin" />
                    <span>Concluindo Cadastro...</span>
                  </>
                ) : (
                  <>
                    <span>Concluir Cadastro & Finalizar</span>
                    <CheckCircle2 className="w-4 h-4" />
                  </>
                )}
              </button>
            )}
          </div>
        )}

        {/* Modal de Corte Interativo de Foto de Perfil */}
        <AvatarCropModal
          isOpen={isCropModalOpen}
          imageSrc={rawImageSrc}
          onClose={() => setIsCropModalOpen(false)}
          onError={() => {
            setIsCropModalOpen(false);
            setSubmitError(createApiError(
              'AVATAR_PROCESSING_FAILED',
              'Não foi possível processar a foto selecionada.',
              { avatarUrl: ['Escolha outra imagem ou tente novamente.'] },
            ));
          }}
          onConfirm={handleConfirmCroppedPhoto}
        />

      </div>
    </div>
  );
};
