/**
 * Property Tests for API Lifecycle
 * **Validates: Advanced API Management**
 * 
 * Tests API versioning consistency, deprecation timeline enforcement,
 * and idempotency key TTL behavior.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fc from 'fast-check';
import {
  APIVersionManager,
  IdempotencyKeyManager,
  GraphQLQueryLimiter,
  OpenAPIDocumentationGenerator,
  APIVersion,
  DeprecationPolicy,
  IdempotencyConfig,
  GraphQLLimits,
  OpenAPIConfig,
} from '../utils/api-lifecycle';
import { logger } from '../utils/logger';

// Mock logger
vi.mock('../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('API Lifecycle Property Tests', () => {
  let versionManager: APIVersionManager;
  let idempotencyManager: IdempotencyKeyManager;
  let graphqlLimiter: GraphQLQueryLimiter;
  let openApiGenerator: OpenAPIDocumentationGenerator;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    const deprecationPolicy: DeprecationPolicy = {
      minimumNoticePeriod: 30 * 24 * 60 * 60 * 1000, // 30 days
      warningPeriod: 7 * 24 * 60 * 60 * 1000, // 7 days
      gracePeriod: 90 * 24 * 60 * 60 * 1000, // 90 days
      notificationChannels: ['email', 'slack'],
    };

    versionManager = new APIVersionManager(deprecationPolicy);

    const idempotencyConfig: IdempotencyConfig = {
      keyTTL: 60 * 60 * 1000, // 1 hour
      maxKeyLength: 64,
      allowedMethods: ['POST', 'PUT', 'PATCH'],
      responseCache: true,
      cleanupInterval: 5 * 60 * 1000, // 5 minutes
    };

    idempotencyManager = new IdempotencyKeyManager(idempotencyConfig);

    const graphqlLimits: GraphQLLimits = {
      maxQueryDepth: 10,
      maxQueryComplexity: 1000,
      maxAliases: 50,
      timeoutMs: 30000,
      rateLimitPerMinute: 100,
    };

    graphqlLimiter = new GraphQLQueryLimiter(graphqlLimits);

    const openApiConfig: OpenAPIConfig = {
      version: '1.0.0',
      title: 'AutoQA API',
      description: 'AutoQA Pilot API Documentation',
      contact: {
        name: 'AutoQA Team',
        email: 'api@autoqa.com',
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT',
      },
      servers: [
        { url: 'https://api.autoqa.com/v1', description: 'Production' },
        { url: 'https://staging-api.autoqa.com/v1', description: 'Staging' },
      ],
      autoGenerate: true,
      outputPath: './docs/openapi.json',
    };

    openApiGenerator = new OpenAPIDocumentationGenerator(openApiConfig);
  });

  afterEach(() => {
    vi.useRealTimers();
    idempotencyManager.stop();
  });

  describe('API Versioning Consistency', () => {
    it('should maintain version ordering and compatibility correctly', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.record({
            version: fc.string({ minLength: 5, maxLength: 10 }).filter(v => /^\d+\.\d+\.\d+$/.test(v)),
            status: fc.constantFrom('active', 'deprecated', 'sunset'),
            releaseDate: fc.integer({ min: Date.now() - 365 * 24 * 60 * 60 * 1000, max: Date.now() }),
            breakingChanges: fc.array(fc.string({ minLength: 10, maxLength: 50 }), { maxLength: 5 }),
          }), { minLength: 1, maxLength: 10 }),
          async (versions) => {
            // Ensure unique versions
            const uniqueVersions = versions.filter((v, i, arr) => 
              arr.findIndex(other => other.version === v.version) === i
            );

            if (uniqueVersions.length === 0) return;

            // Register all versions
            for (const versionData of uniqueVersions) {
              const apiVersion: APIVersion = {
                ...versionData,
                deprecationDate: versionData.status === 'deprecated' ? Date.now() - 1000 : undefined,
                sunsetDate: versionData.status === 'sunset' ? Date.now() - 1000 : undefined,
              };

              versionManager.registerVersion(apiVersion);
            }

            // Test version compatibility for each version
            for (const versionData of uniqueVersions) {
              const compatibility = versionManager.getVersionCompatibility(versionData.version);

              expect(compatibility).toBeDefined();
              expect(compatibility.currentVersion).toBeDefined();

              // Status should match registered status
              if (versionData.status === 'active') {
                expect(compatibility.isSupported).toBe(true);
                expect(compatibility.status).toBe('active');
              } else if (versionData.status === 'deprecated') {
                expect(compatibility.status).toBe('deprecated');
                expect(compatibility.recommendedAction).toBe('upgrade');
              } else if (versionData.status === 'sunset') {
                expect(compatibility.isSupported).toBe(false);
                expect(compatibility.status).toBe('sunset');
              }
            }

            // All versions should be retrievable
            const allVersions = versionManager.getAllVersions();
            expect(allVersions.length).toBe(uniqueVersions.length);

            // Versions should be sorted by release date (newest first)
            for (let i = 1; i < allVersions.length; i++) {
              expect(allVersions[i - 1].releaseDate).toBeGreaterThanOrEqual(allVersions[i].releaseDate);
            }
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should handle version deprecation timeline correctly', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string().filter(v => /^\d+\.\d+\.\d+$/.test(v)),
          fc.string({ minLength: 10, maxLength: 100 }),
          async (version, reason) => {
            // Register an active version
            const apiVersion: APIVersion = {
              version,
              status: 'active',
              releaseDate: Date.now() - 30 * 24 * 60 * 60 * 1000, // 30 days ago
              breakingChanges: ['Breaking change 1'],
            };

            versionManager.registerVersion(apiVersion);

            // Verify it's active
            let compatibility = versionManager.getVersionCompatibility(version);
            expect(compatibility.isSupported).toBe(true);
            expect(compatibility.status).toBe('active');

            // Deprecate the version
            versionManager.deprecateVersion(version, reason);

            // Should now be deprecated but still supported
            compatibility = versionManager.getVersionCompatibility(version);
            expect(compatibility.isSupported).toBe(true);
            expect(compatibility.status).toBe('deprecated');
            expect(compatibility.recommendedAction).toBe('upgrade');
            expect(compatibility.sunsetDate).toBeDefined();

            // Fast forward to sunset time
            vi.advanceTimersByTime(90 * 24 * 60 * 60 * 1000 + 1000); // Grace period + buffer

            // Should now be sunset and unsupported
            compatibility = versionManager.getVersionCompatibility(version);
            expect(compatibility.isSupported).toBe(false);
            expect(compatibility.status).toBe('sunset');
          }
        ),
        { numRuns: 30 }
      );
    });

    it('should correctly identify current version from multiple active versions', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.record({
            major: fc.integer({ min: 1, max: 5 }),
            minor: fc.integer({ min: 0, max: 20 }),
            patch: fc.integer({ min: 0, max: 50 }),
            releaseDate: fc.integer({ min: Date.now() - 365 * 24 * 60 * 60 * 1000, max: Date.now() }),
          }), { minLength: 2, maxLength: 8 }),
          async (versionData) => {
            // Create versions and ensure uniqueness
            const versions = versionData
              .map(v => ({
                version: `${v.major}.${v.minor}.${v.patch}`,
                releaseDate: v.releaseDate,
              }))
              .filter((v, i, arr) => arr.findIndex(other => other.version === v.version) === i);

            if (versions.length < 2) return;

            // Register all as active versions
            for (const versionInfo of versions) {
              const apiVersion: APIVersion = {
                version: versionInfo.version,
                status: 'active',
                releaseDate: versionInfo.releaseDate,
                breakingChanges: [],
              };

              versionManager.registerVersion(apiVersion);
            }

            const currentVersion = versionManager.getCurrentVersion();
            expect(currentVersion).toBeDefined();

            // Current version should be one of the registered versions
            const registeredVersions = versions.map(v => v.version);
            expect(registeredVersions).toContain(currentVersion);

            // Should be the highest version number among active versions
            const sortedVersions = versions
              .map(v => v.version)
              .sort((a, b) => {
                const aParts = a.split('.').map(Number);
                const bParts = b.split('.').map(Number);
                
                for (let i = 0; i < 3; i++) {
                  if (aParts[i] !== bParts[i]) {
                    return bParts[i] - aParts[i]; // Descending order
                  }
                }
                return 0;
              });

            expect(currentVersion).toBe(sortedVersions[0]);
          }
        ),
        { numRuns: 30 }
      );
    });
  });

  describe('Deprecation Timeline Enforcement', () => {
    it('should enforce minimum notice period before deprecation', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string().filter(v => /^\d+\.\d+\.\d+$/.test(v)),
          fc.integer({ min: 1, max: 60 }), // days
          async (version, noticeDays) => {
            const noticeMs = noticeDays * 24 * 60 * 60 * 1000;
            const releaseDate = Date.now() - noticeMs;

            const apiVersion: APIVersion = {
              version,
              status: 'active',
              releaseDate,
              deprecationDate: Date.now() + 1000, // Scheduled for near future
              breakingChanges: [],
            };

            versionManager.registerVersion(apiVersion);

            // If notice period is less than minimum, deprecation should be delayed
            const minimumNotice = 30 * 24 * 60 * 60 * 1000; // 30 days
            const actualNotice = Date.now() - releaseDate;

            if (actualNotice < minimumNotice) {
              // Version should still be active
              const compatibility = versionManager.getVersionCompatibility(version);
              expect(compatibility.status).toBe('active');
            } else {
              // Version can be deprecated
              const compatibility = versionManager.getVersionCompatibility(version);
              expect(['active', 'deprecated']).toContain(compatibility.status);
            }
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should send notifications at appropriate times during deprecation timeline', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string().filter(v => /^\d+\.\d+\.\d+$/.test(v)),
          fc.array(fc.constantFrom('email', 'slack', 'webhook'), { minLength: 1, maxLength: 3 }),
          async (version, channels) => {
            const apiVersion: APIVersion = {
              version,
              status: 'active',
              releaseDate: Date.now() - 60 * 24 * 60 * 60 * 1000, // 60 days ago
              deprecationDate: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days from now
              breakingChanges: ['Breaking change'],
            };

            versionManager.registerVersion(apiVersion);

            // Fast forward to warning period
            vi.advanceTimersByTime(1 * 24 * 60 * 60 * 1000); // 1 day

            // Should have logged warning
            expect(logger.warn).toHaveBeenCalledWith(
              expect.stringContaining('will be deprecated soon'),
              expect.any(Object)
            );

            // Deprecate the version
            versionManager.deprecateVersion(version, 'End of life');

            // Should have logged deprecation
            expect(logger.warn).toHaveBeenCalledWith(
              expect.stringContaining('deprecated'),
              expect.any(Object)
            );

            // Fast forward to sunset
            vi.advanceTimersByTime(90 * 24 * 60 * 60 * 1000 + 1000);

            // Should have logged sunset
            expect(logger.error).toHaveBeenCalledWith(
              expect.stringContaining('has been sunset'),
              expect.any(Object)
            );
          }
        ),
        { numRuns: 30 }
      );
    });
  });

  describe('Idempotency Key TTL Behavior', () => {
    it('should respect TTL for idempotency keys', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.record({
            key: fc.string({ minLength: 8, maxLength: 32 }).filter(k => /^[a-zA-Z0-9_-]+$/.test(k)),
            method: fc.constantFrom('POST', 'PUT', 'PATCH'),
            result: fc.record({
              data: fc.string(),
              id: fc.integer(),
            }),
            statusCode: fc.constantFrom(200, 201, 202),
          }), { minLength: 1, maxLength: 20 }),
          fc.integer({ min: 1000, max: 10000 }), // TTL in ms
          async (operations, ttl) => {
            // Create manager with custom TTL
            const config: IdempotencyConfig = {
              keyTTL: ttl,
              maxKeyLength: 64,
              allowedMethods: ['POST', 'PUT', 'PATCH'],
              responseCache: true,
              cleanupInterval: ttl / 2,
            };

            const manager = new IdempotencyKeyManager(config);

            try {
              // Store all operations
              for (const op of operations) {
                manager.storeResult(op.key, op.method, op.result, op.statusCode);
              }

              // All keys should be retrievable immediately
              for (const op of operations) {
                const result = manager.getResult(op.key);
                expect(result).toBeDefined();
                expect(result!.result).toEqual(op.result);
                expect(result!.statusCode).toBe(op.statusCode);
                expect(result!.isFromCache).toBe(true);
              }

              // Fast forward to just before TTL expiry
              vi.advanceTimersByTime(ttl - 100);

              // Keys should still be valid
              for (const op of operations) {
                const result = manager.getResult(op.key);
                expect(result).toBeDefined();
              }

              // Fast forward past TTL
              vi.advanceTimersByTime(200);

              // Keys should now be expired
              for (const op of operations) {
                const result = manager.getResult(op.key);
                expect(result).toBeNull();
              }

              // Statistics should reflect the expiry
              const stats = manager.getStatistics();
              expect(stats.activeKeys).toBe(0);

            } finally {
              manager.stop();
            }
          }
        ),
        { numRuns: 30 }
      );
    });

    it('should validate idempotency keys correctly', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.oneof(
            fc.string({ minLength: 1, maxLength: 100 }), // Valid and invalid keys
            fc.string().filter(s => !/^[a-zA-Z0-9_-]+$/.test(s)), // Invalid characters
            fc.constant(''), // Empty string
            fc.constant(null), // Null
            fc.constant(undefined), // Undefined
          ), { minLength: 5, maxLength: 20 }),
          async (keys) => {
            const validKeys: string[] = [];
            const invalidKeys: any[] = [];

            for (const key of keys) {
              if (idempotencyManager.validateKey(key)) {
                validKeys.push(key);
              } else {
                invalidKeys.push(key);
              }
            }

            // Valid keys should be strings with valid characters and reasonable length
            for (const key of validKeys) {
              expect(typeof key).toBe('string');
              expect(key.length).toBeGreaterThan(0);
              expect(key.length).toBeLessThanOrEqual(64);
              expect(/^[a-zA-Z0-9_-]+$/.test(key)).toBe(true);
            }

            // Invalid keys should fail validation for good reasons
            for (const key of invalidKeys) {
              const isString = typeof key === 'string';
              if (isString) {
                const hasValidChars = /^[a-zA-Z0-9_-]+$/.test(key);
                const hasValidLength = key.length > 0 && key.length <= 64;
                
                // At least one validation rule should fail
                expect(hasValidChars && hasValidLength).toBe(false);
              } else {
                // Non-strings should always be invalid
                expect(isString).toBe(false);
              }
            }
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should handle concurrent access to idempotency keys correctly', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 8, maxLength: 16 }).filter(k => /^[a-zA-Z0-9_-]+$/.test(k)),
          fc.constantFrom('POST', 'PUT', 'PATCH'),
          fc.integer({ min: 2, max: 10 }),
          async (key, method, concurrentAccesses) => {
            // Store initial result
            const initialResult = { data: 'initial', timestamp: Date.now() };
            idempotencyManager.storeResult(key, method, initialResult, 200);

            // Make concurrent accesses
            const accessPromises = Array.from({ length: concurrentAccesses }, async (_, i) => {
              // Small delay to simulate real concurrent access
              await new Promise(resolve => setTimeout(resolve, Math.random() * 10));
              return idempotencyManager.getResult(key);
            });

            const results = await Promise.all(accessPromises);

            // All results should be the same (the initial result)
            for (const result of results) {
              expect(result).toBeDefined();
              expect(result!.result).toEqual(initialResult);
              expect(result!.statusCode).toBe(200);
              expect(result!.isFromCache).toBe(true);
            }

            // Statistics should reflect the accesses
            const stats = idempotencyManager.getStatistics();
            expect(stats.activeKeys).toBe(1);
            expect(stats.totalAccesses).toBeGreaterThanOrEqual(concurrentAccesses);
          }
        ),
        { numRuns: 30 }
      );
    });
  });

  describe('GraphQL Query Depth and Complexity Limits', () => {
    it('should correctly calculate and enforce query depth limits', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 15 }),
          fc.integer({ min: 1, max: 20 }),
          async (actualDepth, maxDepth) => {
            // Update limits
            graphqlLimiter.updateLimits({ maxQueryDepth: maxDepth });

            // Generate a query with specific depth
            const query = this.generateQueryWithDepth(actualDepth);
            
            const validation = graphqlLimiter.validateQuery(query);
            
            expect(validation.analysis.depth).toBeGreaterThan(0);
            
            if (actualDepth <= maxDepth) {
              expect(validation.isValid).toBe(true);
              expect(validation.violations).toHaveLength(0);
            } else {
              expect(validation.isValid).toBe(false);
              expect(validation.violations.some(v => v.includes('depth'))).toBe(true);
            }

            expect(validation.limits.maxQueryDepth).toBe(maxDepth);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should enforce query complexity limits correctly', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 10 }),
          fc.integer({ min: 5, max: 50 }),
          fc.integer({ min: 10, max: 2000 }),
          async (depth, fieldCount, maxComplexity) => {
            graphqlLimiter.updateLimits({ maxQueryComplexity: maxComplexity });

            // Generate query with specific characteristics
            const query = this.generateComplexQuery(depth, fieldCount);
            
            const validation = graphqlLimiter.validateQuery(query);
            
            expect(validation.analysis.complexity).toBeGreaterThan(0);
            expect(validation.analysis.fieldCount).toBeGreaterThan(0);

            if (validation.analysis.complexity <= maxComplexity) {
              expect(validation.violations.some(v => v.includes('complexity'))).toBe(false);
            } else {
              expect(validation.isValid).toBe(false);
              expect(validation.violations.some(v => v.includes('complexity'))).toBe(true);
            }
          }
        ),
        { numRuns: 40 }
      );
    });

    it('should limit aliases in GraphQL queries', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 0, max: 100 }),
          fc.integer({ min: 1, max: 50 }),
          async (actualAliases, maxAliases) => {
            graphqlLimiter.updateLimits({ maxAliases });

            // Generate query with specific number of aliases
            const query = this.generateQueryWithAliases(actualAliases);
            
            const validation = graphqlLimiter.validateQuery(query);
            
            expect(validation.analysis.aliasCount).toBe(actualAliases);

            if (actualAliases <= maxAliases) {
              expect(validation.violations.some(v => v.includes('alias'))).toBe(false);
            } else {
              expect(validation.isValid).toBe(false);
              expect(validation.violations.some(v => v.includes('alias'))).toBe(true);
            }

            expect(validation.limits.maxAliases).toBe(maxAliases);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should cache query analysis results for performance', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.string({ minLength: 20, maxLength: 200 }), { minLength: 1, maxLength: 10 }),
          async (queries) => {
            // Analyze each query multiple times
            const results: any[][] = [];
            
            for (const query of queries) {
              const queryResults = [];
              
              // Analyze same query multiple times
              for (let i = 0; i < 3; i++) {
                const analysis = graphqlLimiter.analyzeQuery(query);
                queryResults.push(analysis);
              }
              
              results.push(queryResults);
            }

            // Results for the same query should be identical (cached)
            for (const queryResults of results) {
              for (let i = 1; i < queryResults.length; i++) {
                expect(queryResults[i]).toEqual(queryResults[0]);
              }
            }
          }
        ),
        { numRuns: 30 }
      );
    });
  });

  describe('OpenAPI Documentation Generation', () => {
    it('should generate consistent OpenAPI specifications', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.record({
            path: fc.string({ minLength: 5, maxLength: 30 }).map(s => `/${s.replace(/[^a-zA-Z0-9]/g, '')}`),
            method: fc.constantFrom('get', 'post', 'put', 'delete', 'patch'),
            summary: fc.string({ minLength: 10, maxLength: 100 }),
            tags: fc.array(fc.string({ minLength: 3, maxLength: 20 }), { maxLength: 3 }),
          }), { minLength: 1, maxLength: 20 }),
          fc.array(fc.record({
            name: fc.string({ minLength: 3, maxLength: 20 }),
            type: fc.constantFrom('string', 'number', 'boolean', 'object', 'array'),
            description: fc.string({ minLength: 10, maxLength: 100 }),
          }), { maxLength: 10 }),
          async (endpoints, schemas) => {
            // Register endpoints
            for (const endpoint of endpoints) {
              openApiGenerator.registerEndpoint(endpoint.path, endpoint.method, {
                summary: endpoint.summary,
                tags: endpoint.tags,
              });
            }

            // Register schemas
            for (const schema of schemas) {
              openApiGenerator.registerSchema(schema.name, {
                type: schema.type,
                description: schema.description,
                properties: schema.type === 'object' ? { id: { type: 'string' } } : undefined,
              });
            }

            // Generate specification
            const spec = openApiGenerator.generateSpecification();

            // Validate basic structure
            expect(spec.openapi).toBe('3.0.3');
            expect(spec.info.title).toBe('AutoQA API');
            expect(spec.info.version).toBe('1.0.0');
            expect(spec.servers).toHaveLength(2);

            // Check paths
            const pathCount = new Set(endpoints.map(e => e.path)).size;
            expect(Object.keys(spec.paths)).toHaveLength(pathCount);

            // Check schemas
            expect(Object.keys(spec.components.schemas)).toHaveLength(schemas.length);

            // Validate specification
            const validation = openApiGenerator.validateSpecification();
            expect(validation.pathCount).toBe(pathCount);
            expect(validation.schemaCount).toBe(schemas.length);

            // Get summary
            const summary = openApiGenerator.getSpecificationSummary();
            expect(summary.pathCount).toBe(pathCount);
            expect(summary.schemaCount).toBe(schemas.length);
            expect(summary.version).toBe('1.0.0');
          }
        ),
        { numRuns: 30 }
      );
    });

    it('should handle duplicate path registrations correctly', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 5, maxLength: 20 }).map(s => `/${s}`),
          fc.array(fc.record({
            method: fc.constantFrom('get', 'post', 'put', 'delete'),
            summary: fc.string({ minLength: 10, maxLength: 50 }),
          }), { minLength: 1, maxLength: 4 }),
          async (path, methods) => {
            // Register same path with different methods
            for (const methodInfo of methods) {
              openApiGenerator.registerEndpoint(path, methodInfo.method, {
                summary: methodInfo.summary,
                tags: ['test'],
              });
            }

            const spec = openApiGenerator.generateSpecification();

            // Should have one path with multiple methods
            expect(Object.keys(spec.paths)).toHaveLength(1);
            expect(spec.paths[path]).toBeDefined();

            // Should have all registered methods
            const uniqueMethods = new Set(methods.map(m => m.method));
            for (const method of uniqueMethods) {
              expect(spec.paths[path][method]).toBeDefined();
            }
          }
        ),
        { numRuns: 30 }
      );
    });
  });

  // Helper methods for generating test queries
  private generateQueryWithDepth(depth: number): string {
    let query = 'query {';
    let current = 'user';
    
    for (let i = 0; i < depth; i++) {
      query += ` ${current} {`;
      current = i % 2 === 0 ? 'profile' : 'settings';
    }
    
    query += ' id';
    
    for (let i = 0; i < depth; i++) {
      query += ' }';
    }
    
    query += ' }';
    return query;
  }

  private generateComplexQuery(depth: number, fieldCount: number): string {
    let query = 'query {';
    
    for (let i = 0; i < fieldCount; i++) {
      query += ` field${i}`;
    }
    
    // Add nested structure for depth
    for (let d = 0; d < depth; d++) {
      query += ` nested${d} {`;
      for (let f = 0; f < Math.min(fieldCount, 5); f++) {
        query += ` subField${f}`;
      }
    }
    
    for (let d = 0; d < depth; d++) {
      query += ' }';
    }
    
    query += ' }';
    return query;
  }

  private generateQueryWithAliases(aliasCount: number): string {
    let query = 'query {';
    
    for (let i = 0; i < aliasCount; i++) {
      query += ` alias${i}: field${i}`;
    }
    
    query += ' }';
    return query;
  }
});