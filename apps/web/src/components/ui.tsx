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
  return (
    <div className="stepper">
      <button
        type="button"
        className="btn"
        disabled={value - 5 < min}
        onClick={() => onChange(value - 5)}
      >
        −5
      </button>
      <span className="stepper-value">{value}</span>
      <button type="button" className="btn" onClick={() => onChange(value + 5)}>
        +5
      </button>
    </div>
  );
}
