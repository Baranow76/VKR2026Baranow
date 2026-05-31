import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { LoaderCircle } from 'lucide-react'
import './styles.css'
import App from './App'
import { AuthProvider, useAuth } from './auth/AuthContext'
import AuthScreen from './auth/AuthScreen'
import OtpScreen from './auth/OtpScreen'
import './auth/auth.css'

function AuthGate() {
  const { status, verificationEmail } = useAuth()

  if (status === 'loading') {
    return (
      <div className="auth-loading">
        <LoaderCircle size={28} className="spin" />
        <span>Загрузка…</span>
      </div>
    )
  }
  // Ожидание подтверждения email имеет приоритет над приложением:
  // после verify пользователь видит анимацию успеха, затем — приложение.
  if (verificationEmail && status !== 'authed') return <OtpScreen />
  if (status === 'guest') return <AuthScreen />
  return <App />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <AuthGate />
    </AuthProvider>
  </StrictMode>,
)
