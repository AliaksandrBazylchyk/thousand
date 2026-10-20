// Устройство запоминает выбранного игрока для каждой комнаты (ТЗ 5.2, 9.1).

import type { PlayerRef } from '@thousand/core';

const playerKey = (roomCode: string) => `thousand:player:${roomCode}`;

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Хранилище недоступно (приватный режим) — просто не запоминаем.
  }
}

export const getStoredPlayer = (roomCode: string) => read<PlayerRef>(playerKey(roomCode));
export const setStoredPlayer = (roomCode: string, player: PlayerRef | null) =>
  write(playerKey(roomCode), player);
