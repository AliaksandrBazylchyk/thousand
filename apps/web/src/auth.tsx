// Вошедший пользователь (ТЗ 5.0): загружается при старте, сбрасывается при выходе или 401.

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import type { Me } from '@thousand/core';
import { api, UNAUTHORIZED_EVENT } from './api';
import { socket } from './socket';

interface AuthState {
  /** undefined — ещё загружается, null — не вошёл. */
  me: Me | null | undefined;
  setMe: (me: Me | null) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

/** Сокет узнаёт пользователя по cookie при подключении — после входа и выхода переподключаем. */
function reconnectSocket() {
  socket.disconnect();
  socket.connect();
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMeState] = useState<Me | null | undefined>(undefined);

  useEffect(() => {
    api
      .me()
      .then(setMeState)
      .catch(() => setMeState(null));
    const onUnauthorized = () => setMeState(null);
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, []);

  const setMe = useCallback(
    (next: Me | null) => {
      if ((me?.id ?? null) !== (next?.id ?? null)) reconnectSocket();
      setMeState(next);
    },
    [me],
  );

  const logout = useCallback(async () => {
    await api.logout().catch(() => undefined);
    setMe(null);
  }, [setMe]);

  return <AuthContext.Provider value={{ me, setMe, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth вне AuthProvider');
  return ctx;
}

/** Вошедший пользователь (внутри RequireAuth он всегда есть). */
export function useMeUser(): Me {
  const { me } = useAuth();
  if (!me) throw new Error('useMeUser без входа');
  return me;
}

/** Экраны только для вошедших: остальных отправляем на вход с возвратом обратно. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { me } = useAuth();
  const location = useLocation();
  if (me === undefined) return <main className="page muted">Загрузка…</main>;
  if (me === null) {
    const next = location.pathname + location.search;
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />;
  }
  return <>{children}</>;
}
