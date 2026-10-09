'use client';
/* eslint-disable react-hooks/set-state-in-effect -- Effect surfaces the expired-session query state. */

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import {
  X,
  Mail,
  Lock,
  Eye,
  EyeOff,
  LogIn,
  ArrowRight,
  AlertCircle,
  Sparkles,
  UserPlus,
} from 'lucide-react';
import { AuthService, formatAuthErrorMessage, type LoginResponse } from '../services/AuthService';

import { useAlert } from '@/shared';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSwitchToRegister?: () => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({
  isOpen,
  onClose,
  onSwitchToRegister,
}) => {
  const router = useRouter();
  const { showAlert } = useAlert();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [recoveringPassword, setRecoveringPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    if (isOpen && typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('session') === 'expired') {
        setError('Sua sessão expirou. Por favor, faça login novamente para continuar.');
      }
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Por favor, preencha o e-mail e a senha.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await AuthService.login({ email, password });
      onClose();
      // O backend retorna { data: { role } }; mantemos compatibilidade com
      // respostas antigas que usavam user.role ou role na raiz.
      const responseData = (res as LoginResponse & { data?: { role?: string } }).data;
      const role = responseData?.role || res.user?.role || (res as LoginResponse & { role?: string }).role;
      const redirect = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('redirect') : null;
      const safeRedirect = redirect?.startsWith('/') && !redirect.startsWith('//') ? redirect : null;
      if (safeRedirect) {
        router.push(safeRedirect);
      } else if (role === 'student' || role === 'aluno') {
        router.push('/areadoaluno');
      } else {
        router.push('/professor');
      }
    } catch (err: unknown) {
      const rawMessage = err instanceof Error ? err.message : 'Falha ao autenticar.';
      console.warn('Erro na requisição de login:', rawMessage);
      const friendlyMessage = formatAuthErrorMessage(rawMessage);
      setError(friendlyMessage);
    } finally {
      setSubmitting(false);
    }
  };

  const handlePasswordRecovery = async (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    const recoveryEmail = email.trim();

    if (!recoveryEmail) {
      setError('Informe seu e-mail antes de solicitar a recuperação da senha.');
      return;
    }

    setRecoveringPassword(true);
    setError(null);

    try {
      await AuthService.requestPasswordReset(recoveryEmail);
      showAlert({
        title: 'Recuperação de Senha',
        message: 'Se existir uma conta com este e-mail, enviaremos as instruções para redefinir sua senha.',
        type: 'success',
      });
    } catch (err: unknown) {
      const rawMessage = err instanceof Error ? err.message : 'Não foi possível solicitar a recuperação da senha.';
      setError(rawMessage);
    } finally {
      setRecoveringPassword(false);
    }
  };

  const resetForm = () => {
    setEmail('');
    setPassword('');
    setError(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md transition-all animate-fadeIn">
      {/* Modal Container */}
      <div className="relative w-full max-w-md bg-white border border-slate-200 rounded-3xl shadow-2xl overflow-hidden my-8">
        
        {/* Header */}
        <div className="px-6 py-5 bg-[#0F2942] border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Image src="/logoSemfundo.png" alt="MeuMonitor AI" width={40} height={40} className="w-10 h-10 object-contain" />
            <div>
              <h3 className="font-heading font-bold text-white text-lg flex items-center space-x-1.5">
                <span>MeuMonitor</span>
                <span className="text-[#2E5B37] font-extrabold">AI</span>
              </h3>
              <p className="text-xs text-slate-300">Acesse sua conta para continuar</p>
            </div>
          </div>
          <button
            aria-label="Fechar login"
            onClick={resetForm}
            className="p-2 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Form */}
        <form noValidate onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-5">
          
          {/* Welcome Badge */}
          <div className="p-3 rounded-xl bg-[#0F2942]/5 border border-[#0F2942]/10 text-[#0F2942] text-xs flex items-center space-x-2 font-medium">
            <Sparkles className="w-4 h-4 text-[#2E5B37] shrink-0" />
            <span>Bem-vindo de volta! Insira suas credenciais de acesso.</span>
          </div>

          {/* Error Message Alert */}
          {error && (
            <div
              role="alert"
              className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start space-x-2.5 animate-fadeIn"
            >
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span className="font-medium leading-relaxed">{error}</span>
            </div>
          )}

          {/* Email Input */}
          <div>
            <label htmlFor="login-email" className="block text-xs font-bold text-[#0F2942] uppercase tracking-wider mb-1.5">
              E-mail *
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
              <input
                type="email"
                id="login-email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu.email@exemplo.com"
                className="w-full bg-white border border-slate-300 rounded-xl pl-10 pr-4 py-3 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#0F2942]"
              />
            </div>
          </div>

          {/* Password Input */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="login-password" className="block text-xs font-bold text-[#0F2942] uppercase tracking-wider">
                Senha *
              </label>
              <a
                href="#esqueci-senha"
                onClick={handlePasswordRecovery}
                aria-disabled={recoveringPassword}
                className="text-xs font-semibold text-[#2E5B37] hover:underline cursor-pointer"
              >
                {recoveringPassword ? 'Enviando instruções...' : 'Esqueceu a senha?'}
              </a>
            </div>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
              <input
                type={showPassword ? 'text' : 'password'}
                id="login-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full bg-white border border-slate-300 rounded-xl pl-10 pr-10 py-3 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#0F2942]"
              />
              <button
                type="button"
                aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-3.5 text-slate-400 hover:text-slate-600 focus:outline-none cursor-pointer"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Remember Me Checkbox */}
          <div className="flex items-center space-x-2 pt-1">
            <input
              type="checkbox"
              id="rememberMe"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="w-4 h-4 text-[#0F2942] rounded border-slate-300 focus:ring-[#0F2942] cursor-pointer"
            />
            <label htmlFor="rememberMe" className="text-xs text-slate-600 font-medium select-none cursor-pointer">
              Manter-me conectado neste dispositivo
            </label>
          </div>

          {/* Submit Button */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3.5 rounded-xl font-bold text-sm text-white bg-[#0F2942] hover:bg-[#1E3A8A] transition-all shadow-lg shadow-[#0F2942]/20 flex items-center justify-center space-x-2 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <Sparkles className="w-4 h-4 animate-spin" />
                  <span>Entrando...</span>
                </>
              ) : (
                <>
                  <LogIn className="w-4 h-4 text-emerald-400" />
                  <span>Entrar na Plataforma</span>
                  <ArrowRight className="w-4 h-4 ml-1" />
                </>
              )}
            </button>
          </div>

          {/* Switch to Registration */}
          <div className="border-t border-slate-200 pt-4 text-center">
            <p className="text-xs text-slate-600">
              Ainda não possui uma conta?{' '}
              <button
                type="button"
                onClick={() => {
                  onClose();
                  if (onSwitchToRegister) {
                    onSwitchToRegister();
                  }
                }}
                className="font-bold text-[#0F2942] hover:text-[#2E5B37] hover:underline cursor-pointer inline-flex items-center space-x-1 ml-1"
              >
                <UserPlus className="w-3.5 h-3.5 text-[#2E5B37]" />
                <span>Cadastre-se como Professor</span>
              </button>
            </p>
          </div>

        </form>

      </div>
    </div>
  );
};
