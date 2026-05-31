import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  WandSparkles, Sparkles, LoaderCircle, CircleCheckBig,
  ShieldAlert, ArrowRight, Copy, Plus, ChevronDown, BrainCircuit,
} from 'lucide-react';
import { useAiCommandEditor } from '../../hooks/useAiCommandEditor';
import type { ModuleAdapter } from '../../utils/moduleAdapters';
import type { AiHighlight } from '../../utils/aiHighlight';
import './aiCommandPanel.css';

const INTENT_LABELS: Record<string, string> = {
  update_parameter: 'Изменение параметра',
  set_parameter: 'Установка значения',
  create_items: 'Создание позиций',
  copy_items: 'Копирование объектов',
  multi_set_parameter: 'Индивидуальные значения',
  unknown: 'Не распознано',
};

const ACTION_LABELS: Record<string, string> = {
  increase: 'Увеличить', decrease: 'Уменьшить', set: 'Установить',
  create: 'Создать', copy: 'Копировать', set_multiple: 'Назначить по объектам', none: '—',
};

const PARAM_LABELS: Record<string, string> = {
  setup_time: 'Время переналадки', quantity: 'Количество', takt: 'Такт',
  top: 'Оперативное время', kz: 'Коэффициент загрузки', service_time: 'Время обслуживания',
  cost: 'Стоимость', section: 'Сечение', inflow: 'Приток',
  operating_costs: 'Эксплуатационные затраты', risk_losses: 'Потери от рисков',
  maintenance_costs: 'Затраты на обслуживание', additional_investment: 'Доп. инвестиции',
};

function fmt(value: any) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'number') return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value);
  return String(value);
}

function tierOf(confidence: number): 'high' | 'medium' | 'low' {
  if (confidence >= 0.8) return 'high';
  if (confidence >= 0.55) return 'medium';
  return 'low';
}

type Props = {
  adapter: ModuleAdapter;
  moduleData: any;
  onApply: (newModuleData: any, highlight: AiHighlight) => void;
  showToast: (type: 'success' | 'error', message: string) => void;
};

export default function AiCommandPanel({ adapter, moduleData, onApply, showToast }: Props) {
  const [open, setOpen] = useState(true);
  const {
    command, setCommand, parseResult, applyResult, parsing, applying,
    recognize, applyCurated,
  } = useAiCommandEditor({ adapter, moduleData, onApply, showToast });
  const [focused, setFocused] = useState(false);

  // Черновик изменений: пользователь может отключать строки и править значения.
  type Draft = {
    action?: string; record: string; group?: string | null; parameter?: string | null;
    old_value: number | null; new_value: number | null; source?: string; include: boolean;
  };
  const [draft, setDraft] = useState<Draft[]>([]);

  useEffect(() => {
    if (parseResult?.preview_changes) {
      setDraft(parseResult.preview_changes.map((c) => ({ ...c, include: true })));
    } else {
      setDraft([]);
    }
  }, [parseResult]);

  const parsed = parseResult?.parsed_command;
  const tier = parsed ? tierOf(parsed.confidence) : 'high';
  const includedCount = draft.filter((d) => d.include).length;

  // --- Кинематографичная анимация распознавания ---
  const ANALYZE_STAGES = [
    'Анализ команды',
    'Классификация намерения',
    'Извлечение параметров и значений',
    'Сопоставление с записями',
    'Формирование предпросмотра',
  ];
  const [analyzing, setAnalyzing] = useState(false);
  const [stage, setStage] = useState(0);
  const [showResult, setShowResult] = useState(false);

  function handleRecognize() {
    if (!command.trim()) return;
    setShowResult(false);
    setStage(0);
    setAnalyzing(true);
    recognize();
  }

  // Поэтапное продвижение индикатора распознавания.
  useEffect(() => {
    if (!analyzing) return;
    if (stage < ANALYZE_STAGES.length) {
      const id = window.setTimeout(() => setStage((s) => s + 1), stage === 0 ? 260 : 360);
      return () => window.clearTimeout(id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analyzing, stage]);

  // Reveal результата: после завершения этапов и получения ответа модели.
  useEffect(() => {
    if (analyzing && stage >= ANALYZE_STAGES.length && parseResult) {
      const id = window.setTimeout(() => {
        setAnalyzing(false);
        setShowResult(true);
      }, 240);
      return () => window.clearTimeout(id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analyzing, stage, parseResult]);

  // Прерывание, если распознавание завершилось ошибкой (нет результата).
  useEffect(() => {
    if (analyzing && stage >= ANALYZE_STAGES.length && !parsing && !parseResult) {
      setAnalyzing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analyzing, stage, parsing, parseResult]);

  function toggleDraft(index: number) {
    setDraft((prev) => prev.map((d, i) => (i === index ? { ...d, include: !d.include } : d)));
  }
  function editDraftValue(index: number, raw: string) {
    const value = raw === '' ? null : Number(raw.replace(',', '.'));
    setDraft((prev) => prev.map((d, i) => (i === index ? { ...d, new_value: Number.isNaN(value as number) ? d.new_value : value } : d)));
  }
  function applyDraft() {
    const curated = draft
      .filter((d) => d.include)
      .map((d) => ({ action: d.action, record: d.record, parameter: d.parameter, new_value: d.new_value, source: d.source }));
    applyCurated(curated, parsed?.source_object ?? null);
  }

  return (
    <div className="aicmd-wrap glass">
      <button className="aicmd-toggle" onClick={() => setOpen((v) => !v)}>
        <span className="aicmd-toggle-left">
          <span className="aicmd-icon"><WandSparkles size={18} /></span>
          <span>
            <strong>ИИ-редактор данных</strong>
            <span className="aicmd-subtitle">{adapter.description}</span>
          </span>
        </span>
        <ChevronDown size={20} className={`aicmd-chev ${open ? 'open' : ''}`} />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            className="aicmd-body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.35, ease: 'easeInOut' }}
          >
            <div className="aicmd-inner">
              <div className={`nlu-textarea-wrap ${focused ? 'focused' : ''}`}>
                <div className="nlu-textarea-glow" />
                <textarea
                  className="nlu-textarea aicmd-textarea"
                  value={command}
                  placeholder={adapter.placeholder}
                  onChange={(e) => setCommand(e.target.value)}
                  onFocus={() => setFocused(true)}
                  onBlur={() => setFocused(false)}
                />
              </div>

              <div className="nlu-examples">
                <span className="nlu-examples-label">Примеры для модуля:</span>
                <div className="nlu-examples-chips">
                  {adapter.examples.map((example) => (
                    <button key={example} className="nlu-example-chip" onClick={() => setCommand(example)} title={example}>
                      {example.length > 44 ? `${example.slice(0, 42)}…` : example}
                    </button>
                  ))}
                </div>
              </div>

              <div className="nlu-actions-row">
                <div className={`aicmd-btn-wrap ${analyzing ? 'analyzing' : ''}`}>
                  <button
                    className="button primary nlu-recognize-btn aicmd-recognize"
                    onClick={handleRecognize}
                    disabled={analyzing || !command.trim()}
                  >
                    {analyzing ? <BrainCircuit size={16} className="aicmd-brain-pulse" /> : <WandSparkles size={16} />}
                    <span className="aicmd-btn-label">
                      {analyzing ? `${ANALYZE_STAGES[Math.min(stage, ANALYZE_STAGES.length - 1)]}…` : 'Распознать'}
                    </span>
                  </button>
                </div>
                {analyzing && (
                  <div className="aicmd-mini-progress">
                    {ANALYZE_STAGES.map((_, i) => (
                      <span key={i} className={`aicmd-pip ${stage > i ? 'done' : stage === i ? 'active' : ''}`} />
                    ))}
                  </div>
                )}
              </div>

              <AnimatePresence>
                {parsed && showResult && (
                  <motion.div
                    className="aicmd-recognized"
                    initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  >
                    <div className="aicmd-section-title"><Sparkles size={16} /> Распознанное действие</div>
                    <div className="nlu-chips">
                      <ChipItem label="Намерение" value={INTENT_LABELS[parsed.intent] || parsed.intent} i={0} />
                      <ChipItem label="Действие" value={ACTION_LABELS[parsed.action] || parsed.action} i={1} />
                      {parsed.target_group && <ChipItem label="Объект" value={parsed.target_group} i={2} />}
                      {parsed.object_name && <ChipItem label="Запись" value={parsed.object_name} i={3} />}
                      {parsed.source_object && <ChipItem label="Источник" value={parsed.source_object} i={3} />}
                      {parsed.count !== null && <ChipItem label="Количество" value={String(parsed.count)} i={4} />}
                      {parsed.parameter && <ChipItem label="Параметр" value={PARAM_LABELS[parsed.parameter] || parsed.parameter} i={5} />}
                      {parsed.value !== null && parsed.intent !== 'create_items' && parsed.intent !== 'copy_items' && (
                        <ChipItem label="Значение" value={String(parsed.value)} i={6} />
                      )}
                      <motion.span
                        className={`nlu-chip nlu-chip-conf tier-${tier}`}
                        initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.42 }}
                      >
                        <span className="nlu-chip-key">Уверенность</span>
                        <span className="nlu-chip-val">{Math.round(parsed.confidence * 100)}%</span>
                      </motion.span>
                    </div>

                    {parsed.intent === 'show_items' && (
                      <div className="aicmd-found">
                        <div className="aicmd-preview-title">{parseResult?.message}</div>
                        <div className="aicmd-found-chips">
                          {(parseResult?.found_records || []).map((name) => (
                            <span className="aicmd-found-chip" key={name}>{name}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {parsed.assignments && parsed.assignments.length > 0 && (
                      <div className="nlu-assign-chips">
                        {parsed.assignments.map((a) => (
                          <span className="nlu-assign-chip" key={a.object_name}>
                            <b>{a.object_name}</b><ArrowRight size={13} />{String(a.value)}
                          </span>
                        ))}
                      </div>
                    )}

                    {parseResult && parseResult.warnings.length > 0 && (
                      <div className={`nlu-alert ${parseResult.can_apply ? 'warn' : 'error'}`}>
                        <ShieldAlert size={18} />
                        <div>{parseResult.warnings.map((w, i) => <div key={i}>{w}</div>)}</div>
                      </div>
                    )}

                    {parsed.missing_objects && parsed.missing_objects.length > 0 && (
                      <div className="nlu-alert error">
                        <ShieldAlert size={18} />
                        <div><strong>Объекты не найдены:</strong> {parsed.missing_objects.join(', ')}.</div>
                      </div>
                    )}

                    {parseResult?.needs_confirmation && (
                      <div className="nlu-alert confirm">
                        <ShieldAlert size={18} />
                        <div>Команда затрагивает большое число записей. Требуется подтверждение.</div>
                      </div>
                    )}

                    {parsed.intent === 'copy_items' && draft.length > 0 && (
                      <div className="aicmd-preview">
                        <div className="aicmd-preview-title">Создаваемые копии · выбрано {includedCount} из {draft.length}</div>
                        {parsed.source_object && (
                          <div className="nlu-source-card glass-soft">
                            <Copy size={16} />
                            <div>
                              <span className="nlu-source-label">Источник данных</span>
                              <strong>{draft[0]?.source || parsed.source_object}</strong>
                            </div>
                          </div>
                        )}
                        <div className="nlu-copy-grid">
                          {draft.map((d, i) => (
                            <motion.div key={i} className={`nlu-copy-card glass-soft ${d.include ? '' : 'excluded'}`}
                              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.05, 0.5) }}>
                              <input type="checkbox" checked={d.include} onChange={() => toggleDraft(i)} />
                              <Plus size={14} /><span>{d.record}</span>
                            </motion.div>
                          ))}
                        </div>
                      </div>
                    )}

                    {parsed.intent !== 'copy_items' && parsed.intent !== 'show_items' && draft.length > 0 && (
                      <div className="aicmd-preview">
                        <div className="aicmd-preview-title">Что будет изменено · выбрано {includedCount} из {draft.length}</div>
                        <div className="aicmd-preview-hint">Снимите галочку, чтобы исключить строку, или измените новое значение вручную.</div>
                        <div className="table-shell">
                          <table>
                            <thead><tr><th></th><th>Объект</th><th>Группа</th><th>Параметр</th><th>Текущее</th><th></th><th>Новое</th></tr></thead>
                            <tbody>
                              {draft.map((d, i) => (
                                <motion.tr key={i} className={`nlu-preview-row ${d.include ? '' : 'excluded'}`}
                                  initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(i * 0.05, 0.5) }}>
                                  <td><input type="checkbox" checked={d.include} onChange={() => toggleDraft(i)} /></td>
                                  <td>{d.record}</td>
                                  <td className="nlu-group-cell">{d.group || '—'}</td>
                                  <td>{d.parameter ? (PARAM_LABELS[d.parameter] || d.parameter) : '—'}</td>
                                  <td>{d.old_value === null ? '—' : fmt(d.old_value)}</td>
                                  <td className="nlu-arrow"><ArrowRight size={14} /></td>
                                  <td className="nlu-new-value">
                                    <input
                                      className="aicmd-value-input"
                                      type="text"
                                      inputMode="decimal"
                                      value={d.new_value ?? ''}
                                      disabled={!d.include}
                                      onChange={(e) => editDraftValue(i, e.target.value)}
                                    />
                                  </td>
                                </motion.tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {parsed.intent !== 'show_items' && (
                      <div className="nlu-apply-row">
                        <button className="button primary nlu-apply-btn" onClick={applyDraft}
                          disabled={!parseResult?.can_apply || applying || includedCount === 0}>
                          {applying ? <LoaderCircle size={16} className="spin" /> : <CircleCheckBig size={16} />}
                          {`Применить изменения (${includedCount})`}
                        </button>
                        {!parseResult?.can_apply && <span className="ai-hint-text">Применение недоступно: уточните команду.</span>}
                        {parseResult?.can_apply && includedCount === 0 && <span className="ai-hint-text">Выберите хотя бы одну строку.</span>}
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              <AnimatePresence>
                {applyResult?.success && (
                  <motion.div className="aicmd-success" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
                    <div className="nlu-success-icon"><CircleCheckBig size={22} /></div>
                    <div>
                      <strong>Изменения применены</strong>
                      <p>{applyResult.message}</p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ChipItem({ label, value, i }: { label: string; value: string; i: number }) {
  return (
    <motion.span className="nlu-chip"
      initial={{ opacity: 0, scale: 0.9, y: 6 }} animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ delay: i * 0.06, type: 'spring', stiffness: 260, damping: 20 }}>
      <span className="nlu-chip-key">{label}</span>
      <span className="nlu-chip-val">{value}</span>
    </motion.span>
  );
}
