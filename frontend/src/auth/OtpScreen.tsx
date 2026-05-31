import { useEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import { motion, AnimatePresence, useReducedMotion, type Variants } from 'framer-motion';
import { Mail, LoaderCircle, Check, ArrowLeft, RefreshCw } from 'lucide-react';
import { useAuth } from './AuthContext';
import './otp.css';

// Длина кода соответствует OTP_LENGTH на backend (по умолчанию 6).
const CODE_LENGTH = 6;
// Интервал повторной отправки соответствует OTP_RESEND_INTERVAL_SECONDS (60).
const RESEND_COOLDOWN = 60;

// Явные состояния экрана OTP.
type Phase = 'idle' | 'typing' | 'verifying' | 'success' | 'error';

const CENTER = (CODE_LENGTH - 1) / 2;

export default function OtpScreen() {
  const { verificationEmail, verifyOtp, finalizeAuth, resendOtp, cancelVerification } = useAuth();
  const reduce = useReducedMotion();

  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(''));
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN);
  const [resent, setResent] = useState(false);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  const code = digits.join('');
  const verifying = phase === 'verifying';
  const success = phase === 'success';
  const locked = verifying || success; // во время проверки/успеха ввод заблокирован

  useEffect(() => { inputs.current[0]?.focus(); }, []);

  // Таймер cooldown для повторной отправки.
  useEffect(() => {
    if (cooldown <= 0) return;
    const id = window.setInterval(() => setCooldown((c) => c - 1), 1000);
    return () => window.clearInterval(id);
  }, [cooldown]);

  // Автоотправка при полном вводе кода.
  useEffect(() => {
    if (code.length === CODE_LENGTH && !locked) void submit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  async function submit() {
    if (code.length !== CODE_LENGTH) return;
    setPhase('verifying');
    setError(null);
    try {
      await verifyOtp(code);
      // Успех: запускаем converge-анимацию и затем переход в приложение.
      setPhase('success');
      window.setTimeout(() => finalizeAuth(), reduce ? 700 : 1900);
    } catch (e: any) {
      // Ошибка: подсветка + shake + грустный робот; поле остаётся доступным.
      setError(e?.message || 'Неверный код. Проверьте письмо и попробуйте снова');
      setPhase('error');
      setDigits(Array(CODE_LENGTH).fill(''));
      inputs.current[0]?.focus();
    }
  }

  function setDigit(i: number, value: string) {
    const v = value.replace(/\D/g, '').slice(-1);
    setDigits((prev) => {
      const next = [...prev];
      next[i] = v;
      return next;
    });
    if (error) setError(null);
    setPhase('typing');
    if (v && i < CODE_LENGTH - 1) inputs.current[i + 1]?.focus();
  }

  function onKeyDown(i: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !digits[i] && i > 0) {
      inputs.current[i - 1]?.focus();
    } else if (e.key === 'ArrowLeft' && i > 0) {
      inputs.current[i - 1]?.focus();
    } else if (e.key === 'ArrowRight' && i < CODE_LENGTH - 1) {
      inputs.current[i + 1]?.focus();
    }
  }

  function onPaste(e: ClipboardEvent<HTMLInputElement>) {
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, CODE_LENGTH);
    if (!text) return;
    e.preventDefault();
    const next = Array(CODE_LENGTH).fill('');
    for (let k = 0; k < text.length; k++) next[k] = text[k];
    setDigits(next);
    if (error) setError(null);
    inputs.current[Math.min(text.length, CODE_LENGTH - 1)]?.focus();
  }

  async function handleResend() {
    if (cooldown > 0 || locked) return;
    setError(null);
    try {
      await resendOtp();
      setCooldown(RESEND_COOLDOWN);
      setDigits(Array(CODE_LENGTH).fill(''));
      setPhase('idle');
      setResent(true);
      window.setTimeout(() => setResent(false), 3000);
      inputs.current[0]?.focus();
    } catch (e: any) {
      setError(e?.message || 'Не удалось отправить код повторно');
      setPhase('error');
    }
  }

  // --- Варианты анимации ячеек кода (transform/opacity, без layout) ---
  const cellVariants: Variants = {
    hidden: { opacity: 0, y: 8, scale: 0.9 },
    show: (i: number) => ({
      opacity: 1, y: 0, scale: 1,
      transition: { delay: reduce ? 0 : i * 0.04, type: 'spring', stiffness: 320, damping: 24 },
    }),
    // Converge: ячейки слетаются к центру с подкруткой и исчезают.
    converge: (i: number) => reduce
      ? { opacity: 0, transition: { duration: 0.2 } }
      : {
          x: (CENTER - i) * 54,
          rotate: (i - CENTER) * 10,
          scale: 0.15,
          opacity: 0,
          transition: { duration: 0.55, ease: [0.6, 0, 0.35, 1], delay: (CODE_LENGTH - 1 - i) * 0.02 },
        },
  };

  return (
    <div className="otp-shell">
      <motion.div
        className={`otp-card ${success ? 'is-success' : ''} ${phase === 'error' ? 'is-error' : ''}`}
        initial={{ opacity: 0, scale: 0.94, y: 18 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      >
        {/* Мягкое анимированное свечение-контур вокруг карточки */}
        <div className="otp-glow" aria-hidden />

        <AnimatePresence mode="wait">
          {!success ? (
            <motion.div key="form" exit={{ opacity: 0 }} className="otp-body">
              <div className="otp-icon"><Mail size={26} /></div>
              <h2 className="otp-title">Подтверждение email</h2>
              <p className="otp-subtitle">
                Мы отправили код подтверждения на
                {verificationEmail ? <><br /><strong>{verificationEmail}</strong></> : ' вашу почту'}
              </p>

              {/* Ячейки кода. shake при ошибке — на всём ряду. */}
              <motion.div
                className={`otp-inputs ${verifying ? 'verifying' : ''}`}
                onPaste={onPaste}
                animate={phase === 'error' && !reduce ? { x: [0, -9, 8, -6, 4, 0] } : { x: 0 }}
                transition={{ duration: 0.4 }}
              >
                {digits.map((d, i) => (
                  <motion.div
                    key={i}
                    className={`otp-cell ${d ? 'filled' : ''} ${phase === 'error' ? 'error' : ''}`}
                    custom={i}
                    variants={cellVariants}
                    initial="hidden"
                    animate="show"
                    exit="converge"
                  >
                    <input
                      ref={(el) => { inputs.current[i] = el; }}
                      className="otp-digit"
                      inputMode="numeric"
                      autoComplete={i === 0 ? 'one-time-code' : 'off'}
                      maxLength={1}
                      value={d}
                      disabled={locked}
                      onChange={(e) => setDigit(i, e.target.value)}
                      onKeyDown={(e) => onKeyDown(i, e)}
                    />
                    {/* Анимированное появление цифры поверх инпута */}
                    <AnimatePresence>
                      {d && (
                        <motion.span
                          key={d}
                          className="otp-digit-ghost"
                          initial={{ opacity: 0, scale: 0.5, y: 4 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0 }}
                          transition={{ type: 'spring', stiffness: 500, damping: 28 }}
                        >
                          {d}
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </motion.div>
                ))}
              </motion.div>

              {/* Ошибка: сообщение + грустный робот */}
              <AnimatePresence>
                {error && (
                  <motion.div
                    className="otp-error"
                    initial={{ opacity: 0, y: -4, height: 0 }}
                    animate={{ opacity: 1, y: 0, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                  >
                    <SadRobot />
                    <span>{error}</span>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Уведомление об успешной повторной отправке */}
              <AnimatePresence>
                {resent && !error && (
                  <motion.div
                    className="otp-notice"
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                  >
                    Новый код отправлен на почту
                  </motion.div>
                )}
              </AnimatePresence>

              <button className="otp-submit" onClick={submit} disabled={locked || code.length !== CODE_LENGTH}>
                {verifying ? <LoaderCircle size={18} className="spin" /> : <Check size={18} />}
                {verifying ? 'Проверяем код…' : 'Подтвердить'}
              </button>

              <div className="otp-resend">
                {cooldown > 0 ? (
                  <span className="otp-resend-wait">Отправить код повторно через {cooldown} с</span>
                ) : (
                  <button className="otp-resend-btn" onClick={handleResend} type="button" disabled={locked}>
                    <RefreshCw size={14} /> Отправить код повторно
                  </button>
                )}
              </div>

              <button className="otp-back" onClick={cancelVerification} type="button" disabled={locked}>
                <ArrowLeft size={14} /> Изменить email
              </button>
            </motion.div>
          ) : (
            <motion.div
              key="success"
              className="otp-success"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <motion.div
                className="otp-check"
                initial={{ scale: 0, rotate: -25 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: 'spring', stiffness: 200, damping: 15, delay: reduce ? 0 : 0.15 }}
              >
                <Check size={42} strokeWidth={3} />
              </motion.div>
              <motion.h2
                className="otp-success-title"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: reduce ? 0 : 0.3 }}
              >
                Успешно подтверждено
              </motion.h2>
              <motion.p
                className="otp-success-sub"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: reduce ? 0 : 0.45 }}
              >
                Выполняется вход в систему…
              </motion.p>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

// Грустный робот (SVG, без внешних картинок). Цвета через currentColor —
// корректно работает в светлой и тёмной теме. Лёгкое покачивание антенны.
function SadRobot() {
  const reduce = useReducedMotion();
  return (
    <motion.svg
      className="otp-sad-robot"
      width="36" height="36" viewBox="0 0 48 48" fill="none"
      aria-hidden
      initial={{ opacity: 0, scale: 0.6, y: -4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 18 }}
    >
      {/* антенна (покачивается) */}
      <motion.g
        animate={reduce ? undefined : { rotate: [-7, 7, -7] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
        style={{ originX: '24px', originY: '12px' }}
      >
        <line x1="24" y1="6" x2="24" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <circle cx="24" cy="5" r="2" fill="currentColor" />
      </motion.g>
      {/* голова */}
      <rect x="9" y="12" width="30" height="26" rx="9" stroke="currentColor" strokeWidth="2.2" />
      {/* грустные брови (опущены к центру) */}
      <line x1="15.5" y1="22" x2="21" y2="24" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <line x1="32.5" y1="22" x2="27" y2="24" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      {/* глаза */}
      <circle cx="18" cy="26.5" r="1.7" fill="currentColor" />
      <circle cx="30" cy="26.5" r="1.7" fill="currentColor" />
      {/* грустный рот (дуга вниз) */}
      <path d="M19 34 Q24 30 29 34" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" fill="none" />
    </motion.svg>
  );
}
