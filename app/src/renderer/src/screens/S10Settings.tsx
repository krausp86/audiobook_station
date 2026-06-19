import { useEffect, useState } from 'react';
import { useT } from '../i18n/I18nContext';
import BackButton from '../components/BackButton';
import Pressable from '../components/Pressable';

/**
 * S10 Elterneinstellungen: Max-Lautstärke, PIN ändern, Rescan.
 * Platzhalter für BT-Verwaltung und Sync-Log (M6/M7).
 * Slate-Theme: visually separate adult area.
 */
interface S10Props {
  onBack: () => void;
}

export default function S10Settings({ onBack }: S10Props): React.JSX.Element {
  const t = useT();

  const [maxVolume, setMaxVolume] = useState(85);
  const [volumeLoading, setVolumeLoading] = useState(true);
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [pinMessage, setPinMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [rescanning, setRescanning] = useState(false);

  useEffect(() => {
    void window.hoermond
      .invoke('settings:getMaxVolume', undefined)
      .then(({ maxVolume: vol }) => {
        setMaxVolume(vol);
        setVolumeLoading(false);
      });
  }, []);

  const handleVolumeChange = (newVol: number): void => {
    const clamped = Math.max(0, Math.min(100, newVol));
    setMaxVolume(clamped);
    void window.hoermond.invoke('settings:setMaxVolume', { maxVolume: clamped });
  };

  const handleChangePinClick = async (): Promise<void> => {
    if (!currentPin || !newPin) return;

    const res = await window.hoermond.invoke('settings:changePin', {
      currentPin,
      newPin,
    });
    if (res.ok) {
      setPinMessage({ type: 'success', text: t('settings.changePin.success') });
      setCurrentPin('');
      setNewPin('');
      setTimeout(() => setPinMessage(null), 3000);
    } else if (res.reason === 'wrong_current') {
      setPinMessage({
        type: 'error',
        text: t('settings.changePin.wrongCurrent'),
      });
    } else if (res.reason === 'invalid_format') {
      setPinMessage({
        type: 'error',
        text: t('settings.changePin.invalidFormat'),
      });
    }
  };

  const handleRescan = async (): Promise<void> => {
    setRescanning(true);
    await window.hoermond.invoke('library:rescan', undefined);
    setTimeout(() => setRescanning(false), 2000);
  };

  const incrementVolume = (): void => handleVolumeChange(maxVolume + 5);
  const decrementVolume = (): void => handleVolumeChange(maxVolume - 5);

  return (
    <div className="s10-settings">
      <header className="s10-header">
        <BackButton onBack={onBack} ariaLabel={t('settings.back')} />
        <h1 className="t-heading s10-title">{t('settings.title')}</h1>
      </header>

      <div className="s10-content">
        <section className="s10-section">
          <h2 className="t-body s10-section-title">{t('settings.maxVolume')}</h2>
          {!volumeLoading && (
            <div className="s10-volume-control">
              <Pressable className="s10-volume-btn" onTap={decrementVolume}>
                <span className="t-label">−</span>
              </Pressable>
              <div className="s10-volume-display">
                <span className="t-heading">{maxVolume}%</span>
              </div>
              <Pressable className="s10-volume-btn" onTap={incrementVolume}>
                <span className="t-label">+</span>
              </Pressable>
            </div>
          )}
        </section>

        <section className="s10-section">
          <h2 className="t-body s10-section-title">{t('settings.changePin')}</h2>
          <div className="s10-pin-form">
            <div className="s10-pin-field">
              <label className="t-body s10-label">
                {t('settings.changePin.current')}
              </label>
              <input
                type="password"
                className="s10-input"
                value={currentPin}
                onChange={(e) => setCurrentPin(e.target.value)}
                maxLength={4}
                inputMode="numeric"
              />
            </div>
            <div className="s10-pin-field">
              <label className="t-body s10-label">{t('settings.changePin.new')}</label>
              <input
                type="password"
                className="s10-input"
                value={newPin}
                onChange={(e) => setNewPin(e.target.value)}
                maxLength={4}
                inputMode="numeric"
              />
            </div>
            <Pressable
              className="s10-pin-save"
              onTap={() => void handleChangePinClick()}
            >
              <span className="t-label">{t('settings.changePin.save')}</span>
            </Pressable>
            {pinMessage && (
              <p className={`s10-pin-message s10-pin-message--${pinMessage.type}`}>
                {pinMessage.text}
              </p>
            )}
          </div>
        </section>

        <section className="s10-section">
          <h2 className="t-body s10-section-title">{t('settings.rescan')}</h2>
          <Pressable className="s10-rescan-btn" onTap={() => void handleRescan()}>
            <span className="t-label">
              {rescanning ? t('settings.rescan.triggered') : t('settings.rescan')}
            </span>
          </Pressable>
        </section>

        <section className="s10-section">
          <h2 className="t-body s10-section-title">{t('settings.bluetooth')}</h2>
          <p className="t-tiny s10-placeholder">{t('settings.bluetooth.placeholder')}</p>
        </section>

        <section className="s10-section">
          <h2 className="t-body s10-section-title">{t('settings.syncLog')}</h2>
          <p className="t-tiny s10-placeholder">{t('settings.syncLog.placeholder')}</p>
        </section>
      </div>
    </div>
  );
}
