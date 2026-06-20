import { useEffect } from 'react';
import { useT } from '../i18n/I18nContext';
import { useToast } from './ToastProvider';

/**
 * Global Bluetooth connection event → Toast bridge.
 *
 * Listens for `bt:connection` events and displays appropriate toasts.
 * This is a single, app-wide listener to avoid duplicate toasts.
 * Individual screens (S5, S7) can listen to bt:connection for state updates,
 * but only this component emits toasts.
 *
 * Toast text format: "{device-name} verbunden" or "{device-name} getrennt"
 */
export default function BtToastBridge(): React.JSX.Element | null {
  const t = useT();
  const { showToast } = useToast();

  useEffect(() => {
    const off = window.hoermond.on('bt:connection', (e) => {
      // Get device name or fallback
      const deviceName = e.device?.name ?? 'Gerät';

      // Select appropriate string key
      const key =
        e.event === 'connected'
          ? 'bt.toast.connected'
          : 'bt.toast.disconnected';

      // Show toast with device name substituted
      const text = t(key).replace('{device}', deviceName);
      showToast(text);
    });

    return () => off();
  }, [t, showToast]);

  // This component renders nothing; it's purely for side effects
  return null;
}
