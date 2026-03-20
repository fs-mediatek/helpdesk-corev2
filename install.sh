#!/bin/bash
set -e

BOLD="\033[1m"
GREEN="\033[0;32m"
BLUE="\033[0;34m"
YELLOW="\033[0;33m"
RED="\033[0;31m"
NC="\033[0m"

APP_DIR="/opt/helpdesk"
DB_NAME="helpdesk"
APP_SECRET=$(openssl rand -base64 32 | tr -dc 'a-zA-Z0-9' | head -c 40)
NODE_VERSION="20"
APP_PORT=3000

echo -e "${BOLD}${BLUE}"
echo "  ╔══════════════════════════════════════════╗"
echo "  ║     HelpDesk Core v0.9.0 — Installer     ║"
echo "  ║     IT Support & Asset Management        ║"
echo "  ╚══════════════════════════════════════════╝"
echo -e "${NC}"

[ "$EUID" -ne 0 ] && echo -e "${RED}Bitte als root: sudo bash install.sh${NC}" && exit 1

echo -e "${GREEN}[1/6]${NC} Systemaktualisierung..."
apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get upgrade -y -qq
apt-get install -y -qq curl git openssl npm

echo -e "${GREEN}[2/6]${NC} Node.js ${NODE_VERSION} installieren..."
NEED_NODE=false
if ! command -v node &>/dev/null; then
  NEED_NODE=true
elif [ "$(node -v | cut -d. -f1 | tr -d 'v')" -lt "$NODE_VERSION" ]; then
  echo "  → Alte Version $(node -v) gefunden, wird aktualisiert..."
  apt-get remove -y -qq nodejs 2>/dev/null
  NEED_NODE=true
fi
if [ "$NEED_NODE" = true ]; then
  curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
  apt-get install -y -qq nodejs
fi
export PATH=$PATH:/usr/local/bin:/usr/bin
hash -r 2>/dev/null
echo "  → Node $(node -v), npm $(npm -v)"

echo -e "${GREEN}[3/6]${NC} MariaDB installieren..."
if ! command -v mariadb &>/dev/null; then
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq mariadb-server mariadb-client
  systemctl enable mariadb
fi
systemctl start mariadb 2>/dev/null || true
sleep 2

echo -e "${GREEN}[4/6]${NC} Datenbank einrichten..."
mariadb -u root -e "CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;" 2>/dev/null
mariadb -u root -e "SELECT 1" ${DB_NAME} &>/dev/null && echo "  → Verbindung OK" || { echo -e "${RED}DB-Fehler${NC}"; exit 1; }

echo -e "${GREEN}[5/6]${NC} Anwendung installieren..."
INSTALL_DIR=$(pwd)
[ "$INSTALL_DIR" != "$APP_DIR" ] && mkdir -p $APP_DIR && cp -r . $APP_DIR/
cd $APP_DIR

SERVER_IP=$(hostname -I | awk '{print $1}')
DB_SOCKET=""
[ -S /var/run/mysqld/mysqld.sock ] && DB_SOCKET="/var/run/mysqld/mysqld.sock"
[ -S /tmp/mysql.sock ] && DB_SOCKET="/tmp/mysql.sock"

cat > .env.local <<EOF
DB_HOST=localhost
DB_PORT=3306
DB_NAME=${DB_NAME}
DB_USER=root
DB_PASSWORD=
DB_SOCKET=${DB_SOCKET}
APP_SECRET_KEY=${APP_SECRET}
APP_URL=http://${SERVER_IP}:${APP_PORT}
NEXT_PUBLIC_APP_NAME=HelpDesk
EOF

npm ci --production=false --silent 2>/dev/null || npm install --silent
echo "  → Abhängigkeiten installiert"

echo "  → Build läuft (1-2 Min.)..."
npx next build > /tmp/helpdesk-build.log 2>&1
[ $? -eq 0 ] && APP_MODE="start" && echo "  → Build OK (Produktion)" || APP_MODE="dev" && echo -e "${YELLOW}  → Fallback: Dev-Modus${NC}"

chmod -R 755 $APP_DIR

echo -e "${GREEN}[6/6]${NC} Systemdienst + Admin..."
NPX_PATH=$(which npx)
cat > /etc/systemd/system/helpdesk.service <<EOF
[Unit]
Description=HelpDesk Core
After=network.target mariadb.service
Wants=mariadb.service
[Service]
Type=simple
User=root
WorkingDirectory=${APP_DIR}
ExecStart=${NPX_PATH} next ${APP_MODE} -p ${APP_PORT} -H 0.0.0.0
Restart=always
RestartSec=5
Environment=NODE_ENV=production
Environment=PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
[Install]
WantedBy=multi-user.target
EOF

command -v ufw &>/dev/null && ufw allow ${APP_PORT}/tcp 2>/dev/null || true

# Create admin user
node -e "
const bcrypt=require('bcryptjs'),mysql=require('mysql2/promise');
(async()=>{
  const c={database:'${DB_NAME}',user:'root',password:''};
  if('${DB_SOCKET}')c.socketPath='${DB_SOCKET}';else{c.host='localhost';c.port=3306}
  const p=mysql.createPool(c);
  await p.execute('CREATE TABLE IF NOT EXISTS users(id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,name VARCHAR(100)NOT NULL,email VARCHAR(200)NOT NULL UNIQUE,password_hash VARCHAR(255)NOT NULL,role VARCHAR(200)DEFAULT\"user\",department VARCHAR(100),phone VARCHAR(50),active TINYINT(1)DEFAULT 1,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)');
  await p.execute('CREATE TABLE IF NOT EXISTS settings(id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,key_name VARCHAR(100)NOT NULL UNIQUE,value TEXT)');
  const[r]=await p.execute('SELECT COUNT(*)as c FROM users');
  if(r[0].c===0){const h=await bcrypt.hash('admin',10);await p.execute('INSERT INTO users(name,email,password_hash,role)VALUES(?,?,?,?)',['Administrator','admin@helpdesk.local',h,'admin']);console.log('  → Admin erstellt')}
  else console.log('  → Admin existiert bereits');
  await p.end()
})().catch(e=>console.error('  →',e.message));
" 2>&1

systemctl daemon-reload && systemctl enable helpdesk && systemctl restart helpdesk
sleep 3

systemctl is-active --quiet helpdesk && SVC="${GREEN}läuft${NC}" || SVC="${RED}Fehler — journalctl -u helpdesk -f${NC}"

echo ""
echo -e "${BOLD}${GREEN}══════════════════════════════════════════════════${NC}"
echo -e "${BOLD}${GREEN}  Installation abgeschlossen!${NC}"
echo -e "${BOLD}${GREEN}══════════════════════════════════════════════════${NC}"
echo ""
echo -e "  ${BOLD}Dienst:${NC}  ${SVC}"
echo -e "  ${BOLD}URL:${NC}     http://${SERVER_IP}:${APP_PORT}"
echo ""
echo -e "  ${BOLD}Login:${NC}   admin@helpdesk.local / admin"
echo -e "  ${RED}         Passwort nach Login ändern!${NC}"
echo ""
echo -e "  ${BOLD}Dienst:${NC}  systemctl [status|restart|stop] helpdesk"
echo -e "  ${BOLD}Logs:${NC}    journalctl -u helpdesk -f"
echo ""
