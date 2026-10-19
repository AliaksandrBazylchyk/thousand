# Деплой на VPS

Схема из ТЗ (раздел 9): один процесс Node.js под systemd (или pm2) за nginx, HTTPS через Let's Encrypt. Docker не нужен. Node.js сам отдаёт и API, и собранный фронтенд; nginx отвечает за HTTPS и проксирует WebSocket.

```
браузер ── HTTPS ──> nginx :443 ──> Node.js 127.0.0.1:3000 ──> SQLite /var/lib/thousand/thousand.sqlite
```

Файлы для сервера лежат в [deploy/](../deploy): `thousand.service`, `thousand.env.example`, `nginx.conf`, `ecosystem.config.cjs`.

## 1. Подготовка сервера (Ubuntu 24.04)

```bash
# Node.js 24 и nginx
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt-get install -y nodejs nginx git
sudo snap install --classic certbot

# Пользователь и каталоги
sudo useradd --system --home /opt/thousand --shell /usr/sbin/nologin thousand
sudo mkdir -p /opt/thousand /var/lib/thousand
sudo chown thousand:thousand /opt/thousand /var/lib/thousand
```

DNS-запись домена (A/AAAA) должна указывать на сервер до шага с certbot.

## 2. Код и сборка

```bash
sudo -u thousand git clone <адрес-репозитория> /opt/thousand
cd /opt/thousand
sudo -u thousand npm ci
sudo -u thousand npm run build
```

Проверка, что нативный модуль SQLite загрузился (npm 11 может не запускать install-скрипты, но better-sqlite3 поставляется с готовыми бинарниками):

```bash
cd /opt/thousand/apps/server && node -e "new (require('better-sqlite3'))(':memory:'); console.log('sqlite ok')"
```

Если выводится ошибка про `.node`-файл: `npm approve-scripts better-sqlite3 && npm rebuild better-sqlite3` (нужны `build-essential` и `python3`).

## 3. Настройки и запуск

```bash
sudo cp deploy/thousand.env.example /etc/thousand.env   # при необходимости поправить
sudo cp deploy/thousand.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now thousand
curl -s http://127.0.0.1:3000/api/health                # {"ok":true}
```

Миграции базы применяются автоматически при старте. Логи: `journalctl -u thousand -f`.

Вместо systemd можно pm2: `sudo npm i -g pm2`, затем от пользователя `thousand` — `pm2 start deploy/ecosystem.config.cjs && pm2 save && pm2 startup`. Процесс должен быть один: Socket.IO и кеш партий живут в памяти.

## 4. nginx и HTTPS

```bash
sudo cp deploy/nginx.conf /etc/nginx/sites-available/thousand
sudo sed -i 's/thousand.example.org/ВАШ-ДОМЕН/' /etc/nginx/sites-available/thousand
sudo ln -s /etc/nginx/sites-available/thousand /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d ВАШ-ДОМЕН
```

certbot сам добавит блок на 443, редирект с HTTP и продление сертификата.

## 5. Обновление

```bash
cd /opt/thousand
sudo -u thousand git pull
sudo -u thousand npm ci
sudo -u thousand npm run build
sudo systemctl restart thousand
```

Клиенты переподключатся сами и получат полный снимок партии.

## Переменные окружения

| Переменная       | По умолчанию                       | Назначение                                                       |
| ---------------- | ---------------------------------- | ---------------------------------------------------------------- |
| `API_PORT`       | `3000`                             | Порт Node.js. Не `PORT`: его выставляют dev-инструменты для Vite |
| `API_HOST`       | `127.0.0.1`                        | Адрес; наружу сервер не открываем                                |
| `DB_FILE`        | `apps/server/data/thousand.sqlite` | Файл базы                                                        |
| `WEB_DIST`       | `apps/web/dist`                    | Собранный фронтенд; если папки нет, сервер отдаёт только API     |
| `MIGRATIONS_DIR` | `apps/server/drizzle`              | SQL-миграции                                                     |
| `TRUST_PROXY`    | —                                  | `1` за nginx                                                     |
| `LOG_LEVEL`      | `info`                             | Уровень логов Fastify                                            |

## База данных

Вся история — один файл `/var/lib/thousand/thousand.sqlite` (в режиме WAL рядом лежат `-wal` и `-shm`). Автоматические бэкапы не настраиваются. Если понадобится копия вручную, надёжнее всего остановить сервис и скопировать все три файла:

```bash
sudo systemctl stop thousand
sudo cp /var/lib/thousand/thousand.sqlite* ~/
sudo systemctl start thousand
```

## Локальная разработка

```bash
npm install
npm run dev        # сервер :3000 + Vite :5173 с прокси /api и /socket.io
npm run build      # прод-сборка
npm start          # прод-сервер из apps/server/dist
```

Иконки приложения пересобираются командой `node apps/web/scripts/make-icons.mjs`.
