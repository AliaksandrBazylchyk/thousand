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
import type { StatsResult } from './stats';

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
  /** Неигровой прикуп: отмена кона и пересдача тем же раздающим (R9). */
  | { type: 'badPrikup' }
  | {
      type: 'submitInput';
      playerId: PlayerId;
      tricks?: number | null;
      marriages?: Marriage[];
      prikupPoints?: number | null;
      prikupMarriage?: Suit | null;
    }
  | { type: 'confirmHand' }
  | EditHandAction
  | { type: 'deleteDealEvent'; eventId: string }
  | { type: 'setHost'; playerId: PlayerId }
  | { type: 'finishGame' }
  | { type: 'cancelGame' };

/** Правка подтверждённого кона ведущим: данные кона заменяются целиком. */
export interface EditHandAction {
  type: 'editHand';
  handId: string;
  declarerId: PlayerId;
  bid: number;
  dark: DarkStatus;
  rospis: boolean;
  goldenThousand: boolean;
  inputs: { playerId: PlayerId; tricks: number; marriages: Marriage[] }[];
  prikup: { points: number; marriage: Suit | null } | null;
}

export interface HandDetail {
  id: string;
  declarerId: PlayerId;
  bid: number;
  dark: DarkStatus;
  rospis: boolean;
  goldenThousand: boolean;
  confirmedAt: number | null;
  inputs: DraftInput[];
}

export interface DealEventDetail {
  id: string;
  type: DealEventType;
  reason: RedealReason | null;
  dealerId: PlayerId;
  playerId: PlayerId | null;
  createdBy: PlayerId;
  createdAt: number;
}

export interface EditLogEntry {
  id: number;
  handId: string | null;
  actorId: PlayerId;
  action: string;
  before: unknown;
  after: unknown;
  createdAt: number;
}

/** Подробности партии для деталей ячейки и журнала правок. */
export interface GameDetails {
  hands: HandDetail[];
  events: DealEventDetail[];
  log: EditLogEntry[];
}

/** Статистика комнаты по завершённым партиям (ТЗ 8). */
export interface RoomStatsView {
  roomName: string;
  code: string;
  players: PlayerRef[];
  games: number;
  hands: number;
  stats: StatsResult;
}

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
