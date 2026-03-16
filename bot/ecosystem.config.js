module.exports = {
  apps: [{
    name: 'claimscan-bot',
    script: './dist/index.js',
    cwd: __dirname,
    instances: 1, // Must be 1 — grammY long polling cannot run in cluster mode
    env: { NODE_ENV: 'production' },
    max_memory_restart: '512M',
    autorestart: true,
    watch: false,
    kill_timeout: 35000,
    min_uptime: '10s',
    max_restarts: 10,
  }],
};
