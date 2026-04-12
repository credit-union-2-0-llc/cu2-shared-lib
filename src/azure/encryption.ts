/**
 * AES-256-GCM encryption for PII fields.
 *
 * Encrypted format: {iv_b64}:{authTag_b64}:{ciphertext_b64}
 *
 * Extracted from: trendforge-execution/execution-engine/src/utils/encryption.ts
 *
 * Usage:
 *   import { createEncryptor } from '@cu2/shared-lib/azure/encryption';
 *
 *   const enc = createEncryptor(process.env.PII_ENCRYPTION_KEY!);
 *   const cipher = enc.encrypt('sensitive data');
 *   const plain = enc.decrypt(cipher);
 *   const obj = enc.encryptJson({ ssn: '123-45-6789' });
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;   // 96-bit IV recommended for GCM
const TAG_LENGTH = 16;  // 128-bit auth tag

export interface Encryptor {
  encrypt: (plaintext: string) => string;
  decrypt: (ciphertext: string) => string;
  encryptJson: (obj: unknown) => string;
  decryptJson: <T = unknown>(ciphertext: string) => T;
}

/**
 * Create an encryptor with the given hex key.
 * Key must be 64 hex characters (32 bytes).
 */
export function createEncryptor(hexKey: string): Encryptor {
  if (hexKey.length !== 64) {
    throw new Error('PII encryption key must be 64 hex characters (32 bytes)');
  }
  const key = Buffer.from(hexKey, 'hex');

  function encrypt(plaintext: string): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return [
      iv.toString('base64'),
      authTag.toString('base64'),
      encrypted.toString('base64'),
    ].join(':');
  }

  function decrypt(ciphertext: string): string {
    const parts = ciphertext.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted value format — expected iv:authTag:ciphertext');
    }
    const [ivB64, tagB64, dataB64] = parts;
    const iv = Buffer.from(ivB64, 'base64');
    const authTag = Buffer.from(tagB64, 'base64');
    const encryptedData = Buffer.from(dataB64, 'base64');
    const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(encryptedData), decipher.final()]).toString('utf8');
  }

  function encryptJson(obj: unknown): string {
    return encrypt(JSON.stringify(obj));
  }

  function decryptJson<T = unknown>(ciphertext: string): T {
    return JSON.parse(decrypt(ciphertext)) as T;
  }

  return { encrypt, decrypt, encryptJson, decryptJson };
}
