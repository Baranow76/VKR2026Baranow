// Общие типы уровня приложения (страницы, проекты БД, сценарии, тосты).
import type { FullProjectRequest } from '../types';

export type Page =
  | 'home'
  | 'dashboard'
  | 'production'
  | 'robotics'
  | 'risks'
  | 'economics'
  | 'full'
  | 'comparison'
  | 'ai'
  | 'editor'
  | 'project-editor'
  | 'profile'
  | 'history';

export type ToastState = { type: 'success' | 'error'; message: string } | null;
export type ResultsMap = Record<string, any>;

export type DbProject = {
  id: number;
  name: string;
  description?: string | null;
  data: FullProjectRequest;
  created_at: string;
  updated_at: string;
  stats?: {
    production_items?: number;
    robotic_operations?: number;
    risk_strategies?: number;
    economic_periods?: number;
  };
};

export type DbScenario = {
  id: number;
  project_id?: number | null;
  name: string;
  source_data: FullProjectRequest;
  result: any;
  created_at: string;
};
