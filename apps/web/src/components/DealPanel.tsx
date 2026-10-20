import { useState } from 'react';
import { MIN_BID, MIN_DARK_BID, MIN_DARK_OVERBID, type DarkStatus } from '@thousand/core';
import { dealMarkSymbol } from '../symbols';
import { Sym } from './Sym';
import { BidStepper, ErrorText, useRun, type GameCtx } from './ui';

/** Этап «Раздача»: очерёдность, события раздачи, тёмная, итог торгов. */
export function DealPanel({ ctx }: { ctx: GameCtx }) {
  const { view, me, isSeated, isHost, nameOf } = ctx;
  const { run, busy, error } = useRun(ctx.act);
  const current = view.state.current!;
  const { turn } = current;
  // Каждый видит только свои кнопки: пересдачу — у кого карты, 3 девятки и тёмную — игрок на 100,
  // девятку и валета внизу — сдвигающий, неправильную раздачу — ведущий.
  const iHaveCards = me !== null && turn.active.includes(me);
  const iAmOnHundred = me === turn.onHundred;
  const iAmShifter = me === turn.shifter;
  const canDark = iAmOnHundred && !(view.state.players[turn.onHundred]?.onBarrel ?? false);
  const anyButtons = iHaveCards || iAmShifter || canDark || isHost;

  return (
    <section className="card stack">
      <div className="panel-head">
        <h2>Кон {current.handNumber} · раздача</h2>
        {current.dealMarks.length > 0 && (
          <span className="syms" title="События этой раздачи">
            {current.dealMarks.map((d) => (
              <Sym key={d.entryId} s={dealMarkSymbol(d)} />
            ))}
          </span>
        )}
      </div>
      <dl className="turn-strip">
        <div>
          <dt>Раздаёт{turn.prikupSitter ? ' · прикуп' : ''}</dt>
          <dd>{nameOf(turn.dealer)}</dd>
        </div>
        <div>
          <dt>Сдвигает</dt>
          <dd>{nameOf(turn.shifter)}</dd>
        </div>
        <div>
          <dt>На 100{view.darkDeclared ? ' · тёмная' : ''}</dt>
          <dd>{nameOf(turn.onHundred)}</dd>
        </div>
      </dl>

      {anyButtons && (
        <div className="grid-buttons">
          {iHaveCards && (
            <>
              <button
                className="btn"
                disabled={busy}
                onClick={() => run({ type: 'dealEvent', event: 'redeal', reason: 'fourNines' })}
              >
                ↻ 4 девятки
              </button>
              <button
                className="btn"
                disabled={busy}
                onClick={() => run({ type: 'dealEvent', event: 'redeal', reason: 'fourJacks' })}
              >
                ↻ 4 вальта
              </button>
            </>
          )}
          {iAmOnHundred && (
            <button
              className="btn"
              disabled={busy}
              onClick={() =>
                run({
                  type: 'dealEvent',
                  event: 'redeal',
                  reason: 'threeNines',
                  playerId: turn.onHundred,
                })
              }
            >
              ↻ 3 девятки
            </button>
          )}
          {iAmShifter && (
            <>
              <button
                className="btn"
                disabled={busy}
                onClick={() => run({ type: 'dealEvent', event: 'nineAtBottom' })}
              >
                Внизу 9 · {current.shiftCount}/3
              </button>
              <button
                className="btn"
                disabled={busy}
                onClick={() => run({ type: 'dealEvent', event: 'jackAtBottom' })}
              >
                Внизу валет · {current.shiftCount}/3
              </button>
            </>
          )}
          {canDark && (
            <button
              className={`btn ${view.darkDeclared ? 'on' : ''}`}
              disabled={busy}
              onClick={() => run({ type: 'declareDark', value: !view.darkDeclared })}
            >
              {view.darkDeclared ? 'Отменить тёмную' : 'Играю в тёмную'}
            </button>
          )}
          {isHost && (
            <button
              className="btn danger"
              disabled={busy}
              onClick={() =>
                run(
                  { type: 'dealEvent', event: 'misdeal' },
                  `Неправильная раздача: ${nameOf(turn.dealer)} получит −120. Продолжить?`,
                )
              }
            >
              Неправильная раздача
            </button>
          )}
        </div>
      )}
      <ErrorText error={error} />

      {isSeated && <BiddingForm key={`${current.handNumber}-${turn.dealer}`} ctx={ctx} />}
    </section>
  );
}

function BiddingForm({ ctx }: { ctx: GameCtx }) {
  const { view, nameOf, me, isHost } = ctx;
  const { turn } = view.state.current!;
  const { run, busy, error } = useRun(ctx.act);
  const [overbid, setOverbid] = useState(false);
  const [declarer, setDeclarer] = useState(isHost ? turn.onHundred : (me ?? turn.onHundred));
  const [bid, setBid] = useState(MIN_BID);

  const dark: DarkStatus = view.darkDeclared ? (overbid ? 'overbid' : 'played') : 'none';
  const minBid = dark === 'played' ? MIN_DARK_BID : dark === 'overbid' ? MIN_DARK_OVERBID : MIN_BID;
  const effectiveBid = Math.max(bid, minBid);
  const candidates =
    dark === 'played'
      ? [turn.onHundred]
      : dark === 'overbid'
        ? turn.active.filter((p) => p !== turn.onHundred)
        : turn.active;
  // Ведущий фиксирует итог торгов за любого, игрок — только свой заказ.
  const options = isHost ? candidates : candidates.filter((p) => p === me);
  const darkToggle = view.darkDeclared && (isHost || me !== turn.onHundred) && (
    <label className="row small">
      <input type="checkbox" checked={overbid} onChange={(e) => setOverbid(e.target.checked)} />
      Тёмную перебили ставкой от {MIN_DARK_OVERBID}
    </label>
  );
  if (options.length === 0) {
    return view.darkDeclared ? (
      <div className="stack-sm bidding">
        {darkToggle}
        {!overbid && <p className="small muted">Тёмная: заказывает {nameOf(turn.onHundred)}</p>}
      </div>
    ) : null;
  }
  const effectiveDeclarer = options.includes(declarer) ? declarer : options[0]!;
  const mine = effectiveDeclarer === me;

  return (
    <div className="stack-sm bidding">
      <span className="label-small">{isHost ? 'Итог торгов' : 'Я выиграл торги'}</span>
      {darkToggle}
      {isHost && (
        <div className="chips">
          {options.map((p) => (
            <button
              key={p}
              type="button"
              className={`chip ${p === effectiveDeclarer ? 'on' : ''}`}
              onClick={() => setDeclarer(p)}
            >
              {nameOf(p)}
            </button>
          ))}
        </div>
      )}
      <div className="bid-row">
        <BidStepper value={effectiveBid} min={minBid} onChange={setBid} />
        <button
          className="btn primary"
          disabled={busy}
          onClick={() =>
            run({ type: 'startHand', declarerId: effectiveDeclarer, bid: effectiveBid, dark })
          }
        >
          {mine ? 'Я заказал' : `Заказал ${nameOf(effectiveDeclarer)}`}: {effectiveBid}
          {dark === 'played' ? ' ◐' : ''}
        </button>
      </div>
      <ErrorText error={error} />
    </div>
  );
}
