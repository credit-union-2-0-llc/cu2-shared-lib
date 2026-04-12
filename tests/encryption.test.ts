import { describe, it, expect } from 'vitest';
import { createEncryptor } from '../src/azure/encryption.js';
import { randomBytes } from 'crypto';

const VALID_KEY = randomBytes(32).toString('hex'); // 64 hex chars

describe('createEncryptor', () => {
  it('throws on invalid key length', () => {
    expect(() => createEncryptor('abc')).toThrow('64 hex characters');
    expect(() => createEncryptor('a'.repeat(63))).toThrow('64 hex characters');
    expect(() => createEncryptor('a'.repeat(65))).toThrow('64 hex characters');
  });

  describe('encrypt / decrypt strings', () => {
    const enc = createEncryptor(VALID_KEY);

    it('round-trips a simple string', () => {
      const plain = 'hello world';
      const cipher = enc.encrypt(plain);
      expect(enc.decrypt(cipher)).toBe(plain);
    });

    it('round-trips an empty string', () => {
      const cipher = enc.encrypt('');
      expect(enc.decrypt(cipher)).toBe('');
    });

    it('round-trips unicode', () => {
      const plain = 'Ashland, Oregon';
      const cipher = enc.encrypt(plain);
      expect(enc.decrypt(cipher)).toBe(plain);
    });

    it('produces format iv:authTag:ciphertext', () => {
      const cipher = enc.encrypt('test');
      const parts = cipher.split(':');
      expect(parts).toHaveLength(3);
    });

    it('different plaintexts produce different ciphertexts', () => {
      const c1 = enc.encrypt('aaa');
      const c2 = enc.encrypt('bbb');
      expect(c1).not.toBe(c2);
    });

    it('same plaintext produces different ciphertexts (random IV)', () => {
      const c1 = enc.encrypt('same');
      const c2 = enc.encrypt('same');
      expect(c1).not.toBe(c2);
      // Both still decrypt to same value
      expect(enc.decrypt(c1)).toBe('same');
      expect(enc.decrypt(c2)).toBe('same');
    });
  });

  describe('encryptJson / decryptJson', () => {
    const enc = createEncryptor(VALID_KEY);

    it('round-trips a JSON object', () => {
      const obj = { ssn: '123-45-6789', name: 'Kirk' };
      const cipher = enc.encryptJson(obj);
      expect(enc.decryptJson(cipher)).toEqual(obj);
    });

    it('round-trips arrays', () => {
      const arr = [1, 'two', { three: 3 }];
      const cipher = enc.encryptJson(arr);
      expect(enc.decryptJson(cipher)).toEqual(arr);
    });
  });

  describe('tampered ciphertext', () => {
    const enc = createEncryptor(VALID_KEY);

    it('fails on modified auth tag', () => {
      const cipher = enc.encrypt('secret');
      const parts = cipher.split(':');
      // Corrupt the auth tag
      parts[1] = Buffer.from('corrupted_tag!!').toString('base64');
      expect(() => enc.decrypt(parts.join(':'))).toThrow();
    });

    it('fails on modified ciphertext data', () => {
      const cipher = enc.encrypt('secret');
      const parts = cipher.split(':');
      parts[2] = Buffer.from('corrupted_data!!!').toString('base64');
      expect(() => enc.decrypt(parts.join(':'))).toThrow();
    });

    it('fails on wrong format (missing parts)', () => {
      expect(() => enc.decrypt('only:two')).toThrow('Invalid encrypted value format');
      expect(() => enc.decrypt('no_colons')).toThrow('Invalid encrypted value format');
    });
  });

  it('decryption fails with a different key', () => {
    const enc1 = createEncryptor(VALID_KEY);
    const enc2 = createEncryptor(randomBytes(32).toString('hex'));
    const cipher = enc1.encrypt('secret');
    expect(() => enc2.decrypt(cipher)).toThrow();
  });
});
