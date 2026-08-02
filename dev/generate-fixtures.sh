#!/usr/bin/env bash
#
# Erzeugt den Test-Medienbestand unter dev/media/.
#
# Alle Dateien sind generierte Stille — winzig, aber mit echten Tags, echten
# Laufzeiten und (bei M4B) echten eingebetteten Kapiteln. Nichts davon landet
# in git (siehe .gitignore); der Bestand wird bei Bedarf neu erzeugt.
#
# Die Struktur bildet bewusst die Fälle ab, an denen das aktuelle
# Gruppierungsmodell scheitert — siehe tasks/feature-playlists.md.
#
# Benötigt: ffmpeg
#
set -euo pipefail

DEV_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MEDIA="$DEV_DIR/media"

command -v ffmpeg >/dev/null || { echo "FEHLER: ffmpeg nicht gefunden." >&2; exit 1; }

echo "Erzeuge Test-Medien unter $MEDIA"
rm -rf "$MEDIA"

# mp3 <pfad> <dauer_s> [titel] [artist] [album] [track]
# Ohne Titel/Artist/Album entsteht bewusst eine Datei ganz ohne Tags.
mp3() {
  local out="$1" dur="$2" title="${3:-}" artist="${4:-}" album="${5:-}" track="${6:-}"
  mkdir -p "$(dirname "$out")"
  local -a meta=()
  [[ -n "$title"  ]] && meta+=(-metadata "title=$title")
  [[ -n "$artist" ]] && meta+=(-metadata "artist=$artist")
  [[ -n "$album"  ]] && meta+=(-metadata "album=$album")
  [[ -n "$track"  ]] && meta+=(-metadata "track=$track")
  ffmpeg -hide_banner -loglevel error -y \
    -f lavfi -t "$dur" -i "anullsrc=r=44100:cl=mono" \
    -c:a libmp3lame -b:a 32k "${meta[@]}" "$out"
}

# albumartist <pfad> ... wie mp3, aber zusätzlich mit AlbumArtist-Tag
mp3_aa() {
  local out="$1" dur="$2" title="$3" artist="$4" album="$5" track="$6" albumartist="$7"
  mkdir -p "$(dirname "$out")"
  ffmpeg -hide_banner -loglevel error -y \
    -f lavfi -t "$dur" -i "anullsrc=r=44100:cl=mono" \
    -c:a libmp3lame -b:a 32k \
    -metadata "title=$title" -metadata "artist=$artist" -metadata "album=$album" \
    -metadata "track=$track" -metadata "album_artist=$albumartist" "$out"
}

# m4b <pfad> <gesamtdauer_s> <titel> <kapitel_dauer_s>
# Erzeugt ein M4B mit eingebetteten Kapiteln (für die M4-Kapitellogik).
m4b() {
  local out="$1" dur="$2" title="$3" chap="$4"
  mkdir -p "$(dirname "$out")"
  local metafile; metafile="$(mktemp)"
  {
    echo ";FFMETADATA1"
    echo "title=$title"
    local start=0 idx=1
    while (( start < dur )); do
      local end=$(( start + chap )); (( end > dur )) && end=$dur
      echo ""
      echo "[CHAPTER]"
      echo "TIMEBASE=1/1000"
      echo "START=$(( start * 1000 ))"
      echo "END=$(( end * 1000 ))"
      echo "title=Kapitel $idx"
      start=$end; idx=$(( idx + 1 ))
    done
  } > "$metafile"
  # -t VOR -i: begrenzt die unendliche lavfi-Quelle schon beim Lesen.
  # Als Output-Option haengt ffmpeg hier, weil der zweite Input (Metadaten)
  # keinen Stream liefert und die Quelle nie endet.
  # -map 0:a explizit, damit nur der Audiostream aus Input 0 uebernommen wird.
  ffmpeg -hide_banner -loglevel error -y \
    -f lavfi -t "$dur" -i "anullsrc=r=44100:cl=mono" \
    -i "$metafile" -map 0:a -map_metadata 1 \
    -c:a aac -b:a 32k "$out"
  rm -f "$metafile"
}

# ─────────────────────────────────────────────────────────────────────────────
# HÖRBÜCHER
# ─────────────────────────────────────────────────────────────────────────────

# Navigationsordner mit zwei Einheiten darunter — der WasIstWas-Fall aus der Notiz.
#
# Dinosaurier ist bewusst LANG (3 x 150 s = 7:30): die uebrigen Fixtures sind
# 4-6 s kurz, damit der Bestand klein bleibt — damit laesst sich aber weder
# Seek noch -15s/+30s noch Resume ueber eine Spurgrenze hinweg sinnvoll pruefen,
# weil der Track vorbei ist, bevor man den Regler trifft.
for i in 1 2 3; do
  mp3 "$MEDIA/audiobooks/WasIstWas/Dinosaurier/0$i.mp3" 150 \
      "Teil $i" "WasIstWas" "Dinosaurier" "$i"
done
for i in 1 2; do
  mp3 "$MEDIA/audiobooks/WasIstWas/Weltraum/0$i.mp3" 6 \
      "Teil $i" "WasIstWas" "Weltraum" "$i"
done

# GEMISCHTER ORDNER: Unterordner UND lose Datei nebeneinander.
# Erwartung nach neuem Modell: WasIstWas = Navigationsordner,
# Sonnensystem.m4b = Einzelsong-Kachel auf derselben Ebene.
#
# Ebenfalls lang (300 s / 5 Kapitel a 60 s), damit Kapitelsprung, Seek und
# Fortschrittsanzeige an eingebetteten Kapiteln pruefbar sind.
m4b "$MEDIA/audiobooks/WasIstWas/Sonnensystem.m4b" 300 "Sonnensystem" 60

# NATÜRLICHE SORTIERUNG: 1..10 sortiert alphabetisch falsch (10 vor 2).
for i in $(seq 1 10); do
  mp3 "$MEDIA/audiobooks/Benjamin Bluemchen/Im Zoo/$i.mp3" 4 \
      "Kapitel $i" "Benjamin Bluemchen" "Im Zoo" "$i"
done

# LOSE DATEI direkt im Typ-Ordner (heute der catch-all-Sonderfall in list.ts:121).
m4b "$MEDIA/audiobooks/Einzelhoerbuch.m4b" 18 "Einzelhoerbuch" 6

# MEHRERE DATENTRAEGER: CD1/CD2 — offene Frage zur Verschachtelungstiefe.
for cd in 1 2; do
  for i in 1 2; do
    mp3 "$MEDIA/audiobooks/Lange Reihe/Der Schatz/CD$cd/0$i.mp3" 5 \
        "CD$cd Teil $i" "Lange Reihe" "Der Schatz" "$i"
  done
done

# ─────────────────────────────────────────────────────────────────────────────
# MUSIK
# ─────────────────────────────────────────────────────────────────────────────

# SAMPLER OHNE AlbumArtist, wechselnder Artist.
# Heute: zerfällt in eine Kachel pro Interpret. Neu: eine Einheit.
mp3 "$MEDIA/music/Sampler/Kinderhits/01.mp3" 5 "Lied A" "Anna"  "Kinderhits" "1"
mp3 "$MEDIA/music/Sampler/Kinderhits/02.mp3" 5 "Lied B" "Bernd" "Kinderhits" "2"
mp3 "$MEDIA/music/Sampler/Kinderhits/03.mp3" 5 "Lied C" "Clara" "Kinderhits" "3"

# SAUBER GETAGGTES ALBUM mit AlbumArtist — heute der Gutfall.
for i in 1 2 3; do
  mp3_aa "$MEDIA/music/Die Aerzte/Bester Sampler/0$i.mp3" 5 \
         "Song $i" "Die Aerzte" "Bester Sampler" "$i" "Die Aerzte"
done

# SCHREIBVARIANTE desselben Interpreten — heute eine zweite, doppelte Kachel.
mp3_aa "$MEDIA/music/Die Ärzte/Noch ein Sampler/01.mp3" 5 \
       "Song 1" "Die Ärzte" "Noch ein Sampler" "1" "Die Ärzte"

# GAR KEINE TAGS — heute wird jede Datei zur eigenen Kachel.
mp3 "$MEDIA/music/Ohne Tags/track-a.mp3" 5
mp3 "$MEDIA/music/Ohne Tags/track-b.mp3" 5

# SELBST ZUSAMMENGESTELLTE PLAYLIST (Ordner ohne Unterordner = Einheit).
# Enthält eine KOPIE eines Sampler-Songs — der Duplikat-Fall E4.
mkdir -p "$MEDIA/music/Kinderlieder/Lieblingslieder"
cp "$MEDIA/music/Sampler/Kinderhits/01.mp3" \
   "$MEDIA/music/Kinderlieder/Lieblingslieder/01 Lied A.mp3"
mp3 "$MEDIA/music/Kinderlieder/Lieblingslieder/02 Eigener Song.mp3" 5 \
    "Eigener Song" "Diverse" "Lieblingslieder" "2"

# ESCAPING: Umlaute, Leerzeichen, Apostroph und doppeltes Anführungszeichen.
# Testet control.ts:25-26 (Backslash- und Quote-Escaping Richtung MPD).
mp3 "$MEDIA/music/Umlaute & Zeichen/Lied mit \"Quote\" und 'Apostroph'.mp3" 5 \
    "Quote \"Test\"" "Übungskünstler" "Sonderzeichen" "1"

echo
echo "Fertig. Struktur:"
find "$MEDIA" -type d | sort | sed "s|$MEDIA|  media|"
echo
echo "Dateien: $(find "$MEDIA" -type f | wc -l), Gesamtgröße: $(du -sh "$MEDIA" | cut -f1)"
