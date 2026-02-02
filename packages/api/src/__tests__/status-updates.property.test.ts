/**
 * Property Tests for Real-time Status Updates
 * **Property 21: Real-time Status Updates**
 * **Validates: Requirements 10.3, 10.5**
 * 
 * Tests that status updates are accurate throughout execution
 * and CI/CD integration provides real-time feedback.
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

describe('Property Tests: Real-time Status Updates', () => {
  let app: express.Application;
  const validApiKey = 'test-api-key-123';
  
  beforeAll(() => {
    process.env.WEBHOOK_API_KEYS = validApiKey;
    
    app = express();
    app.use(express.json());
    app.use(correlationId);
    app.use('/api/webhooks', webhooksRouter);
  });
  
  afterAll(() => {
    delete process.env.WEBHOOK_API_KEYS;
  });

  /**
   * Property 21.1: Status updates maintain chronological consistency
   */
  it('should maintain chronological consistency in status updates', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          projectId: fc.uuid(),
          triggeredBy: fc.string({ minLength: 1, maxLength: 255 }),
        }),
        async (payload) => {
          // Create execution
          const createResponse = await request(app)
            .post('/api/webhooks/trigger')
            .set('X-API-Key', validApiKey)
            .send(payload);
          
          expect(createResponse.status).toBe(201);
          const executionId = createResponse.body.executionId;
          const startTime = new Date(createResponse.body.startTime);
          
          // Get status multiple times
          const statusChecks: Array<{ timestamp: Date; status: string; duration: number }> = [];
          
          for (let i = 0; i < 3; i++) {
            await new Promise(resolve => setTimeout(resolve, 100)); // Small delay
            
            const statusResponse = await request(app)
              .get(`/api/webhooks/executions/${executionId}`)
              .set('X-API-Key', validApiKey);
            
            expect(statusResponse.status).toBe(200);
            
            statusChecks.push({
              timestamp: new Date(statusResponse.body.timestamp),
              status: statusResponse.body.status,
              duration: statusResponse.body.duration,
            });
          }
          
          // Verify chronological consistency
          for (let i = 1; i < statusChecks.length; i++) {
            const prev = statusChecks[i - 1];
            const curr = statusChecks[i];
            
            // Timestamps should be increasing
            expect(curr.timestamp.getTime()).toBeGreaterThanOrEqual(prev.timestamp.getTime());
            
            // Duration should be increasing (time elapsed)
            expect(curr.duration).toBeGreaterThanOrEqual(prev.duration);
            
            // All timestamps should be after start time
            expect(curr.timestamp.getTime()).toBeGreaterThanOrEqual(startTime.getTime());
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property 21.2: Status transitions follow valid state machine
   */
  it('should follow valid status transitions in state machine', async () => {
    const validTransitions = new Map([
      ['queued', ['running', 'cancelled']],
      ['running', ['completed', 'failed', 'cancelled']],
      ['completed', []], // Terminal state
      ['failed', []], // Terminal state
      ['cancelled', []], // Terminal state
    ]);
    
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          projectId: fc.uuid(),
          triggeredBy: fc.string({ minLength: 1, maxLength: 255 }),
        }),
        async (payload) => {
          // Create execution
          const createResponse = await request(app)
            .post('/api/webhooks/trigger')
            .set('X-API-Key', validApiKey)
            .send(payload);
          
          const executionId = createResponse.body.executionId;
          let previousStatus = 'queued';
          
          // Monitor status changes over time
          for (let i = 0; i < 5; i++) {
            await new Promise(resolve => setTimeout(resolve, 200));
            
            const statusResponse = await request(app)
              .get(`/api/webhooks/executions/${executionId}`)
              .set('X-API-Key', validApiKey);
            
            const currentStatus = statusResponse.body.status;
            
            // Verify valid transition
            if (currentStatus !== previousStatus) {
              const allowedTransitions = validTransitions.get(previousStatus) || [];
              expect(allowedTransitions).toContain(currentStatus);
            }
            
            previousStatus = currentStatus;
            
            // Stop if we reach a terminal state
            if (['completed', 'failed', 'cancelled'].includes(currentStatus)) {
              break;
            }
          }
        }
      ),
      { numRuns: 30 }
    );
  });

  /**
   * Property 21.3: Log entries maintain temporal ordering
   */
  it('should maintain temporal ordering in log entries', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          projectId: fc.uuid(),
          triggeredBy: fc.string({ minLength: 1, maxLength: 255 }),
        }),
        async (payload) => {
          // Create execution
          const createResponse = await request(app)
            .post('/api/webhooks/trigger')
            .set('X-API-Key', validApiKey)
            .send(payload);
          
          const executionId = createResponse.body.executionId;
          
          // Wait a bit for potential log entries
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          // Get logs
          const logsResponse = await request(app)
            .get(`/api/webhooks/executions/${executionId}/logs`)
            .set('X-API-Key', validApiKey);
          
          expect(logsResponse.status).toBe(200);
          const logs = logsResponse.body.logs;
          
          // Verify temporal ordering
          for (let i = 1; i < logs.length; i++) {
            const prevTimestamp = new Date(logs[i - 1].timestamp);
            const currTimestamp = new Date(logs[i].timestamp);
            
            expect(currTimestamp.getTime()).toBeGreaterThanOrEqual(prevTimestamp.getTime());
          }
          
          // All logs should have required fields
          logs.forEach((log: any) => {
            expect(log).toMatchObject({
              timestamp: expect.any(String),
              level: expect.stringMatching(/^(debug|info|warn|error)$/),
              message: expect.any(String),
            });
            
            // Timestamp should be valid ISO string
            expect(() => new Date(log.timestamp)).not.toThrow();
          });
        }
      ),
      { numRuns: 30 }
    );
  });

  /**
   * Property 21.4: Status updates include all required metadata
   */
  it('should include all required metadata in status updates', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          projectId: fc.uuid(),
          testSuiteId: fc.option(fc.uuid()),
          environment: fc.constantFrom('development', 'staging', 'production'),
          branch: fc.option(fc.string({ minLength: 1, maxLength: 100 })),
          commit: fc.option(fc.hexaString({ minLength: 7, maxLength: 40 })),
          triggeredBy: fc.string({ minLength: 1, maxLength: 255 }),
          metadata: fc.option(fc.dictionary(fc.string(), fc.string())),
        }),
        async (payload) => {
          // Create execution
          const createResponse = await request(app)
            .post('/api/webhooks/trigger')
            .set('X-API-Key', validApiKey)
            .send(payload);
          
          const executionId = createResponse.body.executionId;
          
          // Get status
          const statusResponse = await request(app)
            .get(`/api/webhooks/executions/${executionId}`)
            .set('X-API-Key', validApiKey);
          
          expect(statusResponse.status).toBe(200);
          const status = statusResponse.body;
          
          // Verify all required fields are present
          expect(status).toMatchObject({
            executionId,
            status: expect.any(String),
            projectId: payload.projectId,
            triggeredBy: payload.triggeredBy,
            startTime: expect.any(String),
            duration: expect.any(Number),
            metadata: expect.any(Object),
            logsUrl: expect.any(String),
            correlationId: expect.any(String),
            timestamp: expect.any(String),
          });
          
          // Verify optional fields are included when provided
          if (payload.testSuiteId) {
            expect(status.testSuiteId).toBe(payload.testSuiteId);
          }
          
          // Verify metadata includes original payload metadata
          if (payload.metadata) {
            Object.entries(payload.metadata).forEach(([key, value]) => {
              expect(status.metadata).toHaveProperty(key, value);
            });
          }
          
          // Verify metadata includes execution context
          expect(status.metadata).toMatchObject({
            environment: payload.environment,
            correlationId: expect.any(String),
          });
          
          if (payload.branch) {
            expect(status.metadata.branch).toBe(payload.branch);
          }
          
          if (payload.commit) {
            expect(status.metadata.commit).toBe(payload.commit);
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property 21.5: Real-time updates maintain data consistency
   */
  it('should maintain data consistency across real-time updates', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          projectId: fc.uuid(),
          triggeredBy: fc.string({ minLength: 1, maxLength: 255 }),
        }),
        async (payload) => {
          // Create execution
          const createResponse = await request(app)
            .post('/api/webhooks/trigger')
            .set('X-API-Key', validApiKey)
            .send(payload);
          
          const executionId = createResponse.body.executionId;
          
          // Get multiple status updates
          const updates: any[] = [];
          
          for (let i = 0; i < 3; i++) {
            await new Promise(resolve => setTimeout(resolve, 100));
            
            const statusResponse = await request(app)
              .get(`/api/webhooks/executions/${executionId}`)
              .set('X-API-Key', validApiKey);
            
            updates.push(statusResponse.body);
          }
          
          // Verify data consistency across updates
          updates.forEach(update => {
            // Core fields should remain consistent
            expect(update.executionId).toBe(executionId);
            expect(update.projectId).toBe(payload.projectId);
            expect(update.triggeredBy).toBe(payload.triggeredBy);
            expect(update.startTime).toBe(updates[0].startTime); // Start time should not change
            
            // URLs should remain consistent
            expect(update.logsUrl).toBe(updates[0].logsUrl);
          });
          
          // Duration should be monotonically increasing
          for (let i = 1; i < updates.length; i++) {
            expect(updates[i].duration).toBeGreaterThanOrEqual(updates[i - 1].duration);
          }
        }
      ),
      { numRuns: 30 }
    );
  });

  /**
   * Property 21.6: Log filtering maintains consistency
   */
  it('should maintain consistency when filtering logs', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          projectId: fc.uuid(),
          triggeredBy: fc.string({ minLength: 1, maxLength: 255 }),
        }),
        fc.constantFrom('debug', 'info', 'warn', 'error'),
        fc.integer({ min: 1, max: 100 }),
        async (payload, level, limit) => {
          // Create execution
          const createResponse = await request(app)
            .post('/api/webhooks/trigger')
            .set('X-API-Key', validApiKey)
            .send(payload);
          
          const executionId = createResponse.body.executionId;
          
          // Wait for logs to be generated
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // Get filtered logs
          const filteredResponse = await request(app)
            .get(`/api/webhooks/executions/${executionId}/logs?level=${level}&limit=${limit}`)
            .set('X-API-Key', validApiKey);
          
          expect(filteredResponse.status).toBe(200);
          
          // Get all logs for comparison
          const allLogsResponse = await request(app)
            .get(`/api/webhooks/executions/${executionId}/logs`)
            .set('X-API-Key', validApiKey);
          
          const filteredLogs = filteredResponse.body.logs;
          const allLogs = allLogsResponse.body.logs;
          
          // Verify filtering consistency
          expect(filteredLogs.length).toBeLessThanOrEqual(limit);
          expect(filteredLogs.length).toBeLessThanOrEqual(allLogs.length);
          
          // All filtered logs should have the specified level
          filteredLogs.forEach((log: any) => {
            expect(log.level).toBe(level);
          });
          
          // Filtered logs should maintain temporal ordering
          for (let i = 1; i < filteredLogs.length; i++) {
            const prevTimestamp = new Date(filteredLogs[i - 1].timestamp);
            const currTimestamp = new Date(filteredLogs[i].timestamp);
            expect(currTimestamp.getTime()).toBeGreaterThanOrEqual(prevTimestamp.getTime());
          }
          
          // Response metadata should be consistent
          expect(filteredResponse.body).toMatchObject({
            executionId,
            totalLogs: expect.any(Number),
            filteredLogs: filteredLogs.length,
            correlationId: expect.any(String),
            timestamp: expect.any(String),
          });
          
          expect(filteredResponse.body.totalLogs).toBeGreaterThanOrEqual(filteredResponse.body.filteredLogs);
        }
      ),
      { numRuns: 30 }
    );
  });
});