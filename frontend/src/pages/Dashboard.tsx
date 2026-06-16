// Дашборд активного проекта: готовность модулей, качество данных, быстрый анализ.
import { motion } from 'framer-motion';
import { Boxes, Activity, ShieldCheck, Sigma, Rocket, GitCompare, ArrowRight } from 'lucide-react';
import { DashboardInsight } from '../shared/ui/primitives';
import type { Page } from '../shared/types';

export function Dashboard({ project, results, setPage, activeProject }: any) {
  const productionCount = project?.production?.items?.length || 0;
  const operationsCount = project?.robotics?.operations?.length || 0;
  const riskEventsCount = project?.risks?.events?.length || 0;
  const strategiesCount = project?.risks?.strategies?.length || 0;
  const periodsCount = project?.economics?.periods?.length || 0;

  const completedModules = ['production', 'robotics', 'risks', 'economics'].filter((key) => Boolean(results[key])).length;
  const readiness = Math.round((completedModules / 4) * 100);

  const moduleCards = [
    {
      key: 'production',
      title: 'Производственная программа',
      desc: 'Очередность выпуска, фонд времени, переналадки и включённые позиции.',
      value: productionCount,
      label: 'позиций',
      status: results.production ? 'Рассчитано' : 'Ожидает расчёт',
      icon: <Boxes size={20} />,
      page: 'production',
    },
    {
      key: 'robotics',
      title: 'Роботизированные звенья',
      desc: 'Комплекты операций, обслуживаемые станки и загрузка роботов.',
      value: operationsCount,
      label: 'операций',
      status: results.robotics ? 'Рассчитано' : 'Ожидает расчёт',
      icon: <Activity size={20} />,
      page: 'robotics',
    },
    {
      key: 'risks',
      title: 'Анализ рисков',
      desc: 'Риск-события, стратегии и критерии Вальда, Сэвиджа, Гурвица.',
      value: strategiesCount,
      label: 'стратегий',
      status: results.risks ? 'Рассчитано' : 'Ожидает расчёт',
      icon: <ShieldCheck size={20} />,
      page: 'risks',
    },
    {
      key: 'economics',
      title: 'Экономика проекта',
      desc: 'Денежные потоки, NPV, IRR, ROI, PI и срок окупаемости.',
      value: periodsCount,
      label: 'периодов',
      status: results.economics ? 'Рассчитано' : 'Ожидает расчёт',
      icon: <Sigma size={20} />,
      page: 'economics',
    },
  ];

  const dataQuality = [
    {
      label: 'Номенклатура',
      value: productionCount,
      hint: productionCount >= 6 ? 'данных достаточно' : 'лучше добавить больше позиций',
    },
    {
      label: 'Операции',
      value: operationsCount,
      hint: operationsCount >= 6 ? 'хорошая детализация' : 'можно расширить модель',
    },
    {
      label: 'Риск-события',
      value: riskEventsCount,
      hint: riskEventsCount >= 4 ? 'риск-модель заполнена' : 'мало событий',
    },
    {
      label: 'Периоды',
      value: periodsCount,
      hint: periodsCount >= 5 ? 'горизонт достаточный' : 'короткий горизонт',
    },
  ];

  return (
    <div className="premium-dashboard">
      <section className="dashboard-command glass">
        <div className="dashboard-command-left">
          <div className="dashboard-kicker">Центр управления проектом</div>

          <h2>{project?.name || activeProject?.name || 'Проект инновационной модернизации'}</h2>

          <p>
            Дашборд показывает состояние активного проекта, наполненность исходных данных,
            готовность расчётных модулей и быстрый переход к ключевым действиям.
          </p>

          <div className="dashboard-command-actions">
            <button className="button primary" onClick={() => setPage('full')}>
              <Rocket size={16} /> Запустить единый расчёт
            </button>

            <button className="button secondary" onClick={() => setPage('comparison')}>
              <GitCompare size={16} /> Сравнить программы
            </button>
          </div>
        </div>

        <div className="dashboard-readiness-card">
          <div className="dashboard-ring" style={{ ['--progress' as any]: `${readiness}%` }}>
            <span>{readiness}%</span>
          </div>

          <div>
            <strong>Готовность расчётов</strong>
            <p>{completedModules} из 4 модулей уже имеют результат.</p>
          </div>
        </div>
      </section>

      <section className="dashboard-data-grid">
        {dataQuality.map((item, index) => (
          <motion.div
            key={item.label}
            className="dashboard-data-card glass-soft"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.06 }}
            whileHover={{ y: -4 }}
          >
            <span>{item.label}</span>
            <strong>{item.value}</strong>
            <p>{item.hint}</p>
          </motion.div>
        ))}
      </section>

      <section className="dashboard-flow glass">
        <div className="dashboard-section-head">
          <div>
            <span>Логика системы</span>
            <h2>Из активного проекта данные проходят через четыре расчётных контура</h2>
          </div>
        </div>

        <div className="dashboard-flow-map">
          {moduleCards.map((card, index) => (
            <motion.button
              key={card.key}
              className={`dashboard-flow-node ${results[card.key] ? 'done' : ''}`}
              onClick={() => setPage(card.page as Page)}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.08 }}
              whileHover={{ y: -5, scale: 1.01 }}
            >
              <div className="flow-node-top">
                <div className="flow-node-icon">{card.icon}</div>
                <span>{card.status}</span>
              </div>

              <h3>{card.title}</h3>
              <p>{card.desc}</p>

              <div className="flow-node-bottom">
                <strong>{card.value}</strong>
                <span>{card.label}</span>
              </div>
            </motion.button>
          ))}
        </div>
      </section>

      <section className="dashboard-insights-grid">
        <div className="dashboard-insight-card glass">
          <div className="dashboard-section-head compact">
            <div>
              <span>Быстрый анализ</span>
              <h2>Что уже понятно по проекту</h2>
            </div>
          </div>

          <div className="dashboard-insight-list">
            <DashboardInsight
              good={productionCount >= 6}
              title="Производственная программа"
              text={
                productionCount >= 6
                  ? 'Номенклатура выглядит достаточно детализированной для демонстрационного расчёта.'
                  : 'В производственную программу лучше добавить больше позиций, чтобы расчёт выглядел убедительнее.'
              }
            />

            <DashboardInsight
              good={operationsCount >= 6}
              title="Роботизация"
              text={
                operationsCount >= 6
                  ? 'Операций достаточно для визуализации нескольких роботизированных звеньев.'
                  : 'Для эффектной демонстрации роботизированных звеньев стоит добавить больше операций и станков.'
              }
            />

            <DashboardInsight
              good={periodsCount >= 5}
              title="Экономика"
              text={
                periodsCount >= 5
                  ? 'Горизонт расчёта подходит для оценки окупаемости и дисконтированных показателей.'
                  : 'Экономический горизонт короткий, итоговые показатели могут выглядеть менее убедительно.'
              }
            />
          </div>
        </div>

        <div className="dashboard-action-card glass">
          <div className="dashboard-action-orb" />

          <span>Следующий шаг</span>
          <h2>Провести комплексный расчёт и сохранить результат</h2>
          <p>
            Единый расчёт объединит производственный, робототехнический,
            риск- и экономический блоки в одну сводку проекта.
          </p>

          <button className="button primary" onClick={() => setPage('full')}>
            Перейти к единому расчёту <ArrowRight size={16} />
          </button>
        </div>
      </section>
    </div>
  );
}
