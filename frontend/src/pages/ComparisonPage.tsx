// Страница сравнения сценариев модернизации: расчёт активного проекта как
// сценария, сводные карточки, графики и экспорт PDF.
import {
  BarChart, Bar, LineChart, Line, RadarChart, PolarGrid, PolarAngleAxis,
  PolarRadiusAxis, Radar, ResponsiveContainer, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { motion } from 'framer-motion';
import { GitCompare, LoaderCircle, Rocket, FileDown, Pencil } from 'lucide-react';
import { SectionCard, Field, Metric, ChartCard, BarChartIcon } from '../shared/ui/primitives';
import { createScenario } from '../shared/api/comparisonApi';
import type { DbScenario } from '../shared/types';

export function ComparisonPage({
  project,
  activeProject,
  scenarios,
  scenarioName,
  setScenarioName,
  callApi,
  loading,
  reportRef,
  refreshScenarios,
  restoreScenarioAsProject,
  deleteScenario,
}: any) {
  async function calculateScenario() {
    const result = await callApi('/api/full-project/calculate', project, 'comparison');

    await createScenario({
      project_id: activeProject?.id,
      name: scenarioName || activeProject?.name || `Программа ${scenarios.length + 1}`,
      source_data: project,
      result,
    });
    await refreshScenarios();
    setScenarioName(`Программа модернизации ${scenarios.length + 2}`);
  }

  async function downloadReport() {
    if (!reportRef.current) return;
    const canvas = await html2canvas(reportRef.current, { scale: 2, backgroundColor: '#ffffff' });
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const imgWidth = pageWidth;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    let heightLeft = imgHeight;
    let position = 0;

    pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;

    while (heightLeft > 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
    }

    pdf.save('comparison-report.pdf');
  }

  const normalizedScenarios = scenarios.map((scenario: DbScenario) => ({
    ...scenario,
    metrics: {
      npv: scenario.result?.summary?.npv || 0,
      irr: scenario.result?.summary?.irr_percent || 0,
      payback: scenario.result?.summary?.payback || 0,
      production: scenario.result?.summary?.production_utilization_percent || 0,
      robotLoad: scenario.result?.summary?.average_robot_load_percent || 0,
      strategy: scenario.result?.summary?.recommended_risk_strategy || '—',
    },
  }));

  const chartData = normalizedScenarios.map((scenario: any) => ({
    name: scenario.name,
    NPV: scenario.metrics.npv,
    IRR: scenario.metrics.irr,
    ROI: scenario.result?.modules?.economics?.roi_percent || 0,
    Payback: scenario.metrics.payback,
    Production: scenario.metrics.production,
    RobotLoad: scenario.metrics.robotLoad,
  }));

  const radarMetrics = [
    { key: 'production', label: 'Загрузка фонда', getValue: (scenario: any) => scenario.metrics.production || 0 },
    { key: 'robotLoad', label: 'Загрузка робота', getValue: (scenario: any) => scenario.metrics.robotLoad || 0 },
    { key: 'irr', label: 'IRR', getValue: (scenario: any) => scenario.metrics.irr || 0 },
    { key: 'roi', label: 'ROI', getValue: (scenario: any) => scenario.result?.modules?.economics?.roi_percent || 0 },
    { key: 'payback', label: 'Окупаемость', getValue: (scenario: any) => {
      const payback = scenario.metrics.payback || 0;
      return payback > 0 ? Math.max(0, 100 - payback * 10) : 0;
    } },
  ];

  const radarData = radarMetrics.map((metric) => {
    const row: Record<string, any> = { metric: metric.label };
    normalizedScenarios.forEach((scenario: any) => {
      row[scenario.name] = Math.max(0, Math.min(100, metric.getValue(scenario)));
    });
    return row;
  });

  const radarColors = ['#ff7757', '#151515', '#ff4fd8', '#8b5cf6', '#0f9f68'];

  return (
    <div className="comparison-page" ref={reportRef}>
      <SectionCard
        title="Настройка программы модернизации"
        icon={<GitCompare size={18} />}
        actions={
          <button className="button primary" onClick={calculateScenario} disabled={loading}>
            {loading ? <LoaderCircle size={16} className="spin" /> : <Rocket size={16} />}
            {loading ? 'Сравниваем...' : 'Добавить активный проект в сравнение'}
          </button>
        }
      >
        <div className="form-grid two">
          <Field label="Название сценария сравнения">
            <input value={scenarioName} onChange={(e) => setScenarioName(e.target.value)} />
          </Field>
          <Field label="Сценариев в базе">
            <input value={scenarios.length} readOnly />
          </Field>
        </div>
        <p className="comparison-note">Сравнение берёт данные из активного проекта в библиотеке. Любой сценарий можно открыть как отдельный редактируемый проект.</p>
      </SectionCard>

      {normalizedScenarios.length > 0 && (
        <>
          <SectionCard
            title="Сводное сравнение"
            icon={<BarChartIcon />}
            actions={<button className="button secondary" onClick={downloadReport}><FileDown size={16} /> Скачать отчёт PDF</button>}
          >
            <div className="scenario-grid">
              {normalizedScenarios.map((scenario: any) => (
                <motion.div key={scenario.id} className="scenario-card glass-soft" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
                  <div className="scenario-head">
                    <strong>{scenario.name}</strong>
                    <button className="icon-button danger" onClick={() => deleteScenario(scenario.id)}>×</button>
                  </div>
                  <div className="scenario-metrics">
                    <Metric label="NPV" value={scenario.metrics.npv} />
                    <Metric label="IRR, %" value={scenario.metrics.irr} />
                    <Metric label="Окупаемость" value={scenario.metrics.payback} />
                    <Metric label="Загрузка фонда, %" value={scenario.metrics.production} />
                    <Metric label="Загрузка робота, %" value={scenario.metrics.robotLoad} />
                    <Metric label="Риск-стратегия" value={scenario.metrics.strategy} />
                  </div>
                  <button className="button subtle scenario-edit-button" onClick={() => restoreScenarioAsProject(scenario)}>
                    <Pencil size={15} /> Открыть как проект
                  </button>
                </motion.div>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="Графики сравнения" icon={<GitCompare size={18} />}>
            <div className="charts-grid">
              <ChartCard title="NPV по программам модернизации">
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="NPV" fill="#151515" radius={[12, 12, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="IRR и окупаемость">
                <ResponsiveContainer width="100%" height={320}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="IRR" stroke="#ff7757" strokeWidth={3} />
                    <Line type="monotone" dataKey="Payback" stroke="#151515" strokeWidth={3} />
                  </LineChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Технический профиль программ">
                <ResponsiveContainer width="100%" height={420}>
                  <RadarChart data={radarData} outerRadius="72%">
                    <PolarGrid />
                    <PolarAngleAxis dataKey="metric" />
                    <PolarRadiusAxis angle={90} domain={[0, 100]} />
                    {normalizedScenarios.map((scenario: any, index: number) => (
                      <Radar
                        key={scenario.id}
                        name={scenario.name}
                        dataKey={scenario.name}
                        stroke={radarColors[index % radarColors.length]}
                        fill={radarColors[index % radarColors.length]}
                        fillOpacity={0.18}
                        strokeWidth={3}
                      />
                    ))}
                    <Tooltip />
                    <Legend />
                  </RadarChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>
          </SectionCard>
        </>
      )}

      {normalizedScenarios.length === 0 && <div className="empty-result">Пока нет программ для сравнения. Выберите активный проект и нажмите «Добавить активный проект в сравнение».</div>}
    </div>
  );
}
