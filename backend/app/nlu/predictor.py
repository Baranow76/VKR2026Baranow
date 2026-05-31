"""
Разбор текстовой команды: классификация намерения (ML) + извлечение слотов (гибрид).

- intent предсказывает обученная ML-модель (нейросеть MLP);
- числовые значения и проценты извлекаются регулярными выражениями;
- target_group и parameter определяются по словарям синонимов;
- имена объектов (РЦ-1, ВЦ-2, ОП-1, СБ-1), источники копирования и множественные
  назначения объект→значение извлекаются правилами;
- формируется структура parse с флагом can_apply и предупреждениями.

Поддерживаемые намерения: update_parameter, set_parameter, create_items,
copy_items, multi_set_parameter, unknown.
"""


from __future__ import annotations

import re
from functools import lru_cache
from typing import Any, Dict, List, Optional, Tuple

import joblib

from .datasets import OBJECT_PREFIX_TO_GROUP, PARAMETER_SYNONYMS, TARGET_SYNONYMS
from .trainer import MODEL_PATH

CONFIDENCE_THRESHOLD = 0.55
MAX_COUNT_WITHOUT_CONFIRM = 20

# Регулярное выражение для кода объекта: 1–2 буквы + (опц. дефис) + цифры
# (например: РЦ-1, ВЦ-2, ОП-1, СБ-1, S1, S2).
_OBJECT_RE = re.compile(r"([А-Яа-яA-Za-z]{1,2})-?(\d+)")
_NUMBER_RE = re.compile(r"\d+(?:\.\d+)?")

WORD_NUMBERS = {
    "один": 1, "одна": 1, "одну": 1, "два": 2, "две": 2, "дважды": 2,
    "три": 3, "трижды": 3, "четыре": 4, "пять": 5, "шесть": 6,
    "семь": 7, "восемь": 8, "девять": 9, "десять": 10,
}


class NluModelNotTrainedError(RuntimeError):
    """NLU-модель ещё не обучена."""


@lru_cache(maxsize=1)
def _load_artifact() -> Dict[str, Any]:
    if not MODEL_PATH.exists():
        raise NluModelNotTrainedError(
            "NLU-модель не обучена. Сначала выполните обучение: POST /api/nlu/train."
        )
    return joblib.load(MODEL_PATH)


def reset_cache() -> None:
    _load_artifact.cache_clear()


def is_trained() -> bool:
    return MODEL_PATH.exists()


# ---------------------------------------------------------------------------
# Извлечение слотов
# ---------------------------------------------------------------------------

def _flatten(synonyms: Dict[str, List[str]]) -> List[Tuple[str, str]]:
    pairs = [(syn.lower(), canon) for canon, syns in synonyms.items() for syn in syns]
    return sorted(pairs, key=lambda p: len(p[0]), reverse=True)


_TARGET_PAIRS = _flatten(TARGET_SYNONYMS)
_PARAM_PAIRS = _flatten(PARAMETER_SYNONYMS)


def object_variants(name: str) -> List[str]:
    """Возможные написания имени объекта (с дефисом и без) для сопоставления."""
    upper = name.upper()
    no_dash = upper.replace("-", "")
    return list({upper, no_dash})


def _normalize_object(prefix: str, number: str) -> str:
    return f"{prefix.upper()}-{number}"


def _extract_objects(text: str) -> List[Tuple[str, int, int]]:
    """Возвращает список (имя_объекта, start, end) в порядке появления."""
    result = []
    for m in _OBJECT_RE.finditer(text):
        name = _normalize_object(m.group(1), m.group(2))
        result.append((name, m.start(), m.end()))
    return result


_YEAR_RE = re.compile(r"(\d+)\s*год\w*")


def _extract_year_objects(text: str) -> List[Tuple[str, int, int]]:
    """Распознаёт ссылки на периоды экономики: «1 год», «для 2 года» → «Год N»."""
    result = []
    for m in _YEAR_RE.finditer(text.lower()):
        result.append((f"Год {m.group(1)}", m.start(), m.end()))
    return result


def _group_from_object(name: str) -> Optional[str]:
    prefix = name.split("-")[0].upper()
    return OBJECT_PREFIX_TO_GROUP.get(prefix)


def _detect_target(text: str, objects: Optional[List[str]] = None) -> Optional[str]:
    t = text.lower()
    for syn, canon in _TARGET_PAIRS:
        if canon == "all":
            continue
        if syn in t:
            return canon
    for syn, canon in _TARGET_PAIRS:
        if canon == "all" and syn in t:
            return "all"
    # Если группа не названа, выводим её из кода объекта.
    if objects:
        return _group_from_object(objects[0])
    return None


def _detect_parameter(text: str) -> Optional[str]:
    t = text.lower()
    for syn, canon in _PARAM_PAIRS:
        if syn in t:
            return canon
    return None


def _detect_parameters(text: str) -> List[str]:
    """Все параметры, упомянутые в команде, в порядке появления (для «to и top»)."""
    masked = list(text.lower())
    found: List[Tuple[int, str]] = []
    for syn, canon in _PARAM_PAIRS:  # отсортированы по длине убыв.
        joined = "".join(masked)
        start = joined.find(syn)
        while start != -1:
            found.append((start, canon))
            for i in range(start, start + len(syn)):
                masked[i] = " "
            joined = "".join(masked)
            start = joined.find(syn)
    found.sort(key=lambda x: x[0])
    ordered: List[str] = []
    for _, canon in found:
        if canon not in ordered:
            ordered.append(canon)
    return ordered


def _mask_objects(text: str, objects: Optional[List[Tuple[str, int, int]]]) -> str:
    """Заменяет коды объектов пробелами, чтобы их цифры не попали в значение."""
    if not objects:
        return text
    chars = list(text)
    for _, start, end in objects:
        for i in range(start, min(end, len(chars))):
            chars[i] = " "
    return "".join(chars)


def _extract_value(
    text: str, objects: Optional[List[Tuple[str, int, int]]] = None
) -> Tuple[Optional[float], str]:
    # Маскируем коды объектов: «PUMP-25» не должен дать значение 25.
    t = _mask_objects(text, objects).lower().replace(",", ".")

    # Кратность: «в 2 раза», «вдвое», «втрое», «в полтора раза».
    if re.search(r"\bвдвое\b", t):
        return 2.0, "factor"
    if re.search(r"\bвтрое\b", t):
        return 3.0, "factor"
    if re.search(r"\bвчетверо\b", t):
        return 4.0, "factor"
    if "полтора раза" in t:
        return 1.5, "factor"
    factor = re.search(r"в\s*(\d+(?:\.\d+)?)\s*раз", t)
    if factor:
        return float(factor.group(1)), "factor"

    percent = re.search(r"(\d+(?:\.\d+)?)\s*(?:%|процент)", t)
    if percent:
        return float(percent.group(1)), "percent"
    number = _NUMBER_RE.search(t)
    if number:
        return float(number.group(0)), "absolute"
    return None, "none"


def _extract_count(text: str, objects: List[Tuple[str, int, int]]) -> Optional[int]:
    """Извлекает количество (для copy_items): целое число или числительное словом."""
    # Убираем коды объектов из текста, чтобы не спутать их цифры с количеством.
    cleaned = text
    for _, start, end in sorted(objects, key=lambda o: o[1], reverse=True):
        cleaned = cleaned[:start] + " " + cleaned[end:]
    m = re.search(r"\b(\d+)\b", cleaned)
    if m:
        return int(m.group(1))
    for word, value in WORD_NUMBERS.items():
        if re.search(rf"\b{word}\b", cleaned.lower()):
            return value
    return None


def _extract_assignments(text: str, objects: List[Tuple[str, int, int]]) -> List[Dict[str, Any]]:
    """Для multi_set_parameter: пары объект→значение.

    Для каждого объекта берётся первое число в сегменте до следующего объекта.
    """
    assignments: List[Dict[str, Any]] = []
    norm = text.replace(",", ".")
    for index, (name, _start, end) in enumerate(objects):
        next_start = objects[index + 1][1] if index + 1 < len(objects) else len(norm)
        segment = norm[end:next_start]
        m = _NUMBER_RE.search(segment)
        if not m:
            continue
        raw = float(m.group(0))
        value = int(raw) if raw.is_integer() else raw
        assignments.append({"object_name": name, "value": value})
    return assignments


# ---------------------------------------------------------------------------
# Основной разбор команды
# ---------------------------------------------------------------------------

def parse_command(
    text: str,
    allowed_parameters: Optional[List[str]] = None,
    module_type: Optional[str] = None,
) -> Dict[str, Any]:
    artifact = _load_artifact()
    intent_model = artifact["intent_model"]
    action_model = artifact["action_model"]

    clean = (text or "").strip()

    proba = intent_model.predict_proba([clean])[0]
    classes = list(intent_model.classes_)
    best_idx = int(proba.argmax())
    intent = classes[best_idx]
    confidence = round(float(proba[best_idx]), 4)

    warnings: List[str] = []
    needs_confirmation = False

    objects = _extract_objects(clean)
    object_codes = [o[0] for o in objects]
    target_group = _detect_target(clean, object_codes)
    parameters = _detect_parameters(clean)
    parameter = parameters[0] if parameters else None

    # Базовые поля.
    action = "none"
    value: Optional[float] = None
    value_type = "none"
    source_object: Optional[str] = None
    count: Optional[int] = None
    assignments: List[Dict[str, Any]] = []

    can_apply = True

    if intent == "unknown":
        can_apply = False
        warnings.append("Команда не распознана как операция над данными проекта.")

    if confidence < CONFIDENCE_THRESHOLD and intent != "unknown":
        can_apply = False
        warnings.append(
            f"Низкая уверенность модели ({confidence}). Команда не будет применена автоматически."
        )

    object_name: Optional[str] = None

    # --- update_parameter ---
    if intent == "update_parameter":
        action = str(action_model.predict([clean])[0])
        if action not in ("increase", "decrease"):
            action = "increase"
        value, value_type = _extract_value(clean, objects)
        # Один упомянутый объект → адресная правка только этого объекта.
        if len(object_codes) == 1:
            object_name = object_codes[0]
        # В контексте модуля команда без указания группы применяется ко всем записям.
        if target_group is None and parameter is not None:
            target_group = "all"
        if parameter is None:
            can_apply = False
            warnings.append("Не удалось определить изменяемый параметр.")
        if target_group is None:
            can_apply = False
            warnings.append("Не удалось определить целевую группу записей.")
        if value is None:
            can_apply = False
            warnings.append("В команде не найдено числовое значение.")

    # --- set_parameter ---
    elif intent == "set_parameter":
        action = "set"
        value, value_type = _extract_value(clean, objects)
        value_type = "absolute" if value is not None else "none"
        if len(object_codes) == 1:
            object_name = object_codes[0]
        if target_group is None and parameter is not None:
            target_group = "all"
        if parameter is None:
            can_apply = False
            warnings.append("Не удалось определить устанавливаемый параметр.")
        if target_group is None:
            can_apply = False
            warnings.append("Не удалось определить целевую группу записей.")
        if value is None:
            can_apply = False
            warnings.append("В команде не найдено числовое значение.")

    # --- create_items ---
    elif intent == "create_items":
        action = "create"
        value, _ = _extract_value(clean, objects)
        value_type = "count"
        if value is not None:
            count = int(value)
        if target_group is None:
            can_apply = False
            warnings.append("Не удалось определить тип создаваемых позиций.")
        if count is None:
            can_apply = False
            warnings.append("Не указано количество создаваемых позиций.")
        else:
            parameter = parameter or "quantity"

    # --- copy_items ---
    elif intent == "copy_items":
        action = "copy"
        value_type = "count"
        count = _extract_count(clean, objects)
        # Источник-код (РЦ-1) определяем здесь; источник по обычному имени
        # («Крышка корпуса АКБ») резолвится open-vocabulary на этапе применения.
        source_object = object_codes[0] if object_codes else None
        if target_group is None and source_object:
            target_group = _group_from_object(source_object)
        if count is None:
            can_apply = False
            warnings.append("Не указано количество создаваемых копий.")
        elif count > MAX_COUNT_WITHOUT_CONFIRM:
            needs_confirmation = True
            warnings.append(f"Будет создано {count} копий — требуется подтверждение.")

    # --- multi_set_parameter ---
    elif intent == "multi_set_parameter":
        action = "set_multiple"
        value_type = "absolute"
        # Объекты — коды (РЦ-1) либо ссылки на годы (Год 1) для экономики.
        assign_objects = objects if objects else _extract_year_objects(clean)
        assignments = _extract_assignments(clean, assign_objects)
        if target_group is None and object_codes:
            target_group = _group_from_object(object_codes[0])
        if parameter is None:
            can_apply = False
            warnings.append("Не удалось определить изменяемый параметр.")
        if not assignments:
            can_apply = False
            warnings.append("Не удалось извлечь пары «объект — значение».")

    # --- show_items: поиск/вывод записей (запрос, без изменения данных) ---
    elif intent == "show_items":
        action = "show"
        if target_group is None:
            target_group = "all"
        # Запрос не «применяется», поэтому can_apply=False, но это не ошибка.

    # Контекстная фильтрация по модулю: параметр должен быть допустим в текущем модуле.
    if allowed_parameters and parameter is not None and parameter not in allowed_parameters:
        can_apply = False
        warnings.append(
            f"Параметр «{parameter}» недоступен в текущем модуле и, вероятно, относится к другому модулю."
        )

    return {
        "text": clean,
        "intent": intent,
        "confidence": confidence,
        "action": action,
        "target_group": target_group,
        "parameter": parameter,
        "parameters": parameters,
        "value": value,
        "value_type": value_type,
        "object_name": object_name,
        "source_object": source_object,
        "count": count,
        "assignments": assignments,
        "missing_objects": [],
        "module_type": module_type,
        "available_parameters": allowed_parameters or [],
        "can_apply": can_apply,
        "needs_confirmation": needs_confirmation,
        "warnings": warnings,
    }


def get_model_info() -> Optional[Dict[str, Any]]:
    if not MODEL_PATH.exists():
        return None
    artifact = _load_artifact()
    return {
        "status": "ready",
        "intent_model_name": artifact["intent_model_name"],
        "intent_model_label": artifact["model_labels"].get(
            artifact["intent_model_name"], artifact["intent_model_name"]
        ),
        "intent_model_params": artifact.get("intent_model_params", {}),
        "intent_labels": artifact["intent_labels"],
        "action_labels": artifact["action_labels"],
        "trained_at": artifact["trained_at"],
        "dataset_rows": artifact["dataset_rows"],
    }
