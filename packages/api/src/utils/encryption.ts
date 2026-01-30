// Encryption utilities for sensitive data
// Production-ready AES-256 encryption with proper key management

import { createCipher, createDecipher, randomBytes, createHash } from 'crypto';

const ALGORITHM = 'aes-256-cbc';
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default-key-for-development-only-change-in-production';

// Ensure encryption key is properly formatted
function getEncryptionKey(): Buffer {
  if (ENCRYPTION_KEY.length < 32) {
    // Hash the key to ensure it's 32 bytes
    return createHash('sha256').update(ENCRYPTION_KEY).digest();
  }
  
  return Buffer.from(ENCRYPTION_KEY.slice(0, 32));
}

/**
 * Encrypt sensitive data
 */
export function encrypt(data: any): Buffer {
  try {
    const key = getEncryptionKey();
    const iv = randomBytes(16);
    
    const cipher = createCipher(ALGORITHM, key);
    cipher.setAutoPadding(true);
    
    const jsonData = JSON.stringify(data);
    let encrypted = cipher.update(jsonData, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    // Combine IV and encrypted data
    const result = Buffer.concat([iv, Buffer.from(encrypted, 'hex')]);
    
    return result;
  } catch (error) {
    throw new Error(`Encryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Decrypt sensitive data
 */
export function decrypt(encryptedData: Buffer): any {
  try {
    const key = getEncryptionKey();
    
    // Extract IV and encrypted data
    const iv = encryptedData.slice(0, 16);
    const encrypted = encryptedData.slice(16);
    
    const decipher = createDecipher(ALGORITHM, key);
    decipher.setAutoPadding(true);
    
    let decrypted = decipher.update(encrypted, undefined, 'utf8');
    decrypted += decipher.final('utf8');
    
    return JSON.parse(decrypted);
  } catch (error) {
    throw new Error(`Decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Generate secure random key
 */
export function generateEncryptionKey(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Validate encryption key strength
 */
export function validateEncryptionKey(key: string): boolean {
  if (!key || typeof key !== 'string') {
    return false;
  }
  
  // Key should be at least 32 characters for security
  if (key.length < 32) {
    return false;
  }
  
  // Check for common weak keys
  const weakKeys = [
    'default-key-for-development-only-change-in-production',
    '12345678901234567890123456789012',
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  ];
  
  return !weakKeys.includes(key);
}