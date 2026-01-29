/**
 * Property-Based Tests for Cache Consistency
 * Feature: autoqa-pilot, Property 24: Cache Consistency and Performance
 * 
 * Tests cache-database consistency across operations and verifies cache invalidation works correctly.
 * Validates: Production Checklist - Cache & Consistency
 */

import fc from 'fast-check';
import { Cache, UserCache, ProjectCache, TestRunCache } from '../cache';
import { redis } from '../client';
import { CacheTypes } from '../types';

// Test setup and teardown
beforeAll(async () => {
  // Ensure Redis is connected
  await redis.ping();
});

afterEach(async () => {
  // Clean up test data after each test
  await Cache.clear('test');
  await Cache.resetStats();
});

afterAll(async () => {
  // Clean up all test data
  await Cache.clear();
  await redis.flushdb();
});

describe('Cache Consistency Property Tests', () => {
  /**
   * Property 24: Cache Consistency and Performance
   * For any cached data, the system should maintain consistency between cache and database,
   * prevent cache stampede, and handle cache invalidation correctly
   */
  
  describe('Basic Cache Operations Consistency', () => {
    it('should maintain get-set consistency for any valid data', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            key: fc.string({ minLength: 1, maxLength: 100 }),
            value: fc.oneof(
              fc.string(),
              fc.integer(),
              fc.boolean(),
              fc.object(),
              fc.array(fc.string())
            ),
            ttl: fc.option(fc.integer({ min: 1, max: 3600 }))
          }),
          async ({ key, value, ttl }) => {
            // Set value in cache
            const setResult = await Cache.set(key, value, {
              namespace: 'test',
              ttl: ttl || undefined
            });
            
            expect(setResult).toBe(true);
            
            // Get value from cache
            const cachedValue = await Cache.get(key, { namespace: 'test' });
            
            // Values should be identical
            expect(cachedValue).toEqual(value);
            
            // If TTL was set, key should exist
            if (ttl) {
              const exists = await Cache.exists(key, 'test');
              expect(exists).toBe(true);
              
              const remainingTtl = await Cache.ttl(key, 'test');
              expect(remainingTtl).toBeGreaterThan(0);
              expect(remainingTtl).toBeLessThanOrEqual(ttl);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
    
    it('should handle cache misses consistently', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 100 }),
          async (nonExistentKey) => {
            // Ensure key doesn't exist
            await Cache.delete(nonExistentKey, { namespace: 'test' });
            
            // Get should return null
            const result = await Cache.get(nonExistentKey, { namespace: 'test' });
            expect(result).toBeNull();
            
            // Exists should return false
            const exists = await Cache.exists(nonExistentKey, 'test');
            expect(exists).toBe(false);
          }
        ),
        { numRuns: 50 }
      );
    });
    
    it('should maintain consistency across multiple operations', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              key: fc.string({ minLength: 1, maxLength: 50 }),
              value: fc.string({ minLength: 1, maxLength: 100 }),
              operation: fc.constantFrom('set', 'get', 'delete')
            }),
            { minLength: 5, maxLength: 20 }
          ),
          async (operations) => {
            const state = new Map<string, string>();
            
            for (const op of operations) {
              switch (op.operation) {
                case 'set':
                  await Cache.set(op.key, op.value, { namespace: 'test' });
                  state.set(op.key, op.value);
                  break;
                  
                case 'get':
                  const cached = await Cache.get<string>(op.key, { namespace: 'test' });
                  const expected = state.get(op.key) || null;
                  expect(cached).toEqual(expected);
                  break;
                  
                case 'delete':
                  await Cache.delete(op.key, { namespace: 'test' });
                  state.delete(op.key);
                  break;
              }
            }
            
            // Final consistency check
            for (const [key, expectedValue] of state.entries()) {
              const cachedValue = await Cache.get<string>(key, { namespace: 'test' });
              expect(cachedValue).toEqual(expectedValue);
            }
          }
        ),
        { numRuns: 50 }
      );
    });
  });
  
  describe('Cache Invalidation Consistency', () => {
    it('should properly invalidate expired keys', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            key: fc.string({ minLength: 1, maxLength: 100 }),
            value: fc.string(),
            ttl: fc.integer({ min: 1, max: 3 }) // Short TTL for testing
          }),
          async ({ key, value, ttl }) => {
            // Set with short TTL
            await Cache.set(key, value, { namespace: 'test', ttl });
            
            // Should exist immediately
            const immediate = await Cache.get(key, { namespace: 'test' });
            expect(immediate).toEqual(value);
            
            // Wait for expiration
            await new Promise(resolve => setTimeout(resolve, (ttl + 1) * 1000));
            
            // Should be expired
            const expired = await Cache.get(key, { namespace: 'test' });
            expect(expired).toBeNull();
            
            const exists = await Cache.exists(key, 'test');
            expect(exists).toBe(false);
          }
        ),
        { numRuns: 20, timeout: 10000 }
      );
    });
    
    it('should handle TTL updates consistently', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            key: fc.string({ minLength: 1, maxLength: 100 }),
            value: fc.string(),
            initialTtl: fc.integer({ min: 10, max: 30 }),
            newTtl: fc.integer({ min: 5, max: 60 })
          }),
          async ({ key, value, initialTtl, newTtl }) => {
            // Set with initial TTL
            await Cache.set(key, value, { namespace: 'test', ttl: initialTtl });
            
            // Update TTL
            const updated = await Cache.expire(key, newTtl, 'test');
            expect(updated).toBe(true);
            
            // Check new TTL
            const remainingTtl = await Cache.ttl(key, 'test');
            expect(remainingTtl).toBeGreaterThan(0);
            expect(remainingTtl).toBeLessThanOrEqual(newTtl);
            
            // Value should still be accessible
            const cachedValue = await Cache.get(key, { namespace: 'test' });
            expect(cachedValue).toEqual(value);
          }
        ),
        { numRuns: 30 }
      );
    });
  });
  
  describe('Batch Operations Consistency', () => {
    it('should maintain consistency in batch set/get operations', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              key: fc.string({ minLength: 1, maxLength: 50 }),
              value: fc.string({ minLength: 1, maxLength: 100 }),
              ttl: fc.option(fc.integer({ min: 10, max: 3600 }))
            }),
            { minLength: 2, maxLength: 10 }
          ),
          async (entries) => {
            // Batch set
            const setResult = await Cache.mset(
              entries.map(e => ({ key: e.key, value: e.value, ttl: e.ttl || undefined })),
              { namespace: 'test' }
            );
            expect(setResult).toBe(true);
            
            // Batch get
            const keys = entries.map(e => e.key);
            const results = await Cache.mget<string>(keys, { namespace: 'test' });
            
            // All values should match
            results.forEach((result, index) => {
              expect(result).toEqual(entries[index].value);
            });
            
            // Individual gets should also work
            for (let i = 0; i < entries.length; i++) {
              const individual = await Cache.get<string>(entries[i].key, { namespace: 'test' });
              expect(individual).toEqual(entries[i].value);
            }
          }
        ),
        { numRuns: 30 }
      );
    });
  });
  
  describe('Namespace Isolation', () => {
    it('should maintain isolation between different namespaces', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            key: fc.string({ minLength: 1, maxLength: 100 }),
            value1: fc.string(),
            value2: fc.string(),
            namespace1: fc.string({ minLength: 1, maxLength: 20 }),
            namespace2: fc.string({ minLength: 1, maxLength: 20 })
          }),
          async ({ key, value1, value2, namespace1, namespace2 }) => {
            // Assume different namespaces
            fc.pre(namespace1 !== namespace2);
            
            // Set same key in different namespaces
            await Cache.set(key, value1, { namespace: namespace1 });
            await Cache.set(key, value2, { namespace: namespace2 });
            
            // Values should be isolated
            const cached1 = await Cache.get(key, { namespace: namespace1 });
            const cached2 = await Cache.get(key, { namespace: namespace2 });
            
            expect(cached1).toEqual(value1);
            expect(cached2).toEqual(value2);
            
            // Delete from one namespace shouldn't affect the other
            await Cache.delete(key, { namespace: namespace1 });
            
            const afterDelete1 = await Cache.get(key, { namespace: namespace1 });
            const afterDelete2 = await Cache.get(key, { namespace: namespace2 });
            
            expect(afterDelete1).toBeNull();
            expect(afterDelete2).toEqual(value2);
          }
        ),
        { numRuns: 50 }
      );
    });
  });
  
  describe('Specialized Cache Consistency', () => {
    it('should maintain consistency in UserCache operations', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            userId: fc.uuid(),
            userData: fc.record({
              username: fc.string({ minLength: 1, maxLength: 50 }),
              email: fc.emailAddress(),
              roles: fc.array(fc.string(), { minLength: 1, maxLength: 5 })
            })
          }),
          async ({ userId, userData }) => {
            // Set user data
            const setResult = await UserCache.setUser(userId, userData);
            expect(setResult).toBe(true);
            
            // Get user data
            const cachedUser = await UserCache.getUser(userId);
            expect(cachedUser).toEqual(userData);
            
            // Delete user data
            const deleteResult = await UserCache.deleteUser(userId);
            expect(deleteResult).toBe(true);
            
            // Should be null after deletion
            const afterDelete = await UserCache.getUser(userId);
            expect(afterDelete).toBeNull();
          }
        ),
        { numRuns: 30 }
      );
    });
    
    it('should maintain consistency in ProjectCache operations', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            projectId: fc.uuid(),
            userId: fc.uuid(),
            projectData: fc.record({
              name: fc.string({ minLength: 1, maxLength: 100 }),
              url: fc.webUrl(),
              description: fc.string({ maxLength: 500 })
            }),
            projects: fc.array(
              fc.record({
                id: fc.uuid(),
                name: fc.string({ minLength: 1, maxLength: 100 })
              }),
              { minLength: 1, maxLength: 10 }
            )
          }),
          async ({ projectId, userId, projectData, projects }) => {
            // Set project data
            await ProjectCache.setProject(projectId, projectData);
            const cachedProject = await ProjectCache.getProject(projectId);
            expect(cachedProject).toEqual(projectData);
            
            // Set user projects
            await ProjectCache.setUserProjects(userId, projects);
            const cachedProjects = await ProjectCache.getUserProjects(userId);
            expect(cachedProjects).toEqual(projects);
          }
        ),
        { numRuns: 30 }
      );
    });
    
    it('should maintain consistency in TestRunCache operations', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            runId: fc.uuid(),
            runData: fc.record({
              scenarioId: fc.uuid(),
              status: fc.constantFrom('queued', 'running', 'completed', 'failed'),
              startedAt: fc.date(),
              duration: fc.integer({ min: 0, max: 300000 })
            }),
            status: fc.constantFrom('queued', 'running', 'completed', 'failed')
          }),
          async ({ runId, runData, status }) => {
            // Set test run data
            await TestRunCache.setTestRun(runId, runData);
            const cachedRun = await TestRunCache.getTestRun(runId);
            expect(cachedRun).toEqual(runData);
            
            // Set run status
            await TestRunCache.setRunStatus(runId, status);
            const cachedStatus = await TestRunCache.getRunStatus(runId);
            expect(cachedStatus).toEqual(status);
          }
        ),
        { numRuns: 30 }
      );
    });
  });
  
  describe('Cache Statistics Consistency', () => {
    it('should maintain accurate statistics across operations', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              key: fc.string({ minLength: 1, maxLength: 50 }),
              value: fc.string(),
              operation: fc.constantFrom('set', 'get', 'delete')
            }),
            { minLength: 10, maxLength: 50 }
          ),
          async (operations) => {
            // Reset stats
            Cache.resetStats();
            
            let expectedHits = 0;
            let expectedMisses = 0;
            let expectedSets = 0;
            let expectedDeletes = 0;
            const keyState = new Map<string, boolean>();
            
            for (const op of operations) {
              switch (op.operation) {
                case 'set':
                  await Cache.set(op.key, op.value, { namespace: 'test' });
                  keyState.set(op.key, true);
                  expectedSets++;
                  break;
                  
                case 'get':
                  await Cache.get(op.key, { namespace: 'test' });
                  if (keyState.get(op.key)) {
                    expectedHits++;
                  } else {
                    expectedMisses++;
                  }
                  break;
                  
                case 'delete':
                  await Cache.delete(op.key, { namespace: 'test' });
                  keyState.set(op.key, false);
                  expectedDeletes++;
                  break;
              }
            }
            
            const stats = Cache.getStats();
            expect(stats.hits).toBe(expectedHits);
            expect(stats.misses).toBe(expectedMisses);
            expect(stats.sets).toBe(expectedSets);
            expect(stats.deletes).toBe(expectedDeletes);
            
            // Hit rate calculation should be correct
            const totalRequests = expectedHits + expectedMisses;
            const expectedHitRate = totalRequests > 0 ? expectedHits / totalRequests : 0;
            expect(stats.hitRate).toBeCloseTo(expectedHitRate, 5);
          }
        ),
        { numRuns: 20 }
      );
    });
  });
  
  describe('Cache Stampede Prevention', () => {
    it('should prevent cache stampede with getOrSet operations', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            key: fc.string({ minLength: 1, maxLength: 100 }),
            value: fc.string(),
            concurrentRequests: fc.integer({ min: 2, max: 10 })
          }),
          async ({ key, value, concurrentRequests }) => {
            let factoryCallCount = 0;
            
            const factory = async () => {
              factoryCallCount++;
              // Simulate expensive operation
              await new Promise(resolve => setTimeout(resolve, 100));
              return value;
            };
            
            // Make concurrent requests
            const promises = Array(concurrentRequests).fill(null).map(() =>
              Cache.getOrSet(key, factory, { namespace: 'test', ttl: 60 })
            );
            
            const results = await Promise.all(promises);
            
            // All results should be the same
            results.forEach(result => {
              expect(result).toEqual(value);
            });
            
            // Factory should be called only once (stampede prevention)
            expect(factoryCallCount).toBe(1);
            
            // Value should be cached
            const cached = await Cache.get(key, { namespace: 'test' });
            expect(cached).toEqual(value);
          }
        ),
        { numRuns: 20, timeout: 5000 }
      );
    });
  });
  
  describe('Error Handling Consistency', () => {
    it('should handle Redis connection errors gracefully', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            key: fc.string({ minLength: 1, maxLength: 100 }),
            value: fc.string()
          }),
          async ({ key, value }) => {
            // These operations should not throw even if Redis has issues
            // (they should fail gracefully)
            
            const setResult = await Cache.set(key, value, { namespace: 'test' });
            // Should return boolean, not throw
            expect(typeof setResult).toBe('boolean');
            
            const getResult = await Cache.get(key, { namespace: 'test' });
            // Should return value or null, not throw
            expect(getResult === null || typeof getResult === 'string').toBe(true);
            
            const deleteResult = await Cache.delete(key, { namespace: 'test' });
            // Should return boolean, not throw
            expect(typeof deleteResult).toBe('boolean');
          }
        ),
        { numRuns: 30 }
      );
    });
  });
});

describe('Cache Performance Properties', () => {
  it('should maintain performance characteristics under load', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            key: fc.string({ minLength: 1, maxLength: 50 }),
            value: fc.string({ minLength: 1, maxLength: 1000 })
          }),
          { minLength: 100, maxLength: 500 }
        ),
        async (entries) => {
          const startTime = Date.now();
          
          // Batch operations should be faster than individual operations
          await Cache.mset(
            entries.map(e => ({ key: e.key, value: e.value })),
            { namespace: 'test' }
          );
          
          const batchSetTime = Date.now() - startTime;
          
          // Get all values
          const getStartTime = Date.now();
          const keys = entries.map(e => e.key);
          const results = await Cache.mget(keys, { namespace: 'test' });
          const batchGetTime = Date.now() - getStartTime;
          
          // Results should match
          results.forEach((result, index) => {
            expect(result).toEqual(entries[index].value);
          });
          
          // Performance should be reasonable (less than 1 second for batch operations)
          expect(batchSetTime).toBeLessThan(1000);
          expect(batchGetTime).toBeLessThan(1000);
        }
      ),
      { numRuns: 10, timeout: 10000 }
    );
  });
});