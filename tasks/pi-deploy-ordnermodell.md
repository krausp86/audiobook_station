# Deploy-Plan: Ordnermodell auf den Pi

**Erstellt:** 2026-08-02 · **Betrifft:** Branch `ordnermodell` (4 Commits)
**Zustand vorher:** Gerät läuft produktiv mit dem alten, tag-abgeleiteten Modell.

Was dieses Update mitbringt:
- Gruppierung über die Ordnerstruktur statt über Tags
- einmaliger, **schreibender** Abgleich der Hörfortschritte (MIG-01)
- Ordner-Navigation am Gerät (neue Ebene, Haus-Knopf)

Wegen des schreibenden Abgleichs steht das Backup am Anfang und ist nicht optional.

> **Platzhalter in diesem Dokument:** `<pi-ip>` = IP des Geräts, `<sdX>` = Blockgerät
> der SD-Karte am Laptop. Beide vor dem Ausführen ersetzen.

---

## Schritt 0 — Auf dem Laptop: Branch nach `main` bringen

```bash
cd ~/Privat/repos/audiobook_station
git checkout main
git merge ordnermodell
git push origin main
```

---

## Schritt 1 — Vollständiges Image der SD-Karte

Zwei Wege. **Weg A ist der sichere** und sollte der Normalfall sein.

### Weg A — Karte am Laptop lesen (empfohlen)

Ein Image einer laufenden, beschriebenen Karte ist immer etwas inkonsistent.
Sauber wird es nur im ausgeschalteten Zustand.

```bash
# 1) Gerät sauber herunterfahren
ssh player@<pi-ip> 'sudo shutdown -h now'
# Warten, bis die grüne LED dauerhaft aus ist, dann Strom trennen und Karte entnehmen.

# 2) Karte am Laptop einstecken und das RICHTIGE Gerät bestimmen
lsblk -o NAME,SIZE,TYPE,MOUNTPOINTS,MODEL
#    Erwartet: ein Gerät in Kartengröße mit den Partitionen p1 (boot), p2 (root), p3 (hoermond).
#    NICHT die interne Platte erwischen — im Zweifel Karte ziehen, lsblk erneut,
#    Karte stecken, lsblk erneut und die Differenz nehmen.

# 3) Falls automatisch gemountet: aushängen (nicht auswerfen)
sudo umount /dev/<sdX>?* 2>/dev/null || true

# 4) Image ziehen
sudo dd if=/dev/<sdX> of=~/hoermond-backup-$(date +%F).img bs=4M status=progress conv=fsync
```

Prüfen, dass das Image plausibel ist:

```bash
ls -lh ~/hoermond-backup-*.img
# Partitionstabelle im Image lesen — muss drei Partitionen zeigen
fdisk -l ~/hoermond-backup-$(date +%F).img
```

Optional komprimieren (spart viel, das Image ist überwiegend leer):

```bash
gzip -9 ~/hoermond-backup-$(date +%F).img       # ergibt .img.gz
```

### Weg B — Live über SSH (nur wenn die Karte nicht erreichbar ist)

Weniger sauber: `/mnt/hoermond` wird währenddessen möglicherweise beschrieben.
Vorher deshalb alles stoppen, was schreibt.

```bash
ssh player@<pi-ip> 'sudo systemctl stop mediaplayer.service mpd.service media-watcher.service && sync'
ssh player@<pi-ip> 'sudo dd if=/dev/mmcblk0 bs=4M status=none' \
  | dd of=~/hoermond-backup-live-$(date +%F).img bs=4M status=progress
ssh player@<pi-ip> 'sudo systemctl start mpd.service media-watcher.service mediaplayer.service'
```

### Rückspielen (falls nötig)

```bash
sudo umount /dev/<sdX>?* 2>/dev/null || true
sudo dd if=~/hoermond-backup-<datum>.img of=/dev/<sdX> bs=4M status=progress conv=fsync
sync
```

---

## Schritt 2 — Datenbank separat sichern

Das Image ist die Vollkasko. Die DB zusätzlich einzeln zu haben, macht ein
Zurücknehmen **nur des Abgleichs** möglich, ohne die ganze Karte zu überschreiben.

```bash
# Konsistente Kopie im laufenden Betrieb — nicht einfach cp, sondern .backup
ssh player@<pi-ip> "sqlite3 /var/lib/mediaplayer/state.db \".backup '/tmp/state-vor-ordnermodell.db'\""
scp player@<pi-ip>:/tmp/state-vor-ordnermodell.db ~/state-vor-ordnermodell-$(date +%F).db

# Inhalt festhalten, um nachher vergleichen zu können
ssh player@<pi-ip> "sqlite3 -header -column /var/lib/mediaplayer/state.db \
  'SELECT media_path, track_index, position_seconds, last_status FROM playback_position ORDER BY last_played DESC;'" \
  | tee ~/fortschritte-vorher-$(date +%F).txt
```

---

## Schritt 3 — Vorab-Check: Was ändert sich für das Kind?

**Vor** dem Deploy, ohne irgendetwas zu verändern. Die Wirkung des Ordnermodells
hängt vollständig von deiner Ablage ab.

```bash
# Struktur ansehen
ssh player@<pi-ip> 'find /mnt/hoermond/audiobooks /mnt/hoermond/music -maxdepth 3 -type d | sort'
```

Dann den Vorher-Nachher-Diff über den **echten** Bestand, vom Laptop aus gegen den
MPD des Geräts:

```bash
cd ~/Privat/repos/audiobook_station
ssh -f -N -L 6699:127.0.0.1:6600 player@<pi-ip>     # Tunnel, MPD lauscht nur lokal
HOERMOND_MPD_HOST=127.0.0.1 HOERMOND_MPD_PORT=6699 node dev/show-units.mjs
```

Das ist reines Lesen. Zu erwarten ist:

- **Hörbücher als `audiobooks/Titel/…`** → keine Navigationsordner, das Grid bleibt flach.
- **Hörbücher als `audiobooks/Autor/Titel/…`** → jedes Buch steht künftig hinter einer
  Autoren-Kachel. Eine Ebene mehr für das Kind.
- **Musik** ändert sich in jedem Fall am stärksten, weil die Tag-Gruppierung entfällt.

**Wenn dir der Diff nicht gefällt, hier abbrechen** — die Ordner umzusortieren ist
jetzt billig, nach dem Abgleich nicht mehr.

Tunnel wieder schließen:

```bash
pkill -f 'ssh -f -N -L 6699'
```

---

## Schritt 4 — Overlay abschalten

Alles, was mit aktivem Overlay geschrieben wird, ist nach dem nächsten Reboot weg.
Genau daran ist in diesem Projekt schon einmal ein Deploy gescheitert
(`t2-02-fix-media-sync-shell.md`) und vermutlich auch BT-01.

```bash
ssh player@<pi-ip>
sudo raspi-config      # Performance Options → Overlay File System → Disable → Reboot
```

> Es gibt auch die nicht-interaktive Form `sudo raspi-config nonint do_overlayfs <0|1>`.
> Im Repo ist `1` als „aktivieren" dokumentiert, die Konvention von `raspi-config` ist
> aber uneinheitlich. **Verlass dich nicht auf das Argument, sondern auf die Prüfung
> unten** — sie ist die einzige belastbare Auskunft.

Nach dem Reboot **zwingend** prüfen:

```bash
ssh player@<pi-ip> 'findmnt -t overlay'
# MUSS LEER sein. Kommt hier eine Zeile, ist Overlay noch aktiv —
# dann NICHT weitermachen, sonst ist der Deploy nach dem nächsten Reboot verschwunden.
```

---

## Schritt 5 — Update einspielen

```bash
ssh player@<pi-ip>

# App anhalten, damit nichts in die DB schreibt
sudo systemctl stop mediaplayer.service

cd /home/player/hoermond/repo
git fetch origin
git checkout main
git pull --ff-only origin main
git log --oneline -4        # erwartet: DEV-02 / Ordner-Navigation / MIG-01 / Ordnermodell

cd app
npm install
npm run build
```

**Falls `npm run build` oder der spätere Start mit `NODE_MODULE_VERSION` abbricht:**
`better-sqlite3` liegt dann gegen die falsche Laufzeit vor. Reparatur:

```bash
npm run postinstall      # baut die nativen Module gegen Electron
```

Starten:

```bash
sudo systemctl start mediaplayer.service
```

---

## Schritt 6 — Den Abgleich beobachten

Der MIG-01-Abgleich läuft **einmalig** beim ersten Start und protokolliert, was er tut.

```bash
ssh player@<pi-ip> 'journalctl -u mediaplayer.service -n 200 --no-pager | grep -i reconcile'
```

Zu erwarten ist eine Zeile wie:

```
[reconcile] Fortschritte abgeglichen: N unverändert, M umgehängt, X zugunsten neuerer verworfen, Y nicht auflösbar
```

gefolgt von einer Zeile pro Umhängung. **Diese Ausgabe sichern** — sie ist der einzige
Beleg, was mit welchem Fortschritt passiert ist:

```bash
ssh player@<pi-ip> 'journalctl -u mediaplayer.service --no-pager | grep -i reconcile' \
  > ~/reconcile-protokoll-$(date +%F).txt
```

Danach den neuen Stand gegen den alten halten:

```bash
ssh player@<pi-ip> "sqlite3 -header -column /var/lib/mediaplayer/state.db \
  'SELECT media_path, track_index, position_seconds, last_status FROM playback_position ORDER BY last_played DESC;'" \
  | tee ~/fortschritte-nachher-$(date +%F).txt

diff ~/fortschritte-vorher-*.txt ~/fortschritte-nachher-*.txt
```

**Warnzeichen:** viele Zeilen unter „nicht auflösbar". Dann hat der Abgleich Pfade
nicht zuordnen können — Protokoll ansehen, bevor du weitermachst.

---

## Schritt 7 — Am Gerät testen

Am Touchscreen, nicht per SSH:

- [ ] **Bibliothek** — Hörbücher und Musik öffnen. Stimmen die Kacheln mit dem Diff
      aus Schritt 3 überein?
- [ ] **Ordner betreten** — falls es Navigationsordner gibt: hineintippen, Titel wechselt
      auf den Ordnernamen, Haus-Knopf erscheint neben Zurück.
- [ ] **Zurück** führt eine Ebene hoch, **Haus** direkt zum Startscreen.
- [ ] **„Zuletzt gehört"** steht auf der obersten Ebene und springt direkt zum Titel.
- [ ] **Resume** — ein Hörbuch aus „Zuletzt gehört" starten. Setzt es an der richtigen
      Stelle fort?
- [ ] **Mehrteiliges Hörbuch** (falls vorhanden: Ordner mit `CD1`/`CD2`) — spielt es
      durchgehend über die Datenträgergrenze?
- [ ] **Musik** — ein Album starten. Spielt die ganze Einheit, in richtiger Reihenfolge?
- [ ] **Kapitel** bei einer M4B — Sprünge funktionieren.
- [ ] **App-Neustart** (`sudo systemctl restart mediaplayer.service`) — der Abgleich
      läuft **nicht** erneut (keine neue `[reconcile]`-Zeile).

---

## Schritt 8 — BT-01 mitnehmen, solange du dran bist

Bluetooth findet im Produktivmodus keine neuen Geräte. Der vollständige Diagnose-Ablauf
steht in `known-issues.md` unter BT-01; meine Hauptvermutung ist die verlorene
`bt-unblock.service`. Die schnellste Prüfung:

```bash
ssh player@<pi-ip>
rfkill list bluetooth
systemctl is-enabled bt-unblock.service
ls -l /etc/systemd/system/bt-unblock.service
bluetoothctl show | grep -E 'Powered|Pairable|Discovering'
```

Fehlt die Unit oder ist der Adapter blockiert, ist das die Ursache — **und jetzt ist der
richtige Moment**, sie neu anzulegen, weil Overlay ohnehin aus ist:

```bash
sudo cp /home/player/hoermond/repo/system/bt-unblock.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now bt-unblock.service
rfkill list bluetooth        # darf nicht mehr "blocked" zeigen
```

Ebenfalls jetzt prüfen (die Persistenz-Aussage aus T6.P2 ist unverifiziert):

```bash
findmnt /var/lib/bluetooth || echo "kein eigener Mount -> liegt unter dem Overlay"
```

Liegt `/var/lib/bluetooth` unter dem Overlay, gehen Pairings bei jedem Reboot verloren.
Dann analog zu `/var/lib/mediaplayer` auf `/dev/mmcblk0p3` mounten.

---

## Schritt 9 — Overlay wieder einschalten

Erst wenn Schritt 7 durch ist.

```bash
ssh player@<pi-ip>
sudo raspi-config      # Performance Options → Overlay File System → Enable → Reboot
```

Nach dem Reboot **zwingend** prüfen:

```bash
ssh player@<pi-ip> 'findmnt -t overlay'
# MUSS jetzt eine Zeile zeigen.
```

Und den Produktivzustand gegenprüfen:

- [ ] App startet, Bibliothek vollständig
- [ ] Ein Hörbuch spielen, App neu starten → Position ist erhalten
- [ ] Falls BT repariert: Gerät aus- und einschalten → verbindet automatisch

---

## Rollback

**Nur die Fortschritte zurück** (wenn der Abgleich Unfug gemacht hat):

```bash
ssh player@<pi-ip> 'sudo systemctl stop mediaplayer.service'
scp ~/state-vor-ordnermodell-<datum>.db player@<pi-ip>:/tmp/restore.db
ssh player@<pi-ip> 'sudo cp /tmp/restore.db /var/lib/mediaplayer/state.db && sudo chown player:player /var/lib/mediaplayer/state.db'
```

Danach aber auch den Code zurücknehmen, sonst läuft der Abgleich beim nächsten Start
erneut über die alten Pfade.

**Code zurück auf den Stand vor dem Ordnermodell:**

```bash
ssh player@<pi-ip>
cd /home/player/hoermond/repo
git checkout a91264a          # Stand „lokale Testumgebung", vor dem Ordnermodell
cd app && npm install && npm run build
sudo systemctl restart mediaplayer.service
```

**Alles zurück:** Image aus Schritt 1 zurückspielen (Befehl dort).

---

## Anmerkungen

- Der Abgleich merkt sich sein Laufen in `settings` unter
  `unit_paths_reconciled_v4`. Soll er erneut laufen (etwa nach einem DB-Rollback),
  muss diese Zeile weg:
  `sqlite3 /var/lib/mediaplayer/state.db "DELETE FROM settings WHERE key='unit_paths_reconciled_v4';"`
- Schlägt der Abgleich fehl (MPD nicht erreichbar), wird der Merker **nicht** gesetzt und
  es wird beim nächsten Start erneut versucht. Ein Fehlschlag verliert also nichts.
- Ist Overlay aktiv, sind Schreibzugriffe auf das Root-Dateisystem nicht read-only,
  sondern landen im RAM und sind nach dem Reboot weg. Das ist der Grund, warum ein
  „es hat doch funktioniert" ohne Reboot-Prüfung nichts wert ist.
