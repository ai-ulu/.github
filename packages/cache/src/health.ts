// Redis health monitoring and diagnostics
// Production-ready health checks and monitoring

import { redis, redisSubscriber, checkRedisHealth, getRedisStats } from './client';
import { Cache } from './cache';

export interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  checks: {
    connectivity: HealthCheck;
    performance: HealthCheck;
    memory: HealthCheck;
    cache: HealthCheck;
    pubsub: HealthCheck;
  };
  metrics: {
    uptime: number;
    connections: number;
    commandsPerSecond: number;
    hitRate: number;
    memoryUsage: string;
    latency: number;
  };
}

export interface HealthCheck {
  status: 'pass' | 'warn' | 'fail';
  message: string;
  duration: number;
  details?: any;
}

// Redis health monitor
export class RedisHealthMonitor {
  private static readonly LATENCY_THRESHOLD = 100; // 100ms
  private static readonly MEMORY_THRESHOLD = 0.8; // 80%
  private static readonly HIT_RATE_THRESHOLD = 0.7; // 70%
  
  /**
   * Comprehensive health check
   */
  static async checkHealth(): Promise<HealthCheckResult> {
    const timestamp = new Date().toISOString();
    const startTime = Date.now();
    
    try {
      const [
        connectivityCheck,
        performanceCheck,
        memoryCheck,
        cacheCheck,
        pubsubCheck,
        redisStats,
      ] = await Promise.all([
        this.checkConnectivity(),
        this.checkPerformance(),
        this.checkMemory(),
        this.checkCache(),
        this.checkPubSub(),
        getRedisStats(),
      ]);
      
      const overallStatus = this.determineOverallStatus([
        connectivityCheck,
        performanceCheck,
        memoryCheck,
        cacheCheck,
        pubsubCheck,
      ]);
      
      return {
        status: overallStatus,
        timestamp,
        checks: {
          connectivity: connectivityCheck,
          performance: performanceCheck,
          memory: memoryCheck,
          cache: cacheCheck,
          pubsub: pubsubCheck,
        },
        metrics: {
          uptime: redisStats.info.uptime,
          connections: redisStats.info.connections,
          commandsPerSecond: redisStats.performance.commandsPerSecond,
          hitRate: redisStats.performance.hitRate,
          memoryUsage: redisStats.info.memory.used,
          latency: Date.now() - startTime,
        },
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        timestamp,
        checks: {
          connectivity: {
            status: 'fail',
            message: `Health check failed: ${error}`,
            duration: Date.now() - startTime,
          },
          performance: { status: 'fail', message: 'Not checked', duration: 0 },
          memory: { status: 'fail', message: 'Not checked', duration: 0 },
          cache: { status: 'fail', message: 'Not checked', duration: 0 },
          pubsub: { status: 'fail', message: 'Not checked', duration: 0 },
        },
        metrics: {
          uptime: 0,
          connections: 0,
          commandsPerSecond: 0,
          hitRate: 0,
          memoryUsage: '0B',
          latency: Date.now() - startTime,
        },
      };
    }
  }
  
  /**
   * Check Redis connectivity
   */
  private static async checkConnectivity(): Promise<HealthCheck> {
    const startTime = Date.now();
    
    try {
      const result = await checkRedisHealth();
      const duration = Date.now() - startTime;
      
      if (result.status === 'healthy') {
        return {
          status: 'pass',
          message: `Redis connected (${result.latency}ms)`,
          duration,
          details: {
            latency: result.latency,
            connections: result.connections,
          },
        };
      } else {
        return {
          status: 'fail',
          message: result.error || 'Redis connection failed',
          duration,
          details: result,
        };
      }
    } catch (error) {
      return {
        status: 'fail',
        message: `Connectivity check failed: ${error}`,
        duration: Date.now() - startTime,
      };
    }
  }
  
  /**
   * Check Redis performance
   */
  private static async checkPerformance(): Promise<HealthCheck> {
    const startTime = Date.now();
    
    try {
      // Test basic operations
      const testKey = `health_check:${Date.now()}`;
      const testValue = 'health_check_value';
      
      const opStart = Date.now();
      await redis.set(testKey, testValue, 'EX', 60);
      const setValue = await redis.get(testKey);
      await redis.del(testKey);
      const opDuration = Date.now() - opStart;
      
      const duration = Date.now() - startTime;
      
      if (setValue !== testValue) {
        return {
          status: 'fail',
          message: 'Redis operations failed',
          duration,
        };
      }
      
      if (opDuration > this.LATENCY_THRESHOLD) {
        return {
          status: 'warn',
          message: `High latency detected (${opDuration}ms)`,
          duration,
          details: { operationLatency: opDuration },
        };
      }
      
      return {
        status: 'pass',
        message: `Performance OK (${opDuration}ms)`,
        duration,
        details: { operationLatency: opDuration },
      };
    } catch (error) {
      return {
        status: 'fail',
        message: `Performance check failed: ${error}`,
        duration: Date.now() - startTime,
      };
    }
  }
  
  /**
   * Check Redis memory usage
   */
  private static async checkMemory(): Promise<HealthCheck> {
    const startTime = Date.now();
    
    try {
      const info = await redis.info('memory');
      const memoryInfo = this.parseRedisInfo(info);
      
      const usedMemory = parseInt(memoryInfo.used_memory || '0');
      const maxMemory = parseInt(memoryInfo.maxmemory || '0');
      const fragmentation = parseFloat(memoryInfo.mem_fragmentation_ratio || '1.0');
      
      const duration = Date.now() - startTime;
      
      let status: 'pass' | 'warn' | 'fail' = 'pass';
      let message = 'Memory usage OK';
      
      if (maxMemory > 0) {
        const memoryUsage = usedMemory / maxMemory;
        
        if (memoryUsage > this.MEMORY_THRESHOLD) {
          status = 'warn';
          message = `High memory usage (${(memoryUsage * 100).toFixed(1)}%)`;
        }
      }
      
      if (fragmentation > 2.0) {
        status = 'warn';
        message += ` High fragmentation (${fragmentation.toFixed(2)})`;
      }
      
      return {
        status,
        message,
        duration,
        details: {
          usedMemory: memoryInfo.used_memory_human,
          maxMemory: memoryInfo.maxmemory_human || 'unlimited',
          fragmentation,
          peakMemory: memoryInfo.used_memory_peak_human,
        },
      };
    } catch (error) {
      return {
        status: 'fail',
        message: `Memory check failed: ${error}`,
        duration: Date.now() - startTime,
      };
    }
  }
  
  /**
   * Check cache performance
   */
  private static async checkCache(): Promise<HealthCheck> {
    const startTime = Date.now();
    
    try {
      const stats = Cache.getStats();
      const duration = Date.now() - startTime;
      
      let status: 'pass' | 'warn' | 'fail' = 'pass';
      let message = 'Cache performance OK';
      
      if (stats.hitRate < this.HIT_RATE_THRESHOLD && stats.hits + stats.misses > 100) {
        status = 'warn';
        message = `Low cache hit rate (${(stats.hitRate * 100).toFixed(1)}%)`;
      }
      
      if (stats.errors > 0) {
        status = 'warn';
        message += ` Cache errors detected (${stats.errors})`;
      }
      
      return {
        status,
        message,
        duration,
        details: stats,
      };
    } catch (error) {
      return {
        status: 'fail',
        message: `Cache check failed: ${error}`,
        duration: Date.now() - startTime,
      };
    }
  }
  
  /**
   * Check pub/sub functionality
   */
  private static async checkPubSub(): Promise<HealthCheck> {
    const startTime = Date.now();
    
    try {
      const testChannel = `health_check:${Date.now()}`;
      const testMessage = 'health_check_message';
      
      // Set up subscriber
      let messageReceived = false;
      const messagePromise = new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Pub/sub timeout'));
        }, 5000);
        
        redisSubscriber.subscribe(testChannel, (err) => {
          if (err) {
            clearTimeout(timeout);
            reject(err);
          }
        });
        
        redisSubscriber.on('message', (channel, message) => {
          if (channel === testChannel && message === testMessage) {
            messageReceived = true;
            clearTimeout(timeout);
            resolve();
          }
        });
      });
      
      // Publish message
      setTimeout(() => {
        redis.publish(testChannel, testMessage);
      }, 100);
      
      // Wait for message
      await messagePromise;
      
      // Cleanup
      await redisSubscriber.unsubscribe(testChannel);
      
      const duration = Date.now() - startTime;
      
      return {
        status: messageReceived ? 'pass' : 'fail',
        message: messageReceived ? 'Pub/sub OK' : 'Pub/sub failed',
        duration,
      };
    } catch (error) {
      return {
        status: 'fail',
        message: `Pub/sub check failed: ${error}`,
        duration: Date.now() - startTime,
      };
    }
  }
  
  /**
   * Determine overall health status
   */
  private static determineOverallStatus(
    checks: HealthCheck[]
  ): 'healthy' | 'degraded' | 'unhealthy' {
    const hasFailures = checks.some(check => check.status === 'fail');
    const hasWarnings = checks.some(check => check.status === 'warn');
    
    if (hasFailures) {
      return 'unhealthy';
    } else if (hasWarnings) {
      return 'degraded';
    } else {
      return 'healthy';
    }
  }
  
  /**
   * Parse Redis INFO command output
   */
  private static parseRedisInfo(info: string): Record<string, string> {
    const result: Record<string, string> = {};
    
    info.split('\r\n').forEach(line => {
      if (line && !line.startsWith('#')) {
        const [key, value] = line.split(':');
        if (key && value) {
          result[key] = value;
        }
      }
    });
    
    return result;
  }
}

// Health check scheduler
export class HealthCheckScheduler {
  private static interval: NodeJS.Timeout | null = null;
  private static listeners: Array<(result: HealthCheckResult) => void> = [];
  
  /**
   * Start periodic health checks
   */
  static start(intervalMs: number = 30000): void {
    if (this.interval) {
      this.stop();
    }
    
    this.interval = setInterval(async () => {
      try {
        const result = await RedisHealthMonitor.checkHealth();
        this.notifyListeners(result);
        
        // Log unhealthy status
        if (result.status === 'unhealthy') {
          console.error('Redis health check failed:', result);
        } else if (result.status === 'degraded') {
          console.warn('Redis health degraded:', result);
        }
      } catch (error) {
        console.error('Health check error:', error);
      }
    }, intervalMs);
    
    console.log(`Health check scheduler started (interval: ${intervalMs}ms)`);
  }
  
  /**
   * Stop periodic health checks
   */
  static stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      console.log('Health check scheduler stopped');
    }
  }
  
  /**
   * Add health check listener
   */
  static addListener(listener: (result: HealthCheckResult) => void): void {
    this.listeners.push(listener);
  }
  
  /**
   * Remove health check listener
   */
  static removeListener(listener: (result: HealthCheckResult) => void): void {
    const index = this.listeners.indexOf(listener);
    if (index > -1) {
      this.listeners.splice(index, 1);
    }
  }
  
  /**
   * Notify all listeners
   */
  private static notifyListeners(result: HealthCheckResult): void {
    this.listeners.forEach(listener => {
      try {
        listener(result);
      } catch (error) {
        console.error('Health check listener error:', error);
      }
    });
  }
}

// Health metrics collector
export class HealthMetricsCollector {
  private static metrics: Array<{
    timestamp: string;
    status: string;
    latency: number;
    memoryUsage: string;
    hitRate: number;
  }> = [];
  
  private static readonly MAX_METRICS = 1000; // Keep last 1000 metrics
  
  /**
   * Collect health metrics
   */
  static collect(result: HealthCheckResult): void {
    this.metrics.push({
      timestamp: result.timestamp,
      status: result.status,
      latency: result.metrics.latency,
      memoryUsage: result.metrics.memoryUsage,
      hitRate: result.metrics.hitRate,
    });
    
    // Keep only recent metrics
    if (this.metrics.length > this.MAX_METRICS) {
      this.metrics = this.metrics.slice(-this.MAX_METRICS);
    }
  }
  
  /**
   * Get collected metrics
   */
  static getMetrics(limit?: number): Array<{
    timestamp: string;
    status: string;
    latency: number;
    memoryUsage: string;
    hitRate: number;
  }> {
    return limit ? this.metrics.slice(-limit) : [...this.metrics];
  }
  
  /**
   * Get metrics summary
   */
  static getSummary(): {
    totalChecks: number;
    healthyChecks: number;
    degradedChecks: number;
    unhealthyChecks: number;
    averageLatency: number;
    averageHitRate: number;
  } {
    const total = this.metrics.length;
    
    if (total === 0) {
      return {
        totalChecks: 0,
        healthyChecks: 0,
        degradedChecks: 0,
        unhealthyChecks: 0,
        averageLatency: 0,
        averageHitRate: 0,
      };
    }
    
    const healthy = this.metrics.filter(m => m.status === 'healthy').length;
    const degraded = this.metrics.filter(m => m.status === 'degraded').length;
    const unhealthy = this.metrics.filter(m => m.status === 'unhealthy').length;
    
    const avgLatency = this.metrics.reduce((sum, m) => sum + m.latency, 0) / total;
    const avgHitRate = this.metrics.reduce((sum, m) => sum + m.hitRate, 0) / total;
    
    return {
      totalChecks: total,
      healthyChecks: healthy,
      degradedChecks: degraded,
      unhealthyChecks: unhealthy,
      averageLatency: Math.round(avgLatency),
      averageHitRate: Math.round(avgHitRate * 100) / 100,
    };
  }
  
  /**
   * Clear collected metrics
   */
  static clear(): void {
    this.metrics = [];
  }
}

// Auto-start health monitoring in production
if (process.env.NODE_ENV === 'production') {
  HealthCheckScheduler.start();
  HealthCheckScheduler.addListener(HealthMetricsCollector.collect);
}