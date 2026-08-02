#!/usr/bin/env bash
#
# Startet die Electron-App gegen die lokale Testumgebung statt gegen die
# Pi-Pfade. Es ist keine Code-Änderung nötig — alle Pfade und der MPD-Endpunkt
# sind bereits über Umgebungsvariablen konfigurierbar.
#
# Voraussetzung: der MPD-Container läuft.
#   docker compose -f dev/docker-compose.yml up -d
#
set -euo pipefail

DEV_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$DEV_DIR")"

if [[ ! -d "$DEV_DIR/media" ]]; then
  echo "FEHLER: $DEV_DIR/media fehlt. Erst die Fixtures erzeugen:" >&2
  echo "        dev/generate-fixtures.sh" >&2
  exit 1
fi

mkdir -p "$DEV_DIR/cache/covers"
# Der Display-Manager schreibt in diese Datei — auf dem Pi ist das sysfs.
# Lokal reicht eine gewöhnliche Datei, damit nichts ins Leere läuft.
[[ -f "$DEV_DIR/fake-backlight" ]] || echo 0 > "$DEV_DIR/fake-backlight"

export HOERMOND_MPD_HOST="127.0.0.1"
export HOERMOND_MPD_PORT="6601"          # nicht 6600 — kollidiert sonst mit System-MPD
export HOERMOND_MEDIA_ROOT="$DEV_DIR/media"
export HOERMOND_DB_PATH="$DEV_DIR/state.db"
export HOERMOND_COVER_CACHE="$DEV_DIR/cache/covers/"
export HOERMOND_SYNC_LOG="$DEV_DIR/sync.log"
export HOERMOND_BACKLIGHT_PATH="$DEV_DIR/fake-backlight"
export HOERMOND_DISPLAY_TIMEOUT="3600000"  # 1 h statt 5 min — kein Blank beim Entwickeln

# Electrons SUID-Sandbox-Helper muss root:root und 4755 sein. Nach einem
# frischen `npm install` gehoert er dem eigenen User, und Electron bricht mit
# "SUID sandbox helper binary ... is not configured correctly" ab.
# Fuer die lokale Entwicklung reicht es, die Sandbox abzuschalten.
# Dauerhafte Alternative (braucht sudo, ueberlebt kein npm install):
#   sudo chown root:root app/node_modules/electron/dist/chrome-sandbox
#   sudo chmod 4755      app/node_modules/electron/dist/chrome-sandbox
export ELECTRON_DISABLE_SANDBOX=1

echo "Lokale Testumgebung:"
echo "  MPD        127.0.0.1:$HOERMOND_MPD_PORT"
echo "  Medien     $HOERMOND_MEDIA_ROOT"
echo "  DB         $HOERMOND_DB_PATH"
echo

if ! (exec 3<>/dev/tcp/127.0.0.1/6601) 2>/dev/null; then
  echo "WARNUNG: Auf 127.0.0.1:6601 antwortet kein MPD." >&2
  echo "         docker compose -f dev/docker-compose.yml up -d" >&2
  echo
fi

cd "$REPO_DIR/app"
exec npm run dev
