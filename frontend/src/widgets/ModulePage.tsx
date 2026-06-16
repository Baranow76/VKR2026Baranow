// Унифицированная раскладка страницы расчётного модуля: загрузка данных,
// просмотр/редактирование, undo/redo, встроенная ИИ-панель и блок результата.
import { Pencil, Undo2, Redo2, RotateCcw, Save, Trash2, Sparkles } from 'lucide-react';
import { UploadDropzone } from '../shared/ui/primitives';

export function ModulePage({
  title,
  input,
  result,
  isSaved,
  isEditing,
  onUpload,
  onEdit,
  onSave,
  onCancel,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onClear,
  aiPanel,
}: any) {
  return (
    <div className="module-page">
      {!isSaved && (
        <UploadDropzone
          title={title}
          onUpload={onUpload}
        />
      )}

      {isSaved && (
        <section className="module-input-panel glass">
          <div className="module-input-head">
            <div>
              <div className="module-input-kicker">
                Исходные данные активного проекта
              </div>
              <h2>{title}</h2>
            </div>

            <div className="module-input-actions">
              {!isEditing && (
                <button className="button secondary" onClick={onEdit}>
                  <Pencil size={16} />
                  Проверить и отредактировать
                </button>
              )}

              {isEditing && (
                <>
                  <button
                    className="button secondary"
                    onClick={onUndo}
                    disabled={!canUndo}
                    title="Отменить последнее действие"
                  >
                    <Undo2 size={16} />
                    Назад
                  </button>

                  <button
                    className="button secondary"
                    onClick={onRedo}
                    disabled={!canRedo}
                    title="Вернуть отменённое действие"
                  >
                    <Redo2 size={16} />
                    Вперёд
                  </button>

                  <button
                    className="button secondary"
                    onClick={onCancel}
                    title="Закрыть редактирование без сохранения"
                  >
                    <RotateCcw size={16} />
                    Отменить
                  </button>

                  <button className="button primary" onClick={onSave}>
                    <Save size={16} />
                    Сохранить данные
                  </button>
                </>
              )}

              <button className="button secondary danger-button" onClick={onClear}>
                <Trash2 size={16} />
                Скрыть данные
              </button>
            </div>
          </div>

          {isEditing ? (
            <div className="module-editor">
              <h3 className="module-editor-title">Редактирование данных</h3>
              {aiPanel}
              {input}
            </div>
          ) : (
            <div className="module-saved-state">
              <Sparkles size={18} />
              <div>
                <strong>Данные активного проекта готовы</strong>
                <span>
                  Можно запустить расчёт или открыть редактирование.
                </span>
              </div>
            </div>
          )}
        </section>
      )}

      <div className="module-result-wide">
        {result}
      </div>
    </div>
  );
}
