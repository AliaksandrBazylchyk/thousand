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
    event: z.enum(['nineAtBottom', 'jackAtBottom', 'redeal', 'misdeal', 'violation']),
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
  z.object({ type: z.literal('badPrikup') }),
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
  action: gameActionSchema,
});

const alias = z.string().trim().min(1, 'Введите псевдоним').max(30);
const password = z.string().min(6, 'Пароль — не короче 6 знаков').max(200);
const userName = z.string().trim().min(1, 'Введите имя').max(40);

export const registerSchema = z.object({
  login: z
    .string()
    .trim()
    .regex(
      /^[A-Za-z0-9._-]{3,32}$/,
      'Логин: латиница, цифры, точка, дефис, подчёркивание — от 3 до 32 знаков',
    ),
  password,
  name: userName,
});
export const loginSchema = z.object({
  login: z.string().trim().min(1, 'Введите логин').max(32),
  password: z.string().min(1, 'Введите пароль').max(200),
});
export const profileSchema = z.object({ name: userName });
export const avatarSchema = z.object({ image: z.string().max(500_000).nullable() });
export const passwordSchema = z.object({ current: z.string().max(200), next: password });

export const createRoomSchema = z.object({ name: z.string().trim().min(1).max(60), alias });
export const joinRoomSchema = z
  .object({ alias: alias.optional(), claimPlayerId: id.optional() })
  .refine((v) => v.alias || v.claimPlayerId, 'Введите псевдоним');
export const aliasSchema = z.object({ alias });
export const flagSchema = z.object({ flag: z.string().max(20).nullable() });
export const createGameSchema = z
  .object({
    seats: z.array(id).min(2).max(4),
    firstDealerId: id,
    hostId: id,
  })
  .refine((v) => new Set(v.seats).size === v.seats.length, 'Игроки повторяются')
  .refine((v) => v.seats.includes(v.firstDealerId), 'Первый раздающий должен быть за столом')
  .refine((v) => v.seats.includes(v.hostId), 'Ведущий должен быть за столом');
