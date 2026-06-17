# M4 Fix-Audit (Runde 2) — Hörmond

Datum: 2026-06-17
Auditor: Codebase Auditor
Branch: `ms04`
Geprüfter Fix-Commit: `26ca061` ("Behebe Milestone-4-Code-Audit Findings (K1–K3, W1–W5)")
Basis-Audit: `tasks/m4-audit.md` (Commit `fd6fa92`)

Verifikationslauf: `npm run typecheck` (node+web) sauber, `npx vitest run` → **39/39 grün, 4 Test-Dateien**.

---

## Kurzfazit vorweg

K1, K3, W1, W2 sind **sauber und vollständig behoben**. K2 — der schwerste Punkt — ist
**im Kern gelöst** (Kapitel-Index und Position sind für MP3-Ordner jetzt korrekt), aber der Fix
hat **eine echte Regression in der ProgressBar-Darstellung** und **zwei neue Konsistenzlücken**
eingeführt, die am Pi sichtbar werden. Die W5-Tests sind grün, aber **ein erheblicher Teil davon
ist tautologisch** (testet im Test neu definierte Helfer statt des Produktionscodes) und deckt
genau die fehlerhaft gebliebenen Pfade **nicht** ab.

---

## Befund pro Finding

### K1 — aria-label an Pressable → **BESTÄTIGT**

`PressableProps` deklariert jetzt `ariaLabel?: string` (`Pressable.tsx:21`) und reicht es als
`aria-label={ariaLabel}` an das gerenderte `<div role="button">` durch (`Pressable.tsx:83`).
`PlayerControls.tsx` nutzt durchgängig `ariaLabel={t(...)}` für alle 7 Buttons (Zeilen
150, 161, 168, 179, 188, 198, 206). Die Labels erreichen jetzt das DOM. Korrekt umgesetzt,
keine Nebenwirkungen. Variante (a) aus dem Basis-Audit wurde gewählt — konsistente Lösung.

Hinweis (kein Defekt): `role="button"` ohne `tabindex`/Keyboard-Handler ist für ein
Touch-only-Kiosk-Gerät akzeptabel; falls je ein Screenreader/Tastatur genutzt werden soll, wäre
`tabIndex={0}` + Enter/Space-Handling nötig. Für M4-Scope nicht blockierend.

---

### K2 — Kapitel-Positionsmodell (track-relativ vs. kumulativ)

Das war der größte Fix. Aufgeteilt nach Teilaspekt:

#### K2a — `currentChapterIndex` für MP3-Ordner → **BESTÄTIGT**
`getState()` (`control.ts:204-207`) leitet den Index jetzt aus dem MPD-Playlist-Index
`st['song']` ab statt aus `chapterIndexForPosition(chapters, elapsed)`. Das löst den
Kernbug (vorher dauerhaft Kapitel 0). Korrekt.

#### K2b — Globale Position/Dauer in `getState()` → **TEILWEISE**
`globalPosition = offsetBefore + Math.round(elapsed)` und
`totalDuration = Σ durationSeconds` (`control.ts:209-218`) sind für den Normalfall korrekt.

**Rest-Risiko / NEU GEFUNDEN (N1):** Wenn `currentChapterIndex === null` wird
(MPD `song`-Index ≥ `chapters.length` — z. B. transienter Zustand direkt nach `clear`/`add`
oder wenn die Playlist länger ist als die gecachte Kapitelliste), bleibt `globalPosition` auf
dem **track-relativen** `Math.round(elapsed)` stehen (Initialwert Zeile 198), während
`totalDuration` bereits die **globale** Summe ist. Position und Dauer haben dann
unterschiedliche Bezugssysteme → ProgressBar zeigt kurzzeitig einen falschen (zu kleinen)
Fortschritt. Transient und selten, aber inkonsistent. Empfehlung: bei `currentChapterIndex === null`
entweder beide Werte track-relativ lassen oder `currentChapterIndex` auf
`min(songIndex, len-1)` clampen statt auf `null` zu setzen.

#### K2c — ProgressBar-Darstellung → **NICHT GELÖST (Regression)**

**NEU GEFUNDEN (N2) — kritisch für die visuelle Abnahme.**
`getState()` liefert für MP3-Ordner jetzt **globale** `position` und **globale** `duration`
(= Σ Track-Dauern). `ProgressBar` bekommt diese global übergeben (`S5Player.tsx:200-203`).
Der Fortschrittsbalken (`displayPercent = position/duration`) ist damit korrekt **global**.

**Aber:** `getState()` füllt `PlayerState.chapters` weiterhin mit den
**vollständigen Chapter-Objekten aus `getChapters`**, deren `startSeconds` für MP3-Ordner
**kumulativ über das gesamte Medium** sind (`chapters.ts:191-207`). Die Chapter-Marker werden
in `ProgressBar.tsx:121` als `ch.startSeconds / duration` positioniert.

Jetzt sind beide Größen global → die Marker landen **diesmal an der richtigen Stelle**.
Das heißt: für **MP3-Ordner ist N2 KEIN Defekt mehr** — Marker und Fortschritt teilen dasselbe
globale Bezugssystem. Der ursprüngliche K2-Marker-Bug ist damit **behoben**.

**Wo es bricht: M4B/seekOffset.** Für M4B liefert `getState()`:
- `position = Math.round(elapsed)` = Position **im gesamten File** (global, korrekt),
- `duration = song.Time` = Gesamtdauer des Files (global, korrekt),
- `chapters[i].startSeconds` = kumulative Offsets ab 0 (global, korrekt).

Für M4B passt also alles zusammen. **Ergebnis: ProgressBar ist nach dem Fix für BEIDE
Medientypen konsistent.** Die im Basis-Audit als K2 gemeldete Marker-Regression ist **behoben**.
Ich stufe K2c daher final als **BESTÄTIGT** ein — der „NICHT GELÖST"-Verdacht oben hat sich beim
Durchrechnen nicht bestätigt, ich lasse die Herleitung zur Nachvollziehbarkeit stehen.

#### K2d — `seekRelative` (−15s/+30s) Bezugssystem → **TEILWEISE**

`seekRelative` (`control.ts:119-142`) arbeitet bewusst **track-relativ** (nutzt rohes
`status.elapsed` und `status.duration`, kein globaler Offset) und ist auf den aktuellen Track
begrenzt — dokumentiert in den Kommentaren. Das ist in sich konsistent, weil MPD `seekcur`
ohnehin track-bezogen ist.

**Rest-Risiko (UX, NEU GEFUNDEN N3):** Die beiden Zweige (playlistPos und else) in
`seekRelative` sind **byte-identisch** (Zeilen 135 vs. 139). Der `if`/`else` ist toter
Code-Aufwand und der teure `getChapters`-Aufruf (Zeile 130) ist hier **komplett überflüssig** —
das Ergebnis wird nie verwendet, um das Verhalten zu verzweigen. Das ist kein Korrektheitsbug,
aber unnötiger MPD/ffprobe-Roundtrip auf dem Hot-Path eines Tap-Buttons. Außerdem die fachliche
Einschränkung: −15s am Track-Anfang (Spur 5, elapsed≈3s) clampt auf 0 (Spur-Anfang), springt
**nicht** in die vorige Spur zurück. Für ein Kind, das „15 Sekunden zurück" erwartet, ist das an
Spurgrenzen ein spürbarer Bruch. Nicht abnahmeblockierend, aber am Pi mit MP3-Ordner gegen die
Erwartung prüfen.

#### K2e — Konsistenz `seek()` (absolute, global) → **BESTÄTIGT**

`seek()` (`control.ts:69-106`) interpretiert die Position für playlistPos korrekt als global,
findet das Ziel-Kapitel über `chapterIndexForPosition`, springt per `play <playlistPos>` zur
Spur und rechnet die track-relative Restposition korrekt aus (`clamped - offsetBeforeTarget`,
geclampt auf Track-Bounds). Das passt exakt zum globalen Modell, das ProgressBar an
`onSeekCommit` liefert. Konsistent. Für M4B (else-Zweig) bleibt `seekcur` track-relativ —
korrekt, da Single-File.

**Gesamtbewertung K2: TEILWEISE** — Kernbug behoben und über `getState`/`seek`/ProgressBar
konsistent; Rest-Risiken N1 (null-Index-Inkonsistenz) und N3 (toter Branch + überflüssiger
ffprobe-Roundtrip in seekRelative).

---

### K3 — M4B-Kapitelsprung validiert Datei-Load → **TEILWEISE**

`navigateToChapter` (`chapters.ts:317-341`) prüft im seekOffset-Zweig jetzt via `currentsong`,
ob die richtige Datei geladen ist, und macht andernfalls `clear`/`add`/`play` vor `seekcur`.
Das löst den gemeldeten stillen No-Op im Lade-Fall. Grundsätzlich korrekt.

**Zur Audit-Frage „reicht der Datei-Vergleich aus?": Der Vergleich ist FRAGIL (NEU GEFUNDEN N4).**
Der Code normalisiert `chapter.seekFile` (absolut, `/media/...`) per
`replace(/^\/media\//, '')` und vergleicht mit **strikter Gleichheit** gegen `currentsong.file`
(`chapters.ts:329-330`):

```ts
const seekFileRelative = chapter.seekFile.replace(/^\/media\//, '');
const fileIsLoaded = currentFile && currentFile === seekFileRelative;
```

Probleme:
1. **`/media`-Pfad ist hartkodiert und steht im Widerspruch zur Deployment-Realität.** Laut
   Architektur-Vertrag (ADR-2) und Memory `project-pi-deploy-path` liegt der State-/Media-Mount
   nicht zwingend unter genau `/media/`. `extractM4bChapters` baut `absolutePath = /media/${rel}`
   (`chapters.ts:81`) — solange beide Stellen dieselbe Konstante verwenden, hebt sich der Fehler
   auf. Aber: die Annahme ist an **zwei** Orten dupliziert hartkodiert. Wenn der Mount je woanders
   liegt, schlägt zwar nicht der Vergleich fehl (beide nutzen `/media`), aber `add` bekäme einen
   Pfad, den MPD evtl. nicht auflöst. Spröde. In eine geteilte Konstante ziehen.
2. **Strikte Gleichheit statt Suffix-Match.** Das Basis-Audit sprach von „Suffix-Match" — der
   Code macht aber **exakte** Gleichheit nach Prefix-Strip. Das ist sogar **strenger** und damit
   korrekter als ein Suffix-Match (kein Risiko von „...Buch.m4b" matcht „MeinBuch.m4b"). Gut.
   ABER: es gibt **keine Normalisierung von Groß/Klein, Unicode (NFC/NFD) oder Trailing-Slashes**.
   MPD liefert `file` exakt so, wie es die DB indexiert hat; `seekFile` kommt aus dem gleichen
   relativen Pfad, der ursprünglich an `play()` ging. In der Praxis identisch — solange der Pfad,
   mit dem `getChapters` aufgerufen wird, **byte-genau** der MPD-`file`-Pfad ist. Das ist beim
   M4B-Fall gegeben (currentPath stammt selbst aus `currentsong.file`). **Funktioniert für den
   Normalfall**, ist aber gegen jede Pfad-Normalisierungs-Differenz ungeschützt.
3. **Kein Re-Seek-Schutz nach `play`.** Nach `clear`/`add`/`play` wird sofort `seekcur` gesendet.
   MPD akzeptiert `seekcur` direkt nach `play` i. d. R., aber wenn `play` asynchron erst die Datei
   öffnet, kann `seekcur` bei sehr großen Dateien knapp daneben greifen. Risiko gering; am Pi mit
   echter M4B verifizieren (steht ohnehin als Abnahme-Empfehlung).

**Bewertung K3: TEILWEISE** — Lade-Fall ist jetzt abgedeckt (Hauptziel erreicht), aber der
`/media`-Hardcode ist doppelt dupliziert und an die Deploy-Realität gekoppelt; am echten Pi mit
M4B zu verifizieren.

---

### W1 — handleVolumeUp Guard → **BESTÄTIGT**
`S5Player.tsx:87`: `if (playerState?.volume == null) return;` — Präzedenz-Bug beseitigt, deckt
`null`/`undefined` korrekt ab. Die Folgezeile nutzt zusätzlich `(playerState?.volume ?? 0)` als
zweiten Gürtel. Korrekt.

### W2 — handleVolumeDown Guard → **BESTÄTIGT**
`S5Player.tsx:80-81`: `if (playerState?.volume == null) return;` — Falsy-Falle (`!0 === true`)
beseitigt, Volume 0 wird nicht mehr fälschlich geblockt. Korrekt und konsistent zu W1.

---

### W5 — Unit-Tests → **TEILWEISE**

39 Tests grün, 4 Dateien. Aber die Qualität ist sehr ungleich. Bewertung pro Datei:

**`resume.test.ts` → GUT, echter Wert.**
Testet `resumeLast` gegen eine **echte In-Memory-better-sqlite3-DB** (nicht gemockt) — genau wie
im Basis-Audit (W5) gefordert. Deckt die Kern-Fälle ab: kein Resume bei `stopped`, Resume bei
`paused`/`playing`, Multi-Track (`play 5` + `seekcur 120`), Zero-Position. `play`/`getMpd` sind
gemockt, was hier korrekt ist (externe Prozesse). Das ist der stärkste der drei neuen Tests.
*Lücke:* kein Test für den Fall `track_index > 0` **mit** `last_status='stopped'` (sollte trotz
Track NICHT resumen) und kein Test, der prüft, dass bei `track_index === 0` **kein** `play N`/
`seekcur` gesendet wird (Negativ-Assertion fehlt).

**`chapters.test.ts` → MITTEL, testet echte Funktion aber nur die einfachste.**
Testet die **echte** `chapterIndexForPosition` (importiert aus `./chapters`) — gut, das ist
Produktionscode. Grenzfälle (leer, exakte Grenze, jenseits Ende, negativ) sind sinnvoll
abgedeckt. **Aber:** `chapterIndexForPosition` ist nach dem K2-Fix für MP3-Ordner
**gar nicht mehr der Pfad, der den angezeigten Kapitel-Index bestimmt** (der kommt jetzt aus
`st['song']`, K2a). Die Funktion wird für playlistPos nur noch in `seek()` benutzt. Der Test
deckt also eine Funktion ab, deren wichtigster frühere Bug (K2) gar nicht mehr über sie läuft.
Die **eigentlich neu eingeführte und riskante Logik** — `getState`-Index aus `st['song']`,
globale Positions-/Dauerberechnung, die `seek()`-Global→Track-Konvertierung — wird **nicht**
direkt getestet.

**`control.test.ts` → SCHWACH, größtenteils tautologisch.**
Das ist der problematische Test. Er importiert **nichts aus `control.ts`**. Stattdessen
definiert er im Test **eigene Kopien** der Logik (`globalToTrackRelative`,
`findChapterForPosition`, Zeilen 15-40) und testet diese Kopien. Beispiele:
- „volume clamping" testet `Math.max(0, Math.min(100, 150))` — also eine **Inline-Rechnung im
  Test**, nicht `setVolume`. Das ist eine Tautologie: es beweist nur, dass `Math.min`/`Math.max`
  funktionieren, nicht dass `setVolume` korrekt clampt.
- „seekRelative within track bounds" rechnet `Math.max(0, Math.min(elapsed+delta, dur))`
  **direkt im Test** nach — testet nicht die echte `seekRelative`.
- `findChapterForPosition` ist eine **Re-Implementierung** von `chapterIndexForPosition`; wenn der
  echte Code driftet, merkt der Test es nicht.

Diese Datei gibt **falsche Sicherheit**: 39/39 grün klingt gut, aber ein nennenswerter Teil
testet im Test neu geschriebenen Code, nicht das Produkt. Wenn jemand `setVolume` so ändert, dass
der Clamp kaputtgeht, bleibt der Test grün.

**Empfehlung W5:** `control.test.ts` neu aufsetzen, sodass es die **echten** Funktionen
(`setVolume`, `seekRelative`, `seek`, `getState`) mit einem gemockten `getMpd` aufruft und die an
MPD gesendeten Kommandostrings asserted (z. B. „bei `setVolume(150)` wird `setvol 100` gesendet",
„bei `seek(700)` auf playlistPos-Medium wird `play 2` + `seekcur 0` gesendet"). Das deckt genau
die K2-Konvertierung ab, die aktuell ungetestet ist. `getMpd` lässt sich wie in `resume.test.ts`
per `vi.mock` mit einem Send-Recorder mocken.

**Bewertung W5: TEILWEISE** — resume-Tests sind gut, chapters-Test ok aber am verschobenen
Pfad vorbei, control-Test überwiegend tautologisch und ohne Aussagekraft über den Produktionscode.

---

## Konsistenz zwischen den Fixes

- **`getState` (global) ↔ `seek` (global→track) ↔ ProgressBar (global):** konsistent. ✅
- **`getState` (global position) ↔ `persist.ts` (track-relativ):** **korrekt getrennt.**
  `persist.ts:57-64` zieht für die DB bewusst **nicht** `st.position` (global), sondern holt
  `st2['song']` (Track-Index) und `st2['elapsed']` (track-relativ) frisch aus MPD. `resume.ts`
  liest das track-relativ wieder ein und macht `play <track_index>` + `seekcur <track-relativ>`.
  Das Zeitmodell ist hier **bewusst und korrekt track-relativ** — passt zu W3 aus dem Basis-Audit.
  Die Kommentare (`persist.ts:54-56`) dokumentieren die Trennung explizit. ✅
  *Aber NEU GEFUNDEN (N5):* `persist.ts` macht jetzt **zwei** `status`-Roundtrips — einmal in
  `getState()` (Zeile 19) und einmal direkt (Zeile 58). Das war schon M5 im Basis-Audit; durch den
  Fix wurde der zweite Roundtrip **zementiert** statt entfernt. Geringe Auswirkung (10s-Intervall),
  aber der globale `st.position` aus `getState()` wird komplett verworfen — sauberer wäre, in
  `persist` gar nicht erst `getState()` zu rufen, sondern nur einmal `status`+`currentsong`.
- **`chapterNext/Prev` (register.ts) ↔ `currentChapterIndex`:** Da K2a den Index korrigiert,
  liefert `getState().currentChapterIndex` jetzt den richtigen Wert → die im Basis-Audit als W4
  vermerkte Folgewirkung ist mit K2 **mitbehoben**. ✅

---

## Vollständigkeit der Findings aus Runde 1

| Finding | Status nach Fix |
|---------|-----------------|
| K1 aria-label | ✅ BESTÄTIGT |
| K2 Positionsmodell | ⚠️ TEILWEISE (Kern gelöst; N1, N3 offen) |
| K3 M4B-Load-Check | ⚠️ TEILWEISE (Hauptziel erreicht; N4 /media-Hardcode, Pi-Verifikation offen) |
| W1 VolumeUp-Guard | ✅ BESTÄTIGT |
| W2 VolumeDown-Guard | ✅ BESTÄTIGT |
| W3 Resume-Zeitmodell | ✅ konsistent (track-relativ sauber getrennt) |
| W4 chapterNext/Prev Index | ✅ mit K2 mitbehoben |
| W5 Tests | ⚠️ TEILWEISE (resume gut, control tautologisch) |
| W6 No-Op-Feedback | ❌ nicht adressiert (war nicht im Fix-Scope; weiterhin offen) |
| M1–M7 (Minor) | nicht adressiert (erwartungsgemäß; M5 sogar leicht verschärft → N5) |

---

## NEU GEFUNDEN — durch die Fixes entstanden/verbliebene Risiken

- **N1 (Minor):** `getState` mit `currentChapterIndex === null` für playlistPos liefert
  track-relative `position` aber globale `duration` → transiente Fortschritts-Inkonsistenz.
  `control.ts:197-218`.
- **N2 (kein Defekt):** ProgressBar-Marker — beim Durchrechnen als **konsistent** bestätigt (alle
  Größen global). Verdacht ausgeräumt.
- **N3 (Minor):** `seekRelative` — beide if/else-Zweige identisch, `getChapters`-Roundtrip
  überflüssig auf Tap-Hot-Path. `control.ts:119-142`.
- **N4 (Major):** `/media/`-Prefix doppelt hartkodiert (`chapters.ts:81` und `:329`), an
  Deploy-Realität (ADR-2) gekoppelt; strikter Gleichheits-Vergleich ohne Pfad-Normalisierung.
  Funktioniert im Normalfall, am Pi mit echter M4B zu verifizieren.
- **N5 (Minor):** `persist.saveNowInternal` macht zwei `status`-Roundtrips; `st.position` aus
  `getState()` wird verworfen. `persist.ts:19,58`.

---

## Pi-Verifikation, die der Fix NICHT ersetzt

Der Fix ist statisch (typecheck + Unit-Tests) abgesichert, aber **keiner** der Tests fährt echtes
MPD/ffprobe. Vor der Abnahme zwingend am Pi:
1. **MP3-Ordner, mehrspurig:** Kapitel-Label wechselt mit der Spur (K2a), ProgressBar zeigt
   globalen Fortschritt + Marker an richtiger Stelle, Drag-Seek über Spurgrenze springt korrekt
   (K2e), −15s/+30s an Spurgrenze (K2d/N3 — Erwartung gegenprüfen).
2. **M4B mit eingebetteten Kapiteln:** Kapitelsprung lädt/seekt korrekt, auch wenn die Datei
   noch nicht geladen ist (K3/N4); `/media`-Pfad löst auf dem realen Mount auf.
3. **Resume mehrspurig:** Spur > 0, Position > 0, App-Neustart → richtige Spur + Position
   (W3-Pfad).

---

## Gesamturteil

**BEDINGT ABNAHME-READY — die drei KRITISCHEN Findings des ersten Audits sind funktional behoben,
aber die Pi-Verifikation steht aus und zwei neue Punkte (N4, W5-Testqualität) sollten vor
Milestone-Abschluss adressiert werden.**

Konkret:
- **K1, W1, W2** sind vollständig und sauber erledigt — keine Vorbehalte.
- **K2** ist im funktionalen Kern gelöst und über `getState`/`seek`/ProgressBar **konsistent**;
  die verbliebenen Punkte (N1, N3) sind Minor und nicht abnahmeblockierend.
- **K3** erreicht sein Hauptziel (Lade-Fall abgedeckt), hängt aber am `/media`-Hardcode (N4) und
  muss am echten Pi mit M4B verifiziert werden, bevor man „erledigt" sagen darf.
- **W5** liefert grüne Tests, aber `control.test.ts` ist **größtenteils tautologisch** und gibt
  trügerische Sicherheit. Die riskanteste neue Logik (K2-Konvertierung in `seek`/`getState`,
  `setVolume`/`seekRelative`-Clamp im echten Code) ist **nicht** getestet. Das ist die bekannte
  systemische Schwachstelle des Projekts und sollte vor Abschluss nachgezogen werden — der
  resume-Test zeigt, dass das Team es kann (echte In-Memory-DB statt Mock).

Empfehlung: K1/W1/W2 abnehmen; K2/K3 erst nach der oben gelisteten Pi-Verifikation als „done"
markieren; `control.test.ts` gegen echte Funktionen umschreiben; N4 (`/media`-Konstante
zentralisieren) vor Milestone-Abschluss beheben.
