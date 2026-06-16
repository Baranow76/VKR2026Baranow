// API расчётных модулей (производство, роботы, риски, экономика, единый расчёт).
import { apiPost } from './http';

export function runCalculation(endpoint: string, payload: unknown): Promise<any> {
  return apiPost(endpoint, payload, 'Ошибка запроса');
}
