// Типы обмена между сервером и клиентом (REST и Socket.IO). Только типы, без кода.

import type {
  DarkStatus,
  DealEventType,
  GameState,
  Issue,
  Marriage,
  PlayerId,
  RedealReason,
  Row,
  Suit,
} from './types';

export type GameStatus = 'active' | 'finished' | 'cancelled';

export interface PlayerRef {
  id: PlayerId;
  name: string;
}

export interface GameSummary {
  id: string;
  status: GameStatus;
  seats: PlayerRef[];
  hostId: PlayerId;
  winnerId: PlayerId | null;
  startedAt: number;
  finishedAt: number | null;
  handsPlayed: number;
  scores: Record<PlayerId, number>;
}

export interface RoomView {
  id: string;
  name: string;
  code: string;
  createdAt: number;
  players: PlayerRef[];
  games: GameSummary[];
}

export interface DraftInput {
  playerId: PlayerId;
  tricks: number | null;
  marriages: Marriage[];
  prikupPoints: number | null;
  prikupMarriage: Suit | null;
  enteredBy: PlayerId;
  updatedAt: number;
}

/** Кон в статусе «ввод»: итог торгов зафиксирован, идёт розыгрыш и ввод очков. */
export interface DraftHand {
  id: string;
  declarerId: PlayerId;
  bid: number;
  dark: DarkStatus;
  rospis: boolean;
  goldenThousand: boolean;
  inputs: Record<PlayerId, DraftInput>;
  /** Кто ещё не ввёл (играющие и раздающий на прикупе вчетвером). */
  waitingFor: PlayerId[];
  /** Строка, которая получится после подтверждения. */
  preview: Row | null;
  issues: Issue[];
}

export interface GameView {
  id: string;
  roomId: string;
  roomCode: string;
  roomName: string;
  status: GameStatus;
  hostId: PlayerId;
  seats: PlayerRef[];
  firstDealerId: PlayerId;
  winnerId: PlayerId | null;
  startedAt: number;
  finishedAt: number | null;
  /** Игрок на 100 объявил тёмную в текущей раздаче. */
  darkDeclared: boolean;
  state: GameState;
  draft: DraftHand | null;
}

export type GameAction =
  | { type: 'dealEvent'; event: DealEventType; reason?: RedealReason; playerId?: PlayerId }
  | { type: 'declareDark'; value: boolean }
  | { type: 'startHand'; declarerId: PlayerId; bid: number; dark: DarkStatus }
  | {
      type: 'updateHand';
      declarerId?: PlayerId;
      bid?: number;
      dark?: DarkStatus;
      rospis?: boolean;
      goldenThousand?: boolean;
    }
  | { type: 'cancelHand' }
  | {
      type: 'submitInput';
      playerId: PlayerId;
      tricks?: number | null;
      marriages?: Marriage[];
      prikupPoints?: number | null;
      prikupMarriage?: Suit | null;
    }
  | { type: 'confirmHand' }
  | { type: 'setHost'; playerId: PlayerId }
  | { type: 'finishGame' }
  | { type: 'cancelGame' };

export type ActionResult = { ok: true } | { ok: false; error: string };
export type JoinResult = { ok: true; view: GameView } | { ok: false; error: string };

export interface ClientToServerEvents {
  'game:join': (gameId: string, ack: (res: JoinResult) => void) => void;
  'game:leave': (gameId: string) => void;
  'room:join': (roomId: string) => void;
  'game:action': (
    payload: { gameId: string; actorId: PlayerId; action: GameAction },
    ack: (res: ActionResult) => void,
  ) => void;
}

export interface ServerToClientEvents {
  'game:state': (view: GameView) => void;
  'room:changed': (roomId: string) => void;
}
