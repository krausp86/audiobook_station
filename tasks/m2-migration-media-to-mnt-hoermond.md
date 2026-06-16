# Migration: Sync-Stack von /media auf /mnt/hoermond

## Hintergrund

`/media` ist **keine eigene Partition**, sondern nur ein Verzeichnis auf der rootfs
(`mmcblk0p2`). Verifiziert am 2026-06-16:

```
/dev/mmcblk0p3 on /mnt/hoermond type ext4 (rw,noatime,nodiratime)
/dev/mmcblk0p3 on /var/lib/mediaplayer type ext4 (rw,noatime,nodiratime)
```

`findmnt -t overlay` lieferte keine Treffer → **overlayroot ist aktuell deaktiviert**.
Das ist der einzige Grund, warum Daten unter `/media` bisher Reboots überlebt haben.
Sobald der Crash-Schutz (Kernanforderung aus M1) wieder aktiv ist, geht alles unter
`/media` beim nächsten Reboot verloren.

`/mnt/hoermond` (`mmcblk0p3`) ist der echte, persistente Speicher. `/var/lib/mediaplayer`
ist bereits korrekt dorthin gebunden (M1 ADR-2, `.state`-Unterverzeichnis vorhanden).

Zusätzliches Symptom: MPDs `music_directory` zeigt laut M1-Setup auf `/mnt/hoermond`,
die per M2-Sync tatsächlich übertragenen Dateien lagen aber unter `/media/audiobooks`
und `/media/music` — MPD sah diese Dateien also nicht. Datenmenge laut `du -sh` zum
Zeitpunkt der Migration: `audiobooks` 5,5 MB, `music` 4 KB — unkritisch klein.

Betroffene Komponenten, die aktuell fest auf `/media` verdrahtet sind: `media-sync`
SSH-Chroot (T2.02), `media-watcher.service` (inotify, T2.03), beets-Enrichment (T2.0x).

## Runbook (auf dem Pi ausführen)

### 1) Zielstruktur unter /mnt/hoermond anlegen (analog M2 T2.01)
```bash
sudo mkdir -p /mnt/hoermond/audiobooks /mnt/hoermond/music /mnt/hoermond/.covers
sudo chown -R player:media /mnt/hoermond/audiobooks /mnt/hoermond/music /mnt/hoermond/.covers
sudo chmod -R 2775 /mnt/hoermond/audiobooks /mnt/hoermond/music /mnt/hoermond/.covers
```

### 2) Daten umziehen
```bash
sudo rsync -aHAX /media/audiobooks/ /mnt/hoermond/audiobooks/
sudo rsync -aHAX /media/music/ /mnt/hoermond/music/
sudo rsync -aHAX /media/.covers/ /mnt/hoermond/.covers/

# verifizieren, dann erst löschen:
diff -r /media/audiobooks /mnt/hoermond/audiobooks
diff -r /media/music /mnt/hoermond/music
diff -r /media/.covers /mnt/hoermond/.covers

sudo rm -rf /media/audiobooks /media/music /media/.covers
```

### 3) Chroot-Jail-Binaries umziehen (bin/lib/usr für sshd ChrootDirectory)
```bash
sudo rsync -a /media/bin /media/lib /media/usr /mnt/hoermond/
sudo rm -rf /media/bin /media/lib /media/usr
```

### 4) /mnt/hoermond-Wurzel für sshd-Chroot vorbereiten
sshd verlangt, dass `ChrootDirectory` root:root und nicht gruppen-/world-writable ist
(sonst "bad ownership or modes for chroot directory").
```bash
sudo chown root:root /mnt/hoermond
sudo chmod 755 /mnt/hoermond
ls -ld /mnt/hoermond   # erwartet: drwxr-xr-x root root
```

### 5) sshd-Chroot umstellen
```bash
sudo sed -i 's#ChrootDirectory /media#ChrootDirectory /mnt/hoermond#' /etc/ssh/sshd_config.d/10-media-sync.conf
sudo systemctl restart sshd
```

### 6) media-watcher umstellen
```bash
sudo sed -i 's#MEDIA_DIR="/media"#MEDIA_DIR="/mnt/hoermond"#' /usr/local/sbin/media-watcher.sh
sudo systemctl restart media-watcher.service
```

### 7) beets-Config umstellen
```bash
sudo sed -i 's#directory: /media#directory: /mnt/hoermond#' /home/player/.config/beets/config.yaml
sudo sed -i 's#/media/audiobooks /media/music#/mnt/hoermond/audiobooks /mnt/hoermond/music#' /usr/local/sbin/media-enrich.sh
```

### 8) MPD-Bibliothek neu einlesen
MPD sollte `/mnt/hoermond` bereits als `music_directory` kennen (M1) — jetzt findet
es auch die migrierten Dateien.
```bash
mpc update && mpc stats
```

## Verifikation

```bash
stat -c '%U:%G %a' /mnt/hoermond              # erwartet: root:root 755

# Chroot-Sicherheit: darf NICHT außerhalb /mnt/hoermond schreiben/lesen können
rsync -avz /tmp/x media-sync@<pi-ip>:/../etc/    # MUSS scheitern / in /mnt/hoermond bleiben

ls /media                                       # sollte jetzt wieder leer/unbenutzt sein
mpc stats                                       # songs: > 0, wenn Testdateien vorhanden

# Persistenz-Test (overlayroot wieder aktivieren, falls für Produktion nötig):
findmnt -t overlay
# danach: Stecker ziehen / Reboot, prüfen ob /mnt/hoermond/audiobooks etc. noch da sind
```

## Danach: Docs nachziehen

Sobald die Migration verifiziert ist, müssen folgende Dokumente von `/media` auf
`/mnt/hoermond` aktualisiert werden, damit sie den tatsächlichen Endzustand beschreiben:

- `m2-tasks.md` (T2.01–T2.04, T2.0x beets) — durchgängig `/media` → `/mnt/hoermond`
- `tasks/t2-02-fix-media-sync-shell.md` — Chroot-Pfade, Binary-Kopien

Siehe auch [[project-pi-deploy-path]] für eine ähnliche Diskrepanz zwischen Tasklist-
Doku und realem Pi-Setup.
