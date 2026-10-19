import {
  BARREL_ATTEMPTS,
  BARREL_SCORE,
  BOLTS_PER_PENALTY,
  BULLDOZER_SCORE,
  DEAL_REPEATS_PER_PENALTY,
  MARRIAGE_POINTS,
  PENALTY,
  WIN_SCORE,
  marriagesSum,
  round5,
  turnAt,
} from './rules';
import type {
  BarrelFallReason,
  Cell,
  CellInput,
  DealEventEntry,
  DealMark,
  DealPenaltyKind,
  Entry,
  GameSetup,
  GameState,
  HandEntry,
  Issue,
  Mark,
  PlayerId,
  PlayerStatus,
  Row,
  Turn,
} from './types';
import { validateHand } from './validate';

/** Счёт после падения с бочки по штрафу, сбивания или трёх неудачных конов: 880 − 120. */
const BARREL_PENALTY_SCORE = BARREL_SCORE - PENALTY;

/**
 * Состояние партии как функция от записей (ТЗ, раздел 3).
 * Записи — сыгранные (подтверждённые) коны и события раздачи в порядке их появления.
 */
export function replay(setup: GameSetup, entries: readonly Entry[]): GameState {
  const { seats } = setup;
  assertSetup(setup);
  const n = seats.length;

  const players: Record<PlayerId, PlayerStatus> = Object.fromEntries(
    seats.map((p) => [p, { score: 0, bolts: 0, onBarrel: false, barrelAttempts: 0 }]),
  );
  const status = (p: PlayerId) => players[p]!;

  let dealerIndex = seats.indexOf(setup.firstDealer);
  let nineCount = 0;
  let redealCount = 0;
  let dealMarks: DealMark[] = [];
  let handNumber = 1;
  let winner: PlayerId | null = null;
  const rows: Row[] = [];
  const issues: Issue[] = [];

  for (const entry of entries) {
    if (winner) {
      issues.push({
        level: 'warning',
        code: 'afterGameOver',
        entryId: entry.id,
        message: 'Запись после окончания партии не учитывается',
      });
      continue;
    }
    const turn = turnAt(seats, dealerIndex);
    if (entry.kind === 'dealEvent') {
      const penalty = applyDealEvent(entry, turn);
      if (penalty) {
        rows.push(penaltyRow(entry, turn, penalty));
        nextDealer();
      }
    } else {
      rows.push(playHand(entry, turn));
      handNumber++;
      if (!winner) nextDealer();
    }
  }

  return {
    setup,
    rows,
    players,
    winner,
    issues,
    current: winner
      ? null
      : { turn: turnAt(seats, dealerIndex), nineCount, redealCount, dealMarks, handNumber },
  };

  // ─── Очерёдность и события раздачи (2.3, шаги 1 и 12) ──────────────────

  function nextDealer() {
    dealerIndex = (dealerIndex + 1) % n;
    nineCount = 0;
    redealCount = 0;
    dealMarks = [];
  }

  /** Возвращает вид штрафа, если событие закончило очередь раздающего. */
  function applyDealEvent(e: DealEventEntry, turn: Turn): DealPenaltyKind | null {
    const mark = (count: number, playerId?: PlayerId) =>
      dealMarks.push({
        entryId: e.id,
        type: e.type,
        count,
        ...(e.reason ? { reason: e.reason } : {}),
        ...(playerId ? { playerId } : {}),
      });

    switch (e.type) {
      case 'nineAtBottom':
        nineCount++;
        mark(nineCount, turn.shifter);
        return nineCount >= DEAL_REPEATS_PER_PENALTY ? 'nine' : null;
      case 'redeal':
        redealCount++;
        nineCount = 0;
        mark(redealCount, e.playerId);
        if (!e.reason) {
          issues.push({
            level: 'warning',
            code: 'redealReasonMissing',
            entryId: e.id,
            message: 'Не указана причина пересдачи',
          });
        }
        return redealCount >= DEAL_REPEATS_PER_PENALTY ? 'redeal' : null;
      case 'misdeal':
        mark(1, turn.dealer);
        return 'misdeal';
    }
  }

  function penaltyRow(e: DealEventEntry, turn: Turn, kind: DealPenaltyKind): Row {
    const before = snapshot();
    const marks = emptyMarks();
    const target = kind === 'nine' ? turn.shifter : turn.dealer;

    marks[target]!.push({ type: 'dealPenalty', kind });
    if (status(target).onBarrel) fall(target, BARREL_PENALTY_SCORE, 'penalty', marks);
    else status(target).score -= PENALTY;

    // R5: раздача перешла к следующему — попытка на бочке расходуется.
    for (const p of seats) {
      if (status(p).onBarrel) spendAttempt(p, turn, marks);
    }
    bulldoze(marks);

    const credited = zeros();
    credited[target] = -PENALTY;
    return buildRow('dealPenalty', e.id, turn, null, before, marks, credited, {}, []);
  }

  // ─── Кон (шаги 3–11) ─────────────────────────────────────────────────────

  function playHand(hand: HandEntry, turn: Turn): Row {
    const handIssues = validateHand(hand, turn, players);
    const before = snapshot();
    const marks = emptyMarks();
    const credited = zeros();
    const inputs: Record<PlayerId, CellInput> = {};
    if (!(hand.declarer in players)) {
      return buildRow('hand', hand.id, turn, null, before, marks, credited, inputs, handIssues);
    }
    const startOnBarrel = new Set(seats.filter((p) => status(p).onBarrel));
    const { declarer, bid } = hand;
    const mult = hand.dark === 'played' ? 2 : 1;
    const tricksOf = (p: PlayerId) => hand.inputs[p]?.tricks ?? 0;
    const marriagesOf = (p: PlayerId) => hand.inputs[p]?.marriages ?? [];

    for (const p of turn.active) {
      const input = hand.inputs[p];
      if (!input) continue;
      inputs[p] = { tricks: input.tricks, marriages: [...input.marriages] };
      for (const m of input.marriages) marks[p]!.push({ type: 'marriage', marriage: m });
    }
    if (turn.prikupSitter) {
      marks[turn.prikupSitter]!.push({ type: 'prikup' });
      if (hand.prikup) inputs[turn.prikupSitter] = { prikup: { ...hand.prikup } };
    }
    if (hand.dark === 'played') marks[declarer]!.push({ type: 'dark' });

    const summary = {
      number: handNumber,
      declarer,
      bid,
      dark: hand.dark,
      rospis: hand.rospis,
      goldenThousand: hand.goldenThousand,
      trickSum: turn.active.reduce((sum, p) => sum + tricksOf(p), 0),
    };
    const finish = () =>
      buildRow('hand', hand.id, turn, summary, before, marks, credited, inputs, handIssues);

    // 11 (досрочно). Золотая тысяча — победа сразу, в том числе в тёмную и на бочке.
    if (hand.goldenThousand) {
      marks[declarer]!.push({ type: 'goldenThousand' }, { type: 'winner' });
      status(declarer).score = WIN_SCORE;
      winner = declarer;
      return finish();
    }

    // 4. Заказавший.
    let made = false;
    if (hand.rospis) {
      credited[declarer] = -bid * mult;
      marks[declarer]!.push({ type: 'rospis', bid });
    } else {
      made = tricksOf(declarer) + marriagesSum(marriagesOf(declarer)) >= bid;
      credited[declarer] = (made ? bid : -bid) * mult;
      marks[declarer]!.push({ type: made ? 'bidMade' : 'bidFailed', bid });
    }

    // 5. Соперники. Игроку на бочке 0.
    for (const p of turn.active) {
      if (p === declarer || startOnBarrel.has(p)) continue;
      credited[p] = hand.rospis
        ? round5(bid / (turn.active.length === 2 ? 2 : 3)) * mult
        : round5(tricksOf(p)) * mult + marriagesSum(marriagesOf(p));
    }

    // 6. Раздающий на прикупе (вчетвером). Игроку на бочке 0.
    const sitter = turn.prikupSitter;
    if (sitter && hand.prikup && !startOnBarrel.has(sitter)) {
      const { points, marriage } = hand.prikup;
      credited[sitter] = round5(points) * mult + (marriage ? MARRIAGE_POINTS[marriage] : 0);
    }

    // 7. Болты (R2: не взял ни одной взятки). Раздающий на прикупе болт не получает.
    if (!hand.rospis) {
      for (const p of turn.active) {
        if (hand.inputs[p]?.tricks !== 0) continue;
        const s = status(p);
        s.bolts++;
        const penalty = s.bolts % BOLTS_PER_PENALTY === 0;
        if (penalty) credited[p]! -= PENALTY;
        marks[p]!.push({ type: 'bolt', count: s.bolts, penalty });
      }
    }

    // 8. Применение. 9.1–9.2: игроки на бочке считаются от 880.
    for (const p of seats) {
      const s = status(p);
      const delta = credited[p]!;
      if (!startOnBarrel.has(p)) {
        s.score += delta;
      } else if (p === declarer) {
        if (!made) {
          fall(p, BARREL_SCORE + delta, hand.rospis ? 'rospis' : 'failedBid', marks);
        } else if (BARREL_SCORE + delta >= WIN_SCORE) {
          // 11. Победа: сыграл ставку с бочки и набрал 1000.
          s.score = BARREL_SCORE + delta;
          s.onBarrel = false;
          marks[p]!.push(
            { type: 'barrel', attempt: s.barrelAttempts + 1, counted: true },
            { type: 'winner' },
          );
          winner = p;
        }
        // Сыграл ставку меньше 120: счёт остаётся 880, попытка расходуется ниже.
      } else if (delta < 0) {
        fall(p, BARREL_SCORE + delta, 'penalty', marks);
      }
    }
    if (winner) return finish();

    // 9.3–9.4. Посадка на бочку.
    const newcomers = seats.filter((p) => !status(p).onBarrel && status(p).score >= BARREL_SCORE);
    const holders = seats.filter((p) => status(p).onBarrel);
    for (const p of newcomers) {
      status(p).score = BARREL_SCORE;
      marks[p]!.push({ type: 'barrelSit' });
    }
    if (newcomers.length >= 2) {
      // Несколько сразу: −120 каждому из севших и прежнему игроку на бочке (R4).
      for (const p of newcomers) {
        fall(
          p,
          BARREL_PENALTY_SCORE,
          'collision',
          marks,
          newcomers.filter((q) => q !== p),
        );
      }
      for (const h of holders) fall(h, BARREL_PENALTY_SCORE, 'knocked', marks, newcomers);
    } else if (newcomers.length === 1) {
      for (const h of holders) fall(h, BARREL_PENALTY_SCORE, 'knocked', marks, newcomers);
      const s = status(newcomers[0]!);
      s.onBarrel = true;
      s.barrelAttempts = 0;
    }

    // 9.5. Попытка на бочке.
    for (const p of startOnBarrel) {
      if (status(p).onBarrel) spendAttempt(p, turn, marks);
    }

    // 10. Бульдозер.
    bulldoze(marks);
    return finish();
  }

  // ─── Бочка и бульдозер ───────────────────────────────────────────────────

  function fall(
    p: PlayerId,
    score: number,
    reason: BarrelFallReason,
    marks: Record<PlayerId, Mark[]>,
    by?: PlayerId[],
  ) {
    const s = status(p);
    s.score = score;
    s.onBarrel = false;
    s.barrelAttempts = 0;
    marks[p]!.push({ type: 'barrelFall', reason, ...(by ? { by } : {}) });
  }

  /** Расходует попытку на бочке; вчетвером кон на прикупе не считается. */
  function spendAttempt(p: PlayerId, turn: Turn, marks: Record<PlayerId, Mark[]>) {
    const s = status(p);
    if (p === turn.prikupSitter) {
      marks[p]!.push({ type: 'barrel', attempt: s.barrelAttempts, counted: false });
      return;
    }
    s.barrelAttempts++;
    marks[p]!.push({ type: 'barrel', attempt: s.barrelAttempts, counted: true });
    if (s.barrelAttempts >= BARREL_ATTEMPTS) fall(p, BARREL_PENALTY_SCORE, 'attempts', marks);
  }

  /** R3: проверяется после любого изменения счёта. */
  function bulldoze(marks: Record<PlayerId, Mark[]>) {
    for (const p of seats) {
      const s = status(p);
      if (!s.onBarrel && Math.abs(s.score) === BULLDOZER_SCORE) {
        marks[p]!.push({ type: 'bulldozer', from: s.score });
        s.score = 0;
      }
    }
  }

  // ─── Сборка строки ───────────────────────────────────────────────────────

  function snapshot(): Record<PlayerId, number> {
    return Object.fromEntries(seats.map((p) => [p, status(p).score]));
  }

  function emptyMarks(): Record<PlayerId, Mark[]> {
    return Object.fromEntries(seats.map((p) => [p, []]));
  }

  function zeros(): Record<PlayerId, number> {
    return Object.fromEntries(seats.map((p) => [p, 0]));
  }

  function buildRow(
    kind: Row['kind'],
    entryId: string,
    turn: Turn,
    hand: Row['hand'],
    before: Record<PlayerId, number>,
    marks: Record<PlayerId, Mark[]>,
    credited: Record<PlayerId, number>,
    inputs: Record<PlayerId, CellInput>,
    rowIssues: Issue[],
  ): Row {
    const cells: Record<PlayerId, Cell> = Object.fromEntries(
      seats.map((p) => [
        p,
        {
          total: status(p).score,
          delta: status(p).score - before[p]!,
          credited: credited[p]!,
          marks: marks[p]!,
          input: inputs[p] ?? null,
        },
      ]),
    );
    issues.push(...rowIssues);
    return {
      index: rows.length,
      entryId,
      kind,
      turn,
      hand,
      dealMarks,
      cells,
      issues: rowIssues,
    };
  }
}

function assertSetup({ seats, firstDealer }: GameSetup) {
  if (seats.length < 2 || seats.length > 4) throw new Error('В партии 2–4 игрока');
  if (new Set(seats).size !== seats.length) throw new Error('Игроки за столом повторяются');
  if (!seats.includes(firstDealer)) throw new Error('Первый раздающий не за столом');
}
