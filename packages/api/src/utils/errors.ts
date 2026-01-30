// Error handling utilities
// Production-ready error handling with proper logging and responses

import { logger } from './logger';

export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly isOperational: boolean;

  constructor(
    statusCode: number,
    code: string,
    message: string,
    isOperational: boolean = true
  ) {
    super(message);
    
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends ApiError {
  public readonly details: any[];

  constructor(message: string, details: any[] = []) {
    super(400, 'validation_error', message);
    this.details = details;
  }
}

export class AuthenticationError extends ApiError {
  constructor(message: string = 'Authentication required') {
    super(401, 'authentication_required', message);
  }
}

export class AuthorizationError extends ApiError {
  constructor(message: string = 'Insufficient permissions') {
    super(403, 'insufficient_permissions', message);
  }
}

export class NotFoundError extends ApiError {
  constructor(resource: string = 'Resource') {
    super(404, 'not_found', `${resource} not found`);
  }
}

export class ConflictError extends ApiError {
  constructor(message: string = 'Resource conflict') {
    super(409, 'conflict', message);
  }
}

export class RateLimitError extends ApiError {
  public readonly retryAfter: number;

  constructor(retryAfter: number = 60) {
    super(429, 'rate_limit_exceeded', 'Too many requests');
    this.retryAfter = retryAfter;
  }
}

export class InternalServerError extends ApiError {
  constructor(message: string = 'Internal server error') {
    super(500, 'internal_server_error', message, false);
  }
}

export class ServiceUnavailableError extends ApiError {
  constructor(message: string = 'Service temporarily unavailable') {
    super(503, 'service_unavailable', message);
  }
}

// Error response formatter
export function formatErrorResponse(error: ApiError, correlationId?: string) {
  const response: any = {
    error: {
      code: error.code,
      message: error.message,
      statusCode: error.statusCode,
    },
  };

  if (correlationId) {
    response.error.correlationId = correlationId;
  }

  // Add details for validation errors
  if (error instanceof ValidationError && error.details.length > 0) {
    response.error.details = error.details;
  }

  // Add retry after for rate limit errors
  if (error instanceof RateLimitError) {
    response.error.retryAfter = error.retryAfter;
  }

  // Don't expose stack traces in production
  if (process.env.NODE_ENV !== 'production' && error.stack) {
    response.error.stack = error.stack;
  }

  return response;
}

// Global error handler middleware
export function handleApiError(error: any, req: any, res: any, next?: any) {
  let apiError: ApiError;

  // Convert known errors to ApiError
  if (error instanceof ApiError) {
    apiError = error;
  } else if (error.name === 'ValidationError') {
    apiError = new ValidationError(error.message, error.details);
  } else if (error.name === 'UnauthorizedError') {
    apiError = new AuthenticationError(error.message);
  } else if (error.name === 'ForbiddenError') {
    apiError = new AuthorizationError(error.message);
  } else if (error.code === 'P2002') {
    // Prisma unique constraint violation
    apiError = new ConflictError('Resource already exists');
  } else if (error.code === 'P2025') {
    // Prisma record not found
    apiError = new NotFoundError();
  } else if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
    // Database connection errors
    apiError = new ServiceUnavailableError('Database connection failed');
  } else {
    // Unknown error - log it and return generic error
    logger.error('Unhandled error', {
      message: error.message,
      stack: error.stack,
      code: error.code,
      correlationId: req?.correlationId,
    });
    
    apiError = new InternalServerError();
  }

  // Log operational errors at appropriate level
  if (apiError.isOperational) {
    if (apiError.statusCode >= 500) {
      logger.error('API error', {
        code: apiError.code,
        message: apiError.message,
        statusCode: apiError.statusCode,
        correlationId: req?.correlationId,
        url: req?.url,
        method: req?.method,
        userId: req?.user?.userId,
      });
    } else if (apiError.statusCode >= 400) {
      logger.warn('Client error', {
        code: apiError.code,
        message: apiError.message,
        statusCode: apiError.statusCode,
        correlationId: req?.correlationId,
        url: req?.url,
        method: req?.method,
        userId: req?.user?.userId,
      });
    }
  }

  // Send error response
  const errorResponse = formatErrorResponse(apiError, req?.correlationId);
  
  // Set retry-after header for rate limit errors
  if (apiError instanceof RateLimitError) {
    res.set('Retry-After', apiError.retryAfter.toString());
  }

  res.status(apiError.statusCode).json(errorResponse);
}

// Async error wrapper
export function asyncHandler(fn: Function) {
  return (req: any, res: any, next: any) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// Error boundary for unhandled promise rejections
process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  logger.error('Unhandled promise rejection', {
    reason: reason?.message || reason,
    stack: reason?.stack,
  });
  
  // Don't exit in production, just log
  if (process.env.NODE_ENV !== 'production') {
    process.exit(1);
  }
});

// Error boundary for uncaught exceptions
process.on('uncaughtException', (error: Error) => {
  logger.error('Uncaught exception', {
    message: error.message,
    stack: error.stack,
  });
  
  // Exit gracefully
  process.exit(1);
});

// Graceful shutdown handler
export function setupGracefulShutdown() {
  const signals = ['SIGTERM', 'SIGINT', 'SIGUSR2'];
  
  signals.forEach((signal) => {
    process.on(signal, () => {
      logger.info(`Received ${signal}, shutting down gracefully`);
      
      // Close server, database connections, etc.
      process.exit(0);
    });
  });
}