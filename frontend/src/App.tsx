import {
  BarChart,
  Bar,
  LineChart,
  Line,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity,
  ArrowUpRight,
  BookOpenText,
  Boxes,
  BriefcaseBusiness,
  Database,
  FileDown,
  FileSpreadsheet,
  FolderOpen,
  History,
  Import,
  LayoutDashboard,
  LoaderCircle,
  Plus,
  RefreshCw,
  Rocket,
  ShieldCheck,
  Sigma,
  TableProperties,
  WandSparkles,
  Menu,
  X,
  UploadCloud,
  Trash2,
  Pencil,
  Save,
  Sparkles,
  GitCompare,
  Factory,
  BrainCircuit,
  Cpu,
  ChartNoAxesCombined,
  CircleCheckBig,
  ShieldAlert,
  ArrowRight,
  Copy,
  Undo2,
  Redo2,
  RotateCcw,
} from 'lucide-react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { demoProject } from './demo';
import type {
  ApiHistoryItem,
  CashFlowPeriod,
  EconomicsRequest,
  FullProjectRequest,
  ProductionItem,
  ProductionRequest,
  RiskRequest,
  RiskStrategy,
  RoboticsRequest,
  RoboticOperation,
} from './types';


//const API_BASE = import.meta.env.VITE_API_BASE || 'http://127.0.0.1:8000';
const API_BASE = import.meta.env.VITE_API_BASE ?? (window.location.hostname === 'localhost' ? 'http://127.0.0.1:8000' : '');

const initialProject = structuredClone(demoProject) as FullProjectRequest;

type Page =
  | 'home'
  | 'dashboard'
  | 'production'
  | 'robotics'
  | 'risks'
  | 'economics'
  | 'full'
  | 'comparison'
  | 'history';

type ToastState = { type: 'success' | 'error'; message: string } | null;
type ResultsMap = Record<string, any>;

type DbProject = {
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

type DbScenario = {
  id: number;
  project_id?: number | null;
  name: string;
  source_data: FullProjectRequest;
  result: any;
  created_at: string;
};

const pageMeta: Record<Page, { title: string; description: string; icon: any }> = {
  home: {
    title: 'Информационная система поддержки проекта инновационной модернизации',
    description:
      'Выпускная квалификационная работа Баранова М.В. Модульная система для расчёта производственной программы, роботизированных звеньев, рисков и экономической эффективности проекта.',
    icon: Rocket,
  },
  dashboard: {
    title: 'Дашборд проекта',
    description: 'Индустриальная аналитическая панель для демонстрации ВКР и прикладных расчётов.',
    icon: LayoutDashboard,
  },
  production: {
    title: 'Квазиоптимальная производственная программа',
    description: 'Ручной ввод, JSON-вставка, импорт из CSV/XLSX и запуск расчёта по алгоритму Джонсона.',
    icon: Boxes,
  },
  robotics: {
    title: 'Моделирование роботизированных звеньев',
    description: 'Подбор комплектов операций, расчёт загрузки робота и анализ невключённых операций.',
    icon: Activity,
  },
  risks: {
    title: 'Анализ рисков',
    description: 'Критерии Вальда, Сэвиджа, Гурвица и итоговая рекомендация по риск-стратегии.',
    icon: ShieldCheck,
  },
  economics: {
    title: 'Экономическая эффективность проекта',
    description: 'NPV, IRR, ROI, индекс доходности, окупаемость и чувствительность.',
    icon: Sigma,
  },
  full: {
    title: 'Единый расчёт проекта',
    description: 'Комплексный запуск всех модулей и формирование интегральной сводки проекта.',
    icon: Rocket,
  },
  comparison: {
    title: 'Сравнение программ инновационной модернизации',
    description:
      'Сопоставление нескольких сценариев модернизации по NPV, IRR, ROI, окупаемости, загрузке оборудования, рискам и роботизированным звеньям.',
    icon: GitCompare,
  },
  history: {
    title: 'История расчётов',
    description: 'Журнал запусков, сохранённый в серверной части приложения.',
    icon: History,
  },
};

function formatValue(value: any) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'number') {
    return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value);
  }
  if (Array.isArray(value)) return value.join(', ');
  return String(value);
}

function formatChartNumber(value: any) {
  const num = Number(value);
  if (Number.isNaN(num)) return String(value);

  if (Math.abs(num) >= 1_000_000) {
    return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(num / 1_000_000)} млн`;
  }

  if (Math.abs(num) >= 1_000) {
    return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(num / 1_000)} тыс.`;
  }

  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(num);
}

function parseNumber(value: string) {
  const normalized = String(value).replace(',', '.');
  const num = Number(normalized);
  return Number.isNaN(num) ? 0 : num;
}

function shallowClone<T>(obj: T): T {
  return structuredClone(obj);
}

async function safeJson(response: Response) {
  return response.json().catch(() => null);
}

export default function App() {
  const [page, setPage] = useState<Page>('home');
  const [projects, setProjects] = useState<DbProject[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<number | null>(null);
  const [results, setResults] = useState<ResultsMap>({});
  const [historyItems, setHistoryItems] = useState<ApiHistoryItem[]>([]);
  const [scenarios, setScenarios] = useState<DbScenario[]>([]);
  const [scenarioName, setScenarioName] = useState('Программа модернизации 1');
  const [loading, setLoading] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const [animatedSummary, setAnimatedSummary] = useState('');
  const [calculationSteps, setCalculationSteps] = useState<string[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    return (localStorage.getItem('modernization_theme') as 'light' | 'dark') || 'light';
  });
  const [dataSaved, setDataSaved] = useState<Record<string, boolean>>({
    production: true,
    robotics: true,
    risks: true,
    economics: true,
    full: true,
  });
  const [dataEditing, setDataEditing] = useState<Record<string, boolean>>({
    production: false,
    robotics: false,
    risks: false,
    economics: false,
    full: false,
  });
  const [editSession, setEditSession] = useState<{

  moduleKey: string | null;

  originalProject: FullProjectRequest | null;

  past: FullProjectRequest[];

  future: FullProjectRequest[];

}>({

  moduleKey: null,

  originalProject: null,

  past: [],

  future: [],

});
  const [hintSeen, setHintSeen] = useState<Record<Page, boolean>>({
    home: true,
    dashboard: true,
    production: false,
    robotics: false,
    risks: false,
    economics: false,
    full: false,
    comparison: false,
    history: true,
  });

  const reportRef = useRef<HTMLDivElement>(null);
  const fullJsonRef = useRef<HTMLTextAreaElement>(null);
  const summaryTimerRef = useRef<number | null>(null);

  const activeProject = useMemo(() => {
    return projects.find((item) => item.id === activeProjectId) || projects[0];
  }, [projects, activeProjectId]);

  const project = activeProject?.data || initialProject;

  const summary = useMemo(() => {
    const economics = results.economics || results.full?.modules?.economics;
    const production = results.production || results.full?.modules?.production;
    const risks = results.risks || results.full?.modules?.risks;
    const robotics = results.robotics || results.full?.modules?.robotics;

    return {
      npv: economics?.npv,
      irr: economics?.irr_percent,
      payback: economics?.discounted_payback_period_years,
      productionUtilization: production?.utilization_percent,
      robotLoad: robotics?.average_robot_load_percent,
      strategy: risks?.criteria?.recommended_strategy,
      isEffective: economics?.is_effective,
    };
  }, [results]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('modernization_theme', theme);
  }, [theme]);

  useEffect(() => {
    fetchProjects();
    fetchHistory();
    fetchComparisonScenarios();
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
  if (summaryTimerRef.current) {
    window.clearInterval(summaryTimerRef.current);
    summaryTimerRef.current = null;
  }

  setAnimatedSummary('');
  setCalculationSteps([]);
  setLoading(null);
}, [page, activeProjectId]);

  function showToast(type: 'success' | 'error', message: string) {
    setToast({ type, message });
  }

  async function fetchProjects() {
    try {
      const response = await fetch(`${API_BASE}/api/projects`);
      if (!response.ok) throw new Error('Не удалось загрузить проекты');
      const data = await response.json();

      if (Array.isArray(data) && data.length > 0) {
        setProjects(data);
        setActiveProjectId((prev) => prev || data[0].id);
        return;
      }

      await createProjectFromData(initialProject, initialProject.name || 'Демо-проект инновационной модернизации', false);
    } catch {
      showToast('error', 'Не удалось загрузить библиотеку проектов. Проверь backend и API /api/projects.');
    }
  }

  async function fetchHistory() {
    try {
      const response = await fetch(`${API_BASE}/api/history`);
      if (!response.ok) return;
      const data = await response.json();
      setHistoryItems(Array.isArray(data) ? data : []);
    } catch {
      // backend может быть ещё не запущен
    }
  }

  async function fetchComparisonScenarios() {
    try {
      const response = await fetch(`${API_BASE}/api/comparison-scenarios`);
      if (!response.ok) return;
      const data = await response.json();
      setScenarios(Array.isArray(data) ? data : []);
    } catch {
      // ignore
    }
  }

  async function createProjectFromData(data: FullProjectRequest, name?: string, notify = true) {
    const response = await fetch(`${API_BASE}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: name || data.name || 'Проект инновационной модернизации',
        description: 'Проект, загруженный в библиотеку информационной системы',
        data,
      }),
    });

    if (!response.ok) {
      const errorData = await safeJson(response);
      throw new Error(errorData?.detail || 'Не удалось сохранить проект в базе данных');
    }

    const created = await response.json();
    setProjects((prev) => {
      const exists = prev.some((item) => item.id === created.id);
      return exists ? prev.map((item) => (item.id === created.id ? created : item)) : [created, ...prev];
    });
    setActiveProjectId(created.id);
    setResults({});

    if (notify) showToast('success', 'Проект сохранён в базе данных.');
    return created as DbProject;
  }

  async function saveProject(projectId: number, nextData: FullProjectRequest, name?: string, description?: string | null) {
    const response = await fetch(`${API_BASE}/api/projects/${projectId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: name || nextData.name || activeProject?.name || 'Проект инновационной модернизации',
        description: description ?? activeProject?.description ?? null,
        data: nextData,
      }),
    });

    if (!response.ok) {
      const errorData = await safeJson(response);
      throw new Error(errorData?.detail || 'Не удалось обновить проект');
    }

    const updated = await response.json();
    setProjects((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
    return updated as DbProject;
  }

  function updateActiveProject(updater: (project: FullProjectRequest) => FullProjectRequest, persist = true) {
  if (!activeProject) return;

  const currentData = activeProject.data;
  const nextData = updater(currentData);

  const isEditMode = editSession.moduleKey !== null;

  if (isEditMode) {
    setEditSession((prev) => ({
      ...prev,
      past: [...prev.past, structuredClone(currentData)].slice(-60),
      future: [],
    }));
  }

  setProjects((prev) =>
    prev.map((item) =>
      item.id === activeProject.id
        ? {
            ...item,
            name: nextData.name || item.name,
            data: nextData,
            updated_at: new Date().toISOString(),
          }
        : item,
    ),
  );

  if (persist && !isEditMode) {
    saveProject(activeProject.id, nextData).catch((error) => {
      showToast('error', error.message || 'Не удалось сохранить изменения в БД.');
    });
  }
}

  async function deleteProject(projectId: number) {
    if (projects.length <= 1) {
      showToast('error', 'Нельзя удалить единственный проект в библиотеке.');
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/api/projects/${projectId}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Не удалось удалить проект');

      const nextProjects = projects.filter((item) => item.id !== projectId);
      setProjects(nextProjects);
      if (activeProjectId === projectId) setActiveProjectId(nextProjects[0]?.id || null);
      setResults({});
      showToast('success', 'Проект удалён из базы данных.');
    } catch (error: any) {
      showToast('error', error.message || 'Ошибка удаления проекта.');
    }
  }

  async function duplicateActiveProject() {
    if (!activeProject) return;
    await createProjectFromData(structuredClone(activeProject.data), `${activeProject.name} — копия`);
  }

  function renameActiveProject(name: string) {
    if (!activeProject) return;
    const nextData = { ...activeProject.data, name };

    setProjects((prev) =>
      prev.map((item) =>
        item.id === activeProject.id
          ? {
              ...item,
              name,
              data: nextData,
              updated_at: new Date().toISOString(),
            }
          : item,
      ),
    );

    saveProject(activeProject.id, nextData, name).catch(() => {
      showToast('error', 'Не удалось переименовать проект в БД.');
    });
  }

  async function callApi(endpoint: string, payload: unknown, key: string) {
    setLoading(key);
    setAnimatedSummary('');
    setCalculationSteps([]);

    const steps = [
      'Проверка исходных данных...',
      'Передача параметров в расчётное ядро...',
      'Выполнение математической модели...',
      'Формирование таблиц и показателей...',
      'Подготовка аналитической сводки...',
    ];

    for (const step of steps) {
      setCalculationSteps((prev) => [...prev, step]);
      await new Promise((resolve) => setTimeout(resolve, 420));
    }

    try {
      const response = await fetch(`${API_BASE}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await safeJson(response);
        throw new Error(errorData?.detail?.[0]?.msg || errorData?.detail || 'Ошибка запроса');
      }

      const data = await response.json();
      setResults((prev) => ({ ...prev, [key]: data }));
      fetchHistory();
      typeSummary(buildHumanSummary(key, data));
      showToast('success', 'Расчёт выполнен успешно.');
      return data;
    } catch (error: any) {
      showToast('error', error.message || 'Не удалось выполнить расчёт.');
      throw error;
    } finally {
      setLoading(null);
    }
  }

  function typeSummary(text: string) {
  const safeText = String(text || '');

  if (summaryTimerRef.current) {
    window.clearInterval(summaryTimerRef.current);
    summaryTimerRef.current = null;
  }

  setAnimatedSummary('');

  let index = 0;

  summaryTimerRef.current = window.setInterval(() => {
    const nextText = safeText.slice(0, index + 1);
    setAnimatedSummary(nextText);

    index += 1;

    if (index >= safeText.length && summaryTimerRef.current) {
      window.clearInterval(summaryTimerRef.current);
      summaryTimerRef.current = null;
    }
  }, 18);
}

  function updateProductionField(field: keyof ProductionRequest, value: number) {
    updateActiveProject((prev) => ({ ...prev, production: { ...prev.production, [field]: value } }));
  }

  function updateProductionItem(index: number, field: keyof ProductionItem, value: string) {
    updateActiveProject((prev) => {
      const items = shallowClone(prev.production.items);
      (items[index] as any)[field] = ['quantity', 'setup_time'].includes(field) ? parseNumber(value) : value;
      return { ...prev, production: { ...prev.production, items } };
    });
  }

  function addProductionItem() {
    updateActiveProject((prev) => ({
      ...prev,
      production: {
        ...prev.production,
        items: [...prev.production.items, { name: '', quantity: 0, setup_time: 0, group: '', comment: '' }],
      },
    }));
  }

  function removeProductionItem(index: number) {
    updateActiveProject((prev) => ({
      ...prev,
      production: { ...prev.production, items: prev.production.items.filter((_, i) => i !== index) },
    }));
  }

  function updateRoboticsField(field: keyof Omit<RoboticsRequest, 'operations'>, value: number) {
    updateActiveProject((prev) => ({ ...prev, robotics: { ...prev.robotics, [field]: value } }));
  }

  function updateOperation(index: number, field: keyof RoboticOperation, value: string) {
    updateActiveProject((prev) => {
      const operations = shallowClone(prev.robotics.operations);
      (operations[index] as any)[field] = ['top', 'kz', 'service_time'].includes(field) ? parseNumber(value) : value;
      return { ...prev, robotics: { ...prev.robotics, operations } };
    });
  }

  function addOperation() {
    updateActiveProject((prev) => ({
      ...prev,
      robotics: {
        ...prev.robotics,
        operations: [...prev.robotics.operations, { name: '', top: 0, kz: 0, service_time: 0, machine: '', comment: '' }],
      },
    }));
  }

  function removeOperation(index: number) {
    updateActiveProject((prev) => ({
      ...prev,
      robotics: { ...prev.robotics, operations: prev.robotics.operations.filter((_, i) => i !== index) },
    }));
  }

  function updateRiskField(field: keyof Omit<RiskRequest, 'events' | 'strategies' | 'hurwicz_coefficients'>, value: number) {
    updateActiveProject((prev) => ({ ...prev, risks: { ...prev.risks, [field]: value } }));
  }

  function updateEvent(index: number, value: string) {
    updateActiveProject((prev) => {
      const events = [...prev.risks.events];
      events[index] = value;
      const strategies = prev.risks.strategies.map((strategy) => {
        const risks = [...strategy.risks];
        while (risks.length < events.length) risks.push(0);
        return { ...strategy, risks: risks.slice(0, events.length) };
      });
      return { ...prev, risks: { ...prev.risks, events, strategies } };
    });
  }

  function addEvent() {
    updateActiveProject((prev) => ({
      ...prev,
      risks: {
        ...prev.risks,
        events: [...prev.risks.events, `Событие ${prev.risks.events.length + 1}`],
        strategies: prev.risks.strategies.map((s) => ({ ...s, risks: [...s.risks, 0] })),
      },
    }));
  }

  function removeEvent(index: number) {
    updateActiveProject((prev) => ({
      ...prev,
      risks: {
        ...prev.risks,
        events: prev.risks.events.filter((_, i) => i !== index),
        strategies: prev.risks.strategies.map((s) => ({ ...s, risks: s.risks.filter((_, i) => i !== index) })),
      },
    }));
  }

  function updateStrategy(index: number, field: keyof RiskStrategy, value: any) {
    updateActiveProject((prev) => {
      const strategies = shallowClone(prev.risks.strategies);
      (strategies[index] as any)[field] = field === 'cost' ? Number(value) : value;
      return { ...prev, risks: { ...prev.risks, strategies } };
    });
  }

  function updateStrategyRisk(strategyIndex: number, eventIndex: number, value: string) {
    updateActiveProject((prev) => {
      const strategies = shallowClone(prev.risks.strategies);
      strategies[strategyIndex].risks[eventIndex] = parseNumber(value);
      return { ...prev, risks: { ...prev.risks, strategies } };
    });
  }

  function addStrategy() {
    updateActiveProject((prev) => ({
      ...prev,
      risks: {
        ...prev.risks,
        strategies: [
          ...prev.risks.strategies,
          { name: `S${prev.risks.strategies.length + 1}`, cost: 0, risks: prev.risks.events.map(() => 0) },
        ],
      },
    }));
  }

  function removeStrategy(index: number) {
    updateActiveProject((prev) => ({
      ...prev,
      risks: { ...prev.risks, strategies: prev.risks.strategies.filter((_, i) => i !== index) },
    }));
  }

  function updateHurwicz(value: string) {
    const coefficients = value
      .split(',')
      .map((item) => parseNumber(item.trim()))
      .filter((item) => !Number.isNaN(item));
    updateActiveProject((prev) => ({ ...prev, risks: { ...prev.risks, hurwicz_coefficients: coefficients } }));
  }

  function updateEconomicsField(field: keyof Omit<EconomicsRequest, 'periods'>, value: number) {
    updateActiveProject((prev) => ({ ...prev, economics: { ...prev.economics, [field]: value } }));
  }

  function updatePeriod(index: number, field: keyof CashFlowPeriod, value: string) {
    updateActiveProject((prev) => {
      const periods = shallowClone(prev.economics.periods);
      (periods[index] as any)[field] = parseNumber(value);
      return { ...prev, economics: { ...prev.economics, periods } };
    });
  }

  function addPeriod() {
    updateActiveProject((prev) => ({
      ...prev,
      economics: {
        ...prev.economics,
        periods: [
          ...prev.economics.periods,
          {
            year: prev.economics.periods.length + 1,
            inflow: 0,
            operating_costs: 0,
            risk_losses: 0,
            maintenance_costs: 0,
            additional_investment: 0,
          },
        ],
      },
    }));
  }

  function removePeriod(index: number) {
    updateActiveProject((prev) => ({
      ...prev,
      economics: { ...prev.economics, periods: prev.economics.periods.filter((_, i) => i !== index) },
    }));
  }

  async function loadDemo() {
    try {
      await createProjectFromData(structuredClone(demoProject), demoProject.name || 'Демо-проект инновационной модернизации');
      setResults({});
      showToast('success', 'Демо-проект добавлен в библиотеку.');
    } catch (error: any) {
      showToast('error', error.message || 'Не удалось загрузить демо-проект.');
    }
  }

  function startModuleEditing(moduleKey: string) {
  if (!activeProject) return;

  setEditSession({
    moduleKey,
    originalProject: structuredClone(activeProject.data),
    past: [],
    future: [],
  });

  setDataEditing((prev) => ({ ...prev, [moduleKey]: true }));
}

async function saveModuleEditing(moduleKey: string) {
  if (!activeProject) return;

  try {
    await saveProject(activeProject.id, activeProject.data);
    setDataEditing((prev) => ({ ...prev, [moduleKey]: false }));
    setEditSession({
      moduleKey: null,
      originalProject: null,
      past: [],
      future: [],
    });
    showToast('success', 'Изменения сохранены в базе данных.');
  } catch (error: any) {
    showToast('error', error.message || 'Не удалось сохранить изменения.');
  }
}

function cancelModuleEditing(moduleKey: string) {
  if (!activeProject || !editSession.originalProject) {
    setDataEditing((prev) => ({ ...prev, [moduleKey]: false }));
    return;
  }

  const restoredProject = structuredClone(editSession.originalProject);

  setProjects((prev) =>
    prev.map((item) =>
      item.id === activeProject.id
        ? {
            ...item,
            data: restoredProject,
            name: restoredProject.name || item.name,
          }
        : item,
    ),
  );

  setDataEditing((prev) => ({ ...prev, [moduleKey]: false }));

  setEditSession({
    moduleKey: null,
    originalProject: null,
    past: [],
    future: [],
  });

  showToast('success', 'Редактирование отменено. Изменения не сохранены.');
}

function undoEditAction() {
  if (!activeProject || editSession.past.length === 0) return;

  const previousProject = editSession.past[editSession.past.length - 1];
  const nextPast = editSession.past.slice(0, -1);
  const currentProject = structuredClone(activeProject.data);

  setProjects((prev) =>
    prev.map((item) =>
      item.id === activeProject.id
        ? {
            ...item,
            data: structuredClone(previousProject),
            name: previousProject.name || item.name,
          }
        : item,
    ),
  );

  setEditSession((prev) => ({
    ...prev,
    past: nextPast,
    future: [currentProject, ...prev.future].slice(0, 60),
  }));
}

function redoEditAction() {
  if (!activeProject || editSession.future.length === 0) return;

  const nextProject = editSession.future[0];
  const nextFuture = editSession.future.slice(1);
  const currentProject = structuredClone(activeProject.data);

  setProjects((prev) =>
    prev.map((item) =>
      item.id === activeProject.id
        ? {
            ...item,
            data: structuredClone(nextProject),
            name: nextProject.name || item.name,
          }
        : item,
    ),
  );

  setEditSession((prev) => ({
    ...prev,
    past: [...prev.past, currentProject].slice(-60),
    future: nextFuture,
  }));
}

  function clearModuleData(moduleKey: string) {
    setDataSaved((prev) => ({ ...prev, [moduleKey]: false }));
    setDataEditing((prev) => ({ ...prev, [moduleKey]: false }));
    setResults((prev) => {
      const next = { ...prev };
      delete next[moduleKey];
      return next;
    });
    showToast('success', 'Данные модуля скрыты. Можно загрузить новый JSON.');
  }

  async function handleJsonUpload(moduleKey: Page, file: File) {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);

      if (moduleKey === 'full') {
        await createProjectFromData(parsed, parsed.name || 'Загруженный проект модернизации');
      }

      if (moduleKey === 'production') updateActiveProject((prev) => ({ ...prev, production: parsed }));
      if (moduleKey === 'robotics') updateActiveProject((prev) => ({ ...prev, robotics: parsed }));
      if (moduleKey === 'risks') updateActiveProject((prev) => ({ ...prev, risks: parsed }));
      if (moduleKey === 'economics') updateActiveProject((prev) => ({ ...prev, economics: parsed }));

      setDataSaved((prev) => ({ ...prev, [moduleKey]: true }));
      setDataEditing((prev) => ({ ...prev, [moduleKey]: true }));
      showToast('success', 'JSON загружен. Проверьте и отредактируйте данные.');
    } catch {
      showToast('error', 'Не удалось прочитать JSON. Проверьте структуру файла.');
    }
  }

  function copyJsonForPage(currentPage: Page) {
    const map: Record<string, any> = {
      production: project.production,
      robotics: project.robotics,
      risks: project.risks,
      economics: project.economics,
      full: project,
    };
    navigator.clipboard.writeText(JSON.stringify(map[currentPage], null, 2));
    showToast('success', 'JSON скопирован в буфер обмена.');
  }

  function applyJson(currentPage: Page, json: string) {
    try {
      const parsed = JSON.parse(json);
      if (currentPage === 'production') updateActiveProject((prev) => ({ ...prev, production: parsed }));
      if (currentPage === 'robotics') updateActiveProject((prev) => ({ ...prev, robotics: parsed }));
      if (currentPage === 'risks') updateActiveProject((prev) => ({ ...prev, risks: parsed }));
      if (currentPage === 'economics') updateActiveProject((prev) => ({ ...prev, economics: parsed }));
      if (currentPage === 'full') createProjectFromData(parsed, parsed.name || 'Загруженный проект модернизации');
      showToast('success', 'JSON успешно применён.');
    } catch {
      showToast('error', 'Не удалось распознать JSON. Проверь формат.');
    }
  }

  async function handleFileImport(currentPage: Page, file: File) {
    const ext = file.name.split('.').pop()?.toLowerCase();
    try {
      if (ext === 'json') {
        const text = await file.text();
        applyJson(currentPage, text);
        return;
      }

      const dataRows = ext === 'csv' ? await readCsv(file) : await readXlsx(file);
      if (!dataRows.length) {
        showToast('error', 'Файл пустой или не содержит строк.');
        return;
      }

      if (currentPage === 'production') {
        const items = dataRows.map((row) => ({
          name: String(row.name || row['изделие'] || row['Наименование'] || ''),
          quantity: Number(row.quantity || row['объем'] || row['quantity'] || 0),
          setup_time: Number(row.setup_time || row['переналадка'] || row['setup'] || 0),
          group: String(row.group || row['группа'] || ''),
          comment: String(row.comment || row['комментарий'] || ''),
        }));
        updateActiveProject((prev) => ({ ...prev, production: { ...prev.production, items } }));
      }

      if (currentPage === 'robotics') {
        const operations = dataRows.map((row) => ({
          name: String(row.name || row['операция'] || ''),
          top: Number(row.top || row['top'] || 0),
          kz: Number(row.kz || row['kz'] || 0),
          service_time: Number(row.service_time || row['to'] || row['service'] || 0),
          machine: String(row.machine || row['станок'] || ''),
          comment: String(row.comment || row['комментарий'] || ''),
        }));
        updateActiveProject((prev) => ({ ...prev, robotics: { ...prev.robotics, operations } }));
      }

      if (currentPage === 'economics') {
        const periods = dataRows.map((row, index) => ({
          year: Number(row.year || index + 1),
          inflow: Number(row.inflow || row['приток'] || 0),
          operating_costs: Number(row.operating_costs || row['операционные_затраты'] || 0),
          risk_losses: Number(row.risk_losses || row['риск_потери'] || 0),
          maintenance_costs: Number(row.maintenance_costs || row['обслуживание'] || 0),
          additional_investment: Number(row.additional_investment || row['доп_инвестиции'] || 0),
        }));
        updateActiveProject((prev) => ({ ...prev, economics: { ...prev.economics, periods } }));
      }

      showToast('success', 'Импорт данных выполнен.');
    } catch (error: any) {
      showToast('error', error.message || 'Не удалось импортировать файл.');
    }
  }

  async function readCsv(file: File) {
    return new Promise<any[]>((resolve, reject) => {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => resolve(results.data as any[]),
        error: (error) => reject(error),
      });
    });
  }

  async function readXlsx(file: File) {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    return XLSX.utils.sheet_to_json(sheet);
  }

  async function exportHistoryJson() {
    const blob = new Blob([JSON.stringify(historyItems, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'history.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  function buildHumanSummary(moduleKey: string, data: any) {
    if (!data) return '';

    if (moduleKey === 'production') {
      return `Расчёт производственной программы завершён. Система включила в программу ${data.sequence?.length || 0} позиций. Использовано ${formatValue(data.used_time)} единиц фонда времени, остаток составляет ${formatValue(data.remaining_time)}. Коэффициент использования фонда времени равен ${formatValue(data.utilization_percent)}%.`;
    }

    if (moduleKey === 'robotics') {
      return `Моделирование роботизированных звеньев завершено. Сформировано ${data.links_count || 0} звеньев. Средняя загрузка роботов составляет ${formatValue(data.average_robot_load_percent)}%. Система также определила операции, которые не вошли в комплекты при заданных ограничениях.`;
    }

    if (moduleKey === 'risks') {
      return `Анализ рисков завершён. По сводной оценке рекомендована стратегия: ${data.criteria?.recommended_strategy || 'не определена'}. Система построила матрицу условных выигрышей, матрицу сожалений и выполнила сравнение по критериям Вальда, Сэвиджа и Гурвица.`;
    }

    if (moduleKey === 'economics') {
      return `Экономический расчёт завершён. NPV проекта составляет ${formatValue(data.npv)}, IRR — ${formatValue(data.irr_percent)}%, ROI — ${formatValue(data.roi_percent)}%. Проект ${data.is_effective ? 'может рассматриваться как экономически эффективный' : 'требует дополнительной корректировки параметров'}.`;
    }

    if (moduleKey === 'comparison') {
      return `Программа модернизации добавлена в сравнение. Система рассчитала интегральные показатели и подготовила данные для графиков сопоставления.`;
    }

    if (moduleKey === 'full') {
      return `Комплексный расчёт проекта завершён. Система выполнила оценку производственной программы, роботизированных звеньев, рисков и экономической эффективности. Итоговый NPV составляет ${formatValue(data.summary?.npv)}, рекомендуемая риск-стратегия — ${data.summary?.recommended_risk_strategy || 'не определена'}.`;
    }

    return data.interpretation || 'Расчёт завершён. Результаты сформированы системой.';
  }

  const currentPageMeta = pageMeta[page];

  return (
    <div className="shell">
      <AmbientDecor />

      <button className="burger-button" onClick={() => setSidebarOpen(true)}>
        <Menu size={22} />
      </button>

      <AnimatePresence>
        {sidebarOpen && (
          <>
            <motion.div
              className="sidebar-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSidebarOpen(false)}
            />

            <motion.aside
              className="sidebar glass liquid-sidebar"
              initial={{ x: -340, opacity: 0, filter: 'blur(18px)' }}
              animate={{ x: 0, opacity: 1, filter: 'blur(0px)' }}
              exit={{ x: -340, opacity: 0, filter: 'blur(18px)' }}
              transition={{ type: 'spring', stiffness: 260, damping: 26 }}
            >
              <button className="sidebar-close" onClick={() => setSidebarOpen(false)}>
                <X size={20} />
              </button>

              <div className="brand-block">
                <div className="brand-mark">BM</div>
                <div>
                  <div className="brand-name">Modernization IS</div>
                  <div className="brand-subtitle">ВКР Баранов М.В.</div>
                </div>
              </div>

              <button className="theme-toggle" onClick={() => setTheme((prev) => (prev === 'light' ? 'dark' : 'light'))}>
                <span>{theme === 'light' ? '🌙' : '☀️'}</span>
                {theme === 'light' ? 'Тёмная тема' : 'Светлая тема'}
              </button>

              <nav className="menu">
                <NavButton page={page} setPage={setPage} value="home" icon={<Rocket size={18} />} label="Главная" onNavigate={() => setSidebarOpen(false)} />
                <NavButton page={page} setPage={setPage} value="dashboard" icon={<LayoutDashboard size={18} />} label="Дашборд" onNavigate={() => setSidebarOpen(false)} />
                <NavButton page={page} setPage={setPage} value="production" icon={<Boxes size={18} />} label="Производственная программа" onNavigate={() => setSidebarOpen(false)} />
                <NavButton page={page} setPage={setPage} value="robotics" icon={<Activity size={18} />} label="Роботизированные звенья" onNavigate={() => setSidebarOpen(false)} />
                <NavButton page={page} setPage={setPage} value="risks" icon={<ShieldCheck size={18} />} label="Анализ рисков" onNavigate={() => setSidebarOpen(false)} />
                <NavButton page={page} setPage={setPage} value="economics" icon={<Sigma size={18} />} label="Экономика проекта" onNavigate={() => setSidebarOpen(false)} />
                <NavButton page={page} setPage={setPage} value="full" icon={<Rocket size={18} />} label="Единый расчёт" onNavigate={() => setSidebarOpen(false)} />
                <NavButton page={page} setPage={setPage} value="comparison" icon={<GitCompare size={18} />} label="Сравнение программ" onNavigate={() => setSidebarOpen(false)} />
                <NavButton page={page} setPage={setPage} value="history" icon={<History size={18} />} label="История" onNavigate={() => setSidebarOpen(false)} />
              </nav>

              <div className="sidebar-card glass-soft">
                <div className="sidebar-card-title">Тема ВКР</div>
                <p>Модульная информационная система поддержки проекта инновационной модернизации на основе оригинальных математических моделей.</p>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <main className="main-area">
        {page !== 'home' && (
          <motion.header
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="hero glass"
          >
            <div>
              <div className="eyebrow">Система поддержки проекта инновационной модернизации МП</div>
              <h1>{currentPageMeta.title}</h1>
              <p>{currentPageMeta.description}</p>
            </div>

            <div className="hero-right">
              <div className="author-chip glass-soft">
                <BriefcaseBusiness size={18} />
                <span>Автор системы: Баранов М.В.</span>
              </div>

              <div className="button-row">
                <button className="button secondary" onClick={loadDemo}>
                  <RefreshCw size={16} /> Демо-проект
                </button>
                <button className="button primary" onClick={() => setPage('full')}>
                  <Rocket size={16} /> Комплексный расчёт
                </button>
              </div>
            </div>
          </motion.header>
        )}

        {page !== 'home' && (
          <>
            <section className="stats-grid">
              <StatCard title="NPV" value={summary.npv} hint="чистый дисконтированный доход" />
              <StatCard title="IRR, %" value={summary.irr} hint="внутренняя норма доходности" />
              <StatCard title="Загрузка фонда, %" value={summary.productionUtilization} hint="производственная программа" />
              <StatCard title="Загрузка робота, %" value={summary.robotLoad} hint="роботизированные звенья" />
              <StatCard title="Риск-стратегия" value={summary.strategy} hint="сводная рекомендация" />
              <StatCard title="Проект" value={summary.isEffective === undefined ? '—' : summary.isEffective ? 'Эффективен' : 'Под вопросом'} hint="итоговая интерпретация" />
            </section>

            <ProjectLibraryPanel
              projects={projects}
              activeProject={activeProject}
              activeProjectId={activeProject?.id || null}
              setActiveProjectId={(id) => {
                setActiveProjectId(id);
                setResults({});
                setAnimatedSummary('');
                setCalculationSteps([]);
              }}
              onRename={renameActiveProject}
              onDuplicate={duplicateActiveProject}
              onDelete={deleteProject}
              onCreateFromJson={(data) => createProjectFromData(data)}
            />
          </>
        )}

        {!hintSeen[page] && ['production', 'robotics', 'risks', 'economics', 'full'].includes(page) && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="hint-banner glass-soft">
            <div className="hint-left">
              <WandSparkles size={18} />
              <div>
                <strong>Подсказка по вводу данных.</strong>
                <div>Сначала выберите активный проект в библиотеке. Все модули будут брать данные именно из выбранного проекта.</div>
              </div>
            </div>
            <button className="button subtle" onClick={() => setHintSeen((prev) => ({ ...prev, [page]: true }))}>Понятно</button>
          </motion.div>
        )}

        {page === 'home' && <HomePage setPage={setPage} loadDemo={loadDemo} />}
        {page === 'dashboard' && <Dashboard project={project} results={results} setPage={setPage} activeProject={activeProject} />}

        {page === 'production' && (
          <ModulePage
            title="Производственная программа"
            isSaved={dataSaved.production}
            isEditing={dataEditing.production}
            onUpload={(file: File) => handleJsonUpload('production', file)}
            onEdit={() => startModuleEditing('production')}
            onSave={() => saveModuleEditing('production')}
            onCancel={() => cancelModuleEditing('production')}
            onUndo={undoEditAction}
            onRedo={redoEditAction}
            canUndo={editSession.moduleKey === 'production' && editSession.past.length > 0}
            canRedo={editSession.moduleKey === 'production' && editSession.future.length > 0}
                        onClear={() => clearModuleData('production')}
            input={
              <div className="stack-16">
                <SectionCard title="Параметры расчёта" icon={<TableProperties size={18} />}>
                  <div className="form-grid two">
                    <Field label="Фонд времени">
                      <DecimalInput
                        value={project.production.time_fund}
                        onChange={(value) => updateProductionField('time_fund', value)}
                      />
                    </Field>

                    <Field label="Такт оборудования">
                      <DecimalInput
                        value={project.production.takt}
                        onChange={(value) => updateProductionField('takt', value)}
                      />
                    </Field>
                  </div>
                </SectionCard>

                <SectionCard
                  title="Состав изделий"
                  icon={<Boxes size={18} />}
                  actions={
                    <button className="button secondary" onClick={addProductionItem}>
                      <Plus size={16} /> Добавить строку
                    </button>
                  }
                >
                  <DataTools
                    onCopyJson={() => copyJsonForPage('production')}
                    onApplyJson={() => showToast('error', 'Для вставки JSON используйте загрузку файла или комплексный JSON.')}
                    onImport={(file) => handleFileImport('production', file)}
                  />
                  <EditableTable
                    headers={['Изделие', 'Объём', 'Переналадка', 'Группа', 'Комментарий', '']}
                    rows={project.production.items.map((item, index) => (
                      <tr key={index}>
                        <td><input value={item.name} onChange={(e) => updateProductionItem(index, 'name', e.target.value)} /></td>
                        <td>
                          <DecimalInput
                            value={item.quantity}
                            onChange={(value) => updateProductionItem(index, 'quantity', String(value))}
                          />
                        </td>

                        <td>
                          <DecimalInput
                            value={item.setup_time}
                            onChange={(value) => updateProductionItem(index, 'setup_time', String(value))}
                          />
                        </td>
                        <td><input value={item.group || ''} onChange={(e) => updateProductionItem(index, 'group', e.target.value)} /></td>
                        <td><input value={item.comment || ''} onChange={(e) => updateProductionItem(index, 'comment', e.target.value)} /></td>
                        <td><button className="icon-button danger" onClick={() => removeProductionItem(index)}>×</button></td>
                      </tr>
                    ))}
                  />
                </SectionCard>
              </div>
            }
            result={
              <ResultPanel
                title="Результат расчёта производственной программы"
                loading={loading === 'production'}
                steps={calculationSteps}
                summary={animatedSummary}
                onRun={() => callApi('/api/production/calculate', project.production, 'production')}
                content={<RenderProduction result={results.production} />}
              />
            }
          />
        )}

        {page === 'robotics' && (
          <ModulePage
            title="Роботизированные звенья"
            isSaved={dataSaved.robotics}
            isEditing={dataEditing.robotics}
            onUpload={(file: File) => handleJsonUpload('robotics', file)}
            onEdit={() => startModuleEditing('robotics')}
            onSave={() => saveModuleEditing('robotics')}
            onCancel={() => cancelModuleEditing('robotics')}
            onUndo={undoEditAction}
            onRedo={redoEditAction}
            canUndo={editSession.moduleKey === 'robotics' && editSession.past.length > 0}
            canRedo={editSession.moduleKey === 'robotics' && editSession.future.length > 0}
            onClear={() => clearModuleData('robotics')}
            input={
              <div className="stack-16">
                <SectionCard title="Ограничения" icon={<Activity size={18} />}>
                  <div className="form-grid two">
                   <Field label="Максимум станков на робота">
                    <DecimalInput
                      value={project.robotics.max_machines_per_robot}
                      onChange={(value) => updateRoboticsField('max_machines_per_robot', value)}
                    />
                  </Field>

                  <Field label="Допустимое отклонение">
                    <DecimalInput
                      value={project.robotics.max_deviation}
                      onChange={(value) => updateRoboticsField('max_deviation', value)}
                    />
                  </Field>
                  </div>
                </SectionCard>

                <SectionCard
                  title="Операции"
                  icon={<Boxes size={18} />}
                  actions={
                    <button className="button secondary" onClick={addOperation}>
                      <Plus size={16} /> Добавить операцию
                    </button>
                  }
                >
                  <DataTools
                    onCopyJson={() => copyJsonForPage('robotics')}
                    onApplyJson={() => showToast('error', 'Для вставки JSON используйте загрузку файла или комплексный JSON.')}
                    onImport={(file) => handleFileImport('robotics', file)}
                  />
                  <EditableTable
                    headers={['Операция', 'top', 'kz', 'to', 'Станок', 'Комментарий', '']}
                    rows={project.robotics.operations.map((item, index) => (
                      <tr key={index}>
                        <td><input value={item.name} onChange={(e) => updateOperation(index, 'name', e.target.value)} /></td>
                        <td>
                          <DecimalInput
                            value={item.top}
                            onChange={(value) => updateOperation(index, 'top', String(value))}
                          />
                        </td>

                        <td>
                          <DecimalInput
                            value={item.kz}
                            onChange={(value) => updateOperation(index, 'kz', String(value))}
                          />
                        </td>

                        <td>
                          <DecimalInput
                            value={item.service_time}
                            onChange={(value) => updateOperation(index, 'service_time', String(value))}
                          />
                        </td>
                        <td><input value={item.machine || ''} onChange={(e) => updateOperation(index, 'machine', e.target.value)} /></td>
                        <td><input value={item.comment || ''} onChange={(e) => updateOperation(index, 'comment', e.target.value)} /></td>
                        <td><button className="icon-button danger" onClick={() => removeOperation(index)}>×</button></td>
                      </tr>
                    ))}
                  />
                </SectionCard>
              </div>
            }
            result={
              <ResultPanel
                title="Результат моделирования роботизированных звеньев"
                loading={loading === 'robotics'}
                steps={calculationSteps}
                summary={animatedSummary}
                onRun={() => callApi('/api/robotics/calculate', project.robotics, 'robotics')}
                content={<RenderRobotics result={results.robotics} />}
              />
            }
          />
        )}

        {page === 'risks' && (
          <ModulePage
            title="Анализ рисков"
            isSaved={dataSaved.risks}
            isEditing={dataEditing.risks}
            onUpload={(file: File) => handleJsonUpload('risks', file)}
            onEdit={() => startModuleEditing('risks')}
            onSave={() => saveModuleEditing('risks')}
            onCancel={() => cancelModuleEditing('risks')}
            onUndo={undoEditAction}
            onRedo={redoEditAction}
            canUndo={editSession.moduleKey === 'risks' && editSession.past.length > 0}
            canRedo={editSession.moduleKey === 'risks' && editSession.future.length > 0}
            onClear={() => clearModuleData('risks')}
            input={
              <div className="stack-16">
                <SectionCard title="Общие параметры" icon={<ShieldCheck size={18} />}>
                  <div className="form-grid two">
                   <Field label="База для расчёта упущенной выгоды">
                      <DecimalInput
                        value={project.risks.base_loss}
                        onChange={(value) => updateRiskField('base_loss', value)}
                      />
                    </Field>

                    <Field label="Порог рентабельности проекта">
                      <DecimalInput
                        value={project.risks.profitability_threshold}
                        onChange={(value) => updateRiskField('profitability_threshold', value)}
                      />
                    </Field>
                    <Field label="Коэффициенты Гурвица">
                      <input value={project.risks.hurwicz_coefficients.join(', ')} onChange={(e) => updateHurwicz(e.target.value)} />
                    </Field>
                  </div>
                </SectionCard>

                <SectionCard
                  title="Риск-события"
                  icon={<Database size={18} />}
                  actions={
                    <button className="button secondary" onClick={addEvent}>
                      <Plus size={16} /> Добавить событие
                    </button>
                  }
                >
                  <EditableTable
                    headers={['Событие', '']}
                    rows={project.risks.events.map((item, index) => (
                      <tr key={index}>
                        <td><input value={item} onChange={(e) => updateEvent(index, e.target.value)} /></td>
                        <td><button className="icon-button danger" onClick={() => removeEvent(index)}>×</button></td>
                      </tr>
                    ))}
                  />
                </SectionCard>

                <SectionCard
                  title="Стратегии риск-менеджмента"
                  icon={<ShieldCheck size={18} />}
                  actions={
                    <button className="button secondary" onClick={addStrategy}>
                      <Plus size={16} /> Добавить стратегию
                    </button>
                  }
                >
                  <DataTools
                    onCopyJson={() => copyJsonForPage('risks')}
                    onApplyJson={() => showToast('error', 'Для вставки JSON используйте загрузку файла или комплексный JSON.')}
                    onImport={(file) => handleFileImport('risks', file)}
                  />
                  <div className="strategies-grid">
                    {project.risks.strategies.map((strategy, strategyIndex) => (
                      <div className="strategy-card glass-soft" key={strategyIndex}>
                        <div className="strategy-head">
                          <strong>Стратегия {strategyIndex + 1}</strong>
                          <button className="icon-button danger" onClick={() => removeStrategy(strategyIndex)}>×</button>
                        </div>
                        <div className="form-grid two">
                          <Field label="Название">
                            <input value={strategy.name} onChange={(e) => updateStrategy(strategyIndex, 'name', e.target.value)} />
                          </Field>
                          <Field label="Стоимость">
                              <DecimalInput
                                value={strategy.cost}
                                onChange={(value) => updateStrategy(strategyIndex, 'cost', value)}
                              />
                          </Field>
                        </div>
                        <EditableTable
                          headers={['Событие', 'Риск, %']}
                          rows={project.risks.events.map((event, eventIndex) => (
                            <tr key={eventIndex}>
                              <td>{event}</td>
                              <td>
                                <DecimalInput
                                  value={strategy.risks[eventIndex]}
                                  onChange={(value) => updateStrategyRisk(strategyIndex, eventIndex, String(value))}
                                />
                              </td>
                            </tr>
                          ))}
                        />
                      </div>
                    ))}
                  </div>
                </SectionCard>
              </div>
            }
            result={
              <ResultPanel
                title="Результат анализа рисков"
                loading={loading === 'risks'}
                steps={calculationSteps}
                summary={animatedSummary}
                onRun={() => callApi('/api/risks/calculate', project.risks, 'risks')}
                content={<RenderRisks result={results.risks} />}
              />
            }
          />
        )}

        {page === 'economics' && (
          <ModulePage
            title="Экономическая эффективность проекта"
            isSaved={dataSaved.economics}
            isEditing={dataEditing.economics}
            onUpload={(file: File) => handleJsonUpload('economics', file)}
            onEdit={() => startModuleEditing('economics')}
            onSave={() => saveModuleEditing('economics')}
            onCancel={() => cancelModuleEditing('economics')}
            onUndo={undoEditAction}
            onRedo={redoEditAction}
            canUndo={editSession.moduleKey === 'economics' && editSession.past.length > 0}
            canRedo={editSession.moduleKey === 'economics' && editSession.future.length > 0}
            onClear={() => clearModuleData('economics')}
            input={
              <div className="stack-16">
                <SectionCard title="Базовые параметры" icon={<Sigma size={18} />}>
                  <div className="form-grid two">
                    <Field label="Первоначальные инвестиции">
                      <DecimalInput
                        value={project.economics.initial_investment}
                        onChange={(value) => updateEconomicsField('initial_investment', value)}
                      />
                    </Field>

                    <Field label="Ставка дисконтирования, %">
                      <DecimalInput
                        value={project.economics.discount_rate}
                        onChange={(value) => updateEconomicsField('discount_rate', value)}
                      />
                    </Field>
                  </div>
                </SectionCard>

                <SectionCard
                  title="Денежные потоки по периодам"
                  icon={<BookOpenText size={18} />}
                  actions={
                    <button className="button secondary" onClick={addPeriod}>
                      <Plus size={16} /> Добавить период
                    </button>
                  }
                >
                  <DataTools
                    onCopyJson={() => copyJsonForPage('economics')}
                    onApplyJson={() => showToast('error', 'Для вставки JSON используйте загрузку файла или комплексный JSON.')}
                    onImport={(file) => handleFileImport('economics', file)}
                  />
                  <EditableTable
                    headers={['Год', 'Приток', 'Опер. затраты', 'Риск-потери', 'Обслуживание', 'Доп. инвестиции', '']}
                    rows={project.economics.periods.map((period, index) => (
                      <tr key={index}>
                        <td>
                          <DecimalInput
                            value={period.year}
                            onChange={(value) => updatePeriod(index, 'year', String(value))}
                          />
                        </td>

                        <td>
                          <DecimalInput
                            value={period.inflow}
                            onChange={(value) => updatePeriod(index, 'inflow', String(value))}
                          />
                        </td>

                        <td>
                          <DecimalInput
                            value={period.operating_costs}
                            onChange={(value) => updatePeriod(index, 'operating_costs', String(value))}
                          />
                        </td>

                        <td>
                          <DecimalInput
                            value={period.risk_losses}
                            onChange={(value) => updatePeriod(index, 'risk_losses', String(value))}
                          />
                        </td>

                        <td>
                          <DecimalInput
                            value={period.maintenance_costs}
                            onChange={(value) => updatePeriod(index, 'maintenance_costs', String(value))}
                          />
                        </td>

                        <td>
                          <DecimalInput
                            value={period.additional_investment || 0}
                            onChange={(value) => updatePeriod(index, 'additional_investment', String(value))}
                          />
                        </td>
                        <td><button className="icon-button danger" onClick={() => removePeriod(index)}>×</button></td>
                      </tr>
                    ))}
                  />
                </SectionCard>
              </div>
            }
            result={
              <ResultPanel
                title="Результат экономического расчёта"
                loading={loading === 'economics'}
                steps={calculationSteps}
                summary={animatedSummary}
                onRun={() => callApi('/api/economics/calculate', project.economics, 'economics')}
                content={<RenderEconomics result={results.economics} project={project} />}
              />
            }
          />
        )}

        {page === 'full' && (
          <ModulePage
            title="Единый расчёт проекта"
            isSaved={dataSaved.full}
            isEditing={dataEditing.full}
            onUpload={(file: File) => handleJsonUpload('full', file)}
            onEdit={() => startModuleEditing('full')}
            onSave={() => saveModuleEditing('full')}
            onCancel={() => cancelModuleEditing('full')}
            onUndo={undoEditAction}
            onRedo={redoEditAction}
            canUndo={editSession.moduleKey === 'full' && editSession.past.length > 0}
            canRedo={editSession.moduleKey === 'full' && editSession.future.length > 0}
            onClear={() => clearModuleData('full')}
            input={
              <SectionCard title="Комплексный JSON проекта" icon={<FolderOpen size={18} />}>
                <DataTools
                  onCopyJson={() => copyJsonForPage('full')}
                  onApplyJson={() => applyJson('full', fullJsonRef.current?.value || '')}
                  onImport={(file) => handleFileImport('full', file)}
                />
                <textarea
                  ref={fullJsonRef}
                  className="json-box tall"
                  defaultValue={JSON.stringify(project, null, 2)}
                  key={activeProject?.id || 'no-project'}
                />
              </SectionCard>
            }
            result={
              <ResultPanel
                title="Сводный результат"
                loading={loading === 'full'}
                steps={calculationSteps}
                summary={animatedSummary}
                onRun={() => callApi('/api/full-project/calculate', project, 'full')}
                content={<RenderFull result={results.full} project={project} />}
              />
            }
          />
        )}

        {page === 'comparison' && (
          <ComparisonPage
            project={project}
            activeProject={activeProject}
            scenarios={scenarios}
            setScenarioName={setScenarioName}
            scenarioName={scenarioName}
            callApi={callApi}
            loading={loading === 'comparison'}
            reportRef={reportRef}
            refreshScenarios={fetchComparisonScenarios}
            restoreScenarioAsProject={async (scenario: DbScenario) => {
              await createProjectFromData(scenario.source_data, `${scenario.name} — редактирование`);
              setPage('dashboard');
            }}
            deleteScenario={async (id: number) => {
              const response = await fetch(`${API_BASE}/api/comparison-scenarios/${id}`, { method: 'DELETE' });
              if (!response.ok) {
                showToast('error', 'Не удалось удалить сценарий.');
                return;
              }
              await fetchComparisonScenarios();
              showToast('success', 'Сценарий удалён из сравнения.');
            }}
          />
        )}

        {page === 'history' && (
          <div className="history-layout">
            <SectionCard title="Журнал расчётов" icon={<History size={18} />} actions={<button className="button secondary" onClick={exportHistoryJson}><FileDown size={16} /> Экспорт JSON</button>}>
              <div className="history-list">
                {historyItems.length === 0 && <div className="empty-result">История пока пуста.</div>}
                {historyItems.map((item: any) => (
                  <div className="history-item glass-soft" key={item.id}>
                    <div className="history-row">
                      <strong>{item.module}</strong>
                      <span>{new Date(item.created_at).toLocaleString('ru-RU')}</span>
                    </div>
                    <details>
                      <summary>Показать входные и выходные данные</summary>
                      <div className="history-json-grid">
                        <pre>{JSON.stringify(item.input_data || item.input_json, null, 2)}</pre>
                        <pre>{JSON.stringify(item.output_data || item.output_json, null, 2)}</pre>
                      </div>
                    </details>
                  </div>
                ))}
              </div>
            </SectionCard>
          </div>
        )}
      </main>

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            className={`toast ${toast.type}`}
          >
            {toast.message}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function NavButton({ page, setPage, value, icon, label, onNavigate }: any) {
  return (
    <button
      className={`nav-button ${page === value ? 'active' : ''}`}
      onClick={() => {
        setPage(value);
        onNavigate?.();
      }}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function AmbientDecor() {
  return (
    <>
      <div className="ambient ambient-1" />
      <div className="ambient ambient-2" />
      <div className="ambient ambient-3" />
    </>
  );
}

function StatCard({ title, value, hint }: { title: string; value: any; hint: string }) {
  return (
    <motion.div whileHover={{ y: -4 }} className="stat-card glass-soft">
      <div className="stat-title">{title}</div>
      <div className="stat-value">{formatValue(value)}</div>
      <div className="stat-hint">{hint}</div>
    </motion.div>
  );
}

function ProjectLibraryPanel({
  projects,
  activeProject,
  activeProjectId,
  setActiveProjectId,
  onRename,
  onDuplicate,
  onDelete,
  onCreateFromJson,
}: {
  projects: DbProject[];
  activeProject?: DbProject;
  activeProjectId: number | null;
  setActiveProjectId: (id: number) => void;
  onRename: (name: string) => void;
  onDuplicate: () => void;
  onDelete: (id: number) => void;
  onCreateFromJson: (data: FullProjectRequest) => void;
}) {
  async function handleJsonFile(file: File) {
    const text = await file.text();
    const parsed = JSON.parse(text);
    onCreateFromJson(parsed);
  }

  return (
    <section className="project-library glass">
      <div className="project-library-head">
        <div>
          <div className="module-input-kicker">Библиотека проектов ИМ</div>
          <h2>Активный источник данных для расчётов</h2>
          <p>Все модули используют данные выбранного ниже проекта. Сравнение тоже сохраняется в базе данных.</p>
        </div>

        <label className="button secondary file-button">
          <UploadCloud size={16} /> Добавить JSON-проект
          <input type="file" accept=".json,application/json" onChange={(e) => e.target.files?.[0] && handleJsonFile(e.target.files[0])} />
        </label>
      </div>

      <div className="project-selector-row">
        <Field label="Выберите проект, из которого брать данные">
          <select value={activeProjectId || ''} onChange={(e) => setActiveProjectId(Number(e.target.value))}>
            {projects.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Название активного проекта">
          <input value={activeProject?.name || ''} onChange={(e) => onRename(e.target.value)} />
        </Field>
      </div>

      <div className="project-actions-row">
        <button className="button secondary" onClick={onDuplicate} disabled={!activeProject}>
          <Copy size={16} /> Создать копию для сравнения
        </button>
        {activeProject && projects.length > 1 && (
          <button className="button secondary danger-button" onClick={() => onDelete(activeProject.id)}>
            <Trash2 size={16} /> Удалить активный проект
          </button>
        )}
      </div>

      <div className="project-mini-grid">
        {projects.map((item) => (
          <button
            key={item.id}
            className={`project-mini-card ${item.id === activeProjectId ? 'active' : ''}`}
            onClick={() => setActiveProjectId(item.id)}
          >
            <strong>{item.name}</strong>
            <span>
              Номенклатура: {item.stats?.production_items ?? item.data.production?.items?.length ?? 0} · Операции:{' '}
              {item.stats?.robotic_operations ?? item.data.robotics?.operations?.length ?? 0} · Периодов:{' '}
              {item.stats?.economic_periods ?? item.data.economics?.periods?.length ?? 0}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

function HomePage({ setPage, loadDemo }: { setPage: (page: Page) => void; loadDemo: () => void }) {
  const modules = [
    {
      title: 'Производственная программа',
      subtitle: 'Алгоритм Джонсона',
      text: 'Формирует квазиоптимальную последовательность выпуска изделий с учётом фонда времени, такта оборудования и переналадок.',
      pain: 'Сложно вручную подобрать порядок выпуска без потерь времени.',
      result: 'Система показывает, что включить в программу и какой фонд времени будет использован.',
      page: 'production' as Page,
      icon: <Factory size={22} />,
    },
    {
      title: 'Роботизированные звенья',
      subtitle: 'Теория массового обслуживания',
      text: 'Помогает определить состав роботизированных производственных звеньев и оценить загрузку робота.',
      pain: 'Непонятно, какие станки объединять вокруг робота.',
      result: 'Система визуально показывает робота и станки, которые он обслуживает.',
      page: 'robotics' as Page,
      icon: <Cpu size={22} />,
    },
    {
      title: 'Анализ рисков',
      subtitle: 'Вальд · Сэвидж · Гурвиц',
      text: 'Сравнивает стратегии риск-менеджмента по формальным критериям принятия решений в условиях неопределённости.',
      pain: 'Риск-стратегия часто выбирается экспертно и субъективно.',
      result: 'Система рассчитывает матрицы выигрышей, сожалений и рекомендует стратегию.',
      page: 'risks' as Page,
      icon: <ShieldAlert size={22} />,
    },
    {
      title: 'Экономика проекта',
      subtitle: 'NPV · IRR · ROI',
      text: 'Оценивает инвестиционную привлекательность проекта модернизации по денежным потокам и ставке дисконтирования.',
      pain: 'Трудно доказать окупаемость и эффект модернизации.',
      result: 'Система считает NPV, IRR, ROI, PI и срок окупаемости.',
      page: 'economics' as Page,
      icon: <ChartNoAxesCombined size={22} />,
    },
  ];
const pains = [
  {
    title: 'Разрозненные расчёты',
    text: 'Производственные, риск- и экономические показатели часто считаются отдельно, поэтому итоговое решение сложно проверить.',
    status: 'Нет единого контура',
  },
  {
    title: 'Сложность сравнения',
    text: 'Несколько программ модернизации трудно сопоставить между собой без общей системы показателей.',
    status: 'Сценарии не связаны',
  },
  {
    title: 'Ручная сборка выводов',
    text: 'После расчётов приходится отдельно готовить таблицы, графики и пояснения для демонстрации результата.',
    status: 'Много ручной работы',
  },
  {
    title: 'Слабое обоснование',
    text: 'Управленческое решение сложнее защитить, если расчёты не объединены в прозрачную цифровую модель.',
    status: 'Решение трудно доказать',
  },
];

  const effects = [
    { label: 'единая модель', value: '4 модуля' },
    { label: 'входные данные', value: 'JSON / CSV / XLSX' },
    { label: 'выход', value: 'таблицы, графики, отчёт' },
    { label: 'хранение', value: 'БД проектов' },
  ];

  const heroRobotEmotions = ['happy', 'calm', 'thinking', 'surprised', 'sad'];

const [heroRobotEmotion, setHeroRobotEmotion] = useState('happy');

useEffect(() => {
  const timer = window.setInterval(() => {
    setHeroRobotEmotion((prev) => {
      const next = heroRobotEmotions.filter((item) => item !== prev);
      return next[Math.floor(Math.random() * next.length)];
    });
  }, 3200);

  return () => window.clearInterval(timer);
}, []);

  return (
    <div className="enterprise-home">
      <section className="enterprise-hero">
        <div className="hero-orb hero-orb-one" />
        <div className="hero-orb hero-orb-two" />
        <div className="hero-noise" />

        <div className="enterprise-hero-left">
          <motion.div className="enterprise-badge glass-soft" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55 }}>
            <BrainCircuit size={18} />
            <span>ВКР · Автор Баранов М.В.</span>
          </motion.div>

          <motion.h1 initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.65, delay: 0.08 }}>
            Интеллектуальная система поддержки инновационной модернизации
          </motion.h1>

          <motion.p className="enterprise-lead" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.65, delay: 0.16 }}>
            Приложение объединяет производственное планирование, моделирование роботизированных звеньев, анализ рисков и экономическую оценку проекта в единую цифровую среду принятия решений.
          </motion.p>

          <motion.div className="enterprise-actions" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.65, delay: 0.24 }}>
            <button className="enterprise-primary" onClick={() => setPage('full')}>
              Запустить комплексный расчёт <ArrowRight size={18} />
            </button>
            <button className="enterprise-secondary" onClick={() => setPage('comparison')}>Сравнить программы</button>
            <button className="enterprise-secondary" onClick={loadDemo}>Загрузить демо</button>
          </motion.div>
          <motion.div
  className="hero-big-robot-card glass-soft"
  initial={{ opacity: 0, y: 18 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.65, delay: 0.34 }}
>
  <div className="hero-big-robot-text">
    <span>Интеллектуальный помощник</span>
    <strong>Система анализирует проект как единый цифровой контур</strong>
  </div>

  <div className={`hero-big-robot robot-${heroRobotEmotion}`}>
    <div className="hero-robot-antenna" />
    <div className="hero-robot-brow left" />
    <div className="hero-robot-brow right" />
    <div className="hero-robot-eye left" />
    <div className="hero-robot-eye right" />
    <div className="hero-robot-mouth" />
  </div>
</motion.div>
        </div>

        <motion.div className="enterprise-hero-right" initial={{ opacity: 0, scale: 0.94, y: 24 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: 0.75, delay: 0.16 }}>
          <div className="enterprise-terminal glass">
            <div className="terminal-top"><span /><span /><span /></div>
            <div className="terminal-grid">
              <div className="terminal-card active"><span>Производственная программа</span><strong>Алгоритм Джонсона</strong></div>
              <div className="terminal-card"><span>Роботизированные звенья</span><strong>Теория массового обслуживания</strong></div>
              <div className="terminal-card"><span>Анализ рисков</span><strong>Вальд · Сэвидж · Гурвиц</strong></div>
              <div className="terminal-card"><span>Экономика проекта</span><strong>NPV · IRR · ROI</strong></div>
            </div>
            <div className="terminal-pipeline"><div /><div /><div /></div>
            <div className="terminal-result"><span>Единое управленческое решение</span><strong>готово к расчёту</strong></div>
          </div>
        </motion.div>
      </section>

      <section className="enterprise-strip">
        {effects.map((item, index) => (
          <motion.div className="enterprise-strip-card glass-soft" key={item.label} initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: index * 0.06 }}>
            <span>{item.label}</span><strong>{item.value}</strong>
          </motion.div>
        ))}
      </section>

      <section className="enterprise-section enterprise-problem">
        <div className="enterprise-section-head">
          <span>Зачем нужна система</span>
          <h2>Проблема модернизации не в одном расчёте, а в связке решений</h2>
          <p>На практике предприятие должно одновременно учитывать загрузку оборудования, состав роботизированных участков, неопределённость рисков и экономический эффект.</p>
        </div>
    <div className="pain-grid clean-pain-grid">
  {pains.map((pain, index) => (
    <motion.div
      className="clean-pain-card"
      key={pain.title}
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      whileHover={{ y: -5 }}
      viewport={{ once: true }}
      transition={{ delay: index * 0.08 }}
    >
      <div className="clean-pain-top">
        <div className="clean-pain-number">
          {String(index + 1).padStart(2, '0')}
        </div>
        <span>{pain.status}</span>
      </div>

      <div className="clean-pain-content">
        <h3>{pain.title}</h3>
        <p>{pain.text}</p>
      </div>
    </motion.div>
  ))}
</div>
      </section>

      <section className="enterprise-section">
        <div className="enterprise-section-head compact">
          <span>Расчётное ядро</span>
          <h2>Четыре модуля, которые работают как единая система</h2>
        </div>
        <div className="enterprise-module-grid">
          {modules.map((module, index) => (
            <motion.button key={module.title} className="enterprise-module-card" onClick={() => setPage(module.page)} initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} whileHover={{ y: -8, scale: 1.01 }} viewport={{ once: true }} transition={{ delay: index * 0.08 }}>
              <div className="module-glow" />
              <div className="enterprise-module-top"><div className="enterprise-module-icon">{module.icon}</div><span>{module.subtitle}</span></div>
              <h3>{module.title}</h3>
              <p>{module.text}</p>
              <div className="module-pain"><b>Боль:</b> {module.pain}</div>
              <div className="module-result"><CircleCheckBig size={16} /><span>{module.result}</span></div>
            </motion.button>
          ))}
        </div>
      </section>
    </div>
  );
}

function ComparisonPage({
  project,
  activeProject,
  scenarios,
  scenarioName,
  setScenarioName,
  callApi,
  loading,
  reportRef,
  refreshScenarios,
  restoreScenarioAsProject,
  deleteScenario,
}: any) {
  async function calculateScenario() {
    const result = await callApi('/api/full-project/calculate', project, 'comparison');

    const response = await fetch(`${API_BASE}/api/comparison-scenarios`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_id: activeProject?.id,
        name: scenarioName || activeProject?.name || `Программа ${scenarios.length + 1}`,
        source_data: project,
        result,
      }),
    });

    if (!response.ok) throw new Error('Расчёт выполнен, но сценарий не удалось сохранить в БД.');
    await refreshScenarios();
    setScenarioName(`Программа модернизации ${scenarios.length + 2}`);
  }

  async function downloadReport() {
    if (!reportRef.current) return;
    const canvas = await html2canvas(reportRef.current, { scale: 2, backgroundColor: '#ffffff' });
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const imgWidth = pageWidth;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    let heightLeft = imgHeight;
    let position = 0;

    pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;

    while (heightLeft > 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
    }

    pdf.save('comparison-report.pdf');
  }

  const normalizedScenarios = scenarios.map((scenario: DbScenario) => ({
    ...scenario,
    metrics: {
      npv: scenario.result?.summary?.npv || 0,
      irr: scenario.result?.summary?.irr_percent || 0,
      payback: scenario.result?.summary?.payback || 0,
      production: scenario.result?.summary?.production_utilization_percent || 0,
      robotLoad: scenario.result?.summary?.average_robot_load_percent || 0,
      strategy: scenario.result?.summary?.recommended_risk_strategy || '—',
    },
  }));

  const chartData = normalizedScenarios.map((scenario: any) => ({
    name: scenario.name,
    NPV: scenario.metrics.npv,
    IRR: scenario.metrics.irr,
    ROI: scenario.result?.modules?.economics?.roi_percent || 0,
    Payback: scenario.metrics.payback,
    Production: scenario.metrics.production,
    RobotLoad: scenario.metrics.robotLoad,
  }));

  const radarMetrics = [
    { key: 'production', label: 'Загрузка фонда', getValue: (scenario: any) => scenario.metrics.production || 0 },
    { key: 'robotLoad', label: 'Загрузка робота', getValue: (scenario: any) => scenario.metrics.robotLoad || 0 },
    { key: 'irr', label: 'IRR', getValue: (scenario: any) => scenario.metrics.irr || 0 },
    { key: 'roi', label: 'ROI', getValue: (scenario: any) => scenario.result?.modules?.economics?.roi_percent || 0 },
    { key: 'payback', label: 'Окупаемость', getValue: (scenario: any) => {
      const payback = scenario.metrics.payback || 0;
      return payback > 0 ? Math.max(0, 100 - payback * 10) : 0;
    } },
  ];

  const radarData = radarMetrics.map((metric) => {
    const row: Record<string, any> = { metric: metric.label };
    normalizedScenarios.forEach((scenario: any) => {
      row[scenario.name] = Math.max(0, Math.min(100, metric.getValue(scenario)));
    });
    return row;
  });

  const radarColors = ['#ff7757', '#151515', '#ff4fd8', '#8b5cf6', '#0f9f68'];

  return (
    <div className="comparison-page" ref={reportRef}>
      <SectionCard
        title="Настройка программы модернизации"
        icon={<GitCompare size={18} />}
        actions={
          <button className="button primary" onClick={calculateScenario} disabled={loading}>
            {loading ? <LoaderCircle size={16} className="spin" /> : <Rocket size={16} />}
            {loading ? 'Сравниваем...' : 'Добавить активный проект в сравнение'}
          </button>
        }
      >
        <div className="form-grid two">
          <Field label="Название сценария сравнения">
            <input value={scenarioName} onChange={(e) => setScenarioName(e.target.value)} />
          </Field>
          <Field label="Сценариев в базе">
            <input value={scenarios.length} readOnly />
          </Field>
        </div>
        <p className="comparison-note">Сравнение берёт данные из активного проекта в библиотеке. Любой сценарий можно открыть как отдельный редактируемый проект.</p>
      </SectionCard>

      {normalizedScenarios.length > 0 && (
        <>
          <SectionCard
            title="Сводное сравнение"
            icon={<BarChartIcon />}
            actions={<button className="button secondary" onClick={downloadReport}><FileDown size={16} /> Скачать отчёт PDF</button>}
          >
            <div className="scenario-grid">
              {normalizedScenarios.map((scenario: any) => (
                <motion.div key={scenario.id} className="scenario-card glass-soft" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
                  <div className="scenario-head">
                    <strong>{scenario.name}</strong>
                    <button className="icon-button danger" onClick={() => deleteScenario(scenario.id)}>×</button>
                  </div>
                  <div className="scenario-metrics">
                    <Metric label="NPV" value={scenario.metrics.npv} />
                    <Metric label="IRR, %" value={scenario.metrics.irr} />
                    <Metric label="Окупаемость" value={scenario.metrics.payback} />
                    <Metric label="Загрузка фонда, %" value={scenario.metrics.production} />
                    <Metric label="Загрузка робота, %" value={scenario.metrics.robotLoad} />
                    <Metric label="Риск-стратегия" value={scenario.metrics.strategy} />
                  </div>
                  <button className="button subtle scenario-edit-button" onClick={() => restoreScenarioAsProject(scenario)}>
                    <Pencil size={15} /> Открыть как проект
                  </button>
                </motion.div>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="Графики сравнения" icon={<GitCompare size={18} />}>
            <div className="charts-grid">
              <ChartCard title="NPV по программам модернизации">
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="NPV" fill="#151515" radius={[12, 12, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="IRR и окупаемость">
                <ResponsiveContainer width="100%" height={320}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="IRR" stroke="#ff7757" strokeWidth={3} />
                    <Line type="monotone" dataKey="Payback" stroke="#151515" strokeWidth={3} />
                  </LineChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Технический профиль программ">
                <ResponsiveContainer width="100%" height={420}>
                  <RadarChart data={radarData} outerRadius="72%">
                    <PolarGrid />
                    <PolarAngleAxis dataKey="metric" />
                    <PolarRadiusAxis angle={90} domain={[0, 100]} />
                    {normalizedScenarios.map((scenario: any, index: number) => (
                      <Radar
                        key={scenario.id}
                        name={scenario.name}
                        dataKey={scenario.name}
                        stroke={radarColors[index % radarColors.length]}
                        fill={radarColors[index % radarColors.length]}
                        fillOpacity={0.18}
                        strokeWidth={3}
                      />
                    ))}
                    <Tooltip />
                    <Legend />
                  </RadarChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>
          </SectionCard>
        </>
      )}

      {normalizedScenarios.length === 0 && <div className="empty-result">Пока нет программ для сравнения. Выберите активный проект и нажмите «Добавить активный проект в сравнение».</div>}
    </div>
  );
}

function ChartCard({ title, children }: any) {
  return <div className="chart-card glass-soft"><h3>{title}</h3>{children}</div>;
}

function BarChartIcon() {
  return <GitCompare size={18} />;
}

function Dashboard({ project, results, setPage, activeProject }: any) {
  const productionCount = project?.production?.items?.length || 0;
  const operationsCount = project?.robotics?.operations?.length || 0;
  const riskEventsCount = project?.risks?.events?.length || 0;
  const strategiesCount = project?.risks?.strategies?.length || 0;
  const periodsCount = project?.economics?.periods?.length || 0;

  const completedModules = ['production', 'robotics', 'risks', 'economics'].filter((key) => Boolean(results[key])).length;
  const readiness = Math.round((completedModules / 4) * 100);

  const moduleCards = [
    {
      key: 'production',
      title: 'Производственная программа',
      desc: 'Очередность выпуска, фонд времени, переналадки и включённые позиции.',
      value: productionCount,
      label: 'позиций',
      status: results.production ? 'Рассчитано' : 'Ожидает расчёт',
      icon: <Boxes size={20} />,
      page: 'production',
    },
    {
      key: 'robotics',
      title: 'Роботизированные звенья',
      desc: 'Комплекты операций, обслуживаемые станки и загрузка роботов.',
      value: operationsCount,
      label: 'операций',
      status: results.robotics ? 'Рассчитано' : 'Ожидает расчёт',
      icon: <Activity size={20} />,
      page: 'robotics',
    },
    {
      key: 'risks',
      title: 'Анализ рисков',
      desc: 'Риск-события, стратегии и критерии Вальда, Сэвиджа, Гурвица.',
      value: strategiesCount,
      label: 'стратегий',
      status: results.risks ? 'Рассчитано' : 'Ожидает расчёт',
      icon: <ShieldCheck size={20} />,
      page: 'risks',
    },
    {
      key: 'economics',
      title: 'Экономика проекта',
      desc: 'Денежные потоки, NPV, IRR, ROI, PI и срок окупаемости.',
      value: periodsCount,
      label: 'периодов',
      status: results.economics ? 'Рассчитано' : 'Ожидает расчёт',
      icon: <Sigma size={20} />,
      page: 'economics',
    },
  ];

  const dataQuality = [
    {
      label: 'Номенклатура',
      value: productionCount,
      hint: productionCount >= 6 ? 'данных достаточно' : 'лучше добавить больше позиций',
    },
    {
      label: 'Операции',
      value: operationsCount,
      hint: operationsCount >= 6 ? 'хорошая детализация' : 'можно расширить модель',
    },
    {
      label: 'Риск-события',
      value: riskEventsCount,
      hint: riskEventsCount >= 4 ? 'риск-модель заполнена' : 'мало событий',
    },
    {
      label: 'Периоды',
      value: periodsCount,
      hint: periodsCount >= 5 ? 'горизонт достаточный' : 'короткий горизонт',
    },
  ];

  return (
    <div className="premium-dashboard">
      <section className="dashboard-command glass">
        <div className="dashboard-command-left">
          <div className="dashboard-kicker">Центр управления проектом</div>

          <h2>{project?.name || activeProject?.name || 'Проект инновационной модернизации'}</h2>

          <p>
            Дашборд показывает состояние активного проекта, наполненность исходных данных,
            готовность расчётных модулей и быстрый переход к ключевым действиям.
          </p>

          <div className="dashboard-command-actions">
            <button className="button primary" onClick={() => setPage('full')}>
              <Rocket size={16} /> Запустить единый расчёт
            </button>

            <button className="button secondary" onClick={() => setPage('comparison')}>
              <GitCompare size={16} /> Сравнить программы
            </button>
          </div>
        </div>

        <div className="dashboard-readiness-card">
          <div className="dashboard-ring" style={{ ['--progress' as any]: `${readiness}%` }}>
            <span>{readiness}%</span>
          </div>

          <div>
            <strong>Готовность расчётов</strong>
            <p>{completedModules} из 4 модулей уже имеют результат.</p>
          </div>
        </div>
      </section>

      <section className="dashboard-data-grid">
        {dataQuality.map((item, index) => (
          <motion.div
            key={item.label}
            className="dashboard-data-card glass-soft"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.06 }}
            whileHover={{ y: -4 }}
          >
            <span>{item.label}</span>
            <strong>{item.value}</strong>
            <p>{item.hint}</p>
          </motion.div>
        ))}
      </section>

      <section className="dashboard-flow glass">
        <div className="dashboard-section-head">
          <div>
            <span>Логика системы</span>
            <h2>Из активного проекта данные проходят через четыре расчётных контура</h2>
          </div>
        </div>

        <div className="dashboard-flow-map">
          {moduleCards.map((card, index) => (
            <motion.button
              key={card.key}
              className={`dashboard-flow-node ${results[card.key] ? 'done' : ''}`}
              onClick={() => setPage(card.page as Page)}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.08 }}
              whileHover={{ y: -5, scale: 1.01 }}
            >
              <div className="flow-node-top">
                <div className="flow-node-icon">{card.icon}</div>
                <span>{card.status}</span>
              </div>

              <h3>{card.title}</h3>
              <p>{card.desc}</p>

              <div className="flow-node-bottom">
                <strong>{card.value}</strong>
                <span>{card.label}</span>
              </div>
            </motion.button>
          ))}
        </div>
      </section>

      <section className="dashboard-insights-grid">
        <div className="dashboard-insight-card glass">
          <div className="dashboard-section-head compact">
            <div>
              <span>Быстрый анализ</span>
              <h2>Что уже понятно по проекту</h2>
            </div>
          </div>

          <div className="dashboard-insight-list">
            <DashboardInsight
              good={productionCount >= 6}
              title="Производственная программа"
              text={
                productionCount >= 6
                  ? 'Номенклатура выглядит достаточно детализированной для демонстрационного расчёта.'
                  : 'В производственную программу лучше добавить больше позиций, чтобы расчёт выглядел убедительнее.'
              }
            />

            <DashboardInsight
              good={operationsCount >= 6}
              title="Роботизация"
              text={
                operationsCount >= 6
                  ? 'Операций достаточно для визуализации нескольких роботизированных звеньев.'
                  : 'Для эффектной демонстрации роботизированных звеньев стоит добавить больше операций и станков.'
              }
            />

            <DashboardInsight
              good={periodsCount >= 5}
              title="Экономика"
              text={
                periodsCount >= 5
                  ? 'Горизонт расчёта подходит для оценки окупаемости и дисконтированных показателей.'
                  : 'Экономический горизонт короткий, итоговые показатели могут выглядеть менее убедительно.'
              }
            />
          </div>
        </div>

        <div className="dashboard-action-card glass">
          <div className="dashboard-action-orb" />

          <span>Следующий шаг</span>
          <h2>Провести комплексный расчёт и сохранить результат</h2>
          <p>
            Единый расчёт объединит производственный, робототехнический,
            риск- и экономический блоки в одну сводку проекта.
          </p>

          <button className="button primary" onClick={() => setPage('full')}>
            Перейти к единому расчёту <ArrowRight size={16} />
          </button>
        </div>
      </section>
    </div>
  );
}

function DashboardInsight({ good, title, text }: { good: boolean; title: string; text: string }) {
  return (
    <div className="dashboard-insight-item">
      <div className={`dashboard-insight-dot ${good ? 'good' : 'warn'}`}>
        {good ? <CircleCheckBig size={15} /> : <WandSparkles size={15} />}
      </div>

      <div>
        <strong>{title}</strong>
        <p>{text}</p>
      </div>
    </div>
  );
}

function SectionCard({ title, icon, children, actions }: any) {
  return (
    <section className="section-card glass">
      <div className="section-head">
        <div className="section-title-wrap"><div className="section-icon">{icon}</div><h2>{title}</h2></div>
        {actions}
      </div>
      {children}
    </section>
  );
}

function ModulePage({
  title,
  input,
  result,
  isSaved,
  isEditing,
  onUpload,
  onEdit,
  onSave,
  onCancel,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onClear,
}: any) {
  return (
    <div className="module-page">
      {!isSaved && (
        <UploadDropzone
          title={title}
          onUpload={onUpload}
        />
      )}

      {isSaved && (
        <section className="module-input-panel glass">
          <div className="module-input-head">
            <div>
              <div className="module-input-kicker">
                Исходные данные активного проекта
              </div>
              <h2>{title}</h2>
            </div>

            <div className="module-input-actions">
              {!isEditing && (
                <button className="button secondary" onClick={onEdit}>
                  <Pencil size={16} />
                  Проверить и отредактировать
                </button>
              )}

              {isEditing && (
                <>
                  <button
                    className="button secondary"
                    onClick={onUndo}
                    disabled={!canUndo}
                    title="Отменить последнее действие"
                  >
                    <Undo2 size={16} />
                    Назад
                  </button>

                  <button
                    className="button secondary"
                    onClick={onRedo}
                    disabled={!canRedo}
                    title="Вернуть отменённое действие"
                  >
                    <Redo2 size={16} />
                    Вперёд
                  </button>

                  <button
                    className="button secondary"
                    onClick={onCancel}
                    title="Закрыть редактирование без сохранения"
                  >
                    <RotateCcw size={16} />
                    Отменить
                  </button>

                  <button className="button primary" onClick={onSave}>
                    <Save size={16} />
                    Сохранить данные
                  </button>
                </>
              )}

              <button className="button secondary danger-button" onClick={onClear}>
                <Trash2 size={16} />
                Скрыть данные
              </button>
            </div>
          </div>

          {isEditing ? (
            <div className="module-editor">
              {input}
            </div>
          ) : (
            <div className="module-saved-state">
              <Sparkles size={18} />
              <div>
                <strong>Данные активного проекта готовы</strong>
                <span>
                  Можно запустить расчёт или открыть редактирование.
                </span>
              </div>
            </div>
          )}
        </section>
      )}

      <div className="module-result-wide">
        {result}
      </div>
    </div>
  );
}

function Field({ label, children }: any) {
  return <label className="field"><span>{label}</span>{children}</label>;
}

function DecimalInput({
  value,
  onChange,
  placeholder,
}: {
  value: number | string;
  onChange: (value: number) => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState(String(value ?? ''));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) {
      setDraft(String(value ?? ''));
    }
  }, [value, focused]);

  function handleChange(raw: string) {
    // Разрешаем пустое поле, минус, целые и дробные числа через точку или запятую
    if (!/^-?\d*([.,]\d*)?$/.test(raw)) return;

    setDraft(raw);

    // Временные состояния, которые нельзя сразу превращать в number
    if (
      raw === '' ||
      raw === '-' ||
      raw.endsWith('.') ||
      raw.endsWith(',')
    ) {
      return;
    }

    const num = Number(raw.replace(',', '.'));
    if (!Number.isNaN(num)) {
      onChange(num);
    }
  }

  function commitValue() {
    const normalized = draft.replace(',', '.');
    const num = Number(normalized);

    if (draft === '' || draft === '-' || Number.isNaN(num)) {
      setDraft(String(value ?? ''));
      return;
    }

    onChange(num);
    setDraft(String(num));
  }

  return (
    <input
      type="text"
      inputMode="decimal"
      value={draft}
      placeholder={placeholder}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false);
        commitValue();
      }}
      onChange={(e) => handleChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          commitValue();
          e.currentTarget.blur();
        }
      }}
    />
  );
}

function Metric({ label, value }: { label: string; value: any }) {
  return <div className="metric glass-soft"><div className="metric-label">{label}</div><div className="metric-value">{formatValue(value)}</div></div>;
}

function Feature({ icon, title, text }: any) {
  return <div className="feature glass-soft"><div className="feature-icon">{icon}</div><div><strong>{title}</strong><p>{text}</p></div></div>;
}

function DataTools({ onCopyJson, onApplyJson, onImport }: { onCopyJson: () => void; onApplyJson: () => void; onImport: (file: File) => void }) {
  return (
    <div className="data-tools">
      <button className="button secondary" onClick={onCopyJson}><Database size={16} /> Скопировать JSON</button>
      <button className="button secondary" onClick={onApplyJson}><Import size={16} /> Применить JSON</button>
      <label className="button secondary file-button">
        <FileSpreadsheet size={16} /> Импорт CSV/XLSX/JSON
        <input type="file" accept=".csv,.xlsx,.xls,.json" onChange={(e) => e.target.files?.[0] && onImport(e.target.files[0])} />
      </label>
    </div>
  );
}

function EditableTable({ headers, rows }: { headers: string[]; rows: any[] }) {
  return <div className="table-shell"><table><thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{rows}</tbody></table></div>;
}

function ResultPanel({ title, loading, onRun, content, steps, summary }: any) {
  return (
    <section className="result-panel glass">
      <div className="section-head">
        <div className="section-title-wrap"><div className="section-icon"><Rocket size={18} /></div><h2>{title}</h2></div>
        <button className="button primary" onClick={onRun} disabled={loading}>
          {loading ? <LoaderCircle size={16} className="spin" /> : <Rocket size={16} />}
          {loading ? 'Система думает...' : 'Запустить расчёт'}
        </button>
      </div>

      {loading && <div className="thinking-box"><div className="thinking-orb"><span /><span /><span /></div><div className="thinking-content"><strong>Расчётная модель обрабатывает данные</strong><div className="thinking-steps">{steps?.map((step: string, index: number) => <motion.div key={step} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: index * 0.08 }}>{step}</motion.div>)}</div></div></div>}
      {summary && !loading && <div className="ai-summary"><div className="ai-summary-label">Аналитическая сводка</div><p>{summary}<span className="typing-cursor">|</span></p></div>}
      <div className={`result-scroll ${loading ? 'loading-blur' : ''}`}>{content}</div>
    </section>
  );
}

function RenderProduction({ result }: { result: any }) {
  if (!result) return <div className="empty-result">Запустите модуль, чтобы увидеть результат.</div>;
  return <div className="result-stack"><Interpretation text={result.interpretation} /><div className="passport-grid compact"><Metric label="Использовано фонда" value={result.used_time} /><Metric label="Остаток фонда" value={result.remaining_time} /><Metric label="Загрузка, %" value={result.utilization_percent} /></div><h3>Включённые позиции</h3><ProductionFlowAnimation rows={result.sequence || []} /><h3>Не включено</h3><SimpleTable rows={result.excluded_items} /></div>;
}

function RenderRobotics({ result }: { result: any }) {
  if (!result) return <div className="empty-result">Запустите модуль, чтобы увидеть результат.</div>;
  return <div className="result-stack"><Interpretation text={result.interpretation} /><div className="passport-grid compact"><Metric label="Количество звеньев" value={result.links_count} /><Metric label="Средняя загрузка, %" value={result.average_robot_load_percent} /></div><h3>Карта роботизированных звеньев</h3><RoboticLinksVisualizer links={result.links || []} /><h3>Расчётные комплекты</h3>{result.links?.map((link: any) => <div key={link.link_number} className="result-card-sub glass-soft"><div className="result-card-head"><strong>Комплект {link.link_number}</strong><span>{link.assessment}</span></div><div className="passport-grid compact"><Metric label="d" value={link.d} /><Metric label="Krob" value={link.robot_load_factor} /><Metric label="Загрузка, %" value={link.robot_load_percent} /><Metric label="m" value={link.machines_count} /></div><SimpleTable rows={link.operations} /></div>)}<h3>Невключённые операции</h3><SimpleTable rows={result.unassigned_operations} /></div>;
}


function RenderRisks({ result }: { result: any }) {
  if (!result) {
    return <div className="empty-result">Запустите модуль, чтобы увидеть результат.</div>;
  }

  const recommended = result.criteria?.recommended_strategy || 'Не определена';

  const lossRows = result.loss_table || [];
  const payoffRows = result.payoff_table || [];
  const regretRows = result.regret_table || [];

  const strategyCards = lossRows.map((row: any, index: number) => {
    const payoff = payoffRows[index] || {};
    const regret = regretRows[index] || {};

    const totalLoss = Number(row.total_loss || 0);
    const strategyCost = Number(row.strategy_cost || 0);
    const dmin = Number(payoff.Dminij || 0);
    const dmax = Number(payoff.Dmaxij || 0);

    return {
      name: row.strategy || `Стратегия ${index + 1}`,
      totalLoss,
      strategyCost,
      dmin,
      dmax,
      regretMax: Number(regret.max_regret || regret.Rmaxij || 0),
      isRecommended: String(row.strategy || '').trim() === String(recommended).trim(),
    };
  });

  const maxLoss = Math.max(...strategyCards.map((item: any) => item.totalLoss), 1);
  const maxCost = Math.max(...strategyCards.map((item: any) => item.strategyCost), 1);
  const maxDmax = Math.max(...strategyCards.map((item: any) => item.dmax), 1);

  const recommendedCard =
    strategyCards.find((item: any) => item.isRecommended) || strategyCards[0];

  const riskScore = recommendedCard
    ? Math.max(
        8,
        Math.min(
          96,
          Math.round(
            100 -
              (recommendedCard.totalLoss / maxLoss) * 46 -
              (recommendedCard.strategyCost / maxCost) * 24,
          ),
        ),
      )
    : 0;

  return (
    <div className="result-stack">
      <div className="risk-hero">
        <div className="risk-hero-left">
          <div className="risk-kicker">Интегральная оценка рисков</div>
          <h3>{recommended}</h3>
          <p>
            Система сопоставила стратегии по критериям Вальда, Сэвиджа, Maximax и Гурвица.
            Ниже показан не только табличный расчёт, но и визуальный профиль риска для управленческого решения.
          </p>

          <div className="risk-score-line">
            <div>
              <span>Индекс устойчивости решения</span>
              <strong>{riskScore}%</strong>
            </div>

            <div className="risk-score-track">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${riskScore}%` }}
                transition={{ duration: 0.9, ease: 'easeOut' }}
              />
            </div>
          </div>
        </div>

        <div className="risk-orb-card">
          <div className="risk-orb">
            <div className="risk-orb-ring one" />
            <div className="risk-orb-ring two" />
            <div className="risk-orb-core">
              <ShieldCheck size={34} />
              <span>Risk</span>
            </div>
          </div>
        </div>
      </div>

      <div className="risk-decision-grid">
        <Metric label="Рекомендуемая стратегия" value={result.criteria?.recommended_strategy} />
        <Metric label="Сэвидж" value={result.criteria?.savage_minimax_regret?.join(', ')} />
        <Metric label="Вальд" value={result.criteria?.wald_maximin_pessimism?.join(', ')} />
        <Metric label="Maximax" value={result.criteria?.maximax_optimism?.join(', ')} />
      </div>

      <h3>Визуальное сравнение стратегий</h3>

      <div className="risk-strategy-grid">
        {strategyCards.map((strategy: any, index: number) => {
          const lossPercent = Math.round((strategy.totalLoss / maxLoss) * 100);
          const costPercent = Math.round((strategy.strategyCost / maxCost) * 100);
          const payoffPercent = Math.round((strategy.dmax / maxDmax) * 100);

          return (
            <motion.div
              key={strategy.name}
              className={`risk-strategy-card glass-soft ${strategy.isRecommended ? 'recommended' : ''}`}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.08 }}
            >
              <div className="risk-strategy-head">
                <div>
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <strong>{strategy.name}</strong>
                </div>

                {strategy.isRecommended && (
                  <div className="risk-badge">
                    <CircleCheckBig size={14} />
                    Рекомендуется
                  </div>
                )}
              </div>

              <div className="risk-mini-bars">
                <RiskBar label="Потери" value={lossPercent} raw={strategy.totalLoss} danger />
                <RiskBar label="Стоимость" value={costPercent} raw={strategy.strategyCost} />
                <RiskBar label="Потенциал" value={payoffPercent} raw={strategy.dmax} positive />
              </div>
            </motion.div>
          );
        })}
      </div>

      <h3>Карта критериев принятия решения</h3>

      <div className="risk-criteria-board">
        <RiskCriterionCard
          title="Критерий Сэвиджа"
          subtitle="минимизация максимального сожаления"
          value={result.criteria?.savage_minimax_regret?.join(', ')}
        />
        <RiskCriterionCard
          title="Критерий Вальда"
          subtitle="пессимистический maximin-подход"
          value={result.criteria?.wald_maximin_pessimism?.join(', ')}
        />
        <RiskCriterionCard
          title="Критерий Maximax"
          subtitle="оптимистический подход"
          value={result.criteria?.maximax_optimism?.join(', ')}
        />
        <RiskCriterionCard
          title="Критерий Гурвица"
          subtitle="баланс оптимизма и осторожности"
          value={`${result.criteria?.hurwicz?.length || 0} расчётных вариантов`}
        />
      </div>

      <h3>Упущенная выгода</h3>
      <SimpleTable rows={result.loss_table} />

      <h3>Таблица условных выигрышей</h3>
      <SimpleTable rows={result.payoff_table} />

      <h3>Таблица сожалений</h3>
      <SimpleTable rows={result.regret_table} />

      <h3>Гурвиц</h3>
      <SimpleTable rows={result.criteria?.hurwicz} />
    </div>
  );
}

function RiskBar({
  label,
  value,
  raw,
  danger,
  positive,
}: {
  label: string;
  value: number;
  raw: number;
  danger?: boolean;
  positive?: boolean;
}) {
  return (
    <div className="risk-bar-row">
      <div className="risk-bar-top">
        <span>{label}</span>
        <strong>{formatValue(raw)}</strong>
      </div>

      <div className={`risk-bar-track ${danger ? 'danger' : ''} ${positive ? 'positive' : ''}`}>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${Math.max(4, Math.min(value, 100))}%` }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        />
      </div>
    </div>
  );
}

function RiskCriterionCard({
  title,
  subtitle,
  value,
}: {
  title: string;
  subtitle: string;
  value: any;
}) {
  return (
    <motion.div
      className="risk-criterion-card glass-soft"
      whileHover={{ y: -4 }}
      transition={{ duration: 0.2 }}
    >
      <div className="risk-criterion-icon">
        <ShieldAlert size={18} />
      </div>

      <div>
        <h4>{title}</h4>
        <p>{subtitle}</p>
        <strong>{formatValue(value)}</strong>
      </div>
    </motion.div>
  );
}

function RenderEconomics({ result, project }: { result: any; project: FullProjectRequest }) {
  if (!result) {
    return <div className="empty-result">Запустите модуль, чтобы увидеть результат.</div>;
  }

  const flows = result.flows || [];

const discountRate = Number(project.economics?.discount_rate ?? 0) / 100;

let cumulativeDiscountedFlow = -Number(project.economics?.initial_investment ?? 0);

const chartData = flows.map((flow: any, index: number) => {
  const year = Number(flow.year ?? index + 1);

  const inflow = Number(flow.inflow ?? 0);

  const costs =
    Number(flow.operating_costs ?? 0) +
    Number(flow.risk_losses ?? 0) +
    Number(flow.maintenance_costs ?? 0) +
    Number(flow.additional_investment ?? 0);

  const netFlow =
    Number(flow.net_cash_flow ?? flow.cash_flow ?? 0) || inflow - costs;

  const discounted =
    Number(flow.discounted_cash_flow ?? 0) ||
    netFlow / Math.pow(1 + discountRate, year);

  cumulativeDiscountedFlow += discounted;

  return {
    year: `Год ${year}`,
    inflow,
    costs,
    cashFlow: netFlow,
    discounted,
    cumulative: cumulativeDiscountedFlow,
  };
});

  const npv = Number(result.npv || 0);
  const irr = Number(result.irr_percent || 0);
  const roi = Number(result.roi_percent || 0);
  const pi = Number(result.profitability_index || 0);
  const payback = Number(result.discounted_payback_period_years || 0);

  const effectScore = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        (npv > 0 ? 34 : 8) +
          Math.min(irr, 40) * 0.7 +
          Math.min(Math.max(roi, 0), 80) * 0.32 +
          Math.min(Math.max(pi, 0), 3) * 7,
      ),
    ),
  );

  const statusText = result.is_effective
    ? 'Проект экономически эффективен'
    : 'Проект требует корректировки параметров';

  const statusHint = result.is_effective
    ? 'Показатели демонстрируют положительный инвестиционный эффект при заданных исходных данных.'
    : 'Текущая финансовая модель не даёт устойчивого подтверждения эффективности проекта.';

  return (
    <div className="result-stack">
      <div className={`economics-hero ${result.is_effective ? 'effective' : 'warning'}`}>
        <div className="economics-hero-left">
          <div className="economics-kicker">Инвестиционная оценка проекта</div>

          <h3>{statusText}</h3>

          <p>{statusHint}</p>

          <div className="economics-score-block">
            <div className="economics-score-head">
              <span>Индекс финансовой привлекательности</span>
              <strong>{effectScore}%</strong>
            </div>

            <div className="economics-score-track">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${effectScore}%` }}
                transition={{ duration: 0.9, ease: 'easeOut' }}
              />
            </div>
          </div>
        </div>

        <div className="economics-orb-wrap">
          <div className="economics-orb">
            <div className="economics-orb-ring one" />
            <div className="economics-orb-ring two" />
            <div className="economics-orb-core">
              <Sigma size={34} />
              <span>NPV</span>
              <strong>{formatValue(npv)}</strong>
            </div>
          </div>
        </div>
      </div>

      <div className="economics-kpi-grid">
        <EconomicsKpiCard label="NPV" value={npv} hint="чистый дисконтированный доход" accent />
        <EconomicsKpiCard label="IRR" value={`${formatValue(irr)}%`} hint="внутренняя норма доходности" />
        <EconomicsKpiCard label="ROI" value={`${formatValue(roi)}%`} hint="рентабельность инвестиций" />
        <EconomicsKpiCard label="PI" value={pi} hint="индекс доходности" />
        <EconomicsKpiCard label="Окупаемость" value={payback} hint="дисконтированный срок, лет" />
        <EconomicsKpiCard
          label="Статус"
          value={result.is_effective ? 'Эффективен' : 'Под вопросом'}
          hint="итоговая интерпретация"
        />
      </div>

      <div className="economics-visual-grid">
        <ChartCard title="Динамика денежных потоков">
          <ResponsiveContainer width="100%" height={320}>
            <BarChart
  data={chartData}
  margin={{ top: 20, right: 28, left: 42, bottom: 16 }}
>
  <CartesianGrid strokeDasharray="3 3" />
  <XAxis dataKey="year" />

  <YAxis
    width={90}
    tickFormatter={formatChartNumber}
    tick={{ fontSize: 13 }}
  />

  <Tooltip
    formatter={(value: any) => formatValue(Number(value))}
  />

  <Legend />

  <Bar
    dataKey="inflow"
    name="Приток"
    fill="#151515"
    radius={[10, 10, 0, 0]}
  />

  <Bar
    dataKey="costs"
    name="Затраты"
    fill="#ff7757"
    radius={[10, 10, 0, 0]}
  />
</BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Накопленный дисконтированный поток">
          <ResponsiveContainer width="100%" height={320}>
            <LineChart
  data={chartData}
  margin={{ top: 20, right: 28, left: 42, bottom: 16 }}
>
  <CartesianGrid strokeDasharray="3 3" />
  <XAxis dataKey="year" />

  <YAxis
    width={90}
    tickFormatter={formatChartNumber}
    tick={{ fontSize: 13 }}
  />

  <Tooltip
    formatter={(value: any) => formatValue(Number(value))}
  />

  <Legend />

  <Line
    type="monotone"
    dataKey="cumulative"
    name="Накопленный поток"
    stroke="#ff7757"
    strokeWidth={3}
    dot={{ r: 5 }}
    activeDot={{ r: 7 }}
  />

  <Line
    type="monotone"
    dataKey="discounted"
    name="Дисконтированный поток"
    stroke="#151515"
    strokeWidth={3}
    dot={{ r: 5 }}
    activeDot={{ r: 7 }}
  />
</LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <h3>Финансовая логика проекта</h3>

      <div className="economics-insight-grid">
        <EconomicsInsightCard
          number="01"
          title="Инвестиционный эффект"
          text={`NPV проекта составляет ${formatValue(npv)}. ${
            npv > 0
              ? 'Положительное значение показывает, что проект создаёт добавленную стоимость.'
              : 'Отрицательное значение указывает на необходимость пересмотра параметров проекта.'
          }`}
        />

        <EconomicsInsightCard
          number="02"
          title="Возврат вложений"
          text={`ROI равен ${formatValue(roi)}%. Показатель отражает, насколько результат проекта превышает объём вложенных средств.`}
        />

        <EconomicsInsightCard
          number="03"
          title="Срок окупаемости"
          text={`Дисконтированный срок окупаемости составляет ${formatValue(payback)} лет. Этот показатель важен для оценки инвестиционного риска.`}
        />

        <EconomicsInsightCard
          number="04"
          title="Доходность"
          text={`Индекс доходности PI равен ${formatValue(pi)}. Значение выше 1 обычно указывает на финансовую целесообразность проекта.`}
        />
      </div>

      <h3>Чувствительность проекта</h3>

      <EconomicsSensitivity result={result.sensitivity} />

      <h3>Денежные потоки</h3>
      <SimpleTable rows={result.flows} />

      <h3>Расчёт чувствительности</h3>
      <SimpleTable rows={[result.sensitivity]} />
    </div>
  );
}

function EconomicsKpiCard({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: any;
  hint: string;
  accent?: boolean;
}) {
  return (
    <motion.div whileHover={{ y: -4 }} className={`economics-kpi-card glass-soft ${accent ? 'accent' : ''}`}>
      <div className="economics-kpi-label">{label}</div>
      <div className="economics-kpi-value">{formatValue(value)}</div>
      <div className="economics-kpi-hint">{hint}</div>
    </motion.div>
  );
}

function EconomicsInsightCard({
  number,
  title,
  text,
}: {
  number: string;
  title: string;
  text: string;
}) {
  return (
    <motion.div
      className="economics-insight-card glass-soft"
      whileHover={{ y: -4 }}
      transition={{ duration: 0.2 }}
    >
      <div className="economics-insight-number">{number}</div>
      <div>
        <h4>{title}</h4>
        <p>{text}</p>
      </div>
    </motion.div>
  );
}

function EconomicsSensitivity({ result }: { result: any }) {
  if (!result) {
    return <div className="empty-result">Нет данных по чувствительности.</div>;
  }

  const rows = Object.entries(result).map(([key, value]) => ({
    key,
    value: Number(value || 0),
  }));

  const maxValue = Math.max(...rows.map((item) => Math.abs(item.value)), 1);

  return (
    <div className="economics-sensitivity-board">
      {rows.map((item, index) => {
        const width = Math.max(6, Math.min(100, Math.round((Math.abs(item.value) / maxValue) * 100)));
        const isPositive = item.value >= 0;

        return (
          <motion.div
            className="economics-sensitivity-row glass-soft"
            key={item.key}
            initial={{ opacity: 0, x: -14 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.07 }}
          >
            <div className="economics-sensitivity-name">{item.key}</div>

            <div className="economics-sensitivity-track">
              <motion.div
                className={isPositive ? 'positive' : 'negative'}
                initial={{ width: 0 }}
                animate={{ width: `${width}%` }}
                transition={{ duration: 0.75, ease: 'easeOut' }}
              />
            </div>

            <strong>{formatValue(item.value)}</strong>
          </motion.div>
        );
      })}
    </div>
  );
}

function RenderFull({ result, project }: { result: any; project?: FullProjectRequest }) {
const fullReportRef = useRef<HTMLDivElement>(null);
const [reportGenerating, setReportGenerating] = useState(false);

async function downloadFullReport() {
  if (!fullReportRef.current || reportGenerating) return;

  setReportGenerating(true);

  await new Promise((resolve) => setTimeout(resolve, 120));

  try {
    const canvas = await html2canvas(fullReportRef.current, {
      scale: 1.6,
      backgroundColor: '#ffffff',
      useCORS: true,
      logging: false,
      windowWidth: fullReportRef.current.scrollWidth,
      windowHeight: fullReportRef.current.scrollHeight,
    });

    const imgData = canvas.toDataURL('image/jpeg', 0.92);
    const pdf = new jsPDF('p', 'mm', 'a4');

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();

    const imgWidth = pageWidth;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    let heightLeft = imgHeight;
    let position = 0;

    pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;

    while (heightLeft > 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
    }

    pdf.save('otchet-edinogo-rascheta.pdf');
  } catch (error) {
    console.error(error);
  } finally {
    setReportGenerating(false);
  }
}

  if (!result) {
    return (
      <div className="empty-result">
        Запустите единый расчёт, чтобы увидеть интегральную сводку проекта модернизации.
      </div>
    );
  }

  const production = result.modules?.production;
  const robotics = result.modules?.robotics;
  const risks = result.modules?.risks;
  const economics = result.modules?.economics;

  const npv = result.summary?.npv ?? economics?.npv;
  const irr = result.summary?.irr_percent ?? economics?.irr_percent;
  const payback = result.summary?.payback ?? economics?.discounted_payback_period_years;
  const productionLoad = result.summary?.production_utilization_percent ?? production?.utilization_percent;
  const robotLoad = result.summary?.average_robot_load_percent ?? robotics?.average_robot_load_percent;
  const strategy = result.summary?.recommended_risk_strategy ?? risks?.criteria?.recommended_strategy;
  const isEffective = economics?.is_effective;

  const modules = [
    {
      title: 'Производственная программа',
      subtitle: 'Алгоритм Джонсона',
      value: `${formatValue(productionLoad)}%`,
      hint: 'использование фонда времени',
      icon: <Boxes size={20} />,
      status: production ? 'Рассчитано' : 'Нет данных',
    },
    {
      title: 'Роботизированные звенья',
      subtitle: 'Модель обслуживания',
      value: `${formatValue(robotLoad)}%`,
      hint: 'средняя загрузка роботов',
      icon: <Activity size={20} />,
      status: robotics ? `${robotics.links_count || 0} звеньев` : 'Нет данных',
    },
    {
      title: 'Анализ рисков',
      subtitle: 'Вальд · Сэвидж · Гурвиц',
      value: strategy || '—',
      hint: 'рекомендуемая стратегия',
      icon: <ShieldCheck size={20} />,
      status: risks ? 'Стратегия выбрана' : 'Нет данных',
    },
    {
      title: 'Экономика проекта',
      subtitle: 'NPV · IRR · ROI',
      value: formatValue(npv),
      hint: 'чистый дисконтированный доход',
      icon: <Sigma size={20} />,
      status: economics ? 'Эффект рассчитан' : 'Нет данных',
    },
  ];

  const score = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        ((Number(productionLoad || 0) + Number(robotLoad || 0)) / 2) * 0.45 +
          Math.min(Math.max(Number(irr || 0), 0), 100) * 0.35 +
          (isEffective ? 20 : 5),
      ),
    ),
  );

  const flowData = economics?.flows?.map((flow: any, index: number) => ({
    year: `Год ${flow.year ?? index + 1}`,
    inflow: Number(flow.inflow ?? 0),
    costs:
      Number(flow.operating_costs ?? 0) +
      Number(flow.risk_losses ?? 0) +
      Number(flow.maintenance_costs ?? 0) +
      Number(flow.additional_investment ?? 0),
  })) || [];

  return (
  <div className="full-render" ref={fullReportRef}>
      <section className="full-hero glass">
        <div className="full-hero-glow" />

        <div className="full-hero-left">
          <div className="full-kicker">Комплексный расчёт завершён</div>

          <h2>
            {result.project_name || project?.name || 'Проект инновационной модернизации'}
          </h2>

          <p>
            Система выполнила единый расчёт производственной программы, роботизированных звеньев,
            стратегии управления рисками и экономической эффективности проекта.
          </p>

          <div className="full-status-row">
            <div className={`full-status-pill ${isEffective ? 'positive' : 'warning'}`}>
              {isEffective ? 'Проект экономически эффективен' : 'Требуется уточнение параметров'}
            </div>

            <div className="full-status-pill">
              Интегральная оценка: {score}%
            </div>
          </div>
        </div>

      <div className="full-hero-right">
        <div className="full-score-ring">
          <div className="full-score-ring-inner">
            <span>Индекс</span>
            <strong>{score}%</strong>
            <small>готовности решения</small>
          </div>
        </div>

        <button
          className="button primary full-report-button"
          onClick={downloadFullReport}
          disabled={reportGenerating}
        >
          {reportGenerating ? <LoaderCircle size={16} className="spin" /> : <FileDown size={16} />}
          {reportGenerating ? 'Формируем отчёт...' : 'Скачать отчёт единого расчёта'}
        </button>
      </div>
      </section>

      <section className="full-kpi-grid">
        <motion.div className="full-kpi-card glass-soft" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}>
          <span>NPV</span>
          <strong>{formatValue(npv)}</strong>
          <p>чистый дисконтированный доход</p>
        </motion.div>

        <motion.div className="full-kpi-card glass-soft" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
          <span>IRR</span>
          <strong>{formatValue(irr)}%</strong>
          <p>внутренняя норма доходности</p>
        </motion.div>

        <motion.div className="full-kpi-card glass-soft" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <span>Окупаемость</span>
          <strong>{formatValue(payback)}</strong>
          <p>дисконтированный срок, лет</p>
        </motion.div>

        <motion.div className="full-kpi-card glass-soft" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
          <span>Риск-стратегия</span>
          <strong>{strategy || '—'}</strong>
          <p>итоговая рекомендация системы</p>
        </motion.div>
      </section>

      <section className="full-module-grid">
        {modules.map((module, index) => (
          <motion.div
            className="full-module-card glass-soft"
            key={module.title}
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.07 }}
          >
            <div className="full-module-top">
              <div className="full-module-icon">{module.icon}</div>
              <span>{module.status}</span>
            </div>

            <div>
              <div className="full-module-subtitle">{module.subtitle}</div>
              <h3>{module.title}</h3>
            </div>

            <div className="full-module-line" />

            <div className="full-module-value">{module.value}</div>
            <p>{module.hint}</p>
          </motion.div>
        ))}
      </section>

      <section className="full-pipeline glass">
        <div className="full-section-head">
          <span>Логика принятия решения</span>
          <h3>От производственных данных к интегральной оценке проекта</h3>
        </div>

        <div className="full-pipeline-steps">
          {[
            ['01', 'Производство', 'расчёт выпуска и загрузки фонда'],
            ['02', 'Роботизация', 'формирование производственных звеньев'],
            ['03', 'Риски', 'выбор стратегии в условиях неопределённости'],
            ['04', 'Экономика', 'NPV, IRR, ROI и окупаемость'],
          ].map((step, index) => (
            <motion.div
              className="full-pipeline-step"
              key={step[0]}
              initial={{ opacity: 0, x: -14 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.08 }}
            >
              <b>{step[0]}</b>
              <strong>{step[1]}</strong>
              <span>{step[2]}</span>
            </motion.div>
          ))}
        </div>
      </section>

      {flowData.length > 0 && (
        <section className="full-chart-card glass">
          <div className="full-section-head">
            <span>Финансовая динамика</span>
            <h3>Притоки и затраты по периодам проекта</h3>
          </div>

          <ResponsiveContainer width="100%" height={340}>
            <BarChart
              data={flowData}
              margin={{ top: 20, right: 24, left: 34, bottom: 16 }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="year" />
              <YAxis
                width={82}
                tickFormatter={formatChartNumber}
                tick={{ fontSize: 13 }}
              />
              <Tooltip formatter={(value: any) => formatValue(Number(value))} />
              <Legend />
              <Bar dataKey="inflow" name="Приток" fill="#151515" radius={[12, 12, 0, 0]} />
              <Bar dataKey="costs" name="Затраты" fill="#ff7757" radius={[12, 12, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </section>
      )}

      <section className="full-details-grid">
        <SectionCard title="Производственная программа" icon={<Boxes size={18} />}>
          <RenderProduction result={production} />
        </SectionCard>

        <SectionCard title="Роботизированные звенья" icon={<Activity size={18} />}>
          <RenderRobotics result={robotics} />
        </SectionCard>

        <SectionCard title="Анализ рисков" icon={<ShieldCheck size={18} />}>
          <RenderRisks result={risks} />
        </SectionCard>

        <SectionCard title="Экономика проекта" icon={<Sigma size={18} />}>
          <RenderEconomics result={economics} project={project} />
        </SectionCard>
      </section>
      <AnimatePresence>
  {reportGenerating && (
    <motion.div
      className="report-generating-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="report-generating-card glass"
        initial={{ opacity: 0, y: 18, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 18, scale: 0.96 }}
      >
        <div className="report-orb">
          <span />
          <span />
          <span />
        </div>

        <div>
          <div className="report-generating-kicker">Формирование PDF</div>
          <h3>Система собирает отчёт единого расчёта</h3>
          <p>
            Подготавливаются графики, карточки показателей, визуализация модулей и итоговая сводка проекта.
            Страница может на пару секунд стать менее отзывчивой.
          </p>

          <div className="report-progress">
            <div />
          </div>
        </div>
      </motion.div>
    </motion.div>
  )}
</AnimatePresence>
    </div>
  );
}

function Interpretation({ text }: { text: string }) {
  return <div className="interpretation glass-soft">{text}</div>;
}


function RoboticLinksVisualizer({ links }: { links: any[] }) {
  if (!links || !links.length) {
    return <div className="empty-result">Роботизированные звенья пока не сформированы.</div>;
  }

  const emotions = [
    {
      key: 'happy',
      label: 'доволен конфигурацией',
      face: 'улыбается',
    },
    {
      key: 'calm',
      label: 'работает стабильно',
      face: 'спокоен',
    },
    {
      key: 'thinking',
      label: 'анализирует загрузку',
      face: 'думает',
    },
    {
      key: 'sad',
      label: 'перегружен операциями',
      face: 'грустит',
    },
    {
      key: 'surprised',
      label: 'обнаружил отклонение',
      face: 'удивлён',
    },
  ];

  function getRobotState(load: number, robotIndex: number) {
    const baseEmotion = emotions[robotIndex % emotions.length];

    if (load >= 85) {
      return {
        key: 'sad',
        label: 'перегружен операциями',
        face: 'грустит',
      };
    }

    if (load <= 35) {
      return {
        key: 'surprised',
        label: 'заметил недогрузку',
        face: 'удивлён',
      };
    }

    return baseEmotion;
  }

  return (
    <div className="robotic-map">
      {links.map((link, robotIndex) => {
        const load = Number(link.robot_load_percent || 0);
        const emotion = getRobotState(load, robotIndex);

        return (
          <motion.div
            key={link.link_number ?? robotIndex}
            className="robot-cell glass-soft"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: robotIndex * 0.08 }}
          >
            <div className="robot-head">
              <div
                className={`robot-icon robot-face robot-${emotion.key} robot-motion-${robotIndex % 5}`}
                title={`Робот ${emotion.face}`}
              >
                <div className="robot-antenna" />
                <div className="robot-brow left" />
                <div className="robot-brow right" />
                <div className="robot-eye left" />
                <div className="robot-eye right" />
                <div className="robot-mouth" />
              </div>

              <div>
                <strong>Робот №{link.link_number ?? robotIndex + 1}</strong>
                <span>Загрузка {formatValue(load)}%</span>
                <small className="robot-emotion-label">{emotion.label}</small>
              </div>
            </div>

            <div className="machine-chain">
              {link.operations?.length ? (
                link.operations.map((operation: any, index: number) => (
                  <motion.div
                    className="machine-node"
                    key={`${operation.name || operation.machine || 'operation'}-${index}`}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: robotIndex * 0.08 + index * 0.06 }}
                  >
                    <div className="machine-dot" />

                    <div>
                      <strong>{operation.machine || operation.name || `Операция ${index + 1}`}</strong>
                      <span>{operation.name || 'Операция без названия'}</span>
                    </div>
                  </motion.div>
                ))
              ) : (
                <div className="empty-result">Операции для данного робота не указаны.</div>
              )}
            </div>

            <div className="robot-load-bar">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(Math.max(load, 0), 100)}%` }}
                transition={{ duration: 0.9, delay: 0.2 }}
              />
            </div>

            <div className="robot-assessment">
              {link.assessment || emotion.label}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

function SimpleTable({ rows }: { rows?: any[] }) {
  if (!rows || rows.length === 0) return <div className="empty-result">Нет данных для отображения.</div>;
  const columns = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  return <div className="table-shell"><table><thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index}>{columns.map((column) => <td key={column}>{formatValue(row[column])}</td>)}</tr>)}</tbody></table></div>;
}

function UploadDropzone({ title, onUpload }: { title: string; onUpload: (file: File) => void }) {
  return <label className="upload-dropzone"><input type="file" accept=".json,application/json" onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0])} /><div className="upload-dropzone-icon"><UploadCloud size={24} /></div><div><strong>{title}</strong><p>Загрузите JSON-файл с исходными данными. После загрузки можно проверить и отредактировать показатели.</p></div></label>;
}

function ProductionFlowAnimation({ rows }: { rows: any[] }) {
  if (!rows.length) return <div className="empty-result">Производственная программа пока не сформирована.</div>;
  return <div className="production-flow"><div className="production-flow-line" />{rows.map((row, index) => <motion.div key={`${row.name}-${index}`} className="production-flow-item glass-soft" initial={{ opacity: 0, x: -24, scale: 0.96 }} animate={{ opacity: 1, x: 0, scale: 1 }} transition={{ delay: index * 0.14, duration: 0.45, ease: 'easeOut' }}><div className="production-flow-number">{String(index + 1).padStart(2, '0')}</div><div className="production-flow-content"><strong>{row.name}</strong><span>Объём: {formatValue(row.quantity)} · Переналадка: {formatValue(row.setup_time)} · Время: {formatValue(row.total_time)}</span></div><div className="production-flow-badge">{formatValue(row.cumulative_time)}</div></motion.div>)}</div>;
}
