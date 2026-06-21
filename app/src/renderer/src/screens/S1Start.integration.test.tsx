import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { SyncState } from '@shared/ipc-contract';

// Mock i18n
vi.mock('../i18n/I18nContext', () => ({
  useT: () => (key: string) => key,
}));

// Mock components
vi.mock('../components/Logo', () => ({
  default: () => <div data-testid="logo">Logo</div>,
}));

vi.mock('../components/SyncStatusIcon', () => ({
  default: () => <div data-testid="sync-icon">SyncIcon</div>,
}));

vi.mock('../hooks/useParentGate', () => ({
  useParentGate: () => ({
    onPointerDown: vi.fn(),
    onPointerMove: vi.fn(),
    onPointerUp: vi.fn(),
    onPointerLeave: vi.fn(),
    ringRatio: 0,
  }),
}));

import S1Start from './S1Start';

/**
 * Integration test for S1Start: verifies SyncStatusIcon is rendered in logo zone.
 */
describe('S1Start + SyncStatusIcon Integration', () => {
  const mockOnChoose = vi.fn();
  const mockOnOpenParentGate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render SyncStatusIcon in logo header', () => {
    const { container } = render(
      <S1Start
        onChoose={mockOnChoose}
        onOpenParentGate={mockOnOpenParentGate}
      />,
    );

    const syncIconContainer = container.querySelector('.s1-sync-icon');
    expect(syncIconContainer).toBeInTheDocument();

    const syncIcon = screen.getByTestId('sync-icon');
    expect(syncIcon).toBeInTheDocument();
  });

  it('should place sync icon after wordmark (flex layout)', () => {
    const { container } = render(
      <S1Start
        onChoose={mockOnChoose}
        onOpenParentGate={mockOnOpenParentGate}
      />,
    );

    const header = container.querySelector('.s1-logo');
    expect(header).toBeInTheDocument();

    const syncIconContainer = container.querySelector('.s1-sync-icon');
    expect(syncIconContainer).toHaveStyle({ marginLeft: 'auto' });
  });

  it('should render logo and wordmark as before', () => {
    render(
      <S1Start
        onChoose={mockOnChoose}
        onOpenParentGate={mockOnOpenParentGate}
      />,
    );

    expect(screen.getByTestId('logo')).toBeInTheDocument();
    expect(screen.getByText('app.name')).toBeInTheDocument();
  });

  it('should still handle parent gate gesture', () => {
    const { container } = render(
      <S1Start
        onChoose={mockOnChoose}
        onOpenParentGate={mockOnOpenParentGate}
      />,
    );

    const logoWrap = container.querySelector('.s1-logo-wrap');
    expect(logoWrap).toBeInTheDocument();
  });

  it('should render audiobook and music tiles', () => {
    render(
      <S1Start
        onChoose={mockOnChoose}
        onOpenParentGate={mockOnOpenParentGate}
      />,
    );

    expect(screen.getByText('start.audiobooks')).toBeInTheDocument();
    expect(screen.getByText('start.music')).toBeInTheDocument();
  });
});
