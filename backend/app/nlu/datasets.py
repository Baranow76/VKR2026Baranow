"""
Генерация доменного датасета команд для обучения NLU-модели.

Открытые датасеты MASSIVE / massive_ru / ATIS / SNIPS используются как открытая
NLU-основа (reference dataset) для постановки задачи intent classification +
slot filling. Однако они содержат бытовые намерения и не содержат производственных
параметров (setup_time, takt, kz, top, cost), поэтому для прикладного редактора
проектных данных используется доменный набор команд (этот файл → CSV).

Поддерживаемые намерения (intent):
  update_parameter, set_parameter, create_items, copy_items,
  multi_set_parameter, unknown.

Поля датасета: text, intent, action, target_group, parameter, value_type.
"""
from __future__ import annotations

import csv
import json
import random
from pathlib import Path
from typing import Dict, List

BASE_DIR = Path(__file__).resolve().parent.parent  # .../backend/app
DATA_DIR = BASE_DIR / "data"
DATASET_PATH = DATA_DIR / "project_commands_dataset.csv"
DEMO_COMMANDS_PATH = DATA_DIR / "nlu_demo_commands.json"

# ---------------------------------------------------------------------------
# Словари синонимов (используются и при генерации, и при извлечении слотов)
# ---------------------------------------------------------------------------

ACTION_VERBS: Dict[str, List[str]] = {
    "increase": ["увеличь", "повысь", "подними", "прибавь", "нарасти"],
    "decrease": ["уменьши", "снизь", "сократи", "понизь", "убавь"],
    "set": ["установи", "задай", "выстави", "зафиксируй", "сделай", "измени", "поменяй"],
    "create": ["создай", "добавь", "сгенерируй", "сформируй"],
}

# Глаголы поиска/выбора записей (интент show_items — без изменения данных).
SHOW_VERBS = ["найди", "покажи", "выведи", "отбери", "отфильтруй", "выдели", "найти", "показать"]

TARGET_SYNONYMS: Dict[str, List[str]] = {
    "редуктор": ["редуктор", "редукторы", "редукторов", "редуктора", "всех редукторов", "редукторам"],
    "вентилятор": ["вентилятор", "вентиляторы", "вентиляторов", "вентилятора", "всех вентиляторов"],
    "роботизированная операция": [
        "роботизированные операции", "роботизированных операций",
        "роботизированную операцию", "робот. операции", "роботизированные звенья",
    ],
    "сборка": ["операции сборки", "операций сборки", "сборочные операции", "сборку", "сборки"],
    "операция": ["операция", "операции", "операций", "всех операций", "все операции"],
    "all": ["все позиции", "всех позиций", "все записи", "у всех", "для всех", "всё"],
}

PARAMETER_SYNONYMS: Dict[str, List[str]] = {
    "setup_time": ["время переналадки", "переналадку", "время наладки", "переналадки", "переналадка"],
    "quantity": ["количество", "объём выпуска", "объем выпуска", "объём", "объем"],
    "takt": ["такт производства", "такт выпуска", "такт"],
    "top": ["оперативное время", "время операции", "top"],
    "kz": ["коэффициент загрузки", "загрузку", "загрузки", "kz"],
    "service_time": ["время обслуживания", "сервисное время", "to"],
    "cost": ["стоимость", "стоимости", "цену", "затраты"],
    "section": ["сечение", "сечением", "сечения"],
    # Параметры модуля экономической эффективности (по периодам).
    "inflow": ["денежные притоки", "денежный приток", "притоки", "приток", "выручку", "выручка"],
    "operating_costs": ["эксплуатационные затраты", "операционные затраты", "эксплуатационные расходы"],
    "risk_losses": ["потери от рисков", "риск-потери", "потери по рискам"],
    "maintenance_costs": ["затраты на обслуживание", "расходы на обслуживание"],
    "additional_investment": ["дополнительные инвестиции", "доп инвестиции", "доп. инвестиции"],
    # Скалярные параметры-ограничения модулей (хранятся вне списка записей).
    "max_machines_per_robot": [
        "максимум станков на робота", "максимальное число станков", "число станков на робота",
        "максимум станков", "станков на робота",
    ],
    "max_deviation": ["максимальное отклонение", "допустимое отклонение", "максимальное допустимое отклонение"],
    "time_fund": ["фонд времени", "доступный фонд времени", "фонд рабочего времени"],
    "discount_rate": ["ставка дисконтирования", "ставку дисконтирования", "ставки дисконтирования"],
    "initial_investment": ["первоначальные инвестиции", "начальные инвестиции", "первоначальных инвестиций", "объём инвестиций"],
    "base_loss": ["базовые потери", "база потерь", "базовый убыток"],
    "profitability_threshold": ["порог рентабельности", "порог окупаемости"],
}

# Параметры, относящиеся к каждому типу модуля (для контекстной фильтрации).
MODULE_PARAMETERS: Dict[str, List[str]] = {
    "production": ["quantity", "setup_time", "takt", "section", "time_fund"],
    "robotics": ["top", "kz", "service_time", "max_machines_per_robot", "max_deviation"],
    "risks": ["cost", "base_loss", "profitability_threshold"],
    "economics": ["inflow", "operating_costs", "risk_losses", "maintenance_costs",
                  "additional_investment", "discount_rate", "initial_investment"],
}

# Объекты-образцы (коды) по группам — используются для copy_items и multi_set_parameter.
OBJECT_CODES: Dict[str, List[str]] = {
    "редуктор": ["РЦ-1", "РЦ-2", "РЦ-3", "РЦ-4", "РЦ-5"],
    "вентилятор": ["ВЦ-1", "ВЦ-2", "ВЦ-3", "ВЦ-4"],
    "операция": ["ОП-1", "ОП-2", "ОП-3", "ОП-4"],
    "сборка": ["СБ-1", "СБ-2", "СБ-3"],
}

# Префикс кода → каноническая группа (для вывода группы из имени объекта).
OBJECT_PREFIX_TO_GROUP: Dict[str, str] = {
    "РЦ": "редуктор",
    "ВЦ": "вентилятор",
    "ОП": "операция",
    "СБ": "сборка",
}

# Словоформы групп для естественных формулировок.
TARGET_WORD: Dict[str, Dict[str, str]] = {
    "редуктор": {"gen": "редуктора", "pl": "редукторы", "word": "редуктор"},
    "вентилятор": {"gen": "вентилятора", "pl": "вентиляторы", "word": "вентилятор"},
    "операция": {"gen": "операции", "pl": "операции", "word": "операцию"},
    "сборка": {"gen": "сборки", "pl": "сборки", "word": "сборку"},
}

# Параметры, пригодные для multi_set (числовые, без section).
MULTISET_PARAMS = ["quantity", "takt", "top", "kz", "cost", "setup_time"]

# Широкий пул названий инструментов/оборудования (родительный падеж, мн. число)
# для повышения лексического разнообразия и обобщаемости на новые слова (OOV).
TOOL_VOCAB: List[str] = [
    "плазморезов", "болгарок", "шуруповёртов", "перфораторов", "дрелей", "лобзиков",
    "компрессоров", "генераторов", "сварочных аппаратов", "инверторов", "станков",
    "гайковёртов", "шлифмашин", "фрезеров", "газонокосилок", "мотопомп", "виброплит",
    "тепловых пушек", "лазерных резаков", "точил", "рубанков", "степлеров",
    "краскопультов", "отбойных молотков", "бетономешалок", "пил", "дисковых пил",
    "сабельных пил", "паяльников", "клеевых пистолетов", "домкратов", "лебёдок",
    "тисков", "верстаков", "стабилизаторов", "понижающих трансформаторов",
    "сварочных полуавтоматов", "плазменных резаков", "угловых шлифмашин",
]

# Полные наименования товаров (многословные, с кодами) — для обучения разбору
# команд по полному имени и множественных назначений через запятую.
PRODUCT_NAMES: List[str] = [
    "Пакет пластин P/N 75", "Клемма свинцовая КС-1", "Насос PUMP-25", "Подшипник 6204",
    "Крышка корпуса АКБ", "Вал приводной ВП-12", "Фланец Ф-200", "Втулка В-8",
    "Редуктор червячный РЧ-40", "Муфта упругая МУ-5", "Шестерня Z-32", "Корпус насоса КН-3",
    "Уплотнение торцевое УТ-50", "Ротор электродвигателя РЭ-7", "Статор СТ-9",
    "Кронштейн опорный КО-2", "Прокладка паронитовая ПП-10", "Шпиндель ШП-1",
    "Сальник С-30", "Поршень П-90", "Цилиндр гидравлический ЦГ-16", "Золотник ЗЛ-4",
    "Манжета М-22", "Звёздочка приводная ЗП-18", "Кулачок К-6", "Толкатель Т-11",
    "Направляющая Н-44", "Опора качения ОК-2", "Сепаратор СП-7", "Демпфер ДМ-3",
]

# Множители кратности для команд «в N раз».
FACTOR_PHRASES = ["в 2 раза", "в 3 раза", "в 1.5 раза", "вдвое", "втрое", "в 4 раза", "вчетверо"]

UNKNOWN_PHRASES: List[str] = [
    "привет как дела", "какая сегодня погода", "открой настройки системы",
    "запусти музыку", "сколько сейчас времени", "покажи последние новости",
    "сделай мне кофе", "как тебя зовут", "что такое npv", "расскажи анекдот",
    "выключи компьютер", "спасибо за помощь", "это очень хороший редуктор",
    "вентилятор стоит на складе", "мне нравится эта операция", "доброе утро",
    "помоги разобраться", "где находится отчёт", "сохрани проект", "что нового",
    "покажи график", "открой документацию", "перезагрузи страницу", "найди файл",
    "включи тёмную тему", "сколько стоит обучение", "построй диаграмму",
]

NUM_WORDS = {2: "два", 3: "три", 4: "четыре", 5: "пять"}


def _value_phrases_percent() -> List[str]:
    return [
        "на 10 процентов", "на 15%", "на 5 процентов", "на 20%", "на 7 процентов",
        "на 12%", "на 25 процентов", "на 8%", "на 30 процентов", "на 3%",
    ]


def _value_phrases_absolute() -> List[str]:
    return ["на 5", "на 0.05", "на 0.1", "на 2", "на 3", "на 10", "на 0.2", "на 1.5"]


def _value_phrases_set() -> List[str]:
    return ["3.5", "равным 4", "до 2.0", "5", "равным 0.8", "до 3.0", "равным 12", "2.5"]


def _value_phrases_count() -> List[str]:
    return [
        "10 новых позиций", "5 новых позиций", "8 позиций", "3 новые позиции",
        "15 позиций", "6 новых позиций", "12 позиций",
    ]


def _create_extra() -> List[str]:
    return ["с разным сечением", "разного сечения", "", "с разными параметрами", ""]


def _connectors() -> List[str]:
    return ["у", "для", "у всех", ""]


def _multiset_values() -> List[str]:
    return [
        "10", "20", "5", "8", "12", "15", "1000", "1200", "3.5", "4.0", "0.8", "0.9",
        "2", "3", "2.5", "7", "18", "25", "40", "60", "100", "150", "250", "500",
        "750", "1500", "2000", "0.6", "0.7", "0.75", "1.2", "1.8", "6", "9", "11", "30",
    ]


# Категории, бренды и серии для динамической генерации названий товаров
# (категория × бренд × код) — резко повышает лексическое разнообразие датасета.
_CATEGORIES = [
    "Редуктор", "Насос", "Клапан", "Фланец", "Втулка", "Муфта", "Шестерня", "Подшипник",
    "Корпус", "Крышка", "Вал", "Ротор", "Статор", "Кронштейн", "Прокладка", "Шпиндель",
    "Сальник", "Поршень", "Цилиндр", "Золотник", "Манжета", "Звёздочка", "Кулачок",
    "Толкатель", "Направляющая", "Опора", "Сепаратор", "Демпфер", "Компрессор", "Генератор",
    "Двигатель", "Плазморез", "Болгарка", "Перфоратор", "Шуруповёрт", "Лебёдка", "Домкрат",
]
_QUALIFIERS = [
    "червячный", "приводной", "опорный", "торцевой", "упругий", "свинцовый",
    "паронитовый", "гидравлический", "электрический", "механический", "стальной",
    "литой", "сварной", "усиленный", "облегчённый", "промышленный", "",
]
_CODE_PREFIXES = ["P/N", "АРТ", "КС", "ВП", "РЧ", "МУ", "КН", "УТ", "РЭ", "СТ", "КО", "ПП", "Ф", "В", "Z", "S"]


def build_product_pool(rng: "random.Random", size: int = 240) -> List[str]:
    """Синтетически генерирует разнообразные многословные названия с кодами."""
    pool = set(PRODUCT_NAMES)
    while len(pool) < size:
        cat = rng.choice(_CATEGORIES)
        qual = rng.choice(_QUALIFIERS)
        prefix = rng.choice(_CODE_PREFIXES)
        num = rng.randint(1, 999)
        sep = rng.choice(["-", " ", ""])
        code = f"{prefix}{sep}{num}"
        name = f"{cat} {qual} {code}".replace("  ", " ").strip()
        pool.add(name)
    return list(pool)


def generate_rows(seed: int = 42) -> List[Dict[str, str]]:
    """Формирует размеченные строки датасета комбинированием шаблонов."""
    rng = random.Random(seed)
    rows: List[Dict[str, str]] = []
    seen: set = set()

    def add(text: str, intent: str, action: str, target: str, parameter: str, value_type: str):
        key = " ".join(text.split()).strip().lower()
        if not key or key in seen:
            return
        seen.add(key)
        rows.append({
            "text": " ".join(text.split()).strip(),
            "intent": intent,
            "action": action,
            "target_group": target,
            "parameter": parameter,
            "value_type": value_type,
        })

    targets = [t for t in TARGET_SYNONYMS]
    params = [p for p in PARAMETER_SYNONYMS if p != "section"]

    # 1. update_parameter: increase / decrease
    for action in ("increase", "decrease"):
        for verb in ACTION_VERBS[action]:
            for target in targets:
                for parameter in params:
                    for _ in range(2):
                        target_syn = rng.choice(TARGET_SYNONYMS[target])
                        param_syn = rng.choice(PARAMETER_SYNONYMS[parameter])
                        is_percent = rng.random() < 0.6
                        value_phrase = rng.choice(
                            _value_phrases_percent() if is_percent else _value_phrases_absolute()
                        )
                        value_type = "percent" if is_percent else "absolute"
                        connector = rng.choice(_connectors())
                        templates = [
                            f"{verb} {connector} {target_syn} {param_syn} {value_phrase}",
                            f"{verb} {param_syn} {connector} {target_syn} {value_phrase}",
                            f"{verb} {target_syn} {param_syn} {value_phrase}",
                        ]
                        add(rng.choice(templates), "update_parameter", action, target, parameter, value_type)

    # 2. set_parameter: set
    for verb in ACTION_VERBS["set"]:
        for target in targets:
            for parameter in params:
                target_syn = rng.choice(TARGET_SYNONYMS[target])
                param_syn = rng.choice(PARAMETER_SYNONYMS[parameter])
                value_phrase = rng.choice(_value_phrases_set())
                connector = rng.choice(["для", "у", ""])
                templates = [
                    f"{verb} {param_syn} {connector} {target_syn} {value_phrase}",
                    f"{verb} {connector} {target_syn} {param_syn} {value_phrase}",
                ]
                add(rng.choice(templates), "set_parameter", "set", target, parameter, "absolute")

    # 3. create_items: create
    for verb in ACTION_VERBS["create"]:
        for target in ("редуктор", "вентилятор", "операция", "сборка"):
            for count_phrase in _value_phrases_count():
                target_syn = rng.choice(TARGET_SYNONYMS[target])
                extra = rng.choice(_create_extra())
                parameter = "section" if "сечен" in extra else "quantity"
                text = f"{verb} {count_phrase} {target_syn} {extra}"
                add(text, "create_items", "create", target, parameter, "count")

    # 4. copy_items: copy (на базе существующего объекта)
    copy_templates = [
        "добавь {n} новых {gen} на базе {obj}",
        "создай {n} копий {gen} {obj}",
        "создай {n} копии {word} {obj}",
        "сделай {n} новых позиции по данным {obj}",
        "добавь еще {n} {pl}, данные возьми от {obj}",
        "добавь еще {n} новых {gen}, данные возьми от {word} {obj}",
        "создай новые {pl} на основе {obj}",
        "сформируй {n} копии {word} {obj}",
        "сформируй {n} {pl} на базе {obj}",
        "создай {n} копии {obj}",
        "добавь {n} {gen} по образцу {obj}",
        "продублируй {obj} {nw} раза",
        "сделай {nw} копии {obj}",
    ]
    for group, codes in OBJECT_CODES.items():
        words = TARGET_WORD[group]
        for obj in codes:
            for template in copy_templates:
                n = rng.choice([2, 3, 4, 5])
                text = template.format(
                    n=n, nw=NUM_WORDS.get(n, str(n)),
                    obj=obj, gen=words["gen"], pl=words["pl"], word=words["word"],
                )
                add(text, "copy_items", "copy", group, "none", "count")

    # 5. multi_set_parameter: set_multiple (разные значения разным объектам)
    multi_templates = [
        "у {tw} {o1} поставь {p} {v1}, а у {o2} {v2}",
        "для {o1} задай {p} {v1}, для {o2} {v2}",
        "{o1} {p} {v1}, {o2} {p} {v2}",
        "у {o1} установи {p} {v1}, а у {o2} {v2}",
        "для {o1} поставь {p} {v1}, для {o2} {v2}",
        "{o1} {p} {v1}, {o2} {v2}",
        "у {o1} {p} {v1}, у {o2} {p} {v2}",
        "задай {o1} {p} {v1} и {o2} {p} {v2}",
    ]
    for group, codes in OBJECT_CODES.items():
        if len(codes) < 2:
            continue
        words = TARGET_WORD[group]
        for parameter in MULTISET_PARAMS:
            param_syn = PARAMETER_SYNONYMS[parameter][0]
            for _ in range(10):
                o1, o2 = rng.sample(codes, 2)
                v1, v2 = rng.choice(_multiset_values()), rng.choice(_multiset_values())
                template = rng.choice(multi_templates)
                text = template.format(tw=words["word"], o1=o1, o2=o2, p=param_syn, v1=v1, v2=v2)
                add(text, "multi_set_parameter", "set_multiple", group, parameter, "absolute")

    # 5b. update/set без явной группы (экономика/роботы → применяется ко всем записям)
    implicit_params = ["inflow", "operating_costs", "risk_losses", "maintenance_costs",
                       "additional_investment", "top", "kz", "service_time"]
    for parameter in implicit_params:
        for verb in ACTION_VERBS["increase"] + ACTION_VERBS["decrease"]:
            param_syn = rng.choice(PARAMETER_SYNONYMS[parameter])
            is_percent = rng.random() < 0.7
            value_phrase = rng.choice(_value_phrases_percent() if is_percent else _value_phrases_absolute())
            value_type = "percent" if is_percent else "absolute"
            action = "increase" if verb in ACTION_VERBS["increase"] else "decrease"
            add(f"{verb} {param_syn} {value_phrase}", "update_parameter", action, "all", parameter, value_type)
        for verb in ACTION_VERBS["set"]:
            param_syn = rng.choice(PARAMETER_SYNONYMS[parameter])
            add(f"{verb} {param_syn} {rng.choice(_value_phrases_set())}",
                "set_parameter", "set", "all", parameter, "absolute")

    # 5c. multi_set по годам (экономика): "для 1 года ..., а для 2 года ..."
    year_templates = [
        "для {n1} года поставь {p} {v1}, а для {n2} года {v2}",
        "у {n1} года установи {p} {v1}, а у {n2} года {v2}",
        "{n1} год {p} {v1}, {n2} год {p} {v2}",
    ]
    econ_params = ["inflow", "operating_costs", "risk_losses", "maintenance_costs"]
    for parameter in econ_params:
        param_syn = PARAMETER_SYNONYMS[parameter][0]
        for _ in range(12):
            n1, n2 = rng.sample([1, 2, 3, 4, 5], 2)
            v1, v2 = rng.choice(_multiset_values()), rng.choice(_multiset_values())
            template = rng.choice(year_templates)
            text = template.format(n1=n1, n2=n2, p=param_syn, v1=v1, v2=v2)
            add(text, "multi_set_parameter", "set_multiple", "economics", parameter, "absolute")

    # 5d. Лексическое разнообразие: команды над произвольными инструментами (OOV-устойчивость).
    # Целевая группа размечается как "all" (привязка к записям выполняется open-vocabulary
    # резолвером на этапе применения, а не закрытым словарём).
    div_params = ["cost", "quantity", "setup_time", "top", "kz"]
    for tool in TOOL_VOCAB:
        for action in ("increase", "decrease"):
            verb = rng.choice(ACTION_VERBS[action])
            parameter = rng.choice(div_params)
            param_syn = rng.choice(PARAMETER_SYNONYMS[parameter])
            is_percent = rng.random() < 0.6
            value_phrase = rng.choice(_value_phrases_percent() if is_percent else _value_phrases_absolute())
            value_type = "percent" if is_percent else "absolute"
            add(f"{verb} {param_syn} у всех {tool} {value_phrase}",
                "update_parameter", action, "all", parameter, value_type)
        set_verb = rng.choice(ACTION_VERBS["set"])
        parameter = rng.choice(div_params)
        param_syn = rng.choice(PARAMETER_SYNONYMS[parameter])
        add(f"{set_verb} {param_syn} у всех {tool} {rng.choice(_value_phrases_set())}",
            "set_parameter", "set", "all", parameter, "absolute")

    # 5e. Кратность: «уменьши … в 2 раза», «увеличь … вдвое».
    factor_params = ["setup_time", "cost", "quantity", "top", "takt"]
    factor_targets = TOOL_VOCAB + ["редукторов", "вентиляторов", "операций", "позиций"]
    for tool in factor_targets:
        for action in ("increase", "decrease"):
            for _ in range(2):
                verb = rng.choice(ACTION_VERBS[action])
                parameter = rng.choice(factor_params)
                param_syn = rng.choice(PARAMETER_SYNONYMS[parameter])
                factor = rng.choice(FACTOR_PHRASES)
                connector = rng.choice(["у всех", "у", "для всех", ""])
                templates = [
                    f"{verb} {param_syn} {connector} {tool} {factor}",
                    f"{verb} {connector} {tool} {param_syn} {factor}",
                    f"{verb} {param_syn} {factor}",
                ]
                add(rng.choice(templates), "update_parameter", action, "all", parameter, "factor")
    # Кратность по конкретному объекту/коду.
    for obj in [c for codes in OBJECT_CODES.values() for c in codes] + PRODUCT_NAMES[:12]:
        for action in ("increase", "decrease"):
            verb = rng.choice(ACTION_VERBS[action])
            parameter = rng.choice(factor_params)
            param_syn = rng.choice(PARAMETER_SYNONYMS[parameter])
            factor = rng.choice(FACTOR_PHRASES)
            add(f"у {obj} {verb} {param_syn} {factor}", "update_parameter", action, "all", parameter, "factor")

    # 5f. Множественные назначения по ПОЛНЫМ именам через запятую (open-vocabulary).
    product_pool = build_product_pool(rng, 240)
    ms_params = ["setup_time", "cost", "quantity", "top", "kz", "takt"]
    ms_templates = [
        "{n1} {p} {v1}, {n2} {p} {v2}",
        "у {n1} поставь {p} {v1}, а у {n2} {v2}",
        "для {n1} задай {p} {v1}, для {n2} {v2}",
        "{n1} {p} {v1}, {n2} {v2}",
        "у {n1} {p} {v1}, у {n2} {p} {v2}",
        "{n1} {p} {v1}, {n2} {p} {v2}, {n3} {p} {v3}",
        "установи {p}: {n1} {v1}, {n2} {v2}",
        "для {n1} {p} {v1}, а для {n2} {p} {v2}",
    ]
    for _ in range(2600):
        parameter = rng.choice(ms_params)
        param_syn = rng.choice(PARAMETER_SYNONYMS[parameter])
        names = rng.sample(product_pool, 3)
        v1, v2, v3 = (rng.choice(_multiset_values()) for _ in range(3))
        template = rng.choice(ms_templates)
        text = template.format(n1=names[0], n2=names[1], n3=names[2], p=param_syn, v1=v1, v2=v2, v3=v3)
        add(text, "multi_set_parameter", "set_multiple", "all", parameter, "absolute")

    # 5g. Изменение/установка/кратность по ПОЛНОМУ имени одного объекта.
    for name in product_pool:
        for action in ("increase", "decrease"):
            verb = rng.choice(ACTION_VERBS[action])
            parameter = rng.choice(ms_params)
            param_syn = rng.choice(PARAMETER_SYNONYMS[parameter])
            is_percent = rng.random() < 0.6
            value_phrase = rng.choice(_value_phrases_percent() if is_percent else _value_phrases_absolute())
            vt = "percent" if is_percent else "absolute"
            add(f"у {name} {verb} {param_syn} {value_phrase}", "update_parameter", action, "all", parameter, vt)
        set_verb = rng.choice(ACTION_VERBS["set"])
        parameter = rng.choice(ms_params)
        param_syn = rng.choice(PARAMETER_SYNONYMS[parameter])
        add(f"{name} {param_syn} {rng.choice(_value_phrases_set())}", "set_parameter", "set", "all", parameter, "absolute")

    # 5h. show_items: поиск/вывод записей для редактирования (без изменения данных).
    show_tails = ["", "для редактирования", "для правки", "в списке", "которые есть"]
    show_targets = list(TARGET_SYNONYMS.keys()) + ["позиции", "записи", "элементы"]
    for verb in SHOW_VERBS:
        for target in show_targets:
            tgt = rng.choice(TARGET_SYNONYMS[target]) if target in TARGET_SYNONYMS else target
            tail = rng.choice(show_tails)
            text = f"{verb} все {tgt} {tail}"
            add(text, "show_items", "show", target if target in TARGET_SYNONYMS else "all", "none", "none")

    # 5i. Скалярные ограничения модулей (set по полному синониму параметра).
    scalar_params = ["max_machines_per_robot", "max_deviation", "time_fund",
                     "discount_rate", "initial_investment", "base_loss", "profitability_threshold"]
    for parameter in scalar_params:
        for syn in PARAMETER_SYNONYMS[parameter]:
            for verb in ["измени", "поменяй", "установи", "задай", "сделай"]:
                add(f"{verb} {syn} на {rng.choice(['4', '5', '3', '0.2', '12', '500000', '0.25'])}",
                    "set_parameter", "set", "all", parameter, "absolute")
            add(f"{verb} {syn} равным {rng.choice(['4', '5', '0.2', '12'])}",
                "set_parameter", "set", "all", parameter, "absolute")

    # 5j. Несколько параметров в одной команде («увеличь to и top … на 5%»).
    pair_pool = ["top", "kz", "service_time", "setup_time", "quantity", "cost", "inflow", "operating_costs"]
    pair_targets = ["редукторов", "вентиляторов", "операций", "позиций"] + TOOL_VOCAB[:10]
    for _ in range(260):
        p1, p2 = rng.sample(pair_pool, 2)
        s1, s2 = rng.choice(PARAMETER_SYNONYMS[p1]), rng.choice(PARAMETER_SYNONYMS[p2])
        action = rng.choice(["increase", "decrease"])
        verb = rng.choice(ACTION_VERBS[action])
        target = rng.choice(pair_targets)
        is_percent = rng.random() < 0.7
        vp = rng.choice(_value_phrases_percent() if is_percent else _value_phrases_absolute())
        vt = "percent" if is_percent else "absolute"
        conj = rng.choice(["и", ","])
        add(f"{verb} {s1} {conj} {s2} у всех {target} {vp}", "update_parameter", action, "all", p1, vt)

    # 6. unknown: нерелевантные фразы
    prefixes = ["", "пожалуйста ", "слушай ", "эй "]
    for phrase in UNKNOWN_PHRASES:
        for prefix in prefixes:
            add(f"{prefix}{phrase}", "unknown", "none", "none", "none", "none")

    rng.shuffle(rows)
    return rows


def write_dataset(seed: int = 42) -> Path:
    rows = generate_rows(seed=seed)
    DATA_DIR.mkdir(exist_ok=True)
    fieldnames = ["text", "intent", "action", "target_group", "parameter", "value_type"]
    with DATASET_PATH.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)
    return DATASET_PATH


def load_or_generate(seed: int = 42):
    import pandas as pd

    if not DATASET_PATH.exists():
        write_dataset(seed=seed)
    return pd.read_csv(DATASET_PATH)


DEMO_COMMANDS: List[str] = [
    "уменьши у всех редукторов время переналадки на 10 процентов",
    "увеличь количество всех вентиляторов на 15 процентов",
    "снизь стоимость всех операций сборки на 7 процентов",
    "повысь коэффициент загрузки роботизированных операций на 0.05",
    "установи такт производства для редукторов 3.5",
    "задай количество для всех вентиляторов 120",
    "создай 10 новых позиций редуктора с разным сечением",
    "сформируй 5 новых вентиляторов с разными параметрами",
    "добавь 3 новых редуктора на базе РЦ-1",
    "создай 5 копий редуктора РЦ-1",
    "добавь еще 3 новых редуктора, данные возьми от редуктора РЦ-1",
    "продублируй РЦ-2 три раза",
    "создай 2 копии вентилятора ВЦ-2",
    "сформируй 4 операции на базе ОП-3",
    "добавь еще 2 вентилятора, данные возьми от ВЦ-1",
    "у редуктора РЦ-1 поставь количество 10, а у РЦ-2 20",
    "для РЦ-1 задай количество 10, для РЦ-2 20",
    "РЦ-1 стоимость 1000, РЦ-2 стоимость 1200",
    "у ВЦ-1 установи такт 3.5, а у ВЦ-2 4.0",
    "для ОП-1 поставь время операции 2, для ОП-2 3",
    "у СБ-1 коэффициент загрузки 0.8, у СБ-2 0.9",
    "для РЦ-1 поставь переналадку 12, для РЦ-2 15",
]


def write_demo_commands() -> Path:
    """Сохраняет набор чистых демонстрационных команд для интерфейса и защиты."""
    DATA_DIR.mkdir(exist_ok=True)
    DEMO_COMMANDS_PATH.write_text(
        json.dumps({"commands": DEMO_COMMANDS}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return DEMO_COMMANDS_PATH
