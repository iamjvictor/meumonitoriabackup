import { apiErrorFromResponse } from '@/shared/errors/api-error';

export interface TeacherSignupStep1Payload {
  fullName: string;
  email: string;
  password: string;
  phone?: string;
  docType: 'CPF' | 'CNPJ';
  documentNumber?: string;
  role?: string;
}

export interface TeacherProfileStep2Payload {
  email?: string;
  username: string;
  area: string;
  customArea?: string;
  bio?: string;
  pageSlug: string;
  avatarUrl?: string;
  instagram?: string;
  tiktok?: string;
  youtube?: string;
  agreedTerms: boolean;
}

const getBackendUrl = () => process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8443';

export const TeacherRegistrationService = {
  async uploadProfileImage(avatarDataUrl: string): Promise<string | undefined> {
    if (!avatarDataUrl.startsWith('data:')) return avatarDataUrl || undefined;

    const backendUrl = getBackendUrl();
    const imageResponse = await fetch(avatarDataUrl);
    const imageBlob = await imageResponse.blob();
    const formData = new FormData();
    formData.append('file', imageBlob, 'profile-image');

    const response = await fetch(`${backendUrl}/api/v1/teachers/me/avatar`, {
      method: 'POST',
      body: formData,
      credentials: 'include',
    });

    if (!response.ok) {
      throw await apiErrorFromResponse(response, 'Não foi possível salvar a imagem de perfil.');
    }

    const result = await response.json().catch(() => null);
    if (!result?.data?.avatarUrl) {
      throw new Error('O servidor não confirmou o salvamento da foto. Tente enviar outra imagem.');
    }
    return result.data?.avatarUrl;
  },

  /**
   * Requisição 1: Cadastro inicial de conta/lead (E-mail, senha, dados pessoais e documento)
   */
  async registerAccountStep1(payload: TeacherSignupStep1Payload): Promise<{ success: boolean; message?: string }> {
    const backendUrl = getBackendUrl();

    const response = await fetch(`${backendUrl}/api/v1/auth/signup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ role: 'teacher', ...payload }),
      credentials: 'include',
    });

    if (!response.ok) {
      throw await apiErrorFromResponse(response, 'Não foi possível criar sua conta.');
    }

    const data = await response.json().catch(() => ({ success: true }));

    // Guarda os dados de onboarding somente depois que a API confirmar a conta.
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(
          'mm_user_info',
          JSON.stringify({ fullName: payload.fullName, email: payload.email }),
        );
      } catch (err) {
        console.warn('Nao foi possivel salvar mm_user_info no localStorage:', err);
      }
    }

    // Se o backend retornou dados do usuario criado, atualiza no localStorage
    if (data?.user?.fullName || data?.data?.user?.fullName) {
      const u = data.user || data.data.user;
      if (typeof window !== 'undefined') {
        localStorage.setItem(
          'mm_user_info',
          JSON.stringify({
            fullName: u.fullName || payload.fullName,
            email: u.email || payload.email,
          })
        );
      }
    }

    return data;
  },

  /**
   * Requisição 2: Onboarding de Perfil Estendido (Foto, área de atuação, bio, redes sociais)
   */
  async updateProfileStep2(payload: TeacherProfileStep2Payload): Promise<{ success: boolean; message?: string }> {
    const backendUrl = getBackendUrl();

    const response = await fetch(`${backendUrl}/api/v1/auth/register/teacher`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      credentials: 'include',
    });

    if (!response.ok) {
      throw await apiErrorFromResponse(response, 'Não foi possível atualizar o perfil do professor.');
    }

    return response.json().catch(() => ({ success: true }));
  },
};
