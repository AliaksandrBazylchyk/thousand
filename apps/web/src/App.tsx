import { useEffect, useState } from 'react';

type Health = { ok: boolean; cardPoints: number };

export function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/health')
      .then((res) => res.json() as Promise<Health>)
      .then(setHealth)
      .catch((err: unknown) => setError(String(err)));
  }, []);

  return (
    <main className="app">
      <h1>Тысяча</h1>
      {health && <p>Сервер на связи. Очков в колоде: {health.cardPoints}</p>}
      {error && <p className="error">Сервер недоступен: {error}</p>}
      {!health && !error && <p>Подключение…</p>}
    </main>
  );
}
