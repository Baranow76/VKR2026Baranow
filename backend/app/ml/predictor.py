"""
Инференс модели прогнозирования отказов оборудования.

Загружает сохранённый артефакт (app/data/ai_model.pkl), выполняет предсказание
вероятности отказа по параметрам оборудования и формирует интерпретацию.

Также предоставляет связку с расчётным ядром: вероятность отказа переводится
в процент риска, пригодный для модуля анализа рисков (calculate_risk_analysis).
"""
from __future__ import annotations

from functools import lru_cache
from typing import Any, Dict, Optional

import joblib

from .models import INPUT_TO_FEATURE, MODEL_PATH, encode_single_sample, validate_equipment_input


class ModelNotTrainedError(RuntimeError):
    """Модель ещё не обучена — нет сохранённого артефакта."""


@lru_cache(maxsize=1)
def _load_artifact() -> Dict[str, Any]:
    if not MODEL_PATH.exists():
        raise ModelNotTrainedError(
            "Модель не обучена. Сначала выполните обучение: POST /api/ai/train."
        )
    return joblib.load(MODEL_PATH)


def reset_cache() -> None:
    """Сбрасывает кэш загруженной модели (вызывается после переобучения)."""
    _load_artifact.cache_clear()


def is_trained() -> bool:
    return MODEL_PATH.exists()


def _risk_level(probability: float) -> str:
    if probability < 0.15:
        return "Низкий риск отказа"
    if probability < 0.40:
        return "Умеренный риск отказа"
    if probability < 0.70:
        return "Повышенный риск отказа"
    return "Высокий риск отказа"


def _blocked_response(artifact: Dict[str, Any], warnings: list, has_physical: bool) -> Dict[str, Any]:
    """Формирует ответ, когда прогноз невозможен из-за выхода за область применимости."""
    status = "invalid_input" if has_physical else "out_of_distribution"
    if has_physical:
        reason = (
            "Часть введённых значений физически некорректна или выходит за допустимые границы "
            "параметров оборудования."
        )
    else:
        reason = (
            "Введённые значения находятся вне области обучающей выборки модели (датасет AI4I 2020)."
        )
    details = " ".join(w["message"] for w in warnings)
    return {
        "can_predict": False,
        "status": status,
        "risk_level": "Недостоверный прогноз",
        "failure_probability": None,
        "failure_prediction": None,
        "risk_percent": None,
        "recommended_risk_value": None,
        "model_used": artifact["best_model_name"],
        "model_label": artifact["model_labels"].get(
            artifact["best_model_name"], artifact["best_model_name"]
        ),
        "validation_warnings": warnings,
        "interpretation": (
            f"Прогноз не выполнен: {reason} "
            f"ML-модель применима только в пределах диапазонов обучающих данных, "
            f"поэтому результат для таких значений был бы недостоверным. {details}"
        ),
    }


def predict_failure(
    type_class: str,
    air_temperature: float,
    process_temperature: float,
    rotational_speed: float,
    torque: float,
    tool_wear: float,
) -> Dict[str, Any]:
    """
    Предсказывает вероятность отказа оборудования по его рабочим параметрам.

    Перед инференсом выполняется проверка области применимости модели:
    физическая корректность параметров и попадание в диапазон обучающей выборки.
    Если данные вне области применимости, прогноз не выполняется и возвращается
    предупреждение (can_predict=false).
    """
    artifact = _load_artifact()
    model = artifact["best_model"]

    # Проверка области применимости модели до вызова инференса.
    values = {
        "air_temperature": air_temperature,
        "process_temperature": process_temperature,
        "rotational_speed": rotational_speed,
        "torque": torque,
        "tool_wear": tool_wear,
    }
    validation = validate_equipment_input(
        values=values,
        feature_stats=artifact.get("feature_stats"),
        type_class=type_class,
    )
    if validation["warnings"]:
        return _blocked_response(artifact, validation["warnings"], validation["has_physical"])

    sample = encode_single_sample(
        type_class=type_class,
        air_temperature=air_temperature,
        process_temperature=process_temperature,
        rotational_speed=rotational_speed,
        torque=torque,
        tool_wear=tool_wear,
    )

    probability = float(model.predict_proba(sample)[0, 1])
    prediction = int(probability >= 0.5)
    risk_percent = round(probability * 100, 2)

    return {
        "can_predict": True,
        "status": "ok",
        "validation_warnings": [],
        "failure_probability": round(probability, 4),
        "failure_prediction": prediction,
        "risk_percent": risk_percent,
        "risk_level": _risk_level(probability),
        "model_used": artifact["best_model_name"],
        "model_label": artifact["model_labels"].get(
            artifact["best_model_name"], artifact["best_model_name"]
        ),
        "recommended_risk_value": risk_percent,
        "interpretation": (
            f"Прогнозируемая вероятность отказа оборудования составляет {risk_percent}%. "
            f"Оценка: {_risk_level(probability).lower()}. "
            f"Прогноз получен моделью «{artifact['model_labels'].get(artifact['best_model_name'], artifact['best_model_name'])}». "
            f"Полученное значение {risk_percent}% может быть использовано как уровень риска "
            f"в модуле анализа рисков для события, связанного с простоем оборудования."
        ),
    }


def get_model_info() -> Optional[Dict[str, Any]]:
    """
    Возвращает сводную информацию об обученной модели или None,
    если модель ещё не обучена.
    """
    if not MODEL_PATH.exists():
        return None

    artifact = _load_artifact()
    best = artifact["best_model_name"]
    return {
        "status": "ready",
        "dataset_name": artifact["dataset_name"],
        "dataset_rows": artifact["dataset_rows"],
        "failure_rate": artifact["failure_rate"],
        "trained_at": artifact["trained_at"],
        "best_model": best,
        "best_model_label": artifact["model_labels"].get(best, best),
        "metrics_by_model": artifact["metrics_by_model"],
        "feature_importance": artifact["feature_importance"],
        "feature_stats": artifact.get("feature_stats", {}),
        "feature_labels": artifact["feature_labels"],
        "model_labels": artifact["model_labels"],
    }
