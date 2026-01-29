// Test helper functions for AutoQA Pilot
// Utilities for setting up and tearing down test environments

import { randomUUID } from 'crypto';
import * as fc from 'fast-check';

/**
 * Sleep utility for tests
 */
export const sleep = (ms: number): Promise<void> => 
  new Promise(resolve => setTimeout(resolve, ms));

/**
 * Retry utility for flaky operations
 */
export async function retry<T>(
  operation: () => Promise<T>,
  maxAttempts: number = 3,
  delay: number = 1000
): Promise<T> {
  let lastError: Error;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      
      if (attempt === maxAttempts) {
        throw lastError;
      }
      
      await sleep(delay * attempt); // Exponential backoff
    }
  }
  
  throw lastError!;
}

/**
 * Timeout wrapper for operations
 */
export async function withTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
  errorMessage?: string
): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new Error(errorMessage || `Operation timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });
  
  return Promise.race([operation, timeoutPromise]);
}

/**
 * Generate test correlation ID
 */
export const generateCorrelationId = (): string => 
  `test-${randomUUID()}`;

/**
 * Create test timestamp
 */
export const createTestTimestamp = (): Date => new Date();

/**
 * Mock timer utilities
 */
export class MockTimer {
  private timers: Map<string, NodeJS.Timeout> = new Map();
  
  setTimeout(callback: () => void, delay: number, id?: string): string {
    const timerId = id || randomUUID();
    const timer = setTimeout(callback, delay);
    this.timers.set(timerId, timer);
    return timerId;
  }
  
  clearTimeout(id: string): void {
    const timer = this.timers.get(id);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(id);
    }
  }
  
  clearAll(): void {
    this.timers.forEach(timer => clearTimeout(timer));
    this.timers.clear();
  }
}

/**
 * Test data isolation helper
 */
export class TestDataIsolation {
  private createdResources: Array<{
    type: string;
    id: string;
    cleanup: () => Promise<void>;
  }> = [];
  
  addResource(type: string, id: string, cleanup: () => Promise<void>): void {
    this.createdResources.push({ type, id, cleanup });
  }
  
  async cleanupAll(): Promise<void> {
    const cleanupPromises = this.createdResources.map(async resource => {
      try {
        await resource.cleanup();
      } catch (error) {
        console.warn(`Failed to cleanup ${resource.type} ${resource.id}:`, error);
      }
    });
    
    await Promise.allSettled(cleanupPromises);
    this.createdResources = [];
  }
}

/**
 * Property test configuration
 */
export const propertyTestConfig = {
  numRuns: 100,
  timeout: 30000,
  verbose: true,
  seed: process.env.PROPERTY_TEST_SEED ? parseInt(process.env.PROPERTY_TEST_SEED) : undefined
};

/**
 * Run property test with standard configuration
 */
export function runPropertyTest<T>(
  name: string,
  arbitrary: fc.Arbitrary<T>,
  predicate: (value: T) => boolean | Promise<boolean>,
  config: Partial<typeof propertyTestConfig> = {}
): void {
  const finalConfig = { ...propertyTestConfig, ...config };
  
  it(name, async () => {
    await fc.assert(
      fc.asyncProperty(arbitrary, predicate),
      finalConfig
    );
  }, finalConfig.timeout);
}

/**
 * Create test environment variables
 */
export function createTestEnv(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    NODE_ENV: 'test',
    DATABASE_URL: 'postgresql://test_user:test_password@localhost:5433/autoqa_pilot_test',
    REDIS_URL: 'redis://localhost:6380/1',
    JWT_SECRET: 'test_jwt_secret_key_for_testing_only',
    ENCRYPTION_KEY: 'test_encryption_key_32_characters',
    MINIO_ENDPOINT: 'localhost:9000',
    MINIO_ACCESS_KEY: 'test_access_key',
    MINIO_SECRET_KEY: 'test_secret_key',
    MINIO_BUCKET_NAME: 'autoqa-test-storage',
    LOG_LEVEL: 'error', // Reduce noise in tests
    ...overrides
  };
}

/**
 * Mock HTTP response helper
 */
export function createMockResponse(
  status: number = 200,
  data: any = {},
  headers: Record<string, string> = {}
) {
  return {
    status,
    data,
    headers: {
      'content-type': 'application/json',
      ...headers
    },
    ok: status >= 200 && status < 300
  };
}

/**
 * Mock HTTP error helper
 */
export function createMockError(
  status: number,
  message: string,
  code?: string
) {
  const error = new Error(message) as any;
  error.status = status;
  error.code = code;
  error.response = {
    status,
    data: { error: { message, code } }
  };
  return error;
}

/**
 * Test performance measurement
 */
export class PerformanceMeasurement {
  private startTime: number = 0;
  private measurements: Array<{ name: string; duration: number }> = [];
  
  start(): void {
    this.startTime = performance.now();
  }
  
  measure(name: string): number {
    const duration = performance.now() - this.startTime;
    this.measurements.push({ name, duration });
    this.startTime = performance.now();
    return duration;
  }
  
  getResults(): Array<{ name: string; duration: number }> {
    return [...this.measurements];
  }
  
  getTotalDuration(): number {
    return this.measurements.reduce((total, m) => total + m.duration, 0);
  }
  
  reset(): void {
    this.measurements = [];
    this.startTime = 0;
  }
}

/**
 * Memory usage tracking for tests
 */
export class MemoryTracker {
  private initialMemory: NodeJS.MemoryUsage;
  
  constructor() {
    this.initialMemory = process.memoryUsage();
  }
  
  getCurrentUsage(): NodeJS.MemoryUsage {
    return process.memoryUsage();
  }
  
  getMemoryDelta(): {
    rss: number;
    heapTotal: number;
    heapUsed: number;
    external: number;
  } {
    const current = process.memoryUsage();
    return {
      rss: current.rss - this.initialMemory.rss,
      heapTotal: current.heapTotal - this.initialMemory.heapTotal,
      heapUsed: current.heapUsed - this.initialMemory.heapUsed,
      external: current.external - this.initialMemory.external
    };
  }
  
  checkMemoryLeak(thresholdMB: number = 50): boolean {
    const delta = this.getMemoryDelta();
    const heapDeltaMB = delta.heapUsed / 1024 / 1024;
    return heapDeltaMB > thresholdMB;
  }
}

/**
 * Test fixture loader
 */
export class FixtureLoader {
  private fixtures: Map<string, any> = new Map();
  
  load<T>(name: string, factory: () => T): T {
    if (!this.fixtures.has(name)) {
      this.fixtures.set(name, factory());
    }
    return this.fixtures.get(name) as T;
  }
  
  clear(): void {
    this.fixtures.clear();
  }
  
  has(name: string): boolean {
    return this.fixtures.has(name);
  }
}

/**
 * Global test fixture loader instance
 */
export const fixtures = new FixtureLoader();