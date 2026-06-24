# Hörmond — KinderMediaPlayer

Ein kindgerechter Touchscreen-Mediaplayer auf Raspberry Pi 4 mit 7" Display. Spielt Hörbücher und Musik im Kiosk-Modus ab, gesteuert ausschließlich per Touch.

## Hardware

- Raspberry Pi 4 (4 GB)
- Offizielles 7" DSI-Touchdisplay (800 x 480)
- Bluetooth-Kopfhörer oder -Lautsprecher (A2DP)
- 3,5-mm-Klinke als Fallback
- SD-Karte (empfohlen 32 GB+)

## Features

| Feature | Beschreibung |
|---------|-------------|
| **Medienwiedergabe** | Hörbücher (M4B, MP3-Ordner, CUE) und Musik. Kapitelnavigation, Seek, Lautstärke. |
| **Bibliothek** | Cover-Grid mit kinetischem Scrollen, „Zuletzt gehört" + „Alle", Fortschritts-Ring. |
| **Bluetooth** | Geräte koppeln/verbinden per Touch-UI. Autoconnect, Fallback auf Klinke. |
| **Schlaf-Timer** | 15/30/60 min oder „Bis Kapitelende". 60s Fade-Out, dann Pause. |
| **Eltern-Gate** | Versteckt hinter 2s Long-Tap auf Logo. PIN, Max-Lautstärke, Rescan. |
| **Display** | 5-min Inaktivitäts-Timer. Touch-Wake ohne UI-Aktion. |
| **Resume** | Position alle 10s gespeichert. Stromverlust-sicher (overlayfs + WAL). |
| **Cover-Art** | Eingebettet, Datei, Cache oder Online-Fetch (MusicBrainz). |
| **Sync** | Medien per rsync/SSH synchronisieren. Live-Status-Icon + Protokoll. |

## Architektur

```
┌──────────────────────────────────────────┐
│            Electron (Kiosk)              │
│  ┌──────────────┐  ┌──────────────────┐  │
│  │   Renderer   │  │      Main        │  │
│  │   (React)    │◄─┤  IPC-Bridge      │  │
│  │   800x480    │  │  (typed, secure) │  │
│  └──────────────┘  └───────┬──────────┘  │
│                            │             │
│              ┌─────────────┼──────────┐  │
│              │             │          │  │
│           ┌──▼──┐   ┌─────▼──┐  ┌────▼┐ │
│           │ MPD │   │ SQLite │  │BlueZ│ │
│           └──┬──┘   └────────┘  └──┬──┘ │
│              │                     │     │
│         ┌────▼─────────────────────▼──┐  │
│         │        PipeWire             │  │
│         │    (BT ↔ Klinke Auto)       │  │
│         └─────────────────────────────┘  │
└──────────────────────────────────────────┘
```

- **Renderer** — rein, kein Gerätezustand, nur über typisierte IPC-Bridge
- **Main** — kapselt alle privilegierten Operationen (MPD, SQLite, BlueZ, Display)
- **MPD** — Single Source of Truth für Player-Zustand
- **SQLite** — Fortschritt, Settings, PIN (gehasht), Sync-Log
- **PipeWire** — Audio-Routing, automatischer Sink-Wechsel BT ↔ Klinke

## Projektstruktur

```
├── app/                    # Electron-App
│   ├── src/
│   │   ├── main/           # Electron Main-Prozess
│   │   │   ├── mpd/        # MPD-Steuerung + idle loop
│   │   │   ├── db/         # SQLite (DAO, Migrationen)
│   │   │   ├── bt/         # Bluetooth (bluetoothctl-Wrapper)
│   │   │   ├── cover/      # Cover-Pipeline (embedded/file/cache/online)
│   │   │   ├── sleep/      # Schlaf-Timer-Dienst
│   │   │   ├── display/    # Display-Manager (bl_power)
│   │   │   ├── sync/       # Sync-Watcher + Status-Aggregation
│   │   │   ├── player/     # Position-Persistenz + Resume
│   │   │   ├── library/    # Bibliothek-Zusammenführung + Sortierung
│   │   │   ├── security/   # PIN-Hashing (scrypt)
│   │   │   └── ipc/        # IPC-Handler
│   │   ├── renderer/       # React-UI
│   │   │   ├── screens/    # S0–S10 Screens
│   │   │   ├── components/ # Cover, Pressable, Toast, WakeGuard, ...
│   │   │   └── i18n/       # Strings (de.json)
│   │   ├── shared/         # IPC-Vertrag (Typen, Commands, Events)
│   │   └── preload/        # Context-Bridge
│   └── package.json
├── system/                 # Systemd-Services, System-Konfiguration
│   └── bt-unblock.service
├── tasks/                  # Meilenstein-Taskpläne + Spike-Notes
└── README.md
```

## Setup

### Voraussetzungen (Pi)

- Raspberry Pi OS Lite (Bookworm)
- X11 ohne Window Manager (Kiosk-Start via `.xinitrc`)
- MPD, PipeWire, BlueZ installiert und konfiguriert
- overlayfs für read-only rootfs (optional aber empfohlen)
- Separate ext4-Partition `/mnt/hoermond` für Medien + Cache
- User `player` (Autologin, kein Passwort)
- User `media-sync` (Key-Auth, chroot, nur rsync/SFTP)

### App bauen und starten

```bash
cd app
npm install
npm run build
DISPLAY=:0 npx electron .
```

### Entwicklung (Laptop)

```bash
cd app
npm install
npm run dev
```

TypeScript-Prüfung:

```bash
npm run typecheck
```

Tests:

```bash
npm test
```

### Medien synchronisieren

Vom Quellrechner:

```bash
rsync -avz --partial media/ media-sync@<pi-ip>:/mnt/hoermond/
```

Der inotify-Watcher auf dem Pi löst automatisch einen MPD-Rescan aus.

## Systemd-Services (Pi)

| Service | Zweck |
|---------|-------|
| `mpd.service` | Musikwiedergabe, Bibliothek auf `/mnt/hoermond` |
| `mediaplayer.service` | Electron-App (Kiosk, Restart=always) |
| `bt-unblock.service` | `rfkill unblock bluetooth` beim Boot |
| `hoermond-backlight.service` | `chmod 0666` auf `bl_power` beim Boot |
| `media-watcher.service` | inotify → MPD-Rescan nach Sync |

## Konfiguration (Umgebungsvariablen)

| Variable | Default | Beschreibung |
|----------|---------|-------------|
| `HOERMOND_DB_PATH` | `/var/lib/mediaplayer/state.db` | SQLite-Datenbankpfad |
| `HOERMOND_MEDIA_ROOT` | `/mnt/hoermond` | Medienverzeichnis (MPD music_directory) |
| `HOERMOND_COVER_CACHE` | `/mnt/hoermond/.cache/covers/` | Cover-Cache-Verzeichnis |
| `HOERMOND_BACKLIGHT_PATH` | `/sys/class/backlight/10-0045/bl_power` | Backlight sysfs-Pfad |
| `HOERMOND_DISPLAY_TIMEOUT` | `300000` | Display-Inaktivitäts-Timeout (ms) |
| `HOERMOND_MPD_HOST` | `127.0.0.1` | MPD-Host |
| `HOERMOND_MPD_PORT` | `6600` | MPD-Port |
| `HOERMOND_SYNC_LOG` | `/var/lib/mediaplayer/sync/sync.log` | Sync-Log-Dateipfad |
| `HOERMOND_LASTFM_KEY` | *(nicht gesetzt)* | Last.fm API-Key (optionaler Cover-Fallback) |

## Lizenz

Privates Projekt.
