import { BrowserRouter, Route, Routes } from 'react-router';
import { HomePage } from './pages/HomePage';
import { RoomPage } from './pages/RoomPage';
import { GamePage } from './pages/GamePage';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/r/:code" element={<RoomPage />} />
        <Route path="/r/:code/g/:gameId" element={<GamePage />} />
        <Route path="*" element={<p className="page">Страница не найдена</p>} />
      </Routes>
    </BrowserRouter>
  );
}
