# Lokale Testumgebung

Das Gerät läuft produktiv — Änderungen an Bibliothek, Gruppierung oder
Hörfortschritt gehören nicht als Erstversuch auf den Pi. Diese Umgebung bildet
den relevanten Teil des Pi auf dem Laptop nach: ein MPD im Container mit einem
generierten Testbestand, eine eigene SQLite-DB, eigene Pfade.

**Es war dafür keine Code-Änderung nötig** — alle Pfade und der MPD-Endpunkt sind
bereits über Umgebungsvariablen konfigurierbar (siehe `README.md` im Wurzelverzeichnis).

## Schnellstart

```bash
dev/generate-fixtures.sh                        # Testmedien erzeugen (~10 s, ~770 KB)
docker compose -f dev/docker-compose.yml up -d  # MPD auf 127.0.0.1:6601
cd app && npm run dev:local                     # App gegen die Testumgebung starten

dev/seed-db.sh                                  # optional: Hörfortschritte einspielen
```

`seed-db.sh` setzt voraus, dass die App einmal gelaufen ist — die Migrationen
legen das Schema an. Das Schema wird hier bewusst nicht dupliziert, sonst
driftet es gegen `app/src/main/db/migrations.ts`.

## Was wohin zeigt

| Variable | Lokal | Auf dem Pi |
|----------|-------|-----------|
| `HOERMOND_MPD_PORT` | `6601` | `6600` |
| `HOERMOND_MEDIA_ROOT` | `dev/media` | `/mnt/hoermond` |
| `HOERMOND_DB_PATH` | `dev/state.db` | `/var/lib/mediaplayer/state.db` |
| `HOERMOND_COVER_CACHE` | `dev/cache/covers/` | `/mnt/hoermond/.cache/covers/` |
| `HOERMOND_SYNC_LOG` | `dev/sync.log` | `/var/lib/mediaplayer/sync/sync.log` |
| `HOERMOND_BACKLIGHT_PATH` | `dev/fake-backlight` | `/sys/class/backlight/…` |
| `HOERMOND_DISPLAY_TIMEOUT` | `3600000` (1 h) | `300000` (5 min) |

Port 6601 statt 6600, damit ein eventuell laufender System-MPD nicht kollidiert.
Nichts unter `dev/` außer den fünf eingecheckten Dateien landet in git.

## Der Testbestand

`generate-fixtures.sh` erzeugt Stille mit echten Tags, echten Laufzeiten und
echten eingebetteten Kapiteln. Die Struktur bildet gezielt die Fälle ab, an
denen das aktuelle Gruppierungsmodell scheitert (siehe `tasks/feature-playlists.md`):

| Pfad | Testet |
|------|--------|
| `audiobooks/WasIstWas/{Dinosaurier,Weltraum}/` | Navigationsordner mit zwei Einheiten darunter |
| `audiobooks/WasIstWas/Sonnensystem.m4b` | **gemischter Ordner** — Unterordner *und* lose Datei |
| `audiobooks/Benjamin Bluemchen/Im Zoo/1..10.mp3` | natürliche Sortierung (`10` vor `2`) |
| `audiobooks/Einzelhoerbuch.m4b` | lose Datei direkt im Typ-Ordner (`list.ts:121`) |
| `audiobooks/Lange Reihe/Der Schatz/CD{1,2}/` | Verschachtelungstiefe, Mehrfach-Datenträger |
| `music/Sampler/Kinderhits/` | Sampler **ohne** `AlbumArtist`, wechselnder `Artist` |
| `music/Die Aerzte/` + `music/Die Ärzte/` | Schreibvariante → heute doppelte Kachel |
| `music/Ohne Tags/` | gar keine Tags → heute eine Kachel pro Datei |
| `music/Kinderlieder/Lieblingslieder/` | selbst zusammengestellt, enthält eine **Kopie** (Fall E4) |
| `music/Umlaute & Zeichen/…"Quote"…` | Escaping Richtung MPD (`control.ts:25-26`) |

M4B-Dateien haben eingebettete Kapitel, damit die M4-Kapitellogik greift.

## Grenzen

- **`npm test` ist teilweise blind.** Sechs Tests (`resume.test.ts`) scheitern an einem
  ABI-Konflikt, nicht an der Logik: `better-sqlite3` ist gegen Electron gebaut, vitest
  läuft auf System-Node. Siehe **DEV-01** in `tasks/known-issues.md`. Diese Umgebung
  ersetzt die Lücke nicht — sie macht sie nur sichtbar.
- **Fenstergröße stimmt nicht mit dem Gerät überein.** `createWindow()` setzt
  800 × 480 (`src/main/index.ts:22`), der Fenstermanager macht daraus lokal aber ein
  größeres Fenster — der Inhalt bleibt 800 × 480, darunter und rechts ist leerer
  Hintergrund. Für Layout-Urteile also nur den oberen linken Bereich heranziehen.
- **Electron-Sandbox ist lokal abgeschaltet.** Nach `npm install` gehört
  `chrome-sandbox` dem eigenen User statt root, und Electron bricht ab. `start-app.sh`
  setzt deshalb `ELECTRON_DISABLE_SANDBOX=1`. Wer es sauber will:
  `sudo chown root:root` + `sudo chmod 4755` auf
  `app/node_modules/electron/dist/chrome-sandbox` — überlebt aber kein `npm install`.
- **Kein Ton.** MPD nutzt einen Null-Output und spielt in Echtzeit ins Nichts.
  Positionen, Kapitelsprünge und Resume verhalten sich wie mit echtem Audio.
- **MPD-Version weicht ab.** Der Container liefert MPD 0.21.11; auf dem Pi läuft
  eine neuere Version. Bei Verhalten, das an MPD-Interna hängt, am Pi gegenprüfen.
- **Keine Hardware.** Touch-Rotation, Backlight, Bluetooth und overlayfs bildet
  diese Umgebung nicht ab. Dafür bleibt nur das Gerät selbst — siehe BT-01 in
  `tasks/known-issues.md`.
- **Kein Web-Portal.** Kommt als zweiter Service in dasselbe Compose-File,
  sobald es existiert (`tasks/feature-web-upload.md`).

## Aufräumen

```bash
docker compose -f dev/docker-compose.yml down -v   # Container + MPD-Datenbank
rm -rf dev/media dev/state.db dev/cache dev/sync.log dev/fake-backlight
```
