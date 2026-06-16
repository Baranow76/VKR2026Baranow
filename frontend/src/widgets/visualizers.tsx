// Визуализации результатов: карта роботизированных звеньев и анимация потока
// производственной программы.
import { motion } from 'framer-motion';
import { formatValue } from '../shared/utils/formatters';

export function RoboticLinksVisualizer({ links }: { links: any[] }) {
  if (!links || !links.length) {
    return <div className="empty-result">Роботизированные звенья пока не сформированы.</div>;
  }

  const emotions = [
    { key: 'happy', label: 'доволен конфигурацией', face: 'улыбается' },
    { key: 'calm', label: 'работает стабильно', face: 'спокоен' },
    { key: 'thinking', label: 'анализирует загрузку', face: 'думает' },
    { key: 'sad', label: 'перегружен операциями', face: 'грустит' },
    { key: 'surprised', label: 'обнаружил отклонение', face: 'удивлён' },
  ];

  function getRobotState(load: number, robotIndex: number) {
    const baseEmotion = emotions[robotIndex % emotions.length];

    if (load >= 85) {
      return { key: 'sad', label: 'перегружен операциями', face: 'грустит' };
    }

    if (load <= 35) {
      return { key: 'surprised', label: 'заметил недогрузку', face: 'удивлён' };
    }

    return baseEmotion;
  }

  return (
    <div className="robotic-map">
      {links.map((link, robotIndex) => {
        const load = Number(link.robot_load_percent || 0);
        const emotion = getRobotState(load, robotIndex);

        return (
          <motion.div
            key={link.link_number ?? robotIndex}
            className="robot-cell glass-soft"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: robotIndex * 0.08 }}
          >
            <div className="robot-head">
              <div
                className={`robot-icon robot-face robot-${emotion.key} robot-motion-${robotIndex % 5}`}
                title={`Робот ${emotion.face}`}
              >
                <div className="robot-antenna" />
                <div className="robot-brow left" />
                <div className="robot-brow right" />
                <div className="robot-eye left" />
                <div className="robot-eye right" />
                <div className="robot-mouth" />
              </div>

              <div>
                <strong>Робот №{link.link_number ?? robotIndex + 1}</strong>
                <span>Загрузка {formatValue(load)}%</span>
                <small className="robot-emotion-label">{emotion.label}</small>
              </div>
            </div>

            <div className="machine-chain">
              {link.operations?.length ? (
                link.operations.map((operation: any, index: number) => (
                  <motion.div
                    className="machine-node"
                    key={`${operation.name || operation.machine || 'operation'}-${index}`}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: robotIndex * 0.08 + index * 0.06 }}
                  >
                    <div className="machine-dot" />

                    <div>
                      <strong>{operation.machine || operation.name || `Операция ${index + 1}`}</strong>
                      <span>{operation.name || 'Операция без названия'}</span>
                    </div>
                  </motion.div>
                ))
              ) : (
                <div className="empty-result">Операции для данного робота не указаны.</div>
              )}
            </div>

            <div className="robot-load-bar">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(Math.max(load, 0), 100)}%` }}
                transition={{ duration: 0.9, delay: 0.2 }}
              />
            </div>

            <div className="robot-assessment">
              {link.assessment || emotion.label}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

export function ProductionFlowAnimation({ rows }: { rows: any[] }) {
  if (!rows.length) return <div className="empty-result">Производственная программа пока не сформирована.</div>;
  return <div className="production-flow"><div className="production-flow-line" />{rows.map((row, index) => <motion.div key={`${row.name}-${index}`} className="production-flow-item glass-soft" initial={{ opacity: 0, x: -24, scale: 0.96 }} animate={{ opacity: 1, x: 0, scale: 1 }} transition={{ delay: index * 0.14, duration: 0.45, ease: 'easeOut' }}><div className="production-flow-number">{String(index + 1).padStart(2, '0')}</div><div className="production-flow-content"><strong>{row.name}</strong><span>Объём: {formatValue(row.quantity)} · Переналадка: {formatValue(row.setup_time)} · Время: {formatValue(row.total_time)}</span></div><div className="production-flow-badge">{formatValue(row.cumulative_time)}</div></motion.div>)}</div>;
}
