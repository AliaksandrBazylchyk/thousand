import { useState } from 'react';
import type { PlayerId } from '@thousand/core';
import { ErrorText, useRun, type GameCtx } from './ui';

/**
 * Пересдача из-за 4 девяток или 4 вальтов — у кого карты на руках. Доступна и после итога торгов
 * (когда взят прикуп): начатый кон тогда отменяется, раздаёт тот же игрок (ТЗ 2.3, 6.1).
 */
export function RedealButtons({ ctx, afterBid = false }: { ctx: GameCtx; afterBid?: boolean }) {
  const { run, busy, error } = useRun(ctx.act);
  const confirmText = afterBid ? 'Пересдача: начатый кон отменится. Продолжить?' : undefined;
  return (
    <>
      <button
        className="btn"
        disabled={busy}
        onClick={() =>
          run({ type: 'dealEvent', event: 'redeal', reason: 'fourNines' }, confirmText)
        }
      >
        ↻ 4 девятки
      </button>
      <button
        className="btn"
        disabled={busy}
        onClick={() =>
          run({ type: 'dealEvent', event: 'redeal', reason: 'fourJacks' }, confirmText)
        }
      >
        ↻ 4 вальта
      </button>
      {error && (
        <span className="full-row">
          <ErrorText error={error} />
        </span>
      )}
    </>
  );
}

/**
 * Ведущий прерывает кон за нарушение правил: нарушителю −120, остальным ничего (без болтов,
 * счёт прошлого кона), раздача переходит к следующему (ТЗ 2.10, 6.2).
 */
export function ViolationButton({ ctx }: { ctx: GameCtx }) {
  const { view, nameOf } = ctx;
  const { run, busy, error } = useRun(ctx.act);
  const [open, setOpen] = useState(false);

  const punish = async (playerId: PlayerId) => {
    const ok = await run(
      { type: 'dealEvent', event: 'violation', playerId },
      `${nameOf(playerId)} нарушил правила: −120, кон прерывается без очков остальным, раздача переходит дальше. Продолжить?`,
    );
    if (ok) setOpen(false);
  };

  if (!open) {
    return (
      <button className="btn danger" disabled={busy} onClick={() => setOpen(true)}>
        −120 за нарушение
      </button>
    );
  }
  return (
    <div className="stack-sm violation full-row">
      <span className="label-small">Кто нарушил правила? Ему −120, кон прерывается</span>
      <div className="chips">
        {view.seats.map((p) => (
          <button
            key={p.id}
            type="button"
            className="chip danger"
            disabled={busy}
            onClick={() => void punish(p.id)}
          >
            {p.name}
          </button>
        ))}
        <button type="button" className="chip" onClick={() => setOpen(false)}>
          Отмена
        </button>
      </div>
      <ErrorText error={error} />
    </div>
  );
}
