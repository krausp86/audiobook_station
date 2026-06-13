# M1 Audit Report

Date: 2026-06-13
Reviewer: Codebase Auditor
Scope: T1.08–T1.14 (laptop/app tasks). T1.01–T1.07, T1.15, T1.16 (Pi hardware) explicitly out of scope.

## Summary

The M1 app-strand implementation is solid and largely faithful to the task plan. The architecture contract is honoured: `contextIsolation: true`, `nodeIntegration: false`, a whitelist-enforcing Preload bridge, a single central `ipc-contract.ts` imported by Main and Preload, no `any` in the bridge signature, no direct `ipcRenderer`/`window.require` leakage to the renderer, and all UI strings routed through `useT()`. `npm run typecheck` passes cleanly for both the node and web projects, and `@shared` resolves in all three tsconfigs plus the vite config. Findings are minor and non-blocking: a duplicated `Window.hoermond` declaration that diverges in import style, leftover electron-vite template assets, a placeholder `package.json` identity, an empty stray `components/` directory, and two latent-correctness notes around the `app:ready` event delivery and migration-failure crash behaviour. No CRITICAL issues. M1 app-strand is **approvable with minor cleanup**.

## Task Coverage (T1.08–T1.14)

| Task | Status | Notes |
|------|--------|-------|
| T1.08 electron-vite setup | Pass | Correct main/preload/renderer split, TS, electron-vite v5, electron pinned (`^39.2.6`), `.gitignore` covers `node_modules`/`out`/`dist`. |
| T1.09 ipc-contract.ts | Pass | Central contract present; `IpcCommands`/`IpcEvents`/`HoermondBridge`/`ALLOWED_*` all defined; no `any` in bridge. `@shared` alias wired in vite + both tsconfigs. |
| T1.10 Preload bridge | Pass | `contextBridge.exposeInMainWorld('hoermond', ...)`; whitelist enforced for both invoke and on; returns unsubscribe; `ipcRenderer` never exposed. |
| T1.11 Main BrowserWindow | Pass | 800×480, `frame:false`, `autoHideMenuBar`, correct `webPreferences`; `app:getVersion` handler registered; `app:ready` deferred to `did-finish-load`. Dev-mode kiosk-disable is a sensible deviation (see INFO-1). |
| T1.12 SQLite + migrations | Pass | WAL + `foreign_keys` pragmas set before migrations; idempotent version-gated migration loop in one transaction; `HOERMOND_DB_PATH` honoured; `openDatabase()` called in `whenReady` with try/catch. |
| T1.13 React static screen | Pass | `.boot-screen` 800×480, correct colors `#FBFAFE`/`#2A2342`, logo placeholder, `overflow:hidden`, zeroed margins/padding on `html/body/#root`. |
| T1.14 i18n layer | Pass | `I18nContext` + `de.json`; `t('boot.starting')` used in App; fallback returns key; provider mounted in `main.tsx`; `resolveJsonModule:true` in `tsconfig.web.json`. |

## Findings

### [WARNING] Duplicate, divergent `Window.hoermond` global declaration

`app/src/preload/index.d.ts` and `app/src/renderer/src/global.d.ts` both declare the same global:

```ts
// preload/index.d.ts (line 1)
import type { HoermondBridge } from '../shared/ipc-contract';
declare global { interface Window { hoermond: HoermondBridge; } }

// renderer/src/global.d.ts (line 1)
import type { HoermondBridge } from '@shared/ipc-contract';
declare global { interface Window { hoermond: HoermondBridge; } }
```

Both files are pulled into `tsconfig.web.json` (it includes `src/renderer/src/**/*` and `src/preload/*.d.ts`), and `preload/index.d.ts` is also pulled into `tsconfig.node.json` (`src/preload/**/*`). The task plan (T1.09) specifies exactly one global declaration: `app/src/renderer/src/global.d.ts`. The `preload/index.d.ts` variant is a leftover/extra. It currently compiles because TypeScript merges identical `interface Window` augmentations, but the two diverge in import style (`'../shared/ipc-contract'` vs `'@shared/ipc-contract'`). If either the relative path or the alias breaks during a refactor, only one declaration will fail and the divergence will be confusing to diagnose. There should be a single source of truth for the `window.hoermond` type. Note also `preload/index.d.ts` lacks the trailing `export {};` that `global.d.ts` has — harmless given the `import` already makes it a module, but inconsistent.

### [WARNING] `app:ready` can be missed by the renderer (listener-registration race)

`app/src/main/index.ts:30`:

```ts
win.webContents.on('did-finish-load', () => {
  win.webContents.send('app:ready', { ts: Date.now() });
});
```

This satisfies the literal T1.11 acceptance criterion ("send after `did-finish-load`"), and the manual DevTools verification in the plan will pass because the tester registers `window.hoermond.on('app:ready', ...)` by hand after load. However, in real use a React effect that subscribes via `window.hoermond.on('app:ready', ...)` mounts *after* `did-finish-load` has already fired, so the one-shot event is sent before any listener exists and is silently lost. This is latent because nothing in M1 consumes `app:ready` yet, but the first feature that relies on it (M2+) will hit a non-deterministic miss. Worth recording as a known limitation of the current handshake; a pull-style readiness check or a replay/late-subscriber mechanism will be needed before `app:ready` is depended upon.

### [WARNING] DB-open failure is swallowed; app continues in a broken state

`app/src/main/index.ts:39-46`:

```ts
app.whenReady().then(() => {
  try { openDatabase(); }
  catch (err) { console.error('[db] Failed to open database:', err); }
  createWindow();
  ...
});
```

T1.12 step 4 explicitly asks for: "error on open → log, do not hard-crash the app, but make it visible." The log-and-continue half matches, but the database handle returned by `openDatabase()` is discarded (not stored, not passed anywhere), and the failure is *not* surfaced to the UI in any way — the renderer still shows the normal "Hörmond startet" screen. So the "make it visible" requirement is only partially met: on the Pi a DB failure would be invisible to the operator beyond a console line that goes to a tmpfs log. Acceptable for M1 since nothing consumes the DB yet, but flagged as a partial deviation from the stated acceptance criterion and a future foot-gun once state actually matters.

### [INFO] `is.dev` kiosk/fullscreen disable is an undocumented (but sensible) deviation from T1.11

`app/src/main/index.ts:11-12, 24`:

```ts
fullscreen: !is.dev,
kiosk: !is.dev,
...
if (is.dev && process.env['ELECTRON_RENDERER_URL']) { win.loadURL(...) }
```

The T1.11 code listing hard-codes `fullscreen: true, kiosk: true`. The implementation gates these on `!is.dev`, which is exactly the behaviour the audit brief asks for ("Does dev mode disable kiosk?") and is the correct, developer-friendly choice. Calling it out only because it diverges from the literal task code and is not documented in an ADR/comment beyond the inline `is.dev` usage. On the Pi (production, `is.dev === false`) the kiosk/fullscreen/loadFile paths are all correct.

### [INFO] Leftover electron-vite template assets remain in the tree

`app/src/renderer/src/assets/` still contains `electron.svg`, `wavy-lines.svg`, `base.css`, and `main.css` from the scaffold template. None are referenced by `App.tsx`, `main.tsx`, `App.css`, or `index.html` (verified by grep — no references). They are dead weight that will ship in the bundle if ever imported and add noise. The plan's intent (T1.13: replace template) implies these should be removed. `Versions.tsx`, `window.electron`, and the `ipcMain.on('ping')` template code are all correctly gone.

### [INFO] Empty stray `components/` directory

`app/src/renderer/src/components/` exists but is empty. Harmless, but it is uncommitted-looking scaffolding noise that should either be populated or removed to keep the tree honest.

### [INFO] `package.json` retains template identity metadata

`app/package.json:2-7`:

```json
"name": "app",
"description": "An Electron application with React and TypeScript",
"author": "example.com",
"homepage": "https://electron-vite.org",
```

Name `app`, `author: example.com`, and the electron-vite homepage are scaffold defaults. Not an M1 acceptance criterion, but these flow into electron-builder artefact metadata (product name, publisher) and should be set to real "Hörmond" values before any packaged build (T1.15).

### [INFO] `index.html` `<title>` is still "Electron"

`app/src/renderer/index.html`: `<title>Electron</title>`. Invisible in kiosk mode (no titlebar), so cosmetically irrelevant for M1, but worth correcting for consistency. The CSP meta tag present here (`default-src 'self'`) is a positive — see below.

## Verified Correct

- **Architecture contract — Preload security:** `contextBridge.exposeInMainWorld('hoermond', bridge)` only; `ipcRenderer` is never exposed to the renderer; whitelist check enforced in *both* `invoke` and `on` against `ALLOWED_COMMANDS`/`ALLOWED_EVENTS` (`preload/index.ts:12, 18`).
- **Architecture contract — webPreferences:** `contextIsolation: true`, `nodeIntegration: false`, `sandbox: false` with the ADR-3 rationale in a comment (`main/index.ts:18-20`).
- **No renderer escape hatches:** No `window.require`, no direct `ipcRenderer` import, no `window.electron`/`window.api` anywhere in `src/renderer`.
- **Type safety:** No `any` in `HoermondBridge` (generics over `IpcCommandChannel`/`IpcEventChannel`); `npm run typecheck` (both `tsconfig.node.json` and `tsconfig.web.json`) passes with zero errors.
- **`@shared` alias resolution:** declared for `main`, `preload`, and `renderer` in `electron.vite.config.ts`, and as a `paths` entry in both `tsconfig.node.json` and `tsconfig.web.json`. `src/shared/**/*` is in the `include` of both tsconfigs.
- **IPC contract consistency:** `app:getVersion` is in `ALLOWED_COMMANDS` and registered via `ipcMain.handle` in Main; `app:ready` is in `ALLOWED_EVENTS` and sent via `webContents.send`. No orphan channels in either direction.
- **Migration correctness:** `journal_mode = WAL` and `foreign_keys = ON` set *before* `runMigrations` (`db/index.ts:8-10`); `schema_version` created with `IF NOT EXISTS`; only migrations with `version > current` run, sorted ascending, all inside a single `db.transaction(...)` so a failure rolls back atomically; re-running on an up-to-date DB applies nothing (idempotent). `HOERMOND_DB_PATH` override honoured with the correct `/var/lib/mediaplayer/state.db` default (`db/index.ts:4`).
- **i18n compliance:** `translate` returns `dict[key] ?? key` — never empty/undefined (`I18nContext.tsx:8`); `de.json` imported statically; `resolveJsonModule: true` present in `tsconfig.web.json`; provider wraps `<App/>` in `main.tsx`; `App.tsx` consumes `t('boot.starting')` with no hard-coded JSX string.
- **CSS / 800×480 layout:** dimensions fixed on `html, body, #root` and `.boot-screen`; `overflow: hidden`; `margin:0; padding:0` zeroed; colors match spec (`#fbfafe` / `#2a2342`). No responsive/media-query drift.
- **Kiosk behaviour:** `frame: false` always; `kiosk`/`fullscreen` true in production; `app:ready` deferred to `did-finish-load`; production loads via `loadFile` (only takes `loadURL` when `is.dev && ELECTRON_RENDERER_URL`).
- **Template cleanup (core):** `Versions.tsx`, `window.electron`, `ipcMain.on('ping')` template handler all removed.
- **Bonus hardening:** `index.html` ships a restrictive CSP (`default-src 'self'; script-src 'self'`), which exceeds M1 requirements and is good practice for the kiosk renderer.

## Round 2 — Post-fix Audit (2026-06-13)

Re-audit after the dev pass that was meant to clear all 3 Round 1 warnings and all 4 info cleanups. Every fix was verified against the actual file contents, and `npm run typecheck && npm run build` was run from `app/`.

### Fix Verification

| Item | Status | Notes |
|------|--------|-------|
| Warning 1 — duplicate Window type | ✅ Fixed | `preload/index.d.ts` is now a single comment line pointing to the canonical declaration; no `Window` augmentation remains. `renderer/src/global.d.ts` is the sole source of truth (`import type { HoermondBridge } from '@shared/ipc-contract'` + `export {}`). Divergent-import risk eliminated. |
| Warning 2 — app:ready replay | ✅ Fixed | `REPLAYABLE_EVENTS = ['app:ready', 'app:dbError']` added to `ipc-contract.ts`. Preload installs a per-channel cache-writer at module load (`preload/index.ts:15-19`) and `on()` replays the cached payload to late subscribers before attaching the live listener (`:33-35`). No double-delivery (see analysis below). Late-subscriber miss is resolved. |
| Warning 3 — DB error surfaced | ✅ Fixed | `createWindow()` now returns `BrowserWindow` and takes an optional `dbError`. `whenReady` captures `err.message`, passes it in, and `app:dbError` is sent inside `did-finish-load` (`main/index.ts:30-35`) so it benefits from the same replay path. `App.tsx` subscribes via `useEffect`, stores it in state, and renders it with a dedicated `.error-text` style. "Make it visible" requirement now met. |
| Cleanup 1 — template assets removed | ✅ Fixed | `src/renderer/src/assets/` is now empty — `electron.svg`, `wavy-lines.svg`, `base.css`, `main.css` all gone. |
| Cleanup 2 — components/ removed | ✅ Fixed | `src/renderer/src/components/` no longer exists (`ls` → No such file or directory). |
| Cleanup 3 — package.json identity | ✅ Fixed | `name: "hoermond"`, `version: "0.1.0"`, `description` is the real Hörmond German tagline, `author: "Patrick Kraus-Füreder"`, `homepage` points to the real repo. No electron-vite scaffold defaults remain. |
| Cleanup 4 — index.html title | ✅ Fixed | `<title>Hörmond</title>`. CSP meta tag retained and is now broader-but-still-reasonable (`style-src 'self' 'unsafe-inline'`, `img-src 'self' data:`) to accommodate Vite-injected styles. |

### New Additions Correctness

- **IPC contract (additive-only):** `ipc-contract.ts` adds `'app:dbError': { message: string }` to `IpcEvents`, appends `'app:dbError'` to `ALLOWED_EVENTS`, and adds the new `REPLAYABLE_EVENTS` export. No existing entry was removed or renamed — `app:getVersion` and `app:ready` are untouched. Contract rule honoured.
- **App.tsx effect cleanup:** The `useEffect` body is `return window.hoermond.on('app:dbError', ...)`, returning the bridge's unsubscribe function directly as the effect cleanup. No memory leak; correct under StrictMode double-invoke.
- **de.json:** Both `boot.starting` and `error.db` keys present; valid JSON (parses, build consumes it via `resolveJsonModule`). `error.db` is the label only ("Datenbank-Fehler"); `App.tsx` appends `: {dbError}` for the detail, which is correct and keeps the raw message out of the dictionary.

### New Findings

- **[INFO] Replay cache is keyed per-channel and overwrites, which is correct for these one-shot events but not safe for future high-frequency events.** `eventCache` stores only the *last* payload per channel and the cache-writer listener is never removed. For `app:ready`/`app:dbError` (fire-once lifecycle events) this is exactly right. If a future channel that fires repeatedly is ever added to `REPLAYABLE_EVENTS`, a late subscriber would receive only the most recent value as a synthetic replay, and the permanent cache-writer would retain the last payload for the process lifetime. Not a bug today — flagging so the `REPLAYABLE_EVENTS` list stays restricted to genuine one-shot lifecycle events. Worth a one-line comment on the constant.
- **[INFO] No double-delivery despite two listeners per replayable channel — verified, not a defect.** The module-load cache-writer (`:16`) and the per-subscription `wrapped` listener (`:36`) are distinct `ipcRenderer.on` registrations with non-overlapping jobs (cache vs. dispatch). The user callback fires once per live event; the cached replay only fires for subscribers that attach after the event. Confirmed safe.
- No CRITICAL, WARNING, or other regressions introduced by the fixes.

### Regression Check (Round 1 passing items still hold)

All re-verified against current files: `contextIsolation: true` / `nodeIntegration: false` (`main/index.ts:18-19`); Preload whitelist enforced in both `invoke` and `on` against `ALLOWED_COMMANDS`/`ALLOWED_EVENTS`; `ipcRenderer` never exposed (only `hoermond` bridge); no `any` in `HoermondBridge` (still generic over channel types); `@shared` alias present in `electron.vite.config.ts` (main/preload/renderer) and in both tsconfigs' `paths`; WAL + `foreign_keys` pragmas set before migrations (`db/index.ts:8-9`); migration loop still version-gated, sorted, idempotent, and wrapped in a single transaction; 800×480 fixed dimensions and `overflow: hidden` on `html/body/#root` and `.boot-screen`; colors `#fbfafe`/`#2a2342` intact; all UI strings via `t()` (`boot.starting`, `error.db`) — no hard-coded JSX strings. `is.dev` kiosk/fullscreen gating unchanged (still the sensible Round 1 INFO-1 deviation).

### Build Result

`npm run typecheck && npm run build`: **PASS**

- `typecheck:node` and `typecheck:web`: zero errors.
- `electron-vite build`: main (`out/main/index.js`, 2.71 kB), preload (`out/preload/index.js`, 1.09 kB), and renderer (`out/renderer/...`) all built cleanly. No warnings beyond the standard renderer chunk size, which is irrelevant for a local kiosk bundle.

### Verdict

**M1 app-strand (T1.08–T1.14): READY**

Reason: All 3 Round 1 warnings are correctly and completely fixed (single Window type source, replayable late-subscriber event delivery, DB error surfaced to the UI), all 4 info cleanups are done, the IPC contract changes are strictly additive, no memory leak in the renderer effect, all Round 1 passing items still hold, and `typecheck` + `build` both pass. The only new findings are two INFO-level notes (one a forward-looking caution on `REPLAYABLE_EVENTS` scope, one a confirmation that the dual-listener design is intentionally safe) — neither blocks closure.
