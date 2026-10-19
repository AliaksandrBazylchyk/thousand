import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import type { GameSummary, PlayerId, PlayerRef, RoomView } from '@thousand/core';
import { api } from '../api';
import { useMe, useRoom } from '../hooks';
import { rememberRoom } from '../identity';

export function RoomPage() {
  const { code = '' } = useParams();
  const { room, error } = useRoom(code);
  const [me, setMe] = useMe(code);

  useEffect(() => {
    if (room) rememberRoom({ code: room.code, name: room.name });
  }, [room]);

  if (error) return <main className="page error">{error}</main>;
  if (!room) return <main className="page muted">Загрузка…</main>;

  const known = me && room.players.some((p) => p.id === me.id) ? me : null;

  return (
    <main className="page">
      <header className="stack-sm">
        <Link to="/" className="muted small">
          ← Все комнаты
        </Link>
        <h1>{room.name}</h1>
        <div className="row">
          <ShareLink />
          <Link className="btn small" to={`/r/${room.code}/tv`} target="_blank">
            Таблица для ТВ
          </Link>
          <Link className="btn small" to={`/r/${room.code}/stats`}>
            Статистика
          </Link>
        </div>
      </header>

      {known ? (
        <p className="row">
          Вы: <b>{known.name}</b>
          <button className="btn small" onClick={() => setMe(null)}>
            Это не я
          </button>
        </p>
      ) : (
        <IdentifyForm room={room} onDone={setMe} />
      )}

      <GamesList room={room} />
      {known && <NewGameForm room={room} me={known} />}
    </main>
  );
}

function ShareLink() {
  const [copied, setCopied] = useState(false);
  const url = window.location.href;
  return (
    <button
      className="btn small"
      onClick={() => {
        void navigator.clipboard?.writeText(url).then(() => setCopied(true));
      }}
    >
      {copied ? 'Ссылка скопирована' : 'Скопировать ссылку на комнату'}
    </button>
  );
}

function IdentifyForm({ room, onDone }: { room: RoomView; onDone: (p: PlayerRef) => void }) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      onDone(await api.ensurePlayer(room.code, name));
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <form className="card stack" onSubmit={submit}>
      <h2>Кто вы?</h2>
      <input
        className="input"
        list="pool"
        placeholder="Ваше имя"
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={30}
        autoFocus
        required
      />
      <datalist id="pool">
        {room.players.map((p) => (
          <option key={p.id} value={p.name} />
        ))}
      </datalist>
      {room.players.length > 0 && (
        <div className="chips">
          {room.players.map((p) => (
            <button type="button" key={p.id} className="chip" onClick={() => onDone(p)}>
              {p.name}
            </button>
          ))}
        </div>
      )}
      <button className="btn primary" disabled={!name.trim()}>
        Войти
      </button>
      {error && <p className="error">{error}</p>}
    </form>
  );
}

const STATUS_LABEL: Record<GameSummary['status'], string> = {
  active: 'идёт',
  finished: 'завершена',
  cancelled: 'отменена',
};

function GamesList({ room }: { room: RoomView }) {
  if (room.games.length === 0) return null;
  const sorted = [...room.games].sort(
    (a, b) => Number(b.status === 'active') - Number(a.status === 'active'),
  );
  return (
    <section className="stack">
      <h2>Партии</h2>
      {sorted.map((g) => (
        <Link key={g.id} to={`/r/${room.code}/g/${g.id}`} className="card game-card">
          <div className="row between">
            <span className={`badge ${g.status}`}>{STATUS_LABEL[g.status]}</span>
            <span className="muted small">
              {new Date(g.startedAt).toLocaleDateString('ru')} · конов: {g.handsPlayed}
            </span>
          </div>
          <div className="scores">
            {g.seats.map((p) => (
              <span key={p.id}>
                {g.winnerId === p.id && '♔ '}
                {p.name} <b>{g.scores[p.id] ?? 0}</b>
              </span>
            ))}
          </div>
        </Link>
      ))}
    </section>
  );
}

function NewGameForm({ room, me }: { room: RoomView; me: PlayerRef }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [seats, setSeats] = useState<PlayerId[]>([me.id]);
  const [dealer, setDealer] = useState<PlayerId>(me.id);
  const [host, setHost] = useState<PlayerId>(me.id);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const nameOf = (id: PlayerId) => room.players.find((p) => p.id === id)?.name ?? '?';

  if (!open) {
    return (
      <button className="btn primary wide" onClick={() => setOpen(true)}>
        Новая партия
      </button>
    );
  }

  const toggle = (id: PlayerId) =>
    setSeats((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length < 4 ? [...s, id] : s));
  const move = (i: number, dir: -1 | 1) =>
    setSeats((s) => {
      const next = [...s];
      const j = i + dir;
      if (j < 0 || j >= next.length) return s;
      [next[i], next[j]] = [next[j]!, next[i]!];
      return next;
    });

  async function addPlayer(e: FormEvent) {
    e.preventDefault();
    try {
      const p = await api.ensurePlayer(room.code, newName);
      setNewName('');
      setSeats((s) => (s.includes(p.id) || s.length >= 4 ? s : [...s, p.id]));
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function create() {
    try {
      const firstDealer = seats.includes(dealer) ? dealer : seats[0]!;
      const hostId = seats.includes(host) ? host : seats[0]!;
      const game = await api.createGame(room.code, seats, firstDealer, hostId);
      navigate(`/r/${room.code}/g/${game.id}`);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <section className="card stack">
      <h2>Новая партия</h2>
      <p className="muted small">Выберите 2–4 игроков. Порядок мест — по часовой стрелке.</p>
      <div className="chips">
        {room.players.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`chip ${seats.includes(p.id) ? 'on' : ''}`}
            onClick={() => toggle(p.id)}
          >
            {p.name}
          </button>
        ))}
      </div>
      <form className="row" onSubmit={addPlayer}>
        <input
          className="input"
          placeholder="Новый игрок"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          maxLength={30}
        />
        <button className="btn" disabled={!newName.trim()}>
          Добавить
        </button>
      </form>

      {seats.length > 0 && (
        <ol className="seats">
          {seats.map((id, i) => (
            <li key={id} className="row between">
              <span>{nameOf(id)}</span>
              <span className="row">
                <button type="button" className="btn small" onClick={() => move(i, -1)}>
                  ↑
                </button>
                <button type="button" className="btn small" onClick={() => move(i, 1)}>
                  ↓
                </button>
              </span>
            </li>
          ))}
        </ol>
      )}

      <label className="field">
        Первый раздающий
        <select className="input" value={dealer} onChange={(e) => setDealer(e.target.value)}>
          {seats.map((id) => (
            <option key={id} value={id}>
              {nameOf(id)}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        Ведущий
        <select className="input" value={host} onChange={(e) => setHost(e.target.value)}>
          {seats.map((id) => (
            <option key={id} value={id}>
              {nameOf(id)}
            </option>
          ))}
        </select>
      </label>

      <div className="row">
        <button className="btn" onClick={() => setOpen(false)}>
          Отмена
        </button>
        <button
          className="btn primary grow"
          disabled={seats.length < 2 || seats.length > 4}
          onClick={create}
        >
          Начать партию
        </button>
      </div>
      {error && <p className="error">{error}</p>}
    </section>
  );
}
