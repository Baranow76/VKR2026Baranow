// Библиотека проектов: выбор активного проекта, переименование, копия, удаление,
// добавление проекта из JSON.
import { UploadCloud, Copy, Trash2 } from 'lucide-react';
import { Field } from '../shared/ui/primitives';
import type { DbProject } from '../shared/types';
import type { FullProjectRequest } from '../types';

export function ProjectLibraryPanel({
  projects,
  activeProject,
  activeProjectId,
  setActiveProjectId,
  onRename,
  onDuplicate,
  onDelete,
  onCreateFromJson,
}: {
  projects: DbProject[];
  activeProject?: DbProject;
  activeProjectId: number | null;
  setActiveProjectId: (id: number) => void;
  onRename: (name: string) => void;
  onDuplicate: () => void;
  onDelete: (id: number) => void;
  onCreateFromJson: (data: FullProjectRequest) => void;
}) {
  async function handleJsonFile(file: File) {
    const text = await file.text();
    const parsed = JSON.parse(text);
    onCreateFromJson(parsed);
  }

  return (
    <section className="project-library glass">
      <div className="project-library-head">
        <div>
          <div className="module-input-kicker">Библиотека проектов ИМ</div>
          <h2>Активный источник данных для расчётов</h2>
          <p>Все модули используют данные выбранного ниже проекта. Сравнение тоже сохраняется в базе данных.</p>
        </div>

        <label className="button secondary file-button">
          <UploadCloud size={16} /> Добавить JSON-проект
          <input type="file" accept=".json,application/json" onChange={(e) => e.target.files?.[0] && handleJsonFile(e.target.files[0])} />
        </label>
      </div>

      <div className="project-selector-row">
        <Field label="Выберите проект, из которого брать данные">
          <select value={activeProjectId || ''} onChange={(e) => setActiveProjectId(Number(e.target.value))}>
            {projects.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Название активного проекта">
          <input value={activeProject?.name || ''} onChange={(e) => onRename(e.target.value)} />
        </Field>
      </div>

      <div className="project-actions-row">
        <button className="button secondary" onClick={onDuplicate} disabled={!activeProject}>
          <Copy size={16} /> Создать копию для сравнения
        </button>
        {activeProject && projects.length > 1 && (
          <button className="button secondary danger-button" onClick={() => onDelete(activeProject.id)}>
            <Trash2 size={16} /> Удалить активный проект
          </button>
        )}
      </div>

      <div className="project-mini-grid">
        {projects.map((item) => (
          <button
            key={item.id}
            className={`project-mini-card ${item.id === activeProjectId ? 'active' : ''}`}
            onClick={() => setActiveProjectId(item.id)}
          >
            <strong>{item.name}</strong>
            <span>
              Номенклатура: {item.stats?.production_items ?? item.data.production?.items?.length ?? 0} · Операции:{' '}
              {item.stats?.robotic_operations ?? item.data.robotics?.operations?.length ?? 0} · Периодов:{' '}
              {item.stats?.economic_periods ?? item.data.economics?.periods?.length ?? 0}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
