/**
 * Property tests for notification delivery
 * **Property 17: Notification Delivery**
 * **Validates: Requirements 8.3, 8.4**
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { NotificationService } from '../notification-service';
import { NotificationConfig, ScheduleExecution, NotificationChannel } from '../types';

// Mock axios
const mockPost = vi.fn();
vi.mock('axios', () => ({
  default: {
    post: mockPost,
  },
  post: mockPost,
}));

describe('Property 17: Notification Delivery', () => {
  let notificationService: NotificationService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPost.mockResolvedValue({ data: 'success' });
  });

  it('should deliver notifications for all completed tests', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          channels: fc.array(
            fc.record({
              type: fc.constantFrom('slack', 'discord', 'webhook'),
              name: fc.string({ minLength: 1, maxLength: 50 }),
              config: fc.record({
                webhookUrl: fc.webUrl(),
                method: fc.constantFrom('POST', 'PUT'),
              }),
              events: fc.constantFrom(['schedule-completed'], ['schedule-failed'], ['schedule-completed', 'schedule-failed']),
            }),
            { minLength: 1, maxLength: 3 }
          ),
          execution: fc.record({
            id: fc.uuid(),
            scheduleId: fc.uuid(),
            executionId: fc.uuid(),
            status: fc.constantFrom('completed', 'failed'),
            startTime: fc.date(),
            endTime: fc.date(),
            duration: fc.integer({ min: 1000, max: 300000 }),
          }),
        }),
        async (data) => {
          const config: NotificationConfig = {
            enabled: true,
            channels: data.channels as NotificationChannel[],
            templates: {
              scheduleStarted: 'Schedule started',
              scheduleCompleted: 'Schedule completed',
              scheduleFailed: 'Schedule failed',
              criticalFailure: 'Critical failure',
            },
          };

          notificationService = new NotificationService(config);
          const execution = data.execution as ScheduleExecution;

          // Property: Notifications should be sent for all relevant channels
          if (execution.status === 'completed') {
            await notificationService.notifyScheduleCompleted(execution);
            
            const relevantChannels = data.channels.filter(c => 
              c.events.includes('schedule-completed')
            );
            
            expect(mockPost).toHaveBeenCalledTimes(relevantChannels.length);
          } else if (execution.status === 'failed') {
            await notificationService.notifyScheduleFailed(execution);
            
            const relevantChannels = data.channels.filter(c => 
              c.events.includes('schedule-failed')
            );
            
            expect(mockPost).toHaveBeenCalledTimes(relevantChannels.length);
          }

          // Property: All notification calls should include execution details
          const calls = mockPost.mock.calls;
          for (const call of calls) {
            const [url, payload] = call;
            expect(url).toBeDefined();
            expect(payload).toBeDefined();
            
            // Check that payload contains execution information
            const payloadStr = JSON.stringify(payload);
            expect(payloadStr).toContain(execution.id);
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  it('should format notification content consistently', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          execution: fc.record({
            id: fc.uuid(),
            scheduleId: fc.uuid(),
            executionId: fc.uuid(),
            status: fc.constantFrom('completed', 'failed'),
            startTime: fc.date(),
            duration: fc.integer({ min: 1000, max: 300000 }),
          }),
          channelType: fc.constantFrom('slack', 'discord'),
        }),
        async (data) => {
          const config: NotificationConfig = {
            enabled: true,
            channels: [{
              type: data.channelType as any,
              name: 'test-channel',
              config: {
                webhookUrl: 'https://hooks.slack.com/test',
              },
              events: ['schedule-completed', 'schedule-failed'],
            }],
            templates: {
              scheduleStarted: 'Schedule started',
              scheduleCompleted: 'Schedule completed',
              scheduleFailed: 'Schedule failed',
              criticalFailure: 'Critical failure',
            },
          };

          notificationService = new NotificationService(config);
          const execution = data.execution as ScheduleExecution;

          // Send notification
          if (execution.status === 'completed') {
            await notificationService.notifyScheduleCompleted(execution);
          } else {
            await notificationService.notifyScheduleFailed(execution);
          }

          // Property: Notification content should include relevant execution details
          expect(mockPost).toHaveBeenCalledTimes(1);
          const [, payload] = mockPost.mock.calls[0];
          
          const messageContent = data.channelType === 'slack' ? payload.text : payload.content;
          expect(messageContent).toContain(execution.scheduleId);
          expect(messageContent).toContain(execution.status);
          
          // Property: Duration should be formatted consistently
          if (execution.duration) {
            const expectedDuration = `${Math.round(execution.duration / 1000)}s`;
            expect(messageContent).toContain(expectedDuration);
          }
        }
      ),
      { numRuns: 25 }
    );
  });
});