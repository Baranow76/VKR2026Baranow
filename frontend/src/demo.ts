import type { FullProjectRequest } from './types';

export const demoProject: FullProjectRequest = {
  name: 'Демо-проект инновационной модернизации',
  production: {
    time_fund: 520,
    takt: 1.8,
    items: [
      { name: 'Корпус редуктора', quantity: 85, setup_time: 18, group: 'A' },
      { name: 'Вал приводной', quantity: 120, setup_time: 12, group: 'A' },
      { name: 'Кронштейн', quantity: 160, setup_time: 8, group: 'B' },
      { name: 'Фланец', quantity: 95, setup_time: 22, group: 'B' },
      { name: 'Втулка', quantity: 140, setup_time: 10, group: 'C' },
      { name: 'Переходник', quantity: 60, setup_time: 30, group: 'C' }
    ]
  },
  robotics: {
    max_machines_per_robot: 3,
    max_deviation: 0.22,
    operations: [
      { name: 'Операция 1', top: 24, kz: 0.8, service_time: 5, machine: 'Токарный станок' },
      { name: 'Операция 2', top: 32, kz: 0.75, service_time: 6, machine: 'Фрезерный центр' },
      { name: 'Операция 3', top: 18, kz: 0.6, service_time: 4, machine: 'Сверлильный станок' },
      { name: 'Операция 4', top: 40, kz: 0.85, service_time: 7, machine: 'Обрабатывающий центр' },
      { name: 'Операция 5', top: 20, kz: 0.7, service_time: 5, machine: 'Шлифовальный станок' }
    ]
  },
  risks: {
    events: ['Срыв поставки', 'Рост стоимости оборудования', 'Простой участка', 'Недостижение плановой загрузки'],
    base_loss: 1800000,
    profitability_threshold: 4200000,
    strategies: [
      { name: 'S1: страхование', cost: 520000, risks: [9, 7, 6, 8] },
      { name: 'S2: резервирование', cost: 740000, risks: [6, 5, 4, 6] },
      { name: 'S3: усиленный контроль', cost: 630000, risks: [5, 8, 3, 5] },
      { name: 'S4: комбинированная стратегия', cost: 880000, risks: [4, 4, 3, 4] }
    ],
    hurwicz_coefficients: [0.3, 0.5, 0.7, 0.8, 0.9]
  },
  economics: {
    initial_investment: 12000000,
    discount_rate: 18,
    periods: [
      { year: 1, inflow: 4200000, operating_costs: 900000, risk_losses: 240000, maintenance_costs: 180000, additional_investment: 0 },
      { year: 2, inflow: 5600000, operating_costs: 1000000, risk_losses: 210000, maintenance_costs: 220000, additional_investment: 0 },
      { year: 3, inflow: 6900000, operating_costs: 1150000, risk_losses: 180000, maintenance_costs: 260000, additional_investment: 0 },
      { year: 4, inflow: 7600000, operating_costs: 1250000, risk_losses: 160000, maintenance_costs: 300000, additional_investment: 0 },
      { year: 5, inflow: 8100000, operating_costs: 1350000, risk_losses: 150000, maintenance_costs: 330000, additional_investment: 0 }
    ]
  }
};
