import { useEffect, useState } from 'react';
import { useT } from '../i18n/I18nContext';
import Pressable from '../components/Pressable';
import type { BtDevice, BtStatus } from '@shared/bt';

/**
 * S7 Bluetooth Dialog: modal overlay for Bluetooth device management.
 *
 * Features:
 * - Display currently connected device
 * - List all paired devices with connect/disconnect buttons
 * - Scan for new devices with progress indicator (30s)
 * - Pair and connect newly found devices
 * - Modal pattern: scrim, enter 220ms, exit 160ms, tap outside closes
 */
interface S7Props {
  onClose: () => void;
}

interface DiscoveredDevice extends BtDevice {
  pairing?: boolean; // Loading state during pair attempt
}

export default function S7Bluetooth({ onClose }: S7Props): React.JSX.Element {
  const t = useT();
  const [entered, setEntered] = useState(false);
  const [closing, setClosing] = useState(false);
  const [status, setStatus] = useState<BtStatus | null>(null);
  const [paired, setPaired] = useState<BtDevice[]>([]);
  const [scanning, setScanning] = useState(false);
  const [discovered, setDiscovered] = useState<DiscoveredDevice[]>([]);
  const [scanProgress, setScanProgress] = useState(0);

  // Entry animation
  useEffect(() => {
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, []);

  // Load initial status and paired devices
  useEffect(() => {
    const loadData = async (): Promise<void> => {
      try {
        const [statusRes, pairedRes] = await Promise.all([
          window.hoermond.invoke('bt:getStatus', undefined),
          window.hoermond.invoke('bt:listPaired', undefined),
        ]);
        setStatus(statusRes);
        setPaired(pairedRes.devices);
      } catch (err) {
        console.error('[S7] loadData failed:', err);
      }
    };
    void loadData();

    // Subscribe to connection events and update status
    const off = window.hoermond.on('bt:connection', (e) => {
      setStatus((prev) =>
        prev
          ? { ...prev, connected: e.device }
          : { poweredOn: true, connected: e.device },
      );
    });
    return () => off();
  }, []);

  const close = (): void => {
    if (closing) return;
    setClosing(true);
    setTimeout(onClose, 160); // Exit: 160ms fade
  };

  /**
   * Start a 30-second scan for new Bluetooth devices.
   * Shows progress and discovered devices in real-time.
   */
  const handleScan = async (): Promise<void> => {
    if (scanning) return;
    setScanning(true);
    setDiscovered([]);
    setScanProgress(0);

    // Simulate progress while scanning (real completion comes from API)
    const progressInterval = setInterval(() => {
      setScanProgress((prev) => Math.min(prev + 3, 95));
    }, 300);

    try {
      const result = await window.hoermond.invoke('bt:scan', {
        durationMs: 30000,
      });
      setDiscovered(result.devices);
      setScanProgress(100);
    } catch (err) {
      console.error('[S7] scan failed:', err);
    } finally {
      clearInterval(progressInterval);
      setScanning(false);
    }
  };

  /**
   * Pair and connect to a newly discovered device.
   */
  const handlePairAndConnect = async (mac: string): Promise<void> => {
    // Mark as pairing
    setDiscovered((prev) =>
      prev.map((d) => (d.mac === mac ? { ...d, pairing: true } : d)),
    );

    try {
      // Step 1: Pair
      const pairRes = await window.hoermond.invoke('bt:pair', { mac });
      if (!pairRes.ok) {
        console.error('[S7] pair failed for', mac);
        setDiscovered((prev) =>
          prev.map((d) => (d.mac === mac ? { ...d, pairing: false } : d)),
        );
        return;
      }

      // Step 2: Connect
      const connectRes = await window.hoermond.invoke('bt:connect', { mac });
      if (!connectRes.ok) {
        console.error('[S7] connect failed for', mac);
        setDiscovered((prev) =>
          prev.map((d) => (d.mac === mac ? { ...d, pairing: false } : d)),
        );
        return;
      }

      // Success: refresh paired list
      const pairedRes = await window.hoermond.invoke('bt:listPaired', undefined);
      setPaired(pairedRes.devices);
      setDiscovered((prev) => prev.filter((d) => d.mac !== mac));
    } catch (err) {
      console.error('[S7] pairAndConnect failed:', err);
      setDiscovered((prev) =>
        prev.map((d) => (d.mac === mac ? { ...d, pairing: false } : d)),
      );
    }
  };

  /**
   * Connect to an already-paired device.
   */
  const handleConnect = async (mac: string): Promise<void> => {
    try {
      const res = await window.hoermond.invoke('bt:connect', { mac });
      if (res.ok) {
        // Status will update via bt:connection event
      } else {
        console.error('[S7] connect failed for', mac);
      }
    } catch (err) {
      console.error('[S7] connect error:', err);
    }
  };

  /**
   * Disconnect from the currently connected device.
   */
  const handleDisconnect = async (mac: string): Promise<void> => {
    try {
      const res = await window.hoermond.invoke('bt:disconnect', { mac });
      if (res.ok) {
        // Status will update via bt:connection event
      } else {
        console.error('[S7] disconnect failed for', mac);
      }
    } catch (err) {
      console.error('[S7] disconnect error:', err);
    }
  };

  return (
    <div
      className={`s7-scrim${closing ? ' is-closing' : ''}${entered ? ' is-entered' : ''}`}
      onPointerDown={close}
    >
      <div className="s7-card" onPointerDown={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="s7-header">
          <h2 className="t-heading s7-title">{t('bt.title')}</h2>
          <Pressable className="s7-close" onTap={close}>
            <span className="visually-hidden">{t('bt.close')}</span>
            <span aria-hidden="true">✕</span>
          </Pressable>
        </div>

        {/* Content scroll area */}
        <div className="s7-content">
          {/* Currently connected device section */}
          {status && (
            <section className="s7-section">
              <h3 className="t-body s7-section-label">{t('bt.connected')}</h3>
              {status.connected ? (
                <div className="s7-device-card">
                  <div className="s7-device-name">{status.connected.name}</div>
                  <Pressable
                    className="s7-device-action"
                    onTap={() => void handleDisconnect(status.connected!.mac)}
                  >
                    <span className="t-label">{t('bt.disconnect')}</span>
                  </Pressable>
                </div>
              ) : (
                <p className="t-tiny s7-no-device">{t('bt.noDevice')}</p>
              )}
            </section>
          )}

          {/* Paired devices section */}
          <section className="s7-section">
            <h3 className="t-body s7-section-label">{t('bt.paired')}</h3>
            {paired.length > 0 ? (
              <div className="s7-device-list">
                {paired.map((device) => (
                  <div key={device.mac} className="s7-device-card">
                    <div className="s7-device-name">{device.name}</div>
                    {device.connected ? (
                      <Pressable
                        className="s7-device-action"
                        onTap={() => void handleDisconnect(device.mac)}
                      >
                        <span className="t-label">{t('bt.disconnect')}</span>
                      </Pressable>
                    ) : (
                      <Pressable
                        className="s7-device-action"
                        onTap={() => void handleConnect(device.mac)}
                      >
                        <span className="t-label">{t('bt.connect')}</span>
                      </Pressable>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="t-tiny s7-no-devices">{t('bt.noDevice')}</p>
            )}
          </section>

          {/* Scan for new device */}
          {!scanning ? (
            <section className="s7-section">
              <Pressable
                className="s7-scan-btn"
                onTap={() => void handleScan()}
              >
                <span className="t-label">{t('bt.pairNew')}</span>
              </Pressable>
            </section>
          ) : (
            <section className="s7-section">
              <div className="s7-scan-header">
                <h3 className="t-body s7-section-label">{t('bt.scanning')}</h3>
                <div className="s7-scan-progress">
                  <div
                    className="s7-scan-ring"
                    style={{
                      background: `conic-gradient(var(--flieder-deep) ${scanProgress}%, var(--flieder-tint) ${scanProgress}%)`,
                    }}
                  />
                </div>
              </div>

              {discovered.length > 0 ? (
                <div className="s7-device-list">
                  {discovered.map((device) => (
                    <div key={device.mac} className="s7-device-card">
                      <div className="s7-device-name">{device.name}</div>
                      <Pressable
                        className={`s7-device-action${device.pairing ? ' is-loading' : ''}`}
                        onTap={() => void handlePairAndConnect(device.mac)}
                        disabled={device.pairing}
                      >
                        <span className="t-label">
                          {device.pairing ? '…' : t('bt.connect')}
                        </span>
                      </Pressable>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="t-tiny s7-no-results">{t('bt.scanNoResults')}</p>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
