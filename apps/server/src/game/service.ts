import { and, asc, eq, inArray, isNotNull, isNull, ne } from 'drizzle-orm';
import {
  CARD_POINTS_TOTAL,
  computeStats,
  FLAG_COLORS,
  replay,
  validateHand,
  type DealEventEntry,
  type DraftHand,
  type DraftInput,
  type Entry,
  type GameAction,
  type GameDetails,
  type GameSetup,
  type GameState,
  type GameSummary,
  type GameView,
  type HandEntry,
  type IssueCode,
  type PlayerId,
  type PlayerRef,
  type RoomJoinView,
  type RoomListItem,
  type RoomStatsView,
  type RoomView,
  type TvRoomView,
  type Turn,
} from '@thousand/core';
import { avatarUrl } from '../auth';
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
  users,
} from '../db/schema';
import { AccessError, GameError } from '../errors';
import { nameKey, newId, newRoomCode, newTvKey } from '../ids';

export { GameError };

type HandRow = typeof hands.$inferSelect;
type InputRow = typeof handInputs.$inferSelect;
type GameRow = typeof games.$inferSelect;
type EventRow = typeof dealEvents.$inferSelect;
type EditAction = Extract<GameAction, { type: 'editHand' | 'deleteDealEvent' }>;

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
  seats: { id: PlayerId; name: string; flag: string | null }[];
  entries: Entry[];
  hands: HandRow[];
  inputs: InputRow[];
  events: EventRow[];
  draft: HandRow | null;
  draftInputs: InputRow[];
  state: GameState;
}

export function createGameService(db: Db, onChange: (gameId: string, roomId: string) => void) {
  const cache = new Map<string, GameView>();

  // ─── Комнаты и участники ───────────────────────────────────────────────

  const cleanName = (name: string) => name.trim().replace(/\s+/g, ' ');

  function roomByCode(code: string) {
    const room = db.select().from(rooms).where(eq(rooms.code, code.toLowerCase())).get();
    if (!room) throw new AccessError('Комната не найдена', 404);
    return room;
  }

  function membership(roomId: string, userId: string) {
    return db
      .select()
      .from(players)
      .where(and(eq(players.roomId, roomId), eq(players.userId, userId)))
      .get();
  }

  /** Комната и ваш игрок в ней: содержимое комнаты — только участникам. */
  function requireMember(code: string, userId: string) {
    const room = roomByCode(code);
    const player = membership(room.id, userId);
    if (!player) throw new AccessError('Вы не участник этой комнаты', 403);
    return { room, player };
  }

  /** Участники с учётной записью (во всех комнатах или в одной): псевдоним и аватар. */
  function memberRows(roomId?: string) {
    return db
      .select({
        id: players.id,
        name: players.name,
        roomId: players.roomId,
        userId: players.userId,
        flag: players.flag,
        avatarUpdatedAt: users.avatarUpdatedAt,
      })
      .from(players)
      .innerJoin(users, eq(users.id, players.userId))
      .where(roomId ? eq(players.roomId, roomId) : undefined)
      .orderBy(asc(players.name))
      .all();
  }

  const toRef = (m: ReturnType<typeof memberRows>[number]): PlayerRef => ({
    id: m.id,
    name: m.name,
    avatarUrl: avatarUrl({ id: m.userId!, avatarUpdatedAt: m.avatarUpdatedAt }),
    flag: m.flag,
  });

  /** Ключ псевдонима, если он свободен в комнате. */
  function freeAliasKey(roomId: string, alias: string, exceptPlayerId?: string) {
    const key = nameKey(alias);
    const taken = db
      .select({ id: players.id })
      .from(players)
      .where(
        and(
          eq(players.roomId, roomId),
          eq(players.nameKey, key),
          exceptPlayerId ? ne(players.id, exceptPlayerId) : undefined,
        ),
      )
      .get();
    if (taken) throw new GameError(`Псевдоним «${cleanName(alias)}» уже занят в этой комнате`);
    return key;
  }

  /** Новая комната; создатель сразу участник со своим псевдонимом. */
  function createRoom(name: string, userId: string, alias: string) {
    for (let attempt = 0; attempt < 10; attempt++) {
      const code = newRoomCode();
      if (db.select().from(rooms).where(eq(rooms.code, code)).get()) continue;
      const room = { id: newId(), name, code, tvKey: newTvKey() };
      const player = {
        id: newId(),
        roomId: room.id,
        name: cleanName(alias),
        nameKey: nameKey(alias),
        userId,
      };
      db.transaction((tx) => {
        tx.insert(rooms).values(room).run();
        tx.insert(players).values(player).run();
      });
      return { id: room.id, name: room.name, code: room.code };
    }
    throw new Error('Не удалось подобрать код комнаты');
  }

  /** Лобби: все комнаты, свежая активность сверху (ТЗ 5, 6.0). */
  function listRooms(userId: string): RoomListItem[] {
    const roomRows = db.select().from(rooms).all();
    const allMembers = memberRows();
    const gameRows = db
      .select({
        roomId: games.roomId,
        status: games.status,
        startedAt: games.startedAt,
        finishedAt: games.finishedAt,
      })
      .from(games)
      .all();
    return roomRows
      .map((room) => {
        const own = gameRows.filter((g) => g.roomId === room.id && g.status !== 'cancelled');
        const times = own.flatMap((g) => [g.startedAt.getTime(), g.finishedAt?.getTime() ?? 0]);
        const roomMembers = allMembers.filter((m) => m.roomId === room.id);
        const mine = roomMembers.find((m) => m.userId === userId);
        return {
          code: room.code,
          name: room.name,
          createdAt: room.createdAt.getTime(),
          member: !!mine,
          alias: mine?.name ?? null,
          members: roomMembers.map(toRef),
          games: own.length,
          activeGames: own.filter((g) => g.status === 'active').length,
          lastActivity: Math.max(room.createdAt.getTime(), ...times),
        };
      })
      .sort((a, b) => b.lastActivity - a.lastActivity);
  }

  function tvKeyOf(room: typeof rooms.$inferSelect): string {
    if (room.tvKey) return room.tvKey;
    const tvKey = newTvKey();
    db.update(rooms).set({ tvKey }).where(eq(rooms.id, room.id)).run();
    return tvKey;
  }

  function roomGames(roomId: string): GameSummary[] {
    return db
      .select({ id: games.id })
      .from(games)
      .where(eq(games.roomId, roomId))
      .orderBy(asc(games.startedAt))
      .all()
      .map((g) => summary(getView(g.id)))
      .reverse();
  }

  function roomView(code: string, userId: string): RoomView {
    const { room, player } = requireMember(code, userId);
    const roomMembers = memberRows(room.id);
    const me = roomMembers.find((m) => m.id === player.id)!;
    return {
      id: room.id,
      name: room.name,
      code: room.code,
      createdAt: room.createdAt.getTime(),
      me: toRef(me),
      tvKey: tvKeyOf(room),
      players: roomMembers.map(toRef),
      games: roomGames(room.id),
    };
  }

  /** Экран входа в комнату: участники и игроки из истории без учётной записи. */
  function joinView(code: string): RoomJoinView {
    const room = roomByCode(code);
    const unclaimed = db
      .select({ id: players.id, name: players.name })
      .from(players)
      .where(and(eq(players.roomId, room.id), isNull(players.userId)))
      .orderBy(asc(players.name))
      .all();
    const seats = unclaimed.length
      ? db
          .select({ playerId: gamePlayers.playerId })
          .from(gamePlayers)
          .innerJoin(games, eq(games.id, gamePlayers.gameId))
          .where(
            and(
              inArray(
                gamePlayers.playerId,
                unclaimed.map((p) => p.id),
              ),
              ne(games.status, 'cancelled'),
            ),
          )
          .all()
      : [];
    return {
      code: room.code,
      name: room.name,
      members: memberRows(room.id).map(toRef),
      history: unclaimed.map((p) => ({
        ...p,
        games: seats.filter((s) => s.playerId === p.id).length,
      })),
    };
  }

  /** Вход в комнату: новый псевдоним или своё имя из истории (история переходит к вам). */
  function join(code: string, userId: string, req: { alias?: string; claimPlayerId?: string }) {
    const room = roomByCode(code);
    if (membership(room.id, userId)) return { code: room.code };
    if (req.claimPlayerId) {
      const claimed = db
        .update(players)
        .set({ userId })
        .where(
          and(
            eq(players.id, req.claimPlayerId),
            eq(players.roomId, room.id),
            isNull(players.userId),
          ),
        )
        .run();
      if (claimed.changes === 0) throw new GameError('Этот игрок уже занят');
    } else {
      const alias = cleanName(req.alias ?? '');
      if (!alias) throw new GameError('Введите псевдоним');
      const key = freeAliasKey(room.id, alias);
      db.insert(players)
        .values({ id: newId(), roomId: room.id, name: alias, nameKey: key, userId })
        .run();
    }
    onChange('', room.id);
    return { code: room.code };
  }

  /** Псевдоним или флажок изменился: обновляем партии игрока у всех, включая ТВ. */
  function refreshPlayerGames(roomId: string, playerId: string) {
    const seatedIn = db
      .select({ id: gamePlayers.gameId })
      .from(gamePlayers)
      .where(eq(gamePlayers.playerId, playerId))
      .all();
    for (const g of seatedIn) {
      cache.delete(g.id);
      onChange(g.id, roomId);
    }
    onChange('', roomId);
  }

  /** Смена псевдонима: имя меняется во всех партиях комнаты. */
  function setAlias(code: string, userId: string, alias: string) {
    const { room, player } = requireMember(code, userId);
    const name = cleanName(alias);
    const key = freeAliasKey(room.id, name, player.id);
    db.update(players).set({ name, nameKey: key }).where(eq(players.id, player.id)).run();
    refreshPlayerGames(room.id, player.id);
    return { id: player.id, name };
  }

  /** Цвет своего флажка у имени на ТВ; null — по месту за столом (ТЗ 6.3). */
  function setFlag(code: string, userId: string, flag: string | null) {
    const { room, player } = requireMember(code, userId);
    if (flag !== null && !FLAG_COLORS.some((f) => f.id === flag)) {
      throw new GameError('Такого цвета флажка нет');
    }
    db.update(players).set({ flag }).where(eq(players.id, player.id)).run();
    refreshPlayerGames(room.id, player.id);
    return { id: player.id, flag };
  }

  /** Новая ТВ-ссылка; старая перестаёт работать. */
  function resetTvKey(code: string, userId: string) {
    const { room } = requireMember(code, userId);
    const tvKey = newTvKey();
    db.update(rooms).set({ tvKey }).where(eq(rooms.id, room.id)).run();
    onChange('', room.id);
    return { tvKey };
  }

  function roomByTvKey(tvKey: string) {
    const room = tvKey ? db.select().from(rooms).where(eq(rooms.tvKey, tvKey)).get() : undefined;
    if (!room) throw new AccessError('Ссылка для ТВ недействительна', 404);
    return room;
  }

  function tvRoom(tvKey: string): TvRoomView {
    const room = roomByTvKey(tvKey);
    return { id: room.id, name: room.name, games: roomGames(room.id) };
  }

  /** Доступ к комнате: участнику по сессии, ТВ — по ключу ссылки. */
  function assertRoomAccess(roomId: string, who: { userId?: string | null; tvKey?: string }) {
    if (who.tvKey) {
      if (roomByTvKey(who.tvKey).id === roomId) return;
    } else if (who.userId && membership(roomId, who.userId)) {
      return;
    }
    throw new AccessError('Нет доступа к этой комнате', 403);
  }

  function assertGameAccess(gameId: string, who: { userId?: string | null; tvKey?: string }) {
    const game = db.select({ roomId: games.roomId }).from(games).where(eq(games.id, gameId)).get();
    if (!game) throw new AccessError('Партия не найдена', 404);
    assertRoomAccess(game.roomId, who);
  }

  // ─── Партии ────────────────────────────────────────────────────────────

  function createGame(
    code: string,
    userId: string,
    seats: PlayerId[],
    firstDealerId: PlayerId,
    hostId: PlayerId,
  ) {
    const { room } = requireMember(code, userId);
    const pool = db
      .select({ id: players.id })
      .from(players)
      .where(
        and(eq(players.roomId, room.id), inArray(players.id, seats), isNotNull(players.userId)),
      )
      .all();
    if (pool.length !== seats.length) {
      throw new GameError('За стол садятся только участники комнаты с учётной записью');
    }
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
      .select({ id: players.id, name: players.name, flag: players.flag })
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
      hands: handRows,
      inputs: inputRows,
      events: eventRows,
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
    const turn = g.state.current?.turn;
    // Последнему невведённому игроку — остаток до 120 (подсчитано автоматически).
    const auto = turn ? autoRemainder(hand, inputs, turn) : null;
    const withAuto = auto ? [...inputs, auto] : inputs;
    const entry = toHandEntry(hand, withAuto, g.setup);
    const previewState = replay(g.setup, [...g.entries, entry]);
    const lastRow = previewState.rows.at(-1);
    const preview = lastRow?.entryId === hand.id ? lastRow : null;

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
      auto: auto ? { playerId: auto.playerId, tricks: auto.tricks! } : null,
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
      // Коны считаются все, в том числе несыгранные со штрафом.
      handsPlayed: view.state.rows.length,
      scores: Object.fromEntries(Object.entries(view.state.players).map(([p, s]) => [p, s.score])),
    };
  }

  // ─── Действия ──────────────────────────────────────────────────────────

  /** Действие от имени игрока вошедшего пользователя в комнате партии (ТЗ 9.1). */
  function act(gameId: string, userId: string, action: GameAction) {
    const g = load(gameId);
    const actorId = membership(g.room.id, userId)?.id;
    if (!actorId || !g.setup.seats.includes(actorId)) {
      throw new AccessError('Вы не участвуете в этой партии', 403);
    }
    if (action.type === 'editHand' || action.type === 'deleteDealEvent') {
      edit(g, actorId, action);
    } else {
      play(g, actorId, action);
    }
    cache.delete(gameId);
    onChange(gameId, g.room.id);
  }

  function logEdit(
    g: LoadedGame,
    actorId: PlayerId,
    action: string,
    before: unknown,
    after: unknown,
    handId?: string | null,
  ) {
    db.insert(editLog)
      .values({ gameId: g.game.id, handId: handId ?? null, actorId, action, before, after })
      .run();
  }

  /** Действия по ходу партии: раздача, торги, ввод, подтверждение. */
  function play(g: LoadedGame, actorId: PlayerId, action: Exclude<GameAction, EditAction>) {
    const gameId = g.game.id;
    if (g.game.status !== 'active') throw new GameError('Партия уже не идёт');
    const isHost = actorId === g.game.hostId;
    const requireHost = () => {
      if (!isHost) throw new GameError('Это может сделать только ведущий');
    };
    const current = g.state.current;
    if (!current) throw new GameError('Партия окончена');
    const turn = current.turn;
    const log = (action: string, before: unknown, after: unknown, handId?: string | null) =>
      logEdit(g, actorId, action, before, after, handId);

    db.transaction(() => {
      switch (action.type) {
        case 'dealEvent': {
          // Права совпадают с кнопками на экране: каждое событие отмечает тот, кому оно доступно.
          if (action.event === 'misdeal' || action.event === 'violation') requireHost();
          if (action.event === 'violation') {
            if (!action.playerId || !g.setup.seats.includes(action.playerId)) {
              throw new GameError('Выберите нарушителя');
            }
          }
          const atBottom = action.event === 'nineAtBottom' || action.event === 'jackAtBottom';
          if (atBottom && actorId !== turn.shifter) {
            throw new GameError('Девятку или валета внизу отмечает сдвигающий');
          }
          if (action.event === 'redeal') {
            if (!action.reason) throw new GameError('Укажите причину пересдачи');
            if (action.reason === 'threeNines' && actorId !== turn.onHundred) {
              throw new GameError('Пересдачу при 3 девятках объявляет игрок на 100');
            }
            if (action.reason !== 'threeNines' && !turn.active.includes(actorId)) {
              throw new GameError('Пересдачу объявляет игрок с картами на руках');
            }
          }
          if (g.draft) {
            // После итога торгов ещё можно: неправильная раздача, нарушение правил,
            // пересдача из-за 4 девяток или 4 вальтов (их видно, когда взят прикуп).
            const allowedInPlay =
              action.event === 'misdeal' ||
              action.event === 'violation' ||
              (action.event === 'redeal' &&
                (action.reason === 'fourNines' || action.reason === 'fourJacks'));
            if (!allowedInPlay) throw new GameError('Кон уже начат');
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

        case 'badPrikup': {
          // Неигровой прикуп (4 очка или меньше, на честном слове): кон отменяется,
          // пересдача тем же раздающим, входит в счётчик пересдач (R9).
          const draft = requireDraft(g);
          if (actorId !== draft.declarerId && !isHost) {
            throw new GameError('Неигровой прикуп объявляет заказавший');
          }
          db.delete(hands).where(eq(hands.id, draft.id)).run();
          log('cancelHand', handSnapshot(draft, g.draftInputs), null, draft.id);
          const event = {
            id: newId(),
            gameId,
            seq: nextSeq(g.game),
            dealerId: turn.dealer,
            type: 'redeal' as const,
            reason: 'badPrikup' as const,
            playerId: draft.declarerId,
            createdBy: actorId,
          };
          db.insert(dealEvents).values(event).run();
          db.update(games).set({ darkDeclared: false }).where(eq(games.id, gameId)).run();
          log('dealEvent', null, event);
          break;
        }

        case 'declareDark': {
          if (g.draft) throw new GameError('Торги уже закончены');
          if (actorId !== turn.onHundred) {
            throw new GameError('Тёмную объявляет игрок на 100');
          }
          if (action.value && Object.values(g.state.players).some((s) => s.onBarrel)) {
            throw new GameError('Пока кто-то на бочке, в тёмную играть нельзя');
          }
          db.update(games).set({ darkDeclared: action.value }).where(eq(games.id, gameId)).run();
          break;
        }

        case 'startHand': {
          if (g.draft) throw new GameError('Кон уже начат');
          if (actorId !== action.declarerId && !isHost) {
            throw new GameError('Итог торгов за другого игрока фиксирует только ведущий');
          }
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
            auto: false,
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
          // Остаток до 120 у последнего невведённого игрока сохраняется с отметкой «авто».
          const auto = autoRemainder(draft, g.draftInputs, turn);
          const inputs = auto ? [...g.draftInputs, { ...auto, enteredBy: actorId }] : g.draftInputs;
          if (auto)
            db.insert(handInputs)
              .values({ ...auto, enteredBy: actorId })
              .run();
          db.update(hands)
            .set({ status: 'confirmed', confirmedAt: new Date() })
            .where(eq(hands.id, draft.id))
            .run();
          const after = replay(g.setup, [...g.entries, toHandEntry(draft, inputs, g.setup)]);
          if (after.winner) {
            db.update(games)
              .set({ status: 'finished', winnerId: after.winner, finishedAt: new Date() })
              .where(eq(games.id, gameId))
              .run();
          }
          log('confirmHand', null, handSnapshot(draft, inputs), draft.id);
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
  }

  /**
   * Правка истории ведущим (ТЗ 5.5): кон или событие раздачи. Партия пересчитывается с первого кона;
   * правка отклоняется, если где-то дальше по таблице появляется ошибка.
   */
  function edit(g: LoadedGame, actorId: PlayerId, action: EditAction) {
    if (g.game.status === 'cancelled') throw new GameError('Партия отменена');
    if (actorId !== g.game.hostId) throw new GameError('Править коны может только ведущий');

    db.transaction(() => {
      if (action.type === 'editHand') {
        const hand = g.hands.find((h) => h.id === action.handId && h.status === 'confirmed');
        const row = g.state.rows.find((r) => r.entryId === action.handId);
        if (!hand || !row) throw new GameError('Кон не найден');
        const turn = row.turn;
        for (const input of action.inputs) {
          if (!turn.active.includes(input.playerId)) {
            throw new GameError('Очки взяток вводят только играющие в этом коне');
          }
        }
        if (action.prikup && !turn.prikupSitter)
          throw new GameError('Прикуп бывает только вчетвером');

        const oldInputs = g.inputs.filter((i) => i.handId === hand.id);
        const now = new Date();
        const newInputs: InputRow[] = action.inputs.map((i) => {
          const old = oldInputs.find((o) => o.playerId === i.playerId);
          const same = old?.tricks === i.tricks && sameList(old.marriages, i.marriages);
          return {
            handId: hand.id,
            playerId: i.playerId,
            tricks: i.tricks,
            marriages: i.marriages,
            prikupPoints: null,
            prikupMarriage: null,
            enteredBy: same ? old.enteredBy : actorId,
            // Отметка «подсчитано автоматически» остаётся, только пока значение не меняли.
            auto: same ? old.auto : false,
            updatedAt: same ? old.updatedAt : now,
          };
        });
        if (action.prikup && turn.prikupSitter) {
          const old = oldInputs.find((o) => o.playerId === turn.prikupSitter);
          const same =
            old?.prikupPoints === action.prikup.points &&
            old.prikupMarriage === action.prikup.marriage;
          newInputs.push({
            handId: hand.id,
            playerId: turn.prikupSitter,
            tricks: null,
            marriages: [],
            prikupPoints: action.prikup.points,
            prikupMarriage: action.prikup.marriage,
            enteredBy: same ? old.enteredBy : actorId,
            auto: false,
            updatedAt: same ? old.updatedAt : now,
          });
        }
        const next: HandRow = {
          ...hand,
          declarerId: action.declarerId,
          bid: action.bid,
          dark: action.dark,
          rospis: action.rospis,
          goldenThousand: action.goldenThousand,
        };
        const entries = g.entries.map((e) =>
          e.id === hand.id ? toHandEntry(next, newInputs, g.setup) : e,
        );
        const state = checkRecalc(g, entries);

        db.update(hands)
          .set({
            declarerId: next.declarerId,
            bid: next.bid,
            dark: next.dark,
            rospis: next.rospis,
            goldenThousand: next.goldenThousand,
          })
          .where(eq(hands.id, hand.id))
          .run();
        db.delete(handInputs).where(eq(handInputs.handId, hand.id)).run();
        if (newInputs.length) db.insert(handInputs).values(newInputs).run();
        syncWinner(g, state);
        logEdit(
          g,
          actorId,
          'editHand',
          handSnapshot(hand, oldInputs),
          handSnapshot(next, newInputs),
          hand.id,
        );
      } else {
        if (g.draft) throw new GameError('Сначала подтвердите или отмените текущий кон');
        const event = g.events.find((e) => e.id === action.eventId);
        if (!event) throw new GameError('Событие не найдено');
        const state = checkRecalc(
          g,
          g.entries.filter((e) => e.id !== event.id),
        );
        db.delete(dealEvents).where(eq(dealEvents.id, event.id)).run();
        syncWinner(g, state);
        logEdit(g, actorId, 'deleteDealEvent', event, null);
      }
    });
  }

  /** Пересчёт с правкой: новых ошибок в конах быть не должно. */
  function checkRecalc(g: LoadedGame, entries: Entry[]): GameState {
    const state = replay(g.setup, entries);

    // Уже сыгранные коны раздавали конкретные люди: очерёдность не должна сдвинуться.
    const dealerOf = new Map(g.hands.map((h) => [h.id, h.dealerId]));
    for (const row of state.rows) {
      if (row.kind === 'hand' && dealerOf.get(row.entryId) !== row.turn.dealer) {
        throw new GameError(`Нельзя: сдвинется очерёдность раздачи, начиная с кона ${row.number}`);
      }
    }
    if (state.issues.some((i) => i.code === 'afterGameOver')) {
      throw new GameError('После правки партия заканчивается раньше, а следующие коны уже сыграны');
    }

    const key = (i: { entryId: string; code: string; playerId?: string }) =>
      `${i.entryId}:${i.code}:${i.playerId ?? ''}`;
    const before = new Set(g.state.issues.filter((i) => i.level === 'error').map(key));
    const fresh = state.issues.find((i) => i.level === 'error' && !before.has(key(i)));
    if (fresh) {
      const row = state.rows.find((r) => r.entryId === fresh.entryId);
      const where = row ? `Кон ${row.number}: ` : '';
      throw new GameError(`${where}${fresh.message}`);
    }
    return state;
  }

  /** После правки победитель мог появиться или исчезнуть. */
  function syncWinner(g: LoadedGame, state: GameState) {
    const { game } = g;
    if (state.winner && game.winnerId !== state.winner) {
      if (g.draft) db.delete(hands).where(eq(hands.id, g.draft.id)).run();
      db.update(games)
        .set({
          status: 'finished',
          winnerId: state.winner,
          finishedAt: game.finishedAt ?? new Date(),
        })
        .where(eq(games.id, game.id))
        .run();
    } else if (!state.winner && game.winnerId) {
      // Партия была завершена победой, которой после правки нет: продолжаем.
      db.update(games)
        .set({ status: 'active', winnerId: null, finishedAt: null })
        .where(eq(games.id, game.id))
        .run();
    }
  }

  function roomStats(code: string, userId: string): RoomStatsView {
    const { room } = requireMember(code, userId);
    const finished = db
      .select({ id: games.id })
      .from(games)
      .where(and(eq(games.roomId, room.id), eq(games.status, 'finished')))
      .all()
      .map((g) => getView(g.id));
    const pool = db
      .select({ id: players.id, name: players.name })
      .from(players)
      .where(eq(players.roomId, room.id))
      .orderBy(asc(players.name))
      .all();
    return {
      roomName: room.name,
      code: room.code,
      players: pool,
      games: finished.length,
      hands: finished.reduce((n, v) => n + v.state.rows.length, 0),
      stats: computeStats(
        finished.map((v) => ({
          id: v.id,
          seats: v.seats.map((x) => x.id),
          state: v.state,
          finished: true,
          winnerId: v.winnerId,
          startedAt: v.startedAt,
          finishedAt: v.finishedAt,
        })),
      ),
    };
  }

  function details(gameId: string): GameDetails {
    const g = load(gameId);
    const log = db
      .select()
      .from(editLog)
      .where(eq(editLog.gameId, gameId))
      .orderBy(asc(editLog.id))
      .all();
    return {
      hands: g.hands
        .filter((h) => h.status === 'confirmed')
        .map((h) => ({
          id: h.id,
          declarerId: h.declarerId,
          bid: h.bid,
          dark: h.dark,
          rospis: h.rospis,
          goldenThousand: h.goldenThousand,
          confirmedAt: h.confirmedAt?.getTime() ?? null,
          inputs: g.inputs.filter((i) => i.handId === h.id).map(toDraftInput),
        })),
      events: g.events.map((e) => ({
        id: e.id,
        type: e.type,
        reason: e.reason,
        dealerId: e.dealerId,
        playerId: e.playerId,
        createdBy: e.createdBy,
        createdAt: e.createdAt.getTime(),
      })),
      log: log.map((l) => ({
        id: l.id,
        handId: l.handId,
        actorId: l.actorId,
        action: l.action,
        before: l.before,
        after: l.after,
        createdAt: l.createdAt.getTime(),
      })),
    };
  }

  function nextSeq(game: GameRow): number {
    const seq = game.seqCounter + 1;
    db.update(games).set({ seqCounter: seq }).where(eq(games.id, game.id)).run();
    game.seqCounter = seq;
    return seq;
  }

  return {
    createRoom,
    listRooms,
    roomView,
    joinView,
    join,
    setAlias,
    setFlag,
    resetTvKey,
    tvRoom,
    assertRoomAccess,
    assertGameAccess,
    roomStats,
    createGame,
    getView,
    details,
    act,
  };
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

function sameList<T>(a: readonly T[], b: readonly T[]): boolean {
  return a.length === b.length && a.every((x) => b.includes(x));
}

/**
 * Остаток до 120 для последнего невведённого игрока: все остальные играющие уже ввели взятки,
 * их сумма не больше 120, кон без росписи и золотой тысячи. Марьяжей у такого ввода нет.
 */
function autoRemainder(hand: HandRow, inputs: InputRow[], turn: Turn): InputRow | null {
  if (hand.rospis || hand.goldenThousand) return null;
  const entered = (p: PlayerId) => inputs.find((i) => i.playerId === p && i.tricks !== null);
  const missing = turn.active.filter((p) => !entered(p));
  if (missing.length !== 1) return null;
  const sum = turn.active.reduce((s, p) => s + (entered(p)?.tricks ?? 0), 0);
  if (sum > CARD_POINTS_TOTAL) return null;
  return {
    handId: hand.id,
    playerId: missing[0]!,
    tricks: CARD_POINTS_TOTAL - sum,
    marriages: [],
    prikupPoints: null,
    prikupMarriage: null,
    enteredBy: 'auto',
    auto: true,
    updatedAt: new Date(),
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
    auto: i.auto,
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
