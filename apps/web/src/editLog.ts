// Человекочитаемое описание записей журнала правок (ТЗ 4: «что было, что стало»).

import type { DarkStatus, EditLogEntry, Marriage, PlayerId, Suit } from '@thousand/core';
import { MARRIAGE_SYMBOL, REDEAL_REASON_LABEL } from './symbols';

interface InputSnap {
  playerId: PlayerId;
  tricks: number | null;
  marriages: Marriage[];
  prikupPoints: number | null;
  prikupMarriage: Suit | null;
}

interface HandSnap {
  declarerId: PlayerId;
  bid: number;
  dark: DarkStatus;
  rospis: boolean;
  goldenThousand: boolean;
  inputs?: InputSnap[];
}

interface EventSnap {
  type: 'nineAtBottom' | 'jackAtBottom' | 'redeal' | 'misdeal' | 'violation';
  reason: keyof typeof REDEAL_REASON_LABEL | null;
}

const DARK_LABEL: Record<DarkStatus, string> = {
  none: 'без тёмной',
  played: 'в тёмную',
  overbid: 'тёмную перебили',
};

export function inputText(i: Partial<InputSnap> | null | undefined): string {
  if (!i) return '—';
  if (i.prikupPoints != null) {
    return `прикуп ${i.prikupPoints}${i.prikupMarriage ? ' + ' + MARRIAGE_SYMBOL[i.prikupMarriage] : ''}`;
  }
  if (i.tricks == null) return '—';
  const m = i.marriages?.length ? ' + ' + i.marriages.map((x) => MARRIAGE_SYMBOL[x]).join(' ') : '';
  return `${i.tricks}${m}`;
}

function eventText(e: EventSnap): string {
  if (e.type === 'nineAtBottom') return 'девятка внизу при сдвиге';
  if (e.type === 'jackAtBottom') return 'валет внизу при сдвиге';
  if (e.type === 'misdeal') return 'неправильная раздача';
  if (e.type === 'violation') return 'нарушение правил: −120, кон прерван';
  return `пересдача: ${e.reason ? REDEAL_REASON_LABEL[e.reason] : 'без причины'}`;
}

function handDiff(a: HandSnap, b: HandSnap, nameOf: (id: PlayerId) => string): string[] {
  const out: string[] = [];
  if (a.declarerId !== b.declarerId)
    out.push(`заказал: ${nameOf(a.declarerId)} → ${nameOf(b.declarerId)}`);
  if (a.bid !== b.bid) out.push(`ставка: ${a.bid} → ${b.bid}`);
  if (a.dark !== b.dark) out.push(`тёмная: ${DARK_LABEL[a.dark]} → ${DARK_LABEL[b.dark]}`);
  if (a.rospis !== b.rospis) out.push(b.rospis ? 'роспись' : 'роспись отменена');
  if (a.goldenThousand !== b.goldenThousand)
    out.push(b.goldenThousand ? 'золотая тысяча' : 'золотая тысяча отменена');
  if (a.inputs && b.inputs) {
    const ids = new Set([...a.inputs, ...b.inputs].map((i) => i.playerId));
    for (const id of ids) {
      const x = inputText(a.inputs.find((i) => i.playerId === id));
      const y = inputText(b.inputs.find((i) => i.playerId === id));
      if (x !== y) out.push(`${nameOf(id)}: ${x} → ${y}`);
    }
  }
  return out;
}

/** Описание одной записи журнала: заголовок и список изменений. */
export function describeLog(
  e: EditLogEntry,
  nameOf: (id: PlayerId) => string,
): { title: string; changes: string[] } {
  const before = e.before as Record<string, unknown> | null;
  const after = e.after as Record<string, unknown> | null;
  switch (e.action) {
    case 'startHand': {
      const h = after as unknown as HandSnap;
      return {
        title: 'Итог торгов',
        changes: [`${nameOf(h.declarerId)}: ${h.bid}${h.dark === 'played' ? ' в тёмную' : ''}`],
      };
    }
    case 'updateHand':
      return {
        title: 'Изменена ставка',
        changes: handDiff(before as unknown as HandSnap, after as unknown as HandSnap, nameOf),
      };
    case 'submitInput': {
      const a = after as unknown as InputSnap;
      return {
        title: `Ввод: ${nameOf(a.playerId)}`,
        changes: [
          before ? `${inputText(before as unknown as InputSnap)} → ${inputText(a)}` : inputText(a),
        ],
      };
    }
    case 'confirmHand':
      return { title: 'Кон подтверждён', changes: [] };
    case 'cancelHand':
      return { title: 'Кон отменён', changes: [] };
    case 'editHand':
      return {
        title: 'Правка кона',
        changes: handDiff(before as unknown as HandSnap, after as unknown as HandSnap, nameOf),
      };
    case 'dealEvent':
      return { title: 'Событие раздачи', changes: [eventText(after as unknown as EventSnap)] };
    case 'deleteDealEvent':
      return {
        title: 'Событие раздачи удалено',
        changes: [eventText(before as unknown as EventSnap)],
      };
    case 'setHost':
      return {
        title: 'Передана роль ведущего',
        changes: [`${nameOf(String(e.before))} → ${nameOf(String(e.after))}`],
      };
    case 'finishGame':
      return { title: 'Партия завершена', changes: [] };
    case 'cancelGame':
      return { title: 'Партия отменена', changes: [] };
    default:
      return { title: e.action, changes: [] };
  }
}

export const timeText = (ms: number) =>
  new Date(ms).toLocaleString('ru', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
