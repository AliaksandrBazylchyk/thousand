import { useEffect, useRef, type ReactNode } from 'react';
import { flagHex, type Cell, type GameView, type PlayerId } from '@thousand/core';
import { MARRIAGE_SYMBOL, dealMarkSymbol, markSymbol, type Symbol } from '../symbols';
import { Sym } from './Sym';

function CellView({ cell, showMarriages }: { cell: Cell; showMarriages: boolean }) {
  const symbols = cell.marks.map(markSymbol).filter((s): s is Symbol => s !== null);
  const marriages = cell.marks.flatMap((m) => (m.type === 'marriage' ? [m.marriage] : []));
  return (
    <td className="cell">
      <span className="total">{cell.total}</span>
      {symbols.length > 0 && (
        <span className="syms">
          {symbols.map((s, i) => (
            <Sym key={i} s={s} />
          ))}
        </span>
      )}
      {showMarriages && marriages.length > 0 && (
        <span className="marriages">{marriages.map((m) => MARRIAGE_SYMBOL[m]).join(' ')}</span>
      )}
    </td>
  );
}

/** Флажок игрока у имени (ТЗ 6.3). */
export function Flag({ flag, seat }: { flag?: string | null; seat: number }) {
  return <span className="flag" style={{ background: flagHex(flag, seat) }} aria-hidden="true" />;
}

/**
 * Кон, который сейчас играют, — последней строкой: статусы обновляются в реальном времени
 * (ТЗ 6.3, 7): кто на 100 и в тёмную, заказ, кто уже ввёл очки, бочка, события раздачи.
 */
function CurrentRow({ view, nameOf }: { view: GameView; nameOf: (id: PlayerId) => string }) {
  const current = view.state.current;
  if (!current || view.status !== 'active') return null;
  const { turn } = current;
  const draft = view.draft;

  const statusOf = (p: PlayerId): ReactNode[] => {
    const out: ReactNode[] = [];
    const s = view.state.players[p];
    if (draft) {
      if (p === draft.declarerId) {
        out.push(
          <span key="bid" className="live bid">
            заказ {draft.bid}
            {draft.dark === 'played' && ' ◐'}
            {draft.rospis && ' · роспись'}
            {draft.goldenThousand && ' · ★'}
          </span>,
        );
      }
      const plays = turn.active.includes(p) || turn.prikupSitter === p;
      if (plays && !draft.rospis && !draft.goldenThousand) {
        const waiting = draft.waitingFor.includes(p);
        out.push(
          <span key="in" className={`live ${waiting ? 'waiting' : 'done'}`}>
            {waiting ? 'ждём ввод' : '✓ ввёл'}
          </span>,
        );
      }
    } else if (p === turn.onHundred) {
      out.push(
        <span key="h" className="live">
          на 100{view.darkDeclared ? ' · ◐ тёмная' : ''}
        </span>,
      );
    }
    if (p === turn.prikupSitter) {
      out.push(
        <Sym key="pk" s={{ icon: 'prikup', text: 'П', title: 'На прикупе', tone: 'muted' }} />,
      );
    }
    if (s?.onBarrel) {
      out.push(
        <Sym
          key="br"
          s={{
            icon: 'barrel',
            text: `▣${s.barrelAttempts + 1}`,
            label: `${s.barrelAttempts + 1}`,
            title: `На бочке, кон ${s.barrelAttempts + 1}`,
            tone: 'barrel',
          }}
        />,
      );
    }
    return out;
  };

  return (
    <tr className="current-row">
      <td className="muted">
        {current.handNumber}
        <span className="live-label">{draft ? 'играют' : 'раздача'}</span>
      </td>
      <td className="dealer">
        <span className="dealer-name">{nameOf(turn.dealer)}</span>
        {current.dealMarks.length > 0 && (
          <span className="syms">
            {current.dealMarks.map((d) => (
              <Sym key={d.entryId} s={dealMarkSymbol(d)} />
            ))}
          </span>
        )}
      </td>
      {view.seats.map((p) => (
        <td key={p.id} className="cell">
          <span className="total muted">…</span>
          <span className="syms live-syms">{statusOf(p.id)}</span>
        </td>
      ))}
    </tr>
  );
}

/**
 * Общая таблица (ТЗ 7): строка на кон, столбец на игрока, нарастающий итог и символы.
 * onOpen — раскрыть детали строки (телефон); autoScroll — держать последние строки на виду (ТВ);
 * showFlags — флажки игроков у имён (ТВ).
 */
export function ScoreTable({
  view,
  me = null,
  showMarriages,
  onOpen,
  autoScroll = false,
  showFlags = false,
  className = '',
}: {
  view: GameView;
  me?: PlayerId | null;
  showMarriages: boolean;
  onOpen?: (entryId: string) => void;
  autoScroll?: boolean;
  showFlags?: boolean;
  className?: string;
}) {
  const nameOf = (id: PlayerId) => view.seats.find((s) => s.id === id)?.name ?? '?';
  const rows = view.state.rows;
  const wrapRef = useRef<HTMLDivElement>(null);
  const live = view.status === 'active' && view.state.current !== null;

  useEffect(() => {
    if (autoScroll && wrapRef.current) wrapRef.current.scrollTop = wrapRef.current.scrollHeight;
  }, [autoScroll, rows.length, live]);

  return (
    <div className={`table-wrap ${className}`} ref={wrapRef}>
      <table className="score-table">
        <thead>
          <tr>
            <th>№</th>
            <th>Раздаёт</th>
            {view.seats.map((p, i) => (
              <th key={p.id} className={p.id === me ? 'me' : ''}>
                {showFlags && <Flag flag={p.flag} seat={i} />}
                {p.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && !live && (
            <tr>
              <td colSpan={view.seats.length + 2} className="muted">
                Ещё не сыграно ни одного кона
              </td>
            </tr>
          )}
          {rows.map((r, i) => (
            <tr
              key={r.entryId}
              className={`${onOpen ? 'clickable' : ''} ${i === rows.length - 1 ? 'latest' : ''}`}
              onClick={onOpen ? () => onOpen(r.entryId) : undefined}
            >
              <td className="muted">{r.number}</td>
              <td className="dealer">
                <span className="dealer-name">{nameOf(r.turn.dealer)}</span>
                {r.dealMarks.length > 0 && (
                  <span className="syms">
                    {r.dealMarks.map((d) => (
                      <Sym key={d.entryId} s={dealMarkSymbol(d)} />
                    ))}
                  </span>
                )}
              </td>
              {view.seats.map((p) => (
                <CellView key={p.id} cell={r.cells[p.id]!} showMarriages={showMarriages} />
              ))}
            </tr>
          ))}
          <CurrentRow view={view} nameOf={nameOf} />
        </tbody>
      </table>
    </div>
  );
}
