import { useCallback, useState } from 'react';
import type { GameAction, GameView, PlayerId } from '@thousand/core';

export interface GameCtx {
  view: GameView;
  me: PlayerId | null;
  isSeated: boolean;
  isHost: boolean;
  act: (action: GameAction) => Promise<string | null>;
  nameOf: (id: PlayerId) => string;
}

/** Запуск действия с флагом «занято» и текстом ошибки. */
export function useRun(act: GameCtx['act']) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(
    async (action: GameAction, confirmText?: string) => {
      if (confirmText && !window.confirm(confirmText)) return false;
      setBusy(true);
      const err = await act(action);
      setBusy(false);
      setError(err);
      return err === null;
    },
    [act],
  );
  return { run, busy, error };
}

export function ErrorText({ error }: { error: string | null }) {
  return error ? <p className="error">{error}</p> : null;
}

export function BidStepper({
  value,
  min,
  onChange,
}: {
  value: number;
  min: number;
  onChange: (bid: number) => void;
}) {
  // Вниз — не ниже минимума: «−20» у самого минимума опускает ровно до него.
  const down = (step: number) => (
    <button
      type="button"
      className="btn"
      disabled={value <= min}
      onClick={() => onChange(Math.max(min, value - step))}
    >
      −{step}
    </button>
  );
  const up = (step: number) => (
    <button type="button" className="btn" onClick={() => onChange(value + step)}>
      +{step}
    </button>
  );
  return (
    <div className="stepper">
      {down(20)}
      {down(5)}
      <span className="stepper-value">{value}</span>
      {up(5)}
      {up(20)}
    </div>
  );
}
