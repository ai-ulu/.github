/**
 * Property Tests for Webhook Integration
 * **Property 20: Webhook Integration Consistency**
 * **Validates: Requirements 10.1, 10.2, 10.4**
 * 
 * Tests that webhook triggers execute tests correctly and return
 * structured JSON responses for all scenarios using property-based testing.
 */

import * as fc from 'fast-check';
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

describe('Property Tests: Webhook Integration Consistency', () => {
  let app: express.Application;
  const validApiKey = 'test-api-key-123';
  
  beforeAll(() => {
    process.env.WEBHOOK_API_KEYS = validApiKey;
    process.env.WEBHOOK_SECRET = 'test-webhook-secret';
    
    app = express();
    app.use(express.json());
    app.use(correlationId);
    app.use('/api/webhooks', webhooksRouter);
  });
  
  afterAll(() => {
    delete process.env.WEBHOOK_API_KEYS;
    delete process.env.WEBHOOK_SECRET;
  });

  /**
   * Property 20.1: Valid webhook requests always return structured JSON responses
   */
  it('should return structured JSON responses for all valid webhook requests', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          projectId: fc.uuid(),
          testSuiteId: fc.option(fc.uuid()),
          environment: fc.constantFrom('development', 'staging', 'production'),
          branch: fc.option(fc.string({ minLength: 1, maxLength: 100 })),
          commit: fc.option(fc.hexaString({ minLength: 7, maxLength: 40 })),
          triggeredBy: fc.string({ minLength: 1, maxLength: 255 }),
          metadata: fc.option(fc.dictionary(fc.string(), fc.anything())),
        }),
        async (payload) => {
          const response = await request(app)
            .post('/api/webhooks/trigger')
            .set('X-API-Key', validApiKey)
            .send(payload);
          
          // Should always return 201 for valid requests
          expect(response.status).toBe(201);
          
          // Should have structured response format
          expect(response.body).toMatchObject({
            executionId: expect.any(String),
            status: 'queued',
            projectId: payload.projectId,
            environment: payload.environment,
            triggeredBy: payload.triggeredBy,
            startTime: expect.any(String),
            statusUrl: expect.any(String),
            logsUrl: expect.any(String),
            correlationId: expect.any(String),
            timestamp: expect.any(String),
          });
          
          // Execution ID should be valid UUID
          const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
          expect(response.body.executionId).toMatch(uuidRegex);
          
          // URLs should contain execution ID
          expect(response.body.statusUrl).toContain(response.body.executionId);
          expect(response.body.logsUrl).toContain(response.body.executionId);
          
          // Timestamps should be valid ISO strings
          expect(() => new Date(response.body.startTime)).not.toThrow();
          expect(() => new Date(response.body.timestamp)).not.toThrow();
          
          // Optional fields should be included if provided
          if (payload.testSuiteId) {
            expect(response.body.testSuiteId).toBe(payload.testSuiteId);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 20.2: Webhook authentication is consistently enforced
   */
  it('should consistently enforce authentication for all webhook requests', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          projectId: fc.uuid(),
          triggeredBy: fc.string({ minLength: 1, maxLength: 255 }),
        }),
        fc.option(fc.string({ minLength: 1, maxLength: 100 })), // API key
        async (payload, apiKey) => {
          const response = await request(app)
            .post('/api/webhooks/trigger')
            .set('X-API-Key', apiKey || '')
            .send(payload);
          
          if (!apiKey) {
            // No API key should return 401
            expect(response.status).toBe(401);
            expect(response.body.error.code).toBe('MISSING_API_KEY');
          } else if (apiKey !== validApiKey) {
            // Invalid API key should return 401
            expect(response.status).toBe(401);
            expect(response.body.error.code).toBe('INVALID_API_KEY');
          } else {
            // Valid API key should succeed
            expect(response.status).toBe(201);
          }
          
          // All error responses should have structured format
          if (response.status === 401) {
            expect(response.body).toMatchObject({
              error: {
                code: expect.any(String),
                message: expect.any(String),
                correlationId: expect.any(String),
                timestamp: expect.any(String),
              },
            });
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 20.3: Execution status retrieval is consistent
   */
  it('should consistently retrieve execution status for all valid execution IDs', async () => {
    // First create some executions
    const executionIds: string[] = [];
    
    for (let i = 0; i < 5; i++) {
      const response = await request(app)
        .post('/api/webhooks/trigger')
        .set('X-API-Key', validApiKey)
        .send({
          projectId: crypto.randomUUID(),
          triggeredBy: `test-${i}`,
        });
      
      executionIds.push(response.body.executionId);
    }
    
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...executionIds),
        async (executionId) => {
          const response = await request(app)
            .get(`/api/webhooks/executions/${executionId}`)
            .set('X-API-Key', validApiKey);
          
          expect(response.status).toBe(200);
          
          // Should have consistent status response format
          expect(response.body).toMatchObject({
            executionId,
            status: expect.stringMatching(/^(queued|running|completed|failed|cancelled)$/),
            projectId: expect.any(String),
            triggeredBy: expect.any(String),
            startTime: expect.any(String),
            duration: expect.any(Number),
            logsUrl: expect.any(String),
            correlationId: expect.any(String),
            timestamp: expect.any(String),
          });
          
          // Duration should be positive
          expect(response.body.duration).toBeGreaterThan(0);
          
          // Logs URL should contain execution ID
          expect(response.body.logsUrl).toContain(executionId);
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property 20.4: Invalid execution IDs consistently return 404
   */
  it('should consistently return 404 for invalid execution IDs', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        async (randomExecutionId) => {
          const response = await request(app)
            .get(`/api/webhooks/executions/${randomExecutionId}`)
            .set('X-API-Key', validApiKey);
          
          expect(response.status).toBe(404);
          expect(response.body.error.code).toBe('EXECUTION_NOT_FOUND');
          expect(response.body.error.executionId).toBe(randomExecutionId);
          
          // Should have structured error format
          expect(response.body).toMatchObject({
            error: {
              code: 'EXECUTION_NOT_FOUND',
              message: expect.any(String),
              executionId: randomExecutionId,
              correlationId: expect.any(String),
              timestamp: expect.any(String),
            },
          });
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property 20.5: Webhook signature validation is consistent
   */
  it('should consistently validate webhook signatures when configured', async () => {
    const webhookSecret = 'test-webhook-secret';
    
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          projectId: fc.uuid(),
          triggeredBy: fc.string({ minLength: 1, maxLength: 255 }),
        }),
        fc.boolean(), // Whether to use valid signature
        async (payload, useValidSignature) => {
          const payloadString = JSON.stringify(payload);
          
          let signature: string;
          if (useValidSignature) {
            signature = 'sha256=' + crypto
              .createHmac('sha256', webhookSecret)
              .update(payloadString)
              .digest('hex');
          } else {
            signature = 'sha256=invalid-signature-' + crypto.randomBytes(32).toString('hex');
          }
          
          const response = await request(app)
            .post('/api/webhooks/trigger')
            .set('X-API-Key', validApiKey)
            .set('X-Hub-Signature-256', signature)
            .send(payload);
          
          if (useValidSignature) {
            expect(response.status).toBe(201);
          } else {
            expect(response.status).toBe(401);
            expect(response.body.error.code).toBe('INVALID_SIGNATURE');
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 20.6: Concurrent webhook requests are handled consistently
   */
  it('should handle concurrent webhook requests consistently', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            projectId: fc.uuid(),
            triggeredBy: fc.string({ minLength: 1, maxLength: 255 }),
          }),
          { minLength: 2, maxLength: 10 }
        ),
        async (payloads) => {
          // Send all requests concurrently
          const promises = payloads.map(payload =>
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
          
          // All should have consistent response format
          responses.forEach((response, index) => {
            expect(response.body).toMatchObject({
              executionId: expect.any(String),
              status: 'queued',
              projectId: payloads[index].projectId,
              triggeredBy: payloads[index].triggeredBy,
            });
          });
        }
      ),
      { numRuns: 20 }
    );
  });
});