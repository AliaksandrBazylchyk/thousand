import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { api } from '../api';
import { getRecentRooms } from '../identity';

export function HomePage() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const recent = getRecentRooms();

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const room = await api.createRoom(name);
      navigate(`/r/${room.code}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <main className="page">
      <h1>Тысяча</h1>
      <p className="muted">Таблица счёта для живой игры в «Тысячу».</p>

      <form className="card stack" onSubmit={submit}>
        <h2>Новая комната</h2>
        <input
          className="input"
          placeholder="Название, например «Дача»"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={60}
          required
        />
        <button className="btn primary" disabled={busy || !name.trim()}>
          Создать комнату
        </button>
        {error && <p className="error">{error}</p>}
      </form>

      {recent.length > 0 && (
        <section className="card stack">
          <h2>Мои комнаты</h2>
          {recent.map((r) => (
            <Link key={r.code} className="btn" to={`/r/${r.code}`}>
              {r.name}
            </Link>
          ))}
        </section>
      )}
    </main>
  );
}
