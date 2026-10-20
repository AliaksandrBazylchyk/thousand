import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import type { RoomListItem } from '@thousand/core';
import { api } from '../api';
import { useInstall } from '../pwa';

export function HomePage() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Комнаты берутся с сервера, поэтому они видны и с нового устройства.
  const [rooms, setRooms] = useState<RoomListItem[] | null>(null);
  const [roomsError, setRoomsError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const { available, install } = useInstall();

  useEffect(() => {
    api
      .listRooms()
      .then(setRooms)
      .catch((e: Error) => setRoomsError(e.message));
  }, []);

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

  const showForm = creating || (rooms !== null && rooms.length === 0);

  return (
    <main className="page">
      <header className="row between">
        <h1>Тысяча</h1>
        <Link to="/settings" className="btn small">
          Настройки
        </Link>
      </header>
      <p className="muted">Таблица счёта для живой игры в «Тысячу».</p>
      {available && (
        <button className="btn" onClick={() => void install()}>
          Установить на телефон
        </button>
      )}

      {roomsError && <p className="error">Не удалось загрузить комнаты: {roomsError}</p>}
      {rooms === null && !roomsError && <p className="muted">Загрузка комнат…</p>}
      {rooms && rooms.length > 0 && (
        <section className="stack-sm">
          <h2>Комнаты</h2>
          {rooms.map((r) => (
            <Link key={r.code} to={`/r/${r.code}`} className="card room-card">
              <span className="room-card-name">{r.name}</span>
              <span className="row small muted">
                {r.activeGames > 0 && (
                  <span className="badge active">
                    {r.activeGames === 1 ? 'идёт партия' : `идёт партий: ${r.activeGames}`}
                  </span>
                )}
                <span>партий: {r.games}</span>
                <span>· {new Date(r.lastActivity).toLocaleDateString('ru')}</span>
              </span>
            </Link>
          ))}
        </section>
      )}

      {showForm ? (
        <form className="card stack" onSubmit={submit}>
          <h2>Новая комната</h2>
          <input
            className="input"
            placeholder="Название, например «Дача»"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            autoFocus={creating}
            required
          />
          <button className="btn primary" disabled={busy || !name.trim()}>
            Создать комнату
          </button>
          {error && <p className="error">{error}</p>}
        </form>
      ) : (
        rooms !== null && (
          <button className="btn" onClick={() => setCreating(true)}>
            Новая комната
          </button>
        )
      )}
    </main>
  );
}
