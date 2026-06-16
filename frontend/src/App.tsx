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
  LogOut,
  UserCircle,
} from 'lucide-react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { demoProject } from './demo';
import AiCommandPanel from './components/ai/AiCommandPanel';
import ProjectEditorPage from './pages/ProjectEditorPage';
import ProfilePage from './pages/ProfilePage';
import { MODULE_ADAPTERS } from './utils/moduleAdapters';
import type { AiRecord, ModuleType } from './utils/moduleAdapters';
import { withUids, computeHighlight, type AiHighlight } from './utils/aiHighlight';
import { useAuth } from './auth/AuthContext';
import type {
  AiModelInfo,
  AiPredictResult,
  ApiHistoryItem,
  CashFlowPeriod,
  EconomicsRequest,
  EquipmentParams,
  FullProjectRequest,
  NluApplyResult,
  NluModelInfo,
  NluParseResult,
  ProductionItem,
  ProductionRequest,
  RiskRequest,
  RiskStrategy,
  RoboticsRequest,
  RoboticOperation,
} from './types';
import type { Page, ToastState, ResultsMap, DbProject, DbScenario } from './shared/types';
import { ACTIVE_PROJECT_KEY, RESULTS_KEY, pageMeta } from './shared/constants';
import { formatValue, parseNumber, shallowClone } from './shared/utils/formatters';
import {
  AmbientDecor, StatCard, SectionCard, Field, DecimalInput, DataTools, EditableTable, ResultPanel,
} from './shared/ui/primitives';
import { ProjectLibraryPanel } from './widgets/ProjectLibraryPanel';
import { ModulePage } from './widgets/ModulePage';
import { Sidebar } from './widgets/layout/Sidebar';
import { HomePage } from './pages/HomePage';
import { Dashboard } from './pages/Dashboard';
import { ComparisonPage } from './pages/ComparisonPage';
import { AiEditorPage } from './pages/AiEditorPage';
import { AiPage } from './pages/AiPage';
import {
  RenderProduction, RenderRobotics, RenderRisks, RenderEconomics, RenderFull,
} from './pages/results';
import {
  listProjects, createProject, updateProject, deleteProject as apiDeleteProject,
} from './shared/api/projectsApi';
import { getHistory } from './shared/api/historyApi';
import { listScenarios, deleteScenario as apiDeleteScenario } from './shared/api/comparisonApi';
import { runCalculation } from './shared/api/calculationsApi';


const initialProject = structuredClone(demoProject) as FullProjectRequest;


export default function App() {
  const { user, logout, refreshUser } = useAuth();
  const [page, setPage] = useState<Page>('home');
  const [projects, setProjects] = useState<DbProject[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<number | null>(() => {
    const stored = localStorage.getItem(ACTIVE_PROJECT_KEY);
    const id = stored ? Number(stored) : NaN;
    return Number.isFinite(id) ? id : null;
  });
  // Результаты расчётов хранятся отдельно по каждому проекту и переживают
  // переключение проектов и перезагрузку страницы (localStorage).
  const [resultsByProject, setResultsByProject] = useState<Record<number, ResultsMap>>(() => {
    try {
      const raw = localStorage.getItem(RESULTS_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  });
  const [aiEditHighlight, setAiEditHighlight] = useState<Record<string, AiHighlight | null>>({});
  const aiHighlightTimers = useRef<Record<string, number>>({});
  const [historyItems, setHistoryItems] = useState<ApiHistoryItem[]>([]);
  const [scenarios, setScenarios] = useState<DbScenario[]>([]);
  const [scenarioName, setScenarioName] = useState('Программа модернизации 1');
  const [loading, setLoading] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const [animatedSummary, setAnimatedSummary] = useState('');
  const [calculationSteps, setCalculationSteps] = useState<string[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // settled=true только когда меню полностью открыто и не анимируется — тогда
  // включается backdrop-filter. Любое переключение сбрасывает settled, поэтому
  // во время входа/выхода backdrop остаётся чистым однородным затемнением.
  const [sidebarSettled, setSidebarSettled] = useState(false);
  function toggleSidebar(open: boolean) {
    setSidebarOpen(open);
    setSidebarSettled(false);
  }
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
    ai: true,
    editor: true,
    'project-editor': true,
    profile: true,
    history: true,
  });

  const reportRef = useRef<HTMLDivElement>(null);
  const fullJsonRef = useRef<HTMLTextAreaElement>(null);
  const summaryTimerRef = useRef<number | null>(null);

  const activeProject = useMemo(() => {
    return projects.find((item) => item.id === activeProjectId) || projects[0];
  }, [projects, activeProjectId]);

  const project = activeProject?.data || initialProject;

  // Результаты активного проекта (производный срез из общего хранилища).
  const results = useMemo<ResultsMap>(
    () => (activeProjectId != null ? resultsByProject[activeProjectId] || {} : {}),
    [resultsByProject, activeProjectId],
  );

  // Запись результатов в слот активного проекта.
  function setActiveResults(updater: ResultsMap | ((prev: ResultsMap) => ResultsMap)) {
    setResultsByProject((prev) => {
      const targetId = activeProjectId ?? activeProject?.id;
      if (targetId == null) return prev;
      const current = prev[targetId] || {};
      const next = typeof updater === 'function' ? (updater as (p: ResultsMap) => ResultsMap)(current) : updater;
      return { ...prev, [targetId]: next };
    });
  }

  // Единая точка переключения активного проекта: сбрасывает любое локальное
  // состояние редактирования/анимаций предыдущего проекта, но СОХРАНЯЕТ
  // результаты расчётов (они хранятся отдельно по каждому проекту).
  function selectProject(id: number) {
    if (id === activeProjectId) return;
    setActiveProjectId(id);
    setEditSession({ moduleKey: null, originalProject: null, past: [], future: [] });
    setDataEditing({ production: false, robotics: false, risks: false, economics: false, full: false });
    setDataSaved({ production: true, robotics: true, risks: true, economics: true, full: true });
    setAnimatedSummary('');
    setCalculationSteps([]);
    setLoading(null);
  }

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

  // Сохраняем активный проект, чтобы восстановить его после перезагрузки.
  useEffect(() => {
    if (activeProjectId != null) {
      localStorage.setItem(ACTIVE_PROJECT_KEY, String(activeProjectId));
    }
  }, [activeProjectId]);

  // Сохраняем результаты расчётов по проектам.
  useEffect(() => {
    try {
      localStorage.setItem(RESULTS_KEY, JSON.stringify(resultsByProject));
    } catch {
      // localStorage может быть переполнен — не критично для работы.
    }
  }, [resultsByProject]);

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
      const data = await listProjects();

      if (Array.isArray(data) && data.length > 0) {
        setProjects(data);
        // Восстанавливаем ранее активный проект (state или localStorage),
        // и только если его нет в библиотеке — берём первый.
        setActiveProjectId((prev) => {
          if (prev != null && data.some((p: DbProject) => p.id === prev)) return prev;
          const stored = Number(localStorage.getItem(ACTIVE_PROJECT_KEY));
          if (Number.isFinite(stored) && data.some((p: DbProject) => p.id === stored)) return stored;
          return data[0].id;
        });
        return;
      }

      await createProjectFromData(initialProject, initialProject.name || 'Демо-проект инновационной модернизации', false);
    } catch {
      showToast('error', 'Не удалось загрузить библиотеку проектов. Проверь backend и API /api/projects.');
    }
  }

  async function fetchHistory() {
    try {
      const data = await getHistory();
      setHistoryItems(Array.isArray(data) ? data : []);
    } catch {
      // backend может быть ещё не запущен
    }
  }

  async function fetchComparisonScenarios() {
    try {
      const data = await listScenarios();
      setScenarios(Array.isArray(data) ? data : []);
    } catch {
      // ignore
    }
  }

  async function createProjectFromData(data: FullProjectRequest, name?: string, notify = true) {
    const created = await createProject({
      name: name || data.name || 'Проект инновационной модернизации',
      description: 'Проект, загруженный в библиотеку информационной системы',
      data,
    });
    setProjects((prev) => {
      const exists = prev.some((item) => item.id === created.id);
      return exists ? prev.map((item) => (item.id === created.id ? created : item)) : [created, ...prev];
    });
    setActiveProjectId(created.id);
    setResultsByProject((prev) => ({ ...prev, [created.id]: {} }));
    // Новый проект — сбрасываем возможную незавершённую сессию редактирования.
    setEditSession({ moduleKey: null, originalProject: null, past: [], future: [] });
    setDataEditing({ production: false, robotics: false, risks: false, economics: false, full: false });

    if (notify) showToast('success', 'Проект сохранён в базе данных.');
    return created as DbProject;
  }

  async function saveProject(projectId: number, nextData: FullProjectRequest, name?: string, description?: string | null) {
    const updated = await updateProject(projectId, {
      name: name || nextData.name || activeProject?.name || 'Проект инновационной модернизации',
      description: description ?? activeProject?.description ?? null,
      data: nextData,
    });
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

  // Применение результата ИИ-команды модуля: запись данных + подсветка с автогашением.
  function applyModuleAi(moduleKey: string, nextModuleData: any, highlight: AiHighlight) {
    updateActiveProject((prev) => ({ ...prev, [moduleKey]: nextModuleData }));
    setAiEditHighlight((prev) => ({ ...prev, [moduleKey]: highlight }));
    if (aiHighlightTimers.current[moduleKey]) {
      window.clearTimeout(aiHighlightTimers.current[moduleKey]);
    }
    aiHighlightTimers.current[moduleKey] = window.setTimeout(() => {
      setAiEditHighlight((prev) => ({ ...prev, [moduleKey]: null }));
    }, 5200);
  }

  function aiRowClass(moduleKey: string, name: string) {
    const h = aiEditHighlight[moduleKey];
    if (!h) return '';
    if (h.createdNames.includes(name)) return 'ai-row-created';
    if (h.changedNames.includes(name)) return 'ai-row-changed';
    return '';
  }

  function aiCellClass(moduleKey: string, name: string, field: string) {
    const h = aiEditHighlight[moduleKey];
    if (!h) return '';
    return (h.changedFieldsByName[name] || []).includes(field) ? 'ai-cell-changed' : '';
  }

  function aiBadge(moduleKey: string, name: string) {
    const h = aiEditHighlight[moduleKey];
    if (!h) return null;
    if (h.createdNames.includes(name)) {
      return <span className="ai-badge created" title="Создано ИИ-редактором">AI created</span>;
    }
    if (h.changedNames.includes(name)) {
      return <span className="ai-badge updated" title="Изменено ИИ-редактором">AI updated</span>;
    }
    return null;
  }

  async function deleteProject(projectId: number) {
    if (projects.length <= 1) {
      showToast('error', 'Нельзя удалить единственный проект в библиотеке.');
      return;
    }

    try {
      await apiDeleteProject(projectId);

      const nextProjects = projects.filter((item) => item.id !== projectId);
      setProjects(nextProjects);
      if (activeProjectId === projectId) setActiveProjectId(nextProjects[0]?.id || null);
      // Удаляем результаты удалённого проекта, остальные сохраняем.
      setResultsByProject((prev) => {
        const next = { ...prev };
        delete next[projectId];
        return next;
      });
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

  // Обновление метаданных проекта (название + описание) из редактора проекта.
  function updateProjectMeta(name: string, description: string | null) {
    if (!activeProject) return;
    const nextData = { ...activeProject.data, name };

    setProjects((prev) =>
      prev.map((item) =>
        item.id === activeProject.id
          ? { ...item, name, description, data: nextData, updated_at: new Date().toISOString() }
          : item,
      ),
    );

    saveProject(activeProject.id, nextData, name, description)
      .then(() => showToast('success', 'Сведения проекта обновлены.'))
      .catch(() => showToast('error', 'Не удалось сохранить сведения проекта.'));
  }

  // Сохранение данных одного модуля активного проекта (из редактора проекта).
  function saveModuleData(moduleKey: string, moduleData: any) {
    updateActiveProject((prev) => ({ ...prev, [moduleKey]: moduleData }));
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
      const data = await runCalculation(endpoint, payload);
      setActiveResults((prev) => ({ ...prev, [key]: data }));
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
    setActiveResults((prev) => {
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
    <div className={`shell ${sidebarOpen ? 'sidebar-open' : ''} ${sidebarSettled ? 'sidebar-settled' : ''}`}>
      <AmbientDecor />

      <Sidebar
        page={page}
        setPage={setPage}
        sidebarOpen={sidebarOpen}
        setSidebarOpen={toggleSidebar}
        onOpened={() => setSidebarSettled(true)}
        theme={theme}
        setTheme={setTheme}
        user={user}
        logout={logout}
      />

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
              setActiveProjectId={selectProject}
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
            aiPanel={
              <AiCommandPanel
                adapter={MODULE_ADAPTERS.production}
                moduleData={project.production}
                onApply={(next, highlight) => applyModuleAi('production', next, highlight)}
                showToast={showToast}
              />
            }
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
                      <tr key={index} className={aiRowClass('production', item.name)}>
                        <td><div className="ai-name-cell"><input value={item.name} onChange={(e) => updateProductionItem(index, 'name', e.target.value)} />{aiBadge('production', item.name)}</div></td>
                        <td className={aiCellClass('production', item.name, 'quantity')}>
                          <DecimalInput
                            value={item.quantity}
                            onChange={(value) => updateProductionItem(index, 'quantity', String(value))}
                          />
                        </td>

                        <td className={aiCellClass('production', item.name, 'setup_time')}>
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
            aiPanel={
              <AiCommandPanel
                adapter={MODULE_ADAPTERS.robotics}
                moduleData={project.robotics}
                onApply={(next, highlight) => applyModuleAi('robotics', next, highlight)}
                showToast={showToast}
              />
            }
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
                      <tr key={index} className={aiRowClass('robotics', item.name)}>
                        <td><div className="ai-name-cell"><input value={item.name} onChange={(e) => updateOperation(index, 'name', e.target.value)} />{aiBadge('robotics', item.name)}</div></td>
                        <td className={aiCellClass('robotics', item.name, 'top')}>
                          <DecimalInput
                            value={item.top}
                            onChange={(value) => updateOperation(index, 'top', String(value))}
                          />
                        </td>

                        <td className={aiCellClass('robotics', item.name, 'kz')}>
                          <DecimalInput
                            value={item.kz}
                            onChange={(value) => updateOperation(index, 'kz', String(value))}
                          />
                        </td>

                        <td className={aiCellClass('robotics', item.name, 'service_time')}>
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
            aiPanel={
              <AiCommandPanel
                adapter={MODULE_ADAPTERS.risks}
                moduleData={project.risks}
                onApply={(next, highlight) => applyModuleAi('risks', next, highlight)}
                showToast={showToast}
              />
            }
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
                      <div className={`strategy-card glass-soft ${aiRowClass('risks', strategy.name)}`} key={strategyIndex}>
                        <div className="strategy-head">
                          <strong>Стратегия {strategyIndex + 1}</strong>
                          <div className="ai-name-cell">
                            {aiBadge('risks', strategy.name)}
                            <button className="icon-button danger" onClick={() => removeStrategy(strategyIndex)}>×</button>
                          </div>
                        </div>
                        <div className="form-grid two">
                          <Field label="Название">
                            <input value={strategy.name} onChange={(e) => updateStrategy(strategyIndex, 'name', e.target.value)} />
                          </Field>
                          <Field label="Стоимость">
                            <div className={aiCellClass('risks', strategy.name, 'cost')}>
                              <DecimalInput
                                value={strategy.cost}
                                onChange={(value) => updateStrategy(strategyIndex, 'cost', value)}
                              />
                            </div>
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
            aiPanel={
              <AiCommandPanel
                adapter={MODULE_ADAPTERS.economics}
                moduleData={project.economics}
                onApply={(next, highlight) => applyModuleAi('economics', next, highlight)}
                showToast={showToast}
              />
            }
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
                    rows={project.economics.periods.map((period, index) => {
                      const periodName = `Год ${period.year}`;
                      return (
                      <tr key={index} className={aiRowClass('economics', periodName)}>
                        <td>
                          <div className="ai-name-cell">
                            <DecimalInput
                              value={period.year}
                              onChange={(value) => updatePeriod(index, 'year', String(value))}
                            />
                            {aiBadge('economics', periodName)}
                          </div>
                        </td>

                        <td className={aiCellClass('economics', periodName, 'inflow')}>
                          <DecimalInput
                            value={period.inflow}
                            onChange={(value) => updatePeriod(index, 'inflow', String(value))}
                          />
                        </td>

                        <td className={aiCellClass('economics', periodName, 'operating_costs')}>
                          <DecimalInput
                            value={period.operating_costs}
                            onChange={(value) => updatePeriod(index, 'operating_costs', String(value))}
                          />
                        </td>

                        <td className={aiCellClass('economics', periodName, 'risk_losses')}>
                          <DecimalInput
                            value={period.risk_losses}
                            onChange={(value) => updatePeriod(index, 'risk_losses', String(value))}
                          />
                        </td>

                        <td className={aiCellClass('economics', periodName, 'maintenance_costs')}>
                          <DecimalInput
                            value={period.maintenance_costs}
                            onChange={(value) => updatePeriod(index, 'maintenance_costs', String(value))}
                          />
                        </td>

                        <td className={aiCellClass('economics', periodName, 'additional_investment')}>
                          <DecimalInput
                            value={period.additional_investment || 0}
                            onChange={(value) => updatePeriod(index, 'additional_investment', String(value))}
                          />
                        </td>
                        <td><button className="icon-button danger" onClick={() => removePeriod(index)}>×</button></td>
                      </tr>
                      );
                    })}
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
              try {
                await apiDeleteScenario(id);
              } catch {
                showToast('error', 'Не удалось удалить сценарий.');
                return;
              }
              await fetchComparisonScenarios();
              showToast('success', 'Сценарий удалён из сравнения.');
            }}
          />
        )}

        {page === 'ai' && <AiPage showToast={showToast} />}

        {page === 'editor' && (
          <AiEditorPage
            key={activeProject?.id || 'no-project'}
            showToast={showToast}
            project={project}
            activeProjectName={activeProject?.name}
            onApplyModule={applyModuleAi}
          />
        )}

        {page === 'project-editor' && (
          <ProjectEditorPage
            key={activeProject?.id || 'no-project'}
            activeProject={activeProject}
            project={project}
            onSaveModule={saveModuleData}
            onSaveMeta={updateProjectMeta}
            onApplyModuleAi={applyModuleAi}
            showToast={showToast}
          />
        )}

        {page === 'profile' && user && (
          <ProfilePage
            user={user}
            refreshUser={refreshUser}
            logout={logout}
            theme={theme}
            setTheme={setTheme}
            showToast={showToast}
            projects={projects}
            scenarios={scenarios}
            historyItems={historyItems}
            goToProject={(id) => { selectProject(id); setPage('project-editor'); }}
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
