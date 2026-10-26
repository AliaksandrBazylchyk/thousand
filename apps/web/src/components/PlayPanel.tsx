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
import { inputText } from '../editLog';
import { MARRIAGES, MARRIAGE_SYMBOL, SUITS } from '../symbols';
import { RedealButtons, ViolationButton } from './DealButtons';
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
  const myInput = me ? draft.inputs[me] : undefined;
  // Этап «Ожидание» (ТЗ 6.1): после ввода форма сворачивается в строку с кнопкой «Изменить».
  const [editMine, setEditMine] = useState(false);

  return (
    <section className="card stack">
      <div className="panel-head">
        <h2>
          Кон {handNumber} · {nameOf(draft.declarerId)}: {draft.bid}
          {draft.dark === 'played' && ' ◐'}
        </h2>
        <span className="small muted">раздаёт {nameOf(turn.dealer)}</span>
      </div>
      {(draft.rospis || draft.goldenThousand) && (
        <p className={`small ${draft.goldenThousand ? 'gold-text' : 'warn'}`}>
          {draft.goldenThousand ? 'Золотая тысяча' : 'Роспись'}
        </p>
      )}

      {iAmDeclarer && !draft.goldenThousand && <DeclarerControls ctx={ctx} />}

      {/* 4 девятки или 4 вальта могут обнаружиться и после итога торгов (ТЗ 2.3). */}
      {iPlay && (
        <div className="grid-buttons compact">
          <RedealButtons ctx={ctx} afterBid />
        </div>
      )}

      {showMyTricks &&
        (myInput?.tricks != null || (iAmDeclarer && draft.goldenThousand)) &&
        !editMine && (
          <InputDone
            label="Мои очки"
            text={draft.goldenThousand && iAmDeclarer ? 'золотая тысяча' : inputText(myInput)}
            onEdit={() => setEditMine(true)}
          />
        )}
      {showMyTricks &&
        ((myInput?.tricks == null && !(iAmDeclarer && draft.goldenThousand)) || editMine) && (
          <TricksEditor
            key={`${me}-${myInput?.updatedAt ?? 0}-${draft.goldenThousand}`}
            ctx={ctx}
            playerId={me!}
            input={myInput}
            title={iAmDeclarer ? `Мои очки · нужно ${draft.bid}` : 'Мои очки'}
            onDone={() => setEditMine(false)}
          />
        )}
      {me === turn.prikupSitter &&
        !draft.goldenThousand &&
        (myInput?.prikupPoints != null && !editMine ? (
          <InputDone
            label="Мой прикуп"
            text={inputText(myInput)}
            onEdit={() => setEditMine(true)}
          />
        ) : (
          <PrikupEditor
            key={`${me}-${myInput?.updatedAt ?? 0}`}
            ctx={ctx}
            playerId={me!}
            input={myInput}
            onDone={() => setEditMine(false)}
          />
        ))}

      {/* Ведущему это видно в его сводке. */}
      {!isHost &&
        (draft.waitingFor.length > 0 ? (
          <p className="small">Ждём ввод: {draft.waitingFor.map(nameOf).join(', ')}</p>
        ) : (
          <p className="small good">Все ввели, ждём подтверждения ведущего</p>
        ))}

      {isHost && <HostReview ctx={ctx} />}
    </section>
  );
}

/**
 * Золотая тысяча — маленькая золотая пика рядом с марьяжами в любом вводе очков.
 * Отметить её может только заказавший (ТЗ 2.2), у остальных значок неактивен и объясняет почему.
 */
export function GoldenChip({
  on,
  enabled,
  declarer,
  onToggle,
  small = false,
}: {
  on: boolean;
  enabled: boolean;
  declarer: string;
  onToggle: () => void;
  small?: boolean;
}) {
  const title = enabled
    ? 'Золотая тысяча: 4 короля и 4 дамы после прикупа — победа в партии'
    : `Золотая тысяча бывает только у заказавшего (${declarer})`;
  return (
    <button
      type="button"
      className={`chip golden ${small ? 'small' : ''} ${on ? 'on' : ''}`}
      title={title}
      aria-label={title}
      aria-pressed={on}
      disabled={!enabled}
      onClick={onToggle}
    >
      ♠
    </button>
  );
}

/** Значок «подсчитано автоматически» у остатка до 120. */
export function AutoBadge() {
  const title = 'Подсчитано автоматически: 120 минус очки остальных игроков';
  return (
    <span className="auto-badge" title={title} aria-label={title} role="img">
      ∑
    </span>
  );
}

/** Свой ввод уже отправлен: одна строка вместо формы. */
function InputDone({ label, text, onEdit }: { label: string; text: string; onEdit: () => void }) {
  return (
    <div className="input-done">
      <span>
        {label}: <b>{text}</b>
      </span>
      <button className="btn small" onClick={onEdit}>
        Изменить
      </button>
    </div>
  );
}

function DeclarerControls({ ctx }: { ctx: GameCtx }) {
  const draft = ctx.view.draft!;
  const { run, busy, error } = useRun(ctx.act);
  const minBid =
    draft.dark === 'played' ? MIN_DARK_BID : draft.dark === 'overbid' ? MIN_DARK_OVERBID : MIN_BID;

  return (
    <div className="stack-sm">
      <span className="label-small">Ставка после прикупа</span>
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
          Прикуп ≤4 · неигровой
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
      <span className="label-small">{title}</span>
      <div className="input-row">
        <input
          className="input big"
          inputMode="numeric"
          pattern="[0-9]*"
          placeholder="Очки взяток"
          aria-label="Очки взяток"
          value={tricks}
          onChange={(e) => setTricks(e.target.value.replace(/\D/g, ''))}
        />
        <button className="btn primary" disabled={busy || !valid} onClick={save}>
          {input?.tricks != null || draft.goldenThousand ? 'Сохранить' : 'Готово'}
        </button>
      </div>
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
        <GoldenChip
          on={golden}
          enabled={canGolden}
          declarer={ctx.nameOf(draft.declarerId)}
          onToggle={() => setGolden(!golden)}
        />
      </div>
      {golden && <p className="small gold-text">Золотая тысяча — победа в партии</p>}
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
      <span className="label-small">Прикуп · {ctx.nameOf(playerId)} на прикупе</span>
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
      <div className="input-row">
        <input
          className="input big"
          inputMode="numeric"
          pattern="[0-9]*"
          placeholder={marriage ? 'Третья карта' : 'Очки прикупа'}
          aria-label={marriage ? 'Очки третьей карты' : 'Очки прикупа'}
          value={points}
          onChange={(e) => setPoints(e.target.value.replace(/\D/g, ''))}
        />
        <button className="btn primary" disabled={busy || !valid} onClick={save}>
          {input?.prikupPoints != null ? 'Сохранить' : 'Готово'}
        </button>
      </div>
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
  const entered = turn.active.reduce((sum, p) => sum + (draft.inputs[p]?.tricks ?? 0), 0);
  // С автоматическим остатком у последнего невведённого сумма — ровно 120.
  const trickSum = entered + (draft.auto?.tricks ?? 0);
  const anyEntered = turn.active.some((p) => draft.inputs[p]?.tricks != null);
  const hasErrors = draft.issues.some((i) => i.level === 'error');
  // «Нет ввода» и сумма взяток уже видны в таблице сводки — не повторяем их списком.
  const shownIssues = draft.issues.filter(
    (i) => i.code !== 'missingInput' && i.code !== 'trickSum',
  );
  const allEntered = draft.waitingFor.length === 0;

  return (
    <div className="stack-sm host-review">
      <span className="label-small">Ведущий: проверка кона</span>
      {needsTricks && (
        <table className="review">
          <tbody>
            {turn.active.map((p) => {
              const input = draft.inputs[p];
              const auto = draft.auto?.playerId === p ? draft.auto.tricks : null;
              return (
                <tr key={p}>
                  <td>{nameOf(p)}</td>
                  <td className="num">
                    {input?.tricks ??
                      (auto !== null ? (
                        <>
                          {auto} <AutoBadge />
                        </>
                      ) : (
                        '—'
                      ))}
                  </td>
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
                <td colSpan={2}>
                  {trickSum > CARD_POINTS_TOTAL
                    ? `больше ${CARD_POINTS_TOTAL} на ${trickSum - CARD_POINTS_TOTAL}`
                    : anyEntered && trickSum < CARD_POINTS_TOTAL
                      ? `осталось ${CARD_POINTS_TOTAL - trickSum}`
                      : `из ${CARD_POINTS_TOTAL}`}
                </td>
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

      {shownIssues.length > 0 && (
        <ul className="issues">
          {shownIssues.map((i, n) => (
            <li key={n} className={i.level}>
              {i.playerId && `${nameOf(i.playerId)}: `}
              {i.message}
            </li>
          ))}
        </ul>
      )}

      {draft.preview && allEntered && (
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
      <ViolationButton ctx={ctx} />
      <ErrorText error={error} />
    </div>
  );
}
