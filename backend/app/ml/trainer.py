"""
Обучение моделей прогнозирования отказов оборудования.

Сценарий:
1. Загрузка датасета AI4I 2020 (кэш или UCI).
2. Предобработка признаков.
3. Стратифицированное разбиение train/test.
4. Обучение Random Forest и нейронной сети (MLP).
5. Оценка по accuracy, precision, recall, F1 и ROC-AUC.
6. Выбор лучшей модели по F1-мере (устойчива к дисбалансу классов).
7. Сохранение артефакта модели в app/data/ai_model.pkl через joblib.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Dict

import joblib
from sklearn.metrics import (
    accuracy_score,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.model_selection import train_test_split

from .models import (
    DATA_DIR,
    FEATURE_COLUMNS,
    FEATURE_LABELS,
    MODEL_LABELS,
    MODEL_PATH,
    NUMERIC_FEATURES,
    TARGET_COLUMN,
    build_estimators,
    load_dataset,
    preprocess_features,
)


def _round(value: float, ndigits: int = 4) -> float:
    return round(float(value), ndigits)


def _evaluate(estimator, X_test, y_test) -> Dict[str, Any]:
    """Считает набор метрик качества классификации."""
    predictions = estimator.predict(X_test)
    try:
        proba = estimator.predict_proba(X_test)[:, 1]
        roc_auc = _round(roc_auc_score(y_test, proba))
    except Exception:
        roc_auc = None

    tn, fp, fn, tp = confusion_matrix(y_test, predictions, labels=[0, 1]).ravel()

    return {
        "accuracy": _round(accuracy_score(y_test, predictions)),
        "precision": _round(precision_score(y_test, predictions, zero_division=0)),
        "recall": _round(recall_score(y_test, predictions, zero_division=0)),
        "f1": _round(f1_score(y_test, predictions, zero_division=0)),
        "roc_auc": roc_auc,
        "confusion_matrix": {
            "true_negative": int(tn),
            "false_positive": int(fp),
            "false_negative": int(fn),
            "true_positive": int(tp),
        },
    }


def _feature_stats(df) -> Dict[str, Dict[str, float]]:
    """
    Считает статистику обучающей выборки (min/max/mean/std) для числовых признаков.
    Используется при инференсе для проверки области применимости модели.
    """
    stats: Dict[str, Dict[str, float]] = {}
    for column in NUMERIC_FEATURES:
        series = df[column].astype(float)
        stats[column] = {
            "min": _round(float(series.min()), 3),
            "max": _round(float(series.max()), 3),
            "mean": _round(float(series.mean()), 3),
            "std": _round(float(series.std()), 3),
        }
    return stats


def _feature_importance(random_forest_pipeline) -> Dict[str, float]:
    """
    Возвращает важность признаков из Random Forest (всегда интерпретируема),
    отсортированную по убыванию вклада.
    """
    clf = random_forest_pipeline.named_steps["clf"]
    importances = clf.feature_importances_
    pairs = sorted(zip(FEATURE_COLUMNS, importances), key=lambda x: x[1], reverse=True)
    return {feature: _round(float(value)) for feature, value in pairs}


def train_and_persist() -> Dict[str, Any]:
    """
    Обучает обе модели, выбирает лучшую по F1 и сохраняет артефакт на диск.
    Возвращает сводку метрик для отображения в интерфейсе.
    """
    df = load_dataset()
    X = preprocess_features(df)
    y = df[TARGET_COLUMN].astype(int)

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.25, random_state=42, stratify=y,
    )

    estimators = build_estimators()
    trained: Dict[str, Any] = {}
    metrics_by_model: Dict[str, Any] = {}

    for name, estimator in estimators.items():
        estimator.fit(X_train, y_train)
        trained[name] = estimator
        metrics_by_model[name] = _evaluate(estimator, X_test, y_test)

    # Выбор лучшей модели по F1-мере (учитывает дисбаланс классов).
    best_model_name = max(metrics_by_model, key=lambda n: metrics_by_model[n]["f1"])
    best_model = trained[best_model_name]

    feature_importance = _feature_importance(trained["random_forest"])
    feature_stats = _feature_stats(df)

    artifact = {
        "best_model": best_model,
        "best_model_name": best_model_name,
        "feature_columns": FEATURE_COLUMNS,
        "feature_labels": FEATURE_LABELS,
        "model_labels": MODEL_LABELS,
        "metrics_by_model": metrics_by_model,
        "feature_importance": feature_importance,
        "feature_stats": feature_stats,
        "trained_at": datetime.now().isoformat(timespec="seconds"),
        "dataset_rows": int(len(df)),
        "failure_rate": _round(float(y.mean())),
        "dataset_name": "AI4I 2020 Predictive Maintenance Dataset (UCI id=601)",
    }

    DATA_DIR.mkdir(exist_ok=True)
    joblib.dump(artifact, MODEL_PATH)

    return _public_summary(artifact)


def _public_summary(artifact: Dict[str, Any]) -> Dict[str, Any]:
    """Готовит безопасную для сериализации сводку (без самого объекта модели)."""
    best = artifact["best_model_name"]
    best_metrics = artifact["metrics_by_model"][best]
    return {
        "status": "trained",
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
        "interpretation": (
            f"Обучены две модели на датасете {artifact['dataset_name']} "
            f"({artifact['dataset_rows']} наблюдений). По F1-мере лучший результат показала модель "
            f"«{artifact['model_labels'].get(best, best)}» (F1 = {best_metrics['f1']}, "
            f"ROC-AUC = {best_metrics['roc_auc']}). Наиболее влиятельный признак — "
            f"«{artifact['feature_labels'].get(next(iter(artifact['feature_importance'])), '')}»."
        ),
    }
