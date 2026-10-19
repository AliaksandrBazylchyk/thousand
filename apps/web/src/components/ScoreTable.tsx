import { useEffect, useRef } from 'react';
import type { Cell, GameView, PlayerId } from '@thousand/core';
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

/**
 * Общая таблица (ТЗ 7): строка на кон, столбец на игрока, нарастающий итог и символы.
 * onOpen — раскрыть детали строки (телефон); autoScroll — держать последние строки на виду (ТВ).
 */
export function ScoreTable({
  view,
  me = null,
  showMarriages,
  onOpen,
  autoScroll = false,
  className = '',
}: {
  view: GameView;
  me?: PlayerId | null;
  showMarriages: boolean;
  onOpen?: (entryId: string) => void;
  autoScroll?: boolean;
  className?: string;
}) {
  const nameOf = (id: PlayerId) => view.seats.find((s) => s.id === id)?.name ?? '?';
  const rows = view.state.rows;
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoScroll && wrapRef.current) wrapRef.current.scrollTop = wrapRef.current.scrollHeight;
  }, [autoScroll, rows.length]);

  return (
    <div className={`table-wrap ${className}`} ref={wrapRef}>
      <table className="score-table">
        <thead>
          <tr>
            <th>№</th>
            <th>Раздаёт</th>
            {view.seats.map((p) => (
              <th key={p.id} className={p.id === me ? 'me' : ''}>
                {p.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={view.seats.length + 2} className="muted">
                Ещё не сыграно ни одного кона
              </td>
            </tr>
          )}
          {rows.map((r) => (
            <tr
              key={r.entryId}
              className={onOpen ? 'clickable' : ''}
              onClick={onOpen ? () => onOpen(r.entryId) : undefined}
            >
              <td className="muted">{r.hand?.number ?? '—'}</td>
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
        </tbody>
      </table>
    </div>
  );
}
