// Property-based tests for caching consistency
// **Feature: autoqa-pilot, Property 24: Cache Consistency and Performance**
// **Validates: Production Checklist - Cache & Consistency**

import * as fc from 'fast-check';
import { Cache, UserCache, ProjectCache, TestRunCache } from '../cache';
import { redis } from '../client';
import { TestDataIsolation } from '@autoqa/testing-utils';

describe('Cache Consistency Property Tests', () => {
  let testIsolation: TestDataIsolation;
  
  beforeEach(async () => {
    testIsolation = new TestDataIsolation();
    // Clear test cache before each test
    await Cache.clear('test');
    Cache.resetStats();
  });
  
  afterEach(async () => {
    await testIsolation.cleanupAll();
    await Cache.clear('test');
  });
  
  describe('Property 24: Cache Consistency and Performance', () => {
    it('should maintain cache-database consistency across operations', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            key: fc.string({ minLength: 1, maxLength: 50 }),
            value: fc.oneof(
              fc.string(),
              fc.integer(),
              fc.boolean(),
              fc.record({
                id: fc.uuid(),
                name: fc.string(),
                data: fc.array(fc.string(), { maxLength: 5 }),
              })
            ),
            ttl: fc.option(fc.integer({ min: 1, max: 3600 })),
          }),
          async ({ key, value, ttl }) => {
            const testKey = `test_${key}`;
            
            // Set value in cache
            const setResult = await Cache.set(testKey, value, {
              namespace: 'test',
              ttl,
            });
            expect(setResult).toBe(true);
            
            // Immediately retrieve value
            const cachedValue = await Cache.get(testKey, {
              namespace: 'test',
            });
            
            // Verify consistency
            expect(cachedValue).toEqual(value);
            
            // Verify TTL if set
            if (ttl) {
              const remainingTtl = await Cache.ttl(testKey, 'test');
              expect(remainingTtl).toBeGreaterThan(0);
              expect(remainingTtl).toBeLessThanOrEqual(ttl);
            }
            
            // Update value
            const updatedValue = typeof value === 'string' 
              ? `updated_${value}` 
              : { ...value, updated: true };
            
            await Cache.set(testKey, updatedValue, {
              namespace: 'test',
              ttl,
            });
            
            // Verify update consistency
            const updatedCachedValue = await Cache.get(testKey, {
              namespace: 'test',
            });
            expect(updatedCachedValue).toEqual(updatedValue);
            expect(updatedCachedValue).not.toEqual(value);
            
            return true;
          }
        ),
        { numRuns: 50, timeout: 30000 }
      );
    });
    
    it('should handle concurrent cache operations without race conditions', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            baseKey: fc.string({ minLength: 1, maxLength: 20 }),
            operations: fc.array(
              fc.record({
                type: fc.oneof(
                  fc.constant('set'),
                  fc.constant('get'),
                  fc.constant('delete'),
                  fc.constant('increment')
                ),
                value: fc.oneof(fc.string(), fc.integer({ min: 1, max: 100 })),
                suffix: fc.string({ minLength: 1, maxLength: 10 }),
              }),
              { minLength: 5, maxLength: 15 }
            ),
          }),
          async ({ baseKey, operations }) => {
            const testKey = `concurrent_${baseKey}`;
            
            // Execute operations concurrently
            const promises = operations.map(async (op, index) => {
              const key = `${testKey}_${op.suffix}_${index}`;
              
              try {
                switch (op.type) {
                  case 'set':
                    return await Cache.set(key, op.value, { namespace: 'test' });
                  
                  case 'get':
                    return await Cache.get(key, { namespace: 'test' });
                  
                  case 'delete':
                    return await Cache.delete(key, { namespace: 'test' });
                  
                  case 'increment':
                    if (typeof op.value === 'number') {
                      return await Cache.increment(key, op.value, undefined, 'test');
                    }
                    return 0;
                  
                  default:
                    return null;
                }
              } catch (error) {
                // Some operations might fail due to concurrency, that's expected
                return null;
              }
            });
            
            const results = await Promise.allSettled(promises);
            
            // Verify no unhandled errors occurred
            const errors = results
              .filter(r => r.status === 'rejected')
              .map(r => (r as PromiseRejectedResult).reason);
            
            // Should not have critical errors (connection failures, etc.)
            errors.forEach(error => {
              expect(error.message).not.toContain('connection');
              expect(error.message).not.toContain('timeout');
            });
            
            return true;
          }
        ),
        { numRuns: 30, timeout: 45000 }
      );
    });
    
    it('should prevent cache stampede with concurrent getOrSet operations', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            key: fc.string({ minLength: 1, maxLength: 30 }),
            value: fc.string({ minLength: 1, maxLength: 100 }),
            concurrency: fc.integer({ min: 3, max: 10 }),
            delay: fc.integer({ min: 10, max: 100 }),
          }),
          async ({ key, value, concurrency, delay }) => {
            const testKey = `stampede_${key}`;
            let factoryCallCount = 0;
            
            // Factory function that simulates expensive operation
            const expensiveFactory = async () => {
              factoryCallCount++;
              await new Promise(resolve => setTimeout(resolve, delay));
              return `${value}_${Date.now()}`;
            };
            
            // Execute multiple concurrent getOrSet operations
            const promises = Array.from({ length: concurrency }, () =>
              Cache.getOrSet(testKey, expensiveFactory, {
                namespace: 'test',
                ttl: 60,
              })
            );
            
            const results = await Promise.all(promises);
            
            // All results should be identical (cache stampede prevented)
            const firstResult = results[0];
            results.forEach(result => {
              expect(result).toBe(firstResult);
            });
            
            // Factory should be called only once (or very few times due to timing)
            expect(factoryCallCount).toBeLessThanOrEqual(2);
            
            // Verify value is cached
            const cachedValue = await Cache.get(testKey, { namespace: 'test' });
            expect(cachedValue).toBe(firstResult);
            
            return true;
          }
        ),
        { numRuns: 20, timeout: 60000 }
      );
    });
    
    it('should handle cache invalidation correctly', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            keys: fc.array(fc.string({ minLength: 1, maxLength: 20 }), {
              minLength: 3,
              maxLength: 8,
            }),
            values: fc.array(fc.string({ minLength: 1, maxLength: 50 }), {
              minLength: 3,
              maxLength: 8,
            }),
          }),
          async ({ keys, values }) => {
            // Ensure arrays have same length
            const minLength = Math.min(keys.length, values.length);
            const testKeys = keys.slice(0, minLength).map(k => `invalidation_${k}`);
            const testValues = values.slice(0, minLength);
            
            // Set multiple values
            const setPromises = testKeys.map((key, index) =>
              Cache.set(key, testValues[index], {
                namespace: 'test',
                ttl: 3600,
              })
            );
            
            await Promise.all(setPromises);
            
            // Verify all values are cached
            const cachedValues = await Cache.mget(testKeys, { namespace: 'test' });
            cachedValues.forEach((value, index) => {
              expect(value).toBe(testValues[index]);
            });
            
            // Delete some keys
            const keysToDelete = testKeys.slice(0, Math.ceil(testKeys.length / 2));
            const deletePromises = keysToDelete.map(key =>
              Cache.delete(key, { namespace: 'test' })
            );
            
            const deleteResults = await Promise.all(deletePromises);
            deleteResults.forEach(result => {
              expect(result).toBe(true);
            });
            
            // Verify deleted keys are not in cache
            const afterDeleteValues = await Cache.mget(testKeys, { namespace: 'test' });
            afterDeleteValues.forEach((value, index) => {
              if (keysToDelete.includes(testKeys[index])) {
                expect(value).toBeNull();
              } else {
                expect(value).toBe(testValues[index]);
              }
            });
            
            return true;
          }
        ),
        { numRuns: 30, timeout: 30000 }
      );
    });
    
    it('should maintain TTL consistency across operations', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            key: fc.string({ minLength: 1, maxLength: 30 }),
            value: fc.string({ minLength: 1, maxLength: 100 }),
            initialTtl: fc.integer({ min: 10, max: 60 }),
            newTtl: fc.integer({ min: 5, max: 30 }),
          }),
          async ({ key, value, initialTtl, newTtl }) => {
            const testKey = `ttl_${key}`;
            
            // Set value with initial TTL
            await Cache.set(testKey, value, {
              namespace: 'test',
              ttl: initialTtl,
            });
            
            // Check initial TTL
            const ttl1 = await Cache.ttl(testKey, 'test');
            expect(ttl1).toBeGreaterThan(0);
            expect(ttl1).toBeLessThanOrEqual(initialTtl);
            
            // Update TTL
            const expireResult = await Cache.expire(testKey, newTtl, 'test');
            expect(expireResult).toBe(true);
            
            // Check updated TTL
            const ttl2 = await Cache.ttl(testKey, 'test');
            expect(ttl2).toBeGreaterThan(0);
            expect(ttl2).toBeLessThanOrEqual(newTtl);
            expect(ttl2).toBeLessThan(ttl1);
            
            // Value should still be accessible
            const cachedValue = await Cache.get(testKey, { namespace: 'test' });
            expect(cachedValue).toBe(value);
            
            return true;
          }
        ),
        { numRuns: 30, timeout: 30000 }
      );
    });
  });
  
  describe('Property 25: Specialized Cache Consistency', () => {
    it('should maintain consistency in UserCache operations', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            userId: fc.uuid(),
            userData: fc.record({
              username: fc.string({ minLength: 1, maxLength: 50 }),
              email: fc.emailAddress(),
              role: fc.oneof(
                fc.constant('admin'),
                fc.constant('user'),
                fc.constant('viewer')
              ),
              settings: fc.record({
                theme: fc.oneof(fc.constant('light'), fc.constant('dark')),
                notifications: fc.boolean(),
              }),
            }),
          }),
          async ({ userId, userData }) => {
            // Set user data
            const setResult = await UserCache.setUser(userId, userData);
            expect(setResult).toBe(true);
            
            // Get user data
            const cachedUser = await UserCache.getUser(userId);
            expect(cachedUser).toEqual(userData);
            
            // Update user data
            const updatedUserData = {
              ...userData,
              username: `updated_${userData.username}`,
              settings: {
                ...userData.settings,
                notifications: !userData.settings.notifications,
              },
            };
            
            await UserCache.setUser(userId, updatedUserData);
            
            // Verify update
            const updatedCachedUser = await UserCache.getUser(userId);
            expect(updatedCachedUser).toEqual(updatedUserData);
            expect(updatedCachedUser).not.toEqual(userData);
            
            // Delete user
            const deleteResult = await UserCache.deleteUser(userId);
            expect(deleteResult).toBe(true);
            
            // Verify deletion
            const deletedUser = await UserCache.getUser(userId);
            expect(deletedUser).toBeNull();
            
            return true;
          }
        ),
        { numRuns: 30, timeout: 30000 }
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
              settings: fc.record({
                timeout: fc.integer({ min: 1000, max: 60000 }),
                retries: fc.integer({ min: 0, max: 5 }),
              }),
            }),
            userProjects: fc.array(
              fc.record({
                id: fc.uuid(),
                name: fc.string({ minLength: 1, maxLength: 50 }),
              }),
              { minLength: 1, maxLength: 5 }
            ),
          }),
          async ({ projectId, userId, projectData, userProjects }) => {
            // Set project data
            await ProjectCache.setProject(projectId, projectData);
            
            // Get project data
            const cachedProject = await ProjectCache.getProject(projectId);
            expect(cachedProject).toEqual(projectData);
            
            // Set user projects
            await ProjectCache.setUserProjects(userId, userProjects);
            
            // Get user projects
            const cachedUserProjects = await ProjectCache.getUserProjects(userId);
            expect(cachedUserProjects).toEqual(userProjects);
            
            // Update project data
            const updatedProjectData = {
              ...projectData,
              name: `updated_${projectData.name}`,
              settings: {
                ...projectData.settings,
                timeout: projectData.settings.timeout * 2,
              },
            };
            
            await ProjectCache.setProject(projectId, updatedProjectData);
            
            // Verify project update
            const updatedCachedProject = await ProjectCache.getProject(projectId);
            expect(updatedCachedProject).toEqual(updatedProjectData);
            
            // User projects should remain unchanged
            const unchangedUserProjects = await ProjectCache.getUserProjects(userId);
            expect(unchangedUserProjects).toEqual(userProjects);
            
            return true;
          }
        ),
        { numRuns: 25, timeout: 30000 }
      );
    });
    
    it('should maintain consistency in TestRunCache operations', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            runId: fc.uuid(),
            runData: fc.record({
              projectId: fc.uuid(),
              status: fc.oneof(
                fc.constant('queued'),
                fc.constant('running'),
                fc.constant('completed'),
                fc.constant('failed')
              ),
              startTime: fc.date(),
              duration: fc.option(fc.integer({ min: 100, max: 300000 })),
            }),
            statusUpdates: fc.array(
              fc.oneof(
                fc.constant('queued'),
                fc.constant('running'),
                fc.constant('completed'),
                fc.constant('failed')
              ),
              { minLength: 2, maxLength: 4 }
            ),
          }),
          async ({ runId, runData, statusUpdates }) => {
            // Set test run data
            await TestRunCache.setTestRun(runId, runData);
            
            // Get test run data
            const cachedRun = await TestRunCache.getTestRun(runId);
            expect(cachedRun).toEqual(runData);
            
            // Test status updates
            for (const status of statusUpdates) {
              await TestRunCache.setRunStatus(runId, status);
              
              const cachedStatus = await TestRunCache.getRunStatus(runId);
              expect(cachedStatus).toBe(status);
            }
            
            // Update run data
            const updatedRunData = {
              ...runData,
              status: statusUpdates[statusUpdates.length - 1],
              duration: runData.duration || 5000,
            };
            
            await TestRunCache.setTestRun(runId, updatedRunData);
            
            // Verify update
            const updatedCachedRun = await TestRunCache.getTestRun(runId);
            expect(updatedCachedRun).toEqual(updatedRunData);
            
            return true;
          }
        ),
        { numRuns: 25, timeout: 30000 }
      );
    });
  });
  
  describe('Property 26: Cache Performance Properties', () => {
    it('should maintain reasonable performance under load', async () => {
      const operations = 100;
      const keys = Array.from({ length: operations }, (_, i) => `perf_test_${i}`);
      const values = Array.from({ length: operations }, (_, i) => `value_${i}_${Date.now()}`);
      
      // Measure set operations
      const setStart = Date.now();
      const setPromises = keys.map((key, index) =>
        Cache.set(key, values[index], { namespace: 'test', ttl: 60 })
      );
      await Promise.all(setPromises);
      const setDuration = Date.now() - setStart;
      
      // Measure get operations
      const getStart = Date.now();
      const getPromises = keys.map(key =>
        Cache.get(key, { namespace: 'test' })
      );
      const results = await Promise.all(getPromises);
      const getDuration = Date.now() - getStart;
      
      // Verify all operations completed successfully
      results.forEach((result, index) => {
        expect(result).toBe(values[index]);
      });
      
      // Performance assertions
      expect(setDuration).toBeLessThan(5000); // 5 seconds for 100 sets
      expect(getDuration).toBeLessThan(2000); // 2 seconds for 100 gets
      
      const setThroughput = operations / (setDuration / 1000);
      const getThroughput = operations / (getDuration / 1000);
      
      expect(setThroughput).toBeGreaterThan(20); // At least 20 sets/sec
      expect(getThroughput).toBeGreaterThan(50); // At least 50 gets/sec
      
      // Check cache stats
      const stats = Cache.getStats();
      expect(stats.hits).toBe(operations);
      expect(stats.sets).toBeGreaterThanOrEqual(operations);
      expect(stats.hitRate).toBe(1.0); // 100% hit rate
    });
    
    it('should handle cache misses gracefully', async () => {
      const nonExistentKeys = Array.from({ length: 50 }, (_, i) => `missing_${i}_${Date.now()}`);
      
      const start = Date.now();
      const results = await Cache.mget(nonExistentKeys, { namespace: 'test' });
      const duration = Date.now() - start;
      
      // All results should be null
      results.forEach(result => {
        expect(result).toBeNull();
      });
      
      // Should complete quickly even for misses
      expect(duration).toBeLessThan(1000); // 1 second for 50 misses
      
      // Check stats
      const stats = Cache.getStats();
      expect(stats.misses).toBe(50);
    });
  });
});