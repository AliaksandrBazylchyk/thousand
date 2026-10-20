// Учётные записи: вход по логину и паролю, сессии в cookie, профиль и аватар (ТЗ 5.0, 9.1).

import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { eq, lt } from 'drizzle-orm';
import type { Me } from '@thousand/core';
import type { Db } from './db';
import { sessions, users } from './db/schema';
import { AccessError, GameError } from './errors';
import { newId } from './ids';

export const SESSION_COOKIE = 'thousand_session';
const SESSION_DAYS = 180;
const DAY = 24 * 60 * 60 * 1000;
/** Аватар после сжатия на устройстве (256×256) весит десятки КБ; с запасом. */
const AVATAR_MAX_BYTES = 300 * 1024;
const AVATAR_TYPES = ['image/webp', 'image/jpeg', 'image/png'];

type UserRow = typeof users.$inferSelect;

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 32);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [kind, salt, hash] = stored.split('$');
  if (kind !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const actual = scryptSync(password, Buffer.from(salt, 'base64'), expected.length);
  return timingSafeEqual(actual, expected);
}

const tokenId = (token: string) => createHash('sha256').update(token).digest('hex');

export const avatarUrl = (user: Pick<UserRow, 'id' | 'avatarUpdatedAt'>) =>
  user.avatarUpdatedAt ? `/api/avatars/${user.id}?v=${user.avatarUpdatedAt.getTime()}` : null;

const toMe = (u: UserRow): Me => ({
  id: u.id,
  login: u.login,
  name: u.name,
  avatarUrl: avatarUrl(u),
});

/** Разбор заголовка Cookie без зависимостей. */
export function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const eqAt = part.indexOf('=');
    if (eqAt > 0 && part.slice(0, eqAt).trim() === name) {
      return decodeURIComponent(part.slice(eqAt + 1).trim());
    }
  }
  return null;
}

/** Cookie сессии: HttpOnly, SameSite=Lax; Secure только на HTTPS (сайт может работать по IP через HTTP). */
export function sessionCookie(token: string | null, secure: boolean): string {
  const parts = [
    `${SESSION_COOKIE}=${token ?? ''}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${token ? SESSION_DAYS * 24 * 60 * 60 : 0}`,
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

export function createAuthService(db: Db) {
  function startSession(userId: string): string {
    const token = randomBytes(32).toString('base64url');
    db.insert(sessions)
      .values({ id: tokenId(token), userId, expiresAt: new Date(Date.now() + SESSION_DAYS * DAY) })
      .run();
    // Заодно убираем просроченные сессии.
    db.delete(sessions).where(lt(sessions.expiresAt, new Date())).run();
    return token;
  }

  function register(login: string, password: string, name: string) {
    const key = login.toLowerCase();
    if (db.select({ id: users.id }).from(users).where(eq(users.login, key)).get()) {
      throw new GameError('Этот логин уже занят');
    }
    const user = { id: newId(), login: key, name, passwordHash: hashPassword(password) };
    db.insert(users).values(user).run();
    return { me: me(user.id), token: startSession(user.id) };
  }

  function login(login: string, password: string) {
    const user = db.select().from(users).where(eq(users.login, login.toLowerCase())).get();
    if (!user || !verifyPassword(password, user.passwordHash)) {
      throw new AccessError('Неверный логин или пароль', 401);
    }
    return { me: toMe(user), token: startSession(user.id) };
  }

  function logout(token: string | null) {
    if (token)
      db.delete(sessions)
        .where(eq(sessions.id, tokenId(token)))
        .run();
  }

  /** Пользователь по токену из cookie; сессия продлевается раз в сутки. */
  function sessionUser(token: string | null): Me | null {
    if (!token) return null;
    const id = tokenId(token);
    const row = db
      .select({ user: users, expiresAt: sessions.expiresAt })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(eq(sessions.id, id))
      .get();
    if (!row) return null;
    const now = Date.now();
    if (row.expiresAt.getTime() < now) {
      db.delete(sessions).where(eq(sessions.id, id)).run();
      return null;
    }
    if (row.expiresAt.getTime() - now < (SESSION_DAYS - 1) * DAY) {
      db.update(sessions)
        .set({ expiresAt: new Date(now + SESSION_DAYS * DAY) })
        .where(eq(sessions.id, id))
        .run();
    }
    return toMe(row.user);
  }

  function me(userId: string): Me {
    const user = db.select().from(users).where(eq(users.id, userId)).get();
    if (!user) throw new AccessError('Нужно войти', 401);
    return toMe(user);
  }

  function updateName(userId: string, name: string): Me {
    db.update(users).set({ name }).where(eq(users.id, userId)).run();
    return me(userId);
  }

  /** Аватар из data URL (сжат на устройстве) или null — убрать. */
  function setAvatar(userId: string, dataUrl: string | null): Me {
    if (dataUrl === null) {
      db.update(users)
        .set({ avatar: null, avatarType: null, avatarUpdatedAt: null })
        .where(eq(users.id, userId))
        .run();
      return me(userId);
    }
    const match = /^data:(image\/[a-z]+);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
    if (!match || !AVATAR_TYPES.includes(match[1]!)) {
      throw new GameError('Нужна картинка PNG, JPEG или WebP');
    }
    const bytes = Buffer.from(match[2]!, 'base64');
    if (bytes.length > AVATAR_MAX_BYTES) throw new GameError('Картинка слишком большая');
    db.update(users)
      .set({ avatar: bytes, avatarType: match[1]!, avatarUpdatedAt: new Date() })
      .where(eq(users.id, userId))
      .run();
    return me(userId);
  }

  function avatar(userId: string) {
    const row = db
      .select({ avatar: users.avatar, type: users.avatarType })
      .from(users)
      .where(eq(users.id, userId))
      .get();
    return row?.avatar && row.type ? { bytes: row.avatar, type: row.type } : null;
  }

  function changePassword(userId: string, current: string, next: string) {
    const user = db.select().from(users).where(eq(users.id, userId)).get();
    if (!user || !verifyPassword(current, user.passwordHash)) {
      throw new GameError('Текущий пароль неверный');
    }
    db.update(users)
      .set({ passwordHash: hashPassword(next) })
      .where(eq(users.id, userId))
      .run();
  }

  /** Сброс пароля администратором (команда на сервере); все сессии пользователя завершаются. */
  function resetPassword(login: string, password: string) {
    const user = db.select().from(users).where(eq(users.login, login.toLowerCase())).get();
    if (!user) throw new GameError(`Пользователь «${login}» не найден`);
    db.update(users)
      .set({ passwordHash: hashPassword(password) })
      .where(eq(users.id, user.id))
      .run();
    db.delete(sessions).where(eq(sessions.userId, user.id)).run();
  }

  return {
    register,
    login,
    logout,
    sessionUser,
    me,
    updateName,
    setAvatar,
    avatar,
    changePassword,
    resetPassword,
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
