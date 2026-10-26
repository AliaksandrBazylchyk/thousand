// Экспорт партии (ТЗ 10, этап 5): JSON со всеми данными и CSV-таблица «как на бумаге».

import {
  dealMarkText,
  markText,
  type GameDetails,
  type GameView,
  type PlayerId,
} from '@thousand/core';

const STATUS_TEXT = { active: 'идёт', finished: 'завершена', cancelled: 'отменена' } as const;

export function exportJson(view: GameView, details: GameDetails) {
  const nameOf = (id: PlayerId | null) => view.seats.find((s) => s.id === id)?.name ?? null;
  return {
    exportedAt: new Date().toISOString(),
    room: { name: view.roomName, code: view.roomCode },
    game: {
      id: view.id,
      status: view.status,
      startedAt: new Date(view.startedAt).toISOString(),
      finishedAt: view.finishedAt ? new Date(view.finishedAt).toISOString() : null,
      winner: nameOf(view.winnerId),
      host: nameOf(view.hostId),
      firstDealer: nameOf(view.firstDealerId),
    },
    players: view.seats.map((s, seat) => ({
      id: s.id,
      name: s.name,
      seat: seat + 1,
      ...view.state.players[s.id],
    })),
    table: view.state.rows.map((r) => ({
      hand: r.number,
      dealer: nameOf(r.turn.dealer),
      dealEvents: r.dealMarks.map(dealMarkText),
      declarer: r.hand ? nameOf(r.hand.declarer) : null,
      bid: r.hand?.bid ?? null,
      dark: r.hand?.dark ?? null,
      rospis: r.hand?.rospis ?? null,
      goldenThousand: r.hand?.goldenThousand ?? null,
      cells: Object.fromEntries(
        view.seats.map((s) => {
          const c = r.cells[s.id]!;
          return [
            s.name,
            { total: c.total, delta: c.delta, input: c.input, symbols: c.marks.map(markText) },
          ];
        }),
      ),
    })),
    hands: details.hands,
    dealEvents: details.events,
    editLog: details.log,
  };
}

const csvCell = (v: string | number | null | undefined) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** CSV для Excel: разделитель «;», BOM для кириллицы. */
export function exportCsv(view: GameView): string {
  const nameOf = (id: PlayerId) => view.seats.find((s) => s.id === id)?.name ?? '?';
  const header = [
    '№',
    'Раздаёт',
    'События раздачи',
    'Заказал',
    'Ставка',
    ...view.seats.flatMap((s) => [s.name, `${s.name}: кон`, `${s.name}: символы`]),
  ];
  const lines = view.state.rows.map((r) => [
    r.number,
    nameOf(r.turn.dealer),
    r.dealMarks.map(dealMarkText).join(' '),
    r.hand ? nameOf(r.hand.declarer) : '',
    r.hand
      ? `${r.hand.bid}${r.hand.dark === 'played' ? ' ◐' : ''}${r.hand.rospis ? ' Р' : ''}`
      : '',
    ...view.seats.flatMap((s) => {
      const c = r.cells[s.id]!;
      return [c.total, c.delta, c.marks.map(markText).join(' ')];
    }),
  ]);
  const meta = [
    [`Комната: ${view.roomName}`],
    [`Партия от ${new Date(view.startedAt).toLocaleString('ru')}, ${STATUS_TEXT[view.status]}`],
    view.winnerId ? [`Победитель: ${nameOf(view.winnerId)}`] : [],
    [],
  ];
  return (
    '﻿' + [...meta, header, ...lines].map((row) => row.map(csvCell).join(';')).join('\r\n') + '\r\n'
  );
}

export function exportFileName(view: GameView, ext: string): string {
  const date = new Date(view.startedAt).toISOString().slice(0, 10);
  return `thousand-${view.roomCode}-${date}-${view.id.slice(0, 8)}.${ext}`;
}
