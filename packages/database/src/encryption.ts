// AES-256 encryption utilities for sensitive data
// Production-ready encryption with proper key management

import { createCipheriv, createDecipheriv, randomBytes, scrypt } from 'crypto';
import { promisify } from 'util';

const scryptAsync = promisify(scrypt);

// Encryption configuration
const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 16; // 128 bits
const TAG_LENGTH = 16; // 128 bits
const SALT_LENGTH = 32; // 256 bits

// Get encryption key from environment
function getEncryptionKey(): string {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    throw new Error('ENCRYPTION_KEY environment variable is required');
  }
  if (key.length !== KEY_LENGTH) {
    throw new Error(`ENCRYPTION_KEY must be exactly ${KEY_LENGTH} characters long`);
  }
  return key;
}

// Derive key from password using scrypt
async function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
  return (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer;
}

// Encrypt sensitive data (credentials, API keys, etc.)
export async function encrypt(plaintext: string): Promise<Buffer> {
  try {
    const password = getEncryptionKey();
    const salt = randomBytes(SALT_LENGTH);
    const iv = randomBytes(IV_LENGTH);
    
    // Derive key from password and salt
    const key = await deriveKey(password, salt);
    
    // Create cipher
    const cipher = createCipheriv(ALGORITHM, key, iv);
    
    // Encrypt the plaintext
    let encrypted = cipher.update(plaintext, 'utf8');
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    
    // Get authentication tag
    const tag = cipher.getAuthTag();
    
    // Combine salt + iv + tag + encrypted data
    const result = Buffer.concat([
      salt,           // 32 bytes
      iv,             // 16 bytes
      tag,            // 16 bytes
      encrypted       // variable length
    ]);
    
    return result;
  } catch (error) {
    throw new Error(`Encryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Decrypt sensitive data
export async function decrypt(encryptedData: Buffer): Promise<string> {
  try {
    if (encryptedData.length < SALT_LENGTH + IV_LENGTH + TAG_LENGTH) {
      throw new Error('Invalid encrypted data format');
    }
    
    const password = getEncryptionKey();
    
    // Extract components
    const salt = encryptedData.subarray(0, SALT_LENGTH);
    const iv = encryptedData.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    const tag = encryptedData.subarray(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
    const encrypted = encryptedData.subarray(SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
    
    // Derive key from password and salt
    const key = await deriveKey(password, salt);
    
    // Create decipher
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    
    // Decrypt the data
    let decrypted = decipher.update(encrypted);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    
    return decrypted.toString('utf8');
  } catch (error) {
    throw new Error(`Decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Encrypt JSON object (for auth credentials)
export async function encryptJSON(data: object): Promise<Buffer> {
  const jsonString = JSON.stringify(data);
  return encrypt(jsonString);
}

// Decrypt JSON object
export async function decryptJSON<T = any>(encryptedData: Buffer): Promise<T> {
  const jsonString = await decrypt(encryptedData);
  return JSON.parse(jsonString) as T;
}

// Hash sensitive data for comparison (passwords, API keys)
export function hashSensitiveData(data: string): string {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(data).digest('hex');
}

// Generate secure random string for API keys, tokens, etc.
export function generateSecureToken(length: number = 32): string {
  return randomBytes(length).toString('hex');
}

// Validate encryption key format
export function validateEncryptionKey(key: string): boolean {
  if (!key || typeof key !== 'string') {
    return false;
  }
  
  if (key.length !== KEY_LENGTH) {
    return false;
  }
  
  // Check if key contains only valid characters (printable ASCII)
  const validChars = /^[\x20-\x7E]+$/;
  return validChars.test(key);
}

// Encryption utilities for database fields
export class EncryptedField {
  private static async encryptField(value: string | null): Promise<Buffer | null> {
    if (value === null || value === undefined) {
      return null;
    }
    return encrypt(value);
  }
  
  private static async decryptField(value: Buffer | null): Promise<string | null> {
    if (value === null || value === undefined) {
      return null;
    }
    return decrypt(value);
  }
  
  // Encrypt auth credentials for storage
  static async encryptAuthCredentials(credentials: {
    username?: string;
    password?: string;
    apiKey?: string;
    [key: string]: any;
  }): Promise<Buffer> {
    return encryptJSON(credentials);
  }
  
  // Decrypt auth credentials from storage
  static async decryptAuthCredentials(encryptedData: Buffer): Promise<{
    username?: string;
    password?: string;
    apiKey?: string;
    [key: string]: any;
  }> {
    return decryptJSON(encryptedData);
  }
  
  // Encrypt API key for storage
  static async encryptApiKey(apiKey: string): Promise<Buffer> {
    return encrypt(apiKey);
  }
  
  // Decrypt API key from storage
  static async decryptApiKey(encryptedData: Buffer): Promise<string> {
    return decrypt(encryptedData);
  }
}

// Key rotation utilities (for future implementation)
export class KeyRotation {
  // Check if key rotation is needed (based on age, usage, etc.)
  static shouldRotateKey(keyCreatedAt: Date, maxAgeMs: number = 90 * 24 * 60 * 60 * 1000): boolean {
    const now = new Date();
    const keyAge = now.getTime() - keyCreatedAt.getTime();
    return keyAge > maxAgeMs;
  }
  
  // Generate new encryption key
  static generateNewKey(): string {
    return randomBytes(KEY_LENGTH).toString('hex').substring(0, KEY_LENGTH);
  }
  
  // Re-encrypt data with new key (for key rotation)
  static async reencryptData(oldEncryptedData: Buffer, oldKey: string, newKey: string): Promise<Buffer> {
    // Temporarily set old key
    const originalKey = process.env.ENCRYPTION_KEY;
    process.env.ENCRYPTION_KEY = oldKey;
    
    try {
      // Decrypt with old key
      const plaintext = await decrypt(oldEncryptedData);
      
      // Set new key
      process.env.ENCRYPTION_KEY = newKey;
      
      // Encrypt with new key
      const newEncryptedData = await encrypt(plaintext);
      
      return newEncryptedData;
    } finally {
      // Restore original key
      process.env.ENCRYPTION_KEY = originalKey;
    }
  }
}

// Security audit utilities
export class EncryptionAudit {
  // Verify encryption/decryption round trip
  static async verifyRoundTrip(testData: string): Promise<boolean> {
    try {
      const encrypted = await encrypt(testData);
      const decrypted = await decrypt(encrypted);
      return decrypted === testData;
    } catch {
      return false;
    }
  }
  
  // Test encryption performance
  static async benchmarkEncryption(iterations: number = 1000): Promise<{
    encryptionTimeMs: number;
    decryptionTimeMs: number;
    throughputOpsPerSec: number;
  }> {
    const testData = 'This is a test string for encryption benchmarking';
    
    // Benchmark encryption
    const encryptStart = Date.now();
    const encryptedResults: Buffer[] = [];
    
    for (let i = 0; i < iterations; i++) {
      encryptedResults.push(await encrypt(testData));
    }
    
    const encryptionTimeMs = Date.now() - encryptStart;
    
    // Benchmark decryption
    const decryptStart = Date.now();
    
    for (let i = 0; i < iterations; i++) {
      await decrypt(encryptedResults[i]);
    }
    
    const decryptionTimeMs = Date.now() - decryptStart;
    
    const totalTimeMs = encryptionTimeMs + decryptionTimeMs;
    const throughputOpsPerSec = Math.round((iterations * 2 * 1000) / totalTimeMs);
    
    return {
      encryptionTimeMs,
      decryptionTimeMs,
      throughputOpsPerSec,
    };
  }
}