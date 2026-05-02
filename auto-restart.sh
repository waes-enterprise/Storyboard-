#!/bin/bash
# Auto-restart script: checks if server is running, restarts if not
cd /home/z/my-project

# Check if pm2 is managing the app
PM2_STATUS=$(pm2 pid storyboard-ai 2>/dev/null)

if [ -z "$PM2_STATUS" ]; then
  echo "$(date): PM2 not managing app, starting..." >> /home/z/my-project/logs/auto-restart.log
  pm2 start /home/z/my-project/ecosystem.config.js >> /home/z/my-project/logs/auto-restart.log 2>&1
  pm2 save >> /home/z/my-project/logs/auto-restart.log 2>&1
fi

# Double-check: is port 3000 actually listening?
if ! ss -tlnp | grep -q ':3000'; then
  echo "$(date): Port 3000 not listening, force restarting..." >> /home/z/my-project/logs/auto-restart.log
  pm2 restart storyboard-ai >> /home/z/my-project/logs/auto-restart.log 2>&1
fi
