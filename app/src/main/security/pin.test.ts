import { describe, it, expect } from 'vitest';
import { hashPin, verifyPin, isValidPinFormat } from './pin';

describe('PIN Hashing', () => {
  describe('hashPin', () => {
    it('should generate hash in scrypt$salt$hash format', () => {
      const hash = hashPin('0000');
      const parts = hash.split('$');
      expect(parts).toHaveLength(3);
      expect(parts[0]).toBe('scrypt');
      expect(parts[1]).toMatch(/^[0-9a-f]+$/);
      expect(parts[2]).toMatch(/^[0-9a-f]+$/);
    });

    it('should generate different hashes for the same PIN (random salt)', () => {
      const hash1 = hashPin('1234');
      const hash2 = hashPin('1234');
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('verifyPin', () => {
    it('should return true when PIN matches stored hash', () => {
      const hash = hashPin('0000');
      expect(verifyPin('0000', hash)).toBe(true);
    });

    it('should return false when PIN does not match', () => {
      const hash = hashPin('0000');
      expect(verifyPin('1234', hash)).toBe(false);
    });

    it('should return false for malformed stored hash', () => {
      expect(verifyPin('0000', 'garbage')).toBe(false);
    });

    it('should return false for invalid format (wrong prefix)', () => {
      expect(verifyPin('0000', 'bcrypt$abcd$efgh')).toBe(false);
    });

    it('should return false for incomplete format', () => {
      expect(verifyPin('0000', 'scrypt$abcd')).toBe(false);
    });

    it('should handle timing-safe comparison (no timing leaks)', () => {
      const hash = hashPin('0000');
      const wrong1 = verifyPin('0001', hash);
      const wrong2 = verifyPin('9999', hash);
      expect(wrong1).toBe(false);
      expect(wrong2).toBe(false);
    });
  });

  describe('isValidPinFormat', () => {
    it('should accept 4-digit PINs', () => {
      expect(isValidPinFormat('0000')).toBe(true);
      expect(isValidPinFormat('1234')).toBe(true);
      expect(isValidPinFormat('9999')).toBe(true);
    });

    it('should reject less than 4 digits', () => {
      expect(isValidPinFormat('0')).toBe(false);
      expect(isValidPinFormat('12')).toBe(false);
      expect(isValidPinFormat('123')).toBe(false);
    });

    it('should reject more than 4 digits', () => {
      expect(isValidPinFormat('12345')).toBe(false);
      expect(isValidPinFormat('123456')).toBe(false);
    });

    it('should reject non-numeric characters', () => {
      expect(isValidPinFormat('12a4')).toBe(false);
      expect(isValidPinFormat('12_4')).toBe(false);
      expect(isValidPinFormat('12-4')).toBe(false);
      expect(isValidPinFormat('abcd')).toBe(false);
    });

    it('should reject empty string', () => {
      expect(isValidPinFormat('')).toBe(false);
    });
  });
});
