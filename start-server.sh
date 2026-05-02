#!/bin/bash
cd /home/z/my-project
while true; do
  npx next dev -p 3000 >> /home/z/my-project/server.log 2>&1
  echo "$(date): Next.js died, restarting in 2s..." >> /home/z/my-project/server.log
  sleep 2
done
