# Known Issues — Hörmond

Zentrale Sammlung offener Bugs und nicht abgeräumter Audit-Findings.

**Warum diese Datei:** Bugs wurden bisher nur verstreut getrackt — in den Audit-Reports
(`v1.0.0/m1-audit.md`, `m4-audit.md`, `m4-audit-2.md`), als Tasks in den Milestone-Files
(z. B. `m4-tasks.md` T4.00 „Bugfix resume-on-stopped") und in den Abnahme-Checklisten.
GitHub Issues sind für das Repo nicht in Benutzung. Diese Datei zieht das zusammen.

**Konvention:** Neue Einträge oben in „Offen". IDs bleiben stabil (auch nach dem Schließen),
Audit-Findings behalten ihre ursprüngliche ID (K/W/N/M aus dem jeweiligen Audit).

**Status:** 🔴 offen · 🟡 in Arbeit · 🔵 Diagnose nötig · ✅ behoben

---

## Offen

### DEV-01 — `npm test` kann alle DB-Tests nicht ausführen ✅ BEHOBEN

**Gefunden und behoben:** 2026-08-02 · **Suite jetzt: 169/169 grün** (vorher 161/168)

**Lösung:** vitest läuft nicht mehr unter dem System-Node, sondern unter **Electrons**
Node (`app/scripts/run-tests.mjs`, via `ELECTRON_RUN_AS_NODE=1`). Damit stimmt die ABI
ohne zweiten Build von `better-sqlite3` und ohne Mocks für die DB-Schicht.
`npm test` und `npm run test:watch` nutzen den Runner; `npm run test:system-node`
bleibt als direkter vitest-Aufruf erhalten.

**Drei defekte Tests, die dadurch sichtbar wurden** — jedes Mal lag der Test falsch,
nicht der Code:

1. `resume.test.ts` erwartete bei „kein Resume" **null** MPD-Kommandos. `resumeLast()`
   normalisiert `repeat/single/consume` aber bewusst *vor* der Entscheidung, weil MPD
   diese Flags aus seiner state-Datei wiederherstellt (`resume.ts:17-21`). Test auf
   „keine *Wiedergabe*-Kommandos" umgestellt.
2. `timer.test.ts` erwartete, dass der Schlaf-Timer bei **Pause** abbricht.
   `m7-tasks.md:405-408` spezifiziert das Gegenteil: bei Pause **weiterlaufen**
   (Countdown ist Wandzeit), nur bei **Stop** abbrechen — und genau das tut
   `timer.ts:226-228`. Test korrigiert; der spezifizierte Stop-Fall war überhaupt nicht
   abgedeckt und hat jetzt einen eigenen Test.
3. `pipeline.test.ts > should handle errors gracefully (no throw)` ging **echt ins
   Internet**. Da `artist` gesetzt ist, lief `resolveCover()` bis MusicBrainz/Cover Art
   Archive durch (der Nachbartest lässt `artist` genau deshalb weg) und riss bei
   langsamem Netz den 5-s-Timeout — etwa jeder zwölfte Lauf war rot. `fetch` wird jetzt
   im Test gemockt und wirft: Ein Test namens „handle errors gracefully" soll den Fehler
   selbst erzeugen, statt zu hoffen, dass das Netz einen liefert.
   Verifiziert über 15 aufeinanderfolgende Läufe, 0 Fehlschläge.

Die ursprüngliche Beschreibung des Problems:

**Ursache:** `postinstall` ruft `electron-builder install-app-deps` und baut
`better-sqlite3` gegen **Electrons** ABI (140). Vitest lief aber auf dem **System-Node**
(hier v20.20.2, ABI 115). Beides gleichzeitig geht mit einem Build nicht.

Das erklärt rückblickend die Feststellung aus `m4-audit-2.md:282`, dass die
Testabdeckung dünner ist als sie aussieht — die Absicherung des T4.00-Fixes lief nie.

---

<details>
<summary>Ursprüngliche Fassung (2026-08-02, vor der Behebung)</summary>

**Gefunden:** 2026-08-02 beim Aufsetzen der lokalen Testumgebung · **Schwere:** Major (Testabdeckung)

`npm test` meldet 7 von 168 Tests rot. Sechs davon (`src/main/player/resume.test.ts`,
komplette Datei) scheitern nicht an der Logik, sondern am ABI:

```
The module '…/better-sqlite3/build/Release/better_sqlite3.node'
was compiled against a different Node.js version using
NODE_MODULE_VERSION 140. This version of Node.js requires
NODE_MODULE_VERSION 115.
```

**Ursache:** `postinstall` ruft `electron-builder install-app-deps` und baut
`better-sqlite3` gegen **Electrons** ABI (140). Vitest läuft aber auf dem **System-Node**
(hier v20.20.2, ABI 115). Beides gleichzeitig geht mit einem Build nicht.

**Konsequenz:** Jeder Test, der die DB anfasst, ist faktisch tot — dauerhaft, nicht
sporadisch. Das betrifft ausgerechnet `resume.test.ts`, also die Absicherung des
T4.00-Fixes (resume-on-stopped). Der Fix selbst ist im Code vorhanden und korrekt
(`resume.ts:27`), aber **unbewacht**.

Das erklärt auch rückblickend die Feststellung aus `m4-audit-2.md:282`, dass die
Testabdeckung dünner ist als sie aussieht.

**Lösungsrichtungen** (noch nicht entschieden):
1. Die DB-Schicht in den Tests mocken statt echtes SQLite zu fahren — macht die Tests
   unabhängig vom ABI, ist aber der größte Eingriff.
2. Zweiter, Node-seitiger Build von `better-sqlite3` nur für Testläufe.
3. Vitest unter Electrons Node laufen lassen.

**Nicht empfohlen:** einfach `npm rebuild better-sqlite3` — das repariert die Tests und
zerschießt dafür die App, bis `postinstall` wieder läuft.

**Siebter roter Test:** `src/main/sleep/timer.test.ts > should auto-cancel timer if user
pauses playback` ist zeitabhängig und **flaky** — mal rot, mal grün. Eigenes, kleineres
Problem.

> Korrektur: Der Test war **nicht** flaky. Unter dem Electron-Runner scheiterte er
> 3 von 3 Läufen reproduzierbar. Der Wechsel zwischen 7 und 8 roten Tests kam vom
> instabilen System-Node-Lauf, nicht von diesem Test.

</details>

---

### BT-01 — Gerät findet im Produktivmodus keine neuen Bluetooth-Geräte 🔵

**Gemeldet:** 2026-08-02 · **Schwere:** Major · **Umgebung:** Pi, Produktivmodus (overlayfs aktiv)

**Symptom:** Der Bluetooth-Scan in S7 liefert keine neuen Geräte. Bereits gekoppelte Geräte
sind davon nicht betroffen (Autoconnect funktioniert laut T6.P3).

**Betroffener Code:** `app/src/main/bt/adapter.ts:120-160` (`scan()`),
`app/src/main/bt/listen.ts` (Polling), `app/src/renderer/src/screens/S7Bluetooth.tsx`

#### Kann das am overlayfs liegen?

**Direkt: eher nein.** Overlayroot macht das Root-FS nicht read-only — die Oberschicht ist
beschreibbares RAM. Schreibzugriffe von BlueZ (Geräte-Cache unter `/var/lib/bluetooth/<adapter>/cache/`)
**gelingen** also weiterhin, sie überleben nur den Reboot nicht. Ein fehlgeschlagener Scan
lässt sich damit nicht erklären.

**Indirekt: sehr wohl möglich — zwei konkrete Verdachtsmomente:**

1. **Die Persistenz-Aussage in T6.P2 ist unverifiziert.** `m6-tasks.md:139` behauptet:
   „`/var/lib/bluetooth` liegt auf ext4 (kein overlayfs) — Pairing-Daten persistent."
   Laut `m2-migration-media-to-mnt-hoermond.md:9-10` trägt `/dev/mmcblk0p3` (ext4) genau
   **zwei** Mountpoints — `/mnt/hoermond` und `/var/lib/media**player**`. `/var/lib/blue**tooth**`
   ist **nicht** dabei und liegt damit auf dem Root-FS, also sehr wohl unter dem Overlay.
   Die Aussage in T6.P2 verwechselt vermutlich schlicht die beiden `/var/lib/`-Pfade.
   Das gesamte M6-Setup
   entstand am 2026-06-20 in einem Deploy-Fenster — mit hoher Wahrscheinlichkeit mit
   **overlay AUS**. Exakt dieser Fehlschluss ist in `m2-security-review.md:27-28` schon
   einmal dokumentiert:
   > „…nur, weil `overlayroot` zum jeweiligen Testzeitpunkt deaktiviert war. Vor jeder
   > Aussage über Persistenz: `findmnt -t overlay` UND `mount | grep <pfad>` prüfen."

   Und es ist derselbe Verlust-Mechanismus wie in `t2-02-fix-media-sync-shell.md`.

2. **Alles, was nach dem 20.06. mit aktivem Overlay eingerichtet wurde, ist weg.**
   Betrifft `/etc/systemd/system/bt-unblock.service`, den `enable`-Symlink, PipeWire-User-Services
   und die MPD-`type "pulse"`-Config. Ohne `bt-unblock` ist der Adapter nach dem Boot per rfkill
   blockiert → `getStatus()` liefert `poweredOn: false` und `scan()` liefert eine leere Liste —
   **beides ohne sichtbaren Fehler in der UI.**

**Fazit:** Overlayfs ist nicht die direkte Ursache, aber ein sehr plausibler indirekter
Auslöser. Zuerst H1 unten prüfen.

#### Hypothesen, nach Wahrscheinlichkeit

| # | Hypothese | Prüfung |
|---|-----------|---------|
| H1 | Adapter per rfkill blockiert / nicht powered (bt-unblock nicht wirksam) | `rfkill list bluetooth`, `bluetoothctl show \| grep Powered` |
| H2 | Nicht-interaktiver Scan unzuverlässig — im Spike explizit gewarnt, Code macht es trotzdem so | `bluetoothctl --timeout 30 scan on` vs. interaktiv gegenprüfen |
| H3 | `Pairable: no` / kein Agent registriert (nach `remove`, siehe Spike-Notes) | `bluetoothctl show \| grep Pairable` |
| H4 | `listen.ts` stört den Scan: Polling alle 5 s spawnt `bluetoothctl show` + ein `info` pro Paired-Device — während eines 30-s-Scans ~6 Zyklen paralleler bluetoothctl-Clients | Listener temporär deaktivieren, Scan wiederholen |
| H5 | Testgerät war schon einmal gekoppelt → erscheint nie als `[NEW]` (dokumentiert in `adapter.ts:127`) | Mit fabrikneuem Gerät testen |

**Wichtig für die Diagnose:** `scan()` fängt jeden Fehler ab und gibt `[]` zurück
(`adapter.ts:157-159`). „Keine Geräte gefunden" und „Scan ist gecrasht" sehen in der UI
identisch aus. **Erster Schritt ist immer das Main-Prozess-Log** (`[bt] scan failed`).

#### Diagnose-Ablauf am Pi

```bash
# 0) Läuft overlay überhaupt?
findmnt -t overlay
mount | grep -E "/var/lib/bluetooth|/var/lib| / "

# 1) H1 — Adapter-Zustand
rfkill list bluetooth              # soft/hard blocked?
systemctl is-enabled bt-unblock.service
systemctl status bt-unblock.service
ls -l /etc/systemd/system/bt-unblock.service   # existiert die Unit noch?
bluetoothctl show                  # Powered: yes? Discovering: no?

# 2) H3
bluetoothctl show | grep -E "Powered|Pairable|Discoverable"

# 3) H2/H4 — Scan manuell, mit gestoppter App
bluetoothctl --timeout 30 scan on   # nicht-interaktiv, wie im Code
bluetoothctl                        # interaktiv: agent on / default-agent / scan on

# 4) Persistenz gegenprüfen
ls -la /var/lib/bluetooth/*/        # Pairings nach Reboot noch da?
```

**Folgeaufgaben, unabhängig vom Ergebnis:**
- `scan()` und `getStatus()` sollten Fehler nach oben durchreichen statt still `[]`/`false`
  zurückzugeben — sonst bleibt jede künftige BT-Störung unsichtbar.
- T6.P2 Punkt 6 in `m6-tasks.md:139` korrigieren oder mit `findmnt`-Beleg bestätigen.
- Falls `/var/lib/bluetooth` tatsächlich unter dem Overlay liegt: analog zu
  `/var/lib/mediaplayer` auf `/dev/mmcblk0p3` mounten, sonst sind Pairings nach jedem
  Reboot weg (eigenständiger Bug, unabhängig von BT-01).
- Die Deploy-Doku braucht eine Regel: **jede** System-Änderung nur mit overlay AUS, danach
  Reboot-Verifikation.

---

### M4-W6 — Kein Nutzer-Feedback bei No-Op-Kapitelnavigation 🔴

**Quelle:** `v1.0.0/m4-audit.md:153-161` · **Schwere:** Minor (UX) · **Status im Audit:** „❌ nicht adressiert, weiterhin offen"

`chapterNext/Prev/Goto` liefern `{ ok: false }`, wenn keine Navigation möglich ist. Der Renderer
ignoriert die Antwort vollständig (`void window.hoermond.invoke(...)` in
`S5Player.tsx:147-153`). Ein stiller Fehlklick ohne jede Rückmeldung ist für die Zielgruppe
verwirrend.

> Randnotiz: Das Original-Finding begründet das mit „einem Kind ohne Lesefähigkeit"
> (`m4-audit.md:158`). Das trifft nicht zu — die Zielgruppe (6–8 Jahre, `briefing.md:5`)
> kann lesen, nur noch nicht flüssig. Das Finding bleibt gültig, die Begründung ist eine andere:
> nicht fehlende Lesefähigkeit, sondern fehlendes Feedback überhaupt.

**Verifiziert am 2026-08-02:** weiterhin offen, Code unverändert.

---

### M4-N1 — `getState` mischt track-relative Position mit globaler Dauer 🔴

**Quelle:** `v1.0.0/m4-audit-2.md` (N1) · **Schwere:** Minor · **Ort:** `control.ts:197-218`

Bei `currentChapterIndex === null` für playlistPos liefert `getState` eine track-relative
`position`, aber eine globale `duration` → transiente Fortschritts-Inkonsistenz in der ProgressBar.

---

### M4-M3 — `extractCueChapters` ist ein stiller Stub 🔴

**Quelle:** `v1.0.0/m4-audit.md:181` · **Schwere:** Minor · **Ort:** `main/mpd/chapters.ts:171-175`

Gibt kommentarlos `[]` zurück („CUE-sheet parsing deferred to M5" — in M5 nicht nachgeholt).
CUE-basierte Alben zeigen damit keine Kapitel, ohne dass irgendwo ein Hinweis auftaucht.

**Verifiziert am 2026-08-02:** weiterhin Stub.

---

### M4-M6 — `MOVE_THRESHOLD_PX = 14` dreifach dupliziert 🔴

**Quelle:** `v1.0.0/m4-audit.md:201` · **Schwere:** Minor

Inzwischen an **drei** Stellen statt zwei: `hooks/useParentGate.ts:6`, `hooks/useLongPress.ts:26`,
`components/Pressable.tsx:24` — jeweils mit abweichendem Kommentar. Gehört in eine geteilte Konstante.

---

### M4 — Offene Pi-Verifikationen 🔵

**Quelle:** `v1.0.0/m4-audit-2.md:282-294`

Der M4-Fix ist nur statisch abgesichert (typecheck + Unit-Tests); **kein** Test fährt echtes
MPD/ffprobe. Laut Audit vor der Abnahme zwingend am Pi zu prüfen — ob das je passiert ist,
geht aus den Docs nicht hervor:

1. **MP3-Ordner, mehrspurig:** Kapitel-Label wechselt mit der Spur, ProgressBar global +
   Marker korrekt, Drag-Seek über Spurgrenze, −15 s/+30 s an der Spurgrenze.
2. **M4B mit eingebetteten Kapiteln:** Kapitelsprung lädt/seekt korrekt auch bei noch nicht
   geladener Datei; `/media`-Pfad löst auf dem realen Mount auf.
3. **Resume mehrspurig:** Spur > 0, Position > 0, App-Neustart → richtige Spur + Position.

---

### M4-Minor — Restposten, Status unklar 🔵

Aus `m4-audit.md` nie explizit abgearbeitet, beim nächsten Anfassen der Stellen mitprüfen:

- **M1** — `chapterIndexForPosition`: Kommentar widerspricht dem Verhalten (`m4-audit.md:168`)
- **M2** — S6 Auto-Scroll mit hartcodierter Item-Höhe (`:175`)
- **M4** — `getChapters` Cache-Key ist `currentPath` (= `currentsong.file`) (`:186`)
- **M5 / N5** — Doppelter MPD-`status`-Roundtrip in `persist.saveNowInternal` (`:196`).
  Code in `main/player/persist.ts:17ff` hat sich seither geändert — neu bewerten.
- **M7** — Swipe-Up-Geste ohne Untergrenze gegen versehentliches Auslösen während Drag (`:205`)

---

## Behoben

### M4-N3 — `seekRelative` mit überflüssigem `getChapters`-Roundtrip ✅

Beide if/else-Zweige waren identisch, der `getChapters`-Roundtrip lag auf dem Tap-Hot-Path.
`control.ts:120-129` ist inzwischen ein schlanker `status` + `seekcur` ohne Verzweigung.

### M4-N4 — `/media/`-Prefix doppelt hartkodiert ✅

War in `chapters.ts:81` und `:329` hartkodiert und an ADR-2 gekoppelt. Im Produktivcode
nicht mehr vorhanden — nur noch in `main/mpd/chapters.test.ts` als Testfixture, was in Ordnung ist.

### T4.00 — Resume bei gestopptem Playback ✅

`resumeLast()` ignorierte den `stopped`-Zustand und startete beim Neustart immer die
Wiedergabe. Fix in `m4-tasks.md:183-230`: `last_status` persistieren und beim Resume prüfen.
Im Code verifiziert (2026-08-02): `resume.ts:27` — `if (last.last_status === 'stopped') return;`

> ⚠️ Die zugehörigen Tests laufen wegen **DEV-01** nicht. Der Fix ist vorhanden, aber
> nicht durch die Suite abgesichert.

---

## Nicht getrackte Bereiche

Zur Vollständigkeit — hier existiert bisher kein Bug-Tracking, weil noch nicht implementiert:

- **M6 T6.P4** — Security-Review D-Bus/Polkit-Rechte, Status „offen" (`m6-tasks.md:152`)
- **M7 T7.P2/P4/P5** — Pi-Deployment und Abnahme, Status „offen" (`m7-tasks.md:208,228,260`)
- **Web-Upload-Portal** — noch Konzept, siehe `tasks/feature-web-upload.md` („Offene Fragen"
  ab Zeile 169)
