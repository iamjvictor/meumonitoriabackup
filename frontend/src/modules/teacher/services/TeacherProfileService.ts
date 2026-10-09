import { TeacherSessionError } from './TeacherSessionError';

export interface TeacherProfile {
  id: string;
  userId: string;
  fullName: string;
  email: string;
  phone?: string | null;
  username: string;
  area: string;
  customArea?: string | null;
  bio?: string | null;
  pageSlug: string;
  avatarUrl?: string | null;
  bannerUrl?: string | null;
  instagram?: string | null;
  tiktok?: string | null;
  youtube?: string | null;
  role: string;
  status: 'pending' | 'active' | 'incomplete';
  hasPaymentConfigured?: boolean;
  createdAt?: string;
}

export interface UserInfo {
  id?: string;
  fullName?: string;
  email?: string;
}

export interface GetProfileResponse {
  hasProfile: boolean;
  teacher?: TeacherProfile | null;
  user?: UserInfo | null;
  message?: string;
}

const getBackendUrl = () => process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8443';

/**
 * Busca dados salvos localmente na etapa 1 do cadastro ou no login
 */
const getLocalUserInfo = (): UserInfo | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem('mm_user_info');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return {
      id: parsed.id,
      fullName: parsed.fullName || parsed.full_name || parsed.name,
      email: parsed.email,
    };
  } catch {
    return null;
  }
};

// Helper para capturar os headers de autenticacao com Bearer token do localStorage ou cookie
const getAuthHeaders = (): Record<string, string> => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (typeof window !== 'undefined') {
    const token =
      localStorage.getItem('mm_access_token') ||
      document.cookie
        .split('; ')
        .find((row) => row.startsWith('mm_access_token='))
        ?.split('=')[1];
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }
  return headers;
};

export const TeacherProfileService = {
  /**
   * Consome o endpoint GET /api/v1/teachers/me para buscar os dados do professor logado.
   * Caso nao haja registro na tabela teachers (HTTP 404 ou { hasProfile: false }),
   * resgata os dados de usuario retornados na resposta 404 ou do localStorage.
   */
  async getMyProfile(): Promise<GetProfileResponse> {
    const backendUrl = getBackendUrl();
    const localUser = getLocalUserInfo();

    try {
      const response = await fetch(`${backendUrl}/api/v1/teachers/me`, {
        method: 'GET',
        headers: getAuthHeaders(),
        credentials: 'include',
      });

      if (response.status === 404) {
        const payload = await response.json().catch(() => ({}));
        const serverUser = payload?.user;
        const resolvedUser: UserInfo | null = {
          id: serverUser?.id || localUser?.id,
          fullName: serverUser?.fullName || serverUser?.full_name || serverUser?.name || localUser?.fullName,
          email: serverUser?.email || localUser?.email,
        };

        return { hasProfile: false, teacher: null, user: resolvedUser };
      }

      if (response.status === 401 || response.status === 403) {
        throw new TeacherSessionError();
      }

      if (!response.ok) {
        console.warn(`GET /api/v1/teachers/me respondeu com status ${response.status}`);
        throw new TeacherSessionError();
      }

      const payload = await response.json();

      // Extrai informacoes do usuario caso retornadas pela API ou do localStorage
      const serverUser = payload.user || payload.data?.user;
      const userInfo: UserInfo | null = {
        id: serverUser?.id || localUser?.id,
        fullName: serverUser?.fullName || serverUser?.full_name || serverUser?.name || localUser?.fullName,
        email: serverUser?.email || localUser?.email,
      };

      if (payload.hasProfile === false || payload.data === null) {
        this.clearLocalStorageProfile();
        return { hasProfile: false, teacher: null, user: userInfo };
      }

      const teacherData = payload.data || (payload.id ? payload : null);

      if (!teacherData || !teacherData.id) {
        this.clearLocalStorageProfile();
        return { hasProfile: false, teacher: null, user: userInfo };
      }

      this.updateLocalStorage(teacherData);

      return {
        hasProfile: true,
        teacher: { ...teacherData },
        user: userInfo,
      };
    } catch (error) {
      if (error instanceof TeacherSessionError) {
        throw error;
      }

      console.warn('Falha na requisicao GET /api/v1/teachers/me:', error);
      throw new TeacherSessionError();
    }
  },

  /**
   * Salva ou atualiza os dados do perfil de onboarding do professor
   */
  async saveOnboardingProfile(payload: Partial<TeacherProfile>): Promise<TeacherProfile> {
    const backendUrl = getBackendUrl();

    const response = await fetch(`${backendUrl}/api/v1/auth/register/teacher`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(payload),
      credentials: 'include',
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || 'Falha ao salvar dados de onboarding do professor.');
    }

    const result = await response.json();
    return { ...(result.data || result) };
  },

  /**
   * Atualiza as informacoes e foto do perfil do professor
   */
  async updateProfile(payload: Partial<TeacherProfile>): Promise<TeacherProfile> {
    const backendUrl = getBackendUrl();

    try {
      const response = await fetch(`${backendUrl}/api/v1/teachers/me`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify(payload),
        credentials: 'include',
      });

      if (!response.ok) {
        // Tenta endpoint PATCH como alternativa se o backend esperar PATCH
        const patchResp = await fetch(`${backendUrl}/api/v1/teachers/me`, {
          method: 'PATCH',
          headers: getAuthHeaders(),
          body: JSON.stringify(payload),
          credentials: 'include',
        }).catch(() => null);

        if (patchResp && patchResp.ok) {
          const patchResult = await patchResp.json();
          const updated = patchResult.data || patchResult;
          this.updateLocalStorage(updated);
          return updated;
        }

        // Tenta o endpoint de registro como fallback
        const postResp = await fetch(`${backendUrl}/api/v1/auth/register/teacher`, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify(payload),
          credentials: 'include',
        }).catch(() => null);

        if (postResp && postResp.ok) {
          const postResult = await postResp.json();
          const updated = postResult.data || postResult;
          this.updateLocalStorage(updated);
          return updated;
        }

        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Não foi possível salvar as alterações no perfil.');
      }

      const result = await response.json();
      const updated = result.data || result;
      this.updateLocalStorage(updated);
      return updated;
    } catch (err: unknown) {
      // Se for uma falha explicita enviada pelo backend (com mensagem de erro), propaga o erro para a UI
      if (err instanceof Error && err.message && !err.message.includes('Failed to fetch') && !err.message.includes('NetworkError')) {
        throw err;
      }

      // Fallback local se o servidor estiver inacessivel (offline)
      console.warn('Salvando alteracoes no localStorage (modo desenvolvimento/offline):', err);
      const localProfile = this.getLocalStorageProfile();
      const updated: TeacherProfile = {
        id: localProfile?.id || 'temp-id',
        userId: localProfile?.userId || 'temp-user-id',
        fullName: payload.fullName || localProfile?.fullName || 'Professor',
        email: payload.email || localProfile?.email || '',
        phone: payload.phone ?? localProfile?.phone,
        username: payload.username || localProfile?.username || 'professor',
        area: payload.area || localProfile?.area || 'Outros',
        customArea: payload.customArea ?? localProfile?.customArea,
        bio: payload.bio ?? localProfile?.bio,
        pageSlug: payload.username || payload.pageSlug || localProfile?.pageSlug || 'professor',
        avatarUrl: payload.avatarUrl ?? localProfile?.avatarUrl,
        bannerUrl: payload.bannerUrl ?? localProfile?.bannerUrl,
        instagram: payload.instagram ?? localProfile?.instagram,
        tiktok: payload.tiktok ?? localProfile?.tiktok,
        youtube: payload.youtube ?? localProfile?.youtube,
        role: localProfile?.role || 'TEACHER',
        status: localProfile?.status || 'pending',
      };
      this.updateLocalStorage(updated);
      return updated;
    }
  },

  updateLocalStorage(profile: Partial<TeacherProfile>) {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem('mm_teacher_profile', JSON.stringify(profile));
      const userInfo = getLocalUserInfo() || {};
      if (profile.fullName) userInfo.fullName = profile.fullName;
      if (profile.email) userInfo.email = profile.email;
      localStorage.setItem('mm_user_info', JSON.stringify(userInfo));
    } catch (e) {
      console.error('Erro ao atualizar localStorage', e);
    }
  },

  getLocalStorageProfile(): TeacherProfile | null {
    if (typeof window === 'undefined') return null;
    try {
      const raw = localStorage.getItem('mm_teacher_profile');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },

  clearLocalStorageProfile() {
    if (typeof window === 'undefined') return;
    try {
      localStorage.removeItem('mm_teacher_profile');
    } catch (e) {
      console.error('Erro ao limpar mm_teacher_profile no localStorage', e);
    }
  }
};
