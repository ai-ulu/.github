// Property-based tests for credential encryption
// **Feature: autoqa-pilot, Property 2: Credential Encryption Round Trip**
// **Validates: Requirements 1.5, 9.1**

import * as fc from 'fast-check';
import {
  encrypt,
  decrypt,
  encryptJSON,
  decryptJSON,
  EncryptedField,
  EncryptionAudit,
  validateEncryptionKey,
  generateSecureToken,
  hashSensitiveData,
} from '../encryption';

describe('Encryption Property Tests', () => {
  // Set up test encryption key
  beforeAll(() => {
    process.env.ENCRYPTION_KEY = 'test_encryption_key_32_characters';
  });
  
  afterAll(() => {
    delete process.env.ENCRYPTION_KEY;
  });
  
  describe('Property 2: Credential Encryption Round Trip', () => {
    it('should maintain data integrity through encryption/decryption cycle', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 1000 }),
          async (plaintext) => {
            // Encrypt the plaintext
            const encrypted = await encrypt(plaintext);
            
            // Verify encrypted data is different from plaintext
            expect(encrypted.toString('utf8')).not.toBe(plaintext);
            expect(encrypted.length).toBeGreaterThan(64); // Salt + IV + Tag + data
            
            // Decrypt the encrypted data
            const decrypted = await decrypt(encrypted);
            
            // Verify round-trip consistency
            expect(decrypted).toBe(plaintext);
            
            return true;
          }
        ),
        { numRuns: 100, timeout: 30000 }
      );
    });
    
    it('should produce different ciphertext for identical plaintext', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 500 }),
          async (plaintext) => {
            // Encrypt the same plaintext multiple times
            const encrypted1 = await encrypt(plaintext);
            const encrypted2 = await encrypt(plaintext);
            const encrypted3 = await encrypt(plaintext);
            
            // Verify ciphertexts are different (due to random IV and salt)
            expect(encrypted1.equals(encrypted2)).toBe(false);
            expect(encrypted2.equals(encrypted3)).toBe(false);
            expect(encrypted1.equals(encrypted3)).toBe(false);
            
            // Verify all decrypt to the same plaintext
            const decrypted1 = await decrypt(encrypted1);
            const decrypted2 = await decrypt(encrypted2);
            const decrypted3 = await decrypt(encrypted3);
            
            expect(decrypted1).toBe(plaintext);
            expect(decrypted2).toBe(plaintext);
            expect(decrypted3).toBe(plaintext);
            
            return true;
          }
        ),
        { numRuns: 50, timeout: 30000 }
      );
    });
    
    it('should handle various character encodings correctly', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.oneof(
            fc.string(), // ASCII
            fc.fullUnicodeString(), // Unicode
            fc.string().map(s => s + '🚀🔒💻'), // Emojis
            fc.string().map(s => s + 'çğıöşüÇĞIÖŞÜ'), // Turkish characters
            fc.string().map(s => s + '中文测试'), // Chinese characters
            fc.string().map(s => s + 'тест'), // Cyrillic
          ),
          async (plaintext) => {
            if (plaintext.length === 0) return true; // Skip empty strings
            
            const encrypted = await encrypt(plaintext);
            const decrypted = await decrypt(encrypted);
            
            expect(decrypted).toBe(plaintext);
            expect(decrypted.length).toBe(plaintext.length);
            
            return true;
          }
        ),
        { numRuns: 100, timeout: 30000 }
      );
    });
    
    it('should handle JSON encryption/decryption correctly', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            username: fc.string({ minLength: 1, maxLength: 100 }),
            password: fc.string({ minLength: 8, maxLength: 128 }),
            apiKey: fc.option(fc.string({ minLength: 20, maxLength: 64 })),
            metadata: fc.option(fc.record({
              lastUsed: fc.date(),
              permissions: fc.array(fc.string(), { maxLength: 5 }),
              settings: fc.object(),
            })),
          }),
          async (credentials) => {
            // Encrypt JSON object
            const encrypted = await encryptJSON(credentials);
            
            // Verify encrypted data is binary
            expect(Buffer.isBuffer(encrypted)).toBe(true);
            expect(encrypted.length).toBeGreaterThan(64);
            
            // Decrypt JSON object
            const decrypted = await decryptJSON(encrypted);
            
            // Verify structure and content
            expect(decrypted).toEqual(credentials);
            expect(decrypted.username).toBe(credentials.username);
            expect(decrypted.password).toBe(credentials.password);
            
            if (credentials.apiKey) {
              expect(decrypted.apiKey).toBe(credentials.apiKey);
            }
            
            if (credentials.metadata) {
              expect(decrypted.metadata).toEqual(credentials.metadata);
            }
            
            return true;
          }
        ),
        { numRuns: 50, timeout: 30000 }
      );
    });
    
    it('should fail gracefully with invalid encrypted data', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uint8Array({ minLength: 1, maxLength: 100 }),
          async (invalidData) => {
            const buffer = Buffer.from(invalidData);
            
            // Should throw error for invalid encrypted data
            await expect(decrypt(buffer)).rejects.toThrow();
            
            return true;
          }
        ),
        { numRuns: 50, timeout: 30000 }
      );
    });
  });
  
  describe('Property 3: Encryption Security Properties', () => {
    it('should generate cryptographically secure tokens', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 8, max: 128 }),
          (length) => {
            const token1 = generateSecureToken(length);
            const token2 = generateSecureToken(length);
            const token3 = generateSecureToken(length);
            
            // Verify length
            expect(token1.length).toBe(length * 2); // Hex encoding doubles length
            expect(token2.length).toBe(length * 2);
            expect(token3.length).toBe(length * 2);
            
            // Verify uniqueness
            expect(token1).not.toBe(token2);
            expect(token2).not.toBe(token3);
            expect(token1).not.toBe(token3);
            
            // Verify hex format
            const hexRegex = /^[0-9a-f]+$/;
            expect(hexRegex.test(token1)).toBe(true);
            expect(hexRegex.test(token2)).toBe(true);
            expect(hexRegex.test(token3)).toBe(true);
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
    
    it('should produce consistent hashes for identical input', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 1000 }),
          (input) => {
            const hash1 = hashSensitiveData(input);
            const hash2 = hashSensitiveData(input);
            const hash3 = hashSensitiveData(input);
            
            // Verify consistency
            expect(hash1).toBe(hash2);
            expect(hash2).toBe(hash3);
            
            // Verify hash format (SHA-256 hex)
            expect(hash1.length).toBe(64);
            expect(/^[0-9a-f]+$/.test(hash1)).toBe(true);
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
    
    it('should produce different hashes for different inputs', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 500 }),
          fc.string({ minLength: 1, maxLength: 500 }),
          (input1, input2) => {
            fc.pre(input1 !== input2); // Only test different inputs
            
            const hash1 = hashSensitiveData(input1);
            const hash2 = hashSensitiveData(input2);
            
            // Verify hashes are different
            expect(hash1).not.toBe(hash2);
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
    
    it('should validate encryption keys correctly', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.string({ minLength: 32, maxLength: 32 }), // Valid length
            fc.string({ minLength: 1, maxLength: 31 }), // Too short
            fc.string({ minLength: 33, maxLength: 100 }), // Too long
            fc.constant(''), // Empty
            fc.constant(null), // Null
            fc.constant(undefined), // Undefined
          ),
          (key) => {
            const isValid = validateEncryptionKey(key as string);
            
            if (typeof key === 'string' && key.length === 32) {
              // Valid key should pass validation
              expect(isValid).toBe(true);
            } else {
              // Invalid key should fail validation
              expect(isValid).toBe(false);
            }
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });
  
  describe('Property 4: EncryptedField Utilities', () => {
    it('should handle auth credentials encryption correctly', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            username: fc.string({ minLength: 1, maxLength: 100 }),
            password: fc.string({ minLength: 8, maxLength: 128 }),
            apiKey: fc.option(fc.string({ minLength: 20, maxLength: 64 })),
            customField: fc.option(fc.string()),
          }),
          async (credentials) => {
            // Encrypt credentials
            const encrypted = await EncryptedField.encryptAuthCredentials(credentials);
            
            // Verify encrypted data
            expect(Buffer.isBuffer(encrypted)).toBe(true);
            expect(encrypted.length).toBeGreaterThan(64);
            
            // Decrypt credentials
            const decrypted = await EncryptedField.decryptAuthCredentials(encrypted);
            
            // Verify structure and content
            expect(decrypted.username).toBe(credentials.username);
            expect(decrypted.password).toBe(credentials.password);
            
            if (credentials.apiKey) {
              expect(decrypted.apiKey).toBe(credentials.apiKey);
            }
            
            if (credentials.customField) {
              expect(decrypted.customField).toBe(credentials.customField);
            }
            
            return true;
          }
        ),
        { numRuns: 50, timeout: 30000 }
      );
    });
    
    it('should handle API key encryption correctly', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 20, maxLength: 128 }),
          async (apiKey) => {
            // Encrypt API key
            const encrypted = await EncryptedField.encryptApiKey(apiKey);
            
            // Verify encrypted data
            expect(Buffer.isBuffer(encrypted)).toBe(true);
            expect(encrypted.length).toBeGreaterThan(64);
            
            // Decrypt API key
            const decrypted = await EncryptedField.decryptApiKey(encrypted);
            
            // Verify consistency
            expect(decrypted).toBe(apiKey);
            
            return true;
          }
        ),
        { numRuns: 50, timeout: 30000 }
      );
    });
  });
  
  describe('Property 5: Encryption Performance and Audit', () => {
    it('should verify encryption round trip consistently', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 1000 }),
          async (testData) => {
            const isValid = await EncryptionAudit.verifyRoundTrip(testData);
            expect(isValid).toBe(true);
            
            return true;
          }
        ),
        { numRuns: 50, timeout: 30000 }
      );
    });
    
    it('should maintain reasonable encryption performance', async () => {
      const benchmark = await EncryptionAudit.benchmarkEncryption(100);
      
      // Verify performance metrics are reasonable
      expect(benchmark.encryptionTimeMs).toBeGreaterThan(0);
      expect(benchmark.decryptionTimeMs).toBeGreaterThan(0);
      expect(benchmark.throughputOpsPerSec).toBeGreaterThan(10); // At least 10 ops/sec
      
      // Encryption should not be too slow (less than 10ms per operation on average)
      const avgEncryptionTime = benchmark.encryptionTimeMs / 100;
      const avgDecryptionTime = benchmark.decryptionTimeMs / 100;
      
      expect(avgEncryptionTime).toBeLessThan(50); // 50ms max per encryption
      expect(avgDecryptionTime).toBeLessThan(50); // 50ms max per decryption
    });
  });
  
  describe('Property 6: Error Handling and Edge Cases', () => {
    it('should handle empty and null values appropriately', async () => {
      // Test empty string
      const emptyEncrypted = await encrypt('');
      const emptyDecrypted = await decrypt(emptyEncrypted);
      expect(emptyDecrypted).toBe('');
      
      // Test single character
      const singleCharEncrypted = await encrypt('a');
      const singleCharDecrypted = await decrypt(singleCharEncrypted);
      expect(singleCharDecrypted).toBe('a');
      
      // Test very long string
      const longString = 'a'.repeat(10000);
      const longEncrypted = await encrypt(longString);
      const longDecrypted = await decrypt(longEncrypted);
      expect(longDecrypted).toBe(longString);
    });
    
    it('should fail with invalid encryption key', async () => {
      const originalKey = process.env.ENCRYPTION_KEY;
      
      try {
        // Test with invalid key
        process.env.ENCRYPTION_KEY = 'invalid_key';
        
        await expect(encrypt('test')).rejects.toThrow();
      } finally {
        // Restore original key
        process.env.ENCRYPTION_KEY = originalKey;
      }
    });
    
    it('should fail with missing encryption key', async () => {
      const originalKey = process.env.ENCRYPTION_KEY;
      
      try {
        // Remove encryption key
        delete process.env.ENCRYPTION_KEY;
        
        await expect(encrypt('test')).rejects.toThrow('ENCRYPTION_KEY environment variable is required');
      } finally {
        // Restore original key
        process.env.ENCRYPTION_KEY = originalKey;
      }
    });
  });
});