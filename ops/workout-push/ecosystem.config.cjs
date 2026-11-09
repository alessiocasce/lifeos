const path = require('node:path');

// Separate Oracle process. Never restart or reconfigure the WhatsApp bridge.
module.exports = { apps: [{
  name: 'lifeos-workout-push',
  cwd: path.resolve(__dirname, '../..'),
  script: 'scripts/workout-push-worker.js',
  interpreter: 'node',
  node_args: '--env-file=/etc/lifeos-workout-push/worker.env',
  instances: 1,
  exec_mode: 'fork',
  autorestart: true,
  restart_delay: 5000,
  kill_timeout: 50000,
  max_memory_restart: '128M',
  time: true,
  env: { NODE_ENV: 'production', LIFEOS_PUSH_POLL_MS: '10000', LIFEOS_PUSH_HEALTH_FILE: '/var/lib/lifeos-push/health.json' },
}] };
