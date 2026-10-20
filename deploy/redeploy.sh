#!/usr/bin/env bash
# Передеплой «Тысячи» на Ubuntu-сервере.
#
#   sudo ./redeploy.sh              — забрать свежую версию из git, собрать, заменить, перезапустить
#   sudo ./redeploy.sh --force      — то же, даже если коммит не изменился
#   sudo ./redeploy.sh --rollback   — вернуть предыдущую версию
#
# Как работает: новая версия клонируется и собирается в отдельной папке ($APP_DIR.new), поэтому
# ошибка сборки не трогает работающий сервер. После успешной сборки папки меняются местами,
# сервис перезапускается и проверяется /api/health; если проверка не прошла — автоматический откат.
# Предыдущая версия остаётся в $APP_DIR.prev. База (/var/lib/thousand) при этом не затрагивается.
#
# Настройки — переменными окружения: REPO_URL, BRANCH, APP_DIR, APP_USER, SERVICE.
set -Eeuo pipefail

REPO_URL="${REPO_URL:-https://github.com/AliaksandrBazylchyk/thousand.git}"
BRANCH="${BRANCH:-main}"
APP_DIR="${APP_DIR:-/opt/thousand}"
APP_USER="${APP_USER:-thousand}"
SERVICE="${SERVICE:-thousand}"
ENV_FILE="${ENV_FILE:-/etc/thousand.env}"
NPM_CACHE="${NPM_CACHE:-/var/cache/thousand-npm}"
NEW_DIR="${APP_DIR}.new"
PREV_DIR="${APP_DIR}.prev"

log() { printf '\033[1;34m[%s]\033[0m %s\n' "$(date +%H:%M:%S)" "$*"; }
die() { printf '\033[1;31m[%s] Ошибка:\033[0m %s\n' "$(date +%H:%M:%S)" "$*" >&2; exit 1; }
as_app() { sudo -u "$APP_USER" -H env NPM_CONFIG_CACHE="$NPM_CACHE" "$@"; }

[[ $EUID -eq 0 ]] || die "запустите через sudo"
id "$APP_USER" >/dev/null 2>&1 || die "нет пользователя $APP_USER (см. docs/DEPLOY.md, шаг 1)"
command -v git >/dev/null || die "не установлен git"
command -v node >/dev/null || die "не установлен Node.js"
command -v curl >/dev/null || die "не установлен curl"

# Один деплой за раз.
exec 9>/run/lock/thousand-redeploy.lock
flock -n 9 || die "уже идёт другой деплой"

PORT="$(sed -n 's/^API_PORT=//p' "$ENV_FILE" 2>/dev/null | tail -n1)"
HEALTH_URL="http://127.0.0.1:${PORT:-3000}/api/health"

health_check() {
  for _ in $(seq 1 30); do
    if curl -fsS --max-time 2 "$HEALTH_URL" >/dev/null 2>&1; then return 0; fi
    sleep 1
  done
  return 1
}

restart_service() {
  systemctl restart "$SERVICE"
  health_check
}

swap_back() {
  log "Откат: возвращаю предыдущую версию"
  [[ -d "$PREV_DIR" ]] || die "нет предыдущей версии в $PREV_DIR"
  rm -rf "$NEW_DIR"
  mv "$APP_DIR" "$NEW_DIR"
  mv "$PREV_DIR" "$APP_DIR"
  mv "$NEW_DIR" "$PREV_DIR"
  if restart_service; then
    log "Предыдущая версия работает: $(as_app git -C "$APP_DIR" log -1 --format='%h %s' 2>/dev/null || echo '?')"
  else
    die "после отката сервис не отвечает, смотрите: journalctl -u $SERVICE -n 100"
  fi
}

if [[ "${1:-}" == "--rollback" ]]; then
  swap_back
  exit 0
fi
FORCE=0
[[ "${1:-}" == "--force" ]] && FORCE=1

# ─── 1. Свежая версия из git ─────────────────────────────────────────────
mkdir -p "$NPM_CACHE" && chown "$APP_USER:$APP_USER" "$NPM_CACHE"
rm -rf "$NEW_DIR"
install -d -o "$APP_USER" -g "$APP_USER" "$NEW_DIR"
log "Клонирую $REPO_URL ($BRANCH)"
as_app git clone --quiet --depth 1 --branch "$BRANCH" "$REPO_URL" "$NEW_DIR"
NEW_COMMIT="$(as_app git -C "$NEW_DIR" rev-parse --short HEAD)"
CUR_COMMIT="$(as_app git -C "$APP_DIR" rev-parse --short HEAD 2>/dev/null || echo none)"
log "Сейчас работает: $CUR_COMMIT, в git: $NEW_COMMIT — $(as_app git -C "$NEW_DIR" log -1 --format=%s)"
if [[ "$NEW_COMMIT" == "$CUR_COMMIT" && $FORCE -eq 0 ]]; then
  rm -rf "$NEW_DIR"
  log "Изменений нет. Для пересборки той же версии: sudo $0 --force"
  exit 0
fi

# ─── 2. Сборка в отдельной папке ─────────────────────────────────────────
log "Устанавливаю зависимости (npm ci)"
(cd "$NEW_DIR" && as_app npm ci --no-audit --no-fund) || die "npm ci не прошёл, работающая версия не тронута"
log "Собираю (npm run build)"
(cd "$NEW_DIR" && as_app npm run build) || die "сборка не прошла, работающая версия не тронута"
for f in apps/server/dist/index.js apps/web/dist/index.html apps/server/drizzle; do
  [[ -e "$NEW_DIR/$f" ]] || die "после сборки нет $f, работающая версия не тронута"
done
(cd "$NEW_DIR/apps/server" && as_app node -e "new (require('better-sqlite3'))(':memory:')") \
  || die "не загружается better-sqlite3 (см. docs/DEPLOY.md, шаг 2), работающая версия не тронута"

# ─── 3. Замена и перезапуск ──────────────────────────────────────────────
log "Меняю версии местами"
rm -rf "$PREV_DIR"
if [[ -d "$APP_DIR" ]]; then mv "$APP_DIR" "$PREV_DIR"; fi
mv "$NEW_DIR" "$APP_DIR"

log "Перезапускаю $SERVICE"
if restart_service; then
  log "Готово: работает $NEW_COMMIT. Предыдущая версия — в $PREV_DIR (откат: sudo $0 --rollback)"
else
  printf '\033[1;31mНовая версия не отвечает на %s\033[0m\n' "$HEALTH_URL" >&2
  journalctl -u "$SERVICE" -n 30 --no-pager >&2 || true
  [[ -d "$PREV_DIR" ]] || die "предыдущей версии нет, откатывать некуда"
  swap_back
  exit 1
fi
