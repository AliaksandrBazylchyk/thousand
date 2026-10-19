import { useCallback, useEffect, useState } from 'react';
import type { GameAction, GameView, PlayerRef, RoomView } from '@thousand/core';
import { api } from './api';
import { getStoredPlayer, setStoredPlayer } from './identity';
import { socket } from './socket';

/** Подписка на партию: полный снимок при входе и переподключении, затем обновления. */
export function useGame(gameId: string) {
  const [view, setView] = useState<GameView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const join = () =>
      socket.emit('game:join', gameId, (res) => {
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
  }, [gameId]);

  return { view, error };
}

/** Отправка действия партии; возвращает текст ошибки или null. */
export function useAct(gameId: string, actorId: string | null) {
  return useCallback(
    (action: GameAction) =>
      new Promise<string | null>((resolve) => {
        if (!actorId) return resolve('Сначала выберите себя в комнате');
        socket.emit('game:action', { gameId, actorId, action }, (res) =>
          resolve(res.ok ? null : res.error),
        );
      }),
    [gameId, actorId],
  );
}

export function useRoom(code: string) {
  const [room, setRoom] = useState<RoomView | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    api
      .getRoom(code)
      .then((r) => {
        setRoom(r);
        setError(null);
      })
      .catch((e: Error) => setError(e.message));
  }, [code]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    if (!room) return;
    const join = () => socket.emit('room:join', room.id);
    const onChanged = (roomId: string) => {
      if (roomId === room.id) reload();
    };
    socket.on('room:changed', onChanged);
    socket.on('connect', join);
    if (socket.connected) join();
    return () => {
      socket.off('room:changed', onChanged);
      socket.off('connect', join);
    };
  }, [room?.id, reload]); // eslint-disable-line react-hooks/exhaustive-deps

  return { room, error, reload };
}

/** Игрок, запомненный устройством для комнаты. */
export function useMe(roomCode: string) {
  const [me, setMeState] = useState<PlayerRef | null>(() => getStoredPlayer(roomCode));
  const setMe = useCallback(
    (player: PlayerRef | null) => {
      setStoredPlayer(roomCode, player);
      setMeState(player);
    },
    [roomCode],
  );
  return [me, setMe] as const;
}
