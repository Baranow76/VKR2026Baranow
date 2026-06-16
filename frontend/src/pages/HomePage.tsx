// Главная страница (лендинг ВКР): герой, проблемы, обзор модулей.
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  BrainCircuit, ArrowRight, Factory, Cpu, ShieldAlert, ChartNoAxesCombined, CircleCheckBig,
} from 'lucide-react';
import type { Page } from '../shared/types';

export function HomePage({ setPage, loadDemo }: { setPage: (page: Page) => void; loadDemo: () => void }) {
  const modules = [
    {
      title: 'Производственная программа',
      subtitle: 'Алгоритм Джонсона',
      text: 'Формирует квазиоптимальную последовательность выпуска изделий с учётом фонда времени, такта оборудования и переналадок.',
      pain: 'Сложно вручную подобрать порядок выпуска без потерь времени.',
      result: 'Система показывает, что включить в программу и какой фонд времени будет использован.',
      page: 'production' as Page,
      icon: <Factory size={22} />,
    },
    {
      title: 'Роботизированные звенья',
      subtitle: 'Теория массового обслуживания',
      text: 'Помогает определить состав роботизированных производственных звеньев и оценить загрузку робота.',
      pain: 'Непонятно, какие станки объединять вокруг робота.',
      result: 'Система визуально показывает робота и станки, которые он обслуживает.',
      page: 'robotics' as Page,
      icon: <Cpu size={22} />,
    },
    {
      title: 'Анализ рисков',
      subtitle: 'Вальд · Сэвидж · Гурвиц',
      text: 'Сравнивает стратегии риск-менеджмента по формальным критериям принятия решений в условиях неопределённости.',
      pain: 'Риск-стратегия часто выбирается экспертно и субъективно.',
      result: 'Система рассчитывает матрицы выигрышей, сожалений и рекомендует стратегию.',
      page: 'risks' as Page,
      icon: <ShieldAlert size={22} />,
    },
    {
      title: 'Экономика проекта',
      subtitle: 'NPV · IRR · ROI',
      text: 'Оценивает инвестиционную привлекательность проекта модернизации по денежным потокам и ставке дисконтирования.',
      pain: 'Трудно доказать окупаемость и эффект модернизации.',
      result: 'Система считает NPV, IRR, ROI, PI и срок окупаемости.',
      page: 'economics' as Page,
      icon: <ChartNoAxesCombined size={22} />,
    },
  ];
  const pains = [
    {
      title: 'Разрозненные расчёты',
      text: 'Производственные, риск- и экономические показатели часто считаются отдельно, поэтому итоговое решение сложно проверить.',
      status: 'Нет единого контура',
    },
    {
      title: 'Сложность сравнения',
      text: 'Несколько программ модернизации трудно сопоставить между собой без общей системы показателей.',
      status: 'Сценарии не связаны',
    },
    {
      title: 'Ручная сборка выводов',
      text: 'После расчётов приходится отдельно готовить таблицы, графики и пояснения для демонстрации результата.',
      status: 'Много ручной работы',
    },
    {
      title: 'Слабое обоснование',
      text: 'Управленческое решение сложнее защитить, если расчёты не объединены в прозрачную цифровую модель.',
      status: 'Решение трудно доказать',
    },
  ];

  const effects = [
    { label: 'единая модель', value: '4 модуля' },
    { label: 'входные данные', value: 'JSON / CSV / XLSX' },
    { label: 'выход', value: 'таблицы, графики, отчёт' },
    { label: 'хранение', value: 'БД проектов' },
  ];

  const heroRobotEmotions = ['happy', 'calm', 'thinking', 'surprised', 'sad'];

  const [heroRobotEmotion, setHeroRobotEmotion] = useState('happy');

  useEffect(() => {
    const timer = window.setInterval(() => {
      setHeroRobotEmotion((prev) => {
        const next = heroRobotEmotions.filter((item) => item !== prev);
        return next[Math.floor(Math.random() * next.length)];
      });
    }, 3200);

    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="enterprise-home">
      <section className="enterprise-hero">
        <div className="hero-orb hero-orb-one" />
        <div className="hero-orb hero-orb-two" />
        <div className="hero-noise" />

        <div className="enterprise-hero-left">
          <motion.div className="enterprise-badge glass-soft" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55 }}>
            <BrainCircuit size={18} />
            <span>ВКР · Автор Баранов М.В.</span>
          </motion.div>

          <motion.h1 initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.65, delay: 0.08 }}>
            Интеллектуальная система поддержки инновационной модернизации
          </motion.h1>

          <motion.p className="enterprise-lead" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.65, delay: 0.16 }}>
            Приложение объединяет производственное планирование, моделирование роботизированных звеньев, анализ рисков и экономическую оценку проекта в единую цифровую среду принятия решений.
          </motion.p>

          <motion.div className="enterprise-actions" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.65, delay: 0.24 }}>
            <button className="enterprise-primary" onClick={() => setPage('full')}>
              Запустить комплексный расчёт <ArrowRight size={18} />
            </button>
            <button className="enterprise-secondary" onClick={() => setPage('comparison')}>Сравнить программы</button>
            <button className="enterprise-secondary" onClick={loadDemo}>Загрузить демо</button>
          </motion.div>
          <motion.div
  className="hero-big-robot-card glass-soft"
  initial={{ opacity: 0, y: 18 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.65, delay: 0.34 }}
>
  <div className="hero-big-robot-text">
    <span>Интеллектуальный помощник</span>
    <strong>Система анализирует проект как единый цифровой контур</strong>
  </div>

  <div className={`hero-big-robot robot-${heroRobotEmotion}`}>
    <div className="hero-robot-antenna" />
    <div className="hero-robot-brow left" />
    <div className="hero-robot-brow right" />
    <div className="hero-robot-eye left" />
    <div className="hero-robot-eye right" />
    <div className="hero-robot-mouth" />
  </div>
</motion.div>
        </div>

        <motion.div className="enterprise-hero-right" initial={{ opacity: 0, scale: 0.94, y: 24 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: 0.75, delay: 0.16 }}>
          <div className="enterprise-terminal glass">
            <div className="terminal-top"><span /><span /><span /></div>
            <div className="terminal-grid">
              <div className="terminal-card active"><span>Производственная программа</span><strong>Алгоритм Джонсона</strong></div>
              <div className="terminal-card"><span>Роботизированные звенья</span><strong>Теория массового обслуживания</strong></div>
              <div className="terminal-card"><span>Анализ рисков</span><strong>Вальд · Сэвидж · Гурвиц</strong></div>
              <div className="terminal-card"><span>Экономика проекта</span><strong>NPV · IRR · ROI</strong></div>
            </div>
            <div className="terminal-pipeline"><div /><div /><div /></div>
            <div className="terminal-result"><span>Единое управленческое решение</span><strong>готово к расчёту</strong></div>
          </div>
        </motion.div>
      </section>

      <section className="enterprise-strip">
        {effects.map((item, index) => (
          <motion.div className="enterprise-strip-card glass-soft" key={item.label} initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: index * 0.06 }}>
            <span>{item.label}</span><strong>{item.value}</strong>
          </motion.div>
        ))}
      </section>

      <section className="enterprise-section enterprise-problem">
        <div className="enterprise-section-head">
          <span>Зачем нужна система</span>
          <h2>Проблема модернизации не в одном расчёте, а в связке решений</h2>
          <p>На практике предприятие должно одновременно учитывать загрузку оборудования, состав роботизированных участков, неопределённость рисков и экономический эффект.</p>
        </div>
    <div className="pain-grid clean-pain-grid">
  {pains.map((pain, index) => (
    <motion.div
      className="clean-pain-card"
      key={pain.title}
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      whileHover={{ y: -5 }}
      viewport={{ once: true }}
      transition={{ delay: index * 0.08 }}
    >
      <div className="clean-pain-top">
        <div className="clean-pain-number">
          {String(index + 1).padStart(2, '0')}
        </div>
        <span>{pain.status}</span>
      </div>

      <div className="clean-pain-content">
        <h3>{pain.title}</h3>
        <p>{pain.text}</p>
      </div>
    </motion.div>
  ))}
</div>
      </section>

      <section className="enterprise-section">
        <div className="enterprise-section-head compact">
          <span>Расчётное ядро</span>
          <h2>Четыре модуля, которые работают как единая система</h2>
        </div>
        <div className="enterprise-module-grid">
          {modules.map((module, index) => (
            <motion.button key={module.title} className="enterprise-module-card" onClick={() => setPage(module.page)} initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} whileHover={{ y: -8, scale: 1.01 }} viewport={{ once: true }} transition={{ delay: index * 0.08 }}>
              <div className="module-glow" />
              <div className="enterprise-module-top"><div className="enterprise-module-icon">{module.icon}</div><span>{module.subtitle}</span></div>
              <h3>{module.title}</h3>
              <p>{module.text}</p>
              <div className="module-pain"><b>Боль:</b> {module.pain}</div>
              <div className="module-result"><CircleCheckBig size={16} /><span>{module.result}</span></div>
            </motion.button>
          ))}
        </div>
      </section>
    </div>
  );
}
