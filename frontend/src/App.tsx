
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

const API_BASE = import.meta.env.VITE_API_BASE || 'http://127.0.0.1:8000';

type Page = 'home' | 'dashboard' | 'production' | 'robotics' | 'risks' | 'economics' | 'full' | 'history';

type ToastState = { type: 'success' | 'error'; message: string } | null;

type ResultsMap = Record<string, any>;

const pageMeta: Record<Page, { title: string; description: string; icon: any }> = {

  home: {

    title: 'Информационная система поддержки проекта инновационной модернизации',

    description: 'Выпускная квалификационная работа Баранова М.В. Модульная система для расчёта производственной программы, роботизированных звеньев, рисков и экономической эффективности проекта.',

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
  history: {
    title: 'История расчётов',
    description: 'Журнал запусков, сохранённый в серверной части приложения.',
    icon: History,
  },
};

const initialProject = structuredClone(demoProject) as FullProjectRequest;

function formatValue(value: any) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'number') {
    return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value);
  }
  if (Array.isArray(value)) return value.join(', ');
  return String(value);
}

function parseNumber(value: string) {
  const normalized = value.replace(',', '.');
  const num = Number(normalized);
  return Number.isNaN(num) ? 0 : num;
}

function shallowClone<T>(obj: T): T {
  return structuredClone(obj);
}

export default function App() {
  const [page, setPage] = useState<Page>('home');
  const [project, setProject] = useState<FullProjectRequest>(initialProject);
  const [results, setResults] = useState<ResultsMap>({});
  const [historyItems, setHistoryItems] = useState<ApiHistoryItem[]>([]);
  const [loading, setLoading] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const [hintSeen, setHintSeen] = useState<Record<Page, boolean>>({
  home: true,
  dashboard: true,
  production: false,
  robotics: false,
  risks: false,
  economics: false,
  full: false,
  history: true,
});

  const productionJsonRef = useRef<HTMLTextAreaElement>(null);
  const roboticsJsonRef = useRef<HTMLTextAreaElement>(null);
  const risksJsonRef = useRef<HTMLTextAreaElement>(null);
  const economicsJsonRef = useRef<HTMLTextAreaElement>(null);
  const fullJsonRef = useRef<HTMLTextAreaElement>(null);

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
    fetchHistory();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(timer);
  }, [toast]);

  async function fetchHistory() {
    try {
      const response = await fetch(`${API_BASE}/api/history`);
      const data = await response.json();
      setHistoryItems(data);
    } catch {
      // ignore initial fail when backend not started
    }
  }

  function showToast(type: 'success' | 'error', message: string) {
    setToast({ type, message });
  }

  async function callApi<T>(endpoint: string, payload: unknown, key: string) {
    setLoading(key);
    try {
      const response = await fetch(`${API_BASE}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.detail?.[0]?.msg || errorData?.detail || 'Ошибка запроса');
      }
      const data = await response.json();
      setResults((prev) => ({ ...prev, [key]: data }));
      fetchHistory();
      showToast('success', 'Расчёт выполнен успешно.');
      if (page === 'dashboard') setPage(key as Page);
      return data;
    } catch (error: any) {
      showToast('error', error.message || 'Не удалось выполнить расчёт.');
      throw error;
    } finally {
      setLoading(null);
    }
  }

  function updateProductionField(field: keyof ProductionRequest, value: number) {
    setProject((prev) => ({ ...prev, production: { ...prev.production, [field]: value } }));
  }

  function updateProductionItem(index: number, field: keyof ProductionItem, value: string) {
    setProject((prev) => {
      const items = shallowClone(prev.production.items);
      (items[index] as any)[field] = ['quantity', 'setup_time'].includes(field) ? parseNumber(value) : value;
      return { ...prev, production: { ...prev.production, items } };
    });
  }

  function addProductionItem() {
    setProject((prev) => ({
      ...prev,
      production: {
        ...prev.production,
        items: [...prev.production.items, { name: '', quantity: 0, setup_time: 0, group: '', comment: '' }],
      },
    }));
  }

  function removeProductionItem(index: number) {
    setProject((prev) => ({
      ...prev,
      production: { ...prev.production, items: prev.production.items.filter((_, i) => i !== index) },
    }));
  }

  function updateRoboticsField(field: keyof Omit<RoboticsRequest, 'operations'>, value: number) {
    setProject((prev) => ({ ...prev, robotics: { ...prev.robotics, [field]: value } }));
  }

  function updateOperation(index: number, field: keyof RoboticOperation, value: string) {
    setProject((prev) => {
      const operations = shallowClone(prev.robotics.operations);
      (operations[index] as any)[field] = ['top', 'kz', 'service_time'].includes(field) ? parseNumber(value) : value;
      return { ...prev, robotics: { ...prev.robotics, operations } };
    });
  }

  function addOperation() {
    setProject((prev) => ({
      ...prev,
      robotics: {
        ...prev.robotics,
        operations: [...prev.robotics.operations, { name: '', top: 0, kz: 0, service_time: 0, machine: '', comment: '' }],
      },
    }));
  }

  function removeOperation(index: number) {
    setProject((prev) => ({
      ...prev,
      robotics: { ...prev.robotics, operations: prev.robotics.operations.filter((_, i) => i !== index) },
    }));
  }

  function updateRiskField(field: keyof Omit<RiskRequest, 'events' | 'strategies' | 'hurwicz_coefficients'>, value: number) {
    setProject((prev) => ({ ...prev, risks: { ...prev.risks, [field]: value } }));
  }

  function updateEvent(index: number, value: string) {
    setProject((prev) => {
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
    setProject((prev) => ({
      ...prev,
      risks: {
        ...prev.risks,
        events: [...prev.risks.events, `Событие ${prev.risks.events.length + 1}`],
        strategies: prev.risks.strategies.map((s) => ({ ...s, risks: [...s.risks, 0] })),
      },
    }));
  }

  function removeEvent(index: number) {
    setProject((prev) => ({
      ...prev,
      risks: {
        ...prev.risks,
        events: prev.risks.events.filter((_, i) => i !== index),
        strategies: prev.risks.strategies.map((s) => ({ ...s, risks: s.risks.filter((_, i) => i !== index) })),
      },
    }));
  }

  function updateStrategy(index: number, field: keyof RiskStrategy, value: any) {
    setProject((prev) => {
      const strategies = shallowClone(prev.risks.strategies);
      (strategies[index] as any)[field] = field === 'cost' ? Number(value) : value;
      return { ...prev, risks: { ...prev.risks, strategies } };
    });
  }

  function updateStrategyRisk(strategyIndex: number, eventIndex: number, value: string) {
    setProject((prev) => {
      const strategies = shallowClone(prev.risks.strategies);
      strategies[strategyIndex].risks[eventIndex] = parseNumber(value);
      return { ...prev, risks: { ...prev.risks, strategies } };
    });
  }

  function addStrategy() {
    setProject((prev) => ({
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
    setProject((prev) => ({
      ...prev,
      risks: { ...prev.risks, strategies: prev.risks.strategies.filter((_, i) => i !== index) },
    }));
  }

  function updateHurwicz(value: string) {
    const coefficients = value
      .split(',')
      .map((item) => parseNumber(item.trim()))
      .filter((item) => !Number.isNaN(item));
    setProject((prev) => ({ ...prev, risks: { ...prev.risks, hurwicz_coefficients: coefficients } }));
  }

  function updateEconomicsField(field: keyof Omit<EconomicsRequest, 'periods'>, value: number) {
    setProject((prev) => ({ ...prev, economics: { ...prev.economics, [field]: value } }));
  }

  function updatePeriod(index: number, field: keyof CashFlowPeriod, value: string) {
    setProject((prev) => {
      const periods = shallowClone(prev.economics.periods);
      (periods[index] as any)[field] = parseNumber(value);
      return { ...prev, economics: { ...prev.economics, periods } };
    });
  }

  function addPeriod() {
    setProject((prev) => ({
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
    setProject((prev) => ({
      ...prev,
      economics: { ...prev.economics, periods: prev.economics.periods.filter((_, i) => i !== index) },
    }));
  }

  function loadDemo() {
    setProject(structuredClone(demoProject));
    setResults({});
    showToast('success', 'Загружены демонстрационные данные.');
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
      if (currentPage === 'production') setProject((prev) => ({ ...prev, production: parsed }));
      if (currentPage === 'robotics') setProject((prev) => ({ ...prev, robotics: parsed }));
      if (currentPage === 'risks') setProject((prev) => ({ ...prev, risks: parsed }));
      if (currentPage === 'economics') setProject((prev) => ({ ...prev, economics: parsed }));
      if (currentPage === 'full') setProject(parsed);
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
        setProject((prev) => ({ ...prev, production: { ...prev.production, items } }));
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
        setProject((prev) => ({ ...prev, robotics: { ...prev.robotics, operations } }));
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
        setProject((prev) => ({ ...prev, economics: { ...prev.economics, periods } }));
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

const currentPageMeta = pageMeta[page];

  return (
    <div className="shell">
      <AmbientDecor />
      <aside className="sidebar glass">
        <div className="brand-block">
          <div className="brand-mark">BM</div>
          <div>
            <div className="brand-name">Modernization IS</div>
            <div className="brand-subtitle">ВКР Баранов М.В.</div>
          </div>
        </div>

        <nav className="menu">
          <NavButton page={page} setPage={setPage} value="home" icon={<Rocket size={18} />} label="Главная" />
          <NavButton page={page} setPage={setPage} value="dashboard" icon={<LayoutDashboard size={18} />} label="Дашборд" />
          <NavButton page={page} setPage={setPage} value="production" icon={<Boxes size={18} />} label="Производственная программа" />
          <NavButton page={page} setPage={setPage} value="robotics" icon={<Activity size={18} />} label="Роботизированные звенья" />
          <NavButton page={page} setPage={setPage} value="risks" icon={<ShieldCheck size={18} />} label="Анализ рисков" />
          <NavButton page={page} setPage={setPage} value="economics" icon={<Sigma size={18} />} label="Экономика проекта" />
          <NavButton page={page} setPage={setPage} value="full" icon={<Rocket size={18} />} label="Единый расчёт" />
          <NavButton page={page} setPage={setPage} value="history" icon={<History size={18} />} label="История" />
        </nav>

        <div className="sidebar-card glass-soft">
          <div className="sidebar-card-title">Тема ВКР</div>
          <p>Модульная информационная система поддержки проекта инновационной модернизации на основе оригинальных математических моделей.</p>
        </div>
      </aside>

      <main className="main-area">
        {page !== 'home' && (
        <motion.header
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="hero glass"
        >
          <div>
            <div className="eyebrow">Industrial Decision Support / React + FastAPI</div>
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
                <RefreshCw size={16} /> Демо-данные
              </button>

              <button className="button primary" onClick={() => setPage('full')}>
                <Rocket size={16} /> Комплексный расчёт
              </button>
            </div>
          </div>
        </motion.header>
      )}

        <section className="stats-grid">
          <StatCard title="NPV" value={summary.npv} hint="чистый дисконтированный доход" />
          <StatCard title="IRR, %" value={summary.irr} hint="внутренняя норма доходности" />
          <StatCard title="Загрузка фонда, %" value={summary.productionUtilization} hint="производственная программа" />
          <StatCard title="Загрузка робота, %" value={summary.robotLoad} hint="роботизированные звенья" />
          <StatCard title="Риск-стратегия" value={summary.strategy} hint="сводная рекомендация" />
          <StatCard title="Проект" value={summary.isEffective === undefined ? '—' : summary.isEffective ? 'Эффективен' : 'Под вопросом'} hint="итоговая интерпретация" />
        </section>

        {!hintSeen[page] && ['production', 'robotics', 'risks', 'economics', 'full'].includes(page) && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="hint-banner glass-soft">
            <div className="hint-left">
              <WandSparkles size={18} />
              <div>
                <strong>Подсказка по вводу данных.</strong>
                <div>Вы можете вводить показатели вручную, вставить готовый JSON или загрузить CSV/XLSX/JSON-файл.</div>
              </div>
            </div>
            <button className="button subtle" onClick={() => setHintSeen((prev) => ({ ...prev, [page]: true }))}>Понятно</button>
          </motion.div>
        )}
        {page === 'home' && <HomePage setPage={setPage} loadDemo={loadDemo} />}
        {page === 'dashboard' && <Dashboard project={project} results={results} setPage={setPage} />}

        {page === 'production' && (
          <Workbench
            left={
              <div className="stack-16">
                <SectionCard title="Параметры расчёта" icon={<TableProperties size={18} />}>
                  <div className="form-grid two">
                    <Field label="Фонд времени">
                      <input value={project.production.time_fund} onChange={(e) => updateProductionField('time_fund', parseNumber(e.target.value))} />
                    </Field>
                    <Field label="Такт оборудования">
                      <input value={project.production.takt} onChange={(e) => updateProductionField('takt', parseNumber(e.target.value))} />
                    </Field>
                  </div>
                </SectionCard>

                <SectionCard title="Состав изделий" icon={<Boxes size={18} />} actions={<button className="button secondary" onClick={addProductionItem}><Plus size={16} /> Добавить строку</button>}>
                  <DataTools onCopyJson={() => copyJsonForPage('production')} onApplyJson={() => applyJson('production', productionJsonRef.current?.value || '')} onImport={(file) => handleFileImport('production', file)} />
                  <textarea ref={productionJsonRef} className="json-box" defaultValue={JSON.stringify(project.production, null, 2)} />
                  <EditableTable
                    headers={['Изделие', 'Объём', 'Переналадка', 'Группа', 'Комментарий', '']}
                    rows={project.production.items.map((item, index) => (
                      <tr key={index}>
                        <td><input value={item.name} onChange={(e) => updateProductionItem(index, 'name', e.target.value)} /></td>
                        <td><input value={item.quantity} onChange={(e) => updateProductionItem(index, 'quantity', e.target.value)} /></td>
                        <td><input value={item.setup_time} onChange={(e) => updateProductionItem(index, 'setup_time', e.target.value)} /></td>
                        <td><input value={item.group || ''} onChange={(e) => updateProductionItem(index, 'group', e.target.value)} /></td>
                        <td><input value={item.comment || ''} onChange={(e) => updateProductionItem(index, 'comment', e.target.value)} /></td>
                        <td><button className="icon-button danger" onClick={() => removeProductionItem(index)}>×</button></td>
                      </tr>
                    ))}
                  />
                </SectionCard>
              </div>
            }
            right={
              <ResultPanel
                title="Результат модуля"
                loading={loading === 'production'}
                onRun={() => callApi('/api/production/calculate', project.production, 'production')}
                content={<RenderProduction result={results.production} />}
              />
            }
          />
        )}

        {page === 'robotics' && (
          <Workbench
            left={
              <div className="stack-16">
                <SectionCard title="Ограничения" icon={<Activity size={18} />}>
                  <div className="form-grid two">
                    <Field label="Максимум станков на робота">
                      <input value={project.robotics.max_machines_per_robot} onChange={(e) => updateRoboticsField('max_machines_per_robot', parseNumber(e.target.value))} />
                    </Field>
                    <Field label="Допустимое отклонение">
                      <input value={project.robotics.max_deviation} onChange={(e) => updateRoboticsField('max_deviation', parseNumber(e.target.value))} />
                    </Field>
                  </div>
                </SectionCard>
                <SectionCard title="Операции" icon={<Boxes size={18} />} actions={<button className="button secondary" onClick={addOperation}><Plus size={16} /> Добавить операцию</button>}>
                  <DataTools onCopyJson={() => copyJsonForPage('robotics')} onApplyJson={() => applyJson('robotics', roboticsJsonRef.current?.value || '')} onImport={(file) => handleFileImport('robotics', file)} />
                  <textarea ref={roboticsJsonRef} className="json-box" defaultValue={JSON.stringify(project.robotics, null, 2)} />
                  <EditableTable
                    headers={['Операция', 'top', 'kz', 'to', 'Станок', 'Комментарий', '']}
                    rows={project.robotics.operations.map((item, index) => (
                      <tr key={index}>
                        <td><input value={item.name} onChange={(e) => updateOperation(index, 'name', e.target.value)} /></td>
                        <td><input value={item.top} onChange={(e) => updateOperation(index, 'top', e.target.value)} /></td>
                        <td><input value={item.kz} onChange={(e) => updateOperation(index, 'kz', e.target.value)} /></td>
                        <td><input value={item.service_time} onChange={(e) => updateOperation(index, 'service_time', e.target.value)} /></td>
                        <td><input value={item.machine || ''} onChange={(e) => updateOperation(index, 'machine', e.target.value)} /></td>
                        <td><input value={item.comment || ''} onChange={(e) => updateOperation(index, 'comment', e.target.value)} /></td>
                        <td><button className="icon-button danger" onClick={() => removeOperation(index)}>×</button></td>
                      </tr>
                    ))}
                  />
                </SectionCard>
              </div>
            }
            right={
              <ResultPanel
                title="Результат модуля"
                loading={loading === 'robotics'}
                onRun={() => callApi('/api/robotics/calculate', project.robotics, 'robotics')}
                content={<RenderRobotics result={results.robotics} />}
              />
            }
          />
        )}

        {page === 'risks' && (
          <Workbench
            left={
              <div className="stack-16">
                <SectionCard title="Общие параметры" icon={<ShieldCheck size={18} />}>
                  <div className="form-grid two">
                    <Field label="База для расчёта упущенной выгоды">
                      <input value={project.risks.base_loss} onChange={(e) => updateRiskField('base_loss', parseNumber(e.target.value))} />
                    </Field>
                    <Field label="Порог рентабельности проекта">
                      <input value={project.risks.profitability_threshold} onChange={(e) => updateRiskField('profitability_threshold', parseNumber(e.target.value))} />
                    </Field>
                    <Field label="Коэффициенты Гурвица (через запятую)">
                      <input value={project.risks.hurwicz_coefficients.join(', ')} onChange={(e) => updateHurwicz(e.target.value)} />
                    </Field>
                  </div>
                </SectionCard>
                <SectionCard title="Риск-события" icon={<Database size={18} />} actions={<button className="button secondary" onClick={addEvent}><Plus size={16} /> Добавить событие</button>}>
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
                <SectionCard title="Стратегии риск-менеджмента" icon={<ShieldCheck size={18} />} actions={<button className="button secondary" onClick={addStrategy}><Plus size={16} /> Добавить стратегию</button>}>
                  <DataTools onCopyJson={() => copyJsonForPage('risks')} onApplyJson={() => applyJson('risks', risksJsonRef.current?.value || '')} onImport={(file) => handleFileImport('risks', file)} />
                  <textarea ref={risksJsonRef} className="json-box" defaultValue={JSON.stringify(project.risks, null, 2)} />
                  <div className="strategies-grid">
                    {project.risks.strategies.map((strategy, strategyIndex) => (
                      <div className="strategy-card glass-soft" key={strategyIndex}>
                        <div className="strategy-head">
                          <strong>Стратегия {strategyIndex + 1}</strong>
                          <button className="icon-button danger" onClick={() => removeStrategy(strategyIndex)}>×</button>
                        </div>
                        <div className="form-grid two">
                          <Field label="Название"><input value={strategy.name} onChange={(e) => updateStrategy(strategyIndex, 'name', e.target.value)} /></Field>
                          <Field label="Стоимость"><input value={strategy.cost} onChange={(e) => updateStrategy(strategyIndex, 'cost', parseNumber(e.target.value))} /></Field>
                        </div>
                        <EditableTable
                          headers={['Событие', 'Риск, %']}
                          rows={project.risks.events.map((event, eventIndex) => (
                            <tr key={eventIndex}>
                              <td>{event}</td>
                              <td><input value={strategy.risks[eventIndex]} onChange={(e) => updateStrategyRisk(strategyIndex, eventIndex, e.target.value)} /></td>
                            </tr>
                          ))}
                        />
                      </div>
                    ))}
                  </div>
                </SectionCard>
              </div>
            }
            right={
              <ResultPanel
                title="Результат модуля"
                loading={loading === 'risks'}
                onRun={() => callApi('/api/risks/calculate', project.risks, 'risks')}
                content={<RenderRisks result={results.risks} />}
              />
            }
          />
        )}

        {page === 'economics' && (
          <Workbench
            left={
              <div className="stack-16">
                <SectionCard title="Базовые параметры" icon={<Sigma size={18} />}>
                  <div className="form-grid two">
                    <Field label="Первоначальные инвестиции"><input value={project.economics.initial_investment} onChange={(e) => updateEconomicsField('initial_investment', parseNumber(e.target.value))} /></Field>
                    <Field label="Ставка дисконтирования, %"><input value={project.economics.discount_rate} onChange={(e) => updateEconomicsField('discount_rate', parseNumber(e.target.value))} /></Field>
                  </div>
                </SectionCard>
                <SectionCard title="Денежные потоки по периодам" icon={<BookOpenText size={18} />} actions={<button className="button secondary" onClick={addPeriod}><Plus size={16} /> Добавить период</button>}>
                  <DataTools onCopyJson={() => copyJsonForPage('economics')} onApplyJson={() => applyJson('economics', economicsJsonRef.current?.value || '')} onImport={(file) => handleFileImport('economics', file)} />
                  <textarea ref={economicsJsonRef} className="json-box" defaultValue={JSON.stringify(project.economics, null, 2)} />
                  <EditableTable
                    headers={['Год', 'Приток', 'Опер. затраты', 'Риск-потери', 'Обслуживание', 'Доп. инвестиции', '']}
                    rows={project.economics.periods.map((period, index) => (
                      <tr key={index}>
                        <td><input value={period.year} onChange={(e) => updatePeriod(index, 'year', e.target.value)} /></td>
                        <td><input value={period.inflow} onChange={(e) => updatePeriod(index, 'inflow', e.target.value)} /></td>
                        <td><input value={period.operating_costs} onChange={(e) => updatePeriod(index, 'operating_costs', e.target.value)} /></td>
                        <td><input value={period.risk_losses} onChange={(e) => updatePeriod(index, 'risk_losses', e.target.value)} /></td>
                        <td><input value={period.maintenance_costs} onChange={(e) => updatePeriod(index, 'maintenance_costs', e.target.value)} /></td>
                        <td><input value={period.additional_investment || 0} onChange={(e) => updatePeriod(index, 'additional_investment', e.target.value)} /></td>
                        <td><button className="icon-button danger" onClick={() => removePeriod(index)}>×</button></td>
                      </tr>
                    ))}
                  />
                </SectionCard>
              </div>
            }
            right={
              <ResultPanel
                title="Результат модуля"
                loading={loading === 'economics'}
                onRun={() => callApi('/api/economics/calculate', project.economics, 'economics')}
                content={<RenderEconomics result={results.economics} />}
              />
            }
          />
        )}

        {page === 'full' && (
          <Workbench
            left={
              <SectionCard title="Комплексный JSON проекта" icon={<FolderOpen size={18} />}>
                <DataTools onCopyJson={() => copyJsonForPage('full')} onApplyJson={() => applyJson('full', fullJsonRef.current?.value || '')} onImport={(file) => handleFileImport('full', file)} />
                <textarea ref={fullJsonRef} className="json-box tall" defaultValue={JSON.stringify(project, null, 2)} />
              </SectionCard>
            }
            right={
              <ResultPanel
                title="Сводный результат"
                loading={loading === 'full'}
                onRun={() => callApi('/api/full-project/calculate', project, 'full')}
                content={<RenderFull result={results.full} />}
              />
            }
          />
        )}

        {page === 'history' && (
          <div className="history-layout">
            <SectionCard title="Журнал расчётов" icon={<History size={18} />} actions={<button className="button secondary" onClick={exportHistoryJson}><FileDown size={16} /> Экспорт JSON</button>}>
              <div className="history-list">
                {historyItems.length === 0 && <div className="empty-result">История пока пуста.</div>}
                {historyItems.map((item) => (
                  <div className="history-item glass-soft" key={item.id}>
                    <div className="history-row">
                      <strong>{item.module}</strong>
                      <span>{new Date(item.created_at).toLocaleString('ru-RU')}</span>
                    </div>
                    <details>
                      <summary>Показать входные и выходные данные</summary>
                      <div className="history-json-grid">
                        <pre>{JSON.stringify(item.input_data, null, 2)}</pre>
                        <pre>{JSON.stringify(item.output_data, null, 2)}</pre>
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

function NavButton({ page, setPage, value, icon, label }: any) {
  return (
    <button className={`nav-button ${page === value ? 'active' : ''}`} onClick={() => setPage(value)}>
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

function HomePage({ setPage, loadDemo }: { setPage: (page: Page) => void; loadDemo: () => void }) {
  const modules = [
    {
      title: 'Производственная программа',
      text: 'Формирование квазиоптимального порядка выпуска изделий с учётом фонда времени, такта оборудования и переналадок.',
      action: 'Открыть модуль',
      page: 'production' as Page,
    },
    {
      title: 'Роботизированные звенья',
      text: 'Моделирование состава роботизированных производственных звеньев на основе параметров операций и ограничений обслуживания.',
      action: 'Перейти к расчёту',
      page: 'robotics' as Page,
    },
    {
      title: 'Анализ рисков',
      text: 'Выбор стратегии риск-менеджмента по критериям Вальда, Сэвиджа и Гурвица.',
      action: 'Анализировать риски',
      page: 'risks' as Page,
    },
    {
      title: 'Экономическая эффективность',
      text: 'Расчёт NPV, IRR, ROI, индекса доходности и срока окупаемости проекта инновационной модернизации.',
      action: 'Посчитать экономику',
      page: 'economics' as Page,
    },
  ];

  return (
    <div className="home-page">
      <section className="home-hero-clean">
        <div className="home-logo-row">
          <div className="home-logo-mark">IM</div>
          <div>
            <div className="home-small-label">Выпускная квалификационная работа</div>
            <div className="home-author">Баранов М.В.</div>
          </div>
        </div>

        <div className="home-hero-grid">
          <div>
            <div className="home-kicker">Industrial modernization / decision support system</div>
            <h1>
              Модульная система для расчёта проекта инновационной модернизации
            </h1>
            <p>
              Веб-приложение объединяет расчёт производственной программы, моделирование роботизированных звеньев,
              анализ рисков и оценку экономической эффективности в единую информационную систему поддержки принятия решений.
            </p>

            <div className="home-actions">
              <button className="home-main-button" onClick={() => setPage('full')}>
                Попробовать проект
              </button>
              <button className="home-outline-button" onClick={() => setPage('dashboard')}>
                Перейти в дашборд
              </button>
              <button className="home-outline-button" onClick={loadDemo}>
                Загрузить демо
              </button>
            </div>
          </div>

          <div className="home-visual-card">
            <div className="home-visual-line one" />
            <div className="home-visual-line two" />
            <div className="home-visual-line three" />
            <div className="home-visual-content">
              <span>NPV</span>
              <strong>+300 млн ₽</strong>
              <p>пример интегральной оценки проекта модернизации</p>
            </div>
          </div>
        </div>
      </section>

      <section className="home-section">
        <div className="home-section-head">
          <span>Расчётные модули</span>
          <h2>Четыре алгоритмических блока в одной системе</h2>
        </div>

        <div className="home-module-grid">
          {modules.map((module, index) => (
            <button className="home-module-card" key={module.title} onClick={() => setPage(module.page)}>
              <div className="home-module-number">{String(index + 1).padStart(2, '0')}</div>
              <h3>{module.title}</h3>
              <p>{module.text}</p>
              <strong>{module.action}</strong>
            </button>
          ))}
        </div>
      </section>

      <section className="home-wide-block">
        <div>
          <span>Как работает система</span>
          <h2>От исходных данных до итогового управленческого решения</h2>
        </div>

        <div className="home-steps">
          <div>
            <b>01</b>
            <p>Пользователь вводит данные вручную, вставляет JSON или загружает таблицу CSV/XLSX.</p>
          </div>
          <div>
            <b>02</b>
            <p>Backend на FastAPI передаёт данные в расчётные модули Python.</p>
          </div>
          <div>
            <b>03</b>
            <p>Система формирует таблицы, показатели, рекомендации и сохраняет историю расчётов.</p>
          </div>
        </div>
      </section>
    </div>
  );
}

function Dashboard({ project, results, setPage }: any) {
  const moduleCards = [
    { key: 'production', title: 'Производственная программа', desc: 'Квазиоптимальный порядок выпуска и использование фонда времени.', icon: <Boxes size={18} /> },
    { key: 'robotics', title: 'Роботизированные звенья', desc: 'Формирование комплектов операций и оценка загрузки роботов.', icon: <Activity size={18} /> },
    { key: 'risks', title: 'Анализ рисков', desc: 'Матрицы выигрышей, сожалений и выбор стратегий.', icon: <ShieldCheck size={18} /> },
    { key: 'economics', title: 'Экономика', desc: 'NPV, IRR, ROI, PI и окупаемость проекта.', icon: <Sigma size={18} /> },
  ];

  return (
    <div className="dashboard-layout">
      <SectionCard title="Паспорт проекта" icon={<BriefcaseBusiness size={18} />}>
        <div className="passport-grid">
          <Metric label="Название проекта" value={project.name} />
          <Metric label="Автор" value="Баранов М.В." />
          <Metric label="Назначение" value="Поддержка принятия решений по инновационной модернизации" />
          <Metric label="Технологический стек" value="React + FastAPI" />
        </div>
      </SectionCard>

      <div className="module-grid">
        {moduleCards.map((card) => (
          <motion.div key={card.key} whileHover={{ y: -6 }} className="module-card glass-soft">
            <div className="module-card-icon">{card.icon}</div>
            <div>
              <h3>{card.title}</h3>
              <p>{card.desc}</p>
            </div>
            <div className="module-actions">
              <button className="button subtle" onClick={() => setPage(card.key)}>Открыть</button>
              <div className="status-mini">{results[card.key] ? 'Есть результат' : 'Ожидает расчёт'}</div>
            </div>
          </motion.div>
        ))}
      </div>

      <SectionCard title="Архитектурные особенности" icon={<ArrowUpRight size={18} />}>
        <div className="feature-grid">
          <Feature icon={<Import size={18} />} title="Гибкий ввод данных" text="Ручной ввод, JSON-вставка и импорт из CSV/XLSX." />
          <Feature icon={<Database size={18} />} title="Единое расчётное ядро" text="Все алгоритмы вынесены в backend и доступны через REST API." />
          <Feature icon={<History size={18} />} title="История расчётов" text="Каждый запуск сохраняется и доступен для последующего анализа." />
          <Feature icon={<FileSpreadsheet size={18} />} title="Индустриальный интерфейс" text="Компоновка адаптирована под большие таблицы и длинные результаты." />
        </div>
      </SectionCard>
    </div>
  );
}

function SectionCard({ title, icon, children, actions }: any) {
  return (
    <section className="section-card glass">
      <div className="section-head">
        <div className="section-title-wrap">
          <div className="section-icon">{icon}</div>
          <h2>{title}</h2>
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

function Workbench({ left, right }: any) {
  return <div className="workbench">{left}{right}</div>;
}

function Field({ label, children }: any) {
  return <label className="field"><span>{label}</span>{children}</label>;
}

function Metric({ label, value }: { label: string; value: any }) {
  return (
    <div className="metric glass-soft">
      <div className="metric-label">{label}</div>
      <div className="metric-value">{formatValue(value)}</div>
    </div>
  );
}

function Feature({ icon, title, text }: any) {
  return (
    <div className="feature glass-soft">
      <div className="feature-icon">{icon}</div>
      <div>
        <strong>{title}</strong>
        <p>{text}</p>
      </div>
    </div>
  );
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
  return (
    <div className="table-shell">
      <table>
        <thead>
          <tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr>
        </thead>
        <tbody>{rows}</tbody>
      </table>
    </div>
  );
}

function ResultPanel({ title, loading, onRun, content }: any) {
  return (
    <section className="result-panel glass">
      <div className="section-head">
        <div className="section-title-wrap">
          <div className="section-icon"><Rocket size={18} /></div>
          <h2>{title}</h2>
        </div>
        <button className="button primary" onClick={onRun} disabled={loading}>
          {loading ? <LoaderCircle size={16} className="spin" /> : <Rocket size={16} />} {loading ? 'Расчёт...' : 'Запустить расчёт'}
        </button>
      </div>
      <div className="result-scroll">{content}</div>
    </section>
  );
}

function RenderProduction({ result }: { result: any }) {
  if (!result) return <div className="empty-result">Запустите модуль, чтобы увидеть результат.</div>;
  return (
    <div className="result-stack">
      <Interpretation text={result.interpretation} />
      <div className="passport-grid compact">
        <Metric label="Использовано фонда" value={result.used_time} />
        <Metric label="Остаток фонда" value={result.remaining_time} />
        <Metric label="Загрузка, %" value={result.utilization_percent} />
      </div>
      <h3>Включённые позиции</h3>
      <SimpleTable rows={result.sequence} />
      <h3>Не включено</h3>
      <SimpleTable rows={result.excluded_items} />
    </div>
  );
}

function RenderRobotics({ result }: { result: any }) {
  if (!result) return <div className="empty-result">Запустите модуль, чтобы увидеть результат.</div>;
  return (
    <div className="result-stack">
      <Interpretation text={result.interpretation} />
      <div className="passport-grid compact">
        <Metric label="Количество звеньев" value={result.links_count} />
        <Metric label="Средняя загрузка, %" value={result.average_robot_load_percent} />
      </div>
      {result.links?.map((link: any) => (
        <div key={link.link_number} className="result-card-sub glass-soft">
          <div className="result-card-head">
            <strong>Комплект {link.link_number}</strong>
            <span>{link.assessment}</span>
          </div>
          <div className="passport-grid compact">
            <Metric label="d" value={link.d} />
            <Metric label="Krob" value={link.robot_load_factor} />
            <Metric label="Загрузка, %" value={link.robot_load_percent} />
            <Metric label="m" value={link.machines_count} />
          </div>
          <SimpleTable rows={link.operations} />
        </div>
      ))}
      <h3>Невключённые операции</h3>
      <SimpleTable rows={result.unassigned_operations} />
    </div>
  );
}

function RenderRisks({ result }: { result: any }) {
  if (!result) return <div className="empty-result">Запустите модуль, чтобы увидеть результат.</div>;
  return (
    <div className="result-stack">
      <Interpretation text={result.interpretation} />
      <div className="passport-grid compact">
        <Metric label="Рекомендуемая стратегия" value={result.criteria?.recommended_strategy} />
        <Metric label="Сэвидж" value={result.criteria?.savage_minimax_regret?.join(', ')} />
        <Metric label="Вальд" value={result.criteria?.wald_maximin_pessimism?.join(', ')} />
        <Metric label="Maximax" value={result.criteria?.maximax_optimism?.join(', ')} />
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

function RenderEconomics({ result }: { result: any }) {
  if (!result) return <div className="empty-result">Запустите модуль, чтобы увидеть результат.</div>;
  return (
    <div className="result-stack">
      <Interpretation text={result.interpretation} />
      <div className="passport-grid compact">
        <Metric label="NPV" value={result.npv} />
        <Metric label="IRR, %" value={result.irr_percent} />
        <Metric label="ROI, %" value={result.roi_percent} />
        <Metric label="PI" value={result.profitability_index} />
        <Metric label="Окупаемость" value={result.discounted_payback_period_years} />
        <Metric label="Эффективность" value={result.is_effective ? 'Да' : 'Нет'} />
      </div>
      <h3>Денежные потоки</h3>
      <SimpleTable rows={result.flows} />
      <h3>Чувствительность</h3>
      <SimpleTable rows={[result.sensitivity]} />
    </div>
  );
}

function RenderFull({ result }: { result: any }) {
  if (!result) return <div className="empty-result">Запустите модуль, чтобы увидеть сводку по проекту.</div>;
  return (
    <div className="result-stack">
      <Interpretation text={`Единый расчёт проекта «${result.project_name}» выполнен.`} />
      <div className="passport-grid compact">
        <Metric label="NPV" value={result.summary?.npv} />
        <Metric label="IRR, %" value={result.summary?.irr_percent} />
        <Metric label="Окупаемость" value={result.summary?.payback} />
        <Metric label="Риск-стратегия" value={result.summary?.recommended_risk_strategy} />
        <Metric label="Загрузка фонда, %" value={result.summary?.production_utilization_percent} />
        <Metric label="Загрузка робота, %" value={result.summary?.average_robot_load_percent} />
      </div>
      <RenderProduction result={result.modules?.production} />
      <RenderRobotics result={result.modules?.robotics} />
      <RenderRisks result={result.modules?.risks} />
      <RenderEconomics result={result.modules?.economics} />
    </div>
  );
}

function Interpretation({ text }: { text: string }) {
  return <div className="interpretation glass-soft">{text}</div>;
}

function SimpleTable({ rows }: { rows?: any[] }) {
  if (!rows || rows.length === 0) return <div className="empty-result">Нет данных для отображения.</div>;
  const columns = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  return (
    <div className="table-shell">
      <table>
        <thead>
          <tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>
              {columns.map((column) => <td key={column}>{formatValue(row[column])}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
