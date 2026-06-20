# M6 — Bluetooth-Audio (S7): Task-Plan

## Überblick

M6 liefert **Spec-Phase 4**: den primären Audioweg über Bluetooth inkl. UI.

- **BT-Icon im Player (S5)** → öffnet **S7 Bluetooth-Dialog**: verbundenes Gerät, gekoppelte
  Liste, „Neues Gerät koppeln" mit 30-s-Scan + Fortschritt.
- **Audio primär über BT** (PipeWire-Sink); bei Trennung **Fallback auf Klinke** — Wiedergabe
  läuft weiter (E4).
- **Autoconnect** beim Boot: zuletzt verbundenes Gerät wird automatisch verbunden.
- **Toast** bei Verbindungsänderung (Gerätename + Status, 3,5 s; E5).
- **BT-Status-Icon** im Player: eigenes Icon für verbunden / nicht verbunden (E4).
- **S10 Elterneinstellungen**: Pairing löschen (füllt M5-Platzhalter).

## Architektur-Grundvertrag (M1–M5, zwingend)

- Electron-Main kapselt **alle** privilegierten Operationen — auch BlueZ/D-Bus. Renderer ist
  rein, hält keinen Gerätezustand, ruft BT **nur** über die IPC-Bridge.
- Neue Channels **ausschließlich additiv** in `ALLOWED_COMMANDS` / `ALLOWED_EVENTS`.
- **Event-getrieben, kein Polling**: BT-Verbindungsänderungen kommen als `bt:connection`-Events
  aus einem langlaufenden Listener (Muster wie `startIdleLoop` / `startSyncLogBridge`).
- IPC-Namenskonvention: **Doppelpunkt-Namespacing** (`bt:scan`, nicht `bt.scan`).
- Alle UI-Strings in `de.json`, key-basiert über `useT()`. Keine hartcodierten Strings im JSX.
- **Single Source of Truth**: BT-Verbindungszustand ist im Main autoritativ; Renderer spiegelt.
- BlueZ wird über **`bluetoothctl`-CLI als Subprozess** angesprochen (Node-Builtin
  `child_process`), **nicht** über eine native D-Bus-npm-Lib — vermeidet native Module +
  electron-rebuild.
- **Sink-Routing ist KEIN Code-Thema:** PipeWire wechselt bei BT-Trennung automatisch auf
  Klinke und bei Reconnect automatisch zurück auf BT. Kein `wpctl set-default`, kein
  MPD-Neustart. Der Code muss nur **Events erkennen** (für Icon + Toast), nicht umschalten.
- **Event-Quelle:** langlaufender `bluetoothctl`-Prozess, stdout parsen auf
  `[CHG] Device <MAC> Connected: yes/no`. `busctl monitor` ist als `player` nicht erlaubt.
- **`pair` muss immer von `trust` gefolgt werden** — sonst kein Autoconnect beim nächsten Boot.

## Bestehendes (NICHT neu bauen)

- **`startIdleLoop`** (`main/mpd/idle.ts`): langlaufender Dienst mit `getWindow`-Callback,
  Cleanup-Funktion, exponentielles Backoff. **Vorlage für den BT-Listener.**
- **`startSyncLogBridge`** (`main/sync/watch-log.ts`): Hintergrunddienst → getypte Events an
  Renderer. **Vorlage für `bt:connection`-Events.**
- **IPC-Vertrag** (`shared/ipc-contract.ts`): Commands/Events getypt, Whitelists, generische
  Preload (neue Channels brauchen **keine** Preload-Änderung).
- **`registerIpcHandlers(getWindow)`** (`main/ipc/register.ts`): zentrale Handler-Stelle.
- **S5 Player** (`renderer/src/screens/S5Player.tsx`): BT-Platzhalter-SVG in Zeile 160–172.
- **S10 Settings** (`renderer/src/screens/S10Settings.tsx`): BT-Platzhalter in Zeile 181–184.
- **Overlay-Muster**: S4Detail / S6Chapters / S9PinDialog (Scrim, Enter 220 / Exit 160, Tap
  außerhalb schließt). **S7 nutzt exakt dieses Muster.**
- **`<Pressable>`**, **`<BackButton>`**, i18n via `useT()`, `screens.css`, `theme.css`.

## Reihenfolge & Abhängigkeiten

```
PI-TASKS (auf dem Gerät)
  T6.P1 BT-Hardware-Spike → bestätigtes Befehls-Set + Sink-Mechanismus
     │
     ├── T6.P2 System-Setup: PipeWire+BlueZ-Sink, Polkit/D-Bus-Rechte
     │      │
     │      ├── T6.P3 Autoconnect-Service beim Boot
     │      └── T6.P4 Security-Review D-Bus/Polkit-Rechte
     │
CODE-TASKS (im Repo)
  T6.C1 Shared BT-Typen + IPC-Vertrag erweitern
     │
     ├── T6.C2 BT-Adapter-Modul (bluetoothctl-Wrapper)      ← Befehle aus T6.P1
     │      │
     │      ├── T6.C3 BT-Event-Listener-Dienst               ← Muster aus idle.ts
     │      └── T6.C4 IPC-Handler registrieren
     │
     ├── T6.C6 de.json: BT-/Toast-Strings                    (unabhängig)
     ├── T6.C7 Globales Toast-System                          (unabhängig)
     │
     ├── T6.C8 BT-Status-Icon in S5 (tippbar → S7)           ← T6.C1
     ├── T6.C9 S7 Bluetooth-Dialog                            ← T6.C1, T6.C6, T6.C7
     ├── T6.C10 bt:connection → Toast verdrahten              ← T6.C7
     └── T6.C11 S10: BT-Pairing-Löschen                      ← T6.C1, T6.C6
```

---

## Übersicht

| ID | Titel | Größe | Status |
|----|-------|-------|--------|
| T6.P1 | BT-Hardware-Spike | L | ✅ erledigt |
| T6.P2 | System-Setup: PipeWire+BlueZ | L | ✅ erledigt |
| T6.P3 | Autoconnect beim Boot | M | ✅ erledigt (BlueZ Trust reicht) |
| T6.P4 | Security-Review | S | offen (nach Code-Tasks) |
| T6.C1 | Shared BT-Typen + IPC-Vertrag erweitern | S | ✅ fertig (2026-06-20) |
| T6.C2 | BT-Adapter-Modul (bluetoothctl-Wrapper) | L | ✅ fertig (2026-06-20) |
| T6.C3 | BT-Event-Listener-Dienst | M | ✅ fertig (2026-06-20) |
| T6.C4 | IPC-Handler registrieren | S | ✅ fertig (2026-06-20) |
| ~~T6.C5~~ | ~~Sink-Fallback-Logik~~ | — | entfällt (PipeWire automatisch) |
| T6.C6 | de.json: BT-/Toast-Strings | S | ✅ fertig (2026-06-20) |
| T6.C7 | Globales Toast-System | M | ✅ fertig (2026-06-20) |
| T6.C8 | BT-Status-Icon in S5 | M | ✅ fertig (2026-06-20) |
| T6.C9 | S7 Bluetooth-Dialog | L | ✅ fertig (2026-06-20) |
| T6.C10 | bt:connection → Toast verdrahten | S | ✅ fertig (2026-06-20) |
| T6.C11 | S10: BT-Pairing-Löschen | M | ✅ fertig (2026-06-20) |

---

## Pi-Tasks

### T6.P1 — BT-Hardware-Spike ✅ ERLEDIGT (2026-06-20)
Ergebnisse dokumentiert in `tasks/m6-spike-notes.md`.

**Kernbefunde:**
- BlueZ 5.82, PipeWire 1.4.2, Test-Gerät: OpenRun Pro 2 by Shokz (A2DP)
- Alle `bluetoothctl`-Befehle (pair/trust/connect/disconnect/remove/scan/info/devices)
  funktionieren als `player`-User **ohne sudo**
- **Event-Quelle:** langlaufender `bluetoothctl`-Prozess, stdout parsen auf
  `[CHG] Device <MAC> Connected: yes/no` (`busctl monitor` hat keinen Zugriff als `player`)
- **Sink-Routing komplett automatisch:** PipeWire wechselt bei BT-Trennung auf Klinke und
  bei Reconnect zurück auf BT — ohne Code, ohne MPD-Neustart, ohne Knacken → **T6.C5 entfällt**
- MPD muss auf `type "pulse"` mit `server "unix:/run/user/1000/pulse/native"` umgestellt sein
- `power on` und `rfkill unblock` brauchen sudo → gelöst per Boot-Service

---

### T6.P2 — System-Setup ✅ ERLEDIGT (2026-06-20)

**Was eingerichtet wurde:**
1. PipeWire installiert: `pipewire pipewire-pulse pipewire-alsa libspa-0.2-bluetooth wireplumber`
2. PipeWire User-Services enabled: `pipewire`, `pipewire-pulse`, `wireplumber`
3. MPD-Config (`/etc/mpd.conf`) geändert: `type "pulse"`, `server "unix:/run/user/1000/pulse/native"`
4. Systemd-Service `/etc/systemd/system/bt-unblock.service` angelegt + enabled:
   ```ini
   [Unit]
   Description=Unblock Bluetooth at boot
   Before=bluetooth.service
   [Service]
   Type=oneshot
   ExecStart=/usr/sbin/rfkill unblock bluetooth
   [Install]
   WantedBy=multi-user.target
   ```
5. **Keine Polkit-Regel nötig** — `bluetoothctl` pair/connect/disconnect läuft als `player` ohne Rechte-Eskalation
6. `/var/lib/bluetooth` liegt auf ext4 (kein overlayfs) — Pairing-Daten persistent

---

### T6.P3 — Autoconnect beim Boot ✅ ERLEDIGT (2026-06-20)

**Kein extra Service nötig.** BlueZ Trust-Mechanismus reicht: ein getru­stetes Gerät wird
beim Einschalten automatisch verbunden. Verifiziert per Reboot-Test — Kopfhörer verbindet
automatisch, PipeWire setzt BT-Sink als Default, MPD-Audio kommt über BT.

---

### T6.P4 — Security-Review D-Bus/Polkit-Rechte
**Größe:** S · **Status:** offen — nach Abschluss der Code-Tasks

Verbindlicher Sicherheits-Checkpoint (laut `milestones.md`).

**Prüfpunkte:**
1. Keine Polkit-Regel angelegt (nicht nötig) — bestätigen, dass `player` trotzdem
   **nur** BT-Aktionen kann und keine weitergehenden D-Bus-Rechte hat.
2. App (Renderer) greift BT **ausschließlich** über IPC-Bridge zu — kein direkter
   D-Bus-/Subprozess-Zugriff im Renderer (Architektur-Grundvertrag).
3. MAC-Adressen aus dem Renderer werden im Adapter validiert und **nie** in eine Shell
   interpoliert (Injection-Schutz via `execFile` mit Argument-Array).
4. Keine sensiblen Daten im Klartext in Logs.
5. `bt-unblock.service` prüfen: tut nur `rfkill unblock bluetooth`, keine weiteren Rechte.

**Akzeptanzkriterien:**
- [ ] `player`-User hat keine weitergehenden D-Bus-Rechte als BT
- [ ] Renderer hat keinen direkten Geräte-Zugriff
- [ ] MAC-Validierung + keine Shell-Interpolation im Adapter-Code
- [ ] `bt-unblock.service` ist minimal (nur rfkill)

---

## Code-Tasks

### T6.C1 — Shared BT-Typen + IPC-Vertrag erweitern
**Größe:** S · **Abhängigkeiten:** keine

Geteilte BT-Typen definieren und den IPC-Vertrag um `bt:*`-Commands und `bt:connection`-Event
erweitern.

**Schritte:**
1. Neue Datei `app/src/shared/bt.ts`:
   ```ts
   export interface BtDevice {
     mac: string;       // "AA:BB:CC:DD:EE:FF"
     name: string;      // Gerätename oder MAC als Fallback
     paired: boolean;
     connected: boolean;
   }
   export interface BtStatus {
     poweredOn: boolean;
     connected: BtDevice | null;
   }
   ```
2. In `IpcCommands` (in `ipc-contract.ts`) ergänzen:
   ```ts
   'bt:getStatus':    { request: void;                     response: BtStatus };
   'bt:listPaired':   { request: void;                     response: { devices: BtDevice[] } };
   'bt:scan':         { request: { durationMs?: number };  response: { devices: BtDevice[] } };
   'bt:pair':         { request: { mac: string };          response: { ok: boolean } };
   'bt:connect':      { request: { mac: string };          response: { ok: boolean } };
   'bt:disconnect':   { request: { mac: string };          response: { ok: boolean } };
   'bt:removeDevice': { request: { mac: string };          response: { ok: boolean } };
   ```
3. In `IpcEvents` ergänzen:
   ```ts
   'bt:connection': { device: BtDevice | null; event: 'connected' | 'disconnected' };
   ```
4. Die sieben Commands in `ALLOWED_COMMANDS`, `bt:connection` in `ALLOWED_EVENTS`.
5. **`REPLAYABLE_EVENTS` NICHT erweitern** — `bt:connection` ist kein One-Shot-Event.
   Renderer holt Initialzustand per `bt:getStatus` beim Mount.

**Dateien:** neu: `app/src/shared/bt.ts`; geändert: `app/src/shared/ipc-contract.ts`.

**Akzeptanzkriterien:**
- [ ] Sieben Commands + ein Event getypt und whitelistet
- [ ] `REPLAYABLE_EVENTS` unverändert
- [ ] `npm run typecheck` fehlerfrei

---

### T6.C2 — BT-Adapter-Modul (bluetoothctl-Wrapper)
**Größe:** L · **Abhängigkeiten:** T6.C1

Ein gekapseltes Adapter-Modul, das BlueZ über `bluetoothctl` als Subprozess anspricht.

**Konkrete Befehle (aus Spike verifiziert, alle als `player` ohne sudo):**

| Methode | CLI-Befehl | Erfolgs-Ausgabe |
|---------|-----------|-----------------|
| `getStatus()` | `bluetoothctl show` | Parsen: `Powered: yes/no` |
| | `bluetoothctl info <MAC>` | Parsen: `Connected: yes/no`, `Alias: ...` |
| `listPaired()` | `bluetoothctl devices Paired` | `Device <MAC> <Name>` pro Zeile |
| `scan(ms)` | `bluetoothctl --timeout <s> scan on` (mit `timeout` wrappen) | `[NEW] Device <MAC> <Name>` pro Fund |
| `pair(mac)` | `bluetoothctl pair <MAC>` **gefolgt von** `bluetoothctl trust <MAC>` | `Pairing successful` / `trust succeeded` |
| `connect(mac)` | `bluetoothctl connect <MAC>` | `Connection successful` |
| `disconnect(mac)` | `bluetoothctl disconnect <MAC>` | `Disconnection successful` |
| `remove(mac)` | `bluetoothctl remove <MAC>` | `Device has been removed` |

**Schritte:**
1. Neue Datei `app/src/main/bt/adapter.ts` — implementiert:
   ```ts
   getStatus(): Promise<BtStatus>
   listPaired(): Promise<BtDevice[]>
   scan(durationMs: number): Promise<BtDevice[]>
   pair(mac: string): Promise<{ ok: boolean }>
   connect(mac: string): Promise<{ ok: boolean }>
   disconnect(mac: string): Promise<{ ok: boolean }>
   remove(mac: string): Promise<{ ok: boolean }>
   ```
2. Alle CLI-Aufrufe über `child_process.execFile('bluetoothctl', [...args])` —
   **niemals** String-Konkatenation in eine Shell (Injection-Schutz).
3. **MAC-Validierung** (Regex `^[0-9A-Fa-f]{2}(:[0-9A-Fa-f]{2}){5}$`) vor jedem Befehl.
4. `pair()` muss **immer** `trust` nach `pair` aufrufen — sonst kein Autoconnect.
5. Parsing von `bluetoothctl`-Ausgabe defensiv: Fehler nicht werfen, sondern
   `{ ok: false }` / leere Liste liefern und loggen.
6. `scan` braucht einen Wrapper: `bluetoothctl --timeout <s> scan on` als Subprozess,
   stdout zeilenweise lesen auf `[NEW] Device <MAC> <Name>`, nach Timeout die gesammelte
   Liste zurückgeben. Bereits gekoppelte Geräte tauchen **nicht** als `[NEW]` auf.
7. Exportiere `getBtAdapter()` als Singleton.

**Dateien:** neu: `app/src/main/bt/adapter.ts`.

**Akzeptanzkriterien:**
- [ ] Alle sieben Methoden implementiert, delegieren an `bluetoothctl`/`busctl`
- [ ] MAC-Validierung vor jedem CLI-Aufruf
- [ ] Keine Shell-String-Interpolation (`execFile` mit Array)
- [ ] `npm run typecheck` fehlerfrei

---

### T6.C3 — BT-Event-Listener-Dienst
**Größe:** M · **Abhängigkeiten:** T6.C2, T6.C1

Ein langlaufender Hintergrunddienst, der BT-Verbindungsänderungen erkennt und als
`bt:connection`-Events an den Renderer pusht. Folgt **exakt dem Muster** von
`startIdleLoop` (Datei `main/mpd/idle.ts`).

**Schritte:**
1. Neue Datei `app/src/main/bt/listen.ts`:
   ```ts
   export function startBtListener(
     getWindow: () => BrowserWindow | null
   ): () => void
   ```
2. **Event-Quelle** (aus Spike bestätigt): einen langlaufenden `bluetoothctl`-Prozess
   offen halten (interaktiver Modus, kein `--timeout`). Dessen stdout zeilenweise lesen
   und auf diese Zeilen parsen:
   ```
   [CHG] Device A8:F5:E1:CF:15:31 Connected: yes
   [CHG] Device A8:F5:E1:CF:15:31 Connected: no
   ```
   (`busctl monitor org.bluez` ist als `player` nicht erlaubt — Access denied.)
3. Bei erkannter Änderung: `getStatus()` vom Adapter abfragen, dann:
   ```ts
   getWindow()?.webContents.send('bt:connection', {
     device: status.connected,
     event: status.connected ? 'connected' : 'disconnected',
   });
   ```
4. **Debounce** doppelter Events — nur bei echtem Zustandswechsel senden (vorherigen
   `connected`-MAC vergleichen).
5. Reconnect bei Subprozess-Tod (Backoff wie in `idle.ts`).
6. Cleanup-Funktion killt den Subprozess zuverlässig.
7. In `app/src/main/index.ts` starten — analog zu `startIdleLoop`/`startSyncLogBridge`:
   ```ts
   const stopBt = startBtListener(() => BrowserWindow.getAllWindows()[0] ?? null);
   app.on('before-quit', () => { stopBt(); /* … */ });
   ```

**Dateien:** neu: `app/src/main/bt/listen.ts`; geändert: `app/src/main/index.ts`.

**Akzeptanzkriterien:**
- [ ] Connect/Disconnect erzeugt genau ein `bt:connection`-Event mit korrektem Payload
- [ ] Dienst wird in `index.ts` gestartet und bei `before-quit` sauber gestoppt
- [ ] Doppel-Events entprellt
- [ ] Reconnect bei Subprozess-Tod
- [ ] `npm run typecheck` fehlerfrei

---

### T6.C4 — IPC-Handler registrieren
**Größe:** S · **Abhängigkeiten:** T6.C2, T6.C1

Die sieben `bt:*`-Commands als dünne Handler in `register.ts` implementieren — delegieren
an den `BtAdapter`.

**Schritte:**
1. In `app/src/main/ipc/register.ts` den Adapter importieren und Handler registrieren:
   ```ts
   ipcMain.handle('bt:getStatus',    () => getBtAdapter().getStatus());
   ipcMain.handle('bt:listPaired',   async () => ({ devices: await getBtAdapter().listPaired() }));
   ipcMain.handle('bt:scan',         async (_e, p) => ({ devices: await getBtAdapter().scan(p?.durationMs ?? 30_000) }));
   ipcMain.handle('bt:pair',         (_e, p) => getBtAdapter().pair(p.mac));
   ipcMain.handle('bt:connect',      (_e, p) => getBtAdapter().connect(p.mac));
   ipcMain.handle('bt:disconnect',   (_e, p) => getBtAdapter().disconnect(p.mac));
   ipcMain.handle('bt:removeDevice', (_e, p) => getBtAdapter().remove(p.mac));
   ```
2. Scan-Default: 30 000 ms (Spec).
3. Fehler aus dem Adapter als `{ ok: false }` zurückgeben, nicht als Throw.

**Dateien:** geändert: `app/src/main/ipc/register.ts`.

**Akzeptanzkriterien:**
- [ ] Alle sieben Handler registriert, delegieren an `getBtAdapter()`
- [ ] `npm run typecheck` fehlerfrei

---

### ~~T6.C5 — Sink-Fallback-Logik~~ ENTFÄLLT

**Spike-Ergebnis:** PipeWire routet bei BT-Trennung **automatisch** auf die Klinke zurück
und bei Reconnect **automatisch** zurück auf BT. Kein Code nötig — kein `wpctl set-default`,
kein MPD-Neustart, kein Knacken. Siehe `tasks/m6-spike-notes.md`.

---

### T6.C6 — de.json: BT-/Toast-Strings
**Größe:** S · **Abhängigkeiten:** keine

Alle neuen UI-Strings key-basiert in `de.json` ergänzen.

**Strings (additiv, bestehende nicht ändern):**
```json
"bt.title": "Bluetooth",
"bt.connected": "Verbunden",
"bt.noDevice": "Kein Gerät",
"bt.paired": "Gekoppelte Geräte",
"bt.connect": "Verbinden",
"bt.disconnect": "Trennen",
"bt.pairNew": "Neues Gerät koppeln",
"bt.scanning": "Suche läuft …",
"bt.scanNoResults": "Kein Gerät gefunden",
"bt.remove": "Gerät entfernen",
"bt.removeConfirm": "Kopplung wirklich entfernen?",
"bt.close": "Schließen",
"bt.toast.connected": "{device} verbunden",
"bt.toast.disconnected": "{device} getrennt",
"bt.icon.connected": "Bluetooth verbunden",
"bt.icon.disconnected": "Bluetooth nicht verbunden"
```

**Hinweis:** `{device}` ist ein Platzhalter — wird im Renderer per `String.replace` ersetzt
(falls `useT()` keine Interpolation unterstützt).

**Dateien:** geändert: `app/src/renderer/src/i18n/de.json`.

**Akzeptanzkriterien:**
- [ ] Alle Keys vorhanden, JSON valide, keine Duplikate

---

### T6.C7 — Globales Toast-System
**Größe:** M · **Abhängigkeiten:** keine

Ein globales Toast-System. Wird in M6 für BT-Benachrichtigungen genutzt, später auch von
M7-Sync — daher **allgemein halten** (nimmt fertigen Text, kein BT-Datenmodell).

**Schritte:**
1. Neue Datei `app/src/renderer/src/components/ToastProvider.tsx`:
   ```tsx
   const ToastContext = createContext<{ showToast: (text: string) => void } | null>(null);
   export function useToast(): { showToast: (text: string) => void } { … }
   export function ToastProvider({ children }: { children: React.ReactNode }) { … }
   ```
2. State: aktueller Toast `{ id, text, phase: 'in' | 'visible' | 'out' }`. Einzelner Toast
   genügt; bei mehreren kurz hintereinander den laufenden ersetzen.
3. Timer-Sequenz: `in` (200 ms) → `visible` (3500 ms) → `out` (200 ms) → entfernen.
4. Toast-Element absolut positioniert **über allen Screens**, `pointer-events: none`.
5. CSS in `screens.css`: `.toast`, `.toast--in`, `.toast--visible`, `.toast--out`. Slide + Fade.
   **Kein** blinkendes/flackerndes Element (WCAG 2.3.1). Lesbar auf 800×480.
6. `ToastProvider` in `main.tsx` um die App legen (wie `I18nProvider`):
   ```tsx
   <I18nProvider>
     <ToastProvider>
       <App />
     </ToastProvider>
   </I18nProvider>
   ```

**Dateien:** neu: `app/src/renderer/src/components/ToastProvider.tsx`;
geändert: `app/src/renderer/src/main.tsx`, `screens.css`.

**Akzeptanzkriterien:**
- [ ] `useToast().showToast('…')` zeigt Toast über allen Screens
- [ ] Timing: ein 200 ms, sichtbar 3,5 s, aus 200 ms, dann entfernt
- [ ] Zweiter Toast ersetzt den laufenden sauber (keine Timer-Leaks)
- [ ] Kein Flackern; lesbar auf 800×480

---

### T6.C8 — BT-Status-Icon in S5
**Größe:** M · **Abhängigkeiten:** T6.C1

Das BT-Platzhalter-SVG in der Player-Titelleiste (S5, Zeile 160–172) durch ein
**zustandsabhängiges, tippbares** Icon ersetzen.

**Schritte:**
1. In `S5Player.tsx` BT-Status-State:
   ```ts
   const [btConnected, setBtConnected] = useState(false);
   useEffect(() => {
     void window.hoermond.invoke('bt:getStatus', undefined)
       .then((s) => setBtConnected(s.connected !== null));
     const off = window.hoermond.on('bt:connection', (e) =>
       setBtConnected(e.event === 'connected'));
     return () => off();
   }, []);
   ```
2. **Zwei eigene SVG-Icons**: „verbunden" und „nicht verbunden" (E4: eigenes Icon, nicht nur
   ausgegraut). **Form unterscheidet sich** (z. B. BT-Symbol mit Schrägstrich für
   „nicht verbunden"), nicht nur Farbe.
3. Icon tippbar (`<Pressable>` oder `onClick`) → öffnet S7 als Overlay (lokaler
   `btOpen`-State). Mond-Icon daneben bleibt unverändert.
4. Aria-Labels aus `bt.icon.connected` / `bt.icon.disconnected`.
5. CSS: `.s5-bt-icon--connected` / `.s5-bt-icon--disconnected`.

**Dateien:** geändert: `app/src/renderer/src/screens/S5Player.tsx`, `screens.css`.

**Akzeptanzkriterien:**
- [ ] Zwei unterschiedliche Icons für verbunden/nicht verbunden (E4)
- [ ] Zustand lädt beim Mount (`bt:getStatus`) und aktualisiert bei `bt:connection`
- [ ] Tap öffnet S7; Mond-Icon unverändert
- [ ] `npm run typecheck` fehlerfrei

---

### T6.C9 — S7 Bluetooth-Dialog
**Größe:** L · **Abhängigkeiten:** T6.C1, T6.C6, T6.C7

Der modale Bluetooth-Dialog über S5.

**Schritte:**
1. Neue Datei `app/src/renderer/src/screens/S7Bluetooth.tsx`:
   ```ts
   interface S7Props { onClose: () => void; }
   ```
2. Beim Mount: `bt:getStatus` (verbundenes Gerät) + `bt:listPaired` (Liste).
   `bt:connection` abonnieren für Live-Updates.
3. **Verbundenes Gerät** oben: Name oder `bt.noDevice`.
4. **Gekoppelte Liste:** je Eintrag Name + Button „Verbinden" (`bt:connect`) bzw.
   „Trennen" (`bt:disconnect`).
5. **„Neues Gerät koppeln"** (`bt.pairNew`): startet `bt:scan { durationMs: 30000 }`, zeigt
   **sichtbaren Fortschritt** (umlaufender Ring oder Restzeit; `bt.scanning`). Nach Resolve
   gefundene Geräte listen; Tap auf Gerät → `bt:pair` → `bt:connect`. Keine Treffer →
   `bt.scanNoResults`.
6. **Modal-Muster** wie S4/S6/S9: Scrim `--scrim`, Enter 220 ms (Fade + Scale 0,96→1,0) /
   Exit 160 ms, Tap außerhalb oder Schließen-Element → `onClose`.
7. CSS in `screens.css`: `.s7-*` (Dialog-Card, Geräteliste, Scan-Fortschritt).
8. In `S5Player.tsx` als Overlay rendern wenn `btOpen === true`.

**Hinweise:**
- `bt:scan` blockiert bis 30 s. Währenddessen **muss** Fortschritt sichtbar sein.
  Scan-Button während Lauf deaktivieren.
- Gerätenamen bevorzugen, MAC nur als Fallback (dezent).
- **Kein Pairing-Löschen in S7** — das gehört in S10 (T6.C11). Kind soll nicht versehentlich
  entkoppeln.
- Nach jeder Aktion Status/Liste per `bt:getStatus`/`bt:listPaired` neu laden (Single Source
  of Truth = Main).

**Dateien:** neu: `app/src/renderer/src/screens/S7Bluetooth.tsx`;
geändert: `app/src/renderer/src/screens/S5Player.tsx`, `screens.css`.

**Akzeptanzkriterien:**
- [ ] Verbundenes Gerät (oder „Kein Gerät") + gekoppelte Liste mit Connect/Disconnect
- [ ] 30-s-Scan mit sichtbarem Fortschritt; gefundene Geräte koppelbar
- [ ] Status/Liste aktualisieren live bei `bt:connection`
- [ ] Modal: Scrim, Enter 220 / Exit 160, Tap außerhalb schließt
- [ ] Kein Pairing-Löschen in S7
- [ ] `npm run typecheck` fehlerfrei

---

### T6.C10 — bt:connection → Toast verdrahten
**Größe:** S · **Abhängigkeiten:** T6.C7 (Toast), T6.C1 (bt:connection), T6.C6 (Strings)

Jede BT-Verbindungsänderung erzeugt einen Toast mit Gerätename + Status (E5).

**Schritte:**
1. An einer globalen Stelle (z. B. in `Root.tsx` oder einer kleinen `BtToastBridge`-Komponente
   innerhalb des `ToastProvider`) `bt:connection` abonnieren:
   ```tsx
   const { showToast } = useToast();
   useEffect(() => {
     const off = window.hoermond.on('bt:connection', (e) => {
       const name = e.device?.name ?? '';
       const key = e.event === 'connected' ? 'bt.toast.connected' : 'bt.toast.disconnected';
       showToast(t(key).replace('{device}', name));
     });
     return () => off();
   }, [showToast]);
   ```
2. **Genau ein** globales Abo für Toasts — S5-Icon und S7 abonnieren `bt:connection` für
   ihren eigenen State, dürfen aber **nicht** zusätzlich toasten (sonst doppelt).
3. Bei `disconnected` mit `device: null`: sinnvollen Fallback-Text (ohne leeren Namen).

**Dateien:** geändert: `app/src/renderer/src/Root.tsx` (oder neue `BtToastBridge.tsx`).

**Akzeptanzkriterien:**
- [ ] Connect/Disconnect zeigt **einen** Toast mit Gerätename + Status
- [ ] Toast erscheint screen-übergreifend
- [ ] Keine doppelten Toasts

---

### T6.C11 — S10: BT-Pairing-Löschen
**Größe:** M · **Abhängigkeiten:** T6.C1, T6.C6

Die BT-Platzhaltersektion in S10 (Zeile 181–184) durch eine funktionierende
Pairing-Verwaltung ersetzen.

**Schritte:**
1. In `S10Settings.tsx` die Platzhalter-Sektion ersetzen:
   - Beim Mount `bt:listPaired` laden.
   - Liste der gekoppelten Geräte (Name) mit je einem „Gerät entfernen"-Button (`bt.remove`).
   - Tap → kurze Bestätigung (`bt.removeConfirm`) → `bt:removeDevice { mac }` → Liste neu
     laden.
   - Leere Liste: dezenter Hinweis.
2. Slate-Theme beibehalten (Eltern-Bereich).
3. Sync-Log-Platzhalter (`settings.syncLog`) **unangetastet** lassen (M7).

**Dateien:** geändert: `app/src/renderer/src/screens/S10Settings.tsx`, `screens.css`.

**Akzeptanzkriterien:**
- [ ] S10-BT-Sektion listet gekoppelte Geräte (statt „Bald verfügbar")
- [ ] „Gerät entfernen" ruft `bt:removeDevice` und aktualisiert die Liste
- [ ] Slate-Theme erhalten; Sync-Log-Platzhalter unverändert
- [ ] `npm run typecheck` fehlerfrei

---

## Designkonstanten (Referenz für alle Tasks)

**Canvas:** 800×480 px Querformat, kein responsives Layout. Safe-Area 20 px, Titelleiste 44 px.
Kein Cursor, keine Hover-Zustände (Kiosk).

**Farben:** `--flieder #9B7EDC` (Akzent), `--flieder-deep #6E54B8` (Buttons/Icons, weißer Text
ok), `--flieder-tint #F2EDFB`, `--surface #FFFFFF`, `--text-primary #2A2342`,
`--text-secondary #6B6480`, `--scrim rgba(42,35,66,0.55)`.

**Timing:** Press 90 ms rein / 120 ms zurück, Scale 0,96 (`<Pressable>`). Overlay ein 220 ms /
aus 160 ms. Toast ein 200 ms / sichtbar 3,5 s / aus 200 ms.

**Touch-Targets:** mindestens 44 px Tap-Fläche, Mindestabstand ≥ 16 px.
