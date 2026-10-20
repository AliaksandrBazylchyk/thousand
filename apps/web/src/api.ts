import type {
  GameDetails,
  PlayerId,
  PlayerRef,
  RoomListItem,
  RoomStatsView,
  RoomView,
} from '@thousand/core';

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(data.error ?? `Ошибка сервера (${res.status})`);
  return data as T;
}

export const api = {
  createRoom: (name: string) =>
    request<{ id: string; name: string; code: string }>('POST', '/api/rooms', { name }),
  listRooms: () => request<RoomListItem[]>('GET', '/api/rooms'),
  getRoom: (code: string) => request<RoomView>('GET', `/api/rooms/${encodeURIComponent(code)}`),
  ensurePlayer: (code: string, name: string) =>
    request<PlayerRef>('POST', `/api/rooms/${encodeURIComponent(code)}/players`, { name }),
  createGame: (code: string, seats: PlayerId[], firstDealerId: PlayerId, hostId: PlayerId) =>
    request<{ id: string }>('POST', `/api/rooms/${encodeURIComponent(code)}/games`, {
      seats,
      firstDealerId,
      hostId,
    }),
  getDetails: (gameId: string) =>
    request<GameDetails>('GET', `/api/games/${encodeURIComponent(gameId)}/details`),
  getRoomStats: (code: string) =>
    request<RoomStatsView>('GET', `/api/rooms/${encodeURIComponent(code)}/stats`),
};
