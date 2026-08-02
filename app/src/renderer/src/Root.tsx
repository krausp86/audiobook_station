import { useEffect, useState, useMemo, useRef } from 'react';
import S0Welcome from './screens/S0Welcome';
import S1Start from './screens/S1Start';
import LibraryGrid from './screens/LibraryGrid';
import S4Detail from './screens/S4Detail';
import S5Player from './screens/S5Player';
import S9PinDialog from './screens/S9PinDialog';
import S10Settings from './screens/S10Settings';
import MiniPlayer from './components/MiniPlayer';
import BtToastBridge from './components/BtToastBridge';
import { parentDirOf, rootDirFor } from './lib/folder-tree';
import type { LibraryListResponse, MediaItem, PlayerState } from '@shared/ipc-contract';

type Screen =
  | { name: 's0' }
  | { name: 's1' }
  // `dir` ist das aktuell gezeigte Verzeichnis. Wurzel ist `audiobooks` bzw. `music`;
  // tiefere Ebenen entstehen durch Tap auf eine Ordner-Kachel (Ordnermodell E3).
  | { name: 'grid'; type: 'audiobook' | 'music'; dir: string }
  | { name: 's5'; item: MediaItem }
  | { name: 's9' }
  | { name: 's10' };

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

  // 3) Track player state for MiniPlayer + auto-navigate
  const [playerState, setPlayerState] = useState<PlayerState | null>(null);
  useEffect(() => {
    void window.hoermond.invoke('player:getState', undefined).then(setPlayerState);
    const off = window.hoermond.on('player:state', setPlayerState);
    return () => off();
  }, []);

  const playingItem = useMemo<MediaItem | null>(() => {
    if (!lib || !playerState?.currentUnitPath) return null;
    if (playerState.status === 'stopped') return null;
    const up = playerState.currentUnitPath;
    return [...lib.recentlyPlayed, ...lib.all].find(
      (m) => m.path === up,
    ) ?? null;
  }, [lib, playerState?.currentUnitPath, playerState?.status]);

  // 4) Auto-navigate to S5 on startup if resume started playback
  const resumeDoneRef = useRef(false);
  useEffect(() => {
    if (resumeDoneRef.current) return;
    if (!playingItem) return;
    if (screen?.name !== 's1') {
      resumeDoneRef.current = true;
      return;
    }
    resumeDoneRef.current = true;
    setScreen({ name: 's5', item: playingItem });
  }, [playingItem, screen]);

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

  /**
   * Verzeichnis, in dem eine Einheit liegt — Ziel der Zurück-Navigation aus dem Player.
   *
   * Der Unit-Pfad ist im Ordnermodell ein echter Pfad; das Elternverzeichnis ist also
   * genau die Ebene, auf der die Kachel stand. Sicherheitsnetz: Liegt die Einheit
   * unerwartet ohne Elternteil vor, wird die Wurzel des Typs genommen.
   */
  const dirOfUnit = (item: MediaItem): string => {
    const parent = item.path.split('/').slice(0, -1).join('/');
    return parent || rootDirFor(item.type);
  };

  if (!screen) return <div className="boot-screen" />; // loading frame

  return (
    <>
      {/* Bluetooth connection → Toast bridge (global, not screen-specific) */}
      <BtToastBridge />

      {screen.name === 's0' && <S0Welcome onDone={finishOnboarding} />}
      {screen.name === 's1' && (
        <S1Start
          onChoose={(type) => setScreen({ name: 'grid', type, dir: rootDirFor(type) })}
          onOpenParentGate={() => setScreen({ name: 's9' })}
        />
      )}
      {screen.name === 'grid' && (
        <LibraryGrid
          type={screen.type}
          data={filtered}
          dir={screen.dir}
          // Zurück führt eine Ebene hoch; auf der Wurzel zum Startscreen.
          onBack={() => {
            const parent = parentDirOf(screen.dir, screen.type);
            setScreen(parent ? { name: 'grid', type: screen.type, dir: parent } : { name: 's1' });
          }}
          onHome={() => setScreen({ name: 's1' })}
          onOpenFolder={(dir) => setScreen({ name: 'grid', type: screen.type, dir })}
          onPlay={openPlayer}
          onOpenDetail={(item) => setDetail(item)}
        />
      )}
      {screen.name === 's5' && (
        <S5Player
          item={screen.item}
          // Zurück aus dem Player führt in den Ordner, in dem die Einheit liegt —
          // nicht auf die Wurzel. Das Kind landet dort, wo es gestartet ist.
          onBack={() =>
            setScreen({
              name: 'grid',
              type: screen.item.type,
              dir: dirOfUnit(screen.item),
            })
          }
        />
      )}

      {screen.name === 's9' && (
        <S9PinDialog
          onSuccess={() => setScreen({ name: 's10' })}
          onClose={() => setScreen({ name: 's1' })}
        />
      )}

      {screen.name === 's10' && (
        <S10Settings onBack={() => setScreen({ name: 's1' })} />
      )}

      {/* MiniPlayer: shown on S1/Grid when something is playing */}
      {playingItem && screen?.name !== 's5' && screen?.name !== 's0' && screen?.name !== 's9' && screen?.name !== 's10' && (
        <MiniPlayer
          title={playingItem.title}
          status={playerState!.status}
          onPlayPause={() => {
            if (playerState?.status === 'stopped') {
              void window.hoermond.invoke('player:play', { path: playingItem.path });
            } else {
              void window.hoermond.invoke('player:pause', undefined);
            }
          }}
          onStop={() => {
            void window.hoermond.invoke('player:stop', undefined);
          }}
          onOpen={() => setScreen({ name: 's5', item: playingItem })}
        />
      )}

      {/* S4 overlay: above current screen, no new nav level */}
      {detail && <S4Detail item={detail} onClose={() => setDetail(null)} />}
    </>
  );
}
