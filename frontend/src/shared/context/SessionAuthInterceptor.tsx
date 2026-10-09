'use client';

import { useEffect } from 'react';

export const AUTH_REQUIRED_EVENT = 'meumonitor:auth-required';

export function withStoredAccessToken(init: RequestInit | undefined, token: string | null): RequestInit | undefined {
  if (!token) return init;

  const headers = new Headers(init?.headers);
  if (!headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  return { ...init, headers };
}

function getRequestUrl(input: RequestInfo | URL) {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function isProtectedApiRequest(input: RequestInfo | URL) {
  let url: URL;
  try {
    url = new URL(getRequestUrl(input), window.location.origin);
  } catch {
    return false;
  }

  if (!url.pathname.startsWith('/api/v1/')) return false;
  if (url.pathname === '/api/v1/session') return false;
  if (url.pathname.startsWith('/api/v1/auth/')) return false;
  return true;
}

function withNgrokBrowserWarningBypass(init: RequestInit | undefined, url: URL): RequestInit | undefined {
  if (!/(?:\.ngrok-free\.app|\.ngrok\.io)$/i.test(url.hostname)) return init;

  const headers = new Headers(init?.headers);
  headers.set('ngrok-skip-browser-warning', 'true');
  return { ...init, headers };
}

export function inferAuthProfile(pathname: string, requestUrl: string) {
  if (
    pathname.startsWith('/areadoaluno') ||
    pathname.startsWith('/checkout') ||
    pathname.startsWith('/p/') ||
    requestUrl.includes('/student') ||
    requestUrl.includes('/study') ||
    requestUrl.includes('/catalog') ||
    requestUrl.includes('/payments/')
  ) {
    return 'aluno';
  }

  return 'professor';
}

export function SessionAuthInterceptor() {
  useEffect(() => {
    const originalFetch = window.fetch.bind(window);
    let isRedirecting = false;

    window.fetch = async (input, init) => {
      const requestUrl = getRequestUrl(input);
      let requestInit = init;
      try {
        const parsedUrl = new URL(requestUrl, window.location.origin);
        if (parsedUrl.pathname.startsWith('/api/v1/')) {
          requestInit = withStoredAccessToken(init, window.localStorage.getItem('mm_access_token'));
          requestInit = withNgrokBrowserWarningBypass(requestInit, parsedUrl);
        }
      } catch {
        // Preserve the original request when the input is not a valid URL.
      }

      const response = await originalFetch(input, requestInit);
      if (response.status === 401 && isProtectedApiRequest(input)) {
        window.dispatchEvent(
          new CustomEvent(AUTH_REQUIRED_EVENT, {
            detail: { url: getRequestUrl(input) },
          })
        );

        if (!isRedirecting && typeof window !== 'undefined') {
          const pathname = window.location.pathname;
          const searchParams = new URLSearchParams(window.location.search);

          // Se já está na home com a flag de sessão expirada, não faz loop
          if (pathname === '/' && searchParams.get('session') === 'expired') {
            return response;
          }

          const requestUrlStr = getRequestUrl(input);
          const perfil = inferAuthProfile(pathname, requestUrlStr);

          isRedirecting = true;
          window.location.replace(`/?login=true&perfil=${perfil}&session=expired`);
        }
      }
      return response;
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, []);

  return null;
}
