# Деплой на VPS без домена

Сайт открывается по IP сервера: `http://203.0.113.10/` (здесь и дальше вместо `203.0.113.10` подставьте свой IP). Один процесс Node.js под systemd (или pm2) за nginx, Docker не нужен. Node.js отдаёт и API, и собранный фронтенд; nginx принимает соединения на порту 80 и проксирует WebSocket.

```
телефоны, ТВ ── http://IP ──> nginx :80 ──> Node.js 127.0.0.1:3000 ──> SQLite /var/lib/thousand/thousand.sqlite
```

Файлы для сервера лежат в [deploy/](../deploy): `thousand.service`, `thousand.env.example`, `nginx.conf`, `ecosystem.config.cjs`.

## HTTP или HTTPS

Без домена есть два варианта:

|                                           | Только IP, HTTP                | HTTPS через sslip.io                                  |
| ----------------------------------------- | ------------------------------ | ----------------------------------------------------- |
| Адрес                                     | `http://203.0.113.10/`         | `https://203-0-113-10.sslip.io/`                      |
| Что нужно                                 | ничего                         | открыть порт 443 и один раз запустить certbot (шаг 6) |
| Таблица, ввод с телефонов, ТВ, статистика | работают                       | работают                                              |
| Установка на телефон как приложение (PWA) | нет                            | да                                                    |
| ТВ не гаснет, пока открыта таблица        | нет                            | да                                                    |
| Кнопка «Скопировать ссылку»               | копирует через запасной способ | да                                                    |
| Шифрование трафика                        | нет                            | да                                                    |

Браузеры включают установку приложения, удержание экрана и часть других функций только на HTTPS. `sslip.io` — бесплатный публичный DNS: имя `203-0-113-10.sslip.io` всегда указывает на `203.0.113.10`, поэтому Let's Encrypt выдаёт на него обычный сертификат без покупки домена. Начать можно с HTTP и включить HTTPS позже: данные и ссылки на комнаты сохранятся, сменится только адрес.

## 1. Подготовка сервера (Ubuntu 24.04)

```bash
# Node.js 24, nginx, git
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt-get install -y nodejs nginx git

# Пользователь и каталоги
sudo useradd --system --home /opt/thousand --shell /usr/sbin/nologin thousand
sudo mkdir -p /opt/thousand /var/lib/thousand
sudo chown thousand:thousand /opt/thousand /var/lib/thousand

# Файрвол: SSH и веб. Порт 3000 наружу не открываем — Node.js слушает только localhost.
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp     # понадобится для HTTPS (шаг 6)
sudo ufw enable
```

Если у хостинга есть свой файрвол в панели управления, откройте там те же порты 80 и 443.

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

## 4. nginx по IP

```bash
sudo cp deploy/nginx.conf /etc/nginx/sites-available/thousand
sudo ln -s /etc/nginx/sites-available/thousand /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default      # стандартная заглушка nginx занимает порт 80
sudo nginx -t && sudo systemctl reload nginx
```

Конфиг отвечает на любой адрес сервера (`server_name _`), поэтому IP ничего настраивать не нужно.

## 5. Проверка

С телефона или компьютера откройте `http://203.0.113.10/`: должна открыться главная «Тысячи». Создайте комнату, войдите с двух устройств и убедитесь, что ввод на одном сразу виден на другом — значит, WebSocket через nginx работает. Таблица для телевизора: кнопка «Таблица для ТВ» на странице комнаты, адрес вида `http://203.0.113.10/r/<код>/tv`.

## 6. HTTPS через sslip.io (по желанию)

Имя для своего IP: точки заменить дефисами и добавить `.sslip.io`. Для `203.0.113.10` это `203-0-113-10.sslip.io`.

```bash
# Проверка, что имя указывает на сервер
getent hosts 203-0-113-10.sslip.io

# Имя в конфиг nginx вместо «_» (default_server можно оставить)
sudo sed -i 's/server_name _;/server_name 203-0-113-10.sslip.io;/' /etc/nginx/sites-available/thousand
sudo nginx -t && sudo systemctl reload nginx

# Сертификат Let's Encrypt; certbot сам допишет блок 443 и редирект с HTTP
sudo snap install --classic certbot
sudo certbot --nginx -d 203-0-113-10.sslip.io
```

Продление сертификата certbot настраивает сам (`systemctl list-timers | grep certbot`). После этого сайт открывается по `https://203-0-113-10.sslip.io/`, а запросы на `http://` перенаправляются туда. Устройствам достаточно один раз открыть новый адрес: игрок, выбранный в комнате, запоминается отдельно для каждого адреса, поэтому имя придётся выбрать заново.

## 7. Обновление

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

## Доступ

По ТЗ в приложении нет паролей. По IP главную страницу может открыть любой, кто его знает, и создать свою комнату. Чужие комнаты недоступны без ссылки: код комнаты — 6 случайных символов. Если понадобится закрыть сайт целиком, в nginx можно добавить `allow`/`deny` по адресам или базовую авторизацию.

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
