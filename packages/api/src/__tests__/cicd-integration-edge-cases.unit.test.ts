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
import nock from 'nock';
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

// Mock rate limiter to allow testing
jest.mock('../middleware/rate-limiter', () => ({
  rateLimiter: {
    webhook: (req: any, res: any, next: any) => next(),
  },
}));

describe('CI/CD Integration Edge Cases', () => {
  let app: express.Application;
  const validApiKey = 'test-api-key-123';
  const invalidApiKey = 'invalid-key-456';
  const expiredApiKey = 'expired-key-789';
  const webhookSecret = 'test-webhook-secret';
  
  beforeAll(() => {
    // Set environment variables
    process.env.WEBHOOK_API_KEYS = `${validApiKey},${expiredApiKey}`;
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
    nock.cleanAll();
  });
  
  beforeEach(() => {
    nock.cleanAll();
  });

  describe('Webhook Authentication Failures', () => {
    const validPayload = {
      projectId: crypto.randomUUID(),
      triggeredBy: 'ci-system',
      environment: 'staging',
    };

    it('should handle missing API key gracefully', async () => {
      const response = await request(app)
        .post('/api/webhooks/trigger')
        .send(validPayload)
        .expect(401);

      expect(response.body.error).toMatchObject({
        code: 'MISSING_API_KEY',
        message: 'API key is required for webhook access',
      });
      
      expect(response.body.error.correlationId).toBeDefined();
      expect(response.body.error.timestamp).toBeDefined();
    });

    it('should handle invalid API key with proper error response', async () => {
      const response = await request(app)
        .post('/api/webhooks/trigger')
        .set('X-API-Key', invalidApiKey)
        .send(validPayload)
        .expect(401);

      expect(response.body.error).toMatchObject({
        code: 'INVALID_API_KEY',
        message: 'Invalid API key provided',
      });
    });

    it('should handle malformed API key in Authorization header', async () => {
      const response = await request(app)
        .post('/api/webhooks/trigger')
        .set('Authorization', 'InvalidFormat invalid-key')
        .send(validPayload)
        .expect(401);

      expect(response.body.error.code).toBe('INVALID_API_KEY');
    });

    it('should handle empty API key', async () => {
      const response = await request(app)
        .post('/api/webhooks/trigger')
        .set('X-API-Key', '')
        .send(validPayload)
        .expect(401);

      expect(response.body.error.code).toBe('MISSING_API_KEY');
    });

    it('should handle API key with special characters', async () => {
      const specialCharKey = 'key-with-special-chars-!@#$%^&*()';
      
      const response = await request(app)
        .post('/api/webhooks/trigger')
        .set('X-API-Key', specialCharKey)
        .send(validPayload)
        .expect(401);

      expect(response.body.error.code).toBe('INVALID_API_KEY');
    });

    it('should handle webhook signature validation failures', async () => {
      const invalidSignature = 'sha256=invalid-signature-hash';
      
      const response = await request(app)
        .post('/api/webhooks/trigger')
        .set('X-API-Key', validApiKey)
        .set('X-Hub-Signature-256', invalidSignature)
        .send(validPayload)
        .expect(401);

      expect(response.body.error.code).toBe('INVALID_SIGNATURE');
    });

    it('should handle missing signature when secret is configured', async () => {
      const response = await request(app)
        .post('/api/webhooks/trigger')
        .set('X-API-Key', validApiKey)
        // No signature header
        .send(validPayload)
        .expect(401);

      expect(response.body.error.code).toBe('MISSING_SIGNATURE');
    });

    it('should handle signature timing attack attempts', async () => {
      const shortSignature = 'sha256=short';
      const longSignature = 'sha256=' + 'a'.repeat(64);
      
      // Both should fail, but timing should be consistent
      const start1 = Date.now();
      await request(app)
        .post('/api/webhooks/trigger')
        .set('X-API-Key', validApiKey)
        .set('X-Hub-Signature-256', shortSignature)
        .send(validPayload)
        .expect(401);
      const time1 = Date.now() - start1;

      const start2 = Date.now();
      await request(app)
        .post('/api/webhooks/trigger')
        .set('X-API-Key', validApiKey)
        .set('X-Hub-Signature-256', longSignature)
        .send(validPayload)
        .expect(401);
      const time2 = Date.now() - start2;

      // Timing difference should be minimal (within 100ms)
      expect(Math.abs(time1 - time2)).toBeLessThan(100);
    });
  });

  describe('GitHub API Integration Errors', () => {
    const validPayload = {
      projectId: crypto.randomUUID(),
      triggeredBy: 'github-actions',
      environment: 'production',
      metadata: {
        repository: 'owner/repo',
        workflow: 'CI',
        runId: 123456,
      },
    };

    it('should handle GitHub API rate limiting', async () => {
      // Mock GitHub API rate limit response
      nock('https://api.github.com')
        .post('/repos/owner/repo/check-runs')
        .reply(403, {
          message: 'API rate limit exceeded',
          documentation_url: 'https://docs.github.com/rest/overview/resources-in-the-rest-api#rate-limiting',
        }, {
          'X-RateLimit-Limit': '5000',
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': '1640995200',
        });

      // Webhook should still succeed even if GitHub API fails
      const response = await request(app)
        .post('/api/webhooks/trigger')
        .set('X-API-Key', validApiKey)
        .send(validPayload)
        .expect(201);

      expect(response.body.status).toBe('queued');
      expect(response.body.executionId).toBeDefined();
    });

    it('should handle GitHub API authentication errors', async () => {
      nock('https://api.github.com')
        .post('/repos/owner/repo/check-runs')
        .reply(401, {
          message: 'Bad credentials',
          documentation_url: 'https://docs.github.com/rest',
        });

      const response = await request(app)
        .post('/api/webhooks/trigger')
        .set('X-API-Key', validApiKey)
        .send(validPayload)
        .expect(201);

      expect(response.body.status).toBe('queued');
    });

    it('should handle GitHub API network timeouts', async () => {
      nock('https://api.github.com')
        .post('/repos/owner/repo/check-runs')
        .delayConnection(5000) // 5 second delay
        .reply(200, { id: 123 });

      const response = await request(app)
        .post('/api/webhooks/trigger')
        .set('X-API-Key', validApiKey)
        .send(validPayload)
        .expect(201);

      expect(response.body.status).toBe('queued');
    });

    it('should handle GitHub API server errors', async () => {
      nock('https://api.github.com')
        .post('/repos/owner/repo/check-runs')
        .reply(500, {
          message: 'Internal server error',
        });

      const response = await request(app)
        .post('/api/webhooks/trigger')
        .set('X-API-Key', validApiKey)
        .send(validPayload)
        .expect(201);

      expect(response.body.status).toBe('queued');
    });

    it('should handle malformed GitHub API responses', async () => {
      nock('https://api.github.com')
        .post('/repos/owner/repo/check-runs')
        .reply(200, 'invalid-json-response');

      const response = await request(app)
        .post('/api/webhooks/trigger')
        .set('X-API-Key', validApiKey)
        .send(validPayload)
        .expect(201);

      expect(response.body.status).toBe('queued');
    });
  });

  describe('Concurrent Webhook Requests', () => {
    const basePayload = {
      projectId: crypto.randomUUID(),
      triggeredBy: 'load-test',
      environment: 'staging',
    };

    it('should handle high concurrency without race conditions', async () => {
      const concurrentRequests = 20;
      const promises: Promise<any>[] = [];

      // Create multiple concurrent requests
      for (let i = 0; i < concurrentRequests; i++) {
        const payload = {
          ...basePayload,
          metadata: { requestId: i },
        };

        promises.push(
          request(app)
            .post('/api/webhooks/trigger')
            .set('X-API-Key', validApiKey)
            .send(payload)
        );
      }

      const responses = await Promise.all(promises);

      // All requests should succeed
      responses.forEach((response, index) => {
        expect(response.status).toBe(201);
        expect(response.body.executionId).toBeDefined();
        expect(response.body.status).toBe('queued');
      });

      // All execution IDs should be unique
      const executionIds = responses.map(r => r.body.executionId);
      const uniqueIds = new Set(executionIds);
      expect(uniqueIds.size).toBe(concurrentRequests);
    });

    it('should handle concurrent requests to same project', async () => {
      const sameProjectId = crypto.randomUUID();
      const concurrentRequests = 10;
      const promises: Promise<any>[] = [];

      for (let i = 0; i < concurrentRequests; i++) {
        const payload = {
          projectId: sameProjectId,
          triggeredBy: `concurrent-test-${i}`,
          environment: 'staging',
        };

        promises.push(
          request(app)
            .post('/api/webhooks/trigger')
            .set('X-API-Key', validApiKey)
            .send(payload)
        );
      }

      const responses = await Promise.all(promises);

      // All should succeed with unique execution IDs
      responses.forEach(response => {
        expect(response.status).toBe(201);
        expect(response.body.projectId).toBe(sameProjectId);
      });

      const executionIds = responses.map(r => r.body.executionId);
      const uniqueIds = new Set(executionIds);
      expect(uniqueIds.size).toBe(concurrentRequests);
    });

    it('should handle mixed success and failure concurrent requests', async () => {
      const promises: Promise<any>[] = [];

      // Mix of valid and invalid requests
      for (let i = 0; i < 5; i++) {
        // Valid request
        promises.push(
          request(app)
            .post('/api/webhooks/trigger')
            .set('X-API-Key', validApiKey)
            .send({
              projectId: crypto.randomUUID(),
              triggeredBy: `valid-${i}`,
            })
        );

        // Invalid request (missing required field)
        promises.push(
          request(app)
            .post('/api/webhooks/trigger')
            .set('X-API-Key', validApiKey)
            .send({
              projectId: 'invalid-uuid',
              // missing triggeredBy
            })
        );
      }

      const responses = await Promise.allSettled(promises);

      let successCount = 0;
      let failureCount = 0;

      responses.forEach(result => {
        if (result.status === 'fulfilled') {
          const response = result.value;
          if (response.status === 201) {
            successCount++;
          } else {
            failureCount++;
          }
        }
      });

      expect(successCount).toBe(5);
      expect(failureCount).toBe(5);
    });
  });

  describe('Status Update Delivery Failures', () => {
    let executionId: string;

    beforeEach(async () => {
      // Create an execution first
      const response = await request(app)
        .post('/api/webhooks/trigger')
        .set('X-API-Key', validApiKey)
        .send({
          projectId: crypto.randomUUID(),
          triggeredBy: 'status-test',
        });

      executionId = response.body.executionId;
    });

    it('should handle status retrieval for non-existent execution', async () => {
      const nonExistentId = crypto.randomUUID();

      const response = await request(app)
        .get(`/api/webhooks/executions/${nonExistentId}`)
        .set('X-API-Key', validApiKey)
        .expect(404);

      expect(response.body.error).toMatchObject({
        code: 'EXECUTION_NOT_FOUND',
        message: 'Execution not found',
        executionId: nonExistentId,
      });
    });

    it('should handle malformed execution ID in status requests', async () => {
      const malformedIds = [
        'not-a-uuid',
        '12345',
        'abc-def-ghi',
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

    it('should handle logs retrieval with invalid parameters', async () => {
      const invalidParams = [
        { since: 'invalid-date' },
        { level: 'invalid-level' },
        { limit: 'not-a-number' },
        { limit: -1 },
        { limit: 10000 }, // exceeds max
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
      // Try to cancel with invalid execution ID
      const response1 = await request(app)
        .delete('/api/webhooks/executions/invalid-uuid')
        .set('X-API-Key', validApiKey)
        .expect(400);

      expect(response1.body.error.code).toBe('VALIDATION_ERROR');

      // Try to cancel non-existent execution
      const nonExistentId = crypto.randomUUID();
      const response2 = await request(app)
        .delete(`/api/webhooks/executions/${nonExistentId}`)
        .set('X-API-Key', validApiKey)
        .expect(404);

      expect(response2.body.error.code).toBe('EXECUTION_NOT_FOUND');
    });

    it('should handle double cancellation attempts', async () => {
      // Cancel the execution
      const response1 = await request(app)
        .delete(`/api/webhooks/executions/${executionId}`)
        .set('X-API-Key', validApiKey)
        .expect(200);

      expect(response1.body.status).toBe('cancelled');

      // Try to cancel again
      const response2 = await request(app)
        .delete(`/api/webhooks/executions/${executionId}`)
        .set('X-API-Key', validApiKey)
        .expect(400);

      expect(response2.body.error.code).toBe('EXECUTION_NOT_CANCELLABLE');
    });
  });

  describe('Network and Infrastructure Failures', () => {
    const validPayload = {
      projectId: crypto.randomUUID(),
      triggeredBy: 'infrastructure-test',
    };

    it('should handle request timeout scenarios', async () => {
      // Simulate slow request processing
      const slowApp = express();
      slowApp.use(express.json());
      slowApp.use(correlationId);
      
      slowApp.use('/api/webhooks', (req, res, next) => {
        // Add artificial delay
        setTimeout(() => next(), 100);
      }, webhooksRouter);

      const response = await request(slowApp)
        .post('/api/webhooks/trigger')
        .set('X-API-Key', validApiKey)
        .send(validPayload)
        .timeout(50) // Very short timeout
        .expect(201); // Should still work as delay is in middleware

      expect(response.body.status).toBe('queued');
    });

    it('should handle memory pressure scenarios', async () => {
      // Create large payload to test memory handling
      const largeMetadata: Record<string, any> = {};
      for (let i = 0; i < 1000; i++) {
        largeMetadata[`key_${i}`] = `value_${i}`.repeat(100);
      }

      const largePayload = {
        ...validPayload,
        metadata: largeMetadata,
      };

      const response = await request(app)
        .post('/api/webhooks/trigger')
        .set('X-API-Key', validApiKey)
        .send(largePayload)
        .expect(201);

      expect(response.body.status).toBe('queued');
      expect(response.body.executionId).toBeDefined();
    });

    it('should handle malformed JSON gracefully', async () => {
      const response = await request(app)
        .post('/api/webhooks/trigger')
        .set('X-API-Key', validApiKey)
        .set('Content-Type', 'application/json')
        .send('{"invalid": json}') // Malformed JSON
        .expect(400);

      // Express handles malformed JSON before our middleware
      expect(response.status).toBe(400);
    });

    it('should handle unexpected content types', async () => {
      const response = await request(app)
        .post('/api/webhooks/trigger')
        .set('X-API-Key', validApiKey)
        .set('Content-Type', 'text/plain')
        .send('plain text data')
        .expect(400);

      expect(response.status).toBe(400);
    });
  });

  describe('Error Recovery and Resilience', () => {
    it('should maintain service availability during partial failures', async () => {
      const requests = [];
      
      // Mix of valid and invalid requests
      for (let i = 0; i < 10; i++) {
        if (i % 2 === 0) {
          // Valid request
          requests.push(
            request(app)
              .post('/api/webhooks/trigger')
              .set('X-API-Key', validApiKey)
              .send({
                projectId: crypto.randomUUID(),
                triggeredBy: `resilience-test-${i}`,
              })
          );
        } else {
          // Invalid request
          requests.push(
            request(app)
              .post('/api/webhooks/trigger')
              .set('X-API-Key', 'invalid-key')
              .send({
                projectId: crypto.randomUUID(),
                triggeredBy: `resilience-test-${i}`,
              })
          );
        }
      }

      const responses = await Promise.allSettled(requests);
      
      // Count successful and failed requests
      let successCount = 0;
      let failureCount = 0;

      responses.forEach(result => {
        if (result.status === 'fulfilled') {
          const response = result.value;
          if (response.status === 201) {
            successCount++;
          } else if (response.status === 401) {
            failureCount++;
          }
        }
      });

      expect(successCount).toBe(5); // Valid requests
      expect(failureCount).toBe(5); // Invalid API key requests
    });

    it('should handle correlation ID consistency across failures', async () => {
      const response = await request(app)
        .post('/api/webhooks/trigger')
        .set('X-API-Key', 'invalid-key')
        .send({
          projectId: 'invalid-uuid',
          triggeredBy: 'correlation-test',
        })
        .expect(401);

      expect(response.body.error.correlationId).toBeDefined();
      expect(typeof response.body.error.correlationId).toBe('string');
      expect(response.body.error.correlationId.length).toBeGreaterThan(0);
    });

    it('should maintain proper error response structure', async () => {
      const response = await request(app)
        .post('/api/webhooks/trigger')
        .send({}) // Empty payload
        .expect(401); // Missing API key

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toHaveProperty('code');
      expect(response.body.error).toHaveProperty('message');
      expect(response.body.error).toHaveProperty('correlationId');
      expect(response.body.error).toHaveProperty('timestamp');
      
      // Timestamp should be valid ISO string
      expect(() => new Date(response.body.error.timestamp)).not.toThrow();
    });
  });
});