// Отдельная страница ИИ-редактора данных: распознавание NLU-команд и применение
// к выбранному модулю активного проекта (без demo-data).
import { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  WandSparkles, Sparkles, LoaderCircle, CircleCheckBig, ShieldAlert, BrainCircuit,
  FolderOpen, ArrowRight, Copy, Plus, TableProperties, RotateCcw,
} from 'lucide-react';
import { API_BASE } from '../utils/apiBase';
import { MODULE_ADAPTERS } from '../utils/moduleAdapters';
import type { AiRecord, ModuleType } from '../utils/moduleAdapters';
import { withUids, computeHighlight, type AiHighlight } from '../utils/aiHighlight';
import { Chip } from '../shared/ui/primitives';
import { formatValue, safeJson, confidenceTier } from '../shared/utils/formatters';
import { INTENT_LABELS, ACTION_LABELS, PARAM_LABELS, VALUE_TYPE_LABELS } from '../shared/constants';
import type { FullProjectRequest, NluModelInfo, NluParseResult, NluApplyResult } from '../types';

export function AiEditorPage({
  showToast,
  project,
  activeProjectName,
  onApplyModule,
}: {
  showToast: (type: 'success' | 'error', message: string) => void;
  project: FullProjectRequest;
  activeProjectName?: string;
  onApplyModule: (moduleKey: string, nextModuleData: any, highlight: AiHighlight) => void;
}) {
  const [modelInfo, setModelInfo] = useState<NluModelInfo | null>(null);
  const [command, setCommand] = useState('');
  const [moduleType, setModuleType] = useState<ModuleType>('production');
  const [parseResult, setParseResult] = useState<NluParseResult | null>(null);
  const [applyResult, setApplyResult] = useState<NluApplyResult | null>(null);
  const [training, setTraining] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [focused, setFocused] = useState(false);

  // Редактор работает с данными выбранного модуля активного проекта (не demo-data).
  const adapter = MODULE_ADAPTERS[moduleType];
  const moduleData = (project as any)?.[moduleType];
  const records = useMemo<AiRecord[]>(
    () => withUids(adapter.toRecords(moduleData)),
    [adapter, moduleData],
  );
  const examples = adapter.examples;

  useEffect(() => {
    fetchModelInfo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // При смене модуля сбрасываем устаревший предпросмотр предыдущего модуля.
  useEffect(() => {
    setParseResult(null);
    setApplyResult(null);
    setCommand('');
  }, [moduleType]);

  async function fetchModelInfo() {
    try {
      const response = await fetch(`${API_BASE}/api/nlu/model-info`);
      if (!response.ok) return;
      setModelInfo(await response.json());
    } catch {
      // backend может быть не запущен
    }
  }

  async function trainModel() {
    setTraining(true);
    try {
      const response = await fetch(`${API_BASE}/api/nlu/train`, { method: 'POST' });
      if (!response.ok) {
        const error = await safeJson(response);
        throw new Error(error?.detail || 'Не удалось обучить NLU-модель');
      }
      await fetchModelInfo();
      showToast('success', 'NLU-модель обучена на доменном датасете команд.');
    } catch (error: any) {
      showToast('error', error.message || 'Ошибка обучения NLU-модели.');
    } finally {
      setTraining(false);
    }
  }

  function contextBody() {
    return {
      module_type: adapter.moduleType,
      allowed_parameters: adapter.allowedParameters,
      target_groups: adapter.targetGroups,
    };
  }

  async function recognize() {
    if (!command.trim()) return;
    setParsing(true);
    setParseResult(null);
    setApplyResult(null);
    try {
      const response = await fetch(`${API_BASE}/api/nlu/parse-command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command, records, ...contextBody() }),
      });
      if (!response.ok) {
        const error = await safeJson(response);
        throw new Error(error?.detail || 'Не удалось распознать команду');
      }
      const data: NluParseResult = await response.json();
      setParseResult(data);
    } catch (error: any) {
      showToast('error', error.message || 'Ошибка распознавания команды.');
    } finally {
      setParsing(false);
    }
  }

  async function applyChanges() {
    if (!parseResult?.can_apply) return;
    setApplying(true);
    const before = records;
    try {
      const response = await fetch(`${API_BASE}/api/nlu/apply-command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command, records, confirm: parseResult.needs_confirmation, ...contextBody() }),
      });
      if (!response.ok) {
        const error = await safeJson(response);
        throw new Error(error?.detail || 'Не удалось применить команду');
      }
      const data: NluApplyResult = await response.json();
      if (data.success) {
        // Записываем результат обратно в активный проект (с подсветкой изменений).
        const after = data.updated_records as AiRecord[];
        const highlight = computeHighlight(before, after, command);
        onApplyModule(adapter.moduleType, adapter.fromRecords(after, moduleData), highlight);
        setApplyResult(data);
        setParseResult(null);
        showToast('success', data.message);
      } else {
        showToast('error', data.message || 'Команда не была применена.');
      }
    } catch (error: any) {
      showToast('error', error.message || 'Ошибка применения команды.');
    } finally {
      setApplying(false);
    }
  }

  function resetRecords() {
    setParseResult(null);
    setApplyResult(null);
    setCommand('');
  }

  const isReady = modelInfo?.status === 'ready';
  const parsed = parseResult?.parsed_command;
  const tier = parsed ? confidenceTier(parsed.confidence) : 'high';

  // Этап процесса: Команда → Распознавание → Preview → Применение.
  let stage = 1;
  if (parseResult) stage = parseResult.can_apply ? 3 : 2;
  if (applyResult?.success) stage = 4;

  const steps = ['Команда', 'Распознавание', 'Предпросмотр', 'Применение'];

  return (
    <div className="nlu-shell">
      <motion.div
        className="nlu-hero glass"
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
      >
        <div className="nlu-hero-glow" />
        <div className="nlu-hero-content">
          <div className="nlu-hero-badge">
            <WandSparkles size={16} /> Интеллектуальный помощник
          </div>
          <h2>ИИ-редактор проектных данных</h2>
          <p>
            Опишите изменение естественным языком — система распознает намерение,
            покажет предварительный просмотр и применит его только после вашего подтверждения.
          </p>

          <div className="nlu-context-row">
            <div className="nlu-context-chip">
              <FolderOpen size={15} />
              <span>Активный проект:</span>
              <strong>{activeProjectName || 'не выбран'}</strong>
            </div>
            <label className="nlu-module-select">
              <span>Модуль данных</span>
              <select value={moduleType} onChange={(e) => setModuleType(e.target.value as ModuleType)}>
                <option value="production">Производственная программа</option>
                <option value="robotics">Роботизированные звенья</option>
                <option value="risks">Анализ рисков</option>
                <option value="economics">Экономика проекта</option>
              </select>
            </label>
          </div>

          <div className="nlu-train-row">
            <button className="button primary nlu-btn-shine" onClick={trainModel} disabled={training}>
              {training ? <LoaderCircle size={16} className="spin" /> : <Sparkles size={16} />}
              {training ? 'Обучение модели...' : isReady ? 'Переобучить NLU-модель' : 'Обучить NLU-модель'}
            </button>
            <div className={`ai-status-chip ${isReady ? 'ready' : 'pending'}`}>
              {isReady ? <CircleCheckBig size={16} /> : <ShieldAlert size={16} />}
              {isReady ? `Модель готова · ${modelInfo?.intent_model_label || ''}` : 'Модель не обучена'}
            </div>
          </div>
        </div>
      </motion.div>

      <div className="nlu-stepper">
        {steps.map((label, index) => (
          <div key={label} className={`nlu-step ${stage >= index + 1 ? 'active' : ''} ${stage === index + 1 ? 'current' : ''}`}>
            <span className="nlu-step-dot">{index + 1}</span>
            <span className="nlu-step-label">{label}</span>
            {index < steps.length - 1 && <span className="nlu-step-line" />}
          </div>
        ))}
      </div>

      <motion.div
        className="nlu-card glass"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.05 }}
      >
        <div className="nlu-card-head">
          <BrainCircuit size={18} />
          <h3>Команда</h3>
        </div>

        <div className={`nlu-textarea-wrap ${focused ? 'focused' : ''}`}>
          <div className="nlu-textarea-glow" />
          <textarea
            className="nlu-textarea"
            value={command}
            placeholder={adapter.placeholder}
            onChange={(e) => setCommand(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
          />
        </div>

        <div className="nlu-examples">
          <span className="nlu-examples-label">Примеры команд:</span>
          <div className="nlu-examples-chips">
            {examples.map((example) => (
              <button
                key={example}
                className="nlu-example-chip"
                onClick={() => setCommand(example)}
                title={example}
              >
                {example.length > 46 ? `${example.slice(0, 44)}…` : example}
              </button>
            ))}
          </div>
        </div>

        <div className="nlu-actions-row">
          <button className="button primary nlu-recognize-btn" onClick={recognize} disabled={parsing || !isReady}>
            {parsing ? <LoaderCircle size={16} className="spin" /> : <WandSparkles size={16} />}
            {parsing ? 'Распознавание...' : 'Распознать'}
          </button>
          {!isReady && <span className="ai-hint-text">Сначала обучите модель в верхнем блоке.</span>}
        </div>
      </motion.div>

      <AnimatePresence>
        {parsing && (
          <motion.div
            className="nlu-card glass"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <div className="nlu-thinking">
              <div className="nlu-thinking-orb"><span /><span /><span /></div>
              <div>
                <strong>Модель анализирует команду</strong>
                <div className="nlu-skeleton-row">
                  <div className="nlu-skeleton" />
                  <div className="nlu-skeleton short" />
                  <div className="nlu-skeleton" />
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {parsed && !parsing && (
          <motion.div
            className="nlu-card glass"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.4 }}
          >
            <div className="nlu-card-head">
              <Sparkles size={18} />
              <h3>Распознанное действие</h3>
            </div>

            <div className="nlu-chips">
              <Chip label="Намерение" value={INTENT_LABELS[parsed.intent] || parsed.intent} index={0} />
              <Chip label="Действие" value={ACTION_LABELS[parsed.action] || parsed.action} index={1} />
              {parsed.target_group && <Chip label="Объект" value={parsed.target_group} index={2} />}
              {parsed.source_object && <Chip label="Источник" value={parsed.source_object} index={3} />}
              {parsed.count !== null && <Chip label="Количество" value={String(parsed.count)} index={4} />}
              {parsed.parameter && (
                <Chip label="Параметр" value={PARAM_LABELS[parsed.parameter] || parsed.parameter} index={5} />
              )}
              {parsed.value !== null && parsed.intent !== 'create_items' && (
                <Chip label="Значение" value={String(parsed.value)} index={6} />
              )}
              {parsed.value !== null && parsed.intent !== 'create_items' && parsed.intent !== 'copy_items' && (
                <Chip label="Тип значения" value={VALUE_TYPE_LABELS[parsed.value_type] || parsed.value_type} index={7} />
              )}
              <motion.span
                className={`nlu-chip nlu-chip-conf tier-${tier}`}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 8 * 0.06 }}
              >
                <span className="nlu-chip-key">Уверенность</span>
                <span className="nlu-chip-val">{Math.round(parsed.confidence * 100)}%</span>
              </motion.span>
            </div>

            {parsed.assignments && parsed.assignments.length > 0 && (
              <div className="nlu-assign-chips">
                {parsed.assignments.map((assignment) => (
                  <span className="nlu-assign-chip" key={assignment.object_name}>
                    <b>{assignment.object_name}</b>
                    <ArrowRight size={13} />
                    {String(assignment.value)}
                  </span>
                ))}
              </div>
            )}

            {parseResult && parseResult.warnings.length > 0 && (
              <motion.div
                className={`nlu-alert ${parseResult.can_apply ? 'warn' : 'error'}`}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
              >
                <ShieldAlert size={18} />
                <div>
                  {parseResult.warnings.map((warning, index) => (
                    <div key={index}>{warning}</div>
                  ))}
                </div>
              </motion.div>
            )}

            {parseResult?.needs_confirmation && (
              <div className="nlu-alert confirm">
                <ShieldAlert size={18} />
                <div>Команда затрагивает большое число записей. Применение требует подтверждения.</div>
              </div>
            )}

            {parsed.missing_objects && parsed.missing_objects.length > 0 && (
              <div className="nlu-alert error">
                <ShieldAlert size={18} />
                <div>
                  <strong>Объекты не найдены в данных:</strong> {parsed.missing_objects.join(', ')}.
                  Команда не может быть применена.
                </div>
              </div>
            )}

            {parsed.intent === 'copy_items' && parseResult && parseResult.preview_changes.length > 0 && (
              <div className="nlu-preview">
                <div className="nlu-preview-head">
                  <h4>Создаваемые копии</h4>
                  <span className="nlu-preview-count">{parseResult.preview_changes.length}</span>
                </div>
                {parsed.source_object && (
                  <div className="nlu-source-card glass-soft">
                    <Copy size={18} />
                    <div>
                      <span className="nlu-source-label">Источник данных</span>
                      <strong>{parseResult.preview_changes[0]?.source || parsed.source_object}</strong>
                    </div>
                  </div>
                )}
                <div className="nlu-copy-grid">
                  {parseResult.preview_changes.map((change, index) => (
                    <motion.div
                      key={index}
                      className="nlu-copy-card glass-soft"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: Math.min(index * 0.05, 0.5) }}
                    >
                      <Plus size={15} />
                      <span>{change.record}</span>
                    </motion.div>
                  ))}
                </div>
              </div>
            )}

            {parsed.intent !== 'copy_items' && parseResult && parseResult.preview_changes.length > 0 && (
              <div className="nlu-preview">
                <div className="nlu-preview-head">
                  <h4>Предварительный просмотр изменений</h4>
                  <span className="nlu-preview-count">{parseResult.preview_changes.length}</span>
                </div>
                <div className="table-shell">
                  <table>
                    <thead>
                      <tr>
                        <th>Запись</th>
                        <th>Группа</th>
                        <th>Параметр</th>
                        <th>Текущее</th>
                        <th></th>
                        <th>Новое</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parseResult.preview_changes.map((change, index) => (
                        <motion.tr
                          key={index}
                          className="nlu-preview-row"
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: Math.min(index * 0.05, 0.6) }}
                        >
                          <td>{change.record}</td>
                          <td className="nlu-group-cell">{change.group || '—'}</td>
                          <td>{change.parameter ? (PARAM_LABELS[change.parameter] || change.parameter) : 'новая позиция'}</td>
                          <td>{change.old_value === null ? '—' : formatValue(change.old_value)}</td>
                          <td className="nlu-arrow"><ArrowRight size={15} /></td>
                          <td className="nlu-new-value">{change.new_value === null ? '—' : formatValue(change.new_value)}</td>
                        </motion.tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="nlu-apply-row">
              <button
                className="button primary nlu-apply-btn"
                onClick={applyChanges}
                disabled={!parseResult?.can_apply || applying}
              >
                {applying ? <LoaderCircle size={16} className="spin" /> : <CircleCheckBig size={16} />}
                {parseResult?.needs_confirmation ? 'Подтвердить и применить' : 'Применить изменения'}
              </button>
              {!parseResult?.can_apply && (
                <span className="ai-hint-text">Применение недоступно: уточните команду.</span>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {applyResult?.success && (
          <motion.div
            className="nlu-card glass nlu-success-card"
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ type: 'spring', stiffness: 220, damping: 20 }}
          >
            <div className="nlu-success-icon">
              <CircleCheckBig size={28} />
            </div>
            <div>
              <strong>Изменения применены</strong>
              <p>{applyResult.message}</p>
              <span className="nlu-success-sub">Обновлено записей: {applyResult.changes.length}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        className="nlu-card glass"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.1 }}
      >
        <div className="nlu-card-head">
          <TableProperties size={18} />
          <h3>Текущие данные проекта · {adapter.title.replace('ИИ-редактор: ', '')}</h3>
          <button className="button subtle nlu-reset-btn" onClick={resetRecords}>
            <RotateCcw size={15} /> Сбросить распознавание
          </button>
        </div>
        <div className="table-shell">
          <table>
            <thead>
              <tr>
                <th>Запись</th>
                <th>Группа</th>
                {adapter.displayFields.map((field) => (
                  <th key={field.key}>{field.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {records.map((record, index) => (
                <tr key={`${record.name}-${index}`} className="nlu-data-row">
                  <td>{record.name}</td>
                  <td>{record.group === '__scalars__' ? '—' : record.group}</td>
                  {adapter.displayFields.map((field) => (
                    <td key={field.key}>
                      {record[field.key] === undefined || record[field.key] === null
                        ? '—'
                        : formatValue(record[field.key])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </motion.div>
    </div>
  );
}
