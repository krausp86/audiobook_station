# Pi-Setup-Anleitung — Meilenstein 1 „Hörmond"

Dieses Dokument führt vom frisch geflashten Pi bis zur laufenden Electron-App.
Es ersetzt T1.01–T1.07 + T1.15 als ausführbares Kochrezept.
**Nach diesem Dokument** das Abnahmeprotokoll (`m1-acceptance-test.md`) durchführen.

---

## Vorbedingungen

- Raspberry Pi 4 mit SD-Karte (≥ 16 GB), verkabelt mit 7"-Touchscreen und Stromversorgung
- SSH-Zugang vom Laptop (gleicher WLAN-Knoten wie der Pi)
- Git-Repo `audiobook_station` auf dem Laptop unter
  `/home/kmlpatrick/Privat/repos/audiobook_station`

---

## Schritt 0 — Erstes Booten & SSH-Verbindung prüfen

### 0a — OS-Variante prüfen

Das Setup erfordert **Raspberry Pi OS Lite (64-bit, Bookworm)** — ohne Desktop.
Beim ersten SSH-Login prüfen:

```bash
ssh player@hoermond.local
# Falls der Hostname nicht auflöst: ssh player@<IP-Adresse>
cat /etc/os-release | grep PRETTY
uname -m                   # erwartet: aarch64
```

Erwartete Ausgabe: `PRETTY_NAME="Debian GNU/Linux 12 (bookworm)"`, Architektur `aarch64`.

> **Falls du die Desktop-Version geflasht hast** (LXDE/Pixel sichtbar oder
> `raspi-config` zeigt Desktop-Boot): SD neu flashen mit **Raspberry Pi OS Lite
> (64-bit)** via Raspberry Pi Imager. Im Imager-Dialog (Zahnrad-Symbol):
> Hostname `hoermond`, User `player` + Passwort, SSH aktivieren,
> Locale `de_DE.UTF-8`, Timezone `Europe/Vienna`.

### 0b — System aktualisieren

```bash
sudo apt-get update && sudo apt-get -y full-upgrade
sudo reboot
# Nach Reboot wieder einloggen:
ssh player@hoermond.local
```

---

## Schritt 1 — Display-Auflösung & Autologin

### 1a — Display auf 800×480 konfigurieren

```bash
sudo nano /boot/firmware/config.txt
```

Am Ende der Datei ergänzen (nur bei **HDMI-Panel**; beim offiziellen 7"-DSI-Display diese Zeilen weglassen — DSI wird automatisch erkannt):

```ini
hdmi_force_hotplug=1
hdmi_group=2
hdmi_mode=87
hdmi_cvt=800 480 60 6 0 0 0
disable_overscan=1
gpu_mem=128
```

> `gpu_mem=128` ist nötig, damit Electron-Compositing auf dem Pi 4 funktioniert.

### 1b — Autologin für `player` auf tty1

```bash
sudo mkdir -p /etc/systemd/system/getty@tty1.service.d
sudo tee /etc/systemd/system/getty@tty1.service.d/autologin.conf >/dev/null <<'EOF'
[Service]
ExecStart=
ExecStart=-/sbin/agetty --autologin player --noclear %I $TERM
EOF
sudo systemctl daemon-reload
```

### 1c — Reboot & Verifikation

```bash
sudo reboot
# Nach Reboot:
ssh player@hoermond.local
whoami    # -> player
```

Am Display: Konsole zeigt Prompt als `player` ohne `login:`-Abfrage.

---

## Schritt 2 — Partitionierung: /media

### 2a — Freien Bereich auf der SD ermitteln

```bash
lsblk
sudo parted /dev/mmcblk0 print free
```

Den freien Bereich nach der rootfs-Partition notieren (typischerweise ab ~4–8 GB).

### 2b — Neue Partition anlegen

```bash
# Start-Offset aus 'print free' einsetzen (z. B. 8GB):
sudo parted -s /dev/mmcblk0 mkpart primary ext4 8GB 100%
sudo partprobe /dev/mmcblk0
lsblk   # neue Partition, z. B. mmcblk0p3, sichtbar
```

### 2c — Formatieren & einhängen

```bash
sudo mkfs.ext4 -L MEDIA /dev/mmcblk0p3

sudo mkdir -p /media
sudo mkdir -p /var/lib/mediaplayer

echo 'LABEL=MEDIA  /media  ext4  defaults,noatime,nodiratime  0  2' | sudo tee -a /etc/fstab
sudo mount -a

sudo chown -R player:player /media /var/lib/mediaplayer
```

### 2d — Verifikation

```bash
mount | grep ' /media '
# erwartet: .../mmcblk0p3 type ext4 (rw,noatime,nodiratime,...)
touch /media/test && rm /media/test && echo MEDIA_OK
touch /var/lib/mediaplayer/test && rm /var/lib/mediaplayer/test && echo STATE_OK
```

---

## Schritt 3 — X11 minimal (kein Desktop, kein WM)

### 3a — Pakete installieren

```bash
sudo apt-get install -y --no-install-recommends \
  xserver-xorg xinit x11-xserver-utils unclutter
```

### 3b — .xinitrc anlegen (vorerst xterm als Platzhalter)

```bash
tee /home/player/.xinitrc >/dev/null <<'EOF'
#!/bin/sh
xset s off
xset -dpms
xset s noblank
unclutter -idle 0 -root &
exec xterm -fullscreen
EOF
chmod +x /home/player/.xinitrc
```

> `.xinitrc` wird in Schritt 7 auf Electron umgestellt. xterm ist hier nur
> Platzhalter, um X11 zu testen.

### 3c — Verifikation X11 (optional, per SSH)

```bash
# Temporär manuell starten um zu prüfen, dass X funktioniert:
# (nicht nötig wenn du systemd-Start in Schritt 5 direkt einrichtest)
DISPLAY=:0 xset q 2>/dev/null && echo X_OK || echo X_NOT_RUNNING
```

---

## Schritt 4 — MPD konfigurieren

### 4a — Pakete & MPD-Pfade

```bash
sudo apt-get install -y mpd mpc sqlite3

# Distro-Unit deaktivieren (wir nutzen eigene Unit in Schritt 5):
sudo systemctl disable --now mpd.socket mpd.service 2>/dev/null || true

sudo mkdir -p /var/lib/mediaplayer/mpd/playlists
sudo chown -R player:player /var/lib/mediaplayer/mpd
```

### 4b — /etc/mpd.conf schreiben

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

audio_output {
    type    "alsa"
    name    "ALSA Default"
}
EOF
```

### 4c — Probestart & Verifikation

```bash
sudo -u player mpd /etc/mpd.conf
mpc status        # -> Statuszeilen, KEIN "Connection refused"
mpc stats         # songs: 0 bei leerem /media ist ok
mpc kill
```

---

## Schritt 5 — systemd-Units einrichten

### 5a — mpd.service (eigene Unit)

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

### 5b — mediaplayer.service

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
ExecStart=/usr/bin/startx /home/player/.xinitrc -- -nocursor
Restart=always
RestartSec=2

[Install]
WantedBy=multi-user.target
EOF
```

### 5c — Autologin-Block aus .bash_profile entfernen & Units aktivieren

Der Autologin-`startx`-Block in `~/.bash_profile` darf NICHT vorhanden sein —
sonst startet X zweimal (Konflikt mit der Unit). Prüfen und ggf. entfernen:

```bash
grep -n 'startx' /home/player/.bash_profile 2>/dev/null && \
  echo "ACHTUNG: startx-Block gefunden, manuell entfernen!" || \
  echo "OK — kein startx-Block"
```

Falls gefunden: `nano /home/player/.bash_profile` und den Block löschen.

Units aktivieren:

```bash
sudo systemctl daemon-reload
sudo systemctl enable mpd.service mediaplayer.service
sudo systemctl disable getty@tty1.service
```

### 5d — Verifikation

```bash
sudo reboot
ssh player@hoermond.local
systemctl is-active mpd.service mediaplayer.service
# beide: active
mpc status
ps aux | grep -c '[X]org'   # -> 1 (genau ein X-Server)
```

Am Display: Vollbild-xterm, kein Cursor, kein Fensterrahmen.

---

## Schritt 6 — Boot-Zeit optimieren

```bash
systemd-analyze
systemd-analyze blame | head -20
systemd-analyze critical-chain mediaplayer.service
```

Falls `NetworkManager-wait-online` oder `systemd-networkd-wait-online`
mit > 10s auftaucht:

```bash
sudo systemctl disable --now NetworkManager-wait-online.service 2>/dev/null || true
sudo systemctl disable --now systemd-networkd-wait-online.service 2>/dev/null || true
```

Reboot, Stoppuhr messen: Ziel < 60s bis sichtbarer Screen.

> Falls der Screen schwarz bleibt oder flackert: in Schritt 7 `--disable-gpu`
> zum Electron-Start ergänzen (dort vermerkt).

---

## Schritt 7 — overlayfs vorbereiten (noch NICHT aktivieren)

### 7a — Persistenten State auf /media auslagern

```bash
sudo mkdir -p /media/.state
sudo rsync -aHAX /var/lib/mediaplayer/ /media/.state/
echo '/media/.state  /var/lib/mediaplayer  none  bind  0  0' | sudo tee -a /etc/fstab
sudo mount -a
```

### 7b — tmpfs für /tmp und /var/log

```bash
echo 'tmpfs  /tmp      tmpfs  defaults,nosuid,nodev  0  0' | sudo tee -a /etc/fstab
echo 'tmpfs  /var/log  tmpfs  defaults,nosuid,nodev  0  0' | sudo tee -a /etc/fstab
```

### 7c — Reboot & Verifikation

```bash
sudo reboot
ssh player@hoermond.local
mount | grep mediaplayer      # -> bind von /media/.state
mount | grep -E ' /tmp | /var/log '   # -> tmpfs
mount | grep overlay          # -> LEER (overlay noch nicht aktiv)
ls /var/lib/mediaplayer/mpd/  # MPD-State noch vorhanden
```

---

## Schritt 8 — Node.js & Build-Toolchain auf dem Pi

Electron-Apps müssen für die Pi-ABI nativ gebaut werden.
Bookworms Standard-`nodejs` ist zu alt — NodeSource verwenden:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs build-essential python3 git
node --version    # -> v22.x.x
npm --version
```

---

## Schritt 9 — App auf den Pi deployen & bauen

### 9a — Repo vom Laptop rüberschieben

Auf dem **Laptop** ausführen:

```bash
sudo mkdir -p /opt/hoermond && sudo chown player:player /opt/hoermond
rsync -aHAX --exclude node_modules --exclude out \
  /home/kmlpatrick/Privat/repos/audiobook_station/app/ \
  player@hoermond.local:/opt/hoermond/app/
```

> Alternativ direkt auf dem Pi klonen:
> ```bash
> git clone <repo-url> /opt/hoermond/repo
> cp -r /opt/hoermond/repo/app /opt/hoermond/app
> ```

### 9b — Abhängigkeiten installieren & native Module bauen

Auf dem **Pi** (per SSH):

```bash
cd /opt/hoermond/app
npm install
# better-sqlite3 gegen Electron-ABI neu bauen:
npx electron-rebuild -f -w better-sqlite3
```

> Falls `electron-rebuild` mit Node-Versions-Warnung abbricht:
> `npm install -D electron-rebuild` und erneut versuchen.

### 9c — App bauen

```bash
npm run build
ls out/main/index.js out/preload/index.js out/renderer/index.html
# alle drei müssen vorhanden sein
```

### 9d — .xinitrc auf Electron umstellen

```bash
tee /home/player/.xinitrc >/dev/null <<'EOF'
#!/bin/sh
xset s off
xset -dpms
xset s noblank
unclutter -idle 0 -root &
cd /opt/hoermond/app
exec npx electron . \
  --kiosk --noerrdialogs --disable-infobars --no-sandbox
EOF
chmod +x /home/player/.xinitrc
```

> Falls der Screen nach dem Start schwarz bleibt oder flackert:
> `--disable-gpu` am Ende der `exec`-Zeile ergänzen und `mediaplayer.service`
> neu starten.

### 9e — mediaplayer.service neu starten & prüfen

```bash
sudo systemctl restart mediaplayer.service
sleep 10
systemctl is-active mediaplayer.service   # -> active
ps aux | grep -i '[e]lectron'             # Electron-Prozess vorhanden
```

Am Display: **„Hörmond startet"** auf hellem Hintergrund, kein Cursor, kein Rahmen.

### 9f — SQLite prüfen

```bash
sqlite3 /var/lib/mediaplayer/state.db \
  "PRAGMA journal_mode; SELECT * FROM schema_version; .tables"
# -> wal | 1 | ... | schema_version  settings
```

---

## Fertig — weiter mit dem Abnahmeprotokoll

Alle Schritte abgeschlossen? Dann:

```
tasks/m1-acceptance-test.md
```

von oben nach unten durchgehen. **Abschnitt D (overlayfs)** ist dort der
letzte Schritt — overlayfs wird erst im Abnahmeprotokoll aktiviert.
