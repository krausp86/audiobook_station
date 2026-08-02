#!/usr/bin/env bash
#
# Befüllt die lokale Test-DB mit Hörfortschritten, damit die Sektion
# „Zuletzt gehört" und der Resume-Pfad ohne manuelles Vorspielen testbar sind.
#
# Voraussetzung: die App wurde mindestens einmal gestartet (dev/start-app.sh),
# damit die Migrationen gelaufen sind. Das Schema wird hier bewusst NICHT
# dupliziert — sonst driftet es gegen db/migrations.ts.
#
# Benötigt: sqlite3 (CLI). better-sqlite3 aus app/node_modules ist gegen
# Electrons ABI gebaut und aus plain Node nicht ladbar.
#
set -euo pipefail

DEV_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DB="${HOERMOND_DB_PATH:-$DEV_DIR/state.db}"

command -v sqlite3 >/dev/null || { echo "FEHLER: sqlite3 nicht gefunden." >&2; exit 1; }

if [[ ! -f "$DB" ]]; then
  echo "FEHLER: $DB existiert nicht." >&2
  echo "        Erst die App einmal starten: dev/start-app.sh" >&2
  exit 1
fi

if ! sqlite3 "$DB" "SELECT 1 FROM playback_position LIMIT 1;" >/dev/null 2>&1; then
  echo "FEHLER: Tabelle playback_position fehlt in $DB." >&2
  echo "        Die App muss einmal gelaufen sein, damit die Migrationen greifen." >&2
  exit 1
fi

NOW="$(date -u +%Y-%m-%dT%H:%M:%S.000Z)"
EARLIER="$(date -u -d '2 hours ago' +%Y-%m-%dT%H:%M:%S.000Z)"
YESTERDAY="$(date -u -d '1 day ago' +%Y-%m-%dT%H:%M:%S.000Z)"

# media-Zeile zuerst: playback_position hat einen Fremdschluessel darauf,
# genauso macht es persist.ts:55 zur Laufzeit.
seed() {
  local path="$1" type="$2" title="$3" track="$4" pos="$5" ts="$6" status="$7"
  sqlite3 "$DB" <<SQL
INSERT OR IGNORE INTO media (path, type, title, added_at)
  VALUES ('$path', '$type', '$title', '$ts');
INSERT INTO playback_position (media_path, track_index, position_seconds, last_played, last_status)
  VALUES ('$path', $track, $pos, '$ts', '$status')
  ON CONFLICT(media_path) DO UPDATE SET
    track_index = $track, position_seconds = $pos, last_played = '$ts', last_status = '$status';
SQL
}

# Mittendrin, mehrspurig — der Resume-Pfad mit track_index > 0 (M4 W3).
seed 'audiobooks/WasIstWas/Dinosaurier' 'audiobook' 'Dinosaurier' 1 3 "$NOW" 'paused'

# Fast durch — testet die Fortschrittsanzeige nahe 100 %.
seed 'audiobooks/Benjamin Bluemchen/Im Zoo' 'audiobook' 'Im Zoo' 8 3 "$EARLIER" 'paused'

# Gestoppt — darf beim Start NICHT automatisch weiterlaufen (Fix in resume.ts:27).
seed 'audiobooks/Lange Reihe/Der Schatz' 'audiobook' 'Der Schatz' 0 2 "$YESTERDAY" 'stopped'

# Musik im HEUTIGEN, tag-abgeleiteten Pfadformat (music/<AlbumArtist>/<Album>).
# Nach der Umstellung auf das Ordnermodell zeigt diese Zeile ins Leere — genau
# der Migrationsfall aus tasks/feature-playlists.md.
seed 'music/Die Aerzte/Bester Sampler' 'music' 'Bester Sampler' 1 2 "$EARLIER" 'paused'

echo "Seed geschrieben nach $DB:"
sqlite3 -header -column "$DB" \
  "SELECT media_path, track_index AS trk, position_seconds AS pos, last_status
     FROM playback_position ORDER BY last_played DESC;"
