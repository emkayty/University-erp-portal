/**
 * PM2 Ecosystem Configuration — UniPortal ERP API
 * C9 FIX: Node.js single-threaded without cluster mode wastes ~75% CPU on
 * multi-core servers. PM2 cluster mode forks one process per CPU core,
 * enabling true horizontal scaling on a single EC2 instance.
 *
 * Start:   pm2 start ecosystem.config.js --env production
 * Monitor: pm2 monit
 * Logs:    pm2 logs uniportal-api
 * Reload:  pm2 reload uniportal-api   (zero-downtime)
 */
module.exports = {
  apps: [
    {
      name:         'uniportal-api',
      cwd:          '/opt/uniportal/current',
      script:       './apps/api/dist/apps/api/src/main.js',
      instances:    'max',            // One per CPU core
      exec_mode:    'cluster',        // Fork + IPC for zero-downtime reload
      max_memory_restart: '1G',       // Restart if memory leak detected
      listen_timeout:  10000,         // Wait 10s for app to start listening
      kill_timeout:    5000,          // Wait 5s for graceful shutdown (NestJS hooks)

      env_production: {
        NODE_ENV:  'production',
        API_PORT:  3001,
        LOG_LEVEL: 'info',
      },
      env_staging: {
        NODE_ENV:  'staging',
        API_PORT:  3001,
        LOG_LEVEL: 'debug',
      },
      env_development: {
        NODE_ENV:  'development',
        API_PORT:  3001,
        LOG_LEVEL: 'debug',
      },

      // Structured JSON logging — parsed by CloudWatch Logs Insights
      log_type:          'json',
      out_file:          '/var/log/uniportal/api-out.log',
      error_file:        '/var/log/uniportal/api-err.log',
      merge_logs:        true,
      log_date_format:   'YYYY-MM-DDTHH:mm:ss.SSSZ',

      // Auto-restart on crash with exponential backoff
      autorestart:       true,
      restart_delay:     1000,
      max_restarts:      10,
      min_uptime:        '30s',

      // Health check via HTTP (PM2 5.x)
      exp_backoff_restart_delay: 100,
    },

    // ── M12 FIX: BullMQ workers — separate process from HTTP API ────────────
    // Scales independently of API traffic. FORK mode (not cluster) — BullMQ
    // workers don't need PM2's cluster IPC; each fork connects to Redis and
    // pulls jobs from the shared queues independently (BullMQ handles
    // distributing jobs across multiple worker connections natively).
    {
      name:      'uniportal-worker',
      cwd:       '/opt/uniportal/current',
      script:    './apps/api/dist/apps/api/src/worker.js',
      instances: 2,
      exec_mode: 'fork',
      max_memory_restart: '1G',
      kill_timeout: 30000, // Allow longer drain — invoice generation batches can be mid-flight

      env_production:  { NODE_ENV: 'production',  LOG_LEVEL: 'info'  },
      env_staging:     { NODE_ENV: 'staging',     LOG_LEVEL: 'debug' },
      env_development: { NODE_ENV: 'development', LOG_LEVEL: 'debug' },

      log_type:        'json',
      out_file:        '/var/log/uniportal/worker-out.log',
      error_file:      '/var/log/uniportal/worker-err.log',
      merge_logs:      true,
      log_date_format: 'YYYY-MM-DDTHH:mm:ss.SSSZ',

      autorestart:   true,
      restart_delay: 1000,
      max_restarts:  10,
      min_uptime:    '30s',
    },
  ],
};
