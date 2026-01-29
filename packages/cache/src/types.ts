// TypeScript type definitions for Redis cache layer
// Comprehensive type safety for all cache operations

// Base cache types
export interface CacheEntry<T = any> {
  key: string;
  value: T;
  ttl?: number;
  createdAt: Date;
  expiresAt?: Date;
}

export interface CacheMetadata {
  size: number;
  hits: number;
  misses: number;
  hitRate: number;
  lastAccessed: Date;
}

// Cache configuration types
export interface CacheConfig {
  defaultTtl: number;
  maxMemory?: string;
  evictionPolicy?: 'allkeys-lru' | 'allkeys-lfu' | 'volatile-lru' | 'volatile-lfu' | 'allkeys-random' | 'volatile-random' | 'volatile-ttl' | 'noeviction';
  keyPrefix: string;
  serialization: {
    enabled: boolean;
    compression?: boolean;
  };
  monitoring: {
    enabled: boolean;
    metricsInterval: number;
  };
}

// Rate limiting types
export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  algorithm: 'sliding-window' | 'fixed-window' | 'token-bucket';
  keyGenerator: (identifier: string) => string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  message?: string;
}

export interface RateLimitInfo {
  limit: number;
  remaining: number;
  resetTime: Date;
  retryAfter?: number;
}

export interface TokenBucketConfig {
  capacity: number;
  refillRate: number;
  initialTokens?: number;
}

// Session management types
export interface SessionData {
  userId: string;
  username: string;
  email?: string;
  roles: string[];
  permissions: string[];
  metadata: Record<string, any>;
  createdAt: Date;
  lastActivity: Date;
  expiresAt: Date;
}

export interface SessionConfig {
  ttl: number;
  rolling: boolean;
  secure: boolean;
  httpOnly: boolean;
  sameSite: 'strict' | 'lax' | 'none';
  domain?: string;
  path: string;
}

// Queue types
export interface QueueJob<T = any> {
  id: string;
  type: string;
  data: T;
  priority: number;
  attempts: number;
  maxAttempts: number;
  delay?: number;
  createdAt: Date;
  processedAt?: Date;
  completedAt?: Date;
  failedAt?: Date;
  error?: string;
}

export interface QueueConfig {
  concurrency: number;
  maxAttempts: number;
  backoffStrategy: 'fixed' | 'exponential' | 'linear';
  backoffDelay: number;
  removeOnComplete: number;
  removeOnFail: number;
}

export interface QueueStats {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: boolean;
}

// Lock types
export interface LockConfig {
  ttl: number;
  retryDelay: number;
  retryCount: number;
  driftFactor: number;
}

export interface LockInfo {
  resource: string;
  lockId: string;
  acquiredAt: Date;
  expiresAt: Date;
  ttl: number;
}

// Health monitoring types
export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: Date;
  uptime: number;
  version: string;
  connections: number;
  memory: {
    used: string;
    peak: string;
    fragmentation: number;
  };
  performance: {
    latency: number;
    commandsPerSecond: number;
    hitRate: number;
  };
  errors: string[];
}

export interface HealthCheck {
  name: string;
  status: 'pass' | 'warn' | 'fail';
  message: string;
  duration: number;
  details?: Record<string, any>;
}

// Pub/Sub types
export interface PubSubMessage<T = any> {
  channel: string;
  pattern?: string;
  data: T;
  timestamp: Date;
  messageId: string;
}

export interface PubSubConfig {
  retryAttempts: number;
  retryDelay: number;
  maxListeners: number;
  enablePatterns: boolean;
}

// Metrics and monitoring types
export interface CacheMetrics {
  operations: {
    get: number;
    set: number;
    delete: number;
    increment: number;
    decrement: number;
  };
  performance: {
    averageLatency: number;
    p95Latency: number;
    p99Latency: number;
    throughput: number;
  };
  memory: {
    used: number;
    peak: number;
    fragmentation: number;
    evictions: number;
  };
  connections: {
    active: number;
    total: number;
    failed: number;
  };
  errors: {
    total: number;
    byType: Record<string, number>;
    recent: Array<{
      timestamp: Date;
      error: string;
      operation: string;
    }>;
  };
}

export interface PerformanceMetrics {
  timestamp: Date;
  operation: string;
  duration: number;
  success: boolean;
  error?: string;
  metadata?: Record<string, any>;
}

// Error types
export class CacheError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly operation: string,
    public readonly key?: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'CacheError';
  }
}

export class RateLimitError extends Error {
  constructor(
    message: string,
    public readonly limit: number,
    public readonly remaining: number,
    public readonly resetTime: Date,
    public readonly retryAfter: number
  ) {
    super(message);
    this.name = 'RateLimitError';
  }
}

export class LockError extends Error {
  constructor(
    message: string,
    public readonly resource: string,
    public readonly operation: 'acquire' | 'release' | 'extend',
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'LockError';
  }
}

export class SessionError extends Error {
  constructor(
    message: string,
    public readonly sessionId: string,
    public readonly operation: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'SessionError';
  }
}

// Utility types
export type CacheKey = string;
export type CacheValue = any;
export type CacheTTL = number;
export type CacheNamespace = string;

export type RateLimitIdentifier = string;
export type RateLimitWindow = number;

export type LockResource = string;
export type LockId = string;

export type SessionId = string;
export type UserId = string;

export type QueueName = string;
export type JobId = string;
export type JobType = string;

export type ChannelName = string;
export type MessageId = string;

// Configuration union types
export type CacheStrategy = 'write-through' | 'write-behind' | 'write-around' | 'refresh-ahead';
export type EvictionPolicy = 'lru' | 'lfu' | 'fifo' | 'random' | 'ttl';
export type SerializationFormat = 'json' | 'msgpack' | 'protobuf';
export type CompressionAlgorithm = 'gzip' | 'lz4' | 'snappy';

// Advanced types for complex operations
export interface BatchOperation<T = any> {
  type: 'get' | 'set' | 'delete' | 'increment' | 'decrement';
  key: string;
  value?: T;
  ttl?: number;
  options?: Record<string, any>;
}

export interface BatchResult<T = any> {
  key: string;
  success: boolean;
  value?: T;
  error?: string;
}

export interface TransactionOperation {
  command: string;
  args: any[];
}

export interface TransactionResult {
  success: boolean;
  results: any[];
  error?: string;
}

// Pipeline types
export interface PipelineOperation {
  command: string;
  args: any[];
  key?: string;
}

export interface PipelineResult {
  operations: number;
  success: boolean;
  results: any[];
  duration: number;
  error?: string;
}

// Streaming types
export interface StreamEntry {
  id: string;
  fields: Record<string, string>;
  timestamp: Date;
}

export interface StreamConfig {
  maxLength?: number;
  trimStrategy?: 'maxlen' | 'minid';
  approximateTrimming?: boolean;
}

export interface ConsumerGroup {
  name: string;
  stream: string;
  consumers: string[];
  pending: number;
  lastDeliveredId: string;
}

// Export all types as a namespace for easier imports
export namespace CacheTypes {
  export type Entry<T> = CacheEntry<T>;
  export type Metadata = CacheMetadata;
  export type Config = CacheConfig;
  export type Metrics = CacheMetrics;
  export type Strategy = CacheStrategy;
  export type Key = CacheKey;
  export type Value = CacheValue;
  export type TTL = CacheTTL;
  export type Namespace = CacheNamespace;
}

export namespace RateLimitTypes {
  export type Config = RateLimitConfig;
  export type Info = RateLimitInfo;
  export type TokenBucket = TokenBucketConfig;
  export type Identifier = RateLimitIdentifier;
  export type Window = RateLimitWindow;
}

export namespace SessionTypes {
  export type Data = SessionData;
  export type Config = SessionConfig;
  export type Id = SessionId;
}

export namespace QueueTypes {
  export type Job<T> = QueueJob<T>;
  export type Config = QueueConfig;
  export type Stats = QueueStats;
  export type Name = QueueName;
  export type Id = JobId;
  export type Type = JobType;
}

export namespace LockTypes {
  export type Config = LockConfig;
  export type Info = LockInfo;
  export type Resource = LockResource;
  export type Id = LockId;
}

export namespace HealthTypes {
  export type Status = HealthStatus;
  export type Check = HealthCheck;
}

export namespace PubSubTypes {
  export type Message<T> = PubSubMessage<T>;
  export type Config = PubSubConfig;
  export type Channel = ChannelName;
  export type MessageId = MessageId;
}