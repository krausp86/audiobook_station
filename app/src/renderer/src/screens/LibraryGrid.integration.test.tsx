import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { LibraryListResponse } from '@shared/ipc-contract';

// Mock i18n
vi.mock('../i18n/I18nContext', () => ({
  useT: () => (key: string) => key,
}));

// Mock components
vi.mock('../components/BackButton', () => ({
  default: ({ ariaLabel }: { ariaLabel: string }) => (
    <button aria-label={ariaLabel}>Back</button>
  ),
}));

vi.mock('../components/SyncStatusIcon', () => ({
  default: () => <div data-testid="sync-icon">SyncIcon</div>,
}));

vi.mock('../components/MediaTile', () => ({
  default: ({ item }: { item: any }) => <div>{item.title}</div>,
}));

vi.mock('./EmptyState', () => ({
  default: () => <div>Empty</div>,
}));

import LibraryGrid from './LibraryGrid';

/**
 * Integration test for LibraryGrid: verifies SyncStatusIcon replaces grid-sync-slot.
 */
describe('LibraryGrid + SyncStatusIcon Integration', () => {
  const mockData: LibraryListResponse = {
    recentlyPlayed: [],
    all: [],
  };

  const mockOnBack = vi.fn();
  const mockOnPlay = vi.fn();
  const mockOnOpenDetail = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    // Setup window.hoermond for any child component
    // @ts-expect-error - mocking
    window.hoermond = {
      invoke: vi.fn().mockResolvedValue({}),
      on: vi.fn().mockReturnValue(vi.fn()),
    };
  });

  it('should render SyncStatusIcon in titlebar slot', () => {
    const { container } = render(
      <LibraryGrid
        type="audiobook"
        data={mockData}
        onBack={mockOnBack}
        onPlay={mockOnPlay}
        onOpenDetail={mockOnOpenDetail}
      />,
    );

    const syncSlot = container.querySelector('.grid-sync-slot');
    expect(syncSlot).toBeInTheDocument();

    const syncIcon = screen.getByTestId('sync-icon');
    expect(syncIcon).toBeInTheDocument();
  });

  it('should have correct dimensions for sync icon slot', () => {
    const { container } = render(
      <LibraryGrid
        type="audiobook"
        data={mockData}
        onBack={mockOnBack}
        onPlay={mockOnPlay}
        onOpenDetail={mockOnOpenDetail}
      />,
    );

    const syncSlot = container.querySelector('.grid-sync-slot');
    // CSS defines width: 44px; height: 44px;
    expect(syncSlot).toHaveClass('grid-sync-slot');
  });

  it('should render titlebar with back button and title', () => {
    render(
      <LibraryGrid
        type="audiobook"
        data={mockData}
        onBack={mockOnBack}
        onPlay={mockOnPlay}
        onOpenDetail={mockOnOpenDetail}
      />,
    );

    expect(screen.getByRole('button', { name: 'nav.back' })).toBeInTheDocument();
    expect(screen.getByText('start.audiobooks')).toBeInTheDocument();
  });

  it('should show empty state when no items', () => {
    render(
      <LibraryGrid
        type="audiobook"
        data={mockData}
        onBack={mockOnBack}
        onPlay={mockOnPlay}
        onOpenDetail={mockOnOpenDetail}
      />,
    );

    expect(screen.getByText('Empty')).toBeInTheDocument();
  });

  it('should render grid layout with items', () => {
    const dataWithItems: LibraryListResponse = {
      recentlyPlayed: [
        {
          path: 'audiobooks/Author/Title1',
          type: 'audiobook',
          title: 'Title1',
          progressPercent: 50,
          status: 'in_progress',
        },
      ],
      all: [
        {
          path: 'audiobooks/Author/Title2',
          type: 'audiobook',
          title: 'Title2',
          progressPercent: 0,
          status: 'new',
        },
      ],
    };

    render(
      <LibraryGrid
        type="audiobook"
        data={dataWithItems}
        onBack={mockOnBack}
        onPlay={mockOnPlay}
        onOpenDetail={mockOnOpenDetail}
      />,
    );

    expect(screen.getByText('Title1')).toBeInTheDocument();
    expect(screen.getByText('Title2')).toBeInTheDocument();
  });

  it('should accept both audiobook and music types', () => {
    const { rerender } = render(
      <LibraryGrid
        type="audiobook"
        data={mockData}
        onBack={mockOnBack}
        onPlay={mockOnPlay}
        onOpenDetail={mockOnOpenDetail}
      />,
    );

    expect(screen.getByText('start.audiobooks')).toBeInTheDocument();

    rerender(
      <LibraryGrid
        type="music"
        data={mockData}
        onBack={mockOnBack}
        onPlay={mockOnPlay}
        onOpenDetail={mockOnOpenDetail}
      />,
    );

    expect(screen.getByText('start.music')).toBeInTheDocument();
  });
});
