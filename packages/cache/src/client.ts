// Production-ready Redis client with connection management and monitoring
// Implements enterprise-grade Redis connection handling

import Redis, { RedisOptions, Cluster } from 'ioredis';

// Redis configuration with production optimizations
const redisConfig: RedisOptions = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  db: parseInt(process.env.REDIS_DB || '0'),
  
  // Connection settings
  connectTimeout: 10000, // 10 seconds
  lazyConnect: true,
  maxRetriesPerRequest: 3,
  retryDelayOnFailover: 100,
  enableReadyCheck: true,
  maxLoadingTimeout: 5000,
  
  // Connection pool settings
  family: 4, // IPv4
  keepAlive: true,
  
  // Retry strategy
  retryStrategy: (times: number) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  
  // Reconnect on error
  reconnectOnError: (err: Error) => {
    const targetError = 'READONLY';
    return err.message.includes(targetError);
  },
};

// Global Redis client instances
declare global {
  // eslint-disable-next-line no-var
  var __redis: Redis | undefined;
  // eslint-disable-next-line no-var
  var __redisSubscriber: Redis | undefined;
}

// Create Redis client with monitoring
function createRedisClient(config: RedisOptions = redisConfig): Redis {
  const client = new Redis(config);
  
  // Connection event handlers
  client.on('connect', () => {
    console.log('Redis client connected');
  });
  
  client.on('ready', () => {
    console.log('Redis client ready');
  });
  
  client.on('error', (error) => {
    console.error('Redis client error:', error);
  });
  
  client.on('close', () => {
    console.log('Redis client connection closed');
  });
  
  client.on('reconnecting', (ms) => {
    console.log(`Redis client reconnecting in ${ms}ms`);
  });
  
  client.on('end', () => {
    console.log('Redis client connection ended');
  });
  
  return client;
}

// Singleton pattern for Redis clients
export const redis = globalThis.__redis ?? createRedisClient();
export const redisSubscriber = globalThis.__redisSubscriber ?? createRedisClient({
  ...redisConfig,
  db: (parseInt(process.env.REDIS_DB || '0') + 1), // Use different DB for pub/sub
});

if (process.env.NODE_ENV !== 'production') {
  globalThis.__redis = redis;
  globalThis.__redisSubscriber = redisSubscriber;
}

// Redis health check
export async function checkRedisHealth(): Promise<{
  status: 'healthy' | 'unhealthy';
  latency: number;
  memory: {
    used: string;
    peak: string;
    fragmentation: number;
  };
  connections: number;
  error?: string;
}> {
  const start = Date.now();
  
  try {
    // Test basic connectivity
    await redis.ping();
    const latency = Date.now() - start;
    
    // Get Redis info
    const info = await redis.info('memory');
    const memoryInfo = parseRedisInfo(info);
    
    const connectionInfo = await redis.info('clients');
    const clientInfo = parseRedisInfo(connectionInfo);
    
    return {
      status: 'healthy',
      latency,
      memory: {
        used: memoryInfo.used_memory_human || '0B',
        peak: memoryInfo.used_memory_peak_human || '0B',
        fragmentation: parseFloat(memoryInfo.mem_fragmentation_ratio || '1.0'),
      },
      connections: parseInt(clientInfo.connected_clients || '0'),
    };
  } catch (error) {
    const latency = Date.now() - start;
    
    return {
      status: 'unhealthy',
      latency,
      memory: {
        used: '0B',
        peak: '0B',
        fragmentation: 0,
      },
      connections: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// Parse Redis INFO command output
function parseRedisInfo(info: string): Record<string, string> {
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

// Redis connection monitoring
export async function getRedisStats(): Promise<{
  info: {
    version: string;
    mode: string;
    uptime: number;
    connections: number;
    memory: {
      used: string;
      peak: string;
      fragmentation: number;
    };
    keyspace: Record<string, {
      keys: number;
      expires: number;
      avgTtl: number;
    }>;
  };
  performance: {
    commandsProcessed: number;
    commandsPerSecond: number;
    keyspaceHits: number;
    keyspaceMisses: number;
    hitRate: number;
  };
}> {
  try {
    const [serverInfo, memoryInfo, statsInfo, keyspaceInfo] = await Promise.all([
      redis.info('server'),
      redis.info('memory'),
      redis.info('stats'),
      redis.info('keyspace'),
    ]);
    
    const server = parseRedisInfo(serverInfo);
    const memory = parseRedisInfo(memoryInfo);
    const stats = parseRedisInfo(statsInfo);
    const keyspace = parseRedisInfo(keyspaceInfo);
    
    // Parse keyspace info
    const keyspaceStats: Record<string, { keys: number; expires: number; avgTtl: number }> = {};
    Object.entries(keyspace).forEach(([key, value]) => {
      if (key.startsWith('db')) {
        const match = value.match(/keys=(\d+),expires=(\d+),avg_ttl=(\d+)/);
        if (match) {
          keyspaceStats[key] = {
            keys: parseInt(match[1]),
            expires: parseInt(match[2]),
            avgTtl: parseInt(match[3]),
          };
        }
      }
    });
    
    const commandsProcessed = parseInt(stats.total_commands_processed || '0');
    const keyspaceHits = parseInt(stats.keyspace_hits || '0');
    const keyspaceMisses = parseInt(stats.keyspace_misses || '0');
    const hitRate = keyspaceHits + keyspaceMisses > 0 
      ? keyspaceHits / (keyspaceHits + keyspaceMisses) 
      : 0;
    
    return {
      info: {
        version: server.redis_version || 'unknown',
        mode: server.redis_mode || 'standalone',
        uptime: parseInt(server.uptime_in_seconds || '0'),
        connections: parseInt(server.connected_clients || '0'),
        memory: {
          used: memory.used_memory_human || '0B',
          peak: memory.used_memory_peak_human || '0B',
          fragmentation: parseFloat(memory.mem_fragmentation_ratio || '1.0'),
        },
        keyspace: keyspaceStats,
      },
      performance: {
        commandsProcessed,
        commandsPerSecond: parseInt(stats.instantaneous_ops_per_sec || '0'),
        keyspaceHits,
        keyspaceMisses,
        hitRate,
      },
    };
  } catch (error) {
    throw new Error(`Failed to get Redis stats: ${error}`);
  }
}

// Graceful shutdown
export async function disconnectRedis(): Promise<void> {
  try {
    await Promise.all([
      redis.disconnect(),
      redisSubscriber.disconnect(),
    ]);
    console.log('Redis connections closed gracefully');
  } catch (error) {
    console.error('Error closing Redis connections:', error);
  }
}

// Redis transaction helper
export async function withRedisTransaction<T>(
  fn: (multi: Redis) => Promise<T>
): Promise<T> {
  const multi = redis.multi();
  
  try {
    const result = await fn(multi);
    await multi.exec();
    return result;
  } catch (error) {
    multi.discard();
    throw error;
  }
}

// Redis pipeline helper for batch operations
export async function withRedisPipeline<T>(
  fn: (pipeline: Redis) => Promise<T>
): Promise<T> {
  const pipeline = redis.pipeline();
  
  try {
    const result = await fn(pipeline);
    await pipeline.exec();
    return result;
  } catch (error) {
    throw error;
  }
}

// Redis key pattern utilities
export class RedisKeyBuilder {
  private static readonly PREFIX = 'autoqa';
  
  static user(userId: string): string {
    return `${this.PREFIX}:user:${userId}`;
  }
  
  static project(projectId: string): string {
    return `${this.PREFIX}:project:${projectId}`;
  }
  
  static testRun(runId: string): string {
    return `${this.PREFIX}:run:${runId}`;
  }
  
  static session(sessionId: string): string {
    return `${this.PREFIX}:session:${sessionId}`;
  }
  
  static rateLimit(identifier: string, window: string): string {
    return `${this.PREFIX}:rate_limit:${identifier}:${window}`;
  }
  
  static lock(resource: string): string {
    return `${this.PREFIX}:lock:${resource}`;
  }
  
  static queue(queueName: string): string {
    return `${this.PREFIX}:queue:${queueName}`;
  }
  
  static cache(namespace: string, key: string): string {
    return `${this.PREFIX}:cache:${namespace}:${key}`;
  }
  
  static pubsub(channel: string): string {
    return `${this.PREFIX}:pubsub:${channel}`;
  }
}

// Redis connection pool monitoring
export class RedisConnectionMonitor {
  private static metrics = {
    connections: 0,
    commands: 0,
    errors: 0,
    reconnections: 0,
  };
  
  static getMetrics() {
    return { ...this.metrics };
  }
  
  static resetMetrics() {
    this.metrics = {
      connections: 0,
      commands: 0,
      errors: 0,
      reconnections: 0,
    };
  }
  
  static incrementConnections() {
    this.metrics.connections++;
  }
  
  static incrementCommands() {
    this.metrics.commands++;
  }
  
  static incrementErrors() {
    this.metrics.errors++;
  }
  
  static incrementReconnections() {
    this.metrics.reconnections++;
  }
}

// Add monitoring to Redis clients
redis.on('connect', () => RedisConnectionMonitor.incrementConnections());
redis.on('error', () => RedisConnectionMonitor.incrementErrors());
redis.on('reconnecting', () => RedisConnectionMonitor.incrementReconnections());

redisSubscriber.on('connect', () => RedisConnectionMonitor.incrementConnections());
redisSubscriber.on('error', () => RedisConnectionMonitor.incrementErrors());
redisSubscriber.on('reconnecting', () => RedisConnectionMonitor.incrementReconnections());

// Export the clients as default
export default redis;