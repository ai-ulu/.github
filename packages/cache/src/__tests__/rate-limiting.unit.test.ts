// Unit tests for rate limiting functionality
// Tests specific examples, edge cases, and error conditions

import {
  SlidingWindowRateLimiter,
  TokenBucketRateLimiter,
  FixedWindowRateLimiter,
  RateLimiterFactory,
} from '../rate-limiter';
import { redis } from '../client';
import { TestDataIsolation } from '@autoqa/testing-utils';

describe('Rate Limiting Unit Tests', () => {
  let testIsolation: TestDataIsolation;
  
  beforeEach(async () => {
    testIsolation = new TestDataIsolation();
    // Clear rate limit keys before each test
    const keys = await redis.keys('autoqa:rate_limit:*');
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  });
  
  afterEach(async () => {
    await testIsolation.cleanupAll();
    // Clean up rate limit keys
    const keys = await redis.keys('autoqa:rate_limit:*');
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  });
  
  describe('SlidingWindowRateLimiter', () => {
    it('should allow requests within limit', async () => {
      const limiter = new SlidingWindowRateLimiter({
        windowMs: 60000, // 1 minute
        maxRequests: 5,
      });
      
      const identifier = 'test_user_1';
      
      // First 5 requests should be allowed
      for (let i = 0; i < 5; i++) {
        const result = await limiter.checkLimit(identifier);
        expect(result.allowed).toBe(true);
        expect(result.remaining).toBe(4 - i);
        expect(result.totalHits).toBe(i + 1);
      }
    });
    
    it('should block requests exceeding limit', async () => {
      const limiter = new SlidingWindowRateLimiter({
        windowMs: 60000, // 1 minute
        maxRequests: 3,
      });
      
      const identifier = 'test_user_2';
      
      // First 3 requests should be allowed
      for (let i = 0; i < 3; i++) {
        const result = await limiter.checkLimit(identifier);
        expect(result.allowed).toBe(true);
      }
      
      // 4th request should be blocked
      const blockedResult = await limiter.checkLimit(identifier);
      expect(blockedResult.allowed).toBe(false);
      expect(blockedResult.remaining).toBe(0);
      expect(blockedResult.totalHits).toBe(3);
    });
    
    it('should reset after window expires', async () => {
      const limiter = new SlidingWindowRateLimiter({
        windowMs: 1000, // 1 second
        maxRequests: 2,
      });
      
      const identifier = 'test_user_3';
      
      // Use up the limit
      await limiter.checkLimit(identifier);
      await limiter.checkLimit(identifier);
      
      // Should be blocked
      const blockedResult = await limiter.checkLimit(identifier);
      expect(blockedResult.allowed).toBe(false);
      
      // Wait for window to expire
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      // Should be allowed again
      const allowedResult = await limiter.checkLimit(identifier);
      expect(allowedResult.allowed).toBe(true);
      expect(allowedResult.remaining).toBe(1);
    });
    
    it('should handle different identifiers independently', async () => {
      const limiter = new SlidingWindowRateLimiter({
        windowMs: 60000,
        maxRequests: 2,
      });
      
      const user1 = 'test_user_4';
      const user2 = 'test_user_5';
      
      // User 1 uses up their limit
      await limiter.checkLimit(user1);
      await limiter.checkLimit(user1);
      
      const user1Blocked = await limiter.checkLimit(user1);
      expect(user1Blocked.allowed).toBe(false);
      
      // User 2 should still be allowed
      const user2Result = await limiter.checkLimit(user2);
      expect(user2Result.allowed).toBe(true);
      expect(user2Result.remaining).toBe(1);
    });
    
    it('should handle reset correctly', async () => {
      const limiter = new SlidingWindowRateLimiter({
        windowMs: 60000,
        maxRequests: 2,
      });
      
      const identifier = 'test_user_6';
      
      // Use up the limit
      await limiter.checkLimit(identifier);
      await limiter.checkLimit(identifier);
      
      const blockedResult = await limiter.checkLimit(identifier);
      expect(blockedResult.allowed).toBe(false);
      
      // Reset the limiter
      await limiter.reset(identifier);
      
      // Should be allowed again
      const allowedResult = await limiter.checkLimit(identifier);
      expect(allowedResult.allowed).toBe(true);
      expect(allowedResult.remaining).toBe(1);
    });
  });
  
  describe('TokenBucketRateLimiter', () => {
    it('should allow requests when tokens are available', async () => {
      const limiter = new TokenBucketRateLimiter({
        capacity: 5,
        refillRate: 1, // 1 token per second
      });
      
      const identifier = 'token_user_1';
      
      // Should allow up to capacity
      for (let i = 0; i < 5; i++) {
        const result = await limiter.checkLimit(identifier);
        expect(result.allowed).toBe(true);
        expect(result.remaining).toBe(4 - i);
      }
    });
    
    it('should block requests when no tokens available', async () => {
      const limiter = new TokenBucketRateLimiter({
        capacity: 2,
        refillRate: 0.1, // Very slow refill
      });
      
      const identifier = 'token_user_2';
      
      // Use up all tokens
      await limiter.checkLimit(identifier);
      await limiter.checkLimit(identifier);
      
      // Should be blocked
      const blockedResult = await limiter.checkLimit(identifier);
      expect(blockedResult.allowed).toBe(false);
      expect(blockedResult.remaining).toBe(0);
    });
    
    it('should refill tokens over time', async () => {
      const limiter = new TokenBucketRateLimiter({
        capacity: 3,
        refillRate: 2, // 2 tokens per second
      });
      
      const identifier = 'token_user_3';
      
      // Use up all tokens
      await limiter.checkLimit(identifier);
      await limiter.checkLimit(identifier);
      await limiter.checkLimit(identifier);
      
      // Should be blocked
      const blockedResult = await limiter.checkLimit(identifier);
      expect(blockedResult.allowed).toBe(false);
      
      // Wait for refill (1 second = 2 tokens)
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      // Should have 2 tokens available
      const result1 = await limiter.checkLimit(identifier);
      expect(result1.allowed).toBe(true);
      
      const result2 = await limiter.checkLimit(identifier);
      expect(result2.allowed).toBe(true);
      
      // Third request should be blocked
      const result3 = await limiter.checkLimit(identifier);
      expect(result3.allowed).toBe(false);
    });
    
    it('should handle custom token cost', async () => {
      const limiter = new TokenBucketRateLimiter({
        capacity: 10,
        refillRate: 1,
      });
      
      const identifier = 'token_user_4';
      
      // Request with cost of 5 tokens
      const result1 = await limiter.checkLimit(identifier, 5);
      expect(result1.allowed).toBe(true);
      expect(result1.remaining).toBe(5);
      
      // Request with cost of 3 tokens
      const result2 = await limiter.checkLimit(identifier, 3);
      expect(result2.allowed).toBe(true);
      expect(result2.remaining).toBe(2);
      
      // Request with cost of 5 tokens should be blocked
      const result3 = await limiter.checkLimit(identifier, 5);
      expect(result3.allowed).toBe(false);
    });
  });
  
  describe('FixedWindowRateLimiter', () => {
    it('should allow requests within window limit', async () => {
      const limiter = new FixedWindowRateLimiter({
        windowMs: 60000, // 1 minute
        maxRequests: 3,
      });
      
      const identifier = 'fixed_user_1';
      
      // First 3 requests should be allowed
      for (let i = 0; i < 3; i++) {
        const result = await limiter.checkLimit(identifier);
        expect(result.allowed).toBe(true);
        expect(result.remaining).toBe(2 - i);
        expect(result.totalHits).toBe(i + 1);
      }
    });
    
    it('should block requests exceeding window limit', async () => {
      const limiter = new FixedWindowRateLimiter({
        windowMs: 60000,
        maxRequests: 2,
      });
      
      const identifier = 'fixed_user_2';
      
      // Use up the limit
      await limiter.checkLimit(identifier);
      await limiter.checkLimit(identifier);
      
      // Should be blocked
      const blockedResult = await limiter.checkLimit(identifier);
      expect(blockedResult.allowed).toBe(false);
      expect(blockedResult.remaining).toBe(0);
    });
    
    it('should reset at window boundary', async () => {
      const limiter = new FixedWindowRateLimiter({
        windowMs: 1000, // 1 second
        maxRequests: 2,
      });
      
      const identifier = 'fixed_user_3';
      
      // Use up the limit
      await limiter.checkLimit(identifier);
      await limiter.checkLimit(identifier);
      
      const blockedResult = await limiter.checkLimit(identifier);
      expect(blockedResult.allowed).toBe(false);
      
      // Wait for next window
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      // Should be allowed in new window
      const allowedResult = await limiter.checkLimit(identifier);
      expect(allowedResult.allowed).toBe(true);
      expect(allowedResult.remaining).toBe(1);
    });
  });
  
  describe('RateLimiterFactory', () => {
    it('should create API rate limiter with correct configuration', async () => {
      const limiter = RateLimiterFactory.createAPIRateLimiter();
      expect(limiter).toBeInstanceOf(SlidingWindowRateLimiter);
      
      const identifier = 'api_user_1';
      const result = await limiter.checkLimit(identifier);
      
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(999); // 1000 - 1
    });
    
    it('should create auth rate limiter with strict limits', async () => {
      const limiter = RateLimiterFactory.createAuthRateLimiter();
      expect(limiter).toBeInstanceOf(FixedWindowRateLimiter);
      
      const identifier = 'auth_user_1';
      
      // Should allow 5 attempts
      for (let i = 0; i < 5; i++) {
        const result = await limiter.checkLimit(identifier);
        expect(result.allowed).toBe(true);
      }
      
      // 6th attempt should be blocked
      const blockedResult = await limiter.checkLimit(identifier);
      expect(blockedResult.allowed).toBe(false);
    });
    
    it('should create test execution rate limiter with token bucket', async () => {
      const limiter = RateLimiterFactory.createTestExecutionRateLimiter();
      expect(limiter).toBeInstanceOf(TokenBucketRateLimiter);
      
      const identifier = 'test_exec_user_1';
      
      // Should allow up to 10 concurrent executions
      for (let i = 0; i < 10; i++) {
        const result = await limiter.checkLimit(identifier);
        expect(result.allowed).toBe(true);
      }
      
      // 11th should be blocked
      const blockedResult = await limiter.checkLimit(identifier);
      expect(blockedResult.allowed).toBe(false);
    });
    
    it('should create webhook rate limiter with appropriate limits', async () => {
      const limiter = RateLimiterFactory.createWebhookRateLimiter();
      expect(limiter).toBeInstanceOf(SlidingWindowRateLimiter);
      
      const identifier = 'webhook_user_1';
      const result = await limiter.checkLimit(identifier);
      
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(59); // 60 - 1
    });
  });
  
  describe('Rate Limiter Error Handling', () => {
    it('should fail open when Redis is unavailable', async () => {
      // Create a limiter that will fail due to Redis error
      const limiter = new SlidingWindowRateLimiter({
        windowMs: 60000,
        maxRequests: 1,
        keyGenerator: () => {
          throw new Error('Redis connection failed');
        },
      });
      
      const identifier = 'error_user_1';
      
      // Should fail open (allow request)
      const result = await limiter.checkLimit(identifier);
      expect(result.allowed).toBe(true);
    });
    
    it('should handle malformed identifiers gracefully', async () => {
      const limiter = new SlidingWindowRateLimiter({
        windowMs: 60000,
        maxRequests: 5,
      });
      
      const malformedIdentifiers = [
        '',
        null as any,
        undefined as any,
        'user with spaces',
        'user:with:colons',
        'user/with/slashes',
      ];
      
      for (const identifier of malformedIdentifiers) {
        const result = await limiter.checkLimit(identifier);
        // Should not throw error and should return a valid result
        expect(typeof result.allowed).toBe('boolean');
        expect(typeof result.remaining).toBe('number');
        expect(result.resetTime).toBeInstanceOf(Date);
      }
    });
    
    it('should handle concurrent requests to same identifier', async () => {
      const limiter = new SlidingWindowRateLimiter({
        windowMs: 60000,
        maxRequests: 10,
      });
      
      const identifier = 'concurrent_user_1';
      
      // Make 20 concurrent requests
      const promises = Array.from({ length: 20 }, () =>
        limiter.checkLimit(identifier)
      );
      
      const results = await Promise.all(promises);
      
      // Exactly 10 should be allowed, 10 should be blocked
      const allowed = results.filter(r => r.allowed).length;
      const blocked = results.filter(r => !r.allowed).length;
      
      expect(allowed).toBe(10);
      expect(blocked).toBe(10);
    });
  });
  
  describe('Rate Limiter Performance', () => {
    it('should handle high throughput efficiently', async () => {
      const limiter = new FixedWindowRateLimiter({
        windowMs: 60000,
        maxRequests: 1000,
      });
      
      const requests = 100;
      const identifiers = Array.from({ length: requests }, (_, i) => `perf_user_${i}`);
      
      const start = Date.now();
      const promises = identifiers.map(id => limiter.checkLimit(id));
      const results = await Promise.all(promises);
      const duration = Date.now() - start;
      
      // All requests should be allowed
      results.forEach(result => {
        expect(result.allowed).toBe(true);
      });
      
      // Should complete within reasonable time
      expect(duration).toBeLessThan(5000); // 5 seconds for 100 requests
      
      const throughput = requests / (duration / 1000);
      expect(throughput).toBeGreaterThan(20); // At least 20 requests/sec
    });
    
    it('should maintain accuracy under load', async () => {
      const limiter = new SlidingWindowRateLimiter({
        windowMs: 60000,
        maxRequests: 50,
      });
      
      const identifier = 'load_user_1';
      const requests = 100;
      
      const promises = Array.from({ length: requests }, () =>
        limiter.checkLimit(identifier)
      );
      
      const results = await Promise.all(promises);
      
      const allowed = results.filter(r => r.allowed).length;
      const blocked = results.filter(r => !r.allowed).length;
      
      // Should allow exactly 50 requests
      expect(allowed).toBe(50);
      expect(blocked).toBe(50);
      
      // Remaining count should be consistent
      const allowedResults = results.filter(r => r.allowed);
      allowedResults.forEach((result, index) => {
        expect(result.remaining).toBe(49 - index);
      });
    });
  });
  
  describe('Rate Limiter Memory Management', () => {
    it('should clean up expired keys automatically', async () => {
      const limiter = new FixedWindowRateLimiter({
        windowMs: 1000, // 1 second
        maxRequests: 5,
      });
      
      const identifier = 'cleanup_user_1';
      
      // Make some requests
      await limiter.checkLimit(identifier);
      await limiter.checkLimit(identifier);
      
      // Check that keys exist
      const keysBefore = await redis.keys('autoqa:rate_limit:*cleanup_user_1*');
      expect(keysBefore.length).toBeGreaterThan(0);
      
      // Wait for expiry
      await new Promise(resolve => setTimeout(resolve, 1200));
      
      // Keys should be cleaned up automatically by Redis TTL
      const keysAfter = await redis.keys('autoqa:rate_limit:*cleanup_user_1*');
      expect(keysAfter.length).toBe(0);
    });
    
    it('should handle memory efficiently with many identifiers', async () => {
      const limiter = new FixedWindowRateLimiter({
        windowMs: 60000,
        maxRequests: 10,
      });
      
      const identifierCount = 1000;
      const identifiers = Array.from({ length: identifierCount }, (_, i) => `memory_user_${i}`);
      
      // Make requests for all identifiers
      const promises = identifiers.map(id => limiter.checkLimit(id));
      await Promise.all(promises);
      
      // Check that keys were created
      const keys = await redis.keys('autoqa:rate_limit:*memory_user_*');
      expect(keys.length).toBe(identifierCount);
      
      // Memory usage should be reasonable
      const memoryInfo = await redis.info('memory');
      const usedMemory = memoryInfo.match(/used_memory:(\d+)/);
      if (usedMemory) {
        const memoryBytes = parseInt(usedMemory[1]);
        const memoryMB = memoryBytes / (1024 * 1024);
        expect(memoryMB).toBeLessThan(100); // Should use less than 100MB
      }
    });
  });
});