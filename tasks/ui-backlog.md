# UI-Backlog

Gestaltungs-Ideen, die beim nächsten UI-Durchgang drankommen. Keine Bugs — die stehen
in [`known-issues.md`](known-issues.md).

---

## UI-01 — Bildmotive statt Text auf dem Startscreen

**Notiert:** 2026-08-02 · **Betrifft:** S1 Startscreen

Die beiden Wahlkacheln auf S1 tragen heute reinen Text:

```tsx
<Pressable className="s1-tile s1-tile--audiobooks" …>
  <span className="t-label s1-tile-label">{t('start.audiobooks')}</span>   // „Hörbücher"
</Pressable>
<Pressable className="s1-tile s1-tile--music" …>
  <span className="t-label s1-tile-label">{t('start.music')}</span>        // „Musik"
</Pressable>
```
(`app/src/renderer/src/screens/S1Start.tsx:53-59`)

**Idee:** Die Wörter „Hörbücher" und „Musik" durch **generierte Bildmotive** ersetzen —
kindgerecht, einfach, klar, möglichst im bestehenden Farbschema.

### Randbedingungen

- **Nicht ersatzlos streichen.** Die Zielgruppe (6–8 Jahre) *kann* lesen, nur noch nicht
  flüssig — Text ist also ein taugliches Hilfsmittel, bloß kein schnelles. Bild **plus**
  Wort ist deshalb vermutlich besser als Bild allein: Das Motiv trägt den schnellen
  Griff, das Wort bestätigt. Vor der Umsetzung entscheiden, ob der Text unter dem Bild
  bleibt.
- **Farbschema.** Die Kacheln haben bereits eigene Klassen (`s1-tile--audiobooks`,
  `s1-tile--music`) und damit feste Flächenfarben. Die Motive müssen darauf funktionieren
  — also entweder farblich darauf abgestimmt oder einfarbig/als Silhouette, damit sie auf
  jedem Untergrund lesbar bleiben.
- **Auflösung.** Display ist fix 800 × 480; die Kacheln sind entsprechend groß. Motive
  brauchen keine hohe Auflösung, sollten aber scharf sein — **SVG wäre die naheliegende
  Wahl** und passt zum bestehenden Vorgehen (das Logo auf S1 ist bereits inline-SVG).
- **Nicht als externe Datei nachladen.** Cover werden per `file://` eingebunden, was in
  der Entwicklung blockiert wird (siehe `dev/README.md`). Inline-SVG umgeht das komplett.

### Offene Punkte

1. Bild **statt** oder **zusätzlich zum** Wort?
2. Welche Motive? Naheliegend: aufgeschlagenes Buch mit Kopfhörer für Hörbücher,
   Note/Instrument für Musik — beides sollte ein Kind ohne Erklärung treffen.
3. Wie erzeugt? Generiert und dann als SVG von Hand nachgezogen, oder direkt gezeichnet?
4. `aria-label` muss den Text behalten, auch wenn er sichtbar verschwindet — sonst
   verliert die Kachel ihre Bezeichnung (vgl. Finding K1 aus dem M4-Audit, das genau
   fehlende `aria-label` an `Pressable` betraf).
