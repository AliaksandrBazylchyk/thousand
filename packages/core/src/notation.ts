// Текстовые обозначения символов таблицы (ТЗ 7.2) — для экспорта и текстового режима.

import type { DealMark, Marriage, Mark } from './types';

export const MARRIAGE_TEXT: Record<Marriage, string> = {
  spades: '♠',
  clubs: '♣',
  diamonds: '♦',
  hearts: '♥',
  aces: '4Т',
};

export function markText(m: Mark): string {
  switch (m.type) {
    case 'bidMade':
      return `▲${m.bid}`;
    case 'bidFailed':
      return `▼${m.bid}`;
    case 'rospis':
      return `Р${m.bid}`;
    case 'dark':
      return '◐';
    case 'goldenThousand':
      return '★';
    case 'winner':
      return '♔';
    case 'bolt':
      return m.penalty ? '•−120' : '•';
    case 'prikup':
      return 'П';
    case 'marriage':
      return MARRIAGE_TEXT[m.marriage];
    case 'barrelSit':
      return '▣';
    case 'barrel':
      return m.counted ? `▣${m.attempt}` : '▣';
    case 'barrelFall':
      return '↓';
    case 'bulldozer':
      return '⌀';
    case 'dealPenalty':
      return { nine: '✂−120', redeal: '↻−120', misdeal: '✕−120' }[m.kind];
  }
}

export function dealMarkText(d: DealMark): string {
  switch (d.type) {
    case 'nineAtBottom':
      return '✂9';
    case 'misdeal':
      return '✕';
    case 'redeal':
      return d.reason === 'fourJacks' ? '↻В' : d.reason === 'threeNines' ? '↻3×9' : '↻9';
  }
}
