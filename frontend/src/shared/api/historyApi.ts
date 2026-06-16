// API истории расчётов.
import { apiGet } from './http';
import type { ApiHistoryItem } from '../../types';

export function getHistory(): Promise<ApiHistoryItem[]> {
  return apiGet<ApiHistoryItem[]>('/api/history', 'Не удалось загрузить историю');
}
