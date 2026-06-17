# M3 — Echte Kind-Navigation (Cover-Grid-UI): Task-Plan

## Überblick & Abhängigkeitsgraph

M3 ersetzt das **Wegwerf-UI** aus M2 (`app/src/renderer/src/Library.tsx`, einfache
Textliste) durch die echte, kindgerechte Touch-Navigation auf dem 800×480-Querformat-
Display:

- **S0 Willkommensscreen** (nur Erststart, 2,5 s, Fade-Out → S1)
- **S1 Startscreen** (zwei große Wahlkacheln „Hörbücher" / „Musik" + Logo)
- **S2/S3 Bibliothek-Grid** (Cover-Kacheln 180×180, 4 Spalten, kinetisches Scrollen,
  Sektionen „Zuletzt gehört" / „Alle", Weiterhören-Ring + Badge, Fertig-Häkchen)
- **S4 Detail-Overlay** (langer Tap 600 ms öffnet, Titel/Autor/Fortschritt + „Von vorne
  starten")
- **E1 Empty-State** (leere Bibliothek → freundliche Botschaft statt leerer Fläche)

M3 ist **fast reine Frontend-Arbeit auf dem Laptop**. Die Datengrundlage existiert
bereits aus M2: `library:list` liefert die zwei E17-Sektionen (`recentlyPlayed[]` /
`all[]`), `player:play`/`pause`/`stop` steuern MPD, `onboarding:getSeen`/`setSeen`
persistieren das Onboarding-Flag. M3 **stellt diese Daten nur dar** und ergänzt
backendseitig genau **einen** neuen Command (`library:restartFromBeginning` für „Von
vorne starten").

**Wichtige Lücke (siehe Risiken am Ende):** Der vollständige Player-Screen **S5 kommt
erst in M4**. In M3 löst ein Tap auf eine Kachel zwar `player:play` aus, aber es gibt
noch keinen Player-Screen zum Navigieren. Deshalb baut M3 einen bewusst minimalen,
in M4 ersetzbaren **„Now-Playing"-Platzhalterbalken** (T3.14) — analog zum Wegwerf-UI
T2.16 in M2.

Der Plan trennt fünf Arbeitsstränge:

- **Theme/Fundament (T3.01–T3.05):** Font offline bündeln, Theme-CSS (Farben/Typo/
  Timings als CSS-Variablen), Logo-SVG, Press-Feedback-Primitive, Zurück-Button,
  Long-Press-Hook. Reine, wiederverwendbare Bausteine. Laptop.
- **Backend-Ergänzung (T3.06):** `library:restartFromBeginning`-Command + IPC-Vertrag.
  Laptop, mit Vitest testbar.
- **Screens (T3.07–T3.14):** de.json, Cover-Platzhalter, S0, S1, Grid, Sektions-/
  Badge-Logik, S4-Overlay, Empty-State, Now-Playing-Platzhalter. Laptop.
- **Integration (T3.15–T3.16):** Root-Navigation/Routing-State, altes `Library.tsx`
  entfernen, alles zusammenstecken. Laptop.
- **Pi-Abnahme (T3.17–T3.20):** echtes Touch-Verhalten, Scroll-Performance mit ~100
  echten Covern, Pixel-Layout am echten 800×480-Display, Kontrast/Lesbarkeit aus
  Kind-Distanz. **Auf dem Pi.**

**Wichtig — Pi vs. Laptop:**
- **Auf dem Laptop (hardwareunabhängig):** T3.01–T3.16. Voll im Browser/Dev-Fenster
  entwickel- und testbar; das Layout ist fest auf 800×480 ausgelegt (kein Responsive),
  daher reicht ein auf 800×480 fixiertes Dev-Fenster.
- **Auf dem Pi (echte Abnahme):** T3.17–T3.20. **Projektregel: Die finale Abnahme
  jedes Meilensteins erfolgt am echten Gerät** — echtes kapazitives Touch-Verhalten,
  reale Scroll-Performance, Pixel-genaues Layout und Lesbarkeit am realen 7"-Display
  lassen sich nur dort verbindlich prüfen.

**Architektur-Grundvertrag (aus M1/M2, hier zwingend einzuhalten):**
- Electron-Main kapselt ALLE privilegierten Operationen; der Renderer ist rein und
  hält keinen Gerätezustand.
- Kommunikation NUR über die IPC-Bridge (`window.hoermond.invoke` / `.on`); neue
  Channels **additiv** zur Whitelist (`ALLOWED_COMMANDS`/`ALLOWED_EVENTS`).
- MPD ist autoritativ für Player-Zustand, SQLite für Fortschritt/Settings/Onboarding.
- **KEIN Polling** für Player-Status — `player:state` ist Push (idle-Loop aus M2).
- Alle UI-Strings in `de.json`, key-basiert über `useT()`. **Keine hartcodierten
  Strings im JSX.**
- IPC-Namenskonvention: **Doppelpunkt-Namespacing** (`library:restartFromBeginning`,
  **nicht** `library.restartFromBeginning`).

```
THEME / FUNDAMENT (Laptop) — wiederverwendbare Bausteine, zuerst
  T3.01 Atkinson-Hyperlegible-WOFF2 offline bündeln (+ @font-face)
     │
     └── T3.02 theme.css: Farb-/Typo-/Timing-CSS-Variablen, cursor:none, kein :hover
            │
            ├── T3.03 Logo-SVG-Komponente (Halbmond + Note, M5-Hook vorbereitet)
            │
            ├── T3.04 Press-Feedback-Primitive (Scale 0,96 / 90/120 ms) + <Pressable>
            │      │
            │      └── T3.05 Zurück-Button-Komponente (64×64, oben links)
            │
            └── T3.13b Long-Press-Hook (600 ms Schwelle, Ring-Feedback ab 300 ms)
                   (Hook wird in T3.13 = Grid-Kachel benutzt)

BACKEND-ERGÄNZUNG (Laptop)
  T3.06 library:restartFromBeginning-Command (IPC-Vertrag + Main-Handler)

SCREENS (Laptop)
  T3.07 de.json um alle M3-Strings erweitern
     │
     ├── T3.08 Cover-Platzhalter-Komponente (deterministische Farbe + Initial)
     │      │
     │      └── T3.12 Cover-Kachel (Ring 6px + Pfeil-Badge / Häkchen-Badge)
     │             │
     │             └── T3.13 Grid-Container (4 Spalten, kinetisches Scrollen)
     │                    + Sektions-Header  (nutzt T3.13b Long-Press-Hook)
     │
     ├── T3.09 S0 Willkommensscreen (2,5 s, Fade, onboarding:setSeen)
     ├── T3.10 S1 Startscreen (zwei 360×360-Kacheln + Logo)
     ├── T3.11 S4 Detail-Overlay (Scrim, „Von vorne starten")
     ├── T3.14 E1 Empty-State (Logo + Botschaft)
     └── T3.14b Now-Playing-Platzhalterbalken (Wegwerf, M4 ersetzt)

INTEGRATION (Laptop)
  (alle Screens) ── T3.15 Root-Navigation/Routing-State (S0→S1→S2/S3, S4-Overlay)
                       │
                       └── T3.16 Altes Library.tsx entfernen + verdrahten + typecheck

PI-ABNAHME (auf dem Pi) — Meilenstein-Abnahme am echten Gerät
  T3.16 ── T3.17 Deploy auf Pi + echtes Touch-Verhalten (Tap/Long-Tap/Scroll)
              ├── T3.18 Scroll-Performance mit ~100 echten Covern messen
              ├── T3.19 Pixel-Layout-Check am echten 800×480-Display
              └── T3.20 Kontrast-/Lesbarkeits-Check aus Kind-Betrachtungsdistanz
```

## Task-Liste (Übersicht)

| ID | Titel | Größe | Ort |
|----|-------|-------|-----|
| T3.01 | Atkinson-Hyperlegible-WOFF2 offline bündeln (`@font-face`) | S | Laptop |
| T3.02 | `theme.css`: Farb-/Typo-/Timing-Variablen, `cursor:none`, kein `:hover` | M | Laptop |
| T3.03 | Logo-SVG-Komponente (Halbmond + Note, M5-Pointer-Hooks) | S | Laptop |
| T3.04 | Press-Feedback-Primitive `<Pressable>` (Scale 0,96 / 90·120 ms) | M | Laptop |
| T3.05 | Zurück-Button-Komponente (64×64, oben links) | S | Laptop |
| T3.06 | `library:restartFromBeginning`-Command (IPC + Main-Handler) | S | Laptop |
| T3.07 | `de.json` um alle M3-Strings erweitern | S | Laptop |
| T3.08 | Cover-Platzhalter-Komponente (deterministische Farbe + Initial) | M | Laptop |
| T3.09 | S0 Willkommensscreen (2,5 s, Fade 240 ms, `onboarding:setSeen`) | S | Laptop |
| T3.10 | S1 Startscreen (zwei 360×360-Wahlkacheln + Logo) | M | Laptop |
| T3.11 | S4 Detail-Overlay (Scrim, Fortschritt, „Von vorne starten") | M | Laptop |
| T3.12 | Cover-Kachel (180×180 + Label, Weiterhören-Ring + Badge, Häkchen) | M | Laptop |
| T3.13 | Grid-Container (4 Spalten, kinetisches Scrollen) + Sektions-Header | L | Laptop |
| T3.13b | Long-Press-Hook (600 ms Schwelle, Halte-Ring ab 300 ms) | M | Laptop |
| T3.14 | E1 Empty-State (Logo + freundliche Botschaft) | S | Laptop |
| T3.14b | Now-Playing-Platzhalterbalken (Wegwerf, M4 ersetzt) | S | Laptop |
| T3.15 | Root-Navigation/Routing-State (S0→S1→S2/S3 + S4-Overlay) | L | Laptop |
| T3.16 | Altes `Library.tsx` entfernen + alles verdrahten + typecheck | M | Laptop |
| T3.17 | Deploy auf Pi + echtes Touch-Verhalten (Tap/Long-Tap/Scroll) | M | Pi |
| T3.18 | Scroll-Performance mit ~100 echten Covern messen | M | Pi |
| T3.19 | Pixel-Layout-Check am echten 800×480-Display | M | Pi |
| T3.20 | Kontrast-/Lesbarkeits-Check aus Kind-Betrachtungsdistanz | S | Pi |

---

## Designkonstanten (gilt für ALLE Tasks — hier einmal zentral, in den Tasks zitiert)

Diese Werte stammen aus dem Design-Brief und sind in den Einzeltasks jeweils wörtlich
wiederholt, damit jede Task isoliert umsetzbar ist. Diese Sektion dient als
Referenz/Single Source of Truth.

**Canvas:** Feste Auflösung **800×480 px Querformat, KEIN responsives Layout**.
Safe-Area-Außenrand **20 px** rundum → nutzbare Fläche **760×440 px**. Basis-Spacing
**8 px** (Schritte 8/16/24/32). Titelleiste (alle Kind-Screens außer S0): **44 px**
hoch, links Zurück-Affordanz **64×64 px**, rechts Sync-Status-Icon-Platz freihalten
(Icon selbst erst M7).

**Tap-Targets (harte Untergrenzen):** Steuerelemente ≥ 60×60 px, Kacheln ≥ 160 px
(hier 180 px), Zurück/Navigation ≥ 64 px, Abstand zwischen Targets ≥ 12 px (Ziel 16 px).

**Farbpalette (CSS-Variablennamen exakt so vorgeben):**
- `--flieder: #9B7EDC` (Primär; dekorative Flächen, aktive Ringe, Akzentlinien,
  ausgewählte Zustände — **NIEMALS mit weißem Text**, nur 3,3:1 Kontrast)
- `--flieder-deep: #6E54B8` (Primär-Buttons mit weißem Text, Fortschrittsbalken,
  Logo-Ring)
- `--flieder-tint: #F2EDFB` (Sektions-Hintergründe, S0-Hintergrund)
- `--bg-app: #FBFAFE` (globaler App-Hintergrund)
- `--surface: #FFFFFF` (Karten, Kacheln, Dialoge)
- `--text-primary: #2A2342` (tiefes Aubergine; Überschriften & Fließtext, 14,8:1 auf surface)
- `--text-secondary: #6B6480` (sekundär-Labels, Zeitangaben, 5,6:1 auf weiß)
- `--text-on-flieder: #2A2342`
- `--text-on-deep: #FFFFFF`
- `--success: #2E7D52` (Fertig-Häkchen)
- `--info: #2563B0`
- `--warning: #A85F0C`
- `--parent-accent: #374151` (erst M5)
- `--parent-bg: #F3F4F6` (erst M5)
- `--scrim: rgba(42,35,66,0.55)` (Abdunklung hinter Overlays, für S4)

**Typografie:** Font `"Atkinson Hyperlegible"`, Fallback-Stack
`'Atkinson Hyperlegible', 'Nunito', system-ui, sans-serif`, **WOFF2 offline gebündelt
(kein CDN)**. Größen (Größe/Zeilenhöhe, Gewicht):
- Heading XL: **32px/38px Bold 700** — S0-Begrüßung, große Empty-States (Buchstaben-
  abstand leicht −0.01em)
- Heading: **24px/30px Bold 700** — Screen-Titel, Sektions-Header
- Label: **20px/26px Semibold 600** — Startscreen-Kachel-Wörter, Kachel-Titel
- Body: **18px/26px Regular 400** — Fließtext, Detail-Ansicht (**Untergrenze 18px**)
- Tiny: **15px/20px Medium 500** — Zeitangaben, sekundäre Metadaten
- Ausrichtung: linksbündig; **zentriert nur bei S0 und Empty-States**.

**Timings (exakt, zwingend):**
- Press-Feedback (Tap-Highlight): **90 ms ease-out hinein, 120 ms ease-in zurück,
  Scale 0,96 + Helligkeit** (unter 100-ms-Wahrnehmungsschwelle).
- Langer Tap auf Kachel: Schwelle **> 600 ms** öffnet S4; Halte-Feedback (Ring/Scale)
  wächst sichtbar von **300 ms → 600 ms** (300 ms Dauer) und kündigt die Schwelle an.
- Overlay/Dialog **ein** (S4): **220 ms Fade + Scale 0,96→1,0**; Scrim **200 ms**.
  **Aus:** **160 ms Fade**.
- Globale Standard-Transition: **200 ms, cubic-bezier(0.4, 0.0, 0.2, 1)**, als CSS-
  Variable `--t-base`.
- Kinetisches Scrollen mit Momentum + sichtbarem **Bounce** am Rand (S2/S3).
- **Kein Cursor, keine Hover-Zustände** (Kiosk ist cursor-frei) — CSS sichert das
  explizit ab (`cursor: none` global; keine `:hover`-Styles als alleinige
  Zustandsänderung).
- Kein Doppeltap, kein Rechtsklick-Äquivalent, keine Multitouch-Gesten.

---

## Tasks (Detail)

### T3.01 — Atkinson-Hyperlegible-WOFF2 offline bündeln (`@font-face`)
**Größe:** S
**Abhängigkeiten:** keine
**Vorbedingung:** electron-vite-Projekt aus M1/M2 baut (`app/`); Asset-Verzeichnis
`app/src/renderer/src/assets/` existiert.

**Ziel:** Die Schriftart **Atkinson Hyperlegible** liegt als lokale **WOFF2**-Dateien
im Repo und ist per `@font-face` eingebunden, sodass das Gerät die Schrift **komplett
offline** rendert (kein CDN, keine Netzabhängigkeit). Benötigt werden die Gewichte
**400 (Regular)**, **600 (Semibold)** und **700 (Bold)** — diese decken alle
Typo-Stufen aus dem Design-Brief ab (Body 400, Label 600, Heading/Heading-XL 700).

> **Lizenz/Beschaffung:** Atkinson Hyperlegible steht unter **SIL Open Font License
> (OFL)** und darf gebündelt/redistributiert werden. Bezugsquellen: **Google Fonts**
> (fonts.google.com/specimen/Atkinson+Hyperlegible) oder direkt vom **Braille
> Institute** (brailleinstitute.org/freefont). Lege die OFL-Lizenzdatei mit ins Repo.
> Hinweis: Manche Distributionen liefern primär **400** und **700** als eigene Files;
> existiert kein separates **600**-File, ist `font-weight: 600` im `@font-face` auf die
> 700-Datei zu mappen **oder** über `font-synthesis` zu erzeugen — bevorzugt aber ein
> echtes 600-File verwenden, falls verfügbar (bessere Lesbarkeit). Dokumentiere im
> Commit, welche Gewichte echt vs. synthetisiert sind.

**Beschreibung:**
1. Font-Verzeichnis anlegen: `app/src/renderer/src/assets/fonts/`.
2. WOFF2-Dateien dort ablegen, z. B.:
   - `AtkinsonHyperlegible-Regular.woff2` (400)
   - `AtkinsonHyperlegible-SemiBold.woff2` (600, falls vorhanden)
   - `AtkinsonHyperlegible-Bold.woff2` (700)
   - `OFL.txt` (Lizenztext)
   > Falls nur eine größere Variable-WOFF2 verfügbar ist, ist auch das in Ordnung —
   > dann ein `@font-face` mit `font-weight: 400 700;` (Bereich).
3. Eine CSS-Datei `app/src/renderer/src/assets/fonts/fonts.css` mit den `@font-face`-
   Regeln anlegen. WICHTIG: relative `url(...)`-Pfade, damit electron-vite die Dateien
   als Asset bundelt und sie im Produktions-Build mit ausgeliefert werden:
   ```css
   @font-face {
     font-family: 'Atkinson Hyperlegible';
     font-style: normal;
     font-weight: 400;
     font-display: swap;
     src: url('./AtkinsonHyperlegible-Regular.woff2') format('woff2');
   }
   @font-face {
     font-family: 'Atkinson Hyperlegible';
     font-style: normal;
     font-weight: 600;
     font-display: swap;
     src: url('./AtkinsonHyperlegible-SemiBold.woff2') format('woff2');
   }
   @font-face {
     font-family: 'Atkinson Hyperlegible';
     font-style: normal;
     font-weight: 700;
     font-display: swap;
     src: url('./AtkinsonHyperlegible-Bold.woff2') format('woff2');
   }
   ```
4. Diese `fonts.css` wird in T3.02 (`theme.css`) per `@import` ganz oben eingebunden
   (bzw. in `App.css` importiert, falls T3.02-Reihenfolge das verlangt). In T3.01 nur
   bereitstellen.

**Caveats:**
- **Kein `https://fonts.googleapis.com`-`@import`** — das Gerät kann offline laufen,
  ein Remote-Import würde im Kiosk zu Fallback-Schrift führen. WOFF2 MUSS lokal liegen.
- `font-display: swap` ist hier unkritisch (lokale Datei lädt sofort), aber sauber.
- Den OFL-Lizenztext nicht vergessen — Redistribution-Pflicht.

**Dateien/Artefakte:**
- Erstellt: `app/src/renderer/src/assets/fonts/*.woff2`, `.../fonts/OFL.txt`,
  `.../fonts/fonts.css`

**Akzeptanzkriterien:**
- [ ] Mindestens die Gewichte 400 und 700 liegen als lokale `.woff2` im Repo (600
  echt oder dokumentiert synthetisiert).
- [ ] `fonts.css` bindet sie per **relativem** `url(...)` ein (kein Remote-URL).
- [ ] OFL-Lizenzdatei liegt im Font-Verzeichnis.
- [ ] Nach `npm run build` liegen die WOFF2-Dateien im `out/`-Bundle (grep/find).
- [ ] Im Dev-Fenster wird Text sichtbar in Atkinson Hyperlegible gerendert (Glyphen-
  form erkennbar anders als system-ui), **mit gekapptem Netzwerk** (DevTools →
  Network → Offline).

---

### T3.02 — `theme.css`: Farb-/Typo-/Timing-Variablen, `cursor:none`, kein `:hover`
**Größe:** M
**Abhängigkeiten:** T3.01
**Vorbedingung:** Font-Dateien + `fonts.css` vorhanden (T3.01). `App.css` ist aktuell
die einzige CSS-Datei.

**Ziel:** Ein zentrales `theme.css` definiert **alle** Design-Tokens als CSS-Variablen
(Farben, Typo-Stufen, globale Transition), setzt das feste 800×480-Canvas, bindet die
Schrift global ein, deaktiviert Cursor und Hover-Zustände kiosk-sicher und stellt
Utility-Klassen für die Typo-Stufen bereit. Alle weiteren M3-Komponenten konsumieren
**nur** diese Variablen — keine hartcodierten Farb-/Größenwerte in Komponenten-CSS.

**Beschreibung:**
1. Neue Datei `app/src/renderer/src/theme.css` anlegen. Ganz oben die Schrift
   importieren:
   ```css
   @import './assets/fonts/fonts.css';
   ```
2. `:root`-Variablenblock mit **exakt** diesen Werten (aus dem Design-Brief):
   ```css
   :root {
     /* Farben */
     --flieder: #9B7EDC;
     --flieder-deep: #6E54B8;
     --flieder-tint: #F2EDFB;
     --bg-app: #FBFAFE;
     --surface: #FFFFFF;
     --text-primary: #2A2342;
     --text-secondary: #6B6480;
     --text-on-flieder: #2A2342;
     --text-on-deep: #FFFFFF;
     --success: #2E7D52;
     --info: #2563B0;
     --warning: #A85F0C;
     --parent-accent: #374151;  /* erst M5 */
     --parent-bg: #F3F4F6;      /* erst M5 */
     --scrim: rgba(42, 35, 66, 0.55);

     /* Typografie */
     --font-family: 'Atkinson Hyperlegible', 'Nunito', system-ui, sans-serif;

     /* Spacing-Basis 8px */
     --space-1: 8px;
     --space-2: 16px;
     --space-3: 24px;
     --space-4: 32px;
     --safe-area: 20px;
     --titlebar-h: 44px;

     /* Timing */
     --t-base: 200ms cubic-bezier(0.4, 0, 0.2, 1);
     --t-base-dur: 200ms;
     --t-press-in: 90ms;
     --t-press-out: 120ms;
   }
   ```
3. Globale Grundregeln — **festes Canvas, Cursor aus, Hover aus, Schrift global**:
   ```css
   * { box-sizing: border-box; }

   html, body, #root {
     margin: 0;
     padding: 0;
     width: 800px;
     height: 480px;
     overflow: hidden;            /* kein Page-Scroll; gescrollt wird nur das Grid */
     background: var(--bg-app);
     color: var(--text-primary);
     font-family: var(--font-family);
     /* Kiosk: kein Cursor, keine Textauswahl, kein Touch-Highlight */
     cursor: none;
     -webkit-user-select: none;
     user-select: none;
     -webkit-tap-highlight-color: transparent;
     -webkit-touch-callout: none;
   }
   ```
4. Typo-Utility-Klassen (verwenden die Brief-Stufen exakt):
   ```css
   .t-heading-xl { font-size: 32px; line-height: 38px; font-weight: 700; letter-spacing: -0.01em; }
   .t-heading    { font-size: 24px; line-height: 30px; font-weight: 700; }
   .t-label      { font-size: 20px; line-height: 26px; font-weight: 600; }
   .t-body       { font-size: 18px; line-height: 26px; font-weight: 400; }
   .t-tiny       { font-size: 15px; line-height: 20px; font-weight: 500; }
   ```
5. **Hover-Schutz:** Es dürfen keine `:hover`-Regeln als alleinige Zustandsänderung
   existieren. Falls eine Bibliothek/Reset-CSS Hover einführt, mit einer Media-Query
   neutralisieren:
   ```css
   @media (hover: none) {
     /* Touch-Gerät: nichts Zusätzliches nötig */
   }
   ```
   In M3-eigenem CSS werden Zustände ausschließlich über aktive Klassen/`:active`-
   Press-Feedback (T3.04) abgebildet, **nie** über `:hover`.
6. `theme.css` global laden: in `app/src/renderer/src/main.tsx` (oder dort, wo
   `App.css` importiert wird) `import './theme.css';` **vor** `App.css` ergänzen, damit
   die Variablen überall verfügbar sind. `App.css` wird in T3.16 bereinigt
   (Wegwerf-Stile aus T2.16 entfernen).

**Caveats:**
- **`--flieder` (#9B7EDC) NIE mit weißem Text** kombinieren (nur 3,3:1). Für Text auf
  Flieder `--text-on-flieder` (#2A2342) nutzen; weißer Text nur auf `--flieder-deep`
  (#6E54B8). Das ist ein Kontrast-/Barrierefreiheits-Hard-Constraint.
- Das Canvas ist **fest 800×480** — keine `vw`/`vh`/`%`-basierte Responsiveness
  einführen. Pixelwerte sind hier korrekt und gewollt.
- `cursor: none` muss global greifen, auch über interaktiven Elementen (Buttons setzen
  oft eigenen Cursor) — ggf. `*, *:hover { cursor: none; }` absichern.

**Dateien/Artefakte:**
- Erstellt: `app/src/renderer/src/theme.css`
- Verändert: `app/src/renderer/src/main.tsx` (Import)

**Akzeptanzkriterien:**
- [ ] `theme.css` definiert **alle** im Designkonstanten-Block gelisteten Farb-
  Variablen mit exakt den Hex-Werten.
- [ ] `--t-base` ist `200ms cubic-bezier(0.4, 0, 0.2, 1)`.
- [ ] `cursor: none` greift global; im Dev-Fenster ist kein Mauszeiger sichtbar.
- [ ] Es existiert keine `:hover`-Regel, die einen Zustand allein über Hover ändert
  (grep nach `:hover` in M3-CSS → nur leer/neutralisiert).
- [ ] Body/`#root` sind exakt 800×480, `overflow: hidden`.
- [ ] Die fünf Typo-Utility-Klassen existieren mit den exakten Größen/Gewichten.

---

### T3.03 — Logo-SVG-Komponente (Halbmond + Note, M5-Pointer-Hooks)
**Größe:** S
**Abhängigkeiten:** T3.02 (Farbvariablen)
**Vorbedingung:** Theme-Variablen verfügbar.

**Ziel:** Eine wiederverwendbare React-Komponente `<Logo>`, die das Hörmond-Logo als
**Inline-SVG** rendert (skalierbar, scharf auf jedem Display) und so strukturiert ist,
dass **M5** später die Eltern-Gate-Lang-Tap-Geste (Fortschritts-Ring ab 400 ms)
andocken kann — **ohne** dass M3 bereits PIN-Dialog/Ring-Logik implementiert.

**Logo-Konzept (Design-Brief §5.7):** Freundlicher, **abgerundeter Halbmond** mit
kleiner **Musiknote / Notenkopf** in der Sichel. Stil: **vollflächig** (keine dünnen
Linien), weiche Rundungen. Farben: **Mondsichel `--flieder-deep` (#6E54B8)**, **Note
`--flieder` (#9B7EDC)**. Optionale einfarbige Variante komplett `#6E54B8`.

**Beschreibung:**
1. Komponente `app/src/renderer/src/components/Logo.tsx` anlegen:
   ```tsx
   import { type PointerEventHandler } from 'react';

   interface LogoProps {
     /** Kantenlänge in px. S1: ~40 (Symbol), S0/Empty: ~160. */
     size?: number;
     /** Einfarbige Variante (alles --flieder-deep) statt zweifarbig. */
     mono?: boolean;
     /** M5-Hooks: Eltern-Gate-Geste dockt hier an (in M3 ungenutzt). */
     onPointerDown?: PointerEventHandler<SVGSVGElement>;
     onPointerUp?: PointerEventHandler<SVGSVGElement>;
     onPointerLeave?: PointerEventHandler<SVGSVGElement>;
     className?: string;
   }

   export default function Logo({
     size = 40,
     mono = false,
     onPointerDown,
     onPointerUp,
     onPointerLeave,
     className,
   }: LogoProps): React.JSX.Element {
     const crescent = 'var(--flieder-deep)';
     const note = mono ? 'var(--flieder-deep)' : 'var(--flieder)';
     return (
       <svg
         width={size}
         height={size}
         viewBox="0 0 100 100"
         role="img"
         aria-label="Hörmond"
         className={className}
         onPointerDown={onPointerDown}
         onPointerUp={onPointerUp}
         onPointerLeave={onPointerLeave}
       >
         {/* Halbmond: Vollkreis minus versetzter Kreis (Sichel), weiche Rundung */}
         <path
           d="M50 6
              a44 44 0 1 0 0 88
              a34 34 0 1 1 0 -88 Z"
           fill={crescent}
         />
         {/* Notenkopf (vollflächig) in der Sichel + kurzer Notenhals */}
         <circle cx="54" cy="64" r="11" fill={note} />
         <rect x="63" y="30" width="6" height="36" rx="3" fill={note} />
       </svg>
     );
   }
   ```
   > Die exakte Pfad-Geometrie darf gestalterisch verfeinert werden, solange Form
   > (Halbmond + Note in der Sichel), Vollflächigkeit und Farben (`--flieder-deep`
   > Sichel, `--flieder` Note) erhalten bleiben und das SVG quadratisch via `viewBox`
   > skaliert.
2. **M5-Vorbereitung dokumentieren:** Die `onPointerDown/Up/Leave`-Props sind in M3
   bewusst durchgereicht, aber von keinem Aufrufer belegt. Ein Kommentar im Code (und
   in der Task) hält fest: *„M5 hängt hier die Lang-Tap-Eltern-Gate-Geste an
   (Fortschritts-Ring ab 400 ms → PIN-Dialog). M3 löst KEINE Aktion aus."* Damit kann
   M5 den Ring als zusätzliches SVG-Element und die Timer-Logik im Aufrufer ergänzen,
   ohne die Komponentensignatur zu ändern.

**Caveats:**
- Inline-SVG (kein `<img src=…>`), damit `currentColor`/CSS-Variablen greifen und das
  Logo scharf skaliert.
- **Keine** Ring-/Timer-Logik in M3 einbauen — das ist M5-Scope. Nur die Hook-Props
  vorsehen.
- `aria-label` gesetzt; das Logo ist dekorativ-funktional, aber ein Label schadet nicht.

**Dateien/Artefakte:**
- Erstellt: `app/src/renderer/src/components/Logo.tsx`

**Akzeptanzkriterien:**
- [ ] `<Logo size={160} />` rendert ein quadratisches, scharfes SVG (Halbmond + Note).
- [ ] Sichel ist `--flieder-deep` (#6E54B8), Note `--flieder` (#9B7EDC); `mono`
  rendert beides in `#6E54B8`.
- [ ] Die drei Pointer-Hook-Props existieren und werden auf das `<svg>` durchgereicht,
  lösen in M3 aber **keine** Aktion aus (kein PIN-Dialog).
- [ ] Skaliert ohne Pixelartefakte zwischen size=40 und size=160.

---

### T3.04 — Press-Feedback-Primitive `<Pressable>` (Scale 0,96 / 90·120 ms)
**Größe:** M
**Abhängigkeiten:** T3.02
**Vorbedingung:** Theme-Timing-Variablen verfügbar.

**Ziel:** Ein wiederverwendbares Press-Feedback-Primitive (Komponente `<Pressable>`
**plus** CSS-Klasse `.pressable`), das auf **allen** Kacheln/Buttons ein sofortiges,
einheitliches Tap-Feedback liefert: beim Drücken **Scale 0,96 + leichte Helligkeits-
änderung in 90 ms (ease-out)**, beim Loslassen Rückkehr in **120 ms (ease-in)** —
spürbar **unter der 100-ms-Wahrnehmungsschwelle**. Kein Cursor, kein Hover.

**Beschreibung:**
1. CSS in `theme.css` (oder neue `app/src/renderer/src/components/pressable.css`)
   ergänzen — exakte Timings aus dem Brief:
   ```css
   .pressable {
     transition:
       transform var(--t-press-out) ease-in,
       filter var(--t-press-out) ease-in;
     transform: scale(1);
     filter: brightness(1);
     touch-action: manipulation;   /* kein Doppeltap-Zoom */
     cursor: none;
   }
   .pressable.is-pressed {
     transition:
       transform var(--t-press-in) ease-out,
       filter var(--t-press-in) ease-out;
     transform: scale(0.96);
     filter: brightness(0.94);
   }
   ```
2. Komponente `app/src/renderer/src/components/Pressable.tsx`, die den `is-pressed`-
   Zustand über **Pointer-Events** (touch-tauglich) steuert:
   ```tsx
   import { useState, type ReactNode, type PointerEvent } from 'react';

   interface PressableProps {
     onTap?: () => void;
     /** zusätzliche Klassen (z. B. Layout der Kachel/des Buttons). */
     className?: string;
     children: ReactNode;
     /** optionale Pointer-Hooks (z. B. für Long-Press-Hook T3.13b). */
     onPointerDown?: (e: PointerEvent) => void;
     onPointerUp?: (e: PointerEvent) => void;
     onPointerLeave?: (e: PointerEvent) => void;
     disabled?: boolean;
   }

   export default function Pressable({
     onTap, className, children,
     onPointerDown, onPointerUp, onPointerLeave, disabled,
   }: PressableProps): React.JSX.Element {
     const [pressed, setPressed] = useState(false);
     return (
       <div
         className={`pressable${pressed ? ' is-pressed' : ''}${className ? ' ' + className : ''}`}
         role="button"
         aria-disabled={disabled}
         onPointerDown={(e) => { if (!disabled) { setPressed(true); onPointerDown?.(e); } }}
         onPointerUp={(e) => {
           if (disabled) return;
           setPressed(false);
           onPointerUp?.(e);
           onTap?.();
         }}
         onPointerLeave={(e) => { setPressed(false); onPointerLeave?.(e); }}
         onPointerCancel={() => setPressed(false)}
       >
         {children}
       </div>
     );
   }
   ```
3. **Verhältnis zum Long-Press (T3.13b):** `<Pressable>` liefert das visuelle Press-
   Feedback und ein einfaches `onTap`. Der Long-Press-Hook (T3.13b) hängt sich über
   die durchgereichten `onPointerDown/Up/Leave`-Props ein und entscheidet, ob ein
   kurzer Tap (`onTap`) oder langer Tap (S4) gemeint war. In T3.04 nur das Primitive
   bauen; die Verzahnung passiert in T3.12/T3.13.

**Caveats:**
- **Pointer-Events statt Mouse-Events** — auf dem kapazitiven Touch sind `mousedown`/
  `mouseup` unzuverlässig; `pointerdown`/`pointerup` decken Touch + Maus (Dev) ab.
- `onPointerCancel`/`onPointerLeave` MÜSSEN den `pressed`-Zustand zurücksetzen, sonst
  „klebt" eine Kachel im gedrückten Zustand, wenn der Finger wegrutscht.
- `touch-action: manipulation` unterbindet Doppeltap-Zoom (Brief: kein Doppeltap).
- Press-Feedback ist rein visuell; es darf **nicht** als alleiniger Zustand über
  `:hover` realisiert werden (Kiosk hat kein Hover).

**Dateien/Artefakte:**
- Erstellt: `app/src/renderer/src/components/Pressable.tsx`,
  (CSS in `theme.css` **oder** `app/src/renderer/src/components/pressable.css`)

**Akzeptanzkriterien:**
- [ ] Beim Drücken skaliert das Element sichtbar auf 0,96 und wird leicht dunkler,
  Übergang ~90 ms; Rückkehr ~120 ms.
- [ ] Feedback erscheint gefühlt sofort (< 100 ms) beim Antippen.
- [ ] Wegrutschen des Fingers (`pointerleave`/`cancel`) setzt das Feedback zurück
  (Element bleibt nicht gedrückt).
- [ ] `onTap` feuert beim Loslassen über dem Element.
- [ ] Kein Cursor/Hover-Effekt sichtbar.

---

### T3.05 — Zurück-Button-Komponente (64×64, oben links)
**Größe:** S
**Abhängigkeiten:** T3.02, T3.04
**Vorbedingung:** Theme + `<Pressable>` vorhanden.

**Ziel:** Eine konstante **Zurück-Affordanz** als wiederverwendbare Komponente
`<BackButton>`: **64×64 px**, konstant **oben links** in der Titelleiste, mit Press-
Feedback (über `<Pressable>`). Sie wird auf S2/S3 (und später Player/S4 nach Bedarf)
verwendet und ruft einen übergebenen `onBack`-Callback auf.

**Layout-Kontext (Design-Brief §5.0):** Titelleiste 44 px hoch; Zurück-Affordanz
64×64 px links. Da 64 > 44, ragt der Touch-Target leicht über die Titelleiste hinaus
bzw. überlappt den Safe-Area-Rand — das ist gewollt (Tap-Target-Untergrenze 64 px ist
hart). Das **sichtbare Icon** darf kleiner sein (z. B. 28–32 px Pfeil), der **Touch-
Bereich** muss aber 64×64 px betragen.

**Beschreibung:**
1. Komponente `app/src/renderer/src/components/BackButton.tsx`:
   ```tsx
   import Pressable from './Pressable';

   interface BackButtonProps {
     onBack: () => void;
     ariaLabel: string; // aus de.json via useT(), z. B. t('nav.back')
   }

   export default function BackButton({ onBack, ariaLabel }: BackButtonProps): React.JSX.Element {
     return (
       <Pressable className="back-button" onTap={onBack}>
         <span className="visually-hidden">{ariaLabel}</span>
         <svg width="32" height="32" viewBox="0 0 32 32" aria-hidden="true">
           {/* nach links zeigender, vollflächiger Pfeil (weiche Spitze) */}
           <path
             d="M20 5 L9 16 L20 27 L23 24 L15 16 L23 8 Z"
             fill="var(--flieder-deep)"
           />
         </svg>
       </Pressable>
     );
   }
   ```
2. CSS (in `theme.css` oder Komponenten-CSS), Touch-Bereich 64×64 px, Icon zentriert:
   ```css
   .back-button {
     width: 64px;
     height: 64px;
     display: flex;
     align-items: center;
     justify-content: center;
     border-radius: 16px;
   }
   .visually-hidden {
     position: absolute;
     width: 1px; height: 1px;
     overflow: hidden; clip: rect(0 0 0 0);
     white-space: nowrap;
   }
   ```
3. Den Label-String **nicht** hartcodieren — der Aufrufer übergibt `t('nav.back')`
   (Key in T3.07 ergänzt).

**Caveats:**
- **64×64 px Touch-Bereich ist hart** (Brief: „Zurück/Navigation ≥ 64 px"), auch wenn
  das Icon kleiner aussieht.
- Position „konstant oben links" wird vom **Screen-Layout** (S2/S3, T3.13) gesetzt,
  nicht von der Komponente selbst — die Komponente ist position-agnostisch und wird
  vom Screen in die Titelleiste platziert.
- Kein Hover; Press-Feedback kommt von `<Pressable>`.

**Dateien/Artefakte:**
- Erstellt: `app/src/renderer/src/components/BackButton.tsx`
- Verändert/erstellt: zugehöriges CSS

**Akzeptanzkriterien:**
- [ ] Touch-Bereich ist 64×64 px (messbar via DevTools-Box).
- [ ] Klar erkennbarer nach-links-Pfeil in `--flieder-deep`.
- [ ] Tap löst `onBack` aus; Press-Feedback (Scale 0,96) sichtbar.
- [ ] `aria-label` kommt aus `de.json` (kein hartcodierter String).

---

### T3.06 — `library:restartFromBeginning`-Command (IPC + Main-Handler)
**Größe:** S
**Abhängigkeiten:** keine (kann parallel zu Theme laufen)
**Vorbedingung:** IPC-Vertrag aus M2 (`app/src/shared/ipc-contract.ts`) mit
`player:play`-Handler und MPD-Steuerung (`app/src/main/mpd/control.ts`) vorhanden;
DB-DAO (`app/src/main/db/dao.ts`) mit `upsertPosition` vorhanden.

**Ziel:** Ein neuer, **additiver** IPC-Command `library:restartFromBeginning`, der für
ein Medium die gespeicherte Position auf **0** zurücksetzt und das Medium **von vorne**
abspielt. Wird vom S4-Detail-Overlay (T3.11) für „Von vorne starten" aufgerufen.

**Hintergrund:** Der M2-IPC-Vertrag hat bereits `player:play({ path, position? })`,
`onboarding:getSeen/setSeen`, `library:list` usw. — **es fehlt nur** der „Von vorne
starten"-Command. Alle anderen für M3 nötigen Commands existieren schon.

**Beschreibung:**
1. **Vertrag erweitern** — `app/src/shared/ipc-contract.ts`, additiv im Interface
   `IpcCommands` (bestehende Keys NICHT ändern):
   ```typescript
   'library:restartFromBeginning': {
     /** path relativ zu /mnt/hoermond (= MediaItem.path). */
     request: { path: string };
     response: { ok: boolean };
   };
   ```
2. Den Channel in die Whitelist `ALLOWED_COMMANDS` aufnehmen (additiv):
   ```typescript
   // ... bestehende Einträge ...
   'library:restartFromBeginning',
   ```
   `ALLOWED_EVENTS`/`REPLAYABLE_EVENTS` bleiben unverändert (kein neues Event nötig).
3. **Main-Handler** in der zentralen IPC-Registrierung
   `app/src/main/ipc/register.ts` (aus M2 T2.15) ergänzen:
   ```typescript
   import { play } from '../mpd/control';
   import { getDb } from '../db';
   import { upsertPosition } from '../db/dao';

   ipcMain.handle('library:restartFromBeginning', async (_e, p: { path: string }) => {
     // Gespeicherte Position auf 0 zurücksetzen (track_index 0, position 0):
     upsertPosition(getDb(), p.path, 0, 0);
     // Von vorne abspielen (position weggelassen => ab 0):
     await play(p.path);
     return { ok: true };
   });
   ```
   > `upsertPosition(db, path, 0, 0)` setzt `last_played` implizit auf „jetzt" (DAO-
   > Verhalten aus M2) — das Medium gilt dadurch als „zuletzt gehört" mit 0 %... ABER:
   > bei genau 0 % zählt E17 es als „neu" (Sektion „Alle"). Das ist gewollt: „von
   > vorne" bedeutet Fortschritt 0. Sobald die Wiedergabe läuft und die Positions-
   > Persistenz (M2 T2.13) wieder schreibt, wandert es regulär in „Zuletzt gehört".
4. Typecheck.

**Caveats:**
- **Namenskonvention Doppelpunkt** (`library:restartFromBeginning`), nicht Punkt.
- Den Handler in der zentralen `register.ts` ergänzen, nicht direkt in `index.ts`
  (M2-Refactor bündelt alle Handler dort).
- Keine bestehenden Vertrag-Keys ändern oder Punkt-Notation einführen.
- Falls `play()` wirft (Medium entfernt), propagiert das als rejected `invoke` — das
  S4-Overlay sollte das tolerieren (für M3 reicht: Overlay schließen, kein Crash).

**Dateien/Artefakte:**
- Verändert: `app/src/shared/ipc-contract.ts`, `app/src/main/ipc/register.ts`

**Akzeptanzkriterien:**
- [ ] `npm run typecheck` grün; `library:restartFromBeginning` in `ALLOWED_COMMANDS`.
- [ ] DevTools-Konsole:
  `await window.hoermond.invoke('library:restartFromBeginning', { path: 'audiobooks/Autor/Titel' })`
  → Medium spielt **ab 0** (nicht ab gespeicherter Position).
- [ ] In der DB ist `position_seconds` für den Pfad direkt nach dem Aufruf 0
  (`sqlite3 ... "SELECT position_seconds FROM playback_position WHERE media_path=…"`).
- [ ] Bestehende M2-Commands unverändert (grep: keine geänderten Keys).

---

### T3.07 — `de.json` um alle M3-Strings erweitern
**Größe:** S
**Abhängigkeiten:** keine
**Vorbedingung:** `app/src/renderer/src/i18n/de.json` aus M2 vorhanden; `useT()`-Hook
liefert `t(key)` mit Fallback auf den Key.

**Ziel:** Alle in M3 sichtbaren UI-Strings sind als Keys in `de.json` ergänzt, sodass
**kein** Screen hartcodierte Strings im JSX braucht (Grundvertrag). Die bestehenden
M2-Keys bleiben unverändert.

**Beschreibung:**
1. `app/src/renderer/src/i18n/de.json` **additiv** erweitern (bestehende Keys aus M2
   behalten — `boot.starting`, `error.db`, `library.recentlyPlayed`, `library.all`,
   `library.audiobooks`, `library.music`, `library.empty`, `player.*`). Neue Keys:
   ```json
   {
     "app.name": "Hörmond",

     "onboarding.welcome.title": "Hallo! Schön, dass du da bist.",
     "onboarding.welcome.subtitle": "Deine Hörbücher und Lieder kommen gleich.",

     "start.audiobooks": "Hörbücher",
     "start.music": "Musik",

     "nav.back": "Zurück",

     "section.recentlyPlayed": "Zuletzt gehört",
     "section.all": "Alle",

     "detail.author": "Autor",
     "detail.progress": "Fortschritt",
     "detail.restart": "Von vorne starten",
     "detail.close": "Schließen",

     "library.emptyTitle": "Hier ist noch nichts — deine Hörbücher kommen bald!",

     "badge.inProgress": "Weiterhören",
     "badge.done": "Fertig"
   }
   ```
   > Hinweis: M2 hatte bereits `library.recentlyPlayed`/`library.all` für das
   > Wegwerf-UI. M3 nutzt für die neuen Sektions-Header die **eigenen** Keys
   > `section.recentlyPlayed`/`section.all` (klarere Namensräume) — alternativ die
   > bestehenden M2-Keys wiederverwenden. **Empfehlung:** neue `section.*`-Keys
   > nutzen und die alten `library.recentlyPlayed/all` nach Entfernen des Wegwerf-UIs
   > (T3.16) optional aufräumen. Wer Aufräumen vermeiden will, verwendet einfach die
   > bestehenden Keys — dann diese vier neuen `section.*`-Zeilen weglassen und in den
   > Screens `library.recentlyPlayed`/`library.all` referenzieren. **Wichtig: konsistent
   > eine Variante wählen.**
2. JSON valide halten (Trailing-Comma-frei; `de.json` wird per `import` geladen).

**Caveats:**
- **Keine** bestehenden M2-Keys umbenennen/löschen (das Wegwerf-`Library.tsx` nutzt
  sie noch bis T3.16).
- Umlaute direkt als UTF-8 (`ö`, `ü`, `ä`) — die Datei ist UTF-8.
- `app.name` „Hörmond" dient als optionale Wortmarke neben dem Logo (S1) und als
  Empty-State-/Boot-Titel.

**Dateien/Artefakte:**
- Verändert: `app/src/renderer/src/i18n/de.json`

**Akzeptanzkriterien:**
- [ ] Alle oben gelisteten neuen Keys existieren und sind valides JSON
  (`node -e "JSON.parse(require('fs').readFileSync('src/renderer/src/i18n/de.json'))"`).
- [ ] Bestehende M2-Keys unverändert vorhanden.
- [ ] `useT()` gibt für jeden neuen Key den deutschen String zurück (nicht den Key).

---

### T3.08 — Cover-Platzhalter-Komponente (deterministische Farbe + Initial)
**Größe:** M
**Abhängigkeiten:** T3.02
**Vorbedingung:** Theme-Farben verfügbar; `MediaItem` (mit `coverPath?: string`) aus
dem IPC-Vertrag bekannt.

**Ziel:** Eine Komponente `<Cover>`, die ein Medien-Cover **quadratisch (1:1), mit 12 px
abgerundeten Ecken** rendert. Liegt ein echtes Cover (`coverPath`) vor, wird es
angezeigt; **fehlt** es (M3-Normalfall — Online-Fetch erst M7), wird ein **generierter
Platzhalter** erzeugt: **Titel-Initial** auf einer **deterministischen Hintergrundfarbe**
aus einer festen Palette (gleicher Titel → **immer dieselbe** Farbe). Bietet außerdem
einen **Hook** für den späteren echten Cover-Fetch (M7).

**Cover-Regeln (Design-Brief §5.1):** Quadratisch 1:1, **12 px** Eckenradius. Fallback:
Initial + deterministische Farbe (simpler Hash über `title` → Index in einer festen
Farbliste). **Form UND Farbe** tragen Bedeutung (nicht nur Farbe — Rot-Grün-Schwäche-
sicher gilt für Badges, T3.12; der Cover-Fallback ist davon unberührt, aber soll
konsistent/deterministisch sein).

**Beschreibung:**
1. Komponente `app/src/renderer/src/components/Cover.tsx`:
   ```tsx
   /** Feste Farbliste für deterministische Platzhalter (aus der Theme-Palette
       abgeleitet; bewusst dunkel genug für hellen Text). */
   const PLACEHOLDER_COLORS = [
     '#6E54B8', // flieder-deep
     '#2563B0', // info
     '#2E7D52', // success
     '#A85F0C', // warning
     '#374151', // parent-accent (dunkelgrau)
     '#9B7EDC', // flieder (heller -> dunkler Text, siehe unten)
   ];

   /** Deterministischer Hash: gleicher Titel -> gleicher Index. */
   function colorIndex(title: string): number {
     let h = 0;
     for (let i = 0; i < title.length; i++) {
       h = (h * 31 + title.charCodeAt(i)) >>> 0;
     }
     return h % PLACEHOLDER_COLORS.length;
   }

   interface CoverProps {
     title: string;
     coverPath?: string;
     /** Pixel-Kantenlänge (Grid: 180). */
     size: number;
   }

   export default function Cover({ title, coverPath, size }: CoverProps): React.JSX.Element {
     const radius = 12;
     if (coverPath) {
       // M3: i. d. R. undefined; M7 füllt coverPath. Hook bleibt damit live.
       return (
         <img
           className="cover"
           src={coverPath}
           width={size}
           height={size}
           alt=""
           style={{ borderRadius: radius, objectFit: 'cover' }}
         />
       );
     }
     const bg = PLACEHOLDER_COLORS[colorIndex(title)];
     const initial = (title.trim()[0] ?? '?').toUpperCase();
     // Heller Flieder (#9B7EDC) braucht dunklen Text (Kontrast-Regel), sonst weiß:
     const fg = bg === '#9B7EDC' ? 'var(--text-on-flieder)' : '#FFFFFF';
     return (
       <div
         className="cover cover--placeholder"
         style={{
           width: size, height: size, borderRadius: radius,
           background: bg, color: fg,
           display: 'flex', alignItems: 'center', justifyContent: 'center',
           fontWeight: 700, fontSize: Math.round(size * 0.4),
         }}
         aria-hidden="true"
       >
         {initial}
       </div>
     );
   }
   ```
2. **M7-Hook dokumentieren:** Sobald `coverPath` gesetzt ist, rendert die Komponente
   das echte Bild — M7 muss nur `MediaItem.coverPath` befüllen (Backend), kein
   Frontend-Eingriff nötig. Ein Code-Kommentar hält das fest.
3. (Optional, nur falls in M3 ein Ladezustand simuliert wird) Cover-Shimmer-Klasse
   vorbereiten — siehe Caveat. **Default: nicht nötig**, da Cover lokal/synchron sind.

**Caveats:**
- **Deterministisch:** Der Hash MUSS für denselben Titel stabil sein (kein
  `Math.random()`), damit dasselbe Hörbuch über Neustarts hinweg immer dieselbe Farbe
  zeigt — wichtig für Wiedererkennung durch das Kind.
- **Kontrast bei hellem Flieder (#9B7EDC):** Auf diesem hellen Hintergrund **dunklen**
  Text (`--text-on-flieder`) verwenden, sonst Kontrastbruch (Brief: Flieder nie mit
  weißem Text). Im Code oben berücksichtigt.
- Cover-**Shimmer** (Lade-Sweep, 1 Passage / 1,2 s, ~30°, **keine >3 Hz-Flackerung**,
  WCAG 2.3.1) ist nur relevant, falls M3 einen echten Lade-State baut. Da Cover in M3
  lokal/synchron sind, ist **kein** Shimmer nötig — nicht implementieren, außer T3.18
  zeigt am Pi ein Ruckeln, das einen Ladezustand erfordert. Dann hier nachrüsten.
- `objectFit: 'cover'` verhindert verzerrte echte Cover (zuschneiden statt strecken).

**Dateien/Artefakte:**
- Erstellt: `app/src/renderer/src/components/Cover.tsx`

**Akzeptanzkriterien:**
- [ ] Ohne `coverPath` rendert ein quadratischer Platzhalter mit Titel-Initial und
  Hintergrundfarbe; 12 px Eckenradius.
- [ ] Derselbe Titel ergibt **immer** dieselbe Farbe (über Reloads hinweg).
- [ ] Bei heller Flieder-Hintergrundfarbe ist der Text dunkel (lesbar).
- [ ] Mit gesetztem `coverPath` wird das Bild quadratisch (object-fit cover), 12 px
  Radius gerendert.
- [ ] Komponente ist size-parametrisierbar (180 fürs Grid).

---

### T3.09 — S0 Willkommensscreen (2,5 s, Fade 240 ms, `onboarding:setSeen`)
**Größe:** S
**Abhängigkeiten:** T3.02, T3.03, T3.07
**Vorbedingung:** Theme, `<Logo>`, `de.json`-Keys vorhanden; IPC `onboarding:getSeen`/
`onboarding:setSeen` aus M2 verfügbar.

**Ziel:** Der **Willkommensscreen S0** erscheint **nur beim allerersten App-Start**
(`onboarding_seen=false`), zeigt zentriert Logo + Begrüßung **2,5 s** lang, blendet
dann **per Fade-Out (240 ms)** zu S1 über und setzt `onboarding_seen=true`. Ein **Tap
davor** springt sofort zu S1. Nach einem Neustart erscheint S0 **nie wieder**.

**Design-Brief §2.1 (exakt):** Vollflächig, Hintergrund **`--flieder-tint` (#F2EDFB)**.
Zentriert: Logo **~160×160 px**, darunter Begrüßung groß (**Heading XL 32px/38px
Bold**): „Hallo! Schön, dass du da bist." (Key `onboarding.welcome.title`), darunter
kleiner (**Body 18px/26px**): „Deine Hörbücher und Lieder kommen gleich."
(Key `onboarding.welcome.subtitle`). **Kein Button.** Auto-Dismiss nach **2,5 s**
(Fade-Out **240 ms**). Tap vorher → sofort S1.

**Beschreibung:**
1. Komponente `app/src/renderer/src/screens/S0Welcome.tsx`:
   ```tsx
   import { useEffect, useRef, useState } from 'react';
   import { useT } from '../i18n/I18nContext';
   import Logo from '../components/Logo';

   interface S0Props {
     /** Wird aufgerufen, wenn S0 fertig ist (Auto-Dismiss ODER Tap). Der Aufrufer
         (T3.15) navigiert dann zu S1 und ruft onboarding:setSeen auf. */
     onDone: () => void;
   }

   const VISIBLE_MS = 2500;  // 2,5 s sichtbar
   const FADE_MS = 240;      // Fade-Out 240 ms

   export default function S0Welcome({ onDone }: S0Props): React.JSX.Element {
     const t = useT();
     const [fading, setFading] = useState(false);
     const doneRef = useRef(false);

     const finish = (): void => {
       if (doneRef.current) return;
       doneRef.current = true;
       setFading(true);
       setTimeout(onDone, FADE_MS); // erst nach Fade-Out weiterreichen
     };

     useEffect(() => {
       const timer = setTimeout(finish, VISIBLE_MS);
       return () => clearTimeout(timer);
       // eslint-disable-next-line react-hooks/exhaustive-deps
     }, []);

     return (
       <div
         className={`s0-welcome${fading ? ' is-fading' : ''}`}
         onPointerDown={finish}
         role="button"
         aria-label={t('onboarding.welcome.title')}
       >
         <Logo size={160} />
         <h1 className="t-heading-xl s0-title">{t('onboarding.welcome.title')}</h1>
         <p className="t-body s0-subtitle">{t('onboarding.welcome.subtitle')}</p>
       </div>
     );
   }
   ```
2. CSS:
   ```css
   .s0-welcome {
     width: 800px; height: 480px;
     background: var(--flieder-tint);
     display: flex; flex-direction: column;
     align-items: center; justify-content: center;
     gap: var(--space-3);
     text-align: center;
     opacity: 1;
     transition: opacity 240ms cubic-bezier(0.4, 0, 0.2, 1);
   }
   .s0-welcome.is-fading { opacity: 0; }
   .s0-title { color: var(--text-primary); margin: 0; }
   .s0-subtitle { color: var(--text-secondary); margin: 0; }
   ```
3. **Onboarding-Persistenz** passiert NICHT in S0 selbst, sondern im Aufrufer (T3.15):
   Beim `onDone` ruft die Root-Navigation `onboarding:setSeen({ seen: true })` und
   wechselt zu S1. So bleibt S0 rein präsentational und gut testbar. (Begründung: der
   Renderer hält keinen Gerätezustand; das Setzen ist ein IPC-Aufruf, der zentral in
   der Navigationsschicht sitzt.)

**Caveats:**
- **Genau einmal `onDone`** (das `doneRef`-Flag verhindert Doppelauslösung durch Tap
  **während** des Timers).
- Das Setzen von `onboarding_seen` gehört in T3.15 (Navigation), nicht in S0 — S0
  signalisiert nur „fertig". Würde S0 selbst setzen und der Tap + Timer beide feuern,
  gäbe es doppelte IPC-Aufrufe.
- Fade-Out **240 ms** exakt; danach erst `onDone` (kein hartes Umschalten).
- Hintergrund **`--flieder-tint`** (nicht `--bg-app`) — S0 hebt sich bewusst ab.

**Dateien/Artefakte:**
- Erstellt: `app/src/renderer/src/screens/S0Welcome.tsx` + CSS

**Akzeptanzkriterien:**
- [ ] S0 zeigt Logo (~160 px), Titel (Heading XL) und Subtitle (Body), zentriert auf
  `--flieder-tint`.
- [ ] Nach 2,5 s startet ein 240-ms-Fade-Out, danach `onDone`.
- [ ] Tap vor Ablauf löst sofort Fade-Out + `onDone` aus (genau einmal).
- [ ] Kein Button vorhanden.
- [ ] (Integrationstest in T3.15) Nach Neustart mit `onboarding_seen=true` erscheint
  S0 **nicht** mehr.

---

### T3.10 — S1 Startscreen (zwei 360×360-Wahlkacheln + Logo)
**Größe:** M
**Abhängigkeiten:** T3.02, T3.03, T3.04, T3.07
**Vorbedingung:** Theme, `<Logo>`, `<Pressable>`, `de.json`-Keys vorhanden.

**Ziel:** Der **Startscreen S1** zeigt das Logo oben zentriert und **zwei große
Wahlkacheln** „Hörbücher" und „Musik" (je **~360×360 px**). Tap auf „Hörbücher" führt
zu S2 (Grid, Filter `audiobook`), Tap auf „Musik" zu S3 (Grid, Filter `music`).

**Design-Brief §5.0 (S1-Layout):** Nutzbare Fläche 760×440 px (Safe-Area 20 px). Logo
**oben zentriert** in einer Titelzone ~120×40 px (Symbol ~40×40 + optionale Wortmarke
„Hörmond" in **Label-Größe 20px/26px Semibold**). Darunter **zwei Flächen je ~360×360
px**, mittig im 760×440-Bereich, **24 px Abstand** zwischen ihnen. Kachel-Wörter in
**Label 20px/26px Semibold 600**.

**Beschreibung:**
1. Komponente `app/src/renderer/src/screens/S1Start.tsx`:
   ```tsx
   import { useT } from '../i18n/I18nContext';
   import Logo from '../components/Logo';
   import Pressable from '../components/Pressable';

   interface S1Props {
     onChoose: (type: 'audiobook' | 'music') => void;
   }

   export default function S1Start({ onChoose }: S1Props): React.JSX.Element {
     const t = useT();
     return (
       <div className="s1-start">
         <header className="s1-logo">
           <Logo size={40} />
           <span className="t-label s1-wordmark">{t('app.name')}</span>
         </header>
         <div className="s1-choices">
           <Pressable className="s1-tile s1-tile--audiobooks" onTap={() => onChoose('audiobook')}>
             <span className="t-label s1-tile-label">{t('start.audiobooks')}</span>
           </Pressable>
           <Pressable className="s1-tile s1-tile--music" onTap={() => onChoose('music')}>
             <span className="t-label s1-tile-label">{t('start.music')}</span>
           </Pressable>
         </div>
       </div>
     );
   }
   ```
2. CSS (feste Maße, 24 px Abstand, Safe-Area):
   ```css
   .s1-start {
     width: 800px; height: 480px;
     padding: var(--safe-area);          /* 20px Safe-Area */
     background: var(--bg-app);
     display: flex; flex-direction: column; align-items: center;
   }
   .s1-logo {
     height: 40px;
     display: flex; align-items: center; gap: var(--space-1);
     margin-bottom: var(--space-2);
   }
   .s1-wordmark { color: var(--text-primary); }
   .s1-choices {
     display: flex; gap: var(--space-3);  /* 24px */
     align-items: center; justify-content: center;
     flex: 1;
   }
   .s1-tile {
     width: 360px; height: 360px;
     border-radius: 24px;
     background: var(--surface);
     display: flex; align-items: center; justify-content: center;
     /* dekorative Flächen dürfen Flieder nutzen (kein weißer Text drauf): */
   }
   .s1-tile--audiobooks { background: var(--flieder-tint); }
   .s1-tile--music      { background: var(--flieder-tint); }
   .s1-tile-label { color: var(--text-on-flieder); }  /* dunkler Text auf Flieder-tint */
   ```
   > Höhe gesamt: Logo 40 + margin 16 + Kachel 360 = 416 ≤ 440 nutzbar — passt mit
   > Safe-Area. Falls es knapp wird, Logo-Marge auf 8 px reduzieren.
   > Die zwei Kacheln dürfen gerne mit einem dekorativen Symbol/Illustration ergänzt
   > werden (Buch / Note) — optional; der Brief verlangt die **Wörter** als Pflicht.
3. Tap-Targets: 360×360 px erfüllen die Kachel-Untergrenze (≥160) bei Weitem; der
   24-px-Abstand erfüllt die ≥12-px-Abstandsregel.

**Caveats:**
- **Kein weißer Text auf Flieder.** Kachel-Hintergrund hier `--flieder-tint` (sehr
  hell) → dunkler Text `--text-on-flieder`. Würde man `--flieder` (#9B7EDC) als
  Kachel-BG nutzen, ebenfalls dunklen Text — nie weiß.
- Press-Feedback kommt von `<Pressable>` (Scale 0,96) — nicht zusätzlich `:hover`.
- Feste Maße (360×360, 24 px) — kein Responsive.

**Dateien/Artefakte:**
- Erstellt: `app/src/renderer/src/screens/S1Start.tsx` + CSS

**Akzeptanzkriterien:**
- [ ] Logo oben zentriert + Wortmarke „Hörmond" (aus `de.json`).
- [ ] Zwei Kacheln je 360×360 px, 24 px Abstand, mittig.
- [ ] Kachel-Wörter „Hörbücher"/„Musik" in Label-Größe, **dunkler** Text auf hellem
  Flieder-Grund (kein weißer Text).
- [ ] Tap „Hörbücher" → `onChoose('audiobook')`, Tap „Musik" → `onChoose('music')`,
  mit Press-Feedback.
- [ ] Layout passt in 800×480 ohne Überlauf/Scroll.

---

### T3.11 — S4 Detail-Overlay (Scrim, Fortschritt, „Von vorne starten")
**Größe:** M
**Abhängigkeiten:** T3.02, T3.04, T3.06, T3.07, T3.08
**Vorbedingung:** Theme, `<Pressable>`, `<Cover>`, `library:restartFromBeginning`
(T3.06), `de.json`-Keys vorhanden.

**Ziel:** Das **Detail-Overlay S4** öffnet über dem Grid (kein neuer Navigationslevel),
**dimmt den Hintergrund mit `--scrim`** und zeigt zu einem Medium **Titel, Autor,
Fortschritt** sowie den Button **„Von vorne starten"**. Es wird durch **Tap außerhalb**
(auf den Scrim) **oder** ein **Schließen-Element** verlassen und erzeugt **keinen neuen
Verlauf**.

**Design-Brief §3.2 / §4.2 (exakt):** S4 ist ein **Overlay/Dialog**, keine neue
Navigationsebene. Abdunklung Hintergrund mit **`--scrim` (rgba(42,35,66,0.55))**.
Verlassen durch **Tap außerhalb** ODER **Schließen-Element**. Animationen: **Ein:
220 ms Fade + Scale 0,96→1,0**, **Scrim 200 ms**. **Aus: 160 ms Fade**. Inhalt:
Titel/Autor/Fortschritt + „Von vorne starten". „Von vorne starten" → **Position 0
setzen, dann play** (= `library:restartFromBeginning`, T3.06).

**Beschreibung:**
1. Komponente `app/src/renderer/src/screens/S4Detail.tsx`:
   ```tsx
   import { useEffect, useState } from 'react';
   import { useT } from '../i18n/I18nContext';
   import Cover from '../components/Cover';
   import Pressable from '../components/Pressable';
   import type { MediaItem } from '@shared/ipc-contract';

   interface S4Props {
     item: MediaItem;
     onClose: () => void;
   }

   export default function S4Detail({ item, onClose }: S4Props): React.JSX.Element {
     const t = useT();
     const [closing, setClosing] = useState(false);

     // Eintritts-Animation: nach Mount „entered" setzen (Scale 0,96 -> 1,0)
     const [entered, setEntered] = useState(false);
     useEffect(() => {
       const id = requestAnimationFrame(() => setEntered(true));
       return () => cancelAnimationFrame(id);
     }, []);

     const close = (): void => {
       if (closing) return;
       setClosing(true);
       setTimeout(onClose, 160); // Aus: 160 ms Fade
     };

     const restart = (): void => {
       void window.hoermond.invoke('library:restartFromBeginning', { path: item.path });
       close();
     };

     return (
       <div
         className={`s4-scrim${closing ? ' is-closing' : ''}${entered ? ' is-entered' : ''}`}
         onPointerDown={close}        /* Tap außerhalb schließt */
       >
         <div
           className="s4-card"
           onPointerDown={(e) => e.stopPropagation()}  /* Klick im Dialog schließt NICHT */
         >
           <Pressable className="s4-close" onTap={close}>
             <span className="visually-hidden">{t('detail.close')}</span>
             <span aria-hidden="true">✕</span>
           </Pressable>
           <Cover title={item.title} coverPath={item.coverPath} size={140} />
           <h2 className="t-heading s4-title">{item.title}</h2>
           {item.artist && (
             <p className="t-body s4-author">{t('detail.author')}: {item.artist}</p>
           )}
           <p className="t-tiny s4-progress">
             {t('detail.progress')}: {item.progressPercent}%
           </p>
           <Pressable className="s4-restart" onTap={restart}>
             <span className="t-label">{t('detail.restart')}</span>
           </Pressable>
         </div>
       </div>
     );
   }
   ```
2. CSS (Scrim + Karte + Animationen, exakte Timings):
   ```css
   .s4-scrim {
     position: absolute; inset: 0;
     width: 800px; height: 480px;
     background: var(--scrim);
     display: flex; align-items: center; justify-content: center;
     opacity: 0;
     transition: opacity 200ms cubic-bezier(0.4, 0, 0.2, 1);  /* Scrim 200ms */
   }
   .s4-scrim.is-entered { opacity: 1; }
   .s4-scrim.is-closing { opacity: 0; transition: opacity 160ms cubic-bezier(0.4,0,0.2,1); }

   .s4-card {
     position: relative;
     min-width: 360px; max-width: 600px;
     background: var(--surface);
     border-radius: 24px;
     padding: var(--space-3);
     display: flex; flex-direction: column; align-items: center; gap: var(--space-2);
     transform: scale(0.96);
     opacity: 0;
     transition: transform 220ms cubic-bezier(0.4,0,0.2,1), opacity 220ms cubic-bezier(0.4,0,0.2,1);
   }
   .s4-scrim.is-entered .s4-card { transform: scale(1); opacity: 1; }  /* Ein: 220ms */

   .s4-close {
     position: absolute; top: 8px; right: 8px;
     width: 60px; height: 60px;       /* Steuerelement-Untergrenze 60px */
     display: flex; align-items: center; justify-content: center;
     font-size: 28px; color: var(--text-secondary);
   }
   .s4-title { color: var(--text-primary); margin: 0; text-align: center; }
   .s4-author { color: var(--text-secondary); margin: 0; }
   .s4-progress { color: var(--text-secondary); margin: 0; }
   .s4-restart {
     min-height: 60px; padding: 0 var(--space-3);
     border-radius: 16px;
     background: var(--flieder-deep);   /* deep -> weißer Text erlaubt */
     color: var(--text-on-deep);
     display: flex; align-items: center; justify-content: center;
   }
   ```
3. **„Von vorne starten"** ruft `library:restartFromBeginning` (T3.06) auf und schließt
   das Overlay. Danach läuft das Medium ab 0 (Now-Playing-Platzhalter T3.14b zeigt das).

**Caveats:**
- **`stopPropagation` auf der Karte** ist Pflicht, sonst schließt der Scrim-Handler bei
  jedem Tap **innerhalb** des Dialogs (z. B. auf „Von vorne starten") ebenfalls.
- **`--flieder-deep` für den Restart-Button** (weißer Text erlaubt). NICHT `--flieder`
  (heller, weißer Text verboten).
- Overlay ist `position: absolute; inset: 0` **über** dem aktuellen Screen — es erzeugt
  **keinen** Navigationseintrag (T3.15 hält es als reinen lokalen State, nicht im
  Verlaufsstack).
- Schließen-Element (✕) **und** Tap-außerhalb müssen beide schließen.
- Eintritts-Scale 0,96→1,0 in **220 ms**, Aus-Fade **160 ms** — exakt.

**Dateien/Artefakte:**
- Erstellt: `app/src/renderer/src/screens/S4Detail.tsx` + CSS

**Akzeptanzkriterien:**
- [ ] Overlay dimmt Hintergrund mit `--scrim`; Karte fadet+skaliert in ~220 ms ein.
- [ ] Zeigt Cover, Titel, Autor (falls vorhanden) und Fortschritt-Prozent.
- [ ] Tap auf Scrim (außerhalb der Karte) schließt; Tap auf ✕ schließt; Tap **in** der
  Karte schließt **nicht**.
- [ ] „Von vorne starten" ruft `library:restartFromBeginning` mit `item.path` auf und
  schließt; Medium spielt danach ab 0.
- [ ] Schließen-Animation ~160 ms Fade.

---

### T3.12 — Cover-Kachel (180×180 + Label, Weiterhören-Ring + Badge, Häkchen)
**Größe:** M
**Abhängigkeiten:** T3.04, T3.08, T3.13b (Long-Press-Hook)
**Vorbedingung:** `<Pressable>`, `<Cover>`, Long-Press-Hook (T3.13b) vorhanden;
`MediaItem` bekannt.

**Ziel:** Eine **Grid-Kachel** `<MediaTile>` (180×180 px Cover + Label-Zeile, gesamt
**180×208 px**), die für ein `MediaItem` das Cover (T3.08), den Titel und je nach
Fortschritt die korrekten **Indikatoren** rendert:
- **0 % < Fortschritt < 100 %** („Weiterhören"): **Fortschritts-Ring/-Balken am unteren
  Kachelrand, 6 px hoch, Farbe `--flieder-deep` (#6E54B8)** PLUS **bildhaftes Badge
  (Pfeil-im-Kreis, oben rechts)**.
- **100 %** („Fertig"): **dezentes Häkchen-Badge `--success` (#2E7D52)** oben rechts,
  **kein** Fortschrittsbalken.
- **0 %** (neu): keine Indikatoren.

Tap startet/resumed Wiedergabe (`onTap`); **langer Tap (600 ms)** öffnet S4
(`onLongPress`), mit **Halte-Ring-Feedback ab 300 ms** (vom Hook T3.13b geliefert).

**Design-Brief §5.0/§5.1 (exakt):** Kachel **180×180 px Cover** + **Label-Zeile ~28 px**
= **180×208 px**. **Form UND Farbe** tragen Bedeutung (Rot-Grün-Schwäche-sicher: der
Ring/das Badge sind nicht nur farblich, sondern auch durch Form — Pfeil vs. Häkchen —
unterscheidbar). Fortschritts-Ring **6 px**, `--flieder-deep`. Fertig-Häkchen
`--success`, kein Balken.

**Beschreibung:**
1. Komponente `app/src/renderer/src/components/MediaTile.tsx`:
   ```tsx
   import { useT } from '../i18n/I18nContext';
   import Cover from './Cover';
   import Pressable from './Pressable';
   import { useLongPress } from '../hooks/useLongPress';
   import type { MediaItem } from '@shared/ipc-contract';

   interface MediaTileProps {
     item: MediaItem;
     onTap: (item: MediaItem) => void;
     onLongPress: (item: MediaItem) => void;
   }

   export default function MediaTile({ item, onTap, onLongPress }: MediaTileProps): React.JSX.Element {
     const t = useT();
     const inProgress = item.progressPercent > 0 && item.progressPercent < 100;
     const done = item.progressPercent >= 100;

     // Long-Press-Hook liefert Pointer-Handler + den Halte-Fortschritt (0..1 ab 300ms).
     const lp = useLongPress({
       onLongPress: () => onLongPress(item),
       onTap: () => onTap(item),
     });

     return (
       <Pressable
         className="tile"
         onPointerDown={lp.onPointerDown}
         onPointerUp={lp.onPointerUp}
         onPointerLeave={lp.onPointerLeave}
       >
         <div className="tile-cover">
           <Cover title={item.title} coverPath={item.coverPath} size={180} />

           {/* Weiterhören-Badge: Pfeil-im-Kreis, oben rechts */}
           {inProgress && (
             <span className="tile-badge tile-badge--progress" aria-label={t('badge.inProgress')}>
               <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
                 <circle cx="11" cy="11" r="11" fill="var(--flieder-deep)" />
                 <path d="M8 6 L15 11 L8 16 Z" fill="#FFFFFF" />
               </svg>
             </span>
           )}

           {/* Fertig-Badge: Häkchen, oben rechts */}
           {done && (
             <span className="tile-badge tile-badge--done" aria-label={t('badge.done')}>
               <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
                 <circle cx="11" cy="11" r="11" fill="var(--success)" />
                 <path d="M6 11 L10 15 L16 7" stroke="#FFFFFF" stroke-width="2.5"
                       fill="none" stroke-linecap="round" stroke-linejoin="round" />
               </svg>
             </span>
           )}

           {/* Fortschritts-Balken unten, 6px, nur bei inProgress */}
           {inProgress && (
             <span className="tile-progressbar" aria-hidden="true">
               <span className="tile-progressbar-fill"
                     style={{ width: `${item.progressPercent}%` }} />
             </span>
           )}

           {/* Halte-Ring (Long-Press-Vorschau ab 300ms), vom Hook gesteuert */}
           {lp.holdRatio > 0 && (
             <span className="tile-holdring" style={{ ['--hold' as string]: lp.holdRatio }} aria-hidden="true" />
           )}
         </div>
         <span className="t-label tile-title">{item.title}</span>
       </Pressable>
     );
   }
   ```
2. CSS:
   ```css
   .tile { width: 180px; }
   .tile-cover { position: relative; width: 180px; height: 180px; }
   .tile-title {
     display: block; width: 180px; height: 28px;
     margin-top: 4px;
     color: var(--text-primary);
     white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
     text-align: center;
   }
   .tile-badge {
     position: absolute; top: 6px; right: 6px;
     width: 22px; height: 22px; line-height: 0;
   }
   .tile-progressbar {
     position: absolute; left: 0; right: 0; bottom: 0;
     height: 6px;
     background: rgba(110, 84, 184, 0.25);  /* heller Track */
     border-bottom-left-radius: 12px; border-bottom-right-radius: 12px;
     overflow: hidden;
   }
   .tile-progressbar-fill {
     display: block; height: 6px;
     background: var(--flieder-deep);
   }
   .tile-holdring {
     position: absolute; inset: 0;
     border-radius: 12px;
     /* Ring wächst mit --hold (0..1): konischer Fortschritt um die Kachel */
     border: 4px solid var(--flieder);
     opacity: calc(var(--hold) * 1);
     mask: conic-gradient(#000 calc(var(--hold) * 360deg), transparent 0);
     -webkit-mask: conic-gradient(#000 calc(var(--hold) * 360deg), transparent 0);
   }
   ```
   > Die exakte Halte-Ring-Optik darf gestalterisch variieren (Ring/Scale/Glow),
   > solange sie **ab 300 ms sichtbar wächst** und die 600-ms-Schwelle ankündigt
   > (Wert `holdRatio` 0→1 kommt aus T3.13b).

**Caveats:**
- **Form-Redundanz (Barrierefreiheit):** Weiterhören = **Pfeil**-Badge, Fertig =
  **Häkchen**-Badge — die Bedeutung darf NICHT allein an der Farbe hängen (Rot-Grün-
  Schwäche). Beide Badges haben unterschiedliche **Form** und ein `aria-label`.
- Fortschrittsbalken **nur** bei `inProgress` (nicht bei 100 % — dort nur Häkchen).
- Badge oben **rechts**, Balken **unten** — nicht überlappen lassen.
- Der Halte-Ring (Long-Press-Vorschau) ist visuelles Feedback; die eigentliche
  Schwellen-Logik liegt im Hook T3.13b. `onTap`/`onLongPress` werden vom Hook
  disambiguiert — `<Pressable>`s eigenes `onTap` hier NICHT zusätzlich belegen, sonst
  doppelte Auslösung (Tap käme zweimal).
- Titel mit Ellipsis kürzen (eine Zeile, 28 px) — lange Titel dürfen das Layout nicht
  sprengen.

**Dateien/Artefakte:**
- Erstellt: `app/src/renderer/src/components/MediaTile.tsx` + CSS

**Akzeptanzkriterien:**
- [ ] Kachel ist 180×180 (Cover) + 28 px Label = 180×208 px.
- [ ] Bei 0<%<100: Pfeil-im-Kreis-Badge oben rechts **und** 6-px-Balken unten in
  `--flieder-deep`, Füllbreite = Prozent.
- [ ] Bei 100 %: Häkchen-Badge (`--success`) oben rechts, **kein** Balken.
- [ ] Bei 0 %: keine Indikatoren.
- [ ] Tap löst `onTap(item)` aus; langer Tap (600 ms) `onLongPress(item)`; Halte-Ring
  wird ab ~300 ms sichtbar.
- [ ] Pfeil- und Häkchen-Badge unterscheiden sich in der **Form** (nicht nur Farbe).

---

### T3.13b — Long-Press-Hook (600 ms Schwelle, Halte-Ring ab 300 ms)
**Größe:** M
**Abhängigkeiten:** T3.02
**Vorbedingung:** keine besonderen (reiner React-Hook).

**Ziel:** Ein wiederverwendbarer Hook `useLongPress`, der zwischen **kurzem Tap** und
**langem Tap (> 600 ms)** unterscheidet und während des Haltens einen **Fortschrittswert
`holdRatio` (0→1)** liefert, der **ab 300 ms** zu wachsen beginnt und bei **600 ms** 1
erreicht — als Datenquelle für das Halte-Ring-Feedback der Kachel (T3.12).

**Design-Brief §4.1 (exakt):** Langer Tap auf Kachel: Schwelle **> 600 ms** öffnet S4.
Halte-Feedback (Ring/Scale) wächst sichtbar von **300 ms → 600 ms** (300 ms Dauer) und
kündigt die Schwelle an. Kein Doppeltap, kein Rechtsklick, keine Multitouch.

**Beschreibung:**
1. Hook `app/src/renderer/src/hooks/useLongPress.ts`:
   ```typescript
   import { useRef, useState, useCallback, type PointerEvent } from 'react';

   const LONG_PRESS_MS = 600;   // Schwelle für S4
   const HOLD_START_MS = 300;   // ab hier wächst der Ring
   const HOLD_SPAN_MS = LONG_PRESS_MS - HOLD_START_MS; // 300ms Wachstum

   interface UseLongPressOptions {
     onLongPress: () => void;
     onTap: () => void;
   }

   interface UseLongPressResult {
     onPointerDown: (e: PointerEvent) => void;
     onPointerUp: (e: PointerEvent) => void;
     onPointerLeave: (e: PointerEvent) => void;
     /** 0..1 ab 300ms; 0 außerhalb der Halte-Phase. Für den Halte-Ring (T3.12). */
     holdRatio: number;
   }

   export function useLongPress({ onLongPress, onTap }: UseLongPressOptions): UseLongPressResult {
     const [holdRatio, setHoldRatio] = useState(0);
     const startRef = useRef<number>(0);
     const firedRef = useRef(false);
     const rafRef = useRef<number | null>(null);
     const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

     const cleanup = useCallback(() => {
       if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
       if (timerRef.current !== null) clearTimeout(timerRef.current);
       rafRef.current = null;
       timerRef.current = null;
       setHoldRatio(0);
     }, []);

     const tick = useCallback(() => {
       const elapsed = Date.now() - startRef.current;
       const ratio = Math.min(1, Math.max(0, (elapsed - HOLD_START_MS) / HOLD_SPAN_MS));
       setHoldRatio(ratio);
       if (elapsed < LONG_PRESS_MS) {
         rafRef.current = requestAnimationFrame(tick);
       }
     }, []);

     const onPointerDown = useCallback((_e: PointerEvent) => {
       firedRef.current = false;
       startRef.current = Date.now();
       setHoldRatio(0);
       rafRef.current = requestAnimationFrame(tick);
       timerRef.current = setTimeout(() => {
         firedRef.current = true;   // langer Tap erkannt
         cleanup();
         onLongPress();
       }, LONG_PRESS_MS);
     }, [tick, cleanup, onLongPress]);

     const onPointerUp = useCallback((_e: PointerEvent) => {
       const wasLong = firedRef.current;
       cleanup();
       if (!wasLong) onTap();        // vor 600ms losgelassen => kurzer Tap
     }, [cleanup, onTap]);

     const onPointerLeave = useCallback((_e: PointerEvent) => {
       // Finger rutscht weg: weder Tap noch LongPress
       firedRef.current = true;       // unterdrückt onTap im folgenden up
       cleanup();
     }, [cleanup]);

     return { onPointerDown, onPointerUp, onPointerLeave, holdRatio };
   }
   ```
2. **Verzahnung mit `<Pressable>` (T3.04):** In `MediaTile` (T3.12) werden die
   Hook-Handler über die durchgereichten Pointer-Props von `<Pressable>` verdrahtet,
   und `<Pressable>`s eigenes `onTap` bleibt **ungenutzt** — die Tap/Long-Tap-
   Entscheidung trifft **allein** der Hook (sonst doppelte Tap-Auslösung).

**Caveats:**
- **Genau eine** Auslösung pro Geste: `firedRef` verhindert, dass nach einem erkannten
  Long-Press das `pointerup` zusätzlich `onTap` feuert.
- `onPointerLeave` (Finger rutscht aus der Kachel) muss **beides** abbrechen — sonst
  feuert ein versehentlicher Tap oder ein Long-Press, obwohl der Nutzer abgebrochen hat.
- Timer **und** rAF im Cleanup beide stoppen (Memory-/Doppel-Auslösungs-Leak).
- Werte exakt: Schwelle **600 ms**, Ring-Wachstum **ab 300 ms** über **300 ms**.
- Kein Doppeltap/Multitouch berücksichtigen — nur Single-Pointer.

**Dateien/Artefakte:**
- Erstellt: `app/src/renderer/src/hooks/useLongPress.ts`

**Akzeptanzkriterien:**
- [ ] Kurzes Antippen (< 600 ms loslassen) löst `onTap` aus, **nicht** `onLongPress`.
- [ ] Halten > 600 ms löst `onLongPress` aus, **nicht** `onTap`.
- [ ] `holdRatio` ist 0 bis 300 ms, wächst dann linear bis 1 bei 600 ms.
- [ ] Wegrutschen (`pointerleave`) bricht ab — weder Tap noch Long-Press feuern.
- [ ] Keine doppelten Auslösungen; Timer/rAF werden sauber aufgeräumt.

---

### T3.13 — Grid-Container (4 Spalten, kinetisches Scrollen) + Sektions-Header
**Größe:** L
**Abhängigkeiten:** T3.05, T3.07, T3.12, T3.13b
**Vorbedingung:** `<MediaTile>`, `<BackButton>`, `de.json`-Keys, Long-Press-Hook
vorhanden; `LibraryListResponse` aus `library:list` (M2) verfügbar.

**Ziel:** Der **Bibliothek-Grid-Screen** (dient S2 **und** S3 — identisches Muster, nur
nach `type` gefiltert): Titelleiste mit Zurück-Button (T3.05) links + Sync-Icon-Platz
rechts, darunter ein **vertikal kinetisch scrollbares Grid** mit **4 Spalten**, das die
zwei E17-Sektionen mit **Sektions-Headern** rendert: **„Zuletzt gehört"** und
**„Alle"**. Ist „Zuletzt gehört" leer, **fehlt** dessen Header. Ist die ganze
Bibliothek leer, wird **E1-Empty-State** (T3.14) gezeigt — **keine** leeren Header.

**Design-Brief §5.0 (Grid-Layout, exakt):** Content-Höhe unter der 44-px-Titelleiste
~436 px (480−44). Kachel 180×180 Cover + 28 px Label = **180×208 px**. **4 Spalten** in
**760 px** Breite: 4×180 = 720 + 3 Lücken; Lücke auf **13–14 px** justieren, damit
exakt 760 px gefüllt sind (**Mindestabstand ≥ 12 px**). Vertikal: eine volle Reihe
(208 px) **plus angeschnittene zweite Reihe** signalisiert Scrollbarkeit; **kinetisches
Scrollen vertikal mit Bounce**. Sektions-Header **32 px hohe Zeile**, scrollt mit
(Heading 24px/30px Bold).

**Beschreibung:**
1. Komponente `app/src/renderer/src/screens/LibraryGrid.tsx` (Parameter `type` wählt
   S2/S3):
   ```tsx
   import { useT } from '../i18n/I18nContext';
   import BackButton from '../components/BackButton';
   import MediaTile from '../components/MediaTile';
   import EmptyState from './EmptyState';            // T3.14
   import type { LibraryListResponse, MediaItem } from '@shared/ipc-contract';

   interface LibraryGridProps {
     type: 'audiobook' | 'music';     // S2 = audiobook, S3 = music
     data: LibraryListResponse;       // bereits gefiltert+sortiert (siehe Schritt 3)
     onBack: () => void;
     onPlay: (item: MediaItem) => void;     // Tap -> player:play (Resume)
     onOpenDetail: (item: MediaItem) => void; // Long-Press -> S4
   }

   export default function LibraryGrid({
     type, data, onBack, onPlay, onOpenDetail,
   }: LibraryGridProps): React.JSX.Element {
     const t = useT();
     const isEmpty = data.recentlyPlayed.length === 0 && data.all.length === 0;

     return (
       <div className="grid-screen">
         <header className="grid-titlebar">
           <BackButton onBack={onBack} ariaLabel={t('nav.back')} />
           <span className="grid-title t-heading">
             {t(type === 'audiobook' ? 'start.audiobooks' : 'start.music')}
           </span>
           <span className="grid-sync-slot" aria-hidden="true" />  {/* Sync-Icon erst M7 */}
         </header>

         {isEmpty ? (
           <EmptyState />
         ) : (
           <div className="grid-scroll">
             {data.recentlyPlayed.length > 0 && (
               <>
                 <h2 className="grid-section-header t-heading">{t('section.recentlyPlayed')}</h2>
                 <div className="grid-cells">
                   {data.recentlyPlayed.map((it) => (
                     <MediaTile key={it.path} item={it} onTap={onPlay} onLongPress={onOpenDetail} />
                   ))}
                 </div>
               </>
             )}
             {data.all.length > 0 && (
               <>
                 <h2 className="grid-section-header t-heading">{t('section.all')}</h2>
                 <div className="grid-cells">
                   {data.all.map((it) => (
                     <MediaTile key={it.path} item={it} onTap={onPlay} onLongPress={onOpenDetail} />
                   ))}
                 </div>
               </>
             )}
           </div>
         )}
       </div>
     );
   }
   ```
2. CSS (feste Maße, 4 Spalten, kinetisches Scrollen + Bounce):
   ```css
   .grid-screen { width: 800px; height: 480px; display: flex; flex-direction: column; }
   .grid-titlebar {
     height: 44px; flex: 0 0 44px;
     display: flex; align-items: center; gap: var(--space-2);
     padding: 0 var(--safe-area);
   }
   .grid-title { flex: 1; color: var(--text-primary); }
   .grid-sync-slot { width: 44px; height: 44px; }  /* Platz fürs M7-Sync-Icon */

   .grid-scroll {
     flex: 1;                       /* ~436px */
     overflow-y: auto;
     overflow-x: hidden;
     padding: 0 var(--safe-area) var(--space-3);
     -webkit-overflow-scrolling: touch;   /* Momentum/kinetisch */
     overscroll-behavior: contain;         /* Bounce am Rand, kein Page-Bounce */
   }
   .grid-section-header {
     height: 32px; line-height: 32px;
     margin: var(--space-1) 0;
     color: var(--text-primary);
   }
   .grid-cells {
     display: grid;
     grid-template-columns: repeat(4, 180px);
     column-gap: 13px;             /* 4*180 + 3*13 = 759 ~ 760px */
     row-gap: var(--space-2);
   }
   ```
   > 4×180 + 3×13 = 759 px (innerhalb 760 nutzbar). Wird die Lücke auf 13,33 px
   > gebraucht, ist `justify-content: space-between` auf `.grid-cells` mit
   > `grid-template-columns: repeat(4, 180px)` eine Alternative — die feste 13-px-
   > Lücke ist aber simpler und erfüllt den ≥12-px-Mindestabstand. Pixel-Feintuning
   > erfolgt am echten Display in T3.19.
3. **Filterung/Sortierung:** `library:list` (M2) liefert bereits **alle** Medien in
   `recentlyPlayed`/`all`, aber **nicht** nach `type` getrennt. Der Aufrufer (T3.15)
   filtert die Response **vor** Übergabe nach `type` (Hörbücher vs. Musik) und reicht
   die gefilterte `LibraryListResponse` herein. Die E17-Sortierung innerhalb der
   Sektionen bleibt erhalten (Backend hat sie schon angewandt; nach Filtern bleibt die
   relative Reihenfolge korrekt). **Begründung:** So bleibt `LibraryGrid` rein
   präsentational, ohne IPC-Wissen.
4. **„Angeschnittene zweite Reihe":** Bei genug Medien zeigt die 436-px-Höhe eine volle
   208-px-Reihe (+ Header 32 + Abstände) und davon abgeschnitten den Beginn der
   nächsten Reihe → signalisiert Scrollbarkeit. Das ergibt sich automatisch aus der
   festen Höhe + `overflow-y: auto`; nicht künstlich erzwingen.

**Caveats:**
- **Leere „Zuletzt gehört"-Sektion ⇒ KEIN Header** (Brief: „Ist ‚Zuletzt gehört' leer,
  fehlt der Header"). Im Code: Header nur rendern, wenn `recentlyPlayed.length > 0`.
- **Komplett leere Bibliothek ⇒ E1-Empty-State** (T3.14), **keine** leeren Sektions-
  Header, **keine** weiße Fläche.
- **Kinetisches Scrollen + Bounce:** `-webkit-overflow-scrolling: touch` +
  `overscroll-behavior: contain`. Auf Chromium/Electron ist Momentum meist gegeben;
  falls am Pi (T3.18) zu träge/ohne Bounce, ggf. eine JS-Momentum-Bibliothek erwägen —
  zunächst CSS-only versuchen.
- **4 Spalten fest**, kein Responsive. Lücke 13 px (≥12-px-Regel).
- Sektions-Header **scrollt mit** (Teil des Scroll-Containers, **nicht** sticky).
- Sync-Icon-**Platz** rechts in der Titelleiste freihalten (44×44), Icon selbst M7.

**Dateien/Artefakte:**
- Erstellt: `app/src/renderer/src/screens/LibraryGrid.tsx` + CSS

**Akzeptanzkriterien:**
- [ ] 4 Spalten à 180 px, Lücke ≥ 12 px (13 px), in 760 px Breite.
- [ ] Titelleiste 44 px mit Zurück-Button links und Sync-Icon-Platz rechts.
- [ ] Sektions-Header „Zuletzt gehört" / „Alle" (aus `de.json`), 32 px hoch, scrollen
  mit.
- [ ] Leere „Zuletzt gehört"-Sektion → ihr Header fehlt; nur „Alle" wird gezeigt.
- [ ] Vertikales kinetisches Scrollen mit Bounce; bei vielen Medien ist eine
  angeschnittene zweite Reihe sichtbar.
- [ ] Komplett leere Daten → `<EmptyState>` statt leerer Header.
- [ ] Tap auf Kachel → `onPlay`; langer Tap → `onOpenDetail`.

---

### T3.14 — E1 Empty-State (Logo + freundliche Botschaft)
**Größe:** S
**Abhängigkeiten:** T3.02, T3.03, T3.07
**Vorbedingung:** Theme, `<Logo>`, `de.json`-Key `library.emptyTitle` vorhanden.

**Ziel:** Eine Komponente `<EmptyState>`, die bei **leerer Bibliothek** einen
freundlichen, **bildhaften** Empty-State zeigt (Logo-Symbol + Botschaft, zentriert) —
**keine** leere weiße Fläche, **kein** technischer Fehler, **keine** Sektions-Header.

**Design-Brief §6/E1 (exakt):** Freundlicher bildhafter Empty-State, zentriert:
**Logo-Symbol + Botschaft** „Hier ist noch nichts — deine Hörbücher kommen bald!"
(Key `library.emptyTitle`). **Sync-Icon-Platz** in der Titelleiste **bleibt** (Icon
selbst erst M7). Die Zwei-Sektionen-Sortierung **entfällt sichtbar** bei leerer
Bibliothek — nur Empty-State.

**Beschreibung:**
1. Komponente `app/src/renderer/src/screens/EmptyState.tsx`:
   ```tsx
   import { useT } from '../i18n/I18nContext';
   import Logo from '../components/Logo';

   export default function EmptyState(): React.JSX.Element {
     const t = useT();
     return (
       <div className="empty-state">
         <Logo size={120} />
         <p className="t-heading-xl empty-text">{t('library.emptyTitle')}</p>
       </div>
     );
   }
   ```
2. CSS:
   ```css
   .empty-state {
     flex: 1;
     display: flex; flex-direction: column;
     align-items: center; justify-content: center;
     gap: var(--space-3);
     text-align: center;
     padding: var(--space-4);
   }
   .empty-text { color: var(--text-primary); max-width: 520px; margin: 0; }
   ```
3. `<EmptyState>` wird **innerhalb** des Grid-Screens (T3.13) unterhalb der bestehenden
   Titelleiste gerendert (damit der **Sync-Icon-Platz** in der Titelleiste erhalten
   bleibt). Die Komponente selbst rendert **keine** Titelleiste.

**Caveats:**
- **Keine** Sektions-Header, **keine** weiße Leerfläche, **kein** Fehlertext — nur
  Logo + freundliche Botschaft.
- Die Titelleiste (mit Zurück-Button + Sync-Icon-Platz) bleibt sichtbar — deshalb wird
  `<EmptyState>` vom Grid-Screen unterhalb der Titelleiste platziert, nicht als
  Vollbild.
- Botschaft in **Heading XL** (32px) und **zentriert** (Brief: zentriert nur bei S0 und
  Empty-States).

**Dateien/Artefakte:**
- Erstellt: `app/src/renderer/src/screens/EmptyState.tsx` + CSS

**Akzeptanzkriterien:**
- [ ] Zeigt Logo (~120 px) + Botschaft aus `library.emptyTitle`, zentriert.
- [ ] Keine Sektions-Header, keine leere weiße Fläche, kein Fehlertext.
- [ ] Wird innerhalb des Grid-Screens unter der Titelleiste gezeigt (Zurück-Button +
  Sync-Icon-Platz bleiben sichtbar).

---

### T3.14b — Now-Playing-Platzhalterbalken (Wegwerf, M4 ersetzt)
**Größe:** S
**Abhängigkeiten:** T3.02, T3.07
**Vorbedingung:** Theme, `de.json`; IPC `player:state` (Push, M2), `player:pause`/
`player:stop` verfügbar.

**Ziel:** Ein **minimaler, bewusst provisorischer** „Now-Playing"-Balken, der **visuell
rückmeldet**, dass nach einem Tap auf eine Kachel tatsächlich etwas abgespielt wird —
solange der **echte Player-Screen S5 erst in M4** kommt. Er zeigt Status + aktuellen
Pfad/Titel und bietet Pause/Stopp. **Wegwerf-UI** — in M4 durch S5 ersetzt.

> **Bewusste Annahme (siehe Risiken):** M3 navigiert beim Kachel-Tap **nicht** zu einem
> Player-Screen (den gibt es noch nicht). Stattdessen reicht dieser dezente Balken als
> Feedback. Er ist klar als Wegwerf markiert — analog zu M2 T2.16.

**Beschreibung:**
1. Komponente `app/src/renderer/src/components/NowPlayingBar.tsx`:
   ```tsx
   import { useEffect, useState } from 'react';
   import { useT } from '../i18n/I18nContext';
   import type { PlayerState } from '@shared/ipc-contract';

   export default function NowPlayingBar(): React.JSX.Element | null {
     const t = useT();
     const [state, setState] = useState<PlayerState | null>(null);

     useEffect(() => {
       void window.hoermond.invoke('player:getState', undefined).then(setState);
       const off = window.hoermond.on('player:state', setState);
       return () => off();   // StrictMode: Cleanup PFLICHT (sonst doppelte Listener)
     }, []);

     if (!state || state.status === 'stopped' || !state.currentPath) return null;

     const label = state.status === 'playing' ? t('player.playing') : t('player.paused');
     return (
       <div className="now-playing-bar">
         <span className="t-tiny np-status">{label}</span>
         <span className="t-tiny np-path">{state.currentPath}</span>
         <button className="np-btn" onPointerUp={() => void window.hoermond.invoke('player:pause', undefined)}>
           {t('player.pause')}
         </button>
         <button className="np-btn" onPointerUp={() => void window.hoermond.invoke('player:stop', undefined)}>
           {t('player.stop')}
         </button>
       </div>
     );
   }
   ```
2. CSS (dezenter Balken unten):
   ```css
   .now-playing-bar {
     position: absolute; left: 0; right: 0; bottom: 0;
     height: 40px;
     display: flex; align-items: center; gap: var(--space-2);
     padding: 0 var(--safe-area);
     background: var(--flieder-tint);
     color: var(--text-on-flieder);
   }
   .np-path { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
   .np-btn { min-height: 32px; }
   ```
3. Der Balken wird von der Root-Navigation (T3.15) **über** S1/S2/S3 eingeblendet,
   sobald etwas spielt (er rendert sich selbst weg bei `stopped`/kein Pfad).

**Caveats:**
- **Unsubscribe im Cleanup** (StrictMode mountet Effects doppelt) — sonst sammeln sich
  `player:state`-Listener.
- **Kein Polling** — nur `player:getState` einmal beim Mount + `player:state`-Push.
- Das ist **Wegwerf-UI**: keine Zeit in Optik investieren; M4 ersetzt es durch S5.
- Strings aus `de.json` (`player.playing`/`paused`/`pause`/`stop` aus M2 vorhanden).

**Dateien/Artefakte:**
- Erstellt: `app/src/renderer/src/components/NowPlayingBar.tsx` + CSS

**Akzeptanzkriterien:**
- [ ] Nach Tap auf eine Kachel erscheint der Balken mit Status „Spielt" + Pfad/Titel.
- [ ] Pause/Stopp-Buttons wirken (Status wechselt per Push).
- [ ] Bei `stopped` verschwindet der Balken.
- [ ] Keine doppelten Listener nach Re-Mount (StrictMode).

---

### T3.15 — Root-Navigation/Routing-State (S0→S1→S2/S3 + S4-Overlay)
**Größe:** L
**Abhängigkeiten:** T3.06, T3.09, T3.10, T3.11, T3.13, T3.14b
**Vorbedingung:** Alle Screens (S0/S1/Grid/S4/Empty/Now-Playing) existieren; IPC
`onboarding:getSeen`/`setSeen`, `library:list`, `player:play`,
`library:restartFromBeginning` verfügbar.

**Ziel:** Eine **Root-Navigationskomponente**, die den **Screen-State** (S0 → S1 →
S2/S3) und das **S4-Overlay** orchestriert, das Onboarding-Flag liest/setzt, die
`library:list`-Daten lädt + nach `type` filtert, die Navigationsregeln umsetzt (Tap =
play/resume, Long-Tap = S4, Zurück = zu S1) und den Now-Playing-Balken einblendet. Der
Player merkt sich die **Herkunftsbibliothek** (von wo das Kind kam).

**Design-Brief §3.1/§3.2 (Navigationsregeln, exakt):**
- S0 → (2,5 s / Tap) → S1.
- S1: Tap „Hörbücher" → S2; Tap „Musik" → S3 (identisches Muster, nur `type`-Filter).
- S2/S3: Tap Kachel → `player:play` (start/resume). **Kein** S5-Screen in M3 (kommt
  M4) → stattdessen Now-Playing-Balken (T3.14b). Langer Tap (600 ms) → S4-Overlay.
- S4 „Von vorne starten" → `library:restartFromBeginning` → Overlay schließen.
- Zurück-Affordanz auf S2/S3 (oben links, 64×64) → zurück zu S1.
- **Max. Tiefe fürs Kind: 2 Ebenen** (S1 → Bibliothek → Player). S4 ist **Overlay**,
  **keine** neue Ebene (kein Verlaufseintrag).
- Player **merkt sich Herkunftsbibliothek** (von S2 oder S3 gekommen).

**Beschreibung:**
1. Root-Komponente `app/src/renderer/src/Root.tsx` (ersetzt das, was bisher `App.tsx`
   nach dem dbError-Check rendert):
   ```tsx
   import { useEffect, useState, useMemo } from 'react';
   import S0Welcome from './screens/S0Welcome';
   import S1Start from './screens/S1Start';
   import LibraryGrid from './screens/LibraryGrid';
   import S4Detail from './screens/S4Detail';
   import NowPlayingBar from './components/NowPlayingBar';
   import type { LibraryListResponse, MediaItem } from '@shared/ipc-contract';

   type Screen =
     | { name: 's0' }
     | { name: 's1' }
     | { name: 'grid'; type: 'audiobook' | 'music' };

   export default function Root(): React.JSX.Element {
     const [screen, setScreen] = useState<Screen | null>(null); // null = lädt Onboarding
     const [lib, setLib] = useState<LibraryListResponse | null>(null);
     const [detail, setDetail] = useState<MediaItem | null>(null); // S4-Overlay

     // 1) Onboarding lesen -> S0 oder S1
     useEffect(() => {
       void window.hoermond.invoke('onboarding:getSeen', undefined).then(({ seen }) => {
         setScreen(seen ? { name: 's1' } : { name: 's0' });
       });
     }, []);

     // 2) Bibliothek laden + Live-Updates
     const loadLib = (): void => {
       void window.hoermond.invoke('library:list', undefined).then(setLib);
     };
     useEffect(() => {
       loadLib();
       const off = window.hoermond.on('library:updated', loadLib);
       return () => off();
     }, []);

     // S0 fertig -> Flag setzen + zu S1
     const finishOnboarding = (): void => {
       void window.hoermond.invoke('onboarding:setSeen', { seen: true });
       setScreen({ name: 's1' });
     };

     // library:list nach type filtern (S2/S3); Sektionsreihenfolge bleibt erhalten
     const filtered = useMemo<LibraryListResponse>(() => {
       if (!lib || !screen || screen.name !== 'grid') {
         return { recentlyPlayed: [], all: [] };
       }
       const ty = screen.type;
       return {
         recentlyPlayed: lib.recentlyPlayed.filter((m) => m.type === ty),
         all: lib.all.filter((m) => m.type === ty),
       };
     }, [lib, screen]);

     const play = (item: MediaItem): void => {
       // Tap = start/resume: position weglassen => Main/MPD resumed via gespeicherte Pos.
       void window.hoermond.invoke('player:play', { path: item.path });
       // KEIN Navigieren zu S5 (existiert erst M4); Now-Playing-Balken zeigt Feedback.
     };

     if (!screen) return <div className="boot-screen" />; // kurzer Lade-Frame

     return (
       <>
         {screen.name === 's0' && <S0Welcome onDone={finishOnboarding} />}
         {screen.name === 's1' && (
           <S1Start onChoose={(type) => setScreen({ name: 'grid', type })} />
         )}
         {screen.name === 'grid' && (
           <LibraryGrid
             type={screen.type}
             data={filtered}
             onBack={() => setScreen({ name: 's1' })}
             onPlay={play}
             onOpenDetail={(item) => setDetail(item)}
           />
         )}

         {/* S4-Overlay: liegt ÜBER dem aktuellen Screen, keine neue Ebene */}
         {detail && <S4Detail item={detail} onClose={() => setDetail(null)} />}

         {/* Now-Playing-Balken über S1/Grid (rendert sich selbst weg bei stopped) */}
         {screen.name !== 's0' && <NowPlayingBar />}
       </>
     );
   }
   ```
2. **Herkunftsbibliothek:** Da S4 ein Overlay über dem aktuellen Grid ist und „Von
   vorne starten" das Medium abspielt, ohne zu navigieren, „merkt" sich die App die
   Herkunft implizit über den `screen.type`-State (S2 vs. S3). In M4 (wenn S5 kommt)
   wird dieser `type` als „Herkunft" an den Player weitergereicht, damit Zurück vom
   Player in die richtige Bibliothek führt. **M3 muss den `type`-State daher im
   Navigations-State halten** (oben erfüllt) — das ist die geforderte „Player merkt
   sich Herkunftsbibliothek"-Vorbereitung.
3. `App.tsx` ruft nach dem `dbError`-Check `<Root/>` statt `<Library/>` auf (T3.16).

**Caveats:**
- **S4 ist KEINE neue Navigationsebene** — es ist lokaler `detail`-State, kein
  Verlaufseintrag. Schließen setzt `detail = null`, ohne den darunterliegenden
  Grid-Screen zu verändern.
- **Max. 2 Ebenen fürs Kind**: S1 → Grid → (Player, erst M4). M3 endet bei „play
  ausgelöst + Now-Playing-Balken"; **nicht** versuchen, einen Vollbild-Player zu bauen.
- **Onboarding-Flag** wird **hier** gesetzt (nicht in S0), genau einmal beim `onDone`.
- `library:updated`-Listener im Cleanup abmelden (StrictMode).
- Filterung nach `type` passiert hier (Root), nicht im Grid — Grid bleibt rein
  präsentational.
- Tap = `player:play` **ohne** explizite Position → Resume-Verhalten kommt aus der
  Main-/MPD-Logik (M2 T2.13/T2.14: gespeicherte Position). Falls „Tap soll immer ab
  gespeicherter Position" gewünscht ist und Main das nicht automatisch tut, in M4
  präzisieren; für M3-Abnahme genügt „start/resume".

**Dateien/Artefakte:**
- Erstellt: `app/src/renderer/src/Root.tsx`
- Verändert: `app/src/renderer/src/App.tsx` (rendert `<Root/>`)

**Akzeptanzkriterien:**
- [ ] Erststart (`onboarding_seen=false`) zeigt S0; nach Ablauf/Tap S1; Flag wird
  gesetzt → nach Neustart direkt S1.
- [ ] S1 „Hörbücher" → Grid mit `type='audiobook'`; „Musik" → Grid `type='music'`.
- [ ] Grid zeigt nur Medien des gewählten Typs (gefiltert), in den zwei E17-Sektionen.
- [ ] Tap auf Kachel löst `player:play` aus (Now-Playing-Balken erscheint); **kein**
  Vollbild-Player.
- [ ] Langer Tap öffnet S4-Overlay; „Von vorne starten" spielt ab 0 + schließt.
- [ ] Zurück-Button im Grid führt zu S1.
- [ ] S4 erzeugt keinen Navigationseintrag (Schließen kehrt exakt zum Grid zurück).

---

### T3.16 — Altes `Library.tsx` entfernen + alles verdrahten + typecheck
**Größe:** M
**Abhängigkeiten:** T3.15
**Vorbedingung:** `<Root/>` und alle Screens funktionieren im Dev-Fenster.

**Ziel:** Das Wegwerf-UI aus M2 (`app/src/renderer/src/Library.tsx`) ist **entfernt**,
`App.tsx` rendert die neue Navigation, verwaiste M2-Wegwerf-CSS/-Strings sind bereinigt,
und das Projekt baut/typecheckt sauber. Ende-zu-Ende läuft der M3-Flow im Dev-Fenster
auf 800×480.

**Beschreibung:**
1. `app/src/renderer/src/App.tsx`: den `<Library/>`-Import + -Render durch `<Root/>`
   ersetzen; den `app:dbError`-Pfad **beibehalten** (Fehlerscreen):
   ```tsx
   import './App.css';
   import { useEffect, useState } from 'react';
   import { useT } from './i18n/I18nContext';
   import Root from './Root';

   export default function App(): React.JSX.Element {
     const t = useT();
     const [dbError, setDbError] = useState<string | null>(null);
     useEffect(() => window.hoermond.on('app:dbError', ({ message }) => setDbError(message)), []);
     if (dbError) {
       return (
         <div className="boot-screen">
           <p className="boot-text error-text">{t('error.db')}: {dbError}</p>
         </div>
       );
     }
     return <Root />;
   }
   ```
2. `app/src/renderer/src/Library.tsx` **löschen**.
3. `App.css` bereinigen: die M2-Wegwerf-Klassen (`.lib-item`, `.lib-section`,
   `.library-screen`, `.now-playing` aus T2.16) entfernen, sofern sie nicht mehr
   referenziert werden (`grep -rn "lib-item\|library-screen\|now-playing\b" src` →
   keine Treffer außer dem neuen `now-playing-bar`). `boot-screen`/`boot-text`/
   `error-text` behalten (für den dbError-Screen).
4. Optional: ungenutzte M2-i18n-Keys aufräumen, **nur** wenn sie nirgends mehr
   referenziert werden (vorsichtig — Now-Playing-Balken nutzt `player.*` weiter). Im
   Zweifel **belassen** (ungenutzte Keys schaden nicht).
5. Voller Check:
   ```bash
   cd /home/kmlpatrick/Privat/repos/audiobook_station/app
   npm run typecheck
   npm test            # M2-sort-Tests müssen weiter grün sein
   npm run dev         # manueller End-to-End-Durchlauf auf 800x480
   ```

**Caveats:**
- **Nicht** den `app:dbError`-Pfad entfernen — das ist der einzige Fehlerschirm.
- Vor dem Löschen von `Library.tsx` sicherstellen, dass **nichts** mehr darauf
  importiert (`grep -rn "from './Library'" src`).
- Beim CSS-Aufräumen genau prüfen, dass `now-playing-bar` (neu) nicht mit `.now-playing`
  (alt, T2.16) verwechselt/mitgelöscht wird.
- Dev-Fenster auf **800×480** prüfen (kein Responsive) — falls das Dev-Fenster anders
  skaliert, in den electron-vite/BrowserWindow-Optionen die feste Größe sicherstellen
  (aus M1 vorhanden).

**Dateien/Artefakte:**
- Gelöscht: `app/src/renderer/src/Library.tsx`
- Verändert: `app/src/renderer/src/App.tsx`, `app/src/renderer/src/App.css`

**Akzeptanzkriterien:**
- [ ] `Library.tsx` existiert nicht mehr; kein Import verweist darauf.
- [ ] `npm run typecheck` grün, `npm test` grün (M2-Tests unverändert bestehen).
- [ ] `npm run dev`: kompletter Flow S0→S1→Grid→S4→play funktioniert auf 800×480.
- [ ] Kein verwaister M2-Wegwerf-CSS/JSX; `boot-screen`/dbError-Pfad intakt.
- [ ] Keine hartcodierten Strings im neuen JSX (`grep` auf verdächtige Literale).

---

### T3.17 — Deploy auf Pi + echtes Touch-Verhalten (Tap/Long-Tap/Scroll)
**Größe:** M
**Abhängigkeiten:** T3.16
**Vorbedingung:** M3-Flow läuft auf dem Laptop; Pi aus M1/M2 bootet in die Kiosk-App;
echter 7"-Touchscreen (800×480) angeschlossen. **App-Pfad auf dem Pi:
`/home/player/hoermond/repo/app`** (NICHT `/opt/hoermond/app`).

**Ziel:** Das M3-Bundle läuft auf dem echten Gerät, und das **kapazitive Touch-
Verhalten** ist verifiziert: Tap startet/resumed, langer Tap (600 ms) öffnet S4 mit
Halte-Ring ab 300 ms, kinetisches Scrollen mit Bounce funktioniert mit echtem Finger —
nicht nur mit Maus. **Dies ist eine Geräte-Abnahme-Task (Projektregel: Abnahme am
echten Gerät).**

**Beschreibung:**
> overlayfs ist seit M1 scharf (rootfs read-only). App-Bundle liegt unter
> `/home/player/hoermond/repo/app` (rootfs) → **overlay aus → deployen → overlay an**
> (M2 T2.17). `electron-rebuild` für `better-sqlite3` nach jedem `npm install` Pflicht.
1. overlayfs deaktivieren (`sudo raspi-config` → Performance → Overlay FS → Disable →
   Reboot).
2. Auf dem Laptop bauen:
   ```bash
   cd /home/kmlpatrick/Privat/repos/audiobook_station/app && npm run build
   ```
3. Bundle auf den Pi (App-Pfad aus M1/M2):
   ```bash
   rsync -avz --delete out/ player@hoermond.local:/home/player/hoermond/repo/app/out/
   rsync -avz package.json player@hoermond.local:/home/player/hoermond/repo/app/
   ssh player@hoermond.local 'cd /home/player/hoermond/repo/app && npm install --omit=dev && npx electron-rebuild -f -w better-sqlite3'
   ```
4. App neu starten: `sudo systemctl restart mediaplayer.service`.
5. **Touch-Verhalten am echten Display** prüfen (mit dem Finger, nicht Maus):
   - **Tap** auf eine Kachel → hörbare Wiedergabe + Now-Playing-Balken erscheint.
   - **Langer Tap** (gefühlt ~0,6 s halten) → S4-Overlay öffnet; **Halte-Ring** wächst
     sichtbar ab ~0,3 s und kündigt die Schwelle an.
   - **Kurzer vs. langer Tap** sauber unterschieden (kurzer Tap öffnet **nicht** S4).
   - **Scrollen**: mit dem Finger vertikal wischen → kinetisches Momentum + Bounce am
     oberen/unteren Rand.
   - **Tap außerhalb** auf S4-Scrim schließt das Overlay; ✕ schließt ebenfalls.
   - **Press-Feedback** (Scale 0,96) erscheint sofort beim Berühren (< 100 ms gefühlt).
   - **Kein Cursor** sichtbar; keine Hover-Artefakte.
6. **Erststart-Onboarding am Gerät:** Falls schon getestet, `onboarding_seen`
   zurücksetzen, um S0 erneut zu sehen:
   ```bash
   sqlite3 /var/lib/mediaplayer/state.db "UPDATE onboarding_seen SET seen=0 WHERE id=1;"
   sudo systemctl restart mediaplayer.service
   ```
   → S0 erscheint 2,5 s, Fade zu S1; nach Neustart erscheint S0 **nicht** erneut.
7. overlayfs wieder aktivieren (`raspi-config` → Enable → Reboot).

**Caveats:**
- **`electron-rebuild` Pflicht** nach `npm install` (sonst NODE_MODULE_VERSION-
  Mismatch, App startet nicht).
- Falls **langer Tap** vs. **Scroll** kollidiert (Halten löst Long-Press aus, obwohl
  der Nutzer scrollen wollte): in T3.13b ggf. eine **Bewegungs-Toleranz** ergänzen
  (Pointer-Move > ~10 px bricht den Long-Press ab → Scroll gewinnt). Diesen Fall hier
  explizit am Gerät testen; bei Bedarf den Hook nachschärfen (zurück auf Laptop).
- Falls Press-Feedback am Gerät träge wirkt: Chromium-Compositing prüfen; `transform`/
  `filter` sind GPU-beschleunigt — meist ok.
- Backup-SD griffbereit (overlay-Risiko aus M1).

**Dateien/Artefakte:**
- Verändert (auf dem Pi): `/home/player/hoermond/repo/app/out`,
  `/home/player/hoermond/repo/app/node_modules`
- Ggf. Nachschärfung: `app/src/renderer/src/hooks/useLongPress.ts` (Bewegungs-Toleranz)

**Akzeptanzkriterien:**
- [ ] M3-Bundle läuft auf dem Pi (kein ABI-Fehler in `journalctl -u mediaplayer`).
- [ ] Tap, langer Tap (mit Halte-Ring ab ~300 ms) und kinetisches Scrollen mit Bounce
  funktionieren mit echtem Finger.
- [ ] Kurzer Tap öffnet **nicht** versehentlich S4; Scrollen löst **nicht**
  versehentlich Long-Press aus (Bewegungs-Toleranz ergänzt, falls nötig).
- [ ] S0 erscheint nur beim Erststart (nach Flag-Reset reproduzierbar), danach nie.
- [ ] Kein Cursor, keine Hover-Zustände am Gerät.

---

### T3.18 — Scroll-Performance mit ~100 echten Covern messen
**Größe:** M
**Abhängigkeiten:** T3.17
**Vorbedingung:** M3 läuft auf dem Pi; mindestens **~100 Medien** auf der echten
Bibliothek (per `media-sync` aus M2 synchronisiert), idealerweise mit echten Covern
(sobald M7 Cover liefert) bzw. mit den deterministischen Platzhaltern (T3.08).

**Ziel:** Verifizieren, dass das **kinetische Scrollen** im Grid mit **~100 Kacheln**
auf dem Pi 4 **flüssig** bleibt (subjektiv ruckelfrei, gefühlt nahe 60 fps, kein
sichtbares Stocken/Tearing). Dies adressiert das im milestones.md vermerkte
**Scroll-Performance-Spike-Risiko** und ist eine **Geräte-Abnahme** am echten Display.

**Beschreibung:**
1. Bibliothek auf ~100+ Medien bringen (vom Laptop synchronisieren, M2-Sync-Kette):
   ```bash
   time rsync -avz media-100er/ media-sync@<pi-ip>:/
   # warten bis der media-watcher (M2 T2.03) den MPD-Rescan abgeschlossen hat
   ```
2. Am Gerät in die Bibliothek (S2/S3) gehen und **mehrfach schnell durchscrollen**
   (auf- und ab, mit Schwung → Momentum + Bounce am Rand auslösen).
3. Performance subjektiv und – wenn möglich – objektiv bewerten:
   - Subjektiv: Ruckelt das Scrollen? Bleibt der Bounce weich? Verzögert sich das
     Press-Feedback beim Antippen während/nach dem Scrollen?
   - Objektiv (optional): Über DevTools-Remote (falls am Pi aktivierbar) das
     Performance-Panel/FPS-Meter beobachten, oder `chrome://gpu`-Hinweise prüfen.
4. Falls es **ruckelt**, in dieser Reihenfolge gegensteuern (Maßnahmen zurück auf dem
   Laptop umsetzen, dann neu deployen):
   - **Cover-Größe/Encoding** prüfen (echte Cover ggf. zu groß → auf 180–360 px
     vorskalieren; betrifft M7, in M3 sind es leichte Platzhalter).
   - **Virtualisiertes Rendering** des Grids einführen (nur sichtbare Reihen rendern,
     z. B. via Fenster-Slicing) — nur falls nötig, da es Komplexität bringt.
   - `will-change: transform` / `content-visibility: auto` auf Kacheln testen.
   - Box-Shadows/Filter auf Kacheln reduzieren (Compositing-Kosten).
5. Ergebnis (fps-Eindruck, Anzahl Medien, ergriffene Maßnahmen) in
   `tasks/m3-acceptance-test.md` protokollieren.

**Caveats:**
- Der **Pi 4** ist deutlich schwächer als der Laptop — Scrollen kann auf dem Laptop
  flüssig sein und am Gerät ruckeln. **Nur** die Messung am Gerät zählt (Projektregel).
- Echte Cover (M7) sind potenziell der größere Performance-Faktor als die Platzhalter
  — diese Messung mit Platzhaltern ist eine **Untergrenze**; bei M7 erneut prüfen.
- Virtualisierung erst einführen, wenn die einfache Variante nachweislich ruckelt
  (YAGNI — keine vorzeitige Komplexität).

**Dateien/Artefakte:**
- Erstellt/erweitert: `tasks/m3-acceptance-test.md` (Performance-Protokoll)
- Ggf.: `LibraryGrid.tsx`/`MediaTile.tsx`-CSS (Performance-Tuning)

**Akzeptanzkriterien:**
- [x] Mit ~100 Kacheln scrollt das Grid am Pi subjektiv flüssig (kein sichtbares
  Stocken), Bounce bleibt weich.
- [x] Press-Feedback bleibt nach dem Scrollen prompt (< 100 ms gefühlt).
- [ ] Falls Tuning nötig war: Maßnahme dokumentiert und nach Re-Deploy bestätigt.
- [ ] Ergebnis im Abnahme-Protokoll festgehalten (inkl. Medienanzahl).

---

### T3.19 — Pixel-Layout-Check am echten 800×480-Display
**Größe:** M
**Abhängigkeiten:** T3.17
**Vorbedingung:** M3 läuft am echten 7"-Display.

**Ziel:** Das feste **800×480-Layout** sitzt am echten Display **pixelgenau**: Safe-Area
20 px, Titelleiste 44 px, Grid 4×180 px mit ~13 px Lücken füllt exakt 760 px, S1-Kacheln
360×360 mit 24 px Abstand, keine abgeschnittenen Ränder, kein Überlauf, keine
verschobenen Elemente. **Geräte-Abnahme am echten Display.**

**Beschreibung:**
1. Jeden Screen am Gerät einzeln prüfen:
   - **S0:** Logo + Begrüßung zentriert, Hintergrund `--flieder-tint`, nichts
     abgeschnitten.
   - **S1:** Logo oben zentriert; zwei 360×360-Kacheln mittig mit 24 px Abstand; passt
     ohne Überlauf in 760×440 (Safe-Area).
   - **Grid (S2/S3):** Titelleiste 44 px; Zurück-Button 64×64 links; Sync-Icon-Platz
     rechts; **4 Spalten** à 180 px füllen die 760-px-Breite mit gleichmäßigen ~13-px-
     Lücken (linker/rechter Rand symmetrisch); eine angeschnittene zweite Reihe ist
     sichtbar (Scroll-Hinweis); Sektions-Header 32 px.
   - **S4:** Karte zentriert über Scrim; ✕ erreichbar; Button „Von vorne starten"
     vollständig sichtbar.
   - **Empty-State:** zentriert; Titelleiste mit Zurück + Sync-Platz bleibt.
2. **Kanten/Überlauf:** an allen vier Bildschirmrändern prüfen, dass nichts
   abgeschnitten ist (besonders die 20-px-Safe-Area). Falls das Panel einen leichten
   Overscan hat, ggf. die Safe-Area visuell gegenchecken.
3. Bei Abweichungen die festen Pixelwerte in den jeweiligen Screen-CSS justieren
   (Lücke 13 → 13,33 px via `space-between`, Safe-Area, Kachelhöhen) und neu deployen.
4. Pixel-Befund (Screen-für-Screen, Soll/Ist) in `tasks/m3-acceptance-test.md`.

**Caveats:**
- Das reale 7"-Panel kann minimal von exakt 800×480 abweichen (Overscan/Skalierung) —
  am Gerät gegenchecken, nicht nur im Laptop-Fenster (Projektregel).
- 4×180 + 3×13 = 759 px; falls am Gerät ein 1-px-Spalt rechts auffällt, auf
  `space-between` umstellen (gleichmäßige Verteilung über 760 px).
- Feste Pixel sind hier korrekt — **keine** Responsive-„Fixes" einführen.

**Dateien/Artefakte:**
- Erstellt/erweitert: `tasks/m3-acceptance-test.md` (Pixel-Layout-Protokoll)
- Ggf.: Screen-CSS-Feinjustierung

**Akzeptanzkriterien:**
- [x] Alle Screens (S0/S1/Grid/S4/Empty) sitzen ohne Überlauf/Abschneiden in 800×480.
- [x] Grid: 4 Spalten füllen 760 px mit gleichmäßigen Lücken (≥12 px), Ränder
  symmetrisch; angeschnittene zweite Reihe sichtbar.
- [x] S1: zwei 360×360-Kacheln, 24 px Abstand, mittig.
- [x] Titelleiste 44 px, Zurück-Button 64×64 links, Sync-Platz rechts.
- [ ] Befund je Screen im Abnahme-Protokoll.

---

### T3.20 — Kontrast-/Lesbarkeits-Check aus Kind-Betrachtungsdistanz
**Größe:** S
**Abhängigkeiten:** T3.17
**Vorbedingung:** M3 läuft am echten 7"-Display; das Display steht in realer
Nutzungsposition (Tisch/Kinderhand, normale Betrachtungsdistanz eines Kindes).

**Ziel:** Verifizieren, dass **Text und Bedeutungsträger** am echten Display aus der
**Betrachtungsdistanz eines Kindes** gut lesbar/erkennbar sind: Schriftgrößen
ausreichend, Kontraste eingehalten (besonders die **Flieder-nie-mit-weißem-Text**-Regel),
und die **Form-Redundanz** der Badges (Pfeil vs. Häkchen) auch ohne Farbunterscheidung
erkennbar. **Geräte-Abnahme.**

**Beschreibung:**
1. Aus normaler Kind-Distanz (Gerät auf dem Tisch, Kind davor) prüfen:
   - **Lesbarkeit:** Sind Sektions-Header (24 px), Kachel-Titel (20 px) und S0-
     Begrüßung (32 px) klar lesbar? Body nie unter 18 px (Brief-Untergrenze).
   - **Kontrast:** Heller Flieder (`--flieder`/`--flieder-tint`) **niemals** mit weißem
     Text — sicherstellen, dass alle Texte auf Flieder dunkel (`--text-on-flieder`)
     sind; weißer Text nur auf `--flieder-deep` (Restart-Button, Badges).
   - **Badge-Erkennbarkeit:** Weiterhören (Pfeil) vs. Fertig (Häkchen) **auch ohne
     Farbe** unterscheidbar (Form trägt Bedeutung — Rot-Grün-Schwäche-sicher). Test:
     Badges aus Distanz betrachten / Graustufen-Sicht simulieren.
   - **Fortschritts-Ring/-Balken** (6 px, `--flieder-deep`) ist aus Distanz als
     Fortschritt erkennbar.
2. Idealerweise ein echtes Kind aus der Zielgruppe kurz testen lassen (findet es die
   Hörbücher/Musik-Wahl, erkennt es „angefangene" Medien?).
3. Bei Lesbarkeits-/Kontrastproblemen: Schriftgröße/Gewicht oder Farbzuordnung
   anpassen (im Rahmen der Brief-Vorgaben) und neu deployen.
4. Befund in `tasks/m3-acceptance-test.md` protokollieren (inkl. optionalem Kind-Test).

**Caveats:**
- **Reflexion/Helligkeit** des echten 7"-Panels kann Kontraste verschlechtern — nur am
  Gerät verlässlich beurteilbar (Projektregel).
- Die **Flieder-mit-weißem-Text-Falle** ist der häufigste Kontrastfehler — gezielt
  jeden Flieder-Hintergrund auf die Textfarbe prüfen.
- Wenn ein Kind die Badges nur über Farbe unterscheidet, ist die Form-Redundanz nicht
  deutlich genug → Badge-Form/Größe nachschärfen.

**Dateien/Artefakte:**
- Erstellt/erweitert: `tasks/m3-acceptance-test.md` (Lesbarkeits-/Kontrast-Protokoll)
- Ggf.: Theme-/Komponenten-CSS-Anpassung

**Akzeptanzkriterien:**
- [x] Alle Texte aus Kind-Distanz lesbar; Body ≥ 18 px.
- [x] Kein heller Flieder mit weißem Text (alle Flieder-Hintergründe geprüft).
- [x] Weiterhören- (Pfeil) und Fertig-Badge (Häkchen) auch ohne Farbe unterscheidbar.
- [x] Fortschrittsbalken aus Distanz als Fortschritt erkennbar.
- [ ] Befund (inkl. optionalem Kind-Test) im Abnahme-Protokoll.

---

## M3 Abnahme-Checkliste (gegen Akzeptanzkriterien)

| AK (aus milestones.md) | Verifiziert in |
|------------------------|----------------|
| Erststart zeigt S0 für 2,5 s mit Fade-Out, dann S1; nach Neustart kein S0 (onboarding_seen) | T3.09, T3.15, T3.17 |
| S1 zeigt zwei ~360×360-Kacheln + Logo oben zentriert; Theme-Farben/Atkinson offline | T3.01, T3.02, T3.03, T3.10 |
| Grid: 4 Spalten, 180×180-Cover, Sektions-Header „Zuletzt gehört"/„Alle"; vertikal kinetisch + Bounce | T3.12, T3.13, T3.17, T3.18 |
| Begonnenes Medium in „Zuletzt gehört" mit Fortschritts-Ring UND Pfeil-Badge; bei 100 % nach „Alle" mit Häkchen | T3.12, T3.13 |
| Leere „Zuletzt gehört" → kein leerer Header | T3.13 |
| Tap startet/resumed; langer Tap (600 ms) öffnet S4 mit Halte-Ring ab 300 ms | T3.13b, T3.12, T3.15, T3.17 |
| S4 zeigt Titel/Autor/Fortschritt + „Von vorne starten"; Tap außerhalb/Schließen verlässt | T3.06, T3.11, T3.15 |
| Leere Bibliothek → E1-Empty-State (Logo + Botschaft), keine leere Fläche, keine Header | T3.13, T3.14 |
| Zurück-Affordanz konstant oben links, 64×64 px; Player merkt Herkunftsbibliothek | T3.05, T3.13, T3.15 |
| Press-Feedback < 100 ms (Scale 0,96) auf allen Kacheln/Buttons; kein Cursor, kein Hover | T3.02, T3.04, T3.17 |
| Pixelgenaues 800×480-Layout am echten Display | T3.19 |
| Lesbarkeit/Kontrast aus Kind-Distanz | T3.20 |

### Ausführungsort je Task

| Ort | Tasks |
|-----|-------|
| **Laptop** (hardwareunabhängig) | T3.01–T3.16 (inkl. T3.13b, T3.14b) |
| **Pi** (Geräte-Abnahme am echten 800×480-Touchscreen) | T3.17, T3.18, T3.19, T3.20 |

---

## Offene Annahmen & Risiken

1. **S5-Player-Lücke (wichtigste Annahme):** Der vollständige Player-Screen **S5 kommt
   erst in M4**. In M3 löst ein Kachel-Tap `player:play` aus, navigiert aber **nicht**
   zu einem Player-Screen (den gibt es nicht). **Bewusste Entscheidung:** M3 baut den
   minimalen **Now-Playing-Platzhalterbalken** (T3.14b) als Feedback — analog zum
   Wegwerf-UI M2 T2.16 — der in M4 durch S5 ersetzt wird. Falls das Projekt
   stattdessen wünscht, dass M3 **gar kein** Wiedergabe-Feedback zeigt (nur Audio
   startet), kann T3.14b entfallen; dann fehlt aber jede visuelle Bestätigung. **Bis
   zur Klärung gilt: T3.14b wird gebaut.**

2. **Tap = Resume vs. Tap = Neustart:** „Tap startet/**resumed**" — M3 ruft
   `player:play({ path })` ohne explizite Position auf und verlässt sich darauf, dass
   die Main-/MPD-Resume-Logik (M2 T2.13/T2.14) ab der gespeicherten Position
   fortsetzt. Ob `player:play` ohne `position` tatsächlich automatisch ab der
   gespeicherten Stelle resumed oder bei 0 startet, **muss am realen Backend
   verifiziert werden** (T3.17). Falls es bei 0 startet, muss Root (T3.15) die
   gespeicherte Position selbst mitgeben — das ist ein kleiner, lokal begrenzter
   Nachzug. In M4 wird Resume ohnehin präzisiert.

3. **Font-Beschaffung (T3.01):** Atkinson Hyperlegible (SIL OFL) muss als WOFF2
   manuell beschafft und ins Repo gelegt werden (Google Fonts oder Braille Institute).
   Risiko: kein separates **600**-Gewicht verfügbar → dann 600 auf 700 mappen oder
   synthetisieren (dokumentieren). Lizenz (OFL) erlaubt Bündelung; OFL.txt mitlegen.

4. **Kinetisches Scrollen + Long-Press-Konflikt:** Auf dem echten Touch kann ein
   gehaltener Finger, der eigentlich scrollen soll, fälschlich einen Long-Press (S4)
   auslösen. Gegenmaßnahme (erst bei Bedarf, T3.17): **Bewegungs-Toleranz** im
   Long-Press-Hook (Pointer-Move > ~10 px bricht Long-Press ab → Scroll gewinnt). Auf
   dem Laptop (Maus) tritt der Konflikt kaum auf — deshalb explizit am Gerät prüfen.

5. **Scroll-Performance am Pi 4 (Spike-Risiko aus milestones.md):** ~100 Kacheln
   müssen am echten Pi flüssig scrollen (T3.18). Die einfache CSS-Grid-Variante wird
   zuerst versucht; **falls** sie ruckelt, kommt Virtualisierung/Cover-Vorskalierung —
   bewusst **nicht** vorzeitig (YAGNI). Echte Cover (M7) sind potenziell schwerer als
   die M3-Platzhalter; die M3-Messung ist eine Untergrenze.

6. **`section.*` vs. `library.*` i18n-Keys (T3.07):** M2 hat bereits
   `library.recentlyPlayed`/`library.all`. M3 führt optional eigene `section.*`-Keys
   ein. **Eine** Variante konsistent wählen (Empfehlung: neue `section.*`-Keys, alte
   nach T3.16-Cleanup optional entfernen) — Doppelpflege vermeiden.

7. **Onboarding-Reset für Wiederholtests:** S0 erscheint nur bei
   `onboarding_seen=false`. Für wiederholte Geräte-Tests muss das Flag in der echten
   DB zurückgesetzt werden (`UPDATE onboarding_seen SET seen=0 WHERE id=1`) — auf dem
   Pi nur möglich, wenn `/var/lib/mediaplayer/state.db` beschreibbar (bind-mount, M1
   ADR-2). In T3.17 berücksichtigt.

8. **Bounce auf Electron/Chromium:** `-webkit-overflow-scrolling: touch` +
   `overscroll-behavior: contain` liefern Momentum/Bounce nicht auf allen
   Chromium-Versionen identisch. Falls am Gerät (T3.18) kein sichtbarer Bounce
   entsteht, ist eine kleine JS-Momentum-/Overscroll-Lösung der Fallback — zunächst
   CSS-only.
