#!/bin/bash
# HelpDesk Start Script — used by systemd service
cd /opt/helpdesk
echo "[HelpDesk] Building..."
npx next build 2>&1 || echo "[HelpDesk] Build failed"
if [ -d .next ]; then
  echo "[HelpDesk] Starting production server..."
  exec npx next start -p 3000 -H 0.0.0.0
else
  echo "[HelpDesk] Starting dev server..."
  exec npx next dev -p 3000 -H 0.0.0.0
fi
