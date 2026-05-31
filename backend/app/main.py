from __future__ import annotations

from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session
from pathlib import Path
from typing import Any, Dict
from uuid import uuid4

import json
from datetime import datetime
from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session

from .database import Base, engine, get_db, SessionLocal
from .models import Project, ComparisonScenario, CalculationHistory, User
from .core.config import settings
from .deps import get_request_user, get_or_create_default_user
from .serializers import project_to_dict, project_to_data, apply_project_data
from .core.activity import (
    record_event, EVENT_PROJECT_CREATE, EVENT_PROJECT_SAVE, EVENT_NLU_APPLY,
    EVENT_SCENARIO_CREATE,
)
from .routers.auth import router as auth_router
from .routers.users import router as users_router

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.calculations import (
    calculate_economics,
    calculate_production_program,
    calculate_risk_analysis,
    calculate_robotic_links,
)
from app.schemas import (
    ApplyChangesRequest,
    ApplyCommandRequest,
    EconomicsRequest,
    EquipmentParamsRequest,
    FullProjectRequest,
    ParseCommandRequest,
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
Base.metadata.create_all(bind=engine)

# CORS: явный список доменов фронтенда (с credentials нельзя "*").
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(users_router)

# Служебный пользователь для dev-совместимости (владелец «ничьих» проектов).
with SessionLocal() as _seed_db:
    get_or_create_default_user(_seed_db)


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
def production_calculate(payload: ProductionRequest, db: Session = Depends(get_db), user: User = Depends(get_request_user)):
    result = calculate_production_program(payload)
    save_history("production", payload.model_dump(), result)
    record_event(db, user.id, "production")
    return result


@app.post("/api/robotics/calculate")
def robotics_calculate(payload: RoboticsRequest, db: Session = Depends(get_db), user: User = Depends(get_request_user)):
    result = calculate_robotic_links(payload)
    save_history("robotics", payload.model_dump(), result)
    record_event(db, user.id, "robotics")
    return result


@app.post("/api/risks/calculate")
def risks_calculate(payload: RiskRequest, db: Session = Depends(get_db), user: User = Depends(get_request_user)):
    result = calculate_risk_analysis(payload)
    save_history("risks", payload.model_dump(), result)
    record_event(db, user.id, "risks")
    return result


@app.post("/api/economics/calculate")
def economics_calculate(payload: EconomicsRequest, db: Session = Depends(get_db), user: User = Depends(get_request_user)):
    result = calculate_economics(payload)
    save_history("economics", payload.model_dump(), result)
    record_event(db, user.id, "economics")
    return result


@app.post("/api/full-project/calculate")
def full_project_calculate(payload: FullProjectRequest, db: Session = Depends(get_db), user: User = Depends(get_request_user)):
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
    record_event(db, user.id, "full_project")
    return result


def _get_owned_project(db: Session, project_id: int, user: User) -> Project:
    """Возвращает проект, проверяя владельца: 404 если нет, 403 если чужой."""
    project = db.get(Project, project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Проект не найден")
    if project.user_id != user.id:
        raise HTTPException(status_code=403, detail="Нет доступа к этому проекту")
    return project


@app.get("/api/projects")
def get_projects(db: Session = Depends(get_db), user: User = Depends(get_request_user)):
    projects = (
        db.query(Project)
        .filter(Project.user_id == user.id)
        .order_by(Project.updated_at.desc())
        .all()
    )
    return [project_to_dict(p) for p in projects]


@app.post("/api/projects")
def create_project(payload: dict, db: Session = Depends(get_db), user: User = Depends(get_request_user)):
    data = payload.get("data")
    if not data:
        raise HTTPException(status_code=400, detail="Не переданы данные проекта")
    name = payload.get("name") or data.get("name") or "Проект инновационной модернизации"

    project = Project(user_id=user.id, name=name, description=payload.get("description"))
    db.add(project)
    apply_project_data(db, project, data)  # JSON → нормализованные таблицы
    db.commit()
    db.refresh(project)
    record_event(db, user.id, EVENT_PROJECT_CREATE, project_id=project.id)
    return project_to_dict(project)


@app.get("/api/projects/{project_id}")
def get_project(project_id: int, db: Session = Depends(get_db), user: User = Depends(get_request_user)):
    return project_to_dict(_get_owned_project(db, project_id, user))


@app.put("/api/projects/{project_id}")
def update_project(project_id: int, payload: dict, db: Session = Depends(get_db), user: User = Depends(get_request_user)):
    project = _get_owned_project(db, project_id, user)
    data = payload.get("data")
    if not data:
        raise HTTPException(status_code=400, detail="Не переданы данные проекта")
    if payload.get("name"):
        project.name = payload["name"]
    if "description" in payload:
        project.description = payload["description"]
    apply_project_data(db, project, data)
    db.commit()
    db.refresh(project)
    record_event(db, user.id, EVENT_PROJECT_SAVE, project_id=project.id)
    return project_to_dict(project)


@app.delete("/api/projects/{project_id}")
def delete_project(project_id: int, db: Session = Depends(get_db), user: User = Depends(get_request_user)):
    project = _get_owned_project(db, project_id, user)
    db.delete(project)  # каскад удалит дочерние записи (all, delete-orphan)
    db.commit()
    return {"status": "deleted", "id": project_id}


@app.get("/api/comparison-scenarios")
def get_comparison_scenarios(db: Session = Depends(get_db), user: User = Depends(get_request_user)):
    scenarios = (
        db.query(ComparisonScenario)
        .filter(ComparisonScenario.user_id == user.id)
        .order_by(ComparisonScenario.created_at.desc())
        .all()
    )
    return [
        {
            "id": item.id,
            "project_id": item.project_id,
            "name": item.name,
            "source_data": item.source_data,
            "result": item.result,
            "created_at": item.created_at.isoformat() if item.created_at else None,
        }
        for item in scenarios
    ]


@app.post("/api/comparison-scenarios")
def create_comparison_scenario(payload: dict, db: Session = Depends(get_db), user: User = Depends(get_request_user)):
    source_data = payload.get("source_data")
    result = payload.get("result")
    if not source_data or not result:
        raise HTTPException(status_code=400, detail="Не переданы данные сценария")

    project_id = payload.get("project_id")
    if project_id is not None:
        _get_owned_project(db, project_id, user)  # сценарий можно привязать только к своему проекту

    scenario = ComparisonScenario(
        user_id=user.id,
        project_id=project_id,
        name=payload.get("name") or "Сценарий модернизации",
        source_data=source_data,
        result=result,
    )
    db.add(scenario)
    db.commit()
    db.refresh(scenario)
    record_event(db, user.id, EVENT_SCENARIO_CREATE, project_id=scenario.project_id)
    return {
        "id": scenario.id,
        "project_id": scenario.project_id,
        "name": scenario.name,
        "source_data": scenario.source_data,
        "result": scenario.result,
        "created_at": scenario.created_at.isoformat() if scenario.created_at else None,
    }


@app.delete("/api/comparison-scenarios/{scenario_id}")
def delete_comparison_scenario(scenario_id: int, db: Session = Depends(get_db), user: User = Depends(get_request_user)):
    scenario = db.get(ComparisonScenario, scenario_id)
    if scenario is None:
        raise HTTPException(status_code=404, detail="Сценарий не найден")
    if scenario.user_id != user.id:
        raise HTTPException(status_code=403, detail="Нет доступа к этому сценарию")
    db.delete(scenario)
    db.commit()
    return {"status": "deleted", "id": scenario_id}


# ---------------------------------------------------------------------------
# ИИ-модуль: прогнозирование отказов оборудования (predictive maintenance)
# Датасет AI4I 2020 (UCI ML Repository). Реализация — в пакете app.ml.
# ---------------------------------------------------------------------------

@app.post("/api/ai/train")
def ai_train():
    """
    Обучает модели машинного обучения (Random Forest и нейронную сеть)
    на открытом датасете AI4I 2020 и сохраняет лучшую по F1-мере.
    """
    from app.ml.trainer import train_and_persist
    from app.ml import predictor

    try:
        summary = train_and_persist()
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Не удалось обучить модель: {exc}")

    predictor.reset_cache()
    save_history("ai_train", {}, summary)
    return summary


@app.post("/api/ai/predict")
def ai_predict(payload: EquipmentParamsRequest):
    """
    Прогнозирует вероятность отказа оборудования по его рабочим параметрам.
    Результат содержит готовый процент риска для модуля анализа рисков.
    """
    from app.ml.predictor import ModelNotTrainedError, predict_failure

    try:
        result = predict_failure(
            type_class=payload.type_class,
            air_temperature=payload.air_temperature,
            process_temperature=payload.process_temperature,
            rotational_speed=payload.rotational_speed,
            torque=payload.torque,
            tool_wear=payload.tool_wear,
        )
    except ModelNotTrainedError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Ошибка прогноза: {exc}")

    save_history("ai_predict", payload.model_dump(), result)
    return result


@app.get("/api/ai/model-info")
def ai_model_info():
    """Возвращает статус и метрики обученной модели (или признак отсутствия)."""
    from app.ml.predictor import get_model_info

    info = get_model_info()
    if info is None:
        return {"status": "not_trained", "detail": "Модель ещё не обучена."}
    return info


# ---------------------------------------------------------------------------
# NLU-модуль: интеллектуальный редактор проектных данных по текстовой команде.
# Реализация — в пакете app.nlu. Расчётное ядро не затрагивается.
# ---------------------------------------------------------------------------

@app.post("/api/nlu/train")
def nlu_train():
    """Генерирует датасет команд (при отсутствии) и обучает NLU-модель."""
    from app.nlu.trainer import train_and_persist
    from app.nlu import predictor as nlu_predictor

    try:
        summary = train_and_persist()
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Не удалось обучить NLU-модель: {exc}")

    nlu_predictor.reset_cache()
    save_history("nlu_train", {}, summary)
    return summary


@app.post("/api/nlu/parse-command")
def nlu_parse_command(payload: ParseCommandRequest):
    """Разбирает команду и формирует предпросмотр изменений (без применения)."""
    from app.nlu.actions import build_preview
    from app.nlu.predictor import NluModelNotTrainedError

    try:
        return build_preview(
            payload.command, payload.records,
            allowed_parameters=payload.allowed_parameters,
            module_type=payload.module_type,
        )
    except NluModelNotTrainedError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Ошибка разбора команды: {exc}")


@app.post("/api/nlu/apply-command")
def nlu_apply_command(payload: ApplyCommandRequest, db: Session = Depends(get_db), user: User = Depends(get_request_user)):
    """Применяет команду к записям проекта при выполнении условий безопасности."""
    from app.nlu.actions import apply_command
    from app.nlu.predictor import NluModelNotTrainedError

    try:
        result = apply_command(
            payload.command, payload.records, confirm=payload.confirm,
            allowed_parameters=payload.allowed_parameters,
            module_type=payload.module_type,
        )
    except NluModelNotTrainedError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Ошибка применения команды: {exc}")

    save_history("nlu_apply", payload.model_dump(), {
        "success": result["success"],
        "message": result["message"],
        "parsed_command": result["parsed_command"],
    })
    if result.get("success"):
        record_event(db, user.id, EVENT_NLU_APPLY)
    return result


@app.post("/api/nlu/apply-changes")
def nlu_apply_changes(payload: ApplyChangesRequest, db: Session = Depends(get_db), user: User = Depends(get_request_user)):
    """Применяет выверенный/отредактированный пользователем набор изменений из preview."""
    from app.nlu.actions import apply_curated_changes

    try:
        result = apply_curated_changes(payload.records, payload.changes, payload.source_object)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Ошибка применения изменений: {exc}")

    save_history("nlu_apply_changes", {"changes": payload.changes}, {
        "success": result["success"], "message": result["message"],
    })
    if result.get("success"):
        record_event(db, user.id, EVENT_NLU_APPLY)
    return result


@app.get("/api/nlu/model-info")
def nlu_model_info():
    """Возвращает статус и параметры обученной NLU-модели."""
    from app.nlu.predictor import get_model_info

    info = get_model_info()
    if info is None:
        return {"status": "not_trained", "detail": "NLU-модель ещё не обучена."}
    return info


@app.get("/api/nlu/demo-commands")
def nlu_demo_commands():
    """Возвращает набор чистых демонстрационных команд для интерфейса."""
    from app.nlu.datasets import DEMO_COMMANDS, DEMO_COMMANDS_PATH

    if DEMO_COMMANDS_PATH.exists():
        try:
            return json.loads(DEMO_COMMANDS_PATH.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            pass
    return {"commands": DEMO_COMMANDS}