// Боковое меню приложения: бургер-кнопка, затемнение, панель навигации,
// переключатель темы и блок пользователя.
import { AnimatePresence, motion } from 'framer-motion';
import {
  Menu, X, LogOut, Rocket, LayoutDashboard, Boxes, Activity, ShieldCheck, Sigma,
  GitCompare, BrainCircuit, WandSparkles, Pencil, History, UserCircle,
} from 'lucide-react';
import { NavButton } from '../NavButton';
import type { Page } from '../../shared/types';
import type { AuthUser } from '../../auth/AuthContext';

type Props = {
  page: Page;
  setPage: (page: Page) => void;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  /** Вызывается, когда анимация ОТКРЫТИЯ завершена (можно включать backdrop blur). */
  onOpened?: () => void;
  theme: 'light' | 'dark';
  setTheme: (updater: (prev: 'light' | 'dark') => 'light' | 'dark') => void;
  user: AuthUser | null;
  logout: () => void;
};

export function Sidebar({ page, setPage, sidebarOpen, setSidebarOpen, onOpened, theme, setTheme, user, logout }: Props) {
  return (
    <>
      <button className="burger-button" onClick={() => setSidebarOpen(true)}>
        <Menu size={22} />
      </button>

      <AnimatePresence>
        {sidebarOpen && (
          <>
            <motion.div
              className="sidebar-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSidebarOpen(false)}
            />

            <motion.aside
              className="sidebar glass liquid-sidebar"
              /* Анимируем только transform+opacity (без filter/backdropFilter/scale).
                 onOpened вызываем лишь по завершении ВХОДА (sidebarOpen=true),
                 чтобы включить backdrop blur только в статичном состоянии. */
              initial={{ x: -340, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -340, opacity: 0 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              onAnimationComplete={() => { if (sidebarOpen) onOpened?.(); }}
            >
              <button className="sidebar-close" onClick={() => setSidebarOpen(false)}>
                <X size={20} />
              </button>

              <div className="brand-block">
                <div className="brand-mark">BM</div>
                <div>
                  <div className="brand-name">Modernization IS</div>
                  <div className="brand-subtitle">ВКР Баранов М.В.</div>
                </div>
              </div>

              <button className="theme-toggle" onClick={() => setTheme((prev) => (prev === 'light' ? 'dark' : 'light'))}>
                <span>{theme === 'light' ? '🌙' : '☀️'}</span>
                {theme === 'light' ? 'Тёмная тема' : 'Светлая тема'}
              </button>

              {user && (
                <div className="auth-user-block">
                  <button
                    className="auth-user-open"
                    onClick={() => { setPage('profile'); setSidebarOpen(false); }}
                    title="Открыть профиль"
                  >
                    <span className="auth-user-email">{user.full_name || user.email}</span>
                    <span className="auth-user-role">{user.email}</span>
                  </button>
                  <button className="auth-logout-btn" onClick={logout}>
                    <LogOut size={15} /> Выйти
                  </button>
                </div>
              )}

              <nav className="menu">
                <NavButton page={page} setPage={setPage} value="home" icon={<Rocket size={18} />} label="Главная" onNavigate={() => setSidebarOpen(false)} />
                <NavButton page={page} setPage={setPage} value="dashboard" icon={<LayoutDashboard size={18} />} label="Дашборд" onNavigate={() => setSidebarOpen(false)} />
                <NavButton page={page} setPage={setPage} value="production" icon={<Boxes size={18} />} label="Производственная программа" onNavigate={() => setSidebarOpen(false)} />
                <NavButton page={page} setPage={setPage} value="robotics" icon={<Activity size={18} />} label="Роботизированные звенья" onNavigate={() => setSidebarOpen(false)} />
                <NavButton page={page} setPage={setPage} value="risks" icon={<ShieldCheck size={18} />} label="Анализ рисков" onNavigate={() => setSidebarOpen(false)} />
                <NavButton page={page} setPage={setPage} value="economics" icon={<Sigma size={18} />} label="Экономика проекта" onNavigate={() => setSidebarOpen(false)} />
                <NavButton page={page} setPage={setPage} value="full" icon={<Rocket size={18} />} label="Единый расчёт" onNavigate={() => setSidebarOpen(false)} />
                <NavButton page={page} setPage={setPage} value="comparison" icon={<GitCompare size={18} />} label="Сравнение программ" onNavigate={() => setSidebarOpen(false)} />
                <NavButton page={page} setPage={setPage} value="ai" icon={<BrainCircuit size={18} />} label="ИИ: прогноз отказов" onNavigate={() => setSidebarOpen(false)} />
                <NavButton page={page} setPage={setPage} value="editor" icon={<WandSparkles size={18} />} label="ИИ-редактор данных" onNavigate={() => setSidebarOpen(false)} />
                <NavButton page={page} setPage={setPage} value="project-editor" icon={<Pencil size={18} />} label="Редактор проекта" onNavigate={() => setSidebarOpen(false)} />
                <NavButton page={page} setPage={setPage} value="history" icon={<History size={18} />} label="История" onNavigate={() => setSidebarOpen(false)} />
                <NavButton page={page} setPage={setPage} value="profile" icon={<UserCircle size={18} />} label="Профиль" onNavigate={() => setSidebarOpen(false)} />
              </nav>

              <div className="sidebar-card glass-soft">
                <div className="sidebar-card-title">Тема ВКР</div>
                <p>Модульная информационная система поддержки проекта инновационной модернизации на основе оригинальных математических моделей.</p>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
