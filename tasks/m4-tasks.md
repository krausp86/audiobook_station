# M4 — Vollständiger Player + Kapitel (S5/S6): Task-Plan

## Überblick & Abhängigkeitsgraph

M4 baut auf dem in M1–M3 fertiggestellten Fundament auf und liefert **Spec-Phase 3,
Features 5 & 6**: den vollständigen **Player-Screen S5** und die **Kapitelliste S6**.
Am Ende ist demonstrierbar:

- **S5 Player** (800×480, **kein vertikales Scrollen**): Cover ~300px links, rechts
  Titel + aktuelles Kapitel, Fortschrittsbalken mit Kapitelmarkierungen + Seek,
  Steuerelemente (Play/Pause 84px, ⏮ ⏭ ⏪15s ⏩30s, Lautstärke −/+), Live-Zeitanzeige.
- **S6 Kapitelliste**: öffnet via Swipe-Up **und** via Icon (Slide-In 260ms), markiert
  das aktuelle Kapitel, Tap springt dorthin und schließt das Sheet.
- **Drei Kapiteltypen** korrekt navigiert: native M4B-Kapitel (MPD-Chapters), MP3-Ordner
  (Dateien = Kapitel) und CUE-Single-File (Kapitel aus CUE). Kapitellose Medien (E12)
  verhalten sich sinnvoll.
- **Lautstärke** −/+ ändert hörbar (Limit folgt erst M5).
- **Wiedergabe-Status** folgt MPD-Events in Echtzeit (kein Polling).

### Was schon existiert (verifizierter Stand, NICHT neu bauen)
- `player:play` / `player:pause` / `player:stop` / `player:seek` (absolut, `{ position }`)
  / `player:getState` sind im IPC-Vertrag und in `register.ts` vorhanden.
- `player:state`-Event wird vom **idle-Loop** (`app/src/main/mpd/idle.ts`) gepusht; die
  idle-Subskription lauscht bereits auf `player mixer playlist database update` — d. h.
  **Lautstärkeänderungen (`mixer`) lösen schon ein `player:state` aus**.
- `PlayerState` (in `ipc-contract.ts`) = `{ status, currentPath, position, duration }`
  — **enthält noch KEINE Kapitel- und KEINE Volume-Info**. M4 erweitert das additiv.
- Positions-Persistenz alle 10s (`app/src/main/player/persist.ts`), Resume beim Start
  (`app/src/main/player/resume.ts`).
- `playback_position`-Tabelle (`migrations.ts`, version 2): `media_path` (PK),
  `track_index`, `position_seconds`, `last_played`. **Kein Status-Feld** → der
  resume-on-stopped-Bug braucht dafür eine Migration (T4.07).
- MPD-Low-Level-Client `app/src/main/mpd/client.ts`: `send(command): Promise<MpdResponse>`,
  `MpdResponse = Record<string,string>[]`. Steuerung in `app/src/main/mpd/control.ts`.
- Frontend-Navigation in `app/src/renderer/src/Root.tsx`; der **Now-Playing-Platzhalter**
  ist `app/src/renderer/src/components/NowPlayingBar.tsx` (M4 ersetzt ihn durch S5).
- Wiederverwendbar: `<Pressable>`, `<BackButton>`, `<Cover>`, `useLongPress`,
  Theme-Variablen in `theme.css`, Screen-Styles in `screens.css`, i18n via `useT()`.

### Reihenfolge & Arbeitsstränge

```
BUGFIX & GESTE ZUERST (Laptop) — Risiko aus M3-Abnahme abräumen
  T4.00 Bugfix resume-on-stopped (Status persistieren + beim Resume prüfen)
  T4.01 Scroll/Tap-Trennung in Pressable + MediaTile verschärfen

SPIKE ZUERST (Laptop, verpflichtend) — größtes M4-Risiko
  T4.02 Spike Kapitel-Abstraktion (M4B / MP3-Ordner / CUE) + Interface-Entwurf
     │
     ├──────────────────────────────────────────────────────────────┐
     ▼                                                                ▼
BACKEND (Electron-Main, Laptop, Vitest-testbar)            FRONTEND (Renderer, Laptop)
  T4.03 IPC-Vertrag erweitern (Chapter+Volume in            T4.08 de.json: Player-Strings
        PlayerState; player:setVolume; player:chapter:*)     T4.09 ProgressBar-Komponente
     │                                                              (Marker+Drag+Release)
     ├── T4.04 Kapitel-Handler im Main (basierend auf Spike)  T4.10 Steuerelement-Buttons
     │      │                                                       (Play/Pause/Skip/Vol)
     │      └── T4.05 Seek-Commands (relativ ±15/30s, absolut) T4.11 S5 Player-Screen
     │      └── T4.06 Lautstärke-Command (ohne Limit)               (Layout 300+440)
     │                                                        T4.12 S6 Kapitelliste-Sheet
     └── T4.07 Resume verfeinern (Track+Offset Kapitel)             (Swipe-Up + Icon)
                                                              T4.13 Platzhalter-Icons
                                                                    (BT M6 / Mond M7)
INTEGRATION (Laptop)
  (T4.03..T4.13) ── T4.14 Root-Navigation auf S5 umstellen,
                          NowPlayingBar entfernen, typecheck

PI-ABNAHME (auf dem Pi) — Meilenstein-Abnahme am echten Gerät
  T4.14 ── T4.15 Deploy + echtes Touch-/Audio-Verhalten
              ├── T4.16 Kapitel-Verhalten mit echten M4B/MP3-Ordner/CUE-Dateien
              ├── T4.17 Pixel-Layout-Check am echten 800×480-Display
              ├── T4.18 Seek-Präzision + Lautstärke messen
              └── T4.19 Resume nach Stecker-Ziehen mit Kapitel-Medien
```

**Trennung Laptop vs. Pi:**
- **Auf dem Laptop (hardwareunabhängig):** T4.00–T4.14. Voll im Electron-Dev-Fenster
  (fix 800×480) entwickel- und testbar. Backend-Logik mit Vitest. Ein lokaler MPD mit
  Beispieldateien aller drei Kapiteltypen genügt für Spike/Handler-Entwicklung.
- **Auf dem Pi (echte Abnahme):** T4.15–T4.19. **Projektregel: die finale Abnahme jedes
  Meilensteins erfolgt am echten Gerät** — echtes kapazitives Touch-/Seek-Verhalten,
  reale Audio-Lautstärke, pixelgenaues 800×480-Layout und das Resume-Verhalten nach
  Stromverlust lassen sich nur dort verbindlich prüfen.

**Architektur-Grundvertrag (aus M1–M3, hier zwingend einzuhalten):**
- Electron-Main kapselt ALLE privilegierten Operationen (MPD, SQLite, D-Bus); der
  Renderer ist **rein** und hält **keinen** Gerätezustand.
- Kommunikation NUR über die IPC-Bridge (`window.hoermond.invoke` / `.on`); neue
  Channels **ausschließlich additiv** in `ALLOWED_COMMANDS` / `ALLOWED_EVENTS`.
- MPD ist autoritativ für Player-Zustand. **KEIN Polling** — `player:state` ist Push
  über den idle-Loop.
- Alle UI-Strings in `de.json`, key-basiert über `useT()`. **Keine hartcodierten Strings
  im JSX.**
- IPC-Namenskonvention: **Doppelpunkt-Namespacing** (`player:setVolume`, **nicht**
  `player.setVolume`).
- Code/Bezeichner Englisch, UI-Strings Deutsch.

---

## Task-Liste (Übersicht)

| ID | Titel | Größe | Ort |
|----|-------|-------|-----|
| T4.00 | Bugfix resume-on-stopped (Status persistieren + beim Resume prüfen) | M | Laptop |
| T4.01 | Scroll/Tap-Trennung in `Pressable` + `MediaTile` verschärfen | M | Laptop |
| T4.02 | **Spike** Kapitel-Abstraktion (M4B/MP3-Ordner/CUE) + Interface-Entwurf | L | Laptop |
| T4.03 | IPC-Vertrag erweitern (Chapter+Volume in `PlayerState`; neue Commands) | M | Laptop |
| T4.04 | Kapitel-Handler im Main-Prozess (Abstraktion umsetzen) | L | Laptop |
| T4.05 | Seek-Commands (relativ ±15/30s, absolut) | S | Laptop |
| T4.06 | Lautstärke-Command (ohne Limit — Limit erst M5) | S | Laptop |
| T4.07 | Resume verfeinern: Track-Index + Offset für Kapitel-Medien | M | Laptop |
| T4.08 | `de.json` um Player-Strings erweitern | S | Laptop |
| T4.09 | `ProgressBar`-Komponente (Kapitelmarker + Drag-Handle + Seek-on-Release) | L | Laptop |
| T4.10 | Steuerelement-Buttons (Play/Pause 84, Skip/Seek 64, Volume 60) | M | Laptop |
| T4.11 | S5 Player-Screen (Layout 300px Cover + 440px Steuerung, kein Scroll) | L | Laptop |
| T4.12 | S6 Kapitelliste als Swipe-Up-Sheet (+ Icon-Trigger) | L | Laptop |
| T4.13 | Platzhalter-Icons BT (M6) + Mond (M7) in Titelleiste | S | Laptop |
| T4.14 | Root-Navigation auf S5 umstellen + `NowPlayingBar` entfernen + typecheck | M | Laptop |
| T4.15 | Deploy auf Pi + echtes Touch-/Audio-Verhalten | M | Pi |
| T4.16 | Kapitel-Verhalten mit echten M4B/MP3-Ordner/CUE-Dateien testen | L | Pi |
| T4.17 | Pixel-Layout-Check am echten 800×480-Display | M | Pi |
| T4.18 | Seek-Präzision + Lautstärke messen | M | Pi |
| T4.19 | Resume nach Stecker-Ziehen mit Kapitel-Medien | M | Pi |

---

## Designkonstanten (gilt für ALLE Tasks — Referenz, in den Tasks zitiert)

Diese Werte stammen aus dem Design-Brief und sind in den Einzeltasks wörtlich
wiederholt, damit jede Task isoliert umsetzbar ist.

**Canvas:** Feste Auflösung **800×480 px Querformat, KEIN responsives Layout**.
Safe-Area-Außenrand **20 px** rundum. Basis-Spacing **8 px** (Schritte 8/16/24/32).
Titelleiste **44 px** hoch (CSS-Var `--titlebar-h`), links Zurück-Affordanz **64×64 px**.

**S5 Layout (zwingend, kein vertikales Scrollen):**
- **Linke Spalte: Cover ~300×300 px**, vertikal zentriert unter der 44px-Titelleiste.
- **Rechte Spalte ~440 px breit:** oben Titel + aktuelles Kapitel; Mitte
  Fortschrittsbalken mit Kapitelmarkierungen + Zeitangaben; unten Steuerelement-Reihe.
- **Titelleiste:** links Zurück (64×64), rechts BT-Icon-Platz (Platzhalter M6) +
  Mond-Icon-Platz (Platzhalter M7) — **nur visuell, keine Funktion**.

**Tap-Targets (harte Werte):**
- Play/Pause **84×84 px**.
- ⏮ ⏭ ⏪ ⏩ je **64×64 px**.
- Lautstärke − / + je **60×60 px**.
- Mindestabstand zwischen Targets **≥ 16 px**.
- Fortschrittsbalken: Spurhöhe **12 px**, Drag-Handle **40×40 px** Tap-Fläche.

**Seek-Semantik:**
- ⏪ = **exakt 15 s zurück**; ⏩ = **exakt 30 s vor**.
- ⏮ / ⏭ = Kapitel- bzw. Track-Wechsel (bei kapitellosen Medien: ⏮ = Track-Anfang).
- Seek per Drag am Fortschrittsbalken: **springt erst beim Loslassen** (on-release),
  Zeit-Tooltip folgt dem Handle während des Ziehens.

**Farbpalette (CSS-Variablennamen exakt, schon in `theme.css` definiert):**
- `--flieder: #9B7EDC` (Primär/Akzent — **NIEMALS mit weißem Text**, nur 3,3:1).
- `--flieder-deep: #6E54B8` (Primär-Buttons mit weißem Text, **Fortschrittsbalken-Fill**).
- `--flieder-tint: #F2EDFB` (Flächen/Hintergründe).
- `--bg-app: #FBFAFE` (App-Hintergrund).
- `--surface: #FFFFFF` (Karten/Sheets).
- `--text-primary: #2A2342`; `--text-secondary: #6B6480` (Zeitangaben).
- `--text-on-deep: #FFFFFF`; `--scrim: rgba(42,35,66,0.55)` (hinter S6-Sheet).

**Typografie:** Font `"Atkinson Hyperlegible"` (offline gebündelt). Größen:
Heading 24px/30px Bold 700 (Titel); Label 20px/26px Semibold 600 (Kapitelname,
Kapitellisten-Einträge); Body 18px/26px Regular 400 (Untergrenze 18px); Tiny
15px/20px Medium 500 (Zeitangaben). Linksbündig.

**Timings (exakt, zwingend; teils schon als CSS-Var in `theme.css`):**
- Press-Feedback: **90 ms ease-out** rein, **120 ms ease-in** zurück, **Scale 0,96**
  (`--t-press-in` / `--t-press-out`).
- Sheet (S6) **ein: 260 ms ease-out**; **aus: 200 ms ease-in**.
- Overlay **ein: 220 ms** Fade+Scale; **aus: 160 ms** Fade.
- Globale Standard-Transition: **200 ms cubic-bezier(0.4,0,0.2,1)** (`--t-base`).
- **Kein Cursor, keine Hover-Zustände** (Kiosk). Kein Doppeltap, keine Multitouch-Gesten
  außer dem für S6 expliziten vertikalen Swipe-Up.

---

## Tasks (Detail)

### T4.00 — Bugfix resume-on-stopped (Status persistieren + beim Resume prüfen)
**Größe:** M
**Abhängigkeiten:** keine
**Vorbedingung:** App baut; `app/src/main/player/resume.ts`, `persist.ts`,
`db/dao.ts`, `db/migrations.ts` existieren (verifiziert).

**Ziel:** Beim App-Neustart darf **kein** automatisches Resume erfolgen, wenn der zuletzt
gespeicherte Playback-Zustand **`stopped`** war. Heute ruft `resumeLast()` immer `play()`
mit der letzten Position auf — egal ob das Kind zuletzt aktiv gestoppt hatte. Ursache:
Der gespeicherte Zustand kennt **kein Status-Feld**. Die Tabelle `playback_position` hat
nur `media_path, track_index, position_seconds, last_played`.

**Beschreibung (Schritt für Schritt):**
1. **Migration (version 3)** in `app/src/main/db/migrations.ts` hinzufügen — additiv, die
   bestehenden Migrationen NICHT verändern:
   ```ts
   {
     version: 3,
     up: (db) => {
       db.exec(`ALTER TABLE playback_position
                ADD COLUMN last_status TEXT NOT NULL DEFAULT 'paused'
                CHECK (last_status IN ('playing','paused','stopped'));`);
     },
   },
   ```
   > Default `'paused'` (nicht `'stopped'`): Bestandsdaten aus M2/M3 sollen weiter
   > resumebar sein; nur ein **explizites** Stop markiert `stopped`.
2. **DAO erweitern** (`app/src/main/db/dao.ts`):
   - `PositionRow`-Interface um `last_status: 'playing' | 'paused' | 'stopped'` ergänzen.
   - `upsertPosition()` um einen Parameter `status` erweitern und in INSERT + ON CONFLICT
     mitschreiben. **Achtung:** `upsertPosition` wird auch aus `persist.ts` und aus
     `register.ts` (`library:restartFromBeginning`) aufgerufen — beide Call-Sites
     anpassen (restartFromBeginning schreibt `'playing'`).
3. **Persist anpassen** (`app/src/main/player/persist.ts`): in `saveNowInternal()` den
   tatsächlichen `st.status` an `upsertPosition` durchreichen (während des Spielens also
   `'playing'`).
4. **Stop-/Pause-Handler** (`app/src/main/ipc/register.ts`): `player:stop` muss nach dem
   `saveNow()` den Status auf `'stopped'` setzen, `player:pause` auf `'paused'`. Da
   `saveNow()` nur bei `status==='playing'` schreibt, wird der finale Status sonst nie
   `stopped`. Lösung: nach `stop()` bzw. `pause()` den zuletzt aktiven `media_path`
   gezielt auf den neuen Status setzen. Konkret eine DAO-Funktion
   `setLastStatus(db, mediaPath, status)` ergänzen und im Handler aufrufen (den
   `media_path` aus `getLatestPosition(db)` ziehen, falls vorhanden).
5. **resume.ts härten:** vor `play(...)` prüfen:
   ```ts
   const last = getLatestPosition(db);
   if (!last) return;
   if (last.last_status === 'stopped') return; // <-- Fix: kein Auto-Resume nach Stop
   await play(last.media_path, last.position_seconds);
   ```

**Caveats:**
- `ALTER TABLE ADD COLUMN` mit `NOT NULL` braucht ein `DEFAULT` (SQLite-Regel) — hier
  erfüllt.
- Migrationsreihenfolge: Der Migrations-Runner (siehe `db/index.ts`) wendet Versionen
  aufsteigend an. Version 3 NUR anhängen, nie bestehende `up()` editieren.
- `saveNow()` schreibt nichts, wenn bereits gestoppt (Guard `status!=='playing'`) — daher
  ist Schritt 4 (separates `setLastStatus`) nötig, sonst bleibt der Status `'playing'`.

**Dateien/Artefakte:**
- geändert: `app/src/main/db/migrations.ts`, `app/src/main/db/dao.ts`,
  `app/src/main/player/persist.ts`, `app/src/main/player/resume.ts`,
  `app/src/main/ipc/register.ts`.
- ggf. neue Vitest: `app/src/main/player/resume.test.ts` (mit In-Memory-SQLite).

**Akzeptanzkriterien:**
- [ ] Migration version 3 legt Spalte `last_status` an; bestehende DB migriert ohne Fehler.
- [ ] Nach `player:stop` und App-Neustart startet **kein** Auto-Resume.
- [ ] Nach `player:pause` (oder regulärem 10s-Save während Wiedergabe) und App-Neustart
      **startet** das Resume an der gespeicherten Position.
- [ ] `npm run typecheck` (oder `tsc --noEmit`) fehlerfrei; alle `upsertPosition`-
      Call-Sites kompilieren mit dem neuen Parameter.

---

### T4.01 — Scroll/Tap-Trennung in `Pressable` + `MediaTile` verschärfen
**Größe:** M
**Abhängigkeiten:** keine
**Vorbedingung:** `app/src/renderer/src/components/Pressable.tsx`,
`MediaTile.tsx`, `hooks/useLongPress.ts` existieren (verifiziert).

**Ziel:** Beim Scrollen durch das Grid dürfen **keine** Songs versehentlich starten
(Beobachtung aus M3-Pi-Abnahme). Ein Tap darf nur dann als Playback-Start gewertet
werden, wenn **keine** nennenswerte Zeigerbewegung stattfand.

**Hintergrund (heutiger Stand):** `useLongPress` trennt Tap/Long-Press bereits über eine
`MOVE_THRESHOLD_PX = 8`-Schwelle und setzt bei Überschreitung `firedRef=true`, sodass
`onTap` unterdrückt wird. **Aber `Pressable` selbst ruft `onTap` zusätzlich und
unabhängig in `onPointerUp` auf** — und `MediaTile` übergibt KEIN `onTap` an `Pressable`,
sondern verdrahtet alles über die Hook-Handler. Der eigentliche Tap-Pfad bei Kacheln
läuft also über `useLongPress.onTap`. Das Problem ist die zu kleine Bewegungsschwelle
(8 px) für kapazitives Touch beim kinetischen Scrollen.

**Beschreibung:**
1. In `app/src/renderer/src/hooks/useLongPress.ts` die Bewegungsschwelle erhöhen und als
   benannte Konstante dokumentieren:
   ```ts
   const MOVE_THRESHOLD_PX = 14; // war 8 — höher, weil kapazitives Scrollen leicht wandert
   ```
   Optional zusätzlich eine **Zeit-Achtsamkeit**: wenn zwischen Down und Up eine
   Bewegung > Schwelle in **irgendeinem** Move-Event auftrat, bleibt `firedRef=true`
   (ist bereits so implementiert — verifizieren, nicht doppeln).
2. In `Pressable.tsx` denselben Schutz für den **direkten** `onTap`-Pfad einbauen (für
   alle anderen Verwender wie Buttons im S5, die `onTap` direkt nutzen):
   - In `onPointerDown` Startkoordinaten merken (`useRef`).
   - In `onPointerUp` die Distanz zum Start berechnen; wenn `> 14px`, `onTap` **nicht**
     auslösen (nur `setPressed(false)` und `onPointerUp?.(e)`).
   ```ts
   const startRef = useRef<{ x: number; y: number } | null>(null);
   // onPointerDown: startRef.current = { x: e.clientX, y: e.clientY };
   // onPointerUp:
   //   const s = startRef.current;
   //   const moved = s && Math.hypot(e.clientX - s.x, e.clientY - s.y) > 14;
   //   setPressed(false); onPointerUp?.(e); if (!moved) onTap?.();
   ```
3. Sicherstellen, dass `MediaTile` weiterhin **nur** die Hook-Handler nutzt und kein
   doppeltes `onTap` an `Pressable` durchreicht (Doppelauslösung vermeiden).

**Caveats:**
- Schwelle nicht zu hoch wählen (sonst werden echte Taps von zappeligen Kinderfingern
  geschluckt). 14 px ist ein guter Startwert; finale Kalibrierung erfolgt am echten
  Touch in T4.15.
- `Math.hypot` ist ausreichend; bei Performance-Bedenken Quadrat-Vergleich nutzen
  (wie im Hook: `dx*dx+dy*dy > T*T`).
- `pointercancel` (z. B. wenn das OS das Scrollen übernimmt) muss `onTap` zuverlässig
  unterdrücken — `onPointerCancel` setzt `pressed=false`, ruft aber kein `onTap`: gut so.

**Dateien/Artefakte:**
- geändert: `app/src/renderer/src/hooks/useLongPress.ts`,
  `app/src/renderer/src/components/Pressable.tsx`.

**Akzeptanzkriterien:**
- [ ] Im Dev-Fenster: schnelles vertikales Ziehen über eine Kachel startet **keine**
      Wiedergabe und öffnet **kein** S4.
- [ ] Ein sauberer Tap (ohne Bewegung) startet weiterhin zuverlässig.
- [ ] Long-Press (600 ms ohne Bewegung) öffnet weiterhin S4.
- [ ] Buttons im S5, die `Pressable.onTap` direkt nutzen, lösen bei einem Drag-darüber
      **nicht** aus.

---

### T4.02 — Spike: Kapitel-Abstraktion (M4B / MP3-Ordner / CUE) + Interface-Entwurf
**Größe:** L
**Abhängigkeiten:** keine (kann parallel zu T4.00/T4.01 laufen)
**Vorbedingung:** Lokaler MPD läuft mit Beispieldateien **aller drei Typen** in der
Library; `app/src/main/mpd/client.ts` (`send`) und `control.ts` verfügbar.

**Ziel (verpflichtender Spike — laut milestones.md größtes M4-Risiko):** Verbindlich
feststellen, **welche Kapitel-Daten MPD pro Typ liefert** und **ob clientseitiges
Offset-Seeking nötig ist**, BEVOR der Handler (T4.04) gebaut wird. Ergebnis ist ein
dokumentierter Befund **und** ein abgestimmtes `Chapter`-Interface. Es wird hier noch
**kein** Produktivcode verdrahtet — nur ein Wegwerf-Probeskript + der Interface-Entwurf.

**Die drei Typen (Definition):**
- **M4B (native Kapitel):** eine einzelne `.m4b`-Datei mit eingebetteten Kapitelmarken.
  Offene Frage: Liefert die genutzte MPD-Version Kapitelgrenzen (z. B. via `readcomments`
  oder als eigene Songs)? Falls **nicht**, müssen Kapitel als **Zeit-Offsets innerhalb
  einer Datei** modelliert werden → Navigation = `seekcur <offset>` (clientseitig).
- **MP3-Ordner:** ein Verzeichnis mit mehreren `.mp3`-Dateien. Jede Datei = ein Kapitel,
  Reihenfolge nach Track-Nummer/Dateiname. Navigation = MPD-**Playlist-Positionen**
  (`play <pos>` / `next` / `previous`).
- **CUE-Single-File:** eine große Audiodatei + `.cue` mit `TRACK`/`INDEX`-Einträgen. MPD
  kann CUE-Sheets als virtuelle Tracks auflösen — verifizieren, ob das hier passiert oder
  ob die CUE clientseitig geparst werden muss.

**Beschreibung (Untersuchung):**
1. Wegwerf-Skript `app/scripts/spike-chapters.ts` (oder ein Vitest mit `describe.skip`),
   das gegen den lokalen MPD je ein Beispiel pro Typ folgende Kommandos absetzt und die
   rohe Antwort (`MpdResponse`) protokolliert:
   - `lsinfo "<pfad>"` und `listallinfo "<pfad>"` — zeigt, ob MPD den MP3-Ordner als
     mehrere Songs / das CUE als virtuelle Tracks auflöst.
   - `addid "<m4b-pfad>"` + `playlistinfo` — zeigt, ob die M4B als **ein** Song mit einer
     `Time`/`duration` erscheint (dann sind Kapitel datei-intern, Offset-Seeking nötig).
   - `readcomments "<m4b-pfad>"` — prüfen, ob Kapitel-Metadaten (CHAPTER*/TIMEBASE) im
     Comment-Block stehen.
   - Für CUE: `playlistinfo` nach `addid` — erscheinen mehrere Einträge mit `Range`/
     `Time`-Feldern?
2. Für M4B zusätzlich klären, ob die **Datei-internen** Kapitel überhaupt aus MPD lesbar
   sind. Falls MPD keine Kapitel liefert: dokumentieren, dass die Kapitelzeiten aus dem
   Container gelesen werden müssen (z. B. via `ffprobe -show_chapters` als Main-seitiger
   Fallback). **Entscheidung im Spike-Ergebnis festhalten** (Main darf `ffprobe`
   aufrufen, da privilegierte Op — passt zum Grundvertrag; Renderer nie).
3. **`Chapter`-Interface entwerfen**, das alle drei Typen einheitlich abbildet (Vorschlag,
   im Spike final abstimmen):
   ```ts
   export interface Chapter {
     index: number;          // 0-basiert, in Abspielreihenfolge
     title: string;          // Anzeigename (Dateiname / CUE-TITLE / "Kapitel N")
     startSeconds: number;   // Start relativ zum GESAMTEN Medium (kumuliert)
     durationSeconds: number;// Länge des Kapitels
     // Navigationsstrategie pro Typ:
     navKind: 'playlistPos' | 'seekOffset';
     playlistPos?: number;   // bei 'playlistPos': MPD-Songid/Position
     seekFile?: string;      // bei 'seekOffset': Dateipfad (eine Datei, intern seeken)
     fileOffsetSeconds?: number; // bei 'seekOffset': Offset in der Datei
   }
   ```
   - **MP3-Ordner** → `navKind:'playlistPos'`.
   - **M4B (datei-intern)** oder **CUE-Single-File** → `navKind:'seekOffset'`.
   - **Kapitelloses Medium** → leeres Chapter-Array (E12).

**Caveats:**
- MPD-Version auf dem Pi und auf dem Laptop sollten gleich sein — sonst kann der Befund
  abweichen. MPD-Version in beiden Umgebungen notieren.
- `addid`/`addtagid` vs. `add` beachten: für definierte Positions-Navigation sind
  Song-IDs zuverlässiger als Indizes.
- Dieser Spike darf den `add → play`-Ablauf aus `control.ts` (Music-Sonderpfad via
  `findadd albumartist/album`) NICHT brechen — nur lesen/probieren.

**Dateien/Artefakte:**
- neu (Wegwerf): `app/scripts/spike-chapters.ts`.
- neu (Entwurf, wird in T4.03 final): `app/src/shared/chapter.ts` mit `Chapter`-Interface.
- **Befund als Kommentarblock** oben in `chapter.ts` festhalten (welcher Typ → welche
  navKind, ob `ffprobe` nötig). **Keine separate `.md`-Datei.**

**Akzeptanzkriterien:**
- [ ] Für alle drei Beispieltypen ist dokumentiert, was MPD liefert (rohe Felder).
- [ ] Entscheidung pro Typ steht fest: `playlistPos` vs. `seekOffset`, und ob `ffprobe`
      (oder ein anderer Parser) für M4B/CUE im Main nötig ist.
- [ ] `Chapter`-Interface in `app/src/shared/chapter.ts` deckt alle drei Typen + den
      kapitellosen Fall ab.
- [ ] Spike-Skript ist als Wegwerf gekennzeichnet (Kommentar) und nicht im Produktionspfad
      verdrahtet.

---

### T4.03 — IPC-Vertrag erweitern (Chapter + Volume in `PlayerState`; neue Commands)
**Größe:** M
**Abhängigkeiten:** T4.02 (Interface-Entwurf)
**Vorbedingung:** `app/src/shared/ipc-contract.ts` und `app/src/shared/chapter.ts`
existieren.

**Ziel:** Den IPC-Vertrag **rein additiv** erweitern: `PlayerState` bekommt Kapitel- und
Lautstärke-Info; neue Commands für Lautstärke und Kapitelnavigation; relativer Seek. Alle
neuen Channels in die Whitelists eintragen. Das `player:seek` (absolut) bleibt unverändert.

**Beschreibung:**
1. In `app/src/shared/ipc-contract.ts` `Chapter` importieren/re-exportieren und
   `PlayerState` additiv erweitern:
   ```ts
   import type { Chapter } from './chapter';

   export interface PlayerState {
     status: 'playing' | 'paused' | 'stopped';
     currentPath: string | null;
     position: number;           // Sekunden, relativ zum GESAMTEN Medium
     duration: number | null;    // Sekunden gesamt
     volume: number | null;      // 0..100 (null wenn MPD keine Mixer-Info hat)
     chapters: Chapter[];        // leer bei kapitellosen Medien (E12)
     currentChapterIndex: number | null; // null wenn keine Kapitel
   }
   ```
   > **Wichtig:** Default-Felder dürfen bestehende Consumer (NowPlayingBar bis T4.14)
   > nicht brechen — neue Felder sind nur Ergänzungen.
2. Neue Commands in `IpcCommands` ergänzen:
   ```ts
   'player:seekRelative': { request: { deltaSeconds: number }; response: { ok: boolean } };
   'player:setVolume':    { request: { volume: number }; response: { ok: boolean } };
   'player:chapterNext':  { request: void; response: { ok: boolean } };
   'player:chapterPrev':  { request: void; response: { ok: boolean } };
   'player:chapterGoto':  { request: { index: number }; response: { ok: boolean } };
   ```
   > `player:seek` (absolut, `{ position }`) existiert bereits und bleibt. `seekRelative`
   > deckt ⏪−15 / ⏩+30 ab (Renderer übergibt `deltaSeconds: -15` bzw. `+30`).
3. Beide Whitelists ergänzen (`ALLOWED_COMMANDS` um die fünf neuen Commands). `PlayerState`
   ist ein Event-Payload, kein neuer Channel — `player:state` bleibt in `ALLOWED_EVENTS`.
   `player:state` darf **nicht** in `REPLAYABLE_EVENTS` (High-Frequency — bewusst nur
   Pull via `player:getState` beim Mount; siehe Architect-Note in der Datei).
4. Preload (`app/src/preload/index.ts`) und `index.d.ts` prüfen: Falls dort eine explizite
   Channel-Liste dupliziert wird, ist die Quelle die Whitelist aus `ipc-contract.ts` —
   keine zweite Liste pflegen. (Verifizieren, dass der Preload generisch über die
   Whitelist arbeitet.)

**Caveats:**
- Namenskonvention **Doppelpunkt** strikt einhalten.
- Keine bestehenden Felder umbenennen/entfernen — sonst bricht der Renderer.
- `volume: null` zulassen, weil MPD `getvol`/`status.volume` `-1` liefern kann, wenn kein
  Mixer aktiv ist (auf dem Pi via ALSA i. d. R. vorhanden).

**Dateien/Artefakte:**
- geändert: `app/src/shared/ipc-contract.ts`.
- ggf. geprüft: `app/src/preload/index.ts`, `app/src/preload/index.d.ts`.

**Akzeptanzkriterien:**
- [ ] `PlayerState` enthält `volume`, `chapters`, `currentChapterIndex` (additiv).
- [ ] Fünf neue Commands sind typisiert und in `ALLOWED_COMMANDS`.
- [ ] `npm run typecheck` fehlerfrei; bestehende Consumer (NowPlayingBar) kompilieren
      weiter.

---

### T4.04 — Kapitel-Handler im Main-Prozess (Abstraktion umsetzen)
**Größe:** L
**Abhängigkeiten:** T4.02 (Befund + Interface), T4.03 (Contract)
**Vorbedingung:** `app/src/main/mpd/control.ts`, `client.ts`, `app/src/shared/chapter.ts`.

**Ziel:** Eine Main-seitige Funktion, die für das **aktuell geladene Medium** die
Kapitelliste (`Chapter[]`) und den aktuellen Kapitelindex ermittelt, und Funktionen zur
Kapitelnavigation (next/prev/goto) — gemäß dem im Spike festgelegten Strategie-Schema
(`navKind: 'playlistPos' | 'seekOffset'`). Wird in `getState()` (für `player:state`) und
von den Chapter-Commands genutzt.

**Beschreibung:**
1. Neue Datei `app/src/main/mpd/chapters.ts`:
   - `async function getChapters(currentPath, mpd): Promise<Chapter[]>` — ermittelt anhand
     des Medien-Typs die Kapitel:
     - **MP3-Ordner (`navKind:'playlistPos'`):** aus `playlistinfo` die geladenen Songs
       lesen; jeder Song = ein Kapitel; `startSeconds` kumuliert aus den `Time`-Werten,
       `playlistPos` = `Pos`/`Id`-Feld, `title` aus `Title`/Dateiname.
     - **M4B/CUE (`navKind:'seekOffset'`):** Kapitelzeiten gemäß Spike-Befund — entweder
       aus MPD (falls verfügbar) oder per `ffprobe -show_chapters -print_format json
       "<absoluter Pfad>"` im Main (privilegierte Op erlaubt). `startSeconds`/`durationSeconds`
       aus den Chapter-Marken; `seekFile` = die eine Datei; `fileOffsetSeconds` = Start.
     - **Kapitellos (E12):** leeres Array.
   - `function chapterIndexForPosition(chapters, positionSeconds): number | null` —
     bestimmt das aktuelle Kapitel anhand der kumulierten Startzeiten.
2. Navigation in `app/src/main/mpd/control.ts` (oder `chapters.ts`) ergänzen:
   - `chapterGoto(index)`:
     - `playlistPos` → `mpd.send('play <playlistPos>')`.
     - `seekOffset` → sicherstellen, dass die richtige Datei geladen ist, dann
       `mpd.send('seekcur <fileOffsetSeconds>')`.
   - `chapterNext()` / `chapterPrev()`:
     - Aktuellen Index über `chapterIndexForPosition` bestimmen; `goto(index±1)` mit
       Clamping (0..len-1). **Kapitellos (E12):** ⏭ = nächster Track falls vorhanden,
       sonst no-op; ⏮ = **Track-Anfang** (`seekcur 0`) — niemals leeres Verhalten.
3. `getState()` in `app/src/main/mpd/control.ts` erweitern, sodass `PlayerState` jetzt
   auch `volume`, `chapters`, `currentChapterIndex` füllt:
   - `volume`: aus `status.volume` (MPD liefert `-1` → auf `null` mappen, sonst Zahl 0..100).
   - `chapters`: über `getChapters(currentPath, mpd)` (siehe Performance-Caveat).
   - `currentChapterIndex`: über `chapterIndexForPosition(chapters, position)`.

**Caveats — Performance (wichtig, kein Polling-Verstoß):**
- `getState()` wird vom **idle-Loop bei jeder Änderung** und beim Mount aufgerufen.
  `getChapters()` ist potenziell teuer (ffprobe!). **Kapitel NICHT bei jedem `getState`
  neu berechnen.** Lösung: einen Main-seitigen **Cache** halten, der nur neu berechnet,
  wenn sich `currentPath` (bzw. die geladene Playlist) **ändert** (`playlist`-Event aus
  dem idle-Loop signalisiert das). `position`/`status`/`volume` dagegen bei jedem
  `getState` frisch.
- ffprobe-Aufrufe nur einmal pro geladenem Medium; Pfad muss der **absolute** Dateipfad
  unter dem Media-Root sein (relativer MPD-Pfad → absoluter Dateisystempfad auflösen).
- Sicherheit: ffprobe-Argument als Array übergeben (kein Shell-Interpolieren von
  Pfaden), um Command-Injection über Dateinamen zu verhindern.
- Bei `seekOffset`-Medien ist die „Track“-Nummer in MPD immer 0 — Navigation läuft rein
  über `seekcur`. Sicherstellen, dass `play` die Datei geladen lässt.

**Dateien/Artefakte:**
- neu: `app/src/main/mpd/chapters.ts`.
- geändert: `app/src/main/mpd/control.ts` (getState + Navigation), ggf. `index.ts`/
  `idle.ts` (Cache-Invalidierung bei `playlist`-Change).
- neu: `app/src/main/mpd/chapters.test.ts` (Vitest: `chapterIndexForPosition` + Parsing
  von Beispiel-`playlistinfo`/ffprobe-JSON-Fixtures).

**Akzeptanzkriterien:**
- [ ] `getChapters` liefert für MP3-Ordner Kapitel mit korrekter Reihenfolge + kumulierten
      Startzeiten.
- [ ] `getChapters` liefert für M4B und CUE Kapitel gemäß Spike-Strategie (seekOffset).
- [ ] Kapitelloses Medium → leeres Array, kein Fehler.
- [ ] `chapterIndexForPosition` ist per Vitest mit Beispieldaten verifiziert
      (Grenzfälle: erstes/letztes Kapitel, exakte Grenze).
- [ ] Kapitel werden gecacht (nicht bei jedem `getState` neu via ffprobe berechnet).

---

### T4.05 — Seek-Commands (relativ ±15/30s, absolut)
**Größe:** S
**Abhängigkeiten:** T4.03 (Contract: `player:seekRelative`)
**Vorbedingung:** `player:seek` (absolut) existiert bereits in `register.ts`/`control.ts`.

**Ziel:** ⏪ springt **exakt 15 s zurück**, ⏩ **exakt 30 s vor**. Absoluter Seek (für den
Fortschrittsbalken-Drag) existiert schon — hier kommt der **relative** Seek dazu.

**Beschreibung:**
1. In `app/src/main/mpd/control.ts` `seekRelative(deltaSeconds)` ergänzen:
   - aktuellen `elapsed` aus `status` lesen (wie in `getState`), Ziel = `elapsed + delta`,
     auf `[0, duration]` clampen, dann `mpd.send('seekcur <ziel>')`.
   - Alternativ MPDs `seekcur +30` / `seekcur -15` (relative Syntax) nutzen — **aber**
     dann selbst auf 0 clampen, da MPD bei Unterlauf einen ACK-Fehler liefern kann.
     Bevorzugt die explizite Variante (elapsed lesen + clampen) für robustes Verhalten an
     den Rändern.
2. Handler in `app/src/main/ipc/register.ts`:
   ```ts
   ipcMain.handle('player:seekRelative', async (_e, p: { deltaSeconds: number }) => {
     await seekRelative(p.deltaSeconds);
     return { ok: true };
   });
   ```

**Caveats:**
- Am **Kapitelübergang** beim relativen Seek über eine Dateigrenze hinweg (MP3-Ordner =
  mehrere Dateien): MPDs `seekcur` arbeitet innerhalb des aktuellen Songs. Wenn −15 s über
  den Song-Anfang hinausgeht, muss ggf. in den vorherigen Song gewechselt werden. Für M4
  **akzeptabel: auf Song-Anfang clampen** (kein automatischer Vorgänger-Sprung), das ist
  in milestones.md nicht gefordert. Verhalten als Notiz dokumentieren.
- Bei `seekOffset`-Medien (eine Datei) gibt es keine Dateigrenze → reines `seekcur`.

**Dateien/Artefakte:**
- geändert: `app/src/main/mpd/control.ts`, `app/src/main/ipc/register.ts`.

**Akzeptanzkriterien:**
- [ ] `player:seekRelative {deltaSeconds:-15}` springt 15 s zurück (am Anfang clamped auf 0).
- [ ] `player:seekRelative {deltaSeconds:30}` springt 30 s vor (am Ende clamped auf Dauer).
- [ ] `player:seek {position}` (absolut) funktioniert unverändert.

---

### T4.06 — Lautstärke-Command (ohne Limit — Limit erst M5)
**Größe:** S
**Abhängigkeiten:** T4.03 (Contract: `player:setVolume`)
**Vorbedingung:** MPD-Mixer aktiv (auf dem Pi ALSA).

**Ziel:** Lautstärke −/+ ändert **hörbar** die Lautstärke. **KEIN Limit, keine PIN, keine
Eltern-Logik** — das ist explizit M5-Scope und darf hier nicht eingebaut werden.

**Beschreibung:**
1. In `app/src/main/mpd/control.ts` `setVolume(volume)` ergänzen:
   - `volume` auf `[0, 100]` clampen (reiner Wertebereich-Schutz, **kein** Eltern-Limit),
     dann `mpd.send('setvol <volume>')`.
2. Handler in `register.ts`:
   ```ts
   ipcMain.handle('player:setVolume', async (_e, p: { volume: number }) => {
     await setVolume(p.volume);
     return { ok: true };
   });
   ```
3. Der Renderer berechnet die neue Lautstärke (z. B. aktueller `state.volume ± 5`) und
   ruft `player:setVolume`. Die Änderung kommt über das `mixer`-Signal des idle-Loops als
   `player:state` zurück (kein manuelles Refresh nötig).

**Caveats:**
- **Bewusst KEINE** Begrenzung der Maximallautstärke hier — das ist M5. Nur Wertebereich
  0..100.
- Schrittweite (z. B. ±5) ist eine Renderer-Entscheidung (T4.10); der Command nimmt einen
  absoluten Zielwert.
- Wenn MPD keinen Mixer hat (`volume: -1`), schlägt `setvol` fehl → Fehler abfangen,
  nicht crashen. Auf dem Laptop ggf. kein hörbarer Effekt — finale Prüfung auf dem Pi
  (T4.18).

**Dateien/Artefakte:**
- geändert: `app/src/main/mpd/control.ts`, `app/src/main/ipc/register.ts`.

**Akzeptanzkriterien:**
- [ ] `player:setVolume {volume:N}` setzt die MPD-Lautstärke auf N (0..100).
- [ ] Nach dem Setzen liefert `player:state.volume` den neuen Wert (via `mixer`-Push).
- [ ] Kein Limit/keine PIN im Code (M5-Abgrenzung eingehalten).

---

### T4.07 — Resume verfeinern: Track-Index + Offset für Kapitel-Medien
**Größe:** M
**Abhängigkeiten:** T4.00 (Status-Persistenz), T4.04 (Kapitel-Handler)
**Vorbedingung:** `playback_position` hat `track_index` + `position_seconds`;
`saveNow`/`resumeLast` existieren.

**Ziel:** Resume stellt bei Kapitel-Medien nicht nur die Sekundenposition, sondern auch
den richtigen **Track/Kapitel-Kontext** wieder her. Heute speichert `persist.ts`
`track_index` hart als `0` und resumed nur über `seekcur position`.

**Beschreibung:**
1. **Persist** (`app/src/main/player/persist.ts`): in `saveNowInternal()` den aktuellen
   Track-/Playlist-Index aus MPD lesen (`status.song`) und statt der hartcodierten `0`
   an `upsertPosition(db, unitPath, trackIndex, st.position, st.status)` übergeben.
   - Für `seekOffset`-Medien (eine Datei) bleibt der Index 0; die `position_seconds` ist
     bereits die Gesamtposition.
2. **Resume** (`app/src/main/player/resume.ts`): nach dem `last_status`-Check (aus T4.00)
   `play(media_path, position_seconds)` aufrufen. `play()` lädt für MP3-Ordner die ganze
   Playlist — für die Track-genaue Wiederherstellung bei MP3-Ordnern muss nach dem Laden
   der richtige Playlist-Song angesprungen werden:
   - Wenn `track_index > 0`: nach `add`/`play` `mpd.send('play <track_index>')`, dann
     `seekcur <restliche Sekunden im Track>`. Da `position_seconds` bisher die Position
     **im aktuellen Track** ist (so schreibt es persist heute), passt das zusammen —
     **im Spike/T4.04 verbindlich festlegen**, ob `position_seconds` track-relativ oder
     medium-global gespeichert wird, und beide Seiten konsistent halten.
   > **Entscheidung dokumentieren** (Kommentar in `persist.ts`): `position_seconds` ist
   > **track-relativ**; `track_index` zeigt den Playlist-Song. Das ist die einfachere und
   > robustere Variante für MP3-Ordner.
3. `play()` in `control.ts` ggf. um einen optionalen `trackIndex`-Parameter erweitern
   (additiv), damit Resume sauber den richtigen Song lädt, ohne Logik zu duplizieren.

**Caveats:**
- Konsistenz zwischen `getState().position` (medium-global in `PlayerState` laut T4.03)
  und `playback_position.position_seconds` (track-relativ) klar trennen — sonst springt
  Resume falsch. Die UI zeigt global, die DB speichert track-relativ + Index.
- Race beim Start: Resume läuft in `index.ts` **nach** Start des idle-Loops; das bleibt so.
- Wenn die gespeicherte Datei nicht mehr existiert (Library hat sich geändert): `play()`
  fängt den Fehler bereits ab (`resume.ts` loggt) — kein Crash.

**Dateien/Artefakte:**
- geändert: `app/src/main/player/persist.ts`, `app/src/main/player/resume.ts`,
  ggf. `app/src/main/mpd/control.ts`.

**Akzeptanzkriterien:**
- [ ] Bei einem MP3-Ordner: Resume landet im richtigen Kapitel (Track) an der richtigen
      Sekundenposition.
- [ ] Bei M4B/CUE (seekOffset): Resume landet an der richtigen Gesamtposition.
- [ ] `position_seconds`/`track_index`-Semantik ist im Code dokumentiert und beidseitig
      konsistent.
- [ ] resume-on-stopped-Verhalten aus T4.00 bleibt erhalten (kein Resume nach Stop).

---

### T4.08 — `de.json` um Player-Strings erweitern
**Größe:** S
**Abhängigkeiten:** keine
**Vorbedingung:** `app/src/renderer/src/i18n/de.json` existiert; `useT()`-Mechanismus.

**Ziel:** Alle neuen Player-/Kapitel-UI-Strings sind key-basiert in `de.json`. **Keine
hartcodierten Strings im JSX** (Projektregel).

**Beschreibung:** Folgende Keys additiv ergänzen (bestehende nicht ändern). Werte Deutsch,
Keys Englisch:
```json
"player.play": "Abspielen",
"player.pauseAction": "Pause",
"player.prevChapter": "Vorheriges Kapitel",
"player.nextChapter": "Nächstes Kapitel",
"player.back15": "15 Sekunden zurück",
"player.forward30": "30 Sekunden vor",
"player.volumeDown": "Leiser",
"player.volumeUp": "Lauter",
"player.chapter": "Kapitel",
"player.noChapters": "Keine Kapitel",
"player.openChapters": "Kapitel anzeigen",
"player.currentChapter": "Aktuelles Kapitel",
"chapters.title": "Kapitel",
"chapters.close": "Schließen"
```
> Hinweis: `player.pause`/`player.stop`/`player.playing`/`player.paused`/`player.stopped`
> existieren bereits (werden vom NowPlayingBar bis T4.14 genutzt). Nicht doppeln.

**Caveats:**
- Gültiges JSON (Kommata!).
- Aria-Labels der Steuer-Buttons (für Screenreader/Tests) stammen aus diesen Keys.

**Dateien/Artefakte:**
- geändert: `app/src/renderer/src/i18n/de.json`.

**Akzeptanzkriterien:**
- [ ] Alle oben genannten Keys vorhanden, JSON valide.
- [ ] Kein doppelter Key gegenüber dem Bestand.

---

### T4.09 — `ProgressBar`-Komponente (Kapitelmarker + Drag-Handle + Seek-on-Release)
**Größe:** L
**Abhängigkeiten:** T4.03 (PlayerState mit chapters), T4.08 (Strings)
**Vorbedingung:** `theme.css`-Variablen vorhanden.

**Ziel:** Wiederverwendbare Fortschrittsbalken-Komponente für S5:
- **Spurhöhe 12 px**, Fill in `--flieder-deep`.
- **Kapitelmarkierungen** als Ticks an den kumulierten Kapitelstart-Positionen.
- **Drag-Handle 40×40 px** Tap-Fläche.
- **Seek per Drag springt erst beim Loslassen** (on-release); während des Ziehens folgt
  ein **Zeit-Tooltip** dem Handle und der Balken zeigt die Vorschau-Position, aber es
  wird **kein** `player:seek` gefeuert, bis der Finger loslässt.
- Live-Zeitanzeige: aktuelle Zeit + Gesamtzeit.

**Beschreibung:**
1. Neue Komponente `app/src/renderer/src/components/ProgressBar.tsx`:
   ```ts
   interface ProgressBarProps {
     position: number;          // Sekunden (aus PlayerState, live)
     duration: number;          // Sekunden gesamt
     chapters: { startSeconds: number }[]; // für Marker
     onSeekCommit: (seconds: number) => void; // erst beim Loslassen
   }
   ```
2. **State während Drag:** `dragSeconds: number | null`. Während `pointerdown..pointerup`
   wird die angezeigte Position aus `dragSeconds` berechnet (nicht aus `position`), damit
   die Live-Updates aus `player:state` den Drag nicht „zurückziehen“. Beim `pointerup`:
   `onSeekCommit(dragSeconds)` aufrufen und `dragSeconds=null` setzen.
3. **Pointer-Mathematik:** Position aus `clientX` relativ zur Track-Bounding-Box →
   `ratio = (clientX - left)/width`, clamp `[0,1]`, `seconds = ratio*duration`. Pointer
   beim Down per `setPointerCapture` festhalten, damit Move/Up auch außerhalb ankommen.
4. **Kapitelmarker:** für jedes `chapters[i].startSeconds > 0` einen 2px-Tick bei
   `left = startSeconds/duration*100%` rendern (Farbe heller, z. B. `--flieder-tint` oder
   weiß mit Transparenz auf dem Fill).
5. **Zeitanzeige:** zwei `t-tiny`-Labels (`--text-secondary`): links aktuelle Zeit, rechts
   Gesamtzeit. Formatierung `m:ss` bzw. `h:mm:ss` (Hilfsfunktion `formatTime`).
6. **Tooltip:** während Drag ein kleines Label über dem Handle mit der Ziel-Zeit; folgt
   `left` des Handles.
7. CSS in `screens.css` ergänzen: `.progressbar` (Höhe 12px, radius 6px, bg
   `--flieder-tint`), `.progressbar-fill` (bg `--flieder-deep`), `.progressbar-handle`
   (40×40 Tap-Fläche, sichtbarer Punkt zentriert), `.progressbar-tick`,
   `.progressbar-tooltip`.

**Caveats:**
- **Kein Feuern von `player:seek` während des Drags** (sonst rucksinkt das Audio). Nur
  on-release — das ist ein hartes Akzeptanzkriterium.
- `duration === null/0` abfangen (kapitelloses oder noch nicht geladenes Medium): dann
  Balken leer/disabled rendern, keine Division durch 0.
- Touch + Pointer: `touch-action: none` auf der Track-Fläche setzen, damit der Browser den
  Drag nicht als Scroll interpretiert.
- Der Handle muss eine 40×40-Tap-Fläche haben, auch wenn der sichtbare Punkt kleiner ist
  (Kinderfinger).

**Dateien/Artefakte:**
- neu: `app/src/renderer/src/components/ProgressBar.tsx`.
- neu: `app/src/renderer/src/components/formatTime.ts` (oder inline) — `formatTime(sec)`.
- geändert: `app/src/renderer/src/screens.css`.

**Akzeptanzkriterien:**
- [ ] Balken zeigt Fill entsprechend `position/duration`, aktualisiert live.
- [ ] Kapitelmarker an den richtigen Stellen.
- [ ] Drag verschiebt nur die Vorschau; `onSeekCommit` feuert **erst beim Loslassen** mit
      der Zielzeit; Tooltip folgt dem Handle.
- [ ] Aktuelle Zeit + Gesamtzeit korrekt formatiert.
- [ ] `duration=0/null` crasht nicht.

---

### T4.10 — Steuerelement-Buttons (Play/Pause 84, Skip/Seek 64, Volume 60)
**Größe:** M
**Abhängigkeiten:** T4.05, T4.06 (Commands), T4.08 (Strings)
**Vorbedingung:** `<Pressable>` aus M3 vorhanden.

**Ziel:** Die Steuerelement-Reihe für S5 als wiederverwendbare Buttons, mit exakten Größen
und Mindestabständen, alle mit Icons (SVG inline, wie BackButton/MediaTile) und Aria-Labels
aus `de.json`.

**Beschreibung:**
1. Neue Komponente `app/src/renderer/src/components/PlayerControls.tsx` mit Props:
   ```ts
   interface PlayerControlsProps {
     status: 'playing' | 'paused' | 'stopped';
     volume: number | null;
     onPlayPause: () => void;
     onPrevChapter: () => void;
     onNextChapter: () => void;
     onBack15: () => void;
     onForward30: () => void;
     onVolumeDown: () => void;
     onVolumeUp: () => void;
   }
   ```
2. **Buttons** (alle als `<Pressable onTap=...>` mit inline-SVG + `visually-hidden`-Label
   aus `useT()`):
   - **Play/Pause: 84×84 px**, primär (`--flieder-deep`, weißes Icon). Icon wechselt je
     `status` (Play-Dreieck bei `paused`/`stopped`, zwei Balken bei `playing`).
   - **⏮ Vorheriges Kapitel / ⏭ Nächstes Kapitel: je 64×64 px.**
   - **⏪ 15 s zurück / ⏩ 30 s vor: je 64×64 px** (Pfeil + „15“/„30“-Label im Icon).
   - **Lautstärke − / +: je 60×60 px.**
   - **Mindestabstand zwischen allen Targets ≥ 16 px.**
3. Schrittweite Lautstärke: `onVolumeUp` = `setVolume(min(100,(volume??50)+5))`,
   `onVolumeDown` = `setVolume(max(0,(volume??50)-5))` — die konkrete Berechnung macht der
   Aufrufer (S5/Root), die Komponente ruft nur die Callbacks.
4. CSS in `screens.css`: `.player-controls` (Flex-Reihe, gap ≥16px), `.ctrl-playpause`
   (84×84, radius, bg `--flieder-deep`), `.ctrl-64` (64×64), `.ctrl-60` (60×60).

**Caveats:**
- Größen sind **harte** Vorgaben (84/64/60) — nicht „ungefähr“.
- Kein `:hover` als alleinige Zustandsänderung (Kiosk, cursor-frei). Press-Feedback liefert
  `<Pressable>` (Scale 0,96).
- Bei `volume === null` (kein Mixer) die Volume-Buttons trotzdem rendern, aber Callback
  defensiv (Aufrufer clamped).
- Play/Pause: bei `stopped` startet ein Tap die Wiedergabe (über den Aufrufer → `player:play`
  des aktuellen Mediums) bzw. `player:pause`-Toggle bei `playing`. Toggle-Logik im
  Aufrufer (S5), nicht in der Button-Komponente.

**Dateien/Artefakte:**
- neu: `app/src/renderer/src/components/PlayerControls.tsx`.
- geändert: `app/src/renderer/src/screens.css`.

**Akzeptanzkriterien:**
- [ ] Play/Pause ist 84×84, übrige Steuer-Buttons 64×64, Volume 60×60; Abstände ≥16px
      (im Dev-Fenster per DevTools-Messung).
- [ ] Play/Pause-Icon spiegelt `status` wider.
- [ ] Alle Buttons haben Aria-Label aus `de.json`.
- [ ] Tap auf jeden Button ruft den korrekten Callback genau einmal.

---

### T4.11 — S5 Player-Screen (Layout 300px Cover + 440px Steuerung, kein Scroll)
**Größe:** L
**Abhängigkeiten:** T4.09 (ProgressBar), T4.10 (PlayerControls), T4.03 (PlayerState),
T4.13 (Titelleisten-Platzhalter — kann auch danach integriert werden)
**Vorbedingung:** Alle obigen Komponenten vorhanden.

**Ziel:** Der vollständige Player-Screen, der **vollständig in 800×480 ohne vertikales
Scrollen** passt: links Cover ~300×300, rechts (~440px) Titel + aktuelles Kapitel,
Fortschrittsbalken, Steuerelemente. Titelleiste 44px mit Zurück + Platzhalter-Icons.

**Beschreibung:**
1. Neue Datei `app/src/renderer/src/screens/S5Player.tsx` mit Props:
   ```ts
   interface S5PlayerProps {
     item: MediaItem;      // das gewählte Medium (Cover/Titel)
     onBack: () => void;
   }
   ```
2. **Eigener PlayerState-Hook:** S5 abonniert `player:state` (wie NowPlayingBar) und holt
   beim Mount `player:getState`. Daraus: `status, position, duration, volume, chapters,
   currentChapterIndex`. **Renderer hält keinen Gerätezustand** — nur gespiegelten
   Push-State.
3. **Layout (CSS-Grid/Flex):**
   - Titelleiste (`--titlebar-h` = 44px): links `<BackButton>` (64×64), rechts BT-Icon-
     Platz + Mond-Icon-Platz (aus T4.13, nur visuell).
   - Body: zwei Spalten. **Links:** `<Cover title={item.title} coverPath={item.coverPath}
     size={300} />`, vertikal zentriert. **Rechts (~440px):**
     - oben: Titel (`t-heading`, 24px Bold) + aktuelles Kapitel (`t-label`, 20px;
       `chapters[currentChapterIndex].title` oder `t('player.noChapters')` bei E12).
     - Mitte: `<ProgressBar position duration chapters onSeekCommit={(s)=>invoke('player:seek',{position:s})} />`.
     - unten: `<PlayerControls .../>`. Callbacks:
       - Play/Pause: bei `playing` → `player:pause`; sonst → `player:play {path:item.path}`
         (Resume an gespeicherter Position).
       - ⏮/⏭ → `player:chapterPrev`/`player:chapterNext`.
       - ⏪/⏩ → `player:seekRelative {deltaSeconds:-15}` / `{+30}`.
       - −/+ → `player:setVolume` mit `volume±5` geclamped.
4. **Kein vertikales Scrollen:** Container `height:480px; overflow:hidden`. Alle Elemente
   müssen rechnerisch hineinpassen (44 + ~436 Body). Im Dev-Fenster verifizieren.
5. **E12 (kapitelloses Medium):** Kapitelzeile zeigt nichts Leeres an (z. B. nur Titel,
   oder `t('player.noChapters')` dezent); ProgressBar hat keine Marker; das Kapitel-Icon
   für S6 (T4.12) wird ausgeblendet/deaktiviert.

**Caveats:**
- **Kein Scrollen** ist hartes Kriterium — bei langen Titeln Text mit Ellipsis kürzen,
  nicht umbrechen lassen, dass die Höhe wächst.
- Live-Updates aus `player:state` dürfen den ProgressBar-Drag nicht stören (in T4.09 schon
  über `dragSeconds`-Vorrang gelöst).
- Heller Flieder (`--flieder #9B7EDC`) **nie mit weißem Text** — Play/Pause nutzt
  `--flieder-deep`.

**Dateien/Artefakte:**
- neu: `app/src/renderer/src/screens/S5Player.tsx`.
- geändert: `app/src/renderer/src/screens.css` (Layout `.s5-*`).

**Akzeptanzkriterien:**
- [ ] S5 passt vollständig in 800×480, **kein** vertikales Scrollen.
- [ ] Cover links ~300px, Steuerung rechts; Titel + aktuelles Kapitel sichtbar.
- [ ] Alle Steuerungen lösen die korrekten Commands aus; Play/Pause toggelt korrekt.
- [ ] Zeit/Status/Volume aktualisieren sich live über `player:state`.
- [ ] E12: kein leeres Kapitel-Element, kein Crash.

---

### T4.12 — S6 Kapitelliste als Swipe-Up-Sheet (+ Icon-Trigger)
**Größe:** L
**Abhängigkeiten:** T4.11 (S5), T4.03 (chapters in PlayerState), T4.08 (Strings)
**Vorbedingung:** S5 rendert; `player:chapterGoto` existiert (T4.04/T4.03).

**Ziel:** Eine von unten einfahrende Kapitelliste, die auf **zwei** Wegen öffnet — per
**Swipe-Up** auf S5 **und** per **Icon** — das aktuelle Kapitel markiert, und bei Tap auf
ein Kapitel dorthin springt **und** das Sheet schließt.

**Beschreibung:**
1. Neue Komponente `app/src/renderer/src/screens/S6Chapters.tsx`:
   ```ts
   interface S6ChaptersProps {
     chapters: { index: number; title: string; startSeconds: number }[];
     currentChapterIndex: number | null;
     onGoto: (index: number) => void; // -> player:chapterGoto, dann schließen
     onClose: () => void;
   }
   ```
2. **Sheet-Animation:** von unten einfahrend.
   - **Ein: 260 ms ease-out**; **Aus: 200 ms ease-in** (exakte Timings).
   - Scrim dahinter (`--scrim: rgba(42,35,66,0.55)`), Tap auf Scrim schließt.
   - Transform `translateY(100%) → 0`. Schließen invertiert; nach 200 ms unmounten.
3. **Liste:** scrollbar, Einträge `t-label` (20px). Jeder Eintrag: Kapiteltitel + (optional)
   Startzeit (`t-tiny`). **Aktuelles Kapitel hervorgehoben** (z. B. linke Akzentleiste
   `--flieder-deep` + `--flieder-tint`-Hintergrund). Beim Öffnen zum aktuellen Kapitel
   scrollen.
4. **Tap auf Eintrag:** `onGoto(index)` → S5 ruft `player:chapterGoto {index}` und schließt
   das Sheet (`onClose`).
5. **Öffnen aus S5 (zwei Wege):**
   - **Icon:** ein Kapitel-Icon-Button in der rechten Spalte/Steuerung von S5 (Aria-Label
     `t('player.openChapters')`), setzt `chaptersOpen=true`.
   - **Swipe-Up:** auf S5 eine vertikale Wischgeste nach oben erkennen. Implementierung in
     S5: Pointer-Down → -Move; wenn `deltaY < -60px` (nach oben) innerhalb kurzer Zeit und
     überwiegend vertikal (`|dy| > |dx|`), `chaptersOpen=true`. Diese Geste ist die
     **einzige** erlaubte Multitouch-/Swipe-Geste (Designkonstante).
6. **E12 (kapitellos):** Bei leerem `chapters`-Array darf **kein** Sheet öffnen (weder Icon
   noch Swipe) — Icon ausgeblendet/deaktiviert, Swipe-Up no-op. Kein leeres Sheet.

**Caveats:**
- Swipe-Up darf nicht mit dem ProgressBar-Drag kollidieren — der Drag passiert auf der
  Track-Fläche (`touch-action:none`), der Swipe auf dem restlichen S5-Hintergrund.
  Gesten-Zonen klar trennen.
- Slide-In/Out-Timings exakt (260/200 ms) — als Inline-Style oder CSS-Klasse, nicht die
  globale `--t-base` (200 ms) für das Einfahren verwenden.
- Schließen-Animation muss vor dem Unmount abgewartet werden (sonst springt das Sheet weg).
- Cursor-frei: kein `:hover`. Markierung des aktuellen Kapitels ist persistenter Zustand,
  kein Hover.

**Dateien/Artefakte:**
- neu: `app/src/renderer/src/screens/S6Chapters.tsx`.
- geändert: `app/src/renderer/src/screens/S5Player.tsx` (Icon-Trigger + Swipe-Up + State),
  `app/src/renderer/src/screens.css` (`.s6-*`).

**Akzeptanzkriterien:**
- [ ] Sheet öffnet via **Icon** und via **Swipe-Up**, Slide-In 260 ms ease-out,
      Slide-Out 200 ms ease-in.
- [ ] Aktuelles Kapitel ist hervorgehoben; Liste scrollt zum aktuellen Kapitel.
- [ ] Tap auf ein Kapitel springt dorthin (`player:chapterGoto`) und schließt das Sheet.
- [ ] E12: kein leeres Sheet — Icon weg, Swipe-Up wirkungslos.
- [ ] Swipe-Up und ProgressBar-Drag stören sich nicht.

---

### T4.13 — Platzhalter-Icons BT (M6) + Mond (M7) in Titelleiste
**Größe:** S
**Abhängigkeiten:** keine (von T4.11 konsumiert)
**Vorbedingung:** Titelleisten-Muster aus M3 (`grid-titlebar` mit `grid-sync-slot`).

**Ziel:** Rechts in der S5-Titelleiste **visuelle Platzhalter** für das Bluetooth-Icon
(M6) und das Mond-/Schlaf-Icon (M7) — **rein dekorativ, keine Funktion**.

**Beschreibung:**
1. Zwei kleine inline-SVG-Platzhalter (oder eine Komponente `TitlebarPlaceholders.tsx`),
   gedämpfte Farbe (z. B. `--text-secondary` mit reduzierter Deckkraft), je in einem
   reservierten Slot rechts in der S5-Titelleiste.
2. **Keine** Pointer-Handler, **kein** `<Pressable>`, `aria-hidden="true"` — sie sollen
   nicht fokussierbar/aktivierbar sein. Optional `pointer-events: none`.
3. Größe/Abstand so, dass sie nicht mit dem Zurück-Button kollidieren und die 44px-Höhe
   einhalten.

**Caveats:**
- **Keine Funktionalität** einbauen (kein BT-Scan, keine Schlaf-Logik) — das ist M6/M7.
- Die Icons dürfen Tap-Targets der Steuerung nicht verkleinern oder verdecken.

**Dateien/Artefakte:**
- neu (optional): `app/src/renderer/src/components/TitlebarPlaceholders.tsx`.
- geändert: `app/src/renderer/src/screens/S5Player.tsx`, `screens.css`.

**Akzeptanzkriterien:**
- [ ] BT- und Mond-Platzhalter sind rechts in der S5-Titelleiste sichtbar.
- [ ] Sie reagieren nicht auf Taps und sind `aria-hidden`.
- [ ] Layout der Titelleiste bleibt bei 44px, keine Kollision mit Zurück-Button.

---

### T4.14 — Root-Navigation auf S5 umstellen + `NowPlayingBar` entfernen + typecheck
**Größe:** M
**Abhängigkeiten:** T4.11 (S5), T4.12 (S6)
**Vorbedingung:** `app/src/renderer/src/Root.tsx` (verifiziert), `NowPlayingBar.tsx`
vorhanden.

**Ziel:** Ein Tap auf eine Kachel navigiert jetzt zu **S5** (statt nur `player:play` +
Platzhalterbalken). Der M3-Platzhalter `NowPlayingBar` wird entfernt. Gesamter Fluss
typecheckt sauber.

**Beschreibung:**
1. In `app/src/renderer/src/Root.tsx` den `Screen`-Union um S5 erweitern:
   ```ts
   type Screen =
     | { name: 's0' }
     | { name: 's1' }
     | { name: 'grid'; type: 'audiobook' | 'music' }
     | { name: 's5'; item: MediaItem };
   ```
2. Die `play(item)`-Funktion (heute nur `invoke('player:play', {path})`) so ändern, dass
   sie **zu S5 navigiert** und dort die Wiedergabe steuert. Empfohlen: Navigation zu
   `{ name:'s5', item }`; S5 startet beim Mount die Wiedergabe nur, wenn nötig (z. B. nicht
   automatisch erneut starten, wenn dasselbe Medium bereits läuft — sonst springt die
   Position). Verhalten: Tap auf Kachel → S5 öffnet → falls dieses Medium nicht aktiv ist,
   `player:play {path}` (Resume).
   > **Entscheidung dokumentieren:** Auto-Play beim Öffnen von S5 nur, wenn
   > `playerState.currentPath !== item.path`. So zerstört wiederholtes Öffnen keine Position.
3. Rendering: `{screen.name === 's5' && <S5Player item={screen.item} onBack={() =>
   setScreen({name:'grid', type: screen.item.type})} />}`.
4. **`NowPlayingBar` entfernen:** Import + Verwendung in `Root.tsx` löschen; Datei
   `app/src/renderer/src/components/NowPlayingBar.tsx` und die zugehörigen CSS-Regeln
   (`.now-playing-bar`, `.np-*` in `screens.css`) entfernen.
5. `npm run typecheck` + Dev-Lauf: kompletter Fluss S0→S1→Grid→S5→S6→zurück.

**Caveats:**
- Beim Zurück aus S5 zum richtigen Grid (audiobook/music) navigieren — `item.type` nutzen.
- Sicherstellen, dass das Entfernen von `NowPlayingBar` keine verwaisten i18n-Keys oder
  Imports hinterlässt (die genutzten Keys `player.playing/paused/pause/stop` bleiben in
  `de.json`, schaden nicht).
- Library-Refresh (`library:updated`) und Onboarding-Logik in `Root.tsx` unverändert lassen.

**Dateien/Artefakte:**
- geändert: `app/src/renderer/src/Root.tsx`, `app/src/renderer/src/screens.css`.
- entfernt: `app/src/renderer/src/components/NowPlayingBar.tsx`.

**Akzeptanzkriterien:**
- [ ] Tap auf eine Kachel öffnet S5 (nicht mehr nur den Platzhalterbalken).
- [ ] `NowPlayingBar` ist aus Code + CSS entfernt; keine toten Imports.
- [ ] Wiederholtes Öffnen desselben Mediums startet die Position nicht neu.
- [ ] `npm run typecheck` fehlerfrei; voller Fluss im Dev-Fenster bedienbar.

---

### T4.15 — Deploy auf Pi + echtes Touch-/Audio-Verhalten
**Größe:** M · **Ort: Pi**
**Abhängigkeiten:** T4.14 (vollständiger Fluss)
**Vorbedingung:** Pi erreichbar; App-Pfad `/home/player/hoermond/repo/app`.

**Ziel:** Die M4-Build läuft auf dem echten Gerät; Touch-Bedienung und Audio funktionieren.

**Beschreibung:**
1. Build/Deploy auf den Pi (bestehender M1–M3-Deploy-Pfad). **Nach `npm install` auf dem
   Pi `npx electron-rebuild -f -w better-sqlite3` ausführen** (native Module für Pi-ABI).
2. Kiosk starten und durch den vollen Fluss S0→S1→Grid→S5→S6 navigieren.
3. Touch prüfen: Tap auf Steuer-Buttons, Drag am Fortschrittsbalken, Swipe-Up für S6.
4. Audio prüfen: Play/Pause hörbar, ⏪15/⏩30 hörbar, Lautstärke −/+ hörbar.

**Caveats:**
- Touch-Rotation: laut Pi-Setup `xrandr --rotate inverted` in `.xinitrc` — Koordinaten der
  Pointer-Events müssen mit der Anzeige übereinstimmen (sonst springt der Seek-Handle in
  die falsche Richtung). Falls Seek/Swipe „seitenverkehrt“ wirken, hier die Ursache.
- `better-sqlite3` ohne `electron-rebuild` → App startet nicht (DB-Fehler).

**Akzeptanzkriterien:**
- [ ] App startet im Kiosk, voller Fluss bis S6 bedienbar.
- [ ] Alle Steuerelemente per Finger gut treffbar (kalibrierte Schwelle aus T4.01 ok).
- [ ] Audioausgabe und Lautstärke hörbar.

---

### T4.16 — Kapitel-Verhalten mit echten M4B/MP3-Ordner/CUE-Dateien testen
**Größe:** L · **Ort: Pi**
**Abhängigkeiten:** T4.15
**Vorbedingung:** Je mindestens ein echtes Beispiel pro Typ in der Pi-Library.

**Ziel:** Verifizieren, dass alle drei Kapiteltypen auf dem echten Gerät korrekt navigiert
werden (der Spike T4.02 war Laptop-MPD — die Pi-MPD-Version kann abweichen).

**Beschreibung:**
1. **M4B:** Kapitel über ⏮/⏭ und über S6 anspringen; aktuelles Kapitel korrekt markiert;
   Kapitelmarker am Balken an den richtigen Stellen.
2. **MP3-Ordner:** Dateien erscheinen als Kapitel in korrekter Reihenfolge; ⏭ wechselt
   Datei/Track; Marker stimmen.
3. **CUE-Single-File:** Kapitel aus CUE; Sprünge landen an den CUE-Indexpunkten.
4. **E12 (kapitellos):** kein leeres S6-Sheet; ⏮/⏭ = Track-Sprung bzw. Track-Anfang.
5. MPD-Version auf dem Pi notieren und mit dem Spike-Befund (T4.02) abgleichen; bei
   Abweichung im `chapters.ts`-Kommentar/Handler nachziehen.

**Caveats:**
- ffprobe muss auf dem Pi installiert/verfügbar sein, falls T4.04 ffprobe für M4B/CUE
  nutzt — sonst keine Kapitel. Vor dem Test prüfen.
- Pfad-Auflösung (relativer MPD-Pfad → absoluter Dateipfad) muss mit dem echten Media-Root
  auf dem Pi übereinstimmen.

**Akzeptanzkriterien:**
- [ ] M4B-Kapitel navigierbar (Buttons + S6), Marker korrekt.
- [ ] MP3-Ordner: Dateien = Kapitel in korrekter Reihenfolge.
- [ ] CUE-Single-File: Kapitel aus CUE, Sprünge korrekt.
- [ ] E12: kein leeres Sheet; ⏮/⏭ sinnvoll.

---

### T4.17 — Pixel-Layout-Check am echten 800×480-Display
**Größe:** M · **Ort: Pi**
**Abhängigkeiten:** T4.15
**Vorbedingung:** App läuft auf dem Pi.

**Ziel:** S5 und S6 sind pixelgenau korrekt am echten 7"-Display; **kein vertikales
Scrollen** auf S5; Button-Größen/-Abstände stimmen.

**Beschreibung:**
1. S5: Cover ~300px links, Steuerung rechts, alles in 480px Höhe **ohne Scrollen**.
2. Button-Größen am echten Display gegen die Vorgaben prüfen: Play/Pause 84, Skip/Seek 64,
   Volume 60, Abstände ≥16px.
3. S6-Sheet: Slide-In/Out flüssig (260/200 ms), aktuelles Kapitel markiert.
4. Titelleiste 44px mit Zurück + BT/Mond-Platzhaltern, keine Überlappung.

**Caveats:**
- Subpixel-Unterschiede zwischen Dev-Fenster und echtem Panel möglich — der echte 800×480-
  Check ist verbindlich.
- Lange Titel: Ellipsis greift, Höhe wächst nicht (sonst Scroll).

**Akzeptanzkriterien:**
- [ ] S5 ohne vertikales Scrollen, Layout wie spezifiziert.
- [ ] Button-Maße/-Abstände am echten Display korrekt.
- [ ] S6 markiert aktuelles Kapitel, Animation flüssig.

---

### T4.18 — Seek-Präzision + Lautstärke messen
**Größe:** M · **Ort: Pi**
**Abhängigkeiten:** T4.15
**Vorbedingung:** Medium mit bekannter Länge.

**Ziel:** Seek ist präzise und die Lautstärkeregelung wirkt hörbar/monoton.

**Beschreibung:**
1. ⏪ springt **exakt 15 s** zurück, ⏩ **exakt 30 s** vor (mit der angezeigten Zeit
   gegenprüfen; ±1 s Toleranz durch Frame/Decoder).
2. Drag am Fortschrittsbalken: Sprung erfolgt **erst beim Loslassen**, landet an der
   Tooltip-Zeit; Zeit aktualisiert sich danach live.
3. Lautstärke −/+ ändert hörbar; mehrere Schritte sind monoton (lauter/leiser), Grenzen
   0/100 ohne Fehler.

**Caveats:**
- An Kapitel-/Dateigrenzen (MP3-Ordner) kann −15 s auf den Track-Anfang clampen (bewusst,
  siehe T4.05) — als erwartet dokumentieren, kein Bug.
- **Kein** Lautstärke-Limit erwartet (Limit ist M5).

**Akzeptanzkriterien:**
- [ ] ⏪/⏩ springen 15/30 s (±1 s).
- [ ] Balken-Drag committet on-release an der Tooltip-Zeit.
- [ ] Lautstärke hörbar und monoton, Grenzen stabil.

---

### T4.19 — Resume nach Stecker-Ziehen mit Kapitel-Medien
**Größe:** M · **Ort: Pi**
**Abhängigkeiten:** T4.07 (Resume), T4.00 (resume-on-stopped)
**Vorbedingung:** App läuft, ein Kapitel-Medium ist in Wiedergabe.

**Ziel:** Nach echtem Stromverlust (Stecker ziehen) resumed die App korrekt — im richtigen
Kapitel/Track an der richtigen Position; nach einem expliziten Stop **kein** Auto-Resume.

**Beschreibung:**
1. MP3-Ordner mitten in Kapitel 3 abspielen, ~20 s warten (mind. ein 10s-Save), Stecker
   ziehen. Neu starten → Resume landet in Kapitel 3 an ~derselben Position.
2. M4B/CUE: dieselbe Prozedur; Resume an der richtigen Gesamtposition.
3. **resume-on-stopped:** Medium über den Stop-Button stoppen, dann Stecker ziehen / neu
   starten → **kein** Auto-Resume.

**Caveats:**
- Die 10s-Persistenz bedeutet bis zu 10 s Positionsverlust beim harten Ziehen — akzeptabel
  (Toleranz). Bei zu großer Abweichung Save-Intervall/Strategie hinterfragen.
- overlayfs: Schreibpfad der SQLite (`/var/lib/mediaplayer/state.db`) muss persistent sein
  (nicht im Overlay-RAM), sonst geht der Fortschritt beim Reboot verloren — gegen die
  M1-Persistenz-Annahmen prüfen, falls Resume „vergisst“.

**Akzeptanzkriterien:**
- [ ] Nach Stecker-Ziehen während Wiedergabe: Resume im richtigen Kapitel/Track + Position
      (±10 s).
- [ ] Nach explizitem Stop + Neustart: **kein** Auto-Resume.
- [ ] Funktioniert für alle drei Kapiteltypen.

---

## Risiken & Hinweise (zusammengefasst)

1. **Kapitel-Abstraktion (größtes Risiko):** Ob MPD Kapitelgrenzen liefert oder ob
   clientseitiges Offset-Seeking (ggf. via `ffprobe` im Main) nötig ist, entscheidet der
   verpflichtende Spike **T4.02 zuerst**. M4B/CUE sind die Unsicherheit; MP3-Ordner ist
   der sichere Fall (Playlist-Positionen).
2. **Performance/kein Polling:** `getChapters()` darf nicht bei jedem `getState`/idle-Push
   neu rechnen (ffprobe!). Cache pro geladenem Medium, invalidiert über das `playlist`-
   Signal des idle-Loops (T4.04). Der Architekturvertrag „kein Polling“ bleibt gewahrt.
3. **Positions-Semantik:** `PlayerState.position` ist medium-global (UI), `playback_position`
   speichert track-relativ + `track_index` (DB). Diese Trennung muss in T4.04/T4.07
   konsistent gehalten werden, sonst springt Resume/Anzeige falsch.
4. **Scope-Disziplin:** Lautstärke-**Limit**, PIN, Eltern-Einstellungen sind **M5** und
   dürfen in M4 nicht eingebaut werden. BT (M6) und Mond/Schlaf (M7) sind in der S5-
   Titelleiste nur **visuelle Platzhalter** ohne Funktion.
5. **Touch-Kalibrierung:** Die Scroll/Tap-Schwelle (T4.01, 14 px) ist ein Startwert; die
   verbindliche Feinjustierung erfolgt am echten kapazitiven Touch (T4.15).
6. **Pi-Build:** `npx electron-rebuild -f -w better-sqlite3` nach jedem `npm install` auf
   dem Pi, sonst startet die App nicht.
