// Переиспользуемые презентационные примитивы (карточки, поля, таблицы, метрики).
// Зависят только от утилит форматирования, иконок и анимаций — без бизнес-логики.
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  GitCompare, CircleCheckBig, WandSparkles, Database, Import, FileSpreadsheet,
  Rocket, LoaderCircle, UploadCloud,
} from 'lucide-react';
import { formatValue } from '../utils/formatters';

export function AmbientDecor() {
  return (
    <>
      <div className="ambient ambient-1" />
      <div className="ambient ambient-2" />
      <div className="ambient ambient-3" />
    </>
  );
}

export function StatCard({ title, value, hint }: { title: string; value: any; hint: string }) {
  return (
    <motion.div whileHover={{ y: -4 }} className="stat-card glass-soft">
      <div className="stat-title">{title}</div>
      <div className="stat-value">{formatValue(value)}</div>
      <div className="stat-hint">{hint}</div>
    </motion.div>
  );
}

export function ChartCard({ title, children }: any) {
  return <div className="chart-card glass-soft"><h3>{title}</h3>{children}</div>;
}

export function BarChartIcon() {
  return <GitCompare size={18} />;
}

export function DashboardInsight({ good, title, text }: { good: boolean; title: string; text: string }) {
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

export function SectionCard({ title, icon, children, actions }: any) {
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

export function Field({ label, children }: any) {
  return <label className="field"><span>{label}</span>{children}</label>;
}

export function DecimalInput({
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

export function Metric({ label, value }: { label: string; value: any }) {
  return <div className="metric glass-soft"><div className="metric-label">{label}</div><div className="metric-value">{formatValue(value)}</div></div>;
}

export function Feature({ icon, title, text }: any) {
  return <div className="feature glass-soft"><div className="feature-icon">{icon}</div><div><strong>{title}</strong><p>{text}</p></div></div>;
}

export function DataTools({ onCopyJson, onApplyJson, onImport }: { onCopyJson: () => void; onApplyJson: () => void; onImport: (file: File) => void }) {
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

export function EditableTable({ headers, rows }: { headers: string[]; rows: any[] }) {
  return <div className="table-shell"><table><thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{rows}</tbody></table></div>;
}

export function ResultPanel({ title, loading, onRun, content, steps, summary }: any) {
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

export function Interpretation({ text }: { text: string }) {
  return <div className="interpretation glass-soft">{text}</div>;
}

export function Chip({ label, value, index }: { label: string; value: string; index: number }) {
  return (
    <motion.span
      className="nlu-chip"
      initial={{ opacity: 0, scale: 0.9, y: 6 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ delay: index * 0.06, type: 'spring', stiffness: 260, damping: 20 }}
    >
      <span className="nlu-chip-key">{label}</span>
      <span className="nlu-chip-val">{value}</span>
    </motion.span>
  );
}

export function SimpleTable({ rows }: { rows?: any[] }) {
  if (!rows || rows.length === 0) return <div className="empty-result">Нет данных для отображения.</div>;
  const columns = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  return <div className="table-shell"><table><thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index}>{columns.map((column) => <td key={column}>{formatValue(row[column])}</td>)}</tr>)}</tbody></table></div>;
}

export function UploadDropzone({ title, onUpload }: { title: string; onUpload: (file: File) => void }) {
  return <label className="upload-dropzone"><input type="file" accept=".json,application/json" onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0])} /><div className="upload-dropzone-icon"><UploadCloud size={24} /></div><div><strong>{title}</strong><p>Загрузите JSON-файл с исходными данными. После загрузки можно проверить и отредактировать показатели.</p></div></label>;
}
