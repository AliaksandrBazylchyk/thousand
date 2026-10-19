import Fastify from 'fastify';
import { Server } from 'socket.io';
import { CARD_POINTS_TOTAL } from '@thousand/core';

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? '127.0.0.1';

const app = Fastify({ logger: true });

app.get('/api/health', async () => ({ ok: true, cardPoints: CARD_POINTS_TOTAL }));

const io = new Server(app.server, { serveClient: false });

io.on('connection', (socket) => {
  app.log.info({ id: socket.id }, 'socket connected');
});

await app.listen({ port: PORT, host: HOST });
