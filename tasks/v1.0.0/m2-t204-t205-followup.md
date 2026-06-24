# M2-Nacharbeiten: T2.04 (Re-Verifikation) + T2.05 (beets-Test mit realen Daten)

Abarbeitbare Checkliste für die zwei verbleibenden Lücken nach der `/mnt/hoermond`-
Migration. Ergebnis am Ende in `tasks/m2-security-review.md` (T2.04) bzw. direkt hier
(T2.05) festhalten.

---

## Teil A — T2.04 Re-Verifikation (nur die migrationsrelevanten Punkte)

Der volle Security-Review lief bereits vor der Pfad-Migration. Hier nur die Punkte, die
sich durch `/media` → `/mnt/hoermond`, die Ownership-Fixes und den `setgid`-Zwischenfall
geändert haben könnten.

- [x] **A1 — Wurzel-Ownership korrekt und stabil**
  ```bash
  stat -c '%U:%G %a' /mnt/hoermond
  ```
  Erwartet: `root:root 755` — **kein** Setgid/Setuid (also exakt `755`, nicht `2755`).
  Falls doch: `sudo chmod 0755 /mnt/hoermond` (siehe Vorfall vom 2026-06-16).

- [x] **A2 — chroot-Ausbruch weiterhin verhindert** (bestanden — siehe `m2-security-review.md`)
  ```bash
  rsync -avz /tmp/x media-sync@hoermond.krfu.home:/../etc/
  # MUSS scheitern bzw. innerhalb /mnt/hoermond bleiben
--> Kommentar, bekomme permission denied, aber auch innerhalb von :/ in rsync, nachher nochmal testen
  ssh media-sync@hoermond.krfu.home 'ls /'
  # MUSS abgewiesen werden: "Nur rsync ist erlaubt (media-sync)."
--> Kommentar - funktioniert.
  ```

- [x] **A3 — `.state` weiterhin von media-sync unerreichbar** (Lücke gefunden: war `755` → gefixt auf `700` → bestanden, siehe `m2-security-review.md`)
  ```bash
  stat -c '%U:%G %a' /mnt/hoermond/.state
  # Erwartet: player:player 700
--> Kommentar player:player 755
  rsync -avz /tmp/evil media-sync@hoermond.krfu.home:/.state/
  # MUSS scheitern (Mode 700, fremder Owner)
--> Kommentar Es wird wohl etwas gesendet aber dann ist permission denied
  ```

- [x] **A4 — chroot-Jail-Binaries weiterhin korrekt (kein versehentliches chmod mehr)** (Befund: `root:media` + Setgid → gefixt auf `root:root 755` via `chown -R` + explizitem `chmod g-s` → bestanden)
  ```bash
  ls -la /mnt/hoermond/bin/sh /mnt/hoermond/usr/bin/rsync /mnt/hoermond/usr/local/sbin/media-sync-shell
  # Erwartet: alle mit x-Bit, rwxr-xr-x (755), root:root
--> Kommentar: alle root media
  ```

- [x] **A5 — `media-fix-perms.sh`-Sudo-Freigabe ist eng begrenzt (keine neue Eskalationsfläche)** (bestanden — eine Regel, NOPASSWD, kein Wildcard)
  ```bash
  sudo -l -U player | grep media-fix-perms
  # Erwartet: NUR media-fix-perms.sh, NOPASSWD, kein Wildcard, kein generelles sudo
  cat /etc/sudoers.d/media-fix-perms
  ```

**Ergebnis eintragen in `tasks/m2-security-review.md`** (Datum 2026-06-16, Anlass:
Re-Verifikation nach `/mnt/hoermond`-Migration, Befund je Punkt A1–A5).

---

## Teil B — T2.05 beets-Test mit realen Metadaten

### B0 — Voraussetzung: Internetzugang vom Pi
```bash
ping -c2 musicbrainz.org
```
Ohne Netz schlägt `autotag` mangels MusicBrainz-Zugriff fehl — das wäre dann ein
Netzwerk-, kein Pipeline-Problem. Falls kein Netz: vorher klären, ob das Pi-Netzwerk-
Setup das zulässt (Datenschutz/Firewall), bevor weitergemacht wird.

### B1 — Testdatei vorbereiten (Laptop)
Eine reale MP3 mit bekanntem Künstler/Titel besorgen (eigene Sammlung, gemafreie Quelle
o. Ä.) — wichtig sind **echte ID3-Tags ODER ein Dateiname/Pfad, den beets matchen kann**.
Konvention beachten (siehe `README.sync` auf dem Pi):
```bash
mkdir -p ./sync-test/music/<Künstler>/<Album>
cp /pfad/zur/realen.mp3 "./sync-test/music/<Künstler>/<Album>/01 - <Titel>.mp3"
```
Für einen Hörbuch-Test alternativ unter `audiobooks/<Autor>/<Titel>/`.

### B2 — Sync auf den Pi
```bash
rsync -avz --partial ./sync-test/music/ media-sync@hoermond.krfu.home:/music/
```

### B3 — Watcher-Lauf abwarten und prüfen
```bash
journalctl -u media-watcher -n 20 --no-pager
# erwartet: started -> media-fix-perms (kein Fehler) -> completed
ls -la /mnt/hoermond/music/<Künstler>/<Album>/   # rw-rw-r--, lesbar
```

### B4 — beets-Import explizit anstoßen und Ergebnis prüfen
```bash
/usr/local/sbin/media-enrich.sh
beet ls
beet ls -f '$title — $artist — $length'
```
Erwartet: Track erscheint mit korrektem Titel, Künstler und einer plausiblen Länge
(nicht `0:00`).

### B5 — Nicht-destruktiv bestätigen (Pflicht-Caveat aus T2.05)
```bash
ls -la /mnt/hoermond/music/<Künstler>/<Album>/
# Originaldatei MUSS unverändert am ursprünglichen Pfad liegen (kein Verschieben/Umbenennen)
```

### B6 — Ergebnis
- [x] `beet ls` zeigt den Track mit Titel/Artist/Länge (Brave New World 6:19, The Middle 2:45, Battle Stations 4:02)
- [x] Originaldatei unverändert (mtime 2014/2010, nicht Sync-Zeitpunkt)
- [x] Kein Fehler in `journalctl -u media-watcher`
- [x] `mpc listall` zeigt alle drei Tracks ebenfalls

**Zusatzbefund während des Tests:** `incremental: yes` musste durch `duplicate_action: skip`
ersetzt werden — siehe `m2-tasks.md` T2.05 Caveats ("Praxis-Befund 2026-06-16").
Ursprüngliches Problem: neue Dateien in bereits gescannten Verzeichnissen wurden
dauerhaft übersprungen (`Skipping previously-imported path`).

T2.05 abgeschlossen und verifiziert.
