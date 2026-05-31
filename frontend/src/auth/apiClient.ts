// Централизованный клиент API с авторизацией.
// - access-токен хранится в памяти (не в localStorage);
// - refresh-токен: httpOnly cookie (prod) с резервом в localStorage (cross-origin dev);
// - перехватчик window.fetch добавляет заголовок Authorization ко всем /api/-запросам
//   и при 401 один раз пытается обновить токен и повторить запрос.
import { API_BASE } from '../utils/apiBase';

const REFRESH_KEY = 'mod_refresh_token';

let accessToken: string | null = null;
let refreshToken: string | null = localStorage.getItem(REFRESH_KEY);
let onSessionExpired: (() => void) | null = null;

export function setTokens(access: string, refresh?: string | null): void {
  accessToken = access;
  if (refresh !== undefined) {
    refreshToken = refresh;
    if (refresh) localStorage.setItem(REFRESH_KEY, refresh);
    else localStorage.removeItem(REFRESH_KEY);
  }
}

export function clearTokens(): void {
  accessToken = null;
  refreshToken = null;
  localStorage.removeItem(REFRESH_KEY);
}

export function getRefreshToken(): string | null {
  return refreshToken;
}

export function setOnSessionExpired(cb: (() => void) | null): void {
  onSessionExpired = cb;
}

// Несфабрикованный fetch (без перехвата) для запросов обновления токена.
const origFetch: typeof window.fetch = window.fetch.bind(window);

let refreshing: Promise<boolean> | null = null;

async function doRefresh(): Promise<boolean> {
  try {
    const res = await origFetch(`${API_BASE}/api/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    setTokens(data.access_token, data.refresh_token ?? refreshToken);
    return true;
  } catch {
    return false;
  }
}

export function refreshSession(): Promise<boolean> {
  if (!refreshing) {
    refreshing = doRefresh().finally(() => {
      refreshing = null;
    });
  }
  return refreshing;
}

function isAuthEndpoint(url: string): boolean {
  return (
    url.includes('/api/auth/login') ||
    url.includes('/api/auth/register') ||
    url.includes('/api/auth/refresh')
  );
}

// Установка перехватчика один раз при импорте модуля (до рендера приложения).
window.fetch = async (input: RequestInfo | URL, init: RequestInit = {}) => {
  const url = typeof input === 'string' ? input : input.toString();
  if (!url.includes('/api/')) return origFetch(input, init);

  const buildOpts = (): RequestInit => {
    const headers = new Headers(init.headers || {});
    if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
    return { ...init, headers, credentials: 'include' };
  };

  let res = await origFetch(input, buildOpts());

  if (res.status === 401 && !isAuthEndpoint(url)) {
    const ok = await refreshSession();
    if (ok) {
      res = await origFetch(input, buildOpts());
    } else {
      onSessionExpired?.();
    }
  }
  return res;
};
