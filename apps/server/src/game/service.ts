import { and, asc, eq, inArray } from 'drizzle-orm';
import {
  replay,
  validateHand,
  type DealEventEntry,
  type DraftHand,
  type DraftInput,
  type Entry,
  type GameAction,
  type GameSetup,
  type GameState,
  type GameSummary,
  type GameView,
  type HandEntry,
  type IssueCode,
  type PlayerId,
  type RoomView,
  type Turn,
} from '@thousand/core';
import type { Db } from '../db';
import {
  dealEvents,
  editLog,
  gamePlayers,
  games,
  handInputs,
  hands,
  players,
  rooms,
} from '../db/schema';
import { nameKey, newId, newRoomCode } from '../ids';

/** Ошибка, которую можно показать пользователю. */
export class GameError extends Error {}

type HandRow = typeof hands.$inferSelect;
type InputRow = typeof handInputs.$inferSelect;
type GameRow = typeof games.$inferSelect;

/** Ошибки итога торгов, которые проверяются ещё до ввода очков. */
const BIDDING_ISSUES = new Set<IssueCode>([
  'unknownPlayer',
  'declarerNotActive',
  'badBid',
  'darkBidTooLow',
  'darkOverbidTooLow',
  'darkNotOnHundred',
  'darkOnBarrel',
]);

interface LoadedGame {
  game: GameRow;
  room: typeof rooms.$inferSelect;
  setup: GameSetup;
  seats: { id: PlayerId; name: string }[];
  entries: Entry[];
  draft: HandRow | null;
  draftInputs: InputRow[];
  state: GameState;
}

export function createGameService(db: Db, onChange: (gameId: string, roomId: string) => void) {
  const cache = new Map<string, GameView>();

  // ─── Комнаты и игроки ──────────────────────────────────────────────────

  function createRoom(name: string) {
    for (let attempt = 0; attempt < 10; attempt++) {
      const code = newRoomCode();
      if (db.select().from(rooms).where(eq(rooms.code, code)).get()) continue;
      const room = { id: newId(), name, code };
      db.insert(rooms).values(room).run();
      return room;
    }
    throw new Error('Не удалось подобрать код комнаты');
  }

  function roomByCode(code: string) {
    const room = db.select().from(rooms).where(eq(rooms.code, code.toLowerCase())).get();
    if (!room) throw new GameError('Комната не найдена');
    return room;
  }

  function roomView(code: string): RoomView {
    const room = roomByCode(code);
    const pool = db
      .select({ id: players.id, name: players.name })
      .from(players)
      .where(eq(players.roomId, room.id))
      .orderBy(asc(players.name))
      .all();
    const gameRows = db
      .select({ id: games.id })
      .from(games)
      .where(eq(games.roomId, room.id))
      .orderBy(asc(games.startedAt))
      .all();
    return {
      id: room.id,
      name: room.name,
      code: room.code,
      createdAt: room.createdAt.getTime(),
      players: pool,
      games: gameRows.map((g) => summary(getView(g.id))).reverse(),
    };
  }

  /** Находит игрока по имени в пуле комнаты или создаёт нового. */
  function ensurePlayer(code: string, name: string) {
    const room = roomByCode(code);
    const key = nameKey(name);
    const existing = db
      .select({ id: players.id, name: players.name })
      .from(players)
      .where(and(eq(players.roomId, room.id), eq(players.nameKey, key)))
      .get();
    if (existing) return existing;
    const player = {
      id: newId(),
      roomId: room.id,
      name: name.trim().replace(/\s+/g, ' '),
      nameKey: key,
    };
    db.insert(players).values(player).run();
    onChange('', room.id);
    return { id: player.id, name: player.name };
  }

  // ─── Партии ────────────────────────────────────────────────────────────

  function createGame(code: string, seats: PlayerId[], firstDealerId: PlayerId, hostId: PlayerId) {
    const room = roomByCode(code);
    const pool = db
      .select({ id: players.id })
      .from(players)
      .where(and(eq(players.roomId, room.id), inArray(players.id, seats)))
      .all();
    if (pool.length !== seats.length) throw new GameError('Игрок не из этой комнаты');
    const id = newId();
    db.transaction((tx) => {
      tx.insert(games).values({ id, roomId: room.id, hostId, firstDealerId }).run();
      tx.insert(gamePlayers)
        .values(seats.map((playerId, seat) => ({ gameId: id, playerId, seat })))
        .run();
    });
    onChange(id, room.id);
    return { id };
  }

  function load(gameId: string): LoadedGame {
    const game = db.select().from(games).where(eq(games.id, gameId)).get();
    if (!game) throw new GameError('Партия не найдена');
    const room = db.select().from(rooms).where(eq(rooms.id, game.roomId)).get()!;
    const seats = db
      .select({ id: players.id, name: players.name })
      .from(gamePlayers)
      .innerJoin(players, eq(players.id, gamePlayers.playerId))
      .where(eq(gamePlayers.gameId, gameId))
      .orderBy(asc(gamePlayers.seat))
      .all();
    const setup: GameSetup = { seats: seats.map((s) => s.id), firstDealer: game.firstDealerId };

    const handRows = db
      .select()
      .from(hands)
      .where(eq(hands.gameId, gameId))
      .orderBy(asc(hands.seq))
      .all();
    const inputRows = handRows.length
      ? db
          .select()
          .from(handInputs)
          .where(
            inArray(
              handInputs.handId,
              handRows.map((h) => h.id),
            ),
          )
          .all()
      : [];
    const eventRows = db
      .select()
      .from(dealEvents)
      .where(eq(dealEvents.gameId, gameId))
      .orderBy(asc(dealEvents.seq))
      .all();

    const inputsOf = (handId: string) => inputRows.filter((i) => i.handId === handId);
    const sequenced: { seq: number; entry: Entry }[] = [
      ...handRows
        .filter((h) => h.status === 'confirmed')
        .map((h) => ({ seq: h.seq, entry: toHandEntry(h, inputsOf(h.id), setup) })),
      ...eventRows.map((e) => ({
        seq: e.seq,
        entry: {
          kind: 'dealEvent',
          id: e.id,
          type: e.type,
          ...(e.reason ? { reason: e.reason } : {}),
          ...(e.playerId ? { playerId: e.playerId } : {}),
        } satisfies DealEventEntry,
      })),
    ];
    const entries = sequenced.sort((a, b) => a.seq - b.seq).map((s) => s.entry);
    const draft = handRows.find((h) => h.status === 'input') ?? null;

    return {
      game,
      room,
      setup,
      seats,
      entries,
      draft,
      draftInputs: draft ? inputsOf(draft.id) : [],
      state: replay(setup, entries),
    };
  }

  function getView(gameId: string): GameView {
    const cached = cache.get(gameId);
    if (cached) return cached;
    const g = load(gameId);
    const view: GameView = {
      id: g.game.id,
      roomId: g.room.id,
      roomCode: g.room.code,
      roomName: g.room.name,
      status: g.game.status,
      hostId: g.game.hostId,
      seats: g.seats,
      firstDealerId: g.game.firstDealerId,
      winnerId: g.game.winnerId,
      startedAt: g.game.startedAt.getTime(),
      finishedAt: g.game.finishedAt?.getTime() ?? null,
      darkDeclared: g.game.darkDeclared,
      state: g.state,
      draft: g.draft ? buildDraft(g, g.draft, g.draftInputs) : null,
    };
    cache.set(gameId, view);
    return view;
  }

  function buildDraft(g: LoadedGame, hand: HandRow, inputs: InputRow[]): DraftHand {
    const entry = toHandEntry(hand, inputs, g.setup);
    const previewState = replay(g.setup, [...g.entries, entry]);
    const lastRow = previewState.rows.at(-1);
    const preview = lastRow?.entryId === hand.id ? lastRow : null;
    const turn = g.state.current?.turn;

    const waitingFor: PlayerId[] = [];
    if (turn && !hand.goldenThousand) {
      if (!hand.rospis) {
        waitingFor.push(...turn.active.filter((p) => !(p in entry.inputs)));
      }
      if (turn.prikupSitter && !entry.prikup) waitingFor.push(turn.prikupSitter);
    }

    return {
      id: hand.id,
      declarerId: hand.declarerId,
      bid: hand.bid,
      dark: hand.dark,
      rospis: hand.rospis,
      goldenThousand: hand.goldenThousand,
      inputs: Object.fromEntries(inputs.map((i) => [i.playerId, toDraftInput(i)])),
      waitingFor,
      preview,
      issues: preview?.issues ?? [],
    };
  }

  function summary(view: GameView): GameSummary {
    return {
      id: view.id,
      status: view.status,
      seats: view.seats,
      hostId: view.hostId,
      winnerId: view.winnerId,
      startedAt: view.startedAt,
      finishedAt: view.finishedAt,
      handsPlayed: view.state.rows.filter((r) => r.kind === 'hand').length,
      scores: Object.fromEntries(Object.entries(view.state.players).map(([p, s]) => [p, s.score])),
    };
  }

  // ─── Действия ──────────────────────────────────────────────────────────

  function act(gameId: string, actorId: PlayerId, action: GameAction) {
    const g = load(gameId);
    if (g.game.status !== 'active') throw new GameError('Партия уже не идёт');
    if (!g.setup.seats.includes(actorId)) throw new GameError('Вы не участвуете в этой партии');
    const isHost = actorId === g.game.hostId;
    const requireHost = () => {
      if (!isHost) throw new GameError('Это может сделать только ведущий');
    };
    const current = g.state.current;
    if (!current) throw new GameError('Партия окончена');
    const turn = current.turn;
    const log = (action: string, before: unknown, after: unknown, handId?: string | null) =>
      db
        .insert(editLog)
        .values({ gameId, handId: handId ?? null, actorId, action, before, after })
        .run();

    db.transaction(() => {
      switch (action.type) {
        case 'dealEvent': {
          if (action.event === 'misdeal') requireHost();
          if (action.event === 'nineAtBottom' && actorId !== turn.shifter && !isHost) {
            throw new GameError('Девятку внизу отмечает сдвигающий');
          }
          if (action.event === 'redeal') {
            if (!action.reason) throw new GameError('Укажите причину пересдачи');
            if (action.reason === 'threeNines' && actorId !== turn.onHundred && !isHost) {
              throw new GameError('Пересдачу при 3 девятках объявляет игрок на 100');
            }
          }
          if (g.draft) {
            if (action.event !== 'misdeal') throw new GameError('Кон уже начат');
            db.delete(hands).where(eq(hands.id, g.draft.id)).run();
            log('cancelHand', handSnapshot(g.draft, g.draftInputs), null, g.draft.id);
          }
          const event = {
            id: newId(),
            gameId,
            seq: nextSeq(g.game),
            dealerId: turn.dealer,
            type: action.event,
            reason: action.event === 'redeal' ? (action.reason ?? null) : null,
            playerId:
              action.event === 'redeal' ? (action.playerId ?? actorId) : (action.playerId ?? null),
            createdBy: actorId,
          };
          db.insert(dealEvents).values(event).run();
          db.update(games).set({ darkDeclared: false }).where(eq(games.id, gameId)).run();
          log('dealEvent', null, event);
          break;
        }

        case 'declareDark': {
          if (g.draft) throw new GameError('Торги уже закончены');
          if (actorId !== turn.onHundred && !isHost) {
            throw new GameError('Тёмную объявляет игрок на 100');
          }
          if (action.value && g.state.players[turn.onHundred]?.onBarrel) {
            throw new GameError('Игрок на бочке не может играть в тёмную');
          }
          db.update(games).set({ darkDeclared: action.value }).where(eq(games.id, gameId)).run();
          break;
        }

        case 'startHand': {
          if (g.draft) throw new GameError('Кон уже начат');
          const hand = {
            id: newId(),
            gameId,
            seq: nextSeq(g.game),
            dealerId: turn.dealer,
            onHundredId: turn.onHundred,
            declarerId: action.declarerId,
            bid: action.bid,
            dark: action.dark,
          };
          checkBidding(g, turn, { ...hand, rospis: false, goldenThousand: false });
          db.insert(hands).values(hand).run();
          db.update(games).set({ darkDeclared: false }).where(eq(games.id, gameId)).run();
          log('startHand', null, hand, hand.id);
          break;
        }

        case 'updateHand': {
          const draft = requireDraft(g);
          if (actorId !== draft.declarerId && !isHost) {
            throw new GameError('Ставку меняет заказавший или ведущий');
          }
          const { type: _type, ...patch } = action;
          const next = { ...draft, ...patch };
          checkBidding(g, turn, next);
          db.update(hands).set(patch).where(eq(hands.id, draft.id)).run();
          log('updateHand', handSnapshot(draft, []), handSnapshot(next, []), draft.id);
          break;
        }

        case 'cancelHand': {
          requireHost();
          const draft = requireDraft(g);
          db.delete(hands).where(eq(hands.id, draft.id)).run();
          log('cancelHand', handSnapshot(draft, g.draftInputs), null, draft.id);
          break;
        }

        case 'submitInput': {
          const draft = requireDraft(g);
          const target = action.playerId;
          if (target !== actorId && !isHost) {
            throw new GameError('За другого игрока вводит только ведущий');
          }
          const isActive = turn.active.includes(target);
          const isSitter = turn.prikupSitter === target;
          if (!isActive && !isSitter) throw new GameError('Этот игрок не участвует в коне');
          if (isSitter && (action.tricks !== undefined || action.marriages !== undefined)) {
            throw new GameError('Раздающий вчетвером вводит только очки прикупа');
          }
          if (
            isActive &&
            (action.prikupPoints !== undefined || action.prikupMarriage !== undefined)
          ) {
            throw new GameError('Очки прикупа вводит раздающий вчетвером');
          }
          const before = g.draftInputs.find((i) => i.playerId === target) ?? null;
          const pick = <T>(value: T | undefined, previous: T | undefined, fallback: T): T =>
            value !== undefined ? value : (previous ?? fallback);
          const row = {
            handId: draft.id,
            playerId: target,
            tricks: isActive ? pick(action.tricks, before?.tricks, null) : null,
            marriages: isActive ? pick(action.marriages, before?.marriages, []) : [],
            prikupPoints: isSitter ? pick(action.prikupPoints, before?.prikupPoints, null) : null,
            prikupMarriage: isSitter
              ? pick(action.prikupMarriage, before?.prikupMarriage, null)
              : null,
            enteredBy: actorId,
            updatedAt: new Date(),
          };
          db.insert(handInputs)
            .values(row)
            .onConflictDoUpdate({ target: [handInputs.handId, handInputs.playerId], set: row })
            .run();
          log('submitInput', before, row, draft.id);
          break;
        }

        case 'confirmHand': {
          requireHost();
          const draft = requireDraft(g);
          const view = buildDraft(g, draft, g.draftInputs);
          const error = view.issues.find((i) => i.level === 'error');
          if (error) throw new GameError(error.message);
          db.update(hands)
            .set({ status: 'confirmed', confirmedAt: new Date() })
            .where(eq(hands.id, draft.id))
            .run();
          const after = replay(g.setup, [...g.entries, toHandEntry(draft, g.draftInputs, g.setup)]);
          if (after.winner) {
            db.update(games)
              .set({ status: 'finished', winnerId: after.winner, finishedAt: new Date() })
              .where(eq(games.id, gameId))
              .run();
          }
          log('confirmHand', null, handSnapshot(draft, g.draftInputs), draft.id);
          break;
        }

        case 'setHost': {
          requireHost();
          if (!g.setup.seats.includes(action.playerId)) {
            throw new GameError('Ведущим может быть только игрок партии');
          }
          db.update(games).set({ hostId: action.playerId }).where(eq(games.id, gameId)).run();
          log('setHost', g.game.hostId, action.playerId);
          break;
        }

        case 'finishGame':
        case 'cancelGame': {
          requireHost();
          if (g.draft) db.delete(hands).where(eq(hands.id, g.draft.id)).run();
          db.update(games)
            .set({
              status: action.type === 'finishGame' ? 'finished' : 'cancelled',
              finishedAt: new Date(),
            })
            .where(eq(games.id, gameId))
            .run();
          log(action.type, null, null);
          break;
        }
      }
    });

    cache.delete(gameId);
    onChange(gameId, g.room.id);
  }

  function nextSeq(game: GameRow): number {
    const seq = game.seqCounter + 1;
    db.update(games).set({ seqCounter: seq }).where(eq(games.id, game.id)).run();
    game.seqCounter = seq;
    return seq;
  }

  return { createRoom, roomView, ensurePlayer, createGame, getView, act };
}

export type GameService = ReturnType<typeof createGameService>;

// ─── Преобразования ──────────────────────────────────────────────────────

function requireDraft(g: LoadedGame): HandRow {
  if (!g.draft) throw new GameError('Кон ещё не начат');
  return g.draft;
}

function checkBidding(
  g: LoadedGame,
  turn: Turn,
  hand: Pick<HandRow, 'id' | 'declarerId' | 'bid' | 'dark' | 'rospis' | 'goldenThousand'>,
) {
  if (!g.setup.seats.includes(hand.declarerId)) throw new GameError('Заказавший не за столом');
  const entry: HandEntry = {
    kind: 'hand',
    id: hand.id,
    declarer: hand.declarerId,
    bid: hand.bid,
    dark: hand.dark,
    rospis: hand.rospis,
    goldenThousand: hand.goldenThousand,
    inputs: {},
    prikup: null,
  };
  const error = validateHand(entry, turn, g.state.players).find(
    (i) => i.level === 'error' && BIDDING_ISSUES.has(i.code),
  );
  if (error) throw new GameError(error.message);
}

function toHandEntry(hand: HandRow, inputs: InputRow[], setup: GameSetup): HandEntry {
  const dealerInput =
    setup.seats.length === 4 ? inputs.find((i) => i.playerId === hand.dealerId) : undefined;
  return {
    kind: 'hand',
    id: hand.id,
    declarer: hand.declarerId,
    bid: hand.bid,
    dark: hand.dark,
    rospis: hand.rospis,
    goldenThousand: hand.goldenThousand,
    inputs: Object.fromEntries(
      inputs
        .filter((i) => i.tricks !== null && i.playerId !== dealerInput?.playerId)
        .map((i) => [i.playerId, { tricks: i.tricks!, marriages: i.marriages }]),
    ),
    prikup:
      dealerInput && dealerInput.prikupPoints !== null
        ? { points: dealerInput.prikupPoints, marriage: dealerInput.prikupMarriage }
        : null,
  };
}

function toDraftInput(i: InputRow): DraftInput {
  return {
    playerId: i.playerId,
    tricks: i.tricks,
    marriages: i.marriages,
    prikupPoints: i.prikupPoints,
    prikupMarriage: i.prikupMarriage,
    enteredBy: i.enteredBy,
    updatedAt: i.updatedAt.getTime(),
  };
}

function handSnapshot(
  hand: Pick<HandRow, 'declarerId' | 'bid' | 'dark' | 'rospis' | 'goldenThousand'>,
  inputs: InputRow[],
) {
  return {
    declarerId: hand.declarerId,
    bid: hand.bid,
    dark: hand.dark,
    rospis: hand.rospis,
    goldenThousand: hand.goldenThousand,
    inputs: inputs.map(toDraftInput),
  };
}
