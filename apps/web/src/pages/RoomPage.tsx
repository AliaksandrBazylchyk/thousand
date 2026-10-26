import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import {
  FLAG_COLORS,
  flagHex,
  type GameSummary,
  type PlayerId,
  type RoomJoinView,
  type RoomView,
} from '@thousand/core';
import { api } from '../api';
import { useMeUser } from '../auth';
import { Avatar } from '../components/Avatar';
import { useRoom } from '../hooks';

export function RoomPage() {
  const { code = '' } = useParams();
  const { room, error, reload } = useRoom(code);

  if (error?.status === 403) return <JoinRoom code={code} onJoined={reload} />;
  if (error) return <main className="page error">{error.message}</main>;
  if (!room) return <main className="page muted">Загрузка…</main>;

  return (
    <main className="page">
      <header className="stack-sm">
        <Link to="/" className="muted small">
          ← Все комнаты
        </Link>
        <h1>{room.name}</h1>
        <div className="row">
          <CopyButton text={`${location.origin}/r/${room.code}`} label="Ссылка на комнату" />
          <Link className="btn small" to={`/r/${room.code}/stats`}>
            Статистика
          </Link>
          <Link className="btn small" to="/settings">
            Настройки
          </Link>
        </div>
      </header>

      <AliasCard room={room} />
      <FlagPicker room={room} />
      <Members room={room} />
      <TvLink room={room} />
      <GamesList room={room} />
      <NewGameForm room={room} />
    </main>
  );
}

/** Вход в комнату: псевдоним или своё имя из прошлых партий (ТЗ 5.2). */
function JoinRoom({ code, onJoined }: { code: string; onJoined: () => void }) {
  const me = useMeUser();
  const [info, setInfo] = useState<RoomJoinView | null>(null);
  const [alias, setAlias] = useState(me.name);
  const [claim, setClaim] = useState<PlayerId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .getJoin(code)
      .then(setInfo)
      .catch((e: Error) => setError(e.message));
  }, [code]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.join(code, claim ? { claimPlayerId: claim } : { alias });
      onJoined();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  if (!info) {
    return <main className={`page ${error ? 'error' : 'muted'}`}>{error ?? 'Загрузка…'}</main>;
  }

  return (
    <main className="page">
      <header className="stack-sm">
        <Link to="/" className="muted small">
          ← Все комнаты
        </Link>
        <span className="muted small">Комната</span>
        <h1>{info.name}</h1>
      </header>

      <section className="card row">
        <Avatar name={me.name} url={me.avatarUrl} size={52} />
        <span className="stack-sm">
          <span className="muted small">Вы входите как</span>
          <b className="title-font">{me.name}</b>
        </span>
      </section>

      <form className="stack" onSubmit={submit}>
        <section className={`card stack ${claim ? 'dimmed' : ''}`}>
          <label className="field">
            Псевдоним в этой комнате
            <input
              className="input big-alias"
              value={alias}
              onChange={(e) => {
                setAlias(e.target.value);
                setClaim(null);
              }}
              maxLength={30}
              required={!claim}
            />
            <span className="hint">
              Так вас видят за столом и в таблице. Имя в профиле не меняется, псевдоним можно
              сменить позже.
            </span>
          </label>
        </section>

        {info.history.length > 0 && (
          <section className="stack-sm">
            <h2>Уже играли здесь?</h2>
            <p className="hint">
              Выберите своё имя из прошлых партий — история и статистика перейдут к вам.
            </p>
            <div className="stack-sm" role="radiogroup" aria-label="Игрок из прошлых партий">
              <button
                type="button"
                role="radio"
                aria-checked={claim === null}
                className={`choice ${claim === null ? 'on' : ''}`}
                onClick={() => setClaim(null)}
              >
                <span className="choice-mark" aria-hidden="true" />
                <span className="grow">Нет, я здесь впервые</span>
              </button>
              {info.history.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  role="radio"
                  aria-checked={claim === p.id}
                  className={`choice ${claim === p.id ? 'on' : ''}`}
                  onClick={() => setClaim(p.id)}
                >
                  <span className="choice-mark" aria-hidden="true" />
                  <span className="grow title-font">{p.name}</span>
                  <span className="muted small">партий: {p.games}</span>
                </button>
              ))}
            </div>
          </section>
        )}

        {error && (
          <p className="error-box" role="alert">
            {error}
          </p>
        )}
        <button className="btn primary big" disabled={busy || (!claim && !alias.trim())}>
          Войти в комнату
        </button>
      </form>
    </main>
  );
}

/** Ваш псевдоним в комнате и его смена. */
function AliasCard({ room }: { room: RoomView }) {
  const [editing, setEditing] = useState(false);
  const [alias, setAlias] = useState(room.me.name);
  const [error, setError] = useState<string | null>(null);

  async function save(e: FormEvent) {
    e.preventDefault();
    try {
      await api.setAlias(room.code, alias);
      setEditing(false);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  if (!editing) {
    return (
      <p className="row">
        <Avatar name={room.me.name} url={room.me.avatarUrl} size={32} />
        Вы: <b>{room.me.name}</b>
        <button
          className="btn small"
          onClick={() => {
            setAlias(room.me.name);
            setEditing(true);
          }}
        >
          Сменить псевдоним
        </button>
      </p>
    );
  }
  return (
    <form className="card stack-sm" onSubmit={save}>
      <label className="field">
        Псевдоним в этой комнате
        <span className="input-row">
          <input
            className="input"
            value={alias}
            onChange={(e) => setAlias(e.target.value)}
            maxLength={30}
            required
            autoFocus
          />
          <button className="btn primary">Сохранить</button>
        </span>
      </label>
      <button type="button" className="link-btn muted" onClick={() => setEditing(false)}>
        Отмена
      </button>
      {error && <p className="error">{error}</p>}
    </form>
  );
}

/** Цвет своего флажка: он стоит у имени на ТВ (ТЗ 6.3). Без выбора — цвет по месту за столом. */
function FlagPicker({ room }: { room: RoomView }) {
  const [error, setError] = useState<string | null>(null);
  const choose = (flag: string | null) =>
    api.setFlag(room.code, flag).then(
      () => setError(null),
      (e: Error) => setError(e.message),
    );
  return (
    <section className="stack-sm">
      <span className="label-small">Цвет флажка на ТВ</span>
      <div className="flag-picker" role="radiogroup" aria-label="Цвет флажка">
        {FLAG_COLORS.map((f) => (
          <button
            key={f.id}
            type="button"
            role="radio"
            aria-checked={room.me.flag === f.id}
            aria-label={f.name}
            title={f.name}
            className={`flag-swatch ${room.me.flag === f.id ? 'on' : ''}`}
            onClick={() => void choose(f.id)}
          >
            <span className="flag" style={{ background: f.hex }} />
          </button>
        ))}
        {room.me.flag && (
          <button type="button" className="link-btn muted" onClick={() => void choose(null)}>
            по месту
          </button>
        )}
      </div>
      {error && <p className="error">{error}</p>}
    </section>
  );
}

function Members({ room }: { room: RoomView }) {
  return (
    <section className="stack-sm">
      <h2>Участники</h2>
      <ul className="members">
        {room.players.map((p) => (
          <li key={p.id}>
            <Avatar name={p.name} url={p.avatarUrl} size={40} />
            <span>{p.name}</span>
            {p.flag && <span className="flag" style={{ background: flagHex(p.flag, 0) }} />}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Секретная ссылка для ТВ: просмотр без входа, можно перевыпустить (ТЗ 6.3). */
function TvLink({ room }: { room: RoomView }) {
  const url = `${location.origin}/tv/${room.tvKey}`;
  return (
    <section className="card stack-sm">
      <h3>Таблица для ТВ</h3>
      <p className="hint">
        Откройте ссылку на телевизоре — вход не нужен. Ссылка секретная: перевыпустите её, если она
        попала не туда.
      </p>
      <div className="row">
        <Link className="btn small" to={`/tv/${room.tvKey}`} target="_blank">
          Открыть
        </Link>
        <CopyButton text={url} label="Скопировать ссылку" />
        <button
          className="btn small danger"
          onClick={() => {
            if (window.confirm('Старая ссылка для ТВ перестанет работать. Перевыпустить?')) {
              void api.resetTvKey(room.code);
            }
          }}
        >
          Перевыпустить
        </button>
      </div>
    </section>
  );
}

/**
 * Копирование в буфер. Clipboard API есть только на HTTPS; на сайте по IP через HTTP —
 * запасной способ через выделенный текст, а если и он не сработал — окно со ссылкой.
 */
async function copyText(text: string): Promise<boolean> {
  if (window.isSecureContext && navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Пробуем запасной способ ниже.
    }
  }
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  let ok: boolean;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  area.remove();
  if (!ok) window.prompt('Скопируйте ссылку:', text);
  return ok;
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="btn small"
      onClick={() => {
        void copyText(text).then(setCopied);
      }}
    >
      {copied ? 'Скопировано' : label}
    </button>
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

/** Новая партия: за стол садятся только участники комнаты с учётной записью (ТЗ 5.3). */
function NewGameForm({ room }: { room: RoomView }) {
  const navigate = useNavigate();
  const myId = room.me.id;
  const [open, setOpen] = useState(false);
  const [seats, setSeats] = useState<PlayerId[]>([myId]);
  const [dealer, setDealer] = useState<PlayerId>(myId);
  const [host, setHost] = useState<PlayerId>(myId);
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
      <p className="muted small">
        Выберите 2–4 участников комнаты. Порядок мест — по часовой стрелке. Кого нет в списке —
        пусть зарегистрируется и войдёт в комнату.
      </p>
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
