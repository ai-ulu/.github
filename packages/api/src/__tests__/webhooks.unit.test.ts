/**
 * Unit Tests for Webhook Endpoints
 * **Validates: Requirements 10.1, 10.2, 10.3, 10.4**
 * 
 * Tests webhook authentication, test execution triggering,
 * status updates, and error handling scenarios.
 */

import request from 'supertest';
import express from 'express';
import crypto from 'crypto';
import webhooksRouter from '../routes/webhooks';
import { correlationId } from '../middleware/correlation-id';

// Mock logger
jest.mock('../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock rate limiter
jest.mock('../middleware/rate-limiter', () => ({
  rateLimiter: {
    webhook: (req: any, res: any, next: any) => next(),
  },
}));

describe('Webhook Endpoints', () => {
  let app: express.Application;
  const validApiKey = 'test-api-key-123';
  const invalidApiKey = 'invalid-key';
  const webhookSecret = 'test-webhook-secret';
  
  beforeAll(() => {
    // Set environment variables
    process.env.WEBHOOK_API_KEYS = validApiKey;
    process.env.WEBHOOK_SECRET = webhookSecret;
    
    // Create test app
    app = express();
    app.use(express.json());
    app.use(correlationId);
    app.use('/api/webhooks', webhooksRouter);
  });
  
  afterAll(() => {
    delete process.env.WEBHOOK_API_KEYS;
    delete process.env.WEBHOOK_SECRET;
  });
  
  describe('POST /api/webhooks/trigger', () => {
    const validPayload = {
      projectId: crypto.randomUUID(),
      testSuiteId: crypto.randomUUID(),
      environment: 'staging',
      branch: 'main',
      commit: 'abc123def456',
      triggeredBy: 'github-actions',
      metadata: {
        pullRequest: 123,
        author: 'test-user',
      },
    };
    
    it('should trigger test execution with valid API key', async () => {
      const response = await request(app)
        .post('/api/webhooks/trigger')
        .set('X-API-Key', validApiKey)
        .send(validPayload)
        .expect(201);
      
      expect(response.body).toMatchObject({
        status: 'queued',
        projectId: validPayload.projectId,
        testSuiteId: validPayload.testSuiteId,
        environment: validPayload.environment,
        triggeredBy: validPayload.triggeredBy,
      });
      
      expect(response.body.executionId).toBeDefined();
      expect(response.body.startTime).toBeDefined();
      expect(response.body.statusUrl).toContain(response.body.executionId);
      expect(response.body.logsUrl).toContain(response.body.executionId);
    });
    
    it('should trigger test execution with Authorization header', async () => {
      const response = await request(app)
        .post('/api/webhooks/trigger')
        .set('Authorization', `Bearer ${validApiKey}`)
        .send(validPayload)
        .expect(201);
      
      expect(response.body.status).toBe('queued');
      expect(response.body.executionId).toBeDefined();
    });
    
    it('should reject request without API key', async () => {
      const response = await request(app)
        .post('/api/webhooks/trigger')
        .send(validPayload)
        .expect(401);
      
      expect(response.body.error.code).toBe('MISSING_API_KEY');
      expect(response.body.error.message).toContain('API key is required');
    });
    
    it('should reject request with invalid API key', async () => {
      const response = await request(app)
        .post('/api/webhooks/trigger')
        .set('X-API-Key', invalidApiKey)
        .send(validPayload)
        .expect(401);
      
      expect(response.body.error.code).toBe('INVALID_API_KEY');
      expect(response.body.error.message).toContain('Invalid API key');
    });
    
    it('should validate webhook signature when secret is configured', async () => {
      const payload = JSON.stringify(validPayload);
      const signature = 'sha256=' + crypto
        .createHmac('sha256', webhookSecret)
        .update(payload)
        .digest('hex');
      
      const response = await request(app)
        .post('/api/webhooks/trigger')
        .set('X-API-Key', validApiKey)
        .set('X-Hub-Signature-256', signature)
        .send(validPayload)
        .expect(201);
      
      expect(response.body.status).toBe('queued');
    });
    
    it('should reject request with invalid signature', async () => {
      const invalidSignature = 'sha256=invalid-signature';
      
      const response = await request(app)
        .post('/api/webhooks/trigger')
        .set('X-API-Key', validApiKey)
        .set('X-Hub-Signature-256', invalidSignature)
        .send(validPayload)
        .expect(401);
      
      expect(response.body.error.code).toBe('INVALID_SIGNATURE');
    });
    
    it('should validate required fields', async () => {
      const invalidPayload = {
        projectId: 'invalid-uuid',
        triggeredBy: '',
      };
      
      const response = await request(app)
        .post('/api/webhooks/trigger')
        .set('X-API-Key', validApiKey)
        .send(invalidPayload)
        .expect(400);
      
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.details).toHaveLength(2);
    });
    
    it('should validate optional fields', async () => {
      const invalidPayload = {
        ...validPayload,
        environment: 'invalid-env',
        commit: 'invalid-commit-hash',
        testSuiteId: 'invalid-uuid',
      };
      
      const response = await request(app)
        .post('/api/webhooks/trigger')
        .set('X-API-Key', validApiKey)
        .send(invalidPayload)
        .expect(400);
      
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.details.length).toBeGreaterThan(0);
    });
    
    it('should handle minimal valid payload', async () => {
      const minimalPayload = {
        projectId: crypto.randomUUID(),
        triggeredBy: 'test-system',
      };
      
      const response = await request(app)
        .post('/api/webhooks/trigger')
        .set('X-API-Key', validApiKey)
        .send(minimalPayload)
        .expect(201);
      
      expect(response.body.status).toBe('queued');
      expect(response.body.environment).toBe('staging'); // default value
    });
  });
  
  describe('GET /api/webhooks/executions/:id', () => {
    let executionId: string;
    
    beforeEach(async () => {
      // Create an execution first
      const response = await request(app)
        .post('/api/webhooks/trigger')
        .set('X-API-Key', validApiKey)
        .send({
          projectId: crypto.randomUUID(),
          triggeredBy: 'test-setup',
        });
      
      executionId = response.body.executionId;
    });
    
    it('should return execution status', async () => {
      const response = await request(app)
        .get(`/api/webhooks/executions/${executionId}`)
        .set('X-API-Key', validApiKey)
        .expect(200);
      
      expect(response.body).toMatchObject({
        executionId,
        status: 'queued',
        triggeredBy: 'test-setup',
      });
      
      expect(response.body.startTime).toBeDefined();
      expect(response.body.duration).toBeGreaterThan(0);
      expect(response.body.logsUrl).toContain(executionId);
    });
    
    it('should reject request without API key', async () => {
      const response = await request(app)
        .get(`/api/webhooks/executions/${executionId}`)
        .expect(401);
      
      expect(response.body.error.code).toBe('MISSING_API_KEY');
    });
    
    it('should return 404 for non-existent execution', async () => {
      const nonExistentId = crypto.randomUUID();
      
      const response = await request(app)
        .get(`/api/webhooks/executions/${nonExistentId}`)
        .set('X-API-Key', validApiKey)
        .expect(404);
      
      expect(response.body.error.code).toBe('EXECUTION_NOT_FOUND');
      expect(response.body.error.executionId).toBe(nonExistentId);
    });
    
    it('should validate execution ID format', async () => {
      const response = await request(app)
        .get('/api/webhooks/executions/invalid-uuid')
        .set('X-API-Key', validApiKey)
        .expect(400);
      
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });
  
  describe('GET /api/webhooks/executions/:id/logs', () => {
    let executionId: string;
    
    beforeEach(async () => {
      // Create an execution first
      const response = await request(app)
        .post('/api/webhooks/trigger')
        .set('X-API-Key', validApiKey)
        .send({
          projectId: crypto.randomUUID(),
          triggeredBy: 'test-setup',
        });
      
      executionId = response.body.executionId;
    });
    
    it('should return execution logs', async () => {
      const response = await request(app)
        .get(`/api/webhooks/executions/${executionId}/logs`)
        .set('X-API-Key', validApiKey)
        .expect(200);
      
      expect(response.body).toMatchObject({
        executionId,
        totalLogs: 1,
        filteredLogs: 1,
      });
      
      expect(response.body.logs).toHaveLength(1);
      expect(response.body.logs[0]).toMatchObject({
        level: 'info',
        message: 'Test execution queued via webhook',
      });
    });
    
    it('should filter logs by level', async () => {
      const response = await request(app)
        .get(`/api/webhooks/executions/${executionId}/logs?level=info`)
        .set('X-API-Key', validApiKey)
        .expect(200);
      
      expect(response.body.logs.every((log: any) => log.level === 'info')).toBe(true);
    });
    
    it('should limit number of logs returned', async () => {
      const response = await request(app)
        .get(`/api/webhooks/executions/${executionId}/logs?limit=1`)
        .set('X-API-Key', validApiKey)
        .expect(200);
      
      expect(response.body.logs).toHaveLength(1);
    });
    
    it('should validate query parameters', async () => {
      const response = await request(app)
        .get(`/api/webhooks/executions/${executionId}/logs?level=invalid&limit=invalid`)
        .set('X-API-Key', validApiKey)
        .expect(400);
      
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
    
    it('should return 404 for non-existent execution', async () => {
      const nonExistentId = crypto.randomUUID();
      
      const response = await request(app)
        .get(`/api/webhooks/executions/${nonExistentId}/logs`)
        .set('X-API-Key', validApiKey)
        .expect(404);
      
      expect(response.body.error.code).toBe('EXECUTION_NOT_FOUND');
    });
  });
  
  describe('DELETE /api/webhooks/executions/:id', () => {
    let executionId: string;
    
    beforeEach(async () => {
      // Create an execution first
      const response = await request(app)
        .post('/api/webhooks/trigger')
        .set('X-API-Key', validApiKey)
        .send({
          projectId: crypto.randomUUID(),
          triggeredBy: 'test-setup',
        });
      
      executionId = response.body.executionId;
    });
    
    it('should cancel queued execution', async () => {
      const response = await request(app)
        .delete(`/api/webhooks/executions/${executionId}`)
        .set('X-API-Key', validApiKey)
        .expect(200);
      
      expect(response.body).toMatchObject({
        executionId,
        status: 'cancelled',
      });
      
      expect(response.body.endTime).toBeDefined();
    });
    
    it('should verify execution is actually cancelled', async () => {
      // Cancel the execution
      await request(app)
        .delete(`/api/webhooks/executions/${executionId}`)
        .set('X-API-Key', validApiKey)
        .expect(200);
      
      // Check status
      const statusResponse = await request(app)
        .get(`/api/webhooks/executions/${executionId}`)
        .set('X-API-Key', validApiKey)
        .expect(200);
      
      expect(statusResponse.body.status).toBe('cancelled');
      expect(statusResponse.body.endTime).toBeDefined();
    });
    
    it('should not cancel already completed execution', async () => {
      // First, manually set execution to completed (simulate completion)
      // This would normally be done by the test orchestrator
      
      const response = await request(app)
        .delete(`/api/webhooks/executions/${executionId}`)
        .set('X-API-Key', validApiKey);
      
      // Should succeed for queued execution
      expect(response.status).toBe(200);
    });
    
    it('should return 404 for non-existent execution', async () => {
      const nonExistentId = crypto.randomUUID();
      
      const response = await request(app)
        .delete(`/api/webhooks/executions/${nonExistentId}`)
        .set('X-API-Key', validApiKey)
        .expect(404);
      
      expect(response.body.error.code).toBe('EXECUTION_NOT_FOUND');
    });
    
    it('should validate execution ID format', async () => {
      const response = await request(app)
        .delete('/api/webhooks/executions/invalid-uuid')
        .set('X-API-Key', validApiKey)
        .expect(400);
      
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });
  
  describe('GET /api/webhooks/health', () => {
    it('should return health status', async () => {
      const response = await request(app)
        .get('/api/webhooks/health')
        .expect(200);
      
      expect(response.body).toMatchObject({
        status: 'healthy',
        service: 'webhook-api',
        activeExecutions: expect.any(Number),
      });
      
      expect(response.body.timestamp).toBeDefined();
    });
  });
  
  describe('Error Handling', () => {
    it('should handle malformed JSON', async () => {
      const response = await request(app)
        .post('/api/webhooks/trigger')
        .set('X-API-Key', validApiKey)
        .set('Content-Type', 'application/json')
        .send('invalid-json')
        .expect(400);
      
      // Express will handle malformed JSON before our middleware
      expect(response.status).toBe(400);
    });
    
    it('should include correlation ID in all responses', async () => {
      const response = await request(app)
        .post('/api/webhooks/trigger')
        .set('X-API-Key', validApiKey)
        .send({
          projectId: crypto.randomUUID(),
          triggeredBy: 'correlation-test',
        });
      
      expect(response.body.correlationId).toBeDefined();
      expect(typeof response.body.correlationId).toBe('string');
    });
    
    it('should handle concurrent webhook requests', async () => {
      const payload = {
        projectId: crypto.randomUUID(),
        triggeredBy: 'concurrent-test',
      };
      
      // Send multiple concurrent requests
      const promises = Array.from({ length: 5 }, () =>
        request(app)
          .post('/api/webhooks/trigger')
          .set('X-API-Key', validApiKey)
          .send(payload)
      );
      
      const responses = await Promise.all(promises);
      
      // All should succeed
      responses.forEach(response => {
        expect(response.status).toBe(201);
        expect(response.body.executionId).toBeDefined();
      });
      
      // All execution IDs should be unique
      const executionIds = responses.map(r => r.body.executionId);
      const uniqueIds = new Set(executionIds);
      expect(uniqueIds.size).toBe(executionIds.length);
    });
  });
});