// Рендеры результатов расчётных модулей (производство, роботы, риски, экономика)
// и сводный отчёт единого расчёта с экспортом в PDF.
import { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BarChart, Bar, LineChart, Line, ResponsiveContainer, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import {
  ShieldCheck, CircleCheckBig, ShieldAlert, Sigma, Boxes, Activity, FileDown, LoaderCircle,
} from 'lucide-react';
import { Metric, Interpretation, SimpleTable, ChartCard, SectionCard } from '../shared/ui/primitives';
import { RoboticLinksVisualizer, ProductionFlowAnimation } from '../widgets/visualizers';
import { formatValue, formatChartNumber } from '../shared/utils/formatters';
import type { FullProjectRequest } from '../types';

export function RenderProduction({ result }: { result: any }) {
  if (!result) return <div className="empty-result">Запустите модуль, чтобы увидеть результат.</div>;
  return <div className="result-stack"><Interpretation text={result.interpretation} /><div className="passport-grid compact"><Metric label="Использовано фонда" value={result.used_time} /><Metric label="Остаток фонда" value={result.remaining_time} /><Metric label="Загрузка, %" value={result.utilization_percent} /></div><h3>Включённые позиции</h3><ProductionFlowAnimation rows={result.sequence || []} /><h3>Не включено</h3><SimpleTable rows={result.excluded_items} /></div>;
}

export function RenderRobotics({ result }: { result: any }) {
  if (!result) return <div className="empty-result">Запустите модуль, чтобы увидеть результат.</div>;
  return <div className="result-stack"><Interpretation text={result.interpretation} /><div className="passport-grid compact"><Metric label="Количество звеньев" value={result.links_count} /><Metric label="Средняя загрузка, %" value={result.average_robot_load_percent} /></div><h3>Карта роботизированных звеньев</h3><RoboticLinksVisualizer links={result.links || []} /><h3>Расчётные комплекты</h3>{result.links?.map((link: any) => <div key={link.link_number} className="result-card-sub glass-soft"><div className="result-card-head"><strong>Комплект {link.link_number}</strong><span>{link.assessment}</span></div><div className="passport-grid compact"><Metric label="d" value={link.d} /><Metric label="Krob" value={link.robot_load_factor} /><Metric label="Загрузка, %" value={link.robot_load_percent} /><Metric label="m" value={link.machines_count} /></div><SimpleTable rows={link.operations} /></div>)}<h3>Невключённые операции</h3><SimpleTable rows={result.unassigned_operations} /></div>;
}


export function RenderRisks({ result }: { result: any }) {
  if (!result) {
    return <div className="empty-result">Запустите модуль, чтобы увидеть результат.</div>;
  }

  const recommended = result.criteria?.recommended_strategy || 'Не определена';

  const lossRows = result.loss_table || [];
  const payoffRows = result.payoff_table || [];
  const regretRows = result.regret_table || [];

  const strategyCards = lossRows.map((row: any, index: number) => {
    const payoff = payoffRows[index] || {};
    const regret = regretRows[index] || {};

    const totalLoss = Number(row.total_loss || 0);
    const strategyCost = Number(row.strategy_cost || 0);
    const dmin = Number(payoff.Dminij || 0);
    const dmax = Number(payoff.Dmaxij || 0);

    return {
      name: row.strategy || `Стратегия ${index + 1}`,
      totalLoss,
      strategyCost,
      dmin,
      dmax,
      regretMax: Number(regret.max_regret || regret.Rmaxij || 0),
      isRecommended: String(row.strategy || '').trim() === String(recommended).trim(),
    };
  });

  const maxLoss = Math.max(...strategyCards.map((item: any) => item.totalLoss), 1);
  const maxCost = Math.max(...strategyCards.map((item: any) => item.strategyCost), 1);
  const maxDmax = Math.max(...strategyCards.map((item: any) => item.dmax), 1);

  const recommendedCard =
    strategyCards.find((item: any) => item.isRecommended) || strategyCards[0];

  const riskScore = recommendedCard
    ? Math.max(
        8,
        Math.min(
          96,
          Math.round(
            100 -
              (recommendedCard.totalLoss / maxLoss) * 46 -
              (recommendedCard.strategyCost / maxCost) * 24,
          ),
        ),
      )
    : 0;

  return (
    <div className="result-stack">
      <div className="risk-hero">
        <div className="risk-hero-left">
          <div className="risk-kicker">Интегральная оценка рисков</div>
          <h3>{recommended}</h3>
          <p>
            Система сопоставила стратегии по критериям Вальда, Сэвиджа, Maximax и Гурвица.
            Ниже показан не только табличный расчёт, но и визуальный профиль риска для управленческого решения.
          </p>

          <div className="risk-score-line">
            <div>
              <span>Индекс устойчивости решения</span>
              <strong>{riskScore}%</strong>
            </div>

            <div className="risk-score-track">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${riskScore}%` }}
                transition={{ duration: 0.9, ease: 'easeOut' }}
              />
            </div>
          </div>
        </div>

        <div className="risk-orb-card">
          <div className="risk-orb">
            <div className="risk-orb-ring one" />
            <div className="risk-orb-ring two" />
            <div className="risk-orb-core">
              <ShieldCheck size={34} />
              <span>Risk</span>
            </div>
          </div>
        </div>
      </div>

      <div className="risk-decision-grid">
        <Metric label="Рекомендуемая стратегия" value={result.criteria?.recommended_strategy} />
        <Metric label="Сэвидж" value={result.criteria?.savage_minimax_regret?.join(', ')} />
        <Metric label="Вальд" value={result.criteria?.wald_maximin_pessimism?.join(', ')} />
        <Metric label="Maximax" value={result.criteria?.maximax_optimism?.join(', ')} />
      </div>

      <h3>Визуальное сравнение стратегий</h3>

      <div className="risk-strategy-grid">
        {strategyCards.map((strategy: any, index: number) => {
          const lossPercent = Math.round((strategy.totalLoss / maxLoss) * 100);
          const costPercent = Math.round((strategy.strategyCost / maxCost) * 100);
          const payoffPercent = Math.round((strategy.dmax / maxDmax) * 100);

          return (
            <motion.div
              key={strategy.name}
              className={`risk-strategy-card glass-soft ${strategy.isRecommended ? 'recommended' : ''}`}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.08 }}
            >
              <div className="risk-strategy-head">
                <div>
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <strong>{strategy.name}</strong>
                </div>

                {strategy.isRecommended && (
                  <div className="risk-badge">
                    <CircleCheckBig size={14} />
                    Рекомендуется
                  </div>
                )}
              </div>

              <div className="risk-mini-bars">
                <RiskBar label="Потери" value={lossPercent} raw={strategy.totalLoss} danger />
                <RiskBar label="Стоимость" value={costPercent} raw={strategy.strategyCost} />
                <RiskBar label="Потенциал" value={payoffPercent} raw={strategy.dmax} positive />
              </div>
            </motion.div>
          );
        })}
      </div>

      <h3>Карта критериев принятия решения</h3>

      <div className="risk-criteria-board">
        <RiskCriterionCard
          title="Критерий Сэвиджа"
          subtitle="минимизация максимального сожаления"
          value={result.criteria?.savage_minimax_regret?.join(', ')}
        />
        <RiskCriterionCard
          title="Критерий Вальда"
          subtitle="пессимистический maximin-подход"
          value={result.criteria?.wald_maximin_pessimism?.join(', ')}
        />
        <RiskCriterionCard
          title="Критерий Maximax"
          subtitle="оптимистический подход"
          value={result.criteria?.maximax_optimism?.join(', ')}
        />
        <RiskCriterionCard
          title="Критерий Гурвица"
          subtitle="баланс оптимизма и осторожности"
          value={`${result.criteria?.hurwicz?.length || 0} расчётных вариантов`}
        />
      </div>

      <h3>Упущенная выгода</h3>
      <SimpleTable rows={result.loss_table} />

      <h3>Таблица условных выигрышей</h3>
      <SimpleTable rows={result.payoff_table} />

      <h3>Таблица сожалений</h3>
      <SimpleTable rows={result.regret_table} />

      <h3>Гурвиц</h3>
      <SimpleTable rows={result.criteria?.hurwicz} />
    </div>
  );
}

function RiskBar({
  label,
  value,
  raw,
  danger,
  positive,
}: {
  label: string;
  value: number;
  raw: number;
  danger?: boolean;
  positive?: boolean;
}) {
  return (
    <div className="risk-bar-row">
      <div className="risk-bar-top">
        <span>{label}</span>
        <strong>{formatValue(raw)}</strong>
      </div>

      <div className={`risk-bar-track ${danger ? 'danger' : ''} ${positive ? 'positive' : ''}`}>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${Math.max(4, Math.min(value, 100))}%` }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        />
      </div>
    </div>
  );
}

function RiskCriterionCard({
  title,
  subtitle,
  value,
}: {
  title: string;
  subtitle: string;
  value: any;
}) {
  return (
    <motion.div
      className="risk-criterion-card glass-soft"
      whileHover={{ y: -4 }}
      transition={{ duration: 0.2 }}
    >
      <div className="risk-criterion-icon">
        <ShieldAlert size={18} />
      </div>

      <div>
        <h4>{title}</h4>
        <p>{subtitle}</p>
        <strong>{formatValue(value)}</strong>
      </div>
    </motion.div>
  );
}

export function RenderEconomics({ result, project }: { result: any; project: FullProjectRequest }) {
  if (!result) {
    return <div className="empty-result">Запустите модуль, чтобы увидеть результат.</div>;
  }

  const flows = result.flows || [];

const discountRate = Number(project.economics?.discount_rate ?? 0) / 100;

let cumulativeDiscountedFlow = -Number(project.economics?.initial_investment ?? 0);

const chartData = flows.map((flow: any, index: number) => {
  const year = Number(flow.year ?? index + 1);

  const inflow = Number(flow.inflow ?? 0);

  const costs =
    Number(flow.operating_costs ?? 0) +
    Number(flow.risk_losses ?? 0) +
    Number(flow.maintenance_costs ?? 0) +
    Number(flow.additional_investment ?? 0);

  const netFlow =
    Number(flow.net_cash_flow ?? flow.cash_flow ?? 0) || inflow - costs;

  const discounted =
    Number(flow.discounted_cash_flow ?? 0) ||
    netFlow / Math.pow(1 + discountRate, year);

  cumulativeDiscountedFlow += discounted;

  return {
    year: `Год ${year}`,
    inflow,
    costs,
    cashFlow: netFlow,
    discounted,
    cumulative: cumulativeDiscountedFlow,
  };
});

  const npv = Number(result.npv || 0);
  const irr = Number(result.irr_percent || 0);
  const roi = Number(result.roi_percent || 0);
  const pi = Number(result.profitability_index || 0);
  const payback = Number(result.discounted_payback_period_years || 0);

  const effectScore = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        (npv > 0 ? 34 : 8) +
          Math.min(irr, 40) * 0.7 +
          Math.min(Math.max(roi, 0), 80) * 0.32 +
          Math.min(Math.max(pi, 0), 3) * 7,
      ),
    ),
  );

  const statusText = result.is_effective
    ? 'Проект экономически эффективен'
    : 'Проект требует корректировки параметров';

  const statusHint = result.is_effective
    ? 'Показатели демонстрируют положительный инвестиционный эффект при заданных исходных данных.'
    : 'Текущая финансовая модель не даёт устойчивого подтверждения эффективности проекта.';

  return (
    <div className="result-stack">
      <div className={`economics-hero ${result.is_effective ? 'effective' : 'warning'}`}>
        <div className="economics-hero-left">
          <div className="economics-kicker">Инвестиционная оценка проекта</div>

          <h3>{statusText}</h3>

          <p>{statusHint}</p>

          <div className="economics-score-block">
            <div className="economics-score-head">
              <span>Индекс финансовой привлекательности</span>
              <strong>{effectScore}%</strong>
            </div>

            <div className="economics-score-track">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${effectScore}%` }}
                transition={{ duration: 0.9, ease: 'easeOut' }}
              />
            </div>
          </div>
        </div>

        <div className="economics-orb-wrap">
          <div className="economics-orb">
            <div className="economics-orb-ring one" />
            <div className="economics-orb-ring two" />
            <div className="economics-orb-core">
              <Sigma size={34} />
              <span>NPV</span>
              <strong>{formatValue(npv)}</strong>
            </div>
          </div>
        </div>
      </div>

      <div className="economics-kpi-grid">
        <EconomicsKpiCard label="NPV" value={npv} hint="чистый дисконтированный доход" accent />
        <EconomicsKpiCard label="IRR" value={`${formatValue(irr)}%`} hint="внутренняя норма доходности" />
        <EconomicsKpiCard label="ROI" value={`${formatValue(roi)}%`} hint="рентабельность инвестиций" />
        <EconomicsKpiCard label="PI" value={pi} hint="индекс доходности" />
        <EconomicsKpiCard label="Окупаемость" value={payback} hint="дисконтированный срок, лет" />
        <EconomicsKpiCard
          label="Статус"
          value={result.is_effective ? 'Эффективен' : 'Под вопросом'}
          hint="итоговая интерпретация"
        />
      </div>

      <div className="economics-visual-grid">
        <ChartCard title="Динамика денежных потоков">
          <ResponsiveContainer width="100%" height={320}>
            <BarChart
  data={chartData}
  margin={{ top: 20, right: 28, left: 42, bottom: 16 }}
>
  <CartesianGrid strokeDasharray="3 3" />
  <XAxis dataKey="year" />

  <YAxis
    width={90}
    tickFormatter={formatChartNumber}
    tick={{ fontSize: 13 }}
  />

  <Tooltip
    formatter={(value: any) => formatValue(Number(value))}
  />

  <Legend />

  <Bar
    dataKey="inflow"
    name="Приток"
    fill="#151515"
    radius={[10, 10, 0, 0]}
  />

  <Bar
    dataKey="costs"
    name="Затраты"
    fill="#ff7757"
    radius={[10, 10, 0, 0]}
  />
</BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Накопленный дисконтированный поток">
          <ResponsiveContainer width="100%" height={320}>
            <LineChart
  data={chartData}
  margin={{ top: 20, right: 28, left: 42, bottom: 16 }}
>
  <CartesianGrid strokeDasharray="3 3" />
  <XAxis dataKey="year" />

  <YAxis
    width={90}
    tickFormatter={formatChartNumber}
    tick={{ fontSize: 13 }}
  />

  <Tooltip
    formatter={(value: any) => formatValue(Number(value))}
  />

  <Legend />

  <Line
    type="monotone"
    dataKey="cumulative"
    name="Накопленный поток"
    stroke="#ff7757"
    strokeWidth={3}
    dot={{ r: 5 }}
    activeDot={{ r: 7 }}
  />

  <Line
    type="monotone"
    dataKey="discounted"
    name="Дисконтированный поток"
    stroke="#151515"
    strokeWidth={3}
    dot={{ r: 5 }}
    activeDot={{ r: 7 }}
  />
</LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <h3>Финансовая логика проекта</h3>

      <div className="economics-insight-grid">
        <EconomicsInsightCard
          number="01"
          title="Инвестиционный эффект"
          text={`NPV проекта составляет ${formatValue(npv)}. ${
            npv > 0
              ? 'Положительное значение показывает, что проект создаёт добавленную стоимость.'
              : 'Отрицательное значение указывает на необходимость пересмотра параметров проекта.'
          }`}
        />

        <EconomicsInsightCard
          number="02"
          title="Возврат вложений"
          text={`ROI равен ${formatValue(roi)}%. Показатель отражает, насколько результат проекта превышает объём вложенных средств.`}
        />

        <EconomicsInsightCard
          number="03"
          title="Срок окупаемости"
          text={`Дисконтированный срок окупаемости составляет ${formatValue(payback)} лет. Этот показатель важен для оценки инвестиционного риска.`}
        />

        <EconomicsInsightCard
          number="04"
          title="Доходность"
          text={`Индекс доходности PI равен ${formatValue(pi)}. Значение выше 1 обычно указывает на финансовую целесообразность проекта.`}
        />
      </div>

      <h3>Чувствительность проекта</h3>

      <EconomicsSensitivity result={result.sensitivity} />

      <h3>Денежные потоки</h3>
      <SimpleTable rows={result.flows} />

      <h3>Расчёт чувствительности</h3>
      <SimpleTable rows={[result.sensitivity]} />
    </div>
  );
}

function EconomicsKpiCard({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: any;
  hint: string;
  accent?: boolean;
}) {
  return (
    <motion.div whileHover={{ y: -4 }} className={`economics-kpi-card glass-soft ${accent ? 'accent' : ''}`}>
      <div className="economics-kpi-label">{label}</div>
      <div className="economics-kpi-value">{formatValue(value)}</div>
      <div className="economics-kpi-hint">{hint}</div>
    </motion.div>
  );
}

function EconomicsInsightCard({
  number,
  title,
  text,
}: {
  number: string;
  title: string;
  text: string;
}) {
  return (
    <motion.div
      className="economics-insight-card glass-soft"
      whileHover={{ y: -4 }}
      transition={{ duration: 0.2 }}
    >
      <div className="economics-insight-number">{number}</div>
      <div>
        <h4>{title}</h4>
        <p>{text}</p>
      </div>
    </motion.div>
  );
}

function EconomicsSensitivity({ result }: { result: any }) {
  if (!result) {
    return <div className="empty-result">Нет данных по чувствительности.</div>;
  }

  const rows = Object.entries(result).map(([key, value]) => ({
    key,
    value: Number(value || 0),
  }));

  const maxValue = Math.max(...rows.map((item) => Math.abs(item.value)), 1);

  return (
    <div className="economics-sensitivity-board">
      {rows.map((item, index) => {
        const width = Math.max(6, Math.min(100, Math.round((Math.abs(item.value) / maxValue) * 100)));
        const isPositive = item.value >= 0;

        return (
          <motion.div
            className="economics-sensitivity-row glass-soft"
            key={item.key}
            initial={{ opacity: 0, x: -14 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.07 }}
          >
            <div className="economics-sensitivity-name">{item.key}</div>

            <div className="economics-sensitivity-track">
              <motion.div
                className={isPositive ? 'positive' : 'negative'}
                initial={{ width: 0 }}
                animate={{ width: `${width}%` }}
                transition={{ duration: 0.75, ease: 'easeOut' }}
              />
            </div>

            <strong>{formatValue(item.value)}</strong>
          </motion.div>
        );
      })}
    </div>
  );
}

export function RenderFull({ result, project }: { result: any; project?: FullProjectRequest }) {
const fullReportRef = useRef<HTMLDivElement>(null);
const [reportGenerating, setReportGenerating] = useState(false);

async function downloadFullReport() {
  if (!fullReportRef.current || reportGenerating) return;

  setReportGenerating(true);

  await new Promise((resolve) => setTimeout(resolve, 120));

  try {
    const canvas = await html2canvas(fullReportRef.current, {
      scale: 1.6,
      backgroundColor: '#ffffff',
      useCORS: true,
      logging: false,
      windowWidth: fullReportRef.current.scrollWidth,
      windowHeight: fullReportRef.current.scrollHeight,
    });

    const imgData = canvas.toDataURL('image/jpeg', 0.92);
    const pdf = new jsPDF('p', 'mm', 'a4');

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();

    const imgWidth = pageWidth;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    let heightLeft = imgHeight;
    let position = 0;

    pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;

    while (heightLeft > 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
    }

    pdf.save('otchet-edinogo-rascheta.pdf');
  } catch (error) {
    console.error(error);
  } finally {
    setReportGenerating(false);
  }
}

  if (!result) {
    return (
      <div className="empty-result">
        Запустите единый расчёт, чтобы увидеть интегральную сводку проекта модернизации.
      </div>
    );
  }

  const production = result.modules?.production;
  const robotics = result.modules?.robotics;
  const risks = result.modules?.risks;
  const economics = result.modules?.economics;

  const npv = result.summary?.npv ?? economics?.npv;
  const irr = result.summary?.irr_percent ?? economics?.irr_percent;
  const payback = result.summary?.payback ?? economics?.discounted_payback_period_years;
  const productionLoad = result.summary?.production_utilization_percent ?? production?.utilization_percent;
  const robotLoad = result.summary?.average_robot_load_percent ?? robotics?.average_robot_load_percent;
  const strategy = result.summary?.recommended_risk_strategy ?? risks?.criteria?.recommended_strategy;
  const isEffective = economics?.is_effective;

  const modules = [
    {
      title: 'Производственная программа',
      subtitle: 'Алгоритм Джонсона',
      value: `${formatValue(productionLoad)}%`,
      hint: 'использование фонда времени',
      icon: <Boxes size={20} />,
      status: production ? 'Рассчитано' : 'Нет данных',
    },
    {
      title: 'Роботизированные звенья',
      subtitle: 'Модель обслуживания',
      value: `${formatValue(robotLoad)}%`,
      hint: 'средняя загрузка роботов',
      icon: <Activity size={20} />,
      status: robotics ? `${robotics.links_count || 0} звеньев` : 'Нет данных',
    },
    {
      title: 'Анализ рисков',
      subtitle: 'Вальд · Сэвидж · Гурвиц',
      value: strategy || '—',
      hint: 'рекомендуемая стратегия',
      icon: <ShieldCheck size={20} />,
      status: risks ? 'Стратегия выбрана' : 'Нет данных',
    },
    {
      title: 'Экономика проекта',
      subtitle: 'NPV · IRR · ROI',
      value: formatValue(npv),
      hint: 'чистый дисконтированный доход',
      icon: <Sigma size={20} />,
      status: economics ? 'Эффект рассчитан' : 'Нет данных',
    },
  ];

  const score = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        ((Number(productionLoad || 0) + Number(robotLoad || 0)) / 2) * 0.45 +
          Math.min(Math.max(Number(irr || 0), 0), 100) * 0.35 +
          (isEffective ? 20 : 5),
      ),
    ),
  );

  const flowData = economics?.flows?.map((flow: any, index: number) => ({
    year: `Год ${flow.year ?? index + 1}`,
    inflow: Number(flow.inflow ?? 0),
    costs:
      Number(flow.operating_costs ?? 0) +
      Number(flow.risk_losses ?? 0) +
      Number(flow.maintenance_costs ?? 0) +
      Number(flow.additional_investment ?? 0),
  })) || [];

  return (
  <div className="full-render" ref={fullReportRef}>
      <section className="full-hero glass">
        <div className="full-hero-glow" />

        <div className="full-hero-left">
          <div className="full-kicker">Комплексный расчёт завершён</div>

          <h2>
            {result.project_name || project?.name || 'Проект инновационной модернизации'}
          </h2>

          <p>
            Система выполнила единый расчёт производственной программы, роботизированных звеньев,
            стратегии управления рисками и экономической эффективности проекта.
          </p>

          <div className="full-status-row">
            <div className={`full-status-pill ${isEffective ? 'positive' : 'warning'}`}>
              {isEffective ? 'Проект экономически эффективен' : 'Требуется уточнение параметров'}
            </div>

            <div className="full-status-pill">
              Интегральная оценка: {score}%
            </div>
          </div>
        </div>

      <div className="full-hero-right">
        <div className="full-score-ring">
          <div className="full-score-ring-inner">
            <span>Индекс</span>
            <strong>{score}%</strong>
            <small>готовности решения</small>
          </div>
        </div>

        <button
          className="button primary full-report-button"
          onClick={downloadFullReport}
          disabled={reportGenerating}
        >
          {reportGenerating ? <LoaderCircle size={16} className="spin" /> : <FileDown size={16} />}
          {reportGenerating ? 'Формируем отчёт...' : 'Скачать отчёт единого расчёта'}
        </button>
      </div>
      </section>

      <section className="full-kpi-grid">
        <motion.div className="full-kpi-card glass-soft" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}>
          <span>NPV</span>
          <strong>{formatValue(npv)}</strong>
          <p>чистый дисконтированный доход</p>
        </motion.div>

        <motion.div className="full-kpi-card glass-soft" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
          <span>IRR</span>
          <strong>{formatValue(irr)}%</strong>
          <p>внутренняя норма доходности</p>
        </motion.div>

        <motion.div className="full-kpi-card glass-soft" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <span>Окупаемость</span>
          <strong>{formatValue(payback)}</strong>
          <p>дисконтированный срок, лет</p>
        </motion.div>

        <motion.div className="full-kpi-card glass-soft" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
          <span>Риск-стратегия</span>
          <strong>{strategy || '—'}</strong>
          <p>итоговая рекомендация системы</p>
        </motion.div>
      </section>

      <section className="full-module-grid">
        {modules.map((module, index) => (
          <motion.div
            className="full-module-card glass-soft"
            key={module.title}
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.07 }}
          >
            <div className="full-module-top">
              <div className="full-module-icon">{module.icon}</div>
              <span>{module.status}</span>
            </div>

            <div>
              <div className="full-module-subtitle">{module.subtitle}</div>
              <h3>{module.title}</h3>
            </div>

            <div className="full-module-line" />

            <div className="full-module-value">{module.value}</div>
            <p>{module.hint}</p>
          </motion.div>
        ))}
      </section>

      <section className="full-pipeline glass">
        <div className="full-section-head">
          <span>Логика принятия решения</span>
          <h3>От производственных данных к интегральной оценке проекта</h3>
        </div>

        <div className="full-pipeline-steps">
          {[
            ['01', 'Производство', 'расчёт выпуска и загрузки фонда'],
            ['02', 'Роботизация', 'формирование производственных звеньев'],
            ['03', 'Риски', 'выбор стратегии в условиях неопределённости'],
            ['04', 'Экономика', 'NPV, IRR, ROI и окупаемость'],
          ].map((step, index) => (
            <motion.div
              className="full-pipeline-step"
              key={step[0]}
              initial={{ opacity: 0, x: -14 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.08 }}
            >
              <b>{step[0]}</b>
              <strong>{step[1]}</strong>
              <span>{step[2]}</span>
            </motion.div>
          ))}
        </div>
      </section>

      {flowData.length > 0 && (
        <section className="full-chart-card glass">
          <div className="full-section-head">
            <span>Финансовая динамика</span>
            <h3>Притоки и затраты по периодам проекта</h3>
          </div>

          <ResponsiveContainer width="100%" height={340}>
            <BarChart
              data={flowData}
              margin={{ top: 20, right: 24, left: 34, bottom: 16 }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="year" />
              <YAxis
                width={82}
                tickFormatter={formatChartNumber}
                tick={{ fontSize: 13 }}
              />
              <Tooltip formatter={(value: any) => formatValue(Number(value))} />
              <Legend />
              <Bar dataKey="inflow" name="Приток" fill="#151515" radius={[12, 12, 0, 0]} />
              <Bar dataKey="costs" name="Затраты" fill="#ff7757" radius={[12, 12, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </section>
      )}

      <section className="full-details-grid">
        <SectionCard title="Производственная программа" icon={<Boxes size={18} />}>
          <RenderProduction result={production} />
        </SectionCard>

        <SectionCard title="Роботизированные звенья" icon={<Activity size={18} />}>
          <RenderRobotics result={robotics} />
        </SectionCard>

        <SectionCard title="Анализ рисков" icon={<ShieldCheck size={18} />}>
          <RenderRisks result={risks} />
        </SectionCard>

        <SectionCard title="Экономика проекта" icon={<Sigma size={18} />}>
          <RenderEconomics result={economics} project={project} />
        </SectionCard>
      </section>
      <AnimatePresence>
  {reportGenerating && (
    <motion.div
      className="report-generating-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="report-generating-card glass"
        initial={{ opacity: 0, y: 18, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 18, scale: 0.96 }}
      >
        <div className="report-orb">
          <span />
          <span />
          <span />
        </div>

        <div>
          <div className="report-generating-kicker">Формирование PDF</div>
          <h3>Система собирает отчёт единого расчёта</h3>
          <p>
            Подготавливаются графики, карточки показателей, визуализация модулей и итоговая сводка проекта.
            Страница может на пару секунд стать менее отзывчивой.
          </p>

          <div className="report-progress">
            <div />
          </div>
        </div>
      </motion.div>
    </motion.div>
  )}
</AnimatePresence>
    </div>
  );
}
