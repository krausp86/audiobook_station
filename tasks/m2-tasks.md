# M2 — Medien hörbar machen (Sync + Backend + Durchstich-Player): Task-Plan

## Überblick & Abhängigkeitsgraph

M2 macht das Gerät erstmals *nützlich*: Medien landen per `rsync`/SSH auf dem Pi,
ein inotify-Watcher löst einen MPD-Rescan aus, eine **provisorische Textliste** auf
dem Touchscreen zeigt die erkannten Medien, und ein Tap startet die hörbare
Wiedergabe über die 3,5-mm-Klinke. Die Position wird alle 10 s in SQLite
geschrieben; nach Stecker-Ziehen + Reboot läuft das Medium an der gespeicherten
Stelle automatisch weiter.

Bewusst ein **vertikaler Durchstich**: das Frontend (T2.16) ist Wegwerf-UI und wird
in M3 durch das Cover-Grid ersetzt. Die *Daten*grundlage (E17-Sortierung,
`MediaItem`-Modell, Sync-Events) wird jedoch schon hier final und zukunftssicher
angelegt, sodass M3/M7 sie nur noch darstellen.

Der Plan trennt vier Arbeitsstränge:

- **System (T2.01–T2.05):** `media-sync`-SSH-User mit chroot, inotify-Watcher,
  Verzeichnis-/Rechtekonzept, beets. Läuft **auf dem Pi**.
- **IPC-Vertrag (T2.06):** zentrales Artefakt, das Backend- und Frontend-Strang
  entkoppelt. **Zuerst**, weil beide Stränge davon abhängen. Auf dem Laptop.
- **Backend / Electron-Main (T2.07–T2.15):** MPD-Client, `mpc idle`-Loop,
  SQLite-Schema, Positions-Persistenz, Resume, `library:list`-Merge, E17-Logik.
  Hardware-unabhängig — auf dem Laptop entwickelt und mit Vitest getestet.
- **Frontend (T2.16):** provisorische Trefferliste. Auf dem Laptop.

Die Integration (T2.17) deployt das neue App-Bundle auf den Pi; die Härtung
(T2.18) verifiziert den End-to-End-Resume-Test inkl. Stecker-Ziehen.

**Wichtig — Pi vs. Laptop:**
- **Auf dem Pi:** T2.01–T2.05, T2.17, T2.18.
- **Auf dem Laptop (hardwareunabhängig):** T2.06–T2.16.
- Der Backend-Strang lässt sich auf dem Laptop voll testen, wenn dort ein lokaler
  MPD mit einem Test-`music_directory` läuft (T2.07 beschreibt das). So kann
  entwickelt werden, ohne dauernd auf den Pi zu deployen.

**Architektur-Grundvertrag (aus M1, hier zwingend einzuhalten):**
- Electron-Main kapselt ALLE privilegierten Operationen (MPD, SQLite, System).
- Renderer ist rein — kein Gerätezustand, kein Node-Zugriff.
- Kommunikation NUR über die IPC-Bridge; neue Channels **additiv** zur Whitelist.
- MPD ist autoritativ für Player-Zustand; SQLite für Fortschritt/Settings/Onboarding.
- **KEIN Polling** für Player-Status: `mpc idle`-Loop ist die einzige Quelle.
- Alle UI-Strings in `de.json`, key-basiert über `useT()`. Keine hartcodierten Strings.

> **IPC-Namenskonvention (wichtig):** Der bestehende Vertrag in
> `app/src/shared/ipc-contract.ts` benutzt **Doppelpunkt-Namespacing**
> (`app:getVersion`, `app:ready`). M2 folgt dieser Konvention konsequent:
> `library:list`, `player:play`, `player:state` usw. — **nicht** die Punkt-Notation
> (`library.list`) aus manchen Prosa-Texten. Der Vertrag ist eine getypte
> Interface-Map (`IpcCommands` / `IpcEvents`), keine Funktionsliste; neue Channels
> werden als neue Keys ergänzt und in `ALLOWED_COMMANDS`/`ALLOWED_EVENTS` eingetragen.

```
SYSTEM-STRANG (auf dem Pi)
  T2.01 Verzeichnis- & Rechtekonzept (audiobooks/ music/ .state)
     │
     ├── T2.02 🔒 media-sync SSH-User + chroot + rsync-Restriction
     │
     ├── T2.03 media-watcher.service (inotify, debounced Rescan, Sync-Log)
     │
     └── T2.05 beets-Konfiguration für Metadaten-Anreicherung

IPC-VERTRAG (auf dem Laptop) — zuerst, entkoppelt Backend/Frontend
  T2.06 ipc-contract.ts erweitern (MediaItem, player:*, library:*, sync:status …)
     │
     ├──────────────── BACKEND-STRANG (auf dem Laptop) ────────────────┐
     │                                                                  │
  T2.07 lokaler MPD-Testaufbau + mpd-Client-Modul (Verbindung)          │
     │                                                                  │
     ├── T2.08 MPD-Steuerung (play/pause/stop/seek/getState)            │
     │      │                                                           │
     │      └── T2.09 mpc-idle-Event-Loop + Reconnect → player:state    │
     │                                                                  │
  T2.10 SQLite-Schema v2 (media, playback_position, onboarding_seen)    │
     │                                                                  │
     ├── T2.11 Vitest-Setup + E17-Sortierfunktion (rein, getestet)      │
     │                                                                  │
     ├── T2.12 library:list-Merge (MPD-DB + SQLite → LibraryListResponse)
     │                                                                  │
     ├── T2.13 Positions-Persistenz (alle 10 s, WAL)                    │
     │                                                                  │
     ├── T2.14 Resume-Logik beim App-Start                              │
     │                                                                  │
     └── T2.15 onboarding:get/set + library:rescan + sync:status-Brücke │
                                                                        │
  FRONTEND-STRANG (auf dem Laptop) ─────────────────────────────────────┘
  T2.16 Provisorische Trefferliste (Text) — library:list + Tap → player:play

INTEGRATION & HÄRTUNG (auf dem Pi)
  (T2.05 + T2.15 + T2.16) ── T2.17 App-Bundle + Services auf Pi deployen
                                 │
                                 └── T2.18 E2E-Resume-Test (Stecker ziehen)
```

## Task-Liste (Übersicht)

| ID | Titel | Größe | Ort |
|----|-------|-------|-----|
| T2.01 | Verzeichnis- & Rechtekonzept `audiobooks/`, `music/`, `.state` | S | Pi |
| T2.02 | 🔒 `media-sync` SSH-User: chroot + rsync-Restriction, Key-only | M | Pi |
| T2.03 | `media-watcher.service`: inotify, debounced Rescan, Sync-Log | M | Pi |
| T2.04 | 🔒 Sicherheits-Review chroot + Sync-Kette | S | Pi |
| T2.05 | beets-Konfiguration für Metadaten-Anreicherung | M | Pi |
| T2.06 | `ipc-contract.ts` erweitern (MediaItem, player/library/sync) | M | Laptop |
| T2.07 | Lokaler MPD-Testaufbau + `mpd-client` (Verbindung, Parser) | M | Laptop |
| T2.08 | MPD-Steuerung: play/pause/stop/seek/getState | M | Laptop |
| T2.09 | `mpc idle`-Event-Loop + Reconnect → `player:state` | L | Laptop |
| T2.10 | SQLite-Schema v2 (media, playback_position, onboarding_seen) | M | Laptop |
| T2.11 | Vitest-Setup + E17-Sortierfunktion (rein, getestet) | M | Laptop |
| T2.12 | `library:list`-Merge (MPD-DB + SQLite → LibraryListResponse) | M | Laptop |
| T2.13 | Positions-Persistenz (alle 10 s, WAL) | M | Laptop |
| T2.14 | Resume-Logik beim App-Start | M | Laptop |
| T2.15 | `onboarding:*` + `library:rescan` + `sync:status`-Brücke | M | Laptop |
| T2.16 | Provisorische Trefferliste (Text-UI, Wegwerf) | S | Laptop |
| T2.17 | App-Bundle + Services auf Pi deployen | M | Pi |
| T2.18 | E2E-Resume-Test (Stecker ziehen, < 30 s Sync, ≤ 10 s Toleranz) | L | Pi |

---

## Tasks (Detail)

### T2.01 — Verzeichnis- & Rechtekonzept `audiobooks/`, `music/`, `.state`
**Größe:** S
**Abhängigkeiten:** keine (setzt M1-`/media`-Partition voraus)
**Vorbedingung:** Pi läuft, `/media` ist die separate ext4-Partition (M1 T1.02), `/var/lib/mediaplayer` ist bind-mount auf `/media/.state` (M1 T1.07/ADR-2). SSH-Zugang als `player`.

**Ziel:** Eine klar definierte Verzeichnisstruktur unter `/media` mit korrekten Besitz-/Rechtebits, sodass (a) der spätere `media-sync`-User per chroot schreiben darf, (b) MPD und Electron lesen dürfen, (c) interner State (`.state`) und Medien sauber getrennt sind.

**Beschreibung:**
1. Auf dem Pi die Zielverzeichnisse anlegen (falls aus M1 noch leer/fehlend):
   ```bash
   sudo mkdir -p /media/audiobooks /media/music /media/.state /media/.covers
   ```
   - `audiobooks/` und `music/` sind die zwei Medien-Wurzeln (M2 trennt die Liste danach).
   - `.state/` ist das bind-mount-Ziel für `/var/lib/mediaplayer` (SQLite, MPD-DB) — schon aus M1 vorhanden.
   - `.covers/` ist der spätere Cover-Cache (beets/M7 schreiben hierhin; in M2 nur angelegt).
2. Eine Gruppe für gemeinsamen Medienzugriff einrichten und beide relevanten User hineinnehmen:
   ```bash
   sudo groupadd -f media
   sudo usermod -aG media player
   sudo usermod -aG media mpd 2>/dev/null || true   # mpd-User existiert ggf. erst nach M1-T1.04
   ```
3. Besitz und Rechte setzen. Medien-Wurzeln gehören `player:media`, sind gruppen-beschreibbar und setgid (damit neue Dateien die Gruppe `media` erben):
   ```bash
   sudo chown -R player:media /media/audiobooks /media/music /media/.covers
   sudo chmod -R 2775 /media/audiobooks /media/music /media/.covers   # rwxrwsr-x
   # .state bleibt restriktiv (nur player), enthält keine Sync-Ziele:
   sudo chown -R player:player /media/.state
   sudo chmod 700 /media/.state
   ```
4. Konvention dokumentieren (als Kommentar-Datei, dient später Sync-Skripten als Referenz):
   ```bash
   sudo tee /media/README.sync >/dev/null <<'EOF'
   # Hörmond Medien-Layout (M2)
   # audiobooks/<Autor>/<Titel>/...   -> type=audiobook
   # music/<Künstler>/<Album>/...     -> type=music
   # .state/   -> interner SQLite/MPD-State (NICHT syncen)
   # .covers/  -> Cover-Cache (beets/M7)
   # rsync-Ziel des media-sync-Users ist /media (chroot-Wurzel, siehe T2.02).
   EOF
   ```

**Caveats:**
- Das setgid-Bit (`2` vor `775`) ist wichtig: ohne es erhalten per rsync neu angelegte Unterordner die Primärgruppe des schreibenden Users statt `media`, und MPD könnte sie nicht lesen.
- `/media/.state` darf **nicht** in die chroot-beschreibbare Zone fallen — der `media-sync`-User soll internen State nicht überschreiben können. Da chroot-Wurzel `/media` ist (T2.02), liegt `.state` zwar *innerhalb* der chroot, ist aber nur für `player` (Mode 700) schreibbar — der `media-sync`-User kommt nicht heran.
- `mpd`-User existiert nur, wenn das Distro-Paket ihn anlegt (M1 nutzt `user "player"` in `mpd.conf`, MPD läuft also als `player`). Dann ist Schritt 2 für `mpd` unnötig — `|| true` fängt das ab.

**Dateien/Artefakte:**
- Erstellt: `/media/audiobooks`, `/media/music`, `/media/.covers`, `/media/README.sync`, Gruppe `media`
- Verändert: Gruppenmitgliedschaft `player`

**Verifikation:**
```bash
ls -lan /media                    # audiobooks/music: Mode 2775, Gruppe = media-GID
stat -c '%A %U:%G' /media/audiobooks   # erwartet: drwxrwsr-x player:media
stat -c '%A %U:%G' /media/.state       # erwartet: drwx------ player:player
id player | grep -q media && echo "player in media-Gruppe OK"
```
Sehen: setgid-Bit (`s`) auf `audiobooks`/`music`, `.state` nur für `player`.
Nicht sehen: world-writable Verzeichnisse (`o+w`), `.state` für andere lesbar.

---

### T2.02 — 🔒 `media-sync` SSH-User: chroot + rsync-Restriction, Key-only
**Größe:** M
**Abhängigkeiten:** T2.01
**Vorbedingung:** Verzeichnisstruktur und `media`-Gruppe existieren (T2.01). SSH-Server (`openssh-server`) läuft (aus M1). Du hast den **öffentlichen** SSH-Key des Sync-Quellrechners (Laptop) zur Hand.

**Ziel:** Ein dedizierter SSH-User `media-sync`, der **ausschließlich** per Public-Key zu `/media` synchronisieren kann: kein Passwort, keine interaktive Shell, `ChrootDirectory` auf `/media`, eingeschränkt auf rsync (bzw. internal-sftp). Ein interaktiver Login-Versuch wird abgewiesen.

**Beschreibung:**
> 🔒 **Sicherheitskritisch.** Ein falsches Ownership der chroot-Wurzel macht entweder den Login unmöglich („broken pipe") oder hebelt die Beschränkung aus. Vor Abnahme: Security-Review (T2.04).

1. System-User anlegen — ohne Passwort, mit Login-Shell `nologin`:
   ```bash
   sudo useradd --system --no-create-home --shell /usr/sbin/nologin --groups media media-sync
   sudo passwd -l media-sync     # Passwort-Login hart sperren
   ```
2. **chroot-Anforderung an die Wurzel:** sshd verlangt, dass die `ChrootDirectory` und **alle** übergeordneten Pfade `root:root` gehören und **nicht** gruppen-/world-writable sind. `/media` selbst muss also `root:root 0755` sein:
   ```bash
   sudo chown root:root /media
   sudo chmod 755 /media
   ```
   Die *Unterverzeichnisse* `audiobooks/` und `music/` bleiben `player:media 2775` (aus T2.01) und sind damit für `media-sync` (Mitglied der `media`-Gruppe) beschreibbar. Genau das ist die gewünschte Asymmetrie: chroot-Wurzel unschreibbar, Medien-Unterordner schreibbar.
3. Das SSH-Verzeichnis für den Key **außerhalb** der chroot ablegen (innerhalb der chroot kann sshd den Key nicht lesen, bevor der User „drin" ist — Standard-Muster ist ein root-eigenes Key-Verzeichnis):
   ```bash
   sudo mkdir -p /etc/ssh/authorized_keys.d
   sudo chmod 755 /etc/ssh/authorized_keys.d
   # Public-Key des Laptops eintragen (Key-String vom Laptop einsetzen):
   echo 'ssh-ed25519 AAAA...laptop-pubkey... media-sync@laptop' \
     | sudo tee /etc/ssh/authorized_keys.d/media-sync >/dev/null
   sudo chown root:root /etc/ssh/authorized_keys.d/media-sync
   sudo chmod 644 /etc/ssh/authorized_keys.d/media-sync
   ```
4. sshd-Konfiguration als drop-in anlegen (nicht die Hauptdatei editieren):
   ```bash
   sudo tee /etc/ssh/sshd_config.d/10-media-sync.conf >/dev/null <<'EOF'
   Match User media-sync
       # Key liegt von root verwaltet außerhalb der chroot:
       AuthorizedKeysFile /etc/ssh/authorized_keys.d/%u
       PasswordAuthentication no
       KbdInteractiveAuthentication no
       PubkeyAuthentication yes
       # chroot auf die Medien-Partition:
       ChrootDirectory /media
       # Kein TCP-/Agent-/X11-Forwarding, kein Tunnel:
       AllowTcpForwarding no
       AllowAgentForwarding no
       X11Forwarding no
       PermitTunnel no
       PermitTTY no
       # rsync läuft serverseitig über die Shell -> wir erzwingen ausschließlich
       # rsync im Server-Modus per ForceCommand-Wrapper (siehe Schritt 5).
       ForceCommand /usr/local/sbin/media-sync-shell
   EOF
   ```
5. ForceCommand-Wrapper, der **nur** `rsync --server` durchlässt und alles andere abweist. (rsync setzt beim Sync die Env-Variable `SSH_ORIGINAL_COMMAND` auf den serverseitigen rsync-Aufruf.):
   ```bash
   sudo tee /usr/local/sbin/media-sync-shell >/dev/null <<'EOF'
   #!/bin/sh
   # Whitelist: nur rsync im Server-Modus erlauben. Alles andere -> ablehnen.
   case "$SSH_ORIGINAL_COMMAND" in
     "rsync --server "*)
       exec $SSH_ORIGINAL_COMMAND
       ;;
     *)
       echo "Nur rsync ist erlaubt (media-sync)." >&2
       exit 1
       ;;
   esac
   EOF
   sudo chmod 755 /usr/local/sbin/media-sync-shell
   sudo chown root:root /usr/local/sbin/media-sync-shell
   ```
   **rsync in der chroot:** Da der serverseitige `rsync`-Aufruf *innerhalb* der chroot (`/media`) ausgeführt wird, muss das `rsync`-Binary und seine Bibliotheken in der chroot verfügbar sein. Es gibt zwei robuste Optionen:
   - **Option A (einfach, empfohlen):** Statt rsync-over-shell den **`internal-sftp`**-Server nutzen (in sshd eingebaut, braucht keine chroot-Binaries) und auf dem Laptop mit `rsync -e ssh --rsync-path=...` zu arbeiten ist dann nicht möglich — daher synct der Laptop in diesem Fall via `sftp`/`rclone`. Für reines rsync ist Option B nötig.
   - **Option B (rsync in chroot):** rsync-Binary + Abhängigkeiten in die chroot kopieren:
     ```bash
     sudo mkdir -p /media/usr/bin /media/bin /media/lib /media/lib/aarch64-linux-gnu
     sudo cp /usr/bin/rsync /media/usr/bin/
     # Abhängige Libs ermitteln und kopieren:
     for lib in $(ldd /usr/bin/rsync | awk '{print $3}' | grep '^/'); do
       sudo mkdir -p "/media$(dirname "$lib")"
       sudo cp "$lib" "/media$lib"
     done
     # Loader (ld-linux) ebenfalls:
     sudo cp /lib/ld-linux-aarch64.so.1 /media/lib/ 2>/dev/null || true
     ```
     Da das Layout fragil ist, ist **Option A der bevorzugte Default** für M2; nur wenn das Akzeptanzkriterium explizit `rsync` über SSH verlangt (tut es), nutze Option B und dokumentiere die kopierten Pfade. *Empfehlung: Option B wählen, weil das AK wörtlich `rsync` fordert.*
6. sshd-Konfiguration testen und neu laden:
   ```bash
   sudo sshd -t          # Syntax-Check, MUSS fehlerfrei sein
   sudo systemctl reload ssh
   ```

**Caveats:**
- `ChrootDirectory /media` schlägt fehl, wenn `/media` **nicht** `root:root` und nicht `0755` ist — sshd loggt dann „bad ownership or modes for chroot directory". Genau deshalb gehört in T2.01 die Wurzel `root`, die Unterordner aber `player:media`.
- Wird Option B gewählt und ein Library-Update auf dem Pi gemacht (rsync aktualisiert), kann das in chroot kopierte `rsync` veralten — bei Bookworm-Upgrades neu kopieren. In `README.sync` vermerken.
- `PermitTTY no` + `ForceCommand` zusammen verhindern jede interaktive Shell. Ein `ssh media-sync@pi` (ohne rsync) landet im Wrapper-`else`-Zweig und wird mit Exit 1 abgewiesen.
- `passwd -l` allein reicht nicht — `PasswordAuthentication no` im Match-Block ist die eigentliche Absicherung; beides kombinieren (Defense in Depth).
- Der private Key bleibt **nur** auf dem Laptop. Niemals den privaten Key auf den Pi legen.

**Dateien/Artefakte:**
- Erstellt: User `media-sync`, `/etc/ssh/sshd_config.d/10-media-sync.conf`, `/etc/ssh/authorized_keys.d/media-sync`, `/usr/local/sbin/media-sync-shell`, ggf. chroot-rsync unter `/media/usr/bin` (Option B)
- Verändert: Gruppenmitgliedschaft, `/media`-Ownership (root)

**Verifikation:**
```bash
# Vom Laptop aus — erfolgreicher Sync (Testdatei):
mkdir -p /tmp/sync-test/audiobooks/TestAutor/TestBuch
echo dummy > /tmp/sync-test/audiobooks/TestAutor/TestBuch/01.mp3
rsync -avz /tmp/sync-test/ media-sync@<pi-ip>:/      # Ziel ist chroot-Wurzel = /media
# erwartet: Übertragung ohne Passwortabfrage, Datei landet in /media/audiobooks/...

# Interaktiver Login MUSS scheitern:
ssh media-sync@<pi-ip>                                # erwartet: "Nur rsync ist erlaubt", Exit 1
ssh media-sync@<pi-ip> 'cat /etc/passwd'              # erwartet: abgewiesen (Exit 1)

# Auf dem Pi — Datei angekommen + Rechte korrekt:
ls -l /media/audiobooks/TestAutor/TestBuch/          # 01.mp3 vorhanden, Gruppe media
sudo journalctl -u ssh --since '5 min ago' | grep media-sync
```
Sehen: rsync überträgt ohne Passwort; jeder Nicht-rsync-Befehl wird abgewiesen.
Nicht sehen: Passwortabfrage, funktionierende Shell, „bad ownership"-Fehler im sshd-Log.

---

### T2.03 — `media-watcher.service`: inotify, debounced Rescan, Sync-Log
**Größe:** M
**Abhängigkeiten:** T2.01 (Verzeichnisse), profitiert von T2.02 (echter Sync zum Testen)
**Vorbedingung:** `/media/audiobooks` und `/media/music` existieren; MPD läuft und `mpc update` funktioniert auf dem Pi.

**Ziel:** Ein systemd-Dienst, der `/media` rekursiv mit inotify überwacht, einen Schwall von rsync-Events **debounced** (auf das Sync-Ende wartet), dann **einmal** `mpc update` (MPD-Rescan) auslöst und jeden Vorgang in ein **Sync-Log** schreibt, das später (M7) für das Sync-Icon ausgewertet wird.

**Beschreibung:**
1. Werkzeuge installieren:
   ```bash
   sudo apt-get install -y inotify-tools mpc
   ```
2. Sync-Log-Verzeichnis auf persistentem, schreibbarem Pfad anlegen (überlebt overlayfs, liegt unter `.state`/bind-mount):
   ```bash
   sudo mkdir -p /var/lib/mediaplayer/sync
   sudo chown player:player /var/lib/mediaplayer/sync
   ```
   Das Log ist eine zeilenweise JSON-Datei (JSONL) — Electron-Main (T2.15) liest sie für `sync:status`:
   - Pfad: `/var/lib/mediaplayer/sync/sync.log` (JSONL, eine Zeile pro Ereignis)
3. Watcher-Skript schreiben. Kernidee „Sync-abgeschlossen-Heuristik": bei jedem inotify-Event einen Timer-Stempel neu setzen; ein separater Loop löst den Rescan erst aus, wenn **N Sekunden Ruhe** herrschten (Debounce-Fenster). So feuert ein großer rsync-Lauf nur **einen** Rescan am Ende.
   ```bash
   sudo tee /usr/local/sbin/media-watcher.sh >/dev/null <<'EOF'
   #!/bin/bash
   set -euo pipefail

   MEDIA_DIR="/media"
   LOG="/var/lib/mediaplayer/sync/sync.log"
   DEBOUNCE_SECS=8        # Ruhe-Fenster nach letztem Event, bevor Rescan startet
   WATCH_EXCLUDE='(/\.state/|/\.covers/|/\.sync-tmp|README\.sync)'

   log_event() {
     # $1 = phase (started|completed|error), $2 = optionale message
     local ts phase msg
     ts="$(date --iso-8601=seconds)"
     phase="$1"; msg="${2:-}"
     printf '{"ts":"%s","phase":"%s","message":"%s"}\n' "$ts" "$phase" "$msg" >> "$LOG"
   }

   # Zeitstempel der letzten Aktivität (in eine tmpfs-Datei, kein State-Bloat):
   LAST_EVENT_FILE="$(mktemp)"
   trap 'rm -f "$LAST_EVENT_FILE"' EXIT
   date +%s > "$LAST_EVENT_FILE"

   # 1) inotify-Producer: schreibt bei jedem relevanten Event den aktuellen Zeitstempel.
   (
     inotifywait -m -r -q \
       -e close_write -e moved_to -e create -e delete -e move \
       --exclude "$WATCH_EXCLUDE" \
       "$MEDIA_DIR" | while read -r _; do
         date +%s > "$LAST_EVENT_FILE"
       done
   ) &
   PRODUCER_PID=$!
   trap 'kill "$PRODUCER_PID" 2>/dev/null; rm -f "$LAST_EVENT_FILE"' EXIT

   # 2) Debounce-Consumer: prüft sekündlich, ob seit dem letzten Event Ruhe herrscht.
   PENDING=0
   while true; do
     sleep 1
     now=$(date +%s)
     last=$(cat "$LAST_EVENT_FILE")
     idle=$(( now - last ))
     if [ "$idle" -lt "$DEBOUNCE_SECS" ]; then
       # Es gab kürzlich Aktivität -> ein Rescan steht aus.
       if [ "$PENDING" -eq 0 ]; then
         PENDING=1
         log_event "started" "Sync-Aktivität erkannt"
       fi
     else
       # Ruhe-Fenster erreicht und ein Rescan war ausstehend -> jetzt EINMAL scannen.
       if [ "$PENDING" -eq 1 ]; then
         PENDING=0
         if mpc --wait update >/dev/null 2>&1; then
           log_event "completed" "MPD-Rescan abgeschlossen"
         else
           log_event "error" "mpc update fehlgeschlagen"
         fi
       fi
     fi
   done
   EOF
   sudo chmod 755 /usr/local/sbin/media-watcher.sh
   sudo chown root:root /usr/local/sbin/media-watcher.sh
   ```
4. systemd-Unit anlegen (läuft als `player`, damit `mpc` den lokalen MPD-Socket/Port erreicht):
   ```bash
   sudo tee /etc/systemd/system/media-watcher.service >/dev/null <<'EOF'
   [Unit]
   Description=Hörmond media watcher (inotify -> debounced MPD rescan)
   After=mpd.service network.target
   Wants=mpd.service

   [Service]
   Type=simple
   User=player
   Group=player
   ExecStart=/usr/local/sbin/media-watcher.sh
   Restart=always
   RestartSec=3
   # inotify-Limits ggf. erhöhen (große Bibliotheken):
   # (siehe Caveats — sysctl fs.inotify.max_user_watches)

   [Install]
   WantedBy=multi-user.target
   EOF
   sudo systemctl daemon-reload
   sudo systemctl enable --now media-watcher.service
   ```
5. inotify-Watch-Limit für große Bibliotheken erhöhen (rekursives Watch verbraucht ein Watch pro Verzeichnis):
   ```bash
   echo 'fs.inotify.max_user_watches=524288' | sudo tee /etc/sysctl.d/40-inotify.conf
   sudo sysctl --system
   ```

**Caveats:**
- **`mpc --wait update`** blockiert bis der Rescan fertig ist — dadurch loggt `completed` erst nach echtem Abschluss. Ohne `--wait` würde `completed` zu früh geschrieben.
- Debounce-Fenster (`DEBOUNCE_SECS=8`) muss kürzer als das 30-s-AK sein, aber lang genug, dass eine kurze rsync-Pause (z. B. zwischen Dateien) keinen verfrühten Rescan auslöst. 8 s ist ein guter Startwert; bei sehr langsamen Netzen ggf. erhöhen — aber Summe (Debounce + Rescan-Dauer) muss < 30 s bleiben.
- inotify sieht **keine** Events von rsync, das in die chroot schreibt? Doch — die chroot ändert nur den Pfad-Namespace des sshd-Kindprozesses; die echten Inodes unter `/media` werden modifiziert und der (nicht-chrootete) Watcher sieht sie normal.
- Das `--exclude` muss `.state` und `.covers` ausschließen, sonst lösen SQLite-WAL-Schreibvorgänge (alle 10 s, T2.13!) eine Endlosschleife aus Rescans aus. **Kritischer Fallstrick.**
- `inotifywait -r` auf einem riesigen Baum kann beim Start dauern und Watches verbrauchen — daher das sysctl-Limit (Schritt 5).

**Dateien/Artefakte:**
- Erstellt: `/usr/local/sbin/media-watcher.sh`, `/etc/systemd/system/media-watcher.service`, `/etc/sysctl.d/40-inotify.conf`, `/var/lib/mediaplayer/sync/sync.log`

**Verifikation:**
```bash
systemctl status media-watcher.service          # active (running)
# Sync auslösen (vom Laptop, T2.02) oder lokal eine Datei kopieren:
cp /pfad/zu/test.mp3 /media/music/TestAlbum/01.mp3   # ggf. Ordner anlegen
# innerhalb < 30 s:
tail -f /var/lib/mediaplayer/sync/sync.log
# erwartet: eine "started"-Zeile, kurz darauf eine "completed"-Zeile
mpc listall | grep -i TestAlbum                  # neuer Track in der MPD-DB
```
Sehen: genau **eine** `started`+`completed`-Paarung pro Sync-Lauf, neuer Track in `mpc listall`.
Nicht sehen: Rescan-Sturm (viele `completed` in Folge), Endlos-Rescan durch `.state`-Events.

---

### T2.04 — 🔒 Sicherheits-Review chroot + Sync-Kette
**Größe:** S
**Abhängigkeiten:** T2.02, T2.03
**Vorbedingung:** `media-sync`-User und Watcher laufen.

**Ziel:** Verpflichtender Sicherheits-Review der Sync-Kette dokumentiert; keine offene Angriffsfläche durch fehlerhafte chroot-/Rechte-Konfiguration.

**Beschreibung:**
Diese Checkliste abarbeiten und das Ergebnis in `tasks/m2-security-review.md` festhalten (Datum, geprüft von, Befund je Punkt):
1. **chroot-Ausbruch:** Kann `media-sync` außerhalb `/media` schreiben/lesen?
   ```bash
   rsync -avz /tmp/x media-sync@<pi-ip>:/../etc/    # MUSS scheitern / in /media bleiben
   ssh media-sync@<pi-ip> 'ls /'                    # MUSS abgewiesen werden (ForceCommand)
   ```
2. **Wurzel-Ownership:** `stat -c '%U:%G %a' /media` → `root:root 755`. (sonst chroot unsicher/kaputt)
3. **Key-only:** `PasswordAuthentication no` greift — Login mit falschem Key wird ohne Passwort-Prompt abgewiesen:
   ```bash
   ssh -o PreferredAuthentications=password media-sync@<pi-ip>   # MUSS sofort scheitern
   ```
4. **Keine Privilegien-Eskalation:** `media-sync` ist `nologin`, kein sudo, gehört nur `media`+Eigengruppe:
   ```bash
   sudo -l -U media-sync 2>&1 | grep -i 'not allowed\|may not'   # keine sudo-Rechte
   groups media-sync
   ```
5. **State-Schutz:** `media-sync` kann `/media/.state` (SQLite) nicht überschreiben:
   ```bash
   rsync -avz /tmp/evil media-sync@<pi-ip>:/.state/   # MUSS scheitern (Mode 700, fremder Owner)
   ```
6. **Watcher-Schleifenschutz:** SQLite-WAL-Schreibvorgänge unter `.state` lösen keinen Rescan aus (Exclude greift) — 60 s beobachten, dass ohne echten Sync keine `completed`-Zeilen entstehen.
7. **Wrapper-Robustheit:** `media-sync-shell` lässt nur `rsync --server` durch; kein `rsync --server ... ; rm -rf` o. Ä. (Wrapper nutzt `case`-Glob, kein `eval` mit Shell-Injection).

**Caveats:**
- Punkt 1 ist der wichtigste: ein falsches chroot-Ownership lässt den Login zwar funktionieren, aber sshd verweigert die chroot — testen, dass der Sync wirklich *in* `/media` landet und nicht etwa in `/home/media-sync`.
- Review-Ergebnis ist Abnahme-relevant (siehe milestones.md §Sicherheits-Checkpoints).

**Dateien/Artefakte:**
- Erstellt: `tasks/m2-security-review.md` (Befund-Protokoll)

**Verifikation:** Alle 7 Punkte „bestanden"; Protokoll committet.
Sehen: dokumentierte Befunde, alle „MUSS scheitern"-Tests scheitern wirklich.
Nicht sehen: erfolgreichen Zugriff außerhalb `/media`, Passwort-Login, sudo-Rechte.

---

### T2.05 — beets-Konfiguration für Metadaten-Anreicherung
**Größe:** M
**Abhängigkeiten:** T2.01
**Vorbedingung:** `/media/audiobooks`, `/media/music`, `/media/.covers` existieren; Python3 verfügbar (Bookworm-Default).

**Ziel:** beets ist installiert und so konfiguriert, dass es Metadaten (Titel, Künstler/Autor, Album, Dauer) anreichert und Cover in den Cache (`/media/.covers`) legen kann — **ohne** Dateien zu verschieben oder zu zerstören. Cover-Fetch wird in M7 final geschärft; M2 legt nur die Pipeline an.

**Beschreibung:**
1. beets installieren (System-Python; Bookworm braucht ggf. `--break-system-packages` oder ein venv — venv ist sauberer):
   ```bash
   sudo apt-get install -y python3-venv
   sudo python3 -m venv /opt/beets-venv
   sudo /opt/beets-venv/bin/pip install beets pyacoustid requests
   sudo ln -sf /opt/beets-venv/bin/beet /usr/local/bin/beet
   ```
2. beets-Konfiguration anlegen (als `player`, da der Watcher/Scan als `player` läuft):
   ```bash
   sudo -u player mkdir -p /home/player/.config/beets
   sudo -u player tee /home/player/.config/beets/config.yaml >/dev/null <<'EOF'
   directory: /media
   library: /var/lib/mediaplayer/beets/library.db

   # NIEMALS Originaldateien verschieben/umbenennen/löschen — nur lesen + Tags lesen.
   import:
     move: no
     copy: no
     write: no            # M2: Tags nicht in Dateien zurückschreiben (read-only Medien)
     autotag: yes
     quiet: yes
     resume: yes
     incremental: yes     # bereits importierte Pfade überspringen

   # Cover-Art in den Cache legen (M2: lokale eingebettete Cover bevorzugen,
   # Online-Fetch erst in M7 aktivieren).
   plugins: fetchart embedart
   fetchart:
     auto: no             # M2: kein Online-Fetch (Netz/Datenschutz) — M7 schaltet ein
     cautious: yes
     sources: filesystem
     store_source: yes
   paths:
     default: $albumartist/$album/$track $title
   EOF
   sudo -u player mkdir -p /var/lib/mediaplayer/beets
   ```
3. Einen nicht-destruktiven Scan-Wrapper bereitstellen, den der Watcher (oder ein manueller Rescan) aufrufen kann. **Wichtig:** beets ist hier nur **Metadaten-Lieferant** — die autoritative Medienliste kommt aus MPD (T2.12). beets schreibt seine Erkenntnisse in seine eigene `library.db`, aus der Electron-Main später Titel/Autor/Dauer ergänzen kann.
   ```bash
   sudo tee /usr/local/sbin/media-enrich.sh >/dev/null <<'EOF'
   #!/bin/sh
   # Nicht-destruktive Metadaten-Anreicherung. Wird nach MPD-Rescan aufgerufen.
   # -q quiet, -A keine Autotag-Rückfragen (alles automatisch übernehmen).
   exec /usr/local/bin/beet import -q -A /media/audiobooks /media/music
   EOF
   sudo chmod 755 /usr/local/sbin/media-enrich.sh
   sudo chown root:root /usr/local/sbin/media-enrich.sh
   ```
4. (Optional, empfohlen) den Aufruf in den Watcher (T2.03) einhängen: in `media-watcher.sh` nach erfolgreichem `mpc --wait update` zusätzlich `sudo -u player /usr/local/sbin/media-enrich.sh` ausführen — aber als `player`, ohne sudo, da der Watcher schon als `player` läuft, also direkt `/usr/local/sbin/media-enrich.sh`. Diesen Aufruf erst nach `log_event "completed"` setzen, damit beets-Laufzeit den Rescan-Abschluss nicht verzögert.

**Caveats:**
- `move: no`, `copy: no`, `write: no` ist **nicht verhandelbar**: Die Medienpartition wird per rsync von außen befüllt; beets darf weder verschieben noch in die Dateien zurückschreiben (Konsistenz mit MPD + read-only-Medien-Annahme).
- beets-Library (`/var/lib/mediaplayer/beets/library.db`) liegt auf der persistenten, schreibbaren `.state`-Zone (overlayfs-sicher).
- `fetchart auto: no` in M2 — kein Online-Zugriff; das hält M2 netz-/datenschutzfrei. M7 dreht das auf.
- beets-Autotag kann bei Hörbüchern (lange Kapitel) MusicBrainz-Fehltreffer liefern. Da `write: no`, ist das ungefährlich (nur in beets-DB, nicht in Dateien). Für M2 reichen die eingebetteten ID3-Tags ohnehin.

**Dateien/Artefakte:**
- Erstellt: `/opt/beets-venv`, `/home/player/.config/beets/config.yaml`, `/usr/local/sbin/media-enrich.sh`, `/var/lib/mediaplayer/beets/`

**Verifikation:**
```bash
beet version                                   # beets meldet Version
# Testdatei mit Tags scannen:
/usr/local/sbin/media-enrich.sh
beet ls                                         # zeigt erkannte Tracks mit Titel/Artist
beet ls -f '$title — $artist — $length'         # Dauer/Felder vorhanden
ls -la /media/audiobooks /media/music           # KEINE verschobenen/umbenannten Dateien
```
Sehen: beets erkennt Titel/Artist/Länge; Originaldateien unverändert an Ort und Stelle.
Nicht sehen: verschobene/umbenannte Mediendateien, geänderte mtimes der Originale.

---

### T2.06 — `ipc-contract.ts` erweitern (MediaItem, player/library/sync)
**Größe:** M
**Abhängigkeiten:** keine (rein Code, Laptop)
**Vorbedingung:** electron-vite-Projekt aus M1 baut; `app/src/shared/ipc-contract.ts` existiert mit `app:getVersion`-Konvention.

**Ziel:** Der zentrale IPC-Vertrag ist **additiv** um alle M2-Commands/Events und die Datentypen `MediaItem`/`LibraryListResponse`/`PlayerState`/`SyncStatus` erweitert; Whitelists aktualisiert. Backend- und Frontend-Strang können danach unabhängig gegen diesen Vertrag arbeiten.

**Beschreibung:**
1. Datei `app/src/shared/ipc-contract.ts` öffnen. **Bestehende Keys (`app:getVersion`, `app:ready`, `app:dbError`) nicht ändern** — nur ergänzen.
2. Oben (vor `IpcCommands`) die Datentypen einfügen:
   ```typescript
   /** Ein Medien-Eintrag für Liste/Grid. type unterscheidet Hörbuch vs. Musik. */
   export interface MediaItem {
     /** Relativer Pfad in /media, z. B. "audiobooks/Autor/Titel". Stabiler Schlüssel. */
     path: string;
     type: 'audiobook' | 'music';
     title: string;
     /** Autor (Hörbuch) bzw. Künstler (Musik). */
     artist?: string;
     /** Gesamtdauer in Sekunden, falls bekannt. */
     duration?: number;
     /** Lokaler Pfad zu cover.jpg/folder.jpg oder undefined (Fallback in M3/M7). */
     coverPath?: string;
     /** 0–100. */
     progressPercent: number;
     /** ISO-8601-Timestamp des letzten Abspielens, falls je gespielt. */
     lastPlayed?: string;
     status: 'new' | 'in_progress' | 'done';
   }

   /** Antwort von library:list — bereits in die zwei E17-Sektionen gruppiert. */
   export interface LibraryListResponse {
     /** Fortschritt > 0 % und < 100 %, nach lastPlayed absteigend. */
     recentlyPlayed: MediaItem[];
     /** Rest (neu + fertig), alphabetisch nach title. */
     all: MediaItem[];
   }

   /** Aktueller Player-Zustand (MPD ist autoritativ). */
   export interface PlayerState {
     status: 'playing' | 'paused' | 'stopped';
     /** Pfad des aktiven Mediums (relativ zu /media) oder null. */
     currentPath: string | null;
     /** Aktuelle Position in Sekunden. */
     position: number;
     /** Gesamtdauer des aktiven Mediums in Sekunden, falls bekannt. */
     duration: number | null;
   }

   /** Sync-Status-Push (Quelle für das Sync-Icon in M7). */
   export interface SyncStatus {
     phase: 'started' | 'completed' | 'error';
     ts: string; // ISO-8601
     message?: string;
   }
   ```
3. `IpcCommands` additiv erweitern (innerhalb des bestehenden Interfaces, nach `app:getVersion`):
   ```typescript
   'library:list': {
     request: void;
     response: LibraryListResponse;
   };
   'library:rescan': {
     request: void;
     response: { triggered: boolean };
   };
   'player:play': {
     /** path relativ zu /media; position optional (Sekunden) für Resume/„weiter". */
     request: { path: string; position?: number };
     response: { ok: boolean };
   };
   'player:pause': {
     request: void;
     response: { ok: boolean };
   };
   'player:stop': {
     request: void;
     response: { ok: boolean };
   };
   'player:seek': {
     request: { position: number }; // Sekunden, absolut
     response: { ok: boolean };
   };
   'player:getState': {
     request: void;
     response: PlayerState;
   };
   'onboarding:getSeen': {
     request: void;
     response: { seen: boolean };
   };
   'onboarding:setSeen': {
     request: { seen: boolean };
     response: { ok: boolean };
   };
   ```
4. `IpcEvents` additiv erweitern:
   ```typescript
   'player:state': PlayerState;
   'library:updated': { ts: number };
   'sync:status': SyncStatus;
   ```
5. Die Whitelists ergänzen (genau die neuen Keys hinzufügen — sonst wirft die Preload-Bridge „IPC … not allowed"):
   ```typescript
   export const ALLOWED_COMMANDS: IpcCommandChannel[] = [
     'app:getVersion',
     'library:list',
     'library:rescan',
     'player:play',
     'player:pause',
     'player:stop',
     'player:seek',
     'player:getState',
     'onboarding:getSeen',
     'onboarding:setSeen',
   ];
   export const ALLOWED_EVENTS: IpcEventChannel[] = [
     'app:ready',
     'app:dbError',
     'player:state',
     'library:updated',
     'sync:status',
   ];
   ```
6. **`REPLAYABLE_EVENTS` NICHT erweitern.** Laut Architekt-Kommentar in der Datei dürfen dort nur echte One-Shot-Lifecycle-Events stehen. `player:state` ist hochfrequent — käme es in die Replay-Liste, bekäme jeder neue Subscriber sofort einen veralteten Snapshot. State wird stattdessen per `player:getState` (pull) beim Mount geholt. (`library:updated`/`sync:status` ebenfalls nicht replaybar.)
7. Typecheck:
   ```bash
   cd /home/kmlpatrick/Privat/repos/audiobook_station/app && npm run typecheck
   ```

**Caveats:**
- Die `IpcEvents`-Werte sind im bestehenden Vertrag das **Payload-Objekt direkt** (z. B. `'app:ready': { ts: number }`), nicht in `{ payload: ... }` verpackt. Neue Events exakt so modellieren (`'player:state': PlayerState`).
- Nichts an `HoermondBridge`, `invoke`/`on`-Signaturen oder der Preload-Logik ändern — die ist generisch über die Maps typisiert und funktioniert mit den neuen Keys automatisch.
- Keine bestehenden Keys umbenennen oder Punkt-Notation einführen — Konvention ist Doppelpunkt.

**Dateien/Artefakte:**
- Verändert: `app/src/shared/ipc-contract.ts`

**Verifikation:**
```bash
cd /home/kmlpatrick/Privat/repos/audiobook_station/app
npm run typecheck            # 0 Fehler
grep -c "player:" src/shared/ipc-contract.ts   # neue Commands/Events vorhanden
```
Sehen: Typecheck grün; alle 8 neuen Commands + 3 Events in den Whitelists.
Nicht sehen: geänderte M1-Keys, `player:state` in `REPLAYABLE_EVENTS`.

---

### T2.07 — Lokaler MPD-Testaufbau + `mpd-client` (Verbindung, Parser)
**Größe:** M
**Abhängigkeiten:** T2.06
**Vorbedingung:** Auf dem Laptop: Node + das electron-vite-Projekt. MPD lässt sich lokal installieren.

**Ziel:** (a) Ein lokaler MPD auf dem Laptop mit Test-Medien, sodass der Backend-Strang ohne Pi entwickelbar ist. (b) Ein `mpd-client`-Modul im Main-Prozess, das eine TCP-Verbindung zu MPD (127.0.0.1:6600) aufbaut, das MPD-Protokoll spricht und Antworten in JS-Objekte parst.

**Beschreibung:**
1. **Lokaler MPD (Laptop):**
   ```bash
   sudo apt-get install -y mpd mpc           # oder brew install mpd (macOS)
   mkdir -p ~/hoermond-mpd/{audiobooks,music,db}
   # ein paar Test-Audiodateien hineinkopieren
   tee ~/hoermond-mpd/mpd.conf >/dev/null <<EOF
   music_directory     "$HOME/hoermond-mpd"
   db_file             "$HOME/hoermond-mpd/db/mpd.db"
   log_file            "$HOME/hoermond-mpd/db/mpd.log"
   pid_file            "$HOME/hoermond-mpd/db/mpd.pid"
   state_file          "$HOME/hoermond-mpd/db/state"
   bind_to_address     "127.0.0.1"
   port                "6600"
   auto_update         "no"
   audio_output { type "pulse" name "local" }
   EOF
   mpd ~/hoermond-mpd/mpd.conf
   mpc update && mpc listall                 # Test-Tracks erscheinen
   ```
2. **MPD-Client-Modul.** MPD spricht ein zeilenbasiertes Textprotokoll über TCP: Server schickt beim Connect `OK MPD <version>`; jeder Befehl wird mit `\n` abgeschlossen; Antwort endet mit `OK\n` oder `ACK [..] <fehler>\n`. Datei `app/src/main/mpd/client.ts`:
   ```typescript
   import { Socket } from 'net';

   const MPD_HOST = process.env['HOERMOND_MPD_HOST'] ?? '127.0.0.1';
   const MPD_PORT = Number(process.env['HOERMOND_MPD_PORT'] ?? 6600);

   /** Geparste MPD-Antwort: Liste von Key-Value-Maps (z. B. ein Eintrag pro Datei). */
   export type MpdResponse = Record<string, string>[];

   /**
    * Eine einzelne, kurzlebige Command-Verbindung zu MPD. Für den idle-Loop
    * (T2.09) wird eine SEPARATE, langlebige Verbindung verwendet — niemals
    * Command- und idle-Verbindung mischen.
    */
   export class MpdClient {
     private sock: Socket | null = null;
     private buffer = '';
     private queue: ((res: MpdResponse) => void)[] = [];
     private errQueue: ((err: Error) => void)[] = [];
     private ready = false;

     connect(): Promise<void> {
       return new Promise((resolve, reject) => {
         const sock = new Socket();
         this.sock = sock;
         sock.setEncoding('utf8');
         sock.connect(MPD_PORT, MPD_HOST);
         sock.once('error', reject);
         sock.on('data', (chunk: string) => this.onData(chunk));
         // Auf das initiale "OK MPD x.y.z" warten:
         const onFirst = (chunk: string): void => {
           if (chunk.startsWith('OK MPD')) {
             this.ready = true;
             sock.off('data', onFirst);
             resolve();
           }
         };
         sock.on('data', onFirst);
       });
     }

     private onData(chunk: string): void {
       if (!this.ready) return; // initiales OK MPD wird von onFirst behandelt
       this.buffer += chunk;
       // Eine Antwort endet mit "OK\n" oder "ACK ...\n".
       let idx: number;
       // Bei OK: ganze Antwort bis inkl. "OK\n"
       while ((idx = this.findResponseEnd(this.buffer)) !== -1) {
         const raw = this.buffer.slice(0, idx);
         this.buffer = this.buffer.slice(idx);
         this.resolveOne(raw);
       }
     }

     private findResponseEnd(buf: string): number {
       const ok = buf.indexOf('OK\n');
       const ack = buf.search(/ACK \[.*\].*\n/);
       const ends = [ok === -1 ? Infinity : ok + 3, ack === -1 ? Infinity : buf.indexOf('\n', ack) + 1];
       const end = Math.min(...ends);
       return end === Infinity ? -1 : end;
     }

     private resolveOne(raw: string): void {
       if (raw.startsWith('ACK')) {
         const rej = this.errQueue.shift();
         this.queue.shift();
         rej?.(new Error(`MPD error: ${raw.trim()}`));
         return;
       }
       const res = this.parse(raw.replace(/OK\n$/, ''));
       this.errQueue.shift();
       this.queue.shift()?.(res);
     }

     /** Parst MPD-Key-Value-Zeilen. Ein neuer "file:"/"directory:" startet ein neues Objekt. */
     private parse(text: string): MpdResponse {
       const out: MpdResponse = [];
       let cur: Record<string, string> | null = null;
       for (const line of text.split('\n')) {
         if (!line) continue;
         const sep = line.indexOf(': ');
         if (sep === -1) continue;
         const key = line.slice(0, sep);
         const val = line.slice(sep + 2);
         if (key === 'file' || key === 'directory' || (cur && key in cur)) {
           if (cur) out.push(cur);
           cur = {};
         }
         if (!cur) cur = {};
         cur[key] = val;
       }
       if (cur) out.push(cur);
       return out;
     }

     /** Sendet einen Befehl, liefert die geparste Antwort. */
     send(command: string): Promise<MpdResponse> {
       return new Promise((resolve, reject) => {
         if (!this.sock || !this.ready) {
           reject(new Error('MPD not connected'));
           return;
         }
         this.queue.push(resolve);
         this.errQueue.push(reject);
         this.sock.write(command + '\n');
       });
     }

     close(): void {
       this.sock?.destroy();
       this.sock = null;
       this.ready = false;
     }
   }
   ```
3. Eine Singleton-Fabrik bereitstellen, die der Rest des Main-Prozesses nutzt — `app/src/main/mpd/index.ts`:
   ```typescript
   import { MpdClient } from './client';

   let client: MpdClient | null = null;

   export async function getMpd(): Promise<MpdClient> {
     if (client) return client;
     const c = new MpdClient();
     await c.connect();
     client = c;
     return c;
   }
   ```

**Caveats:**
- **Zwei getrennte Verbindungen:** Die hier gebaute Command-Verbindung darf **nicht** für `idle` benutzt werden. `idle` blockiert die Verbindung bis ein Event kommt — würde man darüber Befehle senden, hängt alles. T2.09 baut dafür eine eigene Verbindung.
- MPD-Werte können `: ` im Wert enthalten (z. B. Titel mit Doppelpunkt) — `indexOf(': ')` (erstes Vorkommen) ist korrekt, da der Key nie `: ` enthält.
- Der hier gezeigte Parser ist bewusst simpel und für M2 ausreichend. Mehrwertige Tags (mehrere `Artist:`) sind in M2 selten; falls relevant, in T2.12 normalisieren.
- Auf dem Pi läuft MPD bereits (M1, `127.0.0.1:6600`) — dasselbe Modul funktioniert unverändert, nur die Env-Hosts unterscheiden sich (Default passt für beide).

**Dateien/Artefakte:**
- Erstellt: `app/src/main/mpd/client.ts`, `app/src/main/mpd/index.ts`; lokaler MPD-Testaufbau (`~/hoermond-mpd`)

**Verifikation:**
```bash
cd /home/kmlpatrick/Privat/repos/audiobook_station/app && npm run typecheck   # grün
# In T2.08 wird das Modul erstmals end-to-end gegen den lokalen MPD getestet.
mpc status     # lokaler MPD läuft und antwortet
```
Sehen: Typecheck grün, lokaler MPD antwortet.
Nicht sehen: Compile-Fehler im Client-Modul.

---

### T2.08 — MPD-Steuerung: play/pause/stop/seek/getState
**Größe:** M
**Abhängigkeiten:** T2.07
**Vorbedingung:** `MpdClient` verbindet sich erfolgreich gegen lokalen MPD.

**Ziel:** Main-Prozess-Funktionen, die MPD steuern (`play` eines Pfads ab optionaler Position, `pause`, `stop`, `seek`) und den aktuellen Zustand als `PlayerState` zurückgeben; verdrahtet als IPC-Handler für `player:*`-Commands.

**Beschreibung:**
1. Steuer-Modul `app/src/main/mpd/control.ts`:
   ```typescript
   import { getMpd } from './index';
   import type { PlayerState } from '@shared/ipc-contract';

   /**
    * Spielt ein Medium ab. MPD adressiert Dateien über den Pfad RELATIV zum
    * music_directory (= /media). Unsere MediaItem.path-Konvention ist genau das
    * (z. B. "audiobooks/Autor/Titel/01.mp3").
    *
    * Für ein mehrteiliges Medium (Ordner mit vielen Tracks) wird der Ordner als
    * Queue geladen; position bezieht sich in M2 auf den ERSTEN Track. (Track+
    * Offset-Resume für Kapitel-Medien kommt in M4 — Datenmodell ist in T2.10
    * dafür schon vorbereitet.)
    */
   export async function play(path: string, position?: number): Promise<void> {
     const mpd = await getMpd();
     await mpd.send('clear');
     // add akzeptiert Datei ODER Verzeichnis (rekursiv). Pfad in Anführungszeichen,
     // doppelte Quotes im Pfad escapen:
     const esc = path.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
     await mpd.send(`add "${esc}"`);
     await mpd.send('play');
     if (position && position > 0) {
       // seekcur springt im aktuell spielenden Song zur absoluten Sekunde:
       await mpd.send(`seekcur ${Math.floor(position)}`);
     }
   }

   export async function pause(): Promise<void> {
     const mpd = await getMpd();
     await mpd.send('pause 1');
   }

   export async function stop(): Promise<void> {
     const mpd = await getMpd();
     await mpd.send('stop');
   }

   export async function seek(position: number): Promise<void> {
     const mpd = await getMpd();
     await mpd.send(`seekcur ${Math.max(0, Math.floor(position))}`);
   }

   /** Liest MPD-Status + aktuellen Song und baut PlayerState. */
   export async function getState(): Promise<PlayerState> {
     const mpd = await getMpd();
     const [status] = await mpd.send('status');
     const [song] = (await mpd.send('currentsong')) ?? [];
     const st = status ?? {};
     const mpdState = st['state'] ?? 'stop'; // play|pause|stop
     const statusMap = { play: 'playing', pause: 'paused', stop: 'stopped' } as const;
     // "elapsed" (Sekunden, float) bzw. "time" "elapsed:total"
     const elapsed = st['elapsed'] ? parseFloat(st['elapsed']) : 0;
     const durRaw = song?.['Time'] ?? st['duration'];
     const duration = durRaw ? Math.round(parseFloat(durRaw)) : null;
     return {
       status: statusMap[mpdState as keyof typeof statusMap] ?? 'stopped',
       currentPath: song?.['file'] ?? null,
       position: Math.round(elapsed),
       duration,
     };
   }
   ```
2. IPC-Handler im Main-Prozess registrieren. In `app/src/main/index.ts` (nach dem bestehenden `app:getVersion`-Handler) hinzufügen:
   ```typescript
   import { play, pause, stop, seek, getState } from './mpd/control';

   ipcMain.handle('player:play', async (_e, payload: { path: string; position?: number }) => {
     await play(payload.path, payload.position);
     return { ok: true };
   });
   ipcMain.handle('player:pause', async () => {
     await pause();
     return { ok: true };
   });
   ipcMain.handle('player:stop', async () => {
     await stop();
     return { ok: true };
   });
   ipcMain.handle('player:seek', async (_e, payload: { position: number }) => {
     await seek(payload.position);
     return { ok: true };
   });
   ipcMain.handle('player:getState', async () => {
     return getState();
   });
   ```
   > Hinweis: Die IPC-Handler-Registrierung wird in T2.15 in ein eigenes Modul `app/src/main/ipc/register.ts` gebündelt, damit `index.ts` nicht überläuft. Für T2.08 reicht die direkte Registrierung; beim Refactor in T2.15 dorthin verschieben.

**Caveats:**
- MPD-Pfade sind **relativ** zum `music_directory`. Niemals absolute `/media/...`-Pfade an MPD geben — sonst „No such directory". `MediaItem.path` ist bereits relativ.
- `add "<verzeichnis>"` lädt rekursiv alle Tracks des Ordners in die Queue (gut für Hörbuch-Ordner). Für eine Einzeldatei lädt es genau diese.
- `seekcur` wirkt nur, wenn bereits etwas spielt — deshalb erst `play`, dann `seekcur` (Reihenfolge im Code beachten).
- Fehler aus `mpd.send` (ACK) propagieren als rejected Promise → der IPC-Handler wirft → Renderer bekommt eine rejected `invoke`. In M2 reicht das; Toast-Fehlerbehandlung kommt in M6.

**Dateien/Artefakte:**
- Erstellt: `app/src/main/mpd/control.ts`
- Verändert: `app/src/main/index.ts`

**Verifikation:**
```bash
cd /home/kmlpatrick/Privat/repos/audiobook_station/app
npm run typecheck && npm run dev
# Im laufenden Dev-Fenster (DevTools-Konsole des Renderers):
#   await window.hoermond.invoke('player:play', { path: 'music/TestAlbum/01.mp3' })
#   -> hörbare Wiedergabe auf dem Laptop
#   await window.hoermond.invoke('player:getState')
#   -> { status:'playing', currentPath:'music/...', position: <n>, duration: <n> }
#   await window.hoermond.invoke('player:pause'); ...invoke('player:stop')
```
Sehen: hörbare Wiedergabe, korrekter `PlayerState` mit steigender `position`.
Nicht sehen: „No such directory" (Pfad falsch/absolut), hängende `invoke` (idle-Verwechslung).

---

### T2.09 — `mpc idle`-Event-Loop + Reconnect → `player:state`
**Größe:** L
**Abhängigkeiten:** T2.08
**Vorbedingung:** Command-Verbindung und Steuerung funktionieren (T2.08).

**Ziel:** Eine **separate**, langlebige MPD-Verbindung läuft im `idle`-Modus und pusht bei jeder Zustandsänderung (`player`/`mixer`/`playlist`) ein frisches `player:state`-Event an den Renderer — **ohne Polling**. Bei MPD-Neustart/Verbindungsabbruch reconnectet der Loop automatisch mit Backoff, sodass die UI nie „taub" wird.

**Beschreibung:**
> **Architektur-Anker:** Dies ist die einzige Quelle für `player:state`. Der Renderer pollt nie. (Grundvertrag M1.)

1. Eine dedizierte idle-Verbindung implementieren. `app/src/main/mpd/idle.ts`:
   ```typescript
   import { Socket } from 'net';
   import type { BrowserWindow } from 'electron';
   import { getState } from './control';

   const MPD_HOST = process.env['HOERMOND_MPD_HOST'] ?? '127.0.0.1';
   const MPD_PORT = Number(process.env['HOERMOND_MPD_PORT'] ?? 6600);

   /**
    * Hält EINE eigene Verbindung NUR für `idle`. Sendet `idle player mixer
    * playlist`, wartet blockierend auf "changed: ..."-Zeilen, holt dann frischen
    * State über die (separate) Command-Verbindung und pusht player:state.
    * Reconnect mit exponentiellem Backoff bei MPD-Neustart.
    */
   export function startIdleLoop(getWindow: () => BrowserWindow | null): () => void {
     let stopped = false;
     let sock: Socket | null = null;
     let backoff = 500; // ms, verdoppelt bis max 10s

     const pushState = async (): Promise<void> => {
       try {
         const state = await getState();
         getWindow()?.webContents.send('player:state', state);
       } catch (err) {
         console.error('[idle] pushState failed:', err);
       }
     };

     const connect = (): void => {
       if (stopped) return;
       const s = new Socket();
       sock = s;
       s.setEncoding('utf8');
       let buffer = '';
       let greeted = false;

       s.connect(MPD_PORT, MPD_HOST, () => {
         backoff = 500; // erfolgreich verbunden -> Backoff zurücksetzen
       });

       s.on('data', (chunk: string) => {
         buffer += chunk;
         if (!greeted) {
           if (buffer.includes('OK MPD')) {
             greeted = true;
             buffer = '';
             // Initialen State pushen + erstes idle starten:
             void pushState();
             s.write('idle player mixer playlist\n');
           }
           return;
         }
         // Auf "changed: ..." + "OK" warten:
         if (buffer.includes('OK\n')) {
           const changed = /changed: /.test(buffer);
           buffer = '';
           if (changed) {
             void pushState();
           }
           // Sofort wieder in idle gehen:
           if (!stopped) s.write('idle player mixer playlist\n');
         }
       });

       const onClose = (): void => {
         if (stopped) return;
         sock = null;
         backoff = Math.min(backoff * 2, 10000);
         setTimeout(connect, backoff);
       };
       s.on('error', () => s.destroy());
       s.on('close', onClose);
     };

     connect();

     return () => {
       stopped = true;
       sock?.destroy();
       sock = null;
     };
   }
   ```
2. Den Loop beim App-Start starten. In `app/src/main/index.ts` innerhalb `app.whenReady().then(...)`, **nachdem** das Fenster erstellt ist:
   ```typescript
   import { startIdleLoop } from './mpd/idle';

   // ... innerhalb whenReady, nach createWindow(...):
   const mainWin = BrowserWindow.getAllWindows()[0] ?? null;
   const stopIdle = startIdleLoop(() => BrowserWindow.getAllWindows()[0] ?? mainWin);

   app.on('before-quit', () => {
     stopIdle();
   });
   ```
3. **Renderer-Seite** (Vorbereitung für T2.16): Der Renderer abonniert `player:state` per `window.hoermond.on('player:state', ...)` und holt den Initialzustand einmalig per `player:getState`. (Die konkrete UI baut T2.16.)

**Caveats:**
- **Strikte Trennung von idle- und Command-Verbindung.** `getState()` läuft über die Command-Verbindung aus T2.07/T2.08; die idle-Verbindung sendet **nur** `idle`/`noidle`. Mischt man sie, blockiert die idle-Verbindung jeden Befehl.
- Nach jedem empfangenen Event sofort wieder `idle` senden — sonst verpasst man Folgeevents („deaf UI").
- **Reconnect ist Pflicht (Risiko aus milestones.md):** MPD startet bei System-Updates/Crash neu; ohne Backoff-Reconnect bleibt die UI taub. Test: MPD neu starten, prüfen dass `player:state` danach wieder kommt.
- `idle player` allein würde Lautstärke-/Queue-Änderungen verpassen; `player mixer playlist` deckt die für M2 relevanten Subsysteme ab.
- StrictMode im Renderer kann `useEffect`-Abos doppelt mounten — der `on()`-Rückgabewert (unsubscribe) MUSS im Effect-Cleanup aufgerufen werden (T2.16 beachtet das).

**Dateien/Artefakte:**
- Erstellt: `app/src/main/mpd/idle.ts`
- Verändert: `app/src/main/index.ts`

**Verifikation:**
```bash
cd /home/kmlpatrick/Privat/repos/audiobook_station/app && npm run dev
# DevTools-Konsole des Renderers:
#   window.hoermond.on('player:state', s => console.log('STATE', s))
#   window.hoermond.invoke('player:play', { path: 'music/TestAlbum/01.mp3' })
#   -> sofort ein STATE-Log mit status:'playing'
# In einem Terminal extern: mpc pause / mpc play / mpc stop
#   -> jede Änderung erzeugt ein STATE-Log (Push, kein Polling)
# Reconnect-Test: MPD neu starten (kill + neu starten), dann mpc play
#   -> nach kurzem Backoff kommen wieder STATE-Logs
```
Sehen: Push bei jeder externen MPD-Änderung; nach MPD-Neustart wieder Events.
Nicht sehen: periodische Logs ohne Änderung (= verbotenes Polling), dauerhaft tote UI nach MPD-Neustart.

---

### T2.10 — SQLite-Schema v2 (media, playback_position, onboarding_seen)
**Größe:** M
**Abhängigkeiten:** T2.06
**Vorbedingung:** M1-Migrationsgerüst (`app/src/main/db/migrations.ts`) mit Version 1 (`settings`) vorhanden; `runMigrations` läuft idempotent über die `version`-Liste.

**Ziel:** Eine additive Migration `version: 2`, die die Tabellen `media`, `playback_position` und `onboarding_seen` anlegt — Positionsmodell **zukunftssicher** (Track-Index + Offset für Kapitel-Medien in M4).

**Beschreibung:**
1. `app/src/main/db/migrations.ts` öffnen. Bestehende `version: 1` **nicht** ändern. Neuen Eintrag an das Array anhängen:
   ```typescript
   {
     version: 2,
     up: (db) => {
       // Medien-Stammdaten. MPD bleibt autoritativ für Existenz/Dauer; diese
       // Tabelle cached anreichernde Metadaten (beets) + dient als FK-Ziel für
       // playback_position. path ist der relative Pfad (= MediaItem.path).
       db.exec(`CREATE TABLE media (
         path        TEXT PRIMARY KEY,           -- relativ zu /media
         type        TEXT NOT NULL CHECK (type IN ('audiobook','music')),
         title       TEXT NOT NULL,
         artist      TEXT,
         duration    INTEGER,                    -- Sekunden, gesamt
         cover_path  TEXT,                        -- lokaler Pfad oder NULL
         added_at    TEXT NOT NULL                -- ISO-8601
       );`);

       // Fortschritt/Resume. ZUKUNFTSSICHER: track_index + position_seconds,
       // damit Kapitel-Medien (M4B/CUE) in M4 korrekt resumen (Track + Offset).
       // In M2 ist track_index meist 0 (Position bezieht sich auf den 1. Track),
       // das Feld ist aber jetzt da, kein späteres Schema-Migrationsrisiko.
       db.exec(`CREATE TABLE playback_position (
         media_path       TEXT PRIMARY KEY
                          REFERENCES media(path) ON DELETE CASCADE,
         track_index      INTEGER NOT NULL DEFAULT 0,   -- 0-basiert in der Queue
         position_seconds INTEGER NOT NULL DEFAULT 0,   -- Offset im aktuellen Track
         last_played      TEXT NOT NULL                 -- ISO-8601
       );`);

       // Index für E17 "Zuletzt gehört"-Sortierung (last_played desc).
       db.exec(`CREATE INDEX idx_playback_last_played
                ON playback_position(last_played DESC);`);

       // Onboarding-Flag. Eigene Tabelle statt settings-Key, damit es klar
       // typisiert/abfragbar ist (E16/M3 nutzt es).
       db.exec(`CREATE TABLE onboarding_seen (
         id        INTEGER PRIMARY KEY CHECK (id = 1),  -- Singleton-Zeile
         seen      INTEGER NOT NULL DEFAULT 0,          -- 0/1
         seen_at   TEXT
       );`);
       db.exec(`INSERT INTO onboarding_seen (id, seen) VALUES (1, 0);`);
     },
   },
   ```
2. Eine kleine Daten-Zugriffsschicht (DAO) für den späteren Gebrauch (T2.12/T2.13/T2.14/T2.15). `app/src/main/db/dao.ts`:
   ```typescript
   import type Database from 'better-sqlite3';

   export interface PositionRow {
     media_path: string;
     track_index: number;
     position_seconds: number;
     last_played: string;
   }

   export function upsertPosition(
     db: Database.Database,
     mediaPath: string,
     trackIndex: number,
     positionSeconds: number,
   ): void {
     db.prepare(
       `INSERT INTO playback_position (media_path, track_index, position_seconds, last_played)
        VALUES (@p, @t, @s, @ts)
        ON CONFLICT(media_path) DO UPDATE SET
          track_index = @t, position_seconds = @s, last_played = @ts`,
     ).run({ p: mediaPath, t: trackIndex, s: positionSeconds, ts: new Date().toISOString() });
   }

   export function getAllPositions(db: Database.Database): PositionRow[] {
     return db
       .prepare(`SELECT * FROM playback_position ORDER BY last_played DESC`)
       .all() as PositionRow[];
   }

   export function getLatestPosition(db: Database.Database): PositionRow | undefined {
     return db
       .prepare(`SELECT * FROM playback_position ORDER BY last_played DESC LIMIT 1`)
       .get() as PositionRow | undefined;
   }

   export function getOnboardingSeen(db: Database.Database): boolean {
     const row = db.prepare(`SELECT seen FROM onboarding_seen WHERE id = 1`).get() as
       | { seen: number }
       | undefined;
     return (row?.seen ?? 0) === 1;
   }

   export function setOnboardingSeen(db: Database.Database, seen: boolean): void {
     db.prepare(`UPDATE onboarding_seen SET seen = @s, seen_at = @ts WHERE id = 1`).run({
       s: seen ? 1 : 0,
       ts: seen ? new Date().toISOString() : null,
     });
   }
   ```
3. `openDatabase()` gibt bereits die `Database`-Instanz zurück (M1). Für den Main-Prozess ein Singleton bereitstellen, falls noch nicht vorhanden — in `app/src/main/db/index.ts` ergänzen:
   ```typescript
   let dbSingleton: Database.Database | null = null;
   export function getDb(): Database.Database {
     if (!dbSingleton) dbSingleton = openDatabase();
     return dbSingleton;
   }
   ```

**Caveats:**
- `foreign_keys = ON` ist in M1 bereits per Pragma gesetzt — `ON DELETE CASCADE` greift also. Wenn ein Medium aus der `media`-Tabelle verschwindet (gelöscht), wird seine Position automatisch entfernt.
- **`track_index` jetzt anlegen** ist der Kern der Zukunftssicherheit (Risiko „Resume bei M4B/CUE"). Eine spätere Spaltenergänzung wäre eine zusätzliche Migration; jetzt kostenlos.
- Migration ist **rein additiv** — `runMigrations` führt nur Versionen > aktueller aus. Auf einem bestehenden M1-Gerät (version 1) wird genau v2 nachgezogen, ohne Datenverlust an `settings`.
- Tests dürfen `HOERMOND_DB_PATH=:memory:` setzen, um gegen eine In-Memory-DB zu migrieren (T2.11/T2.12).

**Dateien/Artefakte:**
- Verändert: `app/src/main/db/migrations.ts`, `app/src/main/db/index.ts`
- Erstellt: `app/src/main/db/dao.ts`

**Verifikation:**
```bash
cd /home/kmlpatrick/Privat/repos/audiobook_station/app
HOERMOND_DB_PATH=/tmp/t2-schema.db node -e "require('./out/main/...')"  # oder via Test (T2.11)
# Einfacher: nach npm run dev einmal starten, dann:
sqlite3 /tmp/t2-schema.db ".tables"          # media playback_position onboarding_seen settings schema_version
sqlite3 /tmp/t2-schema.db "SELECT version FROM schema_version;"   # 1 und 2
sqlite3 /tmp/t2-schema.db "PRAGMA table_info(playback_position);" # track_index + position_seconds vorhanden
```
Sehen: alle drei neuen Tabellen, `schema_version` enthält 1 **und** 2, `track_index`-Spalte da.
Nicht sehen: fehlende Tabellen, doppelte Migrationsausführung, FK-Fehler.

---

### T2.11 — Vitest-Setup + E17-Sortierfunktion (rein, getestet)
**Größe:** M
**Abhängigkeiten:** T2.06
**Vorbedingung:** `MediaItem`/`LibraryListResponse`-Typen im Vertrag (T2.06).

**Ziel:** Ein Test-Runner (Vitest) ist eingerichtet, und die **E17-Grid-Sortierung** existiert als **reine, getestete** Funktion im Main-Prozess: zwei Sektionen „Zuletzt gehört" (0 % < Fortschritt < 100 %, `lastPlayed` absteigend) und „Alle" (Rest, alphabetisch nach Titel). 100 % wandert zurück in „Alle".

**Beschreibung:**
1. Vitest als Dev-Dependency installieren (das Projekt hat noch keinen Test-Runner):
   ```bash
   cd /home/kmlpatrick/Privat/repos/audiobook_station/app
   npm install -D vitest
   ```
2. `package.json`-Scripts ergänzen (vorhandene Scripts nicht ändern):
   ```jsonc
   "test": "vitest run",
   "test:watch": "vitest"
   ```
3. Minimale Vitest-Konfig, die die `@shared`-/`@renderer`-Aliase aus electron-vite kennt. `app/vitest.config.ts`:
   ```typescript
   import { defineConfig } from 'vitest/config';
   import { resolve } from 'path';

   export default defineConfig({
     test: { environment: 'node', include: ['src/**/*.test.ts'] },
     resolve: {
       alias: {
         '@shared': resolve(__dirname, 'src/shared'),
       },
     },
   });
   ```
4. Die reine Sortierfunktion. `app/src/main/library/sort.ts`:
   ```typescript
   import type { MediaItem, LibraryListResponse } from '@shared/ipc-contract';

   /**
    * E17-Grid-Sortierung. Reine Funktion (keine Seiteneffekte) — daher gut
    * testbar und vom restlichen Main-Prozess entkoppelt.
    *
    * Regeln:
    *  - "Zuletzt gehört": progressPercent > 0 UND < 100, sortiert nach
    *    lastPlayed absteigend (neueste zuerst). Fehlt lastPlayed, gilt als ältest.
    *  - "Alle": alle übrigen (0 % = neu, 100 % = fertig), alphabetisch nach
    *    title (locale-aware, de, case-insensitiv).
    *  - 100 % wandert explizit zurück nach "Alle" (gilt nicht als "zuletzt gehört").
    */
   export function sortLibrary(items: MediaItem[]): LibraryListResponse {
     const recentlyPlayed: MediaItem[] = [];
     const all: MediaItem[] = [];

     for (const item of items) {
       const p = item.progressPercent;
       if (p > 0 && p < 100) recentlyPlayed.push(item);
       else all.push(item); // 0 % (neu) und 100 % (fertig)
     }

     recentlyPlayed.sort((a, b) => {
       const ta = a.lastPlayed ?? '';
       const tb = b.lastPlayed ?? '';
       // ISO-Strings sind lexikografisch sortierbar; desc -> b vs a:
       return tb.localeCompare(ta);
     });

     all.sort((a, b) => a.title.localeCompare(b.title, 'de', { sensitivity: 'base' }));

     return { recentlyPlayed, all };
   }
   ```
5. Tests. `app/src/main/library/sort.test.ts`:
   ```typescript
   import { describe, it, expect } from 'vitest';
   import { sortLibrary } from './sort';
   import type { MediaItem } from '@shared/ipc-contract';

   const make = (over: Partial<MediaItem>): MediaItem => ({
     path: over.path ?? 'x',
     type: 'audiobook',
     title: 'X',
     progressPercent: 0,
     status: 'new',
     ...over,
   });

   describe('sortLibrary (E17)', () => {
     it('puts 0% < progress < 100% into recentlyPlayed, rest into all', () => {
       const r = sortLibrary([
         make({ path: 'a', title: 'A', progressPercent: 0, status: 'new' }),
         make({ path: 'b', title: 'B', progressPercent: 50, status: 'in_progress' }),
         make({ path: 'c', title: 'C', progressPercent: 100, status: 'done' }),
       ]);
       expect(r.recentlyPlayed.map((m) => m.path)).toEqual(['b']);
       expect(r.all.map((m) => m.path).sort()).toEqual(['a', 'c']);
     });

     it('sorts recentlyPlayed by lastPlayed descending', () => {
       const r = sortLibrary([
         make({ path: 'old', progressPercent: 10, lastPlayed: '2026-06-01T10:00:00Z' }),
         make({ path: 'new', progressPercent: 10, lastPlayed: '2026-06-10T10:00:00Z' }),
       ]);
       expect(r.recentlyPlayed.map((m) => m.path)).toEqual(['new', 'old']);
     });

     it('sorts all alphabetically by title (de, case-insensitive)', () => {
       const r = sortLibrary([
         make({ path: '1', title: 'Zebra', progressPercent: 0 }),
         make({ path: '2', title: 'apfel', progressPercent: 0 }),
         make({ path: '3', title: 'Ähre', progressPercent: 100 }),
       ]);
       expect(r.all.map((m) => m.title)).toEqual(['Ähre', 'apfel', 'Zebra']);
     });

     it('treats 100% as done -> all, never recentlyPlayed', () => {
       const r = sortLibrary([make({ path: 'd', progressPercent: 100, status: 'done' })]);
       expect(r.recentlyPlayed).toHaveLength(0);
       expect(r.all).toHaveLength(1);
     });

     it('handles missing lastPlayed as oldest', () => {
       const r = sortLibrary([
         make({ path: 'has', progressPercent: 10, lastPlayed: '2026-06-10T10:00:00Z' }),
         make({ path: 'none', progressPercent: 10 }),
       ]);
       expect(r.recentlyPlayed[0].path).toBe('has');
     });
   });
   ```

**Caveats:**
- Die Funktion muss **rein** bleiben (kein DB-/MPD-Zugriff) — das ist die explizite Anforderung (E17 „als reine, getestete Funktion"). DB→`MediaItem`-Mapping passiert in T2.12, nicht hier.
- `localeCompare(..., 'de', { sensitivity: 'base' })` sorgt für korrekte deutsche Sortierung (Ä≈A, case-insensitiv). Ohne Locale sortiert JS nach Code-Points (Ä hinter Z) — falsch.
- Grenzfälle exakt nach Spec: genau `0` und genau `100` gehören in „Alle", nur strikt dazwischen in „Zuletzt gehört".

**Dateien/Artefakte:**
- Erstellt: `app/vitest.config.ts`, `app/src/main/library/sort.ts`, `app/src/main/library/sort.test.ts`
- Verändert: `app/package.json` (Scripts, devDependency)

**Verifikation:**
```bash
cd /home/kmlpatrick/Privat/repos/audiobook_station/app
npm test          # alle 5 sort-Tests grün
npm run typecheck # grün
```
Sehen: grüne Tests; korrekte Sektion-Zuordnung und Sortierung.
Nicht sehen: 100 % in `recentlyPlayed`, falsche alphabetische Reihenfolge bei Umlauten.

---

### T2.12 — `library:list`-Merge (MPD-DB + SQLite → LibraryListResponse)
**Größe:** M
**Abhängigkeiten:** T2.07, T2.10, T2.11
**Vorbedingung:** MPD-Client liefert `listallinfo`; `media`/`playback_position`-Tabellen existieren; `sortLibrary` getestet.

**Ziel:** Ein Main-Prozess-Modul, das die MPD-Bibliothek (autoritativ für Existenz) mit den SQLite-Fortschrittsdaten zu `MediaItem[]` zusammenführt, in die zwei E17-Sektionen sortiert und als Antwort auf `library:list` ausliefert. Felder für späteres Grid (Cover, Titel, Autor, %, Status, lastPlayed) sind gefüllt bzw. vorgesehen.

**Beschreibung:**
1. Merge-Modul `app/src/main/library/list.ts`:
   ```typescript
   import { getMpd } from '../mpd';
   import { getDb } from '../db';
   import { getAllPositions } from '../db/dao';
   import { sortLibrary } from './sort';
   import type { MediaItem, LibraryListResponse } from '@shared/ipc-contract';

   /**
    * Aggregiert die abspielbaren EINHEITEN. Eine Einheit ist in M2 ein
    * Medien-ORDNER auf der zweiten Ebene unter audiobooks/ bzw. music/ —
    * z. B. "audiobooks/Autor/Titel". MPD liefert einzelne Dateien; wir gruppieren
    * sie zur Einheit (Hörbuch = Ordner mit vielen Kapiteln, Album = Ordner).
    */
   export async function listLibrary(): Promise<LibraryListResponse> {
     const mpd = await getMpd();
     const files = await mpd.send('listallinfo'); // alle Dateien + Tags

     // Pro Einheit gruppieren:
     const units = new Map<string, { files: typeof files; durations: number; type: 'audiobook' | 'music'; title: string; artist?: string }>();
     for (const f of files) {
       const file = f['file'];
       if (!file) continue; // directory-Einträge überspringen
       const top = file.split('/')[0]; // 'audiobooks' | 'music'
       const type: 'audiobook' | 'music' = top === 'audiobooks' ? 'audiobook' : 'music';
       // Einheit = die ersten DREI Pfadsegmente (audiobooks/Autor/Titel),
       // bzw. zwei, falls flacher. Wir nehmen den Ordner der Datei:
       const parts = file.split('/');
       const unitPath = parts.slice(0, Math.min(3, parts.length - 1)).join('/') || parts[0];
       const dur = f['Time'] ? parseInt(f['Time'], 10) : 0;
       const entry = units.get(unitPath);
       if (entry) {
         entry.durations += dur;
       } else {
         units.set(unitPath, {
           files: [],
           durations: dur,
           type,
           // Titel: Ordnername (letztes Segment der Einheit) als Fallback,
           // Album-Tag falls vorhanden:
           title: f['Album'] ?? parts[parts.length - 2] ?? unitPath,
           artist: f['AlbumArtist'] ?? f['Artist'],
         });
       }
     }

     // SQLite-Fortschritt laden und auf Einheiten mappen:
     const db = getDb();
     const positions = new Map(getAllPositions(db).map((p) => [p.media_path, p]));

     const items: MediaItem[] = [];
     for (const [unitPath, u] of units) {
       const pos = positions.get(unitPath);
       const duration = u.durations || undefined;
       let progressPercent = 0;
       if (pos && duration && duration > 0) {
         progressPercent = Math.min(100, Math.round((pos.position_seconds / duration) * 100));
       }
       const status: MediaItem['status'] =
         progressPercent >= 100 ? 'done' : progressPercent > 0 ? 'in_progress' : 'new';
       items.push({
         path: unitPath,
         type: u.type,
         title: u.title,
         artist: u.artist,
         duration,
         coverPath: undefined, // M2: Platzhalter; beets/M7 füllen .covers
         progressPercent,
         lastPlayed: pos?.last_played,
         status,
       });
     }

     return sortLibrary(items);
   }
   ```
2. IPC-Handler verdrahten (vorläufig in `index.ts`, finale Bündelung in T2.15):
   ```typescript
   import { listLibrary } from './library/list';
   ipcMain.handle('library:list', async () => listLibrary());
   ```
3. `MediaItem.coverPath`: in M2 bewusst `undefined` gelassen (Empty-State/Cover-Fallback E1/E2 werden in M3/M7 dargestellt). Das Feld existiert aber im Vertrag, sodass M7 nur noch den Wert setzen muss.

**Caveats:**
- **MPD ist autoritativ für Existenz** — die `media`-SQLite-Tabelle wird in M2 nicht zwingend befüllt (sie ist FK-Ziel für `playback_position`). Damit `playback_position` per FK auf ein `media`-Row verweisen kann, muss beim ersten `player:play` ein `media`-Row angelegt werden (T2.13 Schritt: vor `upsertPosition` ein `INSERT OR IGNORE INTO media`). Alternativ: in dieser Liste die erkannten Einheiten per `INSERT OR IGNORE` in `media` spiegeln. **Empfehlung:** beim `play` upserten (T2.13), nicht hier — `library:list` bleibt seiteneffektfrei lesend.
- Die Einheiten-Heuristik (3 Pfadsegmente) ist für die typische `Autor/Titel`-Struktur gedacht. Flache Strukturen (`music/song.mp3`) fallen auf weniger Segmente zurück. Für M2 ausreichend; in M3 ggf. verfeinern.
- `progressPercent` aus `position_seconds / Gesamtdauer` ist eine Näherung (in M2 ist `track_index` meist 0). Für Kapitel-Medien wird das in M4 präzisiert.
- Mehrwertige Tags ignorieren wir; erstes Vorkommen genügt.

**Dateien/Artefakte:**
- Erstellt: `app/src/main/library/list.ts`
- Verändert: `app/src/main/index.ts`

**Verifikation:**
```bash
cd /home/kmlpatrick/Privat/repos/audiobook_station/app && npm run dev
# DevTools-Konsole:
#   await window.hoermond.invoke('library:list')
#   -> { recentlyPlayed: [...], all: [...] } mit Einträgen aus dem lokalen MPD
#   -> jeder Eintrag hat path/type/title/progressPercent/status
```
Sehen: zwei Sektionen, Hörbücher (`type:'audiobook'`) und Musik (`type:'music'`) korrekt klassifiziert.
Nicht sehen: leere Liste trotz vorhandener MPD-Tracks (Gruppierung kaputt), Crash bei `directory`-Einträgen.

---

### T2.13 — Positions-Persistenz (alle 10 s, WAL)
**Größe:** M
**Abhängigkeiten:** T2.09, T2.10
**Vorbedingung:** `player:state` liefert verlässlich `currentPath`+`position`; `playback_position`-Tabelle + DAO vorhanden.

**Ziel:** Während ein Medium spielt, wird alle 10 s die aktuelle Position des aktiven Mediums in SQLite (WAL) geschrieben (`upsertPosition`), inkl. Anlegen des `media`-Rows beim ersten Mal. In der DB nachprüfbar.

**Beschreibung:**
1. Persistenz-Modul `app/src/main/player/persist.ts`:
   ```typescript
   import { getDb } from '../db';
   import { upsertPosition } from '../db/dao';
   import { getState } from '../mpd/control';

   const SAVE_INTERVAL_MS = 10_000;

   /**
    * Schreibt alle 10 s die aktuelle Position, SOLANGE etwas spielt.
    * - Schreibt NUR bei status === 'playing' (kein Schreibsturm bei stop/pause).
    * - Legt das media-Row idempotent an (FK-Ziel für playback_position).
    * - WAL ist bereits aktiv (M1) -> schnelle, crash-sichere Writes.
    */
   export function startPositionPersistence(): () => void {
     const db = getDb();
     const ensureMedia = db.prepare(
       `INSERT OR IGNORE INTO media (path, type, title, added_at)
        VALUES (@path, @type, @title, @ts)`,
     );

     const timer = setInterval(() => {
       void (async () => {
         try {
           const st = await getState();
           if (st.status !== 'playing' || !st.currentPath) return;
           // Einheit-Pfad = Ordner der spielenden Datei (entspricht MediaItem.path).
           const parts = st.currentPath.split('/');
           const unitPath = parts.slice(0, Math.min(3, parts.length - 1)).join('/') || parts[0];
           const type = unitPath.startsWith('audiobooks') ? 'audiobook' : 'music';
           ensureMedia.run({
             path: unitPath,
             type,
             title: parts[parts.length - 2] ?? unitPath,
             ts: new Date().toISOString(),
           });
           // track_index in M2 = aktuelle Queue-Position (0 wenn unbekannt).
           upsertPosition(db, unitPath, 0, st.position);
         } catch (err) {
           console.error('[persist] save failed:', err);
         }
       })();
     }, SAVE_INTERVAL_MS);

     return () => clearInterval(timer);
   }
   ```
2. Beim App-Start aktivieren. In `app/src/main/index.ts` (innerhalb `whenReady`, nach idle-Loop-Start):
   ```typescript
   import { startPositionPersistence } from './player/persist';
   const stopPersist = startPositionPersistence();
   app.on('before-quit', () => stopPersist());
   ```
3. **Zusätzlich** beim `pause`/`stop`-Command einmal sofort speichern (damit die letzte Position auch ohne 10-s-Tick präzise ist). In den `player:pause`/`player:stop`-Handlern (T2.08) vor dem Return einen einmaligen `saveNow()` aufrufen — dazu in `persist.ts` eine exportierte `saveNow()` ergänzen, die denselben Body wie der Intervall-Callback hat.

**Caveats:**
- **Nicht** bei `paused`/`stopped` periodisch schreiben — sonst sinnlose Writes und WAL-Wachstum. Nur bei `playing`.
- Der 10-s-Tick liest den Zustand über die **Command-Verbindung** (`getState`), nicht über die idle-Verbindung — konsistent mit T2.09.
- WAL ist aus M1 aktiv (`journal_mode = WAL`). Kein zusätzlicher `PRAGMA synchronous` nötig; Default (`NORMAL` unter WAL) ist crash-sicher genug für „≤ 10 s Toleranz".
- **Watcher-Schleifen-Falle (siehe T2.03):** SQLite-WAL-Dateien liegen unter `/media/.state` — der inotify-Watcher MUSS `.state` ausschließen (in T2.03 erledigt), sonst lösen diese 10-s-Writes Rescans aus.
- `before-quit` feuert bei sauberem Quit; beim harten Stecker-Ziehen gibt es kein Quit — genau deshalb die periodischen Writes (max. 10 s Verlust = exakt die AK-Toleranz).

**Dateien/Artefakte:**
- Erstellt: `app/src/main/player/persist.ts`
- Verändert: `app/src/main/index.ts`, `app/src/main/index.ts` (player-Handler aus T2.08)

**Verifikation:**
```bash
cd /home/kmlpatrick/Privat/repos/audiobook_station/app
HOERMOND_DB_PATH=/tmp/t2-pos.db npm run dev
# Renderer-Konsole: invoke('player:play', { path: 'audiobooks/Autor/Titel/01.mp3' })
# ~25 s spielen lassen, dann:
sqlite3 /tmp/t2-pos.db "SELECT media_path, position_seconds, last_played FROM playback_position;"
# -> position_seconds steigt (~10, ~20, ...), last_played aktuell
watch -n2 'sqlite3 /tmp/t2-pos.db "SELECT position_seconds FROM playback_position;"'  # steigt nur bei playing
```
Sehen: `position_seconds` wächst in ~10-s-Schritten bei laufender Wiedergabe; bei pause/stop stabil.
Nicht sehen: Schreiben während pause/stop, fehlendes `media`-Row (FK-Fehler).

---

### T2.14 — Resume-Logik beim App-Start
**Größe:** M
**Abhängigkeiten:** T2.10, T2.13
**Vorbedingung:** `playback_position` wird gefüllt (T2.13); DAO `getLatestPosition` vorhanden.

**Ziel:** Beim App-Start lädt der Main-Prozess die zuletzt gespielte Position und bereitet das Medium für **automatischen** Resume vor: es spielt nach Reboot dasselbe Medium ab der gespeicherten Stelle weiter (AK: Stecker ziehen → Reboot → läuft weiter, Toleranz ≤ 10 s).

**Beschreibung:**
1. Resume-Modul `app/src/main/player/resume.ts`:
   ```typescript
   import { getDb } from '../db';
   import { getLatestPosition } from '../db/dao';
   import { play } from '../mpd/control';

   /**
    * Auto-Resume beim App-Start. Lädt die zuletzt gespielte Einheit und startet
    * sie ab der gespeicherten Position. Bewusst NUR die zuletzt gespielte Einheit
    * (latest by last_played) — das ist das, was beim Stecker-Ziehen lief.
    *
    * Sicherheit: Wenn das Medium in MPD nicht mehr existiert (gelöscht), wirft
    * play() ACK -> wir fangen das und resumen NICHT (keine UI-Blockade).
    */
   export async function resumeLast(): Promise<void> {
     const db = getDb();
     const last = getLatestPosition(db);
     if (!last) return; // noch nie etwas gespielt -> nichts tun
     try {
       await play(last.media_path, last.position_seconds);
     } catch (err) {
       console.error('[resume] could not resume', last.media_path, err);
       // Medium evtl. entfernt -> still ignorieren, App startet normal.
     }
   }
   ```
2. Beim App-Start aufrufen — **nach** dem idle-Loop-Start (damit das resultierende `player:state` an den Renderer gepusht wird), aber MPD muss erreichbar sein. In `app/src/main/index.ts`:
   ```typescript
   import { resumeLast } from './player/resume';
   // ... innerhalb whenReady, nach startIdleLoop(...) und startPositionPersistence():
   void resumeLast();
   ```
3. **Designentscheidung (dokumentieren):** M2 startet die Wiedergabe beim Boot **automatisch** (laut AK „spielt automatisch weiter"). In M3/M4 wird das verfeinert (Onboarding/Startscreen kann ein automatisches Losspielen unerwünscht machen) — daher die Logik isoliert in `resume.ts`, sodass M3 sie leicht auf „vorbereiten statt sofort spielen" umstellen kann (z. B. Queue laden + `pause` statt `play`).

**Caveats:**
- **Reihenfolge beim Start:** MPD-Verbindung muss stehen, bevor `play` aufgerufen wird. `play()` ruft `getMpd()` (verbindet lazy) — funktioniert, aber auf dem Pi kann MPD beim App-Start noch hochfahren. Falls `resumeLast` zu früh läuft, fängt der `catch` den Fehler ab; robuster ist ein kurzer Retry. Für M2-Abnahme reicht: App `Restart=always` (M1) + MPD `After`-Ordering; bei Bedarf 1–2 s Verzögerung vor `resumeLast`.
- Auto-Play beim Boot ist in M2 gewünscht, in M3 ggf. nicht — Logik gekapselt halten.
- `seekcur` direkt nach `play` (in `play()` erledigt) springt korrekt zur Sekunde; bei sehr kurzen Tracks/Position > Dauer ignoriert MPD oder spielt am Ende — unkritisch.

**Dateien/Artefakte:**
- Erstellt: `app/src/main/player/resume.ts`
- Verändert: `app/src/main/index.ts`

**Verifikation:**
```bash
cd /home/kmlpatrick/Privat/repos/audiobook_station/app
HOERMOND_DB_PATH=/tmp/t2-pos.db npm run dev
# 1) Medium spielen, ~30 s, Position merken (sqlite3 ... position_seconds)
# 2) Dev-Prozess hart beenden (Strg-C), neu starten:
HOERMOND_DB_PATH=/tmp/t2-pos.db npm run dev
# -> dasselbe Medium spielt automatisch ab ~gespeicherter Position (±10 s)
```
Sehen: nach Neustart läuft dasselbe Medium ab der gespeicherten Position.
Nicht sehen: Start bei 0 (Resume ignoriert Position), Crash/Blockade wenn Medium fehlt.

---

### T2.15 — `onboarding:*` + `library:rescan` + `sync:status`-Brücke
**Größe:** M
**Abhängigkeiten:** T2.03, T2.06, T2.09, T2.10, T2.12
**Vorbedingung:** Sync-Log (T2.03) wird auf dem Pi geschrieben; idle-Loop läuft; DAO-Onboarding-Funktionen vorhanden.

**Ziel:** Restliche IPC-Endpunkte: `onboarding:getSeen`/`setSeen` (SQLite), `library:rescan` (löst MPD-Rescan aus, pusht `library:updated`), und die `sync:status`-Brücke (liest das Sync-Log und pusht `sync:status` an den Renderer). Außerdem alle IPC-Handler in ein Modul gebündelt.

**Beschreibung:**
1. **IPC-Registrierung bündeln.** Neues Modul `app/src/main/ipc/register.ts`, das alle Handler aus T2.08/T2.12 plus die neuen registriert. So bleibt `index.ts` schlank:
   ```typescript
   import { ipcMain, app, type BrowserWindow } from 'electron';
   import { play, pause, stop, seek, getState } from '../mpd/control';
   import { listLibrary } from '../library/list';
   import { getMpd } from '../mpd';
   import { getDb } from '../db';
   import { getOnboardingSeen, setOnboardingSeen } from '../db/dao';

   export function registerIpcHandlers(getWindow: () => BrowserWindow | null): void {
     ipcMain.handle('app:getVersion', () => ({ version: app.getVersion() }));

     ipcMain.handle('player:play', async (_e, p: { path: string; position?: number }) => {
       await play(p.path, p.position);
       return { ok: true };
     });
     ipcMain.handle('player:pause', async () => { await pause(); return { ok: true }; });
     ipcMain.handle('player:stop', async () => { await stop(); return { ok: true }; });
     ipcMain.handle('player:seek', async (_e, p: { position: number }) => {
       await seek(p.position); return { ok: true };
     });
     ipcMain.handle('player:getState', () => getState());

     ipcMain.handle('library:list', () => listLibrary());

     ipcMain.handle('library:rescan', async () => {
       const mpd = await getMpd();
       await mpd.send('update'); // nicht --wait: feuert library:updated über idle? nein -> siehe Schritt 3
       getWindow()?.webContents.send('library:updated', { ts: Date.now() });
       return { triggered: true };
     });

     ipcMain.handle('onboarding:getSeen', () => ({ seen: getOnboardingSeen(getDb()) }));
     ipcMain.handle('onboarding:setSeen', (_e, p: { seen: boolean }) => {
       setOnboardingSeen(getDb(), p.seen);
       return { ok: true };
     });
   }
   ```
   Den bestehenden `ipcMain.handle('app:getVersion', ...)` aus `index.ts` entfernen (jetzt hier) und in `whenReady` `registerIpcHandlers(() => BrowserWindow.getAllWindows()[0] ?? null)` aufrufen.
2. **`sync:status`-Brücke.** Auf dem Pi schreibt der Watcher (T2.03) JSONL nach `/var/lib/mediaplayer/sync/sync.log`. Der Main-Prozess beobachtet diese Datei und pusht jede neue Zeile als `sync:status`. Modul `app/src/main/sync/watch-log.ts`:
   ```typescript
   import { watch, existsSync, statSync, openSync, readSync, closeSync } from 'fs';
   import type { BrowserWindow } from 'electron';
   import type { SyncStatus } from '@shared/ipc-contract';

   const LOG_PATH =
     process.env['HOERMOND_SYNC_LOG'] ?? '/var/lib/mediaplayer/sync/sync.log';

   /** Tailt das Sync-Log und pusht jede neue JSONL-Zeile als sync:status. */
   export function startSyncLogBridge(getWindow: () => BrowserWindow | null): () => void {
     if (!existsSync(LOG_PATH)) {
       // Log existiert auf dem Laptop ggf. nicht -> No-op, kein Crash.
       return () => {};
     }
     let offset = statSync(LOG_PATH).size; // ab jetzt nur NEUE Zeilen

     const readNew = (): void => {
       try {
         const size = statSync(LOG_PATH).size;
         if (size <= offset) return;
         const fd = openSync(LOG_PATH, 'r');
         const buf = Buffer.alloc(size - offset);
         readSync(fd, buf, 0, buf.length, offset);
         closeSync(fd);
         offset = size;
         for (const line of buf.toString('utf8').split('\n')) {
           if (!line.trim()) continue;
           try {
             const ev = JSON.parse(line) as SyncStatus;
             getWindow()?.webContents.send('sync:status', ev);
           } catch {
             /* unvollständige Zeile -> beim nächsten Tick erneut */
           }
         }
       } catch (err) {
         console.error('[sync-bridge] read failed:', err);
       }
     };

     const watcher = watch(LOG_PATH, { persistent: false }, readNew);
     return () => watcher.close();
   }
   ```
3. **`library:rescan` → `library:updated`.** Sauberer als der direkte Push in Schritt 1: ein `update`-Befehl ohne `--wait` kehrt sofort zurück; den eigentlichen Abschluss meldet MPD über das `idle`-Subsystem `update`. Erweitere den idle-Loop (T2.09) so, dass er auch `update`/`database` beobachtet und bei „database changed" `library:updated` pusht:
   - In `idle.ts` die idle-Subsysteme um `database update` erweitern: `s.write('idle player mixer playlist database update\n')`.
   - Im `data`-Handler nach Erkennung `changed: database` zusätzlich `getWindow()?.webContents.send('library:updated', { ts: Date.now() })` aufrufen. (Dazu `startIdleLoop` Zugriff auf `getWindow` geben — hat es bereits.)
   - Dann in `library:rescan` (Schritt 1) den manuellen `library:updated`-Push entfernen — der kommt jetzt verlässlich vom idle-Loop, wenn der Rescan wirklich fertig ist.
4. Start der Brücke in `index.ts` (innerhalb `whenReady`):
   ```typescript
   import { startSyncLogBridge } from './sync/watch-log';
   const stopSyncBridge = startSyncLogBridge(() => BrowserWindow.getAllWindows()[0] ?? null);
   app.on('before-quit', () => stopSyncBridge());
   ```

**Caveats:**
- `fs.watch` ist plattformabhängig und kann Events verschlucken — deshalb das offset-basierte „Tail" (nur Größenzuwachs lesen), das auch bei verpassten Events beim nächsten Trigger nachzieht. Auf dem Pi (Linux/inotify-backed) ist `fs.watch` zuverlässig.
- Auf dem **Laptop** existiert `/var/lib/mediaplayer/sync/sync.log` nicht → die Brücke ist ein No-op (kein Crash). Für lokale Tests `HOERMOND_SYNC_LOG` auf eine Testdatei setzen und Zeilen anhängen.
- `library:updated` aus dem idle-Loop (Schritt 3) ist die **korrekte** Quelle (feuert wenn MPD-DB wirklich fertig ist) — der direkte Push in `library:rescan` wäre verfrüht. Schritt 3 ersetzt Schritt-1-Push.
- `onboarding`-Endpunkte sind trivial, aber M3 (E16) hängt daran — Vertrag jetzt erfüllen.

**Dateien/Artefakte:**
- Erstellt: `app/src/main/ipc/register.ts`, `app/src/main/sync/watch-log.ts`
- Verändert: `app/src/main/index.ts`, `app/src/main/mpd/idle.ts`

**Verifikation:**
```bash
cd /home/kmlpatrick/Privat/repos/audiobook_station/app && npm run typecheck && npm run dev
# Renderer-Konsole:
#   await window.hoermond.invoke('onboarding:getSeen')   // { seen:false }
#   await window.hoermond.invoke('onboarding:setSeen', { seen:true })
#   await window.hoermond.invoke('onboarding:getSeen')   // { seen:true }
#   window.hoermond.on('library:updated', e => console.log('LIB', e))
#   await window.hoermond.invoke('library:rescan')       // kurz darauf LIB-Log
# Sync-Brücke lokal testen:
#   HOERMOND_SYNC_LOG=/tmp/sync.log npm run dev
#   echo '{"ts":"2026-06-15T12:00:00Z","phase":"completed"}' >> /tmp/sync.log
#   -> Renderer-on('sync:status') feuert
```
Sehen: onboarding persistiert; rescan löst `library:updated` aus; Log-Zeilen pushen `sync:status`.
Nicht sehen: doppelte `library:updated`, Crash wenn Log fehlt.

---

### T2.16 — Provisorische Trefferliste (Text-UI, Wegwerf)
**Größe:** S
**Abhängigkeiten:** T2.12 (library:list), T2.09 (player:state)
**Vorbedingung:** `library:list` liefert Daten; `player:play` spielt; i18n (`useT`) aus M1.

**Ziel:** Ein einfacher, fingerfreundlicher Textbildschirm (800×480), der Hörbücher und Musik **getrennt** auflistet (zwei Sektionen aus `library:list`), bei Tap das Medium über `player:play` startet und den aktuellen `player:state` anzeigt. **Wegwerf-UI** — M3 ersetzt sie durch das Cover-Grid.

**Beschreibung:**
1. i18n-Keys ergänzen. `app/src/renderer/src/i18n/de.json`:
   ```json
   {
     "boot.starting": "Hörmond startet",
     "error.db": "Datenbank-Fehler",
     "library.recentlyPlayed": "Zuletzt gehört",
     "library.all": "Alle",
     "library.audiobooks": "Hörbücher",
     "library.music": "Musik",
     "library.empty": "Noch keine Medien vorhanden",
     "player.playing": "Spielt",
     "player.paused": "Pausiert",
     "player.stopped": "Gestoppt",
     "player.pause": "Pause",
     "player.stop": "Stopp"
   }
   ```
   (Keine hartcodierten Strings im JSX — Grundvertrag.)
2. Eine Komponente `app/src/renderer/src/Library.tsx`:
   ```tsx
   import { useEffect, useState } from 'react';
   import { useT } from './i18n/I18nContext';
   import type { LibraryListResponse, MediaItem, PlayerState } from '@shared/ipc-contract';

   export default function Library(): React.JSX.Element {
     const t = useT();
     const [lib, setLib] = useState<LibraryListResponse | null>(null);
     const [state, setState] = useState<PlayerState | null>(null);

     const load = async (): Promise<void> => {
       setLib(await window.hoermond.invoke('library:list', undefined));
     };

     useEffect(() => {
       void load();
       // Initialzustand pull + Live-Updates abonnieren:
       void window.hoermond.invoke('player:getState', undefined).then(setState);
       const offState = window.hoermond.on('player:state', setState);
       const offLib = window.hoermond.on('library:updated', () => void load());
       return () => {
         offState();
         offLib();
       };
     }, []);

     const playItem = (item: MediaItem): void => {
       const resume = item.progressPercent > 0 ? undefined : undefined; // M2: Resume via player:play position
       void window.hoermond.invoke('player:play', { path: item.path, position: resume });
     };

     const renderSection = (titleKey: string, items: MediaItem[]): React.JSX.Element => (
       <section className="lib-section">
         <h2>{t(titleKey)}</h2>
         {items.length === 0 ? (
           <p className="lib-empty">{t('library.empty')}</p>
         ) : (
           <ul>
             {items.map((it) => (
               <li key={it.path}>
                 <button className="lib-item" onClick={() => playItem(it)}>
                   <span className="lib-title">{it.title}</span>
                   {it.artist && <span className="lib-artist">{it.artist}</span>}
                   <span className="lib-type">
                     {t(it.type === 'audiobook' ? 'library.audiobooks' : 'library.music')}
                   </span>
                   {it.progressPercent > 0 && it.progressPercent < 100 && (
                     <span className="lib-progress">{it.progressPercent}%</span>
                   )}
                 </button>
               </li>
             ))}
           </ul>
         )}
       </section>
     );

     const statusLabel =
       state?.status === 'playing'
         ? 'player.playing'
         : state?.status === 'paused'
           ? 'player.paused'
           : 'player.stopped';

     return (
       <div className="library-screen">
         <div className="now-playing">
           <span>{t(statusLabel)}</span>
           {state?.currentPath && <span className="np-path">{state.currentPath}</span>}
           <button onClick={() => window.hoermond.invoke('player:pause', undefined)}>
             {t('player.pause')}
           </button>
           <button onClick={() => window.hoermond.invoke('player:stop', undefined)}>
             {t('player.stop')}
           </button>
         </div>
         {lib && renderSection('library.recentlyPlayed', lib.recentlyPlayed)}
         {lib && renderSection('library.all', lib.all)}
       </div>
     );
   }
   ```
3. `App.tsx` so erweitern, dass nach dem Boot-Screen die `Library` gezeigt wird. Minimal: die `Library` direkt rendern (Boot-Screen entfällt, sobald `library:list` geladen ist). Den bestehenden `app:dbError`-Pfad beibehalten.
4. Minimales CSS für Touch-Tauglichkeit in `App.css` ergänzen (Buttons ≥ 60 px hoch, große Schrift):
   ```css
   .lib-item { display: flex; gap: 12px; align-items: center; width: 100%;
     min-height: 64px; font-size: 22px; padding: 8px 16px; text-align: left; }
   .lib-section h2 { font-size: 20px; margin: 8px 16px; }
   .library-screen { height: 480px; overflow-y: auto; }
   ```

**Caveats:**
- **Unsubscribe im Cleanup** (StrictMode mountet Effects doppelt): die `on()`-Rückgabewerte MÜSSEN im `useEffect`-Cleanup aufgerufen werden, sonst sammeln sich Listener.
- `invoke(channel, undefined)` für void-Requests — die Bridge-Signatur verlangt das Payload-Argument; `undefined` ist korrekt.
- Das ist **Wegwerf-UI** — keine Zeit in Optik investieren. Touch-Targets aber schon groß genug, damit ein 7-Jähriger testen kann.
- Resume aus der Liste: in M2 startet `player:play` ohne explizite Position (MPD/Resume-Logik T2.14 deckt den Auto-Resume beim Boot ab). „Weiter ab Position per Tap" wird in M3 sauber gebaut.

**Dateien/Artefakte:**
- Erstellt: `app/src/renderer/src/Library.tsx`
- Verändert: `app/src/renderer/src/App.tsx`, `app/src/renderer/src/App.css`, `app/src/renderer/src/i18n/de.json`

**Verifikation:**
```bash
cd /home/kmlpatrick/Privat/repos/audiobook_station/app && npm run dev
# Im Fenster: zwei Sektionen (Zuletzt gehört / Alle), Hörbuch+Musik unterscheidbar.
# Tap auf einen Eintrag -> hörbare Wiedergabe, "Spielt" + Pfad oben.
# Extern mpc pause -> Anzeige wechselt auf "Pausiert" (Push).
```
Sehen: getrennte Listen, Tap startet Wiedergabe, Statuszeile reagiert live.
Nicht sehen: hartcodierte Strings, doppelte Listener (StrictMode), leere Liste trotz Medien.

---

### T2.17 — App-Bundle + Services auf Pi deployen
**Größe:** M
**Abhängigkeiten:** T2.05, T2.15, T2.16
**Vorbedingung:** Backend+Frontend laufen auf dem Laptop; Pi aus M1 bootet in die Kiosk-App; `media-sync`+Watcher+beets (T2.02/03/05) sind auf dem Pi eingerichtet.

**Ziel:** Das neue M2-App-Bundle läuft auf dem Pi: `library:list` zeigt synchronisierte Medien, Tap spielt über die Klinke, Position wird in der echten `/var/lib/mediaplayer/state.db` (WAL, persistent) geschrieben, und der Sync-Watcher löst `library:updated` aus.

**Beschreibung:**
> overlayfs ist seit M1 scharf → rootfs read-only. System-Änderungen (Services) erfordern: **overlay aus → ändern → overlay an**. Das App-Bundle selbst liegt unter `/opt/hoermond/app` (M1) — ebenfalls auf rootfs, also overlay aus zum Deployen.
1. overlayfs temporär deaktivieren (M1 T1.16): `sudo raspi-config` → Performance → Overlay FS → Disable → Reboot.
2. Auf dem Laptop bauen:
   ```bash
   cd /home/kmlpatrick/Privat/repos/audiobook_station/app
   npm run build            # typecheck + electron-vite build -> out/
   ```
3. Bundle auf den Pi kopieren (als `player`, App-Pfad aus M1):
   ```bash
   rsync -avz --delete out/ player@hoermond.local:/opt/hoermond/app/out/
   rsync -avz package.json player@hoermond.local:/opt/hoermond/app/
   ```
4. Native Module gegen die Pi-Electron-ABI neu bauen (Grundvertrag/ADR-3, `better-sqlite3`):
   ```bash
   ssh player@hoermond.local
   cd /opt/hoermond/app && npm install --omit=dev
   npx electron-rebuild -f -w better-sqlite3   # ABI-Fix, Pflicht nach install
   ```
5. Sicherstellen, dass die echten Pfade greifen (kein `HOERMOND_DB_PATH`-Override → Default `/var/lib/mediaplayer/state.db`; `HOERMOND_SYNC_LOG`-Default `/var/lib/mediaplayer/sync/sync.log`). MPD-Default-Host/Port (127.0.0.1:6600) stimmen aus M1.
6. Migration v2 läuft beim ersten Start automatisch (T2.10) — verifizieren (Schritt unten).
7. overlayfs wieder aktivieren: `sudo raspi-config` → Enable → Reboot.

**Caveats:**
- **`electron-rebuild` ist Pflicht** nach jedem `npm install` auf dem Pi — sonst „NODE_MODULE_VERSION mismatch" und die App startet nicht (Grundvertrag).
- Audio: M1 nutzt ALSA-Default (3,5-mm-Klinke). Lautstärke prüfen (`alsamixer`), nicht gemutet. Bluetooth kommt erst in M6.
- Wenn nach overlay-Reaktivierung die DB nicht persistiert: `/var/lib/mediaplayer` muss bind-mount auf `/media/.state` sein (M1 ADR-2) — sonst landet WAL im flüchtigen overlay-Upper. Vor dem Crash-Test (T2.18) prüfen.
- `media-watcher.service` und `media-sync` sind System-Services auf rootfs — bei Overlay-aktiv unveränderlich; Änderungen daran ebenfalls nur im overlay-aus-Fenster.

**Dateien/Artefakte:**
- Verändert (auf dem Pi): `/opt/hoermond/app/out`, `/opt/hoermond/app/node_modules`

**Verifikation:**
```bash
# Auf dem Pi:
sudo systemctl restart mediaplayer.service
sqlite3 /var/lib/mediaplayer/state.db ".tables"        # media playback_position onboarding_seen ...
sqlite3 /var/lib/mediaplayer/state.db "SELECT version FROM schema_version;"  # 1 und 2
# Vom Laptop: rsync neuer Medien -> innerhalb <30s erscheinen sie am Display
# Am Touchscreen: Tap auf Eintrag -> hörbare Wiedergabe über Klinke
sqlite3 /var/lib/mediaplayer/state.db "SELECT * FROM playback_position;"  # Position wächst
```
Sehen: M2-Schema auf dem Pi; synchronisierte Medien in der Liste; hörbare Wiedergabe; wachsende Position.
Nicht sehen: ABI-Fehler in `journalctl -u mediaplayer`, fehlende Tabellen, stummer Output.

---

### T2.18 — E2E-Resume-Test (Stecker ziehen, < 30 s Sync, ≤ 10 s Toleranz)
**Größe:** L
**Abhängigkeiten:** T2.17
**Vorbedingung:** M2-Bundle läuft auf dem Pi; overlayfs aktiv; `media-sync`+Watcher aktiv; Backup-SD existiert (aus M1).

**Ziel:** Vollständiger Nachweis der M2-Akzeptanzkriterien auf der echten Hardware: Sync < 30 s sichtbar, Tap spielt über Klinke, Position alle 10 s persistiert, und nach **hartem Stecker-Ziehen + Reboot** läuft dasselbe Medium ab der gespeicherten Stelle weiter (Toleranz ≤ 10 s).

**Beschreibung:**
1. **Sync-Durchstich:** Vom Laptop neue Medien syncen und Zeit messen:
   ```bash
   time rsync -avz --partial media/ media-sync@<pi-ip>:/
   # Stoppuhr ab "Sync fertig": neue Einträge müssen < 30 s am Display erscheinen.
   ssh player@hoermond.local 'tail -n 5 /var/lib/mediaplayer/sync/sync.log'  # started+completed
   ```
2. **Wiedergabe + Persistenz:** Am Touchscreen ein Hörbuch antippen, ~30 s hören. Parallel per SSH:
   ```bash
   ssh player@hoermond.local 'watch -n2 "sqlite3 /var/lib/mediaplayer/state.db \"SELECT media_path,position_seconds,last_played FROM playback_position\""'
   # position_seconds steigt in ~10-s-Schritten.
   ```
3. **Harter Stromverlust mitten in der Wiedergabe:** Während ein Medium an z. B. Position ~45 s läuft, **Netzstecker ziehen** (nicht herunterfahren).
4. **Reboot + Auto-Resume:** Strom wieder anschließen, Pi bootet. Beobachten:
   - Kein fsck-Schaden: `dmesg | grep -i 'ext4\|fsck\|corrupt'` → keine Fehler.
   - Dasselbe Medium spielt **automatisch** ab ~der zuletzt gespeicherten Position (T2.14).
   - Differenz zur Position vor dem Ziehen ≤ 10 s (= max. ein verpasster 10-s-Tick).
   ```bash
   ssh player@hoermond.local 'sqlite3 /var/lib/mediaplayer/state.db "SELECT position_seconds,last_played FROM playback_position"'
   ssh player@hoermond.local 'mpc status'   # play, korrektes Medium, Position ~gespeichert
   ```
5. **Manueller Rescan (AK):** Neue Datei direkt auf den Pi legen (oder syncen) und `library:rescan` aus dem Renderer auslösen (oder via `mpc update`), prüfen dass sie in `library:list` auftaucht.
6. **Mehrfach wiederholen (Empfehlung 3×):** Stromverlust an verschiedenen Positionen, jeweils Resume + Korruptionsfreiheit protokollieren. Ergebnis in `tasks/m2-acceptance-test.md` festhalten.

**Caveats:**
- **WAL + Stromverlust:** Genau hier wird die in M1 etablierte Crash-Sicherheit „belastet" (milestones.md). Wenn Resume bei 0 startet oder die DB leer ist, liegt die Ursache fast immer in (a) `/var/lib/mediaplayer` nicht persistent gebunden (M1 ADR-2) oder (b) Positions-Writes greifen nicht (T2.13). Beide vor dem Test einzeln verifizieren.
- Toleranz ≤ 10 s ist exakt das Persistenz-Intervall — ein gerade verpasster Tick ist akzeptabel, mehr nicht.
- Beim ersten harten Test immer Backup-SD griffbereit (overlayfs-Risiko aus M1).
- Falls Auto-Resume unerwünscht laut spielt: das ist M2-konform (AK fordert „spielt automatisch weiter"); die UX-Verfeinerung (Onboarding-Gate) ist M3.

**Dateien/Artefakte:**
- Erstellt: `tasks/m2-acceptance-test.md` (Protokoll der Durchläufe)

**Verifikation:** Alle Punkte der Abnahme-Checkliste (unten) „bestanden".
Sehen: Sync < 30 s, hörbare Wiedergabe, wachsende Position, korrektes Auto-Resume ≤ 10 s, keine Korruption.
Nicht sehen: Resume bei 0, fsck-Reparaturen, leere DB nach Reboot, stummer Output.

---

## M2 Abnahme-Checkliste (gegen Akzeptanzkriterien)

| AK | Kriterium | Verifiziert in |
|----|-----------|----------------|
| 1 | `rsync` über SSH (`media-sync`) befüllt `/media`; chroot auf `/media`, Key-only, kein interaktiver Login | T2.02, T2.04, T2.18 |
| 2 | Nach Sync erscheint neuer Inhalt automatisch (inotify → MPD-Rescan) < 30 s | T2.03, T2.15, T2.18 |
| 3 | Provisorische Liste zeigt Hörbücher und Musik **getrennt** | T2.12, T2.16, T2.18 |
| 4 | Tap auf Eintrag startet hörbare Wiedergabe über Klinke | T2.08, T2.16, T2.17, T2.18 |
| 5 | Position wird alle 10 s in SQLite geschrieben (DB-verifizierbar) | T2.13, T2.18 |
| 6 | Stecker ziehen → Reboot → dasselbe Medium ab gespeicherter Position (≤ 10 s) | T2.13, T2.14, T2.18 |
| 7 | Manueller Rescan-Command findet neue Medien | T2.15, T2.18 |
| — | `mpc idle`-Loop ist die Quelle für `player:state` (kein Polling) | T2.09 |
| — | E17-Sortierung als reine, getestete Funktion | T2.11 |
| — | 🔒 Sicherheits-Review chroot + Sync-Kette dokumentiert | T2.04 |
| — | IPC-Vertrag nur additiv erweitert; Whitelists aktuell | T2.06 |
| — | Datenmodell zukunftssicher (track_index + offset für M4) | T2.10 |
| — | Sync-Events + Log erzeugt (Quelle für Sync-Icon in M7) | T2.03, T2.15 |
| — | beets-Pipeline nicht-destruktiv (move/copy/write = no) | T2.05 |

### Ausführungsort je Task

| Ort | Tasks |
|-----|-------|
| **Pi** | T2.01, T2.02, T2.03, T2.04, T2.05, T2.17, T2.18 |
| **Laptop** (hardwareunabhängig) | T2.06, T2.07, T2.08, T2.09, T2.10, T2.11, T2.12, T2.13, T2.14, T2.15, T2.16 |

> 🔒 = sicherheitskritisch (verpflichtender Review vor Abnahme): **T2.02**, **T2.04**.
