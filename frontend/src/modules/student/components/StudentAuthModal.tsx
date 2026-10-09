'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import {
  X,
  User,
  Lock,
  Mail,
  Phone,
  ArrowRight,
  ArrowLeft,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ShoppingBag,
  Check,
} from 'lucide-react';
import { formatAuthErrorMessage } from '@/modules/marketing/services/AuthService';
import { extractAccessToken } from '@/shared/auth/login-response';
import { notifyAuthStateChanged } from '@/shared/auth/client-session';

interface CartItemSummary {
  id: string;
  name: string;
  price: string;
}

interface StudentAuthResponse {
  message?: string;
  error?: string;
  token?: string;
  data?: {
    accessToken?: string;
    session?: { accessToken?: string };
    user?: { email?: string; fullName?: string; name?: string };
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

interface StudentAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (userData: StudentAuthResponse) => void;
  checkoutMode?: boolean;
  cartItems?: CartItemSummary[];
  teacherName?: string;
}

const COUNTRY_CODES = [
  { code: '+55', name: 'Brasil' },
  { code: '+351', name: 'Portugal' },
  { code: '+1', name: 'EUA / Canadá' },
  { code: '+34', name: 'Espanha' },
  { code: '+244', name: 'Angola' },
  { code: '+258', name: 'Moçambique' },
];

const getBackendUrl = () => process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8443';

export const StudentAuthModal: React.FC<StudentAuthModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  checkoutMode = false,
  cartItems = [],
  teacherName: _teacherName = '',
}) => {
  const [activeTab, setActiveTab] = useState<'login' | 'signup'>(checkoutMode ? 'signup' : 'login');
  
  // Signup Wizard Step (1: Lead Capture [Name, Email, WhatsApp], 2: Password & Terms)
  const [signupStep, setSignupStep] = useState<1 | 2>(1);

  // Login form state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  
  // Signup form state
  const [signupName, setSignupName] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupConfirmPassword, setSignupConfirmPassword] = useState('');
  const [countryCode, setCountryCode] = useState('+55');
  const [signupPhone, setSignupPhone] = useState('');
  const [agreedTerms, setAgreedTerms] = useState(true);

  // Status & loading
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  // Mask Brazilian Phone Number
  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawVal = e.target.value;
    if (countryCode === '+55') {
      const digits = rawVal.replace(/\D/g, '').slice(0, 11);
      let masked = digits;
      if (digits.length > 2 && digits.length <= 6) {
        masked = `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
      } else if (digits.length > 6 && digits.length <= 10) {
        masked = `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
      } else if (digits.length > 10) {
        masked = `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
      }
      setSignupPhone(masked);
    } else {
      setSignupPhone(rawVal);
    }
  };

  // Password validation rules
  const hasMinLength = signupPassword.length >= 6;
  const hasUpper = /[A-Z]/.test(signupPassword);
  const hasNumber = /[0-9]/.test(signupPassword);
  const passwordsMatch = signupPassword.length > 0 && signupPassword === signupConfirmPassword;

  const isPasswordValid = hasMinLength && hasUpper && hasNumber && passwordsMatch;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginEmail.trim() || !loginPassword.trim()) {
      setError('Por favor, preencha o e-mail e a senha.');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const backendUrl = getBackendUrl();
      const response = await fetch(`${backendUrl}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: loginEmail.trim(),
          password: loginPassword,
        }),
        credentials: 'include',
      });

      let data: StudentAuthResponse = {};
      try {
        data = await response.json();
      } catch {
        if (!response.ok) {
          throw new Error(`Servidor indisponível (${response.status}). Tente novamente em instantes.`);
        }
      }

      if (!response.ok) {
        const rawMessage =
          data?.error && typeof data.error === 'object'
            ? (data.error as { message?: string; code?: string }).message || (data.error as { code?: string }).code
            : (typeof data?.error === 'string' ? data.error : null) || data?.message;
        throw new Error(formatAuthErrorMessage(rawMessage, response.status));
      }

      const token = extractAccessToken(data);
      if (token) {
        localStorage.setItem('mm_access_token', token);
      }
      localStorage.setItem('mm_user_role', 'student');
      const userInfo = {
        email: data.data?.user?.email || loginEmail.trim(),
        fullName: data.data?.user?.fullName || data.data?.user?.name || loginEmail.split('@')[0],
      };
      localStorage.setItem('mm_user_info', JSON.stringify(userInfo));
      notifyAuthStateChanged();

      setSuccessMessage('Login efetuado com sucesso!');
      if (onSuccess) onSuccess(data.data || data);

      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (err: unknown) {
      const rawMessage = err instanceof Error ? err.message : 'Erro ao realizar login.';
      setError(formatAuthErrorMessage(rawMessage));
    } finally {
      setLoading(false);
    }
  };

  const handleNextLeadStep = (e: React.FormEvent) => {
    e.preventDefault();
    if (!signupName.trim()) {
      setError('Por favor, informe seu nome completo.');
      return;
    }
    if (!signupEmail.trim() || !signupEmail.includes('@')) {
      setError('Por favor, informe um e-mail válido.');
      return;
    }
    setError(null);
    setSignupStep(2);
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signupName.trim() || !signupEmail.trim() || !signupPassword.trim()) {
      setError('Por favor, preencha todos os campos obrigatórios.');
      return;
    }

    if (!hasMinLength) {
      setError('A senha deve conter no mínimo 6 caracteres.');
      return;
    }

    if (!hasUpper) {
      setError('A senha deve conter pelo menos 1 letra maiúscula.');
      return;
    }

    if (!hasNumber) {
      setError('A senha deve conter pelo menos 1 número.');
      return;
    }

    if (!passwordsMatch) {
      setError('As senhas não coincidem. Verifique e tente novamente.');
      return;
    }

    if (!agreedTerms) {
      setError('É necessário concordar com os Termos de Uso.');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    const fullPhone = signupPhone.trim() ? `${countryCode} ${signupPhone.trim()}` : undefined;

    try {
      const backendUrl = getBackendUrl();
      const response = await fetch(`${backendUrl}/api/v1/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: 'student',
          name: signupName.trim(),
          email: signupEmail.trim(),
          password: signupPassword,
          whatsapp: fullPhone,
        }),
        credentials: 'include',
      });

      let data: StudentAuthResponse = {};
      try {
        data = await response.json();
      } catch {
        if (!response.ok) {
          throw new Error(`Erro ao conectar ao servidor (${response.status}). Tente novamente.`);
        }
      }

      if (!response.ok) {
        throw new Error(data.message || data.error || 'Não foi possível criar a conta. Verifique os dados fornecidos.');
      }

      const token = extractAccessToken(data);
      if (token) {
        localStorage.setItem('mm_access_token', token);
      }
      localStorage.setItem('mm_user_role', 'student');
      const newUserInfo = {
        email: signupEmail.trim(),
        fullName: signupName.trim(),
      };
      localStorage.setItem('mm_user_info', JSON.stringify(newUserInfo));
      notifyAuthStateChanged();

      setSuccessMessage('Conta de Aluno criada com sucesso!');
      if (onSuccess) onSuccess(data.data || data);

      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao criar conta de aluno.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md animate-fadeIn">
      <div 
        className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col my-auto transition-all"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header decoration bar */}
        <div className="h-2 bg-gradient-to-r from-[#0F2942] via-[#1E3A8A] to-[#0F2942]" />

        {/* Modal Top Bar */}
        <div className="px-6 py-5 bg-[#F8FAFC] border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <Image src="/logoSemfundo.png" alt="MeuMonitor AI" width={36} height={36} className="w-9 h-9 object-contain" />
            <div>
              <h3 className="text-base font-extrabold text-[#0F2942] leading-tight">
                Área do Aluno
              </h3>
              <p className="text-xs font-semibold text-slate-500">
                {checkoutMode ? 'Finalize a compra e acesse seus monitores' : 'Acesse seu painel de estudos e assistentes'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Cart Summary Banner (When opening from Finalizar Compra) */}
        {checkoutMode && cartItems.length > 0 && (
          <div className="mx-6 mt-5 p-4 rounded-2xl bg-slate-100 border border-slate-200 text-[#0F2942] flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 rounded-xl bg-[#0F2942] flex items-center justify-center text-white shrink-0 shadow-xs">
                <ShoppingBag className="w-4 h-4 text-white" />
              </div>
              <div>
                <p className="text-xs font-extrabold text-[#0F2942]">
                  {cartItems.length} {cartItems.length === 1 ? 'Monitor Selecionado' : 'Monitores Selecionados'}
                </p>
                <p className="text-[11px] text-slate-600 font-medium truncate max-w-[220px]">
                  {cartItems.map((i) => i.name).join(', ')}
                </p>
              </div>
            </div>
            <span className="text-xs font-black text-[#0F2942] bg-white px-2.5 py-1 rounded-lg border border-[#0F2942]/20 shadow-2xs">
              {cartItems.reduce((acc, curr) => {
                const valStr = curr.price.replace(/[^\d,]/g, '').replace(',', '.');
                return acc + (parseFloat(valStr) || 0);
              }, 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </span>
          </div>
        )}

        {/* Tabs: Entrar vs Criar Conta */}
        <div className="px-6 pt-5">
          <div className="p-1 bg-slate-100 rounded-2xl flex items-center">
            <button
              type="button"
              onClick={() => {
                setActiveTab('login');
                setError(null);
              }}
              className={`flex-1 py-2.5 text-xs font-extrabold rounded-xl transition-all ${
                activeTab === 'login'
                  ? 'bg-white text-[#0F2942] shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Já sou Aluno (Entrar)
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('signup');
                setError(null);
                setSignupStep(1);
              }}
              className={`flex-1 py-2.5 text-xs font-extrabold rounded-xl transition-all ${
                activeTab === 'signup'
                  ? 'bg-white text-[#0F2942] shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Criar Conta de Aluno
            </button>
          </div>
        </div>

        {/* Alerts: Error & Success */}
        <div className="px-6 pt-3 space-y-2">
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start space-x-2 animate-fadeIn">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span className="font-semibold">{error}</span>
            </div>
          )}

          {successMessage && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center space-x-2 animate-fadeIn">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span className="font-semibold">{successMessage}</span>
            </div>
          )}
        </div>

        {/* Form Content */}
        <div className="p-6 pt-3">
          {activeTab === 'login' ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-[#0F2942] mb-1.5">
                  E-mail do Aluno *
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                  <input
                    type="email"
                    required
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    placeholder="aluno@email.com"
                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-300 text-sm text-slate-800 bg-slate-50/50 focus:bg-white focus:border-[#0F2942] focus:ring-2 focus:ring-[#0F2942]/10 transition-all font-medium"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#0F2942] mb-1.5">
                  Sua Senha *
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                  <input
                    type="password"
                    required
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-300 text-sm text-slate-800 bg-slate-50/50 focus:bg-white focus:border-[#0F2942] focus:ring-2 focus:ring-[#0F2942]/10 transition-all font-medium"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full mt-2 py-3.5 px-4 rounded-xl bg-[#0F2942] hover:bg-[#1E3A8A] text-white font-extrabold text-xs transition duration-150 shadow-md flex items-center justify-center space-x-2 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-white" />
                    <span>Entrando...</span>
                  </>
                ) : (
                  <>
                    <span>Entrar na Área do Aluno</span>
                    <ArrowRight className="w-4 h-4 text-white" />
                  </>
                )}
              </button>
            </form>
          ) : (
            /* Signup Multi-step Flow */
            signupStep === 1 ? (
              /* ETAPA 1: Captura do Lead (Nome, E-mail, WhatsApp com País e Máscara) */
              <form onSubmit={handleNextLeadStep} className="space-y-4 animate-fadeIn">
                <div>
                  <label className="block text-xs font-bold text-[#0F2942] mb-1.5">
                    Seu Nome Completo *
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                    <input
                      type="text"
                      required
                      value={signupName}
                      onChange={(e) => setSignupName(e.target.value)}
                      placeholder="Maria Silva"
                      className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-300 text-sm text-slate-800 bg-slate-50/50 focus:bg-white focus:border-[#0F2942] focus:ring-2 focus:ring-[#0F2942]/10 transition-all font-medium"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#0F2942] mb-1.5">
                    Seu E-mail *
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                    <input
                      type="email"
                      required
                      value={signupEmail}
                      onChange={(e) => setSignupEmail(e.target.value)}
                      placeholder="maria@email.com"
                      className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-300 text-sm text-slate-800 bg-slate-50/50 focus:bg-white focus:border-[#0F2942] focus:ring-2 focus:ring-[#0F2942]/10 transition-all font-medium"
                    />
                  </div>
                </div>

                {/* WhatsApp com Seletor de País + Máscara */}
                <div>
                  <label className="block text-xs font-bold text-[#0F2942] mb-1.5">
                    WhatsApp / Telefone (Opcional)
                  </label>
                  <div className="flex space-x-2">
                    {/* Seletor de Código do País */}
                    <div className="relative w-32 shrink-0">
                      <select
                        value={countryCode}
                        onChange={(e) => {
                          setCountryCode(e.target.value);
                          setSignupPhone('');
                        }}
                        className="w-full py-3 px-2.5 rounded-xl border border-slate-300 bg-slate-50/70 text-xs font-bold text-slate-800 focus:bg-white focus:border-[#0F2942] focus:ring-2 focus:ring-[#0F2942]/10 transition-all appearance-none cursor-pointer"
                      >
                        {COUNTRY_CODES.map((c) => (
                          <option key={c.code} value={c.code}>
                            {c.code} ({c.name})
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Campo com Máscara */}
                    <div className="relative flex-1">
                      <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                      <input
                        type="tel"
                        value={signupPhone}
                        onChange={handlePhoneChange}
                        placeholder={countryCode === '+55' ? '(11) 99999-9999' : 'Número de telefone'}
                        className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-300 text-sm text-slate-800 bg-slate-50/50 focus:bg-white focus:border-[#0F2942] focus:ring-2 focus:ring-[#0F2942]/10 transition-all font-medium"
                      />
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full mt-2 py-3.5 px-4 rounded-xl bg-[#0F2942] hover:bg-[#1E3A8A] text-white font-extrabold text-xs transition duration-150 shadow-md flex items-center justify-center space-x-2 cursor-pointer"
                >
                  <span>Continuar para Criar Senha</span>
                  <ArrowRight className="w-4 h-4 text-white" />
                </button>
              </form>
            ) : (
              /* ETAPA 2: Senha com Confirmação e Regras */
              <form onSubmit={handleSignup} className="space-y-3.5 animate-fadeIn">
                {/* Resumo do Lead capturado */}
                <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-2xl flex items-center justify-between text-xs">
                  <div className="flex items-center space-x-2.5">
                    <div className="w-7 h-7 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold shrink-0">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    </div>
                    <div>
                      <p className="font-extrabold text-slate-800">{signupName}</p>
                      <p className="text-[11px] text-slate-600 font-medium">
                        {signupEmail} {signupPhone ? `• ${countryCode} ${signupPhone}` : ''}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSignupStep(1)}
                    className="text-[11px] font-bold text-[#0F2942] hover:underline cursor-pointer bg-white px-2.5 py-1 rounded-lg border border-slate-200 shadow-2xs"
                  >
                    Alterar
                  </button>
                </div>

                {/* Campo 1: Crie uma Senha */}
                <div>
                  <label className="block text-xs font-bold text-[#0F2942] mb-1">
                    Crie uma Senha *
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                    <input
                      type="password"
                      required
                      value={signupPassword}
                      onChange={(e) => setSignupPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 text-sm text-slate-800 bg-slate-50/50 focus:bg-white focus:border-[#0F2942] focus:ring-2 focus:ring-[#0F2942]/10 transition-all font-medium"
                    />
                  </div>
                </div>

                {/* Campo 2: Confirme a Senha */}
                <div>
                  <label className="block text-xs font-bold text-[#0F2942] mb-1">
                    Confirme sua Senha *
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                    <input
                      type="password"
                      required
                      value={signupConfirmPassword}
                      onChange={(e) => setSignupConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      className={`w-full pl-10 pr-4 py-2.5 rounded-xl border text-sm text-slate-800 bg-slate-50/50 focus:bg-white focus:ring-2 transition-all font-medium ${
                        signupConfirmPassword.length > 0
                          ? passwordsMatch
                            ? 'border-emerald-500 focus:border-emerald-600 focus:ring-emerald-500/10'
                            : 'border-rose-400 focus:border-rose-500 focus:ring-rose-500/10'
                          : 'border-slate-300 focus:border-[#0F2942] focus:ring-[#0F2942]/10'
                      }`}
                    />
                  </div>
                </div>

                {/* Checklist de Validação da Senha */}
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/70 space-y-1.5 text-[11px]">
                  <p className="font-bold text-[#0F2942] mb-1">Regras para a senha:</p>
                  
                  <div className="grid grid-cols-2 gap-1.5">
                    <div className={`flex items-center space-x-1.5 font-medium ${hasMinLength ? 'text-emerald-700 font-semibold' : 'text-slate-500'}`}>
                      <div className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${hasMinLength ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-400'}`}>
                        <Check className="w-2.5 h-2.5" />
                      </div>
                      <span>Mín. 6 caracteres</span>
                    </div>

                    <div className={`flex items-center space-x-1.5 font-medium ${hasUpper ? 'text-emerald-700 font-semibold' : 'text-slate-500'}`}>
                      <div className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${hasUpper ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-400'}`}>
                        <Check className="w-2.5 h-2.5" />
                      </div>
                      <span>1 Letra maiúscula</span>
                    </div>

                    <div className={`flex items-center space-x-1.5 font-medium ${hasNumber ? 'text-emerald-700 font-semibold' : 'text-slate-500'}`}>
                      <div className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${hasNumber ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-400'}`}>
                        <Check className="w-2.5 h-2.5" />
                      </div>
                      <span>1 Número (0-9)</span>
                    </div>

                    <div className={`flex items-center space-x-1.5 font-medium ${passwordsMatch ? 'text-emerald-700 font-semibold' : 'text-slate-500'}`}>
                      <div className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${passwordsMatch ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-400'}`}>
                        <Check className="w-2.5 h-2.5" />
                      </div>
                      <span>Senhas coincidem</span>
                    </div>
                  </div>
                </div>

                {/* Termos de Uso */}
                <div>
                  <label className="flex items-start space-x-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={agreedTerms}
                      onChange={(e) => setAgreedTerms(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 text-[#0F2942] focus:ring-[#0F2942] mt-0.5 cursor-pointer"
                    />
                    <span className="text-[11px] text-slate-600 font-medium leading-tight">
                      Concordo com os Termos de Uso e Política de Privacidade da plataforma.
                    </span>
                  </label>
                </div>

                <div className="flex items-center space-x-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setSignupStep(1)}
                    className="py-3 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition duration-150 flex items-center justify-center space-x-1 cursor-pointer"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span>Voltar</span>
                  </button>

                  <button
                    type="submit"
                    disabled={loading || !isPasswordValid}
                    className="flex-1 py-3.5 px-4 rounded-xl bg-[#0F2942] hover:bg-[#1E3A8A] text-white font-extrabold text-xs transition duration-150 shadow-md flex items-center justify-center space-x-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin text-white" />
                        <span>Criando Conta...</span>
                      </>
                    ) : (
                      <>
                        <span>{checkoutMode ? 'Concluir e Ir para Pagamento' : 'Concluir Cadastro de Aluno'}</span>
                        <ArrowRight className="w-4 h-4 text-white" />
                      </>
                    )}
                  </button>
                </div>
              </form>
            )
          )}
        </div>
      </div>
    </div>
  );
};
