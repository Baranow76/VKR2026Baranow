"""
Журнал реальных пользовательских событий для статистики и карты активности.

События пишутся в таблицу CalculationHistory (поле module используется как тип
события). Это НЕ дублирует файловую историю расчётов (history.json), которая
обслуживает страницу «История»; здесь хранится привязанный к пользователю
поток событий, на котором строятся профиль, статистика и heatmap.
"""
from __future__ import annotations

from typing import Optional

from sqlalchemy.orm import Session

from ..models import CalculationHistory

# Типы событий (значение поля CalculationHistory.module).
CALC_KINDS = {"production", "robotics", "risks", "economics", "full_project"}
EVENT_PROJECT_SAVE = "project_save"
EVENT_PROJECT_CREATE = "project_create"
EVENT_NLU_APPLY = "nlu_apply"
EVENT_SCENARIO_CREATE = "scenario_create"


def record_event(
    db: Session,
    user_id: Optional[int],
    kind: str,
    project_id: Optional[int] = None,
) -> None:
    """Записывает событие активности. Ошибки журналирования не должны ломать запрос."""
    if user_id is None:
        return
    try:
        db.add(CalculationHistory(
            user_id=user_id,
            project_id=project_id,
            module=kind,
            input_json=None,
            output_json=None,
        ))
        db.commit()
    except Exception:  # noqa: BLE001 — активность вторична по отношению к основному запросу
        db.rollback()
