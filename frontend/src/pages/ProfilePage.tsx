// Страница «Профиль / Аккаунт»: данные пользователя, редактирование, смена
// пароля, настройки, безопасность (сессии, удаление аккаунта), статистика и
// карта активности (heatmap) на основе реальных данных backend.
import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  User as UserIcon, Mail, ShieldCheck, ShieldAlert, Pencil, Save, KeyRound,
  LogOut, Trash2, Sun, Moon, Activity, FolderOpen, GitCompare, Sigma,
  CalendarDays, MonitorSmartphone, CheckCircle2, X, ArrowRight,
} from 'lucide-react';
import { API_BASE } from '../utils/apiBase';
import type { AuthUser } from '../auth/AuthContext';
import './profile.css';

type Stats = {
  active_projects: number;
  total_calculations: number;
  comparison_scenarios: number;
  last_calculation_at: string | null;
  last_activity_at: string | null;
  module_runs: Record<string, number>;
  member_since: string | null;
};
type ActivityResp = {
  days: number;
  total_events: number;
  days_active: number;
  by_kind: Record<string, number>;
  series: { date: string; count: number }[];
};
type SessionItem = { id: number; created_at: string | null; expires_at: string | null };

type Props = {
  user: AuthUser;
  refreshUser: () => Promise<void>;
  logout: () => Promise<void>;
  theme: 'light' | 'dark';
  setTheme: (updater: (prev: 'light' | 'dark') => 'light' | 'dark') => void;
  showToast: (type: 'success' | 'error', message: string) => void;
  projects: any[];
  scenarios: any[];
  historyItems: any[];
  goToProject: (id: number) => void;
};

const MODULE_LABELS: Record<string, string> = {
  production: 'Производство', robotics: 'Роботы', risks: 'Риски',
  economics: 'Экономика', full_project: 'Единый расчёт',
};

function initials(user: AuthUser): string {
  const base = user.full_name?.trim() || user.email;
  const parts = base.split(/[\s@.]+/).filter(Boolean);
  return (parts[0]?.[0] || '?').toUpperCase() + (parts[1]?.[0] || '').toUpperCase();
}

function fmtDate(value?: string | null) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleDateString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric' });
  } catch { return '—'; }
}

export default function ProfilePage({
  user, refreshUser, logout, theme, setTheme, showToast,
  projects, scenarios, historyItems, goToProject,
}: Props) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [activity, setActivity] = useState<ActivityResp | null>(null);
  const [sessions, setSessions] = useState<SessionItem[]>([]);

  const [editing, setEditing] = useState(false);
  const [fullName, setFullName] = useState(user.full_name || '');
  const [email, setEmail] = useState(user.email);
  const [savingProfile, setSavingProfile] = useState(false);

  const [curPwd, setCurPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [changingPwd, setChangingPwd] = useState(false);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePwd, setDeletePwd] = useState('');
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadAll() {
    try {
      const [s, a, se] = await Promise.all([
        fetch(`${API_BASE}/api/users/me/stats`).then((r) => (r.ok ? r.json() : null)),
        fetch(`${API_BASE}/api/users/me/activity?days=365`).then((r) => (r.ok ? r.json() : null)),
        fetch(`${API_BASE}/api/users/me/sessions`).then((r) => (r.ok ? r.json() : null)),
      ]);
      if (s) setStats(s);
      if (a) setActivity(a);
      if (se?.sessions) setSessions(se.sessions);
    } catch {
      /* backend недоступен — блоки покажут пустые состояния */
    }
  }

  async function saveProfile() {
    setSavingProfile(true);
    try {
      const body: any = { full_name: fullName };
      if (email !== user.email) body.email = email;
      const res = await fetch(`${API_BASE}/api/users/me`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.detail || 'Не удалось сохранить профиль');
      }
      await refreshUser();
      setEditing(false);
      showToast('success', 'Профиль обновлён.');
    } catch (e: any) {
      showToast('error', e.message || 'Ошибка сохранения профиля.');
    } finally {
      setSavingProfile(false);
    }
  }

  async function changePassword() {
    if (newPwd.length < 8) {
      showToast('error', 'Новый пароль должен быть не короче 8 символов.');
      return;
    }
    setChangingPwd(true);
    try {
      const res = await fetch(`${API_BASE}/api/users/me/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current_password: curPwd, new_password: newPwd }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.detail || 'Не удалось изменить пароль');
      }
      setCurPwd(''); setNewPwd('');
      showToast('success', 'Пароль изменён. Сессии на других устройствах завершены.');
      await loadAll();
    } catch (e: any) {
      showToast('error', e.message || 'Ошибка смены пароля.');
    } finally {
      setChangingPwd(false);
    }
  }

  async function revokeAll() {
    try {
      const res = await fetch(`${API_BASE}/api/users/me/sessions/revoke-all`, { method: 'POST' });
      if (!res.ok) throw new Error('Не удалось завершить сессии');
      showToast('success', 'Все сессии завершены. Выполняется выход.');
      await logout();
    } catch (e: any) {
      showToast('error', e.message || 'Ошибка завершения сессий.');
    }
  }

  async function deleteAccount() {
    setDeleting(true);
    try {
      const res = await fetch(`${API_BASE}/api/users/me`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: deletePwd }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.detail || 'Не удалось удалить аккаунт');
      }
      showToast('success', 'Аккаунт удалён.');
      await logout();
    } catch (e: any) {
      showToast('error', e.message || 'Ошибка удаления аккаунта.');
      setDeleting(false);
    }
  }

  const lastProject = useMemo(() => {
    if (!projects?.length) return null;
    return [...projects].sort((a, b) =>
      new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime())[0];
  }, [projects]);

  const role = user.is_superuser ? 'Администратор' : 'Пользователь';

  return (
    <div className="pf-shell">
      {/* --- Шапка профиля --- */}
      <motion.section className="pf-hero glass"
        initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <div className="pf-avatar">{initials(user)}</div>
        <div className="pf-hero-main">
          <div className="pf-hero-name">
            <h2>{user.full_name || 'Без имени'}</h2>
            <span className={`pf-badge ${user.is_verified ? 'ok' : 'warn'}`}>
              {user.is_verified ? <ShieldCheck size={13} /> : <ShieldAlert size={13} />}
              {user.is_verified ? 'Подтверждён' : 'Не подтверждён'}
            </span>
          </div>
          <div className="pf-hero-meta">
            <span><Mail size={14} /> {user.email}</span>
            <span><UserIcon size={14} /> {role}</span>
            <span><CalendarDays size={14} /> С нами с {fmtDate(stats?.member_since || user.created_at)}</span>
          </div>
        </div>
        <button className="button subtle" onClick={() => { setEditing((v) => !v); setFullName(user.full_name || ''); setEmail(user.email); }}>
          <Pencil size={15} /> {editing ? 'Закрыть' : 'Редактировать'}
        </button>
      </motion.section>

      {editing && (
        <motion.section className="pf-card glass" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}>
          <h3 className="pf-card-title"><Pencil size={16} /> Основная информация</h3>
          <div className="pf-form-grid">
            <label className="pf-field">
              <span>Имя</span>
              <input className="pf-input" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Ваше имя" />
            </label>
            <label className="pf-field">
              <span>Email {!user.is_verified && '(смена доступна после подтверждения)'}</span>
              <input className="pf-input" value={email} disabled={!user.is_verified}
                onChange={(e) => setEmail(e.target.value)} placeholder="email@example.com" />
            </label>
          </div>
          <button className="button primary" onClick={saveProfile} disabled={savingProfile}>
            <Save size={15} /> {savingProfile ? 'Сохранение…' : 'Сохранить изменения'}
          </button>
        </motion.section>
      )}

      {/* --- Статистика --- */}
      <section className="pf-stats-grid">
        <StatCard icon={<FolderOpen size={18} />} label="Активные проекты" value={stats?.active_projects ?? '—'} />
        <StatCard icon={<Sigma size={18} />} label="Расчётов выполнено" value={stats?.total_calculations ?? '—'} />
        <StatCard icon={<GitCompare size={18} />} label="Сценариев сравнения" value={stats?.comparison_scenarios ?? '—'} />
        <StatCard icon={<Activity size={18} />} label="Последний расчёт" value={fmtDate(stats?.last_calculation_at)} small />
      </section>

      {/* --- Карта активности --- */}
      <section className="pf-card glass">
        <h3 className="pf-card-title"><Activity size={16} /> Активность за год</h3>
        <ActivityHeatmap activity={activity} />
        {activity && (
          <div className="pf-activity-legend">
            <span>{activity.total_events} событий · {activity.days_active} активных дней</span>
            <div className="pf-legend-scale">
              Меньше
              <i className="pf-cell l0" /><i className="pf-cell l1" /><i className="pf-cell l2" /><i className="pf-cell l3" /><i className="pf-cell l4" />
              Больше
            </div>
          </div>
        )}
      </section>

      {/* --- Запуски по модулям --- */}
      {stats && Object.keys(stats.module_runs).length > 0 && (
        <section className="pf-card glass">
          <h3 className="pf-card-title"><Sigma size={16} /> Запуски по модулям</h3>
          <div className="pf-module-runs">
            {Object.entries(stats.module_runs).map(([mod, n]) => (
              <div className="pf-run-chip" key={mod}>
                <strong>{n}</strong>
                <span>{MODULE_LABELS[mod] || mod}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* --- Быстрые переходы --- */}
      <section className="pf-quick-grid">
        <div className="pf-card glass">
          <h3 className="pf-card-title"><FolderOpen size={16} /> Последний проект</h3>
          {lastProject ? (
            <button className="pf-quick-row" onClick={() => goToProject(lastProject.id)}>
              <div>
                <strong>{lastProject.name}</strong>
                <span>Обновлён {fmtDate(lastProject.updated_at)}</span>
              </div>
              <ArrowRight size={16} />
            </button>
          ) : <Empty text="Проектов пока нет" />}
        </div>

        <div className="pf-card glass">
          <h3 className="pf-card-title"><Sigma size={16} /> Последние расчёты</h3>
          {historyItems?.length ? (
            <div className="pf-mini-list">
              {historyItems.slice(0, 5).map((h: any) => (
                <div className="pf-mini-row" key={h.id}>
                  <span>{MODULE_LABELS[h.module] || h.module}</span>
                  <em>{h.created_at ? new Date(h.created_at).toLocaleString('ru-RU') : ''}</em>
                </div>
              ))}
            </div>
          ) : <Empty text="Расчётов пока нет" />}
        </div>

        <div className="pf-card glass">
          <h3 className="pf-card-title"><GitCompare size={16} /> Сценарии сравнения</h3>
          {scenarios?.length ? (
            <div className="pf-mini-list">
              {scenarios.slice(0, 5).map((s: any) => (
                <div className="pf-mini-row" key={s.id}>
                  <span>{s.name}</span>
                  <em>{s.created_at ? new Date(s.created_at).toLocaleDateString('ru-RU') : ''}</em>
                </div>
              ))}
            </div>
          ) : <Empty text="Сценариев пока нет" />}
        </div>
      </section>

      {/* --- Настройки --- */}
      <section className="pf-card glass">
        <h3 className="pf-card-title"><MonitorSmartphone size={16} /> Настройки</h3>
        <div className="pf-setting-row">
          <div>
            <strong>Тема оформления</strong>
            <span>Светлая или тёмная тема интерфейса.</span>
          </div>
          <button className="button subtle" onClick={() => setTheme((p) => (p === 'light' ? 'dark' : 'light'))}>
            {theme === 'light' ? <Moon size={15} /> : <Sun size={15} />}
            {theme === 'light' ? 'Тёмная' : 'Светлая'}
          </button>
        </div>
        <div className="pf-setting-row">
          <div>
            <strong>Язык интерфейса</strong>
            <span>Русский (единственный доступный язык системы).</span>
          </div>
          <span className="pf-pill">Русский</span>
        </div>
      </section>

      {/* --- Смена пароля --- */}
      <section className="pf-card glass">
        <h3 className="pf-card-title"><KeyRound size={16} /> Смена пароля</h3>
        <div className="pf-form-grid">
          <label className="pf-field">
            <span>Текущий пароль</span>
            <input className="pf-input" type="password" value={curPwd} onChange={(e) => setCurPwd(e.target.value)} autoComplete="current-password" />
          </label>
          <label className="pf-field">
            <span>Новый пароль (мин. 8 символов)</span>
            <input className="pf-input" type="password" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} autoComplete="new-password" />
          </label>
        </div>
        <button className="button primary" onClick={changePassword} disabled={changingPwd || !curPwd || !newPwd}>
          <KeyRound size={15} /> {changingPwd ? 'Сохранение…' : 'Изменить пароль'}
        </button>
      </section>

      {/* --- Безопасность --- */}
      <section className="pf-card glass">
        <h3 className="pf-card-title"><ShieldCheck size={16} /> Безопасность и сессии</h3>
        <div className="pf-sessions">
          <div className="pf-session-summary">
            <MonitorSmartphone size={18} />
            <div>
              <strong>{sessions.length} активных сессий</strong>
              <span>Устройства, на которых выполнен вход.</span>
            </div>
          </div>
          <div className="pf-session-list">
            {sessions.length === 0 && <Empty text="Активных сессий не найдено" />}
            {sessions.map((s) => (
              <div className="pf-session-row" key={s.id}>
                <MonitorSmartphone size={15} />
                <span>Сессия #{s.id}</span>
                <em>с {fmtDate(s.created_at)} · до {fmtDate(s.expires_at)}</em>
              </div>
            ))}
          </div>
          <div className="pf-security-actions">
            <button className="button secondary" onClick={revokeAll}>
              <LogOut size={15} /> Выйти со всех устройств
            </button>
            <button className="button subtle" onClick={logout}>
              <LogOut size={15} /> Выйти
            </button>
          </div>
        </div>
      </section>

      {/* --- Опасная зона --- */}
      <section className="pf-card pf-danger glass">
        <h3 className="pf-card-title danger"><Trash2 size={16} /> Удаление аккаунта</h3>
        <p className="pf-danger-text">
          Аккаунт и все связанные данные (проекты, расчёты, сценарии) будут безвозвратно удалены.
          Действие необратимо.
        </p>
        <button className="button danger-btn" onClick={() => setDeleteOpen(true)}>
          <Trash2 size={15} /> Удалить аккаунт
        </button>
      </section>

      {/* --- Модал подтверждения удаления --- */}
      {deleteOpen && (
        <div className="pf-modal-backdrop" onClick={() => !deleting && setDeleteOpen(false)}>
          <motion.div className="pf-modal glass" onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
            <button className="pf-modal-close" onClick={() => setDeleteOpen(false)}><X size={18} /></button>
            <div className="pf-modal-icon"><ShieldAlert size={26} /></div>
            <h3>Подтвердите удаление</h3>
            <p>
              Это удалит ваш аккаунт <strong>{user.email}</strong> и все проекты, расчёты и сценарии.
              Введите пароль для подтверждения.
            </p>
            <input className="pf-input" type="password" placeholder="Пароль" value={deletePwd}
              onChange={(e) => setDeletePwd(e.target.value)} autoComplete="current-password" />
            <div className="pf-modal-actions">
              <button className="button subtle" onClick={() => setDeleteOpen(false)} disabled={deleting}>Отмена</button>
              <button className="button danger-btn" onClick={deleteAccount} disabled={deleting || !deletePwd}>
                <Trash2 size={15} /> {deleting ? 'Удаление…' : 'Удалить навсегда'}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}

function StatCard({ icon, label, value, small }: { icon: any; label: string; value: any; small?: boolean }) {
  return (
    <div className="pf-stat glass-soft">
      <div className="pf-stat-icon">{icon}</div>
      <div>
        <div className={`pf-stat-value ${small ? 'small' : ''}`}>{value}</div>
        <div className="pf-stat-label">{label}</div>
      </div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="pf-empty">{text}</div>;
}

// --- GitHub-подобная карта активности ---
function ActivityHeatmap({ activity }: { activity: ActivityResp | null }) {
  const { weeks, max, monthLabels } = useMemo(() => {
    const counts = new Map<string, number>();
    (activity?.series || []).forEach((d) => counts.set(d.date, d.count));

    const today = new Date();
    // Конец сетки — суббота текущей недели; всего 53 недели назад.
    const end = new Date(today);
    end.setDate(end.getDate() + (6 - end.getDay()));
    const totalDays = 53 * 7;
    const start = new Date(end);
    start.setDate(start.getDate() - (totalDays - 1));

    const cells: { date: string; count: number; future: boolean }[] = [];
    let maxC = 0;
    for (let i = 0; i < totalDays; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const iso = d.toISOString().slice(0, 10);
      const count = counts.get(iso) || 0;
      maxC = Math.max(maxC, count);
      cells.push({ date: iso, count, future: d > today });
    }
    const wks: typeof cells[] = [];
    for (let i = 0; i < cells.length; i += 7) wks.push(cells.slice(i, i + 7));

    // Подписи месяцев над колонками недель.
    const labels: { col: number; label: string }[] = [];
    let lastMonth = -1;
    wks.forEach((wk, col) => {
      const first = wk[0];
      if (!first) return;
      const m = new Date(first.date).getMonth();
      if (m !== lastMonth) {
        labels.push({ col, label: new Date(first.date).toLocaleDateString('ru-RU', { month: 'short' }) });
        lastMonth = m;
      }
    });

    return { weeks: wks, max: maxC, monthLabels: labels };
  }, [activity]);

  function level(count: number): number {
    if (count <= 0) return 0;
    if (max <= 1) return 4;
    const r = count / max;
    if (r > 0.66) return 4;
    if (r > 0.33) return 3;
    if (r > 0.1) return 2;
    return 1;
  }

  return (
    <div className="pf-heatmap-wrap">
      <div className="pf-heatmap">
        <div className="pf-heatmap-months">
          {monthLabels.map((m, i) => (
            <span key={i} style={{ gridColumnStart: m.col + 1 }}>{m.label}</span>
          ))}
        </div>
        <div className="pf-heatmap-grid">
          {weeks.map((wk, wi) => (
            <div className="pf-heatmap-col" key={wi}>
              {wk.map((c, di) => (
                <i
                  key={di}
                  className={`pf-cell l${c.future ? 0 : level(c.count)} ${c.future ? 'future' : ''}`}
                  title={c.future ? '' : `${c.date}: ${c.count} событий`}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
