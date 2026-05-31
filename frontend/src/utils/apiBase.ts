// Базовый адрес API (та же логика, что и в App.tsx): локальная разработка на
// localhost/127.0.0.1 указывает на backend :8000, в проде — тот же origin.
const isLocalDev = ['localhost', '127.0.0.1'].includes(window.location.hostname);

export const API_BASE: string =
  (import.meta.env.VITE_API_BASE as string | undefined) ??
  (isLocalDev ? `http://${window.location.hostname}:8000` : '');
