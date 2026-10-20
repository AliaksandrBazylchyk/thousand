import type { ReactNode } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router';
import { AuthProvider, RequireAuth } from './auth';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';
import { ProfilePage } from './pages/ProfilePage';
import { RoomPage } from './pages/RoomPage';
import { GamePage } from './pages/GamePage';
import { TvGamePage, TvRoomPage } from './pages/TvPage';
import { PlayerStatsPage, StatsPage } from './pages/StatsPage';
import { SettingsPage } from './pages/SettingsPage';

const auth = (page: ReactNode) => <RequireAuth>{page}</RequireAuth>;

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Без входа: вход и регистрация, ТВ по секретной ссылке, настройки устройства. */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/tv/:key" element={<TvRoomPage />} />
          <Route path="/tv/:key/g/:gameId" element={<TvGamePage />} />
          <Route path="/settings" element={<SettingsPage />} />

          <Route path="/" element={auth(<HomePage />)} />
          <Route path="/profile" element={auth(<ProfilePage />)} />
          <Route path="/r/:code" element={auth(<RoomPage />)} />
          <Route path="/r/:code/g/:gameId" element={auth(<GamePage />)} />
          <Route path="/r/:code/stats" element={auth(<StatsPage />)} />
          <Route path="/r/:code/stats/:playerId" element={auth(<PlayerStatsPage />)} />
          <Route path="*" element={<p className="page">Страница не найдена</p>} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
