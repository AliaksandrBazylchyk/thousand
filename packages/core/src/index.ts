// Ядро подсчёта очков «Тысячи». Без зависимостей, общее для сервера и клиента.
// Правила: ТЗ разделы 2–3, решения по спорным местам: docs/RULES-DECISIONS.md.

export * from './types';
export type * from './protocol';
export * from './rules';
export { validateHand } from './validate';
export { replay } from './replay';
