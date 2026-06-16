// Страница ИИ-модуля прогнозирования отказов оборудования (предиктивное ТО).
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  BrainCircuit, Cpu, LoaderCircle, Sparkles, CircleCheckBig, ShieldAlert, ShieldCheck,
  ChartNoAxesCombined,
} from 'lucide-react';
import {
  BarChart, Bar, ResponsiveContainer, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';
import { API_BASE } from '../utils/apiBase';
import {
  SectionCard, Field, Metric, DecimalInput, ChartCard, Interpretation,
} from '../shared/ui/primitives';
import { formatValue, safeJson, riskLevelColor } from '../shared/utils/formatters';
import type { AiModelInfo, AiPredictResult, EquipmentParams } from '../types';

export function AiPage({ showToast }: { showToast: (type: 'success' | 'error', message: string) => void }) {
  const [modelInfo, setModelInfo] = useState<AiModelInfo | null>(null);
  const [prediction, setPrediction] = useState<AiPredictResult | null>(null);
  const [training, setTraining] = useState(false);
  const [predicting, setPredicting] = useState(false);
  const [params, setParams] = useState<EquipmentParams>({
    type_class: 'M',
    air_temperature: 300,
    process_temperature: 310,
    rotational_speed: 1500,
    torque: 40,
    tool_wear: 108,
  });

  useEffect(() => {
    fetchModelInfo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchModelInfo() {
    try {
      const response = await fetch(`${API_BASE}/api/ai/model-info`);
      if (!response.ok) return;
      const data = await response.json();
      setModelInfo(data);
    } catch {
      // backend может быть не запущен
    }
  }

  async function trainModel() {
    setTraining(true);
    try {
      const response = await fetch(`${API_BASE}/api/ai/train`, { method: 'POST' });
      if (!response.ok) {
        const error = await safeJson(response);
        throw new Error(error?.detail || 'Не удалось обучить модель');
      }
      await fetchModelInfo();
      showToast('success', 'Модель обучена на датасете AI4I 2020.');
    } catch (error: any) {
      showToast('error', error.message || 'Ошибка обучения модели.');
    } finally {
      setTraining(false);
    }
  }

  async function runPredict() {
    setPredicting(true);
    setPrediction(null);
    try {
      const response = await fetch(`${API_BASE}/api/ai/predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      if (!response.ok) {
        const error = await safeJson(response);
        throw new Error(error?.detail || 'Не удалось выполнить прогноз');
      }
      const data: AiPredictResult = await response.json();
      setPrediction(data);
      if (data.can_predict) {
        showToast('success', 'Прогноз вероятности отказа выполнен.');
      } else {
        showToast('error', 'Введённые значения вне области применимости модели.');
      }
    } catch (error: any) {
      showToast('error', error.message || 'Ошибка прогноза.');
    } finally {
      setPredicting(false);
    }
  }

  const isReady = modelInfo?.status === 'ready';
  const labels = modelInfo?.feature_labels || {};
  const modelLabels = modelInfo?.model_labels || {};

  const importanceData = Object.entries(modelInfo?.feature_importance || {}).map(
    ([feature, value]) => ({
      name: labels[feature] || feature,
      value: Number((Number(value) * 100).toFixed(2)),
    }),
  );

  return (
    <div className="stack-16">
      <SectionCard title="О ИИ-модуле" icon={<BrainCircuit size={18} />}>
        <p className="ai-module-lead">
          Модуль реализует методы машинного обучения для задачи предиктивного обслуживания
          оборудования (predictive maintenance). Обучение проводится на открытом датасете
          <strong> AI4I 2020 Predictive Maintenance Dataset </strong>
          из репозитория UCI ML. Сравниваются две модели — случайный лес и нейронная сеть, —
          а лучшая по F1-мере используется для прогноза.
        </p>

        <div className="ai-train-row">
          <button className="button primary" onClick={trainModel} disabled={training}>
            {training ? <LoaderCircle size={16} className="spin" /> : <Sparkles size={16} />}
            {training ? 'Идёт обучение модели...' : isReady ? 'Переобучить модель' : 'Обучить модель'}
          </button>

          <div className={`ai-status-chip ${isReady ? 'ready' : 'pending'}`}>
            {isReady ? (
              <>
                <CircleCheckBig size={16} /> Модель обучена
              </>
            ) : (
              <>
                <ShieldAlert size={16} /> Модель ещё не обучена
              </>
            )}
          </div>
        </div>

        {isReady && (
          <div className="passport-grid compact" style={{ marginTop: 16 }}>
            <Metric label="Датасет, наблюдений" value={modelInfo?.dataset_rows} />
            <Metric label="Доля отказов в данных, %" value={Number(((modelInfo?.failure_rate || 0) * 100).toFixed(2))} />
            <Metric label="Лучшая модель" value={modelInfo?.best_model_label} />
            <Metric label="Обучена" value={modelInfo?.trained_at ? new Date(modelInfo.trained_at).toLocaleString('ru-RU') : '—'} />
          </div>
        )}
      </SectionCard>

      {isReady && modelInfo?.metrics_by_model && (
        <SectionCard title="Метрики обученных моделей" icon={<ChartNoAxesCombined size={18} />}>
          <div className="ai-metrics-grid">
            {Object.entries(modelInfo.metrics_by_model).map(([name, metrics]) => (
              <div
                key={name}
                className={`ai-model-card glass-soft ${name === modelInfo.best_model ? 'best' : ''}`}
              >
                <div className="ai-model-card-head">
                  <strong>{modelLabels[name] || name}</strong>
                  {name === modelInfo.best_model && <span className="ai-best-badge">Выбрана</span>}
                </div>
                <div className="passport-grid compact">
                  <Metric label="Accuracy" value={metrics.accuracy} />
                  <Metric label="F1-мера" value={metrics.f1} />
                  <Metric label="Precision" value={metrics.precision} />
                  <Metric label="Recall" value={metrics.recall} />
                  <Metric label="ROC-AUC" value={metrics.roc_auc} />
                </div>
              </div>
            ))}
          </div>

          <ChartCard title="Важность признаков (Random Forest), %">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart
                data={importanceData}
                layout="vertical"
                margin={{ top: 8, right: 28, left: 60, bottom: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" tick={{ fontSize: 13 }} />
                <YAxis type="category" dataKey="name" width={160} tick={{ fontSize: 12 }} />
                <Tooltip formatter={(value: any) => `${value}%`} />
                <Bar dataKey="value" name="Вклад в прогноз, %" fill="#ff7757" radius={[0, 10, 10, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </SectionCard>
      )}

      <SectionCard title="Параметры оборудования" icon={<Cpu size={18} />}>
        <div className="form-grid two">
          <Field label="Класс изделия (L / M / H)">
            <select
              value={params.type_class}
              onChange={(e) => setParams((prev) => ({ ...prev, type_class: e.target.value }))}
            >
              <option value="L">L — низкое качество</option>
              <option value="M">M — среднее качество</option>
              <option value="H">H — высокое качество</option>
            </select>
          </Field>

          <Field label="Температура воздуха, K">
            <DecimalInput value={params.air_temperature} onChange={(value) => setParams((prev) => ({ ...prev, air_temperature: value }))} />
          </Field>

          <Field label="Температура процесса, K">
            <DecimalInput value={params.process_temperature} onChange={(value) => setParams((prev) => ({ ...prev, process_temperature: value }))} />
          </Field>

          <Field label="Скорость вращения, об/мин">
            <DecimalInput value={params.rotational_speed} onChange={(value) => setParams((prev) => ({ ...prev, rotational_speed: value }))} />
          </Field>

          <Field label="Крутящий момент, Н·м">
            <DecimalInput value={params.torque} onChange={(value) => setParams((prev) => ({ ...prev, torque: value }))} />
          </Field>

          <Field label="Износ инструмента, мин">
            <DecimalInput value={params.tool_wear} onChange={(value) => setParams((prev) => ({ ...prev, tool_wear: value }))} />
          </Field>
        </div>

        <div className="ai-train-row" style={{ marginTop: 16 }}>
          <button className="button primary" onClick={runPredict} disabled={predicting || !isReady}>
            {predicting ? <LoaderCircle size={16} className="spin" /> : <BrainCircuit size={16} />}
            {predicting ? 'Прогнозирование...' : 'Спрогнозировать отказ'}
          </button>
          {!isReady && <span className="ai-hint-text">Сначала обучите модель выше.</span>}
        </div>
      </SectionCard>

      <SectionCard title="Результат прогноза" icon={<ChartNoAxesCombined size={18} />}>
        {!prediction && (
          <div className="empty-result">
            Заполните параметры оборудования и запустите прогноз, чтобы увидеть вероятность отказа.
          </div>
        )}

        {prediction && !prediction.can_predict && (
          <div className="result-stack">
            <div className="ai-ood-alert">
              <ShieldAlert size={24} />
              <div>
                <strong>Значения выходят за область обучающей выборки, ML-прогноз недостоверен</strong>
                <p>{prediction.interpretation}</p>
              </div>
            </div>

            <div className="ai-warnings-list">
              {prediction.validation_warnings.map((warning, index) => (
                <div className="ai-warning-item" key={index}>
                  <div className="ai-warning-head">
                    <span className="ai-warning-param">{warning.label}</span>
                    <span className="ai-warning-type">
                      {warning.type === 'physical' || warning.type === 'invalid'
                        ? 'физически некорректно'
                        : 'вне обучающей выборки'}
                    </span>
                  </div>
                  <div className="ai-warning-body">
                    <span className="ai-warning-value">Введено: {formatValue(warning.value)}</span>
                    {warning.training_range && (
                      <span className="ai-warning-range">
                        Диапазон данных: {formatValue(warning.training_range.min)}–{formatValue(warning.training_range.max)}
                      </span>
                    )}
                    {warning.physical_range && (
                      <span className="ai-warning-range">
                        Допустимо: {warning.physical_range.min ?? '−∞'}…{warning.physical_range.max ?? '+∞'}
                      </span>
                    )}
                  </div>
                  <p className="ai-warning-msg">{warning.message}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {prediction && prediction.can_predict && (
          <div className="result-stack">
            <div className="ai-probability-banner glass-soft">
              <div className="ai-probability-value" style={{ color: riskLevelColor(prediction.failure_probability ?? 0) }}>
                {formatValue(prediction.risk_percent)}%
              </div>
              <div className="ai-probability-meta">
                <span
                  className="ai-risk-badge"
                  style={{ background: riskLevelColor(prediction.failure_probability ?? 0) }}
                >
                  {prediction.risk_level}
                </span>
                <span className="ai-risk-sub">
                  Прогноз: {prediction.failure_prediction === 1 ? 'ожидается отказ' : 'отказ не ожидается'} · модель «{prediction.model_label}»
                </span>
              </div>
            </div>

            <div className="passport-grid compact">
              <Metric label="Вероятность отказа, %" value={prediction.risk_percent} />
              <Metric label="Бинарный прогноз" value={prediction.failure_prediction === 1 ? 'Отказ (1)' : 'Норма (0)'} />
              <Metric label="Риск для модуля рисков, %" value={prediction.recommended_risk_value} />
            </div>

            <Interpretation text={prediction.interpretation} />

            <div className="ai-integration-note glass-soft">
              <ShieldCheck size={18} />
              <div>
                <strong>Связь с модулем анализа рисков</strong>
                <p>
                  Полученное значение <b>{formatValue(prediction.recommended_risk_value)}%</b> можно
                  использовать как уровень риска события «Простой / отказ оборудования» в модуле
                  «Анализ рисков» — это переводит экспертную оценку риска в оценку на основе машинного обучения.
                </p>
              </div>
            </div>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
