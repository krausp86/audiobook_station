# M4 Pi-Abnahme — Schritt-für-Schritt-Anleitung

## Voraussetzungen prüfen

Auf dem Pi, **bevor du anfängst**:

```bash
# MPD läuft?
systemctl status mpd

# ffprobe verfügbar? (für M4B/CUE-Kapitel)
which ffprobe
# Falls nicht: sudo apt install ffmpeg

# MPD-Version notieren (Abgleich mit Laptop-Spike)
mpd --version | head -3
--> 0.24.4

# Media-Unterordner beschreibbar? (Root von /mnt/hoermond gehört root, das ist OK)
touch /mnt/hoermond/audiobooks/test && rm /mnt/hoermond/audiobooks/test && echo "OK"
```

---

## Schritt 1: Testmedien vorbereiten

### ZIP-Hörbücher entpacken (auf dem Laptop)

```bash
mkdir -p ~/hoermond-testmedien/audiobooks
cd ~/hoermond-testmedien/audiobooks

# Pro Hörbuch: Ordner anlegen und ZIP entpacken
mkdir -p "AutorName/HoerbuchTitel"
unzip /pfad/zum/hoerbuch.zip -d "AutorName/HoerbuchTitel/"
```

Kontrolle: Die MP3s müssen **direkt** im Titelordner liegen, nicht in einem
zusätzlichen Unterordner:

```
audiobooks/
└── AutorName/
    └── HoerbuchTitel/
        ├── 01-kapitel.mp3
        ├── 02-kapitel.mp3
        └── 03-kapitel.mp3
```

Falls das ZIP einen eigenen Ordner enthält, die MP3s eine Ebene hoch verschieben.

### Auf den Pi synchronisieren

```bash
rsync -avz --partial \
  ~/hoermond-testmedien/ \
  media-sync@<pi-ip>:/mnt/hoermond/

# Alternativ per scp:
scp -r ~/hoermond-testmedien/audiobooks/ \
  player@<pi-ip>:/mnt/hoermond/audiobooks/
```

### MPD über neue Dateien informieren

```bash
# Auf dem Pi:
mpc update
mpc idle update     # wartet bis der Scan fertig ist

# Prüfen ob die Dateien erkannt wurden:
mpc listall | head -20
```

---

## Schritt 2: Build & Deploy (T4.15)

Auf dem Pi im App-Verzeichnis:

```bash
cd /home/player/hoermond/repo/app

# 1. Branch sicherstellen
git checkout ms04
git pull

# 2. Dependencies installieren
npm install

# 3. PFLICHT: Native Module für Pi-ABI neu bauen
#    (ohne diesen Schritt startet die App nicht — DB-Fehler!)
npx electron-rebuild -f -w better-sqlite3

# 4. App bauen
npm run build

# 5. Service neustarten
sudo systemctl restart mediaplayer.service
```

Falls die App nicht startet, Logs prüfen:

```bash
sudo journalctl -u mediaplayer.service -n 50 --no-pager
```

---

## Schritt 3: Grundfunktion testen (T4.15)

Jetzt die App am Touchscreen durchgehen:

- [x] App startet im Kiosk (kein Cursor, kein Fensterrahmen)
- [x] S0 (Willkommen) → Tap → S1 (Startscreen)
--> lange nicht mehr gesehen, nicht zwingend notwendig
- [x] S1 → Tap auf Hörbücher/Musik → Grid
- [x] Grid → Tap auf Kachel → **S5 Player öffnet sich**
- [x] Audio ist hörbar über Klinke/Lautsprecher
- [x] Play/Pause-Button funktioniert per Tap
- [x] ⏪ (15s zurück) funktioniert, Audio springt hörbar
- [x] ⏩ (30s vor) funktioniert, Audio springt hörbar
- [x] ⏮ (vorheriges Kapitel) funktioniert
- [x] ⏭ (nächstes Kapitel) funktioniert
- [x] Lautstärke − leiser, Lautstärke + lauter (hörbar)
- [x] Drag am Fortschrittsbalken funktioniert per Finger
- [ ] Swipe-Up auf S5 → S6 Kapitelliste öffnet sich
--> wurde als nicht relevant herausgenommen
- [x] Kapitel-Icon-Button → S6 Kapitelliste öffnet sich
- [x] Zurück-Button → zurück zum Grid

### Bei Touch-Problemen

- Touch "seitenverkehrt"? → Liegt an `xrandr --rotate inverted` in `.xinitrc`
- Scrolle versehentlich statt Tap? → Schwelle aus T4.01 ggf. nachjustieren
- App startet nicht? → `electron-rebuild` vergessen? Logs prüfen (s.o.)

---

## Schritt 4: Kapitel-Verhalten testen (T4.16)

### MP3-Ordner (deine ZIP-Hörbücher)

- [x] Dateien erscheinen als Kapitel in S6 (Kapitelliste)
- [x] Kapitel sind in **korrekter Reihenfolge** (Track-Nummer/Dateiname)
- [x] ⏭ wechselt zur nächsten Datei/nächstes Kapitel
- [ ] ⏮ springt zum Kapitelanfang, nochmal ⏮ zum vorherigen Kapitel
--> Springt sofort zum vorherigen Kapitel
- [x] Kapitelmarker am Fortschrittsbalken an den richtigen Positionen
- [x] Tap auf ein Kapitel in S6 → springt dorthin, Sheet schließt sich
- [x] Aktuelles Kapitel ist in S6 hervorgehoben/markiert

### Kapitelloses Medium (E12) — falls vorhanden

Eine einzelne MP3-Datei direkt im Audiobook-Ordner:

- [ ] Kein leeres S6-Sheet (Kapitel-Icon ausgeblendet)
--> Kapitel Button ist immer da, zeigt den einen Song
- [ ] Swipe-Up hat keine Wirkung
--> Funktion ist rausgefallen
- [ ] ⏮ = Track-Anfang
--> Button ist Funktionslos
- [x] ⏭ = nächster Track (falls vorhanden), sonst keine Wirkung

### M4B / CUE — falls vorhanden (kann nachgereicht werden)
--> Nicht getestet / vorerst nicht relevant
M4B:
- [ ] Eingebettete Kapitel erscheinen in S6
- [ ] ⏮/⏭ navigiert zwischen Kapiteln
- [ ] Kapitelmarker am Balken korrekt

CUE:
- [ ] Kapitel aus CUE-Datei in S6
- [ ] Sprünge landen an CUE-Indexpunkten

---

## Schritt 5: Layout prüfen (T4.17)

Am echten 800×480-Display visuell prüfen:

- [x] **S5 ohne vertikales Scrollen** — alles passt in den Screen
- [x] Cover links ~300px, Steuerung rechts ~440px
- [x] Titelleiste 44px: Zurück-Button links, BT/Mond-Platzhalter rechts
- [x] Play/Pause-Button ist deutlich größer als die anderen (84×84)
- [x] Skip/Seek-Buttons (64×64) gut treffbar mit Kinderfinger
- [x] Lautstärke-Buttons (60×60) gut treffbar
- [x] Abstände zwischen Buttons ausreichend (≥16px)
- [x] Lange Titel werden mit "..." abgeschnitten (kein Umbruch/Overflow)
- [x] S6 Kapitelliste: Slide-In-Animation flüssig
- [x] S6: aktuelles Kapitel visuell hervorgehoben

---

## Schritt 6: Seek & Lautstärke messen (T4.18)

### Seek-Präzision

- [x] ⏪ drücken, angezeigte Zeit merken → springt **exakt 15s** zurück (±1s)
- [x] ⏩ drücken, angezeigte Zeit merken → springt **exakt 30s** vor (±1s)
- [x] Am Fortschrittsbalken ziehen: während des Ziehens springt die Wiedergabe
      **NICHT** (nur Vorschau/Tooltip)
- [x] Beim Loslassen springt die Wiedergabe zur Tooltip-Zeit
- [x] Nach dem Loslassen aktualisiert sich die Zeitanzeige live

**Erwartetes Verhalten an Kapitelgrenzen (MP3-Ordner):** ⏪ am Kapitelanfang
clampt auf 0:00 des aktuellen Tracks (springt NICHT ins vorherige Kapitel).
Das ist bewusst so und kein Bug.

### Lautstärke

- [x] Lautstärke + mehrfach drücken → wird hörbar lauter
- [x] Lautstärke − mehrfach drücken → wird hörbar leiser
- [x] Änderung ist monoton (jeder Schritt lauter/leiser als der vorherige)
- [x] Am Maximum (100) und Minimum (0) kein Fehler/Crash
- [x] **Kein Lautstärke-Limit** vorhanden (das kommt erst in M5)

---

## Schritt 7: Resume testen (T4.19)

### Resume nach Stromverlust

1. Ein MP3-Ordner-Hörbuch starten, zu Kapitel 2 oder 3 navigieren
2. Mindestens **20 Sekunden** warten (min. zwei 10s-Saves)
3. **Stecker ziehen** (hart, kein sauberes Herunterfahren)
4. Wieder einstecken, warten bis die App startet

- [x] Resume landet im **richtigen Kapitel/Track**
- [x] Resume landet an der **richtigen Position** (±10s Toleranz)

Falls M4B/CUE vorhanden, dieselbe Prozedur wiederholen:
- [ ] M4B: Resume an der richtigen Gesamtposition
- [ ] CUE: Resume an der richtigen Position

### Resume-on-Stopped (kein Auto-Resume nach Stop)

1. Ein Medium abspielen
2. **Stop-Button** drücken (nicht Pause!)
3. Stecker ziehen oder `sudo systemctl restart mediaplayer.service`
4. Warten bis die App startet

- [ ] App startet **OHNE** automatische Wiedergabe — Stille, kein Resume
--> BUG. Wiedergabe startet, kein S5, kein plaing-indikator um zu S5 zu springen

### Vergleich: Pause vs. Stop

1. Ein Medium abspielen, **Pause** drücken
2. Stecker ziehen, neu starten

- [ ] App resumed und spielt an der pausierten Position weiter
--> finaler Test wenn alles andere behoben ist und overlay wieder aktiviert wurde
---

## Zusammenfassung: Was muss bestanden sein?

### Pflicht (Meilenstein-Abnahme M4)

| Test | Status |
|------|--------|
| T4.15: App startet, Touch + Audio funktionieren | |
| T4.16: MP3-Ordner-Kapitel navigierbar | |
| T4.17: S5 Layout 800×480 ohne Scrollen | |
| T4.18: Seek 15/30s präzise, Drag on-release, Lautstärke | |
| T4.19: Resume im richtigen Kapitel, kein Resume nach Stop | |

### Optional (kann nachgereicht werden)

| Test | Status |
|------|--------|
| T4.16: M4B-Kapitel navigierbar | |
| T4.16: CUE-Kapitel navigierbar | |
| T4.16: E12 kapitelloses Medium | |

---

## Bei Fehlern

Ergebnisse und Probleme hier oder in `tasks/m4-acceptance-test.md` dokumentieren.
Fehler mit Beschreibung (was erwartet / was passiert) festhalten, damit sie am
Laptop reproduziert und behoben werden können.

Nützliche Debug-Befehle auf dem Pi:

```bash
# App-Logs
sudo journalctl -u mediaplayer.service -f

# MPD-Status
mpc status
mpc playlist

# DB-Inhalt prüfen (Resume-Daten)
sqlite3 /var/lib/mediaplayer/state.db "SELECT * FROM playback_position;"
```
