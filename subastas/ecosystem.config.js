/**
 * PM2 Ecosystem Configuration
 * For production deployment with PM2 process manager
 */

module.exports = {
  apps: [
    {
      name: 'subastapro-web',
      script: 'npm',
      args: 'run start:web',
      env: {
        NODE_ENV: 'production',
        PORT: 3005
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      error_file: './logs/web-error.log',
      out_file: './logs/web-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    },
    {
      name: 'subastapro-scraper',
      script: 'python',
      args: 'scraper/scheduler.py',
      interpreter: 'python',
      env: {
        PYTHONUNBUFFERED: '1'
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      error_file: './logs/scraper-error.log',
      out_file: './logs/scraper-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    }
  ]
};
