"""
Преобразование проекта между нормализованными таблицами и JSON-представлением.

Сохраняет совместимость API и поддерживает импорт/экспорт проектов:
- project_to_data(project)  — собрать структуру модулей из таблиц в JSON;
- project_to_dict(project)  — полный ответ API (id, name, data, stats, даты);
- apply_project_data(...)   — загрузить JSON в нормализованные таблицы проекта.

JSON-форма идентична FullProjectRequest фронтенда — фронтенд не требует изменений.
"""
from __future__ import annotations

from typing import Any, Dict

from sqlalchemy.orm import Session

from .models import (
    EconomicPeriod, ProductionItem, Project, RiskEvent, RiskStrategy, RobotOperation,
)


def project_to_data(project: Project) -> Dict[str, Any]:
    """Собирает данные модулей проекта из таблиц в JSON-структуру."""
    return {
        "name": project.name,
        "production": {
            "time_fund": project.time_fund,
            "takt": project.takt,
            "items": [
                {
                    "name": it.name, "quantity": it.quantity, "setup_time": it.setup_time,
                    "group": it.group, "comment": it.comment,
                }
                for it in project.production_items
            ],
        },
        "robotics": {
            "max_machines_per_robot": project.max_machines_per_robot,
            "max_deviation": project.max_deviation,
            "operations": [
                {
                    "name": op.name, "top": op.top, "kz": op.kz,
                    "service_time": op.service_time, "machine": op.machine, "comment": op.comment,
                }
                for op in project.robot_operations
            ],
        },
        "risks": {
            "events": [e.name for e in project.risk_events],
            "base_loss": project.base_loss,
            "profitability_threshold": project.profitability_threshold,
            "hurwicz_coefficients": project.hurwicz_coefficients or [],
            "strategies": [
                {"name": s.name, "cost": s.cost, "risks": s.risks or []}
                for s in project.risk_strategies
            ],
        },
        "economics": {
            "initial_investment": project.initial_investment,
            "discount_rate": project.discount_rate,
            "periods": [
                {
                    "year": p.year, "inflow": p.inflow, "operating_costs": p.operating_costs,
                    "risk_losses": p.risk_losses, "maintenance_costs": p.maintenance_costs,
                    "additional_investment": p.additional_investment,
                }
                for p in project.economic_periods
            ],
        },
    }


def project_to_dict(project: Project) -> Dict[str, Any]:
    """Полный ответ API по проекту (совместим с текущим фронтендом)."""
    data = project_to_data(project)
    return {
        "id": project.id,
        "name": project.name,
        "description": project.description,
        "data": data,
        "created_at": project.created_at.isoformat() if project.created_at else None,
        "updated_at": project.updated_at.isoformat() if project.updated_at else None,
        "stats": {
            "production_items": len(project.production_items),
            "robotic_operations": len(project.robot_operations),
            "risk_strategies": len(project.risk_strategies),
            "economic_periods": len(project.economic_periods),
        },
    }


def _num(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def apply_project_data(db: Session, project: Project, data: Dict[str, Any]) -> None:
    """
    Загружает JSON-данные проекта в нормализованные таблицы.
    Полностью заменяет дочерние записи (delete-orphan через очистку коллекций).
    """
    data = data or {}
    production = data.get("production", {}) or {}
    robotics = data.get("robotics", {}) or {}
    risks = data.get("risks", {}) or {}
    economics = data.get("economics", {}) or {}

    if data.get("name"):
        project.name = data["name"]

    # --- Скаляры ---
    project.time_fund = _num(production.get("time_fund"))
    project.takt = _num(production.get("takt"))
    project.max_machines_per_robot = int(_num(robotics.get("max_machines_per_robot"), 3))
    project.max_deviation = _num(robotics.get("max_deviation"))
    project.base_loss = _num(risks.get("base_loss"))
    project.profitability_threshold = _num(risks.get("profitability_threshold"))
    project.hurwicz_coefficients = risks.get("hurwicz_coefficients") or []
    project.initial_investment = _num(economics.get("initial_investment"))
    project.discount_rate = _num(economics.get("discount_rate"))

    # --- Дочерние коллекции: очистить и пересоздать ---
    project.production_items.clear()
    for i, it in enumerate(production.get("items", []) or []):
        project.production_items.append(ProductionItem(
            position=i, name=str(it.get("name", "")), quantity=_num(it.get("quantity")),
            setup_time=_num(it.get("setup_time")), group=it.get("group"), comment=it.get("comment"),
        ))

    project.robot_operations.clear()
    for i, op in enumerate(robotics.get("operations", []) or []):
        project.robot_operations.append(RobotOperation(
            position=i, name=str(op.get("name", "")), top=_num(op.get("top")), kz=_num(op.get("kz")),
            service_time=_num(op.get("service_time")), machine=op.get("machine"), comment=op.get("comment"),
        ))

    project.risk_events.clear()
    for i, ev in enumerate(risks.get("events", []) or []):
        project.risk_events.append(RiskEvent(position=i, name=str(ev)))

    project.risk_strategies.clear()
    for i, s in enumerate(risks.get("strategies", []) or []):
        project.risk_strategies.append(RiskStrategy(
            position=i, name=str(s.get("name", "")), cost=_num(s.get("cost")),
            risks=s.get("risks") or [],
        ))

    project.economic_periods.clear()
    for p in economics.get("periods", []) or []:
        project.economic_periods.append(EconomicPeriod(
            year=int(_num(p.get("year"), 1)), inflow=_num(p.get("inflow")),
            operating_costs=_num(p.get("operating_costs")), risk_losses=_num(p.get("risk_losses")),
            maintenance_costs=_num(p.get("maintenance_costs")),
            additional_investment=_num(p.get("additional_investment")),
        ))
