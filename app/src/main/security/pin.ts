import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const SCRYPT_KEYLEN = 32;
const SALT_BYTES = 16;
const PREFIX = 'scrypt';

/**
 * Hash a PIN with a random salt using scrypt.
 * Format: "scrypt$<saltHex>$<hashHex>"
 * @param pin plaintext PIN (typically 4 digits, but accepts any string)
 * @returns hashed PIN string in scrypt format
 */
export function hashPin(pin: string): string {
  const salt = randomBytes(SALT_BYTES);
  const hash = scryptSync(pin, salt, SCRYPT_KEYLEN);
  return `${PREFIX}$${salt.toString('hex')}$${hash.toString('hex')}`;
}

/**
 * Verify a PIN against a stored "scrypt$salt$hash" string using constant-time comparison.
 * Robust to malformed input (returns false rather than throwing).
 * @param pin plaintext PIN to check
 * @param stored hashed PIN string from storage
 * @returns true if PIN matches the stored hash, false otherwise
 */
export function verifyPin(pin: string, stored: string): boolean {
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== PREFIX) return false;
  try {
    const salt = Buffer.from(parts[1], 'hex');
    const expected = Buffer.from(parts[2], 'hex');
    const actual = scryptSync(pin, salt, expected.length);
    if (actual.length !== expected.length) return false;
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

/**
 * Check if a string is exactly 4 digits (0-9).
 * @param pin string to validate
 * @returns true if pin matches [0-9]{4}, false otherwise
 */
export function isValidPinFormat(pin: string): boolean {
  return /^[0-9]{4}$/.test(pin);
}
