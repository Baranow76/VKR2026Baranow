// Утилиты подсветки AI-изменений: присвоение локальных идентификаторов записям
// и вычисление различий до/после применения команды. Backend не затрагивается —
// поле __uid передаётся в records и возвращается без изменений.

import type { AiRecord } from './moduleAdapters';

let _counter = 0;

export function withUids(records: AiRecord[]): AiRecord[] {
  return records.map((record) => ({
    __uid: record.__uid ?? `ai-${Date.now()}-${++_counter}`,
    ...record,
  }));
}

export type AiHighlight = {
  changedUids: string[];
  createdUids: string[];
  changedFields: Record<string, string[]>; // __uid -> изменённые поля
  changedFieldsByName: Record<string, string[]>; // имя записи -> изменённые поля
  changedNames: string[];
  createdNames: string[];
  timestamp: number;
  sourceCommand: string;
};

const IGNORED_FIELDS = new Set(['__uid', 'name', 'group', 'comment', 'machine']);

export function computeHighlight(
  before: AiRecord[],
  after: AiRecord[],
  sourceCommand: string,
): AiHighlight {
  const beforeByUid = new Map(before.filter((r) => r.__uid).map((r) => [r.__uid as string, r]));

  const changedUids: string[] = [];
  const createdUids: string[] = [];
  const changedFields: Record<string, string[]> = {};
  const changedFieldsByName: Record<string, string[]> = {};
  const changedNames: string[] = [];
  const createdNames: string[] = [];

  after.forEach((record) => {
    const uid = record.__uid;
    if (!uid || !beforeByUid.has(uid)) {
      // Запись без исходного идентификатора — создана командой.
      const newUid = uid ?? `ai-created-${Date.now()}-${++_counter}`;
      record.__uid = newUid;
      createdUids.push(newUid);
      createdNames.push(record.name);
      return;
    }
    const prev = beforeByUid.get(uid)!;
    const fields: string[] = [];
    Object.keys(record).forEach((key) => {
      if (IGNORED_FIELDS.has(key)) return;
      if (Number(prev[key]) !== Number(record[key]) && prev[key] !== record[key]) {
        fields.push(key);
      }
    });
    if (fields.length > 0) {
      changedUids.push(uid);
      changedFields[uid] = fields;
      changedFieldsByName[record.name] = fields;
      changedNames.push(record.name);
    }
  });

  return {
    changedUids,
    createdUids,
    changedFields,
    changedFieldsByName,
    changedNames,
    createdNames,
    timestamp: Date.now(),
    sourceCommand,
  };
}
