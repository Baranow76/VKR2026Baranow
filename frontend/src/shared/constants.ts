// Константы уровня приложения: ключи localStorage, словари меток NLU и метаданные
// страниц (заголовок/описание/иконка для шапки).
import {
  Activity, Boxes, BrainCircuit, GitCompare, History, LayoutDashboard,
  Pencil, Rocket, ShieldCheck, Sigma, UserCircle, WandSparkles,
} from 'lucide-react';
import type { Page } from './types';

// Ключи localStorage для восстановления контекста работы после перезагрузки.
export const ACTIVE_PROJECT_KEY = 'modernization_active_project';
export const RESULTS_KEY = 'modernization_results_by_project';

export const INTENT_LABELS: Record<string, string> = {
  update_parameter: 'Изменение параметра',
  set_parameter: 'Установка значения',
  create_items: 'Создание позиций',
  copy_items: 'Копирование объектов',
  multi_set_parameter: 'Индивидуальные значения',
  unknown: 'Не распознано',
};

export const ACTION_LABELS: Record<string, string> = {
  increase: 'Увеличить',
  decrease: 'Уменьшить',
  set: 'Установить',
  create: 'Создать',
  copy: 'Копировать',
  set_multiple: 'Назначить по объектам',
  none: '—',
};

export const PARAM_LABELS: Record<string, string> = {
  setup_time: 'Время переналадки',
  quantity: 'Количество',
  takt: 'Такт',
  top: 'Оперативное время',
  kz: 'Коэффициент загрузки',
  cost: 'Стоимость',
  section: 'Сечение',
};

export const VALUE_TYPE_LABELS: Record<string, string> = {
  percent: 'проценты',
  absolute: 'абсолютное',
  count: 'количество',
  factor: 'кратность',
  none: '—',
};

export const pageMeta: Record<Page, { title: string; description: string; icon: any }> = {
  home: {
    title: 'Информационная система поддержки проекта инновационной модернизации',
    description:
      'Выпускная квалификационная работа Баранова М.В. Модульная система для расчёта производственной программы, роботизированных звеньев, рисков и экономической эффективности проекта.',
    icon: Rocket,
  },
  dashboard: {
    title: 'Дашборд проекта',
    description: 'Индустриальная аналитическая панель для демонстрации ВКР и прикладных расчётов.',
    icon: LayoutDashboard,
  },
  production: {
    title: 'Квазиоптимальная производственная программа',
    description: 'Ручной ввод, JSON-вставка, импорт из CSV/XLSX и запуск расчёта по алгоритму Джонсона.',
    icon: Boxes,
  },
  robotics: {
    title: 'Моделирование роботизированных звеньев',
    description: 'Подбор комплектов операций, расчёт загрузки робота и анализ невключённых операций.',
    icon: Activity,
  },
  risks: {
    title: 'Анализ рисков',
    description: 'Критерии Вальда, Сэвиджа, Гурвица и итоговая рекомендация по риск-стратегии.',
    icon: ShieldCheck,
  },
  economics: {
    title: 'Экономическая эффективность проекта',
    description: 'NPV, IRR, ROI, индекс доходности, окупаемость и чувствительность.',
    icon: Sigma,
  },
  full: {
    title: 'Единый расчёт проекта',
    description: 'Комплексный запуск всех модулей и формирование интегральной сводки проекта.',
    icon: Rocket,
  },
  comparison: {
    title: 'Сравнение программ инновационной модернизации',
    description:
      'Сопоставление нескольких сценариев модернизации по NPV, IRR, ROI, окупаемости, загрузке оборудования, рискам и роботизированным звеньям.',
    icon: GitCompare,
  },
  ai: {
    title: 'ИИ-модуль: прогнозирование отказов оборудования',
    description:
      'Машинное обучение на открытом датасете AI4I 2020 (UCI). Сравнение моделей Random Forest и нейронной сети, прогноз вероятности отказа и связь с модулем анализа рисков.',
    icon: BrainCircuit,
  },
  editor: {
    title: 'ИИ-редактор проектных данных',
    description:
      'Интеллектуальный редактор на основе NLU: преобразование текстовой команды в формализованное действие над данными проекта с предварительным просмотром и контролем безопасности.',
    icon: WandSparkles,
  },
  'project-editor': {
    title: 'Редактор проекта',
    description:
      'Единое управление данными активного проекта: метаданные, редактируемые таблицы всех модулей и встроенный ИИ-редактор по выбранной вкладке.',
    icon: Pencil,
  },
  profile: {
    title: 'Профиль пользователя',
    description:
      'Данные аккаунта, статистика по проектам и расчётам, карта активности, настройки и безопасность.',
    icon: UserCircle,
  },
  history: {
    title: 'История расчётов',
    description: 'Журнал запусков, сохранённый в серверной части приложения.',
    icon: History,
  },
};
