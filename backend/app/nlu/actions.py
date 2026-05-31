"""
Action engine: преобразование результата NLU в безопасное действие над записями.

Работает с переданным списком записей (records) — не затрагивает базу данных и
расчётное ядро. Поддерживает намерения: update_parameter, set_parameter,
create_items, copy_items, multi_set_parameter.

Режимы:
- build_preview: предварительный просмотр изменений без их применения;
- apply_command: фактическое применение при выполнении условий безопасности.
"""
from __future__ import annotations

import os
import re
from copy import deepcopy
from difflib import SequenceMatcher
from typing import Any, Dict, List, Optional

from .datasets import ACTION_VERBS, PARAMETER_SYNONYMS
from .predictor import _extract_objects, object_variants, parse_command

_NUM_RE = re.compile(r"\d+(?:[.,]\d+)?")

TARGET_KEYWORDS: Dict[str, str] = {
    "редуктор": "редуктор",
    "вентилятор": "вентилятор",
    "роботизированная операция": "робот",
    "сборка": "сборк",
    "операция": "операц",
}

MAX_AFFECTED_WITHOUT_CONFIRM = 50

# Порог нечёткого совпадения слова команды с токеном записи.
FUZZY_THRESHOLD = 0.78
PREFIX_MIN = 5

# Служебные слова, не являющиеся объектами (для open-vocabulary привязки).
_STOPWORDS = {
    "всех", "все", "всё", "для", "новых", "новые", "новый", "новую", "позиций", "позиции",
    "позицию", "копий", "копии", "копию", "штук", "года", "год", "данные", "возьми",
    "базе", "основе", "образцу", "процентов", "процент", "равным", "поставь", "задай",
    "установи", "процента", "значение", "каждого", "каждой", "штуки",
    # Короткие служебные слова (предлоги/союзы): после снижения порога длины
    # предметных термов до 3 символов они не должны считаться объектами.
    "под", "над", "при", "без", "или", "что", "как", "это", "так", "уже",
}


def _noise_tokens() -> set:
    """Слова, которые не считаются объектами: глаголы действий и названия параметров."""
    noise = set(_STOPWORDS)
    for verbs in ACTION_VERBS.values():
        for verb in verbs:
            noise.update(verb.split())
    for synonyms in PARAMETER_SYNONYMS.values():
        for syn in synonyms:
            noise.update(syn.split())
    return noise


_NOISE = _noise_tokens()
_WORD_RE = re.compile(r"[а-яёa-z0-9\-]+", re.IGNORECASE)


def _content_terms(text: str) -> List[str]:
    """Слова-объекты команды: всё, кроме глаголов, параметров, чисел и стоп-слов.

    Порог длины — 3 символа: короткие предметные слова («рам», «вал», «ось»)
    тоже являются объектами команды и не должны отбрасываться. Служебные слова
    такой длины («под», «над», «при», «для») отсеиваются через _NOISE/_STOPWORDS.
    """
    terms = []
    for token in _WORD_RE.findall(text.lower()):
        if len(token) < 3:
            continue
        if token in _NOISE:
            continue
        if re.fullmatch(r"[\d.,\-]+", token):
            continue
        terms.append(token)
    return terms


def _object_terms(text: str) -> List[str]:
    """Только ПРЕДМЕТНЫЕ слова-объекты команды — для выбора целевых записей.

    Разделение слов команды на два типа:
      А) слова действий и параметров («уменьши», «всех», «время», «переналадки»,
         «количество», «стоимость», «процентов» …) — НЕ участвуют в выборе записей;
      Б) предметные слова объекта («кронштейнов», «рам», «шестерён», «втулок» …) —
         именно по ним выбираются записи.

    Тип А целиком содержится в _NOISE (глаголы ACTION_VERBS + синонимы
    PARAMETER_SYNONYMS + служебные _STOPWORDS), поэтому _content_terms() их уже
    отбрасывает. Эта функция — явная точка извлечения объектных термов: цель
    выборки строится по ОБЪЕКТУ команды, а не по её ПАРАМЕТРУ. Так команда
    «уменьши у всех кронштейнов время переналадки на 10 процентов» даёт
    object_terms == ["кронштейнов"], а не ["кронштейнов", "время", "переналадки",
    "процентов"].
    """
    return _content_terms(text)


def _record_tokens(record: Dict[str, Any]) -> List[str]:
    haystack = f"{record.get('name', '')} {record.get('group', '')}".lower()
    return [t for t in _WORD_RE.findall(haystack) if len(t) >= 3]


# Типовые окончания русских существительных (множ./родит. и др. падежи).
# Проверяются от длинных к коротким, чтобы отсечь правильный суффикс.
# Без тяжёлых NLP-библиотек: грубая нормализация словоформ к общей основе.
_RU_ENDINGS = (
    "иями", "ами", "ями", "ыми", "ими",
    "ов", "ев", "ей", "ах", "ях", "ам", "ям", "ом", "ем", "ой", "ою", "ые", "ие",
    "а", "я", "ы", "и", "у", "ю", "е", "о", "ь", "й",
)


# Словарные нормализации нерегулярных словоформ, которые грубый суффиксный
# стеммер не сводит к общей основе (беглые гласные, чередования). Приводят
# разные падежи одного объекта к единой основе:
#   «рам»/«рама»/«рамы» → «рам», «шестерен»/«шестерён»/«шестерня» → «шестерн»,
#   «втулок»/«втулка»/«втулки» → «втулк».
_STEM_OVERRIDES = {
    "рам": "рам", "рама": "рам", "рамы": "рам", "рамой": "рам", "рамах": "рам",
    "шестерен": "шестерн", "шестерён": "шестерн", "шестерня": "шестерн",
    "шестерни": "шестерн", "шестерней": "шестерн",
    "втулок": "втулк", "втулка": "втулк", "втулки": "втулк", "втулок.": "втулк",
}


def _stem(word: str) -> str:
    """Нормализует словоформу, отсекая типовое русское окончание.

    Оставляет основу длиной не менее 3 символов, иначе слово не трогается:
    «кронштейнов» → «кронштейн», «редукторов» → «редуктор», «рама»/«рамы» → «рам»,
    «валов» → «вал». Нерегулярные формы обрабатываются словарём _STEM_OVERRIDES.
    Для слов без распознанного окончания возвращается как есть.
    """
    w = word.lower()
    if w in _STEM_OVERRIDES:
        return _STEM_OVERRIDES[w]
    for ending in _RU_ENDINGS:  # длинные окончания — первыми
        if w.endswith(ending) and len(w) - len(ending) >= 3:
            return w[: -len(ending)]
    return w


def _token_sim(a: str, b: str) -> float:
    """Строгое сходство двух слов для привязки объекта команды к записи.

    Логика (от строгой к мягкой), без слишком низкого fuzzy-порога:
      1) точное совпадение после нормализации регистра;
      2) совпадение нормализованной ОСНОВЫ — «кронштейнов» ↔ «кронштейн»,
         «рам» ↔ «рама», «шестерён» ↔ «шестерня», «втулок» ↔ «втулка»;
      3) совпадение по достаточно длинному общему префиксу (склонения:
         «плазморезов» ↔ «плазморез», «шестерен» ↔ «шестерня»);
      4) редактное расстояние — ТОЛЬКО для слов длиной ≥ 5 символов. Для коротких
         слов (≤ 4) мягкое сходство даёт ложные совпадения («рам» ↔ «рамп»),
         поэтому короткие слова сопоставляются исключительно по основе/префиксу.

    Гарантии: «кронштейнов» совпадает с «кронштейн», но НЕ с «шестерня», «рама»,
    «сварная»; «рам» совпадает с «рама», но НЕ с «кронштейн».
    """
    a, b = a.lower(), b.lower()
    if a == b:
        return 1.0
    # Совпадение нормализованной основы («кронштейнов» ↔ «кронштейн», «рам» ↔ «рама»).
    sa, sb = _stem(a), _stem(b)
    if sa == sb and len(sa) >= 3:
        return 0.97
    # Совпадение основы по общему префиксу (склонения: «плазморезов» ↔ «плазморез»).
    common = 0
    for ca, cb in zip(a, b):
        if ca == cb:
            common += 1
        else:
            break
    if common >= PREFIX_MIN and common >= min(len(a), len(b)) - 3:
        return 0.95
    # Мягкое редактное расстояние — только для достаточно длинных слов.
    if min(len(a), len(b)) >= 5:
        return SequenceMatcher(None, a, b).ratio()
    return 0.0


def _record_mentioned(record: Dict[str, Any], terms: List[str]) -> bool:
    """Истина, если предметное слово команды совпало с name/group записи.

    Сопоставление идёт ТОЛЬКО с токенами имени и группы (см. _record_tokens),
    но не с параметрами записи (setup_time, cost …). Поэтому запись не может быть
    выбрана из-за того, что у неё есть параметр «время переналадки» — выбор всегда
    строится по объекту команды, а не по её параметру.
    """
    if not terms:
        return False
    rec_tokens = _record_tokens(record)
    for term in terms:
        for rt in rec_tokens:
            if _token_sim(term, rt) >= FUZZY_THRESHOLD:
                return True
    return False


def _matches_target(record: Dict[str, Any], target_group: str) -> bool:
    if target_group == "all":
        return True
    keyword = TARGET_KEYWORDS.get(target_group, target_group)
    haystack = f"{record.get('name', '')} {record.get('group', '')}".lower()
    return keyword in haystack


def _debug_targets(
    parsed: Dict[str, Any],
    records: List[Dict[str, Any]],
    terms: List[str],
    selected: List[Dict[str, Any]],
) -> None:
    """Временный диагностический вывод выбора целевых записей.

    Активируется переменной окружения NLU_DEBUG_TARGETS=1 (по умолчанию выключен,
    в проде не печатает). Показывает, как команда привязывается к записям:
    исходный текст, parsed-поля, предметные термы и для каждой выбранной записи —
    какой term/token дал совпадение и с каким значением similarity.
    """
    if os.environ.get("NLU_DEBUG_TARGETS") not in ("1", "true", "True"):
        return
    print("\n===== NLU DEBUG: выбор целевых записей =====")
    print(f"text         : {parsed.get('text')!r}")
    print(f"target_group : {parsed.get('target_group')!r}")
    print(f"parameter    : {parsed.get('parameter')!r}")
    print(f"value        : {parsed.get('value')!r}")
    print(f"value_type   : {parsed.get('value_type')!r}")
    print(f"object_terms : {terms}")
    print(f"всего записей: {len(records)} | выбрано: {len(selected)}")
    sel_names = {r.get("name") for r in selected}
    for record in records:
        if record.get("name") not in sel_names:
            continue
        toks = _record_tokens(record)
        hits = []
        for term in terms:
            for rt in toks:
                sim = _token_sim(term, rt)
                if sim >= FUZZY_THRESHOLD:
                    hits.append(f"{term!r}~{rt!r}={sim:.3f}")
        print(f"  + {record.get('name'):34} group={record.get('group')!r} "
              f"tokens={toks} matched=[{', '.join(hits)}]")
    print("===========================================\n")


def _target_records(parsed: Dict[str, Any], records: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Open-vocabulary привязка записей к команде.

    Приоритет:
    1. конкретный код объекта (РЦ-1) → только он;
    2. в команде есть предметные слова («кронштейнов», «рам») → строго по совпадению
       с реальными name/group записей (с учётом словоформ). Если предметное слово
       есть, но совпадений нет — НЕ применяем ко всем, возвращаем пустой список;
    3. предметных слов нет, но указана известная группа из словаря → по группе;
    4. действительно общая команда («у всех», «все позиции») без уточняющего
       предметного слова → все записи.

    Ключевое отличие от прежней логики: «у всех кронштейнов» означает «все
    кронштейны», а не «все записи проекта». Расширение до всех записей допускается
    только при ОТСУТСТВИИ предметного слова в команде.
    """
    # 1) Конкретный код объекта (РЦ-1, ВЦ-2 …) — адресно только он.
    object_name = parsed.get("object_name")
    if object_name:
        record = _find_record(records, object_name)
        return [record] if record else []

    target_group = parsed.get("target_group")
    # Только предметные слова объекта (без слов действий/параметров).
    terms = _object_terms(parsed.get("text", ""))

    # 2) Есть предметные слова → выбираем строго по совпадению с записями.
    if terms:
        mentioned = [r for r in records if _record_mentioned(r, terms)]
        _debug_targets(parsed, records, terms, mentioned)
        if mentioned:
            return mentioned
        # Предметное слово задаёт известную группу словаря — пробуем сопоставить по ней.
        if target_group and target_group != "all":
            keyword_matched = [r for r in records if _matches_target(r, target_group)]
            if keyword_matched:
                return keyword_matched
        # Предметное слово есть, но подходящих записей нет: применять ко всем нельзя.
        return []

    # 3) Предметных слов нет, но есть известная группа из словаря.
    if target_group and target_group != "all":
        return [r for r in records if _matches_target(r, target_group)]

    # 4) Действительно общая команда без уточнения («увеличь притоки на 10%») → все записи.
    if target_group == "all":
        return list(records)
    return []


_SOURCE_MARKERS = [
    "данные возьми от", "данные возьмите от", "на базе", "на основе",
    "по образцу", "по данным", "возьми от", "копии", "копий", "копию",
    "продублируй", "дубликат",
]


def _extract_source_phrase(text: str) -> Optional[str]:
    """Возвращает фрагмент после маркера источника («на базе ...», «копии ...»)."""
    low = text.lower()
    best_pos = -1
    best_marker = ""
    for marker in _SOURCE_MARKERS:
        pos = low.rfind(marker)
        if pos > best_pos:
            best_pos = pos
            best_marker = marker
    if best_pos < 0:
        return None
    return text[best_pos + len(best_marker):].strip(" .,:-")


def _best_record(records: List[Dict[str, Any]], terms: List[str]):
    """Запись с наибольшим числом совпавших слов-объектов (для резолвинга источника)."""
    best, best_score = None, 0
    for record in records:
        rec_tokens = _record_tokens(record)
        score = 0
        for term in terms:
            if any(_token_sim(term, rt) >= FUZZY_THRESHOLD for rt in rec_tokens):
                score += 1
        if score > best_score:
            best, best_score = record, score
    return best, best_score


def _segment_value(segment: str) -> Optional[float]:
    """Последнее число в сегменте, исключая цифры внутри кодов объектов."""
    masked = list(segment)
    for _, start, end in _extract_objects(segment):
        for i in range(start, min(end, len(masked))):
            masked[i] = " "
    numbers = _NUM_RE.findall("".join(masked).replace(",", "."))
    if not numbers:
        return None
    return float(numbers[-1])


def _open_assignments(text: str, records: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Open-vocabulary разбор множественных назначений по полным именам.

    Делит команду на сегменты (по запятым и союзам «а»/«и»), в каждом находит
    наиболее похожую реальную запись и числовое значение. Работает с полными
    наименованиями («Пакет пластин P/N 75 переналадка 3.5, Клемма КС-1 ... 2»).
    """
    segments = re.split(r"\s*[,;]\s*|\s+а\s+|\s+и\s+", text)
    assignments: List[Dict[str, Any]] = []
    used = set()
    for segment in segments:
        value = _segment_value(segment)
        if value is None:
            continue
        terms = _content_terms(segment)
        record, score = _best_record(records, terms)
        if record is None or score < 1:
            continue
        name = record.get("name")
        if name in used:
            continue
        used.add(name)
        assignments.append({
            "object_name": name,
            "value": int(value) if float(value).is_integer() else value,
        })
    return assignments


def _resolve_source(parsed: Dict[str, Any], records: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """Находит запись-источник для copy: по коду либо open-vocabulary по имени."""
    name = parsed.get("source_object")
    if name:
        found = _find_record(records, name)
        if found:
            return found
    phrase = _extract_source_phrase(parsed.get("text", ""))
    terms = _content_terms(phrase) if phrase else _content_terms(parsed.get("text", ""))
    best, score = _best_record(records, terms)
    return best if score >= 1 else None


def _find_record(records: List[Dict[str, Any]], object_name: str) -> Optional[Dict[str, Any]]:
    variants = [v.lower() for v in object_variants(object_name)]
    for record in records:
        name = str(record.get("name", "")).lower().replace(" ", "")
        name_spaced = str(record.get("name", "")).lower()
        for variant in variants:
            if variant.lower() in name_spaced or variant.lower() in name:
                return record
    return None


def _compute_new_value(action: str, old: float, value: float, value_type: str) -> float:
    if action == "set":
        return float(value)
    if value_type == "factor":
        # Кратность: «увеличить в 2 раза» → ×2, «уменьшить в 2 раза» → ÷2.
        if action == "increase":
            return old * value
        return old / value if value else old
    if value_type == "percent":
        factor = value / 100.0
        return old * (1 + factor) if action == "increase" else old * (1 - factor)
    return old + value if action == "increase" else old - value


def _validate_new_value(parameter: str, new_value: float) -> Optional[str]:
    if new_value < 0:
        return "изменение приводит к отрицательному значению"
    if parameter == "kz" and new_value > 1:
        return "коэффициент загрузки превышает 1.0"
    if parameter == "takt" and new_value <= 0:
        return "такт должен быть строго положительным"
    return None


def _base_result(parsed: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "parsed_command": parsed,
        "can_apply": parsed["can_apply"],
        "needs_confirmation": parsed["needs_confirmation"],
        "preview_changes": [],
        "warnings": list(parsed["warnings"]),
        "message": "",
    }


def build_preview(
    text: str,
    records: List[Dict[str, Any]],
    allowed_parameters: Optional[List[str]] = None,
    module_type: Optional[str] = None,
) -> Dict[str, Any]:
    """Формирует предварительный просмотр изменений без их применения."""
    parsed = parse_command(text, allowed_parameters=allowed_parameters, module_type=module_type)
    records = records or []
    result = _base_result(parsed)

    if not parsed["can_apply"]:
        result["message"] = "Команда не может быть применена. " + " ".join(parsed["warnings"])
        return result

    intent = parsed["intent"]

    # Open-vocabulary множественные назначения по полным именам:
    # «Пакет пластин P/N 75 переналадка 3.5, Клемма КС-1 переналадка 2».
    # Имеет приоритет, если найдено ≥2 разных записей со значениями — это надёжно
    # исправляет случаи, когда модель приняла мульти-команду за одиночную.
    if intent in ("update_parameter", "set_parameter", "multi_set_parameter") and parsed.get("parameter"):
        open_assignments = _open_assignments(parsed.get("text", ""), records)
        if len(open_assignments) >= 2:
            parsed["intent"] = "multi_set_parameter"
            parsed["action"] = "set_multiple"
            parsed["assignments"] = open_assignments
            parsed["object_name"] = None
            intent = "multi_set_parameter"

    if intent == "show_items":
        return _preview_show(parsed, records, result)
    if intent == "copy_items":
        return _preview_copy(parsed, records, result)
    if intent == "multi_set_parameter":
        return _preview_multi_set(parsed, records, result)
    if intent == "create_items":
        return _preview_create(parsed, result)
    return _preview_group_change(parsed, records, result)


def _preview_show(parsed: Dict[str, Any], records: List[Dict[str, Any]], result: Dict[str, Any]) -> Dict[str, Any]:
    """Запрос на поиск/вывод записей: подсвечивает подходящие, ничего не меняя."""
    found = _target_records(parsed, records)
    result["is_query"] = True
    result["can_apply"] = False
    parsed["can_apply"] = False
    result["preview_changes"] = [
        {"action": "show", "record": r.get("name", "?"), "group": r.get("group"),
         "parameter": None, "old_value": None, "new_value": None}
        for r in found
    ]
    result["found_records"] = [r.get("name", "?") for r in found]
    result["message"] = (
        f"Найдено записей: {len(found)}." if found
        else "Подходящих записей не найдено."
    )
    return result


# ---------------------------------------------------------------------------
# Превью по типам намерений
# ---------------------------------------------------------------------------

def _preview_create(parsed: Dict[str, Any], result: Dict[str, Any]) -> Dict[str, Any]:
    target_group = parsed["target_group"]
    parameter = parsed["parameter"]
    count = int(parsed["count"])

    if count > MAX_AFFECTED_WITHOUT_CONFIRM:
        result["needs_confirmation"] = True
        parsed["needs_confirmation"] = True
        result["warnings"].append(f"Будет создано {count} записей — требуется подтверждение.")

    preview = []
    for i in range(1, count + 1):
        preview.append({
            "action": "create",
            "record": f"{target_group} (новая {i})",
            "parameter": parameter,
            "old_value": None,
            "new_value": (10 + i) if parameter == "section" else 1,
        })
    result["preview_changes"] = preview
    result["message"] = f"Будет создано {count} новых позиций группы «{target_group}»."
    return result


def _preview_copy(parsed: Dict[str, Any], records: List[Dict[str, Any]], result: Dict[str, Any]) -> Dict[str, Any]:
    count = int(parsed["count"])
    source = _resolve_source(parsed, records)

    if source is None:
        result["can_apply"] = False
        parsed["can_apply"] = False
        label = parsed.get("source_object") or _extract_source_phrase(parsed.get("text", "")) or "источник"
        parsed["missing_objects"] = [label]
        result["warnings"].append(f"Объект-источник «{label}» не найден в данных.")
        result["message"] = f"Копирование невозможно: объект «{label}» не найден."
        return result

    # Зафиксировать найденный источник для отображения и применения.
    base_name = source.get("name", "источник")
    parsed["source_object"] = base_name

    preview = []
    for i in range(1, count + 1):
        preview.append({
            "action": "copy",
            "record": f"{base_name} (копия {i})",
            "parameter": None,
            "old_value": None,
            "new_value": None,
            "source": base_name,
        })
    result["preview_changes"] = preview
    result["message"] = f"Будет создано {count} копий на основе объекта «{base_name}»."
    return result


def _preview_multi_set(parsed: Dict[str, Any], records: List[Dict[str, Any]], result: Dict[str, Any]) -> Dict[str, Any]:
    parameter = parsed["parameter"]
    assignments = parsed["assignments"]

    missing: List[str] = []
    preview = []
    blocking: List[str] = []

    for item in assignments:
        record = _find_record(records, item["object_name"])
        if record is None:
            missing.append(item["object_name"])
            continue
        old_value = record.get(parameter)
        new_value = float(item["value"])
        issue = _validate_new_value(parameter, new_value)
        if issue:
            blocking.append(f"«{record.get('name', '?')}»: {issue}")
        preview.append({
            "action": "set",
            "record": record.get("name", item["object_name"]),
            "group": record.get("group"),
            "parameter": parameter,
            "old_value": None if old_value is None else float(old_value),
            "new_value": new_value,
        })

    if missing:
        result["can_apply"] = False
        parsed["can_apply"] = False
        parsed["missing_objects"] = missing
        result["warnings"].append(
            "Не найдены объекты: " + ", ".join(missing) + ". Команда не применяется."
        )
        result["message"] = "Часть указанных объектов отсутствует в данных."
        return result

    if blocking:
        result["can_apply"] = False
        parsed["can_apply"] = False
        result["warnings"].extend(blocking)
        result["message"] = "Изменения не применены: значения выходят за допустимые пределы."
        return result

    result["preview_changes"] = preview
    result["message"] = (
        f"Будет изменён параметр «{parameter}» у {len(preview)} указанных объектов."
    )
    return result


def _preview_group_change(parsed: Dict[str, Any], records: List[Dict[str, Any]], result: Dict[str, Any]) -> Dict[str, Any]:
    target_group = parsed["target_group"]
    parameter = parsed["parameter"]
    action = parsed["action"]
    value = parsed["value"]
    value_type = parsed["value_type"]

    object_name = parsed.get("object_name")
    if object_name and _find_record(records, object_name) is None:
        result["can_apply"] = False
        parsed["can_apply"] = False
        parsed["missing_objects"] = [object_name]
        result["warnings"].append(f"Объект «{object_name}» не найден в данных.")
        result["message"] = f"Объект «{object_name}» отсутствует в текущем наборе."
        return result

    affected = _target_records(parsed, records)
    if not affected:
        result["can_apply"] = False
        parsed["can_apply"] = False
        result["message"] = "Не найдено записей, соответствующих команде."
        result["warnings"].append(
            "В текущем наборе нет записей, соответствующих объекту команды."
        )
        return result

    if len(affected) > MAX_AFFECTED_WITHOUT_CONFIRM:
        result["needs_confirmation"] = True
        parsed["needs_confirmation"] = True
        result["warnings"].append(
            f"Команда затрагивает {len(affected)} записей — требуется подтверждение."
        )

    # Несколько параметров в одной команде («увеличь to и top … на 5%»).
    params = parsed.get("parameters") or ([parameter] if parameter else [])
    preview = []
    blocking: List[str] = []
    for record in affected:
        for prm in params:
            if prm not in record or record.get(prm) is None:
                continue
            try:
                old_value = float(record[prm])
            except (TypeError, ValueError):
                continue
            new_value = round(_compute_new_value(action, old_value, value, value_type), 4)
            issue = _validate_new_value(prm, new_value)
            if issue:
                blocking.append(f"«{record.get('name', '?')}» / {prm}: {issue}")
            preview.append({
                "action": action,
                "record": record.get("name", "?"),
                "group": record.get("group"),
                "parameter": prm,
                "old_value": old_value,
                "new_value": new_value,
            })

    result["preview_changes"] = preview
    if not preview:
        result["can_apply"] = False
        parsed["can_apply"] = False
        result["message"] = f"У записей группы «{target_group}» отсутствует параметр «{parameter}»."
        return result
    if blocking:
        result["can_apply"] = False
        parsed["can_apply"] = False
        result["warnings"].extend(blocking)
        result["message"] = "Изменения не применены: значения выходят за допустимые пределы."
        return result

    result["message"] = (
        f"Будет изменён параметр «{parameter}» у {len(preview)} записей группы «{target_group}»."
    )
    return result


# ---------------------------------------------------------------------------
# Применение
# ---------------------------------------------------------------------------

def apply_command(
    text: str,
    records: List[Dict[str, Any]],
    confirm: bool = False,
    allowed_parameters: Optional[List[str]] = None,
    module_type: Optional[str] = None,
) -> Dict[str, Any]:
    records = records or []
    preview = build_preview(text, records, allowed_parameters=allowed_parameters, module_type=module_type)
    parsed = preview["parsed_command"]

    if not preview["can_apply"]:
        return {
            "success": False,
            "parsed_command": parsed,
            "changes": [],
            "updated_records": records,
            "missing_objects": parsed.get("missing_objects", []),
            "message": preview["message"] or "Команда не может быть применена.",
            "warnings": preview["warnings"],
        }

    if preview["needs_confirmation"] and not confirm:
        return {
            "success": False,
            "parsed_command": parsed,
            "changes": [],
            "updated_records": records,
            "needs_confirmation": True,
            "message": "Команда затрагивает много записей. Требуется подтверждение применения.",
            "warnings": preview["warnings"],
        }

    updated = deepcopy(records)
    intent = parsed["intent"]
    changes: List[Dict[str, Any]] = []

    if intent == "create_items":
        changes, message = _apply_create(parsed, updated)
    elif intent == "copy_items":
        changes, message = _apply_copy(parsed, updated)
    elif intent == "multi_set_parameter":
        changes, message = _apply_multi_set(parsed, updated)
    else:
        changes, message = _apply_group_change(parsed, updated)

    return {
        "success": True,
        "parsed_command": parsed,
        "changes": changes,
        "updated_records": updated,
        "missing_objects": [],
        "message": message,
        "warnings": preview["warnings"],
    }


def _apply_create(parsed: Dict[str, Any], updated: List[Dict[str, Any]]):
    target_group = parsed["target_group"]
    parameter = parsed["parameter"]
    count = int(parsed["count"])
    changes = []
    for i in range(1, count + 1):
        record = {"name": f"{target_group} (новая {i})", "group": target_group,
                  "quantity": 1, "setup_time": 0}
        if parameter == "section":
            record["section"] = 10 + i
        updated.append(record)
        changes.append({"action": "create", "record": record["name"]})
    return changes, f"Создано {count} новых позиций группы «{target_group}»."


def _apply_copy(parsed: Dict[str, Any], updated: List[Dict[str, Any]]):
    source_name = parsed.get("source_object")
    count = int(parsed["count"])
    source = _resolve_source(parsed, updated)
    changes = []
    base_name = source.get("name", source_name) if source else (source_name or "источник")
    for i in range(1, count + 1):
        clone = deepcopy(source) if source else {"group": parsed["target_group"]}
        clone["name"] = f"{base_name} (копия {i})"
        clone["comment"] = f"Создано ИИ-редактором на основе объекта {base_name}"
        updated.append(clone)
        changes.append({"action": "copy", "record": clone["name"], "source": base_name})
    return changes, f"Создано {count} копий на основе объекта «{base_name}»."


def _apply_multi_set(parsed: Dict[str, Any], updated: List[Dict[str, Any]]):
    parameter = parsed["parameter"]
    changes = []
    for item in parsed["assignments"]:
        record = _find_record(updated, item["object_name"])
        if record is None:
            continue
        old_value = record.get(parameter)
        new_value = float(item["value"])
        record[parameter] = new_value
        changes.append({
            "record": record.get("name", item["object_name"]),
            "parameter": parameter,
            "old_value": None if old_value is None else float(old_value),
            "new_value": new_value,
        })
    return changes, f"Изменён параметр «{parameter}» у {len(changes)} указанных объектов."


def apply_curated_changes(
    records: List[Dict[str, Any]],
    changes: List[Dict[str, Any]],
    source_object: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Применяет отобранный и при необходимости отредактированный пользователем набор
    изменений (после правок preview). Каждое изменение самодостаточно: запись,
    параметр, новое значение, тип операции. Сохраняются проверки безопасности.
    """
    updated = deepcopy(records or [])
    source = _find_record(updated, source_object) if source_object else None
    applied: List[Dict[str, Any]] = []
    warnings: List[str] = []

    for change in changes or []:
        action = change.get("action")
        record_name = change.get("record")

        if action in ("copy", "create"):
            if action == "copy" and source is not None:
                clone = deepcopy(source)
            else:
                clone = {"name": record_name, "group": (source or {}).get("group", "")}
            clone["name"] = record_name
            clone["comment"] = (
                f"Создано ИИ-редактором на основе объекта {source.get('name')}"
                if source else "Создано ИИ-редактором"
            )
            param = change.get("parameter")
            if param and change.get("new_value") is not None:
                clone[param] = change["new_value"]
            updated.append(clone)
            applied.append({"action": action, "record": record_name})
            continue

        # Изменение параметра существующей записи.
        param = change.get("parameter")
        new_value = change.get("new_value")
        if not record_name or not param or new_value is None:
            continue
        record = _find_record(updated, record_name)
        if record is None:
            warnings.append(f"Запись «{record_name}» не найдена и пропущена.")
            continue
        try:
            new_value = float(new_value)
        except (TypeError, ValueError):
            warnings.append(f"«{record_name}»: некорректное значение и пропущено.")
            continue
        issue = _validate_new_value(param, new_value)
        if issue:
            warnings.append(f"«{record_name}»: {issue}. Изменение пропущено.")
            continue
        old_value = record.get(param)
        record[param] = new_value
        applied.append({
            "record": record_name,
            "parameter": param,
            "old_value": None if old_value is None else float(old_value),
            "new_value": new_value,
        })

    return {
        "success": len(applied) > 0,
        "changes": applied,
        "updated_records": updated,
        "warnings": warnings,
        "message": (
            f"Применено изменений: {len(applied)}."
            if applied else "Не выбрано ни одного изменения для применения."
        ),
    }


def _apply_group_change(parsed: Dict[str, Any], updated: List[Dict[str, Any]]):
    target_group = parsed["target_group"]
    parameter = parsed["parameter"]
    action = parsed["action"]
    value = parsed["value"]
    value_type = parsed["value_type"]
    params = parsed.get("parameters") or ([parameter] if parameter else [])
    targets = _target_records(parsed, updated)
    target_ids = {id(r) for r in targets}
    changes = []
    for record in updated:
        if id(record) not in target_ids:
            continue
        for prm in params:
            if prm not in record or record.get(prm) is None:
                continue
            try:
                old_value = float(record[prm])
            except (TypeError, ValueError):
                continue
            new_value = round(_compute_new_value(action, old_value, value, value_type), 4)
            record[prm] = new_value
            changes.append({
                "record": record.get("name", "?"),
                "parameter": prm,
                "old_value": old_value,
                "new_value": new_value,
            })
    return changes, f"Изменены параметры у {len(changes)} записей группы «{target_group}»."
