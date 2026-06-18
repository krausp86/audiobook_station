# M4 Pi-Abnahme: Testmedien vorbereiten

## Deine Situation

Du hast Hörbücher als **ZIP-Dateien**, die entpackt mehrere Audiodateien (MP3s)
pro Hörbuch enthalten. Das ist das **MP3-Ordner-Format** — einer der drei
Kapiteltypen, die M4 unterstützt. Jede Datei im Ordner = ein Kapitel.

Das ist ein sehr übliches Hörbuch-Format und der ideale Startpunkt zum Testen.

---

## Verzeichnisstruktur auf dem Pi

MPD erwartet die Medien unter `/mnt/hoermond`. Die App unterscheidet zwei
Top-Level-Ordner:

```
/mnt/hoermond/
├── audiobooks/
│   ├── AutorName/
│   │   └── HoerbuchTitel/
│   │       ├── 01-kapitel-eins.mp3
│   │       ├── 02-kapitel-zwei.mp3
│   │       └── 03-kapitel-drei.mp3
│   └── AndererAutor/
│       └── AnderesHoerbuch/
│           ├── teil01.mp3
│           └── teil02.mp3
└── music/
    └── ...
```

**Wichtig:** Die Gruppierung in der App basiert auf der Ordnerstruktur
(`audiobooks/<Autor>/<Titel>/`). Maximal 3 Pfadsegmente werden als Unit
zusammengefasst (siehe `list.ts`).

---

## Schritt-für-Schritt: ZIP-Hörbücher auf den Pi bringen

### 1. ZIPs lokal entpacken und Struktur anlegen

Auf deinem Laptop/Rechner:

```bash
# Arbeitsverzeichnis anlegen
mkdir -p ~/hoermond-testmedien/audiobooks

# Beispiel: ein ZIP entpacken
cd ~/hoermond-testmedien/audiobooks
mkdir -p "AutorName/HoerbuchTitel"
unzip /pfad/zum/hoerbuch.zip -d "AutorName/HoerbuchTitel/"
```

Prüfe nach dem Entpacken:
- Liegen die MP3s **direkt** im Ordner (nicht in einem Unter-Unterordner)?
- Falls das ZIP einen eigenen Ordner enthält, verschiebe die MP3s eine Ebene hoch.

```bash
# Kontrolle: so soll es aussehen
ls AutorName/HoerbuchTitel/
# → 01-kapitel.mp3  02-kapitel.mp3  03-kapitel.mp3  ...
```

### 2. Auf den Pi synchronisieren

Per rsync (wie in M2 etabliert):

```bash
rsync -avz --partial \
  ~/hoermond-testmedien/ \
  media-sync@<pi-ip>:/mnt/hoermond/
```

Oder per scp, falls rsync-Chroot Probleme macht:

```bash
scp -r ~/hoermond-testmedien/audiobooks/ \
  player@<pi-ip>:/mnt/hoermond/audiobooks/
```

### 3. MPD-Rescan auslösen

Falls der inotify-Watcher den Rescan nicht automatisch triggert:

```bash
# Auf dem Pi:
mpc update
# Warten bis fertig:
mpc idle update
```

### 4. Prüfen ob MPD die Dateien sieht

```bash
# Alle bekannten Dateien auflisten
mpc listall | head -20

# Bestimmtes Hörbuch prüfen
mpc listall | grep -i "hoerbuchtitel"
```

---

## Was du mit deinen ZIP-Hörbüchern testen kannst (T4.16 Teilabdeckung)

Deine entpackten ZIPs decken den **MP3-Ordner-Kapiteltyp** ab:

- [ ] Dateien erscheinen als Kapitel in der Kapitelliste (S6)
- [ ] Reihenfolge stimmt (Track-Nummer / Dateiname aufsteigend)
- [ ] ⏭ wechselt zur nächsten Datei/zum nächsten Kapitel
- [ ] ⏮ springt zum Anfang des aktuellen Kapitels bzw. zum vorherigen
- [ ] Kapitelmarker am Fortschrittsbalken an den richtigen Stellen
- [ ] Tap auf Kapitel in S6 springt dorthin und schließt das Sheet
- [ ] Aktuelles Kapitel ist in S6 hervorgehoben

---

## Was noch fehlt für die vollständige T4.16-Abdeckung

Für den kompletten Kapiteltest brauchst du zusätzlich:

### M4B-Datei (native Kapitel)
Eine einzelne `.m4b`-Datei mit eingebetteten Kapitelmarken. Quellen:
- Librivox bietet kostenlose gemeinfreie Hörbücher als M4B
- Oder ein eigenes MP3-Set mit `ffmpeg` zu M4B konvertieren:
  ```bash
  # Beispiel: MP3s zu einer M4B mit Kapitelmarken zusammenfügen
  # (erfordert eine chapters.txt mit Zeitstempeln)
  ffmpeg -f concat -i filelist.txt -c copy output.m4b
  ```

### CUE-Single-File
Eine große Audiodatei + eine `.cue`-Datei mit Track/Index-Einträgen.
Eher selten bei Hörbüchern, kommt aber vor. Kann auch synthetisch erstellt werden.

### Kapitelloses Medium (E12)
Eine **einzelne** MP3-Datei (kein Ordner mit mehreren Dateien). Damit testest du:
- [ ] Kein leeres S6-Sheet (Icon ausgeblendet, Swipe-Up wirkungslos)
- [ ] ⏮ = Track-Anfang, ⏭ = nächster Track falls vorhanden

---

## Empfehlung: Womit anfangen?

**Starte mit deinen ZIP-Hörbüchern (MP3-Ordner).** Das ist der häufigste und
robusteste Kapiteltyp. Damit kannst du T4.15 (Deploy + Touch + Audio) und den
MP3-Ordner-Teil von T4.16 komplett abdecken, plus T4.17 (Layout), T4.18 (Seek)
und T4.19 (Resume).

M4B und CUE kannst du bei Bedarf nachreichen — der MP3-Ordner-Typ ist der
praxisrelevanteste für dein Projekt (Kinderhörbücher kommen fast immer als
MP3-Sammlung oder M4B).

---

## Voraussetzungen auf dem Pi prüfen

Bevor du loslegst, auf dem Pi prüfen:

```bash
# ffprobe verfügbar? (wird für M4B/CUE-Kapitel gebraucht)
which ffprobe
# Falls nicht: sudo apt install ffmpeg

# MPD-Version notieren (Abgleich mit Spike T4.02)
mpd --version | head -3

# MPD läuft?
systemctl status mpd

# Media-Verzeichnis beschreibbar?
touch /mnt/hoermond/test && rm /mnt/hoermond/test && echo "OK"
```
