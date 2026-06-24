# KinderMediaPlayer („Hörmond") — Meilensteinplan

**Projekt:** Raspberry Pi 4 Touchscreen-Mediaplayer für ein Kind (6–8 Jahre)
**Quellen:** `briefing.md` (Spezifikation), `design-brief.md` v2 (UX/UI, finalisiert)
**Canvas:** fest 800 × 480 px, Querformat, Kiosk (cursor-frei, kein WM)
**Erstellt:** 2026-06-13

---

## Leitprinzipien dieses Plans

1. **Jeder Meilenstein liefert eine lauffähige, anfassbare Version.** Mit Ausnahme des reinen Bootstrap-Anteils in M1 endet jeder Meilenstein mit etwas, das auf dem Gerät sichtbar ist und manuell demonstriert werden kann.
2. **Vertikale Schnitte statt horizontaler Schichten.** Statt „erst alles Backend, dann alles Frontend" liefert jeder Meilenstein eine durchgängige, dünne Funktionsscheibe (Daten → State → UI → Gerät).
3. **Schnittstellen zuerst.** Der Vertrag zwischen Electron-Renderer (React) und Electron-Main / Systemdiensten (MPD, SQLite, BlueZ, DPMS) wird in M1 definiert und bleibt über alle Meilensteine stabil.
4. **Die Spec-Phasen 1–5 bleiben die fachliche Basis**, werden hier aber so geschnitten, dass früh sichtbarer Fortschritt entsteht (z. B. ein „dünner UI-Durchstich" bereits in M2, statt das komplette Frontend in einem Block in Phase 3).

### Architektur-Grundvertrag (gilt ab M1, stabil über alle Meilensteine)

- **Prozessmodell:** Electron-Main-Prozess kapselt alle privilegierten/seitenwirksamen Operationen (MPD-Steuerung via `mpc`/MPD-Protokoll, SQLite-Zugriff, BlueZ/D-Bus, DPMS, Sync-Log). Der Renderer (React) ist **rein**, hält keinen Gerätezustand und ruft nur über eine typisierte IPC-Bridge (`contextBridge`, `contextIsolation: true`, kein `nodeIntegration` im Renderer).
- **IPC-Vertrag** als zentrales TypeScript-Interface (`ipc-contract.ts`): Commands (Renderer→Main, z. B. `player.play`, `library.list`, `bt.scan`) und Events (Main→Renderer, z. B. `player.state`, `sync.status`, `bt.connection`). Dieses Interface ist das Haupt-Reviewartefakt von M1.
- **Single Source of Truth Wiedergabe:** MPD ist autoritativ für Player-Zustand. SQLite ist autoritativ für Fortschritt/Settings/Onboarding. Der Renderer spiegelt nur.
- **Event-getrieben, kein Polling** für Player-/Display-Status (`mpc idle`), entsprechend Spec Feature 8.
- **i18n-Querschnittsregel ab erster UI:** keine hartcodierten Strings im JSX; alles über `t('key')` aus `de.json` (Design-Brief §7).

---

## Meilenstein-Übersicht

| ID | Titel | Spec-Phase | Liefert sichtbar | Abhängig von |
|----|-------|-----------|------------------|--------------|
| **M1** | Stabiles Fundament + UI-Lebenszeichen | 1 | Kiosk bootet, fester Canvas, „Hello"-React-Screen | — |
| **M2** | Medien hörbar machen (Sync + Backend + Durchstich-Player) | 2 (+ Player-Kern aus 3) | Synchronisierte Datei spielt per Tap, Resume nach Neustart | M1 |
| **M3** | Kinder-Bibliothek (Startscreen, Grid, Detail) | 3 | S0/S1/S2/S3/S4 — Kind navigiert per Cover bis zum Player | M2 |
| **M4** | Vollständiger Player + Kapitel | 3 (+ Feature 5/6) | S5/S6 — komplette Wiedergabesteuerung, Kapitelnavigation | M3 |
| **M5** | Eltern-Gate & Einstellungen | 3 (+ Feature 10) | S9/S10 — PIN-Gate, Max-Lautstärke, Rescan | M3 (Player-Limit aus M4) |
| **M6** | Bluetooth-Audio | 4 | S7 — Geräte koppeln/verbinden, BT-Status, Toast | M2 (Sink), M4 (Icon-Platz), M5 (Verwaltung) |
| **M7** | Display-Management, Schlaf-Timer & Polish | 5 | S8, Display-Sleep/Wake, Sync-Icon, Cover-Fallback, E2E | M4, M5, M6 |

T-Shirt-Größen je Task-Gruppe: **S** ≈ 0,5 Tag · **M** ≈ 1–2 Tage · **L** ≈ 3 Tage · **XL** > 3 Tage (Spike/Aufteilung prüfen).

---

## M1 — Stabiles Fundament + UI-Lebenszeichen

**Spec-Phase 1.** Einziger Meilenstein mit überwiegend Infrastruktur — aber bewusst **mit minimalem UI-Durchstich**, damit das Ergebnis demonstrierbar ist und der Kiosk-Pfad früh validiert wird.

### Was am Ende läuft / demonstrierbar ist
Der Pi bootet aus dem Kaltstart ohne Tastatur/Maus direkt in eine Electron-Kiosk-App auf fest 800 × 480 px, cursor-frei, ohne WM-Chrome. Sichtbar ist ein statischer React-Screen mit Logo-Platzhalter und dem Text „Hörmond startet" (aus `de.json`). Ein hartes Ausschalten (Stecker ziehen) beschädigt das System nicht — nach Reboot kommt derselbe Screen.

### Akzeptanzkriterien (manuell testbar)
- [ ] Pi bootet aus Kaltstart ohne angeschlossene Tastatur/Maus in < 60 s in die Kiosk-App.
- [ ] Kein Mauszeiger sichtbar, keine Fenster-Titelleiste, kein Desktop, kein TTY-Login-Prompt sichtbar.
- [ ] Renderfläche ist exakt 800 × 480 px, randlos.
- [ ] `mpc status` auf dem Gerät liefert eine Antwort (MPD läuft, kennt die `/mnt/hoermond`-Bibliothek, ggf. leer).
- [ ] `/mnt/hoermond` ist eine separate `ext4`-Partition (`noatime,nodiratime`), per `mount` verifizierbar; Root ist read-only (`touch /test` auf `/` schlägt fehl, `/mnt/hoermond` und `/var/lib/mediaplayer` sind schreibbar).
- [ ] Stecker-Ziehen während laufender App und anschließender Reboot: System bootet sauber in dieselbe App (mind. 5× wiederholt ohne fsck-Fehler/Korruption).
- [ ] Electron crasht → Systemd startet die App automatisch neu (per `kill` des Renderer-Prozesses testbar).

### Entwickler-Tasks

**System**
- OS-Image: Raspberry Pi OS Lite, Autologin für `player`-User, minimaler X11-Start ohne Window Manager, Cursor unterdrückt (`unclutter`/`-nocursor`). **(M)**
- Partitionierung: separate `/mnt/hoermond` ext4 (`noatime,nodiratime`); `/var/lib/mediaplayer` als beschreibbarer Pfad für SQLite. **(M)**
- overlayfs / read-only rootfs konfigurieren; schreibbare Bereiche (Logs, State-DB, Cover-Cache) explizit ausnehmen. **(L)**
- Systemd-Units: `mpd.service` (autostart, Bibliothek auf `/mnt/hoermond`), `mediaplayer.service` (X11 + Electron `--kiosk --no-sandbox`, `Restart=always`). **(M)**
- MPD-Grundkonfiguration (`/etc/mpd.conf`): Musikverzeichnis `/mnt/hoermond`, ALSA-Sink (BT folgt in M6). **(S)**

**Backend / App-Gerüst (Electron-Main)**
- Electron-Projekt mit `contextIsolation`, ohne `nodeIntegration`; Preload-Bridge-Skelett. **(M)**
- **IPC-Vertrag `ipc-contract.ts`** definieren (Commands/Events, siehe Architektur-Grundvertrag) — als Stub-Implementierung, die später gefüllt wird. **(M)** ← *zentrales Review-Artefakt*
- SQLite-Anbindung initialisieren mit `PRAGMA journal_mode=WAL`; leeres Schema-Migrationsgerüst (Tabellen folgen in M2). **(S)**

**Frontend**
- React-Bootstrap im Renderer; ein statischer Screen 800 × 480 mit Logo-Platzhalter + Text. **(S)**
- i18n-Schicht initialisieren (`t('key')`, `de.json` mit erstem String). **(S)**

### UX/UI-Deliverables (Design-Brief §7, Phase 1)
- **Kein eigenständiger UI-Anteil laut Brief.** Festzuhalten/zu verifizieren: Kiosk läuft cursor-frei, ohne WM-Chrome, auf fest 800 × 480; die UI verlässt sich auf **keinerlei** OS-Fensterelemente. Diese Constraints werden hier als Plattform-Abnahmekriterien etabliert.

### Technische Risiken & Spikes
- **overlayfs + Schreibpfade:** Höchstes Risiko des Meilensteins. SQLite-WAL und Cover-Cache müssen verlässlich auf der beschreibbaren Partition liegen, sonst gehen Fortschritte verloren oder die DB korrumpiert. **Spike empfohlen:** read-only-rootfs früh aufsetzen und Stromverlust-Test sofort durchführen, bevor darauf aufgebaut wird.
- **X11/Electron-GPU auf Pi 4:** Mögliche Renderprobleme im Kiosk (GL/Compositing). Früh am echten 7"-Display testen, nicht nur im Desktop-Emulator.
- **Boot-Zeit:** 60 s-Ziel kann mit Electron knapp werden; ggf. Splash-Optimierung.

---

## M2 — Medien hörbar machen (Sync + Backend + Durchstich-Player)

**Spec-Phase 2 plus den minimal nötigen Player-Kern aus Phase 3.** Dieser Meilenstein macht das Gerät erstmals *nützlich*: Medien landen per Sync auf dem Pi und lassen sich abspielen. Bewusst ein vertikaler Durchstich (Provisorisches UI), kein finales Frontend.

### Was am Ende läuft / demonstrierbar ist
Von einem anderen Rechner aus `rsync` über SSH (`media-sync`-User) befüllt `/mnt/hoermond`. Der inotify-Watcher löst einen MPD-Rescan aus. Auf dem Touchscreen erscheint eine **provisorische Liste** der erkannten Medien (Text genügt — noch kein Cover-Grid). Tap auf einen Eintrag startet die Wiedergabe über die 3,5-mm-Klinke. Wiedergabeposition wird alle 10 s gespeichert; nach Stecker-Ziehen und Reboot läuft das Medium an der gespeicherten Stelle weiter.

### Akzeptanzkriterien (manuell testbar)
- [ ] `rsync -avz --partial media/ media-sync@<pi-ip>:/mnt/hoermond/` überträgt Dateien; `media-sync` ist auf `/mnt/hoermond` per chroot beschränkt und hat **keine** Shell/kein Passwort (nur Key-Auth).
- [ ] Nach abgeschlossenem Sync erscheint neuer Inhalt automatisch (inotify → MPD-Rescan), ohne manuellen Eingriff, innerhalb < 30 s.
- [ ] Provisorische Liste auf dem Display zeigt Hörbücher (`audiobooks/`) und Musik (`music/`) getrennt.
- [ ] Tap auf einen Eintrag startet hörbare Wiedergabe über Klinke.
- [ ] Während der Wiedergabe wird die Position alle 10 s in SQLite geschrieben (in DB verifizierbar).
- [ ] Stecker ziehen mitten in der Wiedergabe → Reboot → dasselbe Medium spielt automatisch ab der zuletzt gespeicherten Position weiter (Toleranz ≤ 10 s).
- [ ] Manueller Rescan-Befehl (IPC-Command) findet neu hinzugefügte Medien.

### Entwickler-Tasks

**System**
- SSH-User `media-sync`: Key-Auth-only, `ChrootDirectory` auf `/mnt/hoermond`, kein interaktiver Login (`ForceCommand internal-sftp`/rsync-restriction). **(M)**
- `media-watcher.service`: inotify auf `/mnt/hoermond`, debounced Trigger eines MPD-Rescans nach Sync-Abschluss; jeder Vorgang schreibt einen Eintrag ins Sync-Log. **(M)**
- Verzeichnis-/Rechtekonzept `audiobooks/` und `music/` festlegen. **(S)**

**Backend (Electron-Main)**
- MPD-Anbindung: Verbindung, `play/pause/stop/seek`, Statusabfrage, **`mpc idle`-Event-Loop** als Quelle für `player.state`-Events (Grundstein für M4 & M7). **(L)**
- SQLite-Schema: `tracks`/`media` (Pfad, Typ, Titel, Autor, Dauer), `playback_position` (Medium, Position, `last_played`), `settings`, `onboarding_seen`. **(M)**
- Positions-Persistenz: alle 10 s aktuelle Position des aktiven Mediums schreiben (WAL). **(M)**
- Resume-Logik beim App-Start: letzte Position laden, Medium für Auto-Resume vorbereiten. **(M)**
- Bibliotheks-Datengrundlage: MPD-Bibliothek + SQLite zu einer `library.list`-Antwort zusammenführen (Felder für späteres Grid: Cover-Pfad, Titel, Autor, Fortschritt %, Status, `last_played`). **(M)**
- **Grid-Sortierungslogik (E17)** als reine, getestete Funktion im Main-Prozess: zwei Sektionen „Zuletzt gehört" (0 % < Fortschritt < 100 %, `last_played` absteigend) und „Alle" (Rest, alphabetisch); 100 % → zurück nach „Alle". **(M)**
- beets-Konfiguration für Metadaten-Anreicherung beim Scan (Cover-Fetch erst in M7 final). **(M)**

**Frontend**
- Provisorische Trefferliste (Text) über `library.list`; Tap → `player.play`. **(S)** — *Wegwerf-UI, wird in M3 ersetzt.*

### UX/UI-Deliverables (Design-Brief §7, Phase 2)
- **Bibliothek-Datengrundlage & Grid-Sortierungslogik (E17)** — als Backend-/State-Vertrag, noch ohne finale UI: Datenmodell-Mapping (Cover, Titel, Autor, Fortschritt %, Status, `last_played`), Zwei-Sektionen-Gruppierung, Weiterhören-Schwellen (> 0 % / < 100 %).
- **Anforderung** an Scan/Sync für Empty-State (E1) und Cover-Fallback (E2): Datenfelder vorsehen, sodass M3/M7 sie nur noch darstellen.
- Spezifikation des **Sync-Status-Datenflusses** (Quelle für das Sync-Icon in M7): Sync-Events + Log werden bereits hier erzeugt.

### Technische Risiken & Spikes
- **chroot + rsync-Restriction:** Sicherheitskritisch (offene Angriffsfläche). chroot-Verzeichnis-Ownership (root) und Mount-Layout müssen exakt stimmen, sonst funktioniert SFTP/rsync nicht oder die Beschränkung greift nicht. **Sicherheits-Review verpflichtend.**
- **inotify-Debouncing:** Großer rsync-Lauf feuert viele Events; ungedrosselt löst das Rescan-Stürme aus. Debounce + „Sync-abgeschlossen"-Heuristik nötig.
- **Resume-Genauigkeit bei M4B/CUE:** Positionsmodell muss Track *und* Offset speichern, damit Kapitel-Medien korrekt resumen (greift in M4). Datenmodell hier schon zukunftssicher anlegen.
- **`mpc idle`-Stabilität:** Reconnect-Logik bei MPD-Neustart einplanen, sonst „taube" UI.

---

## M3 — Kinder-Bibliothek (Startscreen, Grid, Detail)

**Spec-Phase 3, erster Frontend-Block.** Ersetzt das Wegwerf-UI durch die echte, kindgerechte Navigation bis zum (noch einfachen) Player.

### Was am Ende läuft / demonstrierbar ist
Beim allerersten Start erscheint S0 (Willkommen, 2,5 s Auto-Dismiss), danach nie wieder. S1 zeigt zwei große Wahlkacheln (Hörbücher/Musik) mit Logo. Tap führt ins echte Cover-Grid (S2/S3) mit 180 × 180-Kacheln, 4 Spalten, kinetischem Scrollen, Zwei-Sektionen-Sortierung und Weiterhören-Indikator. Tap auf eine Kachel startet/resumed die Wiedergabe; langer Tap (600 ms) öffnet das Detail-Overlay (S4) mit „Von vorne starten". Leere Bibliothek zeigt den freundlichen Empty-State (E1).

### Akzeptanzkriterien (manuell testbar)
- [ ] Erststart zeigt S0 für 2,5 s mit Fade-Out, dann S1; nach Neustart erscheint S0 **nicht** erneut (`onboarding_seen` gesetzt).
- [ ] S1 zeigt zwei ~360 × 360-Kacheln + Logo oben zentriert; Farben/Font entsprechen Theme (Flieder, Atkinson Hyperlegible, offline geladen).
- [ ] Grid zeigt 4 Spalten, 180 × 180-Cover, Sektions-Header „Zuletzt gehört" / „Alle"; vertikales kinetisches Scrollen mit Bounce.
- [ ] Begonnenes Medium (0 % < Fortschritt < 100 %) erscheint in „Zuletzt gehört" mit Fortschritts-Ring **und** Pfeil-Badge; bei 100 % wandert es nach „Alle" mit Häkchen-Badge.
- [ ] Ist „Zuletzt gehört" leer, fehlt der Header (kein leerer Sektionstitel).
- [ ] Tap auf Kachel startet/resumed Wiedergabe; langer Tap (600 ms) öffnet S4 mit Halte-Ring-Feedback ab 300 ms.
- [ ] S4 zeigt Titel/Autor/Fortschritt + „Von vorne starten"; Tap außerhalb oder Schließen-Element verlässt das Overlay.
- [ ] Leere Bibliothek zeigt E1-Empty-State (Logo + freundliche Botschaft), keine leere weiße Fläche, keine Sektions-Header.
- [ ] Zurück-Affordanz konstant oben links, 64 × 64 px; Player merkt sich Herkunftsbibliothek.
- [ ] Press-Feedback < 100 ms (Scale 0,96) auf allen Kacheln/Buttons; kein Cursor, keine Hover-Zustände.

### Entwickler-Tasks

**Frontend**
- **Theme-Fundament:** Farbpalette (§5.5) + Typografie (§5.6) als CSS-Variablen/Theme; Atkinson Hyperlegible WOFF2 offline bündeln; globale Transition `--t-base`. **(M)**
- **Logo „Hörmond"** als Asset (inkl. Eltern-Gate-Ring-Vorbereitung, Ring-Logik selbst in M5). **(S)**
- **S0 Willkommens-Screen** (2,5 s Auto-Dismiss, Fade 240 ms, `onboarding_seen` via IPC). **(S)**
- **S1 Startscreen** mit zwei 360 × 360-Wahlkacheln + Logo. **(M)**
- **S2/S3 Bibliothek-Grid:** 180 × 180-Kacheln, 4 Spalten, kinetisches vertikales Scrollen, Sektions-Header, Weiterhören-Indikator (Ring 6 px + Badge), Fertig-Häkchen, Cover-Platzhalter-Hook. **(L)**
- **S4 Detail-Overlay** (langer Tap 600 ms, Halte-Feedback ab 300 ms): Titel/Autor/Fortschritt/„Von vorne starten". **(M)**
- **Empty-State E1** + Lade-/Cover-Platzhalter-Komponente (deterministische Farbe + Initial; finaler Online-Fetch in M7). **(M)**
- Konstante **Zurück-Navigation** (64 px) + Navigationsregeln §3 (Player merkt Herkunft); Press-Feedback-Primitive (90/120 ms, Scale 0,96). **(M)**
- `de.json` um alle Strings dieses Blocks erweitern. **(S)**

**Backend (Electron-Main)**
- `library.list` final an Renderer ausliefern inkl. Sektionsgruppierung (nutzt M2-Logik); `onboarding`-Get/Set; „Von vorne starten" (Position 0) Command. **(M)**

### UX/UI-Deliverables (Design-Brief §7, Phase 3 — Teil 1)
- i18n-Grundgerüst + `de.json` (Strings dieses Blocks).
- Farbpalette (§5.5) und Typografie (§5.6) als verbindliches Theme; Atkinson Hyperlegible offline.
- Logo „Hörmond" (§5.7) als Asset.
- S0 (§2.1/E16), S1 (zwei Wahlkacheln, Logo), S2/S3 (Grid mit Zwei-Sektionen-Darstellung E17, Weiterhören-Indikator, Tap-Resume), S4 (Detail).
- Konstante Zurück-Affordanz (64 px) und Navigationsregeln (§3).
- Timing-/Touch-Target-/Kontrast-Vorgaben als Abnahmekriterien (§4.2, §5.0, §5.5).

### Technische Risiken & Spikes
- **Performance des Grids auf Pi 4:** Viele 180 × 180-Cover + kinetisches Scrollen können auf der GPU ruckeln. Virtualisiertes/recyceltes Rendering und vorab skalierte Thumbnails einplanen. **Spike:** Scroll-Performance mit ~100 Covern messen.
- **Touch-Gesten ohne Cursor:** Langer-Tap-Schwelle (600 ms) vs. Scroll-Beginn sauber trennen, damit Scrollen nicht versehentlich das Detail-Overlay öffnet.
- **Pixel-genaues Layout 800 × 480:** 480 px Höhe ist der härteste Constraint; Grid-Lücken exakt auf 13–14 px justieren (Brief §5.0).

---

## M4 — Vollständiger Player + Kapitel

**Spec-Phase 3 (Player) + Features 5 & 6.** Macht aus dem Durchstich-Player die vollwertige, kindgerechte Wiedergabesteuerung mit Kapiteln.

### Was am Ende läuft / demonstrierbar ist
Der Player-Screen (S5) zeigt Cover (~300 px), Titel, aktuelles Kapitel, Fortschrittsbalken mit Kapitelmarkierungen und Seek sowie alle Steuerelemente (Play/Pause 84 px, ⏮ ⏭ ⏪ 15 s ⏩ 30 s, Lautstärke). Über Swipe-Up oder Icon öffnet sich die Kapitelliste (S6). M4B-Kapitel, MP3-Ordner-Kapitel und CUE-Fallback werden korrekt navigiert; kapitellose Medien verhalten sich sinnvoll (E12). Kein vertikales Scrollen auf S5.

### Akzeptanzkriterien (manuell testbar)
- [ ] S5 passt vollständig in 800 × 480 ohne Scrollen; Cover links ~300 px, Steuerung rechts.
- [ ] Play/Pause-Button ist 84 × 84 px, übrige Steuerelemente 60–64 px, Abstand ≥ 16 px.
- [ ] ⏪ springt exakt 15 s zurück, ⏩ 30 s vor; ⏮/⏭ wechseln Kapitel/Track.
- [ ] Fortschrittsbalken zeigt bei Hörbüchern Kapitelmarkierungen; Seek per Drag springt **erst beim Loslassen** (kein Stottern beim Scrubben); Zeit-Tooltip folgt dem Handle.
- [ ] Aktuelle Zeit + Gesamtzeit werden angezeigt und aktualisieren live.
- [ ] M4B: native Kapitel werden gelistet und sind navigierbar; MP3-Ordner: Dateien = Kapitel in korrekter Reihenfolge; CUE-Single-File: Kapitel aus CUE.
- [ ] S6 Kapitelliste öffnet via Swipe-Up und via Icon (Slide-In 260 ms), markiert das aktuelle Kapitel; Tap springt dorthin und schließt das Sheet.
- [ ] Kapitelloses Medium (E12): S6 zeigt einen Eintrag oder ist ausgeblendet; ⏮/⏭ = Track-Sprung/-Anfang; kein leeres Sheet.
- [ ] Lautstärke −/+ ändert hörbar die Lautstärke (Eltern-Limit folgt in M5).
- [ ] Wiedergabe-Status (play/pause) im UI folgt MPD-Events in Echtzeit (auch bei externer Änderung via `mpc`).

### Entwickler-Tasks

**Backend (Electron-Main)**
- **Kapitel-Abstraktion:** einheitliches Kapitelmodell aus M4B (native), MP3-Ordner (Dateiliste) und CUE-Sheet (Single-File) erzeugen; Kapitelgrenzen + Offsets liefern. **(L)**
- Seek-Commands (relativ ±15/30 s, absolut), Kapitelnavigation (`chapter.next/prev/goto`), Lautstärke-Command; Positions-/Kapitelstatus in `player.state`-Events ergänzen. **(M)**
- Resume verfeinern: Track + Offset für Kapitel-Medien (nutzt M2-Datenmodell). **(M)**

**Frontend**
- **S5 Player-Screen** in fester Aufteilung (§5.0, kein Scroll): Cover ~300 px, Titel + aktuelles Kapitel, Steuerelement-Reihe (Play 84 px, übrige 60–64 px). **(L)**
- **Fortschrittsbalken** mit Kapitelmarkierungen + Drag-Handle (40 × 40 Tap-Fläche), Seek-on-release, Zeit-Tooltip, Zeitanzeigen. **(M)**
- **S6 Kapitelliste** als Swipe-Up-Sheet (Slide-In 260 ms / Aus 200 ms), aktuelles Kapitel hervorgehoben; E12-Verhalten. **(M)**
- Player-Icons-Leiste (BT-/Mond-Icon als Platzhalter für M6/M7) in der Titelzone vorsehen. **(S)**
- `de.json` erweitern. **(S)**

### UX/UI-Deliverables (Design-Brief §7, Phase 3 — Teil 2)
- S5 Player-Screen in fester Aufteilung (§5.0): Cover ~300 px, alle Steuerelemente (Play 84 px, übrige 60–64 px), Fortschrittsbalken mit Kapitelmarkierungen + Seek, Zeitanzeige, aktuelles Kapitel.
- S6 Kapitelliste (Sheet, Slide-In 260 ms).
- Touch-Target-Untergrenzen und Seek-on-release-Regel (§4.1, §5.0) als Abnahmekriterien.

### Technische Risiken & Spikes
- **Heterogene Kapitelquellen:** Größtes inhaltliches Risiko. M4B-Kapitel, MP3-Ordner und CUE verhalten sich in MPD unterschiedlich (MPD behandelt M4B-Kapitel ggf. nicht nativ als Tracks). **Spike verpflichtend:** mit echten Beispieldateien aller drei Typen verifizieren, ob MPD Kapitelgrenzen liefert oder ob clientseitiges Offset-Seeking nötig ist.
- **Seek-Präzision:** Seek + Fade (M7) müssen auf Offset-Ebene exakt sein, sonst springt Resume daneben.
- **Layout-Enge auf 480 px:** Player + Kapitelmarkierungen + Zeitangaben gleichzeitig auf wenig Höhe — frühes Pixel-Mockup gegen reale Schriftgrößen prüfen.

---

## M5 — Eltern-Gate & Einstellungen

**Spec-Phase 3 (Elternsperre) + Feature 10.** Trennt Kind- und Elternbereich sauber und liefert die ersten administrierbaren Einstellungen. Parallel zu M4 möglich (beide hängen nur an M3); das Lautstärke-Limit greift in die in M4 gebaute Lautstärkesteuerung ein.

### Was am Ende läuft / demonstrierbar ist
Langer Tap (2 s) auf das Logo öffnet — mit Fortschritts-Ring ab 400 ms — den PIN-Dialog (S9). Korrekte PIN führt in die Elterneinstellungen (S10, Slate-Theme): maximale Lautstärke, PIN ändern, manueller Rescan. Falsche PIN zeigt Shake + Hinweis ohne Lockout. BT-Verwaltung und Sync-Log sind als Platzhalter sichtbar (gefüllt in M6/M7). Das Kind kann die Geste praktisch nicht zufällig auslösen.

### Akzeptanzkriterien (manuell testbar)
- [ ] Langer Tap auf Logo: Fortschritts-Ring erscheint ab 400 ms, füllt bis 2000 ms; Loslassen davor → nichts passiert, Ring verschwindet (160 ms).
- [ ] Bei 2000 ms öffnet S9 PIN-Dialog (numerisches Pad, keine Tastatur).
- [ ] Korrekte PIN (Standard `0000`) öffnet S10; Verlassen führt zurück nach S1.
- [ ] Falsche PIN: Feld leert sich, horizontale Shake-Animation (200 ms), Hinweistext; **kein Lockout/Cooldown**, sofort erneut eingebbar (E11).
- [ ] S10 nutzt Slate-Theme (`#374151` / `#F3F4F6`) — visuell klar vom Kindbereich getrennt.
- [ ] Max-Lautstärke einstellbar (Standard 85 %); danach reagiert die Kind-Lautstärke nur bis zum Limit, am Anschlag visuelles „voll"-Feedback ohne Pegeländerung (E14).
- [ ] PIN ändern persistiert (in SQLite) und gilt nach Neustart.
- [ ] Manueller Rescan löst MPD-Rescan aus; neue Medien erscheinen.
- [ ] BT-Verwaltung und Sync-Log als Platzhalter vorhanden (noch ohne Funktion).
- [ ] Kind-UI hat keinen sichtbaren Pfad in die Einstellungen außer der versteckten 2-s-Geste.

### Entwickler-Tasks

**Backend (Electron-Main)**
- Settings-Persistenz in SQLite: PIN (gehasht), `max_volume`, Defaults; Get/Set-IPC. **(M)**
- Lautstärke-Klemmung serverseitig: Kind-Lautstärke-Commands werden auf `max_volume` begrenzt (greift in M4-Lautstärkepfad). **(S)**
- Rescan-Command (teilt sich Pfad mit M2-Watcher). **(S)**

**Frontend**
- Logo-Lang-Tap-Geste (2 s) + Fortschritts-Ring (ab 400 ms, §4.2/§5.7). **(M)**
- **S9 PIN-Dialog** (numerisches Pad, E11-Verhalten: Shake 200 ms, Feld leeren, Hinweis). **(M)**
- **S10 Elterneinstellungen** im Parent-Theme: Max-Lautstärke-Regler, PIN ändern, Rescan-Button; Platzhalter-Sektionen für BT-Verwaltung (M6) und Sync-Log (M7). **(L)**
- E14-Anschlag-Feedback im Kind-Lautstärkeregler. **(S)**
- `de.json` erweitern. **(S)**

### UX/UI-Deliverables (Design-Brief §7, Phase 3 — Teil 3)
- S9 PIN-Dialog (numerisches Pad, Falsch-PIN-Verhalten E11: kein Lockout, Shake + Hinweis).
- S10 Elterneinstellungen-Grundgerüst (Max-Lautstärke, PIN ändern, Rescan; Parent-Mode-Slate-Theme). BT-Verwaltung und Sync-Log als Platzhalter (M6/M7).
- Logo-Eltern-Gate-Ring (§5.7, §4.2).

### Technische Risiken & Spikes
- **PIN-Speicherung:** PIN gehasht (z. B. bcrypt/scrypt mit Salt), nie im Klartext in der DB. Zwar niedriges Schutzniveau (Kind-Gerät), aber Vorbild für saubere Secret-Behandlung. **Sicherheits-Hinweis im Review.**
- **Geste vs. versehentliches Antippen:** 2-s-Schwelle + Ring-Start erst ab 400 ms müssen verhindern, dass das Kind das Gate entdeckt — gegen reale Kinder-Tippmuster testen.

---

## M6 — Bluetooth-Audio

**Spec-Phase 4.** Liefert den primären Audioweg (BT) inkl. UI. Hängt am MPD/PipeWire-Sink (M2), nutzt den Icon-Platz im Player (M4) und füllt die BT-Verwaltungs-Platzhalter der Eltern (M5).

### Was am Ende läuft / demonstrierbar ist
Über das BT-Icon im Player öffnet sich das BT-Menü (S7): aktuell verbundenes Gerät, Liste gekoppelter Geräte mit Connect/Disconnect, „Neues Gerät koppeln" mit 30-s-Scan und Fortschrittsanzeige. Audio läuft primär über BT; bei Trennung automatischer Fallback auf Klinke. Beim Boot verbindet sich das zuletzt genutzte Gerät automatisch. Verbindungsänderungen erscheinen als Toast; das BT-Status-Icon spiegelt den Zustand. Pairing-Löschen funktioniert in den Elterneinstellungen.

### Akzeptanzkriterien (manuell testbar)
- [ ] BT-Icon im Player öffnet S7; zeigt aktuell verbundenes Gerät (oder „Kein Gerät").
- [ ] „Neues Gerät koppeln" startet 30-s-Scan mit sichtbarem Fortschritt; gefundene Geräte sind koppelbar.
- [ ] Verbundenes BT-Gerät gibt Audio aus (über PipeWire-Sink); Lautstärke wirkt.
- [ ] BT trennen während Wiedergabe → automatischer Fallback auf 3,5-mm-Klinke, Wiedergabe läuft weiter (E4), keine Blockade.
- [ ] Reboot mit zuvor verbundenem Gerät → Autoconnect verbindet automatisch.
- [ ] Verbindungs-/Trennungsereignis → Toast mit Gerätename + Status (3,5 s); BT-Icon aktualisiert sofort (E5).
- [ ] „Nicht verbunden" zeigt ein eigenes Icon, nicht nur ausgegraut (E4).
- [ ] Elterneinstellungen: gekoppeltes Gerät löschbar (Pairing entfernt).

### Entwickler-Tasks

**System**
- PipeWire + BlueALSA/BlueZ einrichten; MPD/PipeWire-Sink so konfigurieren, dass BT primärer Sink ist und auf Klinke zurückfällt. **(L)**
- Autoconnect-Mechanismus beim Boot (Systemd-Service oder BlueZ-Trust + Agent). **(M)**

**Backend (Electron-Main)**
- BlueZ-Anbindung über D-Bus: Scan (30 s), Pair, Connect/Disconnect, gekoppelte Liste, Pairing löschen; Verbindungs-Events als `bt.connection`-Events an Renderer. **(L)**
- Sink-Umschaltung / Fallback-Logik bei Trennung; aktuellen Sink an Renderer melden. **(M)**

**Frontend**
- **S7 Bluetooth-Menü** (Dialog): verbundenes Gerät, gekoppelte Liste (Connect/Disconnect), „Neues Gerät koppeln" mit 30-s-Scan-Fortschritt. **(M)**
- **BT-Status-Icon** im Player (eigene Icons verbunden/nicht verbunden, E4). **(S)**
- **Toast-System** (200 ms ein, 3,5 s sichtbar, 200 ms aus) — global, erstmals hier produktiv (auch von M7-Sync genutzt). **(M)**
- BT-Verwaltung in S10 (Pairing löschen) — füllt M5-Platzhalter. **(S)**
- `de.json` erweitern. **(S)**

### UX/UI-Deliverables (Design-Brief §7, Phase 4)
- S7 Dialog (verbundenes Gerät, gekoppelte Liste, „Neues Gerät koppeln" mit 30-s-Scan-Fortschritt).
- BT-Status-Icon im Player (verbunden / nicht verbunden, E4).
- Toast für BT-Verbindungsänderungen (E5, 3,5 s).
- BT-Verwaltung in Elterneinstellungen (Pairing löschen) — füllt M5-Platzhalter.

### Technische Risiken & Spikes
- **BT-Audio auf dem Pi ist erfahrungsgemäß heikel:** Latenz, Stottern, Pairing-Zuverlässigkeit, A2DP-Profil-Aushandlung. **Höchstes Risiko des Projekts — Hardware-Spike früh (idealerweise schon während M2/M4), mit den real eingesetzten Kopfhörern/Lautsprechern.**
- **Autoconnect-Timing:** Gerät muss beim Boot ggf. erst „aufwachen"; Retry/Trust-Strategie nötig.
- **Sink-Fallback ohne Knacken:** Umschalten BT↔Klinke ohne hörbare Störung und ohne MPD-Neustart.
- **D-Bus-Berechtigungen** unter dem `player`-User (Polkit) müssen Pairing/Connect erlauben.

---

## M7 — Display-Management, Schlaf-Timer & Polish

**Spec-Phase 5.** Schließt die verbleibenden Features ab und härtet das System für den Dauerbetrieb. Hängt am Player (M4), den Einstellungen (M5) und nutzt Toast/Sink aus M6.

### Was am Ende läuft / demonstrierbar ist
Während Wiedergabe bleibt das Display an; bei Pause/Stop schaltet es nach 5 min ab; Touch weckt es ohne Playback-Änderung (sanftes Aufblenden). Der Schlaf-Timer (S8: 15/30/60 min + „Bis Ende Kapitel") zeigt einen Countdown, faded 60 s vor Ende aus und pausiert. Fehlende Cover werden online nachgeladen bzw. durch deterministische Platzhalter ersetzt. Das Sync-Status-Icon (✅/🔄/⚠️) ist in der Titelleiste live, das Sync-Log in den Elterneinstellungen einsehbar. Ein Stromverlust-Test bestätigt sauberes Resume.

### Akzeptanzkriterien (manuell testbar)
- [ ] Wiedergabe aktiv → Display bleibt dauerhaft an (DPMS deaktiviert).
- [ ] Pause/Stop → nach genau 5 min Display aus; Wiedergabe-State bleibt erhalten (E13).
- [ ] Touch auf ausgeschaltetem Display → Display blendet in 300 ms auf, **kein** Play/Pause ausgelöst (E6); erst der zweite Touch wirkt als UI-Tap.
- [ ] Display-Steuerung ist event-getrieben (`mpc idle player`), kein Polling (per Code/Service-Log verifizierbar).
- [ ] S8 Schlaf-Timer: 15/30/60 min + „Bis Ende des Kapitels" wählbar; Countdown sichtbar; Tap auf Countdown bricht ab.
- [ ] 60 s vor Timer-Ende lineares Fade-Out der Lautstärke; nach Ablauf Pause (kein Stop → Resume bleibt möglich) (E10).
- [ ] „Bis Ende des Kapitels" bei kapitellosem Medium mappt auf Track-Ende (E12).
- [ ] Medium ohne lokales Cover: Online-Fetch (MusicBrainz/Last.fm) lädt Cover nach, gecacht unter `/mnt/hoermond/.cache/covers/`; bis dahin Shimmer; bei Fehlschlag dauerhaft Platzhalter (Initial + deterministische Farbe), keine Fehlermeldung ans Kind (E2/E3).
- [ ] Sync-Icon zeigt ✅ aktuell / 🔄 läuft (animiert 360°/1,4 s) / ⚠️ fehlgeschlagen (Amber); Tap auf ⚠️ zeigt Details (E7/E8).
- [ ] Sync-Log der letzten 10 Vorgänge in S10 einsehbar.
- [ ] **E2E-Stromverlust-Test:** während Wiedergabe Stecker ziehen → Reboot → Auto-Resume an korrekter Position (≤ 10 s), Bibliothek intakt, kein Datenverlust (mind. 10× wiederholt).

### Entwickler-Tasks

**System**
- `display-manager.service`: event-getrieben via `mpc idle player`; bei `play` DPMS aus, bei `pause`/`stop` 5-min-Timer; Touch-Wake ohne State-Änderung (`xset dpms` / `vcgencmd display_power`). **(M)**

**Backend (Electron-Main)**
- Schlaf-Timer-Logik: Modi 15/30/60/„bis Kapitelende" (→ Track-Ende bei E12), 60-s-Fade-Out (linear, präzises Volume-Ramping), Pause am Ende; Countdown-Events an Renderer. **(M)**
- Cover-Pipeline: lokales Cover (cover.jpg/folder.jpg/embedded) → sonst Online-Fetch (MusicBrainz Cover Art Archive / Last.fm) → Cache `/mnt/hoermond/.cache/covers/`; Fetch-Status-Events (für Shimmer). **(L)**
- Sync-Status-Aggregation: ✅/🔄/⚠️ aus den M2-Sync-Events ableiten; Sync-Log-Abruf (letzte 10). **(S)**

**Frontend**
- Touch-Wake-Behandlung im Renderer: erster Touch nach Screen-Off verworfen, 300-ms-Fade-In (E6). **(M)**
- **S8 Schlaf-Timer-Dialog** + aktiver Countdown im Player + Tap-zum-Abbrechen. **(M)**
- Cover-Fallback-Komponente finalisieren (deterministische Farbe + Initial, Shimmer 1 Passage/1,2 s) — ersetzt M3-Hook produktiv. **(S)**
- **Sync-Status-Icon** in der Titelleiste (✅/🔄/⚠️, Animationen §4.2) + Tap-Details; Sync-Log-Ansicht in S10. **(M)**
- **Polish-Pass:** alle Timings/Übergänge aus §4.2 final abstimmen (Press, Sheet, Dialog, Toast, Wake, Shimmer). **(M)**
- `de.json` final vervollständigen. **(S)**

### UX/UI-Deliverables (Design-Brief §7, Phase 5)
- S8 Schlaf-Timer-Dialog (15/30/60 + „Bis Ende des Kapitels", E12-Mapping, Countdown, Tap-Abbruch, Fade-Out E10).
- Display-Aufweck-Verhalten ohne State-Änderung (E6), Fade-In 300 ms.
- Cover-Fallback-Platzhalter final (deterministische Farbe + Initial, §5.1/E2/E3), Shimmer-Timing.
- Sync-Status-Icon final (✅/🔄/⚠️, E7/E8) + Sync-Log in S10.
- Alle Edge-Case-States (§6) finalisieren, gegen E2E-Tests prüfen (Stromverlust/Resume E9).
- Polish-Pass aller Animationen (§4.2).

### Technische Risiken & Spikes
- **Touch-Wake ohne UI-Reaktion (E6):** Technisch knifflig — der erste Touch nach DPMS-Off darf das Display wecken, aber nicht an den Renderer als Tap durchgereicht werden. **Spike:** Event-Pfad X11/libinput → Electron klären; ggf. „Swallow"-Logik im Main-Prozess oder kurzer Input-Block nach Wake.
- **Fade-Out-Präzision:** Volume-Ramping über MPD/PipeWire muss linear und ruckelfrei sein; „60 s vor Ende" erfordert verlässliche Restzeit (bei Streams/CUE prüfen).
- **Online-Cover-Fetch:** Gerät kann offline sein → Fetch muss timeouten und sauber auf Platzhalter zurückfallen, Cache darf read-only-rootfs nicht verletzen (Cache liegt auf `/mnt/hoermond`, beschreibbar — verifizieren).
- **E2E-Stromverlust:** abschließende Härtung; bei Fehlern liegt die Ursache fast immer in M1 (overlayfs/Schreibpfade) oder M2 (WAL/Positionsschreiben) — entsprechend früh mitvalidieren.

---

## Abhängigkeits- und Reihenfolge-Übersicht

```
M1 (Fundament + UI-Lebenszeichen)
 └─► M2 (Sync + Backend + Durchstich-Player)
      ├─► M3 (Bibliothek S0/S1/S2/S3/S4)
      │    ├─► M4 (Player S5/S6)  ┐
      │    └─► M5 (Eltern S9/S10) ┤  (M4 und M5 parallelisierbar)
      │                           │
      └───────────────────────────┴─► M6 (Bluetooth S7)
                                        └─► M7 (Display, Schlaf-Timer, Polish, E2E)
```

**Reihenfolge-Hinweise:**
- M4 und M5 hängen beide nur an M3 und können **parallel** von zwei Entwicklern bearbeitet werden; das Lautstärke-Limit (M5) integriert sich in den Lautstärkepfad (M4) — kurze Abstimmung am Übergang.
- M6 (Bluetooth) braucht den Sink aus M2, den Icon-Platz aus M4 und die Verwaltungs-Platzhalter aus M5. **Der BT-Hardware-Spike sollte jedoch bereits früh (während M2/M4) laufen**, da BT auf dem Pi das größte technische Risiko ist und Vorlauf braucht.
- M7 ist der Abschluss- und Härtungs-Meilenstein; er nutzt das Toast-System (erstmals in M6 gebaut) und die Sync-Events (seit M2) und schließt mit dem E2E-Stromverlust-Test ab.

## Querschnittsthemen (über alle Meilensteine)

- **i18n:** Jeder UI-Meilenstein (M3–M7) erweitert ausschließlich `de.json`; keine deutschen Strings im Code. Struktur erlaubt spätere Sprachauswahl ohne Refactoring.
- **IPC-Vertrag:** wächst kontrolliert; Änderungen am `ipc-contract.ts` sind reviewpflichtig, da sie Main und Renderer gleichzeitig betreffen.
- **Sicherheits-Checkpoints:** `media-sync` chroot (M2), PIN-Hashing (M5), D-Bus/Polkit-Rechte (M6) — jeweils Security-Review vor Abnahme.
- **Stromverlust-Sicherheit:** in M1 etabliert, in M2 (Positionsschreiben/WAL) belastet, in M7 final E2E-getestet — bei jeder Abnahme stichprobenartig „Stecker ziehen" wiederholen.
- **Abnahme jedes Meilensteins** erfolgt am **echten Gerät mit echtem 7"-Touchscreen** — nicht im Desktop-Emulator, da Kiosk-, GPU-, Touch- und BT-Verhalten sich nur dort realistisch zeigen.
```
