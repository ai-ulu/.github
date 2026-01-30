// Rate limiting middleware using Redis backend
// Production-ready rate limiting with different strategies

import { Request, Response, NextFunction } from 'express';
import { RateLimiterFactory } from '@autoqa/cache';

export interface RateLimitOptions {
  windowMs: number;
  max: number;
  message?: string;
  keyGenerator?: (req: Request) => string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
}

/**
 * Rate limiter factory for different endpoints
 */
export class RateLimiter {
  /**
   * Create rate limiter middleware
   */
  static createLimiter(options: RateLimitOptions) {
    const rateLimiter = RateLimiterFactory.createSlidingWindow({
      windowMs: options.windowMs,
      maxRequests: options.max,
      message: options.message || 'Too many requests',
      keyGenerator: options.keyGenerator || ((req: Request) => {
        // Use user ID if authenticated, otherwise IP
        const userReq = req as any;
        return userReq.user?.userId || req.ip || 'unknown';
      }),
      skipSuccessfulRequests: options.skipSuccessfulRequests,
      skipFailedRequests: options.skipFailedRequests,
    });
    
    return async (req: Request, res: Response, next: NextFunction) => {
      try {
        const identifier = options.keyGenerator 
          ? options.keyGenerator(req)
          : ((req as any).user?.userId || req.ip || 'unknown');
        
        const result = await rateLimiter.checkLimit(identifier);
        
        // Set rate limit headers
        res.set({
          'X-RateLimit-Limit': options.max.toString(),
          'X-RateLimit-Remaining': result.remaining.toString(),
          'X-RateLimit-Reset': result.resetTime.toISOString(),
        });
        
        if (!result.allowed) {
          const retryAfter = Math.ceil((result.resetTime.getTime() - Date.now()) / 1000);
          
          res.set('Retry-After', retryAfter.toString());
          
          return res.status(429).json({
            error: {
              code: 'RATE_LIMIT_EXCEEDED',
              message: options.message || 'Too many requests',
              retryAfter: result.resetTime,
              correlationId: (req as any).correlationId,
              timestamp: new Date().toISOString(),
            },
          });
        }
        
        next();
      } catch (error) {
        console.error('Rate limiter error:', error);
        // Fail open - allow request if rate limiter fails
        next();
      }
    };
  }
  
  /**
   * Pre-configured rate limiters for common use cases
   */
  static auth = this.createLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 login attempts per 15 minutes
    message: 'Too many authentication attempts',
    keyGenerator: (req: Request) => req.ip || 'unknown',
  });
  
  static api = this.createLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000, // 1000 requests per 15 minutes
    message: 'API rate limit exceeded',
  });
  
  static webhook = this.createLimiter({
    windowMs: 60 * 1000, // 1 minute
    max: 60, // 60 webhooks per minute
    message: 'Webhook rate limit exceeded',
    keyGenerator: (req: Request) => req.ip || 'unknown',
  });
}

export const rateLimiter = RateLimiter;