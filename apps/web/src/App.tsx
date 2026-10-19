import { BrowserRouter, Route, Routes } from 'react-router';
import { HomePage } from './pages/HomePage';
import { RoomPage } from './pages/RoomPage';
import { GamePage } from './pages/GamePage';
import { TvGamePage, TvRoomPage } from './pages/TvPage';
import { PlayerStatsPage, StatsPage } from './pages/StatsPage';
import { SettingsPage } from './pages/SettingsPage';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/r/:code" element={<RoomPage />} />
        <Route path="/r/:code/g/:gameId" element={<GamePage />} />
        <Route path="/r/:code/tv" element={<TvRoomPage />} />
        <Route path="/r/:code/stats" element={<StatsPage />} />
        <Route path="/r/:code/stats/:playerId" element={<PlayerStatsPage />} />
        <Route path="/r/:code/g/:gameId/tv" element={<TvGamePage />} />
        <Route path="*" element={<p className="page">Страница не найдена</p>} />
      </Routes>
    </BrowserRouter>
  );
}
