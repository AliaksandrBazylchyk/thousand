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

export function GamePage() {
  const { code = '', gameId = '' } = useParams();
  const { view, error } = useGame(gameId);
  const [me] = useMe(code);
  const act = useAct(gameId, me?.id ?? null);
  const [opened, setOpened] = useState<string | null>(null);
  const [showMarriages, setShowMarriages] = useState(false);

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

  return (
    <main className="page game">
      <header className="row between">
        <Link to={`/r/${code}`} className="muted small">
          ← {v.roomName}
        </Link>
        <span className="row small muted">
          Ведущий: {ctx.nameOf(v.hostId)}
          <Link to={`/r/${code}/g/${gameId}/tv`} className="small">
            ТВ
          </Link>
        </span>
      </header>

      <StatusBar ctx={ctx} />
      {!me && (
        <p className="card small">
          Вы смотрите как зритель. <Link to={`/r/${code}`}>Войдите в комнате</Link>, чтобы вводить
          очки.
        </p>
      )}

      {v.status === 'active' && (v.draft ? <PlayPanel ctx={ctx} /> : <DealPanel ctx={ctx} />)}
      {v.status !== 'active' && <FinishedBanner ctx={ctx} />}

      <section className="stack-sm">
        <div className="row between">
          <h2>Таблица</h2>
          <label className="small row">
            <input
              type="checkbox"
              checked={showMarriages}
              onChange={(e) => setShowMarriages(e.target.checked)}
            />
            марьяжи
          </label>
        </div>
        <ScoreTable view={v} me={ctx.me} showMarriages={showMarriages} onOpen={setOpened} />
        {v.state.rows.length > 0 && (
          <p className="small muted">Нажмите на строку, чтобы увидеть детали кона.</p>
        )}
      </section>
      {v.state.rows.length > 0 && <GameStats ctx={ctx} />}
      {ctx.isHost && v.status === 'active' && <HostMenu ctx={ctx} />}
      <EditLog ctx={ctx} />
      {opened && <HandDetails ctx={ctx} entryId={opened} onClose={() => setOpened(null)} />}
    </main>
  );
}

/** Постоянно видны: свой счёт, болты, бочка и номер попытки (ТЗ 6.1). */
function StatusBar({ ctx }: { ctx: GameCtx }) {
  if (!ctx.me) return null;
  const s = ctx.view.state.players[ctx.me];
  if (!s) return null;
  return (
    <div className="status-bar">
      <span>
        Счёт <b>{s.score}</b>
      </span>
      <span>Болты {s.bolts}</span>
      {s.onBarrel && <span className="barrel">▣ бочка, попытка {s.barrelAttempts + 1}/3</span>}
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
