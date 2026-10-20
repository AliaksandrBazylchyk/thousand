import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import type { RoomListItem } from '@thousand/core';
import { api } from '../api';
import { useMeUser } from '../auth';
import { Avatar } from '../components/Avatar';
import { useInstall } from '../pwa';

/** Лобби: все комнаты видны вошедшим, войти можно в любую (ТЗ 5, 6.0). */
export function HomePage() {
  const navigate = useNavigate();
  const me = useMeUser();
  const [name, setName] = useState('');
  const [alias, setAlias] = useState(me.name);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
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
      const room = await api.createRoom(name, alias);
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
        <span className="row">
          <span className="brand-mark small" aria-hidden="true" />
          <h1>Тысяча</h1>
        </span>
        <Link to="/profile" className="profile-chip" aria-label={`Профиль: ${me.name}`}>
          <span>{me.name.split(/\s+/)[0]}</span>
          <Avatar name={me.name} url={me.avatarUrl} size={34} />
        </Link>
      </header>
      <div className="row">
        <Link to="/settings" className="btn small">
          Настройки
        </Link>
        {available && (
          <button className="btn small" onClick={() => void install()}>
            Установить на телефон
          </button>
        )}
      </div>

      {roomsError && <p className="error">Не удалось загрузить комнаты: {roomsError}</p>}
      {rooms === null && !roomsError && <p className="muted">Загрузка комнат…</p>}
      {rooms && rooms.length > 0 && (
        <section className="stack-sm">
          <h2>Комнаты</h2>
          {rooms.map((r) => (
            <Link
              key={r.code}
              to={`/r/${r.code}`}
              className={`card room-card ${r.member ? 'member' : ''}`}
            >
              <span className="row between">
                <span className="room-card-name">{r.name}</span>
                <span className="room-card-tag">{r.member ? `вы — ${r.alias}` : 'войти'}</span>
              </span>
              <span className="row small muted">
                {r.members.length > 0 && (
                  <span className="faces">
                    {r.members.slice(0, 5).map((m) => (
                      <Avatar key={m.id} name={m.name} url={m.avatarUrl} size={28} />
                    ))}
                  </span>
                )}
                <span>
                  участников: {r.members.length} · партий: {r.games}
                </span>
                {r.activeGames > 0 && (
                  <span className="badge active">
                    {r.activeGames === 1 ? 'идёт партия' : `идёт партий: ${r.activeGames}`}
                  </span>
                )}
              </span>
            </Link>
          ))}
        </section>
      )}

      {showForm ? (
        <form className="card stack" onSubmit={submit}>
          <h2>Новая комната</h2>
          <label className="field">
            Название
            <input
              className="input"
              placeholder="Например, «Дача»"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              autoFocus={creating}
              required
            />
          </label>
          <label className="field">
            Ваш псевдоним в комнате
            <input
              className="input"
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
              maxLength={30}
              required
            />
          </label>
          <button className="btn primary" disabled={busy || !name.trim() || !alias.trim()}>
            Создать комнату
          </button>
          {error && <p className="error">{error}</p>}
        </form>
      ) : (
        rooms !== null && (
          <button className="btn primary" onClick={() => setCreating(true)}>
            Новая комната
          </button>
        )
      )}
    </main>
  );
}
