/** Ошибка, которую можно показать пользователю (400). */
export class GameError extends Error {}

/** Ошибка доступа: 401 — нужно войти, 403 — нет прав, 404 — не найдено. */
export class AccessError extends GameError {
  constructor(
    message: string,
    readonly status: 401 | 403 | 404,
  ) {
    super(message);
  }
}
