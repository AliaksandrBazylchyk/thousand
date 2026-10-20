// Сброс пароля администратором сервера (ТЗ 5.0, 9.1):
//   npm run user:password -w @thousand/server -- <логин> <новый пароль>
// В проде: из /opt/thousand/apps/server, от пользователя thousand и с DB_FILE из /etc/thousand.env.

import { resolve } from 'node:path';
import { createAuthService } from './auth';
import { defaultMigrationsFolder, openDb } from './db';

const [login, password] = process.argv.slice(2);
if (!login || !password) {
  console.error('Использование: user-password <логин> <новый пароль>');
  process.exit(1);
}
if (password.length < 6) {
  console.error('Пароль — не короче 6 знаков');
  process.exit(1);
}

const db = openDb(
  process.env.DB_FILE ?? resolve('data', 'thousand.sqlite'),
  defaultMigrationsFolder(),
);
try {
  createAuthService(db).resetPassword(login, password);
  console.log(`Пароль пользователя «${login}» изменён, его сессии завершены.`);
} catch (err) {
  console.error((err as Error).message);
  process.exit(1);
}
