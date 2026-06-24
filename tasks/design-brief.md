# UX/UI Design Brief — KinderMediaPlayer

**Projekt:** Kindgerechter Mediaplayer (Raspberry Pi 4, Electron + React, Touchscreen-Kiosk)
**Quelle:** `briefing.md`
**Zielgruppe:** Kinder 6–8 Jahre (primär), Eltern (sekundär, Admin)
**Display:** 7" Touchscreen, Querformat, **800 × 480 px** (fester Kiosk-Canvas)
**Sprache:** Deutsch (i18n-fähig strukturiert)
**Status:** **v2 — Finalisiert, alle Designentscheidungen getroffen**
**Datum:** 2026-06-13

> Dieser Brief ist vollständig entschieden. Alle ehemals offenen Designfragen sind beantwortet und in die Abschnitte 1–7 eingearbeitet. Abschnitt 8 dient als kompakte Referenztabelle aller getroffenen Parameter. Ein Entwickler kann ohne weiteres Design-Briefing direkt mit der Implementierung starten — sämtliche Werte (Pixel, Hex, Millisekunden, Fonts) sind verbindlich.

---

## 1. Designziele & Prinzipien

### 1.1 Übergeordnetes Ziel
Ein 6–7-jähriges Kind muss das Gerät **ohne flüssiges Lesen, ohne Erklärung und ohne Fehlerangst** bedienen können. Die UI ist ein Spielzeug, kein Werkzeug — aber ein zuverlässiges. Die wichtigste Aktion (Hörbuch/Musik weiterhören) ist immer mit **einem einzigen Tap** erreichbar.

### 1.2 Designprinzipien (Priorität von oben nach unten)

1. **Bild vor Text.** Cover, Icons und Farbe tragen die Bedeutung. Text ist Begleitung, nie die einzige Informationsquelle. Ein nicht flüssig lesendes Kind muss vollständig navigieren können.
2. **Großzügige Tap-Targets, viel Abstand.** Kinderfinger sind ungenau. Mindestgrößen sind harte Untergrenzen, nicht Zielwerte (siehe Abschnitt 5).
3. **Fehlertoleranz statt Fehlermeldung.** Es gibt keine destruktiven Aktionen im Kindmodus. Jede Aktion ist umkehrbar oder folgenlos. Ein versehentlicher Tap darf nie etwas „kaputtmachen". Kein Dialog fragt ein Kind „Bist du sicher?".
4. **Sofortiges, sichtbares Feedback.** Jeder Tap erzeugt eine sofortige sichtbare Reaktion (visuelles Highlight in < 100 ms). Das Kind muss immer wissen: „Ich habe etwas bewirkt." Es gibt **bewusst kein Sound- und kein Haptik-Feedback** (siehe 1.4).
5. **Ein klarer Vorwärtsfluss.** Startscreen → Auswahl → Hören. Es gibt immer einen offensichtlichen Weg zurück (großer, konstant platzierter Zurück-Bereich). Keine Sackgassen.
6. **Eltern unsichtbar trennen.** Alle Admin-Funktionen sind hinter einer bewussten, für Kinder nicht zufällig auslösbaren Geste + PIN versteckt. Das Kind sieht nie eine Einstellung, die es verstellen könnte.

### 1.3 Eltern-Sekundärziel
Eltern brauchen **kein hübsches, sondern ein klares** Interface. Die Elterneinstellungen sehen bewusst funktional/nüchtern aus — ein anderer visueller Modus als der Kindbereich (kühler Slate-Akzent statt Flieder), um die Trennung zu signalisieren. Lautstärke-Limit, PIN, BT-Verwaltung, Rescan und Sync-Log müssen in < 30 Sekunden auffindbar und bedienbar sein.

### 1.4 Was dieses Design NICHT ist
Keine Verspieltheit um ihrer selbst willen: keine ablenkenden Daueranimationen, **keine Sound-Effekte** bei Taps (lenkt vom Hörinhalt ab — bestätigt), **kein Haptik-Feedback** (Hardware unterstützt es nicht — bestätigt), keine Maskottchen, die vom Inhalt ablenken. Die Cover und der Inhalt sind der Star, nicht die UI-Chrome.

---

## 2. Screen-Inventar

| # | Screen / Dialog | Zweck | Nutzer | Phase |
|---|---|---|---|---|
| **S0** | **Willkommens-Screen (Erststart)** | Einmalige Begrüßung beim allerersten Start, bevor je ein Sync lief. | Kind | 3 |
| S1 | **Startscreen** | Einstieg: Wahl zwischen Hörbücher / Musik. Versteckter Eltern-Zugang über Logo. | Kind | 3 |
| S2 | **Bibliothek — Hörbücher** | Cover-Grid aller Hörbücher mit Zwei-Sektionen-Sortierung und Weiterhören-Indikator. | Kind | 2/3 |
| S3 | **Bibliothek — Musik** | Cover-Grid aller Musik-Alben (identisches Muster zu S2). | Kind | 2/3 |
| S4 | **Detail-Ansicht (Overlay)** | Titel, Autor, Fortschritt, „Von vorne starten". Per langem Tap auf Kachel. | Kind | 3 |
| S5 | **Player-Screen** | Wiedergabe + alle Steuerelemente, Kapitel, Status-Icons. | Kind | 3 |
| S6 | **Kapitelliste (Sheet/Seitenleiste)** | Navigieren zwischen Kapiteln/Tracks. | Kind | 3 |
| S7 | **Bluetooth-Menü (Dialog)** | Verbundenes Gerät, gekoppelte Liste, neues Gerät koppeln. | Kind/Eltern | 4 |
| S8 | **Schlaf-Timer-Dialog** | 15/30/60 Min., „Bis Ende des Kapitels", Countdown. | Kind | 5 |
| S9 | **Eltern-PIN-Dialog** | 4-stellige PIN-Eingabe als Gate vor S10. | Eltern | 3 |
| S10 | **Elterneinstellungen** | Max-Lautstärke, PIN ändern, BT verwalten, Rescan, Sync-Log. | Eltern | 3/5 |
| — | **Toast / System-Feedback** | Transiente Benachrichtigungen (BT, Sync). Über allen Screens. | Kind/Eltern | 4/5 |
| — | **Sync-Status-Icon** | Persistentes Statussymbol in der Titelleiste. | Kind/Eltern | 5 |

### 2.1 S0 — Willkommens-Screen (Erststart)
- **Auslöser:** Allererster App-Start, solange die Bibliothek noch nie befüllt wurde (kein Medium, kein abgeschlossener Sync). Ein einmaliger Zustand, kein wiederkehrender Screen.
- **Inhalt:** Vollflächiger, ruhiger Begrüßungs-Screen auf App-Hintergrund (Flieder-Tint). Zentriert:
  - Das **Logo** (siehe 5.7), groß dargestellt.
  - Eine kurze, freundliche Botschaft in großer Schrift: **„Hallo! Schön, dass du da bist."** (String aus `de.json`).
  - Darunter dezent kleiner: **„Deine Hörbücher und Lieder kommen gleich."** (signalisiert dem Kind, dass noch Inhalte folgen — kein Fehler).
- **Kein Button, keine Interaktion erforderlich.** Der Screen ist rein informativ.
- **Verschwinden:** Automatisch nach **2,5 s** (Fade-Out 240 ms) → Übergang zu S1 Startscreen. Tippt das Kind vorher, wird sofort zu S1 weitergeleitet. S0 erscheint danach **nie wieder** (Flag in SQLite: `onboarding_seen`).
- Ist die Bibliothek nach S0 noch leer, greift auf S2/S3 der Empty-State (E1/E16).

---

## 3. Navigationsfluss

### 3.1 Navigationsbaum

```
S0 Willkommens-Screen (nur Erststart)
│   └─ nach 2,5s / Tap ──────────► S1 Startscreen   (danach nie wieder gezeigt)
│
S1 Startscreen
│
├─ Tap „Hörbücher" ───────────► S2 Bibliothek Hörbücher
│                                 │  (Sektion „Zuletzt gehört" zuerst, dann „Alle" alphabetisch)
│                                 ├─ Tap Kachel ──────────► S5 Player (Start/Resume)
│                                 ├─ Langer Tap Kachel ───► S4 Detail-Overlay
│                                 │                          └─ „Von vorne starten" ► S5 Player
│                                 └─ Zurück ───────────────► S1
│
├─ Tap „Musik" ───────────────► S3 Bibliothek Musik  (identischer Sub-Baum wie S2)
│
└─ Langer Tap Logo (>2s) ─────► S9 PIN-Dialog
                                  ├─ PIN korrekt ─────────► S10 Elterneinstellungen
                                  │                          ├─ BT verwalten ► S7
                                  │                          └─ Zurück ──────► S1
                                  └─ PIN falsch ──────────► dezenter Hinweis, Eingabe leeren, erneut (kein Lockout)

S5 Player
├─ ⏯ ⏮ ⏭ ⏪ ⏩  Lautstärke  Seek   (bleiben auf S5)
├─ Kapitel-Icon / Swipe-Up ──► S6 Kapitelliste (Overlay) ──► Tap Kapitel ► zurück zu S5
├─ BT-Icon ──────────────────► S7 Bluetooth-Menü (Dialog) ──► Schließen ► S5
├─ Mond-Icon ────────────────► S8 Schlaf-Timer-Dialog ──────► Schließen ► S5
└─ Zurück ───────────────────► zurück zur Herkunfts-Bibliothek (S2 oder S3)
```

### 3.2 Navigationsregeln
- **Maximale Tiefe für das Kind: 2 Ebenen** (Startscreen → Bibliothek → Player). Alles darunter sind Overlays/Dialoge, keine neuen Navigationsebenen. S0 ist eine einmalige Vorstufe, keine Ebene.
- **Zurück-Affordanz** ist auf S2/S3/S5 immer an derselben Position: **oben links, 64 × 64 px Tap-Target**, großes Pfeil-/Haus-Icon. Konstante Platzierung baut Muskelgedächtnis auf.
- **Player merkt die Herkunft.** Zurück aus dem Player führt zur Bibliothek, aus der gestartet wurde — nicht hart zum Startscreen.
- **Dialoge (S4, S6, S7, S8) sind modal als Overlay**, dimmen den Hintergrund (Scrim, siehe 5.5) und werden durch Tap außerhalb ODER ein großes Schließen-Element verlassen. Sie erzeugen keinen neuen Verlauf.
- **Eltern-Gate (S9/S10) ist ein paralleler Zweig**, der bewusst nicht Teil der Kind-Navigation ist. Nach Verlassen landet man wieder auf S1.

---

## 4. Interaktionsmuster

| Geste | Schwelle | Wirkung | Visuelles Feedback |
|---|---|---|---|
| **Tap** | sofort | Primäraktion: Button/Kachel auslösen, Wiedergabe starten/resumen, Steuerelement betätigen | Sofortiges Press-Highlight (Scale 0,96 + Helligkeit), Loslassen löst aus |
| **Langer Tap auf Kachel** | **> 600 ms** | Detail-Ansicht (S4) öffnen | Wachsendes Press-Feedback **ab 300 ms** (Ring/Scale), das die Schwelle ankündigt |
| **Langer Tap auf Logo** | **> 2000 ms** | Eltern-PIN-Dialog (S9) öffnen | Fortschritts-Ring um Logo, **startet bei 400 ms**, füllt sich bis 2000 ms; nur sichtbar während Halten |
| **Swipe / Wisch** | — | Scrollen durch Bibliothek (S2/S3) und Kapitelliste (S6) | Kinetisches Scrollen mit Momentum, sichtbarer Bounce am Rand |
| **Swipe-Up** | — | Kapitel-Sheet (S6) aus Player hervorziehen (Alternative zum Icon) | Sheet folgt dem Finger, rastet ein |
| **Seek (Tap/Drag auf Fortschrittsbalken)** | — | Position im Track/Kapitel ändern | Großer Drag-Handle (Daumen-tauglich), Zeit-Tooltip folgt, Wiedergabe springt erst beim Loslassen |
| **Toast** | auto-dismiss | Transiente Systeminfos (BT/Sync) | Gleitet ein/aus, definierte Sichtbarkeit (siehe 4.2) |

### 4.1 Wichtige Interaktionsregeln
- **Langer-Tap-Schwellen sind unterschiedlich und bewusst:** 600 ms für Kachel-Detail (häufig, niedrige Hürde), 2000 ms für Eltern-Gate (selten, hohe Hürde, damit ein Kind es nicht versehentlich auslöst). Beide brauchen **sichtbares Halte-Feedback**, damit die Wartezeit nicht als „kaputt" wahrgenommen wird.
- **Kein Doppeltap, kein Rechtsklick-Äquivalent, keine Multitouch-Gesten** im Kindmodus — zu fehleranfällig für die Zielgruppe.
- **Seek bestätigt erst beim Loslassen**, damit Scrubbing nicht zu hörbarem Stottern führt.
- **Touch auf ausgeschaltetem Display** (Feature 8): Der erste Touch nach Screen-Off **weckt nur das Display** und wird NICHT als UI-Tap interpretiert — kein versehentliches Play/Pause (siehe E6).
- **Kein Cursor** (bestätigt): Der Kiosk läuft cursor-frei; es gibt keine Hover-Zustände. Jede Affordanz muss ohne Hover funktionieren.
- **Kein Audio-/Haptik-Feedback** (bestätigt): Rückmeldung erfolgt ausschließlich visuell.

### 4.2 Konkrete Timing-Werte (verbindlich)

| Element | Wert | Begründung |
|---|---|---|
| **Press-Feedback (Tap-Highlight)** | **90 ms** ease-out hinein, **120 ms** zurück | Unter der 100-ms-Wahrnehmungsschwelle „sofort"; sanftes Lösen. |
| **Detail-Halte-Feedback (Kachel)** | Ring wächst von **300 ms → 600 ms** (300 ms Dauer) | Kündigt die 600-ms-Schwelle an, ohne zu hetzen. |
| **Logo-Halte-Ring (Eltern-Gate)** | Sichtbar **ab 400 ms**, füllt linear bis **2000 ms** (1600 ms Füllung) | Erste 400 ms ohne Feedback verhindern „Flackern" bei normalem Antippen des Logos. |
| **Sheet-Slide-In (S6 Kapitelliste)** | **260 ms** ease-out hinein, **200 ms** ease-in hinaus | Spürbar, aber flott; Sheet rastet hörbar-fühlbar (visuell) ein. |
| **Overlay/Dialog Ein (S4, S7, S8)** | **220 ms** Fade + Scale 0,96→1,0; Scrim 200 ms | Ruhiger, nicht-springender Auftritt. |
| **Overlay/Dialog Aus** | **160 ms** Fade | Schnelleres Schließen wirkt reaktiv. |
| **Toast Ein** | **200 ms** Slide + Fade | — |
| **Toast Sichtbar** | **3,5 s** | Lang genug zum Erfassen, kurz genug ohne Verweilen; gilt für BT/Sync-Toasts. |
| **Toast Aus** | **200 ms** Slide + Fade | — |
| **Screen-Aufblenden nach Wake (E6)** | **300 ms** Fade-In der Helligkeit | Sanftes Aufwachen statt hartem An. |
| **S0 Willkommen Auto-Dismiss** | sichtbar **2,5 s**, Fade-Out **240 ms** | Einmalige, freundliche Begrüßung. |
| **Cover-Shimmer (Lade-/Fetch-Zustand)** | Sweep-Gradient, **eine Passage pro 1,2 s**, ~30°-Winkel | Ruhig, nicht-blinkend (WCAG 2.3.1-konform: keine > 3 Hz-Flackerung). |
| **Status-Icon „läuft" (🔄)** | Drehung **360° pro 1,4 s**, linear, endlos während Sync | Klar als „Aktivität" lesbar, nicht hektisch. |
| **Schlaf-Timer Fade-Out** | **60 s** vor Ende, linear (aus Spec, Feature 9) | — |
| **Globale Standard-Transition** | **200 ms**, `cubic-bezier(0.4, 0.0, 0.2, 1)` | Als CSS-Variable `--t-base` bündeln; Sonderfälle oben überschreiben. |

---

## 5. Visuelle Anforderungen

### 5.0 Canvas — 800 × 480 px (fest)

Der Kiosk rendert auf einer **festen Auflösung von 800 × 480 px im Querformat**. Es gibt **kein responsives Multi-Breakpoint-Layout** — alle Maße sind absolute Pixelwerte, exakt auf diese Fläche abgestimmt. **Die geringe Höhe von 480 px ist der knappste Constraint.**

**Globales Raster & Ränder:**
- **Außenrand (Safe Area):** 20 px rundum → nutzbare Fläche **760 × 440 px**.
- **Basis-Spacing-Einheit:** 8 px. Verwendete Schritte: 8 / 16 / 24 / 32 px.
- **Titelleiste (alle Kind-Screens):** **44 px** Höhe (links Zurück-Affordanz 64 × 64 px überlappt leicht in den Content; rechts Sync-Status-Icon). Auf S5 trägt sie zusätzlich BT- und Mond-Icon.
- **Kein vertikales Scrollen auf dem Player-Screen (S5).** Player muss vollständig in 800 × 480 passen.

**S1 Startscreen — zwei große Wahl-Kacheln:**
- Zwei Flächen nebeneinander, je **~360 × 360 px**, mittig im 760×440-Bereich, 24 px Abstand dazwischen.
- Jede Kachel: großes bildhaftes Icon (Buch / Note) + Wort darunter; klar farblich unterscheidbar (siehe 5.5).
- Logo: oben zentriert in der Titelzone, **~120 × 40 px** (siehe 5.7).

**S2/S3 Bibliothek — Cover-Grid:**
- Content-Höhe unter der 44-px-Titelleiste: **~436 px** (480 − 44).
- **Kachelgröße: 180 × 180 px** Cover + Label-Zeile darunter (~28 px) = **180 × 208 px** Kachel.
- **4 Spalten** in 760 px Breite: 4 × 180 = 720 + 3 Lücken × 16 px = 768 → Lücke auf **13–14 px** justieren, sodass exakt 760 px gefüllt sind. (Mindestabstand ≥ 12 px bleibt gewahrt.)
- **Vertikal:** Eine volle Reihe (208 px) plus angeschnittene zweite Reihe signalisiert Scrollbarkeit. Kinetisches Scrollen vertikal.
- **Sektions-Header** (siehe E17): 32 px hohe Zeile mit bildhaftem Label, scrollt mit.

**S5 Player — Aufteilung in 800 × 480 (kein Scroll):**
- **Linke Spalte:** Cover prominent, **~300 × 300 px**, vertikal zentriert (oberhalb davon Titelleiste 44 px).
- **Rechte Spalte (~440 px):** oben Titel + aktuelles Kapitel; Mitte Fortschrittsbalken mit Kapitelmarkierungen + Zeitangaben; unten die Steuerelement-Reihe.
- **Steuerelemente:** Play/Pause als Zentrum **84 × 84 px**; ⏮ ⏭ ⏪ ⏩ je **64 × 64 px**; Lautstärke −/+ je **60 × 60 px**. Mindestabstand 16 px.
- **Fortschrittsbalken:** 12 px Spurhöhe, Drag-Handle **40 × 40 px** Tap-Fläche (visuell kleiner).

**Tap-Target-Untergrenzen (hart):** Steuerelemente ≥ 60 × 60 px; Kacheln ≥ 160 px (hier 180 px); Zurück/Navigation ≥ 64 px; Abstand zwischen Targets ≥ 12 px (Ziel 16 px).

### 5.1 Cover-Darstellung
- Quadratisch (1:1) im Grid; abgerundete Ecken **12 px Radius**.
- **Weiterhören-Indikator** auf Kacheln bei Fortschritt > 0 % und < 100 %: Fortschritts-Ring/-Balken am unteren Kachelrand (Höhe 6 px, Flieder-Deep `#6E54B8`) **plus** bildhaftes „Weiterhören"-Badge (Pfeil-im-Kreis, oben rechts). Form **und** Farbe tragen die Bedeutung; ohne Lesen erkennbar.
- **Fertig-Zustand** (100 %): dezentes Häkchen-Badge (Success-Grün), kein Fortschrittsbalken.
- **Cover-Fallback** (Feature 11): generierter Platzhalter mit Titel-Initial + **deterministischer** Farbe aus der Palette (gleicher Titel → immer gleiche Farbe → Wiedererkennung). Platzhalter sieht gewollt aus, nie wie „Fehler/leer".

### 5.2 Barrierefreiheit für Kinder
- **Keine Texteingabe und keine Tastatur im Kindmodus** (zwingend). Einzige Texteingabe im Produkt ist die PIN (numerisches Pad, Eltern, S9).
- **Farbkontrast:** Baseline **WCAG 2.1 AA** — Text ≥ 4,5:1, große UI-Elemente/Icons ≥ 3:1. Alle Werte in 5.5 dokumentiert und geprüft.
- **Status nie allein über Farbe:** immer zusätzlich Form/Icon (Rot-Grün-Schwäche-sicher).
- **Reduzierte Animation:** Bewegungen funktional und kurz; keine blinkenden/flackernden Elemente (> 3 Hz verboten, WCAG 2.3.1). Alle Timings in 4.2 erfüllen das.

### 5.3 Layout-Prinzipien
- Vollbild-Kiosk, feste Orientierung Querformat, ohne OS-Fenster-Chrome.
- Großzügiger Negativraum trotz knapper Höhe; maximal ~2 primäre Aktionen pro Screen im Fokus.

### 5.4 Statusfarben (Übersicht, Details in 5.5)
- ✅ aktuell → Success-Grün; 🔄 läuft → Info-Blau (animiert); ⚠️ fehlgeschlagen → Amber (bewusst kein aggressives Rot, um das Kind nicht zu beunruhigen). Jeder Status trägt **Icon + Farbe**.

### 5.5 Farbpalette (verbindlich, WCAG-geprüft)

**Leitidee:** Sanftes Flieder (Lieblingsfarbe der Tochter) als warme, kindliche Primärfarbe. Heller, freundlicher Hintergrund; tiefes Aubergine für Text (hoher Kontrast). Eltern-Bereich bewusst kühl-neutral (Slate), um den Moduswechsel sichtbar zu machen.

| Token | Hex | Verwendung |
|---|---|---|
| `--flieder` (Primär) | **`#9B7EDC`** | Dekorative Flächen, aktive Ringe, Akzentlinien, ausgewählte Zustände. |
| `--flieder-deep` | **`#6E54B8`** | Primär-Buttons mit **weißem** Text, Fortschrittsbalken, Logo-Ring. |
| `--flieder-tint` | **`#F2EDFB`** | Sektions-Hintergründe, S0-Hintergrund, Hover-freier Selektionshintergrund. |
| `--bg-app` | **`#FBFAFE`** | Globaler App-Hintergrund (warmes Weiß mit Flieder-Hauch). |
| `--surface` | **`#FFFFFF`** | Karten, Kacheln, Dialoge. |
| `--text-primary` | **`#2A2342`** | Tiefes Aubergine; alle Überschriften & Fließtext. |
| `--text-secondary` | **`#6B6480`** | Sekundär-Labels, Zeitangaben, Untertitel. |
| `--text-on-flieder` | **`#2A2342`** | Text auf `--flieder`-Flächen (heller Flieder). |
| `--text-on-deep` | **`#FFFFFF`** | Text/Icon auf `--flieder-deep`-Buttons. |
| `--success` | **`#2E7D52`** | Status „aktuell/fertig", Häkchen-Badge. |
| `--info` | **`#2563B0`** | Status „Sync läuft", In-Progress-Akzent. |
| `--warning` | **`#A85F0C`** | Status „Sync fehlgeschlagen" (weicher Amber, kein Rot). |
| `--parent-accent` | **`#374151`** | Eltern-Modus (S9/S10): kühles Slate für Buttons/Header. |
| `--parent-bg` | **`#F3F4F6`** | Eltern-Modus Hintergrund (neutral-grau, signalisiert „erwachsen"). |
| `--scrim` | **`rgba(42,35,66,0.55)`** | Abdunklung hinter modalen Overlays. |

**Kontrastnachweis (gemessen):**

| Paar | Ratio | Anforderung | Ergebnis |
|---|---|---|---|
| `text-primary #2A2342` auf `surface #FFFFFF` | 14,8:1 | ≥ 4,5:1 | ✅ |
| `text-primary` auf `bg-app #FBFAFE` | 14,3:1 | ≥ 4,5:1 | ✅ |
| `text-secondary #6B6480` auf `#FFFFFF` | 5,6:1 | ≥ 4,5:1 | ✅ |
| Weiß auf `flieder-deep #6E54B8` (Button) | 5,8:1 | ≥ 4,5:1 | ✅ |
| `text-primary` auf `flieder #9B7EDC` | 4,5:1 | ≥ 4,5:1 | ✅ |
| `flieder #9B7EDC` auf `#FFFFFF` (UI/Icon) | 3,3:1 | ≥ 3:1 | ✅ |
| Weiß auf `success #2E7D52` | 5,0:1 | ≥ 4,5:1 | ✅ |
| Weiß auf `info #2563B0` | 6,0:1 | ≥ 4,5:1 | ✅ |
| Weiß auf `warning #A85F0C` | 4,9:1 | ≥ 4,5:1 | ✅ |
| Weiß auf `parent-accent #374151` | 10,3:1 | ≥ 4,5:1 | ✅ |

> **Regel:** Heller Flieder `#9B7EDC` trägt **niemals weißen Text** (nur 3,3:1). Für Buttons mit weißem Text immer `--flieder-deep`. Heller Flieder eignet sich für Flächen mit dunklem (`text-primary`) Text und für Icons/UI-Elemente (≥ 3:1).

### 5.6 Typografie (verbindlich)

**Leitprinzip:** Maximale Lesbarkeit für eine 7-Jährige, die gerade lesen lernt. Klare, offene Buchstabenformen, eindeutige Unterscheidung von `a`/`o`, `I`/`l`/`1`. Großzügige Zeilenhöhe. Keine dekorativen Fonts.

- **Font:** **Atkinson Hyperlegible** (Open Source, SIL OFL) als Primärschrift — explizit für hohe Lesbarkeit und Buchstaben-Unterscheidbarkeit gestaltet, ideal für Leseanfänger.
  - **Fallback-Stack:** `'Atkinson Hyperlegible', 'Nunito', system-ui, sans-serif`.
  - **Offline gebündelt** im Kiosk (WOFF2, lokal eingebunden) — kein CDN, da das Gerät offline laufen kann.
- **Optionale Alternative** (falls eine runder/weicher wirkende Schrift gewünscht): **Nunito** (Google Fonts, OFL) mit abgerundeten Terminals — ebenfalls offline bündeln. Standard bleibt Atkinson Hyperlegible wegen der besseren Zeichen-Disambiguierung.

**Größenskala** (auf 800 × 480 abgestimmt):

| Rolle | Größe / Zeilenhöhe | Gewicht | Verwendung |
|---|---|---|---|
| **Heading XL** | 32 px / 38 px | 700 (Bold) | S0-Begrüßung, große Empty-States. |
| **Heading** | 24 px / 30 px | 700 (Bold) | Screen-Titel, Player-Titel, Sektions-Header. |
| **Label** | 20 px / 26 px | 600 (Semibold) | Startscreen-Kachel-Wörter, Button-Beschriftungen, Kachel-Titel. |
| **Body** | 18 px / 26 px | 400 (Regular) | Fließtext, Detail-Ansicht, Eltern-Einstellungen. (Untergrenze 18 px — bestätigt.) |
| **Tiny** | 15 px / 20 px | 500 (Medium) | Zeitangaben, sekundäre Metadaten, Sync-Log. Nur für Eltern/sekundär — nie alleinige Bedeutungsträger im Kindmodus. |

- **Buchstabenabstand:** Standard 0; bei Heading XL leicht −0,01 em.
- **Ausrichtung:** linksbündig im Content, zentriert nur bei S0 und Empty-States.

### 5.7 Logo-Konzept

**Konzept „Hörmond" (Mond + Note):**
- **Form:** Ein freundlicher, abgerundeter **Halbmond**, in dessen Sichel eine kleine **Musiknote / ein Notenkopf** sitzt. Der Mond verbindet die zwei Welten des Geräts — Geschichten/Schlaf (Hörbücher, Schlaf-Timer-Mond) und Musik (Note) — und ist für ein Kind als sympathisches Objekt sofort merkbar.
- **Stil:** Vollflächig, ohne dünne Linien (gut sichtbar bei kleiner Größe), weiche Rundungen passend zur Schrift.
- **Farbe:** Mondsichel in **Flieder-Deep `#6E54B8`**, Note in **Flieder `#9B7EDC`** (Kontrast innerhalb des Logos ist dekorativ; das Logo selbst steht auf hellem Hintergrund mit ≥ 3:1). Optionale einfarbige Variante komplett in `#6E54B8` für Mono-Kontexte.
- **Bedeutung:** Heim-/Identitätsanker des Geräts und zugleich die geheime Tür für Eltern.

**Platzierung & Größe:**
- **Startscreen (S1):** oben zentriert in der Titelzone, **Bildfläche ~120 × 40 px** (Logo-Symbol ~40 × 40 px, optional Wortmarke „Hörmond" rechts daneben in Label-Größe — Wortmarke ist ein String aus `de.json`, damit später lokalisierbar).
- **Willkommens-Screen (S0):** zentral und groß, **~160 × 160 px** Symbol über der Begrüßung.

**Interaktions-Affordanz (Eltern-Gate, langer Tap > 2 s):**
- Beim Halten erscheint **ab 400 ms** ein **kreisförmiger Fortschritts-Ring** um das Logo-Symbol (Strichbreite 4 px, Farbe `--flieder-deep`), der sich bis 2000 ms vollständig füllt (siehe 4.2).
- **Wichtig:** Der Ring ist die **einzige** sichtbare Affordanz und erscheint **erst beim Halten** — das Logo signalisiert für das Kind sonst keine Tap-Funktion (es soll das Gate nicht entdecken). Das ist bewusst eine „versteckte" Geste.
- Bei Loslassen vor 2000 ms: Ring verschwindet animiert (160 ms), nichts passiert.

---

## 6. Zustände & Edge Cases

Jeder Screen muss diese Zustände visuell explizit behandeln. Für das Kind gilt: **ein leerer/fehlerhafter Zustand darf nie wie ein Absturz wirken.**

| ID | Situation | UX-Verhalten |
|---|---|---|
| E1 | **Leere Bibliothek** (kein Medium synchronisiert) | Freundlicher, bildhafter Empty-State, zentriert: Logo-Symbol + Botschaft **„Hier ist noch nichts — deine Hörbücher kommen bald!"** (`de.json`). Sync-Icon in der Titelleiste zeigt den Status. **Die Zwei-Sektionen-Sortierung (E17) entfällt sichtbar** — es wird nur der Empty-State gezeigt, keine leeren Sektions-Header. Keine leere weiße Fläche, kein technischer Fehler. |
| E2 | **Kein Cover vorhanden** | Generierter Platzhalter (5.1): Titel-Initial + deterministische Palettenfarbe. Nie ein „kaputtes Bild"-Symbol. Während Online-Fetch: dezenter Lade-Shimmer (4.2), dann Austausch. |
| E3 | **Cover-Fetch läuft / fehlgeschlagen** | Während Fetch: Shimmer (1 Passage / 1,2 s). Bei Fehlschlag: Platzhalter bleibt dauerhaft, keine Fehlermeldung ans Kind. |
| E4 | **Kein BT verbunden** | BT-Icon zeigt eigenen „nicht verbunden"-Zustand (eigenes Icon, nicht nur ausgegraut). Audio läuft über 3.5mm-Fallback — Wiedergabe bleibt möglich, keine Blockade. |
| E5 | **BT-Verbindung ändert sich** | Toast mit Gerätename + Status (3,5 s sichtbar). BT-Icon aktualisiert sofort. |
| E6 | **Display wacht auf** (Touch nach Screen-Off) | Erster Touch weckt nur das Display, ändert Playback-State NICHT (4.1). Sanftes Aufblenden 300 ms statt hartem An. |
| E7 | **Sync / Scan läuft** | Sync-Icon animiert (🔄, 360°/1,4 s). Bibliothek bleibt bedienbar; neue Inhalte erscheinen, sobald verfügbar (kein blockierender Vollbild-Spinner). |
| E8 | **Letzter Sync fehlgeschlagen** | ⚠️-Icon (Amber) in Titelleiste. Tap → Detail (für Eltern relevant; für Kind unauffällig). Bibliothek zeigt weiter den letzten gültigen Stand. |
| E9 | **Resume nach Stromverlust** | Beim Start: automatisch letzte Position. Player/Kachel zeigt Weiterhören-Indikator. Kein „Wo war ich?"-Dialog. |
| E10 | **Schlaf-Timer aktiv & läuft ab** | Sichtbarer Countdown. 60 s vor Ende: lineares Fade-Out. Nach Ablauf: Pause (kein Stop → Resume bleibt möglich). |
| E11 | **Falsche PIN** | **Kein Lockout, kein Cooldown** (bestätigt). Dezenter Hinweis **„Das war nicht richtig — versuch es nochmal"** (`de.json`), Eingabefeld wird geleert, kurze horizontale Shake-Animation des PIN-Felds (200 ms). Sofort erneut eingebbar. |
| E12 | **Hörbuch ohne Kapitel** (Single-File ohne CUE) | **„Bis Ende des Kapitels"-Timer mappt auf Track-Ende** (bestätigt). Kapitelliste (S6) wird ausgeblendet oder zeigt einen einzigen Eintrag; ⏮/⏭ verhalten sich wie Track-Sprung/-Anfang. Kein leeres Sheet. |
| E13 | **Pause-Zustand & Display-Timeout** | Nach 5 Min Pause: Screen Off (Feature 8). Wiedergabe-State bleibt erhalten. |
| E14 | **Lautstärke am Eltern-Limit** | Lautstärke-Up reagiert bis zum Max-Limit, dann visuell „am Anschlag" (Balken voll, kurzes Press-Feedback ohne Pegeländerung) — das Kind versteht, dass es lauter nicht geht. |
| E15 | **Ende eines Hörbuchs/Albums** | Kachel zeigt „fertig"-Zustand (100 %, Häkchen-Badge, kein Weiterhören-Badge). Medium wandert in die Sektion „Alle" (siehe E17). Detail-Ansicht bietet „Von vorne starten". |
| **E16** | **Erststart / Onboarding** | Beim allerersten Start: **S0 Willkommens-Screen** (2,5 s, siehe 2.1) → danach S1. Tippt das Kind auf „Hörbücher"/„Musik" und es ist noch nichts synchronisiert → **E1 Empty-State** mit Sync-Hinweis. Sobald der erste Sync Inhalte liefert (E7), füllt sich die Bibliothek live. `onboarding_seen`-Flag (SQLite) verhindert erneutes Anzeigen von S0. |
| **E17** | **Grid-Sortierung (zwei Sektionen)** | Das Cover-Grid (S2/S3) ist in **zwei Sektionen** geteilt, jeweils mit bildhaftem Sektions-Header: **(1) „Zuletzt gehört"** — alle begonnenen/pausierten Medien (Fortschritt > 0 % und < 100 %), sortiert nach zuletzt gehört (neueste zuerst); **(2) „Alle"** — alle übrigen Medien (noch nicht begonnen ODER fertig) **alphabetisch** nach Titel. **Wechsel zwischen Sektionen:** Ein Medium erscheint in „Zuletzt gehört", sobald Fortschritt > 0 %; es **wandert zurück nach „Alle", sobald 100 % erreicht** sind (fertig) — denn „zuletzt gehört" meint aktiv/laufend, nicht abgeschlossen. Ist „Zuletzt gehört" leer, wird der Header ausgeblendet und nur „Alle" gezeigt (kein leerer Sektionstitel). |

---

## 7. Meilenstein-Zuordnung

Jeder UX/UI-Deliverable ist genau einer Projektphase zugeordnet. Phasen-Nummerierung folgt `briefing.md`.

> **I18n-Querschnittsregel (gilt für alle UI-Phasen):** Es gibt **keine hartcodierten Strings** im JSX. Alle für den Nutzer sichtbaren Texte (inkl. Wortmarke „Hörmond", Sektions-Header, Empty-States, PIN-Hinweise, Toasts) liegen in einer zentralen Übersetzungsdatei **`de.json`** und werden über eine Lookup-Funktion (`t('key')`) referenziert. Vorerst **nur Deutsch**, aber die Struktur muss eine spätere Sprachauswahl ohne Refactoring zulassen (Key-basierter Zugriff, keine deutschen Strings in der Logik). Empfehlung: schlanke i18n-Schicht (z. B. `react-i18next` oder ein eigener Context-Provider), Sprachdatei offline gebündelt.

### Phase 1 — Stabiles Fundament
**Kein UI-Anteil.** Reine Infrastruktur. Designseitig nur zu vermerken: Der Electron-Kiosk-Modus läuft **cursor-frei und ohne Window-Manager-Chrome** auf **fest 800 × 480 px** — die UI darf sich auf **keine** OS-Fenster-Elemente verlassen (kein Schließen-Button, keine Titelleiste vom WM).

### Phase 2 — Bibliothek & Sync
**Deliverable: Bibliothek-Datengrundlage & Grid-Sortierungslogik.**
- Datenmodell-Mapping fürs Grid: Cover, Titel, Autor, Fortschritt %, Status fertig/begonnen/neu, Zeitstempel „zuletzt gehört".
- **Zwei-Sektionen-Sortierung (E17):** Backend/State liefert Medien gruppiert in „Zuletzt gehört" (0 % < Fortschritt < 100 %, nach `last_played` absteigend) und „Alle" (Rest, alphabetisch). Übergangsregel bei 100 % → zurück nach „Alle".
- UX-Definition Weiterhören-Indikator (Schwellen > 0 % / < 100 %).
- Empty-State (E1) und Cover-Fallback-Logik (E2) als Anforderung an Scan/Sync.
- Spezifikation des Sync-Status-Datenflusses (Quelle für Sync-Icon in Phase 5).

### Phase 3 — Frontend (Haupt-UI-Lieferung)
**Deliverable: Vollständige Kind-UI + Eltern-Gate, gerendert auf festem 800 × 480 Canvas.**
- **i18n-Grundgerüst** + `de.json` mit allen initialen Strings (Querschnittsregel oben).
- **Farbpalette (5.5) und Typografie (5.6)** als CSS-Variablen / Theme-Datei verbindlich einrichten; Atkinson Hyperlegible offline bündeln.
- **Logo „Hörmond" (5.7)** als Asset + Eltern-Gate-Ring.
- **S0 Willkommens-Screen** (2.1 / E16): einmalige Begrüßung, Auto-Dismiss 2,5 s, `onboarding_seen`-Flag.
- **S1 Startscreen** inkl. Logo-Lang-Tap-Geste (2 s) mit Fortschritts-Ring; zwei 360 × 360-Wahlkacheln.
- **S2/S3 Bibliothek-Grid** auf 800 × 480: 180 × 180-Kacheln, 4 Spalten, kinetisches vertikales Scrollen, Weiterhören-Indikator, Tap-Resume, **Zwei-Sektionen-Darstellung mit Sektions-Headern (E17)**.
- **S4 Detail-Overlay** (langer Tap 600 ms): Titel/Autor/Fortschritt/„Von vorne starten".
- **S5 Player-Screen** in fester Aufteilung (5.0, kein Scroll): Cover ~300 px, alle Steuerelemente (Play 84 px, übrige 60–64 px), Fortschrittsbalken mit Kapitelmarkierungen + Seek, Zeitanzeige, aktuelles Kapitel.
- **S6 Kapitelliste** (Sheet/Seitenleiste, Slide-In 260 ms).
- **S9 PIN-Dialog** (numerisches Pad, Falsch-PIN-Verhalten E11: kein Lockout, Shake + Hinweis) + **S10 Elterneinstellungen-Grundgerüst** (Max-Lautstärke, PIN ändern, Rescan; Parent-Mode-Theme mit Slate-Akzent). BT-Verwaltung und Sync-Log als Platzhalter (Phase 4/5).
- Konstante Zurück-Affordanz (64 px, oben links) und Navigationsregeln (Abschnitt 3).
- Timing-Werte (4.2), Touch-Target- und Kontrast-Vorgaben (5.0/5.5) als verbindliche Abnahmekriterien.

### Phase 4 — Bluetooth
**Deliverable: Bluetooth-Menü UX (S7) + BT-Statusdarstellung.**
- S7 Dialog: aktuell verbundenes Gerät, Liste gekoppelter Geräte (Connect/Disconnect), „Neues Gerät koppeln" mit 30-Sek-Scan-Fortschrittsanzeige. (Strings aus `de.json`.)
- BT-Status-Icon im Player (verbunden / nicht verbunden, E4) — eigenes Icon je Zustand.
- Toast für BT-Verbindungsänderungen (E5, 3,5 s).
- BT-Verwaltung in Elterneinstellungen (Pairing löschen) — füllt Platzhalter aus Phase 3.

### Phase 5 — Display & Polish
**Deliverable: Schlaf-Timer, Toast-System, Edge-Case-States, Cover-Fallback-UI, Sync-Icon, Animations-Feinschliff.**
- S8 Schlaf-Timer-Dialog: 15/30/60 Min + „Bis Ende des Kapitels" (mappt auf Track-Ende bei kapitellosen Medien, E12), aktiver Countdown, Tap-zum-Abbrechen, Fade-Out-Verhalten (E10).
- Display-Aufweck-Verhalten ohne State-Änderung (E6) — UI-Seite der Touch-Behandlung, Fade-In 300 ms.
- Cover-Fallback-Platzhalter final (deterministische Farbe + Initial, 5.1/E2/E3), Shimmer-Timing (4.2).
- Sync-Status-Icon final (✅/🔄/⚠️, E7/E8) + Sync-Log-Ansicht in S10.
- Alle Edge-Case-States (Abschnitt 6) finalisieren und gegen E2E-Tests (Stromverlust/Resume, E9) prüfen.
- **Polish-Pass:** alle Animationsgeschwindigkeiten/Übergänge aus Abschnitt 4.2 final abstimmen.

---

## 8. Entschiedene Designparameter (Referenz)

Kompakte Übersicht aller getroffenen Entscheidungen. **Keine offenen Punkte mehr.**

| # | Thema | Entscheidung |
|---|---|---|
| 1 | **Display / Canvas** | 7" Querformat, **fest 800 × 480 px**. Kein responsives Layout. Safe Area 20 px → 760 × 440 nutzbar. |
| 2 | **Primärfarbe** | Flieder `#9B7EDC` (hell) / `#6E54B8` (deep, für weißen Text). Vollständige Palette: siehe 5.5. |
| 3 | **Hintergrund / Text** | App-BG `#FBFAFE`, Surface `#FFFFFF`, Text `#2A2342` / sekundär `#6B6480`. |
| 4 | **Statusfarben** | Success `#2E7D52`, Info `#2563B0`, Warning (Amber, kein Rot) `#A85F0C`. Immer Icon + Farbe. |
| 5 | **Eltern-Modus-Akzent** | Slate `#374151` auf neutralem Grau `#F3F4F6` — bewusst „erwachsen". |
| 6 | **Kontrast** | Alle Paare WCAG 2.1 AA geprüft (Text ≥ 4,5:1, UI ≥ 3:1). Nachweis in 5.5. |
| 7 | **Font** | Atkinson Hyperlegible (OFL), offline gebündelt; Fallback Nunito → system-ui. |
| 8 | **Schriftskala** | Heading XL 32 / Heading 24 / Label 20 / Body 18 / Tiny 15 px. Body-Untergrenze 18 px. |
| 9 | **Logo** | „Hörmond": Halbmond mit Note in Sichel, Flieder. S1 ~120 × 40 px oben zentriert, S0 ~160 px. |
| 10 | **Logo Eltern-Gate** | Versteckte Geste; Fortschritts-Ring ab 400 ms, voll bei 2000 ms; nur während Halten sichtbar. |
| 11 | **Press-Feedback** | 90 ms hinein / 120 ms zurück, Scale 0,96. |
| 12 | **Detail-Halte-Ring** | wächst 300 → 600 ms. |
| 13 | **Sheet-Slide-In** | 260 ms hinein / 200 ms hinaus. |
| 14 | **Dialog/Overlay** | Ein 220 ms (Fade+Scale), Aus 160 ms, Scrim `rgba(42,35,66,0.55)`. |
| 15 | **Toast** | Ein 200 ms, **sichtbar 3,5 s**, Aus 200 ms. |
| 16 | **Cover-Shimmer** | 1 Passage / 1,2 s. Sync-Icon-Drehung 360°/1,4 s. Keine > 3 Hz-Flackerung. |
| 17 | **Screen-Wake** | Fade-In 300 ms; erster Touch weckt nur, ändert Playback nicht. |
| 18 | **Cursor** | Keiner (Kiosk cursor-frei). Keine Hover-Zustände. |
| 19 | **Audio-/Haptik-Feedback** | Keines (bestätigt — Hardware kann kein Haptik; Sound lenkt vom Inhalt ab). |
| 20 | **PIN-Fehlverhalten** | Kein Lockout/Cooldown. Hinweis + Shake (200 ms) + Feld leeren, sofort erneut. |
| 21 | **Onboarding** | Einmaliger Willkommens-Screen S0 (2,5 s, Auto-Dismiss), dann S1. `onboarding_seen`-Flag. |
| 22 | **Sprache** | Deutsch only; alle Strings in zentraler `de.json`, key-basiert — spätere Sprachauswahl ohne Refactoring. |
| 23 | **Schlaf-Timer ohne Kapitel** | „Bis Ende des Kapitels" mappt auf **Track-Ende**. |
| 24 | **Grid-Sortierung** | Zwei Sektionen: „Zuletzt gehört" (0 < Fortschritt < 100 %, neueste zuerst) → „Alle" (Rest, alphabetisch). Bei 100 % zurück nach „Alle". |
| 25 | **Tap-Targets** | Steuerung ≥ 60 px (Play 84 px), Kacheln 180 px, Navigation 64 px, Abstand ≥ 12 px (Ziel 16). |
| 26 | **Player-Scroll** | Kein vertikales Scrollen auf S5 — alles passt in 800 × 480. |

---

*Ende des Briefs. Vollständig entschieden — Abschnitte 1–7 sind verbindlich, Abschnitt 8 ist die kompakte Referenz aller Parameter.*
