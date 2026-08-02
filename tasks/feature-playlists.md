# Feature: Ordnerstruktur als Gruppierungsmodell + Ordner-Verwaltung im Web

**Projekt:** Hörmond — KinderMediaPlayer
**Status:** ✅ **Gruppierungsregel umgesetzt** (Branch `ordnermodell`, 2026-08-02).
Offen: Migration bestehender Fortschritte, Navigation am Gerät, Web-Dateimanager —
siehe „Was noch fehlt" am Ende.
**Erstellt:** 2026-08-02
**Abhängig von:** Web-Upload-Portal (`feature-web-upload.md`) als Editier-Oberfläche
**Betrifft:** M2 (Bibliothek), M4 (Kapitel/Resume), DB-Schema, **Design-Brief Kap. 3.2**

---

## Entscheidungen (2026-08-02)

**E1 — Die Ordnerstruktur ist das Gruppierungsmodell.** Keine `.m3u`-Dateien, keine
Playlist-Tabellen in der DB, keine automatische Gruppierung über Tags.

> **Nur die untersten Ordner — die ohne Unterordner — sind Einheiten („Playlists").
> Alles darüber ist ein Navigationsordner. Lose Dateien in einem Navigationsordner
> sind Einzelsongs mit eigener Kachel.**

Als Regel in zwei Zeilen:

| Ordner enthält … | ist … | lose Dateien darin |
|---|---|---|
| Unterordner | **Navigationsordner** | je eine **Einzelsong**-Kachel auf dieser Ebene |
| nur Dateien | **Einheit / Playlist** | sind ihre Tracks |

**E2 — Gilt für Hörbücher genauso wie für Musik.** Eine Regel für beides. Beispiel:

```
audiobooks/
  WasIstWas/                 ← Ordner (navigierbar)
    Dinosaurier/             ← Einheit  (enthält 01.mp3 … 12.mp3)
    Weltraum/                ← Einheit
  Benjamin Blümchen/         ← Ordner
    Im Zoo/                  ← Einheit
music/
  Kinderlieder/              ← Ordner
    Lieblingslieder/         ← Einheit  (selbst zusammengestellt)
```

**E3 — Die Oberordner sind auch am Gerät navigierbar.** Das Kind tippt „WasIstWas" an
und landet in einer Ebene mit den Titeln. ⚠️ Das ist ein Bruch mit einer bestehenden
Design-Regel — siehe Abschnitt „Konflikt mit dem Design-Brief".

**E4 — Ein Lied in mehreren Zusammenstellungen wird kopiert.** Kein Hardlink, kein
Symlink. Platzbedarf ist bei Liedern vernachlässigbar, dafür ist das Modell trivial:
eine Datei, ein Ort, keine Sonderfälle.

**E5 — Umbenennen muss im Web-Portal möglich sein.** Für Ordner und Einheiten.

Damit sind die früheren offenen Fragen zu DB-vs-`.m3u` und zur Koexistenz beider
Modelle erledigt.

---

## Problem im Ist-Zustand

Die Gruppierung von Musik ist heute rein **tag-abgeleitet**
(`app/src/main/library/list.ts:106-124`):

```ts
if (type === 'music') {
  const albumArtist = f['AlbumArtist'] ?? f['Artist'];
  const album = f['Album'];
  if (albumArtist && album) {
    unitPath = `music/${albumArtist}/${album}`;
  } else {
    // No proper tags: use file path directly (single file = own tile)
    unitPath = file;
  }
}
```

Der entstehende `unitPath` ist ein **virtueller Pfad**, kein Dateisystempfad. Beim
Abspielen wird er in `control.ts:20-36` wieder zerlegt und über
`findadd albumartist "…" album "…"` aufgelöst.

**Was daran schiefgeht:**

1. Fehlende Tags → jede Datei wird zur eigenen Kachel (Kachelflut im 4-spaltigen Grid).
2. Sampler zerfallen: ohne `AlbumArtist` splittet ein Album in eine Kachel pro Interpret.
3. Schreibvarianten („Die Ärzte" / „Die Aerzte") erzeugen Dubletten.
4. **Umtaggen zerstört den Hörfortschritt** — der virtuelle Pfad ist der
   `playback_position.media_path`.
5. Die Ordnerstruktur, die man beim Befüllen bewusst anlegt, wird ignoriert.

### Gemessen am Testbestand (2026-08-02)

Die lokale Testumgebung (`dev/README.md`) reproduziert das live. **33 Dateien ergeben
nach heutiger Regel 15 Kacheln:**

```
  10x  audiobooks/Benjamin Bluemchen/Im Zoo
   1x  audiobooks/Einzelhoerbuch.m4b
   4x  audiobooks/Lange Reihe/Der Schatz          ← CD1+CD2 korrekt zusammengefasst
   1x  audiobooks/WasIstWas                       ← ⚠ Navigationsordner wird zur Kachel
   3x  audiobooks/WasIstWas/Dinosaurier
   2x  audiobooks/WasIstWas/Weltraum
   2x  music/Anna/Kinderhits                      ← ⚠ Sampler zerfällt …
   1x  music/Bernd/Kinderhits                     ←   … in drei Kacheln …
   1x  music/Clara/Kinderhits                     ←   … statt einer
   3x  music/Die Aerzte/Bester Sampler
   1x  music/Die Ärzte/Noch ein Sampler           ← ⚠ Schreibvariante = eigene Kachel
   1x  music/Diverse/Lieblingslieder              ← ⚠ nur 1 statt 2 Songs (s. u.)
   1x  music/Ohne Tags/track-a.mp3                ← ⚠ je Datei eine Kachel
   1x  music/Ohne Tags/track-b.mp3
   1x  music/Übungskünstler/Sonderzeichen
```

Zwei Befunde, die vorher nur vermutet waren:

- **Der Kopie-Fall E4 funktioniert im Tag-Modell überhaupt nicht.** Die Kopie von
  „Lied A" in `Kinderlieder/Lieblingslieder/` behält ihre Tags und wird deshalb der
  Sampler-Kachel `music/Anna/Kinderhits` zugeschlagen (daher dort 2x) — **quer über
  Ordnergrenzen hinweg**. Die selbst zusammengestellte Playlist zeigt nur noch einen
  statt zwei Songs. Im Ordnermodell verschwindet das Problem restlos.
- **Ein loser `Sonnensystem.m4b` in `WasIstWas/` erzeugt eine Kachel namens
  „WasIstWas"** — also eine Kachel, die wie der Navigationsordner heißt und genau eine
  Datei enthält. Der Code kennt diesen Catch-all-Fall und schützt davor
  (`list.ts:119-123`), aber nur auf der obersten Ebene.

**Widerlegt:** Meine Sorge, die 3-Segment-Regel würde CDs zerlegen, war falsch herum —
sie fasst `Der Schatz/CD1` und `CD2` **korrekt** zu einer Einheit zusammen. Ein naives
`dirname(file)` würde das kaputtmachen. Die Sonderregel für Datenträger-Ordner ist also
keine Kür, sondern nötig, sobald die 3-Segment-Regel fällt.

### Ergebnis nach der Umsetzung

Nach dem Einbau (inklusive Datenträger-Sonderregel) sind es **15 → 12 Kacheln**,
**ohne Regression**:

```
  − audiobooks/WasIstWas                     + audiobooks/WasIstWas/Sonnensystem.m4b
  − music/Anna/Kinderhits                    + music/Sampler/Kinderhits
  − music/Bernd/Kinderhits
  − music/Clara/Kinderhits
  − music/Diverse/Lieblingslieder            + music/Kinderlieder/Lieblingslieder
  − music/Ohne Tags/track-a.mp3              + music/Ohne Tags
  − music/Ohne Tags/track-b.mp3
  − music/Übungskünstler/Sonderzeichen       + music/Umlaute & Zeichen
```

`audiobooks/Lange Reihe/Der Schatz` bleibt eine Einheit mit vier Dateien — die
Datenträger-Regel greift, CD1 und CD2 fallen nicht mehr auseinander. Am MPD
gegengeprüft: `add "audiobooks/Lange Reihe/Der Schatz"` liefert alle vier Tracks
in richtiger Reihenfolge über die CD-Grenze hinweg, `add "music/Sampler/Kinderhits"`
alle drei Sampler-Titel als eine Einheit.

Die Titel sind jetzt durchweg die Ordnernamen: „Im Zoo", „Der Schatz", „Dinosaurier",
„Kinderhits", „Lieblingslieder", „Ohne Tags" — und für den Einzelsong
`Sonnensystem.m4b` der `Title`-Tag bzw. der Dateiname.

### Die ursprüngliche Gegenprobe (vor der Umsetzung)

`node dev/show-units.mjs` wendet beide Regeln auf denselben Bestand an. Ergebnis
**15 → 13 Kacheln**:

```
  − audiobooks/Lange Reihe/Der Schatz        + audiobooks/Lange Reihe/Der Schatz/CD1
                                             + audiobooks/Lange Reihe/Der Schatz/CD2
  − audiobooks/WasIstWas                     + audiobooks/WasIstWas/Sonnensystem.m4b
  − music/Anna/Kinderhits                    + music/Sampler/Kinderhits
  − music/Bernd/Kinderhits
  − music/Clara/Kinderhits
  − music/Diverse/Lieblingslieder            + music/Kinderlieder/Lieblingslieder
  − music/Ohne Tags/track-a.mp3              + music/Ohne Tags
  − music/Ohne Tags/track-b.mp3
  − music/Übungskünstler/Sonderzeichen       + music/Umlaute & Zeichen
```

Vier Verbesserungen, eine Regression:

- ✅ Der zerfallene Sampler wird **eine** Kachel.
- ✅ Die beiden tag-losen Dateien werden **eine** Kachel statt zweier.
- ✅ `Lieblingslieder` enthält endlich **beide** Songs — die Kopie wird nicht mehr über
  Ordnergrenzen hinweg dem Sampler zugeschlagen.
- ✅ Die Catch-all-Kachel `WasIstWas` verschwindet; die lose `.m4b` wird ein sauberer
  Einzelsong.
- ❌ **`Der Schatz` zerfällt in `CD1` und `CD2`.** Die einzige Verschlechterung — und der
  Beleg, dass die Datenträger-Sonderregel Teil der Umsetzung sein muss, nicht ein
  „nice to have" danach.

### Hörbuch-Regel im Detail

Für Hörbücher gilt eine andere, ebenfalls unpassende Regel (`list.ts:118`):

```ts
unitPath = parts.slice(0, Math.min(3, parts.length - 1)).join('/') || parts[0];
```

Also *maximal drei Pfadsegmente*. Bei `audiobooks/WasIstWas/Dinosaurier/01.mp3` ergibt
das zufällig das Richtige — bei einer Ebene mehr (`audiobooks/WasIstWas/Reihe/Titel/…`)
würden **alle Titel einer Reihe in eine Kachel** fallen. Die Regel muss ohnehin weg.

---

## Zielmodell

**Einheit = ein Verzeichnis ohne Unterverzeichnisse.** Bei beliebiger Tiefe, für
Hörbücher und Musik dieselbe Regel. Tags werden nur noch für die **Anzeige** verwendet
(Interpret, ggf. Titel), nie für die Gruppierung.

Der `unitPath` wird damit zu einem **echten Pfad** — stabil, sichtbar, im Web
manipulierbar, unabhängig von der Tag-Qualität.

Für Einzelsongs in einem Navigationsordner ist der `unitPath` der **Dateipfad selbst**
(so wie heute schon der Fallback in `list.ts:114` und `:122` funktioniert). Eine `.m4b`,
die direkt in einem Navigationsordner liegt, fällt genau darunter — und das passt: Sie
ist ohnehin eine in sich geschlossene Einheit mit eingebetteten Kapiteln, die M4-Logik
greift unverändert.

### Was das im Main-Prozess vereinfacht

Erfreulicher Nebeneffekt: Die heute **dreifach duplizierte** Gruppierungslogik
kollabiert auf eine triviale Regel.

| Stelle | Heute | Danach |
|--------|-------|--------|
| `library/list.ts:106-124` | Zwei Zweige, Tag-Auflösung, Fallbacks, 3-Segment-Sonderregel | `dirname(file)`, falls dieser Ordner keine Unterordner hat — sonst der Dateipfad selbst |
| `mpd/control.ts:20-36` | `findadd albumartist … album …` + Artist-Fallback + Escaping | `add "<pfad>"` — MPD fügt ein Verzeichnis rekursiv hinzu |
| `player/persist.ts:22-40` | Sonderzweig für `music` mit extra `currentsong`-Roundtrip | `dirname(currentPath)` |

Der separat notierte Refactor „Gruppierungslogik zusammenziehen" wird damit Teil dieser
Arbeit statt eine Vorbedingung.

---

## ⚠️ Konflikt mit dem Design-Brief (E3)

`design-brief.md` Kap. 3.2 legt ausdrücklich fest:

> **Maximale Tiefe für das Kind: 2 Ebenen** (Startscreen → Bibliothek → Player).
> Alles darunter sind Overlays/Dialoge, keine neuen Navigationsebenen.

Navigierbare Oberordner fügen eine **dritte, beliebig tiefe** Ebene hinzu. Die Regel
wird damit bewusst aufgehoben.

Die Zielgruppe (6–8 Jahre, `briefing.md:5`) **kann lesen, nur noch nicht flüssig**.
Textlabels sind also ein taugliches Orientierungsmittel — sie müssen nur kurz, groß und
kontrastreich sein. Das entschärft den Konflikt deutlich, ersetzt aber nicht:

- **Ordnernamen sind jetzt UI-Text.** Was im Portal als Ordnername getippt wird, muss ein
  Erstklässler entziffern können. Kurze Namen, keine Abkürzungen, kein `WasIstWas_Folge_12_final`.
  Im Portal sichtbar machen, wie der Name auf der Kachel umbricht bzw. abgeschnitten wird.
- **Ordner-Kacheln optisch von Einheiten unterscheiden.** Nicht weil Text unlesbar wäre,
  sondern damit „hier geht's weiter" und „hier spielt was" auf einen Blick trennbar sind
  (Form, Rahmen, Stapel-Metapher) — Lesen soll die Bestätigung sein, nicht der einzige Weg.
- **Zurück.** Heute ist `onBack` in `LibraryGrid.tsx:18` ein einzelner Callback direkt
  nach S1. Für Hierarchie braucht es einen echten Navigationsstack. Die Zurück-Affordanz
  liegt laut Kap. 3.2 konstant oben links (64 × 64 px) — Muskelgedächtnis bleibt erhalten.
- **Rettungsanker.** Ein Weg zurück zum Start aus jeder Tiefe (langer Tap auf Zurück?
  Haus-Icon?), damit man sich nicht mehrfach hochtippen muss.
- **„Zuletzt gehört" bleibt der Hauptweg.** Die Sektion sollte auf der **obersten Ebene**
  stehen und direkt zur Einheit springen — sie ist die Abkürzung, die tiefe Navigation
  für den Alltag überflüssig macht.
- **Tiefenbegrenzung?** Beliebig tief, oder Deckel bei z. B. drei Ebenen? Unbegrenzte
  Tiefe ist im Dateisystem leicht angelegt und am Gerät schwer zu bedienen.

**Empfehlung:** Design-Brief Kap. 3.2 bei der Umsetzung explizit korrigieren statt
stillschweigend zu unterlaufen, und die Punkte oben vorher mit der UX-Sicht klären.

---

## Web-Portal: Ordner einsehen und editieren

Das Portal wird dafür ein schlanker **Dateimanager** für `/mnt/hoermond`:

- Ordnerbaum anzeigen, mit Dateien und erkannter Kachel-Zuordnung
- Ordner anlegen, **umbenennen** (E5), löschen
- Dateien zwischen Ordnern verschieben (Drag-and-Drop) und **kopieren** (E4)
- Vorschau, welche Kachel daraus am Gerät entsteht und auf welcher Ebene sie liegt

„Playlist zusammenstellen" ist damit: **Ordner anlegen, Lieder hineinkopieren.**
Kein Playlist-Konzept, keine zusätzliche Tabelle, keine zweite Wahrheit.

**Umbenennen ist nicht bloß ein `rename()`** (E5): Der Ordnername ist zugleich
- der **Kachel-Titel**, den das Kind sieht, und
- der **`media_path`**, an dem der Hörfortschritt hängt.

Das Portal muss beim Umbenennen und Verschieben die `playback_position`-Zeile
mitziehen, sonst verliert das Kind die Stelle. Gilt auch für das Umbenennen eines
**Oberordners** — dann ändern sich die Pfade *aller* darunterliegenden Einheiten
(Präfix-Update, nicht nur eine Zeile).

**Achtung, Moduswechsel:** Legt man in einer Einheit einen Unterordner an, ist sie
schlagartig keine Einheit mehr, sondern ein Navigationsordner — ihre bisherigen Tracks
werden zu Einzelsongs, und ihr Hörfortschritt hängt an einem Pfad, der keine Einheit
mehr bezeichnet. Umgekehrt genauso, wenn der letzte Unterordner verschwindet. Das Portal
sollte diesen Wechsel **vor dem Bestätigen anzeigen**, nicht klaglos ausführen.

---

## Offene Fragen

1. **Migration bestehender Fortschritte.** Heutige `media_path`-Werte für Musik sind
   virtuelle Pfade und passen nach der Umstellung auf nichts mehr. Hörbücher sind
   betroffen, sobald die 3-Segment-Regel fällt. Das Gerät läuft produktiv: v4-Migration,
   die abbildet was abbildbar ist — oder bewusst den Musik-Fortschritt verwerfen
   (bei Liedern verschmerzbar, bei Hörbüchern nicht).
4. **Sortierung innerhalb einer Einheit.** Ohne Tag-Auswertung entscheidet die
   Dateireihenfolge — und `1.mp3 … 10.mp3` sortiert alphabetisch falsch (`10` vor `2`).
   Braucht natürliche Sortierung.
5. **Cover für Ordner-Kacheln.** `cover.jpg` im Ordner (bestehende Logik in
   `list.ts:48` greift bereits), Collage aus den Kindern, oder Upload im Portal?
6. **Doppelte Lieder in „Zuletzt gehört".** Durch E4 kann dasselbe Lied an zwei Orten
   liegen und zwei unabhängige Fortschritte haben. Vermutlich unproblematisch, weil die
   Einheit (der Ordner) zählt, nicht der einzelne Track — aber einmal durchdenken.
7. **Schutz vor Unfällen.** Der Dateimanager kann die Bibliothek zerlegen. Löschen,
   Verschieben und Umbenennen gehören hinter die Eltern-PIN (konsistent mit F5 im
   Upload-Konzept).

---

## Was noch fehlt

Die **Gruppierungsregel** ist umgesetzt (`app/src/main/library/grouping.ts` +
`directory-index.ts`, 20 Tests). Drei Stücke stehen noch aus:

### ~~1. Migration bestehender Fortschritte~~ ✅ erledigt

`library/reconcile-units.ts` gleicht die gespeicherten Fortschritte einmalig beim Start
auf das Ordnermodell ab, bevor fortgesetzt wird. Details unter **MIG-01** in
`known-issues.md`.

### ~~2. Navigation am Gerät (E3)~~ ✅ erledigt

Der Grid zeigt jetzt **eine Ebene** des Baums. Umgesetzt:

- **Ordner-Kacheln** (`components/FolderTile.tsx`) in Ordnerform mit Reiter und der
  Anzahl der Titel darunter — bewusst klar anders als ein quadratisches Cover, damit
  „hier geht es weiter" und „hier spielt etwas" auf einen Blick trennbar sind.
  Ordner stehen vor den Einheiten.
- **Navigationsstack**: `Screen.grid` trägt ein `dir`. Zurück führt eine Ebene hoch, auf
  der Wurzel zum Startscreen. Zurück aus dem Player führt in den Ordner, aus dem
  gestartet wurde — nicht auf die Wurzel.
- **Rettungsanker**: ein sichtbarer **Haus-Knopf** rechts neben Zurück, der erst
  unterhalb der Wurzel erscheint. Bewusst ein sichtbares Element statt einer versteckten
  Geste — für ein Kind, das gerade lesen lernt, ist ein Haus-Symbol ungleich
  auffindbarer als ein langer Druck, den ihm niemand erklärt hat. Der Zurück-Knopf
  behält dadurch seine feste Position oben links (Design-Brief Kap. 3.2).
- **Titel** zeigt auf der Wurzel den Medientyp, darunter den Ordnernamen.
- **„Zuletzt gehört"** bleibt auf der obersten Ebene — die Abkürzung, die tiefe
  Navigation im Alltag überflüssig macht. In einem Unterordner wäre die Sektion
  irreführend, weil sie Einheiten zeigte, die dort nicht liegen. Die Sektion darunter
  heißt dort „Inhalt" statt „Alle".

Der Baum wird im Renderer aus den Unit-Pfaden abgeleitet (`lib/folder-tree.ts`,
17 Tests) — kein zusätzlicher IPC-Aufruf, keine Änderung am Architektur-Grundvertrag.

**Noch offen dazu:** eine Tiefenbegrenzung ist nicht eingebaut (der Baum ist so tief wie
das Dateisystem), und Komponententests fehlen wegen **DEV-02**. Geprüft wurde die
Ableitungslogik als Unit-Test und die Oberfläche visuell am laufenden Gerät.

### 3. Web-Dateimanager (E5)

Anlegen, Umbenennen, Verschieben, Kopieren — kommt mit dem Portal
(`feature-web-upload.md`).
