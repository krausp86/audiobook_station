# M4 Code-Audit — Hörmond

Datum: 2026-06-17
Auditor: Codebase Auditor
Branch: `ms04` (Commit `fd6fa92`)

## Zusammenfassung (vorweg)

Die M4-Implementierung ist breit und größtenteils sauber umgesetzt: Architektur-Grundvertrag
wird respektiert (Main kapselt alle privilegierten Ops, contextBridge/Whitelist korrekt,
kein Polling, ffprobe als Array-Argumente), die SQLite-Migration v3 ist korrekt, der
resume-on-stopped-Bug ist gefixt, NowPlayingBar ist vollständig entfernt, Farb-Tokens und
Animations-Timings stimmen exakt, kein `:hover`, kein M5/M6/M7-Scope-Creep.

**Aber:** Es gibt zwei funktionale Defekte, die die Kern-Features (Kapitelanzeige/-navigation
und Lautstärke) im realen Betrieb teilweise unbrauchbar machen, plus einen
Accessibility-Bug, der **alle** Player-Buttons unbeschriftet lässt. Dazu null automatisierte
Tests für die gesamte M4-Backend-Logik. M4 ist **nicht Pi-Abnahme-ready**, bis die KRITISCHEN
Punkte behoben sind.

---

## KRITISCH — muss vor Pi-Abnahme behoben werden

### K1 — `aria-label` an `<Pressable>` wird verworfen → alle Player-Buttons ohne Namen
**Dateien:** `app/src/renderer/src/components/PlayerControls.tsx:150,161,168,179,187,197,206`
und `app/src/renderer/src/components/Pressable.tsx:9-20,75-85`

`PlayerControls` übergibt `aria-label={t(...)}` an `<Pressable>`. `PressableProps` deklariert
diese Prop **nicht**, und `Pressable` spreaded keine Rest-Props auf das gerenderte `<div>`.
TypeScript meldet keinen Fehler, weil `@types/react` `aria-*`-Attribute auf jedem JSX-Element
generisch erlaubt — die Prop wird aber **stillschweigend geschluckt** und erreicht nie das DOM.
Ergebnis: alle 7 Buttons (Play/Pause, ⏮⏭⏪⏩, Vol−/+) haben **keinen Accessible Name**.
Das verletzt T4.10 ("Aria-Labels aus de.json") direkt.

Zum Vergleich: `BackButton.tsx:15` macht es korrekt über ein `<span class="visually-hidden">`.

**Empfehlung:** Entweder (a) `aria-label?: string` in `PressableProps` aufnehmen und an das
`<div>` durchreichen, oder (b) wie BackButton ein `<span className="visually-hidden">{label}</span>`
in jeden Button rendern. Variante (a) ist konsistenter. Danach im DOM verifizieren, dass die
Labels ankommen.

### K2 — Kapitel-Positionsmodell inkonsistent: track-relativ vs. kumulativ
**Dateien:** `app/src/main/mpd/control.ts:116,131`; `app/src/main/mpd/chapters.ts:182-215`
(`extractPlaylistChapters`); `app/src/renderer/src/components/ProgressBar.tsx:57,121`

MPD liefert `status.elapsed` **immer relativ zur aktuell laufenden Spur**, und `currentsong.Time`
ist die Dauer **nur der aktuellen Spur**. Für MP3-Ordner setzt `extractPlaylistChapters` aber
`startSeconds` **kumulativ über das gesamte Medium** (Spec `chapter.ts:22`, "relative to the
ENTIRE medium").

`getState()` berechnet `currentChapterIndex = chapterIndexForPosition(chapters, elapsed)` mit
dem track-relativen `elapsed`. Bei einem MP3-Ordner ist `elapsed` z. B. in Spur 5 wieder klein
(0…Spurdauer), liegt damit fast immer unter `chapters[1].startSeconds` → es wird **dauerhaft
Kapitel 0 angezeigt**, egal in welcher Spur man ist. Die Kapitelanzeige (S5 `currentChapter`)
und die Markierung des aktiven Kapitels in S6 sind dadurch faktisch defekt.

Gleiches Problem in `ProgressBar`: `displayPercent` nutzt `position/duration` (beides
track-relativ), aber die Chapter-Marker werden mit `ch.startSeconds/duration` (kumulativ /
track-relativ) positioniert → Marker landen weit außerhalb des Tracks (left > 100%).

**Empfehlung:** Ein konsistentes Zeitmodell wählen. Pragmatisch für MP3-Ordner:
`startSeconds` **nicht kumulativ**, sondern als Spur-Index/Spur-Start interpretieren, und
`currentChapterIndex` aus der MPD-`song`-Position (Playlist-Index) ableiten statt aus `elapsed`.
Alternativ den medienweiten Gesamtfortschritt berechnen (`Σ vorheriger Spurdauern + elapsed`)
und konsistent in `getState` UND ProgressBar verwenden. Entscheidung dokumentieren und auf
echter MP3-Ordner-Datei am Pi verifizieren. Für M4B (`seekOffset`, ein Single-File) stimmt das
Modell zufällig, weil dort `elapsed` = Position im Gesamtfile ist.

### K3 — Chapter-Navigation für M4B seekt relativ zur falschen Basis
**Datei:** `app/src/main/mpd/chapters.ts:311-332` (`navigateToChapter`, `seekOffset`-Zweig)

Für `seekOffset`-Kapitel (M4B) sendet der Code `seekcur <fileOffsetSeconds>`. `seekcur` ohne
`+`/`-`-Präfix ist absolut **innerhalb der aktuellen Spur** — das ist hier korrekt, **solange**
die M4B als eine einzige MPD-Song-Entry geladen ist. Das ist plausibel, aber nirgends
abgesichert: Wenn die Datei nicht geladen ist (`currentsong` leer), schlägt `seekcur` fehl und
`navigateToChapter` fängt den Fehler ab und gibt `false` zurück — der Nutzer tippt ein Kapitel
an und **nichts passiert, ohne Rückmeldung**. `chapter.seekFile` (der absolute Pfad) wird
gespeichert, aber nie genutzt, um sicherzustellen, dass die richtige Datei läuft.

**Empfehlung:** Vor dem `seekcur` prüfen, ob die korrekte Datei in der Playlist aktiv ist
(`currentsong.file` vs. `seekFile`); falls nicht, Datei laden (`clear`/`add`/`play`) und dann
seeken. Mindestens aber: am Pi mit einer echten M4B verifizieren, dass Kapitelsprünge wirklich
funktionieren — der Spike (`chapter.ts:3` "validated on Pi in T4.16") behauptet das, der Code
deckt den Lade-Fall aber nicht ab.

---

## WICHTIG — sollte vor Milestone-Abschluss behoben werden

### W1 — `handleVolumeUp` Guard ist logisch kaputt (Operator-Präzedenz)
**Datei:** `app/src/renderer/src/screens/S5Player.tsx:87`

```ts
if (!playerState?.volume === null) return;
```
`!playerState?.volume` wird zuerst ausgewertet (ergibt immer `true`/`false`), der Vergleich
`=== null` ist danach **immer `false`** → der Guard greift **nie**. Der gemeinte Check ("kein
Mixer vorhanden") ist wirkungslos. In der Praxis kein Crash (der Button ist via
`disabled={volume === null}` ohnehin gesperrt), aber der Code ist falsch und irreführend.

**Empfehlung:** `if (playerState?.volume == null) return;` (deckt `null`/`undefined` ab),
analog zu `handleVolumeDown`.

### W2 — `handleVolumeDown` blockiert bei Lautstärke 0
**Datei:** `app/src/renderer/src/screens/S5Player.tsx:80-84`

```ts
if (!playerState?.volume) return;
```
`!0` ist `true` → bei `volume === 0` kehrt die Funktion früh zurück. Das ist hier funktional
egal (man kann nicht unter 0), aber dieselbe Falsy-Falle wie W1 und ein latenter Bug, falls die
Logik je erweitert wird. Konsistent zu `== null` prüfen statt auf Falsiness.

### W3 — `currentChapterIndex` Typ-Mismatch zwischen DB-Track-Index und Chapter-Index
**Dateien:** `app/src/main/player/persist.ts:59`; `app/src/main/player/resume.ts:28-32`

`persist.ts` speichert `track_index` aus `status.song` (MPD-Playlist-Position). `resume.ts`
nutzt diesen Index korrekt zum Sprung (`play <track_index>`). **Aber** danach wird
`seekcur <position_seconds>` gesendet (Zeile 32) mit `position_seconds`, das in `persist.ts:62`
aus `st.position` = `Math.round(elapsed)` stammt — also track-relativ. Das ist hier **zufällig
korrekt** (track-relativer Seek nach track-Sprung), hängt aber am selben fragilen Zeitmodell wie
K2. Beim Fix von K2 muss diese Stelle mitgeprüft werden, sonst springt Resume in die falsche
Position.

**Empfehlung:** Im Zuge von K2 das Zeitmodell vereinheitlichen und Resume mit echtem
mehrspurigen MP3-Ordner am Pi testen (Spur > 0, Position > 0, App-Neustart).

### W4 — `chapterNext/Prev` rechnen mit potenziell falschem `currentChapterIndex`
**Datei:** `app/src/main/ipc/register.ts:65-89`

Die Handler holen `state.currentChapterIndex` via `getState()` und reichen ihn an
`chapterNext/Prev`. Solange K2 ungelöst ist, ist `currentChapterIndex` für MP3-Ordner falsch
(immer ~0), d. h. "nächstes Kapitel" springt fast immer auf Kapitel 1 statt auf das tatsächlich
folgende. Folgefehler aus K2 — wird mit K2 behoben, hier nur als Abhängigkeit vermerkt.

### W5 — Keine Tests für die gesamte M4-Backend-Logik
**Dateien:** gesamtes `app/src/main/mpd/chapters.ts`, `control.ts` (seekRelative/setVolume/getState),
`dao.ts` (setLastStatus/upsertPosition mit status), `resume.ts`, `persist.ts`

Einziger Test im Repo ist `app/src/main/library/sort.test.ts`. Für die kritischsten neuen
Bausteine (Kapitel-Extraktion, `chapterIndexForPosition`, Clamping in `seekRelative`/`setVolume`,
resume-on-stopped) gibt es **null** Tests. Gerade `chapterIndexForPosition`, die Volume-/
Seek-Clamps und die resume-Statuslogik sind reine, leicht testbare Funktionen — und genau dort
sitzen die Bugs (K2). Das ist die bekannte systemische Schwachstelle des Projekts.

**Empfehlung:** Vitest-Unit-Tests mindestens für: `chapterIndexForPosition` (inkl. E12 leeres
Array, Position vor erstem Kapitel), `seekRelative`-Clamp ([0,duration], duration=null-Fallback),
`setVolume`-Clamp (−10→0, 150→100), `resumeLast` mit `last_status='stopped'` (kein Resume) vs.
`'paused'`/`'playing'` (Resume). DB-Funktionen gegen eine echte In-Memory-better-sqlite3-DB
testen, nicht mocken.

### W6 — Fehlende Nutzer-Rückmeldung bei No-Op-Kapitelnavigation
**Dateien:** `app/src/main/ipc/register.ts:65-89`; `app/src/renderer/src/screens/S5Player.tsx:64-69`

`chapterNext/Prev/Goto` geben `{ ok: false }` zurück, wenn keine Navigation möglich ist (Ende
erreicht, Fehler). Der Renderer (`handlePrevChapter`/`handleNextChapter`) ignoriert die Antwort
komplett (`void ...invoke(...)`). Für ein Kind ohne Lesefähigkeit ist ein stiller Fehlklick
verwirrend. Nicht abnahmeblockierend, aber UX-relevant.

**Empfehlung:** Mindestens das Ergebnis auswerten und am Ende/Anfang der Kapitelliste ein
kurzes haptisches/visuelles Feedback geben (oder Buttons am Rand deaktivieren, analog Vol).

---

## MINOR — Nice-to-have

### M1 — `chapterIndexForPosition` Kommentar widerspricht Verhalten
`app/src/main/mpd/chapters.ts:237-238`: Kommentar sagt "Before first chapter ... return null",
aber bei nicht-leerem Array und `positionSeconds < startSeconds[0]` (z. B. startSeconds[0] > 0)
wird die Schleife durchlaufen und gibt korrekt `null` zurück — der "shouldn't happen"-Kommentar
ist beruhigend, aber bei kumulativem Modell startet startSeconds[0]=0, also greift der Fall nie.
Kommentar nach K2-Fix anpassen.

### M2 — S6 Auto-Scroll-Berechnung mit hartcodierter Item-Höhe
`app/src/renderer/src/screens/S6Chapters.tsx:57` nutzt `itemHeight = 48` als Schätzung. Die
tatsächliche `.s6-chapter-item`-Höhe ergibt sich aus Padding + Font + Margin und ist nicht 48px
fix. Bei langen Kapitellisten scrollt es ggf. nicht exakt zum aktiven Kapitel. Besser
`element.scrollIntoView({ block: 'nearest' })` auf dem aktiven Item.

### M3 — `extractCueChapters` ist ein stiller Stub
`app/src/main/mpd/chapters.ts:169-173` gibt für `.cue` immer `[]` zurück (TODO M5). T4.02
nennt CUE explizit als Spike-Ziel; der Stub ist akzeptabel, sollte aber im Milestone-Status
klar als "verschoben" dokumentiert sein, nicht als implementiert gelten.

### M4 — `getChapters` Cache-Key ist `currentPath` (= `currentsong.file`)
`app/src/main/mpd/chapters.ts:32-48`: Cache-Key ist der **Datei**pfad der aktuellen Spur. Bei
MP3-Ordnern wechselt `currentsong.file` mit jeder Spur → bei jedem Spurwechsel wird die Playlist
neu via `playlistinfo` ausgelesen und unter neuem Key gecacht, obwohl die Kapitelliste für den
ganzen Ordner identisch ist. Funktioniert korrekt, ist aber kein effektives Caching für den
MP3-Ordner-Fall und der Cache wächst pro Spur. Der Grundvertrag ("nicht bei jedem getState neu
rechnen") ist für den Single-File-Fall (M4B) erfüllt; für MP3-Ordner nur teilweise.
**Empfehlung:** Für `playlistPos`-Medien über das Ordner-/Unit-Verzeichnis cachen statt über die
Einzeldatei.

### M5 — Doppelter MPD-`status`-Roundtrip in `persist.saveNowInternal`
`app/src/main/player/persist.ts:19,57`: `getState()` (Zeile 19) ruft intern bereits `status` ab;
danach wird (Zeile 57) erneut `mpd.send('status')` für `song` geholt. Ein Roundtrip ließe sich
sparen. Geringe Auswirkung (10s-Intervall), aber unnötig.

### M6 — `MOVE_THRESHOLD_PX = 14` an zwei Stellen dupliziert
`useLongPress.ts:26` und `Pressable.tsx:22` definieren denselben Wert getrennt. Erfüllt T4.01
korrekt, aber bei künftigen Anpassungen Drift-Risiko. In eine geteilte Konstante extrahieren.

### M7 — Swipe-Up-Geste hat keine Untergrenze gegen versehentliches Auslösen während Drag
`app/src/renderer/src/screens/S5Player.tsx:104-118`: Die Swipe-Erkennung sitzt auf dem
S5-Root-`onPointerUp`. Da ProgressBar `stopPropagation` nicht aufruft, könnte ein vertikaler
Drag, der auf der Progress-Fläche beginnt und nach oben verlässt, theoretisch das Sheet öffnen.
In der Praxis hat die Progress-Track `touch-action:none` und eigene Handler, das Risiko ist
gering — am Touchscreen am Pi gegenprüfen.

---

## Plan-Konformität (Task-Abdeckung)

| Task | Status | Anmerkung |
|------|--------|-----------|
| T4.00 resume-on-stopped + Migration v3 | OK | Migration korrekt, `last_status`-Default 'paused', Stop/Pause-Handler setzen Status, resume prüft 'stopped'. |
| T4.01 Move-Threshold 14px | OK | `useLongPress.ts:26` + `Pressable.tsx:22`. |
| T4.02 Chapter-Interface | OK | `chapter.ts` vollständig; CUE nur als Stub (siehe M3). |
| T4.03 IPC additiv + Whitelist | OK | 5 neue Commands, Doppelpunkt-Konvention, in `ALLOWED_COMMANDS`, keine Keys entfernt. |
| T4.04 chapters.ts + Cache + ffprobe | TEILWEISE | ffprobe sicher (Array-Args), Cache vorhanden, aber Positionsmodell defekt (K2) und Cache-Key suboptimal (M4). |
| T4.05 seekRelative | OK | `control.ts` + Handler vorhanden, Clamp korrekt. |
| T4.06 setVolume 0–100, kein Limit | OK | Clamp 0–100, kein M5-Limit, Mixer-Fehler degradiert sauber. |
| T4.07 track_index Resume | TEILWEISE | implementiert, aber an fragilem Zeitmodell hängend (W3), ungetestet. |
| T4.08 de.json additiv | OK | Neue Keys vorhanden, keine entfernt/umbenannt. |
| T4.09 ProgressBar | TEILWEISE | 12px Track, 40×40 Handle, Seek-on-release, touch-action:none — alles korrekt; aber Kapitel-Marker-Positionierung defekt (K2). |
| T4.10 PlayerControls Größen/Aria | TEILWEISE | Größen 84/64/60px + 16px Gap korrekt; **Aria-Labels erreichen DOM nicht (K1)**. |
| T4.11 S5Player Layout/kein Scroll/Auto-Play-Guard | OK | overflow:hidden, Cover-Spalte, Auto-Play nur bei `currentPath !== item.path`. |
| T4.12 S6Chapters Sheet | OK | 260ms ease-out / 200ms ease-in, Scrim rgba(42,35,66,0.55), aktives Kapitel markiert, Swipe-Up auf Hintergrund. |
| T4.13 BT/Mond-Platzhalter | OK | `aria-hidden`, `pointer-events:none`, keine Funktion. |
| T4.14 Root auf S5 + NowPlayingBar entfernt | OK | Datei gelöscht, keine Imports/CSS-Reste. |

## Positives

- Architektur-Grundvertrag vollständig respektiert: Main kapselt MPD/SQLite, Renderer hält
  keinen Gerätezustand, contextBridge + Whitelist-Prüfung im Preload intakt, additive
  IPC-Erweiterung mit Doppelpunkt-Konvention.
- Kein Polling: `getChapters`-Cache wird sauber über die idle-Loop bei `playlist`/`database`-
  Änderungen invalidiert (`idle.ts:73-75`) — das ist genau der richtige Mechanismus.
- ffprobe wird mit Array-Argumenten gespawnt (`chapters.ts:87-92`) — kein Shell-Interpolieren,
  kein Command-Injection-Risiko. Vorbildlich.
- Migration v3 ist idempotent über die Versionsnummer, `CHECK`-Constraint auf `last_status`,
  sinnvoller Default 'paused' für Altbestand.
- Farb-Tokens exakt eingehalten: weißer Text nur auf `--flieder-deep`, nie auf `--flieder`;
  Scrim exakt der Spec-Wert. Kein `:hover` als Zustandsänderung im gesamten CSS.
- setVolume degradiert sauber, wenn kein Mixer da ist (kein Crash).
- Kein M5/M6/M7-Scope-Creep: kein Lautstärke-Limit, keine PIN, BT/Mond rein visuell.

---

## Gesamturteil

**BEDINGT — KRITISCHE Punkte zuerst beheben.**

M4 ist architektonisch und sicherheitstechnisch sauber, aber **nicht Pi-Abnahme-ready**. Vor
der Abnahme zwingend:
- **K1** (alle Player-Buttons ohne Accessible Name),
- **K2** (Kapitelanzeige/-marker für MP3-Ordner faktisch defekt durch track-relativ-vs-kumulativ),
- **K3** (M4B-Kapitelsprung deckt Lade-Fall nicht ab / stiller No-Op).

K2 ist der schwerste Punkt, weil er gleich drei Features (Kapitel-Label, ProgressBar-Marker,
Kapitelnavigation W4) gemeinsam betrifft und Resume (W3) tangiert. Nach dem Fix muss am echten
Pi mit (a) einem mehrspurigen MP3-Ordner und (b) einer M4B mit eingebetteten Kapiteln verifiziert
werden — das deckt die offenen Punkte K2/K3/W3/W4 in einem Durchgang ab.

Dringend empfohlen vor Milestone-Abschluss: **W5** (Unit-Tests für die neuen reinen Funktionen),
da genau die ungetesteten Stellen die Bugs enthalten.
