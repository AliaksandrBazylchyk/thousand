import { randomBytes, randomInt, randomUUID } from 'node:crypto';

export const newId = () => randomUUID();

/** Секрет ссылки для ТВ: подобрать перебором невозможно. */
export const newTvKey = () => randomBytes(12).toString('hex');

const CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

/** Короткий код комнаты для ссылки, без похожих символов (0/o, 1/l/i). */
export function newRoomCode(length = 6): string {
  let code = '';
  for (let i = 0; i < length; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

/** Ключ имени для уникальности в комнате: без лишних пробелов, без регистра, ё = е. */
export function nameKey(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase().replace(/ё/g, 'е');
}
