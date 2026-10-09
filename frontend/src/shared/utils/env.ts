/**
 * Utilitários padronizados para resolução das URLs do Frontend e Backend.
 *
 * - NEXT_PUBLIC_API_URL: Aponta para a API do backend (Fastify / rotas /api/v1).
 * - NEXT_PUBLIC_APP_URL: Aponta para a aplicação web do frontend (Next.js).
 */

export const getApiUrl = (): string => {
  return process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8443';
};

export const getAppUrl = (): string => {
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL;
  }
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return 'http://localhost:3000';
};
