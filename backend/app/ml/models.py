"""
ML-модуль: конфигурация, загрузка данных и определение моделей машинного обучения
для задачи прогнозирования отказов оборудования (predictive maintenance).

Датасет: AI4I 2020 Predictive Maintenance Dataset (UCI ML Repository, id=601).
Целевая переменная — "Machine failure" (бинарная классификация: 0 — норма, 1 — отказ).

Модуль реализован отдельно от расчётного ядра (app/core/calculations.py)
и не изменяет его поведение.
"""
from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List, Optional

import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.neural_network import MLPClassifier
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

# ---------------------------------------------------------------------------
# Пути и константы
# ---------------------------------------------------------------------------

BASE_DIR = Path(__file__).resolve().parent.parent  # .../backend/app
DATA_DIR = BASE_DIR / "data"
DATASET_CACHE = DATA_DIR / "ai4i2020.csv"
MODEL_PATH = DATA_DIR / "ai_model.pkl"

UCI_DATASET_ID = 601

# Категориальный признак качества изделия (L/M/H) → порядковое кодирование.
TYPE_MAPPING: Dict[str, int] = {"L": 0, "M": 1, "H": 2}

# Числовые признаки в порядке, ожидаемом моделью.
NUMERIC_FEATURES: List[str] = [
    "Air temperature",
    "Process temperature",
    "Rotational speed",
    "Torque",
    "Tool wear",
]

# Итоговый порядок признаков для обучения и инференса.
FEATURE_COLUMNS: List[str] = ["Type"] + NUMERIC_FEATURES

# Человекочитаемые подписи признаков (для интерфейса и интерпретации).
FEATURE_LABELS: Dict[str, str] = {
    "Type": "Класс изделия (L/M/H)",
    "Air temperature": "Температура воздуха, K",
    "Process temperature": "Температура процесса, K",
    "Rotational speed": "Скорость вращения, об/мин",
    "Torque": "Крутящий момент, Н·м",
    "Tool wear": "Износ инструмента, мин",
}

TARGET_COLUMN = "Machine failure"

# Соответствие полей запроса (snake_case) колонкам датасета.
INPUT_TO_FEATURE: Dict[str, str] = {
    "air_temperature": "Air temperature",
    "process_temperature": "Process temperature",
    "rotational_speed": "Rotational speed",
    "torque": "Torque",
    "tool_wear": "Tool wear",
}

# Физически допустимые границы параметров (жёсткая проверка корректности ввода).
# None означает отсутствие ограничения с этой стороны.
# exclusive_min=True означает строгое «больше» (значение не может равняться min).
PHYSICAL_BOUNDS: Dict[str, Dict[str, Any]] = {
    "Air temperature": {"min": 250.0, "max": 400.0},
    "Process temperature": {"min": 250.0, "max": 450.0},
    "Rotational speed": {"min": 0.0, "max": None, "exclusive_min": True},
    "Torque": {"min": 0.0, "max": None},
    "Tool wear": {"min": 0.0, "max": None},
}

# Допуск для проверки выхода за обучающую выборку (10% от ширины диапазона).
OOD_TOLERANCE = 0.10


def _fmt_range(lo: Optional[float], hi: Optional[float]) -> str:
    if lo is not None and hi is not None:
        return f"от {lo} до {hi}"
    if lo is not None:
        return f"не менее {lo}"
    if hi is not None:
        return f"не более {hi}"
    return "—"


def validate_equipment_input(
    values: Dict[str, float],
    feature_stats: Optional[Dict[str, Dict[str, float]]],
    type_class: str,
) -> Dict[str, Any]:
    """
    Проверяет область применимости модели до вызова инференса.

    Выполняет две проверки:
    1. Физическая корректность параметров (жёсткие границы PHYSICAL_BOUNDS).
    2. Выход за пределы обучающей выборки AI4I 2020 (диапазон min/max + допуск 10%).

    Возвращает словарь:
      - warnings: список предупреждений по конкретным параметрам;
      - has_physical: есть ли физически некорректные значения.
    """
    warnings: List[Dict[str, Any]] = []

    # 1. Класс изделия должен быть L / M / H.
    if str(type_class).upper() not in TYPE_MAPPING:
        warnings.append({
            "parameter": "type_class",
            "label": FEATURE_LABELS["Type"],
            "value": type_class,
            "type": "invalid",
            "message": (
                f"Недопустимый класс изделия «{type_class}». "
                f"Допустимые значения: L, M, H."
            ),
        })

    # 2. Физические границы.
    for input_key, feature in INPUT_TO_FEATURE.items():
        value = values[input_key]
        bounds = PHYSICAL_BOUNDS[feature]
        lo, hi = bounds["min"], bounds["max"]
        exclusive = bounds.get("exclusive_min", False)

        violated = False
        if lo is not None:
            if exclusive and value <= lo:
                violated = True
            elif not exclusive and value < lo:
                violated = True
        if hi is not None and value > hi:
            violated = True

        if violated:
            warnings.append({
                "parameter": input_key,
                "label": FEATURE_LABELS[feature],
                "value": value,
                "type": "physical",
                "physical_range": {"min": lo, "max": hi},
                "message": (
                    f"Значение {value} физически некорректно для параметра "
                    f"«{FEATURE_LABELS[feature]}» (допустимый диапазон: {_fmt_range(lo, hi)})."
                ),
            })

    # 3. Выход за обучающую выборку (только для параметров без физического нарушения).
    physically_bad = {w["parameter"] for w in warnings if w["type"] == "physical"}
    if feature_stats:
        for input_key, feature in INPUT_TO_FEATURE.items():
            if input_key in physically_bad:
                continue
            stats = feature_stats.get(feature)
            if not stats:
                continue

            value = values[input_key]
            span = float(stats["max"]) - float(stats["min"])
            tol = span * OOD_TOLERANCE
            low_allowed = float(stats["min"]) - tol
            high_allowed = float(stats["max"]) + tol

            if value < low_allowed or value > high_allowed:
                warnings.append({
                    "parameter": input_key,
                    "label": FEATURE_LABELS[feature],
                    "value": value,
                    "type": "out_of_distribution",
                    "training_range": {"min": stats["min"], "max": stats["max"]},
                    "message": (
                        f"Значение {value} выходит за диапазон обучающей выборки для "
                        f"«{FEATURE_LABELS[feature]}» ({stats['min']}–{stats['max']}). "
                        f"Прогноз модели для таких значений недостоверен."
                    ),
                })

    has_physical = any(w["type"] in ("physical", "invalid") for w in warnings)
    return {"warnings": warnings, "has_physical": has_physical}


# ---------------------------------------------------------------------------
# Загрузка и предобработка данных
# ---------------------------------------------------------------------------

def load_dataset() -> pd.DataFrame:
    """
    Загружает датасет AI4I 2020.

    Приоритет — локальный кэш (app/data/ai4i2020.csv), что гарантирует
    работоспособность без доступа в интернет (например, во время защиты ВКР).
    Если кэша нет, данные подтягиваются из UCI ML Repository и кэшируются.
    """
    if DATASET_CACHE.exists():
        return pd.read_csv(DATASET_CACHE)

    # Fallback: загрузка из открытого репозитория UCI.
    from ucimlrepo import fetch_ucirepo

    dataset = fetch_ucirepo(id=UCI_DATASET_ID)
    df = pd.concat([dataset.data.features, dataset.data.targets], axis=1)
    DATA_DIR.mkdir(exist_ok=True)
    df.to_csv(DATASET_CACHE, index=False)
    return df


def preprocess_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    Готовит матрицу признаков X в фиксированном порядке FEATURE_COLUMNS.
    Категориальный Type кодируется порядково через TYPE_MAPPING.
    """
    data = df.copy()
    data["Type"] = data["Type"].map(TYPE_MAPPING).fillna(0).astype(int)
    return data[FEATURE_COLUMNS]


def encode_single_sample(
    type_class: str,
    air_temperature: float,
    process_temperature: float,
    rotational_speed: float,
    torque: float,
    tool_wear: float,
) -> pd.DataFrame:
    """Формирует один объект-наблюдение в формате, ожидаемом моделью."""
    row = {
        "Type": TYPE_MAPPING.get(str(type_class).upper(), 0),
        "Air temperature": air_temperature,
        "Process temperature": process_temperature,
        "Rotational speed": rotational_speed,
        "Torque": torque,
        "Tool wear": tool_wear,
    }
    return pd.DataFrame([row])[FEATURE_COLUMNS]


# ---------------------------------------------------------------------------
# Определение моделей
# ---------------------------------------------------------------------------

def build_estimators() -> Dict[str, Pipeline]:
    """
    Возвращает два сравниваемых алгоритма:

    1. Random Forest — ансамбль деревьев решений, устойчив к дисбалансу классов
       (class_weight="balanced"), даёт интерпретируемую важность признаков.
    2. Многослойный перцептрон (MLP) — нейронная сеть прямого распространения
       со стандартизацией признаков в составе пайплайна.

    Каждый алгоритм оформлен как Pipeline, поэтому масштабирование инкапсулировано
    внутри модели и автоматически применяется при инференсе.
    """
    random_forest = Pipeline(steps=[
        ("scaler", StandardScaler()),  # на RF не влияет, но унифицирует пайплайны
        ("clf", RandomForestClassifier(
            n_estimators=200,
            max_depth=None,
            class_weight="balanced",
            random_state=42,
            n_jobs=-1,
        )),
    ])

    neural_network = Pipeline(steps=[
        ("scaler", StandardScaler()),  # критично для сходимости MLP
        ("clf", MLPClassifier(
            hidden_layer_sizes=(32, 16),
            activation="relu",
            solver="adam",
            max_iter=500,
            random_state=42,
            early_stopping=True,
        )),
    ])

    return {
        "random_forest": random_forest,
        "neural_network": neural_network,
    }


MODEL_LABELS: Dict[str, str] = {
    "random_forest": "Случайный лес (Random Forest)",
    "neural_network": "Нейронная сеть (MLP)",
}
