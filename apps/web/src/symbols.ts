// Символы таблицы (ТЗ 7.2). Иконка — SVG-файл в public/icons/<icon>.svg, подменяется без правки кода.
// Подпись рядом с иконкой (ставка, номер попытки, −120) выводит приложение.

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

export type IconName =
  | 'bid-made'
  | 'bid-failed'
  | 'rospis'
  | 'dark'
  | 'bolt'
  | 'prikup'
  | 'barrel'
  | 'barrel-fall'
  | 'bulldozer'
  | 'redeal'
  | 'nine-bottom'
  | 'misdeal'
  | 'golden-thousand'
  | 'winner';

export const iconUrl = (icon: IconName) => `/icons/${icon}.svg`;

/** Смысловой цвет подписи. */
export type Tone = 'penalty' | 'barrel' | 'win' | 'good' | 'muted';

export interface Symbol {
  icon: IconName;
  /** Подпись рядом с иконкой. */
  label?: string;
  /** Текстовое обозначение целиком — для alt и копирования. */
  text: string;
  tone?: Tone;
  title: string;
}

const PENALTY_LABEL = '−120';

export function markSymbol(m: Mark): Symbol | null {
  switch (m.type) {
    case 'bidMade':
      return sym('bid-made', `${m.bid}`, '▲', 'good', `Заказ ${m.bid} сыгран`);
    case 'bidFailed':
      return sym('bid-failed', `${m.bid}`, '▼', 'penalty', `Заказ ${m.bid} не сыгран`);
    case 'rospis':
      return sym('rospis', `${m.bid}`, 'Р', 'penalty', `Роспись ${m.bid}`);
    case 'dark':
      return sym('dark', undefined, '◐', undefined, 'Тёмная');
    case 'goldenThousand':
      return sym('golden-thousand', undefined, '★', 'win', 'Золотая тысяча');
    case 'winner':
      return sym('winner', undefined, '♔', 'win', 'Победитель партии');
    case 'bolt':
      return m.penalty
        ? sym('bolt', PENALTY_LABEL, '•', 'penalty', `Третий болт (всего ${m.count})`)
        : sym('bolt', undefined, '•', 'muted', `Болт (всего ${m.count})`);
    case 'prikup':
      return sym('prikup', undefined, 'П', 'muted', 'Сидит на прикупе');
    case 'marriage':
      return null;
    case 'barrelSit':
      return sym('barrel', undefined, '▣', 'barrel', 'Сел на бочку');
    case 'barrel':
      return m.counted
        ? sym('barrel', `${m.attempt}`, '▣', 'barrel', `На бочке, кон ${m.attempt}`)
        : sym('barrel', undefined, '▣', 'barrel', 'На бочке, кон на прикупе не считается');
    case 'barrelFall':
      return sym('barrel-fall', undefined, '↓', 'penalty', FALL_TITLE[m.reason]);
    case 'bulldozer':
      return sym('bulldozer', undefined, '⌀', 'penalty', `Бульдозер: ${m.from} → 0`);
    case 'dealPenalty':
      switch (m.kind) {
        case 'nine':
          return sym('nine-bottom', PENALTY_LABEL, '✂', 'penalty', 'Девятка внизу 3 раза подряд');
        case 'redeal':
          return sym('redeal', PENALTY_LABEL, '↻', 'penalty', 'Третья пересдача подряд');
        case 'misdeal':
          return sym('misdeal', PENALTY_LABEL, '✕', 'penalty', 'Неправильная раздача');
      }
  }
}

const FALL_TITLE: Record<Extract<Mark, { type: 'barrelFall' }>['reason'], string> = {
  failedBid: 'Не сыграл ставку на бочке',
  rospis: 'Расписал на бочке',
  penalty: 'Штраф на бочке',
  attempts: 'Не выиграл за 3 кона на бочке',
  knocked: 'Сбит с бочки',
  collision: 'Сели на бочку одновременно',
};

export function dealMarkSymbol(d: DealMark): Symbol {
  switch (d.type) {
    case 'nineAtBottom':
      return sym('nine-bottom', '9', '✂', 'muted', `Девятка внизу при сдвиге (${d.count}-я)`);
    case 'misdeal':
      return sym('misdeal', undefined, '✕', 'penalty', 'Неправильная раздача');
    case 'redeal': {
      const label = d.reason === 'fourJacks' ? 'В' : d.reason === 'threeNines' ? '3×9' : '9';
      const reason = d.reason ? REDEAL_REASON_LABEL[d.reason] : 'причина не указана';
      return sym('redeal', label, '↻', 'muted', `Пересдача: ${reason} (${d.count}-я подряд)`);
    }
  }
}

function sym(
  icon: IconName,
  label: string | undefined,
  glyph: string,
  tone: Tone | undefined,
  title: string,
): Symbol {
  return {
    icon,
    text: glyph + (label ?? ''),
    title,
    ...(label ? { label } : {}),
    ...(tone ? { tone } : {}),
  };
}

export const REDEAL_REASON_LABEL = {
  fourNines: '4 девятки',
  fourJacks: '4 вальта',
  threeNines: '3 девятки у игрока на 100',
} as const;

/** Легенда справа от таблицы на ТВ (ТЗ 7.2). */
export const LEGEND: { symbols: Symbol[]; meaning: string }[] = [
  { symbols: [sym('bid-made', '120', '▲', 'good', '')], meaning: 'Заказ сыгран' },
  { symbols: [sym('bid-failed', '120', '▼', 'penalty', '')], meaning: 'Заказ не сыгран' },
  { symbols: [sym('rospis', '120', 'Р', 'penalty', '')], meaning: 'Роспись' },
  { symbols: [sym('dark', undefined, '◐', undefined, '')], meaning: 'Тёмная' },
  {
    symbols: [
      sym('bolt', undefined, '•', 'muted', ''),
      sym('bolt', PENALTY_LABEL, '•', 'penalty', ''),
    ],
    meaning: 'Болт, третий болт',
  },
  { symbols: [sym('barrel', '1', '▣', 'barrel', '')], meaning: 'На бочке, номер кона' },
  { symbols: [sym('barrel-fall', undefined, '↓', 'penalty', '')], meaning: 'Падение с бочки' },
  { symbols: [sym('bulldozer', undefined, '⌀', 'penalty', '')], meaning: 'Бульдозер' },
  {
    symbols: [
      sym('redeal', '9', '↻', 'muted', ''),
      sym('redeal', 'В', '↻', 'muted', ''),
      sym('redeal', '3×9', '↻', 'muted', ''),
    ],
    meaning: 'Пересдача: 4 девятки, 4 вальта, 3 девятки',
  },
  { symbols: [sym('nine-bottom', '9', '✂', 'muted', '')], meaning: 'Девятка внизу при сдвиге' },
  {
    symbols: [
      sym('redeal', PENALTY_LABEL, '↻', 'penalty', ''),
      sym('nine-bottom', PENALTY_LABEL, '✂', 'penalty', ''),
    ],
    meaning: 'Третья пересдача, третья девятка',
  },
  { symbols: [sym('misdeal', PENALTY_LABEL, '✕', 'penalty', '')], meaning: 'Неправильная раздача' },
  { symbols: [sym('prikup', undefined, 'П', 'muted', '')], meaning: 'На прикупе' },
  { symbols: [sym('golden-thousand', undefined, '★', 'win', '')], meaning: 'Золотая тысяча' },
  { symbols: [sym('winner', undefined, '♔', 'win', '')], meaning: 'Победитель' },
];
