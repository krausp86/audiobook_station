import { useEffect, useState } from 'react';
import { useT } from '../i18n/I18nContext';
import BackButton from '../components/BackButton';
import Pressable from '../components/Pressable';

interface S10Props {
  onBack: () => void;
}

type PinStep = 'idle' | 'enter-current' | 'enter-new';

const PAD_DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];

function PinPad({
  label,
  onComplete,
  onCancel,
  verify,
}: {
  label: string;
  onComplete: (pin: string) => void;
  onCancel: () => void;
  verify?: (pin: string) => Promise<boolean>;
}): React.JSX.Element {
  const t = useT();
  const [entry, setEntry] = useState('');
  const [wrong, setWrong] = useState(false);

  const appendDigit = (d: string): void => {
    if (entry.length >= 4 || wrong) return;
    const next = entry + d;
    setEntry(next);
    if (next.length === 4) {
      if (verify) {
        void verify(next).then((ok) => {
          if (ok) { onComplete(next); }
          else { setWrong(true); }
        });
      } else {
        onComplete(next);
      }
    }
  };

  useEffect(() => {
    if (!wrong) return undefined;
    const id = setTimeout(() => { setEntry(''); setWrong(false); }, 200);
    return () => clearTimeout(id);
  }, [wrong]);

  return (
    <div className="s10-pin-pad-overlay">
      <div className="s10-pin-pad-card">
        <p className="t-body s10-pin-pad-label">{label}</p>
        <div className={`s9-dots${wrong ? ' is-wrong' : ''}`}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className={`s9-dot${i < entry.length ? ' is-filled' : ''}`} />
          ))}
        </div>
        <div className="s9-pad">
          {PAD_DIGITS.map((digit) => (
            <Pressable key={digit} className="s9-pad-button" onTap={() => appendDigit(digit)}>
              <span className="t-label">{digit}</span>
            </Pressable>
          ))}
          <Pressable className="s9-pad-delete" onTap={() => setEntry(entry.slice(0, -1))}>
            <span className="t-label">{t('pin.delete')}</span>
          </Pressable>
        </div>
        <Pressable className="s10-pin-pad-cancel" onTap={onCancel}>
          <span className="t-label">{t('pin.close')}</span>
        </Pressable>
      </div>
    </div>
  );
}

export default function S10Settings({ onBack }: S10Props): React.JSX.Element {
  const t = useT();

  const [maxVolume, setMaxVolume] = useState(85);
  const [volumeLoading, setVolumeLoading] = useState(true);
  const [pinStep, setPinStep] = useState<PinStep>('idle');
  const [storedCurrentPin, setStoredCurrentPin] = useState('');
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

  const handleCurrentPinEntered = (pin: string): void => {
    setStoredCurrentPin(pin);
    setPinStep('enter-new');
  };

  const handleNewPinEntered = (newPin: string): void => {
    void window.hoermond.invoke('settings:changePin', {
      currentPin: storedCurrentPin,
      newPin,
    }).then((res) => {
      if (res.ok) {
        setPinMessage({ type: 'success', text: t('settings.changePin.success') });
        setTimeout(() => setPinMessage(null), 3000);
      } else if (res.reason === 'wrong_current') {
        setPinMessage({ type: 'error', text: t('settings.changePin.wrongCurrent') });
      } else if (res.reason === 'invalid_format') {
        setPinMessage({ type: 'error', text: t('settings.changePin.invalidFormat') });
      }
      setPinStep('idle');
      setStoredCurrentPin('');
    });
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
          <Pressable className="s10-pin-start-btn" onTap={() => setPinStep('enter-current')}>
            <span className="t-label">{t('settings.changePin')}</span>
          </Pressable>
          {pinMessage && (
            <p className={`s10-pin-message s10-pin-message--${pinMessage.type}`}>
              {pinMessage.text}
            </p>
          )}
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

      {pinStep === 'enter-current' && (
        <PinPad
          label={t('settings.changePin.current')}
          onComplete={handleCurrentPinEntered}
          onCancel={() => setPinStep('idle')}
          verify={async (pin) => {
            const { ok } = await window.hoermond.invoke('settings:verifyPin', { pin });
            return ok;
          }}
        />
      )}
      {pinStep === 'enter-new' && (
        <PinPad
          label={t('settings.changePin.new')}
          onComplete={handleNewPinEntered}
          onCancel={() => setPinStep('idle')}
        />
      )}
    </div>
  );
}
