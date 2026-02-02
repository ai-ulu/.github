/**
 * Property tests for schedule management
 * **Property 16: Schedule Management Consistency**
 * **Validates: Requirements 8.1, 8.2, 8.5**
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { TestScheduler } from '../scheduler';
import { CronValidator } from '../cron-validator';
import { SchedulerConfig } from '../types';

describe('Property 16: Schedule Management Consistency', () => {
  let scheduler: TestScheduler;
  const config: SchedulerConfig = {
    redisUrl: 'redis://localhost:6379',
    timezone: 'UTC',
    maxConcurrentSchedules: 10,
    executionTimeout: 300000,
    retryAttempts: 3,
    cleanupInterval: 3600000,
  };

  beforeEach(() => {
    scheduler = new TestScheduler(config);
  });

  it('should maintain schedule consistency across operations', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          name: fc.string({ minLength: 1, maxLength: 100 }),
          cronExpression: fc.constantFrom(
            '0 9 * * *',      // Daily at 9 AM
            '0 0 * * 0',      // Weekly on Sunday
            '0 0 1 * *',      // Monthly on 1st
            '*/15 * * * *',   // Every 15 minutes
            '@hourly',        // Hourly
            '@daily'          // Daily
          ),
          timezone: fc.constantFrom('UTC', 'America/New_York', 'Europe/London'),
          projectId: fc.uuid(),
          scenarioIds: fc.array(fc.uuid(), { minLength: 1, maxLength: 5 }),
          userId: fc.uuid(),
          isActive: fc.boolean(),
        }),
        async (scheduleData) => {
          // Property: Creating then reading a schedule returns equivalent data
          const scheduleId = await scheduler.createSchedule(scheduleData);
          const schedules = scheduler.getSchedules();
          const createdSchedule = schedules.find(s => s.id === scheduleId);
          
          expect(createdSchedule).toBeDefined();
          expect(createdSchedule!.name).toBe(scheduleData.name);
          expect(createdSchedule!.cronExpression).toBe(scheduleData.cronExpression);
          expect(createdSchedule!.timezone).toBe(scheduleData.timezone);
          expect(createdSchedule!.projectId).toBe(scheduleData.projectId);
          expect(createdSchedule!.isActive).toBe(scheduleData.isActive);
          
          // Property: Next execution time should be calculated correctly
          const nextExecution = CronValidator.getNextExecution(
            scheduleData.cronExpression,
            scheduleData.timezone
          );
          expect(createdSchedule!.nextExecutionAt).toEqual(nextExecution);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should validate cron expressions consistently', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          cronExpression: fc.oneof(
            // Valid expressions
            fc.constantFrom(
              '0 9 * * *',
              '*/5 * * * *',
              '0 0 1 * *',
              '@daily',
              '@hourly'
            ),
            // Invalid expressions
            fc.constantFrom(
              '60 * * * *',     // Invalid minute
              '* 25 * * *',     // Invalid hour
              '* * 32 * *',     // Invalid day
              '* * * 13 *',     // Invalid month
              'invalid'         // Invalid format
            )
          ),
          timezone: fc.constantFrom('UTC', 'America/New_York', 'Invalid/Timezone'),
        }),
        async (data) => {
          const validation = CronValidator.validate(data.cronExpression, data.timezone);
          
          // Property: Validation result should be consistent
          const secondValidation = CronValidator.validate(data.cronExpression, data.timezone);
          expect(validation.isValid).toBe(secondValidation.isValid);
          
          if (validation.isValid) {
            // Property: Valid expressions should produce next executions
            expect(validation.nextExecutions).toBeDefined();
            expect(validation.nextExecutions!.length).toBeGreaterThan(0);
            
            // Property: Next executions should be in chronological order
            for (let i = 1; i < validation.nextExecutions!.length; i++) {
              expect(validation.nextExecutions![i].getTime())
                .toBeGreaterThan(validation.nextExecutions![i - 1].getTime());
            }
          } else {
            // Property: Invalid expressions should have error messages
            expect(validation.error).toBeDefined();
            expect(validation.error!.length).toBeGreaterThan(0);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should handle timezone transitions correctly', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          cronExpression: fc.constantFrom('0 9 * * *', '0 0 * * 0', '0 0 1 * *'),
          timezone: fc.constantFrom('America/New_York', 'Europe/London', 'Asia/Tokyo'),
        }),
        async (data) => {
          // Property: Timezone handling should be consistent
          const executions = CronValidator.getNextExecutions(
            data.cronExpression,
            5,
            data.timezone
          );
          
          expect(executions.length).toBeGreaterThan(0);
          
          // Property: All executions should respect the timezone
          for (const execution of executions) {
            const isDST = CronValidator.isDST(data.timezone, execution);
            const offset = CronValidator.getTimezoneOffset(data.timezone, execution);
            
            // Offset should be a valid number
            expect(typeof offset).toBe('number');
            expect(typeof isDST).toBe('boolean');
          }
        }
      ),
      { numRuns: 50 }
    );
  });
});