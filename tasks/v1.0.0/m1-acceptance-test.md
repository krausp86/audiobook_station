# Abnahmeprotokoll — Meilenstein 1 „Hörmond"

> Stabiles Fundament: Pi 4 bootet ohne Eingabegeräte in eine cursor-freie
> Electron-Kiosk-App auf exakt 800×480px, crash-sicher (read-only rootfs +
> overlayfs), mit laufendem MPD und typisierter IPC-Bridge.

| Feld | Wert |
|------|------|
| **Datum** | <!-- TT.MM.JJJJ --> |
| **Tester** | <!-- Name --> |
| **Pi-IP / Hostname** | <!-- z. B. 192.168.x.x / hoermond.local --> |
| **SD-Karte / Image-Version** | <!-- optional --> |

Legende Ergebnis: `OK` / `FEHLER` (+ kurze Notiz). Jeder Schritt hat ein
Kommentarfeld. Abschnitte in dieser Reihenfolge abarbeiten — **Abschnitt D
(overlayfs) zwingend zuletzt.**

---

## Vorbedingungen (vor Testbeginn prüfen)

- [x] Hardware verkabelt: Pi 4, 7"-Touchscreen (800×480), Stromversorgung, **keine** Tastatur/Maus für den eigentlichen Test.
- [x] Tasks **T1.01–T1.15** sind abgeschlossen (System eingerichtet, App auf `~/hoermond/repo/app` deployt und gebaut).
- [x] overlayfs ist **noch NICHT** aktiv (`mount | grep overlay` ist leer) — wird erst in Abschnitt D scharf geschaltet.
- [x] SSH-Zugang zum Pi funktioniert (`ssh player@hoermond.local`). Alle Befehle laufen per SSH, sofern nicht „am Display" vermerkt.

**Ergebnis:** <!-- hier eintragen -->

---

## Abschnitt A — System-Grundlagen

### A1 — Autologin & Display-Auflösung
**Beschreibung:** Pi loggt `player` automatisch ein und Display ist auf 800×480 konfiguriert.
**Befehl (per SSH):**
```bash
whoami                                          # erwartet im Display-Login-Kontext: player
grep -E 'hdmi_cvt|hdmi_mode|dpi|800' /boot/firmware/config.txt
```
**Erwartet:** Display-Konsole loggt `player` ohne `login:`-Prompt ein; `config.txt` enthält 800×480-Auflösung (HDMI-CVT-Zeile bei HDMI-Panel; bei DSI-Display ggf. Auto-Detect — dann nur dokumentieren).
**Ergebnis:** DSI-autodetect, sonst OK

### A2 — Partitionen & Schreibrechte
**Beschreibung:** `/mnt/hoermond` ist separate ext4-Partition (noatime), `/mnt/hoermond` und `/var/lib/mediaplayer` sind schreibbar.
**Befehl:**
```bash
mount | grep ' /mnt/hoermond '
touch /mnt/hoermond/test && rm /mnt/hoermond/test && echo MEDIA_OK
touch /var/lib/mediaplayer/test && rm /var/lib/mediaplayer/test && echo STATE_OK
```
**Erwartet:** `/mnt/hoermond` als eigenes Device (`/dev/mmcblk0p3`) Typ `ext4` mit `noatime,nodiratime`; beide `touch` liefern `MEDIA_OK` / `STATE_OK`.
**Ergebnis:** OK

### A3 — Persistenz-Bind & tmpfs (overlayfs-Vorbereitung)
**Beschreibung:** `/var/lib/mediaplayer` ist auf die persistente `/mnt/hoermond`-Partition gebunden; `/tmp` und `/var/log` sind tmpfs.
**Befehl:**
```bash
mount | grep mediaplayer        # erwartet: bind von /mnt/hoermond/.state auf /var/lib/mediaplayer
mount | grep -E ' /tmp | /var/log '
```
**Erwartet:** bind-mount aktiv; `/tmp` und `/var/log` als `tmpfs`. (Kritisch: ohne diesen Bind verliert SQLite seinen State unter overlayfs.)
**Ergebnis:** OK

### A4 — systemd-Units aktiv
**Beschreibung:** `mpd.service` und `mediaplayer.service` laufen, und es läuft genau **ein** Xorg.
**Befehl:**
```bash
systemctl is-active mpd.service mediaplayer.service
ps aux | grep -c '[X]org'       # erwartet: 1
```
**Erwartet:** beide `active`; genau ein Xorg-Prozess (kein Doppelstart aus `.bash_profile`).
**Ergebnis:** OK

### A5 — MPD antwortet & kennt /mnt/hoermond
**Beschreibung:** MPD-Client erreicht den Daemon; `music_directory` ist `/mnt/hoermond`.
**Befehl:**
```bash
mpc status                       # Statuszeilen, KEIN "Connection refused"
grep music_directory /etc/mpd.conf
mpc stats                        # songs: 0 bei leerem /mnt/hoermond ist ok
```
**Erwartet:** `mpc status` liefert Statuszeilen ohne Fehler; `music_directory "/mnt/hoermond"`; `mpc stats` ohne Fehler.
**Ergebnis:** OK

---

## Abschnitt B — App & IPC

> **DevTools-Zugang via Remote Debugging (kein Keyboard am Pi nötig):**
>
> ```bash
> # 1. .xinitrc temporär anpassen (--kiosk entfernen, Port ergänzen):
> nano /home/player/.xinitrc
> # exec npx electron . --remote-debugging-port=9222 --noerrdialogs --no-sandbox
> sudo systemctl restart mediaplayer.service
> ```
>
> Dann am **Laptop** in Chrome/Chromium aufrufen:
> `chrome://inspect` → Configure… → `hoermond.local:9222` → **inspect**
>
> → volle DevTools-Konsole im Laptop-Browser.
>
> **Nach B3 unbedingt zurücksetzen:**
> ```bash
> nano /home/player/.xinitrc
> # exec npx electron . --kiosk --noerrdialogs --disable-infobars --no-sandbox
> sudo systemctl restart mediaplayer.service
> ```
> B4 (SQLite) läuft direkt per SSH, ohne DevTools.

### B1 — IPC-Command `app:getVersion`
**Vorbedingung:** Renderer-DevTools-Konsole offen.
**Befehl (DevTools-Konsole):**
```js
await window.hoermond.invoke('app:getVersion', undefined)
```
**Erwartet:** `{ version: "0.1.0" }` (Version aus `package.json`).
**Ergebnis:** OK

### B2 — Event `app:ready` kommt an (inkl. Replay für späte Subscriber)
**Beschreibung:** Das one-shot Lifecycle-Event wird auch an einen Listener geliefert, der sich erst nach dem Feuern registriert (Replay-Mechanismus).
**Befehl (DevTools-Konsole):**
```js
window.hoermond.on('app:ready', p => console.log('ready', p))
```
**Erwartet:** sofortige Ausgabe `ready { ts: <Zahl> }` (Replay aus dem Cache), nicht `undefined`.
**Ergebnis:** OK

### B3 — Preload-Sicherheit (Renderer-Isolation)
**Beschreibung:** Renderer hat keinen direkten Node-/Electron-Zugriff; nur die gekapselte Bridge ist exponiert.
**Befehl (DevTools-Konsole):**
```js
window.hoermond            // -> Objekt mit invoke/on
window.require             // -> undefined
window.electron            // -> undefined
window.hoermond.invoke('boese:command', undefined)   // -> wirft "IPC command not allowed"
```
**Erwartet:** `hoermond` vorhanden; `require`/`electron` sind `undefined`; nicht-whitelisteter Command wirft Fehler.
**Ergebnis:** OK

### B4 — SQLite: Schema, WAL, settings-Tabelle
**Beschreibung:** DB unter dem Standardpfad mit WAL-Modus, Schema-Version 1 und `settings`-Tabelle.
**Befehl (per SSH):**
```bash
sqlite3 /var/lib/mediaplayer/state.db "PRAGMA journal_mode; SELECT * FROM schema_version; .tables"
ls -la /var/lib/mediaplayer/state.db*
```
**Erwartet:** `journal_mode = wal`; `schema_version` enthält Version 1; Tabellen `schema_version` und `settings`; WAL-Dateien `state.db-wal` / `state.db-shm` existieren.
**Ergebnis:** OK

---

## Abschnitt C — Integration (Kiosk-Boot, Kaltstart, Persistenz, Crash)

### C1 — Kiosk-Erscheinungsbild am Display
**Beschreibung:** Sichtbarer Boot-Screen ohne jegliche Desktop-/Cursor-Elemente.
**Handlung:** Display direkt betrachten.
**Erwartet — sichtbar:** heller Hintergrund `#FBFAFE`, Logo-Platzhalter, zentrierter Text **„Hörmond startet"**; Renderfläche füllt exakt 800×480, randlos, kein Scrollbalken.
**Erwartet — NICHT sichtbar:** Mauszeiger, Titelleiste/Fensterrahmen, Menüleiste, Desktop-Hintergrund, Taskleiste, TTY-Prompt.
**Ergebnis:** OK

### C2 — Kaltstart < 60 Sekunden (AK1)
**Beschreibung:** Vom Stromanschluss bis sichtbarem App-Screen unter 60s.
**Handlung:** Stecker ziehen, einstecken, **Stoppuhr** bis „Hörmond startet" sichtbar ist. Danach:
```bash
systemd-analyze
```
**Erwartet:** Stoppuhr-Wert < 60s; `systemd-analyze` zeigt Startup < 60s; in `systemd-analyze blame` keine `*-wait-online`-Unit mit zweistelliger Sekundenzahl.
**Ergebnis (Stoppuhr-Zeit eintragen):** OK 26s

### C3 — Persistenz über normalen Reboot
**Beschreibung:** SQLite-State überlebt einen sauberen Reboot (Vorprobe vor dem Crash-Test).
**Befehl:**
```bash
sqlite3 /var/lib/mediaplayer/state.db "INSERT OR REPLACE INTO settings VALUES('probe','1');"
sudo reboot
# nach dem Reboot:
sqlite3 /var/lib/mediaplayer/state.db "SELECT value FROM settings WHERE key='probe';"
```
**Erwartet:** Rückgabe `1` — der Wert hat den Reboot überlebt.
**Ergebnis:** OK

### C4 — Electron-Crash → automatischer Neustart (AK7)
**Beschreibung:** Nach hartem Beenden von Electron startet `mediaplayer.service` die App neu.
**Befehl:**
```bash
pkill -f electron
sleep 8
systemctl is-active mediaplayer.service
ps aux | grep -i '[e]lectron'
```
**Erwartet:** Service wieder `active`, Electron-Prozess erneut vorhanden, Screen am Display wieder da (innerhalb weniger Sekunden).
**Ergebnis:** OK

---

## Abschnitt D — Härtung (overlayfs) — ZULETZT

> ⚠️ **WARNUNG — vor diesem Abschnitt zwingend lesen:**
> 1. **Backup-SD erstellen, bevor irgendetwas in D passiert.** Pi herunterfahren,
>    SD im Reader am Laptop:
>    `sudo dd if=/dev/mmcblk0 of=hoermond-pre-overlay.img bs=4M status=progress`
> 2. **Nach Aktivierung von overlayfs sind ALLE rootfs-Änderungen flüchtig.**
>    Es sind danach keine weiteren Systemänderungen möglich, ohne das overlay
>    wieder zu deaktivieren (`raspi-config` → Disable). Daher: erst alle
>    Abschnitte A–C abnehmen, dann D.
> 3. overlayfs ist das höchste Risiko in M1 — ein falscher Mount macht das
>    System unbenutzbar; die Backup-SD ist der Rettungsanker.

- [x] **Backup-SD `hoermond-pre-overlay.img` erstellt und verifiziert.**

**Ergebnis (Backup):** Done

### D1 — overlayfs aktivieren
**Beschreibung:** read-only rootfs via overlayfs scharf schalten.
**Handlung:**
```bash
sudo raspi-config
# Performance Options -> Overlay File System -> Enable -> Yes
sudo reboot
```
**Erwartet:** Pi bootet nach Reboot normal in den „Hörmond startet"-Screen.
**Ergebnis:** Nach größerem Umbau vollständig

### D2 — rootfs read-only, Ausnahmen schreibbar (AK5)
**Beschreibung:** `/` ist read-only; `/mnt/hoermond` und `/var/lib/mediaplayer` bleiben schreibbar.
**Befehl:**
```bash
mount | grep ' / '                              # overlay (rw) über ro-rootfs
touch /test                                     # erwartet: "Read-only file system" (FEHLER ist gewollt)
touch /var/lib/mediaplayer/test && rm /var/lib/mediaplayer/test && echo STATE_OK
touch /mnt/hoermond/test && rm /mnt/hoermond/test && echo MEDIA_OK
```
**Erwartet:** `touch /test` schlägt mit „Read-only file system" fehl (gewollt); Ausnahmen liefern `STATE_OK` / `MEDIA_OK`.
**Ergebnis:** OK

### D3 — Persistenz-Probe unter overlayfs
**Beschreibung:** SQLite-State überlebt einen Reboot trotz read-only rootfs.
**Befehl:**
```bash
sqlite3 /var/lib/mediaplayer/state.db "INSERT OR REPLACE INTO settings VALUES('probe2','42');"
sudo reboot
sqlite3 /var/lib/mediaplayer/state.db "SELECT value FROM settings WHERE key='probe2';"
```
**Erwartet:** Rückgabe `42`. (Schlägt dies fehl, landet State im flüchtigen overlay-Upper → A3-Bind prüfen.)
**Ergebnis:** OK

### D4 — Crash-Test 5× hartes Stromtrennen (AK6)
**Beschreibung:** Fünfmal Stecker ziehen während die App läuft; nach jedem Boot ohne Korruption zurück.
**Handlung pro Durchlauf:** Stecker ziehen → wieder einstecken → warten bis Screen da → prüfen:
```bash
dmesg | grep -i 'ext4\|fsck\|corrupt'           # KEINE Fehler erwartet
systemctl is-active mediaplayer.service          # active
```
**Erwartet:** in allen 5 Durchläufen sauberer Boot, sichtbarer Screen, keine fsck-/ext4-Korruptionsmeldung.

| Durchlauf | Boot ok? | dmesg sauber? | Screen sichtbar? |
|-----------|----------|---------------|------------------|
| 1 | OK | OK | OK |
| 2 | OK | OK | OK |
| 3 | OK | OK | OK |
| 4 | OK | OK | OK |
| 5 | OK | OK | OK |

> dmesg alle Durchläufe: `mmcblk0p2 ro` (rootfs readonly), `mmcblk0p3: recovery complete` (Journal-Recovery nach Stromausfall, keine Korruption), `mmcblk0p3 r/w`. Keine fsck-Fehler.

**Ergebnis (Gesamt):** OK

---

## Abnahme-Checkliste (Akzeptanzkriterien M1)

| AK | Kriterium | Geprüft in | Status |
|----|-----------|-----------|--------|
| AK1 | Kaltstart < 60s bis sichtbarer Kiosk-Screen | C2 | [x] |
| AK2 | Kein Cursor, keine Titelleiste, kein Desktop, kein TTY-Prompt | C1 (+ A1/A4) | [x] |
| AK3 | Renderfläche exakt 800×480px, randlos, kein Scrollbalken | C1 | [x] |
| AK4 | `mpc status` antwortet, kennt `/mnt/hoermond` als music_directory | A5 | [x] |
| AK5 | `/mnt/hoermond` separate ext4 (noatime); rootfs ro; Ausnahmen schreibbar | A2 + D2 | [x] |
| AK6 | 5× hartes Stromtrennen ohne Korruption, App kommt immer zurück | D4 | [x] |
| AK7 | Electron-Crash → systemd-Neustart innerhalb weniger Sekunden | C4 | [x] |

**Zusätzlich geprüft (über AK hinaus):** IPC `app:getVersion` (B1), `app:ready`-Replay (B2), Preload-Isolation (B3), SQLite WAL + Schema v1 (B4), Persistenz über Reboot (C3).

---

## Abnahme-Entscheidung

- [x] **M1 abgenommen** — alle AK erfüllt.
- [ ] **M1 mit Auflagen abgenommen** — offene Punkte unten.
- [ ] **M1 abgelehnt** — Blocker unten.

**Offene Punkte / Blocker:** keine.

**Unterschrift Tester / Datum:** Patrick Kraus-Füreder / 2026-06-15
