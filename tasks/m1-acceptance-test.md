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

- [ ] Hardware verkabelt: Pi 4, 7"-Touchscreen (800×480), Stromversorgung, **keine** Tastatur/Maus für den eigentlichen Test.
- [ ] Tasks **T1.01–T1.15** sind abgeschlossen (System eingerichtet, App auf `/opt/hoermond/app` deployt und gebaut).
- [ ] overlayfs ist **noch NICHT** aktiv (`mount | grep overlay` ist leer) — wird erst in Abschnitt D scharf geschaltet.
- [ ] SSH-Zugang zum Pi funktioniert (`ssh player@hoermond.local`). Alle Befehle laufen per SSH, sofern nicht „am Display" vermerkt.

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
**Ergebnis:** <!-- hier eintragen -->

### A2 — Partitionen & Schreibrechte
**Beschreibung:** `/media` ist separate ext4-Partition (noatime), `/media` und `/var/lib/mediaplayer` sind schreibbar.
**Befehl:**
```bash
mount | grep ' /media '
touch /media/test && rm /media/test && echo MEDIA_OK
touch /var/lib/mediaplayer/test && rm /var/lib/mediaplayer/test && echo STATE_OK
```
**Erwartet:** `/media` als eigenes Device (`/dev/mmcblk0p3`) Typ `ext4` mit `noatime,nodiratime`; beide `touch` liefern `MEDIA_OK` / `STATE_OK`.
**Ergebnis:** <!-- hier eintragen -->

### A3 — Persistenz-Bind & tmpfs (overlayfs-Vorbereitung)
**Beschreibung:** `/var/lib/mediaplayer` ist auf die persistente `/media`-Partition gebunden; `/tmp` und `/var/log` sind tmpfs.
**Befehl:**
```bash
mount | grep mediaplayer        # erwartet: bind von /media/.state auf /var/lib/mediaplayer
mount | grep -E ' /tmp | /var/log '
```
**Erwartet:** bind-mount aktiv; `/tmp` und `/var/log` als `tmpfs`. (Kritisch: ohne diesen Bind verliert SQLite seinen State unter overlayfs.)
**Ergebnis:** <!-- hier eintragen -->

### A4 — systemd-Units aktiv
**Beschreibung:** `mpd.service` und `mediaplayer.service` laufen, und es läuft genau **ein** Xorg.
**Befehl:**
```bash
systemctl is-active mpd.service mediaplayer.service
ps aux | grep -c '[X]org'       # erwartet: 1
```
**Erwartet:** beide `active`; genau ein Xorg-Prozess (kein Doppelstart aus `.bash_profile`).
**Ergebnis:** <!-- hier eintragen -->

### A5 — MPD antwortet & kennt /media
**Beschreibung:** MPD-Client erreicht den Daemon; `music_directory` ist `/media`.
**Befehl:**
```bash
mpc status                       # Statuszeilen, KEIN "Connection refused"
grep music_directory /etc/mpd.conf
mpc stats                        # songs: 0 bei leerem /media ist ok
```
**Erwartet:** `mpc status` liefert Statuszeilen ohne Fehler; `music_directory "/media"`; `mpc stats` ohne Fehler.
**Ergebnis:** <!-- hier eintragen -->

---

## Abschnitt B — App & IPC

> Diese Checks laufen am einfachsten in den **Renderer-DevTools**. Im
> Kiosk-Modus sind DevTools normalerweise zu — zum Testen per SSH temporär die
> App im Dev-Modus oder mit geöffneten DevTools starten, oder die DB-Checks
> direkt per `sqlite3` auf dem Pi durchführen (B4). **Wichtig:** Nach den
> DevTools-Tests die App wieder regulär über `mediaplayer.service` starten,
> bevor Abschnitt C/D beginnt.

### B1 — IPC-Command `app:getVersion`
**Vorbedingung:** Renderer-DevTools-Konsole offen.
**Befehl (DevTools-Konsole):**
```js
await window.hoermond.invoke('app:getVersion', undefined)
```
**Erwartet:** `{ version: "0.1.0" }` (Version aus `package.json`).
**Ergebnis:** <!-- hier eintragen -->

### B2 — Event `app:ready` kommt an (inkl. Replay für späte Subscriber)
**Beschreibung:** Das one-shot Lifecycle-Event wird auch an einen Listener geliefert, der sich erst nach dem Feuern registriert (Replay-Mechanismus).
**Befehl (DevTools-Konsole):**
```js
window.hoermond.on('app:ready', p => console.log('ready', p))
```
**Erwartet:** sofortige Ausgabe `ready { ts: <Zahl> }` (Replay aus dem Cache), nicht `undefined`.
**Ergebnis:** <!-- hier eintragen -->

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
**Ergebnis:** <!-- hier eintragen -->

### B4 — SQLite: Schema, WAL, settings-Tabelle
**Beschreibung:** DB unter dem Standardpfad mit WAL-Modus, Schema-Version 1 und `settings`-Tabelle.
**Befehl (per SSH):**
```bash
sqlite3 /var/lib/mediaplayer/state.db "PRAGMA journal_mode; SELECT * FROM schema_version; .tables"
ls -la /var/lib/mediaplayer/state.db*
```
**Erwartet:** `journal_mode = wal`; `schema_version` enthält Version 1; Tabellen `schema_version` und `settings`; WAL-Dateien `state.db-wal` / `state.db-shm` existieren.
**Ergebnis:** <!-- hier eintragen -->

---

## Abschnitt C — Integration (Kiosk-Boot, Kaltstart, Persistenz, Crash)

### C1 — Kiosk-Erscheinungsbild am Display
**Beschreibung:** Sichtbarer Boot-Screen ohne jegliche Desktop-/Cursor-Elemente.
**Handlung:** Display direkt betrachten.
**Erwartet — sichtbar:** heller Hintergrund `#FBFAFE`, Logo-Platzhalter, zentrierter Text **„Hörmond startet"**; Renderfläche füllt exakt 800×480, randlos, kein Scrollbalken.
**Erwartet — NICHT sichtbar:** Mauszeiger, Titelleiste/Fensterrahmen, Menüleiste, Desktop-Hintergrund, Taskleiste, TTY-Prompt.
**Ergebnis:** <!-- hier eintragen -->

### C2 — Kaltstart < 60 Sekunden (AK1)
**Beschreibung:** Vom Stromanschluss bis sichtbarem App-Screen unter 60s.
**Handlung:** Stecker ziehen, einstecken, **Stoppuhr** bis „Hörmond startet" sichtbar ist. Danach:
```bash
systemd-analyze
```
**Erwartet:** Stoppuhr-Wert < 60s; `systemd-analyze` zeigt Startup < 60s; in `systemd-analyze blame` keine `*-wait-online`-Unit mit zweistelliger Sekundenzahl.
**Ergebnis (Stoppuhr-Zeit eintragen):** <!-- hier eintragen -->

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
**Ergebnis:** <!-- hier eintragen -->

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
**Ergebnis:** <!-- hier eintragen -->

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

- [ ] **Backup-SD `hoermond-pre-overlay.img` erstellt und verifiziert.**

**Ergebnis (Backup):** <!-- hier eintragen -->

### D1 — overlayfs aktivieren
**Beschreibung:** read-only rootfs via overlayfs scharf schalten.
**Handlung:**
```bash
sudo raspi-config
# Performance Options -> Overlay File System -> Enable -> Yes
sudo reboot
```
**Erwartet:** Pi bootet nach Reboot normal in den „Hörmond startet"-Screen.
**Ergebnis:** <!-- hier eintragen -->

### D2 — rootfs read-only, Ausnahmen schreibbar (AK5)
**Beschreibung:** `/` ist read-only; `/media` und `/var/lib/mediaplayer` bleiben schreibbar.
**Befehl:**
```bash
mount | grep ' / '                              # overlay (rw) über ro-rootfs
touch /test                                     # erwartet: "Read-only file system" (FEHLER ist gewollt)
touch /var/lib/mediaplayer/test && rm /var/lib/mediaplayer/test && echo STATE_OK
touch /media/test && rm /media/test && echo MEDIA_OK
```
**Erwartet:** `touch /test` schlägt mit „Read-only file system" fehl (gewollt); Ausnahmen liefern `STATE_OK` / `MEDIA_OK`.
**Ergebnis:** <!-- hier eintragen -->

### D3 — Persistenz-Probe unter overlayfs
**Beschreibung:** SQLite-State überlebt einen Reboot trotz read-only rootfs.
**Befehl:**
```bash
sqlite3 /var/lib/mediaplayer/state.db "INSERT OR REPLACE INTO settings VALUES('probe2','42');"
sudo reboot
sqlite3 /var/lib/mediaplayer/state.db "SELECT value FROM settings WHERE key='probe2';"
```
**Erwartet:** Rückgabe `42`. (Schlägt dies fehl, landet State im flüchtigen overlay-Upper → A3-Bind prüfen.)
**Ergebnis:** <!-- hier eintragen -->

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
| 1 | <!-- --> | <!-- --> | <!-- --> |
| 2 | <!-- --> | <!-- --> | <!-- --> |
| 3 | <!-- --> | <!-- --> | <!-- --> |
| 4 | <!-- --> | <!-- --> | <!-- --> |
| 5 | <!-- --> | <!-- --> | <!-- --> |

**Ergebnis (Gesamt):** <!-- hier eintragen -->

---

## Abnahme-Checkliste (Akzeptanzkriterien M1)

| AK | Kriterium | Geprüft in | Status |
|----|-----------|-----------|--------|
| AK1 | Kaltstart < 60s bis sichtbarer Kiosk-Screen | C2 | [ ] |
| AK2 | Kein Cursor, keine Titelleiste, kein Desktop, kein TTY-Prompt | C1 (+ A1/A4) | [ ] |
| AK3 | Renderfläche exakt 800×480px, randlos, kein Scrollbalken | C1 | [ ] |
| AK4 | `mpc status` antwortet, kennt `/media` als music_directory | A5 | [ ] |
| AK5 | `/media` separate ext4 (noatime); rootfs ro; Ausnahmen schreibbar | A2 + D2 | [ ] |
| AK6 | 5× hartes Stromtrennen ohne Korruption, App kommt immer zurück | D4 | [ ] |
| AK7 | Electron-Crash → systemd-Neustart innerhalb weniger Sekunden | C4 | [ ] |

**Zusätzlich geprüft (über AK hinaus):** IPC `app:getVersion` (B1), `app:ready`-Replay (B2), Preload-Isolation (B3), SQLite WAL + Schema v1 (B4), Persistenz über Reboot (C3).

---

## Abnahme-Entscheidung

- [ ] **M1 abgenommen** — alle AK erfüllt.
- [ ] **M1 mit Auflagen abgenommen** — offene Punkte unten.
- [ ] **M1 abgelehnt** — Blocker unten.

**Offene Punkte / Blocker:** <!-- hier eintragen -->

**Unterschrift Tester / Datum:** <!-- hier eintragen -->
