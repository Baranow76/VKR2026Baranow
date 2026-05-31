import { useState, type FormEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Rocket, Mail, Lock, User, LoaderCircle, LogIn, UserPlus, ShieldCheck } from 'lucide-react';
import { useAuth } from './AuthContext';
import './auth.css';

type Mode = 'login' | 'register';

export default function AuthScreen() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isRegister = mode === 'register';
  const passwordTooShort = isRegister && password.length > 0 && password.length < 8;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (isRegister && password.length < 8) {
      setError('Пароль должен содержать минимум 8 символов');
      return;
    }
    setLoading(true);
    try {
      if (isRegister) await register(email.trim(), password, fullName.trim() || undefined);
      else await login(email.trim(), password);
    } catch (err: any) {
      setError(err?.message || 'Ошибка авторизации');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-ambient auth-ambient-1" />
      <div className="auth-ambient auth-ambient-2" />

      <motion.div
        className="auth-card glass"
        initial={{ opacity: 0, y: 24, filter: 'blur(8px)' }}
        animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
      >
        <div className="auth-brand">
          <div className="auth-brand-mark"><Rocket size={22} /></div>
          <div>
            <div className="auth-brand-title">Modernization IS</div>
            <div className="auth-brand-subtitle">Система поддержки инновационной модернизации</div>
          </div>
        </div>

        <div className="auth-tabs">
          <button
            className={`auth-tab ${!isRegister ? 'active' : ''}`}
            onClick={() => { setMode('login'); setError(null); }}
            type="button"
          >
            <LogIn size={16} /> Вход
          </button>
          <button
            className={`auth-tab ${isRegister ? 'active' : ''}`}
            onClick={() => { setMode('register'); setError(null); }}
            type="button"
          >
            <UserPlus size={16} /> Регистрация
          </button>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <AnimatePresence initial={false}>
            {isRegister && (
              <motion.label
                className="auth-field"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
              >
                <span><User size={15} /> Имя</span>
                <input
                  type="text"
                  value={fullName}
                  placeholder="Баранов М.В."
                  autoComplete="name"
                  onChange={(e) => setFullName(e.target.value)}
                />
              </motion.label>
            )}
          </AnimatePresence>

          <label className="auth-field">
            <span><Mail size={15} /> Email</span>
            <input
              type="email"
              required
              value={email}
              placeholder="you@example.com"
              autoComplete="email"
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>

          <label className="auth-field">
            <span><Lock size={15} /> Пароль</span>
            <input
              type="password"
              required
              value={password}
              placeholder={isRegister ? 'Минимум 8 символов' : '••••••••'}
              autoComplete={isRegister ? 'new-password' : 'current-password'}
              onChange={(e) => setPassword(e.target.value)}
            />
            {passwordTooShort && <span className="auth-hint-warn">Минимум 8 символов</span>}
          </label>

          <AnimatePresence>
            {error && (
              <motion.div
                className="auth-error"
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          <button className="auth-submit" type="submit" disabled={loading}>
            {loading ? <LoaderCircle size={18} className="spin" /> : (isRegister ? <UserPlus size={18} /> : <LogIn size={18} />)}
            {loading ? 'Подождите…' : isRegister ? 'Создать аккаунт' : 'Войти'}
          </button>
        </form>

        <div className="auth-footer">
          <ShieldCheck size={14} />
          <span>Пароли хранятся в виде хеша, доступ защищён JWT-токенами.</span>
        </div>
      </motion.div>
    </div>
  );
}
