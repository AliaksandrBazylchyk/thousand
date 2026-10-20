import { useEffect, useState } from 'react';
import {
  MIN_BID,
  type DarkStatus,
  type GameDetails,
  type HandDetail,
  type Marriage,
  type PlayerId,
  type Row,
  type Suit,
} from '@thousand/core';
import { api } from '../api';
import { describeLog, inputText, timeText } from '../editLog';
import { MARRIAGES, MARRIAGE_SYMBOL, SUITS, dealMarkSymbol, markSymbol } from '../symbols';
import { AutoBadge, GoldenChip } from './PlayPanel';
import { Sym } from './Sym';
import { BidStepper, ErrorText, useRun, type GameCtx } from './ui';

/** Подробности партии, перезапрашиваются при каждом обновлении состояния. */
export function useDetails(ctx: GameCtx) {
  const [details, setDetails] = useState<GameDetails | null>(null);
  useEffect(() => {
    let alive = true;
    api
      .getDetails(ctx.view.id)
      .then((d) => alive && setDetails(d))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [ctx.view]);
  return details;
}

/** Детали строки таблицы (ТЗ 7.2): сырые очки, марьяжи, кто ввёл, события и правки. */
export function HandDetails({
  ctx,
  entryId,
  onClose,
}: {
  ctx: GameCtx;
  entryId: string;
  onClose: () => void;
}) {
  const { view, nameOf, isHost } = ctx;
  const details = useDetails(ctx);
  const [editing, setEditing] = useState(false);
  const { run, busy, error } = useRun(ctx.act);
  const row = view.state.rows.find((r) => r.entryId === entryId);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!row) return null;
  const hand = details?.hands.find((h) => h.id === row.entryId) ?? null;
  const log = details?.log.filter((l) => l.handId === row.entryId) ?? [];
  const canEdit = isHost && view.status !== 'cancelled';

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal card stack"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="row between">
          <h2>{row.hand ? `Кон ${row.hand.number}` : 'Штраф без розыгрыша'}</h2>
          <button className="btn small" onClick={onClose} aria-label="Закрыть">
            ✕
          </button>
        </div>
        <p className="small muted">
          Раздаёт {nameOf(row.turn.dealer)} · на 100 {nameOf(row.turn.onHundred)}
          {row.hand && (
            <>
              {' · '}заказал {nameOf(row.hand.declarer)}: {row.hand.bid}
              {row.hand.dark === 'played' && ' в тёмную'}
              {row.hand.dark === 'overbid' && ' (тёмную перебили)'}
              {row.hand.rospis && ', роспись'}
              {row.hand.goldenThousand && ', золотая тысяча'}
            </>
          )}
        </p>

        {editing && hand ? (
          <HandEditor ctx={ctx} row={row} hand={hand} onDone={() => setEditing(false)} />
        ) : (
          <>
            <CellsTable ctx={ctx} row={row} hand={hand} />
            {row.hand &&
              row.hand.trickSum !== 120 &&
              !row.hand.rospis &&
              !row.hand.goldenThousand && (
                <p className="small warn">Сумма взяток {row.hand.trickSum} из 120</p>
              )}
            {canEdit && hand && (
              <button className="btn" onClick={() => setEditing(true)}>
                Изменить кон
              </button>
            )}
          </>
        )}

        {row.dealMarks.length > 0 && (
          <section className="stack-sm">
            <h3>События раздачи</h3>
            {row.dealMarks.map((d) => {
              const ev = details?.events.find((e) => e.id === d.entryId);
              return (
                <div key={d.entryId} className="row between small">
                  <span className="row">
                    <Sym s={dealMarkSymbol(d)} />
                    {dealMarkSymbol(d).title}
                    {ev && (
                      <span className="muted">
                        {' '}
                        · {nameOf(ev.createdBy)}, {timeText(ev.createdAt)}
                      </span>
                    )}
                  </span>
                  {canEdit && (
                    <button
                      className="btn small danger"
                      disabled={busy}
                      onClick={() =>
                        run(
                          { type: 'deleteDealEvent', eventId: d.entryId },
                          'Удалить событие? Таблица пересчитается.',
                        )
                      }
                    >
                      Удалить
                    </button>
                  )}
                </div>
              );
            })}
            <ErrorText error={error} />
          </section>
        )}

        {log.length > 0 && (
          <section className="stack-sm">
            <h3>Журнал</h3>
            <LogList entries={log} nameOf={nameOf} />
          </section>
        )}
      </div>
    </div>
  );
}

function CellsTable({ ctx, row, hand }: { ctx: GameCtx; row: Row; hand: HandDetail | null }) {
  const { view, nameOf } = ctx;
  return (
    <table className="review">
      <thead>
        <tr className="small muted">
          <td>Игрок</td>
          <td>Ввод</td>
          <td className="num">Кон</td>
          <td className="num">Итог</td>
        </tr>
      </thead>
      <tbody>
        {view.seats.map((p) => {
          const cell = row.cells[p.id]!;
          const input = hand?.inputs.find((i) => i.playerId === p.id);
          const symbols = cell.marks.map(markSymbol).filter((s) => s !== null);
          return (
            <tr key={p.id}>
              <td>
                {p.name}
                {symbols.length > 0 && (
                  <span className="syms">
                    {symbols.map((s, i) => (
                      <Sym key={i} s={s} />
                    ))}
                  </span>
                )}
              </td>
              <td>
                {inputText(input)}
                {input?.auto && <AutoBadge />}
                {input && !input.auto && input.enteredBy !== p.id && (
                  <span className="small muted"> (ввёл {nameOf(input.enteredBy)})</span>
                )}
              </td>
              <td className="num">
                {cell.delta > 0 ? '+' : ''}
                {cell.delta}
              </td>
              <td className="num">{cell.total}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function LogList({
  entries,
  nameOf,
}: {
  entries: GameDetails['log'];
  nameOf: (id: PlayerId) => string;
}) {
  return (
    <ul className="log">
      {entries.map((l) => {
        const d = describeLog(l, nameOf);
        return (
          <li key={l.id}>
            <span className="muted small">
              {timeText(l.createdAt)} · {nameOf(l.actorId)}
            </span>{' '}
            <b>{d.title}</b>
            {d.changes.length > 0 && <span className="small"> — {d.changes.join('; ')}</span>}
          </li>
        );
      })}
    </ul>
  );
}

interface DraftRow {
  tricks: string;
  marriages: Marriage[];
}

/** Правка подтверждённого кона ведущим (ТЗ 5.5). */
function HandEditor({
  ctx,
  row,
  hand,
  onDone,
}: {
  ctx: GameCtx;
  row: Row;
  hand: HandDetail;
  onDone: () => void;
}) {
  const { nameOf } = ctx;
  const { turn } = row;
  const { run, busy, error } = useRun(ctx.act);
  const [declarer, setDeclarer] = useState(hand.declarerId);
  const [bid, setBid] = useState(hand.bid);
  const [dark, setDark] = useState<DarkStatus>(hand.dark);
  const [rospis, setRospis] = useState(hand.rospis);
  const [golden, setGolden] = useState(hand.goldenThousand);
  const [inputs, setInputs] = useState<Record<PlayerId, DraftRow>>(() =>
    Object.fromEntries(
      turn.active.map((p) => {
        const i = hand.inputs.find((x) => x.playerId === p);
        return [p, { tricks: i?.tricks?.toString() ?? '', marriages: i?.marriages ?? [] }];
      }),
    ),
  );
  const sitterInput = turn.prikupSitter
    ? hand.inputs.find((x) => x.playerId === turn.prikupSitter)
    : undefined;
  const [prikupPoints, setPrikupPoints] = useState(sitterInput?.prikupPoints?.toString() ?? '');
  const [prikupMarriage, setPrikupMarriage] = useState<Suit | null>(
    sitterInput?.prikupMarriage ?? null,
  );

  // Золотая пика — в строке заказавшего, поэтому строки ввода видны и при золотой тысяче.
  const needTricks = !rospis;
  const update = (p: PlayerId, patch: Partial<DraftRow>) =>
    setInputs((all) => ({ ...all, [p]: { ...all[p]!, ...patch } }));
  const sum = turn.active.reduce((s, p) => s + (Number(inputs[p]?.tricks) || 0), 0);

  async function save() {
    const ok = await run({
      type: 'editHand',
      handId: hand.id,
      declarerId: declarer,
      bid,
      dark,
      rospis,
      goldenThousand: golden,
      inputs: turn.active
        .filter((p) => inputs[p]!.tricks !== '')
        .map((p) => ({
          playerId: p,
          tricks: Number(inputs[p]!.tricks),
          marriages: inputs[p]!.marriages,
        })),
      prikup:
        turn.prikupSitter && prikupPoints !== ''
          ? { points: Number(prikupPoints), marriage: prikupMarriage }
          : null,
    });
    if (ok) onDone();
  }

  return (
    <div className="stack">
      <div className="stack-sm">
        <h3>Заказал</h3>
        <div className="chips">
          {turn.active.map((p) => (
            <button
              key={p}
              type="button"
              className={`chip ${p === declarer ? 'on' : ''}`}
              onClick={() => setDeclarer(p)}
            >
              {nameOf(p)}
            </button>
          ))}
        </div>
        <BidStepper value={bid} min={MIN_BID} onChange={setBid} />
        <div className="chips">
          {(['none', 'played', 'overbid'] as const).map((d) => (
            <button
              key={d}
              type="button"
              className={`chip ${dark === d ? 'on' : ''}`}
              onClick={() => setDark(d)}
            >
              {{ none: 'без тёмной', played: 'в тёмную', overbid: 'тёмную перебили' }[d]}
            </button>
          ))}
        </div>
        <div className="chips">
          <button
            type="button"
            className={`chip ${rospis ? 'on' : ''}`}
            onClick={() => setRospis(!rospis)}
          >
            роспись
          </button>
        </div>
      </div>

      {needTricks && (
        <div className="stack-sm">
          <h3>Очки взяток · сумма {sum} из 120</h3>
          {turn.active.map((p) => (
            <div key={p} className="edit-row">
              <span className="edit-name">{nameOf(p)}</span>
              <input
                className="input"
                inputMode="numeric"
                pattern="[0-9]*"
                value={inputs[p]!.tricks}
                onChange={(e) => update(p, { tricks: e.target.value.replace(/\D/g, '') })}
              />
              <div className="chips">
                {MARRIAGES.map((m) => (
                  <button
                    key={m}
                    type="button"
                    className={`chip small suit-${m} ${inputs[p]!.marriages.includes(m) ? 'on' : ''}`}
                    onClick={() =>
                      update(p, {
                        marriages: inputs[p]!.marriages.includes(m)
                          ? inputs[p]!.marriages.filter((x) => x !== m)
                          : [...inputs[p]!.marriages, m],
                      })
                    }
                  >
                    {MARRIAGE_SYMBOL[m]}
                  </button>
                ))}
                <GoldenChip
                  small
                  on={golden && p === declarer}
                  enabled={p === declarer}
                  declarer={nameOf(declarer)}
                  onToggle={() => setGolden(!golden)}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {turn.prikupSitter && !golden && (
        <div className="stack-sm">
          <h3>Прикуп ({nameOf(turn.prikupSitter)})</h3>
          <div className="chips">
            <button
              type="button"
              className={`chip small ${prikupMarriage === null ? 'on' : ''}`}
              onClick={() => setPrikupMarriage(null)}
            >
              без марьяжа
            </button>
            {SUITS.map((s) => (
              <button
                key={s}
                type="button"
                className={`chip small suit-${s} ${prikupMarriage === s ? 'on' : ''}`}
                onClick={() => setPrikupMarriage(s)}
              >
                {MARRIAGE_SYMBOL[s]}
              </button>
            ))}
          </div>
          <input
            className="input"
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder={prikupMarriage ? 'Очки третьей карты' : 'Очки прикупа'}
            value={prikupPoints}
            onChange={(e) => setPrikupPoints(e.target.value.replace(/\D/g, ''))}
          />
        </div>
      )}

      <div className="row">
        <button className="btn" onClick={onDone}>
          Отмена
        </button>
        <button className="btn primary grow" disabled={busy} onClick={save}>
          Сохранить правку
        </button>
      </div>
      <ErrorText error={error} />
    </div>
  );
}
