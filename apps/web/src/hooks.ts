import { useCallback, useEffect, useState } from 'react';
import type { GameAction, GameView, RoomView, TvRoomView } from '@thousand/core';
import { api, ApiError } from './api';
import { socket } from './socket';

/**
 * Подписка на партию: полный снимок при входе и переподключении, затем обновления.
 * Участник подписывается по сессии, ТВ — по секретному ключу комнаты.
 */
export function useGame(gameId: string, tvKey?: string) {
  const [view, setView] = useState<GameView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const join = () =>
      socket.emit('game:join', { gameId, tvKey }, (res) => {
        if (res.ok) {
          setView(res.view);
          setError(null);
        } else setError(res.error);
      });
    const onState = (next: GameView) => {
      if (next.id === gameId) setView(next);
    };
    socket.on('game:state', onState);
    socket.on('connect', join);
    if (socket.connected) join();
    return () => {
      socket.off('game:state', onState);
      socket.off('connect', join);
      socket.emit('game:leave', gameId);
    };
  }, [gameId, tvKey]);

  return { view, error };
}

/** Отправка действия партии от имени своего игрока; возвращает текст ошибки или null. */
export function useAct(gameId: string) {
  return useCallback(
    (action: GameAction) =>
      new Promise<string | null>((resolve) => {
        socket.emit('game:action', { gameId, action }, (res) => resolve(res.ok ? null : res.error));
      }),
    [gameId],
  );
}

/** Обновления комнаты по сокету: перезагрузка при любом изменении. */
function useRoomChanges(roomId: string | undefined, reload: () => void, tvKey?: string) {
  useEffect(() => {
    if (!roomId) return;
    const join = () => socket.emit('room:join', { roomId, tvKey });
    const onChanged = (changed: string) => {
      if (changed === roomId) reload();
    };
    socket.on('room:changed', onChanged);
    socket.on('connect', join);
    if (socket.connected) join();
    return () => {
      socket.off('room:changed', onChanged);
      socket.off('connect', join);
    };
  }, [roomId, reload, tvKey]);
}

/** Комната для участника. status 403 — вы ещё не участник (нужен вход в комнату). */
export function useRoom(code: string) {
  const [room, setRoom] = useState<RoomView | null>(null);
  const [error, setError] = useState<{ message: string; status: number } | null>(null);

  const reload = useCallback(() => {
    api
      .getRoom(code)
      .then((r) => {
        setRoom(r);
        setError(null);
      })
      .catch((e: Error) => {
        setRoom(null);
        setError({ message: e.message, status: e instanceof ApiError ? e.status : 0 });
      });
  }, [code]);

  useEffect(() => {
    reload();
  }, [reload]);
  useRoomChanges(room?.id, reload);

  return { room, error, reload };
}

/** Комната для ТВ по секретной ссылке. */
export function useTvRoom(key: string) {
  const [room, setRoom] = useState<TvRoomView | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    api
      .getTvRoom(key)
      .then((r) => {
        setRoom(r);
        setError(null);
      })
      .catch((e: Error) => setError(e.message));
  }, [key]);

  useEffect(() => {
    reload();
  }, [reload]);
  useRoomChanges(room?.id, reload, key);

  return { room, error };
}
