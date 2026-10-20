import { useState, type FormEvent } from 'react';
import { Navigate, useSearchParams } from 'react-router';
import { api } from '../api';
import { useAuth } from '../auth';

/** Вход и регистрация по логину и паролю (ТЗ 5.0, 6.0). */
export function LoginPage() {
  const { me, setMe } = useAuth();
  const [params] = useSearchParams();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Возврат только на свой адрес: «next» не может увести на другой сайт.
  const raw = params.get('next') ?? '/';
  const next = raw.startsWith('/') && !raw.startsWith('//') ? raw : '/';
  if (me) return <Navigate to={next} replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setMe(
        mode === 'login'
          ? await api.login(login, password)
          : await api.register(login, password, name),
      );
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  const switchTo = (m: typeof mode) => {
    setMode(m);
    setError(null);
  };

  return (
    <main className="page auth-page">
      <header className="auth-brand">
        <span className="brand-mark" aria-hidden="true" />
        <h1>Тысяча</h1>
        <p className="muted">Таблица счёта для живой игры</p>
      </header>

      <form className="card stack auth-card" onSubmit={submit}>
        <div className="segmented" role="tablist" aria-label="Вход или регистрация">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'login'}
            className={mode === 'login' ? 'on' : ''}
            onClick={() => switchTo('login')}
          >
            Вход
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'register'}
            className={mode === 'register' ? 'on' : ''}
            onClick={() => switchTo('register')}
          >
            Регистрация
          </button>
        </div>

        <label className="field">
          Логин
          <input
            className="input"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            value={login}
            onChange={(e) => setLogin(e.target.value)}
            maxLength={32}
            required
            autoFocus
          />
          {mode === 'register' && (
            <span className="hint">
              Для входа. Латиница, цифры, точка, дефис, подчёркивание — от 3 до 32 знаков.
            </span>
          )}
        </label>

        {mode === 'register' && (
          <label className="field">
            Имя
            <input
              className="input"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={40}
              required
            />
            <span className="hint">
              Видно в профиле. В каждой комнате можно выбрать свой псевдоним.
            </span>
          </label>
        )}

        <label className="field">
          Пароль
          <span className="password-field">
            <input
              className="input"
              type={showPassword ? 'text' : 'password'}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={mode === 'register' ? 6 : undefined}
              maxLength={200}
              required
            />
            <button
              type="button"
              className="password-toggle"
              aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
              aria-pressed={showPassword}
              onClick={() => setShowPassword((v) => !v)}
            >
              <svg
                aria-hidden="true"
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
                <circle cx="12" cy="12" r="3" />
                {showPassword && <path d="M4 4l16 16" />}
              </svg>
            </button>
          </span>
          {mode === 'register' && <span className="hint">Не короче 6 знаков.</span>}
        </label>

        {error && (
          <p className="error-box" role="alert">
            {error}
          </p>
        )}

        <button className="btn primary big" disabled={busy}>
          {mode === 'login' ? 'Войти' : 'Создать учётную запись'}
        </button>
      </form>

      <p className="muted small center">
        {mode === 'login' ? (
          <>
            Нет учётной записи?{' '}
            <button type="button" className="link-btn" onClick={() => switchTo('register')}>
              Зарегистрируйтесь
            </button>{' '}
            — нужны только логин, пароль и имя.
          </>
        ) : (
          <>
            Уже есть учётная запись?{' '}
            <button type="button" className="link-btn" onClick={() => switchTo('login')}>
              Войти
            </button>
          </>
        )}
      </p>
    </main>
  );
}
