# Lokale Testumgebung

**Projekt:** Hörmond — KinderMediaPlayer
**Status:** Notiz / Vorüberlegung
**Erstellt:** 2026-08-02
**Priorität:** hoch — Vorbedingung für Playlists und Web-Portal

---

## Warum jetzt

Das Gerät ist **im Produktivbetrieb**. Die nächsten beiden Vorhaben — Playlists
(`feature-playlists.md`) und das Web-Portal (`feature-web-upload.md`) — fassen beide
genau die Strukturen an, an denen der Hörfortschritt des Kindes hängt:
`playback_position`, `media.path` und die Gruppierungslogik.

Bisher wurde jede Milestone-Abnahme am echten Pi gemacht. Das geht jetzt nicht mehr
gefahrlos, und die Audits merken es bereits an: laut `v1.0.0/m4-audit-2.md:282` fährt
**kein einziger Test echtes MPD oder ffprobe** — alles ist statisch über typecheck und
Unit-Tests abgesichert.

---

## Ist-Zustand

- `npm run dev` (electron-vite) startet die App auf dem Laptop.
- `npm test` läuft Vitest — aber nur auf Unit-Ebene, ohne MPD, ohne Dateisystem.
- Die App erwartet per Default MPD auf `127.0.0.1:6600` und Medien unter `/mnt/hoermond`.

**Gute Nachricht — im Code nachgeprüft (2026-08-02):** Alle relevanten Pfade sind
**bereits** über Umgebungsvariablen konfigurierbar und tatsächlich implementiert, nicht
nur dokumentiert:

| Variable | Gelesen in |
|----------|-----------|
| `HOERMOND_DB_PATH` | `main/db/index.ts:4` |
| `HOERMOND_MEDIA_ROOT` | `main/library/list.ts:38` |
| `HOERMOND_COVER_CACHE` | `main/library/list.ts:26` |
| `HOERMOND_MPD_HOST` / `_PORT` | `main/mpd/client.ts:3-4`, `main/mpd/idle.ts:6-7` |
| `HOERMOND_SYNC_LOG` | `main/sync/watch-log.ts:6` |
| `HOERMOND_BACKLIGHT_PATH` | `main/display/manager.ts:5` |
| `HOERMOND_DISPLAY_TIMEOUT` | `main/display/manager.ts:8` |

**Für eine lokale Umgebung ist also keine Code-Änderung nötig** — es fehlen nur Setup,
Test-Fixtures und Dokumentation.

---

## Optionen

| | Ansatz | Bewertung |
|---|--------|-----------|
| **A** | Lokaler MPD auf dem Laptop + Test-Medienordner + `.env.local` | Leichtgewichtig, sofort machbar, deckt Bibliothek/Resume/Kapitel ab |
| **B** | Docker-Compose `hoermond-dev`: MPD-Container + Test-Media-Volume | Reproduzierbar, versionierbar, **synergiert mit dem Web-Portal-Container** |
| **C** | Zweiter Pi als Staging-Gerät | Teuer, aber der einzige Weg für Touch, Display, Bluetooth und overlayfs |

**Empfehlung:** **B** als Basis — der Web-Container kommt ohnehin, und beide können im
selben Compose-File liegen. **C** nur für die hardwarenahen Themen (BT-01 im
`known-issues.md` wäre so ein Fall, den A und B prinzipiell nicht abdecken können).

---

## Bausteine

- **`dev/media/`** — Test-Fixtures, die die bekannten Problemfälle abdecken:
  - MP3-Ordner, mehrspurig, sauber getaggt (Standardfall)
  - M4B mit eingebetteten Kapiteln (für M4-Kapitellogik)
  - **Sampler ohne `AlbumArtist`, wechselnder `Artist`** — der Zerfall-Fall aus `feature-playlists.md`
  - Datei ganz ohne Tags (Kachelflut-Fall)
  - Umlaute, Leerzeichen und Anführungszeichen im Dateinamen (Escaping in `control.ts:25-26`)
  - CUE-basiertes Album (deckt den offenen Stub M4-M3 ab)
  - **Verschachtelte Struktur** à la `audiobooks/WasIstWas/Dinosaurier/…` — für das
    Ordnermodell und die neue Navigationsebene (`feature-playlists.md`)
  - **Gemischter Ordner**: Unterordner *und* lose Audiodatei nebeneinander (offene Frage 1 dort)
  - Dieselbe Datei in zwei Ordnern (Kopie-Fall E4)
- **`dev/mpd.conf`** — `music_directory` auf `dev/media`, eigener Port
- **`.env.development`** — die Variablen aus der Tabelle oben
- **Seed-Skript** — Test-DB mit ein paar `playback_position`-Zeilen, um Resume und die
  „Weiterhören"-Sektion ohne manuelles Vorspielen zu testen
- **npm script `dev:local`** — MPD hochfahren + App starten in einem Befehl
- **README-Abschnitt** — der aktuelle Abschnitt „Entwicklung (Laptop)" (`README.md:108`)
  verschweigt die MPD-Abhängigkeit komplett

**Wichtig:** Fixtures klein halten. Stille Audiodateien mit definierter Länge per
`ffmpeg` generieren statt echte Hörbücher ins Repo zu legen — ein Generator-Skript ist
besser als 800 MB Binärdaten in git.

---

## Offene Fragen

1. **Fixtures im Repo oder generiert?** Generator-Skript hält das Repo schlank, kostet
   aber eine ffmpeg-Abhängigkeit beim Setup.
2. **Web-Portal im selben Compose?** Spricht viel dafür — dann ist die lokale Umgebung
   von Anfang an die Entwicklungsumgebung für das Portal.
3. **Anonymisierter Snapshot der Produktiv-DB** als zusätzliches Fixture? Wäre der
   realistischste Testfall für die Playlist-Migration.
4. **Fenstergröße:** Im Dev-Modus fix auf 800 × 480 erzwingen? Das Layout ist laut
   `m1-tasks.md:954` bewusst nicht responsiv.
5. **Migrations-Test:** Braucht es einen expliziten Test „v3-DB → v4-Migration →
   Fortschritt intact"? Bei einem Gerät im Produktivbetrieb mit echten Hördaten:
   vermutlich ja.
