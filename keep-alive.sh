#!/bin/bash
cd /home/z/my-project
while true; do
  if ! ss -tlnp | grep -q ':3000'; then
    echo "$(date): Starting server..." >> /home/z/my-project/server.log
    nohup node .next/standalone/server.js -p 3000 >> /home/z/my-project/server.log 2>&1 &
    disown
    echo "$(date): Started with PID $!" >> /home/z/my-project/server.log
  fi
  sleep 10
done
