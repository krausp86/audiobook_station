# tasks/ — Planung, Backlog, Bugs

Übersicht über die Planungsdokumente. Neue Konzepte kommen als eigene Datei hierher und
werden unten verlinkt.

## Aktuell

| Datei | Inhalt |
|-------|--------|
| [`known-issues.md`](known-issues.md) | **Offene Bugs und Audit-Findings.** Zentrale Stelle — GitHub Issues sind nicht in Benutzung. |
| [`ui-backlog.md`](ui-backlog.md) | Gestaltungs-Ideen für den nächsten UI-Durchgang (keine Bugs) |
| [`milestones.md`](milestones.md) | Meilensteinplan M1–M7 (v1.0.0 abgeschlossen) |
| [`briefing.md`](briefing.md) | Ursprüngliches Projekt-Briefing |
| [`design-brief.md`](design-brief.md) | UX/UI-Spezifikation, Screens S0–S10 |

## Backlog — geplant, noch nicht begonnen

| Datei | Status | Kurz |
|-------|--------|------|
| [`dev-local-testing.md`](dev-local-testing.md) | Notiz | Lokale Testumgebung. **Vorbedingung für alles Weitere**, da das Gerät produktiv läuft. |
| [`feature-web-upload.md`](feature-web-upload.md) | Entwurf | Web-Portal im Heimnetz zum Befüllen und Verwalten. Branch `webupload` — bisher nur dieses Dokument, kein Code. |
| [`feature-playlists.md`](feature-playlists.md) | **teilweise umgesetzt** | Ordnerstruktur als Gruppierungsmodell. Regel, Fortschritts-Abgleich und Geräte-Navigation stehen (Branch `ordnermodell`); offen ist der Web-Dateimanager. |

**Tatsächliche Reihenfolge:** lokale Testumgebung → Ordnermodell → Web-Portal.
Ursprünglich war das Portal vor dem Ordnermodell geplant; umgedreht, weil die
Bibliotheks- und Dateimanager-Ansichten des Portals **Einheiten** zeigen und welche es
gibt, allein die Gruppierungsregel bestimmt. Andersherum hätte man die beiden
aufwendigsten Portal-Screens zweimal gebaut.

## Archiv

`v1.0.0/` — Task-Breakdowns, Audits und Abnahmeprotokolle der Meilensteine M1–M7.
Offene Findings daraus sind in `known-issues.md` übernommen.
