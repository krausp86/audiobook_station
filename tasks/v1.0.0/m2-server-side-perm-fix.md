# Serverseitiger Permission-Fix für media-sync

## Problem

`rsync -a` (genutzt vom `media-sync`-Client) enthält `-p` ("preserve permissions") und
überträgt die Modus-Bits 1:1 von der Quelldatei. Liegt eine Quelldatei dort mit `700`,
kommt sie auch auf dem Pi mit `700` an — unlesbar für `player` (MPD-User) und beets.
Ein `umask` im `ForceCommand`-Wrapper (`media-sync-shell`) greift hier **nicht**, weil
`-p` die explizit übertragenen Bits danach ohnehin überschreibt.

**Entscheidung:** Nicht auf korrekte Client-Rechte verlassen — Server normalisiert die
Rechte nach jedem Sync selbst, bevor MPD/beets die Dateien anfassen.

## Schritt 1 — Root-Skript zur Rechte-Normalisierung anlegen

```bash
sudo tee /usr/local/sbin/media-fix-perms.sh >/dev/null <<'EOF'
#!/bin/sh
set -eu
MEDIA_DIR="/mnt/hoermond"

find "$MEDIA_DIR" \
  \( -path "$MEDIA_DIR/.state" -o -path "$MEDIA_DIR/.covers" \) -prune -o \
  -type f -exec chmod 664 {} + \
  -o -type d -exec chmod 2775 {} +

# Gruppe konsistent halten, falls media-sync-Dateien mit falscher Gruppe ankommen:
find "$MEDIA_DIR" \
  \( -path "$MEDIA_DIR/.state" -o -path "$MEDIA_DIR/.covers" \) -prune -o \
  \( -type f -o -type d \) -exec chgrp media {} +
EOF
sudo chmod 755 /usr/local/sbin/media-fix-perms.sh
sudo chown root:root /usr/local/sbin/media-fix-perms.sh
```

> **Hinweis:** `.state` und `.covers` werden bewusst ausgeschlossen — `.state` ist die
> Bind-Mount-Quelle für `/var/lib/mediaplayer` (Mode `700`, darf nicht geöffnet werden),
> `.covers` hat eigene Rechte aus der Cover-Pipeline.

## Schritt 2 — Eng begrenzte sudo-Freigabe für `player`

```bash
sudo tee /etc/sudoers.d/media-fix-perms >/dev/null <<'EOF'
player ALL=(root) NOPASSWD: /usr/local/sbin/media-fix-perms.sh
EOF
sudo chmod 440 /etc/sudoers.d/media-fix-perms
sudo visudo -c    # Syntax-Check, MUSS "parsed OK" melden
```

## Schritt 3 — In media-watcher.sh einhängen

Direkt nach dem Debounce-Trigger, **vor** `mpc --wait update` (Auszug aus
`/usr/local/sbin/media-watcher.sh`, Block "Ruhe-Fenster erreicht"):

```bash
sudo sed -i \
  's#if mpc --wait update >/dev/null 2>&1; then#sudo /usr/local/sbin/media-fix-perms.sh >/dev/null 2>\&1 || log_event "error" "media-fix-perms fehlgeschlagen"\n        if mpc --wait update >/dev/null 2>\&1; then#' \
  /usr/local/sbin/media-watcher.sh

# Kontrolle:
grep -n -A2 "media-fix-perms" /usr/local/sbin/media-watcher.sh
sudo systemctl restart media-watcher.service
```

## Schritt 4 — Verifizieren

Bereits feststeckende Datei jetzt reparieren (einmalig manuell, da sie vor dem Fix kam):
```bash
sudo /usr/local/sbin/media-fix-perms.sh
ls -la /mnt/hoermond/audiobooks/TestSync/   # erwartet: rw-rw-r--
mpc update && sleep 2 && mpc stats
mpc listall | grep TestSync
```

Neuer Sync-Test von vorne (Quelldatei diesmal bewusst mit `chmod 700` lokal, um den Fix
wirklich zu prüfen):
```bash
# auf dem sendenden Gerät:
chmod 700 /pfad/zu/testdatei2.mp3
rsync -avz --partial /pfad/zu/testdatei2.mp3 media-sync@<pi-ip>:/audiobooks/TestSync2/
```
```bash
# auf dem Pi, nach ein paar Sekunden (Debounce 8s + Fix + Rescan):
ls -la /mnt/hoermond/audiobooks/TestSync2/    # erwartet: rw-rw-r-- trotz Quelle 700
journalctl -u media-watcher -n 20 --no-pager
mpc stats
```

## Danach: Doku nachziehen

- `m2-tasks.md` T2.03 (`media-watcher.sh`): `media-fix-perms.sh`-Schritt + `sudoers`-Eintrag
  dauerhaft in den Setup-Code aufnehmen, `/media` → `/mnt/hoermond`.
- `tasks/t2-02-fix-media-sync-shell.md`: `/media` → `/mnt/hoermond` (Chroot-Pfade,
  Binary-Kopien für rsync im Jail).
