// Утилиты форматирования чисел/значений и небольшие хелперы представления.

export function formatValue(value: any) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'number') {
    return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value);
  }
  if (Array.isArray(value)) return value.join(', ');
  return String(value);
}

export function formatChartNumber(value: any) {
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

export function parseNumber(value: string) {
  const normalized = String(value).replace(',', '.');
  const num = Number(normalized);
  return Number.isNaN(num) ? 0 : num;
}

export function shallowClone<T>(obj: T): T {
  return structuredClone(obj);
}

export async function safeJson(response: Response) {
  return response.json().catch(() => null);
}

export function riskLevelColor(probability: number) {
  if (probability < 0.15) return '#0f9f68';
  if (probability < 0.4) return '#d8a200';
  if (probability < 0.7) return '#ff7757';
  return '#e23d3d';
}

export function confidenceTier(confidence: number): 'high' | 'medium' | 'low' {
  if (confidence >= 0.8) return 'high';
  if (confidence >= 0.55) return 'medium';
  return 'low';
}
