import { extractAccessToken } from '@/shared/auth/login-response';
import { notifyAuthStateChanged } from '@/shared/auth/client-session';
import { createClient } from '@/lib/supabase/client';

export interface LoginPayload {
  email: string;
  password: string;
}

export interface LoginResponse {
  success: boolean;
  message?: string;
  user?: {
    id: string;
    email: string;
    role?: string;
    fullName?: string;
  };
  data?: {
    userId?: string;
    email?: string;
    role?: string;
    accessToken?: string;
    user?: { email?: string; fullName?: string };
  };
}

const getBackendUrl = () => process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8443';

const getPasswordRecoveryRedirectUrl = () => {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
    || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000');

  return `${appUrl.replace(/\/$/, '')}/redefinir-senha`;
};

export function formatAuthErrorMessage(rawMessage?: unknown, statusCode?: number): string {
  if (statusCode === 401) {
    return 'E-mail ou senha incorretos. Verifique suas credenciais e tente novamente.';
  }

  if (!rawMessage || typeof rawMessage !== 'string') {
    if (statusCode === 403) return 'Acesso não autorizado. Verifique suas permissões ou confirme seu e-mail.';
    if (statusCode === 429) return 'Muitas tentativas de login. Aguarde alguns instantes e tente novamente.';
    if (statusCode && statusCode >= 500) return 'Serviço temporariamente indisponível. Tente novamente mais tarde.';
    return 'Falha ao autenticar. Verifique suas credenciais e tente novamente.';
  }

  const normalized = rawMessage.trim().toLowerCase();

  if (
    normalized === 'unauthorized' ||
    normalized === 'unauthenticated' ||
    normalized.includes('unauthorized') ||
    normalized.includes('unauthenticated') ||
    normalized === 'invalid_credentials' ||
    normalized.includes('invalid login credentials') ||
    normalized.includes('invalid credentials') ||
    normalized.includes('invalid_grant') ||
    normalized.includes('e-mail ou senha invalidos') ||
    normalized.includes('e-mail ou senha inválidos') ||
    normalized.includes('senha incorreta') ||
    normalized.includes('credenciais invalidas') ||
    normalized.includes('credenciais inválidas')
  ) {
    return 'E-mail ou senha incorretos. Verifique suas credenciais e tente novamente.';
  }

  if (
    normalized === 'forbidden' ||
    normalized.includes('forbidden') ||
    statusCode === 403
  ) {
    return 'Acesso não autorizado. Verifique suas permissões.';
  }

  if (
    normalized === 'email_not_confirmed' ||
    normalized.includes('email not confirmed') ||
    normalized.includes('confirme seu e-mail')
  ) {
    return 'Confirme seu e-mail antes de entrar na conta. Verifique sua caixa de entrada.';
  }

  if (
    normalized === 'user_not_found' ||
    normalized.includes('user not found') ||
    normalized.includes('usuário não encontrado')
  ) {
    return 'Usuário não encontrado. Verifique seu e-mail ou crie uma nova conta.';
  }

  if (
    normalized === 'too_many_requests' ||
    normalized.includes('rate limit') ||
    normalized.includes('over_request_rate_limit') ||
    normalized.includes('muitas tentativas') ||
    statusCode === 429
  ) {
    return 'Muitas tentativas de login. Por favor, aguarde alguns instantes e tente novamente.';
  }

  if (
    normalized.includes('failed to fetch') ||
    normalized.includes('networkerror') ||
    normalized.includes('econnrefused') ||
    normalized.includes('servidor indisponível') ||
    normalized.includes('servidor offline')
  ) {
    return 'Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.';
  }

  if (
    normalized === 'validation_error' ||
    normalized.includes('validation error') ||
    normalized.includes('dados basicos de cadastro invalidos')
  ) {
    return 'Por favor, preencha o e-mail e a senha corretamente.';
  }

  if (
    normalized === 'internal_server_error' ||
    normalized.includes('internal server error') ||
    (statusCode && statusCode >= 500)
  ) {
    return 'Não foi possível realizar o login no momento. Tente novamente em instantes.';
  }

  // Se for código técnico sem espaços (ex: SNAKE_CASE, camelCase ou palavra em inglês)
  if (/^[A-Za-z0-9_-]+$/.test(rawMessage.trim()) && !rawMessage.includes(' ')) {
    return 'Não foi possível autenticar. Verifique seus dados e tente novamente.';
  }

  return rawMessage;
}

export const AuthService = {
  /**
   * Requisição de Login de Usuário (Professor ou Aluno)
   */
  async login(payload: LoginPayload): Promise<LoginResponse> {
    const backendUrl = getBackendUrl();

    let response: Response;
    try {
      response = await fetch(`${backendUrl}/api/v1/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        credentials: 'include',
      });
    } catch (fetchError) {
      throw new Error(formatAuthErrorMessage((fetchError as Error)?.message || 'Failed to fetch'));
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const rawMessage =
        errorData?.error?.message ||
        errorData?.message ||
        (typeof errorData?.error === 'string' && errorData.error !== 'Unauthorized' ? errorData.error : null) ||
        errorData?.error?.code ||
        errorData?.code ||
        (typeof errorData?.error === 'string' ? errorData.error : null);
      throw new Error(formatAuthErrorMessage(rawMessage, response.status));
    }

    const data: LoginResponse = await response.json().catch(() => ({ success: true }));

    // Persiste dados do usuario no localStorage para fallback na UI e limpa cache de professor antigo
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem('mm_teacher_profile');
        const token = extractAccessToken(data);
        if (token) localStorage.setItem('mm_access_token', token);
        const role = data.data?.role || data.user?.role;
        if (role) localStorage.setItem('mm_user_role', role);
        const userInfo = {
          email: data.data?.email || data?.user?.email || payload.email,
          fullName: data.data?.user?.fullName || data?.user?.fullName || undefined,
        };
        localStorage.setItem('mm_user_info', JSON.stringify(userInfo));
        notifyAuthStateChanged();
      } catch (err) {
        console.warn('Erro ao atualizar localStorage no login:', err);
      }
    }

    return data;
  },

  async requestPasswordReset(email: string): Promise<void> {
    const normalizedEmail = email.trim();
    if (!normalizedEmail) {
      throw new Error('Informe seu e-mail para recuperar a senha.');
    }

    const { error } = await createClient().auth.resetPasswordForEmail(normalizedEmail, {
      redirectTo: getPasswordRecoveryRedirectUrl(),
    });

    if (error) throw error;
  },
};
