from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Any, Dict
from uuid import uuid4

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.calculations import (
    calculate_economics,
    calculate_production_program,
    calculate_risk_analysis,
    calculate_robotic_links,
)
from app.schemas import (
    EconomicsRequest,
    FullProjectRequest,
    ProductionRequest,
    RiskRequest,
    RoboticsRequest,
)

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
HISTORY_FILE = DATA_DIR / "history.json"
DATA_DIR.mkdir(exist_ok=True)
if not HISTORY_FILE.exists():
    HISTORY_FILE.write_text("[]", encoding="utf-8")

app = FastAPI(
    title="Modernization IS API",
    description="API модульной информационной системы поддержки инновационной модернизации.",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def save_history(module: str, input_data: Dict[str, Any], output_data: Dict[str, Any]) -> Dict[str, Any]:
    record = {
        "id": str(uuid4()),
        "module": module,
        "created_at": datetime.now().isoformat(timespec="seconds"),
        "input_data": input_data,
        "output_data": output_data,
    }
    try:
        history = json.loads(HISTORY_FILE.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        history = []
    history.insert(0, record)
    HISTORY_FILE.write_text(json.dumps(history[:200], ensure_ascii=False, indent=2), encoding="utf-8")
    return record


@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "service": "modernization-is-api",
        "author": "Баранов М.В.",
        "project": "Модульная информационная система поддержки проекта инновационной модернизации",
    }


@app.get("/api/demo-data")
def demo_data():
    return {
        "name": "Демо-проект инновационной модернизации",
        "production": {
            "time_fund": 520,
            "takt": 1.8,
            "items": [
                {"name": "Корпус редуктора", "quantity": 85, "setup_time": 18, "group": "A"},
                {"name": "Вал приводной", "quantity": 120, "setup_time": 12, "group": "A"},
                {"name": "Кронштейн", "quantity": 160, "setup_time": 8, "group": "B"},
                {"name": "Фланец", "quantity": 95, "setup_time": 22, "group": "B"},
                {"name": "Втулка", "quantity": 140, "setup_time": 10, "group": "C"},
                {"name": "Переходник", "quantity": 60, "setup_time": 30, "group": "C"}
            ]
        },
        "robotics": {
            "max_machines_per_robot": 3,
            "max_deviation": 0.22,
            "operations": [
                {"name": "Операция 1", "top": 24, "kz": 0.80, "service_time": 5, "machine": "Токарный станок"},
                {"name": "Операция 2", "top": 32, "kz": 0.75, "service_time": 6, "machine": "Фрезерный центр"},
                {"name": "Операция 3", "top": 18, "kz": 0.60, "service_time": 4, "machine": "Сверлильный станок"},
                {"name": "Операция 4", "top": 40, "kz": 0.85, "service_time": 7, "machine": "Обрабатывающий центр"},
                {"name": "Операция 5", "top": 20, "kz": 0.70, "service_time": 5, "machine": "Шлифовальный станок"}
            ]
        },
        "risks": {
            "events": ["Срыв поставки", "Рост стоимости оборудования", "Простой участка", "Недостижение плановой загрузки"],
            "base_loss": 1800000,
            "profitability_threshold": 4200000,
            "strategies": [
                {"name": "S1: страхование", "cost": 520000, "risks": [9, 7, 6, 8]},
                {"name": "S2: резервирование", "cost": 740000, "risks": [6, 5, 4, 6]},
                {"name": "S3: усиленный контроль", "cost": 630000, "risks": [5, 8, 3, 5]},
                {"name": "S4: комбинированная стратегия", "cost": 880000, "risks": [4, 4, 3, 4]}
            ],
            "hurwicz_coefficients": [0.3, 0.5, 0.7, 0.8, 0.9]
        },
        "economics": {
            "initial_investment": 12000000,
            "discount_rate": 18,
            "periods": [
                {"year": 1, "inflow": 4200000, "operating_costs": 900000, "risk_losses": 240000, "maintenance_costs": 180000},
                {"year": 2, "inflow": 5600000, "operating_costs": 1000000, "risk_losses": 210000, "maintenance_costs": 220000},
                {"year": 3, "inflow": 6900000, "operating_costs": 1150000, "risk_losses": 180000, "maintenance_costs": 260000},
                {"year": 4, "inflow": 7600000, "operating_costs": 1250000, "risk_losses": 160000, "maintenance_costs": 300000},
                {"year": 5, "inflow": 8100000, "operating_costs": 1350000, "risk_losses": 150000, "maintenance_costs": 330000}
            ]
        }
    }


@app.get("/api/history")
def history():
    try:
        return json.loads(HISTORY_FILE.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return []


@app.post("/api/production/calculate")
def production_calculate(payload: ProductionRequest):
    result = calculate_production_program(payload)
    save_history("production", payload.model_dump(), result)
    return result


@app.post("/api/robotics/calculate")
def robotics_calculate(payload: RoboticsRequest):
    result = calculate_robotic_links(payload)
    save_history("robotics", payload.model_dump(), result)
    return result


@app.post("/api/risks/calculate")
def risks_calculate(payload: RiskRequest):
    result = calculate_risk_analysis(payload)
    save_history("risks", payload.model_dump(), result)
    return result


@app.post("/api/economics/calculate")
def economics_calculate(payload: EconomicsRequest):
    result = calculate_economics(payload)
    save_history("economics", payload.model_dump(), result)
    return result


@app.post("/api/full-project/calculate")
def full_project_calculate(payload: FullProjectRequest):
    result: Dict[str, Any] = {
        "project_name": payload.name,
        "created_at": datetime.now().isoformat(timespec="seconds"),
        "modules": {},
        "summary": {},
    }

    if payload.production:
        result["modules"]["production"] = calculate_production_program(payload.production)
    if payload.robotics:
        result["modules"]["robotics"] = calculate_robotic_links(payload.robotics)
    if payload.risks:
        result["modules"]["risks"] = calculate_risk_analysis(payload.risks)
    if payload.economics:
        result["modules"]["economics"] = calculate_economics(payload.economics)

    economics = result["modules"].get("economics")
    risks = result["modules"].get("risks")
    production = result["modules"].get("production")
    robotics = result["modules"].get("robotics")

    if economics:
        result["summary"]["npv"] = economics["npv"]
        result["summary"]["irr_percent"] = economics["irr_percent"]
        result["summary"]["payback"] = economics["discounted_payback_period_years"]
        result["summary"]["is_effective"] = economics["is_effective"]
    if risks:
        result["summary"]["recommended_risk_strategy"] = risks["criteria"]["recommended_strategy"]
    if production:
        result["summary"]["production_utilization_percent"] = production["utilization_percent"]
    if robotics:
        result["summary"]["average_robot_load_percent"] = robotics["average_robot_load_percent"]

    save_history("full_project", payload.model_dump(), result)
    return result
