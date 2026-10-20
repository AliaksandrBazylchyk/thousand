import type {
  GameDetails,
  Me,
  PlayerId,
  PlayerRef,
  RoomJoinView,
  RoomListItem,
  RoomStatsView,
  RoomView,
  TvRoomView,
} from '@thousand/core';

/** Ошибка API с кодом ответа: 401 — нужно войти, 403 — не участник комнаты. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** Сессия закончилась на сервере — приложение показывает экран входа. */
export const UNAUTHORIZED_EVENT = 'thousand:unauthorized';

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) {
    if (res.status === 401 && !url.startsWith('/api/auth/')) {
      window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    }
    throw new ApiError(data.error ?? `Ошибка сервера (${res.status})`, res.status);
  }
  return data as T;
}

const room = (code: string) => `/api/rooms/${encodeURIComponent(code)}`;

export const api = {
  me: () => request<Me>('GET', '/api/me'),
  login: (login: string, password: string) =>
    request<Me>('POST', '/api/auth/login', { login, password }),
  register: (login: string, password: string, name: string) =>
    request<Me>('POST', '/api/auth/register', { login, password, name }),
  logout: () => request<{ ok: true }>('POST', '/api/auth/logout', {}),
  updateName: (name: string) => request<Me>('PATCH', '/api/me', { name }),
  setAvatar: (image: string | null) => request<Me>('PUT', '/api/me/avatar', { image }),
  changePassword: (current: string, next: string) =>
    request<{ ok: true }>('PUT', '/api/me/password', { current, next }),

  listRooms: () => request<RoomListItem[]>('GET', '/api/rooms'),
  createRoom: (name: string, alias: string) =>
    request<{ id: string; name: string; code: string }>('POST', '/api/rooms', { name, alias }),
  getRoom: (code: string) => request<RoomView>('GET', room(code)),
  getJoin: (code: string) => request<RoomJoinView>('GET', `${room(code)}/join`),
  join: (code: string, req: { alias?: string; claimPlayerId?: string }) =>
    request<{ code: string }>('POST', `${room(code)}/join`, req),
  setAlias: (code: string, alias: string) =>
    request<PlayerRef>('PUT', `${room(code)}/alias`, { alias }),
  resetTvKey: (code: string) => request<{ tvKey: string }>('POST', `${room(code)}/tv-key`, {}),
  createGame: (code: string, seats: PlayerId[], firstDealerId: PlayerId, hostId: PlayerId) =>
    request<{ id: string }>('POST', `${room(code)}/games`, { seats, firstDealerId, hostId }),
  getRoomStats: (code: string) => request<RoomStatsView>('GET', `${room(code)}/stats`),
  getDetails: (gameId: string) =>
    request<GameDetails>('GET', `/api/games/${encodeURIComponent(gameId)}/details`),

  getTvRoom: (key: string) => request<TvRoomView>('GET', `/api/tv/${encodeURIComponent(key)}`),
};
