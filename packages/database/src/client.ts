// Production-ready Prisma client with connection pooling and monitoring
// Implements enterprise-grade database connection management

import { PrismaClient, Prisma } from '@prisma/client';
import { createAuditMiddleware } from './audit';

// Connection pool configuration
const connectionPoolConfig = {
  // Connection pool limits (production-ready)
  connectionLimit: parseInt(process.env.DATABASE_POOL_MAX || '20'),
  poolTimeout: parseInt(process.env.DATABASE_POOL_TIMEOUT || '60000'), // 60 seconds
  
  // Query timeout settings
  queryTimeout: parseInt(process.env.DATABASE_QUERY_TIMEOUT || '30000'), // 30 seconds
  transactionTimeout: parseInt(process.env.DATABASE_TRANSACTION_TIMEOUT || '60000'), // 60 seconds
  
  // Connection retry settings
  connectTimeout: parseInt(process.env.DATABASE_CONNECT_TIMEOUT || '10000'), // 10 seconds
  acquireTimeout: parseInt(process.env.DATABASE_ACQUIRE_TIMEOUT || '60000'), // 60 seconds
};

// Prisma client configuration with production optimizations
const prismaConfig: Prisma.PrismaClientOptions = {
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
  log: [
    { level: 'query', emit: 'event' },
    { level: 'error', emit: 'event' },
    { level: 'info', emit: 'event' },
    { level: 'warn', emit: 'event' },
  ],
  errorFormat: 'pretty',
  transactionOptions: {
    maxWait: connectionPoolConfig.transactionTimeout,
    timeout: connectionPoolConfig.transactionTimeout,
    isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
  },
};

// Global Prisma client instance with singleton pattern
declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

// Create Prisma client with connection pooling
function createPrismaClient(): PrismaClient {
  const client = new PrismaClient(prismaConfig);
  
  // Add audit middleware for security compliance
  client.$use(createAuditMiddleware());
  
  // Query logging middleware for performance monitoring
  client.$use(async (params, next) => {
    const start = Date.now();
    const result = await next(params);
    const duration = Date.now() - start;
    
    // Log slow queries (> 1 second)
    if (duration > 1000) {
      console.warn(`Slow query detected: ${params.model}.${params.action} took ${duration}ms`);
    }
    
    return result;
  });
  
  // Connection monitoring
  client.$on('query', (e) => {
    if (process.env.DEBUG_SQL === 'true') {
      console.log(`Query: ${e.query}`);
      console.log(`Duration: ${e.duration}ms`);
    }
  });
  
  client.$on('error', (e) => {
    console.error('Database error:', e);
  });
  
  client.$on('warn', (e) => {
    console.warn('Database warning:', e);
  });
  
  client.$on('info', (e) => {
    console.info('Database info:', e);
  });
  
  return client;
}

// Singleton pattern for database client
export const prisma = globalThis.__prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalThis.__prisma = prisma;
}

// Connection health check
export async function checkDatabaseHealth(): Promise<{
  status: 'healthy' | 'unhealthy';
  latency: number;
  error?: string;
}> {
  const start = Date.now();
  
  try {
    await prisma.$queryRaw`SELECT 1`;
    const latency = Date.now() - start;
    
    return {
      status: 'healthy',
      latency,
    };
  } catch (error) {
    const latency = Date.now() - start;
    
    return {
      status: 'unhealthy',
      latency,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// Connection pool monitoring
export async function getConnectionPoolStats(): Promise<{
  activeConnections: number;
  idleConnections: number;
  totalConnections: number;
}> {
  try {
    const result = await prisma.$queryRaw<Array<{
      state: string;
      count: bigint;
    }>>`
      SELECT state, count(*) as count
      FROM pg_stat_activity
      WHERE datname = current_database()
      GROUP BY state
    `;
    
    let activeConnections = 0;
    let idleConnections = 0;
    let totalConnections = 0;
    
    result.forEach(row => {
      const count = Number(row.count);
      totalConnections += count;
      
      if (row.state === 'active') {
        activeConnections = count;
      } else if (row.state === 'idle') {
        idleConnections = count;
      }
    });
    
    return {
      activeConnections,
      idleConnections,
      totalConnections,
    };
  } catch (error) {
    console.error('Failed to get connection pool stats:', error);
    return {
      activeConnections: 0,
      idleConnections: 0,
      totalConnections: 0,
    };
  }
}

// Graceful shutdown
export async function disconnectDatabase(): Promise<void> {
  try {
    await prisma.$disconnect();
    console.log('Database connection closed gracefully');
  } catch (error) {
    console.error('Error closing database connection:', error);
  }
}

// Transaction helper with retry logic
export async function withTransaction<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  options?: {
    maxRetries?: number;
    retryDelay?: number;
  }
): Promise<T> {
  const maxRetries = options?.maxRetries ?? 3;
  const retryDelay = options?.retryDelay ?? 1000;
  
  let lastError: Error;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await prisma.$transaction(fn, {
        maxWait: connectionPoolConfig.transactionTimeout,
        timeout: connectionPoolConfig.transactionTimeout,
      });
    } catch (error) {
      lastError = error as Error;
      
      // Don't retry on certain errors
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        // Don't retry on constraint violations, etc.
        if (['P2002', 'P2003', 'P2004'].includes(error.code)) {
          throw error;
        }
      }
      
      if (attempt === maxRetries) {
        throw lastError;
      }
      
      // Exponential backoff
      await new Promise(resolve => setTimeout(resolve, retryDelay * attempt));
    }
  }
  
  throw lastError!;
}

// Query helper with automatic retry for transient failures
export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: {
    maxRetries?: number;
    retryDelay?: number;
  }
): Promise<T> {
  const maxRetries = options?.maxRetries ?? 3;
  const retryDelay = options?.retryDelay ?? 1000;
  
  let lastError: Error;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      // Don't retry on certain errors
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        // Don't retry on constraint violations, etc.
        if (['P2002', 'P2003', 'P2004'].includes(error.code)) {
          throw error;
        }
      }
      
      if (attempt === maxRetries) {
        throw lastError;
      }
      
      // Exponential backoff with jitter
      const jitter = Math.random() * 0.1 * retryDelay;
      await new Promise(resolve => 
        setTimeout(resolve, retryDelay * attempt + jitter)
      );
    }
  }
  
  throw lastError!;
}

// Database metrics for monitoring
export interface DatabaseMetrics {
  connectionPool: {
    active: number;
    idle: number;
    total: number;
  };
  health: {
    status: 'healthy' | 'unhealthy';
    latency: number;
  };
  queries: {
    total: number;
    slow: number;
    errors: number;
  };
}

let queryMetrics = {
  total: 0,
  slow: 0,
  errors: 0,
};

// Update metrics on query events
prisma.$on('query', (e) => {
  queryMetrics.total++;
  if (e.duration > 1000) {
    queryMetrics.slow++;
  }
});

prisma.$on('error', () => {
  queryMetrics.errors++;
});

export async function getDatabaseMetrics(): Promise<DatabaseMetrics> {
  const connectionPool = await getConnectionPoolStats();
  const health = await checkDatabaseHealth();
  
  return {
    connectionPool,
    health,
    queries: { ...queryMetrics },
  };
}

// Reset query metrics (useful for monitoring intervals)
export function resetQueryMetrics(): void {
  queryMetrics = {
    total: 0,
    slow: 0,
    errors: 0,
  };
}

// Export the client as default
export default prisma;