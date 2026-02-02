/**
 * Webhook Routes for CI/CD Integration
 * **Validates: Requirements 10.1, 10.2, 10.3, 10.4**
 * 
 * Provides webhook endpoints for external systems to trigger test executions
 * and receive real-time status updates with proper authentication.
 */

import express from 'express';
import crypto from 'crypto';
import { body, param, query, validationResult } from 'express-validator';
import { logger } from '../utils/logger';
import { rateLimiter } from '../middleware/rate-limiter';

const router = express.Router();

// In-memory storage for webhook executions (in production, use Redis/Database)
const webhookExecutions = new Map<string, WebhookExecution>();

interface WebhookExecution {
  id: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  projectId: string;
  testSuiteId?: string;
  triggeredBy: string;
  startTime: Date;
  endTime?: Date;
  results?: TestExecutionResults;
  logs: ExecutionLog[];
  metadata: Record<string, any>;
}

interface TestExecutionResults {
  totalTests: number;
  passedTests: number;
  failedTests: number;
  skippedTests: number;
  duration: number;
  artifacts: {
    screenshots: string[];
    videos: string[];
    reports: string[];
    logs: string[];
  };
}

interface ExecutionLog {
  timestamp: Date;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  metadata?: Record<string, any>;
}

/**
 * Middleware to validate webhook API keys
 * **Validates: Requirements 10.4**
 */
const validateApiKey = (req: any, res: any, next: any) => {
  const apiKey = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');
  
  if (!apiKey) {
    logger.warn('Webhook request without API key', {
      correlationId: req.correlationId,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      url: req.originalUrl,
    });
    
    return res.status(401).json({
      error: {
        code: 'MISSING_API_KEY',
        message: 'API key is required for webhook access',
        correlationId: req.correlationId,
        timestamp: new Date().toISOString(),
      },
    });
  }
  
  // In production, validate against database of API keys
  const validApiKeys = process.env.WEBHOOK_API_KEYS?.split(',') || ['test-api-key-123'];
  
  if (!validApiKeys.includes(apiKey)) {
    logger.warn('Invalid webhook API key', {
      correlationId: req.correlationId,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      url: req.originalUrl,
      apiKeyPrefix: apiKey.substring(0, 8) + '...',
    });
    
    return res.status(401).json({
      error: {
        code: 'INVALID_API_KEY',
        message: 'Invalid API key provided',
        correlationId: req.correlationId,
        timestamp: new Date().toISOString(),
      },
    });
  }
  
  req.apiKey = apiKey;
  next();
};

/**
 * Middleware to validate webhook signatures (for GitHub, GitLab, etc.)
 * **Validates: Requirements 10.4**
 */
const validateWebhookSignature = (req: any, res: any, next: any) => {
  const signature = req.headers['x-hub-signature-256'] || req.headers['x-gitlab-token'];
  const webhookSecret = process.env.WEBHOOK_SECRET;
  
  // Skip signature validation if no secret is configured
  if (!webhookSecret) {
    return next();
  }
  
  if (!signature) {
    logger.warn('Webhook request without signature', {
      correlationId: req.correlationId,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
    });
    
    return res.status(401).json({
      error: {
        code: 'MISSING_SIGNATURE',
        message: 'Webhook signature is required',
        correlationId: req.correlationId,
        timestamp: new Date().toISOString(),
      },
    });
  }
  
  // Validate GitHub-style signature
  if (signature.startsWith('sha256=')) {
    const expectedSignature = 'sha256=' + crypto
      .createHmac('sha256', webhookSecret)
      .update(JSON.stringify(req.body))
      .digest('hex');
    
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
      logger.warn('Invalid webhook signature', {
        correlationId: req.correlationId,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
      });
      
      return res.status(401).json({
        error: {
          code: 'INVALID_SIGNATURE',
          message: 'Invalid webhook signature',
          correlationId: req.correlationId,
          timestamp: new Date().toISOString(),
        },
      });
    }
  }
  
  next();
};

/**
 * POST /api/webhooks/trigger
 * Trigger test execution via webhook
 * **Validates: Requirements 10.1, 10.2**
 */
router.post('/trigger',
  rateLimiter.webhook,
  validateApiKey,
  validateWebhookSignature,
  [
    body('projectId')
      .isUUID()
      .withMessage('Project ID must be a valid UUID'),
    body('testSuiteId')
      .optional()
      .isUUID()
      .withMessage('Test suite ID must be a valid UUID'),
    body('environment')
      .optional()
      .isIn(['development', 'staging', 'production'])
      .withMessage('Environment must be development, staging, or production'),
    body('branch')
      .optional()
      .isString()
      .trim()
      .isLength({ min: 1, max: 255 })
      .withMessage('Branch name must be 1-255 characters'),
    body('commit')
      .optional()
      .isString()
      .trim()
      .matches(/^[a-f0-9]{7,40}$/)
      .withMessage('Commit hash must be a valid Git commit hash'),
    body('triggeredBy')
      .isString()
      .trim()
      .isLength({ min: 1, max: 255 })
      .withMessage('Triggered by must be 1-255 characters'),
    body('metadata')
      .optional()
      .isObject()
      .withMessage('Metadata must be an object'),
  ],
  async (req: any, res) => {
    try {
      // Validate request
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        logger.warn('Invalid webhook trigger request', {
          correlationId: req.correlationId,
          errors: errors.array(),
          body: req.body,
        });
        
        return res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request parameters',
            details: errors.array(),
            correlationId: req.correlationId,
            timestamp: new Date().toISOString(),
          },
        });
      }
      
      const {
        projectId,
        testSuiteId,
        environment = 'staging',
        branch,
        commit,
        triggeredBy,
        metadata = {},
      } = req.body;
      
      // Generate execution ID
      const executionId = crypto.randomUUID();
      
      // Create execution record
      const execution: WebhookExecution = {
        id: executionId,
        status: 'queued',
        projectId,
        testSuiteId,
        triggeredBy,
        startTime: new Date(),
        logs: [{
          timestamp: new Date(),
          level: 'info',
          message: 'Test execution queued via webhook',
          metadata: {
            environment,
            branch,
            commit,
            triggeredBy,
            apiKey: req.apiKey.substring(0, 8) + '...',
          },
        }],
        metadata: {
          environment,
          branch,
          commit,
          ...metadata,
          correlationId: req.correlationId,
          userAgent: req.get('User-Agent'),
          ip: req.ip,
        },
      };
      
      // Store execution
      webhookExecutions.set(executionId, execution);
      
      logger.info('Webhook test execution triggered', {
        correlationId: req.correlationId,
        executionId,
        projectId,
        testSuiteId,
        triggeredBy,
        environment,
        branch,
        commit,
      });
      
      // TODO: Submit to test orchestrator
      // await testOrchestrator.submitExecution({
      //   executionId,
      //   projectId,
      //   testSuiteId,
      //   environment,
      //   metadata: execution.metadata,
      // });
      
      // Simulate status update after a delay
      setTimeout(() => {
        const exec = webhookExecutions.get(executionId);
        if (exec) {
          exec.status = 'running';
          exec.logs.push({
            timestamp: new Date(),
            level: 'info',
            message: 'Test execution started',
          });
          webhookExecutions.set(executionId, exec);
        }
      }, 1000);
      
      // Return structured response
      res.status(201).json({
        executionId,
        status: 'queued',
        projectId,
        testSuiteId,
        environment,
        triggeredBy,
        startTime: execution.startTime.toISOString(),
        statusUrl: `/api/webhooks/executions/${executionId}`,
        logsUrl: `/api/webhooks/executions/${executionId}/logs`,
        correlationId: req.correlationId,
        timestamp: new Date().toISOString(),
      });
      
    } catch (error) {
      logger.error('Failed to trigger webhook execution', {
        correlationId: req.correlationId,
        error: (error as Error).message,
        stack: (error as Error).stack,
        body: req.body,
      });
      
      res.status(500).json({
        error: {
          code: 'EXECUTION_TRIGGER_FAILED',
          message: 'Failed to trigger test execution',
          correlationId: req.correlationId,
          timestamp: new Date().toISOString(),
        },
      });
    }
  }
);

/**
 * GET /api/webhooks/executions/:id
 * Get execution status and results
 * **Validates: Requirements 10.2, 10.3**
 */
router.get('/executions/:id',
  rateLimiter.webhook,
  validateApiKey,
  [
    param('id')
      .isUUID()
      .withMessage('Execution ID must be a valid UUID'),
  ],
  (req: any, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid execution ID',
            details: errors.array(),
            correlationId: req.correlationId,
            timestamp: new Date().toISOString(),
          },
        });
      }
      
      const executionId = req.params.id;
      const execution = webhookExecutions.get(executionId);
      
      if (!execution) {
        logger.warn('Webhook execution not found', {
          correlationId: req.correlationId,
          executionId,
          ip: req.ip,
        });
        
        return res.status(404).json({
          error: {
            code: 'EXECUTION_NOT_FOUND',
            message: 'Execution not found',
            executionId,
            correlationId: req.correlationId,
            timestamp: new Date().toISOString(),
          },
        });
      }
      
      // Return structured execution status
      const response = {
        executionId: execution.id,
        status: execution.status,
        projectId: execution.projectId,
        testSuiteId: execution.testSuiteId,
        triggeredBy: execution.triggeredBy,
        startTime: execution.startTime.toISOString(),
        endTime: execution.endTime?.toISOString(),
        duration: execution.endTime 
          ? execution.endTime.getTime() - execution.startTime.getTime()
          : Date.now() - execution.startTime.getTime(),
        results: execution.results,
        metadata: execution.metadata,
        logsUrl: `/api/webhooks/executions/${executionId}/logs`,
        correlationId: req.correlationId,
        timestamp: new Date().toISOString(),
      };
      
      res.json(response);
      
    } catch (error) {
      logger.error('Failed to get webhook execution status', {
        correlationId: req.correlationId,
        error: (error as Error).message,
        executionId: req.params.id,
      });
      
      res.status(500).json({
        error: {
          code: 'STATUS_RETRIEVAL_FAILED',
          message: 'Failed to retrieve execution status',
          correlationId: req.correlationId,
          timestamp: new Date().toISOString(),
        },
      });
    }
  }
);

/**
 * GET /api/webhooks/executions/:id/logs
 * Get real-time execution logs
 * **Validates: Requirements 10.3**
 */
router.get('/executions/:id/logs',
  rateLimiter.webhook,
  validateApiKey,
  [
    param('id')
      .isUUID()
      .withMessage('Execution ID must be a valid UUID'),
    query('since')
      .optional()
      .isISO8601()
      .withMessage('Since parameter must be a valid ISO 8601 date'),
    query('level')
      .optional()
      .isIn(['debug', 'info', 'warn', 'error'])
      .withMessage('Level must be debug, info, warn, or error'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 1000 })
      .withMessage('Limit must be between 1 and 1000'),
  ],
  (req: any, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request parameters',
            details: errors.array(),
            correlationId: req.correlationId,
            timestamp: new Date().toISOString(),
          },
        });
      }
      
      const executionId = req.params.id;
      const since = req.query.since ? new Date(req.query.since as string) : undefined;
      const level = req.query.level as string;
      const limit = parseInt(req.query.limit as string) || 100;
      
      const execution = webhookExecutions.get(executionId);
      
      if (!execution) {
        return res.status(404).json({
          error: {
            code: 'EXECUTION_NOT_FOUND',
            message: 'Execution not found',
            executionId,
            correlationId: req.correlationId,
            timestamp: new Date().toISOString(),
          },
        });
      }
      
      // Filter logs based on query parameters
      let logs = execution.logs;
      
      if (since) {
        logs = logs.filter(log => log.timestamp >= since);
      }
      
      if (level) {
        logs = logs.filter(log => log.level === level);
      }
      
      // Apply limit
      logs = logs.slice(-limit);
      
      res.json({
        executionId,
        logs: logs.map(log => ({
          timestamp: log.timestamp.toISOString(),
          level: log.level,
          message: log.message,
          metadata: log.metadata,
        })),
        totalLogs: execution.logs.length,
        filteredLogs: logs.length,
        correlationId: req.correlationId,
        timestamp: new Date().toISOString(),
      });
      
    } catch (error) {
      logger.error('Failed to get webhook execution logs', {
        correlationId: req.correlationId,
        error: (error as Error).message,
        executionId: req.params.id,
      });
      
      res.status(500).json({
        error: {
          code: 'LOGS_RETRIEVAL_FAILED',
          message: 'Failed to retrieve execution logs',
          correlationId: req.correlationId,
          timestamp: new Date().toISOString(),
        },
      });
    }
  }
);

/**
 * DELETE /api/webhooks/executions/:id
 * Cancel running execution
 * **Validates: Requirements 10.2**
 */
router.delete('/executions/:id',
  rateLimiter.webhook,
  validateApiKey,
  [
    param('id')
      .isUUID()
      .withMessage('Execution ID must be a valid UUID'),
  ],
  async (req: any, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid execution ID',
            details: errors.array(),
            correlationId: req.correlationId,
            timestamp: new Date().toISOString(),
          },
        });
      }
      
      const executionId = req.params.id;
      const execution = webhookExecutions.get(executionId);
      
      if (!execution) {
        return res.status(404).json({
          error: {
            code: 'EXECUTION_NOT_FOUND',
            message: 'Execution not found',
            executionId,
            correlationId: req.correlationId,
            timestamp: new Date().toISOString(),
          },
        });
      }
      
      // Can only cancel queued or running executions
      if (!['queued', 'running'].includes(execution.status)) {
        return res.status(400).json({
          error: {
            code: 'EXECUTION_NOT_CANCELLABLE',
            message: `Cannot cancel execution with status: ${execution.status}`,
            executionId,
            status: execution.status,
            correlationId: req.correlationId,
            timestamp: new Date().toISOString(),
          },
        });
      }
      
      // Update execution status
      execution.status = 'cancelled';
      execution.endTime = new Date();
      execution.logs.push({
        timestamp: new Date(),
        level: 'info',
        message: 'Test execution cancelled via webhook',
        metadata: {
          cancelledBy: req.apiKey.substring(0, 8) + '...',
          correlationId: req.correlationId,
        },
      });
      
      webhookExecutions.set(executionId, execution);
      
      logger.info('Webhook execution cancelled', {
        correlationId: req.correlationId,
        executionId,
        projectId: execution.projectId,
        cancelledBy: req.apiKey.substring(0, 8) + '...',
      });
      
      // TODO: Cancel in test orchestrator
      // await testOrchestrator.cancelExecution(executionId);
      
      res.json({
        executionId,
        status: 'cancelled',
        endTime: execution.endTime.toISOString(),
        correlationId: req.correlationId,
        timestamp: new Date().toISOString(),
      });
      
    } catch (error) {
      logger.error('Failed to cancel webhook execution', {
        correlationId: req.correlationId,
        error: (error as Error).message,
        executionId: req.params.id,
      });
      
      res.status(500).json({
        error: {
          code: 'EXECUTION_CANCELLATION_FAILED',
          message: 'Failed to cancel execution',
          correlationId: req.correlationId,
          timestamp: new Date().toISOString(),
        },
      });
    }
  }
);

/**
 * GET /api/webhooks/health
 * Webhook service health check
 */
router.get('/health',
  rateLimiter.webhook,
  (req: any, res) => {
    res.json({
      status: 'healthy',
      service: 'webhook-api',
      activeExecutions: webhookExecutions.size,
      timestamp: new Date().toISOString(),
      correlationId: req.correlationId,
    });
  }
);

export default router;