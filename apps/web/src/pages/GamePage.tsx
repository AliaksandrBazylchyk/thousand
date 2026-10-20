import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import type { PlayerId } from '@thousand/core';
import { DealPanel } from '../components/DealPanel';
import { HandDetails, LogList, useDetails } from '../components/HandDetails';
import { PlayPanel } from '../components/PlayPanel';
import { ScoreChart } from '../components/ScoreChart';
import { ScoreTable } from '../components/ScoreTable';
import { GameStatsTable } from '../components/Stats';
import { ErrorText, useRun, type GameCtx } from '../components/ui';
import { useAct, useGame, useMe } from '../hooks';
import { useSettings } from '../settings';

export function GamePage() {
  const { code = '', gameId = '' } = useParams();
  const { view, error } = useGame(gameId);
  const [me] = useMe(code);
  const act = useAct(gameId, me?.id ?? null);
  const [opened, setOpened] = useState<string | null>(null);
  const settings = useSettings();
  const [showMarriages, setShowMarriages] = useState(settings.marriages);
  const [tab, setTab] = useState<Tab | null>(null);

  const ctx = useMemo<GameCtx | null>(() => {
    if (!view) return null;
    const isSeated = !!me && view.seats.some((s) => s.id === me.id);
    return {
      view,
      me: isSeated ? me!.id : null,
      isSeated,
      isHost: isSeated && view.hostId === me!.id,
      act,
      nameOf: (id: PlayerId) => view.seats.find((s) => s.id === id)?.name ?? '?',
    };
  }, [view, me, act]);

  if (error) return <main className="page error">{error}</main>;
  if (!ctx) return <main className="page muted">Загрузка…</main>;
  const { view: v } = ctx;
  const active = v.status === 'active';
  // Завершённую партию открываем сразу на таблице.
  const current: Tab = tab ?? (active ? 'hand' : 'table');
  const needsMe = !!ctx.me && !!v.draft?.waitingFor.includes(ctx.me);

  return (
    <div className="game-shell">
      <header className="game-top">
        <Link to={`/r/${code}`} className="game-back" aria-label={`В комнату «${v.roomName}»`}>
          ←
        </Link>
        <StatusBar ctx={ctx} />
        <span className="game-host">
          {ctx.isHost ? 'вы ведущий' : `ведёт ${ctx.nameOf(v.hostId)}`}
        </span>
      </header>

      <main className="game-main">
        {current === 'hand' && (
          <>
            {!me && (
              <p className="card small">
                Вы смотрите как зритель. <Link to={`/r/${code}`}>Войдите в комнате</Link>, чтобы
                вводить очки.
              </p>
            )}
            {active && (v.draft ? <PlayPanel ctx={ctx} /> : <DealPanel ctx={ctx} />)}
            {!active && <FinishedBanner ctx={ctx} />}
          </>
        )}

        {current === 'table' && (
          <section className="stack-sm">
            {!active && <FinishedBanner ctx={ctx} />}
            <div className="row between">
              <span className="small muted">
                {ctx.isHost && v.state.rows.length > 0
                  ? 'Нажмите на строку — детали и правка кона'
                  : ''}
              </span>
              <label className="small row">
                <input
                  type="checkbox"
                  checked={showMarriages}
                  onChange={(e) => setShowMarriages(e.target.checked)}
                />
                марьяжи
              </label>
            </div>
            {/* Детали кона с очками и правкой — только у ведущего. */}
            <ScoreTable
              view={v}
              me={ctx.me}
              showMarriages={showMarriages}
              onOpen={ctx.isHost ? setOpened : undefined}
            />
          </section>
        )}

        {current === 'more' && (
          <div className="stack">
            {v.state.rows.length > 0 && <GameStats ctx={ctx} />}
            {ctx.isHost && active && <HostMenu ctx={ctx} />}
            {/* История правок и меню ведущего — только у ведущего. */}
            {ctx.isHost && <EditLog ctx={ctx} />}
            <section className="card stack-sm">
              <Link to={`/r/${code}/g/${gameId}/tv`}>Таблица для ТВ</Link>
              {v.state.rows.length > 0 && (
                <span className="row small">
                  Экспорт партии:
                  <a href={`/api/games/${v.id}/export?format=csv`} download>
                    CSV
                  </a>
                  <a href={`/api/games/${v.id}/export?format=json`} download>
                    JSON
                  </a>
                </span>
              )}
              <Link to={`/r/${code}`}>Комната «{v.roomName}»</Link>
            </section>
          </div>
        )}
      </main>

      <nav className="game-tabs" aria-label="Разделы партии">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={current === id ? 'on' : ''}
            aria-current={current === id ? 'page' : undefined}
            onClick={() => setTab(id)}
          >
            {label}
            {id === 'hand' && needsMe && current !== 'hand' && (
              <span className="tab-dot" aria-label="ждут ваш ввод" />
            )}
          </button>
        ))}
      </nav>

      {opened && <HandDetails ctx={ctx} entryId={opened} onClose={() => setOpened(null)} />}
    </div>
  );
}

type Tab = 'hand' | 'table' | 'more';
const TABS: [Tab, string][] = [
  ['hand', 'Кон'],
  ['table', 'Таблица'],
  ['more', 'Ещё'],
];

/** Постоянно видны: свой счёт, болты, бочка и номер попытки (ТЗ 6.1). */
function StatusBar({ ctx }: { ctx: GameCtx }) {
  const s = ctx.me ? ctx.view.state.players[ctx.me] : undefined;
  if (!s) return <span className="status-bar muted">{ctx.view.roomName}</span>;
  return (
    <div className="status-bar">
      <span>
        <b>{s.score}</b>
      </span>
      <span title="Болты">• {s.bolts}</span>
      {s.onBarrel && (
        <span className="barrel" title="На бочке, попытка">
          ▣ {s.barrelAttempts + 1}/3
        </span>
      )}
      {s.barrelFalls > 0 && <span title="Падений с бочки">↓ {s.barrelFalls}</span>}
    </div>
  );
}

function FinishedBanner({ ctx }: { ctx: GameCtx }) {
  const { view, nameOf } = ctx;
  if (view.status === 'cancelled') return <p className="card">Партия отменена</p>;
  return (
    <p className="card winner">
      {view.winnerId ? `♔ Победил ${nameOf(view.winnerId)}` : 'Партия завершена'}
    </p>
  );
}

function HostMenu({ ctx }: { ctx: GameCtx }) {
  const { view, me, nameOf } = ctx;
  const { run, busy, error } = useRun(ctx.act);
  const [newHost, setNewHost] = useState<PlayerId>('');
  const others = view.seats.filter((s) => s.id !== me);

  return (
    <details className="card">
      <summary>Меню ведущего</summary>
      <div className="stack">
        <label className="field">
          Передать роль ведущего
          <div className="row">
            <select className="input" value={newHost} onChange={(e) => setNewHost(e.target.value)}>
              <option value="">— выберите —</option>
              {others.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <button
              className="btn"
              disabled={!newHost || busy}
              onClick={() =>
                run({ type: 'setHost', playerId: newHost }, `Передать роль ${nameOf(newHost)}?`)
              }
            >
              Передать
            </button>
          </div>
        </label>
        <div className="row">
          <button
            className="btn"
            disabled={busy}
            onClick={() => run({ type: 'finishGame' }, 'Завершить партию без победителя?')}
          >
            Завершить партию
          </button>
          <button
            className="btn danger"
            disabled={busy}
            onClick={() =>
              run({ type: 'cancelGame' }, 'Отменить партию? Она не попадёт в статистику.')
            }
          >
            Отменить партию
          </button>
        </div>
        <ErrorText error={error} />
      </div>
    </details>
  );
}

/** Журнал правок партии (ТЗ 4): для разбора спорных исправлений. */
function EditLog({ ctx }: { ctx: GameCtx }) {
  const [open, setOpen] = useState(false);
  return (
    <details className="card" onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>Журнал правок</summary>
      {open && <EditLogBody ctx={ctx} />}
    </details>
  );
}

function EditLogBody({ ctx }: { ctx: GameCtx }) {
  const details = useDetails(ctx);
  if (!details) return <p className="muted small">Загрузка…</p>;
  const entries = [...details.log].reverse();
  return entries.length ? (
    <LogList entries={entries} nameOf={ctx.nameOf} />
  ) : (
    <p className="muted small">Пусто</p>
  );
}

/** Срез «текущая партия» и график хода партии (ТЗ 8). */
function GameStats({ ctx }: { ctx: GameCtx }) {
  const finished = ctx.view.status !== 'active';
  const [open, setOpen] = useState(finished);
  return (
    <details className="card" open={finished} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>Ход партии и статистика</summary>
      {open && (
        <div className="stack">
          <ScoreChart view={ctx.view} />
          <GameStatsTable view={ctx.view} />
        </div>
      )}
    </details>
  );
}
