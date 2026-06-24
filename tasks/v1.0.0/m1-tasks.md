# M1 — Stabiles Fundament + UI-Lebenszeichen: Task-Plan

## Überblick & Abhängigkeitsgraph

M1 schafft das stabile Fundament: ein Raspberry Pi 4, der aus dem Kaltstart ohne
Eingabegeräte in eine cursor-freie Electron-Kiosk-App auf exakt 800×480px bootet,
crash-sicher (read-only rootfs + overlayfs), mit laufendem MPD und dem
Architektur-Grundvertrag (typisierte IPC-Bridge, MPD/SQLite als Single Source of
Truth). Sichtbar ist ein statischer React-Screen mit Logo-Platzhalter und dem Text
„Hörmond startet".

Der Plan trennt drei Arbeitsstränge, die weitgehend parallel laufen können:

- **System (T1.01–T1.07):** OS, Partitionen, MPD, X11, systemd, overlayfs.
- **App-Gerüst / Electron-Main (T1.08–T1.12):** Projekt, IPC-Vertrag, SQLite.
- **Frontend (T1.13–T1.14):** React-Screen, i18n.

Die Integration (T1.15) führt App-Bundle und System zusammen; die Härtung (T1.16)
schaltet das overlayfs scharf und verifiziert die Crash-Sicherheit.

**Wichtig:** Der App-Strang (T1.08+) und der Frontend-Strang (T1.13+) brauchen die
Pi-Hardware NICHT — sie werden auf dem Entwickler-Laptop gebaut und getestet. Nur
T1.01–T1.07, T1.15, T1.16 laufen auf dem Pi. overlayfs (T1.16) wird ZULETZT scharf
geschaltet, weil ein read-only rootfs jede weitere System-Änderung blockiert.

```
SYSTEM-STRANG (auf dem Pi)
  T1.01 OS-Image + Autologin
     │
     ├── T1.02 Partitionierung (/media, /var/lib/mediaplayer)
     │      │
     │      └── T1.04 MPD-Konfiguration
     │
     └── T1.03 X11 minimal + Cursor unterdrücken
            │
            └── T1.05 systemd mpd.service + mediaplayer.service
                   │
                   └── T1.06 Boot-Zeit-Messung (< 60s)
                          │
                          └── T1.07 (Vorbereitung overlayfs, noch NICHT aktiv)

APP-STRANG (auf dem Laptop, hardware-unabhängig)
  T1.08 electron-vite Projekt-Setup
     │
     ├── T1.09 ipc-contract.ts (zentrales Artefakt)
     │      │
     │      └── T1.10 Preload-Bridge (contextBridge)
     │             │
     │             └── T1.11 Main-Prozess BrowserWindow + Kiosk
     │
     └── T1.12 SQLite (better-sqlite3) + Migrationsgerüst

FRONTEND-STRANG (auf dem Laptop)
  T1.13 React-Bootstrap + statischer 800×480-Screen
     │
     └── T1.14 i18n-Schicht (I18nContext, de.json)

INTEGRATION & HÄRTUNG (auf dem Pi)
  (T1.06 + T1.11 + T1.14) ── T1.15 App-Bundle auf Pi deployen + starten
                                 │
                                 └── T1.16 overlayfs scharf + Crash-Test (5× Stecker)
```

## Task-Liste (Übersicht)

| ID | Titel | Größe |
|----|-------|-------|
| T1.01 | OS-Image Raspberry Pi OS Lite + Autologin | M |
| T1.02 | Partitionierung: /media (ext4) + /var/lib/mediaplayer | M |
| T1.03 | X11 minimal ohne WM + Cursor unterdrücken | M |
| T1.04 | MPD-Grundkonfiguration /etc/mpd.conf | S |
| T1.05 | systemd-Units mpd.service + mediaplayer.service | M |
| T1.06 | Boot-Zeit-Messung & Optimierung (< 60s) | S |
| T1.07 | overlayfs vorbereiten (schreibbare Ausnahmen, noch inaktiv) | M |
| T1.08 | electron-vite Projekt-Setup (Main/Preload/Renderer) | M |
| T1.09 | ipc-contract.ts — zentrales IPC-Vertrags-Artefakt | M |
| T1.10 | Preload-Bridge-Skelett (contextBridge) | S |
| T1.11 | Main-Prozess: BrowserWindow Kiosk 800×480 | M |
| T1.12 | SQLite (better-sqlite3) WAL + Migrationsgerüst | M |
| T1.13 | React-Bootstrap + statischer Screen 800×480 | S |
| T1.14 | i18n-Schicht (I18nContext + de.json) | S |
| T1.15 | App-Bundle auf Pi deployen + via systemd starten | M |
| T1.16 | overlayfs scharf schalten + Crash-Test (5× Stecker) | L |

---

## Tasks (Detail)

### T1.01 — OS-Image Raspberry Pi OS Lite + Autologin
**Größe:** M
**Abhängigkeiten:** keine
**Vorbedingung:** microSD-Karte (≥ 16 GB), Raspberry Pi Imager auf dem Laptop, Pi 4 mit 7" Touchscreen verkabelt.

**Ziel:** Pi bootet von SD in eine Konsole und loggt den User `player` automatisch ein, ohne Tastatur/Maus, mit SSH-Zugang für die weitere Einrichtung.

**Beschreibung:**
1. Mit Raspberry Pi Imager **Raspberry Pi OS Lite (64-bit, Bookworm)** flashen.
2. Im Imager-Vorab-Dialog (Zahnrad / „OS Customisation"):
   - Hostname: `hoermond`
   - SSH aktivieren, Public-Key-Auth bevorzugt
   - Benutzer anlegen: Username `player`, Passwort setzen
   - WLAN/Locale nach Bedarf (Locale `de_DE.UTF-8`, Timezone `Europe/Vienna`)
3. SD einlegen, booten, per SSH verbinden (`ssh player@hoermond.local`).
4. System aktualisieren:
   ```bash
   sudo apt-get update && sudo apt-get -y full-upgrade
   ```
5. Display fest auf 800×480 Querformat. In `/boot/firmware/config.txt` (Bookworm-Pfad!) sicherstellen bzw. ergänzen:
   ```ini
   hdmi_force_hotplug=1
   hdmi_group=2
   hdmi_mode=87
   hdmi_cvt=800 480 60 6 0 0 0
   disable_overscan=1
   ```
   Falls das offizielle 7" DSI-Display genutzt wird, entfällt die HDMI-CVT-Zeile; dann reicht das DSI-Auto-Detect. HDMI-CVT nur bei HDMI-Panels setzen.
6. Autologin auf der Konsole aktivieren (getty-Override, NICHT lightdm — es gibt keinen Desktop):
   ```bash
   sudo systemctl edit getty@tty1
   ```
   Im Editor eintragen:
   ```ini
   [Service]
   ExecStart=
   ExecStart=-/sbin/agetty --autologin player --noclear %I $TERM
   ```
   Alternativ deterministisch per Datei:
   ```bash
   sudo mkdir -p /etc/systemd/system/getty@tty1.service.d
   sudo tee /etc/systemd/system/getty@tty1.service.d/autologin.conf >/dev/null <<'EOF'
   [Service]
   ExecStart=
   ExecStart=-/sbin/agetty --autologin player --noclear %I $TERM
   EOF
   sudo systemctl daemon-reload
   ```

**Caveats:**
- Bookworm legt Boot-Dateien unter `/boot/firmware/` ab, nicht mehr `/boot/`.
- Niemals `raspi-config` Desktop/lightdm aktivieren — wir starten X11 manuell (T1.03).

**Dateien/Artefakte:**
- Erstellt: `/etc/systemd/system/getty@tty1.service.d/autologin.conf`
- Verändert: `/boot/firmware/config.txt`

**Verifikation:**
```bash
sudo reboot
# Nach Reboot ohne Tastatur: Konsole zeigt Prompt als 'player' ohne Login-Eingabe.
whoami        # -> player
tty           # -> /dev/tty1
```
Sehen sollte man: automatisch eingeloggte Konsole als `player`.
Nicht sehen: `login:`-Prompt, der auf manuelle Eingabe wartet.

---

### T1.02 — Partitionierung: /media (ext4) + /var/lib/mediaplayer
**Größe:** M
**Abhängigkeiten:** T1.01
**Vorbedingung:** Pi bootet, SSH-Zugang, freier Speicher auf der SD.

> **Überholt:** Bei der tatsächlichen Durchführung stellte sich heraus, dass eine eigene
> Partition auf `/media` einen systemd-Abhängigkeitszyklus erzeugt (`overlayroot=tmpfs`
> reserviert `/media/root-ro`/`root-rw` intern) und den Pi unbootbar macht. Der reale
> Mountpoint ist `/mnt/hoermond` — siehe `m1-pi-setup.md` Schritt 2, das dieses Kapitel
> ersetzt. Dieser Abschnitt bleibt nur als historischer Plan stehen.

**Ziel:** Eine separate ext4-Partition `/media` mit `noatime,nodiratime`, plus ein schreibbares Verzeichnis `/var/lib/mediaplayer` — beide bleiben unter overlayfs (T1.16) schreibbar.

**Beschreibung:**
Es gibt zwei Wege. **Empfohlen Weg A** (eigene Partition auf der SD durch Schrumpfen der rootfs ist riskant) — daher pragmatisch: separate Partition aus dem freien Platz hinter rootfs anlegen.

1. Layout prüfen:
   ```bash
   lsblk
   sudo parted /dev/mmcblk0 print free
   ```
2. Neue Partition aus dem freien Bereich anlegen (Werte aus `print free` einsetzen; Beispiel ab 100 % der bisherigen Belegung):
   ```bash
   sudo parted -s /dev/mmcblk0 mkpart primary ext4 8GB 100%
   sudo partprobe /dev/mmcblk0
   ```
   Die neue Partition heißt z. B. `/dev/mmcblk0p3`.
3. Formatieren mit fester Partition-Bezeichnung (Label `MEDIA`):
   ```bash
   sudo mkfs.ext4 -L MEDIA /dev/mmcblk0p3
   ```
4. Mountpoint und Settings-Verzeichnis anlegen:
   ```bash
   sudo mkdir -p /media
   sudo mkdir -p /var/lib/mediaplayer
   ```
5. In `/etc/fstab` per Label mounten (Label ist umordnungsstabil, anders als `/dev/mmcblk0p3`):
   ```bash
   echo 'LABEL=MEDIA  /media  ext4  defaults,noatime,nodiratime  0  2' | sudo tee -a /etc/fstab
   sudo mount -a
   ```
6. Besitzrechte für den Player-User setzen (MPD und App lesen/schreiben):
   ```bash
   sudo chown -R player:player /media /var/lib/mediaplayer
   ```

**Caveats:**
- `parted`-Offsets müssen zur tatsächlichen freien Region passen — `print free` ist verbindlich.
- `/media` ist normalerweise Auto-Mount-Ziel von udisks; auf Lite ohne Desktop unkritisch, aber sicherstellen, dass kein anderer Automounter dort hineinmountet.
- `/var/lib/mediaplayer` ist KEINE eigene Partition, sondern ein Verzeichnis auf rootfs — es wird in T1.07 als schreibbare overlayfs-Ausnahme deklariert.

**Dateien/Artefakte:**
- Erstellt: Partition `/dev/mmcblk0p3` (Label `MEDIA`), Verzeichnis `/var/lib/mediaplayer`
- Verändert: `/etc/fstab`

**Verifikation:**
```bash
mount | grep ' /media '
# erwartet: /dev/mmcblk0p3 on /media type ext4 (rw,noatime,nodiratime,...)
touch /var/lib/mediaplayer/test && echo OK && rm /var/lib/mediaplayer/test
# erwartet: OK
touch /media/test && echo OK && rm /media/test
# erwartet: OK
```
Sehen: `noatime` und `nodiratime` in den Mount-Optionen.
Nicht sehen: `/media` als Teil des rootfs (eigene Zeile mit eigenem Device).

---

### T1.03 — X11 minimal ohne WM + Cursor unterdrücken
**Größe:** M
**Abhängigkeiten:** T1.01
**Vorbedingung:** Autologin als `player` funktioniert (T1.01).

**Ziel:** Beim Konsolen-Login startet automatisch ein X-Server ohne Window-Manager, ohne Panel, mit unterdrücktem Mauszeiger; `.xinitrc` startet einen Platzhalter-Befehl (später Electron).

**Beschreibung:**
1. Minimales X11 + Tools installieren (kein Desktop, kein WM):
   ```bash
   sudo apt-get install -y --no-install-recommends xserver-xorg xinit x11-xserver-utils unclutter
   ```
2. `~/.xinitrc` für `player` anlegen:
   ```bash
   tee /home/player/.xinitrc >/dev/null <<'EOF'
   #!/bin/sh
   # Bildschirmschoner/DPMS für M1 vorerst aus (M4 übernimmt DPMS-Steuerung)
   xset s off
   xset -dpms
   xset s noblank
   # Cursor sofort verstecken
   unclutter -idle 0 -root &
   # Platzhalter bis Electron integriert ist (T1.15 ersetzt diese Zeile)
   exec xterm -fullscreen
   EOF
   chmod +x /home/player/.xinitrc
   ```
3. `startx` automatisch beim Login auf tty1 starten. In `~/.bash_profile` (oder `~/.profile`) von `player`:
   ```bash
   tee -a /home/player/.bash_profile >/dev/null <<'EOF'

   # Nur auf tty1 und nur wenn X noch nicht läuft
   if [ "$(tty)" = "/dev/tty1" ] && [ -z "$DISPLAY" ]; then
     exec startx -- -nocursor
   fi
   EOF
   ```
   Das `-nocursor`-Flag des X-Servers unterdrückt den Cursor zusätzlich zu `unclutter` (Gürtel + Hosenträger).

**Caveats:**
- `exec startx` ersetzt die Shell — bei X-Fehlern keine Login-Shell mehr. Während der Einrichtung per SSH arbeiten, nicht über die lokale Konsole.
- Kein `openbox`/`matchbox`/WM installieren — Electron im Kiosk-Modus braucht keinen WM.
- `unclutter -idle 0` versteckt Cursor erst nach erster Bewegung; `-nocursor` am X-Server ist der harte Weg. Beide kombinieren.

**Dateien/Artefakte:**
- Erstellt: `/home/player/.xinitrc`
- Verändert: `/home/player/.bash_profile`

**Verifikation:**
```bash
# Lokal am Display nach Reboot: Vollbild-xterm, kein Cursor, kein Fensterrahmen.
sudo reboot
# Per SSH prüfen, dass X läuft:
ps aux | grep -E 'Xorg|startx' | grep -v grep
DISPLAY=:0 xset q | grep -i monitor   # X erreichbar
```
Sehen: Vollflächiges xterm, kein Mauszeiger, keine Titelleiste.
Nicht sehen: Desktop-Hintergrund, Taskleiste, Mauszeiger, WM-Dekoration.

---

### T1.04 — MPD-Grundkonfiguration /etc/mpd.conf
**Größe:** S
**Abhängigkeiten:** T1.02
**Vorbedingung:** `/media` gemountet und schreibbar (T1.02).

**Ziel:** MPD läuft, kennt `/media` als `music_directory`, schreibt DB/Log/PID auf schreibbare Pfade unter `/var/lib/mediaplayer`; `mpc status` antwortet.

**Beschreibung:**
1. MPD und Client installieren:
   ```bash
   sudo apt-get install -y mpd mpc
   ```
2. Distro-Default-Unit zunächst deaktivieren (wir steuern Start über T1.05 sauber):
   ```bash
   sudo systemctl disable --now mpd.socket mpd.service 2>/dev/null || true
   ```
3. Schreibbare MPD-Pfade anlegen:
   ```bash
   sudo mkdir -p /var/lib/mediaplayer/mpd/playlists
   sudo chown -R player:player /var/lib/mediaplayer/mpd
   ```
4. `/etc/mpd.conf` ersetzen:
   ```bash
   sudo tee /etc/mpd.conf >/dev/null <<'EOF'
   music_directory     "/media"
   playlist_directory  "/var/lib/mediaplayer/mpd/playlists"
   db_file             "/var/lib/mediaplayer/mpd/mpd.db"
   log_file            "/var/lib/mediaplayer/mpd/mpd.log"
   pid_file            "/run/mpd/pid"
   state_file          "/var/lib/mediaplayer/mpd/state"
   sticker_file        "/var/lib/mediaplayer/mpd/sticker.sql"

   user                "player"
   bind_to_address     "127.0.0.1"
   port                "6600"

   auto_update         "no"

   # Audio-Output: M1 nutzt ALSA-Default (3.5mm-Fallback). Bluetooth folgt in M4.
   audio_output {
       type    "alsa"
       name    "ALSA Default"
   }
   EOF
   ```
   PID liegt unter `/run/mpd/` (tmpfs, immer schreibbar — overlayfs-sicher). `auto_update "no"`, weil der Medien-Import in einem späteren Meilenstein gesteuert wird.

**Caveats:**
- MPD-Default unter Bookworm startet via `mpd.socket`; das muss deaktiviert sein, sonst Doppelstart-Konflikt mit der eigenen Unit (T1.05).
- `pid_file` NICHT auf rootfs legen (read-only nach T1.16). `/run` ist tmpfs.
- `user "player"` muss zu den Besitzrechten von `/media` (T1.02) passen.

**Dateien/Artefakte:**
- Erstellt: `/var/lib/mediaplayer/mpd/` (Verzeichnisbaum)
- Verändert: `/etc/mpd.conf`

**Verifikation:**
```bash
sudo -u player mpd /etc/mpd.conf   # manueller Probestart (T1.05 macht es via systemd)
mpc status
# erwartet: 'volume: n/a   repeat: off ...' bzw. leere Playlist, KEIN Verbindungsfehler.
mpc update && mpc stats            # 'songs: 0' bei leerem /media ist ok
mpc kill                           # Probelauf beenden
```
Sehen: `mpc status` liefert Statuszeilen ohne `error: Connection refused`.
Nicht sehen: Schreibfehler in `/var/lib/mediaplayer/mpd/mpd.log`.

---

### T1.05 — systemd-Units mpd.service + mediaplayer.service
**Größe:** M
**Abhängigkeiten:** T1.03, T1.04
**Vorbedingung:** MPD-Config gültig (T1.04), X11-Autostart funktioniert (T1.03).

**Ziel:** Zwei systemd-Units: `mpd.service` (eigene, kontrollierte Variante) und `mediaplayer.service`, das X11 + Electron startet, `Restart=always`, geordnet nach MPD und graphical.target.

**Beschreibung:**
Architekturentscheidung: Electron wird NICHT mehr über `.xinitrc`/`.bash_profile` (T1.03) gestartet, sondern über eine systemd-Unit mit `Restart=always` (Akzeptanzkriterium 7: Crash → Neustart). T1.03 bleibt als X11-Bootstrap; `.xinitrc` wird in T1.15 angepasst, hier wird zunächst die Unit-Struktur gelegt.

1. **mpd.service** als eigene Override-freie Unit nutzen — die Distro-Unit ist deaktiviert (T1.04). Eigene Unit:
   ```bash
   sudo tee /etc/systemd/system/mpd.service >/dev/null <<'EOF'
   [Unit]
   Description=Music Player Daemon (Hoermond)
   After=network.target sound.target local-fs.target
   Requires=local-fs.target

   [Service]
   Type=notify
   ExecStartPre=/bin/mkdir -p /run/mpd
   ExecStartPre=/bin/chown player:player /run/mpd
   ExecStart=/usr/bin/mpd --no-daemon /etc/mpd.conf
   Restart=always
   RestartSec=2

   [Install]
   WantedBy=multi-user.target
   EOF
   ```
2. **mediaplayer.service** (startet erst X, dann Electron — in M1 noch Platzhalter, finalisiert in T1.15):
   ```bash
   sudo tee /etc/systemd/system/mediaplayer.service >/dev/null <<'EOF'
   [Unit]
   Description=Hoermond Kiosk App
   After=mpd.service systemd-user-sessions.service
   Requires=mpd.service
   Conflicts=getty@tty1.service

   [Service]
   User=player
   PAMName=login
   TTYPath=/dev/tty1
   Environment=DISPLAY=:0
   Environment=XAUTHORITY=/home/player/.Xauthority
   WorkingDirectory=/home/player
   # In M1 Platzhalter; T1.15 ersetzt ExecStart durch den echten startx+Electron-Aufruf
   ExecStart=/usr/bin/startx /home/player/.xinitrc -- -nocursor
   Restart=always
   RestartSec=2

   [Install]
   WantedBy=multi-user.target
   EOF
   ```
   **Architekturhinweis (zwei mögliche Modelle):**
   - *Modell A (gewählt):* Electron wird aus `.xinitrc` heraus gestartet, die Unit startet `startx`. Vorteil: ein X-Server, ein Prozessbaum. `Restart=always` startet bei Electron-Crash ganz X neu. Für M1 ausreichend und robust.
   - *Modell B:* X separat, Electron als eigene Unit. Granularerer Neustart, aber komplexer. Für M1 verworfen.
   Da Modell A gewählt ist, KOLLIDIERT die Unit mit dem `.bash_profile`-Autostart aus T1.03 — daher: in T1.03 gesetzten `exec startx`-Block aus `~/.bash_profile` ENTFERNEN und `Conflicts=getty@tty1.service` setzen, damit X nur einmal startet.
3. Aktivieren:
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable mpd.service mediaplayer.service
   sudo systemctl disable getty@tty1.service   # Konsole-Autologin entfällt, App übernimmt tty1
   ```

**Caveats:**
- Doppelter X-Start ist die häufigste Stolperstelle: NUR die Unit darf `startx` aufrufen. Den `~/.bash_profile`-Block aus T1.03 löschen.
- `PAMName=login` + `TTYPath` sind nötig, damit der X-Server die Berechtigung für tty1 bekommt (sonst „only console users allowed to run the X server").
- `Type=notify` für MPD setzt `systemd`-Notify-Support voraus (in Debian-MPD aktiviert). Bei Problemen `Type=simple` mit `--no-daemon`.

**Dateien/Artefakte:**
- Erstellt: `/etc/systemd/system/mpd.service`, `/etc/systemd/system/mediaplayer.service`
- Verändert: `/home/player/.bash_profile` (startx-Block entfernen)

**Verifikation:**
```bash
sudo systemctl restart mpd.service && systemctl is-active mpd.service   # active
mpc status                                                              # antwortet
sudo systemctl restart mediaplayer.service
systemctl is-active mediaplayer.service                                 # active
# Crash-Restart prüfen:
sudo pkill -f xterm   # bzw. später Electron; X/Unit muss neu starten
sleep 5 && systemctl is-active mediaplayer.service                      # wieder active
```
Sehen: Beide Units `active`; nach `pkill` automatischer Neustart.
Nicht sehen: zwei parallele Xorg-Prozesse (`ps aux | grep Xorg` → genau einer).

---

### T1.06 — Boot-Zeit-Messung & Optimierung (< 60s)
**Größe:** S
**Abhängigkeiten:** T1.05
**Vorbedingung:** mpd.service + mediaplayer.service starten beim Boot (T1.05).

**Ziel:** Verifizierter Kaltstart < 60s bis sichtbarer App-Screen; langsame Units identifiziert und, wo unkritisch, deaktiviert.

**Beschreibung:**
1. Boot vermessen:
   ```bash
   systemd-analyze
   systemd-analyze blame | head -n 20
   systemd-analyze critical-chain mediaplayer.service
   ```
2. Häufige Bremsen auf Lite ohne Netzabhängigkeit deaktivieren, falls vorhanden und unkritisch:
   ```bash
   # Warten auf Netzwerk-Online vermeiden, falls nicht zwingend:
   sudo systemctl disable --now NetworkManager-wait-online.service 2>/dev/null || true
   sudo systemctl disable --now systemd-networkd-wait-online.service 2>/dev/null || true
   # Bluetooth-Autostart in M1 noch nicht nötig (kommt in M4) — kann verzögern:
   # (NICHT deaktivieren, falls SSH-over-... o.ä. davon abhängt)
   ```
3. Bei GPU/Compositing-bedingter Verzögerung des Renderers: siehe `--disable-gpu`-Fallback in T1.11/T1.15.
4. Messung wiederholen, bis Wert < 60s stabil.

**Caveats:**
- Netz-Wait-Units sind die häufigste Ursache für > 60s. Nur deaktivieren, wenn keine boot-kritische Netzabhängigkeit besteht.
- `systemd-analyze` misst bis „userspace ready", nicht bis „Pixel sichtbar". Zusätzlich mit Stoppuhr vom Stromanschluss bis sichtbarem Screen messen.

**Dateien/Artefakte:**
- Verändert: ggf. deaktivierte Units (Symlinks unter `/etc/systemd/system/`)

**Verifikation:**
```bash
sudo reboot
# Stoppuhr: Stromanschluss -> sichtbarer "Hörmond startet"-Screen
systemd-analyze   # 'Startup finished in ... = NNs' mit NN < 60
```
Sehen: Gesamt-Bootzeit < 60s, Stoppuhr-Wert < 60s.
Nicht sehen: `NetworkManager-wait-online` mit zweistelliger Sekundenzahl in `blame`.

---

### T1.07 — overlayfs vorbereiten (schreibbare Ausnahmen, noch inaktiv)
**Größe:** M
**Abhängigkeiten:** T1.05
**Vorbedingung:** Alle System-Units konfiguriert; alle Schreibpfade bekannt.

**Ziel:** Alle Pfade, die unter read-only rootfs schreibbar bleiben müssen, sind als eigene Mounts/tmpfs deklariert — VORBEREITET, aber overlayfs ist NOCH NICHT aktiv (das macht T1.16 als letzter Schritt).

**Beschreibung:**
Inventar der Schreibpfade unter aktivem overlayfs:

| Pfad | Mechanismus | Begründung |
|------|-------------|------------|
| `/media` | eigene ext4-Partition (T1.02) | Medien |
| `/var/lib/mediaplayer` | bind-mount auf `/media`-Partition ODER eigene Partition | SQLite-State, MPD-DB |
| `/tmp` | tmpfs | flüchtig |
| `/var/log` | tmpfs (Logs flüchtig akzeptiert) | Schreibzugriffe |
| `/run`, `/run/mpd` | tmpfs (Default) | PID/Sockets |

1. **Entscheidung `/var/lib/mediaplayer` persistent halten:** Es enthält SQLite (Fortschritt, Settings) — muss Reboots überleben, darf NICHT tmpfs sein. Lösung: als Unterverzeichnis auf die persistente `/media`-Partition bind-mounten:
   ```bash
   sudo mkdir -p /media/.state
   # Bestehende Daten umziehen:
   sudo rsync -aHAX /var/lib/mediaplayer/ /media/.state/
   echo '/media/.state  /var/lib/mediaplayer  none  bind  0  0' | sudo tee -a /etc/fstab
   sudo mount -a
   ```
   Damit liegt aller persistente App-State auf der nicht-overlay-Partition und überlebt sowohl Reboot als auch read-only rootfs.
2. **tmpfs-Ausnahmen** in `/etc/fstab` ergänzen (falls nicht schon durch Distro vorhanden — Bookworm hat `/tmp` oft nicht als tmpfs):
   ```bash
   echo 'tmpfs  /tmp      tmpfs  defaults,nosuid,nodev  0  0' | sudo tee -a /etc/fstab
   echo 'tmpfs  /var/log  tmpfs  defaults,nosuid,nodev  0  0' | sudo tee -a /etc/fstab
   ```
3. Sicherstellen, dass MPD-PID (`/run/mpd`) und Log auf tmpfs/persistent korrekt liegen — bereits durch T1.04/T1.05 (`/run/mpd`, `/var/lib/mediaplayer/mpd/mpd.log`).

**Caveats:**
- `/var/log` als tmpfs verliert Logs bei Reboot — für M1/M2 akzeptiert. Falls Logs persistent gebraucht werden, in M2 auf `/media/.state/log` bind-mounten.
- Wenn `/var/lib/mediaplayer` NICHT auf die persistente Partition gebunden wird, gehen SQLite-Daten bei read-only rootfs verloren bzw. landen im flüchtigen overlay-Upper. Dieser Bind ist die kritischste Vorbereitung.
- overlayfs noch NICHT aktivieren — sonst sind T1.08–T1.15-Deployments auf dem Pi blockiert.

**Dateien/Artefakte:**
- Erstellt: `/media/.state/` (persistenter State), bind-mount-Eintrag
- Verändert: `/etc/fstab`

**Verifikation:**
```bash
sudo reboot
mount | grep mediaplayer
# erwartet: /media/.state on /var/lib/mediaplayer type ... (bind)
mount | grep -E ' /tmp | /var/log '
# erwartet: tmpfs für beide
ls /var/lib/mediaplayer/mpd/   # State nach Reboot noch vorhanden -> Persistenz ok
```
Sehen: bind-mount aktiv, tmpfs für `/tmp` und `/var/log`, SQLite/MPD-State persistent.
Nicht sehen: noch KEIN overlayfs (`mount | grep overlay` → leer).

---

### T1.08 — electron-vite Projekt-Setup (Main/Preload/Renderer)
**Größe:** M
**Abhängigkeiten:** keine (Laptop)
**Vorbedingung:** Node.js LTS (≥ 20) + npm auf dem Entwickler-Laptop; Git-Repo `audiobook_station`.

**Ziel:** Lauffähiges electron-vite-Projekt mit getrennten Verzeichnissen `src/main`, `src/preload`, `src/renderer`, TypeScript, das auf dem Laptop ein leeres Fenster öffnet.

**Beschreibung:**
Build-Tool-Festlegung: **electron-vite** (nicht electron-builder allein) — es bündelt Main/Preload/Renderer mit Vite, TypeScript out of the box, getrennte Configs.

1. Projekt scaffolden (im Repo-Root, Unterordner `app/`):
   ```bash
   cd /home/kmlpatrick/Privat/repos/audiobook_station
   npm create @quick-start/electron@latest app -- --template react-ts
   cd app && npm install
   ```
2. Resultierende Struktur prüfen/erzwingen:
   ```
   app/
     electron.vite.config.ts
     package.json
     tsconfig.json  tsconfig.node.json  tsconfig.web.json
     src/
       main/      index.ts
       preload/   index.ts
       renderer/  index.html  src/{App.tsx,main.tsx,...}
   ```
3. Electron-Version pinnen (Pi 4 / arm64 kompatibel): in `app/package.json` `electron` auf eine aktuelle stabile Version festsetzen (z. B. `^31` oder die vom Template gelieferte) und committen mit `package-lock.json`.
4. `app/.gitignore` enthält `node_modules`, `out`, `dist`.

**Caveats:**
- `better-sqlite3` (T1.12) ist nativ — auf dem Pi (arm64) muss es gegen die Electron-ABI gebaut werden. Build-Strategie dort klären (T1.15). Für T1.08 nur Scaffold.
- electron-vite trennt Configs sauber; keine manuelle webpack-Konfiguration nötig.

**Dateien/Artefakte:**
- Erstellt: gesamtes `app/`-Verzeichnis
- Verändert: Repo-Root `.gitignore` (falls nötig)

**Verifikation:**
```bash
cd /home/kmlpatrick/Privat/repos/audiobook_station/app
npm run dev
# erwartet: leeres Electron-Fenster öffnet auf dem Laptop, Vite-Dev-Server läuft.
npm run build
ls out/   # gebündelte main/preload/renderer-Artefakte
```
Sehen: Fenster öffnet, kein TS-Compile-Fehler, `out/` befüllt.
Nicht sehen: `nodeIntegration`-Warnungen (wird in T1.11 abgesichert).

---

### T1.09 — ipc-contract.ts — zentrales IPC-Vertrags-Artefakt
**Größe:** M
**Abhängigkeiten:** T1.08
**Vorbedingung:** TypeScript-Projektstruktur existiert (T1.08).

**Ziel:** Eine zentrale, von Main UND Preload importierbare TypeScript-Datei, die alle Commands (Renderer→Main) und Events (Main→Renderer) typisiert. Dies ist DAS Review-Artefakt für den Architektur-Grundvertrag.

**Beschreibung:**
1. Datei `app/src/shared/ipc-contract.ts` anlegen (`shared/` ist von Main, Preload und Renderer importierbar; in `electron.vite.config.ts` ggf. Alias `@shared` setzen).
2. Struktur (für M1 minimal, aber vertraglich vollständig erweiterbar):
   ```ts
   // app/src/shared/ipc-contract.ts

   /** Commands: Renderer -> Main (Request/Response, via ipcRenderer.invoke). */
   export interface IpcCommands {
     'app:getVersion': {
       request: void;
       response: { version: string };
     };
     // Künftige Commands (player:play, db:getProgress, ...) werden hier ergänzt.
   }

   /** Events: Main -> Renderer (push, via webContents.send). */
   export interface IpcEvents {
     'app:ready': { ts: number };
     // Künftige Events (player:stateChanged, display:dimmed, ...) hier ergänzt.
   }

   export type IpcCommandChannel = keyof IpcCommands;
   export type IpcEventChannel = keyof IpcEvents;

   /** Die per contextBridge exponierte API-Form (Preload implementiert sie, Renderer konsumiert sie). */
   export interface HoermondBridge {
     invoke<C extends IpcCommandChannel>(
       channel: C,
       payload: IpcCommands[C]['request'],
     ): Promise<IpcCommands[C]['response']>;
     on<E extends IpcEventChannel>(
       channel: E,
       listener: (payload: IpcEvents[E]) => void,
     ): () => void; // gibt Unsubscribe-Funktion zurück
   }

   /** Whitelist erlaubter Kanäle — Preload prüft hiergegen (Sicherheit). */
   export const ALLOWED_COMMANDS: IpcCommandChannel[] = ['app:getVersion'];
   export const ALLOWED_EVENTS: IpcEventChannel[] = ['app:ready'];
   ```
3. Globale Typdeklaration für den Renderer (`window.hoermond`): Datei `app/src/renderer/src/global.d.ts`:
   ```ts
   import type { HoermondBridge } from '@shared/ipc-contract';
   declare global {
     interface Window { hoermond: HoermondBridge; }
   }
   export {};
   ```

**Caveats:**
- Dieser Vertrag ist ab M1 STABIL — Änderungen sind reviewpflichtig. Nur additive Erweiterungen (neue Keys), keine Umbenennungen ohne Migration.
- Kein Geräte-Zustand im Renderer: der Vertrag erlaubt nur `invoke` (Pull) und `on` (Push-Events) — keine direkten Node/Electron-Objekte.
- Whitelist (`ALLOWED_*`) ist Pflicht: Preload darf nur diese Kanäle durchreichen, sonst beliebige IPC-Aufrufe möglich.

**Dateien/Artefakte:**
- Erstellt: `app/src/shared/ipc-contract.ts`, `app/src/renderer/src/global.d.ts`
- Verändert: `app/electron.vite.config.ts` (Alias `@shared`)

**Verifikation:**
```bash
cd /home/kmlpatrick/Privat/repos/audiobook_station/app
npx tsc --noEmit   # erwartet: keine Typfehler
```
Sehen: TS kompiliert; `@shared/ipc-contract` aus main/preload/renderer importierbar.
Nicht sehen: `any`-Typen in der Bridge-Signatur.

---

### T1.10 — Preload-Bridge-Skelett (contextBridge)
**Größe:** S
**Abhängigkeiten:** T1.09
**Vorbedingung:** `ipc-contract.ts` existiert und kompiliert (T1.09).

**Ziel:** Preload-Skript exponiert via `contextBridge.exposeInMainWorld('hoermond', ...)` eine typsichere Bridge, die ausschließlich whitelistete Kanäle durchreicht.

**Beschreibung:**
1. `app/src/preload/index.ts` implementieren:
   ```ts
   import { contextBridge, ipcRenderer } from 'electron';
   import {
     ALLOWED_COMMANDS,
     ALLOWED_EVENTS,
     type HoermondBridge,
     type IpcCommandChannel,
     type IpcEventChannel,
   } from '@shared/ipc-contract';

   const bridge: HoermondBridge = {
     invoke: (channel, payload) => {
       if (!ALLOWED_COMMANDS.includes(channel as IpcCommandChannel)) {
         throw new Error(`IPC command not allowed: ${String(channel)}`);
       }
       return ipcRenderer.invoke(channel as string, payload);
     },
     on: (channel, listener) => {
       if (!ALLOWED_EVENTS.includes(channel as IpcEventChannel)) {
         throw new Error(`IPC event not allowed: ${String(channel)}`);
       }
       const wrapped = (_e: unknown, payload: unknown) => listener(payload as never);
       ipcRenderer.on(channel as string, wrapped);
       return () => ipcRenderer.removeListener(channel as string, wrapped);
     },
   };

   contextBridge.exposeInMainWorld('hoermond', bridge);
   ```
2. Sicherstellen, dass `electron.vite.config.ts` das Preload-Bundle erzeugt und der BrowserWindow-`webPreferences.preload` darauf zeigt (T1.11).

**Caveats:**
- NIEMALS `ipcRenderer` direkt exponieren — nur die gekapselte `invoke`/`on`-Bridge. Direktes Exponieren öffnet beliebige Kanäle.
- Whitelist-Prüfung MUSS im Preload erfolgen (Renderer ist nicht vertrauenswürdig).
- Unsubscribe-Funktion zurückgeben, damit React-Komponenten Listener sauber abmelden (Memory-Leak-Vermeidung).

**Dateien/Artefakte:**
- Erstellt/Verändert: `app/src/preload/index.ts`

**Verifikation:**
```bash
cd /home/kmlpatrick/Privat/repos/audiobook_station/app
npx tsc --noEmit && npm run build   # baut, keine Typfehler
npm run dev
# In Electron-DevTools-Konsole des Renderers:
#   window.hoermond            -> Objekt mit invoke/on
#   window.require             -> undefined (nodeIntegration aus)
```
Sehen: `window.hoermond` existiert; `invoke`/`on` vorhanden.
Nicht sehen: `window.require`, `window.process`, `ipcRenderer` global.

---

### T1.11 — Main-Prozess: BrowserWindow Kiosk 800×480
**Größe:** M
**Abhängigkeiten:** T1.10
**Vorbedingung:** Preload-Bridge gebaut (T1.10).

**Ziel:** Main-Prozess erstellt ein randloses 800×480-Kiosk-Fenster mit `contextIsolation: true`, `nodeIntegration: false`, lädt den Renderer und registriert den ersten Command-Handler (`app:getVersion`).

**Beschreibung:**
1. `app/src/main/index.ts`:
   ```ts
   import { app, BrowserWindow, ipcMain } from 'electron';
   import { join } from 'path';
   import type { IpcCommands } from '@shared/ipc-contract';

   function createWindow(): void {
     const win = new BrowserWindow({
       width: 800,
       height: 480,
       fullscreen: true,
       kiosk: true,
       frame: false,
       autoHideMenuBar: true,
       backgroundColor: '#FBFAFE',
       webPreferences: {
         preload: join(__dirname, '../preload/index.js'),
         contextIsolation: true,
         nodeIntegration: false,
         sandbox: false, // auf dem Pi nötig
       },
     });

     // Renderer laden (Dev: Vite-Server, Prod: gebaute Datei)
     if (process.env['ELECTRON_RENDERER_URL']) {
       win.loadURL(process.env['ELECTRON_RENDERER_URL']);
     } else {
       win.loadFile(join(__dirname, '../renderer/index.html'));
     }

     win.webContents.on('did-finish-load', () => {
       win.webContents.send('app:ready', { ts: Date.now() });
     });
   }

   // Command-Handler registrieren
   ipcMain.handle('app:getVersion', (): IpcCommands['app:getVersion']['response'] => {
     return { version: app.getVersion() };
   });

   app.whenReady().then(() => {
     createWindow();
     app.on('activate', () => {
       if (BrowserWindow.getAllWindows().length === 0) createWindow();
     });
   });

   app.on('window-all-closed', () => {
     if (process.platform !== 'darwin') app.quit();
   });
   ```
2. Kiosk-Verhalten: `kiosk: true` + `frame: false` + `fullscreen: true`. Die CLI-Flags `--kiosk --noerrdialogs --disable-infobars` werden beim Start auf dem Pi gesetzt (T1.15), nicht im Code.

**Caveats:**
- `sandbox: false` ist auf dem Pi nötig, weil `better-sqlite3`/Preload-Node-Zugriff sonst eingeschränkt sind. Das ist eine bewusste Abwägung — der Renderer bleibt durch `contextIsolation: true` + `nodeIntegration: false` isoliert.
- GPU-Compositing auf Pi 4: falls schwarzer/flackernder Screen, in T1.15 `--disable-gpu` ergänzen. ZUERST ohne testen.
- `app:ready`-Event erst nach `did-finish-load` senden, sonst geht es ins Leere.

**Dateien/Artefakte:**
- Erstellt/Verändert: `app/src/main/index.ts`

**Verifikation:**
```bash
cd /home/kmlpatrick/Privat/repos/audiobook_station/app
npm run dev
# In Renderer-DevTools:
#   await window.hoermond.invoke('app:getVersion', undefined)  -> { version: "..." }
#   window.hoermond.on('app:ready', p => console.log(p))        -> erhält { ts }
```
Sehen: Fenster ohne Rahmen, `invoke` liefert Version, `app:ready` kommt an.
Nicht sehen: Menüleiste, Fensterrahmen, `nodeIntegration`-Sicherheitswarnung in der Konsole.

---

### T1.12 — SQLite (better-sqlite3) WAL + Migrationsgerüst
**Größe:** M
**Abhängigkeiten:** T1.08
**Vorbedingung:** Electron-Projekt existiert (T1.08).

**Ziel:** Main-Prozess öffnet eine SQLite-DB unter `/var/lib/mediaplayer/state.db` mit WAL, ein Migrationsgerüst legt eine Versions-Tabelle an und führt Migrationen sequentiell idempotent aus.

**Beschreibung:**
1. Abhängigkeit:
   ```bash
   cd /home/kmlpatrick/Privat/repos/audiobook_station/app
   npm install better-sqlite3
   npm install -D @types/better-sqlite3
   ```
2. `app/src/main/db/index.ts`:
   ```ts
   import Database from 'better-sqlite3';
   import { migrations } from './migrations';

   const DB_PATH = process.env['HOERMOND_DB_PATH'] ?? '/var/lib/mediaplayer/state.db';

   export function openDatabase(): Database.Database {
     const db = new Database(DB_PATH);
     db.pragma('journal_mode = WAL');
     db.pragma('foreign_keys = ON');
     runMigrations(db);
     return db;
   }

   function runMigrations(db: Database.Database): void {
     db.exec(`CREATE TABLE IF NOT EXISTS schema_version (
       version INTEGER PRIMARY KEY,
       applied_at TEXT NOT NULL
     );`);
     const row = db.prepare('SELECT MAX(version) AS v FROM schema_version').get() as { v: number | null };
     const current = row.v ?? 0;
     const tx = db.transaction((from: number) => {
       for (const m of migrations.filter((x) => x.version > from).sort((a, b) => a.version - b.version)) {
         m.up(db);
         db.prepare('INSERT INTO schema_version (version, applied_at) VALUES (?, ?)')
           .run(m.version, new Date().toISOString());
       }
     });
     tx(current);
   }
   ```
3. `app/src/main/db/migrations.ts`:
   ```ts
   import type Database from 'better-sqlite3';

   export interface Migration {
     version: number;
     up: (db: Database.Database) => void;
   }

   // M1: nur das Versions-Gerüst + eine triviale settings-Tabelle als Smoke-Test.
   export const migrations: Migration[] = [
     {
       version: 1,
       up: (db) => {
         db.exec(`CREATE TABLE settings (
           key   TEXT PRIMARY KEY,
           value TEXT NOT NULL
         );`);
       },
     },
   ];
   ```
4. In `app/src/main/index.ts` `openDatabase()` beim `app.whenReady()` aufrufen (Fehler beim Öffnen → loggen, App nicht hart crashen lassen, aber sichtbar machen).

**Caveats:**
- `better-sqlite3` ist nativ → ABI-Build gegen Electron nötig. Auf dem Laptop reicht `npm install`; für den Pi wird in T1.15 `@electron/rebuild` bzw. `electron-rebuild` ausgeführt. Beim lokalen `npm run dev` ggf. `npx electron-rebuild -f -w better-sqlite3`.
- WAL erzeugt `-wal`/`-shm`-Dateien neben der DB — diese MÜSSEN auf der schreibbaren Partition liegen (T1.07: `/var/lib/mediaplayer` ist bind-gemountet, ok).
- Migrationen in EINER Transaktion pro Lauf → bei Crash kein halb-migrierter Zustand.
- DB-Pfad per `HOERMOND_DB_PATH` überschreibbar, damit Tests auf dem Laptop nicht `/var/lib/mediaplayer` brauchen.

**Dateien/Artefakte:**
- Erstellt: `app/src/main/db/index.ts`, `app/src/main/db/migrations.ts`
- Verändert: `app/src/main/index.ts`, `app/package.json`

**Verifikation:**
```bash
cd /home/kmlpatrick/Privat/repos/audiobook_station/app
# Lokal mit temporärem Pfad testen:
HOERMOND_DB_PATH=/tmp/state.db npm run dev
# In einem zweiten Terminal:
sqlite3 /tmp/state.db "PRAGMA journal_mode; SELECT * FROM schema_version; .tables"
# erwartet: 'wal', eine Zeile version=1, Tabellen 'schema_version' und 'settings'.
ls -la /tmp/state.db*   # state.db, state.db-wal, state.db-shm
```
Sehen: `journal_mode = wal`, `schema_version` enthält Version 1, `settings` existiert.
Nicht sehen: Fehler „database is locked" oder fehlende WAL-Dateien.

---

### T1.13 — React-Bootstrap + statischer Screen 800×480
**Größe:** S
**Abhängigkeiten:** T1.08
**Vorbedingung:** Renderer-Gerüst (React+TS) aus T1.08.

**Ziel:** Der Renderer zeigt einen statischen, logikfreien 800×480-Screen mit Logo-Platzhalter und zentriertem Text in den festgelegten Farben.

**Beschreibung:**
1. `app/src/renderer/src/App.tsx` ersetzen:
   ```tsx
   import './App.css';

   export default function App(): JSX.Element {
     return (
       <div className="boot-screen">
         <div className="logo-placeholder" aria-hidden="true" />
         <p className="boot-text">Hörmond startet</p>
       </div>
     );
   }
   ```
   Hinweis: Der Text wird in T1.14 durch `t('boot.starting')` ersetzt. Hier zunächst hartkodiert, damit T1.13 unabhängig abnehmbar ist.
2. `app/src/renderer/src/App.css`:
   ```css
   html, body, #root { margin: 0; padding: 0; width: 800px; height: 480px; overflow: hidden; }
   .boot-screen {
     width: 800px; height: 480px;
     display: flex; flex-direction: column;
     align-items: center; justify-content: center;
     background: #FBFAFE;
     font-family: system-ui, sans-serif; /* Atkinson Hyperlegible folgt in M3 */
   }
   .logo-placeholder {
     width: 120px; height: 120px; margin-bottom: 24px;
     border-radius: 24px;
     background: #2A2342; opacity: 0.12;
   }
   .boot-text { color: #2A2342; font-size: 28px; margin: 0; }
   ```
3. Sicherstellen, dass `index.html` keinen Scrollbalken/Default-Margin hat (CSS oben deckt das ab).

**Caveats:**
- Exakt 800×480 fix verdrahten — kein responsives Layout (Gerät hat genau diese Auflösung).
- `overflow: hidden` verhindert Scrollbalken, die in Kiosk hässlich wären.
- system-ui als Font-Fallback bewusst; Atkinson Hyperlegible erst in M3.

**Dateien/Artefakte:**
- Verändert: `app/src/renderer/src/App.tsx`, `app/src/renderer/src/App.css`

**Verifikation:**
```bash
cd /home/kmlpatrick/Privat/repos/audiobook_station/app
npm run dev
# erwartet: Fenster zeigt hellen Hintergrund #FBFAFE, abgerundeten Logo-Platzhalter,
#           zentrierten Text "Hörmond startet" in #2A2342.
```
Sehen: zentrierter Text + Logo-Platzhalter, kein Scrollbalken.
Nicht sehen: weißer Default-Hintergrund, verschobenes/abgeschnittenes Layout.

---

### T1.14 — i18n-Schicht (I18nContext + de.json)
**Größe:** S
**Abhängigkeiten:** T1.13
**Vorbedingung:** Statischer Screen rendert (T1.13).

**Ziel:** Eine schlanke eigene i18n-Schicht (`I18nContext` mit `t(key)`), die `de.json` statisch lädt; der Boot-Text kommt aus `t('boot.starting')`.

**Beschreibung:**
1. `app/src/renderer/src/i18n/de.json`:
   ```json
   {
     "boot.starting": "Hörmond startet"
   }
   ```
2. `app/src/renderer/src/i18n/I18nContext.tsx`:
   ```tsx
   import { createContext, useContext, type ReactNode } from 'react';
   import de from './de.json';

   type Dict = Record<string, string>;
   const dict: Dict = de;

   function translate(key: string): string {
     return dict[key] ?? key; // Fallback: Key sichtbar, nie leer
   }

   const I18nContext = createContext<(key: string) => string>(translate);

   export function I18nProvider({ children }: { children: ReactNode }): JSX.Element {
     return <I18nContext.Provider value={translate}>{children}</I18nContext.Provider>;
   }

   export function useT(): (key: string) => string {
     return useContext(I18nContext);
   }
   ```
3. JSON-Import in TS aktivieren: in `app/tsconfig.web.json` `"resolveJsonModule": true` sicherstellen.
4. Provider in `app/src/renderer/src/main.tsx` einhängen (App in `<I18nProvider>` wrappen).
5. `App.tsx` umstellen:
   ```tsx
   import { useT } from './i18n/I18nContext';
   // ...
   const t = useT();
   // <p className="boot-text">{t('boot.starting')}</p>
   ```

**Caveats:**
- Bewusst KEINE schwere i18n-Bibliothek (react-i18next) — für key-basierte deutsche Strings reicht der Context. Erweiterung auf Pluralisierung/Interpolation später möglich.
- Fallback gibt den Key zurück, nie leeren String — fehlende Übersetzungen sind so sofort sichtbar.
- Alle künftigen UI-Strings MÜSSEN über `t('key')` laufen (Architekturvorgabe i18n-ready), keine hartkodierten Strings im JSX.

**Dateien/Artefakte:**
- Erstellt: `app/src/renderer/src/i18n/de.json`, `app/src/renderer/src/i18n/I18nContext.tsx`
- Verändert: `app/src/renderer/src/main.tsx`, `app/src/renderer/src/App.tsx`, `app/tsconfig.web.json`

**Verifikation:**
```bash
cd /home/kmlpatrick/Privat/repos/audiobook_station/app
npx tsc --noEmit
npm run dev
# erwartet: Text "Hörmond startet" weiterhin sichtbar, jetzt aus de.json geladen.
# Test Fallback: t('does.not.exist') zeigte den Key selbst an.
```
Sehen: identischer Screen wie T1.13, Text aus `de.json`.
Nicht sehen: leerer Text, `undefined`, TS-Fehler bei JSON-Import.

---

### T1.15 — App-Bundle auf Pi deployen + via systemd starten
**Größe:** M
**Abhängigkeiten:** T1.06, T1.11, T1.12, T1.14
**Vorbedingung:** App baut auf dem Laptop (`npm run build`); Pi mit System-Setup T1.01–T1.06 (overlayfs noch INAKTIV).

**Ziel:** Die gebaute Electron-App läuft auf dem Pi im Kiosk-Modus über `mediaplayer.service`, zeigt den „Hörmond startet"-Screen, nutzt SQLite unter `/var/lib/mediaplayer` und MPD über IPC-Vertrag-Fundament.

**Beschreibung:**
1. Node + Build-Toolchain auf dem Pi (für nativen `better-sqlite3`-Rebuild):
   ```bash
   sudo apt-get install -y nodejs npm build-essential python3
   ```
   Alternativ: App auf dem Laptop für arm64 paketieren. Pragmatisch für M1: Quellcode auf den Pi spiegeln und dort bauen.
2. Code auf den Pi bringen (z. B. via git oder rsync) nach `/opt/hoermond/app`:
   ```bash
   sudo mkdir -p /opt/hoermond && sudo chown player:player /opt/hoermond
   rsync -aHAX --exclude node_modules --exclude out \
     /home/kmlpatrick/Privat/repos/audiobook_station/app/ player@hoermond.local:/opt/hoermond/app/
   ```
3. Auf dem Pi installieren, nativ rebuilden, bauen:
   ```bash
   cd /opt/hoermond/app
   npm install
   npx electron-rebuild -f -w better-sqlite3   # better-sqlite3 gegen Electron-ABI bauen
   npm run build
   ```
4. Electron muss auf den DB-Standardpfad zugreifen — `/var/lib/mediaplayer/state.db` (T1.07 persistent). Sicherstellen, dass `player` dort schreiben darf (T1.02/T1.07).
5. `.xinitrc` (aus T1.03) auf Electron umstellen — Platzhalter `xterm` ersetzen:
   ```bash
   tee /home/player/.xinitrc >/dev/null <<'EOF'
   #!/bin/sh
   xset s off; xset -dpms; xset s noblank
   unclutter -idle 0 -root &
   cd /opt/hoermond/app
   exec npx electron-vite preview -- \
     --kiosk --noerrdialogs --disable-infobars --no-sandbox
   EOF
   chmod +x /home/player/.xinitrc
   ```
   Hinweis: `electron-vite preview` startet die gebaute App. Alternativ direkt das gebaute Binary aus `out/` via `npx electron .` starten. Festlegen, was im Projekt der „run built app"-Befehl ist, und konsistent verwenden.
6. `--disable-gpu`-Fallback dokumentiert: ZUERST ohne starten. Bei schwarzem Bild/Flackern Flag in `.xinitrc` ergänzen.
7. systemd übernimmt Start/Restart (T1.05, `mediaplayer.service` ruft `startx`).

**Caveats:**
- `--no-sandbox` ist auf dem Pi gesetzt (passt zu `sandbox: false` aus T1.11). Bewusste Abwägung; Isolation bleibt durch contextIsolation.
- `electron-rebuild` MUSS nach jedem `npm install` für native Module laufen, sonst „NODE_MODULE_VERSION mismatch".
- Renderer-Pfad: im Prod-Build lädt Main via `loadFile` (T1.11) — sicherstellen, dass `ELECTRON_RENDERER_URL` NICHT gesetzt ist.
- GPU: Pi 4 braucht ausreichend `gpu_mem` (in `/boot/firmware/config.txt`, z. B. `gpu_mem=128`), sonst Compositing-Probleme.

**Dateien/Artefakte:**
- Erstellt: `/opt/hoermond/app/` (auf dem Pi)
- Verändert: `/home/player/.xinitrc`, ggf. `/boot/firmware/config.txt` (`gpu_mem`)

**Verifikation:**
```bash
# Auf dem Pi:
sudo systemctl restart mediaplayer.service
# Am Display: "Hörmond startet"-Screen, randlos, kein Cursor.
sqlite3 /var/lib/mediaplayer/state.db "SELECT * FROM schema_version;"  # version 1
mpc status                                                             # MPD antwortet
ps aux | grep -i electron | grep -v grep                               # Electron läuft
# Crash-Restart:
pkill -f electron; sleep 8; ps aux | grep -i electron | grep -v grep   # wieder da
```
Sehen: Boot-Screen am Display, Electron-Prozess, SQLite-State, MPD antwortet, Auto-Restart.
Nicht sehen: Cursor, Fensterrahmen, weißer Bildschirm, ABI-Fehler in `journalctl -u mediaplayer`.

---

### T1.16 — overlayfs scharf schalten + Crash-Test (5× Stecker)
**Größe:** L
**Abhängigkeiten:** T1.07, T1.15
**Vorbedingung:** Komplettes System läuft (App + MPD + Persistenz), overlayfs vorbereitet (T1.07) aber inaktiv; **Backup-SD erstellt**.

**Ziel:** read-only rootfs mit overlayfs aktiv; `/media` und `/var/lib/mediaplayer` schreibbar; Schreibversuch auf `/` schlägt fehl; 5× hartes Stromtrennen + Reboot ohne Korruption/fsck-Fehler, App kommt jedesmal wieder.

**Beschreibung:**
**Risiko-Hinweis:** overlayfs ist das höchste Risiko in M1. Ein falscher Mount macht das System unbenutzbar. ZWINGEND vorher SD-Image-Backup ziehen:
```bash
# Auf dem Laptop, Pi heruntergefahren, SD im Reader:
sudo dd if=/dev/mmcblk0 of=hoermond-pre-overlay.img bs=4M status=progress
```

1. overlayfs aktivieren. Bevorzugt über `raspi-config` (robust, getestet):
   ```bash
   sudo raspi-config
   # Menü: Performance Options -> Overlay File System -> Enable -> Yes
   #       Boot-Partition write-protect: Yes (optional, härter)
   ```
   `raspi-config` setzt das `initramfs`-overlay-Modul und patcht `/boot/firmware/cmdline.txt`. Reboot nötig.
2. Prüfen, dass die persistenten Pfade WEITERHIN gemountet sind: `/media` (eigene Partition, vom overlay unberührt) und `/var/lib/mediaplayer` (bind auf `/media/.state`, T1.07). Da beide auf der separaten ext4-Partition liegen, sind sie NICHT Teil des read-only overlay-rootfs.
3. Sicherstellen, dass MPD-PID/Log und SQLite-WAL auf schreibbaren Pfaden liegen (T1.04/T1.07) — sonst startet MPD/Electron unter read-only nicht.
4. Falls Probleme: overlay wieder ausschalten (`raspi-config` → Disable), Backup-SD als Rettungsanker.

**Caveats:**
- Nach Aktivierung sind ALLE Änderungen am rootfs flüchtig (gehen bei Reboot verloren). Künftige System-Updates erfordern: overlay aus → ändern → overlay an.
- Wenn `/var/lib/mediaplayer` NICHT korrekt gebunden ist (T1.07), landet SQLite im flüchtigen overlay-Upper und verliert Daten bei Reboot — das ist der kritischste Fehlerfall. Vor dem Crash-Test mit Reboot prüfen, dass DB-Inhalt überlebt.
- ext4 auf `/media` ist robust gegen Stromabriss (Journal), aber NICHT read-only — Korruption dort ist möglich. `data=ordered` (ext4-Default) mildert das.

**Dateien/Artefakte:**
- Verändert: `/boot/firmware/cmdline.txt`, initramfs (durch raspi-config)
- Backup: `hoermond-pre-overlay.img` (auf dem Laptop)

**Verifikation:**
```bash
# read-only rootfs:
mount | grep ' / '                 # erwartet: overlay (rw) über ro-rootfs
touch /test                        # erwartet: "Read-only file system" -> FEHLER (gewollt)
# schreibbare Ausnahmen:
touch /var/lib/mediaplayer/test && rm /var/lib/mediaplayer/test   # OK
touch /media/test && rm /media/test                               # OK
# Persistenz-Probe vor Crash-Test:
sqlite3 /var/lib/mediaplayer/state.db "INSERT OR REPLACE INTO settings VALUES('probe','1');"
sudo reboot
sqlite3 /var/lib/mediaplayer/state.db "SELECT value FROM settings WHERE key='probe';"  # -> 1 (überlebt)

# Crash-Test (5×): jeweils Stecker ziehen während App läuft, neu einstecken:
#   nach jedem Boot prüfen:
dmesg | grep -i 'ext4\|fsck\|corrupt'   # KEINE Fehler erwartet
systemctl is-active mediaplayer.service # active, Screen sichtbar
# 5 Durchläufe ohne Korruption protokollieren.
```
Sehen: `/` read-only (touch schlägt fehl), Ausnahmen schreibbar, SQLite-Probe überlebt Reboot, 5× sauberer Boot mit sichtbarem Screen.
Nicht sehen: fsck-Reparaturmeldungen, ext4-Korruption in `dmesg`, verlorener SQLite-State.

---

## M1 Abnahme-Checkliste (gegen Akzeptanzkriterien)

| AK | Kriterium | Verifiziert in |
|----|-----------|----------------|
| 1 | Kaltstart < 60s in Kiosk-App | T1.06, T1.15 |
| 2 | Kein Cursor/Titelleiste/Desktop/TTY-Prompt | T1.03, T1.11, T1.15 |
| 3 | Renderfläche exakt 800×480, randlos | T1.11, T1.13 |
| 4 | `mpc status` antwortet, kennt `/media` | T1.04, T1.15 |
| 5 | `/media` separate ext4 (noatime); rootfs ro; Ausnahmen schreibbar | T1.02, T1.07, T1.16 |
| 6 | 5× Stecker-Ziehen ohne Korruption | T1.16 |
| 7 | Electron-Crash → systemd-Neustart | T1.05, T1.15 |
