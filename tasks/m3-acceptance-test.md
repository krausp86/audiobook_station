# M3 Acceptance Test Results

## Laptop (Typechecking & Dev) - ✅ COMPLETE

### Typecheck Results
- ✅ `npm run typecheck` passed
- ✅ No TypeScript errors in Node (main process)
- ✅ No TypeScript errors in Web (renderer)
- ✅ IPC contract updated with `library:restartFromBeginning`
- ✅ All ALLOWED_COMMANDS and ALLOWED_EVENTS valid

### Build Results
- ✅ `npm run build` successful
- ✅ WOFF2 fonts bundled in output:
  - `AtkinsonHyperlegible-Bold-O4tRgMdT.woff2` (299.41 kB)
  - `AtkinsonHyperlegible-Regular-v4FQLHcs.woff2` (299.45 kB)
- ✅ CSS styles built (9.23 kB)
- ✅ Renderer bundle includes all components

### Test Results
- ✅ `npm test` passed: 6/6 tests (M2 sort logic unchanged)
- ✅ No regressions in existing functionality

### Implemented Tasks (T3.01–T3.16)

| Task | Description | Status |
|------|-------------|--------|
| T3.01 | Atkinson Hyperlegible WOFF2 offline | ✅ Done |
| T3.02 | theme.css (colors/typography/timing) | ✅ Done |
| T3.03 | Logo SVG component | ✅ Done |
| T3.04 | Pressable component | ✅ Done |
| T3.05 | BackButton component | ✅ Done |
| T3.06 | library:restartFromBeginning IPC | ✅ Done |
| T3.07 | de.json strings (M3 keys) | ✅ Done |
| T3.08 | Cover placeholder component | ✅ Done |
| T3.09 | S0 Welcome screen | ✅ Done |
| T3.10 | S1 Start screen | ✅ Done |
| T3.11 | S4 Detail overlay | ✅ Done |
| T3.12 | MediaTile component | ✅ Done |
| T3.13b | useLongPress hook | ✅ Done |
| T3.13 | LibraryGrid screen | ✅ Done |
| T3.14 | EmptyState component | ✅ Done |
| T3.14b | NowPlayingBar placeholder | ✅ Done |
| T3.15 | Root navigation | ✅ Done |
| T3.16 | Cleanup + verdrahten | ✅ Done |

---

## Pi Acceptance Tests (T3.17–T3.20) - PENDING

These tests require deployment to the actual Raspberry Pi 4 with 800×480 touchscreen.

### T3.17 — Deploy + Touch Behavior
**Status:** Pending (Pi deployment required)

**Checklist:**
- [ ] Deploy M3 bundle to Pi (`/home/player/hoermond/repo/app`)
- [ ] `npm install && npx electron-rebuild -f -w better-sqlite3`
- [ ] `sudo systemctl restart mediaplayer.service`
- [ ] Tap on tile → Medium plays (capac itous touch works)
- [ ] Long-tap (600ms) → S4 overlay opens, hold ring visible from 300ms
- [ ] Short tap does NOT open S4
- [ ] Vertical scroll with finger → kinetic momentum + bounce
- [ ] Tap outside S4 scrim → overlay closes
- [ ] ✕ button → overlay closes
- [ ] Press-feedback (Scale 0,96) appears < 100ms
- [ ] No cursor visible
- [ ] S0 appears on first run, never again after reboot
- [ ] Touch behavior is distinct from Laptop/Mouse (test capac itive-specific)

### T3.18 — Scroll Performance (~100 Covers)
**Status:** Pending (Pi measurement required)

**Checklist:**
- [ ] Sync ~100 media items to Pi library
- [ ] Navigate to Grid (S2/S3)
- [ ] Rapid vertical scroll up/down → no visible stuttering
- [ ] Bounce at edges feels smooth
- [ ] Press-feedback remains prompt during/after scroll
- [ ] FPS observation (DevTools remote, if available)
- [ ] Result: Smooth / Tuned / Blocked → Virtualization needed

**Notes:**
- Platzhalter-Cover sind leicht; echte Cover (M7) können schwerer sein
- Performance-Baseline dokumentieren

### T3.19 — Pixel-Layout Check (800×480)
**Status:** Pending (Pi visual check required)

**Checklist:**

- [ ] **S0:** Logo + Greeting centered, `--flieder-tint` background, no cutoff
- [ ] **S1:** Logo top-centered; two 360×360 tiles, 24px gap, no overflow
- [ ] **Grid:** 44px titlebar, back-button 64×64 left, sync-slot right
  - [ ] 4 columns × 180px + ~13px gaps = 760px (symmetric margins)
  - [ ] Angeschnittene zweite Reihe sichtbar (Scroll-Signal)
  - [ ] Sektions-Header 32px
- [ ] **S4:** Card centered, all content visible, ✕ reachable
- [ ] **Empty-State:** Logo + text centered, titlebar+sync-slot visible
- [ ] **All edges:** 20px safe-area respected, nothing cut off
- [ ] Real panel Overscan: compare visual layout to 800×480 grid

**Issues Found:** (none recorded yet)

### T3.20 — Contrast & Lesbarkeit
**Status:** Pending (Pi observation + optional kid test)

**Checklist:**
- [ ] Sektions-Header (24px) lesbar aus Kind-Distanz
- [ ] Kachel-Titel (20px) lesbar
- [ ] S0-Begrüßung (32px) lesbar
- [ ] Body 18px minimum
- [ ] **Kontrast-Audit:** Heller Flieder (`--flieder`/`--flieder-tint`) → dunkler Text (`--text-on-flieder`)
- [ ] **Kontrast-Audit:** Tiefflieder (`--flieder-deep`) → weißer Text OK
- [ ] Badge-Erkennbarkeit (Pfeil vs. Häkchen) auch ohne Farbe (Form-Redundanz)
- [ ] Fortschrittsring (6px, bottom) erkennbar als Progress
- [ ] Optional: Echtes Kind testet (Auswahl Hörbücher/Musik, erkennt "angefangen"?)

**Issues Found:** (none recorded yet)

---

## Summary

**Laptop Completion:** 18/18 Tasks implemented, typecheck ✅, tests ✅, build ✅

**Files Changed/Created:**
- **New:** `theme.css`, `screens.css`, 9 screen components, 4 utility components, 1 hook
- **New:** `assets/fonts/` with WOFF2 files + OFL.txt
- **Modified:** `ipc-contract.ts`, `register.ts`, `de.json`, `App.tsx`, `main.tsx`
- **Deleted:** `Library.tsx`

**Pi Acceptance:** Awaiting real hardware testing (T3.17–T3.20)

---

## Next Steps

1. Deploy M3 bundle to Pi: `/home/player/hoermond/repo/app`
2. Run T3.17 manual tests (touch, long-press, scroll, UI responsiveness)
3. Run T3.18 performance benchmark (100+ covers, fps stability)
4. Run T3.19 pixel measurements (layout alignment, safe-area)
5. Run T3.20 contrast checks + optional kid feedback
6. Document results in this file, then close M3 milestone
