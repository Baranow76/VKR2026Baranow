// API проектов: список, создание, обновление, удаление.
import { apiGet, apiPost, apiPut, apiDelete } from './http';
import type { DbProject } from '../types';
import type { FullProjectRequest } from '../../types';

export function listProjects(): Promise<DbProject[]> {
  return apiGet<DbProject[]>('/api/projects', 'Не удалось загрузить проекты');
}

export function createProject(payload: {
  name: string; description?: string | null; data: FullProjectRequest;
}): Promise<DbProject> {
  return apiPost<DbProject>('/api/projects', payload, 'Не удалось сохранить проект в базе данных');
}

export function updateProject(id: number, payload: {
  name?: string; description?: string | null; data: FullProjectRequest;
}): Promise<DbProject> {
  return apiPut<DbProject>(`/api/projects/${id}`, payload, 'Не удалось обновить проект');
}

export function deleteProject(id: number): Promise<any> {
  return apiDelete(`/api/projects/${id}`, 'Не удалось удалить проект');
}
