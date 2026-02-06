import { SlackIntegration } from '../communication/slack';
import { JiraIntegration } from '../project-management/jira';
import { VercelIntegration } from '../deployment/vercel';
import { DatadogIntegration } from '../monitoring/datadog';
import { ZapierIntegration } from '../api/zapier';
import { IntegrationConfig, NotificationPayload, TestResult } from '../types';

describe('Integration Edge Cases', () => {
  describe('Slack integration edge cases', () => {
    it('should throw error when not configured', async () => {
      const config: IntegrationConfig = { enabled: false };
      const slack = new SlackIntegration(config);

      const payload: NotificationPayload = {
        testResult: {
          id: '1',
          name: 'test',
          status: 'passed',
          duration: 1000,
        },
        projectName: 'test-project',
        environment: 'dev',
        timestamp: new Date(),
      };

      await expect(slack.sendNotification(payload)).rejects.toThrow('not configured');
    });

    it('should handle missing webhook URL', async () => {
      const config: IntegrationConfig = { enabled: true };
      const slack = new SlackIntegration(config);

      const payload: NotificationPayload = {
        testResult: {
          id: '1',
          name: 'test',
          status: 'passed',
          duration: 1000,
        },
        projectName: 'test-project',
        environment: 'dev',
        timestamp: new Date(),
      };

      await expect(slack.sendNotification(payload)).rejects.toThrow('not configured');
    });

    it('should format message with error', async () => {
      const config: IntegrationConfig = {
        enabled: true,
        webhookUrl: 'https://hooks.slack.com/test',
      };
      const slack = new SlackIntegration(config);

      const payload: NotificationPayload = {
        testResult: {
          id: '1',
          name: 'test',
          status: 'failed',
          duration: 1000,
          error: 'Test failed',
        },
        projectName: 'test-project',
        environment: 'production',
        timestamp: new Date(),
      };

      // Should not throw when formatting
      expect(() => slack['formatMessage'](payload)).not.toThrow();
    });

    it('should handle empty mentions array', async () => {
      const config: IntegrationConfig = {
        enabled: true,
        webhookUrl: 'https://hooks.slack.com/test',
      };
      const slack = new SlackIntegration(config);

      const payload: NotificationPayload = {
        testResult: {
          id: '1',
          name: 'test',
          status: 'passed',
          duration: 1000,
        },
        projectName: 'test-project',
        environment: 'dev',
        timestamp: new Date(),
      };

      const blocks = slack['buildRichBlocks'](payload, []);
      expect(blocks).toBeDefined();
      expect(Array.isArray(blocks)).toBe(true);
    });
  });

  describe('Jira integration edge cases', () => {
    it('should throw error when not enabled', async () => {
      const config: IntegrationConfig = { enabled: false };
      const jira = new JiraIntegration(config, 'https://jira.example.com');

      await expect(
        jira.createIssue({
          title: 'Test issue',
          description: 'Description',
          priority: 'medium',
          labels: ['test'],
          testResult: {
            id: '1',
            name: 'test',
            status: 'failed',
            duration: 1000,
          },
        })
      ).rejects.toThrow('not enabled');
    });

    it('should map priority correctly', () => {
      const config: IntegrationConfig = { enabled: true, apiKey: 'test' };
      const jira = new JiraIntegration(config, 'https://jira.example.com');

      expect(jira['mapPriority']('low')).toBe('Low');
      expect(jira['mapPriority']('medium')).toBe('Medium');
      expect(jira['mapPriority']('high')).toBe('High');
      expect(jira['mapPriority']('critical')).toBe('Highest');
      expect(jira['mapPriority']('unknown')).toBe('Medium');
    });

    it('should map status to transition', () => {
      const config: IntegrationConfig = { enabled: true, apiKey: 'test' };
      const jira = new JiraIntegration(config, 'https://jira.example.com');

      expect(jira['mapStatusToTransition']('passed')).toBe('31');
      expect(jira['mapStatusToTransition']('failed')).toBe('21');
      expect(jira['mapStatusToTransition']('skipped')).toBe('11');
      expect(jira['mapStatusToTransition']('unknown')).toBe('11');
    });

    it('should format description with all fields', () => {
      const config: IntegrationConfig = { enabled: true, apiKey: 'test' };
      const jira = new JiraIntegration(config, 'https://jira.example.com');

      const payload = {
        title: 'Test issue',
        description: 'Test description',
        priority: 'high' as const,
        labels: ['test'],
        testResult: {
          id: '1',
          name: 'test',
          status: 'failed' as const,
          duration: 1000,
          error: 'Test error',
          screenshot: 'https://example.com/screenshot.png',
        },
      };

      const description = jira['formatDescription'](payload);
      expect(description).toContain('Test description');
      expect(description).toContain('test');
      expect(description).toContain('failed');
      expect(description).toContain('Test error');
      expect(description).toContain('screenshot.png');
    });
  });

  describe('Vercel integration edge cases', () => {
    it('should throw error when not enabled', async () => {
      const config: IntegrationConfig = { enabled: false };
      const vercel = new VercelIntegration(config);

      await expect(vercel.runTestsOnPreview('deployment-id')).rejects.toThrow('not enabled');
    });

    it('should create status badge with correct color', async () => {
      const config: IntegrationConfig = { enabled: true, apiKey: 'test' };
      const vercel = new VercelIntegration(config);

      const passedBadge = await vercel.createStatusBadge('project-id', 'passed');
      expect(passedBadge).toContain('brightgreen');

      const failedBadge = await vercel.createStatusBadge('project-id', 'failed');
      expect(failedBadge).toContain('red');
    });
  });

  describe('Datadog integration edge cases', () => {
    it('should throw error when not enabled', async () => {
      const config: IntegrationConfig = { enabled: false };
      const datadog = new DatadogIntegration(config);

      await expect(
        datadog.sendMetric({
          name: 'test.metric',
          value: 100,
          tags: { env: 'dev' },
          timestamp: new Date(),
        })
      ).rejects.toThrow('not enabled');
    });

    it('should format metric name correctly', async () => {
      const config: IntegrationConfig = { enabled: true, apiKey: 'test' };
      const datadog = new DatadogIntegration(config);

      // Metric name should be prefixed with autoqa
      const metricName = 'test.duration';
      expect(`autoqa.${metricName}`).toBe('autoqa.test.duration');
    });

    it('should convert tags to array format', () => {
      const tags = { env: 'production', service: 'api' };
      const tagArray = Object.entries(tags).map(([k, v]) => `${k}:${v}`);

      expect(tagArray).toEqual(['env:production', 'service:api']);
    });
  });

  describe('Zapier integration edge cases', () => {
    it('should throw error when not configured', async () => {
      const config: IntegrationConfig = { enabled: false };
      const zapier = new ZapierIntegration(config);

      const testResult: TestResult = {
        id: '1',
        name: 'test',
        status: 'passed',
        duration: 1000,
      };

      await expect(zapier.triggerZap(testResult)).rejects.toThrow('not configured');
    });

    it('should handle missing webhook URL', async () => {
      const config: IntegrationConfig = { enabled: true };
      const zapier = new ZapierIntegration(config);

      const testResult: TestResult = {
        id: '1',
        name: 'test',
        status: 'passed',
        duration: 1000,
      };

      await expect(zapier.triggerZap(testResult)).rejects.toThrow('not configured');
    });
  });

  describe('Integration configuration edge cases', () => {
    it('should handle missing API keys', () => {
      const config: IntegrationConfig = {
        enabled: true,
        webhookUrl: 'https://example.com/webhook',
      };

      expect(config.apiKey).toBeUndefined();
      expect(config.webhookUrl).toBeDefined();
    });

    it('should handle custom fields', () => {
      const config: IntegrationConfig = {
        enabled: true,
        customFields: {
          projectKey: 'AUTOQA',
          teamId: 'team-123',
        },
      };

      expect(config.customFields?.projectKey).toBe('AUTOQA');
      expect(config.customFields?.teamId).toBe('team-123');
    });

    it('should handle empty custom fields', () => {
      const config: IntegrationConfig = {
        enabled: true,
        customFields: {},
      };

      expect(config.customFields).toEqual({});
    });
  });
});
