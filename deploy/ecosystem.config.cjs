// pm2 — альтернатива systemd. Запуск: pm2 start deploy/ecosystem.config.cjs && pm2 save
module.exports = {
  apps: [
    {
      name: 'thousand',
      cwd: '/opt/thousand/apps/server',
      script: 'dist/index.js',
      instances: 1, // один процесс: состояние партий и Socket.IO живут в нём
      autorestart: true,
      env: {
        NODE_ENV: 'production',
        API_PORT: '3000',
        API_HOST: '127.0.0.1',
        DB_FILE: '/var/lib/thousand/thousand.sqlite',
        WEB_DIST: '/opt/thousand/apps/web/dist',
        MIGRATIONS_DIR: '/opt/thousand/apps/server/drizzle',
        TRUST_PROXY: '1',
      },
    },
  ],
};
