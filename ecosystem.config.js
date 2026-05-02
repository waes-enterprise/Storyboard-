module.exports = {
  apps: [
    {
      name: 'storyboard-ai',
      script: '.next/standalone/server.js',
      cwd: '/home/z/my-project',
      args: '-p 3000',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        DATABASE_URL: 'file:/home/z/my-project/db/custom.db',
      },
      error_file: '/home/z/my-project/logs/pm2-error.log',
      out_file: '/home/z/my-project/logs/pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      max_restarts: 100,
      restart_delay: 3000,
    },
  ],
};
