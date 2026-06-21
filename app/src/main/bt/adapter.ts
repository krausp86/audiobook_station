import { execFile } from 'child_process';
import { promisify } from 'util';
import type { BtDevice, BtStatus } from '@shared/bt';

const execFileAsync = promisify(execFile);

/**
 * MAC address validation regex.
 * Ensures MAC addresses are in the format AA:BB:CC:DD:EE:FF.
 */
const MAC_REGEX = /^[0-9A-Fa-f]{2}(:[0-9A-Fa-f]{2}){5}$/;

/**
 * Validates a MAC address format.
 * @param mac - MAC address to validate
 * @returns true if MAC is valid, false otherwise
 */
function isValidMac(mac: string): boolean {
  return MAC_REGEX.test(mac);
}

/**
 * Bluetooth adapter — encapsulates all BlueZ operations via bluetoothctl CLI.
 *
 * All methods delegate to the `bluetoothctl` command-line tool (no native D-Bus library).
 * All commands run as the `player` user without sudo (permissions configured in T6.P2).
 *
 * Error handling: parse failures return safe defaults (false, null, or empty list) without throwing.
 * This allows graceful degradation if bluetoothctl output is malformed.
 */
class BtAdapter {
  /**
   * Get current Bluetooth adapter status (powered on/off, connected device if any).
   *
   * Runs:
   * - `bluetoothctl show` to check if powered
   * - `bluetoothctl info <mac>` on each paired device to check connection status
   *
   * @returns Bluetooth status snapshot
   */
  async getStatus(): Promise<BtStatus> {
    try {
      // Check if powered on
      const { stdout: showOut } = await execFileAsync('bluetoothctl', ['show']);
      const poweredOn = /^\s*Powered:\s+yes/m.test(showOut);

      if (!poweredOn) {
        return { poweredOn: false, connected: null };
      }

      // Get all paired devices and check which one is connected
      const paired = await this.listPaired();
      let connectedDevice: BtDevice | null = null;

      for (const device of paired) {
        try {
          const { stdout: infoOut } = await execFileAsync('bluetoothctl', [
            'info',
            device.mac,
          ]);
          const connected = /^\s*Connected:\s+yes/m.test(infoOut);
          if (connected) {
            connectedDevice = { ...device, connected: true };
            break;
          }
        } catch {
          // Skip devices that fail to query
        }
      }

      return { poweredOn: true, connected: connectedDevice };
    } catch (err) {
      console.error('[bt] getStatus failed:', err);
      return { poweredOn: false, connected: null };
    }
  }

  /**
   * List all paired Bluetooth devices.
   *
   * Runs `bluetoothctl devices Paired` and parses output:
   * ```
   * Device AA:BB:CC:DD:EE:FF Device Name
   * Device XX:YY:ZZ:... Another Device
   * ```
   *
   * @returns List of paired devices (connected status will be false unless explicitly checked)
   */
  async listPaired(): Promise<BtDevice[]> {
    try {
      const { stdout } = await execFileAsync('bluetoothctl', ['devices', 'Paired']);
      const devices: BtDevice[] = [];

      for (const line of stdout.trim().split('\n')) {
        if (!line.trim()) continue;
        const match = /^Device\s+([0-9A-Fa-f:]+)\s+(.+)$/.exec(line);
        if (match) {
          const [, mac, name] = match;
          if (isValidMac(mac)) {
            devices.push({
              mac,
              name: name.trim(),
              paired: true,
              connected: false, // Will be filled in by getStatus()
            });
          }
        }
      }

      return devices;
    } catch (err) {
      console.error('[bt] listPaired failed:', err);
      return [];
    }
  }

  /**
   * Scan for available Bluetooth devices for a specified duration.
   *
   * Runs `bluetoothctl --timeout <s> scan on` and parses stdout for:
   * ```
   * [NEW] Device AA:BB:CC:DD:EE:FF Device Name
   * ```
   *
   * Note: Already-paired devices will NOT appear as [NEW].
   * The scan runs in a subprocess with timeout wrapper.
   *
   * @param durationMs - Scan duration in milliseconds (default: 30000)
   * @returns List of discovered devices (paired: false, connected: false)
   */
  async scan(durationMs: number = 30000): Promise<BtDevice[]> {
    try {
      const durationSec = Math.ceil(durationMs / 1000);
      const devices: BtDevice[] = [];
      const seenMacs = new Set<string>();

      const { stdout } = await execFileAsync('bluetoothctl', [
        '--timeout',
        String(durationSec),
        'scan',
        'on',
      ]);

      // Parse [NEW] Device lines
      for (const line of stdout.split('\n')) {
        const match = /\[NEW\]\s+Device\s+([0-9A-Fa-f:]+)\s+(.+)/.exec(line);
        if (match) {
          const [, mac, name] = match;
          if (isValidMac(mac) && !seenMacs.has(mac)) {
            seenMacs.add(mac);
            devices.push({
              mac,
              name: name.trim(),
              paired: false,
              connected: false,
            });
          }
        }
      }

      return devices;
    } catch (err) {
      console.error('[bt] scan failed:', err);
      return [];
    }
  }

  /**
   * Pair and trust a Bluetooth device for autoconnect.
   *
   * **Important:** pair() must always be followed by trust() for autoconnect to work on next boot.
   * Both operations are performed in this method.
   *
   * Runs:
   * 1. `bluetoothctl pair <mac>` → expects "Pairing successful"
   * 2. `bluetoothctl trust <mac>` → expects "trust succeeded"
   *
   * @param mac - MAC address to pair (must be valid format)
   * @returns { ok: true } if both pair and trust succeeded, { ok: false } otherwise
   */
  async pair(mac: string): Promise<{ ok: boolean }> {
    if (!isValidMac(mac)) {
      console.error('[bt] pair: invalid MAC format', mac);
      return { ok: false };
    }

    try {
      // Step 1: pair
      const { stdout: pairOut } = await execFileAsync('bluetoothctl', ['pair', mac]);
      if (!/Pairing successful/.test(pairOut)) {
        console.warn('[bt] pair: pairing did not report success for', mac);
        return { ok: false };
      }

      // Step 2: trust (required for autoconnect on next boot)
      const { stdout: trustOut } = await execFileAsync('bluetoothctl', ['trust', mac]);
      if (!/trust succeeded|Changing.*trust succeeded/.test(trustOut)) {
        console.warn('[bt] pair: trust did not report success for', mac);
        return { ok: false };
      }

      return { ok: true };
    } catch (err) {
      console.error('[bt] pair failed for', mac, ':', err);
      return { ok: false };
    }
  }

  /**
   * Connect to a paired Bluetooth device.
   *
   * Runs `bluetoothctl connect <mac>` → expects "Connection successful"
   *
   * @param mac - MAC address to connect (must be valid format, must be paired first)
   * @returns { ok: true } if connection succeeded, { ok: false } otherwise
   */
  async connect(mac: string): Promise<{ ok: boolean }> {
    if (!isValidMac(mac)) {
      console.error('[bt] connect: invalid MAC format', mac);
      return { ok: false };
    }

    try {
      const { stdout } = await execFileAsync('bluetoothctl', ['connect', mac]);
      if (/Connection successful/.test(stdout)) {
        return { ok: true };
      }
      console.warn('[bt] connect: command did not report success for', mac);
      return { ok: false };
    } catch (err) {
      console.error('[bt] connect failed for', mac, ':', err);
      return { ok: false };
    }
  }

  /**
   * Disconnect from a paired Bluetooth device.
   *
   * Runs `bluetoothctl disconnect <mac>` → expects "Disconnection successful"
   *
   * @param mac - MAC address to disconnect (must be valid format)
   * @returns { ok: true } if disconnection succeeded, { ok: false } otherwise
   */
  async disconnect(mac: string): Promise<{ ok: boolean }> {
    if (!isValidMac(mac)) {
      console.error('[bt] disconnect: invalid MAC format', mac);
      return { ok: false };
    }

    try {
      const { stdout } = await execFileAsync('bluetoothctl', ['disconnect', mac]);
      if (/Disconnection successful/.test(stdout)) {
        return { ok: true };
      }
      console.warn('[bt] disconnect: command did not report success for', mac);
      return { ok: false };
    } catch (err) {
      console.error('[bt] disconnect failed for', mac, ':', err);
      return { ok: false };
    }
  }

  /**
   * Remove a paired Bluetooth device (unpair).
   *
   * Runs `bluetoothctl remove <mac>` → expects "Device has been removed"
   *
   * @param mac - MAC address to remove (must be valid format)
   * @returns { ok: true } if removal succeeded, { ok: false } otherwise
   */
  async remove(mac: string): Promise<{ ok: boolean }> {
    if (!isValidMac(mac)) {
      console.error('[bt] remove: invalid MAC format', mac);
      return { ok: false };
    }

    try {
      const { stdout } = await execFileAsync('bluetoothctl', ['remove', mac]);
      if (/Device has been removed/.test(stdout)) {
        return { ok: true };
      }
      console.warn('[bt] remove: command did not report success for', mac);
      return { ok: false };
    } catch (err) {
      console.error('[bt] remove failed for', mac, ':', err);
      return { ok: false };
    }
  }
}

/**
 * Singleton instance of BtAdapter.
 * @type {BtAdapter | null}
 */
let instance: BtAdapter | null = null;

/**
 * Get or create the singleton BtAdapter instance.
 * @returns The BtAdapter singleton
 */
export function getBtAdapter(): BtAdapter {
  if (!instance) {
    instance = new BtAdapter();
  }
  return instance;
}
