// API сценариев сравнения.
import { apiGet, apiPost, apiDelete } from './http';
import type { DbScenario } from '../types';
import type { FullProjectRequest } from '../../types';

export function listScenarios(): Promise<DbScenario[]> {
  return apiGet<DbScenario[]>('/api/comparison-scenarios', 'Не удалось загрузить сценарии');
}

export function createScenario(payload: {
  project_id?: number | null; name: string; source_data: FullProjectRequest; result: any;
}): Promise<DbScenario> {
  return apiPost<DbScenario>('/api/comparison-scenarios', payload, 'Сценарий не удалось сохранить в БД.');
}

export function deleteScenario(id: number): Promise<any> {
  return apiDelete(`/api/comparison-scenarios/${id}`, 'Не удалось удалить сценарий.');
}
