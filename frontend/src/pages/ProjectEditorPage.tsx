// Страница «Редактор проекта»: единое управление данными активного проекта.
// Метаданные проекта + вкладки модулей с редактируемыми таблицами (add/remove/
// edit, undo/redo, сохранение) и встроенным ИИ-редактором по выбранной вкладке.
import { useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Boxes, Activity, ShieldCheck, Sigma, Plus, Trash2, Save, Undo2, Redo2,
  Pencil, FolderOpen, CalendarDays, CheckCircle2, CircleDashed, Database,
} from 'lucide-react';
import AiCommandPanel from '../components/ai/AiCommandPanel';
import { MODULE_ADAPTERS, type ModuleType } from '../utils/moduleAdapters';
import type { AiHighlight } from '../utils/aiHighlight';
import type { FullProjectRequest } from '../types';
import './projectEditor.css';

type DbProjectLike = {
  id: number;
  name: string;
  description?: string | null;
  created_at?: string;
  updated_at?: string;
};

type Props = {
  activeProject?: DbProjectLike;
  project: FullProjectRequest;
  onSaveModule: (moduleKey: ModuleType, moduleData: any) => void;
  onSaveMeta: (name: string, description: string | null) => void;
  onApplyModuleAi: (moduleKey: string, next: any, highlight: AiHighlight) => void;
  showToast: (type: 'success' | 'error', message: string) => void;
};

type Col = { key: string; label: string; kind: 'text' | 'number' };
type ListSchema = {
  listKey: string;
  itemNoun: string;
  cols: Col[];
  newRow: (rows: any[]) => any;
  scalars: { key: string; label: string }[];
};

const TABS: { key: ModuleType; label: string; icon: any }[] = [
  { key: 'production', label: 'Производственная программа', icon: Boxes },
  { key: 'robotics', label: 'Роботизированные звенья', icon: Activity },
  { key: 'risks', label: 'Анализ рисков', icon: ShieldCheck },
  { key: 'economics', label: 'Экономика проекта', icon: Sigma },
];

const LIST_SCHEMA: Record<Exclude<ModuleType, 'risks'>, ListSchema> = {
  production: {
    listKey: 'items',
    itemNoun: 'изделие',
    cols: [
      { key: 'name', label: 'Наименование', kind: 'text' },
      { key: 'group', label: 'Группа', kind: 'text' },
      { key: 'quantity', label: 'Количество', kind: 'number' },
      { key: 'setup_time', label: 'Переналадка', kind: 'number' },
    ],
    newRow: () => ({ name: 'Новое изделие', group: '', quantity: 0, setup_time: 0, comment: '' }),
    scalars: [
      { key: 'time_fund', label: 'Фонд времени' },
      { key: 'takt', label: 'Такт' },
    ],
  },
  robotics: {
    listKey: 'operations',
    itemNoun: 'операцию',
    cols: [
      { key: 'name', label: 'Операция', kind: 'text' },
      { key: 'machine', label: 'Станок', kind: 'text' },
      { key: 'top', label: 'Опер. время (top)', kind: 'number' },
      { key: 'kz', label: 'Загрузка (kz)', kind: 'number' },
      { key: 'service_time', label: 'Обслуживание (to)', kind: 'number' },
    ],
    newRow: () => ({ name: 'Новая операция', machine: '', top: 0, kz: 0, service_time: 0, comment: '' }),
    scalars: [
      { key: 'max_machines_per_robot', label: 'Станков на робота' },
      { key: 'max_deviation', label: 'Макс. отклонение' },
    ],
  },
  economics: {
    listKey: 'periods',
    itemNoun: 'период',
    cols: [
      { key: 'year', label: 'Год', kind: 'number' },
      { key: 'inflow', label: 'Приток', kind: 'number' },
      { key: 'operating_costs', label: 'Опер. затраты', kind: 'number' },
      { key: 'risk_losses', label: 'Потери от рисков', kind: 'number' },
      { key: 'maintenance_costs', label: 'Обслуживание', kind: 'number' },
      { key: 'additional_investment', label: 'Доп. инвестиции', kind: 'number' },
    ],
    newRow: (rows) => ({
      year: (rows?.length || 0) + 1, inflow: 0, operating_costs: 0,
      risk_losses: 0, maintenance_costs: 0, additional_investment: 0,
    }),
    scalars: [
      { key: 'initial_investment', label: 'Нач. инвестиции' },
      { key: 'discount_rate', label: 'Ставка дисконтирования' },
    ],
  },
};

function toNum(raw: string): number {
  const v = Number(String(raw).replace(',', '.'));
  return Number.isNaN(v) ? 0 : v;
}

function fmtDate(value?: string) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleDateString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric' });
  } catch {
    return '—';
  }
}

export default function ProjectEditorPage({
  activeProject, project, onSaveModule, onSaveMeta, onApplyModuleAi, showToast,
}: Props) {
  const [tab, setTab] = useState<ModuleType>('production');

  // Локальная рабочая копия данных проекта. Компонент монтируется с key=projectId,
  // поэтому при смене активного проекта получает свежие данные автоматически.
  const [data, setData] = useState<FullProjectRequest>(() => structuredClone(project));
  const past = useRef<FullProjectRequest[]>([]);
  const future = useRef<FullProjectRequest[]>([]);
  const [, forceTick] = useState(0);
  const rerender = () => forceTick((n) => n + 1);

  // Редактирование метаданных проекта.
  const [editingMeta, setEditingMeta] = useState(false);
  const [metaName, setMetaName] = useState(activeProject?.name || project.name || '');
  const [metaDesc, setMetaDesc] = useState(activeProject?.description || '');

  function mutate(producer: (draft: FullProjectRequest) => void) {
    setData((prev) => {
      past.current = [...past.current, prev].slice(-80);
      future.current = [];
      const next = structuredClone(prev);
      producer(next);
      return next;
    });
  }

  function undo() {
    if (past.current.length === 0) return;
    setData((prev) => {
      const last = past.current[past.current.length - 1];
      past.current = past.current.slice(0, -1);
      future.current = [prev, ...future.current].slice(0, 80);
      return last;
    });
  }

  function redo() {
    if (future.current.length === 0) return;
    setData((prev) => {
      const next = future.current[0];
      future.current = future.current.slice(1);
      past.current = [...past.current, prev].slice(-80);
      return next;
    });
  }

  function saveTab() {
    onSaveModule(tab, (data as any)[tab]);
    showToast('success', `Раздел сохранён: ${TABS.find((t) => t.key === tab)?.label}.`);
  }

  // Применение ИИ-команды: пишем в локальную копию И сохраняем в активном проекте.
  function handleAiApply(next: any, highlight: AiHighlight) {
    mutate((draft) => { (draft as any)[tab] = next; });
    onApplyModuleAi(tab, next, highlight);
  }

  function saveMeta() {
    onSaveMeta(metaName.trim() || 'Проект инновационной модернизации', metaDesc.trim() || null);
    setEditingMeta(false);
  }

  const counts = useMemo(() => ({
    production: data.production?.items?.length || 0,
    robotics: data.robotics?.operations?.length || 0,
    risks: data.risks?.strategies?.length || 0,
    economics: data.economics?.periods?.length || 0,
  }), [data]);

  const filledModules = (['production', 'robotics', 'risks', 'economics'] as const)
    .filter((k) => counts[k] > 0).length;
  const completeness = Math.round((filledModules / 4) * 100);

  return (
    <div className="pe-shell">
      {/* --- Шапка проекта --- */}
      <motion.section
        className="pe-header glass"
        initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
      >
        <div className="pe-header-main">
          <div className="pe-header-top">
            <div className="pe-project-icon"><FolderOpen size={22} /></div>
            {editingMeta ? (
              <div className="pe-meta-edit">
                <input
                  className="pe-input pe-input-title"
                  value={metaName}
                  onChange={(e) => setMetaName(e.target.value)}
                  placeholder="Название проекта"
                />
                <textarea
                  className="pe-input pe-textarea"
                  value={metaDesc}
                  onChange={(e) => setMetaDesc(e.target.value)}
                  placeholder="Описание проекта"
                  rows={2}
                />
                <div className="pe-meta-actions">
                  <button className="button primary" onClick={saveMeta}><Save size={15} /> Сохранить</button>
                  <button className="button subtle" onClick={() => setEditingMeta(false)}>Отмена</button>
                </div>
              </div>
            ) : (
              <div className="pe-meta-view">
                <h2>{activeProject?.name || project.name || 'Без названия'}</h2>
                <p>{activeProject?.description || 'Описание не задано.'}</p>
                <button
                  className="button subtle pe-edit-meta-btn"
                  onClick={() => {
                    setMetaName(activeProject?.name || project.name || '');
                    setMetaDesc(activeProject?.description || '');
                    setEditingMeta(true);
                  }}
                >
                  <Pencil size={14} /> Редактировать сведения
                </button>
              </div>
            )}
          </div>

          <div className="pe-meta-grid">
            <div className="pe-meta-cell">
              <CalendarDays size={15} />
              <span>Создан</span>
              <strong>{fmtDate(activeProject?.created_at)}</strong>
            </div>
            <div className="pe-meta-cell">
              <CalendarDays size={15} />
              <span>Обновлён</span>
              <strong>{fmtDate(activeProject?.updated_at)}</strong>
            </div>
            <div className="pe-meta-cell">
              <Database size={15} />
              <span>Записей всего</span>
              <strong>{counts.production + counts.robotics + counts.risks + counts.economics}</strong>
            </div>
            <div className="pe-meta-cell">
              {completeness === 100 ? <CheckCircle2 size={15} /> : <CircleDashed size={15} />}
              <span>Полнота данных</span>
              <strong>{completeness}%</strong>
            </div>
          </div>
        </div>

        <div className="pe-module-counts">
          {TABS.map((t) => (
            <div key={t.key} className={`pe-count-chip ${counts[t.key] > 0 ? 'filled' : 'empty'}`}>
              <t.icon size={16} />
              <div>
                <strong>{counts[t.key]}</strong>
                <span>{t.label}</span>
              </div>
            </div>
          ))}
        </div>
      </motion.section>

      {/* --- Вкладки --- */}
      <div className="pe-tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`pe-tab ${tab === t.key ? 'active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            <t.icon size={16} /> {t.label}
            <span className="pe-tab-badge">{counts[t.key]}</span>
          </button>
        ))}
      </div>

      {/* --- Панель действий --- */}
      <div className="pe-toolbar glass-soft">
        <div className="pe-toolbar-left">
          <button className="button subtle" onClick={undo} disabled={past.current.length === 0} title="Отменить">
            <Undo2 size={15} /> Отменить
          </button>
          <button className="button subtle" onClick={redo} disabled={future.current.length === 0} title="Повторить">
            <Redo2 size={15} /> Повторить
          </button>
        </div>
        <button className="button primary" onClick={saveTab}>
          <Save size={15} /> Сохранить раздел
        </button>
      </div>

      {/* --- Таблица раздела --- */}
      <motion.div
        key={tab}
        className="pe-panel glass"
        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
      >
        {tab === 'risks' ? (
          <RisksEditor data={data} mutate={mutate} />
        ) : (
          <ListEditor schema={LIST_SCHEMA[tab]} module={(data as any)[tab]} mutate={mutate} moduleKey={tab} />
        )}
      </motion.div>

      {/* --- Встроенный ИИ-редактор по выбранной вкладке --- */}
      <div className="pe-ai">
        <div className="pe-ai-head">
          <span className="pe-ai-kicker">ИИ-редактор · {TABS.find((t) => t.key === tab)?.label}</span>
          <span className="pe-ai-hint">Команда применяется к данным выбранной вкладки активного проекта.</span>
        </div>
        <AiCommandPanel
          key={tab}
          adapter={MODULE_ADAPTERS[tab]}
          moduleData={(data as any)[tab]}
          onApply={handleAiApply}
          showToast={showToast}
        />
      </div>
    </div>
  );
}

// --- Универсальный редактор списочных модулей (production/robotics/economics) ---
function ListEditor({
  schema, module, mutate, moduleKey,
}: {
  schema: ListSchema;
  module: any;
  mutate: (producer: (draft: FullProjectRequest) => void) => void;
  moduleKey: ModuleType;
}) {
  const rows: any[] = module?.[schema.listKey] || [];

  return (
    <div className="pe-editor">
      <div className="pe-scalars">
        {schema.scalars.map((s) => (
          <label className="pe-scalar" key={s.key}>
            <span>{s.label}</span>
            <input
              className="pe-input"
              type="number"
              value={module?.[s.key] ?? 0}
              onChange={(e) => mutate((d) => { (d as any)[moduleKey][s.key] = toNum(e.target.value); })}
            />
          </label>
        ))}
      </div>

      {rows.length === 0 ? (
        <EmptyState noun={schema.itemNoun} />
      ) : (
        <div className="table-shell pe-table-shell">
          <table className="pe-table">
            <thead>
              <tr>
                {schema.cols.map((c) => <th key={c.key}>{c.label}</th>)}
                <th aria-label="actions" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i}>
                  {schema.cols.map((c) => (
                    <td key={c.key}>
                      <input
                        className="pe-input"
                        type={c.kind === 'number' ? 'number' : 'text'}
                        value={row[c.key] ?? (c.kind === 'number' ? 0 : '')}
                        onChange={(e) => mutate((d) => {
                          const list = (d as any)[moduleKey][schema.listKey];
                          list[i][c.key] = c.kind === 'number' ? toNum(e.target.value) : e.target.value;
                        })}
                      />
                    </td>
                  ))}
                  <td className="pe-row-actions">
                    <button
                      className="pe-icon-btn danger"
                      title="Удалить строку"
                      onClick={() => mutate((d) => {
                        (d as any)[moduleKey][schema.listKey].splice(i, 1);
                      })}
                    >
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <button
        className="button secondary pe-add-btn"
        onClick={() => mutate((d) => {
          const list = (d as any)[moduleKey][schema.listKey] || ((d as any)[moduleKey][schema.listKey] = []);
          list.push(schema.newRow(list));
        })}
      >
        <Plus size={15} /> Добавить {schema.itemNoun}
      </button>
    </div>
  );
}

// --- Редактор рисков: события + стратегии (стоимость + матрица рисков по событиям) ---
function RisksEditor({
  data, mutate,
}: {
  data: FullProjectRequest;
  mutate: (producer: (draft: FullProjectRequest) => void) => void;
}) {
  const risks: any = data.risks || {};
  const events: string[] = risks.events || [];
  const strategies: any[] = risks.strategies || [];

  return (
    <div className="pe-editor">
      <div className="pe-scalars">
        <label className="pe-scalar">
          <span>База потерь</span>
          <input className="pe-input" type="number" value={risks.base_loss ?? 0}
            onChange={(e) => mutate((d) => { (d as any).risks.base_loss = toNum(e.target.value); })} />
        </label>
        <label className="pe-scalar">
          <span>Порог рентабельности</span>
          <input className="pe-input" type="number" value={risks.profitability_threshold ?? 0}
            onChange={(e) => mutate((d) => { (d as any).risks.profitability_threshold = toNum(e.target.value); })} />
        </label>
      </div>

      {/* События риска */}
      <div className="pe-subsection">
        <div className="pe-subsection-head">
          <h4>Риск-события</h4>
          <button className="button secondary" onClick={() => mutate((d) => {
            const r: any = (d as any).risks;
            r.events = [...(r.events || []), `Событие ${(r.events?.length || 0) + 1}`];
            r.strategies = (r.strategies || []).map((s: any) => ({ ...s, risks: [...(s.risks || []), 0] }));
          })}>
            <Plus size={15} /> Добавить событие
          </button>
        </div>
        {events.length === 0 ? <EmptyState noun="событие" /> : (
          <div className="pe-events">
            {events.map((ev, i) => (
              <div className="pe-event-chip" key={i}>
                <input className="pe-input" value={ev}
                  onChange={(e) => mutate((d) => { (d as any).risks.events[i] = e.target.value; })} />
                <button className="pe-icon-btn danger" title="Удалить событие" onClick={() => mutate((d) => {
                  const r: any = (d as any).risks;
                  r.events.splice(i, 1);
                  r.strategies = (r.strategies || []).map((s: any) => {
                    const next = [...(s.risks || [])]; next.splice(i, 1); return { ...s, risks: next };
                  });
                })}>
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Стратегии */}
      <div className="pe-subsection">
        <div className="pe-subsection-head">
          <h4>Стратегии</h4>
          <button className="button secondary" onClick={() => mutate((d) => {
            const r: any = (d as any).risks;
            r.strategies = [...(r.strategies || []), {
              name: `S${(r.strategies?.length || 0) + 1}`, cost: 0, risks: (r.events || []).map(() => 0),
            }];
          })}>
            <Plus size={15} /> Добавить стратегию
          </button>
        </div>
        {strategies.length === 0 ? <EmptyState noun="стратегию" /> : (
          <div className="table-shell pe-table-shell">
            <table className="pe-table">
              <thead>
                <tr>
                  <th>Стратегия</th>
                  <th>Стоимость</th>
                  {events.map((ev, i) => <th key={i}>{ev || `Событие ${i + 1}`}</th>)}
                  <th aria-label="actions" />
                </tr>
              </thead>
              <tbody>
                {strategies.map((s, si) => (
                  <tr key={si}>
                    <td>
                      <input className="pe-input" value={s.name ?? ''}
                        onChange={(e) => mutate((d) => { (d as any).risks.strategies[si].name = e.target.value; })} />
                    </td>
                    <td>
                      <input className="pe-input" type="number" value={s.cost ?? 0}
                        onChange={(e) => mutate((d) => { (d as any).risks.strategies[si].cost = toNum(e.target.value); })} />
                    </td>
                    {events.map((_, ei) => (
                      <td key={ei}>
                        <input className="pe-input" type="number" value={s.risks?.[ei] ?? 0}
                          onChange={(e) => mutate((d) => {
                            const arr = (d as any).risks.strategies[si].risks || ((d as any).risks.strategies[si].risks = []);
                            arr[ei] = toNum(e.target.value);
                          })} />
                      </td>
                    ))}
                    <td className="pe-row-actions">
                      <button className="pe-icon-btn danger" title="Удалить стратегию"
                        onClick={() => mutate((d) => { (d as any).risks.strategies.splice(si, 1); })}>
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyState({ noun }: { noun: string }) {
  return (
    <div className="pe-empty glass-soft">
      <CircleDashed size={26} />
      <div>
        <strong>Пока нет данных</strong>
        <p>Добавьте {noun} вручную или примените ИИ-команду ниже.</p>
      </div>
    </div>
  );
}
