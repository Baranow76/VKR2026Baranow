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

// --- ИИ-модуль: прогнозирование отказов оборудования ---

export type EquipmentParams = {
  type_class: string;
  air_temperature: number;
  process_temperature: number;
  rotational_speed: number;
  torque: number;
  tool_wear: number;
};

export type AiModelMetrics = {
  accuracy: number;
  precision: number;
  recall: number;
  f1: number;
  roc_auc: number | null;
  confusion_matrix: {
    true_negative: number;
    false_positive: number;
    false_negative: number;
    true_positive: number;
  };
};

export type AiModelInfo = {
  status: string;
  dataset_name?: string;
  dataset_rows?: number;
  failure_rate?: number;
  trained_at?: string;
  best_model?: string;
  best_model_label?: string;
  metrics_by_model?: Record<string, AiModelMetrics>;
  feature_importance?: Record<string, number>;
  feature_labels?: Record<string, string>;
  model_labels?: Record<string, string>;
  detail?: string;
};

export type AiValidationWarning = {
  parameter: string;
  label: string;
  value: number | string;
  type: 'physical' | 'out_of_distribution' | 'invalid';
  message: string;
  physical_range?: { min: number | null; max: number | null };
  training_range?: { min: number; max: number };
};

export type AiPredictResult = {
  can_predict: boolean;
  status: 'ok' | 'out_of_distribution' | 'invalid_input';
  failure_probability: number | null;
  failure_prediction: number | null;
  risk_percent: number | null;
  risk_level: string;
  model_used: string;
  model_label: string;
  recommended_risk_value: number | null;
  validation_warnings: AiValidationWarning[];
  interpretation: string;
};

// --- NLU-модуль: интеллектуальный редактор данных по текстовой команде ---

export type EditorRecord = {
  name: string;
  group: string;
  quantity?: number;
  setup_time?: number;
  takt?: number;
  top?: number;
  kz?: number;
  cost?: number;
  section?: number | null;
};

export type CommandAssignment = {
  object_name: string;
  value: number;
};

export type ParsedCommand = {
  text: string;
  intent: string;
  confidence: number;
  action: string;
  target_group: string | null;
  parameter: string | null;
  parameters?: string[];
  value: number | null;
  value_type: string;
  object_name: string | null;
  source_object: string | null;
  count: number | null;
  assignments: CommandAssignment[];
  missing_objects: string[];
  can_apply: boolean;
  needs_confirmation: boolean;
  warnings: string[];
};

export type PreviewChange = {
  action?: string;
  record: string;
  group?: string | null;
  parameter?: string | null;
  old_value: number | null;
  new_value: number | null;
  source?: string;
};

export type NluParseResult = {
  parsed_command: ParsedCommand;
  can_apply: boolean;
  needs_confirmation: boolean;
  preview_changes: PreviewChange[];
  warnings: string[];
  message: string;
  is_query?: boolean;
  found_records?: string[];
};

export type NluApplyResult = {
  success: boolean;
  parsed_command: ParsedCommand;
  changes: PreviewChange[];
  updated_records: EditorRecord[];
  message: string;
  warnings: string[];
  missing_objects?: string[];
  needs_confirmation?: boolean;
};

export type NluModelInfo = {
  status: string;
  intent_model_name?: string;
  intent_model_label?: string;
  intent_labels?: string[];
  action_labels?: string[];
  trained_at?: string;
  dataset_rows?: number;
  detail?: string;
};
