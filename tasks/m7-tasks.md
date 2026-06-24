# M7 — Display-Management, Schlaf-Timer & Polish: Task-Plan

## Überblick

M7 liefert **Spec-Phase 5**: den Abschluss- und Härtungs-Meilenstein. Es schließt die
verbleibenden Features ab und härtet das System für den Dauerbetrieb.

1. **Display-Management (im Electron-Main-Prozess):** Wiedergabe aktiv → Display bleibt an.
   Keine Wiedergabe + keine Touch-Interaktion für 5 min → Display aus, Wiedergabe-State bleibt
   erhalten (E13). Jeder Touch resettet den Inaktivitäts-Timer. Touch auf ausgeschaltetem
   Display → Display blendet in 300 ms auf, **kein** Play/Pause ausgelöst (E6); erst der zweite
   Touch wirkt als UI-Tap. Steuert Backlight via `bl_power` sysfs aus dem Main-Prozess.
2. **Schlaf-Timer (S8):** Dialog mit 15/30/60 min + „Bis Ende des Kapitels"; sichtbarer
   Countdown; Tap auf Countdown bricht ab. 60 s vor Timer-Ende lineares Fade-Out der
   Lautstärke; nach Ablauf Pause (kein Stop → Resume bleibt möglich) (E10). „Bis Ende des
   Kapitels" bei kapitellosem Medium → Track-Ende (E12).
3. **Cover-Fallback / Online-Fetch:** Medium ohne lokales Cover → Online-Fetch
   (MusicBrainz Cover Art Archive / Last.fm), gecacht unter `/mnt/hoermond/.cache/covers/`;
   bis dahin Shimmer; bei Fehlschlag dauerhaft Platzhalter (Initial + deterministische Farbe).
   Keine Fehlermeldung ans Kind (E2/E3).
4. **Sync-Status-Icon:** ✅ aktuell / 🔄 läuft (animiert 360°/1,4 s) / ⚠️ fehlgeschlagen
   (Amber); Tap auf ⚠️ zeigt Details (E7/E8). Sync-Log der letzten 10 Vorgänge in S10.
5. **E2E-Stromverlust-Test:** während Wiedergabe Stecker ziehen → Reboot → Auto-Resume an
   korrekter Position (≤ 10 s); mind. 10× wiederholt, Bibliothek intakt, kein Datenverlust.
6. **Polish-Pass:** alle Timings/Übergänge aus §4.2 final abstimmen.

## Architektur-Grundvertrag (M1–M6, zwingend)

- Electron-Main kapselt **alle** privilegierten/seitenwirksamen Operationen — auch DPMS,
  Display-Power, HTTP-Fetch, Dateisystem-Cache. Der Renderer ist **rein**, hält keinen
  Gerätezustand und ruft **nur** über die typisierte IPC-Bridge.
- Neue Channels **ausschließlich additiv** in `ALLOWED_COMMANDS` / `ALLOWED_EVENTS`.
- **Event-getrieben, kein Polling**: Display-Management hängt an `mpc idle player` (bereits
  von `startIdleLoop` in `main/mpd/idle.ts` ausgewertet). Countdown-Events vom Schlaf-Timer
  und Cover-/Sync-Status kommen als getypte Events aus langlaufenden Diensten (Muster
  `startIdleLoop` / `startSyncLogBridge` / `startBtListener`).
- IPC-Namenskonvention: **Doppelpunkt-Namespacing** (`sleep:start`, nicht `sleep.start`).
- Alle UI-Strings in `de.json`, key-basiert über `useT()`. **Keine** hartcodierten Strings im JSX.
- **Single Source of Truth:** MPD für Player-Zustand, SQLite für Persistenz, Main für alles
  autoritativ. Der Renderer spiegelt nur.
- **`setVolume(volume)`** in `mpd/control.ts` ist der **einzige** Lautstärke-Pfad (mit
  `max_volume`-Klemmung). Das Fade-Out **muss** darüber laufen — kein direkter `mpc`-Aufruf.
- **Display-Power läuft im Electron-Main-Prozess:** Main steuert das Backlight über
  `child_process.execFile('sudo', ['tee', '/sys/class/backlight/10-0045/bl_power'])` (Spike
  T7.P1 bestätigt: `bl_power` 1=aus, 0=an). Main kennt sowohl Player-State (via idle loop)
  als auch Touch-Aktivität (via IPC-Event `display:touch` vom Renderer). Kein externer
  Systemd-Service nötig. Renderer meldet Touches und verwirft den ersten Touch nach Wake.
- **Cover-Pipeline ist rein Backend (Electron-Main):** lokales Cover → Online-Fetch → Cache.
  Der Renderer zeigt nur an, was Main liefert (`coverPath`-Feld in `MediaItem`, plus
  `cover:status`-Events für Shimmer).
- **HTTP-Fetch nur über Node-Builtin (`fetch` aus Node ≥ 18 / `undici`)** im Main-Prozess,
  **niemals** im Renderer. Timeout zwingend (Gerät kann offline sein).

## Bestehendes (NICHT neu bauen, sondern wiederverwenden)

- **`startIdleLoop`** (`main/mpd/idle.ts`): langlaufender `mpc idle`-Dienst mit
  `getWindow`-Callback, Cleanup, exponentielles Backoff. **Liefert bereits `player`-Events
  bei play/pause/stop** und ruft `getState()` ab → die Display-Management-Logik baut darauf auf.
  **Vorlage für den Schlaf-Timer-Dienst.**
- **`startSyncLogBridge`** (`main/sync/watch-log.ts`): liest die Sync-Log-Datei
  (`HOERMOND_SYNC_LOG`, default `/var/lib/mediaplayer/sync/sync.log`), parst line-delimited
  JSON `SyncStatus { phase, ts, message? }` und sendet `sync:status`-Events an den Renderer.
  **Bereits produktiv** — M7 ergänzt nur Aggregation + Anzeige.
- **`startBtListener`** (`main/bt/listen.ts`): langlaufender Subprozess → getypte Events.
  **Vorlage für Hintergrunddienste mit Cleanup.**
- **IPC-Vertrag** (`shared/ipc-contract.ts`): Commands/Events getypt, Whitelists, generische
  Preload (neue Channels brauchen **keine** Preload-Änderung). `SyncStatus`-Typ existiert,
  `sync:status`-Event ist bereits whitelistet (in `ALLOWED_EVENTS`).
- **`registerIpcHandlers(getWindow)`** (`main/ipc/register.ts`): zentrale Handler-Stelle,
  hat bereits `getWindow`-Zugriff zum Senden von Events.
- **`setVolume`** + **`getState`** (`main/mpd/control.ts`): `getState()` liefert `position`,
  `duration`, `chapters`, `currentChapterIndex`, `status`, `volume` — alle Bausteine für
  „bis Kapitelende"-Berechnung und Fade-Out-Restzeit.
- **`getSetting` / `setSetting`** (`main/db/dao.ts`): generischer Key-Value-Store in der
  `settings`-Tabelle. Für Sync-Status-Persistenz nutzen (kein neues Schema nötig).
- **Cover.tsx** (`renderer/src/components/Cover.tsx`): hat bereits den
  Platzhalter-Pfad (Initial + deterministische Farbe aus fester Palette). M7 ergänzt
  Shimmer-Zustand + `coverPath`-Quelle. **Platzhalter-Logik nicht neu bauen.**
- **`MediaItem.coverPath`** (`shared/ipc-contract.ts`): Feld existiert, wird in `library/list.ts`
  aktuell **immer `undefined`** gesetzt (Zeile 109). M7 füllt es aus der Cover-Pipeline.
- **S5Player.tsx** (`renderer/src/screens/S5Player.tsx`): hat den **Mond-Icon-Platzhalter**
  in der Titelleiste (Zeile 224–232, „Moon icon (placeholder, no function)") → M7 macht ihn
  tippbar (öffnet S8). BT-Icon-Muster (Zeile 180–222) als Vorlage für tippbares Titelleisten-Icon.
- **S10Settings.tsx** (`renderer/src/screens/S10Settings.tsx`): hat den
  **Sync-Log-Platzhalter** (Zeile 246–249, `settings.syncLog.placeholder` = „Bald verfügbar")
  → M7 ersetzt ihn durch die Log-Ansicht.
- **Overlay-Muster**: S4Detail / S6Chapters / S7Bluetooth / S9PinDialog (Scrim `--scrim`,
  Enter 220 ms / Exit 160 ms, Tap außerhalb schließt). **S8 nutzt exakt dieses Muster.**
- **ToastProvider** (`renderer/src/components/ToastProvider.tsx`) + `useToast()`: globales
  Toast-System, produktiv für BT. **Nicht für Sync-Fehler missbrauchen** — Sync-Fehler sind
  unauffällig (Icon), kein Toast (E8: „für Kind unauffällig").
- **`<Pressable>`**, **`<BackButton>`**, i18n via `useT()`, `screens.css`, `theme.css`.

## Reihenfolge & Abhängigkeiten

```
PI-TASKS (auf dem Gerät)
  T7.P1 Touch-Wake-Spike                       ✅ erledigt (2026-06-21)
  T7.P2 sudo-Rechte für bl_power (passwordless) ✅ erledigt (2026-06-21)
  T7.P3 Cover-Cache-Verzeichnis /mnt/hoermond/.cache/covers/ anlegen
     │
  T7.P4 E2E-Stromverlust-Testlauf (10×)        ← NACH allen Code-Tasks + Deploy
  T7.P5 Abnahme-/Polish-Durchlauf am Gerät     ← NACH T7.P4

CODE-TASKS (im Repo)
  T7.C1 Shared-Typen + IPC-Vertrag erweitern (sleep:*, cover:*, sync:*, display:*)
     │
     ├── SCHLAF-TIMER
     │   ├── T7.C2 Schlaf-Timer-Dienst im Main (Countdown + Fade-Out + Pause)   ← T7.C1
     │   ├── T7.C3 IPC-Handler sleep:* registrieren                              ← T7.C1, T7.C2
     │   ├── T7.C7 de.json: Schlaf-/Cover-/Sync-Strings                          (unabhängig)
     │   ├── T7.C8 Mond-Icon in S5 tippbar → S8                                  ← T7.C1
     │   └── T7.C9 S8 Schlaf-Timer-Dialog + Countdown-Anzeige in S5             ← T7.C1, T7.C7, T7.C8
     │
     ├── COVER-PIPELINE
     │   ├── T7.C4 Cover-Pipeline im Main (lokal → Online-Fetch → Cache)        ← T7.C1
     │   ├── T7.C5 library:list füllt coverPath + cover:status-Events           ← T7.C4
     │   └── T7.C10 Cover.tsx: Shimmer-Zustand                                   ← T7.C1, T7.C7
     │
     ├── SYNC-STATUS
     │   ├── T7.C6 Sync-Status-Aggregation im Main (✅/🔄/⚠️ + Log letzte 10)   ← T7.C1
     │   ├── T7.C11 Sync-Status-Icon in Titelleiste (S1/Grid) + Tap-Details    ← T7.C1, T7.C6, T7.C7
     │   └── T7.C12 S10: Sync-Log-Ansicht (ersetzt Platzhalter)                ← T7.C1, T7.C6, T7.C7
     │
     ├── DISPLAY-MANAGEMENT
     │   ├── T7.C13 Display-Manager im Main (bl_power + Inaktivitäts-Timer)    ← T7.C1, T7.P2
     │   └── T7.C15 Touch-Wake im Renderer (Touch melden, 1. Tap schlucken, Fade-In) ← T7.C1, T7.C13
     │
     └── T7.C14 Polish-Pass: Timings §4.2 final abstimmen                       ← alle UI-Tasks
```

---

## Übersicht

| ID | Titel | Größe | Status |
|----|-------|-------|--------|
| T7.P1 | Touch-Wake-Spike (Event-Pfad X11/libinput → Electron) | M | ✅ erledigt (2026-06-21) |
| T7.P2 | sudo-Rechte für bl_power (passwordless) | S | ✅ erledigt (2026-06-21) |
| T7.P3 | Cover-Cache-Verzeichnis anlegen | S | ✅ erledigt (2026-06-21) |
| T7.P4 | E2E-Stromverlust-Testlauf (10×) | L | ✅ erledigt (2026-06-24) |
| T7.P5 | Abnahme-/Polish-Durchlauf am Gerät | M | ✅ erledigt (2026-06-24) |
| T7.C1 | Shared-Typen + IPC-Vertrag erweitern | S | ✅ erledigt (2026-06-21) |
| T7.C2 | Schlaf-Timer-Dienst im Main | L | ✅ erledigt (2026-06-21) |
| T7.C3 | IPC-Handler `sleep:*` registrieren | S | ✅ erledigt (2026-06-21) |
| T7.C4 | Cover-Pipeline im Main (lokal → Fetch → Cache) | L | ✅ erledigt (2026-06-21) |
| T7.C5 | `library:list` füllt `coverPath` + `cover:status` | M | ✅ erledigt (2026-06-21) |
| T7.C6 | Sync-Status-Aggregation im Main | M | ✅ erledigt (2026-06-21) |
| T7.C7 | de.json: Schlaf-/Cover-/Sync-Strings | S | ✅ erledigt (2026-06-21) |
| T7.C8 | Mond-Icon in S5 tippbar → S8 | S | ✅ erledigt (2026-06-21) |
| T7.C9 | S8 Schlaf-Timer-Dialog + Countdown in S5 | L | ✅ erledigt (2026-06-21) |
| T7.C10 | Cover.tsx: Shimmer-Zustand | M | ✅ erledigt (2026-06-21) |
| T7.C11 | Sync-Status-Icon in Titelleiste + Tap-Details | M | ✅ erledigt (2026-06-21) |
| T7.C12 | S10: Sync-Log-Ansicht | M | ✅ erledigt (2026-06-21) |
| T7.C13 | Display-Manager im Main (bl_power + Inaktivitäts-Timer) | L | ✅ erledigt (2026-06-21) |
| T7.C14 | Polish-Pass: Timings §4.2 | M | ✅ erledigt (2026-06-21) |
| T7.C15 | Touch-Wake im Renderer (Touch melden, 1. Tap schlucken, Fade-In) | M | ✅ erledigt (2026-06-21) |

---

## Pi-Tasks

### T7.P1 — Touch-Wake-Spike ✅ ERLEDIGT (2026-06-21)
Ergebnisse dokumentiert in `tasks/m7-spike-notes.md`.

**Kernbefunde:**
- `vcgencmd display_power 0/1` gibt `-1` zurück → funktioniert **nicht**
- **`/sys/class/backlight/10-0045/bl_power`** funktioniert: `1`=aus, `0`=an (braucht sudo)
- Digitizer bleibt bei dunklem Display **aktiv** (evtest bestätigt Events)
- Touch-Events erreichen Electron und lösen Aktionen aus (Play/Pause im Dunkeln togglebar)
- **Strategie (a) bestätigt:** Renderer verwirft ersten Touch nach Wake
- `mpc idle player` funktioniert zuverlässig als Event-Quelle

**Architektur-Entscheidung:** Display-Management wandert komplett in den **Electron-Main-
Prozess** (statt Systemd-Service), weil Main sowohl Player-State als auch Touch-Aktivität
kennen muss. Inaktivitäts-Timer = 5 min ab letztem Touch (nicht ab Pause), damit das Display
beim Browsen ohne Wiedergabe nicht ausgeht. → T7.C13 + T7.C15.

---

### T7.P2 — sudo-Rechte für bl_power (passwordless) ✅ ERLEDIGT (2026-06-21)

**Lösung:** Systemd-oneshot-Service `hoermond-backlight.service` setzt beim Boot
`chmod 0666` auf `/sys/class/backlight/10-0045/bl_power`. Damit kann `player` ohne sudo
direkt schreiben.

**Was eingerichtet wurde:**
1. `/etc/systemd/system/hoermond-backlight.service`:
   ```ini
   [Unit]
   Description=Make backlight bl_power writable for player
   After=sysinit.target
   [Service]
   Type=oneshot
   ExecStart=/bin/chmod 0666 /sys/class/backlight/10-0045/bl_power
   [Install]
   WantedBy=multi-user.target
   ```
2. Service enabled + Reboot-fest verifiziert.
3. `player` kann ohne sudo: `echo 1 > bl_power` (aus) / `echo 0 > bl_power` (an).

**Konsequenz für T7.C13:** Im Display-Manager `fs.writeFile` statt `execFile('sudo', ['tee', ...])`
nutzen — einfacher, kein Subprozess.

---

### T7.P3 — Cover-Cache-Verzeichnis anlegen
**Größe:** S · **Abhängigkeiten:** keine · **Status:** offen

Das Cache-Verzeichnis für Online-Cover auf der **beschreibbaren** Partition anlegen.

**Schritte:**
1. Verzeichnis `/mnt/hoermond/.cache/covers/` anlegen, Owner `player`, Mode `0755`.
2. Bestätigen, dass `/mnt/hoermond` **beschreibbar** ist (kein overlayfs-read-only) und über
   Reboot persistent — sonst Cache nach jedem Boot leer (vertretbar, aber Fetch-Last steigt).
3. Sicherstellen, dass die App (`player`) Schreibrechte hat.
4. Optional: Größenbegrenzung dokumentieren (Cover sind klein; bei tausenden Medien ggf.
   LRU-Cleanup erwägen — für M7 nicht nötig, nur notieren).

**Akzeptanzkriterien:**
- [ ] `/mnt/hoermond/.cache/covers/` existiert, Owner `player`, beschreibbar
- [ ] Persistenz über Reboot bestätigt
- [ ] Pfad stimmt mit dem Code-Default in T7.C4 überein

---

### T7.P4 — E2E-Stromverlust-Testlauf (10×)
**Größe:** L · **Abhängigkeiten:** alle Code-Tasks deployt, T7.P2 + T7.P3 erledigt · **Status:** offen

Der verbindliche Härtungstest des Meilensteins (E9). **Nach** Deploy aller M7-Code-Tasks.

**Vorbereitung:**
1. Aktuellen Repo-Stand auf `/home/player/hoermond/repo` ziehen, App bauen, neu starten.
2. Ein Medium mit bekannter Länge wählen (ideal M4B mit Kapiteln + ein MP3-Ordner).

**Testprozedur (mind. 10 Durchläufe, protokollieren):**
1. Wiedergabe starten, ~2–3 min laufen lassen, Position notieren (Sekunde X).
2. **Stecker ziehen** (harter Stromverlust, kein Shutdown).
3. Strom wieder anlegen → Boot abwarten.
4. Prüfen:
   - Auto-Resume startet am korrekten Medium.
   - Position weicht ≤ 10 s von X ab (Persistenz schreibt alle 10 s, `player/persist.ts`).
   - Bibliothek vollständig sichtbar, kein Datenverlust, DB nicht korrupt.
5. Variieren: Position ziehen während `playing`, während Fade-Out (Schlaf-Timer aktiv),
   während Online-Cover-Fetch, während Sync läuft.

**Bei Fehlern:** Ursache liegt fast immer in M1 (overlayfs/Schreibpfade) oder M2
(WAL/Positionsschreiben). Symptome dokumentieren, an die jeweilige Schicht eskalieren.

**Akzeptanzkriterien:**
- [ ] Mind. 10 Durchläufe protokolliert (Soll-/Ist-Position, Boot-Ergebnis)
- [ ] In allen Läufen: Resume korrekt, Abweichung ≤ 10 s
- [ ] Bibliothek intakt, kein Datenverlust, DB nicht korrupt
- [ ] Auch unter Fade-Out / Cover-Fetch / Sync getestet
- [ ] Ergebnis in `tasks/m7-pi-abnahme.md` (Format wie `tasks/m4-pi-abnahme.md`)

---

### T7.P5 — Abnahme-/Polish-Durchlauf am Gerät
**Größe:** M · **Abhängigkeiten:** T7.P4 · **Status:** offen

Finaler Abnahme-Durchlauf am echten 7"-Display gegen die §4.2-Timings und alle M7-AKs aus
`milestones.md`.

**Prüfpunkte (jeweils am Gerät beobachten, nicht nur im Dev-Emulator):**
1. Display-Management: Wiedergabe → an; Pause 5 min → aus; Touch → 300-ms-Fade-In, **kein**
   Play/Pause; zweiter Touch wirkt.
2. Schlaf-Timer: alle vier Modi; Countdown sichtbar; Tap bricht ab; 60-s-Fade-Out hörbar
   linear/ruckelfrei; danach Pause (Resume möglich); „bis Kapitelende" bei kapitellosem
   Medium = Track-Ende.
3. Cover: Medium ohne Cover → Shimmer → entweder nachgeladenes Cover oder dauerhafter
   Platzhalter; offline → sauberer Fallback ohne Fehlermeldung.
4. Sync-Icon: ✅/🔄/⚠️ live, 🔄 dreht 360°/1,4 s, ⚠️ Amber, Tap → Details; S10-Log
   zeigt letzte 10.
5. Polish: alle Übergänge gegen §4.2 (Overlay 220/160, Toast 200/3500/200, Shimmer 1,2 s,
   Icon-Spin 1,4 s, Wake-Fade 300 ms).

**Akzeptanzkriterien:**
- [ ] Alle M7-AKs aus `milestones.md` am Gerät bestätigt
- [ ] Alle §4.2-Timings am Gerät verifiziert
- [ ] Abnahme dokumentiert in `tasks/m7-pi-abnahme.md`

---

## Code-Tasks

### T7.C1 — Shared-Typen + IPC-Vertrag erweitern
**Größe:** S · **Abhängigkeiten:** keine

Geteilte Typen definieren und den IPC-Vertrag um `sleep:*`-, `cover:*`-, `sync:*`- und
`display:*`-Channels erweitern.

**Schritte:**
1. In `app/src/shared/ipc-contract.ts` neue Typen ergänzen (additiv):
   ```ts
   /** Schlaf-Timer-Modus. */
   export type SleepMode = 'min15' | 'min30' | 'min60' | 'chapterEnd';

   /** Aggregierter Sync-Gesamtstatus für das Titelleisten-Icon. */
   export type SyncState = 'idle' | 'running' | 'error';

   /** Ein Eintrag im Sync-Log (für S10-Ansicht). */
   export interface SyncLogEntry {
     phase: 'started' | 'completed' | 'error';
     ts: string;        // ISO-8601
     message?: string;
   }

   /** Cover-Fetch-Status für ein Medium (Shimmer-Steuerung). */
   export type CoverPhase = 'pending' | 'ready' | 'failed';
   ```
2. `IpcCommands` ergänzen:
   ```ts
   'sleep:start':  { request: { mode: SleepMode };  response: { ok: boolean; endsAt: number | null } };
   'sleep:cancel': { request: void;                  response: { ok: boolean } };
   'sleep:get':    { request: void;                  response: { active: boolean; endsAt: number | null; mode: SleepMode | null } };
   'sync:getState':{ request: void;                  response: { state: SyncState } };
   'sync:getLog':  { request: void;                  response: { entries: SyncLogEntry[] } };
   'display:touch': { request: void;                 response: void };
   ```
   - `endsAt` ist ein absoluter Timestamp (`Date.now() + dauer`) bzw. `null` bei „chapterEnd"
     (Ende richtet sich nach Restzeit des Mediums, kein fester Wandzeit-Punkt).
   - `display:touch` wird vom Renderer bei **jedem** Touch aufgerufen (Fire-and-forget), damit
     Main den Inaktivitäts-Timer resetten kann. Leichtgewichtig: keine Response nötig.
3. `IpcEvents` ergänzen:
   ```ts
   'sleep:tick':    { remainingMs: number; mode: SleepMode };  // ~1×/s während aktiv
   'sleep:ended':   { reason: 'completed' | 'cancelled' };
   'sync:state':    { state: SyncState };                       // aggregiert (Icon)
   'cover:status':  { path: string; phase: CoverPhase; coverPath?: string };
   'display:state': { on: boolean };                             // Main → Renderer bei Display aus/an
   ```
   - `cover:status.path` ist der `MediaItem.path` (Unit-Pfad); `coverPath` ist bei `ready`
     der lokale Cache-Pfad.
   - `sync:status` (Roh-Event) bleibt unverändert bestehen.
   - `display:state` informiert den Renderer, ob das Display an/aus ist — der Renderer nutzt
     das, um nach `off→on` den ersten Touch zu schlucken und 300-ms-Fade-In auszulösen (T7.C15).
4. Die **sechs** neuen Commands in `ALLOWED_COMMANDS`, die **fünf** neuen Events in `ALLOWED_EVENTS`.
5. **`REPLAYABLE_EVENTS` NICHT erweitern** — alle neuen Events sind wiederkehrend, keine
   One-Shot-Lifecycle-Events. Initialzustand holt der Renderer per `sleep:get` /
   `sync:getState` beim Mount (Pull-Muster, siehe ARCHITECT-Note im Vertrag).

**Dateien:** geändert: `app/src/shared/ipc-contract.ts`.

**Akzeptanzkriterien:**
- [ ] Sechs Commands + fünf Events getypt und whitelistet
- [ ] `REPLAYABLE_EVENTS` unverändert
- [ ] `npm run typecheck` fehlerfrei

---

### T7.C2 — Schlaf-Timer-Dienst im Main
**Größe:** L · **Abhängigkeiten:** T7.C1

Ein Main-seitiger Dienst, der den Schlaf-Timer hält: Countdown-Events sendet, 60 s vor Ende
linear ausfadet und am Ende pausiert (kein Stop). Single Source of Truth = Main.

**Schritte:**
1. Neue Datei `app/src/main/sleep/timer.ts` mit einem Singleton-Modul:
   ```ts
   import type { BrowserWindow } from 'electron';
   import type { SleepMode } from '@shared/ipc-contract';

   export function initSleepTimer(getWindow: () => BrowserWindow | null): void; // einmalig in index.ts
   export function startSleep(mode: SleepMode): Promise<{ ok: boolean; endsAt: number | null }>;
   export function cancelSleep(): { ok: boolean };
   export function getSleep(): { active: boolean; endsAt: number | null; mode: SleepMode | null };
   export function stopSleepService(): void; // Cleanup für before-quit
   ```
2. **Dauer bestimmen:**
   - `min15/30/60` → feste Dauer in ms. `endsAt = Date.now() + dauer`.
   - `chapterEnd` → aus `getState()` (aus `mpd/control.ts`) die Restzeit berechnen:
     - Bei Kapiteln (`chapters.length > 0`, `currentChapterIndex !== null`): Restzeit bis
       Ende des **aktuellen Kapitels** = `chapter.startSeconds + chapter.durationSeconds -
       position`. (Beachte: `position` ist bei `playlistPos`-Kapiteln global, bei
       `seekOffset` track-relativ — `getState()` liefert beide konsistent zum jeweiligen
       Kapitelmodell. Nutze die Kapitelgrenzen aus demselben `getState()`-Aufruf.)
     - Bei kapitellosem Medium (E12, `chapters.length <= 1` bzw. `currentChapterIndex === null`):
       Restzeit bis **Track-/Medium-Ende** = `duration - position`.
     - `endsAt = null` zurückgeben (variabler Endpunkt), aber intern die berechnete
       Rest-Dauer als ms-Deadline halten.
3. **Tick-Loop:** ein `setInterval` (1000 ms) sendet `sleep:tick { remainingMs, mode }` an
   den Renderer. `remainingMs = deadline - Date.now()`.
4. **Fade-Out:** sobald `remainingMs <= 60_000`, linear ausfaden:
   - Startlautstärke beim Eintritt in die Fade-Phase einmalig aus `getState().volume` lesen
     und merken (`fadeStartVolume`).
   - Pro Tick neue Lautstärke berechnen:
     `vol = round(fadeStartVolume * remainingMs / 60_000)`, geklemmt auf `[0, fadeStartVolume]`.
   - **Über `setVolume(vol)` aus `mpd/control.ts`** setzen (einziger Lautstärke-Pfad,
     respektiert `max_volume`). **Kein** direkter `mpc`-Aufruf.
   - Tick-Frequenz von 1 s ist für „ruckelfrei" ausreichend (max. ~1–2 % Schritte bei 60 s);
     falls hörbar gestuft, optional auf 500 ms erhöhen (im Code als Konstante).
5. **Am Ende (`remainingMs <= 0`):**
   - `pause()` aus `mpd/control.ts` aufrufen (kein `stop()` → Resume bleibt möglich, E10).
     **Wichtig:** denselben Pause-Pfad wie der `player:pause`-Handler nutzen, damit Position
     + `lastStatus='paused'` persistiert werden — am einfachsten, indem der Handler in
     register.ts den Timer aufruft, der wiederum `pause()`+`saveNow()`+`setLastStatus`
     ausführt (Konsistenz mit register.ts-Logik prüfen, nicht duplizieren).
   - Lautstärke **auf `fadeStartVolume` zurücksetzen** (`setVolume(fadeStartVolume)`), damit
     das Medium beim nächsten Resume nicht leise ist.
   - `sleep:ended { reason: 'completed' }` senden, Timer-State zurücksetzen.
6. **`cancelSleep`:** Intervall stoppen, laufendes Fade-Out abbrechen, Lautstärke auf
   `fadeStartVolume` zurücksetzen (falls Fade schon lief), `sleep:ended { reason: 'cancelled' }`
   senden, State zurücksetzen.
7. **Robustheit:** Wenn während des Timers das Medium pausiert/gestoppt wird (User), soll der
   Timer **weiterlaufen** (Countdown ist Wandzeit) — aber das Fade-Out nur greifen, wenn
   tatsächlich `playing`. Bei Stop durch User vor Ablauf: Timer cancelt sich selbst
   (`sleep:ended { reason: 'cancelled' }`), da kein Sinn mehr. (Auf `player:state` lauschen
   oder im Tick `getState().status` prüfen.)
8. In `app/src/main/index.ts` `initSleepTimer(...)` registrieren und `stopSleepService()` in
   `before-quit` aufräumen (analog zu den anderen Diensten).

**Dateien:** neu: `app/src/main/sleep/timer.ts`; geändert: `app/src/main/index.ts`.

**Akzeptanzkriterien:**
- [ ] `startSleep` für alle vier Modi berechnet korrekte Dauer; `chapterEnd` mappt bei
      kapitellosem Medium auf Track-Ende (E12)
- [ ] `sleep:tick` feuert ~1×/s mit korrektem `remainingMs`
- [ ] 60 s vor Ende lineares Fade-Out über `setVolume`; Lautstärke nach Ende/Abbruch
      wiederhergestellt
- [ ] Ende → `pause()` (kein `stop()`), Position persistiert, `sleep:ended` gesendet (E10)
- [ ] `cancelSleep` bricht sauber ab, kein Timer-Leak
- [ ] Dienst in `index.ts` gestartet + bei `before-quit` gestoppt
- [ ] `npm run typecheck` fehlerfrei

---

### T7.C3 — IPC-Handler `sleep:*` registrieren
**Größe:** S · **Abhängigkeiten:** T7.C1, T7.C2

Die drei `sleep:*`-Commands als dünne Handler in `register.ts`, die an den Timer-Dienst
delegieren.

**Schritte:**
1. In `app/src/main/ipc/register.ts` importieren und registrieren:
   ```ts
   import { startSleep, cancelSleep, getSleep } from '../sleep/timer';
   // …
   ipcMain.handle('sleep:start',  (_e, p: { mode: SleepMode }) => startSleep(p.mode));
   ipcMain.handle('sleep:cancel', () => cancelSleep());
   ipcMain.handle('sleep:get',    () => getSleep());
   ```
2. Fehler defensiv behandeln (kein Throw an den Renderer): `{ ok: false, endsAt: null }`
   bei Problemen in `startSleep`.

**Dateien:** geändert: `app/src/main/ipc/register.ts`.

**Akzeptanzkriterien:**
- [ ] Drei Handler registriert, delegieren an den Timer-Dienst
- [ ] `npm run typecheck` fehlerfrei

---

### T7.C4 — Cover-Pipeline im Main (lokal → Online-Fetch → Cache)
**Größe:** L · **Abhängigkeiten:** T7.C1

Ein gekapseltes Main-Modul, das für ein Medium das Cover beschafft: zuerst lokal, sonst
online (mit Timeout), Ergebnis im Cache. Reines Backend, kein Renderer-Zugriff.

**Schritte:**
1. Neue Datei `app/src/main/cover/pipeline.ts`:
   ```ts
   /** Liefert den lokalen Pfad zu einem Cover oder null (kein Cover/offline/Fehler). */
   export async function resolveCover(item: {
     path: string;        // Unit-Pfad (z.B. "audiobooks/Autor/Titel")
     type: 'audiobook' | 'music';
     title: string;
     artist?: string;
   }): Promise<string | null>;
   ```
2. **Schritt 1 — eingebettetes Cover (zuverlässigste Quelle):** Viele Audiodateien
   (MP3/ID3v2, M4B/M4A/MP4-Atom, FLAC/Vorbis) tragen ein Cover direkt in den Metadaten.
   Dieses Cover ist die **erste** Quelle, da es immer zum Medium passt.
   - Extraktion über die npm-Lib **`music-metadata`** (reines JavaScript, kein native
     rebuild, kein `electron-rebuild` nötig):
     ```ts
     import { parseFile } from 'music-metadata';
     const meta = await parseFile(absoluteFilePath);
     const pic = meta.common.picture?.[0];  // { data: Buffer, format: 'image/jpeg' | … }
     ```
   - Für **Ordner-Medien** (MP3-Ordner = Kapitel): die **erste** Datei im Ordner prüfen
     (Cover ist i.d.R. in jeder Datei identisch; eine reicht).
   - Bei Treffer: Bilddaten in den Cache schreiben (gleicher deterministischer Dateiname
     wie Schritt 3, atomar via `*.tmp` + `rename`), Cache-Pfad zurückgeben. So muss die
     Extraktion nur **einmal** pro Medium laufen.
   - `music-metadata` als Dependency in `app/package.json` ergänzen (`npm i music-metadata`).
3. **Schritt 2 — Datei im Verzeichnis:** im Medienverzeichnis nach `cover.jpg`, `folder.jpg`,
   `cover.png`, `folder.png` suchen (Reihenfolge fest). Medien-Basispfad ist die
   MPD-Music-Directory-Wurzel; den realen Pfad wie im übrigen Code ableiten
   (`<media-root>/<item.path>`). Bei Treffer: lokalen Pfad direkt zurückgeben
   (kein Cache nötig).
4. **Schritt 3 — Cache prüfen:** Cache-Dateiname deterministisch aus `item.path` ableiten
   (z. B. SHA-1 von `item.path` + `.jpg`). Liegt die Datei in
   `/mnt/hoermond/.cache/covers/` (Pfad als ENV `HOERMOND_COVER_CACHE` überschreibbar,
   default = T7.P3-Pfad), diesen Pfad zurückgeben.
5. **Schritt 4 — Online-Fetch:**
   - **MusicBrainz Cover Art Archive** zuerst (für Musik mit Release-MBID am zuverlässigsten):
     MusicBrainz-Suche nach `artist` + `album/title` → Release-MBID → Cover Art Archive
     `https://coverartarchive.org/release/<mbid>/front`.
   - **Last.fm** als Fallback (braucht API-Key; aus ENV `HOERMOND_LASTFM_KEY`, wenn nicht
     gesetzt → Schritt überspringen).
   - **HTTP nur über Node-`fetch`** (Node ≥ 18) mit **`AbortController`-Timeout (z. B. 5 s)**.
     User-Agent setzen (MusicBrainz verlangt es: z. B. `Hoermond/1.0 (krausp86@gmail.com)`).
     MusicBrainz-Rate-Limit (1 req/s) respektieren — Fetches serialisieren, nicht parallel.
   - Erfolg: Bilddaten in den Cache schreiben (atomar: in `*.tmp` schreiben, dann `rename`),
     lokalen Cache-Pfad zurückgeben.
6. **Fehlschlag/offline:** still `null` zurückgeben, loggen (`console.warn`), **niemals**
   werfen oder eine Fehlermeldung Richtung Renderer (E2/E3 — Kind soll nichts merken).
7. **Concurrency-Guard:** pro `item.path` darf nur **ein** Fetch gleichzeitig laufen
   (Map `path → Promise`), damit `library:list` + S5 nicht doppelt fetchen.
8. Singleton `getCoverPipeline()` exportieren.

**Hinweise:**
- Beachte den Architektur-Grundvertrag: dies läuft **ausschließlich** im Main. Der Renderer
  bekommt nur fertige `coverPath`-Werte (T7.C5) bzw. `cover:status`-Events.
- `file://`-Präfix fügt der Renderer hinzu (S5 macht das schon: `src={`file://${coverPath}`}`).
  Die Pipeline liefert reine Dateipfade.

**Dateien:** neu: `app/src/main/cover/pipeline.ts`; geändert: `app/package.json`
(`music-metadata` als Dependency).

**Akzeptanzkriterien:**
- [ ] Eingebettetes Cover (ID3/M4B/FLAC) wird als **erste** Quelle extrahiert und gecacht
- [ ] Datei im Verzeichnis (cover/folder .jpg/.png) als zweite Quelle gefunden
- [ ] Cache-Treffer ohne erneute Extraktion/Fetch
- [ ] Online-Fetch mit Timeout, korrektem User-Agent, MusicBrainz-Rate-Limit
- [ ] Fehlschlag/offline → `null`, kein Throw, keine Renderer-Fehlermeldung (E2/E3)
- [ ] Kein Doppel-Fetch pro Medium (Concurrency-Guard)
- [ ] Atomares Schreiben in den Cache
- [ ] `music-metadata` in `package.json` (reines JS, kein native rebuild)
- [ ] `npm run typecheck` fehlerfrei

---

### T7.C5 — `library:list` füllt `coverPath` + `cover:status`-Events
**Größe:** M · **Abhängigkeiten:** T7.C4

Die Cover-Pipeline an `library:list` anschließen: lokale/gecachte Cover sofort liefern,
fehlende asynchron nachladen und per Event nachreichen.

**Schritte:**
1. In `app/src/main/library/list.ts` (Zeile 109, aktuell `coverPath: undefined`) für jedes
   Medium die Pipeline **nicht-blockierend** nutzen:
   - **Synchroner Schnellpfad:** nur lokales Cover + Cache prüfen (kein Netz) und, falls
     vorhanden, `coverPath` direkt setzen. (Pipeline ggf. um eine reine
     `resolveCoverSync(item)`-Variante ohne Netz erweitern, oder einen `{ netz: false }`-Flag.)
   - So blockiert `library:list` **nicht** auf Netz-Fetches (Grid lädt sofort).
2. Für Medien **ohne** lokales/gecachtes Cover: nach der Antwort einen Hintergrund-Fetch
   anstoßen (`resolveCover(item)` mit Netz). `library:list` selbst darf nicht auf diese
   Fetches warten.
3. Beim Fetch-Verlauf `cover:status`-Events senden (via `getWindow`):
   - direkt vor dem Netz-Fetch: `{ path, phase: 'pending' }` (Renderer zeigt Shimmer).
   - Erfolg: `{ path, phase: 'ready', coverPath }`.
   - Fehlschlag: `{ path, phase: 'failed' }` (Renderer bleibt beim Platzhalter).
   Dazu muss `listLibrary()` Zugriff auf `getWindow` bekommen — Signatur erweitern
   (`listLibrary(getWindow?)`) und der `library:list`-Handler in register.ts den `getWindow`
   durchreichen (er hat ihn bereits).
4. **Idempotenz:** Fetches nicht bei jedem `library:list`-Aufruf neu starten, wenn schon
   einer läuft oder das Medium zuletzt `failed` war (sonst Fetch-Sturm bei jedem Re-Render).
   Der Concurrency-Guard aus T7.C4 deckt „läuft schon" ab; für „zuletzt failed" eine kleine
   In-Memory-Menge fehlgeschlagener Pfade halten (Reset bei `library:rescan`).

**Dateien:** geändert: `app/src/main/library/list.ts`, `app/src/main/ipc/register.ts`
(getWindow durchreichen).

**Akzeptanzkriterien:**
- [ ] `library:list` liefert lokale/gecachte Cover sofort in `coverPath`, ohne auf Netz zu warten
- [ ] Fehlende Cover werden im Hintergrund gefetcht; `cover:status` (pending/ready/failed)
      wird gesendet
- [ ] Kein Fetch-Sturm (kein erneuter Fetch bei laufendem/zuletzt-fehlgeschlagenem Medium)
- [ ] `npm run typecheck` fehlerfrei

---

### T7.C6 — Sync-Status-Aggregation im Main
**Größe:** M · **Abhängigkeiten:** T7.C1

Aus den vorhandenen `sync:status`-Roh-Events (von `startSyncLogBridge`) einen aggregierten
Gesamtstatus (✅/🔄/⚠️) ableiten und das Log der letzten 10 Vorgänge bereitstellen.

**Schritte:**
1. Neue Datei `app/src/main/sync/state.ts`:
   ```ts
   import type { SyncState, SyncLogEntry } from '@shared/ipc-contract';
   export function initSyncState(getWindow: () => BrowserWindow | null): () => void;
   export function getSyncState(): SyncState;
   export function getSyncLog(): SyncLogEntry[];   // letzte 10, neueste zuerst
   ```
2. **Quelle:** `startSyncLogBridge` sendet bereits `sync:status` an den **Renderer**. Damit
   die Aggregation im Main mithört, die Bridge so anpassen, dass sie zusätzlich einen
   internen Callback bedient — sauberste Lösung: `startSyncLogBridge` einen optionalen
   `onEvent?: (ev: SyncStatus) => void`-Parameter geben, oder die Roh-Events über einen
   kleinen Main-internen EventEmitter publizieren, den `state.ts` abonniert. (Renderer-Pfad
   `sync:status` bleibt unverändert.)
3. **Aggregationsregeln:**
   - `phase: 'started'` → `state = 'running'`.
   - `phase: 'completed'` → `state = 'idle'` (✅ aktuell).
   - `phase: 'error'` → `state = 'error'` (bleibt `error`, bis ein neuer `started`/`completed`
     den Zustand überschreibt).
4. Bei jedem Zustandswechsel `sync:state { state }` an den Renderer senden (nur bei echtem
   Wechsel — entprellen).
5. **Log der letzten 10:** jeden Roh-Event als `SyncLogEntry` in einen Ringpuffer (max. 10,
   neueste zuerst) aufnehmen.
6. **Persistenz über Neustart:** Ringpuffer + letzter `state` in `settings` (via
   `setSetting`/`getSetting`, JSON-serialisiert) ablegen, beim `init` wieder laden — damit
   nach App-Neustart das Icon nicht fälschlich „idle" zeigt und S10 die Historie behält.
   (Kein neues DB-Schema nötig.)
7. In `index.ts`: `initSyncState(...)` starten (vor/nach `startSyncLogBridge`), Cleanup in
   `before-quit`.

**Dateien:** neu: `app/src/main/sync/state.ts`; geändert: `app/src/main/sync/watch-log.ts`
(internen Callback/Emitter), `app/src/main/index.ts`, `app/src/main/ipc/register.ts`
(Handler `sync:getState`, `sync:getLog`).

**Handler in register.ts:**
```ts
ipcMain.handle('sync:getState', () => ({ state: getSyncState() }));
ipcMain.handle('sync:getLog',   () => ({ entries: getSyncLog() }));
```

**Akzeptanzkriterien:**
- [ ] `sync:state` (idle/running/error) wird bei jedem echten Wechsel gesendet
- [ ] `sync:getState` / `sync:getLog` liefern aktuellen Stand bzw. letzte 10 Einträge
- [ ] `error`-Zustand bleibt bis zum nächsten started/completed bestehen (E8)
- [ ] Zustand + Log über App-Neustart persistent (`settings`)
- [ ] Renderer-Pfad `sync:status` unverändert
- [ ] `npm run typecheck` fehlerfrei

---

### T7.C7 — de.json: Schlaf-/Cover-/Sync-Strings
**Größe:** S · **Abhängigkeiten:** keine

Alle neuen UI-Strings key-basiert in `de.json` ergänzen (additiv, bestehende nicht ändern).
**Beachte:** `useT()` (in `i18n/I18nContext.tsx`) unterstützt **keine** Interpolation —
Platzhalter wie `{min}` per `String.replace` im Renderer ersetzen.

**Strings:**
```json
"sleep.title": "Schlaf-Timer",
"sleep.mode.min15": "15 Minuten",
"sleep.mode.min30": "30 Minuten",
"sleep.mode.min60": "60 Minuten",
"sleep.mode.chapterEnd": "Bis Ende des Kapitels",
"sleep.icon": "Schlaf-Timer",
"sleep.cancel": "Abbrechen",
"sleep.close": "Schließen",
"sleep.countdown.label": "Schläft in",
"sleep.countdown.tapToCancel": "Tippen zum Abbrechen",
"cover.loading": "Cover wird geladen",
"sync.state.idle": "Aktuell",
"sync.state.running": "Synchronisiert …",
"sync.state.error": "Letzte Synchronisierung fehlgeschlagen",
"sync.icon.idle": "Bibliothek aktuell",
"sync.icon.running": "Synchronisierung läuft",
"sync.icon.error": "Synchronisierung fehlgeschlagen",
"sync.details.title": "Synchronisierung",
"sync.details.close": "Schließen",
"sync.log.title": "Sync-Protokoll",
"sync.log.empty": "Noch keine Synchronisierung",
"sync.log.started": "Gestartet",
"sync.log.completed": "Abgeschlossen",
"sync.log.error": "Fehler"
```

**Hinweis:** `settings.syncLog` / `settings.syncLog.placeholder` existieren bereits — den
Platzhalter-Key in S10 ersetzt T7.C12; den String selbst nicht löschen (nur nicht mehr
referenzieren ist ok, oder belassen).

**Dateien:** geändert: `app/src/renderer/src/i18n/de.json`.

**Akzeptanzkriterien:**
- [ ] Alle Keys vorhanden, JSON valide, keine Duplikate
- [ ] Keine bestehenden Keys verändert

---

### T7.C8 — Mond-Icon in S5 tippbar → S8
**Größe:** S · **Abhängigkeiten:** T7.C1

Das vorhandene Mond-Icon in der S5-Titelleiste (`S5Player.tsx`, Zeile 224–232,
„Moon icon (placeholder, no function)") tippbar machen, sodass es den S8-Dialog öffnet.

**Schritte:**
1. In `S5Player.tsx` einen lokalen State ergänzen: `const [sleepOpen, setSleepOpen] = useState(false);`
2. Das Mond-`<svg>` in ein `<Pressable onTap={() => setSleepOpen(true)} ariaLabel={t('sleep.icon')}>`
   einwickeln — exakt nach dem Muster des BT-Icons direkt darüber (Zeile 181–222).
3. Wenn der Schlaf-Timer aktiv ist, das Icon optisch markieren (z. B. CSS-Klasse
   `s5-moon-icon--active`, Akzentfarbe `--flieder-deep`). Den aktiven Zustand aus dem
   Countdown-State (T7.C9) ableiten.
4. S8-Overlay konditional rendern (kommt aus T7.C9): `{sleepOpen && <S8SleepTimer onClose={() => setSleepOpen(false)} />}`.

**Dateien:** geändert: `app/src/renderer/src/screens/S5Player.tsx`, `screens.css`.

**Akzeptanzkriterien:**
- [ ] Mond-Icon ist tippbar, öffnet S8 (Aria-Label `sleep.icon`)
- [ ] Aktiver Timer markiert das Icon optisch
- [ ] BT-Icon und übrige Titelleiste unverändert
- [ ] `npm run typecheck` fehlerfrei

---

### T7.C9 — S8 Schlaf-Timer-Dialog + Countdown-Anzeige in S5
**Größe:** L · **Abhängigkeiten:** T7.C1, T7.C7, T7.C8

Der modale Schlaf-Timer-Dialog (S8) plus die laufende Countdown-Anzeige im Player mit
Tap-zum-Abbrechen.

**Schritte:**
1. Neue Datei `app/src/renderer/src/screens/S8SleepTimer.tsx`:
   ```ts
   interface S8Props { onClose: () => void; }
   ```
2. **Beim Mount** `sleep:get` aufrufen → wenn aktiv, den aktiven Modus markieren.
3. **Vier Auswahl-Buttons** (`sleep.mode.min15/min30/min60/chapterEnd`). Tap →
   `sleep:start { mode }`, danach `onClose()`. Buttons mit `<Pressable>`, Touch-Targets ≥ 44 px,
   Abstand ≥ 16 px.
4. Wenn ein Timer **aktiv** ist: zusätzlich „Abbrechen"-Button (`sleep.cancel`) → `sleep:cancel`.
5. **Modal-Muster** wie S4/S6/S7/S9: Scrim `--scrim`, Enter 220 ms (Fade + Scale 0,96→1,0),
   Exit 160 ms, Tap außerhalb oder Schließen-Element → `onClose`.
6. CSS in `screens.css`: `.s8-*` (Dialog-Card, Moduswahl-Liste, aktiver Modus hervorgehoben).
7. **Countdown-Anzeige in S5** (separat vom Dialog, immer sichtbar wenn Timer aktiv):
   - In `S5Player.tsx` `sleep:tick` / `sleep:ended` abonnieren und beim Mount `sleep:get`
     laden:
     ```ts
     const [sleepRemainingMs, setSleepRemainingMs] = useState<number | null>(null);
     useEffect(() => {
       void window.hoermond.invoke('sleep:get', undefined).then((s) =>
         setSleepRemainingMs(s.active && s.endsAt ? s.endsAt - Date.now() : null));
       const offTick = window.hoermond.on('sleep:tick', (e) => setSleepRemainingMs(e.remainingMs));
       const offEnd = window.hoermond.on('sleep:ended', () => setSleepRemainingMs(null));
       return () => { offTick(); offEnd(); };
     }, []);
     ```
   - Bei `sleepRemainingMs !== null`: kompakten Countdown rendern (mm:ss), z. B. nahe der
     Titelleiste oder über den Controls. Label `sleep.countdown.label`.
   - **Tap auf den Countdown** → `sleep:cancel` (E10: „Tap auf Countdown bricht ab").
     Hinweistext `sleep.countdown.tapToCancel`.
   - Countdown lokal jede Sekunde herunterzählen (wie der `localPosition`-Tick in S5),
     Server-`sleep:tick` als autoritative Korrektur.
8. **Kein Stop, kein Resume-Bruch:** Der Renderer löst beim Timer-Ende **nichts** aus — der
   Main pausiert (T7.C2). Der Renderer reagiert nur auf `sleep:ended` (Countdown ausblenden);
   `player:state` (von der idle loop) liefert ohnehin den neuen `paused`-Status.

**Dateien:** neu: `app/src/renderer/src/screens/S8SleepTimer.tsx`; geändert:
`app/src/renderer/src/screens/S5Player.tsx`, `screens.css`.

**Akzeptanzkriterien:**
- [ ] S8 zeigt vier Modi; Auswahl startet `sleep:start`, aktiver Timer abbrechbar
- [ ] Modal: Scrim, Enter 220 / Exit 160, Tap außerhalb schließt
- [ ] Countdown in S5 sichtbar während aktiv (mm:ss), zählt sekündlich herunter
- [ ] Tap auf Countdown → `sleep:cancel`, Countdown verschwindet
- [ ] `sleep:ended` blendet Countdown aus
- [ ] `npm run typecheck` fehlerfrei

---

### T7.C10 — Cover.tsx: Shimmer-Zustand
**Größe:** M · **Abhängigkeiten:** T7.C1, T7.C7

Die `Cover`-Komponente um einen **Shimmer-Ladezustand** erweitern (während Online-Fetch),
mit Fallback auf den bereits vorhandenen Platzhalter.

**Schritte:**
1. In `app/src/renderer/src/components/Cover.tsx` eine optionale Prop ergänzen:
   ```ts
   interface CoverProps { title: string; coverPath?: string; size: number; loading?: boolean; }
   ```
2. **Render-Reihenfolge:**
   - `coverPath` vorhanden → Bild (wie bisher).
   - sonst `loading === true` → **Shimmer** über dem Platzhalter (Initial + Farbe bleibt
     darunter sichtbar; Shimmer ist ein Sweep-Gradient-Overlay).
   - sonst → Platzhalter (bestehende Logik unverändert).
3. **Shimmer-Animation** in `screens.css` (oder `theme.css`):
   - Sweep-Gradient, **eine Passage pro 1,2 s** (§4.2), Winkel ~30°.
   - **Kein Blinken / keine > 3 Hz-Flackerung** (WCAG 2.3.1). `prefers-reduced-motion`
     respektieren (dann statischer Platzhalter ohne Animation).
   - Klassenname z. B. `.cover-shimmer`.
4. Aria: Shimmer-Overlay `aria-hidden`, Komponente kann `aria-label={t('cover.loading')}`
   tragen, wenn `loading`.
5. **Aufrufer verdrahten:** wer `cover:status`-Events kennt (Grid via `library:updated`/lokaler
   State, S5 via eigenes Abo), setzt `loading` auf `true` bei `phase: 'pending'`, ersetzt
   `coverPath` bei `ready`, und auf `false` (Platzhalter) bei `failed`. Den Event-Pfad in der
   jeweiligen Grid-/S5-Komponente abonnieren (kleiner Zusatz; Hauptlogik liegt in dieser
   Komponente). **Keine Fehlermeldung** bei `failed` — einfach Platzhalter (E2/E3).

**Dateien:** geändert: `app/src/renderer/src/components/Cover.tsx`, `screens.css`;
ggf. `app/src/renderer/src/screens/LibraryGrid.tsx` (Abo `cover:status`).

**Akzeptanzkriterien:**
- [ ] `loading`-Prop zeigt Shimmer über dem Platzhalter; ohne `loading` reiner Platzhalter
- [ ] Shimmer: 1 Passage / 1,2 s, kein Flackern, `prefers-reduced-motion` respektiert
- [ ] `cover:status` ready → Bild erscheint; failed → Platzhalter bleibt, keine Fehlermeldung
- [ ] Bestehende Platzhalter-Logik unverändert
- [ ] `npm run typecheck` fehlerfrei

---

### T7.C11 — Sync-Status-Icon in Titelleiste + Tap-Details
**Größe:** M · **Abhängigkeiten:** T7.C1, T7.C6, T7.C7

Ein Sync-Status-Icon (✅/🔄/⚠️) in der Titelleiste der Kinder-Screens (S1 / Grid), live aus
`sync:state`. Tap auf ⚠️ öffnet ein dezentes Detail-Overlay.

**Schritte:**
1. Neue Komponente `app/src/renderer/src/components/SyncStatusIcon.tsx`:
   - Beim Mount `sync:getState` laden, `sync:state` abonnieren.
   - Drei Zustände:
     - `idle` → ✅ in Success-Grün `--success #2E7D52`. Aria `sync.icon.idle`.
     - `running` → 🔄 in Info-Blau `--info #2563B0`, **Drehung 360° / 1,4 s linear, endlos**
       (§4.2). Aria `sync.icon.running`.
     - `error` → ⚠️ in Amber `--warning #A85F0C` (bewusst kein aggressives Rot). Aria
       `sync.icon.error`.
   - Jeder Zustand trägt **Icon + Farbe** (nicht nur Farbe), für Kontrast/Barrierefreiheit.
   - SVG-Icons inline (wie die BT-Icons in S5), `viewBox="0 0 24 24"`.
2. **Tap-Verhalten:** nur im `error`-Zustand tippbar → öffnet ein dezentes Detail-Overlay
   (für Eltern relevant, fürs Kind unauffällig, E8). Im `idle`/`running`-Zustand nicht
   interaktiv (oder no-op). Details: letzter Fehler-Eintrag aus `sync:getLog` (Phase + ts +
   message). Overlay nach Standard-Muster (Scrim, 220/160), Schließen via Tap außerhalb.
3. **Platzierung:** in die Titelzone von S1 und LibraryGrid einsetzen (dort, wo Platz ist,
   nicht mit BackButton kollidierend). Nicht auf S5 (dort dominiert der Player) — Spec nennt
   „Titelleiste" der Bibliothek/Startscreen.
4. **Animation** in `screens.css`: `@keyframes sync-spin { to { transform: rotate(360deg) } }`,
   `animation: sync-spin 1.4s linear infinite;` nur im `running`-Zustand. `prefers-reduced-motion`:
   Drehung deaktivieren, stattdessen statisches 🔄. **Kein** Toast bei Sync-Fehler (E8 —
   unauffällig).

**Dateien:** neu: `app/src/renderer/src/components/SyncStatusIcon.tsx`; geändert:
`app/src/renderer/src/screens/S1Start.tsx`, `app/src/renderer/src/screens/LibraryGrid.tsx`,
`screens.css`.

**Akzeptanzkriterien:**
- [ ] Icon zeigt ✅/🔄/⚠️ live aus `sync:state`, jeweils Icon + Farbe
- [ ] 🔄 dreht 360°/1,4 s linear endlos; `prefers-reduced-motion` respektiert
- [ ] ⚠️ Amber (kein Rot); Tap → Detail-Overlay mit letztem Fehler (E8)
- [ ] Kein Sync-Toast; fürs Kind unauffällig
- [ ] `npm run typecheck` fehlerfrei

---

### T7.C12 — S10: Sync-Log-Ansicht
**Größe:** M · **Abhängigkeiten:** T7.C1, T7.C6, T7.C7

Den Sync-Log-Platzhalter in S10 (`S10Settings.tsx`, Zeile 246–249,
`settings.syncLog.placeholder` = „Bald verfügbar") durch die Ansicht der letzten 10
Sync-Vorgänge ersetzen.

**Schritte:**
1. In `S10Settings.tsx` beim Mount `sync:getLog` laden:
   ```ts
   const [syncLog, setSyncLog] = useState<SyncLogEntry[]>([]);
   useEffect(() => {
     void window.hoermond.invoke('sync:getLog', undefined).then((r) => setSyncLog(r.entries));
   }, []);
   ```
   Optional live aktualisieren via `sync:state`-Abo (dann erneut `sync:getLog`).
2. Die Platzhalter-Sektion (Zeile 246–249) ersetzen durch eine Liste:
   - Pro Eintrag: lokalisierte Phase (`sync.log.started/completed/error`), Zeitstempel
     (lesbar formatiert, z. B. `DD.MM. HH:mm`), optional `message`.
   - Fehler-Einträge dezent in Amber (`--warning`), nicht alarmierend.
   - Leere Liste → `sync.log.empty`.
3. **Slate/Parent-Theme** beibehalten (`--parent-accent`, `--parent-bg`).
4. CSS in `screens.css`: `.s10-synclog-*`.

**Dateien:** geändert: `app/src/renderer/src/screens/S10Settings.tsx`, `screens.css`.

**Akzeptanzkriterien:**
- [ ] S10-Sync-Sektion zeigt die letzten (≤ 10) Vorgänge statt „Bald verfügbar"
- [ ] Phase + Zeitstempel lesbar; Fehler dezent (Amber)
- [ ] Leere Liste → freundlicher Hinweis
- [ ] Parent-Theme erhalten; BT-Sektion unverändert
- [ ] `npm run typecheck` fehlerfrei

---

### T7.C13 — Display-Manager im Main (bl_power + Inaktivitäts-Timer)
**Größe:** L · **Abhängigkeiten:** T7.C1, T7.P2

Ein Main-seitiger Dienst, der das Display steuert. Kennt sowohl den Player-State (via
`startIdleLoop`) als auch Touch-Aktivität (via `display:touch` vom Renderer). Steuert das
Backlight über `/sys/class/backlight/10-0045/bl_power` (T7.P1-Ergebnis).

**Logik:**
- **Playing** → Display **immer an**, Inaktivitäts-Timer deaktiviert.
- **Nicht playing** → 5-min-Inaktivitäts-Timer läuft. Jeder Touch (via `display:touch`-IPC)
  resettet den Timer. Läuft der Timer ab → Display aus.
- **Touch bei dunklem Display** → Display sofort an, Timer neu starten,
  `display:state { on: true }` an Renderer senden (Renderer schluckt ersten Tap, T7.C15).
- **Wiedergabe-Start bei dunklem Display** → Display sofort an.

**Schritte:**
1. Neue Datei `app/src/main/display/manager.ts`:
   ```ts
   import type { BrowserWindow } from 'electron';

   export function initDisplayManager(getWindow: () => BrowserWindow | null): void;
   export function onPlayerStateChange(status: 'play' | 'pause' | 'stop'): void;
   export function onTouch(): void;
   export function stopDisplayManager(): void;
   ```
2. **Display-Steuerung** über `fs.writeFile` (T7.P2 hat `bl_power` direkt beschreibbar
   gemacht — kein sudo nötig):
   ```ts
   import { writeFile } from 'fs/promises';

   const BL_PATH = process.env.HOERMOND_BACKLIGHT_PATH
     ?? '/sys/class/backlight/10-0045/bl_power';

   async function displayOn() {
     try { await writeFile(BL_PATH, '0'); } catch (e) { console.warn('display on failed', e); }
     displayIsOn = true;
     getWindow()?.webContents.send('display:state', { on: true });
   }

   async function displayOff() {
     try { await writeFile(BL_PATH, '1'); } catch (e) { console.warn('display off failed', e); }
     displayIsOn = false;
     getWindow()?.webContents.send('display:state', { on: false });
   }
   ```
   Pfad als ENV `HOERMOND_BACKLIGHT_PATH` überschreibbar (für Entwicklung auf Nicht-Pi-Rechnern).
3. **Inaktivitäts-Timer:** 5-min-Timeout (`setTimeout`), bei jedem Aufruf von `onTouch()`
   oder `onPlayerStateChange('play')` zurücksetzen (`clearTimeout` + neues `setTimeout`).
   Bei Ablauf: `displayOff()`.
   ```ts
   const INACTIVITY_MS = 5 * 60 * 1000;  // ENV überschreibbar für Tests
   let inactivityTimer: ReturnType<typeof setTimeout> | null = null;

   function resetInactivityTimer() {
     if (inactivityTimer) clearTimeout(inactivityTimer);
     inactivityTimer = setTimeout(() => displayOff(), INACTIVITY_MS);
   }
   ```
4. **`onPlayerStateChange`:**
   - `'play'` → `displayOn()`, Inaktivitäts-Timer **deaktivieren** (Display bleibt dauerhaft
     an während Wiedergabe).
   - `'pause'` / `'stop'` → Inaktivitäts-Timer **starten** (5 min ab jetzt; Touches resetten
     ihn weiter).
5. **`onTouch`:**
   - Wenn Display **aus** → `displayOn()`, Timer neu starten. Das `display:state { on: true }`
     löst im Renderer den Tap-Swallow + Fade-In aus (T7.C15).
   - Wenn Display **an** → nur Timer resetten (kein Event nötig).
6. **Integration in `startIdleLoop`:** Die idle loop ruft bereits bei jedem Player-Event
   `getState()` ab und sendet `player:state`. An derselben Stelle
   `onPlayerStateChange(state.status)` aufrufen. Sauberste Lösung: der Display-Manager
   exportiert einen Callback, den die idle loop bei jedem Event ruft — **kein** Umbau der
   idle loop nötig, nur ein Aufruf ergänzen.
7. **`display:touch`-Handler** in `register.ts`:
   ```ts
   ipcMain.handle('display:touch', () => { onTouch(); });
   ```
8. In `app/src/main/index.ts`: `initDisplayManager(...)` starten (nach idle loop), Cleanup
   in `before-quit`.

**Dateien:** neu: `app/src/main/display/manager.ts`; geändert: `app/src/main/index.ts`,
`app/src/main/ipc/register.ts`, `app/src/main/mpd/idle.ts` (einen Aufruf ergänzen).

**Akzeptanzkriterien:**
- [ ] Wiedergabe aktiv → Display dauerhaft an (kein Timer)
- [ ] Nicht playing + keine Touch-Interaktion für 5 min → Display aus (E13)
- [ ] Jeder Touch resettet den 5-min-Timer
- [ ] Touch bei dunklem Display → Display sofort an, `display:state { on: true }` gesendet
- [ ] Wiedergabe-Start bei dunklem Display → Display sofort an
- [ ] `display:touch`-Handler in register.ts
- [ ] Dienst in `index.ts` gestartet + bei `before-quit` gestoppt
- [ ] `npm run typecheck` fehlerfrei

---

### T7.C15 — Touch-Wake im Renderer (Touch melden, 1. Tap schlucken, Fade-In)
**Größe:** M · **Abhängigkeiten:** T7.C1, T7.C13

Der Renderer-Anteil des Display-Managements: (1) jeden Touch an Main melden, (2) nach
Display-Wake den ersten Tap schlucken, (3) 300-ms-Fade-In.

**Schritte:**
1. **Jeden Touch an Main melden:** Ein globaler Event-Listener in `App.tsx` (oder ein
   `<DisplayTouchReporter>`-Wrapper) auf `pointerdown` in der **Capture-Phase**:
   ```tsx
   useEffect(() => {
     const handler = () => { window.hoermond.invoke('display:touch', undefined); };
     document.addEventListener('pointerdown', handler, true);  // capture
     return () => document.removeEventListener('pointerdown', handler, true);
   }, []);
   ```
   Das ist Fire-and-forget — der Renderer wartet nicht auf die Response. Der Main nutzt es
   zum Resetten des Inaktivitäts-Timers.

2. **`display:state`-Event abonnieren** und Display-Zustand tracken:
   ```tsx
   const [displayOff, setDisplayOff] = useState(false);
   useEffect(() => {
     const off = window.hoermond.on('display:state', (e) => setDisplayOff(!e.on));
     return () => off();
   }, []);
   ```

3. **Ersten Touch nach Wake schlucken:** Wenn `display:state { on: true }` nach einem
   vorherigen `on: false` kommt (= Wake), ein `wokeRecently`-Flag setzen. Ein zweiter
   Capture-Phase-Listener auf `pointerdown`/`touchstart` prüft das Flag:
   ```tsx
   const wokeRef = useRef(false);
   // Bei display:state on=true nach off:
   wokeRef.current = true;
   // Im Capture-Handler:
   if (wokeRef.current) {
     e.stopPropagation();
     e.preventDefault();
     wokeRef.current = false;
     return;
   }
   ```
   **Wichtig:** Der `display:touch`-Aufruf (Schritt 1) muss **trotzdem** feuern (er resettet
   den Timer), nur die UI-Weiterleitung wird geschluckt.

4. **300-ms-Fade-In:** Beim Wake ein Overlay mit `opacity 0→1` in 300 ms über die gesamte
   UI legen (CSS-Transition), danach entfernen. `prefers-reduced-motion` respektieren
   (dann kein Fade, sofort sichtbar).
   ```css
   .wake-fade { position: fixed; inset: 0; background: black; pointer-events: none;
                 opacity: 1; transition: opacity 300ms ease-out; z-index: 9999; }
   .wake-fade--visible { opacity: 0; }
   ```

5. **Kein Effekt im Normalbetrieb:** `wokeRecently` wird **nur** bei einem echten
   `off→on`-Übergang gesetzt. Wenn das Display nie aus war, werden Taps nie verschluckt.

**Dateien:** geändert: `app/src/renderer/src/App.tsx` (oder neu:
`components/WakeGuard.tsx`), `screens.css`.

**Akzeptanzkriterien:**
- [ ] Jeder Touch sendet `display:touch` an Main (Inaktivitäts-Timer-Reset)
- [ ] Erster Touch nach Display-Wake löst **kein** Play/Pause / keinen UI-Tap aus (E6)
- [ ] Zweiter Touch wirkt normal
- [ ] 300-ms-Fade-In beim Wake; `prefers-reduced-motion` respektiert
- [ ] Im Normalbetrieb (Display war an) werden Taps nie verschluckt
- [ ] `npm run typecheck` fehlerfrei

---

### T7.C14 — Polish-Pass: Timings §4.2 final abstimmen
**Größe:** M · **Abhängigkeiten:** alle UI-Tasks (T7.C9, T7.C10, T7.C11, T7.C12, T7.C13)

Abschließender Konsistenz-Durchlauf: alle Animationen/Übergänge gegen §4.2 prüfen und in
`theme.css` / `screens.css` final abstimmen. Keine neuen Features.

**Checkliste (§4.2, verbindlich):**
1. **Overlay/Dialog Ein:** 220 ms Fade + Scale 0,96→1,0; Scrim 200 ms — gilt für S4, S6, S7,
   **S8** und das Sync-Detail-Overlay (T7.C11).
2. **Overlay/Dialog Aus:** 160 ms Fade — alle Overlays.
3. **Toast:** Ein 200 ms, sichtbar 3,5 s, Aus 200 ms (bestehend, nur prüfen).
4. **Screen-Wake-Fade-In:** 300 ms (T7.C13).
5. **Cover-Shimmer:** 1 Passage / 1,2 s, ~30° (T7.C10).
6. **Sync-Icon „läuft":** Drehung 360° / 1,4 s linear endlos (T7.C11).
7. **Press-Feedback:** 90 ms rein / 120 ms zurück, Scale 0,96 (`<Pressable>`, bestehend).
8. **Reduzierte Animation:** keine > 3 Hz-Flackerung (WCAG 2.3.1); `prefers-reduced-motion`
   konsequent berücksichtigt.
9. **Timing-Konstanten zentralisieren:** wo möglich, Timings als CSS-Variablen in `theme.css`
   (z. B. `--t-overlay-in: 220ms`) statt verstreuter Magic-Numbers — erleichtert spätere
   Abstimmung. (Bestehende Werte konsolidieren, nicht erfinden.)

**Dateien:** geändert: `app/src/renderer/src/theme.css`, `app/src/renderer/src/screens.css`
(und punktuell die betroffenen Komponenten, falls Timings inline stehen).

**Akzeptanzkriterien:**
- [ ] Alle Timings stimmen mit §4.2 überein (visuell + im Code geprüft)
- [ ] Keine > 3 Hz-Flackerung; `prefers-reduced-motion` greift überall
- [ ] Timings möglichst über CSS-Variablen zentralisiert
- [ ] `npm run typecheck` fehlerfrei; App startet ohne Konsolenfehler

---

## Designkonstanten (Referenz für alle Tasks)

**Canvas:** 800×480 px Querformat, kein responsives Layout. Safe-Area 20 px, Titelleiste 44 px.
Kein Cursor, keine Hover-Zustände (Kiosk).

**Farben:** `--flieder #9B7EDC` (Akzent), `--flieder-deep #6E54B8` (Buttons/Icons, weißer Text
ok), `--flieder-tint #F2EDFB`, `--surface #FFFFFF`, `--text-primary #2A2342`,
`--text-secondary #6B6480`, `--scrim rgba(42,35,66,0.55)`.
**Statusfarben:** `--success #2E7D52` (✅ aktuell), `--info #2563B0` (🔄 läuft),
`--warning #A85F0C` (⚠️ fehlgeschlagen — weicher Amber, bewusst **kein** Rot).
**Parent-Theme (S10):** `--parent-accent #374151`, `--parent-bg #F3F4F6`.

**Timing (§4.2, verbindlich):** Press 90 ms rein / 120 ms zurück, Scale 0,96 (`<Pressable>`).
Overlay ein 220 ms (Fade + Scale 0,96→1,0) / aus 160 ms; Scrim 200 ms. Toast ein 200 ms /
sichtbar 3,5 s / aus 200 ms. **Screen-Wake-Fade-In 300 ms.** **Cover-Shimmer 1 Passage /
1,2 s (~30°).** **Sync-Icon-Drehung 360° / 1,4 s linear endlos.** Schlaf-Timer-Fade-Out
60 s vor Ende, linear. Keine > 3 Hz-Flackerung (WCAG 2.3.1); `prefers-reduced-motion`
respektieren.

**Touch-Targets:** mindestens 44 px Tap-Fläche, Mindestabstand ≥ 16 px.

**Pi-Pfade:** App auf dem Gerät `/home/player/hoermond/repo/app`. Cover-Cache
`/mnt/hoermond/.cache/covers/`. Sync-Log `/var/lib/mediaplayer/sync/sync.log`
(ENV `HOERMOND_SYNC_LOG`).
