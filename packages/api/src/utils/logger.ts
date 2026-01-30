// Production-ready logging with Winston
// Structured logging with correlation IDs and proper log levels

import winston from 'winston';

// Log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

// Log colors
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'white',
};

winston.addColors(colors);

// Custom format for development
const developmentFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  winston.format.colorize({ all: true }),
  winston.format.printf(
    (info) => `${info.timestamp} ${info.level}: ${info.message}${
      info.correlationId ? ` [${info.correlationId}]` : ''
    }${
      Object.keys(info).length > 3 
        ? ` ${JSON.stringify(
            Object.fromEntries(
              Object.entries(info).filter(([key]) => 
                !['timestamp', 'level', 'message', 'correlationId'].includes(key)
              )
            )
          )}` 
        : ''
    }`
  )
);

// Custom format for production
const productionFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Transports
const transports = [
  // Console transport
  new winston.transports.Console({
    format: process.env.NODE_ENV === 'production' ? productionFormat : developmentFormat,
  }),
];

// File transports for production
if (process.env.NODE_ENV === 'production') {
  transports.push(
    // Error log file
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      format: productionFormat,
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    
    // Combined log file
    new winston.transports.File({
      filename: 'logs/combined.log',
      format: productionFormat,
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    })
  );
}

// Create logger instance
export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  levels,
  transports,
  exitOnError: false,
});

// Request logging middleware
export function requestLogger(req: any, res: any, next: any) {
  // Generate correlation ID if not present
  if (!req.correlationId) {
    req.correlationId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  // Add correlation ID to response headers
  res.set('X-Correlation-ID', req.correlationId);
  
  // Log request
  logger.http('Incoming request', {
    method: req.method,
    url: req.url,
    userAgent: req.get('User-Agent'),
    ip: req.ip,
    correlationId: req.correlationId,
  });
  
  // Log response
  const originalSend = res.send;
  res.send = function(data: any) {
    logger.http('Outgoing response', {
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      correlationId: req.correlationId,
    });
    
    return originalSend.call(this, data);
  };
  
  next();
}

// Error logging helper
export function logError(error: Error, context?: Record<string, any>) {
  logger.error('Application error', {
    message: error.message,
    stack: error.stack,
    ...context,
  });
}

// Performance logging helper
export function logPerformance(operation: string, duration: number, context?: Record<string, any>) {
  logger.info('Performance metric', {
    operation,
    duration,
    ...context,
  });
}

// Security event logging
export function logSecurityEvent(event: string, context?: Record<string, any>) {
  logger.warn('Security event', {
    event,
    timestamp: new Date().toISOString(),
    ...context,
  });
}

// Database query logging
export function logDatabaseQuery(query: string, duration: number, context?: Record<string, any>) {
  logger.debug('Database query', {
    query,
    duration,
    ...context,
  });
}

// Cache operation logging
export function logCacheOperation(operation: string, key: string, hit: boolean, context?: Record<string, any>) {
  logger.debug('Cache operation', {
    operation,
    key,
    hit,
    ...context,
  });
}