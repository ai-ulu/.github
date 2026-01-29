// Distributed locking with Redis
// Implements Redlock algorithm for distributed systems

import { redis, RedisKeyBuilder } from './client';
import { randomBytes } from 'crypto';

export interface LockOptions {
  ttl?: number; // Lock TTL in milliseconds
  retryDelay?: number; // Delay between retry attempts
  retryCount?: number; // Maximum retry attempts
  driftFactor?: number; // Clock drift factor
}

export interface LockResult {
  acquired: boolean;
  lockId?: string;
  ttl?: number;
  error?: string;
}

// Distributed lock implementation
export class DistributedLock {
  private static readonly DEFAULT_TTL = 30000; // 30 seconds
  private static readonly DEFAULT_RETRY_DELAY = 200; // 200ms
  private static readonly DEFAULT_RETRY_COUNT = 3;
  private static readonly DEFAULT_DRIFT_FACTOR = 0.01; // 1%
  
  private lockId: string;
  private resource: string;
  private options: Required<LockOptions>;
  
  constructor(resource: string, options: LockOptions = {}) {
    this.resource = resource;
    this.lockId = randomBytes(16).toString('hex');
    this.options = {
      ttl: options.ttl || DistributedLock.DEFAULT_TTL,
      retryDelay: options.retryDelay || DistributedLock.DEFAULT_RETRY_DELAY,
      retryCount: options.retryCount || DistributedLock.DEFAULT_RETRY_COUNT,
      driftFactor: options.driftFactor || DistributedLock.DEFAULT_DRIFT_FACTOR,
    };
  }
  
  /**
   * Acquire distributed lock
   */
  async acquire(): Promise<LockResult> {
    const key = RedisKeyBuilder.lock(this.resource);
    let attempts = 0;
    
    while (attempts < this.options.retryCount) {
      try {
        const startTime = Date.now();
        
        // Try to acquire lock
        const result = await redis.set(
          key,
          this.lockId,
          'PX',
          this.options.ttl,
          'NX'
        );
        
        const elapsedTime = Date.now() - startTime;
        const drift = Math.round(this.options.driftFactor * this.options.ttl) + 2;
        const validityTime = this.options.ttl - elapsedTime - drift;
        
        if (result === 'OK' && validityTime > 0) {
          return {
            acquired: true,
            lockId: this.lockId,
            ttl: validityTime,
          };
        }
        
        // Lock acquisition failed, wait before retry
        if (attempts < this.options.retryCount - 1) {
          await this.sleep(this.options.retryDelay);
        }
        
        attempts++;
      } catch (error) {
        return {
          acquired: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    }
    
    return {
      acquired: false,
      error: 'Failed to acquire lock after maximum retries',
    };
  }
  
  /**
   * Release distributed lock
   */
  async release(): Promise<boolean> {
    const key = RedisKeyBuilder.lock(this.resource);
    
    // Use Lua script to ensure atomic release
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;
    
    try {
      const result = await redis.eval(script, 1, key, this.lockId);
      return result === 1;
    } catch (error) {
      console.error('Lock release error:', error);
      return false;
    }
  }
  
  /**
   * Extend lock TTL
   */
  async extend(additionalTtl: number): Promise<boolean> {
    const key = RedisKeyBuilder.lock(this.resource);
    
    // Use Lua script to extend TTL atomically
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("pexpire", KEYS[1], ARGV[2])
      else
        return 0
      end
    `;
    
    try {
      const result = await redis.eval(script, 1, key, this.lockId, additionalTtl.toString());
      return result === 1;
    } catch (error) {
      console.error('Lock extend error:', error);
      return false;
    }
  }
  
  /**
   * Check if lock is still held
   */
  async isLocked(): Promise<boolean> {
    const key = RedisKeyBuilder.lock(this.resource);
    
    try {
      const value = await redis.get(key);
      return value === this.lockId;
    } catch (error) {
      console.error('Lock check error:', error);
      return false;
    }
  }
  
  /**
   * Get remaining TTL
   */
  async getRemainingTtl(): Promise<number> {
    const key = RedisKeyBuilder.lock(this.resource);
    
    try {
      return await redis.pttl(key);
    } catch (error) {
      console.error('Lock TTL check error:', error);
      return -1;
    }
  }
  
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Lock manager for handling multiple locks
export class LockManager {
  private locks = new Map<string, DistributedLock>();
  
  /**
   * Acquire lock with automatic management
   */
  async acquireLock(
    resource: string,
    options?: LockOptions
  ): Promise<DistributedLock | null> {
    if (this.locks.has(resource)) {
      throw new Error(`Lock already exists for resource: ${resource}`);
    }
    
    const lock = new DistributedLock(resource, options);
    const result = await lock.acquire();
    
    if (result.acquired) {
      this.locks.set(resource, lock);
      return lock;
    }
    
    return null;
  }
  
  /**
   * Release specific lock
   */
  async releaseLock(resource: string): Promise<boolean> {
    const lock = this.locks.get(resource);
    
    if (!lock) {
      return false;
    }
    
    const released = await lock.release();
    
    if (released) {
      this.locks.delete(resource);
    }
    
    return released;
  }
  
  /**
   * Release all managed locks
   */
  async releaseAllLocks(): Promise<void> {
    const releasePromises = Array.from(this.locks.entries()).map(
      async ([resource, lock]) => {
        try {
          await lock.release();
          this.locks.delete(resource);
        } catch (error) {
          console.error(`Failed to release lock for ${resource}:`, error);
        }
      }
    );
    
    await Promise.all(releasePromises);
  }
  
  /**
   * Get all active locks
   */
  getActiveLocks(): string[] {
    return Array.from(this.locks.keys());
  }
  
  /**
   * Check if resource is locked
   */
  hasLock(resource: string): boolean {
    return this.locks.has(resource);
  }
}

// Utility functions for common locking patterns
export class LockUtils {
  /**
   * Execute function with distributed lock
   */
  static async withLock<T>(
    resource: string,
    fn: () => Promise<T>,
    options?: LockOptions
  ): Promise<T> {
    const lock = new DistributedLock(resource, options);
    const result = await lock.acquire();
    
    if (!result.acquired) {
      throw new Error(`Failed to acquire lock for resource: ${resource}`);
    }
    
    try {
      return await fn();
    } finally {
      await lock.release();
    }
  }
  
  /**
   * Try to execute function with lock, return null if lock not acquired
   */
  static async tryWithLock<T>(
    resource: string,
    fn: () => Promise<T>,
    options?: LockOptions
  ): Promise<T | null> {
    const lock = new DistributedLock(resource, options);
    const result = await lock.acquire();
    
    if (!result.acquired) {
      return null;
    }
    
    try {
      return await fn();
    } finally {
      await lock.release();
    }
  }
  
  /**
   * Execute function with multiple locks (all or nothing)
   */
  static async withMultipleLocks<T>(
    resources: string[],
    fn: () => Promise<T>,
    options?: LockOptions
  ): Promise<T> {
    const locks: DistributedLock[] = [];
    const acquiredLocks: DistributedLock[] = [];
    
    try {
      // Create all locks
      for (const resource of resources) {
        locks.push(new DistributedLock(resource, options));
      }
      
      // Try to acquire all locks
      for (const lock of locks) {
        const result = await lock.acquire();
        
        if (!result.acquired) {
          throw new Error(`Failed to acquire lock for resource: ${lock['resource']}`);
        }
        
        acquiredLocks.push(lock);
      }
      
      // Execute function with all locks held
      return await fn();
    } finally {
      // Release all acquired locks
      const releasePromises = acquiredLocks.map(lock => lock.release());
      await Promise.all(releasePromises);
    }
  }
}

// Lock monitoring and cleanup
export class LockMonitor {
  /**
   * Get all active locks
   */
  static async getActiveLocks(): Promise<Array<{
    resource: string;
    lockId: string;
    ttl: number;
  }>> {
    try {
      const pattern = RedisKeyBuilder.lock('*');
      const keys = await redis.keys(pattern);
      
      const locks = await Promise.all(
        keys.map(async (key) => {
          const [lockId, ttl] = await Promise.all([
            redis.get(key),
            redis.pttl(key),
          ]);
          
          return {
            resource: key.replace(RedisKeyBuilder.lock(''), ''),
            lockId: lockId || 'unknown',
            ttl,
          };
        })
      );
      
      return locks.filter(lock => lock.ttl > 0);
    } catch (error) {
      console.error('Lock monitoring error:', error);
      return [];
    }
  }
  
  /**
   * Clean up expired locks
   */
  static async cleanupExpiredLocks(): Promise<number> {
    try {
      const pattern = RedisKeyBuilder.lock('*');
      const keys = await redis.keys(pattern);
      
      let cleaned = 0;
      
      for (const key of keys) {
        const ttl = await redis.pttl(key);
        
        if (ttl === -1 || ttl === -2) {
          // Lock has no TTL or is expired
          await redis.del(key);
          cleaned++;
        }
      }
      
      return cleaned;
    } catch (error) {
      console.error('Lock cleanup error:', error);
      return 0;
    }
  }
  
  /**
   * Force release lock (use with caution)
   */
  static async forceReleaseLock(resource: string): Promise<boolean> {
    try {
      const key = RedisKeyBuilder.lock(resource);
      const result = await redis.del(key);
      return result > 0;
    } catch (error) {
      console.error('Force release error:', error);
      return false;
    }
  }
}