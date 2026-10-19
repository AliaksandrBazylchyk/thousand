// Ядро подсчёта очков «Тысячи». Без зависимостей, общее для сервера и клиента.
// Правила: ТЗ разделы 2–3, решения по спорным местам: docs/RULES-DECISIONS.md.

export const CARD_POINTS_TOTAL = 120;

export const MARRIAGE_POINTS = {
  spades: 40,
  clubs: 60,
  diamonds: 80,
  hearts: 100,
  aces: 200,
} as const;

export type Marriage = keyof typeof MARRIAGE_POINTS;
