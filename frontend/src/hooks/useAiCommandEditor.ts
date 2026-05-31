// Хук редактора данных по текстовой команде: распознавание (preview) и применение
// с передачей контекста модуля; вычисляет подсветку AI-изменений.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { NluParseResult, NluApplyResult } from '../types';
import { API_BASE } from '../utils/apiBase';
import { MODULE_ADAPTERS, type ModuleAdapter, type AiRecord } from '../utils/moduleAdapters';
import { withUids, computeHighlight, type AiHighlight } from '../utils/aiHighlight';

type Params = {
  adapter: ModuleAdapter;
  moduleData: any;
  onApply: (newModuleData: any, highlight: AiHighlight) => void;
  showToast: (type: 'success' | 'error', message: string) => void;
};

const HIGHLIGHT_TTL_MS = 5200;

export function useAiCommandEditor({ adapter, moduleData, onApply, showToast }: Params) {
  const [command, setCommand] = useState('');
  const [parseResult, setParseResult] = useState<NluParseResult | null>(null);
  const [applyResult, setApplyResult] = useState<NluApplyResult | null>(null);
  const [parsing, setParsing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [highlight, setHighlight] = useState<AiHighlight | null>(null);
  const [displayRecords, setDisplayRecords] = useState<AiRecord[]>([]);
  const highlightTimer = useRef<number | null>(null);

  // Текущие записи модуля с локальными идентификаторами.
  const records = useMemo(() => withUids(adapter.toRecords(moduleData)), [adapter, moduleData]);

  useEffect(() => {
    setDisplayRecords(records);
  }, [records]);

  useEffect(() => {
    return () => {
      if (highlightTimer.current) window.clearTimeout(highlightTimer.current);
    };
  }, []);

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
        const error = await response.json().catch(() => null);
        throw new Error(error?.detail || 'Не удалось распознать команду');
      }
      setParseResult(await response.json());
    } catch (error: any) {
      showToast('error', error.message || 'Ошибка распознавания команды.');
    } finally {
      setParsing(false);
    }
  }

  // Применение выверенного пользователем набора изменений (с правками/удалениями).
  async function applyCurated(curated: any[], sourceObject?: string | null) {
    if (!curated || curated.length === 0) return;
    setApplying(true);
    const before = records;
    try {
      const response = await fetch(`${API_BASE}/api/nlu/apply-changes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ records: before, changes: curated, source_object: sourceObject ?? null }),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw new Error(error?.detail || 'Не удалось применить изменения');
      }
      const data = await response.json();
      if (!data.success) {
        showToast('error', data.message || 'Изменения не применены.');
        return;
      }
      const after = data.updated_records as AiRecord[];
      const diff = computeHighlight(before, after, command);

      const result: NluApplyResult = {
        ...data,
        parsed_command: parseResult?.parsed_command as any,
      };
      setApplyResult(result);
      setDisplayRecords(after);
      setHighlight(diff);
      onApply(adapter.fromRecords(after, moduleData), diff);
      setParseResult(null);
      showToast('success', data.message);

      if (highlightTimer.current) window.clearTimeout(highlightTimer.current);
      highlightTimer.current = window.setTimeout(() => setHighlight(null), HIGHLIGHT_TTL_MS);
    } catch (error: any) {
      showToast('error', error.message || 'Ошибка применения изменений.');
    } finally {
      setApplying(false);
    }
  }

  return {
    command,
    setCommand,
    parseResult,
    applyResult,
    parsing,
    applying,
    highlight,
    displayRecords,
    recognize,
    applyCurated,
  };
}

export { MODULE_ADAPTERS };
