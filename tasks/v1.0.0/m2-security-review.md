# T2.04 — Sicherheits-Review chroot + Sync-Kette

## Ursprünglicher Review

Vollständiger 7-Punkte-Review (siehe `m2-tasks.md` T2.04) wurde vor der
`/media` → `/mnt/hoermond`-Migration durchgeführt und bestanden.

## Re-Verifikation nach `/mnt/hoermond`-Migration — 2026-06-16

Anlass: Pfad-Migration der gesamten Sync-Kette von `/media` (keine eigene Partition,
fälschlich angenommen) auf `/mnt/hoermond` (echte persistente ext4-Partition), inkl.
Ownership-Fixes und einem zwischenzeitlichen Setgid-Vorfall (siehe
`tasks/m2-migration-media-to-mnt-hoermond.md`, `tasks/m2-server-side-perm-fix.md`).
Geprüft von: kmlpatrick (mit Claude).

| Punkt | Beschreibung | Befund | Status |
|---|---|---|---|
| A1 | Wurzel-Ownership `/mnt/hoermond` | `root:root 755`, bestätigt zusätzlich durch fehlschlagende Schreibversuche auf `:/` und `:/../etc` | ✅ bestanden |
| A2 | chroot-Ausbruch (`rsync .../../etc/`, `ssh ... 'ls /'`) | Beide Versuche schlagen fehl wie erwartet (`Permission denied` / Wrapper-Ablehnung) | ✅ bestanden |
| A3 | `.state`-Schutz vor `media-sync` | **Fehlgeschlagen bei Erstprüfung:** `.state` war `player:player 755` statt `700` — `media-sync` konnte lesen/traversieren (Download-Exfiltration der SQLite/MPD-State-DB theoretisch möglich, da der Wrapper jede `rsync --server`-Richtung durchlässt). Schreibrichtung war durch fehlendes Gruppen-/Other-Write-Bit bereits blockiert, das täuschte zunächst Sicherheit vor. **Gefixt:** `chmod 700`. Re-Test (Download-Richtung) bestätigt: `change_dir "/.state" failed: Permission denied`. | ⚠️ Lücke gefunden → ✅ gefixt, jetzt bestanden |
| A4 | Chroot-Jail-Binaries (`bin/sh`, `usr/bin/rsync`, `usr/local/sbin/media-sync-shell`) | Owner/Gruppe waren durch einen ursprünglich zu breit gefassten `media-fix-perms.sh`-Lauf auf `root:media` geändert; zusätzlich Setgid-Bit auf den Verzeichnissen (`2755` statt `755`). Numerischer `chmod 755` löschte das Setgid-Bit bei Verzeichnissen nicht zuverlässig (GNU-`chmod`-Eigenheit) — erst explizites `chmod g-s` hat funktioniert. | ⚠️ Befund gefixt → ✅ bestanden |
| A5 | `sudoers`-Freigabe für `media-fix-perms.sh` eng begrenzt | `player ALL=(root) NOPASSWD: /usr/local/sbin/media-fix-perms.sh` — kein Wildcard, eine einzige Regel, Datei `440 root:root` (nicht von `player` lesbar, nur via `sudo -l` einsehbar) | ✅ bestanden |

## Lessons Learned

- **`/media` war nie eine eigene Partition.** Der Eindruck "überlebt Reboots" entstand
  nur, weil `overlayroot` zum jeweiligen Testzeitpunkt deaktiviert war. Vor jeder
  Aussage über Persistenz: `findmnt -t overlay` UND `mount | grep <pfad>` prüfen, nicht
  nur "hat überlebt" als Beweis akzeptieren.
- **`chmod <ziffern>` auf Verzeichnissen löscht das Setgid-Bit bei GNU coreutils nicht
  zuverlässig** — explizit `chmod g-s` verwenden, wenn ein Setgid-Bit entfernt werden
  soll. Roher `chmod(2)`-Syscall (z. B. via Python) verhält sich anders als das
  `chmod`-Frontend.
- **Permission-Normalisierungs-Skripte (`media-fix-perms.sh`) müssen eng auf die
  tatsächlichen Medienordner begrenzt sein** — ein zu breiter `find`-Aufwand über die
  ganze Partition trifft auch sicherheitskritische Bereiche (Chroot-Jail-Binaries,
  potenziell `.state`) und kann sowohl Funktionalität (SSH-Login bricht) als auch
  Sicherheit (Ownership-Drift) beschädigen.
- **„Schreiben schlägt fehl" ist nicht dasselbe wie „Lesen schlägt fehl".** Ein
  Permission-Check, der nur die Schreibrichtung testet, kann eine Leserechte-Lücke
  übersehen (siehe A3). Sicherheitstests für sync-artige Kanäle sollten beide
  Richtungen prüfen.

## Ergebnis

Alle 5 re-verifizierten Punkte (A1–A5) bestanden nach Behebung der bei A3 und A4
gefundenen Lücken. T2.04 gilt für den `/mnt/hoermond`-Endzustand als abgeschlossen.
