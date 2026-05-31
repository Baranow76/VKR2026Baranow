import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { API_BASE } from '../utils/apiBase';
import {
  clearTokens, getRefreshToken, refreshSession, setOnSessionExpired, setTokens,
} from './apiClient';

export type AuthUser = {
  id: number;
  email: string;
  full_name?: string | null;
  is_active: boolean;
  is_superuser?: boolean;
  is_verified?: boolean;
  created_at?: string | null;
  updated_at?: string | null;
};

type Status = 'loading' | 'authed' | 'guest';

type AuthContextValue = {
  status: Status;
  user: AuthUser | null;
  /** email, ожидающий подтверждения по OTP (null — экран входа/регистрации). */
  verificationEmail: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, fullName?: string) => Promise<void>;
  verifyOtp: (code: string) => Promise<void>;
  /** Завершить вход после анимации успеха (переключить на приложение). */
  finalizeAuth: () => void;
  resendOtp: () => Promise<void>;
  cancelVerification: () => void;
  logout: () => Promise<void>;
  /** Перечитать профиль с сервера (после обновления данных пользователя). */
  refreshUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function fetchMe(): Promise<AuthUser> {
  const res = await fetch(`${API_BASE}/api/auth/me`);
  if (!res.ok) throw new Error('Не удалось получить профиль');
  return res.json();
}

async function parseError(res: Response, fallback: string): Promise<string> {
  try {
    const data = await res.json();
    const detail = data?.detail;
    if (typeof detail === 'string') return detail;
    if (detail && typeof detail === 'object' && detail.message) return detail.message;
    if (Array.isArray(detail) && detail[0]?.msg) return detail[0].msg;
  } catch {
    /* ignore */
  }
  return fallback;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [user, setUser] = useState<AuthUser | null>(null);
  const [verificationEmail, setVerificationEmail] = useState<string | null>(null);

  useEffect(() => {
    setOnSessionExpired(() => {
      clearTokens();
      setUser(null);
      setStatus('guest');
    });

    // Восстановление сессии при загрузке (refresh из cookie/localStorage).
    (async () => {
      if (!getRefreshToken()) {
        setStatus('guest');
        return;
      }
      const ok = await refreshSession();
      if (!ok) {
        clearTokens();
        setStatus('guest');
        return;
      }
      try {
        setUser(await fetchMe());
        setStatus('authed');
      } catch {
        clearTokens();
        setStatus('guest');
      }
    })();

    return () => setOnSessionExpired(null);
  }, []);

  async function completeAuth(data: any) {
    setTokens(data.access_token, data.refresh_token ?? null);
    setUser(await fetchMe());
    setVerificationEmail(null);
    setStatus('authed');
  }

  /** Регистрация: токены НЕ выдаются — пользователь переходит к вводу OTP. */
  async function register(email: string, password: string, fullName?: string) {
    const res = await fetch(`${API_BASE}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password, full_name: fullName || null }),
    });
    if (!res.ok) throw new Error(await parseError(res, 'Не удалось зарегистрироваться'));
    const data = await res.json();
    setVerificationEmail(data.email || email);  // → экран OTP
  }

  async function login(email: string, password: string) {
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password }),
    });
    if (res.ok) {
      await completeAuth(await res.json());
      return;
    }
    // Неподтверждённый email: вместо ошибки уводим на экран ввода кода.
    if (res.status === 403) {
      try {
        const data = await res.clone().json();
        if (data?.detail?.code === 'email_not_verified') {
          setVerificationEmail(data.detail.email || email);
          return;
        }
      } catch {
        /* ignore */
      }
    }
    throw new Error(await parseError(res, 'Неверный email или пароль'));
  }

  /**
   * Подтверждение OTP. Токены и профиль устанавливаются сразу, но статус НЕ
   * переключается на 'authed' — чтобы экран OTP успел показать анимацию успеха.
   * Переход в приложение выполняет finalizeAuth() после анимации.
   */
  async function verifyOtp(code: string) {
    if (!verificationEmail) throw new Error('Сессия подтверждения не найдена');
    const res = await fetch(`${API_BASE}/api/auth/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email: verificationEmail, code }),
    });
    if (!res.ok) throw new Error(await parseError(res, 'Неверный или истёкший код подтверждения'));
    const data = await res.json();
    setTokens(data.access_token, data.refresh_token ?? null);
    setUser(await fetchMe());
  }

  function finalizeAuth() {
    setVerificationEmail(null);
    setStatus('authed');
  }

  async function resendOtp() {
    if (!verificationEmail) return;
    const res = await fetch(`${API_BASE}/api/auth/resend-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email: verificationEmail }),
    });
    if (!res.ok) throw new Error(await parseError(res, 'Не удалось отправить код повторно'));
  }

  function cancelVerification() {
    setVerificationEmail(null);
  }

  async function refreshUser() {
    try {
      setUser(await fetchMe());
    } catch {
      /* профиль не обновился — оставляем прежнего пользователя */
    }
  }

  async function logout() {
    try {
      await fetch(`${API_BASE}/api/auth/logout`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: getRefreshToken() }),
      });
    } catch {
      /* выходим в любом случае */
    }
    clearTokens();
    setUser(null);
    setStatus('guest');
  }

  return (
    <AuthContext.Provider
      value={{
        status, user, verificationEmail,
        login, register, verifyOtp, finalizeAuth, resendOtp, cancelVerification, logout, refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth должен использоваться внутри AuthProvider');
  return ctx;
}
