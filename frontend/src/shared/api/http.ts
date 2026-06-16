// Единый HTTP-клиент API. Использует глобальный fetch, который уже перехвачен
// в auth/apiClient.ts (добавляет Authorization и обрабатывает 401/refresh),
// поэтому здесь — только базовый URL, сериализация JSON и разбор ошибок.
import { API_BASE } from '../../utils/apiBase';

async function readError(res: Response, fallback: string): Promise<string> {
  const data = await res.json().catch(() => null);
  const detail = data?.detail;
  if (Array.isArray(detail) && detail[0]?.msg) return detail[0].msg;
  if (typeof detail === 'string') return detail;
  if (detail && typeof detail === 'object' && detail.message) return detail.message;
  return fallback;
}

export async function apiGet<T = any>(path: string, errorMessage = 'Ошибка запроса'): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(await readError(res, errorMessage));
  return res.json();
}

async function apiSend<T = any>(
  path: string,
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  body?: unknown,
  errorMessage = 'Ошибка запроса',
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(await readError(res, errorMessage));
  return res.json().catch(() => null as T);
}

export const apiPost = <T = any>(path: string, body?: unknown, msg?: string) => apiSend<T>(path, 'POST', body, msg);
export const apiPut = <T = any>(path: string, body?: unknown, msg?: string) => apiSend<T>(path, 'PUT', body, msg);
export const apiDelete = <T = any>(path: string, msg?: string) => apiSend<T>(path, 'DELETE', undefined, msg);
