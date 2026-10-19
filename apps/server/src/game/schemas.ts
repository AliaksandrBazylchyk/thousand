import { z } from 'zod';

z.config(z.locales.ru());

const id = z.string().min(1).max(64);
const suit = z.enum(['spades', 'clubs', 'diamonds', 'hearts']);
const marriage = z.enum(['spades', 'clubs', 'diamonds', 'hearts', 'aces']);
const dark = z.enum(['none', 'played', 'overbid']);
const points = z.number().int().min(0).max(120);
const bid = z.number().int().min(100).max(1000);

export const gameActionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('dealEvent'),
    event: z.enum(['nineAtBottom', 'jackAtBottom', 'redeal', 'misdeal']),
    reason: z.enum(['fourNines', 'fourJacks', 'threeNines']).optional(),
    playerId: id.optional(),
  }),
  z.object({ type: z.literal('declareDark'), value: z.boolean() }),
  z.object({ type: z.literal('startHand'), declarerId: id, bid, dark }),
  z.object({
    type: z.literal('updateHand'),
    declarerId: id.optional(),
    bid: bid.optional(),
    dark: dark.optional(),
    rospis: z.boolean().optional(),
    goldenThousand: z.boolean().optional(),
  }),
  z.object({ type: z.literal('cancelHand') }),
  z.object({
    type: z.literal('submitInput'),
    playerId: id,
    tricks: points.nullable().optional(),
    marriages: z
      .array(marriage)
      .max(5)
      .refine((list) => new Set(list).size === list.length, 'Марьяж отмечен дважды')
      .optional(),
    prikupPoints: points.nullable().optional(),
    prikupMarriage: suit.nullable().optional(),
  }),
  z.object({ type: z.literal('confirmHand') }),
  z.object({
    type: z.literal('editHand'),
    handId: id,
    declarerId: id,
    bid,
    dark,
    rospis: z.boolean(),
    goldenThousand: z.boolean(),
    inputs: z
      .array(z.object({ playerId: id, tricks: points, marriages: z.array(marriage).max(5) }))
      .max(4),
    prikup: z.object({ points, marriage: suit.nullable() }).nullable(),
  }),
  z.object({ type: z.literal('deleteDealEvent'), eventId: id }),
  z.object({ type: z.literal('setHost'), playerId: id }),
  z.object({ type: z.literal('finishGame') }),
  z.object({ type: z.literal('cancelGame') }),
]);

export const actionPayloadSchema = z.object({
  gameId: id,
  actorId: id,
  action: gameActionSchema,
});

export const createRoomSchema = z.object({ name: z.string().trim().min(1).max(60) });
export const createPlayerSchema = z.object({ name: z.string().trim().min(1).max(30) });
export const createGameSchema = z
  .object({
    seats: z.array(id).min(2).max(4),
    firstDealerId: id,
    hostId: id,
  })
  .refine((v) => new Set(v.seats).size === v.seats.length, 'Игроки повторяются')
  .refine((v) => v.seats.includes(v.firstDealerId), 'Первый раздающий должен быть за столом')
  .refine((v) => v.seats.includes(v.hostId), 'Ведущий должен быть за столом');
