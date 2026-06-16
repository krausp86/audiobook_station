# Sync-Test nach /mnt/hoermond-Migration — Schritt für Schritt

Ziel: einen neuen Datei-Sync durchführen und dabei sicherstellen, dass die Datei mit
korrekten Rechten ankommt (lesbar für `player`/MPD), der Watcher den Rescan auslöst und
`mpc` die Datei findet.

## Schritt 1 — media-sync-shell lokalisieren

Der Pfad könnte nach der Migration an einer anderen Stelle liegen, als angenommen.
Auf dem Pi:
```bash
sudo find / -xdev -name "media-sync-shell" 2>/dev/null
find /mnt/hoermond -name "media-sync-shell" 2>/dev/null
cat /etc/ssh/sshd_config.d/10-media-sync.conf
```
Der `ForceCommand`-Eintrag in der letzten Ausgabe zeigt den exakten Pfad, den sshd
tatsächlich aufruft. Dieser Pfad ist **relativ zur Chroot-Wurzel** zu verstehen, d. h.
real liegt die Datei unter `/mnt/hoermond<Pfad-aus-ForceCommand>`.

## Schritt 2 — Skript prüfen / umask ergänzen

```bash
cat /mnt/hoermond/usr/local/sbin/media-sync-shell    # ggf. Pfad aus Schritt 1 anpassen
```

Falls **kein** `umask`-Befehl vor dem `exec rsync ...` steht, ergänzen:
```bash
sudo sed -i '2i umask 002' /mnt/hoermond/usr/local/sbin/media-sync-shell
cat /mnt/hoermond/usr/local/sbin/media-sync-shell     # Kontrolle: umask steht jetzt drin
```
(Zeile 2, weil Zeile 1 normalerweise das Shebang `#!/bin/sh` ist — bei Bedarf Zeilennummer
anpassen, `umask` muss vor dem `exec`/`rsync`-Aufruf stehen.)

Falls die Datei nicht existiert oder leer ist, schick mir den Inhalt von
`/etc/ssh/sshd_config.d/10-media-sync.conf`, dann bauen wir das Skript neu auf Basis von
`tasks/t2-02-fix-media-sync-shell.md`.

## Schritt 3 — sshd neu laden (nur falls Config geändert wurde, hier nicht nötig)

`umask` im Skript braucht keinen sshd-Reload — das Skript wird bei jeder neuen
SSH-Session frisch ausgeführt.

## Schritt 4 — echten Sync von der Quelle aus testen

**Auf dem sendenden Gerät** (Laptop), nicht auf dem Pi:
```bash
rsync -avz --partial /pfad/zu/testdatei.mp3 media-sync@<pi-ip>:/audiobooks/TestSync/
```
Wichtig: Ziel ist **relativ zur Chroot-Wurzel**, die jetzt `/mnt/hoermond` ist — also
`:/audiobooks/...`, NICHT `:/mnt/hoermond/audiobooks/...` (das würde fälschlich einen
Pfad `mnt/hoermond/audiobooks` *innerhalb* der Chroot suchen und scheitern).

## Schritt 5 — auf dem Pi verifizieren

```bash
ls -la /mnt/hoermond/audiobooks/TestSync/
# erwartet: -rw-rw-r-- media-sync media  (NICHT rwx------)

journalctl -u media-watcher -n 20 --no-pager
# erwartet: Log-Einträge "started" -> "completed" kurz nach dem Sync

mpc update && sleep 2 && mpc stats
mpc listall | grep TestSync
# erwartet: Songs-Zahl gestiegen, Pfad sichtbar
```

## Schritt 6 — Wiedergabe-Test (optional, am Touchscreen)

Neue Datei sollte in der UI-Liste auftauchen, antippen → Wiedergabe über Klinke.

## Wenn das alles klappt

Dann ist die Migration vollständig verifiziert. Sag mir Bescheid — ich aktualisiere
danach `m2-tasks.md` und `tasks/t2-02-fix-media-sync-shell.md` final auf `/mnt/hoermond`
und ergänze den `umask 002`-Fix dort, damit die Doku den echten Endzustand beschreibt.
