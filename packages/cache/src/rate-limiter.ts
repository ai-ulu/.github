// Production-ready rate limiting with Redis
// Implements sliding window and token bucket algorithms

import { redis, RedisKeyBuilder } from './client';

export interface RateLimitOptions {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Maximum requests per window
  keyGenerator?: (identifier: string) => string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  message?: string;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: Date;
  totalHits: number;
}

export interface TokenBucketOptions {
  capacity: number; // Maximum tokens in bucket
  refillRate: number; // Tokens added per second
  cost?: number; // Tokens consumed per request
}

// Sliding window rate limiter
export class SlidingWindowRateLimiter {
  private options: Required<RateLimitOptions>;
  
  constructor(options: RateLimitOptions) {
    this.options = {
      keyGenerator: (id: string) => RedisKeyBuilder.rateLimit(id, 'sliding'),
      skipSuccessfulRequests: false,
      skipFailedRequests: false,
      message: 'Too many requests',
      ...options,
    };
  }
  
  async checkLimit(identifier: string): Promise<RateLimitResult> {
    const key = this.options.keyGenerator(identifier);
    const now = Date.now();
    const windowStart = now - this.options.windowMs;
    
    // Use Lua script for atomic operations
    const script = `
      local key = KEYS[1]
      local window_start = tonumber(ARGV[1])
      local now = tonumber(ARGV[2])
      local max_requests = tonumber(ARGV[3])
      local window_ms = tonumber(ARGV[4])
      
      -- Remove expired entries
      redis.call('ZREMRANGEBYSCORE', key, 0, window_start)
      
      -- Count current requests in window
      local current_requests = redis.call('ZCARD', key)
      
      -- Check if limit exceeded
      if current_requests >= max_requests then
        local reset_time = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
        local oldest_request = reset_time[2] and tonumber(reset_time[2]) or now
        return {0, max_requests - current_requests, oldest_request + window_ms, current_requests}
      end
      
      -- Add current request
      redis.call('ZADD', key, now, now)
      redis.call('EXPIRE', key, math.ceil(window_ms / 1000))
      
      return {1, max_requests - current_requests - 1, now + window_ms, current_requests + 1}
    `;
    
    try {
      const result = await redis.eval(
        script,
        1,
        key,
        windowStart.toString(),
        now.toString(),
        this.options.maxRequests.toString(),
        this.options.windowMs.toString()
      ) as [number, number, number, number];
      
      return {
        allowed: result[0] === 1,
        remaining: result[1],
        resetTime: new Date(result[2]),
        totalHits: result[3],
      };
    } catch (error) {
      console.error('Rate limiter error:', error);
      // Fail open - allow request if Redis is down
      return {
        allowed: true,
        remaining: this.options.maxRequests - 1,
        resetTime: new Date(now + this.options.windowMs),
        totalHits: 1,
      };
    }
  }
  
  async reset(identifier: string): Promise<void> {
    const key = this.options.keyGenerator(identifier);
    await redis.del(key);
  }
}

// Token bucket rate limiter
export class TokenBucketRateLimiter {
  private options: Required<TokenBucketOptions>;
  
  constructor(options: TokenBucketOptions) {
    this.options = {
      cost: 1,
      ...options,
    };
  }
  
  async checkLimit(identifier: string, cost?: number): Promise<RateLimitResult> {
    const key = RedisKeyBuilder.rateLimit(identifier, 'bucket');
    const now = Date.now();
    const requestCost = cost || this.options.cost;
    
    // Use Lua script for atomic token bucket operations
    const script = `
      local key = KEYS[1]
      local capacity = tonumber(ARGV[1])
      local refill_rate = tonumber(ARGV[2])
      local cost = tonumber(ARGV[3])
      local now = tonumber(ARGV[4])
      
      -- Get current bucket state
      local bucket = redis.call('HMGET', key, 'tokens', 'last_refill')
      local tokens = tonumber(bucket[1]) or capacity
      local last_refill = tonumber(bucket[2]) or now
      
      -- Calculate tokens to add based on time elapsed
      local time_elapsed = (now - last_refill) / 1000
      local tokens_to_add = math.floor(time_elapsed * refill_rate)
      tokens = math.min(capacity, tokens + tokens_to_add)
      
      -- Check if enough tokens available
      if tokens < cost then
        -- Update bucket state
        redis.call('HMSET', key, 'tokens', tokens, 'last_refill', now)
        redis.call('EXPIRE', key, 3600) -- 1 hour expiry
        
        local time_to_refill = math.ceil((cost - tokens) / refill_rate)
        return {0, tokens, now + (time_to_refill * 1000), tokens}
      end
      
      -- Consume tokens
      tokens = tokens - cost
      
      -- Update bucket state
      redis.call('HMSET', key, 'tokens', tokens, 'last_refill', now)
      redis.call('EXPIRE', key, 3600)
      
      return {1, tokens, now + 1000, capacity - tokens}
    `;
    
    try {
      const result = await redis.eval(
        script,
        1,
        key,
        this.options.capacity.toString(),
        this.options.refillRate.toString(),
        requestCost.toString(),
        now.toString()
      ) as [number, number, number, number];
      
      return {
        allowed: result[0] === 1,
        remaining: result[1],
        resetTime: new Date(result[2]),
        totalHits: result[3],
      };
    } catch (error) {
      console.error('Token bucket error:', error);
      // Fail open
      return {
        allowed: true,
        remaining: this.options.capacity - requestCost,
        resetTime: new Date(now + 1000),
        totalHits: requestCost,
      };
    }
  }
  
  async reset(identifier: string): Promise<void> {
    const key = RedisKeyBuilder.rateLimit(identifier, 'bucket');
    await redis.del(key);
  }
}

// Fixed window rate limiter (simpler, more memory efficient)
export class FixedWindowRateLimiter {
  private options: Required<RateLimitOptions>;
  
  constructor(options: RateLimitOptions) {
    this.options = {
      keyGenerator: (id: string) => RedisKeyBuilder.rateLimit(id, 'fixed'),
      skipSuccessfulRequests: false,
      skipFailedRequests: false,
      message: 'Too many requests',
      ...options,
    };
  }
  
  async checkLimit(identifier: string): Promise<RateLimitResult> {
    const now = Date.now();
    const windowStart = Math.floor(now / this.options.windowMs) * this.options.windowMs;
    const key = `${this.options.keyGenerator(identifier)}:${windowStart}`;
    
    try {
      const current = await redis.incr(key);
      
      if (current === 1) {
        // Set expiry on first request in window
        await redis.expire(key, Math.ceil(this.options.windowMs / 1000));
      }
      
      const allowed = current <= this.options.maxRequests;
      const remaining = Math.max(0, this.options.maxRequests - current);
      const resetTime = new Date(windowStart + this.options.windowMs);
      
      return {
        allowed,
        remaining,
        resetTime,
        totalHits: current,
      };
    } catch (error) {
      console.error('Fixed window rate limiter error:', error);
      // Fail open
      return {
        allowed: true,
        remaining: this.options.maxRequests - 1,
        resetTime: new Date(windowStart + this.options.windowMs),
        totalHits: 1,
      };
    }
  }
  
  async reset(identifier: string): Promise<void> {
    const pattern = `${this.options.keyGenerator(identifier)}:*`;
    const keys = await redis.keys(pattern);
    
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  }
}

// Rate limiter factory
export class RateLimiterFactory {
  static createSlidingWindow(options: RateLimitOptions): SlidingWindowRateLimiter {
    return new SlidingWindowRateLimiter(options);
  }
  
  static createTokenBucket(options: TokenBucketOptions): TokenBucketRateLimiter {
    return new TokenBucketRateLimiter(options);
  }
  
  static createFixedWindow(options: RateLimitOptions): FixedWindowRateLimiter {
    return new FixedWindowRateLimiter(options);
  }
  
  // Pre-configured rate limiters for common use cases
  static createAPIRateLimiter(): SlidingWindowRateLimiter {
    return new SlidingWindowRateLimiter({
      windowMs: 15 * 60 * 1000, // 15 minutes
      maxRequests: 1000, // 1000 requests per 15 minutes
      message: 'API rate limit exceeded',
    });
  }
  
  static createAuthRateLimiter(): FixedWindowRateLimiter {
    return new FixedWindowRateLimiter({
      windowMs: 15 * 60 * 1000, // 15 minutes
      maxRequests: 5, // 5 login attempts per 15 minutes
      message: 'Too many authentication attempts',
    });
  }
  
  static createTestExecutionRateLimiter(): TokenBucketRateLimiter {
    return new TokenBucketRateLimiter({
      capacity: 10, // 10 concurrent test executions
      refillRate: 0.1, // 1 token every 10 seconds
      cost: 1,
    });
  }
  
  static createWebhookRateLimiter(): SlidingWindowRateLimiter {
    return new SlidingWindowRateLimiter({
      windowMs: 60 * 1000, // 1 minute
      maxRequests: 60, // 60 webhooks per minute
      message: 'Webhook rate limit exceeded',
    });
  }
}

// Rate limiter middleware for Express
export function createRateLimitMiddleware(
  rateLimiter: SlidingWindowRateLimiter | FixedWindowRateLimiter | TokenBucketRateLimiter,
  options: {
    keyGenerator?: (req: any) => string;
    onLimitReached?: (req: any, res: any, result: RateLimitResult) => void;
    skipSuccessfulRequests?: boolean;
    skipFailedRequests?: boolean;
  } = {}
) {
  const keyGenerator = options.keyGenerator || ((req: any) => req.ip || 'unknown');
  
  return async (req: any, res: any, next: any) => {
    try {
      const identifier = keyGenerator(req);
      const result = await rateLimiter.checkLimit(identifier);
      
      // Set rate limit headers
      res.set({
        'X-RateLimit-Limit': rateLimiter instanceof TokenBucketRateLimiter 
          ? (rateLimiter as any).options.capacity.toString()
          : (rateLimiter as any).options.maxRequests.toString(),
        'X-RateLimit-Remaining': result.remaining.toString(),
        'X-RateLimit-Reset': result.resetTime.toISOString(),
      });
      
      if (!result.allowed) {
        if (options.onLimitReached) {
          options.onLimitReached(req, res, result);
        } else {
          res.status(429).json({
            error: {
              code: 'RATE_LIMIT_EXCEEDED',
              message: 'Too many requests',
              retryAfter: result.resetTime,
            },
          });
        }
        return;
      }
      
      next();
    } catch (error) {
      console.error('Rate limit middleware error:', error);
      // Fail open - allow request if rate limiter fails
      next();
    }
  };
}

// Rate limiter monitoring
export class RateLimiterMonitor {
  static async getStats(pattern: string = '*'): Promise<{
    activeWindows: number;
    totalRequests: number;
    blockedRequests: number;
  }> {
    try {
      const keys = await redis.keys(`autoqa:rate_limit:${pattern}`);
      
      let totalRequests = 0;
      let blockedRequests = 0;
      
      // This is a simplified implementation
      // In production, you'd want more sophisticated monitoring
      
      return {
        activeWindows: keys.length,
        totalRequests,
        blockedRequests,
      };
    } catch (error) {
      console.error('Rate limiter monitoring error:', error);
      return {
        activeWindows: 0,
        totalRequests: 0,
        blockedRequests: 0,
      };
    }
  }
  
  static async clearExpiredWindows(): Promise<number> {
    try {
      // This would clean up expired rate limit windows
      // Implementation depends on the specific rate limiter type
      return 0;
    } catch (error) {
      console.error('Rate limiter cleanup error:', error);
      return 0;
    }
  }
}