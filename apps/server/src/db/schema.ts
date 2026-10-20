import { sql } from 'drizzle-orm';
import { index, integer, primaryKey, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core';
import type {
  DarkStatus,
  DealEventType,
  GameStatus,
  Marriage,
  RedealReason,
  Suit,
} from '@thousand/core';

const createdAt = () =>
  integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch('subsec') * 1000)`);

export const rooms = sqliteTable('rooms', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  code: text('code').notNull().unique(),
  createdAt: createdAt(),
});

export const players = sqliteTable(
  'players',
  {
    id: text('id').primaryKey(),
    roomId: text('room_id')
      .notNull()
      .references(() => rooms.id),
    name: text('name').notNull(),
    /** Имя в нижнем регистре без лишних пробелов — для уникальности в комнате. */
    nameKey: text('name_key').notNull(),
    createdAt: createdAt(),
  },
  (t) => [unique().on(t.roomId, t.nameKey)],
);

export const games = sqliteTable(
  'games',
  {
    id: text('id').primaryKey(),
    roomId: text('room_id')
      .notNull()
      .references(() => rooms.id),
    hostId: text('host_id')
      .notNull()
      .references(() => players.id),
    firstDealerId: text('first_dealer_id')
      .notNull()
      .references(() => players.id),
    status: text('status').$type<GameStatus>().notNull().default('active'),
    winnerId: text('winner_id').references(() => players.id),
    /** Игрок на 100 объявил тёмную в текущей раздаче. */
    darkDeclared: integer('dark_declared', { mode: 'boolean' }).notNull().default(false),
    /** Счётчик порядка записей партии (коны и события раздачи). */
    seqCounter: integer('seq_counter').notNull().default(0),
    startedAt: createdAt(),
    finishedAt: integer('finished_at', { mode: 'timestamp_ms' }),
  },
  (t) => [index('games_room_idx').on(t.roomId)],
);

export const gamePlayers = sqliteTable(
  'game_players',
  {
    gameId: text('game_id')
      .notNull()
      .references(() => games.id),
    playerId: text('player_id')
      .notNull()
      .references(() => players.id),
    seat: integer('seat').notNull(),
  },
  (t) => [primaryKey({ columns: [t.gameId, t.playerId] })],
);

export type HandStatus = 'input' | 'confirmed';

export const hands = sqliteTable(
  'hands',
  {
    id: text('id').primaryKey(),
    gameId: text('game_id')
      .notNull()
      .references(() => games.id),
    seq: integer('seq').notNull(),
    dealerId: text('dealer_id').notNull(),
    onHundredId: text('on_hundred_id').notNull(),
    declarerId: text('declarer_id').notNull(),
    bid: integer('bid').notNull(),
    dark: text('dark').$type<DarkStatus>().notNull().default('none'),
    rospis: integer('rospis', { mode: 'boolean' }).notNull().default(false),
    goldenThousand: integer('golden_thousand', { mode: 'boolean' }).notNull().default(false),
    status: text('status').$type<HandStatus>().notNull().default('input'),
    createdAt: createdAt(),
    confirmedAt: integer('confirmed_at', { mode: 'timestamp_ms' }),
  },
  (t) => [index('hands_game_idx').on(t.gameId, t.seq)],
);

export const handInputs = sqliteTable(
  'hand_inputs',
  {
    handId: text('hand_id')
      .notNull()
      .references(() => hands.id, { onDelete: 'cascade' }),
    playerId: text('player_id').notNull(),
    tricks: integer('tricks'),
    marriages: text('marriages', { mode: 'json' }).$type<Marriage[]>().notNull().default([]),
    /** Раздающий вчетвером: очки прикупа и марьяж в прикупе. */
    prikupPoints: integer('prikup_points'),
    prikupMarriage: text('prikup_marriage').$type<Suit>(),
    enteredBy: text('entered_by').notNull(),
    /** Очки взяток подсчитаны автоматически как остаток до 120 (последний невведённый игрок). */
    auto: integer('auto', { mode: 'boolean' }).notNull().default(false),
    updatedAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.handId, t.playerId] })],
);

export const dealEvents = sqliteTable(
  'deal_events',
  {
    id: text('id').primaryKey(),
    gameId: text('game_id')
      .notNull()
      .references(() => games.id),
    seq: integer('seq').notNull(),
    dealerId: text('dealer_id').notNull(),
    type: text('type').$type<DealEventType>().notNull(),
    reason: text('reason').$type<RedealReason>(),
    playerId: text('player_id'),
    createdBy: text('created_by').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('deal_events_game_idx').on(t.gameId, t.seq)],
);

export const editLog = sqliteTable(
  'edit_log',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    gameId: text('game_id')
      .notNull()
      .references(() => games.id),
    handId: text('hand_id'),
    actorId: text('actor_id').notNull(),
    action: text('action').notNull(),
    before: text('before', { mode: 'json' }),
    after: text('after', { mode: 'json' }),
    createdAt: createdAt(),
  },
  (t) => [index('edit_log_game_idx').on(t.gameId)],
);
