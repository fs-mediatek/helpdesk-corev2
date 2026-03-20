#!/bin/bash
# HelpDesk Update Script — triggered by UI or manually
set -e
APP_DIR="/opt/helpdesk"
LOG="/tmp/helpdesk-update.log"

echo "===== HelpDesk Update $(date) =====" | tee "$LOG"

echo "[1/4] Service stoppen..." | tee -a "$LOG"
systemctl stop helpdesk 2>&1 | tee -a "$LOG" || true
sleep 1

echo "[2/4] Git pull..." | tee -a "$LOG"
cd "$APP_DIR"
git checkout -- . 2>&1 | tee -a "$LOG"
git pull origin main 2>&1 | tee -a "$LOG"

echo "[3/4] Abhängigkeiten..." | tee -a "$LOG"
npm install --silent 2>&1 | tee -a "$LOG" || true

echo "[4/4] Build + Start..." | tee -a "$LOG"
systemctl start helpdesk 2>&1 | tee -a "$LOG"

echo "===== Update abgeschlossen =====" | tee -a "$LOG"
echo "Logs: journalctl -u helpdesk -f"
