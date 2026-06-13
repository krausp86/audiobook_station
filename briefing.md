# KinderMediaPlayer — Projektspezifikation

## Übersicht

Raspberry Pi 4 Mediaplayer für ein Kind (6–8 Jahre) mit Touchscreen-Bedienung.
Abspielen von Hörbüchern und Musik, kindgerechte UI, robust gegen Stromverlust,
Bluetooth-Audio-Ausgang, Mediensync via Netzwerk.

---

## Hardware

- **Gerät:** Raspberry Pi 4
- **OS:** Raspberry Pi OS Lite (kein Desktop)
- **Display:** Verbundener Touchscreen (primäres Eingabegerät)
- **Audio-Ausgang:** Bluetooth (primär), 3.5mm Klinke (Fallback)

---

## Stack

| Komponente | Technologie |
|---|---|
| Player-Backend | MPD (Music Player Daemon) |
| MPD-Client (CLI) | mpc |
| BT-Audio | PipeWire + BlueALSA |
| Frontend | Electron + React (Kiosk-Modus) |
| Mediensync | rsync over SSH |
| Metadaten & Cover | MusicBrainz / beets (online-fetch erlaubt) |
| Persistenz | SQLite (Playback-Positionen, Settings) |
| Crash-Sicherheit | overlayfs + read-only rootfs |
| Display-Steuerung | xset dpms / vcgencmd, getriggert via `mpc idle` |

---

## Feature-Spezifikation

### 1. Kiosk-Boot

- Raspberry Pi OS Lite bootet ohne Desktop-Umgebung
- X11 startet minimal (kein Window Manager, kein Cursor)
- Systemd-Service startet Electron-App mit `--kiosk --no-sandbox` direkt nach Login
- Kein Zugriff auf OS-Ebene für den Endnutzer sichtbar
- Autologin für den dedizierten `player`-User

### 2. Stromverlust-Sicherheit

- Root-Partition wird **read-only** gemountet via overlayfs
- Medien liegen auf separater `ext4`-Partition mit `noatime,nodiratime`
- Playback-Position wird **alle 10 Sekunden** in SQLite geschrieben (pro Track/Hörbuch)
- Beim nächsten Start: automatisches Resume an letzter gespeicherter Position
- SQLite-Writes mit `PRAGMA journal_mode=WAL` für Crash-Konsistenz
- Kein `shutdown`-Befehl nötig — System ist jederzeit abzugswürdig

### 3. Mediensync via SCP/rsync

- Dedizierter SSH-User `media-sync` mit Key-Auth only (kein Passwort)
- `chroot` beschränkt auf `/media`-Verzeichnis
- Sync-Befehl vom sendenden Gerät: `rsync -avz --partial media/ media-sync@<pi-ip>:/media/`
- Nach abgeschlossenem Sync: automatischer MPD-Rescan via inotify-Watcher
- Verzeichnisstruktur:
  ```
  /media/
  ├── audiobooks/
  │   └── <Titel>/        ← ein Ordner pro Hörbuch
  │       ├── cover.jpg
  │       ├── chapter01.mp3
  │       └── ...
  └── music/
      └── <Artist - Album>/
          ├── cover.jpg
          └── *.mp3
  ```
- Metadaten & Cover werden beim Scan automatisch via beets/MusicBrainz nachgeladen falls fehlend

### 4. Kinderfreundliche Bibliothek (UI)

- **Zwei getrennte Bereiche:** „Hörbücher" und „Musik" — je ein großer Button auf dem Startscreen
- Bibliothek als **Cover-Kacheln-Grid** (min. 160×160px), kein Text-Listing
- Tap auf Kachel → sofortiger Playback-Start (oder Resume falls Position vorhanden)
- Langer Tap (>600ms) → Detail-Ansicht mit Titel, Autor, Fortschritt, „Von vorne starten"-Option
- Scroll durch die Bibliothek per Wisch-Geste
- **Weiterhören-Button** prominent auf jeder Kachel wenn Fortschritt > 0% und < 100%
- Keine Tastatur, keine Texteingabe im Kindmodus

### 5. Hörbücher — Kapitelstruktur

- M4B-Dateien: native Kapitelunterstützung via MPD
- MP3-Ordner: Kapitel = einzelne Dateien, sortiert nach Dateiname/Track-Tag
- CUE-Sheet-Support als Fallback für Single-File-MP3-Hörbücher
- Im Player-Screen: **Kapitelliste** als scrollbare Seitenleiste oder Swipe-Up-Sheet
- Kapitel-Navigation: ⏮ (voriges Kapitel) und ⏭ (nächstes Kapitel) als dedizierte Buttons
- Aktuelles Kapitel wird im Player prominent angezeigt

### 6. Playback-Steuerung

Alle Buttons sind groß und touch-freundlich (min. 60×60px tap target):

| Button | Funktion |
|---|---|
| ⏸ / ▶ | Pause / Weiter |
| ⏮ | Voriges Kapitel / Track |
| ⏭ | Nächstes Kapitel / Track |
| ⏪ | 15 Sekunden zurückspringen |
| ⏩ | 30 Sekunden vorspringen |
| Fortschrittsbalken | Tap/Drag to Seek |
| 🔉 / 🔊 | Lautstärke − / + |

- Fortschrittsbalken zeigt Kapitelmarkierungen bei Hörbüchern
- Aktuelle Zeit + Gesamtzeit werden angezeigt
- Lautstärke-Änderungen sind durch Elternsperre limitierbar (siehe Feature 10)

### 7. Bluetooth-Ausgang

- **Verbindungsmenü** erreichbar über Icon im Player-Screen (immer sichtbar)
- Menü zeigt:
  - Aktuell verbundenes Gerät (oder „Kein Gerät")
  - Liste der gekoppelten Geräte mit Connect/Disconnect-Button
  - „Neues Gerät koppeln"-Button → startet Scan-Modus für 30 Sekunden
- Autoconnect beim Boot: letztes verbundenes BT-Gerät wird automatisch verbunden
- Visuelles Status-Icon im Hauptscreen: BT verbunden / nicht verbunden
- BT-Audio via PipeWire als primärer Sink; Fallback auf 3.5mm wenn BT getrennt
- Verbindungsstatus-Änderungen werden per Toast-Notification angezeigt

### 8. Display-Management

- **Playback aktiv** → Display bleibt permanent an (DPMS deaktiviert)
- **Pause oder Stop** → Display-Timeout startet: **5 Minuten**, dann Screen Off
  - Screen Off via `xset dpms force off` oder `vcgencmd display_power 0`
- **Touch auf ausgeschaltetem Screen** → Display an, Playback-State **unverändert** (kein versehentliches Play/Pause)
- Implementierung: event-driven via `mpc idle player` in einem Systemd-Service
  - Bei State-Change `play`: DPMS deaktivieren
  - Bei State-Change `pause`/`stop`: DPMS-Timer auf 5 Minuten setzen
- Kein Polling — ausschließlich MPD-Events

### 9. Schlaf-Timer

- Erreichbar über Mond-Icon im Player-Screen
- Optionen: **15 / 30 / 60 Minuten** sowie „Bis Ende des Kapitels"
- Ablauf: **60 Sekunden vor Ende** beginnt sanftes Fade-Out der Lautstärke
- Nach Ablauf: Pause (kein Stop, damit Resume funktioniert)
- Aktiver Timer wird im UI als Countdown angezeigt
- Tap auf Countdown: Timer abbrechen

### 10. Elternsperre & Einstellungen

- Einstellungsmenü erreichbar über **langen Tap (>2s) auf das Logo/Homescreen-Icon**
- Entsperrung via **4-stelliger PIN** (Standard: `0000`, änderbar)
- Einstellungen:
  - **Maximale Lautstärke** (0–100%, Standard: 85%)
  - PIN ändern
  - Bluetooth-Geräte verwalten (Pairing löschen)
  - Medien-Rescan manuell auslösen
  - Sync-Log anzeigen
- Kind-UI hat **keinen Zugriff** auf Einstellungen

### 11. Cover & Metadaten

- Cover werden beim Medien-Scan automatisch aus dem Medien-Ordner gelesen (`cover.jpg`, `folder.jpg`, embedded in MP3/M4B)
- Falls kein Cover vorhanden: automatischer Fetch via MusicBrainz Cover Art Archive / Last.fm API
- Cover werden lokal gecacht unter `/media/.cache/covers/`
- Fallback bei fehlendem Cover: generierter Platzhalter mit Titel-Initial und Zufallsfarbe

### 12. Sync-Status-Anzeige

- Kleines Status-Icon in der Titelleiste des Frontends:
  - ✅ Bibliothek aktuell
  - 🔄 Sync / Scan läuft (animiert)
  - ⚠️ Letzter Sync fehlgeschlagen (Tap für Details)
- Sync-Log der letzten 10 Vorgänge in den Eltern-Einstellungen einsehbar

---

## Umsetzungsreihenfolge (Phasen)

### Phase 1 — Stabiles Fundament
- Raspberry Pi OS Lite Setup
- overlayfs / read-only rootfs konfigurieren
- Separate `/media`-Partition anlegen
- MPD installieren und konfigurieren
- Systemd-Unit: MPD autostart
- Systemd-Unit: Autologin + X11 + Electron Kiosk

### Phase 2 — Bibliothek & Sync
- SSH-User `media-sync` mit chroot einrichten
- inotify-Watcher → MPD-Rescan
- beets-Konfiguration für automatischen Metadaten-/Cover-Fetch
- SQLite-Schema: Tracks, Playback-Positionen, Settings

### Phase 3 — Frontend
- React/Electron App: Startscreen (Hörbücher / Musik)
- Cover-Kacheln-Grid mit Weiterhören-Indikator
- Player-Screen mit allen Steuerelementen (Feature 6)
- Kapitel-Navigation und -Liste
- Elternsperre + Einstellungsmenü

### Phase 4 — Bluetooth
- PipeWire + BlueALSA Setup
- Bluetooth-Menü im Frontend (Feature 7)
- Autoconnect-Systemd-Service

### Phase 5 — Display & Polish
- Display-Management Service (Feature 8)
- Schlaf-Timer mit Fade-Out (Feature 9)
- Cover-Download-Fallback + Platzhalter-Generierung
- Sync-Status-Icon im UI
- End-to-End-Tests: Stromverlust-Simulation, Resume-Verhalten

---

## Verzeichnisstruktur (Zielzustand)

```
/
├── home/player/
│   └── mediaplayer/        ← Electron-App
├── media/
│   ├── audiobooks/
│   ├── music/
│   └── .cache/covers/
├── etc/
│   ├── mpd.conf
│   └── systemd/system/
│       ├── mediaplayer.service
│       ├── media-watcher.service
│       └── display-manager.service
└── var/lib/mediaplayer/
    └── state.db             ← SQLite
```

---

## Nicht im MVP

- Streaming / Online-Inhalte
- Mehrbenutzer-Profile
- USB-Stick-Import (vorerst nur SCP)
- Video-Wiedergabe
- OTA-Updates
