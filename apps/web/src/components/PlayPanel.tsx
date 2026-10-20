import { useState } from 'react';
import {
  CARD_POINTS_TOTAL,
  MIN_BID,
  MIN_DARK_BID,
  MIN_DARK_OVERBID,
  type DraftInput,
  type Marriage,
  type PlayerId,
  type Suit,
} from '@thousand/core';
import { MARRIAGES, MARRIAGE_SYMBOL, SUITS } from '../symbols';
import { BidStepper, ErrorText, useRun, type GameCtx } from './ui';

/** Этапы «Торги», «Ввод» и «Ожидание»: кон начат, идёт розыгрыш и ввод очков. */
export function PlayPanel({ ctx }: { ctx: GameCtx }) {
  const { view, me, isHost, nameOf } = ctx;
  const draft = view.draft!;
  const { turn, handNumber } = view.state.current!;
  const iAmDeclarer = me === draft.declarerId;
  const iPlay = me !== null && turn.active.includes(me);
  // Золотую тысячу отмечает заказавший в своём вводе, поэтому его форма видна и после отметки.
  const showMyTricks = iPlay && !draft.rospis && (iAmDeclarer || !draft.goldenThousand);

  return (
    <section className="card stack">
      <h2>
        Кон {handNumber} · заказал {nameOf(draft.declarerId)}: {draft.bid}
        {draft.dark === 'played' && ' ◐'}
      </h2>
      <p className="small muted">
        Раздаёт {nameOf(turn.dealer)}
        {turn.prikupSitter && ' (на прикупе)'}
        {draft.rospis && ' · роспись'}
        {draft.goldenThousand && ' · золотая тысяча'}
      </p>

      {iAmDeclarer && !draft.goldenThousand && <DeclarerControls ctx={ctx} />}

      {showMyTricks && (
        <TricksEditor
          key={`${me}-${draft.inputs[me!]?.updatedAt ?? 0}-${draft.goldenThousand}`}
          ctx={ctx}
          playerId={me!}
          input={draft.inputs[me!]}
          title={iAmDeclarer ? `Мои очки (нужно ${draft.bid})` : 'Мои очки'}
        />
      )}
      {me === turn.prikupSitter && !draft.goldenThousand && (
        <PrikupEditor
          key={`${me}-${draft.inputs[me!]?.updatedAt ?? 0}`}
          ctx={ctx}
          playerId={me!}
          input={draft.inputs[me!]}
        />
      )}

      {draft.waitingFor.length > 0 ? (
        <p className="small">Ждём ввод: {draft.waitingFor.map(nameOf).join(', ')}</p>
      ) : (
        <p className="small good">Все ввели, ждём подтверждения ведущего</p>
      )}

      {isHost && <HostReview ctx={ctx} />}
    </section>
  );
}

function DeclarerControls({ ctx }: { ctx: GameCtx }) {
  const draft = ctx.view.draft!;
  const { run, busy, error } = useRun(ctx.act);
  const minBid =
    draft.dark === 'played' ? MIN_DARK_BID : draft.dark === 'overbid' ? MIN_DARK_OVERBID : MIN_BID;

  return (
    <div className="stack-sm">
      <h3>Ставка после прикупа</h3>
      <BidStepper
        value={draft.bid}
        min={minBid}
        onChange={(bid) => void run({ type: 'updateHand', bid })}
      />
      <div className="grid-buttons">
        <button
          className={`btn ${draft.rospis ? 'on' : ''}`}
          disabled={busy}
          onClick={() => run({ type: 'updateHand', rospis: !draft.rospis })}
        >
          {draft.rospis ? 'Отменить роспись' : 'Расписать'}
        </button>
        <button
          className="btn"
          disabled={busy}
          onClick={() =>
            run(
              { type: 'badPrikup' },
              `Неигровой прикуп: в нём 4 очка или меньше. Кон отменяется, ${ctx.nameOf(
                ctx.view.state.current!.turn.dealer,
              )} раздаёт заново (это пересдача). Продолжить?`,
            )
          }
        >
          Прикуп неигровой (≤4)
        </button>
      </div>
      <ErrorText error={error} />
    </div>
  );
}

function TricksEditor({
  ctx,
  playerId,
  input,
  title,
  onDone,
}: {
  ctx: GameCtx;
  playerId: PlayerId;
  input: DraftInput | undefined;
  title: string;
  onDone?: () => void;
}) {
  const { run, busy, error } = useRun(ctx.act);
  const draft = ctx.view.draft!;
  // Золотая тысяча бывает только у заказавшего (2.2): золотая пика есть только в его вводе.
  const canGolden = playerId === draft.declarerId;
  const [golden, setGolden] = useState(draft.goldenThousand);
  const [tricks, setTricks] = useState(input?.tricks?.toString() ?? '');
  const [marriages, setMarriages] = useState<Marriage[]>(input?.marriages ?? []);
  const value = Number(tricks);
  const tricksValid = tricks !== '' && Number.isInteger(value) && value >= 0 && value <= 120;
  const valid = tricksValid || (golden && tricks === '');
  const toggle = (m: Marriage) =>
    setMarriages((list) => (list.includes(m) ? list.filter((x) => x !== m) : [...list, m]));

  async function save() {
    if (canGolden && golden !== draft.goldenThousand) {
      const ok = await run(
        { type: 'updateHand', goldenThousand: golden },
        golden
          ? 'Золотая тысяча: 4 короля и 4 дамы после прикупа. Это победа в партии. Отметить?'
          : undefined,
      );
      if (!ok) return;
    }
    if (tricksValid) {
      const ok = await run({ type: 'submitInput', playerId, tricks: value, marriages });
      if (!ok) return;
    }
    onDone?.();
  }

  return (
    <div className="stack-sm input-block">
      <h3>{title}</h3>
      <input
        className="input big"
        inputMode="numeric"
        pattern="[0-9]*"
        placeholder="Очки взяток"
        value={tricks}
        onChange={(e) => setTricks(e.target.value.replace(/\D/g, ''))}
      />
      <div className="chips">
        {MARRIAGES.map((m) => (
          <button
            key={m}
            type="button"
            className={`chip suit-${m} ${marriages.includes(m) ? 'on' : ''}`}
            onClick={() => toggle(m)}
          >
            {MARRIAGE_SYMBOL[m]}
          </button>
        ))}
        {canGolden && (
          <button
            type="button"
            className={`chip golden ${golden ? 'on' : ''}`}
            title="Золотая тысяча: 4 короля и 4 дамы"
            aria-label="Золотая тысяча"
            onClick={() => setGolden(!golden)}
          >
            ♠
          </button>
        )}
      </div>
      {golden && <p className="small gold-text">Золотая тысяча — победа в партии</p>}
      <button className="btn primary" disabled={busy || !valid} onClick={save}>
        {input?.tricks != null || draft.goldenThousand ? 'Сохранить' : 'Готово'}
      </button>
      {input?.tricks != null && (
        <p className="small muted">
          Введено: {input.tricks}
          {input.marriages.length > 0 &&
            ` + ${input.marriages.map((m) => MARRIAGE_SYMBOL[m]).join(' ')}`}
          {input.enteredBy !== playerId && ` (ввёл ${ctx.nameOf(input.enteredBy)})`}
        </p>
      )}
      <ErrorText error={error} />
    </div>
  );
}

function PrikupEditor({
  ctx,
  playerId,
  input,
  onDone,
}: {
  ctx: GameCtx;
  playerId: PlayerId;
  input: DraftInput | undefined;
  onDone?: () => void;
}) {
  const { run, busy, error } = useRun(ctx.act);
  const [points, setPoints] = useState(input?.prikupPoints?.toString() ?? '');
  const [marriage, setMarriage] = useState<Suit | null>(input?.prikupMarriage ?? null);
  const value = Number(points);
  const valid = points !== '' && Number.isInteger(value) && value >= 0 && value <= 120;

  async function save() {
    const ok = await run({
      type: 'submitInput',
      playerId,
      prikupPoints: value,
      prikupMarriage: marriage,
    });
    if (ok) onDone?.();
  }

  return (
    <div className="stack-sm input-block">
      <h3>Прикуп ({ctx.nameOf(playerId)} на прикупе)</h3>
      <div className="chips">
        <button
          type="button"
          className={`chip ${marriage === null ? 'on' : ''}`}
          onClick={() => setMarriage(null)}
        >
          без марьяжа
        </button>
        {SUITS.map((s) => (
          <button
            key={s}
            type="button"
            className={`chip suit-${s} ${marriage === s ? 'on' : ''}`}
            onClick={() => setMarriage(s)}
          >
            {MARRIAGE_SYMBOL[s]}
          </button>
        ))}
      </div>
      <input
        className="input big"
        inputMode="numeric"
        pattern="[0-9]*"
        placeholder={marriage ? 'Очки третьей карты' : 'Очки прикупа'}
        value={points}
        onChange={(e) => setPoints(e.target.value.replace(/\D/g, ''))}
      />
      <button className="btn primary" disabled={busy || !valid} onClick={save}>
        {input?.prikupPoints != null ? 'Сохранить' : 'Готово'}
      </button>
      <ErrorText error={error} />
    </div>
  );
}

/** Сводка ведущего: ввод всех, сумма взяток, предпросмотр, подтверждение. */
function HostReview({ ctx }: { ctx: GameCtx }) {
  const { view, nameOf } = ctx;
  const draft = view.draft!;
  const { turn } = view.state.current!;
  const { run, busy, error } = useRun(ctx.act);
  const [editing, setEditing] = useState<PlayerId | null>(null);
  const needsTricks = !draft.rospis;
  const trickSum = turn.active.reduce((sum, p) => sum + (draft.inputs[p]?.tricks ?? 0), 0);
  const hasErrors = draft.issues.some((i) => i.level === 'error');

  return (
    <div className="stack host-review">
      <h3>Ведущий: проверка кона</h3>
      {needsTricks && (
        <table className="review">
          <tbody>
            {turn.active.map((p) => {
              const input = draft.inputs[p];
              return (
                <tr key={p}>
                  <td>{nameOf(p)}</td>
                  <td className="num">{input?.tricks ?? '—'}</td>
                  <td>{input?.marriages.map((m) => MARRIAGE_SYMBOL[m]).join(' ')}</td>
                  <td>
                    <button className="btn small" onClick={() => setEditing(p)}>
                      {input ? 'Изменить' : 'Ввести'}
                    </button>
                  </td>
                </tr>
              );
            })}
            {draft.goldenThousand ? (
              <tr className="good">
                <td colSpan={4}>Золотая тысяча у {nameOf(draft.declarerId)}: очки не нужны</td>
              </tr>
            ) : (
              <tr className={trickSum === CARD_POINTS_TOTAL ? 'good' : 'warn'}>
                <td>Сумма</td>
                <td className="num">{trickSum}</td>
                <td colSpan={2}>из {CARD_POINTS_TOTAL}</td>
              </tr>
            )}
          </tbody>
        </table>
      )}
      {turn.prikupSitter && !draft.goldenThousand && (
        <p className="row between small">
          <span>
            Прикуп {nameOf(turn.prikupSitter)}:{' '}
            {draft.inputs[turn.prikupSitter]?.prikupPoints ?? '—'}
            {draft.inputs[turn.prikupSitter]?.prikupMarriage &&
              ` + ${MARRIAGE_SYMBOL[draft.inputs[turn.prikupSitter]!.prikupMarriage!]}`}
          </span>
          <button className="btn small" onClick={() => setEditing(turn.prikupSitter)}>
            Изменить
          </button>
        </p>
      )}

      {editing && editing === turn.prikupSitter && (
        <PrikupEditor
          ctx={ctx}
          playerId={editing}
          input={draft.inputs[editing]}
          onDone={() => setEditing(null)}
        />
      )}
      {editing && editing !== turn.prikupSitter && (
        <TricksEditor
          ctx={ctx}
          playerId={editing}
          input={draft.inputs[editing]}
          title={`Ввод за: ${nameOf(editing)}`}
          onDone={() => setEditing(null)}
        />
      )}

      {draft.issues.length > 0 && (
        <ul className="issues">
          {draft.issues.map((i, n) => (
            <li key={n} className={i.level}>
              {i.playerId && `${nameOf(i.playerId)}: `}
              {i.message}
            </li>
          ))}
        </ul>
      )}

      {draft.preview && (
        <div className="preview">
          {view.seats.map((p) => {
            const cell = draft.preview!.cells[p.id]!;
            return (
              <span key={p.id}>
                {p.name}: {cell.delta >= 0 ? '+' : ''}
                {cell.delta} → <b>{cell.total}</b>
              </span>
            );
          })}
        </div>
      )}

      <div className="row">
        <button
          className="btn danger"
          disabled={busy}
          onClick={() => run({ type: 'cancelHand' }, 'Отменить кон и вернуться к раздаче?')}
        >
          Отменить кон
        </button>
        <button
          className="btn primary grow"
          disabled={busy || hasErrors}
          onClick={() => run({ type: 'confirmHand' })}
        >
          Подтвердить кон
        </button>
      </div>
      <ErrorText error={error} />
    </div>
  );
}
