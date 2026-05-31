// Адаптеры модулей: преобразование данных модуля в плоский список records для
// NLU-редактора и обратно. Не затрагивают расчётную логику — работают на уровне
// представления данных конкретного модуля.

export type AiRecord = { __uid?: string; name: string; group?: string; [key: string]: any };

export type ModuleType = 'production' | 'robotics' | 'risks' | 'economics';

export type ModuleAdapter = {
  moduleType: ModuleType;
  title: string;
  description: string;
  placeholder: string;
  examples: string[];
  allowedParameters: string[];
  targetGroups: string[];
  displayFields: { key: string; label: string }[];
  toRecords: (moduleData: any) => AiRecord[];
  fromRecords: (records: AiRecord[], original: any) => any;
};

const num = (value: any, fallback = 0) => {
  const n = Number(value);
  return Number.isNaN(n) ? fallback : n;
};

export const MODULE_ADAPTERS: Record<ModuleType, ModuleAdapter> = {
  production: {
    moduleType: 'production',
    title: 'ИИ-редактор: производственная программа',
    description: 'Измените состав изделий текстовой командой: количество, переналадку, копирование и индивидуальные значения.',
    placeholder: 'Например: уменьши у всех редукторов время переналадки на 10 процентов',
    examples: [
      'уменьши у всех редукторов время переналадки на 10 процентов',
      'у редуктора РЦ-1 поставь количество 10, а у РЦ-2 20',
      'добавь 3 новых редуктора на базе РЦ-1',
    ],
    allowedParameters: ['quantity', 'setup_time', 'section', 'time_fund', 'takt'],
    targetGroups: ['редуктор', 'вентилятор', 'операция', 'сборка', 'all'],
    displayFields: [
      { key: 'quantity', label: 'Количество' },
      { key: 'setup_time', label: 'Переналадка' },
    ],
    toRecords: (prod) => [
      ...(prod?.items || []).map((item: any) => ({
        name: item.name,
        group: item.group || '',
        quantity: item.quantity,
        setup_time: item.setup_time,
        comment: item.comment,
      })),
      { name: 'Параметры программы', group: '__scalars__', time_fund: prod?.time_fund, takt: prod?.takt },
    ],
    fromRecords: (records, original) => {
      const scalar = records.find((r) => r.group === '__scalars__');
      return {
        ...original,
        time_fund: scalar ? num(scalar.time_fund, original.time_fund) : original.time_fund,
        takt: scalar ? num(scalar.takt, original.takt) : original.takt,
        items: records
          .filter((r) => r.group !== '__scalars__')
          .map((r) => ({
            name: r.name,
            quantity: num(r.quantity),
            setup_time: num(r.setup_time),
            group: r.group || '',
            comment: r.comment || '',
          })),
      };
    },
  },

  robotics: {
    moduleType: 'robotics',
    title: 'ИИ-редактор: роботизированные звенья',
    description: 'Измените параметры операций: оперативное время, коэффициент загрузки, время обслуживания.',
    placeholder: 'Например: для ОП-1 установи время операции 2.5, а для ОП-2 3.0',
    examples: [
      'увеличь коэффициент загрузки у всех операций на 5 процентов',
      'для ОП-1 установи время операции 2.5, а для ОП-2 3.0',
      'создай 2 операции на базе ОП-1',
    ],
    allowedParameters: ['top', 'kz', 'service_time', 'max_machines_per_robot', 'max_deviation'],
    targetGroups: ['роботизированная операция', 'операция', 'all'],
    displayFields: [
      { key: 'top', label: 'top' },
      { key: 'kz', label: 'kz' },
      { key: 'service_time', label: 'to' },
    ],
    toRecords: (rob) => [
      ...(rob?.operations || []).map((op: any) => ({
        name: op.name,
        group: 'роботизированная операция',
        top: op.top,
        kz: op.kz,
        service_time: op.service_time,
        machine: op.machine,
        comment: op.comment,
      })),
      {
        name: 'Ограничения звена',
        group: '__scalars__',
        max_machines_per_robot: rob?.max_machines_per_robot,
        max_deviation: rob?.max_deviation,
      },
    ],
    fromRecords: (records, original) => {
      const scalar = records.find((r) => r.group === '__scalars__');
      return {
        ...original,
        max_machines_per_robot: scalar ? num(scalar.max_machines_per_robot, original.max_machines_per_robot) : original.max_machines_per_robot,
        max_deviation: scalar ? num(scalar.max_deviation, original.max_deviation) : original.max_deviation,
        operations: records
          .filter((r) => r.group !== '__scalars__')
          .map((r) => ({
            name: r.name,
            top: num(r.top),
            kz: num(r.kz),
            service_time: num(r.service_time),
            machine: r.machine || '',
            comment: r.comment || '',
          })),
      };
    },
  },

  risks: {
    moduleType: 'risks',
    title: 'ИИ-редактор: анализ рисков',
    description: 'Измените стоимость стратегий риск-менеджмента текстовой командой.',
    placeholder: 'Например: для стратегии S1 поставь стоимость 1000000, а для S2 1200000',
    examples: [
      'увеличь стоимость стратегии S1 на 10 процентов',
      'для стратегии S1 поставь стоимость 1000000, а для S2 1200000',
      'уменьши стоимость всех стратегий на 5 процентов',
    ],
    allowedParameters: ['cost', 'base_loss', 'profitability_threshold'],
    targetGroups: ['стратегия', 'all'],
    displayFields: [{ key: 'cost', label: 'Стоимость' }],
    toRecords: (risk) => [
      ...(risk?.strategies || []).map((s: any) => ({
        name: s.name,
        group: 'стратегия',
        cost: s.cost,
        risks: s.risks,
      })),
      {
        name: 'Параметры рисков',
        group: '__scalars__',
        base_loss: risk?.base_loss,
        profitability_threshold: risk?.profitability_threshold,
      },
    ],
    fromRecords: (records, original) => {
      const scalar = records.find((r) => r.group === '__scalars__');
      return {
        ...original,
        base_loss: scalar ? num(scalar.base_loss, original.base_loss) : original.base_loss,
        profitability_threshold: scalar
          ? num(scalar.profitability_threshold, original.profitability_threshold)
          : original.profitability_threshold,
        strategies: records
          .filter((r) => r.group !== '__scalars__')
          .map((r) => ({
            name: r.name,
            cost: num(r.cost),
            risks: Array.isArray(r.risks) ? r.risks : (original.events || []).map(() => 0),
          })),
      };
    },
  },

  economics: {
    moduleType: 'economics',
    title: 'ИИ-редактор: экономическая эффективность',
    description: 'Измените денежные потоки по периодам: притоки, затраты, потери от рисков.',
    placeholder: 'Например: увеличь денежные притоки на 10 процентов',
    examples: [
      'увеличь денежные притоки на 10 процентов',
      'уменьши эксплуатационные затраты на 5 процентов',
      'для 1 года поставь приток 500000, а для 2 года 700000',
    ],
    allowedParameters: ['inflow', 'operating_costs', 'risk_losses', 'maintenance_costs', 'additional_investment', 'discount_rate', 'initial_investment'],
    targetGroups: ['all'],
    displayFields: [
      { key: 'inflow', label: 'Приток' },
      { key: 'operating_costs', label: 'Опер. затраты' },
      { key: 'risk_losses', label: 'Риск-потери' },
    ],
    toRecords: (econ) => [
      ...(econ?.periods || []).map((p: any) => ({
        name: `Год ${p.year}`,
        group: 'период',
        year: p.year,
        inflow: p.inflow,
        operating_costs: p.operating_costs,
        risk_losses: p.risk_losses,
        maintenance_costs: p.maintenance_costs,
        additional_investment: p.additional_investment || 0,
      })),
      {
        name: 'Параметры проекта',
        group: '__scalars__',
        discount_rate: econ?.discount_rate,
        initial_investment: econ?.initial_investment,
      },
    ],
    fromRecords: (records, original) => {
      const scalar = records.find((r) => r.group === '__scalars__');
      return {
        ...original,
        discount_rate: scalar ? num(scalar.discount_rate, original.discount_rate) : original.discount_rate,
        initial_investment: scalar ? num(scalar.initial_investment, original.initial_investment) : original.initial_investment,
        periods: records
          .filter((r) => r.group !== '__scalars__')
          .map((r, index) => ({
            year: num(r.year, index + 1),
            inflow: num(r.inflow),
            operating_costs: num(r.operating_costs),
            risk_losses: num(r.risk_losses),
            maintenance_costs: num(r.maintenance_costs),
            additional_investment: num(r.additional_investment),
          })),
      };
    },
  },
};
