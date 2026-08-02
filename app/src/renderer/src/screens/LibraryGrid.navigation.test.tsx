import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { LibraryListResponse, MediaItem } from '@shared/ipc-contract';

vi.mock('../i18n/I18nContext', () => ({
  useT: () => (key: string) => key,
}));

vi.mock('../components/SyncStatusIcon', () => ({
  default: () => <div data-testid="sync-icon" />,
}));

vi.mock('./EmptyState', () => ({
  default: () => <div>Empty</div>,
}));

import LibraryGrid from './LibraryGrid';

/**
 * Verhalten der Ordner-Navigation (Ordnermodell E3).
 *
 * BackButton, HomeButton, FolderTile und MediaTile werden bewusst **nicht** gemockt —
 * geprüft werden soll ja gerade, dass die richtigen Kacheln entstehen und die richtigen
 * Rückrufe feuern.
 */
function unit(path: string, title = path.split('/').pop()!): MediaItem {
  return {
    path,
    type: path.startsWith('audiobooks/') ? 'audiobook' : 'music',
    title,
    progressPercent: 0,
    status: 'new',
  } as MediaItem;
}

const DATA: LibraryListResponse = {
  recentlyPlayed: [unit('audiobooks/WasIstWas/Dinosaurier')],
  all: [
    unit('audiobooks/WasIstWas/Dinosaurier'),
    unit('audiobooks/WasIstWas/Weltraum'),
    unit('audiobooks/WasIstWas/Sonnensystem.m4b', 'Sonnensystem'),
    unit('audiobooks/Einzelhoerbuch.m4b', 'Einzelhoerbuch'),
  ],
};

/** `Pressable` löst `onTap` über Pointer-Events aus, nicht über `click`. */
function tap(el: Element): void {
  fireEvent.pointerDown(el, { clientX: 0, clientY: 0 });
  fireEvent.pointerUp(el, { clientX: 0, clientY: 0 });
}

let onBack: ReturnType<typeof vi.fn>;
let onHome: ReturnType<typeof vi.fn>;
let onOpenFolder: ReturnType<typeof vi.fn>;
let onPlay: ReturnType<typeof vi.fn>;

function renderGrid(dir: string): ReturnType<typeof render> {
  return render(
    <LibraryGrid
      type="audiobook"
      data={DATA}
      dir={dir}
      onBack={onBack}
      onHome={onHome}
      onOpenFolder={onOpenFolder}
      onPlay={onPlay}
      onOpenDetail={vi.fn()}
    />,
  );
}

beforeEach(() => {
  onBack = vi.fn();
  onHome = vi.fn();
  onOpenFolder = vi.fn();
  onPlay = vi.fn();
  // @ts-expect-error - Testattrappe der IPC-Bruecke
  window.hoermond = { invoke: vi.fn().mockResolvedValue({}), on: vi.fn().mockReturnValue(vi.fn()) };
});

describe('LibraryGrid — Wurzelebene', () => {
  it('shows a folder tile instead of the units inside it', () => {
    renderGrid('audiobooks');

    expect(screen.getByText('WasIstWas')).toBeInTheDocument();
    // Die Einheiten darunter gehören auf die nächste Ebene, nicht hierher.
    expect(screen.queryByText('Weltraum')).not.toBeInTheDocument();
  });

  it('shows units that sit directly in this directory', () => {
    renderGrid('audiobooks');
    expect(screen.getByText('Einzelhoerbuch')).toBeInTheDocument();
  });

  it('shows the media type as title and no home button', () => {
    const { container } = renderGrid('audiobooks');

    expect(screen.getByText('start.audiobooks')).toBeInTheDocument();
    expect(container.querySelector('.home-button')).not.toBeInTheDocument();
  });

  it('shows the "recently played" shortcut section', () => {
    renderGrid('audiobooks');
    expect(screen.getByText('section.recentlyPlayed')).toBeInTheDocument();
    expect(screen.getByText('section.all')).toBeInTheDocument();
  });

  it('opens the folder on tap', () => {
    const { container } = renderGrid('audiobooks');

    const folder = container.querySelector('.tile--folder');
    expect(folder).toBeInTheDocument();
    tap(folder!);

    expect(onOpenFolder).toHaveBeenCalledWith('audiobooks/WasIstWas');
  });

  it('counts the units below a folder', () => {
    const { container } = renderGrid('audiobooks');
    expect(container.querySelector('.folder-count')?.textContent).toBe('3');
  });
});

describe('LibraryGrid — in einem Unterordner', () => {
  it('shows the folder name as title', () => {
    renderGrid('audiobooks/WasIstWas');
    expect(screen.getByText('WasIstWas')).toBeInTheDocument();
    expect(screen.queryByText('start.audiobooks')).not.toBeInTheDocument();
  });

  it('shows the units of that folder', () => {
    renderGrid('audiobooks/WasIstWas');
    expect(screen.getByText('Weltraum')).toBeInTheDocument();
    expect(screen.getByText('Sonnensystem')).toBeInTheDocument();
  });

  it('does not leak units from other folders', () => {
    renderGrid('audiobooks/WasIstWas');
    expect(screen.queryByText('Einzelhoerbuch')).not.toBeInTheDocument();
  });

  it('hides the "recently played" section and renames "all" to "contents"', () => {
    renderGrid('audiobooks/WasIstWas');
    // Die Abkürzung gehört auf die oberste Ebene; hier zeigte sie Einheiten,
    // die in diesem Ordner gar nicht liegen.
    expect(screen.queryByText('section.recentlyPlayed')).not.toBeInTheDocument();
    expect(screen.getByText('section.contents')).toBeInTheDocument();
  });

  it('shows the home button as an escape hatch', () => {
    const { container } = renderGrid('audiobooks/WasIstWas');

    const home = container.querySelector('.home-button');
    expect(home).toBeInTheDocument();
    tap(home!);
    expect(onHome).toHaveBeenCalledTimes(1);
  });

  it('keeps the back button in its fixed position left of home', () => {
    const { container } = renderGrid('audiobooks/WasIstWas');

    const back = container.querySelector('.back-button')!;
    const home = container.querySelector('.home-button')!;
    expect(back.compareDocumentPosition(home)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);

    tap(back);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('plays a unit on tap', () => {
    const { container } = renderGrid('audiobooks/WasIstWas');

    const tile = container.querySelector('.tile:not(.tile--folder)');
    tap(tile!);

    expect(onPlay).toHaveBeenCalledTimes(1);
    expect(onPlay.mock.calls[0]?.[0]?.path).toContain('audiobooks/WasIstWas/');
  });
});

describe('LibraryGrid — leere Ebene', () => {
  it('shows the empty state for a directory without content', () => {
    renderGrid('audiobooks/GibtEsNicht');
    expect(screen.getByText('Empty')).toBeInTheDocument();
  });
});
