import { useState } from 'react';
import { MIN_BID, MIN_DARK_BID, MIN_DARK_OVERBID, type DarkStatus } from '@thousand/core';
import { REDEAL_REASON_LABEL, dealMarkSymbol } from '../symbols';
import { Sym } from './Sym';
import { BidStepper, ErrorText, useRun, type GameCtx } from './ui';

/** Этап «Раздача»: очерёдность, события раздачи, тёмная, итог торгов. */
export function DealPanel({ ctx }: { ctx: GameCtx }) {
  const { view, me, isSeated, isHost, nameOf } = ctx;
  const { run, busy, error } = useRun(ctx.act);
  const current = view.state.current!;
  const { turn } = current;
  const iAmOnHundred = me === turn.onHundred;
  const onHundredOnBarrel = view.state.players[turn.onHundred]?.onBarrel ?? false;

  return (
    <section className="card stack">
      <h2>Кон {current.handNumber} · раздача</h2>
      <dl className="turn">
        <dt>Раздаёт</dt>
        <dd>{nameOf(turn.dealer)}</dd>
        <dt>Сдвигает</dt>
        <dd>{nameOf(turn.shifter)}</dd>
        <dt>На 100</dt>
        <dd>
          {nameOf(turn.onHundred)}
          {view.darkDeclared && <span className="badge dark">тёмная</span>}
        </dd>
        {turn.prikupSitter && (
          <>
            <dt>На прикупе</dt>
            <dd>{nameOf(turn.prikupSitter)}</dd>
          </>
        )}
      </dl>
      {current.dealMarks.length > 0 && (
        <p className="small">
          В этой раздаче:{' '}
          {current.dealMarks.map((d) => (
            <Sym key={d.entryId} s={dealMarkSymbol(d)} />
          ))}
        </p>
      )}

      {isSeated && (
        <div className="grid-buttons">
          <button
            className="btn"
            disabled={busy}
            onClick={() => run({ type: 'dealEvent', event: 'redeal', reason: 'fourNines' })}
          >
            Пересдача: 4 девятки
          </button>
          <button
            className="btn"
            disabled={busy}
            onClick={() => run({ type: 'dealEvent', event: 'redeal', reason: 'fourJacks' })}
          >
            Пересдача: 4 вальта
          </button>
          {(iAmOnHundred || isHost) && (
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
              Пересдача: {REDEAL_REASON_LABEL.threeNines}
            </button>
          )}
          {(me === turn.shifter || isHost) && (
            <button
              className="btn"
              disabled={busy}
              onClick={() => run({ type: 'dealEvent', event: 'nineAtBottom' })}
            >
              Внизу девятка ({current.nineCount}/3)
            </button>
          )}
          {(iAmOnHundred || isHost) && !onHundredOnBarrel && (
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
  const { view, nameOf } = ctx;
  const { turn } = view.state.current!;
  const { run, busy, error } = useRun(ctx.act);
  const [overbid, setOverbid] = useState(false);
  const [declarer, setDeclarer] = useState(turn.onHundred);
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
  const effectiveDeclarer = candidates.includes(declarer) ? declarer : candidates[0]!;

  return (
    <div className="stack bidding">
      <h3>Итог торгов</h3>
      {view.darkDeclared && (
        <label className="row small">
          <input type="checkbox" checked={overbid} onChange={(e) => setOverbid(e.target.checked)} />
          Тёмную перебили ставкой от {MIN_DARK_OVERBID}
        </label>
      )}
      <div className="chips">
        {candidates.map((p) => (
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
      <BidStepper value={effectiveBid} min={minBid} onChange={setBid} />
      <button
        className="btn primary"
        disabled={busy}
        onClick={() =>
          run({ type: 'startHand', declarerId: effectiveDeclarer, bid: effectiveBid, dark })
        }
      >
        Заказал {nameOf(effectiveDeclarer)}: {effectiveBid}
        {dark === 'played' ? ' в тёмную' : ''}
      </button>
      <ErrorText error={error} />
    </div>
  );
}
