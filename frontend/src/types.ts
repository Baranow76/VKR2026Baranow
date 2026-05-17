export type ProductionItem = {
  name: string;
  quantity: number;
  setup_time: number;
  group?: string;
  comment?: string;
};

export type ProductionRequest = {
  time_fund: number;
  takt: number;
  items: ProductionItem[];
};

export type RoboticOperation = {
  name: string;
  top: number;
  kz: number;
  service_time: number;
  machine?: string;
  comment?: string;
};

export type RoboticsRequest = {
  max_machines_per_robot: number;
  max_deviation: number;
  operations: RoboticOperation[];
};

export type RiskStrategy = {
  name: string;
  cost: number;
  risks: number[];
};

export type RiskRequest = {
  events: string[];
  base_loss: number;
  profitability_threshold: number;
  strategies: RiskStrategy[];
  hurwicz_coefficients: number[];
};

export type CashFlowPeriod = {
  year: number;
  inflow: number;
  operating_costs: number;
  risk_losses: number;
  maintenance_costs: number;
  additional_investment?: number;
};

export type EconomicsRequest = {
  initial_investment: number;
  discount_rate: number;
  periods: CashFlowPeriod[];
};

export type FullProjectRequest = {
  name: string;
  production: ProductionRequest;
  robotics: RoboticsRequest;
  risks: RiskRequest;
  economics: EconomicsRequest;
};

export type ApiHistoryItem = {
  id: string;
  module: string;
  created_at: string;
  input_data: Record<string, unknown>;
  output_data: Record<string, unknown>;
};
