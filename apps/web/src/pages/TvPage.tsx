import { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { flagHex, type GameView, type PlayerId } from '@thousand/core';
import { Celebration } from '../components/Celebration';
import { ScoreChart } from '../components/ScoreChart';
import { ScoreTable } from '../components/ScoreTable';
import { Sym } from '../components/Sym';
import { useGame, useTvRoom } from '../hooks';
import { useSettings } from '../settings';
import { LEGEND } from '../symbols';

/** ТВ по секретной ссылке комнаты: показывает идущую партию и сам переключается на новую. */
export function TvRoomPage() {
  const { key = '' } = useParams();
  const { room, error } = useTvRoom(key);
  if (error) return <div className="tv tv-message">{error}</div>;
  if (!room) return <div className="tv tv-message">Загрузка…</div>;
  const game =
    room.games.find((g) => g.status === 'active') ??
    room.games.find((g) => g.status === 'finished');
  if (!game) return <div className="tv tv-message">{room.name}: партий пока нет</div>;
  return <TvGame key={game.id} gameId={game.id} tvKey={key} />;
}

export function TvGamePage() {
  const { key = '', gameId = '' } = useParams();
  return <TvGame gameId={gameId} tvKey={key} />;
}

/** Общая таблица на телевизоре (ТЗ 6.3): только просмотр, 1920×1080, обновляется сама. */
function TvGame({ gameId, tvKey }: { gameId: string; tvKey: string }) {
  const { view, error } = useGame(gameId, tvKey);
  const [params, setParams] = useSearchParams();
  const settings = useSettings();
  const showMarriages = params.has('m') ? params.get('m') === '1' : settings.marriages;
  useWakeLock();
  const jackCelebration = useNewJackAtBottom(view);

  if (error) return <div className="tv tv-message">{error}</div>;
  if (!view) return <div className="tv tv-message">Загрузка…</div>;

  return (
    <div className="tv">
      <Celebration trigger={jackCelebration} text="ЖЕНИМ!" />
      <main className="tv-main">
        <header className="tv-head">
          <span className="tv-room">{view.roomName}</span>
          <CurrentState view={view} />
        </header>
        <Scores view={view} />
        {view.status === 'finished' && view.state.rows.length > 0 && (
          <ScoreChart
            view={view}
            className="tv-chart"
            height={Math.round(window.innerHeight * 0.38)}
            labelWidth={220}
          />
        )}
        <ScoreTable
          view={view}
          showMarriages={showMarriages}
          autoScroll
          showFlags
          className="tv-table"
        />
      </main>
      <aside className="tv-legend">
        <h2>Обозначения</h2>
        <ul>
          {LEGEND.map((item) => (
            <li key={item.meaning}>
              <span className="tv-legend-syms">
                {item.symbols.map((s, i) => (
                  <Sym key={i} s={s} />
                ))}
              </span>
              <span>{item.meaning}</span>
            </li>
          ))}
          <li>
            <span className="tv-legend-syms">♠ ♣ ♦ ♥ 4Т</span>
            <span>Марьяжи</span>
          </li>
        </ul>
        <button
          className="tv-toggle"
          onClick={() => setParams({ m: showMarriages ? '0' : '1' }, { replace: true })}
        >
          Марьяжи в таблице: {showMarriages ? 'вкл' : 'выкл'}
        </button>
      </aside>
    </div>
  );
}

/** Над таблицей: кто раздаёт, кто заказал, ставка, тёмная. */
function CurrentState({ view }: { view: GameView }) {
  const nameOf = (id: PlayerId) => view.seats.find((s) => s.id === id)?.name ?? '?';
  if (view.status === 'cancelled') return <span className="tv-state">Партия отменена</span>;
  if (view.status === 'finished') {
    return (
      <span className="tv-state tv-win">
        {view.winnerId ? `♔ Победил ${nameOf(view.winnerId)}` : 'Партия завершена'}
      </span>
    );
  }
  const current = view.state.current;
  if (!current) return null;
  const { turn } = current;
  const draft = view.draft;
  return (
    <span className="tv-state">
      <span>Кон {current.handNumber}</span>
      <span>
        Раздаёт <b>{nameOf(turn.dealer)}</b>
      </span>
      {draft ? (
        <>
          <span>
            Заказал <b>{nameOf(draft.declarerId)}</b>: <b className="tv-bid">{draft.bid}</b>
          </span>
          {draft.dark === 'played' && <span className="tv-dark">◐ тёмная</span>}
          {draft.rospis && <span className="tv-penalty">роспись</span>}
          {draft.goldenThousand && <span className="tv-win">★ золотая тысяча</span>}
        </>
      ) : (
        <>
          <span>
            На 100 <b>{nameOf(turn.onHundred)}</b>
          </span>
          {view.darkDeclared && <span className="tv-dark">◐ тёмная</span>}
          <span className="tv-muted">торгуются</span>
        </>
      )}
    </span>
  );
}

function Scores({ view }: { view: GameView }) {
  return (
    <div className="tv-scores">
      {view.seats.map((p, i) => {
        const s = view.state.players[p.id]!;
        return (
          <div
            key={p.id}
            className={`tv-score ${view.winnerId === p.id ? 'win' : ''} ${s.onBarrel ? 'barrel' : ''}`}
          >
            {/* Флажок цвета игрока у имени (ТЗ 6.3). */}
            <span
              className="tv-flag"
              style={{ background: flagHex(p.flag, i) }}
              aria-hidden="true"
            />
            <span className="tv-score-name">
              {view.winnerId === p.id && '♔ '}
              {p.name}
            </span>
            <span className="tv-score-value">{s.score}</span>
            <span className="tv-score-meta">
              {s.bolts > 0 && (
                <span className="status-pill">
                  <Sym
                    s={{
                      icon: 'bolt',
                      text: `• ${s.bolts}`,
                      label: String(s.bolts),
                      title: 'Болты',
                    }}
                  />
                </span>
              )}
              {s.onBarrel && (
                <span className="status-pill barrel tv-barrel">
                  <Sym
                    s={{
                      icon: 'barrel',
                      text: `▣ ${s.barrelAttempts + 1}/3`,
                      label: `${s.barrelAttempts + 1}/3`,
                      title: 'На бочке, попытка',
                    }}
                  />
                </span>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Счётчик праздников «ЖЕНИМ!»: растёт, когда в партии появляется новая отметка «валет внизу
 * при сдвиге». Отметки, которые уже были при открытии таблицы, не празднуются.
 */
function useNewJackAtBottom(view: GameView | null): number {
  const seen = useRef<Set<string> | null>(null);
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!view) return;
    const jacks = [
      ...view.state.rows.flatMap((r) => r.dealMarks),
      ...(view.state.current?.dealMarks ?? []),
    ]
      .filter((d) => d.type === 'jackAtBottom')
      .map((d) => d.entryId);
    if (seen.current === null) {
      seen.current = new Set(jacks);
      return;
    }
    const fresh = jacks.filter((id) => !seen.current!.has(id));
    fresh.forEach((id) => seen.current!.add(id));
    if (fresh.length > 0) setCount((n) => n + 1);
  }, [view]);
  return count;
}

/** Не даём телевизору/планшету гаснуть, пока открыта таблица. */
function useWakeLock() {
  const [, setLock] = useState<WakeLockSentinel | null>(null);
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    const request = () =>
      navigator.wakeLock
        ?.request('screen')
        .then((l) => {
          lock = l;
          setLock(l);
        })
        .catch(() => undefined);
    void request();
    const onVisible = () => document.visibilityState === 'visible' && void request();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      void lock?.release();
    };
  }, []);
}
