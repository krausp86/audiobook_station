# tasks/ — Planung, Backlog, Bugs

Übersicht über die Planungsdokumente. Neue Konzepte kommen als eigene Datei hierher und
werden unten verlinkt.

## Aktuell

| Datei | Inhalt |
|-------|--------|
| [`known-issues.md`](known-issues.md) | **Offene Bugs und Audit-Findings.** Zentrale Stelle — GitHub Issues sind nicht in Benutzung. |
| [`milestones.md`](milestones.md) | Meilensteinplan M1–M7 (v1.0.0 abgeschlossen) |
| [`briefing.md`](briefing.md) | Ursprüngliches Projekt-Briefing |
| [`design-brief.md`](design-brief.md) | UX/UI-Spezifikation, Screens S0–S10 |

## Backlog — geplant, noch nicht begonnen

| Datei | Status | Kurz |
|-------|--------|------|
| [`dev-local-testing.md`](dev-local-testing.md) | Notiz | Lokale Testumgebung. **Vorbedingung für alles Weitere**, da das Gerät produktiv läuft. |
| [`feature-web-upload.md`](feature-web-upload.md) | Entwurf | Web-Portal im Heimnetz zum Befüllen und Verwalten. Branch `webupload` — bisher nur dieses Dokument, kein Code. |
| [`feature-playlists.md`](feature-playlists.md) | Notiz | Ordnerstruktur als Gruppierungsmodell (statt Tag-Automatik), Ordner-Verwaltung im Web-Portal. |

**Sinnvolle Reihenfolge:** lokale Testumgebung → Web-Portal → Playlists.
Playlists brauchen das Portal als Editier-Oberfläche, und beide fassen Tabellen an,
an denen der Hörfortschritt hängt.

## Archiv

`v1.0.0/` — Task-Breakdowns, Audits und Abnahmeprotokolle der Meilensteine M1–M7.
Offene Findings daraus sind in `known-issues.md` übernommen.
