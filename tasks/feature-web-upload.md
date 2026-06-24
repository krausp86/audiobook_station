# Feature: Web-Upload-Portal (lokales Netzwerk)

**Projekt:** Hörmond — KinderMediaPlayer auf Raspberry Pi 4
**Status:** Entwurf
**Erstellt:** 2026-06-24
**Abhängig von:** M2 (Sync-Infrastruktur, Bibliothek, inotify-Watcher), M5 (Eltern-PIN)

---

## Motivation

Das Befüllen des Hörmond mit neuen Hörbüchern und Musik erfordert aktuell `rsync` über SSH mit Key-Auth — ein technischer Vorgang, den nur der Entwickler selbst durchführen kann. Damit andere Elternteile, Großeltern oder Betreuer Inhalte auf das Gerät laden können, braucht es eine einfache Web-Oberfläche, die im lokalen Netzwerk erreichbar ist.

---

## Überblick

Ein leichtgewichtiger Webserver läuft als **Docker-Container auf dem Pi** und bietet ein Browser-basiertes Portal zum Verwalten der Medieninhalte. Erreichbar über `http://<pi-ip>:8080` (oder `http://hoermond.local:8080` via mDNS) von jedem Gerät im lokalen Netzwerk — Laptop, Tablet, Smartphone.

---

## Kernfunktionen

### F1 — Datei-Upload

- Drag-and-Drop oder Datei-Picker für Audiodateien (MP3, M4B, FLAC, OGG, WAV) und Ordner.
- Upload-Ziel wählbar: **Hörbücher** (`audiobooks/`) oder **Musik** (`music/`).
- Fortschrittsanzeige pro Datei und gesamt.
- Ordner-Upload erhält Verzeichnisstruktur (z.B. `Autor/Titel/01.mp3`).
- Maximale Dateigröße: unbegrenzt (typische Hörbücher 200–800 MB), aber mit Chunk-Upload für Stabilität bei großen Dateien über WLAN.
- Nach Abschluss eines Uploads: automatischer MPD-Rescan wird ausgelöst (nutzt bestehenden inotify-Watcher oder expliziten Trigger).

### F2 — Bibliotheksansicht

- Auflistung aller vorhandenen Medien, gruppiert nach Typ (Hörbücher / Musik).
- Pro Eintrag: Titel, Autor/Interpret, Dauer, Dateigröße, Cover (wenn vorhanden), Fortschritt (aus SQLite).
- Sortierung: alphabetisch, nach Hinzufüge-Datum, nach zuletzt gehört.
- Suchfunktion (Freitext über Titel/Autor).

### F3 — Medien verwalten

- Einzelne Medien oder ganze Alben/Hörbücher löschen.
- Lösch-Bestätigung (keine Undo-Funktion, daher expliziter Dialog).
- Nach dem Löschen: MPD-Rescan, Aufräumen von verwaisten Einträgen in `playback_position`.
- Metadaten bearbeiten: Titel und Autor manuell korrigieren (schreibt in SQLite `media`-Tabelle; Tags in der Audiodatei bleiben unverändert).

### F4 — Gerätestatus

- Aktueller Wiedergabestatus: was spielt gerade, Position, Lautstärke.
- Speicherbelegung: frei / belegt auf `/mnt/hoermond`, visuell (Balken + Zahlen).
- Sync-Log: letzte Synchronisierungsvorgänge (nutzt bestehende `SyncLogEntry`-Daten).
- Geräte-Uptime, App-Version.

### F5 — Zugangsschutz

- Kein Login im klassischen Sinne (lokales Netzwerk = vertrauenswürdig), aber:
- **Lösch- und Bearbeitungsoperationen** erfordern die Eltern-PIN (dieselbe wie auf dem Gerät, aus SQLite `settings`).
- PIN-Eingabe gilt für die Browser-Session (Cookie/Token, kein dauerhaftes Login).
- Upload ist ohne PIN möglich (Hinzufügen ist unkritisch).

---

## Architektur

### Container-Aufbau

```
┌─────────────────────────────────────────┐
│  Docker-Container "hoermond-web"        │
│                                         │
│  ┌─────────────┐    ┌───────────────┐   │
│  │  Frontend    │    │  Backend      │   │
│  │  (SPA)       │    │  (REST API)   │   │
│  │  Vite/React  │    │  Node/Fastify │   │
│  └──────┬───────┘    └──────┬────────┘   │
│         │    served by      │            │
│         └───────────────────┘            │
│                    │                     │
└────────────────────┼─────────────────────┘
                     │ Bind-Mounts
         ┌───────────┼───────────┐
         ▼           ▼           ▼
   /mnt/hoermond   SQLite-DB   sync.log
   (Mediendaten)   (read+write) (read-only)
```

### Technologie-Stack

| Komponente | Technologie | Begründung |
|------------|------------|------------|
| **Backend** | Node.js + Fastify | Gleicher Stack wie Electron-Main; Typen-Sharing mit bestehendem Projekt (`ipc-contract.ts`, DB-Schema) |
| **Frontend** | React + Vite | Gleicher Stack wie Electron-Renderer; gemeinsame Komponenten/Typen möglich |
| **Datei-Upload** | tus-Protokoll (resumable) oder `multipart/form-data` mit Chunk-Support | Robustheit bei großen Dateien über WLAN |
| **Container** | Docker (docker-compose) | Isoliert vom Host-System; einfaches Update; Port 8080 |
| **DB-Zugriff** | better-sqlite3 (read-write) | Direkter Zugriff auf dieselbe `hoermond.db` wie die Electron-App; WAL-Mode erlaubt parallele Reader |

### Bind-Mounts (docker-compose)

```yaml
volumes:
  - /mnt/hoermond:/media                        # Audiodateien lesen + schreiben
  - /var/lib/mediaplayer/hoermond.db:/data/hoermond.db  # SQLite DB
  - /var/lib/mediaplayer/sync/sync.log:/data/sync.log:ro  # Sync-Log (nur lesen)
```

### API-Endpunkte (Entwurf)

```
GET    /api/library                  → Bibliotheksliste (nutzt gleiche Logik wie library:list)
GET    /api/library/:path/cover      → Cover-Bild
GET    /api/status                   → Gerätestatus, Speicher, Version
GET    /api/status/player            → Aktueller Wiedergabestatus
GET    /api/sync/log                 → Sync-Log-Einträge

POST   /api/upload/:type             → Datei-Upload (type = audiobooks | music)
POST   /api/upload/:type/chunk       → Chunk-Upload für große Dateien

POST   /api/auth/verify-pin          → PIN verifizieren → Session-Token
DELETE /api/library/:path            → Medium löschen (PIN-geschützt)
PATCH  /api/library/:path/metadata   → Metadaten bearbeiten (PIN-geschützt)

POST   /api/rescan                   → MPD-Rescan auslösen
```

---

## Abgrenzungen (Out of Scope)

- **Kein Zugriff von außerhalb des lokalen Netzwerks.** Kein Reverse-Proxy, kein HTTPS, kein DynDNS. Das Portal ist bewusst nur im Heimnetz erreichbar.
- **Keine Fernsteuerung der Wiedergabe.** Der Webzugriff zeigt den Status, steuert aber nicht (Play/Pause/Skip). Das bleibt dem Kind am Gerät vorbehalten.
- **Kein Benutzer-Management.** Es gibt keine Accounts — nur die eine Eltern-PIN für sensible Aktionen.
- **Kein Streaming.** Audiodateien werden nicht über das Web abgespielt — das Portal ist rein für Verwaltung.
- **Keine Änderung der Geräte-Einstellungen** (Lautstärke-Limit, PIN ändern, BT). Das bleibt in den Elterneinstellungen auf dem Gerät (S10).

---

## Integrationen mit bestehender Architektur

### SQLite-Zugriff (Shared DB)

Die Electron-App und der Web-Container teilen sich dieselbe SQLite-Datenbank. WAL-Mode (bereits konfiguriert) erlaubt:
- Einen Writer (Electron-Main hat Priorität bei Wiedergabe-State).
- Mehrere Reader (Web-Backend liest Bibliothek, Fortschritt, Settings).
- Writes vom Web-Backend (Metadaten-Update, Löschungen) sind kurzlebig und unkritisch — Kollision mit Electron-Writes unwahrscheinlich, da verschiedene Tabellen/Rows betroffen.

**Risiko:** Gleichzeitiger Write-Zugriff bei `SQLITE_BUSY` — Backend muss mit Retry und kurzem Timeout arbeiten.

### Medien-Dateisystem

Upload schreibt direkt nach `/mnt/hoermond/audiobooks/` bzw. `/mnt/hoermond/music/`. Der bestehende inotify-Watcher (`media-watcher.service`) erkennt neue Dateien und löst automatisch einen MPD-Rescan aus. Zusätzlich kann das Web-Backend nach abgeschlossenem Upload einen expliziten Rescan triggern (Schreiben eines Events in `sync.log` oder direkter `mpc update`-Aufruf).

### PIN-Verifikation

Das Web-Backend liest den gehashten PIN aus `settings`-Tabelle (`key = 'pin_hash'`) und verifiziert selbst mit derselben Hash-Bibliothek wie `security/pin.ts`. Kein IPC zur Electron-App nötig.

---

## Nichtfunktionale Anforderungen

- **Performance:** Muss auf dem Pi 4 (4 GB RAM) neben der laufenden Electron-App + MPD funktionieren. Docker-Container sollte < 128 MB RAM belegen.
- **Responsive:** Web-UI muss auf Smartphone (320px) bis Desktop funktionieren — Hauptnutzung wahrscheinlich vom Handy aus.
- **Startup:** Container startet automatisch beim Boot (`restart: unless-stopped`), nach der Electron-App.
- **Updates:** Container-Image wird lokal gebaut oder per `docker pull` aktualisiert; `docker-compose up -d` genügt.
- **Robustheit:** Upload-Abbruch (WLAN-Trennung) darf keine korrupten Dateien hinterlassen — temporärer Upload-Ordner + atomisches Move.
- **Sprache:** UI auf Deutsch (konsistent mit der Geräte-App).

---

## Offene Fragen / Entscheidungen

1. **Upload-Mechanismus:** Einfaches `multipart/form-data` mit clientseitigem Chunking vs. tus-Protokoll (resumable uploads)? tus ist robuster, aber mehr Infrastruktur.
2. **mDNS:** Soll der Pi sich als `hoermond.local` ankündigen (Avahi)? Macht die URL benutzerfreundlicher, erfordert aber Avahi-Setup auf dem Host.
3. **Benachrichtigung nach Upload:** Soll die Electron-App eine visuelle Bestätigung zeigen, wenn über das Web neue Medien hochgeladen wurden? (z.B. Toast „Neue Medien verfügbar")
4. **Cover-Upload:** Soll das Web-Portal auch das manuelle Hochladen eines Cover-Bildes pro Medium ermöglichen (überschreibt dann den automatischen Fetch aus M7)?
5. **Mono-Repo vs. separates Repo:** Soll der Web-Container-Code im selben Repository leben (z.B. `web/`) oder separat?

---

## Akzeptanzkriterien (Definition of Done)

- [ ] `docker-compose up -d` startet den Web-Container auf dem Pi; Portal ist unter `http://<pi-ip>:8080` erreichbar.
- [ ] Upload einer MP3-Datei über den Browser → Datei liegt in `/mnt/hoermond/music/`; erscheint nach < 30 s in der Bibliothek (Web + Gerät).
- [ ] Upload eines Hörbuch-Ordners (Autor/Titel/01–10.mp3) → Verzeichnisstruktur bleibt erhalten.
- [ ] Bibliotheksansicht im Web zeigt dieselben Medien wie das Gerät (Konsistenz).
- [ ] Löschen eines Mediums erfordert PIN-Eingabe; nach Bestätigung ist die Datei weg und verschwindet vom Gerät.
- [ ] Speicheranzeige zeigt korrekten freien Platz auf `/mnt/hoermond`.
- [ ] Upload einer 500-MB-Datei über WLAN wird mit Fortschrittsanzeige durchgeführt und übersteht kurze WLAN-Aussetzer (kein korrupter Zustand).
- [ ] Container belegt < 128 MB RAM im Betrieb.
- [ ] Web-UI funktioniert auf Smartphone (Chrome/Safari) und Desktop-Browser.
- [ ] Container überlebt Neustart des Pi (`restart: unless-stopped`).
