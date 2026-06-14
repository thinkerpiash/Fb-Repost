// PM2 Ecosystem Config
// Use PM2 to run the bot 24/7 on the server
// Install: npm install -g pm2
// Start:   pm2 start ecosystem.config.js
// Monitor: pm2 monit
// Logs:    pm2 logs fb-repost-bot

module.exports = {
  apps: [
    {
      name: 'fb-repost-bot',
      script: 'src/index.js',
      instances: 1,          // Only 1 instance should run
      autorestart: true,     // Auto restart if crashed
      watch: false,          // Keep false in production
      max_memory_restart: '200M',  // Restart if memory usage exceeds 200MB

      // Environment variables
      env: {
        NODE_ENV: 'production',
      },

      // Logging
      log_file: 'logs/pm2-combined.log',
      out_file: 'logs/pm2-out.log',
      error_file: 'logs/pm2-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,

      // Restart policy
      restart_delay: 5000,     // Restart after 5 seconds if crashed
      max_restarts: 10,        // Stop after 10 consecutive failures
      min_uptime: '30s',       // Uptime minimum to count as stable run
    }
  ]
};
