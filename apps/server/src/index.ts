import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import Fastify, { type FastifyReply } from 'fastify';
import { Server } from 'socket.io';
import { ZodError, type ZodType } from 'zod';
import type { ClientToServerEvents, ServerToClientEvents } from '@thousand/core';
import { defaultMigrationsFolder, openDb } from './db';
import { createGameService, GameError } from './game/service';
import {
  actionPayloadSchema,
  createGameSchema,
  createPlayerSchema,
  createRoomSchema,
} from './game/schemas';

// Не PORT: его выставляют dev-инструменты для Vite, а сервер должен оставаться на своём порту.
const PORT = Number(process.env.API_PORT ?? 3000);
const HOST = process.env.API_HOST ?? '127.0.0.1';
const DB_FILE = process.env.DB_FILE ?? resolve('data', 'thousand.sqlite');
/** Собранный фронтенд: в проде сервер отдаёт его сам (nginx может отдавать вместо него). */
const WEB_DIST = process.env.WEB_DIST ?? resolve('..', 'web', 'dist');

const db = openDb(DB_FILE, defaultMigrationsFolder());
const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' } });
const io = new Server<ClientToServerEvents, ServerToClientEvents>(app.server, {
  serveClient: false,
});

const service = createGameService(db, (gameId, roomId) => {
  if (gameId) io.to(`game:${gameId}`).emit('game:state', service.getView(gameId));
  io.to(`room:${roomId}`).emit('room:changed', roomId);
});

function errorMessage(err: unknown): string | null {
  if (err instanceof GameError) return err.message;
  if (err instanceof ZodError) return err.issues[0]?.message ?? 'Неверные данные';
  return null;
}

/** Обёртка REST-обработчика: ошибки правил и валидации — 400, остальное — 500. */
async function handle<T>(reply: FastifyReply, fn: () => T) {
  try {
    return fn();
  } catch (err) {
    const message = errorMessage(err);
    if (message === null) throw err;
    return reply.code(message === 'Комната не найдена' ? 404 : 400).send({ error: message });
  }
}

const parse = <T>(schema: ZodType<T>, body: unknown): T => schema.parse(body);

// ─── REST ────────────────────────────────────────────────────────────────

app.get('/api/health', async () => ({ ok: true }));

app.post('/api/rooms', (req, reply) =>
  handle(reply, () => service.createRoom(parse(createRoomSchema, req.body).name)),
);

app.get<{ Params: { code: string } }>('/api/rooms/:code', (req, reply) =>
  handle(reply, () => service.roomView(req.params.code)),
);

app.post<{ Params: { code: string } }>('/api/rooms/:code/players', (req, reply) =>
  handle(reply, () =>
    service.ensurePlayer(req.params.code, parse(createPlayerSchema, req.body).name),
  ),
);

app.post<{ Params: { code: string } }>('/api/rooms/:code/games', (req, reply) =>
  handle(reply, () => {
    const body = parse(createGameSchema, req.body);
    return service.createGame(req.params.code, body.seats, body.firstDealerId, body.hostId);
  }),
);

app.get<{ Params: { id: string } }>('/api/games/:id', (req, reply) =>
  handle(reply, () => service.getView(req.params.id)),
);

// ─── Фронтенд в проде ────────────────────────────────────────────────────

if (existsSync(WEB_DIST)) {
  const { default: fastifyStatic } = await import('@fastify/static');
  await app.register(fastifyStatic, { root: WEB_DIST, wildcard: false });
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith('/api/')) return reply.code(404).send({ error: 'Не найдено' });
    return reply.sendFile('index.html');
  });
}

// ─── Socket.IO ───────────────────────────────────────────────────────────

io.on('connection', (socket) => {
  socket.on('game:join', (gameId, ack) => {
    try {
      const view = service.getView(String(gameId));
      void socket.join(`game:${view.id}`);
      ack({ ok: true, view });
    } catch (err) {
      ack({ ok: false, error: errorMessage(err) ?? 'Ошибка сервера' });
      if (!errorMessage(err)) app.log.error(err);
    }
  });

  socket.on('game:leave', (gameId) => void socket.leave(`game:${gameId}`));
  socket.on('room:join', (roomId) => void socket.join(`room:${roomId}`));

  socket.on('game:action', (payload, ack) => {
    try {
      const { gameId, actorId, action } = actionPayloadSchema.parse(payload);
      service.act(gameId, actorId, action);
      ack({ ok: true });
    } catch (err) {
      const message = errorMessage(err);
      if (message === null) app.log.error(err);
      ack({ ok: false, error: message ?? 'Ошибка сервера' });
    }
  });
});

await app.listen({ port: PORT, host: HOST });
