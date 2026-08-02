import { describe, it, expect } from 'vitest';
import {
  unitPathFor,
  mediaTypeForPath,
  displayTitleFor,
  isDiscDir,
  buildDirectoryIndex,
  EMPTY_DIRECTORY_INDEX,
} from './grouping';

/** Index aus Dateipfaden bauen — so wie es primeDirectoryIndexFromFiles tut. */
function indexFor(files: string[]) {
  const dirs = new Set<string>();
  for (const file of files) {
    const parts = file.split('/');
    for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join('/'));
  }
  return buildDirectoryIndex(dirs);
}

describe('mediaTypeForPath', () => {
  it('treats everything under audiobooks/ as audiobook', () => {
    expect(mediaTypeForPath('audiobooks/Autor/Titel/01.mp3')).toBe('audiobook');
    expect(mediaTypeForPath('audiobooks/lose.m4b')).toBe('audiobook');
  });

  it('treats everything else as music', () => {
    expect(mediaTypeForPath('music/Interpret/Album/01.mp3')).toBe('music');
    expect(mediaTypeForPath('hoerspiele/Titel/01.mp3')).toBe('music');
  });
});

describe('isDiscDir', () => {
  it('recognises common disc folder spellings', () => {
    for (const name of ['CD1', 'CD 1', 'cd_2', 'Disc3', 'Disc 10', 'disk-4']) {
      expect(isDiscDir(name), name).toBe(true);
    }
  });

  it('does not treat ordinary folders as discs', () => {
    // "Teil"/"Folge" bewusst NICHT enthalten — die bezeichnen im Deutschen oft
    // eigenstaendige Werke. Lieber zu wenig zusammenfassen als zu viel.
    for (const name of ['Dinosaurier', 'Teil 1', 'Folge 3', 'CD', 'Discography']) {
      expect(isDiscDir(name), name).toBe(false);
    }
  });
});

describe('unitPathFor — Ordner ohne Unterordner ist eine Einheit', () => {
  const index = indexFor([
    'audiobooks/WasIstWas/Dinosaurier/01.mp3',
    'audiobooks/WasIstWas/Dinosaurier/02.mp3',
    'audiobooks/WasIstWas/Weltraum/01.mp3',
    'music/Sampler/Kinderhits/01.mp3',
  ]);

  it('groups all files of a leaf folder into one unit', () => {
    expect(unitPathFor('audiobooks/WasIstWas/Dinosaurier/01.mp3', index)).toBe(
      'audiobooks/WasIstWas/Dinosaurier',
    );
    expect(unitPathFor('audiobooks/WasIstWas/Dinosaurier/02.mp3', index)).toBe(
      'audiobooks/WasIstWas/Dinosaurier',
    );
  });

  it('applies the same rule to music', () => {
    expect(unitPathFor('music/Sampler/Kinderhits/01.mp3', index)).toBe('music/Sampler/Kinderhits');
  });

  it('ignores tags entirely — grouping is structural', () => {
    // Die Signatur nimmt gar keine Tags mehr entgegen. Zwei Dateien desselben
    // Ordners landen zusammen, egal was in ihren Tags steht.
    expect(unitPathFor('music/Sampler/Kinderhits/01.mp3', index)).toBe(
      unitPathFor('music/Sampler/Kinderhits/01.mp3', index),
    );
  });
});

describe('unitPathFor — Ordner mit Unterordnern ist ein Navigationsordner', () => {
  const index = indexFor([
    'audiobooks/WasIstWas/Dinosaurier/01.mp3',
    'audiobooks/WasIstWas/Weltraum/01.mp3',
    'audiobooks/WasIstWas/Sonnensystem.m4b', // lose Datei daneben
  ]);

  it('makes a loose file in a navigation folder its own unit', () => {
    expect(unitPathFor('audiobooks/WasIstWas/Sonnensystem.m4b', index)).toBe(
      'audiobooks/WasIstWas/Sonnensystem.m4b',
    );
  });

  it('never produces the navigation folder itself as a unit', () => {
    const units = new Set(
      [
        'audiobooks/WasIstWas/Dinosaurier/01.mp3',
        'audiobooks/WasIstWas/Weltraum/01.mp3',
        'audiobooks/WasIstWas/Sonnensystem.m4b',
      ].map((f) => unitPathFor(f, index)),
    );
    // Genau der Catch-all-Fall, den die alte Regel erzeugt hat.
    expect(units.has('audiobooks/WasIstWas')).toBe(false);
  });

  it('makes a loose file directly under a root folder its own unit', () => {
    const rootIndex = indexFor([
      'audiobooks/WasIstWas/Dinosaurier/01.mp3',
      'audiobooks/Einzelhoerbuch.m4b',
    ]);
    expect(unitPathFor('audiobooks/Einzelhoerbuch.m4b', rootIndex)).toBe(
      'audiobooks/Einzelhoerbuch.m4b',
    );
  });
});

describe('unitPathFor — Datentraeger-Ordner', () => {
  const index = indexFor([
    'audiobooks/Lange Reihe/Der Schatz/CD1/01.mp3',
    'audiobooks/Lange Reihe/Der Schatz/CD1/02.mp3',
    'audiobooks/Lange Reihe/Der Schatz/CD2/01.mp3',
  ]);

  it('merges CD1 and CD2 into the parent unit', () => {
    expect(unitPathFor('audiobooks/Lange Reihe/Der Schatz/CD1/01.mp3', index)).toBe(
      'audiobooks/Lange Reihe/Der Schatz',
    );
    expect(unitPathFor('audiobooks/Lange Reihe/Der Schatz/CD2/01.mp3', index)).toBe(
      'audiobooks/Lange Reihe/Der Schatz',
    );
  });

  it('merges regardless of nesting depth — unlike the old 3-segment cap', () => {
    // Die alte Regel fasste CDs nur zusammen, wenn sie tief genug lagen.
    const shallow = indexFor(['audiobooks/Titel/CD1/01.mp3', 'audiobooks/Titel/CD2/01.mp3']);
    expect(unitPathFor('audiobooks/Titel/CD1/01.mp3', shallow)).toBe('audiobooks/Titel');
    expect(unitPathFor('audiobooks/Titel/CD2/01.mp3', shallow)).toBe('audiobooks/Titel');
  });

  it('does not make the parent a navigation folder', () => {
    // Datentraeger zaehlen nicht als "echte" Unterordner — sonst wuerden die
    // Dateien darin zu Einzelsongs statt zu Tracks der Einheit.
    expect(index.hasUnitSubdirs('audiobooks/Lange Reihe/Der Schatz')).toBe(false);
    expect(index.hasUnitSubdirs('audiobooks/Lange Reihe')).toBe(true);
  });

  it('still splits when a real folder sits next to the discs', () => {
    const mixed = indexFor([
      'audiobooks/Titel/CD1/01.mp3',
      'audiobooks/Titel/Bonusmaterial/01.mp3',
    ]);
    expect(mixed.hasUnitSubdirs('audiobooks/Titel')).toBe(true);
    // CD1 laeuft hoch auf "Titel", das ist jetzt ein Navigationsordner
    // -> die Datei wird ein Einzelsong.
    expect(unitPathFor('audiobooks/Titel/CD1/01.mp3', mixed)).toBe('audiobooks/Titel/CD1/01.mp3');
    expect(unitPathFor('audiobooks/Titel/Bonusmaterial/01.mp3', mixed)).toBe(
      'audiobooks/Titel/Bonusmaterial',
    );
  });
});

describe('unitPathFor — Randfaelle', () => {
  it('returns the file itself when it sits in the media root', () => {
    expect(unitPathFor('lose.mp3', EMPTY_DIRECTORY_INDEX)).toBe('lose.mp3');
  });

  it('treats every folder as a unit with an empty index', () => {
    // Fallback-Verhalten, wenn der Index nicht geladen werden konnte.
    expect(unitPathFor('audiobooks/WasIstWas/Dinosaurier/01.mp3', EMPTY_DIRECTORY_INDEX)).toBe(
      'audiobooks/WasIstWas/Dinosaurier',
    );
  });
});

describe('displayTitleFor', () => {
  it('uses the folder name for folder units', () => {
    expect(displayTitleFor('audiobooks/WasIstWas/Dinosaurier')).toBe('Dinosaurier');
    expect(displayTitleFor('music/Kinderlieder/Lieblingslieder')).toBe('Lieblingslieder');
  });

  it('ignores the Title tag for folder units — the folder name wins', () => {
    expect(displayTitleFor('audiobooks/WasIstWas/Dinosaurier', 'Ganz anderer Tag')).toBe(
      'Dinosaurier',
    );
  });

  it('uses the Title tag for single-file units', () => {
    expect(displayTitleFor('audiobooks/Einzelhoerbuch.m4b', 'Das grosse Abenteuer')).toBe(
      'Das grosse Abenteuer',
    );
  });

  it('falls back to the filename without extension when no Title tag', () => {
    expect(displayTitleFor('audiobooks/Einzelhoerbuch.m4b')).toBe('Einzelhoerbuch');
    expect(displayTitleFor('music/Ohne Tags/track-a.mp3', '  ')).toBe('track-a');
  });
});
