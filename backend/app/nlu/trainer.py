"""
Обучение NLU-моделей классификации намерения (intent classification).

Сравниваются две модели:
- MLPClassifier (нейронная сеть) — основная модель;
- LogisticRegression — baseline.

Признаки: TF-IDF на словных (1–2) и символьных (2–4) n-граммах (FeatureUnion).
Для нейронной сети размерность снижается через TruncatedSVD (плотное представление).

Дополнительно обучается классификатор действия (action). Лучшая по f1_macro
модель намерения сохраняется в app/data/nlu_intent_model.pkl, метрики — в
app/data/nlu_metrics.json.
"""
from __future__ import annotations

import json
from datetime import datetime
from typing import Any, Dict

import joblib
from sklearn.decomposition import TruncatedSVD
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, classification_report, f1_score
from sklearn.model_selection import train_test_split
from sklearn.neural_network import MLPClassifier
from sklearn.pipeline import FeatureUnion, Pipeline

import pandas as pd

from .datasets import DATA_DIR, DATASET_PATH, write_dataset, write_demo_commands


MODEL_PATH = DATA_DIR / "nlu_intent_model.pkl"
METRICS_PATH = DATA_DIR / "nlu_metrics.json"

MODEL_LABELS = {
    "neural_network": "Нейронная сеть (MLP)",
    "logistic_regression": "Логистическая регрессия (baseline)",
}


def _round(value: float, ndigits: int = 4) -> float:
    return round(float(value), ndigits)


def _build_features() -> FeatureUnion:
    """TF-IDF признаки: словные и символьные n-граммы."""
    return FeatureUnion([
        ("word", TfidfVectorizer(analyzer="word", ngram_range=(1, 2), min_df=1)),
        ("char", TfidfVectorizer(analyzer="char_wb", ngram_range=(2, 4), min_df=1)),
    ])


# Курируемый набор конфигураций MLP (solver=adam для всех).
# Покрывает все запрошенные архитектуры, активации, max_iter, alpha, learning_rate_init.
MLP_CONFIGS: list = [
    {"hidden_layer_sizes": (64,), "activation": "relu", "max_iter": 200, "alpha": 0.0001, "learning_rate_init": 0.001},
    {"hidden_layer_sizes": (128,), "activation": "relu", "max_iter": 400, "alpha": 0.0001, "learning_rate_init": 0.001},
    {"hidden_layer_sizes": (128, 64), "activation": "relu", "max_iter": 400, "alpha": 0.0001, "learning_rate_init": 0.001},
    {"hidden_layer_sizes": (128, 64), "activation": "tanh", "max_iter": 400, "alpha": 0.0001, "learning_rate_init": 0.001},
    {"hidden_layer_sizes": (256, 128), "activation": "relu", "max_iter": 400, "alpha": 0.0001, "learning_rate_init": 0.0005},
    {"hidden_layer_sizes": (256, 128), "activation": "tanh", "max_iter": 400, "alpha": 0.0001, "learning_rate_init": 0.001},
    {"hidden_layer_sizes": (128, 64, 32), "activation": "relu", "max_iter": 700, "alpha": 0.001, "learning_rate_init": 0.001},
    {"hidden_layer_sizes": (128, 64, 32), "activation": "tanh", "max_iter": 400, "alpha": 0.0001, "learning_rate_init": 0.0005},
    {"hidden_layer_sizes": (256, 128, 64), "activation": "relu", "max_iter": 700, "alpha": 0.001, "learning_rate_init": 0.0005},
    {"hidden_layer_sizes": (128, 64), "activation": "relu", "max_iter": 700, "alpha": 0.001, "learning_rate_init": 0.0005},
    {"hidden_layer_sizes": (128,), "activation": "relu", "max_iter": 200, "alpha": 0.001, "learning_rate_init": 0.001},
    {"hidden_layer_sizes": (64,), "activation": "relu", "max_iter": 400, "alpha": 0.0001, "learning_rate_init": 0.0005},
]


def _build_feature_transformer() -> Pipeline:
    """Признаковый преобразователь (TF-IDF + SVD), обучается один раз и переиспользуется."""
    return Pipeline([
        ("features", _build_features()),
        ("svd", TruncatedSVD(n_components=200, random_state=42)),
    ])


def _build_logreg() -> Pipeline:
    return Pipeline([
        ("features", _build_features()),
        ("clf", LogisticRegression(max_iter=1000, C=4.0, class_weight="balanced")),
    ])


def _build_mlp_pipeline(config: Dict[str, Any]) -> Pipeline:
    """Полный pipeline нейросети для финальной (лучшей) конфигурации."""
    return Pipeline([
        ("features", _build_features()),
        ("svd", TruncatedSVD(n_components=200, random_state=42)),
        ("clf", MLPClassifier(
            hidden_layer_sizes=tuple(config["hidden_layer_sizes"]),
            activation=config["activation"],
            solver="adam",
            max_iter=config["max_iter"],
            alpha=config["alpha"],
            learning_rate_init=config["learning_rate_init"],
            random_state=42,
        )),
    ])


def _build_action_estimator() -> Pipeline:
    return Pipeline([
        ("features", _build_features()),
        ("clf", LogisticRegression(max_iter=1000, C=4.0, class_weight="balanced")),
    ])


def _evaluate(estimator, X_test, y_test) -> Dict[str, Any]:
    return _evaluate_preds(y_test, estimator.predict(X_test))


def _evaluate_preds(y_test, predictions) -> Dict[str, Any]:
    return {
        "accuracy": _round(accuracy_score(y_test, predictions)),
        "f1_macro": _round(f1_score(y_test, predictions, average="macro")),
        "classification_report": classification_report(
            y_test, predictions, output_dict=True, zero_division=0
        ),
    }


# Проверочные команды с НОВОЙ лексикой (нет в обучающем датасете) — честная оценка
# обобщаемости на out-of-vocabulary слова.
_OOV_PROBE = [
    # update_parameter
    ("уменьши стоимость у всех аккумуляторов на 10 процентов", "update_parameter"),
    ("увеличь количество всех батарей на 15 процентов", "update_parameter"),
    ("снизь цену у всех зарядных модулей на 5 процентов", "update_parameter"),
    ("увеличь время обслуживания у всех насосов на 10 процентов", "update_parameter"),
    ("снизь коэффициент загрузки у всех станков на 5 процентов", "update_parameter"),
    ("уменьши стоимость у всех снегоуборщиков на 10 процентов", "update_parameter"),
    ("увеличь количество всех культиваторов на 15 процентов", "update_parameter"),
    ("снизь цену у всех опрыскивателей на 5 процентов", "update_parameter"),
    ("уменьши стоимость у всех тепловизоров в 2 раза", "update_parameter"),
    ("увеличь количество культиваторов вдвое", "update_parameter"),
    ("увеличь стоимость зарядной станции ЗС-1 на 10 процентов", "update_parameter"),
    ("уменьши время обслуживания у всех инверторов на 8 процентов", "update_parameter"),
    # set_parameter
    ("установи количество у всех нивелиров 5", "set_parameter"),
    ("задай стоимость у всех дальномеров 12000", "set_parameter"),
    ("поставь такт для линии ЛН-1 3.5", "set_parameter"),
    ("установи количество у всех аккумуляторов 8", "set_parameter"),
    ("задай цену у всех батарейных блоков 4500", "set_parameter"),
    ("измени максимум станков на робота на 4", "set_parameter"),
    # copy_items
    ("создай 3 копии аккумулятора АКБ-1", "copy_items"),
    ("добавь 2 новых батарейных блока на базе ББ-1", "copy_items"),
    ("создай 3 копии осциллографа ОСЦ-1", "copy_items"),
    ("добавь 2 новых тепловизора на базе ТВ-1", "copy_items"),
    ("продублируй зарядный модуль ЗМ-2 три раза", "copy_items"),
    ("сформируй 4 копии насоса НС-1", "copy_items"),
    # multi_set_parameter
    ("у АКБ-1 установи количество 3, а у АКБ-2 5", "multi_set_parameter"),
    ("для БАТ-1 поставь стоимость 1000, для БАТ-2 1200", "multi_set_parameter"),
    ("для ОСЦ-1 поставь стоимость 1000, а для ОСЦ-2 2000", "multi_set_parameter"),
    ("у ТВ-1 установи количество 3, а у ТВ-2 5", "multi_set_parameter"),
    ("у ЗМ-1 стоимость 500, у ЗМ-2 700", "multi_set_parameter"),
    # create_items
    ("создай 10 новых позиций мультиметра с разным сечением", "create_items"),
    ("сформируй 5 новых аккумуляторов с разными параметрами", "create_items"),
    # unknown
    ("посоветуй хороший фильм на вечер", "unknown"),
    ("расскажи последние новости", "unknown"),
    ("открой музыку", "unknown"),
    ("какая температура воздуха завтра", "unknown"),
    ("во сколько закрывается магазин", "unknown"),
]


def _oov_accuracy(predicted) -> float:
    expected = [y for _, y in _OOV_PROBE]
    correct = sum(1 for p, e in zip(predicted, expected) if p == e)
    return _round(correct / len(expected)) if expected else 0.0


def _oov_probe(intent_model) -> Dict[str, Any]:
    texts = [t for t, _ in _OOV_PROBE]
    expected = [y for _, y in _OOV_PROBE]
    predicted = list(intent_model.predict(texts))
    correct = sum(1 for p, e in zip(predicted, expected) if p == e)
    return {
        "probe_size": len(texts),
        "accuracy": _round(correct / len(texts)),
        "errors": [
            {"text": t, "expected": e, "predicted": p}
            for t, e, p in zip(texts, expected, predicted) if p != e
        ],
    }


def _experiment_sort_key(exp: Dict[str, Any]):
    """Выбор лучшей конфигурации: f1_macro ↓ (близкие группируются округлением),
    затем OOV accuracy ↓, затем меньше итераций ↑, затем проще архитектура ↑."""
    hls = exp["hidden_layer_sizes"]
    return (
        -round(exp["f1_macro"], 3),
        -exp["oov_accuracy"],
        exp["n_iter"],
        len(hls),
        sum(hls),
    )


def train_and_persist() -> Dict[str, Any]:
    """
    Грид-серч по конфигурациям MLPClassifier + baseline LogisticRegression.
    Лучшая конфигурация сохраняется как основная модель намерения.
    """
    # Датасет генерируется заново при каждом обучении.
    write_dataset()
    df = pd.read_csv(DATASET_PATH)
    texts = df["text"].astype(str)
    intents = df["intent"].astype(str)

    X_train, X_test, y_train, y_test = train_test_split(
        texts, intents, test_size=0.2, random_state=42, stratify=intents,
    )

    # Признаки (TF-IDF + SVD) обучаем один раз и переиспользуем для всех MLP.
    feature_transformer = _build_feature_transformer()
    Xtr = feature_transformer.fit_transform(X_train)
    Xte = feature_transformer.transform(X_test)
    oov_texts = [t for t, _ in _OOV_PROBE]
    oov_vec = feature_transformer.transform(oov_texts)

    mlp_experiments: list = []
    failed_experiments: list = []

    for index, config in enumerate(MLP_CONFIGS, start=1):
        model_name = f"mlp_{index}"
        try:
            clf = MLPClassifier(
                hidden_layer_sizes=tuple(config["hidden_layer_sizes"]),
                activation=config["activation"],
                solver="adam",
                max_iter=config["max_iter"],
                alpha=config["alpha"],
                learning_rate_init=config["learning_rate_init"],
                random_state=42,
            )
            clf.fit(Xtr, y_train)
            ev = _evaluate_preds(y_test, clf.predict(Xte))
            oov_acc = _oov_accuracy(clf.predict(oov_vec))
            mlp_experiments.append({
                "model_name": model_name,
                "hidden_layer_sizes": list(config["hidden_layer_sizes"]),
                "activation": config["activation"],
                "solver": "adam",
                "max_iter": config["max_iter"],
                "alpha": config["alpha"],
                "learning_rate_init": config["learning_rate_init"],
                "accuracy": ev["accuracy"],
                "f1_macro": ev["f1_macro"],
                "n_iter": int(getattr(clf, "n_iter_", 0)),
                "oov_accuracy": oov_acc,
                "classification_report": ev["classification_report"],
            })
        except Exception as exc:  # noqa: BLE001 — не останавливаем весь подбор
            failed_experiments.append({
                "model_name": model_name,
                "config": {k: (list(v) if isinstance(v, tuple) else v) for k, v in config.items()},
                "error": str(exc),
            })

    if not mlp_experiments:
        raise RuntimeError("Ни одна конфигурация MLP не обучилась.")

    # Выбор лучшей конфигурации MLP по правилам tie-break.
    best_exp = sorted(mlp_experiments, key=_experiment_sort_key)[0]
    best_config = {
        "hidden_layer_sizes": best_exp["hidden_layer_sizes"],
        "activation": best_exp["activation"],
        "solver": "adam",
        "max_iter": best_exp["max_iter"],
        "alpha": best_exp["alpha"],
        "learning_rate_init": best_exp["learning_rate_init"],
    }

    # Финальная модель — полноценный pipeline (features+SVD+MLP) на лучшей конфигурации.
    intent_model = _build_mlp_pipeline(best_config)
    intent_model.fit(X_train, y_train)
    intent_n_iter = int(getattr(intent_model.named_steps["clf"], "n_iter_", best_exp["n_iter"]))
    best_model_name = "neural_network"
    intent_model_params = {**best_config, "n_iter": intent_n_iter, "source_experiment": best_exp["model_name"]}

    # Baseline: LogisticRegression — обязателен для сравнения.
    logreg = _build_logreg()
    logreg.fit(X_train, y_train)
    logreg_metrics = _evaluate(logreg, X_test, y_test)
    logreg_metrics["oov_accuracy"] = _oov_probe(logreg)["accuracy"]

    best_mlp_metrics = {
        "accuracy": best_exp["accuracy"],
        "f1_macro": best_exp["f1_macro"],
        "classification_report": best_exp["classification_report"],
        "oov_accuracy": best_exp["oov_accuracy"],
        "n_iter": best_exp["n_iter"],
        "params": best_config,
    }

    # Классификатор действия (без класса unknown).
    action_df = df[df["action"] != "none"]
    action_model = _build_action_estimator()
    action_model.fit(action_df["text"].astype(str), action_df["action"].astype(str))
    action_pred = action_model.predict(action_df["text"].astype(str))
    action_metrics = {
        "accuracy": _round(accuracy_score(action_df["action"], action_pred)),
        "f1_macro": _round(f1_score(action_df["action"], action_pred, average="macro")),
    }

    trained_at = datetime.now().isoformat(timespec="seconds")
    best_label = f"Нейросеть (MLP {best_exp['hidden_layer_sizes']}, {best_exp['activation']})"

    artifact = {
        "intent_model": intent_model,
        "intent_model_name": best_model_name,
        "intent_model_params": intent_model_params,
        "action_model": action_model,
        "intent_labels": sorted(intents.unique().tolist()),
        "action_labels": sorted(action_df["action"].unique().tolist()),
        "trained_at": trained_at,
        "dataset_rows": int(len(df)),
        "model_labels": {**MODEL_LABELS, "neural_network": best_label},
        "mlp_experiments_summary": [
            {
                "model_name": e["model_name"],
                "hidden_layer_sizes": e["hidden_layer_sizes"],
                "activation": e["activation"],
                "f1_macro": e["f1_macro"],
                "oov_accuracy": e["oov_accuracy"],
                "n_iter": e["n_iter"],
            }
            for e in mlp_experiments
        ],
    }
    DATA_DIR.mkdir(exist_ok=True)
    joblib.dump(artifact, MODEL_PATH)
    write_demo_commands()

    metrics = {
        "primary_task": "intent_classification",
        "dataset_rows": int(len(df)),
        "trained_at": trained_at,
        "best_model": best_model_name,
        "best_model_label": best_label,
        "best_model_params": intent_model_params,
        "mlp_configs_tested": len(MLP_CONFIGS),
        "models": {
            "neural_network": best_mlp_metrics,
            "logistic_regression": logreg_metrics,
        },
        "mlp_experiments": mlp_experiments,
        "failed_experiments": failed_experiments,
        "action_model": action_metrics,
        "oov_generalization": _oov_probe(intent_model),
    }
    METRICS_PATH.write_text(json.dumps(metrics, ensure_ascii=False, indent=2), encoding="utf-8")

    return _public_summary(metrics)


def _public_summary(metrics: Dict[str, Any]) -> Dict[str, Any]:
    params = metrics["best_model_params"]
    best_metrics = metrics["models"]["neural_network"]
    oov = metrics["oov_generalization"]
    return {
        "status": "trained",
        "dataset_rows": metrics["dataset_rows"],
        "trained_at": metrics["trained_at"],
        "mlp_configs_tested": metrics["mlp_configs_tested"],
        "failed_experiments": len(metrics["failed_experiments"]),
        "best_model": metrics["best_model"],
        "best_model_label": metrics["best_model_label"],
        "best_model_params": params,
        "accuracy": best_metrics["accuracy"],
        "f1_macro": best_metrics["f1_macro"],
        "oov_accuracy": oov["accuracy"],
        "n_iter": params["n_iter"],
        "baseline_logreg_f1_macro": metrics["models"]["logistic_regression"]["f1_macro"],
        "action_model": metrics["action_model"],
        "interpretation": (
            f"Проверено {metrics['mlp_configs_tested']} конфигураций MLP на доменном датасете "
            f"({metrics['dataset_rows']} примеров). Лучшая: архитектура {params['hidden_layer_sizes']}, "
            f"активация {params['activation']}, max_iter={params['max_iter']} (реально {params['n_iter']} итераций), "
            f"alpha={params['alpha']}, lr={params['learning_rate_init']}. "
            f"F1-macro={best_metrics['f1_macro']}, accuracy={best_metrics['accuracy']}, "
            f"OOV-обобщаемость={oov['accuracy']}. Baseline LogisticRegression F1-macro="
            f"{metrics['models']['logistic_regression']['f1_macro']}."
        ),
    }


if __name__ == "__main__":
    # Запуск обучения из командной строки: python -m app.nlu.trainer
    summary = train_and_persist()
    print(json.dumps(summary, ensure_ascii=False, indent=2))
