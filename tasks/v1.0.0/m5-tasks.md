# M5 — Eltern-Gate & Einstellungen (S9/S10): Task-Plan

## Überblick & Abhängigkeitsgraph

M5 liefert **Spec-Phase 3 (Elternsperre) + Feature 10**: das versteckte **Eltern-Gate**
(langer Tap 2 s auf das Logo), den **PIN-Dialog S9** und die **Elterneinstellungen S10**
(Slate-Theme). Am Ende ist demonstrierbar:

- **Langer Tap auf das Logo (S1)**: ab 400 ms erscheint ein Fortschritts-Ring, der bis
  2000 ms füllt. Loslassen davor → nichts passiert (Ring verschwindet in 160 ms). Bei
  2000 ms öffnet **S9 PIN-Dialog**.
- **S9 PIN-Dialog**: numerisches Pad (keine Tastatur). Korrekte PIN (Standard `0000`)
  öffnet **S10**. Falsche PIN: Feld leeren, Shake (200 ms), Hinweis — **kein Lockout**.
- **S10 Elterneinstellungen** (Slate-Theme `--parent-accent`/`--parent-bg`): Max-Lautstärke
  (Standard 85 %), PIN ändern, manueller Rescan. **Platzhalter** für BT-Verwaltung (M6) und
  Sync-Log (M7). Verlassen → zurück nach S1.
- **Max-Lautstärke greift serverseitig**: Kind-Lautstärke-Commands werden auf `max_volume`
  geklemmt; am Limit visuelles „voll"-Feedback ohne Pegeländerung (E14).
- **PIN ist gehasht** in SQLite gespeichert (nie Klartext) und gilt nach Neustart.

**M5 hängt nur an M3** (Logo, S1, Navigation) und an der **M4-Lautstärkesteuerung**
(`player:setVolume` → `setVolume()` in `control.ts`). M4 ist im Repo bereits vollständig
implementiert und verifiziert (S5/S6, ProgressBar, PlayerControls, Kapitel-Handler).

### Was schon existiert (verifizierter Stand auf Branch `ms05` — NICHT neu bauen)

- **`settings`-Tabelle** existiert (Migration version 1) mit `key TEXT PRIMARY KEY,
  value TEXT NOT NULL` — **aktuell komplett ungenutzt**. Sie ist der vorgesehene Speicher
  für PIN-Hash und `max_volume`. Keine neue Tabelle nötig.
- **Migrations-Runner** (`app/src/main/db/index.ts`): wendet Versionen aufsteigend an,
  höchste vorhandene Version ist **3**. DB läuft im `journal_mode = DELETE` (overlayfs-
  sicher), `foreign_keys = ON`. DB-Pfad via `HOERMOND_DB_PATH` (Default
  `/var/lib/mediaplayer/state.db`).
- **DAO-Pattern** (`app/src/main/db/dao.ts`): freie Funktionen mit `db`-Parameter pro
  Concern (`upsertPosition`, `getLatestPosition`, `getOnboardingSeen`, …). M5 ergänzt hier
  Settings-DAO-Funktionen.
- **`setVolume(volume)`** in `app/src/main/mpd/control.ts` ist der **einzige** Pfad, über
  den der Renderer die Lautstärke ändert (`player:setVolume` → `setVolume`). Klemmt aktuell
  nur auf `[0,100]`. **Hier wird das Eltern-Limit serverseitig durchgesetzt.**
- **`player:setVolume`-Handler** in `app/src/main/ipc/register.ts`.
- **IPC-Vertrag** `app/src/shared/ipc-contract.ts`: Commands/Events typisiert; Whitelists
  `ALLOWED_COMMANDS`/`ALLOWED_EVENTS`; `REPLAYABLE_EVENTS` nur für One-Shot-Lifecycle.
- **Preload** (`app/src/preload/index.ts`) arbeitet **generisch** über die Whitelists —
  **neue Channels brauchen KEINE Preload-Änderung**, nur Eintrag in `ipc-contract.ts`.
- **`Logo.tsx`** hat bereits die **M5-Hooks** `onPointerDown` / `onPointerUp` /
  `onPointerLeave` (SVG-Element) — der Gate-Ring/Timer dockt dort an, ohne die Signatur zu
  ändern.
- **`useLongPress`** (`hooks/useLongPress.ts`) ist **600-ms-spezifisch** (S4-Kachel-Detail,
  inkl. Ring ab 300 ms). Für das 2000-ms-Gate wird ein **eigener** Hook gebaut (nicht den
  bestehenden umkonfigurieren — sonst bricht S4).
- **`Root.tsx`**: `Screen`-Union `{s0|s1|grid|s5}`. M5 erweitert sie additiv um `s9`/`s10`.
  MiniPlayer + S4-Overlay sind eingebunden und bleiben unverändert.
- **`theme.css`**: `--parent-accent: #374151` und `--parent-bg: #F3F4F6` sind **bereits
  definiert** (Kommentar „erst M5"). Scrim, Press-Timings, Typo-Utility-Klassen vorhanden.
- Wiederverwendbar: `<Pressable>`, `<BackButton>`, S4-Overlay-Muster (Scrim + Card,
  Enter 220 ms / Exit 160 ms), i18n via `useT()`, `screens.css`.
- **Keine** Krypto-Abhängigkeit im Projekt — PIN-Hashing nutzt das **Node-Builtin
  `crypto`** (scrypt), NICHT bcrypt/argon2 (vermeidet native Module + electron-rebuild).

### Reihenfolge & Arbeitsstränge

```
BACKEND ZUERST (Electron-Main, Laptop, Vitest-testbar)
  T5.01 Settings-DAO + Migration-Check (PIN-Hash + max_volume in settings-Tabelle)
     │
     ├── T5.02 PIN-Hashing-Utility (Node crypto scrypt, verify/hash) + Vitest
     │      │
     │      └── T5.03 IPC-Vertrag erweitern (settings:* + parent:* Commands)
     │             │
     │             ├── T5.04 IPC-Handler: settings get/set, PIN verify/change, rescan
     │             └── T5.05 Serverseitige Lautstärke-Klemmung in setVolume() (E14)
     │
FRONTEND (Renderer, Laptop)
  T5.06 de.json: Eltern-/PIN-/Settings-Strings
  T5.07 useParentGate-Hook (2000ms, Ring ab 400ms) — eigener Hook
  T5.08 Logo-Gate in S1 verdrahten (Ring-Rendering + Trigger)
  T5.09 S9 PIN-Dialog (numerisches Pad, Shake, kein Lockout)
  T5.10 S10 Elterneinstellungen (Slate-Theme, Max-Vol, PIN ändern, Rescan, Platzhalter)
  T5.11 E14-Anschlag-Feedback im Kind-Lautstärkeregler (PlayerControls/S5)

INTEGRATION (Laptop)
  (T5.04..T5.11) ── T5.12 Root-Navigation auf S9/S10 umstellen + typecheck + Vollfluss

PI-ABNAHME (auf dem Pi) — Meilenstein-Abnahme am echten Gerät
  T5.12 ── T5.13 Deploy + Gate-Geste gegen reale Kinder-Tippmuster
              ├── T5.14 PIN-Flow + Persistenz nach Neustart (echte DB)
              ├── T5.15 Max-Lautstärke wirkt hörbar serverseitig (E14)
              └── T5.16 Security-Review PIN-Speicherung (Klartext nirgends)
```

**Trennung Laptop (Repo) vs. Pi (Deployment):**
- **Codebase (Repo), auf dem Laptop — T5.01–T5.12:** Voll im Electron-Dev-Fenster (fix
  800×480) entwickel- und testbar. Backend-Logik (Hashing, Settings-DAO, Klemmung) mit
  Vitest und In-Memory-SQLite. Die Gate-Geste, S9/S10 und der gesamte Fluss sind im
  Dev-Fenster bedienbar. **Diese Tasks übergibt der implementierende Agent abgeschlossen.**
- **Pi (Deployment), übernimmt der User — T5.13–T5.16:** Projektregel: finale Abnahme jedes
  Meilensteins am echten Gerät. Die **2-s-Geste gegen reale Kinder-Tippmuster**, echtes
  kapazitives numerisches Pad, **hörbares** Lautstärke-Limit und die **Persistenz der
  echten SQLite** (`/var/lib/mediaplayer/state.db` über overlayfs) lassen sich nur dort
  verbindlich prüfen. Der Security-Review der PIN-Speicherung ist verpflichtend.

**Architektur-Grundvertrag (aus M1–M4, hier zwingend einzuhalten):**
- Electron-Main kapselt ALLE privilegierten Operationen (SQLite, MPD, Krypto); der Renderer
  ist **rein** und hält **keinen** Gerätezustand und **keine** Secrets. Die **Klartext-PIN
  verlässt nie den Main-Prozess** — der Renderer schickt sie nur zur Verifikation/Änderung
  und erhält ein `{ ok }` zurück, **niemals** den Hash.
- Kommunikation NUR über die IPC-Bridge (`window.hoermond.invoke` / `.on`); neue Channels
  **ausschließlich additiv** in `ALLOWED_COMMANDS` / `ALLOWED_EVENTS`.
- IPC-Namenskonvention: **Doppelpunkt-Namespacing** (`settings:getMaxVolume`, **nicht**
  `settings.getMaxVolume`).
- Alle UI-Strings in `de.json`, key-basiert über `useT()`. **Keine hartcodierten Strings im
  JSX.** Code/Bezeichner Englisch, UI-Strings Deutsch.
- **Scope-Disziplin:** BT-Verwaltung (M6) und Sync-Log (M7) sind in S10 nur **visuelle
  Platzhalter** ohne Funktion. Kein Lockout/Cooldown beim PIN (E11, bestätigt).

---

## Task-Liste (Übersicht)

| ID | Titel | Größe | Kategorie |
|----|-------|-------|-----------|
| T5.01 | Settings-DAO (PIN-Hash + max_volume in `settings`-Tabelle) | M | Codebase |
| T5.02 | PIN-Hashing-Utility (Node `crypto` scrypt) + Vitest | M | Codebase |
| T5.03 | IPC-Vertrag erweitern (`settings:*`-Commands) | S | Codebase |
| T5.04 | IPC-Handler: Settings get/set, PIN verify/change, Rescan | M | Codebase |
| T5.05 | Serverseitige Lautstärke-Klemmung in `setVolume()` (E14) | S | Codebase |
| T5.06 | `de.json` um Eltern-/PIN-/Settings-Strings erweitern | S | Codebase |
| T5.07 | `useParentGate`-Hook (2000 ms, Ring ab 400 ms) | M | Codebase |
| T5.08 | Logo-Gate in S1 verdrahten (Ring-Rendering + Trigger) | M | Codebase |
| T5.09 | S9 PIN-Dialog (numerisches Pad, Shake, kein Lockout) | L | Codebase |
| T5.10 | S10 Elterneinstellungen (Slate-Theme, Max-Vol, PIN, Rescan, Platzhalter) | L | Codebase |
| T5.11 | E14-Anschlag-Feedback im Kind-Lautstärkeregler | S | Codebase |
| T5.12 | Root-Navigation auf S9/S10 + typecheck + Vollfluss | M | Codebase |
| T5.13 | Deploy auf Pi + Gate-Geste gegen Kinder-Tippmuster | M | Pi |
| T5.14 | PIN-Flow + Persistenz nach Neustart (echte DB) | M | Pi |
| T5.15 | Max-Lautstärke wirkt hörbar serverseitig (E14) | M | Pi |
| T5.16 | Security-Review PIN-Speicherung | S | Pi |

---

## Designkonstanten (gilt für ALLE Tasks — Referenz, in den Tasks zitiert)

Werte aus `design-brief.md` / `milestones.md`, in den Einzeltasks wörtlich wiederholt,
damit jede Task isoliert umsetzbar ist.

**Canvas:** Feste Auflösung **800×480 px Querformat, KEIN responsives Layout**.
Safe-Area-Außenrand **20 px** (`--safe-area`). Basis-Spacing **8 px** (`--space-1..4` =
8/16/24/32). Titelleiste **44 px** (`--titlebar-h`).

**Eltern-Gate-Geste (Logo, langer Tap > 2 s) — verbindliche Timings:**
- Fortschritts-Ring um das Logo erscheint **ab 400 ms** (erste 400 ms ohne Feedback, damit
  normales Antippen nicht „flackert"), füllt **linear bis 2000 ms** (1600 ms Füllung).
- Strichbreite Ring **4 px**, Farbe `--flieder-deep`.
- Bei **2000 ms** öffnet S9. Loslassen davor: Ring verschwindet animiert in **160 ms**,
  **nichts** passiert.
- Der Ring ist die **einzige** sichtbare Affordanz und erscheint **nur während des Haltens**
  — das Logo signalisiert sonst keine Tap-Funktion (bewusst versteckt vor dem Kind).

**S9 PIN-Dialog:**
- **Numerisches Pad** (Ziffern 0–9 + Löschen), **keine** Systemtastatur, **keine**
  Texteingabe. 4-stellige PIN.
- Standard-PIN `0000` (gilt, solange keine geändert wurde).
- Falsche PIN (E11): **kein Lockout, kein Cooldown.** Feld leeren, **horizontale
  Shake-Animation 200 ms**, dezenter Hinweis, sofort erneut eingebbar.
- Modal-Overlay über S1, Scrim `--scrim`, Enter 220 ms (Fade+Scale 0,96→1,0) / Exit 160 ms
  (Muster wie S4Detail).

**S10 Elterneinstellungen (bewusst „erwachsen", visuell vom Kindbereich getrennt):**
- **Slate-Theme:** `--parent-accent: #374151` (Buttons/Header/Akzent),
  `--parent-bg: #F3F4F6` (Hintergrund). Weiß auf `--parent-accent` = 10,3:1 (AA erfüllt).
- Inhalte: **Max-Lautstärke** (Regler/Stepper 0–100 %, Standard **85 %**), **PIN ändern**,
  **manueller Rescan** (Button). **Platzhalter-Sektionen** für BT-Verwaltung (M6) und
  Sync-Log (M7) — sichtbar, aber **ohne Funktion**.
- Verlassen (Zurück/Schließen) → **zurück nach S1**.
- Typo: Body **18 px** (Untergrenze), Tiny 15 px nur für sekundäre Labels.

**Lautstärke-Limit (E14, serverseitig):**
- Standard `max_volume` = **85 %**. Kind-Lautstärke-Commands (`player:setVolume`) werden im
  Main auf `min(angefragt, max_volume)` geklemmt. **Hard-Cap im Main**, nicht nur im UI —
  ein direkter IPC-Call darf das Limit nicht umgehen.
- Am Limit: UI zeigt „am Anschlag" (Balken voll, kurzes Press-Feedback **ohne**
  Pegeländerung); kein Fehler.

**PIN-Sicherheit:**
- PIN wird **gehasht** gespeichert (Node `crypto.scryptSync` mit zufälligem Salt), Format
  `scrypt$<saltHex>$<hashHex>`. **Nie Klartext** in der DB, nie im Renderer, nie im Log.
- Vergleich konstantzeitig (`crypto.timingSafeEqual`).

**Farb-/Typo-/Timing-Tokens (CSS-Variablen, bereits in `theme.css`):**
- `--flieder #9B7EDC` (Akzent, **nie mit weißem Text**), `--flieder-deep #6E54B8`
  (Buttons/Ring, weißer Text ok), `--flieder-tint #F2EDFB`, `--surface #FFFFFF`,
  `--text-primary #2A2342`, `--text-secondary #6B6480`, `--scrim rgba(42,35,66,0.55)`,
  `--parent-accent #374151`, `--parent-bg #F3F4F6`.
- Press-Feedback **90 ms rein / 120 ms zurück, Scale 0,96** (`<Pressable>` liefert das).
- Overlay **ein 220 ms / aus 160 ms**. **Kein Cursor, keine Hover-Zustände** (Kiosk).

---

## Tasks (Detail)

### T5.01 — Settings-DAO (PIN-Hash + max_volume in `settings`-Tabelle)
**Größe:** M · **Kategorie:** Codebase
**Abhängigkeiten:** keine
**Vorbedingung:** `app/src/main/db/dao.ts`, `migrations.ts`, `index.ts` existieren
(verifiziert). Die `settings`-Tabelle (`key`, `value`) existiert aus Migration version 1
und ist bislang ungenutzt.

**Ziel:** Eine getypte DAO-Schicht über die bestehende `settings`-Tabelle, um beliebige
Key/Value-Settings zu lesen/schreiben, plus dedizierte Helfer für `max_volume` und den
PIN-Hash. **Keine neue Tabelle, keine neue Migration nötig** — die `settings`-Tabelle wird
hier erstmals genutzt.

**Beschreibung (Schritt für Schritt):**
1. In `app/src/main/db/dao.ts` generische Settings-Funktionen ergänzen:
   ```ts
   /** Read a raw setting value by key, or undefined if not set. */
   export function getSetting(db: Database.Database, key: string): string | undefined {
     const row = db.prepare(`SELECT value FROM settings WHERE key = @k`).get({ k: key }) as
       | { value: string }
       | undefined;
     return row?.value;
   }

   /** Insert or update a setting value (upsert by key). */
   export function setSetting(db: Database.Database, key: string, value: string): void {
     db.prepare(
       `INSERT INTO settings (key, value) VALUES (@k, @v)
        ON CONFLICT(key) DO UPDATE SET value = @v`,
     ).run({ k: key, v: value });
   }
   ```
2. Konstante Keys zentral definieren (am Dateikopf oder in einer kleinen Konstante), damit
   sie nicht als Magic-Strings verstreut sind:
   ```ts
   export const SETTING_KEYS = {
     MAX_VOLUME: 'max_volume',
     PIN_HASH: 'pin_hash',
   } as const;
   ```
3. Dedizierte Helfer mit Defaults:
   ```ts
   /** Max child volume (0..100). Default 85 if unset. */
   export function getMaxVolume(db: Database.Database): number {
     const raw = getSetting(db, SETTING_KEYS.MAX_VOLUME);
     const n = raw != null ? parseInt(raw, 10) : NaN;
     return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 85;
   }

   export function setMaxVolume(db: Database.Database, value: number): void {
     const clamped = Math.max(0, Math.min(100, Math.floor(value)));
     setSetting(db, SETTING_KEYS.MAX_VOLUME, String(clamped));
   }

   /** Returns the stored PIN hash string, or undefined if no PIN was ever set. */
   export function getPinHash(db: Database.Database): string | undefined {
     return getSetting(db, SETTING_KEYS.PIN_HASH);
   }

   export function setPinHash(db: Database.Database, hash: string): void {
     setSetting(db, SETTING_KEYS.PIN_HASH, hash);
   }
   ```

**Caveats:**
- **Keine** Migration anlegen — die `settings`-Tabelle existiert bereits. Nur falls beim
  Lesen der bestehenden Migrationen festgestellt wird, dass die Tabelle NICHT existiert
  (sollte nicht passieren), eine additive Migration version 4 ergänzen — sonst nicht.
- Default `max_volume = 85` (Spec). Default-PIN wird **nicht** als Hash in die DB
  geschrieben; `getPinHash` liefert `undefined`, wenn nie eine PIN gesetzt wurde — die
  Verifikation gegen `'0000'` passiert in T5.02/T5.04 (Fallback bei fehlendem Hash).
- Werte werden als Strings gespeichert (Tabelle ist Key/Value-Text) — Parsing defensiv.

**Dateien/Artefakte:**
- geändert: `app/src/main/db/dao.ts`.

**Akzeptanzkriterien:**
- [ ] `getSetting`/`setSetting` lesen/schreiben Key/Value in der bestehenden Tabelle.
- [ ] `getMaxVolume` liefert 85, wenn nichts gesetzt ist; sonst den geklemmten gespeicherten
      Wert.
- [ ] `getPinHash` liefert `undefined`, wenn nie eine PIN gesetzt wurde.
- [ ] `npm run typecheck` fehlerfrei.

---

### T5.02 — PIN-Hashing-Utility (Node `crypto` scrypt) + Vitest
**Größe:** M · **Kategorie:** Codebase
**Abhängigkeiten:** keine (parallel zu T5.01)
**Vorbedingung:** Node-Builtin `crypto` verfügbar (Electron-Main). **Keine** neue npm-
Abhängigkeit.

**Ziel:** Eine kleine, getestete Utility zum Hashen und Verifizieren der 4-stelligen PIN —
mit dem **Node-Builtin `crypto`** (scrypt + zufälliger Salt), **ohne** bcrypt/argon2 (die
wären native Module und müssten auf dem Pi via electron-rebuild gebaut werden — vermeiden).

**Beschreibung:**
1. Neue Datei `app/src/main/security/pin.ts`:
   ```ts
   import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

   const SCRYPT_KEYLEN = 32;
   const SALT_BYTES = 16;
   const PREFIX = 'scrypt';

   /** Hash a PIN with a random salt. Format: "scrypt$<saltHex>$<hashHex>". */
   export function hashPin(pin: string): string {
     const salt = randomBytes(SALT_BYTES);
     const hash = scryptSync(pin, salt, SCRYPT_KEYLEN);
     return `${PREFIX}$${salt.toString('hex')}$${hash.toString('hex')}`;
   }

   /** Verify a PIN against a stored "scrypt$salt$hash" string (constant-time). */
   export function verifyPin(pin: string, stored: string): boolean {
     const parts = stored.split('$');
     if (parts.length !== 3 || parts[0] !== PREFIX) return false;
     const salt = Buffer.from(parts[1], 'hex');
     const expected = Buffer.from(parts[2], 'hex');
     const actual = scryptSync(pin, salt, expected.length);
     if (actual.length !== expected.length) return false;
     return timingSafeEqual(actual, expected);
   }

   /** True if the string is exactly 4 digits (0-9). */
   export function isValidPinFormat(pin: string): boolean {
     return /^[0-9]{4}$/.test(pin);
   }
   ```
2. Vitest `app/src/main/security/pin.test.ts`:
   - `hashPin` erzeugt für gleiche PIN **unterschiedliche** Strings (zufälliger Salt).
   - `verifyPin(pin, hashPin(pin))` === `true`.
   - `verifyPin('1234', hashPin('0000'))` === `false`.
   - `verifyPin('0000', 'garbage')` === `false` (Format-Robustheit, kein Throw).
   - `isValidPinFormat`: `'0000'`→true, `'00'`→false, `'12a4'`→false, `'12345'`→false.

**Caveats:**
- `scryptSync` ist synchron — für eine 4-stellige PIN auf seltenem Pfad (Gate-Eingabe)
  völlig akzeptabel; **kein** Async-Overengineering nötig.
- Niemals die Klartext-PIN loggen oder zurückgeben. Diese Datei lebt **nur im Main**.
- Schutzniveau ist bewusst niedrig (Kind-Gerät), aber sauber gemacht — das ist ein
  Sicherheits-Checkpoint laut `milestones.md`.

**Dateien/Artefakte:**
- neu: `app/src/main/security/pin.ts`, `app/src/main/security/pin.test.ts`.

**Akzeptanzkriterien:**
- [ ] `hashPin` liefert das Format `scrypt$<hex>$<hex>` mit zufälligem Salt (zwei Aufrufe →
      zwei verschiedene Strings).
- [ ] `verifyPin` ist korrekt (true bei Match, false sonst) und wirft bei kaputtem Input
      nicht.
- [ ] `isValidPinFormat` akzeptiert genau 4 Ziffern.
- [ ] `npm run test` (Vitest) für `pin.test.ts` grün.

---

### T5.03 — IPC-Vertrag erweitern (`settings:*`-Commands)
**Größe:** S · **Kategorie:** Codebase
**Abhängigkeiten:** keine (Contract kann vor den Handlern stehen)
**Vorbedingung:** `app/src/shared/ipc-contract.ts` (verifiziert).

**Ziel:** Den IPC-Vertrag **rein additiv** um die Eltern-/Settings-Commands erweitern und in
`ALLOWED_COMMANDS` eintragen. **Keine** bestehenden Felder ändern. **Kein** neuer Event-
Channel nötig (Lautstärke-Änderungen kommen weiter über `player:state` via `mixer`).

**Beschreibung:**
1. In `IpcCommands` (in `app/src/shared/ipc-contract.ts`) ergänzen:
   ```ts
   'settings:verifyPin': {
     request: { pin: string };
     response: { ok: boolean };   // true = PIN korrekt
   };
   'settings:changePin': {
     request: { currentPin: string; newPin: string };
     response: { ok: boolean; reason?: 'wrong_current' | 'invalid_format' };
   };
   'settings:getMaxVolume': {
     request: void;
     response: { maxVolume: number };  // 0..100
   };
   'settings:setMaxVolume': {
     request: { maxVolume: number };
     response: { ok: boolean };
   };
   ```
   > **Hinweis:** `library:rescan` existiert bereits im Vertrag und wird in S10 für den
   > „Rescan"-Button wiederverwendet — **kein** neuer Command dafür.
2. Die vier neuen Channels in `ALLOWED_COMMANDS` eintragen (Array am Dateiende).
3. **Nichts** an `ALLOWED_EVENTS` / `REPLAYABLE_EVENTS` ändern.
4. Preload (`app/src/preload/index.ts`) **nicht** anfassen — er arbeitet generisch über die
   Whitelist (verifiziert).

**Caveats:**
- Doppelpunkt-Namespacing strikt (`settings:verifyPin`).
- **Der Hash/das Secret wird NIE über IPC zurückgegeben** — nur `{ ok }`/`{ maxVolume }`.
  Das ist eine harte Architekturregel (Renderer hält keine Secrets).
- `response.reason` bei `changePin` ist optional und nur für eine differenzierte UI-Meldung
  (falsche aktuelle PIN vs. ungültiges Format).

**Dateien/Artefakte:**
- geändert: `app/src/shared/ipc-contract.ts`.

**Akzeptanzkriterien:**
- [ ] Vier neue Commands sind typisiert und in `ALLOWED_COMMANDS`.
- [ ] `ALLOWED_EVENTS`/`REPLAYABLE_EVENTS` unverändert.
- [ ] `npm run typecheck` fehlerfrei; bestehende Consumer kompilieren weiter.

---

### T5.04 — IPC-Handler: Settings get/set, PIN verify/change, Rescan
**Größe:** M · **Kategorie:** Codebase
**Abhängigkeiten:** T5.01 (Settings-DAO), T5.02 (Hashing), T5.03 (Contract)
**Vorbedingung:** `app/src/main/ipc/register.ts`, `getDb()`, die neuen DAO-/Security-
Funktionen vorhanden.

**Ziel:** Die vier neuen Commands im Main implementieren. PIN-Verifikation gegen den
gespeicherten Hash (mit **Fallback auf Standard-PIN `0000`**, solange keine eigene PIN
gesetzt wurde). PIN-Änderung prüft die aktuelle PIN und das Format. Max-Volume get/set über
die DAO.

**Beschreibung:**
1. In `app/src/main/ipc/register.ts` die nötigen Imports ergänzen:
   ```ts
   import { getMaxVolume, setMaxVolume, getPinHash, setPinHash } from '../db/dao';
   import { hashPin, verifyPin, isValidPinFormat } from '../security/pin';
   ```
2. Eine kleine Hilfsfunktion für die PIN-Prüfung (Default-Fallback `0000`):
   ```ts
   function checkPin(db: Database.Database, pin: string): boolean {
     const stored = getPinHash(db);
     if (!stored) return pin === '0000'; // Standard-PIN bis eine eigene gesetzt wurde
     return verifyPin(pin, stored);
   }
   ```
   > `Database` aus `better-sqlite3` typisieren oder die Hilfsfunktion inline halten.
3. Handler:
   ```ts
   ipcMain.handle('settings:verifyPin', (_e, p: { pin: string }) => {
     return { ok: checkPin(getDb(), p.pin) };
   });

   ipcMain.handle('settings:changePin', (_e, p: { currentPin: string; newPin: string }) => {
     const db = getDb();
     if (!checkPin(db, p.currentPin)) return { ok: false, reason: 'wrong_current' as const };
     if (!isValidPinFormat(p.newPin)) return { ok: false, reason: 'invalid_format' as const };
     setPinHash(db, hashPin(p.newPin));
     return { ok: true };
   });

   ipcMain.handle('settings:getMaxVolume', () => ({ maxVolume: getMaxVolume(getDb()) }));

   ipcMain.handle('settings:setMaxVolume', (_e, p: { maxVolume: number }) => {
     setMaxVolume(getDb(), p.maxVolume);
     return { ok: true };
   });
   ```
4. `library:rescan` bleibt unverändert (wird von S10 mitgenutzt).

**Caveats:**
- **Default-PIN-Fallback** ist wichtig: ohne ihn käme man nach einem frischen Setup nie ins
  Gate. Sobald `changePin` erfolgreich war, greift der Hash und der `0000`-Fallback ist
  inaktiv (weil `getPinHash` dann einen Wert liefert).
- **Niemals** die PIN oder den Hash zurückgeben oder loggen.
- Bei `setMaxVolume` reicht das DAO-seitige Clamping (T5.01); zusätzlich greift die
  serverseitige Klemmung in T5.05 beim eigentlichen Lautstärke-Setzen.

**Dateien/Artefakte:**
- geändert: `app/src/main/ipc/register.ts`.

**Akzeptanzkriterien:**
- [ ] `settings:verifyPin {pin:'0000'}` → `{ok:true}` bei frischer DB (kein Hash gesetzt).
- [ ] Nach `settings:changePin {currentPin:'0000', newPin:'1357'}` öffnet `0000` **nicht**
      mehr, `1357` schon.
- [ ] `changePin` mit falscher aktueller PIN → `{ok:false, reason:'wrong_current'}`; mit
      ungültigem Format → `{ok:false, reason:'invalid_format'}`.
- [ ] `settings:getMaxVolume` liefert 85 bei frischer DB; nach `setMaxVolume {maxVolume:60}`
      liefert es 60.
- [ ] Kein Klartext-/Hash-Wert wird je zurückgegeben oder geloggt.

---

### T5.05 — Serverseitige Lautstärke-Klemmung in `setVolume()` (E14)
**Größe:** S · **Kategorie:** Codebase
**Abhängigkeiten:** T5.01 (`getMaxVolume`)
**Vorbedingung:** `app/src/main/mpd/control.ts` `setVolume()` (verifiziert) — klemmt aktuell
nur auf `[0,100]`. Dies ist der **einzige** Pfad, über den die Lautstärke gesetzt wird.

**Ziel:** Die Kind-Lautstärke wird **serverseitig** auf `max_volume` begrenzt — ein direkter
IPC-Call darf das Limit **nicht** umgehen (Hard-Cap im Main). Das ist der M5-Integrations-
punkt in den M4-Lautstärkepfad.

**Beschreibung:**
1. In `app/src/main/mpd/control.ts` `setVolume()` so erweitern, dass es zusätzlich gegen
   `getMaxVolume(getDb())` klemmt:
   ```ts
   import { getDb } from '../db';
   import { getMaxVolume } from '../db/dao';

   export async function setVolume(volume: number): Promise<void> {
     const mpd = await getMpd();
     const max = getMaxVolume(getDb());
     // Range-Schutz UND Eltern-Limit (E14): nie über max_volume hinaus
     const clamped = Math.max(0, Math.min(max, Math.floor(volume)));
     try {
       await mpd.send(`setvol ${clamped}`);
     } catch (err) {
       console.warn('[control] setVolume failed (mixer unavailable?):', err);
     }
   }
   ```
2. **Wichtig:** Wenn S10 die Max-Lautstärke **senkt** und die aktuelle MPD-Lautstärke
   darüber liegt, sollte die laufende Lautstärke nachgezogen werden. Das übernimmt
   `settings:setMaxVolume` nicht automatisch — daher in T5.10 nach `setMaxVolume` ein
   `player:setVolume {volume: max}` auslösen ist eine **Renderer-Entscheidung**; alternativ
   hier im Setter nichts tun und die Anpassung dem nächsten `player:setVolume`-Call
   überlassen. **Entscheidung:** Klemmung passiert ausschließlich beim Setzen — kein
   automatisches Absenken einer bereits laufenden Lautstärke im Backend (KISS). In den
   Akzeptanzkriterien von T5.10/T5.15 wird das berücksichtigt.

**Caveats:**
- **Kein** separater „unbegrenzter" Lautstärkepfad für Eltern — alle Lautstärke-Calls gehen
  durch `setVolume` und werden geklemmt. (Eltern stellen das **Limit** ein, nicht eine
  Live-Lautstärke oberhalb des Limits.)
- `getMaxVolume` ist ein synchroner DB-Read pro Volume-Call — vernachlässigbar (selten,
  kleine Tabelle).
- Bestehender Mixer-Fehler-Fallback bleibt erhalten.

**Dateien/Artefakte:**
- geändert: `app/src/main/mpd/control.ts`.

**Akzeptanzkriterien:**
- [ ] Bei `max_volume = 70` setzt `setVolume(90)` die MPD-Lautstärke auf **70**, nicht 90.
- [ ] `setVolume(50)` bei `max_volume = 70` setzt 50.
- [ ] Werte < 0 werden auf 0 geklemmt.
- [ ] `npm run typecheck` fehlerfrei.

---

### T5.06 — `de.json` um Eltern-/PIN-/Settings-Strings erweitern
**Größe:** S · **Kategorie:** Codebase
**Abhängigkeiten:** keine
**Vorbedingung:** `app/src/renderer/src/i18n/de.json`, `useT()` (verifiziert).

**Ziel:** Alle neuen UI-Strings key-basiert in `de.json`. **Keine hartcodierten Strings im
JSX** (Projektregel).

**Beschreibung:** Folgende Keys additiv ergänzen (bestehende nicht ändern, gültiges JSON —
Kommata beachten). Keys Englisch, Werte Deutsch:
```json
"pin.title": "PIN eingeben",
"pin.wrong": "Das war nicht richtig — versuch es nochmal",
"pin.delete": "Löschen",
"pin.close": "Schließen",
"settings.title": "Einstellungen",
"settings.maxVolume": "Maximale Lautstärke",
"settings.changePin": "PIN ändern",
"settings.changePin.current": "Aktuelle PIN",
"settings.changePin.new": "Neue PIN",
"settings.changePin.save": "Speichern",
"settings.changePin.success": "PIN geändert",
"settings.changePin.wrongCurrent": "Aktuelle PIN ist falsch",
"settings.changePin.invalidFormat": "Die PIN muss 4 Ziffern haben",
"settings.rescan": "Medien neu einlesen",
"settings.rescan.triggered": "Suche läuft …",
"settings.bluetooth": "Bluetooth-Geräte",
"settings.bluetooth.placeholder": "Bald verfügbar",
"settings.syncLog": "Sync-Protokoll",
"settings.syncLog.placeholder": "Bald verfügbar",
"settings.back": "Zurück"
```

**Caveats:**
- Gültiges JSON. Aria-Labels der Pad-Tasten/Buttons stammen aus diesen Keys.
- `pin.wrong` entspricht wörtlich der E11-Vorgabe aus dem Design-Brief.

**Dateien/Artefakte:**
- geändert: `app/src/renderer/src/i18n/de.json`.

**Akzeptanzkriterien:**
- [ ] Alle genannten Keys vorhanden, JSON valide.
- [ ] Kein doppelter Key gegenüber dem Bestand.

---

### T5.07 — `useParentGate`-Hook (2000 ms, Ring ab 400 ms)
**Größe:** M · **Kategorie:** Codebase
**Abhängigkeiten:** keine
**Vorbedingung:** React-Hooks-Muster aus `hooks/useLongPress.ts` als Vorlage (verifiziert).

**Ziel:** Ein **eigener** Hook für die 2000-ms-Eltern-Geste, der einen `ringRatio` (0..1)
liefert, der **erst ab 400 ms** zu wachsen beginnt und bei 2000 ms `onTrigger()` aufruft.
**Nicht** den bestehenden `useLongPress` (600 ms, S4) umkonfigurieren — sonst bricht S4.

**Beschreibung:**
1. Neue Datei `app/src/renderer/src/hooks/useParentGate.ts` (analog zu `useLongPress`,
   aber mit den Gate-Konstanten):
   ```ts
   import { useRef, useState, useCallback, type PointerEvent } from 'react';

   const GATE_MS = 2000;       // Schwelle für das Eltern-Gate
   const RING_START_MS = 400;  // ab hier wird der Ring sichtbar/wächst
   const RING_SPAN_MS = GATE_MS - RING_START_MS; // 1600ms Füllung
   const MOVE_THRESHOLD_PX = 14; // wie useLongPress (kapazitives Wandern tolerieren)

   interface UseParentGateOptions { onTrigger: () => void; }
   interface UseParentGateResult {
     onPointerDown: (e: PointerEvent) => void;
     onPointerMove: (e: PointerEvent) => void;
     onPointerUp: (e: PointerEvent) => void;
     onPointerLeave: (e: PointerEvent) => void;
     /** 0..1 ab 400ms; 0 außerhalb der Halte-Phase. Für den Ring. */
     ringRatio: number;
   }

   export function useParentGate({ onTrigger }: UseParentGateOptions): UseParentGateResult {
     const [ringRatio, setRingRatio] = useState(0);
     const startRef = useRef(0);
     const startPosRef = useRef({ x: 0, y: 0 });
     const movedRef = useRef(false);
     const firedRef = useRef(false);
     const rafRef = useRef<number | null>(null);
     const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

     const cleanup = useCallback(() => {
       if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
       if (timerRef.current !== null) clearTimeout(timerRef.current);
       rafRef.current = null; timerRef.current = null;
       setRingRatio(0);
     }, []);

     const tick = useCallback(() => {
       const elapsed = Date.now() - startRef.current;
       const ratio = Math.min(1, Math.max(0, (elapsed - RING_START_MS) / RING_SPAN_MS));
       setRingRatio(ratio);
       if (elapsed < GATE_MS) rafRef.current = requestAnimationFrame(tick);
     }, []);

     const onPointerDown = useCallback((e: PointerEvent) => {
       firedRef.current = false; movedRef.current = false;
       startRef.current = Date.now();
       startPosRef.current = { x: e.clientX, y: e.clientY };
       setRingRatio(0);
       rafRef.current = requestAnimationFrame(tick);
       timerRef.current = setTimeout(() => {
         if (movedRef.current) return;
         firedRef.current = true; cleanup(); onTrigger();
       }, GATE_MS);
     }, [tick, cleanup, onTrigger]);

     const onPointerMove = useCallback((e: PointerEvent) => {
       if (movedRef.current) return;
       const dx = e.clientX - startPosRef.current.x;
       const dy = e.clientY - startPosRef.current.y;
       if (dx*dx + dy*dy > MOVE_THRESHOLD_PX*MOVE_THRESHOLD_PX) {
         movedRef.current = true; firedRef.current = true; cleanup();
       }
     }, [cleanup]);

     const onPointerUp = useCallback(() => { cleanup(); }, [cleanup]);
     const onPointerLeave = useCallback(() => { firedRef.current = true; cleanup(); }, [cleanup]);

     return { onPointerDown, onPointerMove, onPointerUp, onPointerLeave, ringRatio };
   }
   ```

**Caveats:**
- Die ersten **400 ms ohne Ring** sind bewusst (kein „Flackern" beim normalen Antippen des
  Logos) — `ringRatio` bleibt in dieser Zeit 0.
- `onPointerUp` löst **nie** einen Tap aus (das Logo hat im Kindmodus keine Tap-Funktion) —
  nur `cleanup()`. Nur der 2000-ms-Timer triggert.
- Bewegung > 14 px bricht die Geste ab (Kind wischt/scrollt). `pointerleave` ebenfalls.

**Dateien/Artefakte:**
- neu: `app/src/renderer/src/hooks/useParentGate.ts`.

**Akzeptanzkriterien:**
- [ ] `ringRatio` bleibt 0 bis 400 ms, wächst dann linear bis 1 bei 2000 ms.
- [ ] `onTrigger` feuert genau einmal bei 2000 ms gehaltenem Druck ohne Bewegung.
- [ ] Loslassen vor 2000 ms → kein `onTrigger`, `ringRatio` zurück auf 0.
- [ ] Bewegung > 14 px bricht die Geste ab.

---

### T5.08 — Logo-Gate in S1 verdrahten (Ring-Rendering + Trigger)
**Größe:** M · **Kategorie:** Codebase
**Abhängigkeiten:** T5.07 (Hook)
**Vorbedingung:** `app/src/renderer/src/screens/S1Start.tsx`, `components/Logo.tsx` (hat
`onPointerDown/Up/Leave`-Hooks), `screens.css` (verifiziert).

**Ziel:** Das Logo in S1 reagiert auf die 2-s-Geste: Während des Haltens zeichnet ein
kreisförmiger Fortschritts-Ring (ab 400 ms) um das Logo, bei 2000 ms wird ein
`onOpenParentGate`-Callback ausgelöst (öffnet später S9 über Root). Der Ring verschwindet
beim Loslassen (160 ms).

**Beschreibung:**
1. `S1Start` um eine Prop erweitern:
   ```ts
   interface S1Props {
     onChoose: (type: 'audiobook' | 'music') => void;
     onOpenParentGate: () => void;
   }
   ```
2. Den Hook nutzen und seine Pointer-Handler an das `Logo`-SVG durchreichen (Logo besitzt
   bereits `onPointerDown/onPointerUp/onPointerLeave`); zusätzlich `onPointerMove` auf einem
   das Logo umschließenden Wrapper-Element:
   ```tsx
   const gate = useParentGate({ onTrigger: onOpenParentGate });
   // ...
   <div
     className="s1-logo-wrap"
     onPointerMove={gate.onPointerMove}
     style={{ position: 'relative', display: 'inline-flex' }}
   >
     <Logo
       size={40}
       onPointerDown={gate.onPointerDown}
       onPointerUp={gate.onPointerUp}
       onPointerLeave={gate.onPointerLeave}
     />
     {gate.ringRatio > 0 && (
       <svg className="s1-gate-ring" viewBox="0 0 100 100" aria-hidden="true">
         <circle
           cx="50" cy="50" r="46" fill="none"
           stroke="var(--flieder-deep)" strokeWidth="4"
           strokeDasharray={2 * Math.PI * 46}
           strokeDashoffset={(1 - gate.ringRatio) * 2 * Math.PI * 46}
           transform="rotate(-90 50 50)"
         />
       </svg>
     )}
   </div>
   ```
   > Der Ring ist ein über dem Logo absolut positioniertes SVG, das exakt das Logo-Symbol
   > umschließt. `strokeDashoffset` realisiert die lineare Füllung aus `ringRatio`.
3. CSS in `screens.css` ergänzen:
   ```css
   .s1-gate-ring {
     position: absolute; inset: -6px; width: calc(100% + 12px); height: calc(100% + 12px);
     pointer-events: none;
     transition: opacity 160ms ease-in; /* Verschwinden beim Loslassen */
   }
   ```
   (Ring-Größe so wählen, dass er das ~40px-Logo-Symbol sauber umfasst; Werte am Dev-Fenster
   feinjustieren.)
4. Die Wordmark/`app.name` daneben bleibt; sie ist **kein** Teil des Tap-Targets der Geste
   (nur das Logo-Symbol trägt die Geste — wie im Brief beschrieben).

**Caveats:**
- **Wichtig (Pointer-Capture):** Wenn der Finger das Logo-SVG während des Haltens leicht
  verlässt (Kinderfinger wandern), feuert `onPointerLeave` und bricht ab. Damit das nicht zu
  empfindlich ist, den `onPointerMove`-Handler auf dem **Wrapper** (etwas größer als das
  Logo) platzieren und die 14-px-Toleranz des Hooks greift. Optional `setPointerCapture` im
  `onPointerDown` setzen, um Move/Up am selben Element zu halten — am echten Touch in T5.13
  kalibrieren.
- Der Ring darf das Layout der S1-Titelzone **nicht** verschieben (absolut positioniert,
  `pointer-events: none`).
- **Kein** sichtbarer Hinweis auf die Geste außer dem Ring (versteckt vor dem Kind).
- Cursor-frei: keine Hover-Zustände.

**Dateien/Artefakte:**
- geändert: `app/src/renderer/src/screens/S1Start.tsx`, `app/src/renderer/src/screens.css`.

**Akzeptanzkriterien:**
- [ ] Halten auf dem Logo zeigt ab ~400 ms einen wachsenden Ring; bei 2000 ms wird
      `onOpenParentGate` ausgelöst.
- [ ] Loslassen vor 2000 ms → Ring verschwindet (160 ms), nichts öffnet sich.
- [ ] Normales kurzes Antippen des Logos hat keine Wirkung und zeigt keinen Ring.
- [ ] Layout der S1-Titelzone bleibt stabil (kein Springen durch den Ring).

---

### T5.09 — S9 PIN-Dialog (numerisches Pad, Shake, kein Lockout)
**Größe:** L · **Kategorie:** Codebase
**Abhängigkeiten:** T5.03/T5.04 (`settings:verifyPin`), T5.06 (Strings)
**Vorbedingung:** `<Pressable>`, S4Detail-Overlay-Muster (Scrim+Card, Enter 220 / Exit 160),
`screens.css` (verifiziert).

**Ziel:** Ein modaler PIN-Dialog über S1 mit **numerischem Pad** (keine Tastatur). 4 Stellen
→ automatische Verifikation via `settings:verifyPin`. Korrekt → `onSuccess` (Root öffnet
S10). Falsch (E11): Feld leeren, **Shake 200 ms**, Hinweis — **kein Lockout, sofort erneut**.

**Beschreibung:**
1. Neue Datei `app/src/renderer/src/screens/S9PinDialog.tsx`:
   ```ts
   interface S9Props {
     onSuccess: () => void;
     onClose: () => void;
   }
   ```
2. **State:** `entry: string` (bisher eingegebene Ziffern, max 4), `wrong: boolean` (für
   Shake), `closing`/`entered` (Animationen analog S4Detail).
3. **Numerisches Pad:** Tasten `1..9`, `0`, plus eine **Löschen**-Taste (Backspace).
   Jede Taste ein `<Pressable>` mit Ziffer (sichtbar) bzw. Aria-Label aus `de.json`
   (`pin.delete`). **Keine** `<input>`-Elemente mit Systemtastatur.
4. **Eingabe-Logik:** Tap auf Ziffer hängt an `entry` an (nur wenn `< 4`); bei genau 4
   Ziffern automatisch verifizieren:
   ```ts
   useEffect(() => {
     if (entry.length !== 4) return;
     void window.hoermond.invoke('settings:verifyPin', { pin: entry }).then(({ ok }) => {
       if (ok) { onSuccess(); }
       else {
         setWrong(true);
         setTimeout(() => { setEntry(''); setWrong(false); }, 200); // Shake-Dauer
       }
     });
   }, [entry]);
   ```
5. **Anzeige der Stellen:** vier Punkt-Indikatoren (gefüllt nach Anzahl Ziffern), **nicht**
   die Ziffern im Klartext. Bei `wrong` die Punkt-Reihe shaken.
6. **Shake-Animation** (200 ms) in `screens.css`:
   ```css
   @keyframes s9-shake {
     0%,100% { transform: translateX(0); }
     20% { transform: translateX(-8px); }
     40% { transform: translateX(8px); }
     60% { transform: translateX(-6px); }
     80% { transform: translateX(6px); }
   }
   .s9-dots.is-wrong { animation: s9-shake 200ms ease-in-out; }
   ```
7. **Hinweistext** (`pin.wrong`) erscheint bei `wrong`, dezent (`--warning` oder
   `--text-secondary`).
8. Overlay-Muster wie S4Detail: Scrim (`--scrim`), Tap auf Scrim oder Schließen-Element →
   `onClose`. Enter 220 ms / Exit 160 ms.

**Caveats:**
- **Kein Lockout/Cooldown** (E11, bestätigt) — nach falscher PIN sofort wieder eingebbar.
- Kiosk: keine Systemtastatur, kein `<input type=password>` mit OS-Keyboard. Nur das eigene
  Pad.
- Tap-Targets der Pad-Tasten großzügig (Kinder/Eltern), Mindestabstand beachten; auf
  800×480 passend layouten (Dialog mittig).
- Klartext-PIN verlässt den Dialog nur als IPC-Request zur Verifikation; **keine** Anzeige
  der Ziffern, kein Logging.

**Dateien/Artefakte:**
- neu: `app/src/renderer/src/screens/S9PinDialog.tsx`.
- geändert: `app/src/renderer/src/screens.css` (`.s9-*`, Shake-Keyframe).

**Akzeptanzkriterien:**
- [ ] Numerisches Pad ohne Systemtastatur; 4 Punkte spiegeln die Eingabelänge.
- [ ] PIN `0000` (frische DB) → `onSuccess`.
- [ ] Falsche PIN → Shake (200 ms), Feld leert sich, Hinweis sichtbar, sofort erneut
      eingebbar (kein Lockout).
- [ ] Tap auf Scrim/Schließen verlässt den Dialog.
- [ ] Ziffern werden nie im Klartext angezeigt.

---

### T5.10 — S10 Elterneinstellungen (Slate-Theme, Max-Vol, PIN, Rescan, Platzhalter)
**Größe:** L · **Kategorie:** Codebase
**Abhängigkeiten:** T5.04 (Settings-Handler), T5.06 (Strings), T5.09 (PIN-Änderung nutzt
ggf. das Pad-Muster)
**Vorbedingung:** `<Pressable>`, `<BackButton>`, `library:rescan` (vorhanden), Theme-Vars
`--parent-accent`/`--parent-bg` (in `theme.css` definiert).

**Ziel:** Der Elterneinstellungen-Screen im **Slate-Theme** mit funktionierender
Max-Lautstärke, PIN-Änderung und manuellem Rescan; BT-Verwaltung und Sync-Log als
**Platzhalter** (M6/M7). Verlassen → zurück nach S1.

**Beschreibung:**
1. Neue Datei `app/src/renderer/src/screens/S10Settings.tsx`:
   ```ts
   interface S10Props { onBack: () => void; }
   ```
2. **Slate-Theme:** Container nutzt `--parent-bg` als Hintergrund, `--parent-accent` für
   Header/Buttons/Akzente (weißer Text auf `--parent-accent` = 10,3:1, AA ok). Visuell klar
   vom Kindbereich getrennt. Titelleiste 44px mit `<BackButton>` (zurück → S1) + Titel
   `t('settings.title')`.
3. **Sektion Max-Lautstärke:**
   - Beim Mount `settings:getMaxVolume` laden.
   - Stepper oder Slider 0..100 % (Standard 85). Bei Änderung `settings:setMaxVolume
     {maxVolume}` aufrufen. Aktueller Wert sichtbar (z. B. „85 %").
   - **Hinweis (aus T5.05):** Das Limit wird beim nächsten Lautstärke-Setzen wirksam; eine
     bereits laufende, höhere Lautstärke wird nicht automatisch abgesenkt. Optional: nach
     dem Senken zusätzlich `player:setVolume {volume: maxVolume}` aufrufen, damit die
     laufende Lautstärke sofort nachzieht — **wenn gewünscht, hier als kleine Komfort-
     Ergänzung dokumentieren**, nicht zwingend.
4. **Sektion PIN ändern:**
   - Eingabe der aktuellen + neuen PIN. Pragmatisch: zwei numerische Pad-Eingaben
     (Wiederverwendung des Pad-Musters aus S9) oder ein einfacher Mini-Flow. Bei Submit
     `settings:changePin {currentPin, newPin}`:
     - `{ok:true}` → Erfolgsmeldung `settings.changePin.success`.
     - `reason:'wrong_current'` → `settings.changePin.wrongCurrent`.
     - `reason:'invalid_format'` → `settings.changePin.invalidFormat`.
5. **Sektion Rescan:**
   - Button `settings.rescan` → `library:rescan`. Kurze Bestätigung
     `settings.rescan.triggered`. (Neue Medien erscheinen über `library:updated`.)
6. **Platzhalter-Sektionen (KEINE Funktion):**
   - **Bluetooth-Geräte** (`settings.bluetooth`) — gedämpft dargestellt, Hinweistext
     `settings.bluetooth.placeholder` („Bald verfügbar"). Kein Button mit Wirkung.
   - **Sync-Protokoll** (`settings.syncLog`) — analog, `settings.syncLog.placeholder`.
   - Beide klar als „kommt später" erkennbar, nicht klickbar/aktiv.
7. CSS in `screens.css` (`.s10-*`): Slate-Hintergrund/-Header, Sektionsabstände, Stepper-/
   Button-Styles im erwachsenen Look.

**Caveats:**
- **Scope:** BT und Sync-Log sind **reine Platzhalter** — kein BlueZ, kein Sync-Log-Abruf
  (das ist M6/M7). Nicht versehentlich Funktion einbauen.
- Lesbarkeit/Touch: Body 18px Untergrenze, Eltern müssen alles in < 30 s finden/bedienen
  (Brief §1.3).
- Slate-Theme NUR auf S9/S10 — der Kindbereich bleibt Flieder.
- Bei der PIN-Änderung **niemals** PIN/Hash anzeigen oder loggen.

**Dateien/Artefakte:**
- neu: `app/src/renderer/src/screens/S10Settings.tsx`.
- geändert: `app/src/renderer/src/screens.css` (`.s10-*`).
- ggf. ausgelagert: ein wiederverwendbares `NumericPad` aus S9 (optional, wenn die
  PIN-Änderung dasselbe Pad nutzt) — z. B. `components/NumericPad.tsx`.

**Akzeptanzkriterien:**
- [ ] S10 erscheint im Slate-Theme, visuell klar vom Kindbereich getrennt.
- [ ] Max-Lautstärke lädt den gespeicherten Wert (Standard 85 %), Änderung persistiert via
      `settings:setMaxVolume`.
- [ ] PIN ändern: korrekte aktuelle PIN + 4-stellige neue PIN → Erfolg; falsche aktuelle PIN
      bzw. ungültiges Format → passende Meldung.
- [ ] Rescan-Button löst `library:rescan` aus (Bestätigung sichtbar).
- [ ] BT-Verwaltung und Sync-Log als nicht-funktionale Platzhalter sichtbar.
- [ ] Zurück führt nach S1.

---

### T5.11 — E14-Anschlag-Feedback im Kind-Lautstärkeregler
**Größe:** S · **Kategorie:** Codebase
**Abhängigkeiten:** T5.05 (serverseitige Klemmung)
**Vorbedingung:** `app/src/renderer/src/components/PlayerControls.tsx` (Volume −/+ Buttons,
verifiziert), `S5Player.tsx` (Volume-Handler).

**Ziel:** Wenn das Kind im Player „lauter" drückt und das **Eltern-Limit** erreicht ist,
gibt es **visuelles „am Anschlag"-Feedback ohne Pegeländerung** (E14) — das Kind versteht,
dass es lauter nicht geht. Kein Fehler, kein Hinweis auf Eltern/PIN.

**Beschreibung:**
1. Der Renderer kennt das Limit nicht direkt (es ist serverseitig). Zwei mögliche Wege —
   **bevorzugt Weg A** (kein neuer Datenfluss):
   - **Weg A (empfohlen):** Nach einem `player:setVolume`-Call beobachtet S5 ohnehin das
     `player:state.volume` (Push via `mixer`). Wenn nach einem „Lauter"-Tap der
     zurückgemeldete `volume` sich **nicht erhöht** hat (weil serverseitig geklemmt), zeigt
     S5/PlayerControls ein kurzes „am Anschlag"-Feedback (z. B. der Lauter-Button blinkt
     kurz / Balken-Indikator zeigt „voll"). Dazu den zuletzt angefragten Zielwert mit dem
     neuen `volume` vergleichen.
   - **Weg B (optional):** S5 lädt `settings:getMaxVolume` und vergleicht direkt — mehr
     Datenfluss, nicht nötig. Nur falls Weg A am echten Gerät zu träge wirkt.
2. **Implementierung Weg A** in `S5Player.tsx`:
   - In `handleVolumeUp` den Zielwert berechnen (wie bisher `min(100, volume+10)`), per
     `setVolume` setzen, und einen `atMax`-State setzen, wenn der **nächste**
     `player:state` denselben `volume` zurückliefert wie zuvor (keine Erhöhung).
   - `atMax` an `PlayerControls` reichen; dort kurzes Feedback am Lauter-Button (z. B.
     `is-at-max`-Klasse mit kurzem Puls 150–200 ms), **ohne** die Lautstärke zu ändern.
3. CSS: kleine, ruhige „voll"-Andeutung (kein blinkendes/flackerndes Element > 3 Hz, WCAG
   2.3.1). Form **und** Farbe (nicht nur Farbe).

**Caveats:**
- **Kein** Hinweis auf Eltern/PIN/Limit gegenüber dem Kind — nur „geht nicht lauter".
- Die tatsächliche Begrenzung passiert serverseitig (T5.05) — dieses Feedback ist **rein
  kosmetisch** und darf das Limit nicht im Renderer umgehen oder duplizieren.
- Vorsicht mit Race: der `player:state`-Push kommt asynchron; das Feedback an die Antwort
  koppeln, nicht an einen Timer raten.

**Dateien/Artefakte:**
- geändert: `app/src/renderer/src/screens/S5Player.tsx`,
  `app/src/renderer/src/components/PlayerControls.tsx`, `screens.css`.

**Akzeptanzkriterien:**
- [ ] Bei erreichtem Limit zeigt „Lauter" ein kurzes „am Anschlag"-Feedback **ohne**
      Lautstärkeänderung.
- [ ] Unterhalb des Limits funktioniert „Lauter" normal (Pegel steigt).
- [ ] Kein blinkendes/flackerndes Element; Feedback trägt Form + Farbe.
- [ ] Kein Hinweis auf Eltern/PIN für das Kind.

---

### T5.12 — Root-Navigation auf S9/S10 + typecheck + Vollfluss
**Größe:** M · **Kategorie:** Codebase
**Abhängigkeiten:** T5.08 (Gate-Trigger in S1), T5.09 (S9), T5.10 (S10)
**Vorbedingung:** `app/src/renderer/src/Root.tsx` (verifiziert).

**Ziel:** Den Gate-Fluss in die Root-Navigation einhängen: Logo-Gate (S1) → S9 → bei
korrekter PIN → S10 → zurück → S1. `Screen`-Union additiv erweitern; gesamter Fluss
typecheckt sauber.

**Beschreibung:**
1. In `Root.tsx` die `Screen`-Union additiv erweitern:
   ```ts
   type Screen =
     | { name: 's0' }
     | { name: 's1' }
     | { name: 'grid'; type: 'audiobook' | 'music' }
     | { name: 's5'; item: MediaItem }
     | { name: 's9' }
     | { name: 's10' };
   ```
2. `S1Start` die neue Prop geben: `onOpenParentGate={() => setScreen({ name: 's9' })}`.
3. Rendering ergänzen:
   ```tsx
   {screen.name === 's9' && (
     <S9PinDialog
       onSuccess={() => setScreen({ name: 's10' })}
       onClose={() => setScreen({ name: 's1' })}
     />
   )}
   {screen.name === 's10' && (
     <S10Settings onBack={() => setScreen({ name: 's1' })} />
   )}
   ```
4. **MiniPlayer-Sichtbarkeit:** Die Bedingung erweitern, sodass der MiniPlayer auf S9/S10
   **nicht** erscheint (Eltern-Bereich ist ein paralleler Zweig):
   ```tsx
   {playingItem && screen?.name !== 's5' && screen?.name !== 's0'
     && screen?.name !== 's9' && screen?.name !== 's10' && ( … )}
   ```
5. `npm run typecheck` + Dev-Lauf: kompletter Fluss S1 → (Logo 2 s halten) → S9 → PIN `0000`
   → S10 → Max-Vol ändern / PIN ändern / Rescan → Zurück → S1.

**Caveats:**
- S9 ist ein **Overlay über S1** im Sinne des Brief-Navigationsbaums (paralleler Eltern-
  Zweig). Hier als eigener Screen-Eintrag modelliert — sicherstellen, dass beim Schließen
  von S9/S10 **immer** S1 erscheint (nie eine Sackgasse).
- Onboarding-/Library-/Resume-Logik in `Root.tsx` **unverändert** lassen.
- Keine toten Imports; Slate-Theme nur auf S9/S10.

**Dateien/Artefakte:**
- geändert: `app/src/renderer/src/Root.tsx`.

**Akzeptanzkriterien:**
- [ ] Logo 2 s halten auf S1 öffnet S9; PIN `0000` öffnet S10; Zurück/Schließen führt nach
      S1.
- [ ] MiniPlayer erscheint nicht auf S9/S10.
- [ ] `npm run typecheck` fehlerfrei; `npm run test` grün (inkl. pin.test.ts).
- [ ] Voller Fluss im Dev-Fenster bedienbar.

---

## Pi-Tasks (Deployment) — übernimmt der User

> Diese Tasks erfordern das echte Gerät und werden nach Abschluss der Codebase-Tasks
> (T5.01–T5.12) ausgeführt. App-Pfad auf dem Pi: **`/home/player/hoermond/repo/app`**.
> Nach jedem `npm install` auf dem Pi: **`npx electron-rebuild -f -w better-sqlite3`**
> (native Module für die Pi-ABI), sonst startet die App nicht. Touch ist invertiert rotiert
> (`xrandr --rotate inverted` in `.xinitrc`) — bei „seitenverkehrtem" Touch hier die Ursache.

### T5.13 — Deploy auf Pi + Gate-Geste gegen Kinder-Tippmuster
**Größe:** M · **Kategorie:** Pi
**Abhängigkeiten:** T5.12
**Vorbedingung:** Pi erreichbar, M5-Build deploybar.

**Ziel:** Die M5-Build läuft auf dem echten Gerät; die versteckte 2-s-Geste funktioniert mit
echtem kapazitivem Touch und ist für ein Kind nicht versehentlich auslösbar.

**Beschreibung:**
1. Build/Deploy (bestehender M1–M4-Pfad), `electron-rebuild` für `better-sqlite3`.
2. Kiosk starten, auf S1 das Logo halten: Ring erscheint ab ~400 ms, füllt bis 2000 ms,
   dann öffnet S9. Loslassen davor → nichts.
3. **Kinder-Tippmuster prüfen:** schnelles Antippen, mehrfaches Tippen, Wischen über das
   Logo dürfen das Gate **nicht** öffnen. Bei zu empfindlicher/abbrechender Geste die
   Move-Toleranz (14 px) bzw. Pointer-Capture in `useParentGate`/`S1Start` (T5.07/T5.08)
   nachkalibrieren.

**Caveats:**
- Kapazitives Touch „wandert" — wenn die Geste am echten Gerät zu oft abbricht, Move-
  Toleranz leicht erhöhen oder `setPointerCapture` ergänzen (im Repo-Code, dann
  re-deployen).

**Akzeptanzkriterien:**
- [x] App startet im Kiosk; Logo-Halten öffnet S9 zuverlässig bei ~2 s.
- [x] Kurzes Tippen/Wischen öffnet das Gate **nicht**.
- [x] Ring-Feedback am echten Display flüssig und korrekt positioniert.

---

### T5.14 — PIN-Flow + Persistenz nach Neustart (echte DB)
**Größe:** M · **Kategorie:** Pi
**Abhängigkeiten:** T5.13
**Vorbedingung:** App läuft auf dem Pi; SQLite unter `/var/lib/mediaplayer/state.db`.

**Ziel:** PIN-Verifikation, -Änderung und -Persistenz funktionieren auf der echten DB über
einen Reboot hinweg (overlayfs-sicher).

**Beschreibung:**
1. Mit Standard-PIN `0000` in S10 gelangen. Falsche PIN testen: Shake + Hinweis, kein
   Lockout, sofort erneut.
2. PIN in S10 auf einen neuen Wert ändern. App neu starten (oder Stecker ziehen + Reboot).
3. Erneut Gate öffnen: **alte** `0000` öffnet **nicht** mehr, **neue** PIN öffnet.
4. Verifizieren, dass die DB persistent ist (Pfad nicht im Overlay-RAM) — wie schon für die
   Playback-Position in M2/M4 geprüft.

**Caveats:**
- Wenn die neue PIN nach Reboot **nicht** gilt, liegt die Ursache fast sicher in der
  overlayfs-Persistenz der `state.db` (Schreibpfad muss auf den persistenten Bind-Mount
  zeigen) — gegen die M1/M2-Annahmen prüfen.

**Akzeptanzkriterien:**
- [x] Falsche PIN: Shake + Hinweis, kein Lockout.
- [x] Geänderte PIN gilt nach Reboot; alte PIN gilt nicht mehr.
- [x] Kein Klartext der PIN in der DB sichtbar (Stichprobe, siehe T5.16).

---

### T5.15 — Max-Lautstärke wirkt hörbar serverseitig (E14)
**Größe:** M · **Kategorie:** Pi
**Abhängigkeiten:** T5.13
**Vorbedingung:** App läuft; ein Medium spielt über die Klinke (BT erst M6).

**Ziel:** Das Eltern-Lautstärke-Limit begrenzt die Kind-Lautstärke **hörbar** und kann nicht
über die Kind-UI umgangen werden; am Limit greift das E14-Feedback.

**Beschreibung:**
1. In S10 `max_volume` z. B. auf 50 % setzen, zurück in den Player.
2. Im Player „Lauter" mehrfach drücken: die Lautstärke steigt hörbar **nur bis 50 %**, dann
   „am Anschlag"-Feedback ohne weitere Pegeländerung.
3. `max_volume` wieder anheben (z. B. 90 %): „Lauter" geht jetzt weiter.
4. Verifizieren, dass das Limit nach Reboot erhalten bleibt (Persistenz).

**Caveats:**
- Eine **bereits laufende** Lautstärke oberhalb eines neu gesenkten Limits wird (laut T5.05-
  Entscheidung) erst beim nächsten „Lauter/Leiser"-Tap geklemmt — das ist erwartetes
  Verhalten, kein Bug. Falls am Gerät unerwünscht, in T5.10 die Komfort-Ergänzung
  (sofortiges Nachziehen) aktivieren und re-deployen.

**Akzeptanzkriterien:**
- [x] Kind-Lautstärke steigt hörbar nur bis `max_volume`.
- [x] Am Limit „am Anschlag"-Feedback ohne Pegeländerung.
- [x] `max_volume` bleibt nach Reboot erhalten.

---

### T5.16 — Security-Review PIN-Speicherung
**Größe:** S · **Kategorie:** Pi
**Abhängigkeiten:** T5.14
**Vorbedingung:** Mindestens einmal eine eigene PIN gesetzt; Zugriff auf die Pi-DB.

**Ziel:** Verbindlicher Sicherheits-Checkpoint (laut `milestones.md`): Die PIN liegt **nie
im Klartext** vor — nicht in der DB, nicht im Log, nicht im Renderer.

**Beschreibung:**
1. Auf dem Pi die `settings`-Tabelle inspizieren (z. B. `sqlite3
   /var/lib/mediaplayer/state.db "SELECT key, value FROM settings;"`): `pin_hash` muss das
   Format `scrypt$<hex>$<hex>` haben — **keine** Klartext-PIN.
2. App-Logs/Journal nach der eingegebenen PIN durchsuchen — sie darf **nirgends** auftauchen.
3. Bestätigen, dass über IPC **kein** Hash/Secret an den Renderer geht (nur `{ ok }`-
   Antworten) — Code-Stichprobe gegen `register.ts`/`ipc-contract.ts`.

**Caveats:**
- Schutzniveau ist bewusst niedrig (Kind-Gerät), aber Klartext-PIN ist ein hartes No-Go.
- Falls eine Klartext-PIN oder ein Hash im Log auftaucht: zurück in die Codebase (T5.02/
  T5.04), Logging entfernen, re-deployen.

**Akzeptanzkriterien:**
- [x] `settings.pin_hash` ist gehasht (`scrypt$…`), keine Klartext-PIN in der DB.
- [x] Keine Klartext-PIN in Logs/Journal.
- [x] Kein Hash/Secret wird über IPC an den Renderer gereicht.

---

## Risiken & Hinweise (zusammengefasst)

1. **Geste vs. versehentliches Antippen (Kind):** Die 2-s-Schwelle + Ring-Start erst ab
   400 ms müssen verhindern, dass das Kind das Gate entdeckt. Die verbindliche Feinjustage
   (Move-Toleranz, Pointer-Capture) erfolgt am echten kapazitiven Touch (T5.13).
2. **PIN-Speicherung (Sicherheits-Checkpoint):** Gehasht via Node-Builtin `crypto` (scrypt +
   Salt, konstantzeitiger Vergleich). **Kein** bcrypt/argon2 (native Module → electron-
   rebuild-Aufwand). Klartext-PIN verlässt nie den Main-Prozess. Verpflichtender Review in
   T5.16.
3. **Serverseitiges Lautstärke-Limit:** Hard-Cap in `setVolume()` (T5.05) — das UI-Feedback
   (T5.11) ist rein kosmetisch und darf das Limit nicht umgehen oder duplizieren. Alle
   Lautstärke-Calls laufen durch denselben Pfad.
4. **Scope-Disziplin:** BT-Verwaltung (M6) und Sync-Log (M7) sind in S10 **reine
   Platzhalter** ohne Funktion. Kein Lockout/Cooldown beim PIN (E11). Slate-Theme nur auf
   S9/S10.
5. **Kein neuer Datenfluss/Event nötig:** Settings sind Pull-Style (`invoke`),
   Lautstärke-Rückmeldung kommt weiter über `player:state` (`mixer`). Preload bleibt
   unverändert (generische Whitelist). `settings`-Tabelle existiert bereits (Migration v1) —
   keine neue Migration.
6. **Persistenz/overlayfs:** PIN-Hash und `max_volume` liegen in `state.db` — wie die
   Playback-Position muss der DB-Schreibpfad persistent sein (T5.14), sonst „vergisst" das
   Gerät die PIN nach Reboot.
