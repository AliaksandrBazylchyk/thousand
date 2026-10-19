import { useState } from 'react';
import type { Cell, GameView, PlayerId } from '@thousand/core';
import { MARRIAGE_SYMBOL, dealMarkSymbol, markSymbol, type Symbol } from '../symbols';

function Sym({ s }: { s: Symbol }) {
  return (
    <span className={`sym ${s.tone ?? ''}`} title={s.title}>
      {s.text}
    </span>
  );
}

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

export function ScoreTable({ view, me }: { view: GameView; me: PlayerId | null }) {
  const [showMarriages, setShowMarriages] = useState(false);
  const nameOf = (id: PlayerId) => view.seats.find((s) => s.id === id)?.name ?? '?';
  const rows = view.state.rows;

  return (
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
      <div className="table-wrap">
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
              <tr key={r.entryId}>
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
    </section>
  );
}
