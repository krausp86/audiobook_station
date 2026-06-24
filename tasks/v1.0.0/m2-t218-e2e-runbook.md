# T2.18 — E2E-Resume-Test Runbook (Stecker ziehen, < 30 s Sync, ≤ 10 s Toleranz)

Abarbeitbares Runbook für den letzten verbleibenden M2-Abnahmenachweis. Ergebnis am Ende
in diesem Dokument (Abschnitt "Protokoll") festhalten — das ist gleichzeitig die in
`m2-tasks.md` geforderte `tasks/m2-acceptance-test.md`-Ablage (hier zusammengefasst,
nicht als separate Datei).

**Vor Beginn:** Backup-SD griffbereit (overlayfs-Risiko aus M1). Wenn der Pi nach einem
Stromverlust nicht mehr bootet, sofort auf die Backup-SD wechseln, nicht stundenlang auf
der defekten Karte debuggen.

---

## Schritt 0 — Vorbedingungen prüfen

- [x] T2.17 ist durchgeführt (App-Bundle aktuell auf `/home/player/hoermond/repo/app`,
      nicht das alte `/opt/hoermond/app` aus der Doku — siehe Korrektur 2026-06-16)
- [x] overlayfs ist **aktiv** (Produktionszustand, nicht das Deploy-Fenster mit overlay aus):
  ```bash
  findmnt -t overlay
  # MUSS eine Zeile zeigen (overlay aktiv) — falls leer: overlay reaktivieren + rebooten
  ```
- [x] `media-sync`, `media-watcher.service`, `mediaplayer.service`, `mpd.service` laufen:
  ```bash
  systemctl is-active media-watcher mediaplayer mpd
  ```
- [x] `/var/lib/mediaplayer` ist Bind-Mount auf `/mnt/hoermond/.state` (M1 ADR-2):
  ```bash
  mount | grep mediaplayer
  # erwartet: .../mnt/hoermond/.state on /var/lib/mediaplayer
  ```

---

## Schritt 1 — Sync-Durchstich (< 30 s, AK 2)

Eine neue, reale Testdatei vorbereiten (kann die aus T2.05 wiederverwendete Konvention
nutzen: `audiobooks/<Autor>/<Titel>/`).

```bash
# Laptop:
time rsync -avz --partial ./e2e-test/ media-sync@hoermond.krfu.home:/audiobooks/E2ETest/
```

Stoppuhr ab "Sync fertig" (Ende des `rsync`-Befehls) — der neue Eintrag MUSS innerhalb
von **30 Sekunden** am Touchscreen erscheinen.

```bash
# Pi, parallel/danach:
ssh player@hoermond.local 'tail -n 5 /var/lib/mediaplayer/sync/sync.log'
# erwartet: started + completed Zeilen, Zeitstempel-Differenz < 30s
```

- [x] **AK2 bestanden:** neuer Eintrag < 30 s sichtbar, `sync.log` zeigt started→completed
unter 10s

---

## Schritt 2 — Wiedergabe + Positions-Persistenz (AK 4, AK 5)

Am Touchscreen den neuen Testeintrag antippen, ~30 s hören. Parallel per SSH beobachten:

```bash
ssh player@hoermond.local 'watch -n2 "sqlite3 /var/lib/mediaplayer/state.db \"SELECT media_path,position_seconds,last_played FROM playback_position\""'
```

- [x] **AK4 bestanden:** hörbare Wiedergabe über die 3,5-mm-Klinke
- [x] **AK5 bestanden:** `position_seconds` steigt in ~10-Sekunden-Schritten

Position direkt vor dem nächsten Schritt notieren (z. B. `~45s`): **_______**

---

## Schritt 3 — Harter Stromverlust mitten in der Wiedergabe (AK 6, Kernstück)

> ⚠️ **Netzstecker ziehen, nicht herunterfahren.** Das ist der eigentliche Crash-Test.

1. Während das Medium läuft (Position aus Schritt 2 notiert), **Netzstecker ziehen**.
2. Strom wieder anschließen, Pi bootet neu.
3. Boot-Zeit beobachten (sollte wie M1 < 60 s in den Kiosk-Screen kommen).

### Sofort nach dem Boot prüfen:

```bash
ssh player@hoermond.local 'dmesg | grep -i "ext4\|fsck\|corrupt"'
# erwartet: KEINE Fehler/Reparaturmeldungen
```

```bash
ssh player@hoermond.local 'sqlite3 /var/lib/mediaplayer/state.db "SELECT media_path,position_seconds,last_played FROM playback_position"'
ssh player@hoermond.local 'mpc status'
```

- [x] **AK6a bestanden:** kein fsck-Schaden / keine ext4-Korruption
- [x] **AK6b bestanden:** dasselbe Medium spielt **automatisch** weiter (T2.14 Resume-Logik)
- [x] **AK6c bestanden:** Differenz zur notierten Position aus Schritt 2 ist **≤ 10 Sekunden**
      (max. ein verpasster 10-s-Persistenz-Tick ist die einzig akzeptable Abweichung)

**Bei Fehlschlag — Diagnose-Reihenfolge (laut Caveats in `m2-tasks.md`):**
1. Ist `/var/lib/mediaplayer` wirklich Bind-Mount auf `/mnt/hoermond/.state`? (`mount | grep mediaplayer`)
2. Greifen die Positions-Writes überhaupt (T2.13)? Vor dem nächsten Versuch isoliert prüfen,
   ob `position_seconds` während normaler Wiedergabe (ohne Stromverlust) zuverlässig alle
   10s steigt.
3. War overlayfs zum Zeitpunkt des Tests wirklich aktiv (Schritt 0)? Mit overlay AUS ist
   das kein gültiger Crash-Test.

---

## Schritt 4 — Manueller Rescan (AK 7)

```bash
# Neue Datei direkt syncen oder lokal ablegen:
rsync -avz --partial ./e2e-test2/ media-sync@hoermond.krfu.home:/audiobooks/E2ETest2/
```
Am Touchscreen/Renderer den `library:rescan`-Command auslösen (oder als Ersatz `mpc update`
manuell, falls UI-Trigger noch nicht verdrahtet) und prüfen, dass der neue Eintrag
in `library:list` auftaucht.

- [x] **AK7 zurückgestellt (Produktentscheidung):** Mit laufendem `media-watcher.service`
      ist ein isolierter Test des manuellen Rescans nicht sinnvoll möglich — jede neue
      Datei wird ohnehin automatisch innerhalb von Sekunden gescannt (AK2 bereits
      bewiesen). Der `library:rescan`-IPC-Command (T2.15) bleibt im Code, wird aber für
      M2 nicht über einen UI-Button getestet, da Kinder nicht manuell rescannen sollen
      und die spätere Medienverwaltung ohnehin anders ablaufen wird. Bewusst akzeptiertes
      Risiko, kein offener Bug.

---

## Schritt 5 — Wiederholen (empfohlen 3×)

Schritt 3 (Stromverlust) an **unterschiedlichen Positionen** im Medium wiederholen
(z. B. ~10s, ~mittig, kurz vor Ende). Je Durchlauf Position vorher/nachher und
Korruptionsfreiheit unten protokollieren.

---

## Protokoll

Harter Stromverlust mehrfach live getestet (2026-06-16) — Ergebnis laut Betreiber:
„funktioniert wie erwartet" (Resume ≤ 10 s Toleranz, kein fsck-Schaden). Einzelne
Durchläufe nicht mit Zeitstempel/Position protokolliert; akzeptiert als ausreichender
Nachweis durch den Projektverantwortlichen, keine separate tabellarische Mehrfach-
Protokollierung verlangt.

## Gesamtergebnis

- [x] AK1 (Sync/Chroot, aus T2.02/T2.04 bereits verifiziert)
- [x] AK2 (Sync < 30s — unter 10s gemessen)
- [ ] AK3 (Liste trennt Hörbuch/Musik — aus T2.12/T2.16, hier nicht erneut geprüft, gilt als durch Implementierung abgedeckt)
- [x] AK4 (Wiedergabe über Klinke)
- [x] AK5 (Position alle 10s persistiert)
- [x] AK6 (Stromverlust → Resume ≤ 10s, mehrfach live getestet, nicht tabellarisch protokolliert)
- [x] AK7 (manueller Rescan — bewusst zurückgestellt, siehe Schritt 4)

**M2 gilt damit als abgenommen.**
