import { useEffect, useState, useMemo } from 'react';
import S0Welcome from './screens/S0Welcome';
import S1Start from './screens/S1Start';
import LibraryGrid from './screens/LibraryGrid';
import S4Detail from './screens/S4Detail';
import S5Player from './screens/S5Player';
import type { LibraryListResponse, MediaItem } from '@shared/ipc-contract';

type Screen =
  | { name: 's0' }
  | { name: 's1' }
  | { name: 'grid'; type: 'audiobook' | 'music' }
  | { name: 's5'; item: MediaItem };

/**
 * Root navigation component: manages screen state, onboarding, library loading,
 * and S4 overlay. Orchestrates all M3 navigation and library interactions.
 */
export default function Root(): React.JSX.Element {
  const [screen, setScreen] = useState<Screen | null>(null); // null = loading onboarding
  const [lib, setLib] = useState<LibraryListResponse | null>(null);
  const [detail, setDetail] = useState<MediaItem | null>(null); // S4 overlay

  // 1) Load onboarding flag -> S0 or S1
  useEffect(() => {
    void window.hoermond.invoke('onboarding:getSeen', undefined).then(({ seen }) => {
      setScreen(seen ? { name: 's1' } : { name: 's0' });
    });
  }, []);

  // 2) Load library + listen for updates
  const loadLib = (): void => {
    void window.hoermond.invoke('library:list', undefined).then(setLib);
  };

  useEffect(() => {
    loadLib();
    const off = window.hoermond.on('library:updated', loadLib);
    return () => off();
  }, []);

  // 3) Auto-navigate to S5 if resume started playback before renderer loaded
  const [resumeChecked, setResumeChecked] = useState(false);
  useEffect(() => {
    if (resumeChecked || !lib) return;
    setResumeChecked(true);
    void window.hoermond.invoke('player:getState', undefined).then((state) => {
      if (state.status !== 'playing' || !state.currentPath) return;
      const cp = state.currentPath!;
      const match = [...lib.recentlyPlayed, ...lib.all].find(
        (m) => cp === m.path || cp.startsWith(m.path + '/'),
      );
      if (match) setScreen({ name: 's5', item: match });
    });
  }, [lib, resumeChecked]);

  // S0 done -> set flag + go to S1
  const finishOnboarding = (): void => {
    void window.hoermond.invoke('onboarding:setSeen', { seen: true });
    setScreen({ name: 's1' });
  };

  // Filter library by type (S2/S3)
  const filtered = useMemo<LibraryListResponse>(() => {
    if (!lib || !screen || screen.name !== 'grid') {
      return { recentlyPlayed: [], all: [] };
    }
    const ty = screen.type;
    return {
      recentlyPlayed: lib.recentlyPlayed.filter((m) => m.type === ty),
      all: lib.all.filter((m) => m.type === ty),
    };
  }, [lib, screen]);

  // Tap on tile -> open S5 Player screen
  const openPlayer = (item: MediaItem): void => {
    setScreen({ name: 's5', item });
  };

  if (!screen) return <div className="boot-screen" />; // loading frame

  return (
    <>
      {screen.name === 's0' && <S0Welcome onDone={finishOnboarding} />}
      {screen.name === 's1' && (
        <S1Start onChoose={(type) => setScreen({ name: 'grid', type })} />
      )}
      {screen.name === 'grid' && (
        <LibraryGrid
          type={screen.type}
          data={filtered}
          onBack={() => setScreen({ name: 's1' })}
          onPlay={openPlayer}
          onOpenDetail={(item) => setDetail(item)}
        />
      )}
      {screen.name === 's5' && (
        <S5Player
          item={screen.item}
          onBack={() =>
            setScreen({ name: 'grid', type: screen.item.type })
          }
        />
      )}

      {/* S4 overlay: above current screen, no new nav level */}
      {detail && <S4Detail item={detail} onClose={() => setDetail(null)} />}
    </>
  );
}
