// Текстовые обозначения символов таблицы (ТЗ 7.2). На этапе 3 их заменят SVG-иконки.

import type { DealMark, Marriage, Mark, Suit } from '@thousand/core';

export const MARRIAGE_SYMBOL: Record<Marriage, string> = {
  spades: '♠',
  clubs: '♣',
  diamonds: '♦',
  hearts: '♥',
  aces: '4Т',
};

export const SUITS: Suit[] = ['spades', 'clubs', 'diamonds', 'hearts'];
export const MARRIAGES: Marriage[] = [...SUITS, 'aces'];

/** Смысловой цвет символа. */
export type Tone = 'penalty' | 'barrel' | 'win' | 'good' | 'muted';

export interface Symbol {
  text: string;
  tone?: Tone;
  title: string;
}

export function markSymbol(m: Mark): Symbol | null {
  switch (m.type) {
    case 'bidMade':
      return { text: `▲${m.bid}`, tone: 'good', title: `Заказ ${m.bid} сыгран` };
    case 'bidFailed':
      return { text: `▼${m.bid}`, tone: 'penalty', title: `Заказ ${m.bid} не сыгран` };
    case 'rospis':
      return { text: `Р${m.bid}`, tone: 'penalty', title: `Роспись ${m.bid}` };
    case 'dark':
      return { text: '◐', title: 'Тёмная' };
    case 'goldenThousand':
      return { text: '★', tone: 'win', title: 'Золотая тысяча' };
    case 'winner':
      return { text: '♔', tone: 'win', title: 'Победитель партии' };
    case 'bolt':
      return m.penalty
        ? { text: '•−120', tone: 'penalty', title: `Третий болт (${m.count})` }
        : { text: '•', tone: 'muted', title: `Болт (${m.count})` };
    case 'prikup':
      return { text: 'П', tone: 'muted', title: 'Сидит на прикупе' };
    case 'marriage':
      return null;
    case 'barrelSit':
      return { text: '▣', tone: 'barrel', title: 'Сел на бочку' };
    case 'barrel':
      return m.counted
        ? { text: `▣${m.attempt}`, tone: 'barrel', title: `На бочке, кон ${m.attempt}` }
        : { text: '▣', tone: 'barrel', title: 'На бочке, кон на прикупе не считается' };
    case 'barrelFall':
      return { text: '↓', tone: 'penalty', title: 'Падение с бочки' };
    case 'bulldozer':
      return { text: '⌀', tone: 'penalty', title: `Бульдозер (${m.from} → 0)` };
    case 'dealPenalty':
      return {
        nine: { text: '✂−120', tone: 'penalty' as const, title: 'Девятка внизу 3 раза подряд' },
        redeal: { text: '↻−120', tone: 'penalty' as const, title: 'Третья пересдача подряд' },
        misdeal: { text: '✕−120', tone: 'penalty' as const, title: 'Неправильная раздача' },
      }[m.kind];
  }
}

export function dealMarkSymbol(d: DealMark): Symbol {
  switch (d.type) {
    case 'nineAtBottom':
      return { text: '✂9', tone: 'muted', title: `Девятка внизу при сдвиге (${d.count})` };
    case 'misdeal':
      return { text: '✕', tone: 'penalty', title: 'Неправильная раздача' };
    case 'redeal':
      return {
        text: d.reason === 'fourJacks' ? '↻В' : d.reason === 'threeNines' ? '↻3×9' : '↻9',
        tone: 'muted',
        title: `Пересдача (${d.count})`,
      };
  }
}

export const REDEAL_REASON_LABEL = {
  fourNines: '4 девятки',
  fourJacks: '4 вальта',
  threeNines: '3 девятки у игрока на 100',
} as const;
