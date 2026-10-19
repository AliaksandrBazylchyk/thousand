import { BID_STEP, CARD_POINTS_TOTAL, MIN_BID, MIN_DARK_BID, MIN_DARK_OVERBID } from './rules';
import type { HandEntry, Issue, Marriage, PlayerId, PlayerStatus, Turn } from './types';

/**
 * Проверка кона относительно текущей очерёдности.
 * error — кон нельзя подтвердить, warning — ведущий видит предупреждение, но может подтвердить.
 */
export function validateHand(
  hand: HandEntry,
  turn: Turn,
  players: Readonly<Record<PlayerId, PlayerStatus>>,
): Issue[] {
  const issues: Issue[] = [];
  const add = (level: Issue['level'], code: Issue['code'], message: string, playerId?: PlayerId) =>
    issues.push({ level, code, entryId: hand.id, message, ...(playerId ? { playerId } : {}) });

  if (!(hand.declarer in players)) {
    add('error', 'unknownPlayer', 'Заказавший не участвует в партии', hand.declarer);
    return issues;
  }
  if (!turn.active.includes(hand.declarer)) {
    add('error', 'declarerNotActive', 'Раздающий вчетвером не может заказывать', hand.declarer);
  }

  if (!Number.isInteger(hand.bid) || hand.bid < MIN_BID || hand.bid % BID_STEP !== 0) {
    add('error', 'badBid', `Ставка должна быть от ${MIN_BID} с шагом ${BID_STEP}`);
  }
  if (hand.dark === 'played') {
    if (hand.declarer !== turn.onHundred) {
      add('error', 'darkNotOnHundred', 'В тёмную играет только игрок на 100', hand.declarer);
    }
    if (hand.bid < MIN_DARK_BID) {
      add('error', 'darkBidTooLow', `В тёмную ставка не меньше ${MIN_DARK_BID}`);
    }
  }
  if (hand.dark === 'overbid' && hand.bid < MIN_DARK_OVERBID) {
    add('error', 'darkOverbidTooLow', `Тёмную перебивают ставкой от ${MIN_DARK_OVERBID}`);
  }
  if (hand.dark !== 'none' && players[turn.onHundred]?.onBarrel) {
    add('error', 'darkOnBarrel', 'Игрок на бочке не может играть в тёмную', turn.onHundred);
  }

  if (hand.goldenThousand) return issues;

  if (turn.prikupSitter && !hand.prikup) {
    add('error', 'missingPrikup', 'Нет очков прикупа у раздающего', turn.prikupSitter);
  }
  if (hand.prikup && !isValidPoints(hand.prikup.points)) {
    add('error', 'badTricks', 'Очки прикупа вне диапазона 0–120', turn.prikupSitter ?? undefined);
  }

  if (hand.rospis) return issues;

  let trickSum = 0;
  const seen = new Map<Marriage, PlayerId>();
  for (const p of turn.active) {
    const input = hand.inputs[p];
    if (!input) {
      add('error', 'missingInput', 'Нет ввода очков', p);
      continue;
    }
    if (!isValidPoints(input.tricks)) {
      add('error', 'badTricks', 'Очки взяток вне диапазона 0–120', p);
    }
    trickSum += input.tricks;
    if (input.tricks === 0 && input.marriages.length > 0) {
      add('warning', 'marriageWithoutTricks', 'Марьяж без взятки объявить нельзя', p);
    }
    for (const m of input.marriages) {
      if (seen.has(m)) add('warning', 'duplicateMarriage', 'Этот марьяж уже отмечен', p);
      seen.set(m, p);
    }
  }
  if (trickSum !== CARD_POINTS_TOTAL) {
    add('warning', 'trickSum', `Сумма взяток ${trickSum}, а должна быть ${CARD_POINTS_TOTAL}`);
  }
  return issues;
}

function isValidPoints(points: number): boolean {
  return Number.isInteger(points) && points >= 0 && points <= CARD_POINTS_TOTAL;
}
