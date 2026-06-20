/**
 * Shared Bluetooth types for IPC communication between Electron Main and Renderer.
 *
 * These types represent the Bluetooth device model and connection status,
 * used across all Bluetooth-related IPC commands and events.
 */

/**
 * Represents a Bluetooth device.
 *
 * @property mac - MAC address in format "AA:BB:CC:DD:EE:FF"
 * @property name - Human-readable device name, or MAC as fallback
 * @property paired - Whether the device is already paired with the adapter
 * @property connected - Whether the device is currently connected
 */
export interface BtDevice {
  mac: string;
  name: string;
  paired: boolean;
  connected: boolean;
}

/**
 * Snapshot of the Bluetooth adapter's current state.
 *
 * @property poweredOn - Whether the Bluetooth adapter is powered on
 * @property connected - The currently connected device (if any); null if no device connected
 */
export interface BtStatus {
  poweredOn: boolean;
  connected: BtDevice | null;
}
