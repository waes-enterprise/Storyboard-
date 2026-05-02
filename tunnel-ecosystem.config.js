module.exports = {
  apps: [{
    name: 'cloudflare-tunnel',
    script: '/home/z/my-project/.local/bin/cloudflared',
    args: 'tunnel --url http://localhost:3000',
    restart_delay: 5000,
    max_restarts: 20,
  }]
};
