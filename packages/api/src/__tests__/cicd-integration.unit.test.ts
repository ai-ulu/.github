/**
 * Unit Tests for CI/CD Integration Edge Cases
 * **Validates: Requirements 10.1, 10.2, 10.3, 10.4, 10.5**
 * 
 * Tests webhook authentication failures, GitHub API integration errors,
 * concurrent webhook requests, and status update delivery failures.
 */

import request from 'supertest';
import express from 'express';
import crypto from 'crypto';
import webhooksRouter from '../routes/webhooks';
import { correlationId } from '../middleware/correlation-id';

// Mock logger
const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

jest.mock('../utils/logger', () => ({
  logger: mockLogger,
}));

// Mock rate limiter
jest.mock('../middleware/rate-limiter', () => ({
  rateLimiter: {
    webhook: (req: any, res: any, next: any) => next(),
  },
}));

describe('CI/CD Integration Edge Cases', () => {
  let app: express.Application;
  const validApiKey = 'test-api-key-123';
  const webhookSecret = 'test-webhook-secret';
  
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Set environment variables
    process.env.WEBHOOK_API_KEYS = validApiKey;
    process.env.WEBHOOK_SECRET = webhookSecret;
    
    // Create test app
    app = express();
    app.use(express.json());
    app.use(correlationId);
    app.use('/api/webhooks', webhooksRouter);
  });
  
  afterEach(() => {
    delete process.env.WEBHOOK_API_KEYS;
    delete process.env.WEBHOOK_SECRET;
  });

  describe('Webhook Authentication Failures', () => {
    const validPayload = {
      projectId: crypto.randomUUID(),
      triggeredBy: 'test-system',
    };

    it('should handle missing API key header', async () => {
      const response = await request(app)
        .post('/api/webhooks/trigger')
        .send(validPayload)
        .expect(401);

      expect(response.body.error.code).toBe('MISSING_API_KEY');
      expect(response.body.error.message).toContain('API key is required');
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Webhook request without API key',
        expect.objectContaining({
          correlationId: expect.any(String),
          ip: expect.any(String),
        })
      );
    });

    it('should handle empty API key', async () => {
      const response = await request(app)
        .post('/api/webhooks/trigger')
        .set('X-API-Key', '')
        .send(validPayload)
        .expect(401);

      expect(response.body.error.code).toBe('MISSING_API_KEY');
    });

    it('should handle malformed API key', async () => {
      const malformedKeys = [
        'invalid-key',
        'Bearer invalid-key',
        'api-key-with-special-chars!@#$%',
        'very-long-api-key-' + 'x'.repeat(1000),
      ];

      for (const apiKey of malformedKeys) {
        const response = await request(app)
          .post('/api/webhooks/trigger')
          .set('X-API-Key', apiKey)
          .send(validPayload)
          .expect(401);

        expect(response.body.error.code).toBe('INVALID_API_KEY');
        expect(mockLogger.warn).toHaveBeenCalledWith(
          'Invalid webhook API key',
          expect.objectContaining({
            apiKeyPrefix: apiKey.substring(0, 8) + '...',
          })
        );
      }
    });

    it('should handle API key in Authorization header', async () => {
      const response = await request(app)
        .post('/api/webhooks/trigger')
        .set('Authorization', `Bearer ${validApiKey}`)
        .send(validPayload)
        .expect(201);

      expect(response.body.status).toBe('queued');
    });

    it('should handle case-sensitive API key validation', async () => {
      const response = await request(app)
        .post('/api/webhooks/trigger')
        .set('X-API-Key', validApiKey.toUpperCase())
        .send(validPayload)
        .expect(401);

      expect(response.body.error.code).toBe('INVALID_API_KEY');
    });

    it('should handle multiple API keys configuration', async () => {
      process.env.WEBHOOK_API_KEYS = `${validApiKey},another-valid-key,third-key`;

      const validKeys = ['test-api-key-123', 'another-valid-key', 'third-key'];
      
      for (const key of validKeys) {
        const response = await request(app)
          .post('/api/webhooks/trigger')
          .set('X-API-Key', key)
          .send(validPayload)
          .expect(201);

        expect(response.body.status).toBe('queued');
      }
    });
  });

  describe('Webhook Signature Validation Failures', () => {
    const validPayload = {
      projectId: crypto.randomUUID(),
      triggeredBy: 'test-system',
    };

    it('should handle missing signature when required', async () => {
      const response = await request(app)
        .post('/api/webhooks/trigger')
        .set('X-API-Key', validApiKey)
        .send(validPayload)
        .expect(401);

      expect(response.body.error.code).toBe('MISSING_SIGNATURE');
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Webhook request without signature',
        expect.objectContaining({
          correlationId: expect.any(String),
        })
      );
    });

    it('should handle invalid signature format', async () => {
      const invalidSignatures = [
        'invalid-signature',
        'sha256=',
        'sha256=invalid-hex',
        'md5=valid-but-wrong-algorithm',
        'sha256=' + 'x'.repeat(63), // Too short
        'sha256=' + 'x'.repeat(65), // Too long
      ];

      for (const signature of invalidSignatures) {
        const response = await request(app)
          .post('/api/webhooks/trigger')
          .set('X-API-Key', validApiKey)
          .set('X-Hub-Signature-256', signature)
          .send(validPayload)
          .expect(401);

        expect(response.body.error.code).toBe('INVALID_SIGNATURE');
      }
    });

    it('should handle signature for different payload', async () => {
      const differentPayload = { different: 'payload' };
      const signature = 'sha256=' + crypto
        .createHmac('sha256', webhookSecret)
        .update(JSON.stringify(differentPayload))
        .digest('hex');

      const response = await request(app)
        .post('/api/webhooks/trigger')
        .set('X-API-Key', validApiKey)
        .set('X-Hub-Signature-256', signature)
        .send(validPayload)
        .expect(401);

      expect(response.body.error.code).toBe('INVALID_SIGNATURE');
    });

    it('should handle timing attack protection', async () => {
      const validSignature = 'sha256=' + crypto
        .createHmac('sha256', webhookSecret)
        .update(JSON.stringify(validPayload))
        .digest('hex');

      const invalidSignature = 'sha256=' + crypto.randomBytes(32).toString('hex');

      // Both should take similar time (timing attack protection)
      const start1 = Date.now();
      await request(app)
        .post('/api/webhooks/trigger')
        .set('X-API-Key', validApiKey)
        .set('X-Hub-Signature-256', validSignature)
        .send(validPayload);
      const time1 = Date.now() - start1;

      const start2 = Date.now();
      await request(app)
        .post('/api/webhooks/trigger')
        .set('X-API-Key', validApiKey)
        .set('X-Hub-Signature-256', invalidSignature)
        .send(validPayload);
      const time2 = Date.now() - start2;

      // Times should be reasonably close (within 50ms difference)
      expect(Math.abs(time1 - time2)).toBeLessThan(50);
    });
  });

  describe('Concurrent Webhook Request Handling', () => {
    const createPayload = (index: number) => ({
      projectId: crypto.randomUUID(),
      triggeredBy: `concurrent-test-${index}`,
      metadata: { testIndex: index },
    });

    it('should handle high concurrency without race conditions', async () => {
      const concurrency = 20;
      const payloads = Array.from({ length: concurrency }, (_, i) => createPayload(i));

      const promises = payloads.map(payload =>
        request(app)
          .post('/api/webhooks/trigger')
          .set('X-API-Key', validApiKey)
          .send(payload)
      );

      const responses = await Promise.all(promises);

      // All should succeed
      responses.forEach((response, index) => {
        expect(response.status).toBe(201);
        expect(response.body.executionId).toBeDefined();
        expect(response.body.triggeredBy).toBe(`concurrent-test-${index}`);
      });

      // All execution IDs should be unique
      const executionIds = responses.map(r => r.body.executionId);
      const uniqueIds = new Set(executionIds);
      expect(uniqueIds.size).toBe(concurrency);
    });

    it('should handle concurrent requests to same project', async () => {
      const projectId = crypto.randomUUID();
      const concurrency = 10;

      const promises = Array.from({ length: concurrency }, (_, i) =>
        request(app)
          .post('/api/webhooks/trigger')
          .set('X-API-Key', validApiKey)
          .send({
            projectId,
            triggeredBy: `concurrent-same-project-${i}`,
          })
      );

      const responses = await Promise.all(promises);

      // All should succeed
      responses.forEach(response => {
        expect(response.status).toBe(201);
        expect(response.body.projectId).toBe(projectId);
      });

      // All execution IDs should be unique even for same project
      const executionIds = responses.map(r => r.body.executionId);
      const uniqueIds = new Set(executionIds);
      expect(uniqueIds.size).toBe(concurrency);
    });

    it('should handle mixed success and failure scenarios', async () => {
      const requests = [
        // Valid requests
        { apiKey: validApiKey, payload: createPayload(1), expectedStatus: 201 },
        { apiKey: validApiKey, payload: createPayload(2), expectedStatus: 201 },
        // Invalid API key
        { apiKey: 'invalid-key', payload: createPayload(3), expectedStatus: 401 },
        // Invalid payload
        { apiKey: validApiKey, payload: { invalid: 'payload' }, expectedStatus: 400 },
        // Valid request
        { apiKey: validApiKey, payload: createPayload(4), expectedStatus: 201 },
      ];

      const promises = requests.map(({ apiKey, payload, expectedStatus }) =>
        request(app)
          .post('/api/webhooks/trigger')
          .set('X-API-Key', apiKey)
          .send(payload)
          .expect(expectedStatus)
      );

      await Promise.all(promises);
    });
  });

  describe('Status Update Delivery Failures', () => {
    let executionId: string;

    beforeEach(async () => {
      const response = await request(app)
        .post('/api/webhooks/trigger')
        .set('X-API-Key', validApiKey)
        .send({
          projectId: crypto.randomUUID(),
          triggeredBy: 'status-test',
        });

      executionId = response.body.executionId;
    });

    it('should handle status requests for non-existent executions', async () => {
      const nonExistentId = crypto.randomUUID();

      const response = await request(app)
        .get(`/api/webhooks/executions/${nonExistentId}`)
        .set('X-API-Key', validApiKey)
        .expect(404);

      expect(response.body.error.code).toBe('EXECUTION_NOT_FOUND');
      expect(response.body.error.executionId).toBe(nonExistentId);
    });

    it('should handle malformed execution ID in status requests', async () => {
      const malformedIds = [
        'not-a-uuid',
        '12345',
        'uuid-with-extra-characters-123e4567-e89b-12d3-a456-426614174000-extra',
        '',
        'null',
        'undefined',
      ];

      for (const malformedId of malformedIds) {
        const response = await request(app)
          .get(`/api/webhooks/executions/${malformedId}`)
          .set('X-API-Key', validApiKey)
          .expect(400);

        expect(response.body.error.code).toBe('VALIDATION_ERROR');
      }
    });

    it('should handle concurrent status requests for same execution', async () => {
      const concurrency = 15;

      const promises = Array.from({ length: concurrency }, () =>
        request(app)
          .get(`/api/webhooks/executions/${executionId}`)
          .set('X-API-Key', validApiKey)
      );

      const responses = await Promise.all(promises);

      // All should succeed with same data
      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body.executionId).toBe(executionId);
        expect(response.body.status).toBeDefined();
      });

      // All responses should have consistent data
      const firstResponse = responses[0].body;
      responses.forEach(response => {
        expect(response.body.executionId).toBe(firstResponse.executionId);
        expect(response.body.projectId).toBe(firstResponse.projectId);
        expect(response.body.startTime).toBe(firstResponse.startTime);
      });
    });

    it('should handle log requests with invalid parameters', async () => {
      const invalidParams = [
        { level: 'invalid-level' },
        { limit: -1 },
        { limit: 1001 }, // Over maximum
        { since: 'invalid-date' },
        { since: '2023-13-45T25:70:70.000Z' }, // Invalid date format
      ];

      for (const params of invalidParams) {
        const queryString = new URLSearchParams(params as any).toString();
        
        const response = await request(app)
          .get(`/api/webhooks/executions/${executionId}/logs?${queryString}`)
          .set('X-API-Key', validApiKey)
          .expect(400);

        expect(response.body.error.code).toBe('VALIDATION_ERROR');
      }
    });

    it('should handle execution cancellation edge cases', async () => {
      // Try to cancel non-existent execution
      const nonExistentId = crypto.randomUUID();
      
      const response1 = await request(app)
        .delete(`/api/webhooks/executions/${nonExistentId}`)
        .set('X-API-Key', validApiKey)
        .expect(404);

      expect(response1.body.error.code).toBe('EXECUTION_NOT_FOUND');

      // Cancel valid execution
      const response2 = await request(app)
        .delete(`/api/webhooks/executions/${executionId}`)
        .set('X-API-Key', validApiKey)
        .expect(200);

      expect(response2.body.status).toBe('cancelled');

      // Try to cancel already cancelled execution
      const response3 = await request(app)
        .delete(`/api/webhooks/executions/${executionId}`)
        .set('X-API-Key', validApiKey)
        .expect(400);

      expect(response3.body.error.code).toBe('EXECUTION_NOT_CANCELLABLE');
    });
  });

  describe('Error Recovery and Resilience', () => {
    it('should handle JSON parsing errors gracefully', async () => {
      const response = await request(app)
        .post('/api/webhooks/trigger')
        .set('X-API-Key', validApiKey)
        .set('Content-Type', 'application/json')
        .send('{ invalid json }')
        .expect(400);

      // Express handles JSON parsing errors before our middleware
      expect(response.status).toBe(400);
    });

    it('should handle very large payloads', async () => {
      const largeMetadata = {};
      for (let i = 0; i < 1000; i++) {
        (largeMetadata as any)[`key${i}`] = 'x'.repeat(100);
      }

      const largePayload = {
        projectId: crypto.randomUUID(),
        triggeredBy: 'large-payload-test',
        metadata: largeMetadata,
      };

      const response = await request(app)
        .post('/api/webhooks/trigger')
        .set('X-API-Key', validApiKey)
        .send(largePayload);

      // Should either succeed or fail gracefully
      expect([201, 413]).toContain(response.status);
    });

    it('should maintain correlation IDs across all operations', async () => {
      const response1 = await request(app)
        .post('/api/webhooks/trigger')
        .set('X-API-Key', validApiKey)
        .send({
          projectId: crypto.randomUUID(),
          triggeredBy: 'correlation-test',
        });

      const correlationId = response1.body.correlationId;
      const executionId = response1.body.executionId;

      // Status request should maintain correlation context
      const response2 = await request(app)
        .get(`/api/webhooks/executions/${executionId}`)
        .set('X-API-Key', validApiKey);

      expect(response2.body.correlationId).toBeDefined();

      // Logs request should maintain correlation context
      const response3 = await request(app)
        .get(`/api/webhooks/executions/${executionId}/logs`)
        .set('X-API-Key', validApiKey);

      expect(response3.body.correlationId).toBeDefined();
    });

    it('should handle rapid successive requests to same endpoint', async () => {
      const payload = {
        projectId: crypto.randomUUID(),
        triggeredBy: 'rapid-test',
      };

      // Send 10 requests as fast as possible
      const promises = Array.from({ length: 10 }, () =>
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
      expect(uniqueIds.size).toBe(10);
    });
  });
});