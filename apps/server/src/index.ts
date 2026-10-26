import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import { Server } from 'socket.io';
import { ZodError, type ZodType } from 'zod';
import type { ClientToServerEvents, Me, ServerToClientEvents } from '@thousand/core';
import { createAuthService, readCookie, SESSION_COOKIE, sessionCookie } from './auth';
import { defaultMigrationsFolder, openDb } from './db';
import { AccessError, GameError } from './errors';
import { exportCsv, exportFileName, exportJson } from './game/export';
import { createGameService } from './game/service';
import {
  actionPayloadSchema,
  aliasSchema,
  avatarSchema,
  createGameSchema,
  createRoomSchema,
  flagSchema,
  joinRoomSchema,
  loginSchema,
  passwordSchema,
  profileSchema,
  registerSchema,
} from './game/schemas';

// Не PORT: его выставляют dev-инструменты для Vite, а сервер должен оставаться на своём порту.
const PORT = Number(process.env.API_PORT ?? 3000);
const HOST = process.env.API_HOST ?? '127.0.0.1';
const DB_FILE = process.env.DB_FILE ?? resolve('data', 'thousand.sqlite');
/** Собранный фронтенд: в проде сервер отдаёт его сам (nginx может отдавать вместо него). */
const WEB_DIST = process.env.WEB_DIST ?? resolve('..', 'web', 'dist');

const db = openDb(DB_FILE, defaultMigrationsFolder());
const app = Fastify({
  logger: { level: process.env.LOG_LEVEL ?? 'info' },
  // За nginx: реальный IP и протокол клиента берутся из X-Forwarded-*.
  trustProxy: process.env.TRUST_PROXY === '1',
});

interface SocketData {
  userId: string | null;
}
const io = new Server<ClientToServerEvents, ServerToClientEvents, object, SocketData>(app.server, {
  serveClient: false,
});

const auth = createAuthService(db);
const service = createGameService(db, (gameId, roomId) => {
  if (gameId) io.to(`game:${gameId}`).emit('game:state', service.getView(gameId));
  io.to(`room:${roomId}`).emit('room:changed', roomId);
});

function errorMessage(err: unknown): string | null {
  if (err instanceof GameError) return err.message;
  if (err instanceof ZodError) return err.issues[0]?.message ?? 'Неверные данные';
  return null;
}

/** Обёртка REST-обработчика: доступ — 401/403/404, правила и валидация — 400, остальное — 500. */
async function handle<T>(reply: FastifyReply, fn: () => T) {
  try {
    return fn();
  } catch (err) {
    const message = errorMessage(err);
    if (message === null) throw err;
    return reply.code(err instanceof AccessError ? err.status : 400).send({ error: message });
  }
}

const parse = <T>(schema: ZodType<T>, body: unknown): T => schema.parse(body);

// ─── Сессия ──────────────────────────────────────────────────────────────

declare module 'fastify' {
  interface FastifyRequest {
    user: Me | null;
  }
}
app.decorateRequest('user', null);

const sessionToken = (req: FastifyRequest) => readCookie(req.headers.cookie, SESSION_COOKIE);

/** Без входа доступны только здоровье сервера, вход и регистрация, ТВ по секретной ссылке. */
const PUBLIC_API = /^\/api\/(health|auth\/(login|register|logout)|tv\/)/;

app.addHook('preHandler', async (req, reply) => {
  if (!req.url.startsWith('/api/')) return;
  req.user = auth.sessionUser(sessionToken(req));
  if (!req.user && !PUBLIC_API.test(req.url)) {
    return reply.code(401).send({ error: 'Нужно войти' });
  }
});

const userId = (req: FastifyRequest) => req.user!.id;

function startSession(req: FastifyRequest, reply: FastifyReply, token: string, me: Me) {
  void reply.header('Set-Cookie', sessionCookie(token, req.protocol === 'https'));
  return me;
}

// ─── REST: учётные записи ────────────────────────────────────────────────

app.get('/api/health', async () => ({ ok: true }));

app.post('/api/auth/register', (req, reply) =>
  handle(reply, () => {
    const body = parse(registerSchema, req.body);
    const { me, token } = auth.register(body.login, body.password, body.name);
    return startSession(req, reply, token, me);
  }),
);

app.post('/api/auth/login', (req, reply) =>
  handle(reply, () => {
    const body = parse(loginSchema, req.body);
    const { me, token } = auth.login(body.login, body.password);
    return startSession(req, reply, token, me);
  }),
);

app.post('/api/auth/logout', (req, reply) => {
  auth.logout(sessionToken(req));
  return reply
    .header('Set-Cookie', sessionCookie(null, req.protocol === 'https'))
    .send({ ok: true });
});

app.get('/api/me', async (req) => req.user);

app.patch('/api/me', (req, reply) =>
  handle(reply, () => auth.updateName(userId(req), parse(profileSchema, req.body).name)),
);

app.put('/api/me/avatar', (req, reply) =>
  handle(reply, () => auth.setAvatar(userId(req), parse(avatarSchema, req.body).image)),
);

app.put('/api/me/password', (req, reply) =>
  handle(reply, () => {
    const body = parse(passwordSchema, req.body);
    auth.changePassword(userId(req), body.current, body.next);
    return { ok: true };
  }),
);

app.get<{ Params: { id: string } }>('/api/avatars/:id', (req, reply) => {
  const avatar = auth.avatar(req.params.id);
  if (!avatar) return reply.code(404).send({ error: 'Нет аватара' });
  // Адрес меняется вместе с аватаром (?v=), поэтому кешируем надолго.
  return reply
    .type(avatar.type)
    .header('Cache-Control', 'private, max-age=31536000, immutable')
    .send(avatar.bytes);
});

// ─── REST: комнаты и партии ──────────────────────────────────────────────

app.get('/api/rooms', async (req) => service.listRooms(userId(req)));

app.post('/api/rooms', (req, reply) =>
  handle(reply, () => {
    const body = parse(createRoomSchema, req.body);
    return service.createRoom(body.name, userId(req), body.alias);
  }),
);

app.get<{ Params: { code: string } }>('/api/rooms/:code', (req, reply) =>
  handle(reply, () => service.roomView(req.params.code, userId(req))),
);

app.get<{ Params: { code: string } }>('/api/rooms/:code/join', (req, reply) =>
  handle(reply, () => service.joinView(req.params.code)),
);

app.post<{ Params: { code: string } }>('/api/rooms/:code/join', (req, reply) =>
  handle(reply, () => service.join(req.params.code, userId(req), parse(joinRoomSchema, req.body))),
);

app.put<{ Params: { code: string } }>('/api/rooms/:code/alias', (req, reply) =>
  handle(reply, () =>
    service.setAlias(req.params.code, userId(req), parse(aliasSchema, req.body).alias),
  ),
);

app.put<{ Params: { code: string } }>('/api/rooms/:code/flag', (req, reply) =>
  handle(reply, () =>
    service.setFlag(req.params.code, userId(req), parse(flagSchema, req.body).flag),
  ),
);

app.post<{ Params: { code: string } }>('/api/rooms/:code/tv-key', (req, reply) =>
  handle(reply, () => service.resetTvKey(req.params.code, userId(req))),
);

app.get<{ Params: { code: string } }>('/api/rooms/:code/stats', (req, reply) =>
  handle(reply, () => service.roomStats(req.params.code, userId(req))),
);

app.post<{ Params: { code: string } }>('/api/rooms/:code/games', (req, reply) =>
  handle(reply, () => {
    const body = parse(createGameSchema, req.body);
    return service.createGame(
      req.params.code,
      userId(req),
      body.seats,
      body.firstDealerId,
      body.hostId,
    );
  }),
);

app.get<{ Params: { id: string } }>('/api/games/:id', (req, reply) =>
  handle(reply, () => {
    service.assertGameAccess(req.params.id, { userId: userId(req) });
    return service.getView(req.params.id);
  }),
);

app.get<{ Params: { id: string }; Querystring: { format?: string } }>(
  '/api/games/:id/export',
  (req, reply) =>
    handle(reply, () => {
      service.assertGameAccess(req.params.id, { userId: userId(req) });
      const view = service.getView(req.params.id);
      const csv = req.query.format === 'csv';
      const name = exportFileName(view, csv ? 'csv' : 'json');
      void reply
        .header(
          'Content-Disposition',
          `attachment; filename="${name}"; filename*=UTF-8''${encodeURIComponent(name)}`,
        )
        .type(csv ? 'text/csv; charset=utf-8' : 'application/json; charset=utf-8');
      return csv
        ? exportCsv(view)
        : JSON.stringify(exportJson(view, service.details(req.params.id)), null, 2);
    }),
);

app.get<{ Params: { id: string } }>('/api/games/:id/details', (req, reply) =>
  handle(reply, () => {
    service.assertGameAccess(req.params.id, { userId: userId(req) });
    return service.details(req.params.id);
  }),
);

// ─── REST: ТВ по секретной ссылке ────────────────────────────────────────

app.get<{ Params: { key: string } }>('/api/tv/:key', (req, reply) =>
  handle(reply, () => service.tvRoom(req.params.key)),
);

// ─── Фронтенд в проде ────────────────────────────────────────────────────

if (existsSync(WEB_DIST)) {
  const { default: fastifyStatic } = await import('@fastify/static');
  await app.register(fastifyStatic, {
    root: WEB_DIST,
    wildcard: false,
    setHeaders: (res, path) => {
      // Сборка Vite с хешами в именах — кешируется навсегда; остальное (index.html, sw.js) — нет.
      if (/[\\/]assets[\\/]/.test(path)) {
        res.header('Cache-Control', 'public, max-age=31536000, immutable');
      } else {
        res.header('Cache-Control', 'no-cache');
      }
    },
  });
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith('/api/')) return reply.code(404).send({ error: 'Не найдено' });
    return reply.sendFile('index.html');
  });
}

// ─── Socket.IO ───────────────────────────────────────────────────────────

// Пользователь сокета — из той же cookie сессии; после входа или выхода клиент переподключается.
io.use((socket, next) => {
  socket.data.userId =
    auth.sessionUser(readCookie(socket.handshake.headers.cookie, SESSION_COOKIE))?.id ?? null;
  next();
});

io.on('connection', (socket) => {
  const who = (tvKey?: unknown) =>
    typeof tvKey === 'string' && tvKey ? { tvKey } : { userId: socket.data.userId };

  socket.on('game:join', (req, ack) => {
    try {
      const gameId = String(req?.gameId);
      service.assertGameAccess(gameId, who(req?.tvKey));
      const view = service.getView(gameId);
      void socket.join(`game:${view.id}`);
      ack({ ok: true, view });
    } catch (err) {
      ack({ ok: false, error: errorMessage(err) ?? 'Ошибка сервера' });
      if (!errorMessage(err)) app.log.error(err);
    }
  });

  socket.on('game:leave', (gameId) => void socket.leave(`game:${gameId}`));

  socket.on('room:join', (req) => {
    try {
      const roomId = String(req?.roomId);
      service.assertRoomAccess(roomId, who(req?.tvKey));
      void socket.join(`room:${roomId}`);
    } catch {
      // Без доступа просто не подписываем.
    }
  });

  socket.on('game:action', (payload, ack) => {
    try {
      if (!socket.data.userId) throw new AccessError('Нужно войти', 401);
      const { gameId, action } = actionPayloadSchema.parse(payload);
      service.act(gameId, socket.data.userId, action);
      ack({ ok: true });
    } catch (err) {
      const message = errorMessage(err);
      if (message === null) app.log.error(err);
      ack({ ok: false, error: message ?? 'Ошибка сервера' });
    }
  });
});

await app.listen({ port: PORT, host: HOST });
