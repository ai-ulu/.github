/**
 * Unit Tests for Advanced Integrations
 * **Validates: Advanced Integration**
 * 
 * Tests webhook retry mechanisms, plugin loading and execution,
 * and custom step definition validation.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  WebhookRetryManager,
  MultiChannelNotificationManager,
  PluginArchitectureManager,
  CustomTestStepManager,
  WebhookConfig,
  RetryConfig,
  NotificationChannel,
  Plugin,
  CustomTestStep,
} from '../utils/advanced-integrations';
import { logger } from '../utils/logger';

// Mock logger
vi.mock('../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('Advanced Integrations Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('WebhookRetryManager', () => {
    let webhookManager: WebhookRetryManager;
    let mockConfig: WebhookConfig;

    beforeEach(() => {
      webhookManager = new WebhookRetryManager();
      
      const retryConfig: RetryConfig = {
        maxAttempts: 3,
        baseDelay: 100, // Reduced for testing
        maxDelay: 1000,
        backoffMultiplier: 2,
        jitterFactor: 0.1,
        retryableStatusCodes: [500, 502, 503, 504, 0],
      };

      mockConfig = {
        url: 'https://example.com/webhook',
        secret: 'test-secret',
        headers: { 'X-Custom': 'test' },
        timeout: 1000, // Reduced for testing
        retryConfig,
        signatureHeader: 'X-Signature',
        contentType: 'application/json',
      };
    });

    it('should register webhook correctly', () => {
      webhookManager.registerWebhook('test-webhook', mockConfig);

      expect(logger.info).toHaveBeenCalledWith(
        'Registered webhook: test-webhook',
        expect.objectContaining({
          url: mockConfig.url,
          timeout: mockConfig.timeout,
          maxAttempts: mockConfig.retryConfig.maxAttempts,
        })
      );
    });

    it('should throw error for non-existent webhook', async () => {
      await expect(
        webhookManager.sendWebhook('non-existent', { test: 'data' })
      ).rejects.toThrow('Webhook non-existent not found');
    });

    it('should calculate exponential backoff correctly', () => {
      const retryConfig: RetryConfig = {
        maxAttempts: 5,
        baseDelay: 1000,
        maxDelay: 10000,
        backoffMultiplier: 2,
        jitterFactor: 0.1,
        retryableStatusCodes: [500],
      };

      const delay1 = (webhookManager as any).calculateRetryDelay(1, retryConfig);
      const delay2 = (webhookManager as any).calculateRetryDelay(2, retryConfig);
      const delay3 = (webhookManager as any).calculateRetryDelay(3, retryConfig);

      expect(delay1).toBeGreaterThanOrEqual(1000);
      expect(delay1).toBeLessThanOrEqual(1100); // Base + 10% jitter
      
      expect(delay2).toBeGreaterThanOrEqual(2000);
      expect(delay2).toBeLessThanOrEqual(2200); // 2x base + 10% jitter
      
      expect(delay3).toBeGreaterThanOrEqual(4000);
      expect(delay3).toBeLessThanOrEqual(4400); // 4x base + 10% jitter
    });

    it('should generate valid signatures', () => {
      const payload = { test: 'data' };
      const secret = 'test-secret';
      
      const signature = (webhookManager as any).generateSignature(payload, secret);
      
      expect(signature).toBeDefined();
      expect(typeof signature).toBe('string');
      expect(signature.length).toBe(64); // SHA256 hex length
    });

    it('should provide empty statistics for new webhook', () => {
      const stats = webhookManager.getWebhookStatistics('new-webhook');
      expect(stats.totalDeliveries).toBe(0);
      expect(stats.successfulDeliveries).toBe(0);
      expect(stats.failedDeliveries).toBe(0);
      expect(stats.successRate).toBe(0);
    });
  });

  describe('MultiChannelNotificationManager', () => {
    let notificationManager: MultiChannelNotificationManager;

    beforeEach(() => {
      notificationManager = new MultiChannelNotificationManager();
    });

    it('should register notification channels correctly', () => {
      const channel: NotificationChannel = {
        id: 'test-email',
        type: 'email',
        config: { to: 'test@example.com' },
        enabled: true,
      };

      notificationManager.registerChannel(channel);

      expect(logger.info).toHaveBeenCalledWith(
        'Registered notification channel: test-email',
        expect.objectContaining({
          type: 'email',
          enabled: true,
          filters: 0,
        })
      );
    });

    it('should provide empty statistics for new channel', () => {
      const stats = notificationManager.getNotificationStatistics('new-channel');
      expect(stats.totalNotifications).toBe(0);
      expect(stats.successfulNotifications).toBe(0);
      expect(stats.failedNotifications).toBe(0);
      expect(stats.successRate).toBe(0);
    });

    it('should evaluate filters correctly', () => {
      const channel: NotificationChannel = {
        id: 'filtered-channel',
        type: 'email',
        config: { to: 'test@example.com' },
        enabled: true,
        filters: [
          {
            field: 'priority',
            operator: 'equals',
            value: 'high',
          },
        ],
      };

      const message = {
        subject: 'Test',
        body: 'Test message',
        priority: 'medium' as const,
      };

      const passesFilters = (notificationManager as any).passesFilters(message, channel.filters);
      expect(passesFilters).toBe(false);

      const highPriorityMessage = {
        ...message,
        priority: 'high' as const,
      };

      const passesFiltersHigh = (notificationManager as any).passesFilters(highPriorityMessage, channel.filters);
      expect(passesFiltersHigh).toBe(true);
    });
  });

  describe('PluginArchitectureManager', () => {
    let pluginManager: PluginArchitectureManager;

    beforeEach(() => {
      pluginManager = new PluginArchitectureManager();
    });

    it('should register plugins correctly', () => {
      const plugin: Plugin = {
        id: 'test-plugin',
        name: 'Test Plugin',
        version: '1.0.0',
        description: 'A test plugin',
        author: 'Test Author',
        main: 'index.js',
        config: { setting1: 'value1' },
        hooks: [
          {
            event: 'beforeTestExecution',
            handler: 'beforeTestHandler',
            priority: 10,
          },
        ],
        enabled: true,
      };

      pluginManager.registerPlugin(plugin);

      expect(logger.info).toHaveBeenCalledWith(
        'Registered plugin: Test Plugin',
        expect.objectContaining({
          id: 'test-plugin',
          version: '1.0.0',
          hooks: 1,
          enabled: true,
        })
      );
    });

    it('should provide correct plugin status for non-existent plugin', () => {
      const status = pluginManager.getPluginStatus('non-existent');
      expect(status.exists).toBe(false);
    });

    it('should provide correct plugin status for registered plugin', () => {
      const plugin: Plugin = {
        id: 'status-plugin',
        name: 'Status Plugin',
        version: '2.0.0',
        description: 'Plugin for status testing',
        author: 'Test Author',
        main: 'index.js',
        hooks: [{ event: 'test', handler: 'handler', priority: 1 }],
        enabled: true,
      };

      pluginManager.registerPlugin(plugin);
      const status = pluginManager.getPluginStatus('status-plugin');
      
      expect(status.exists).toBe(true);
      expect(status.enabled).toBe(true);
      expect(status.loaded).toBe(false);
      expect(status.version).toBe('2.0.0');
      expect(status.hooks).toBe(1);
    });

    it('should list all plugins correctly', () => {
      const plugin1: Plugin = {
        id: 'list-plugin-1',
        name: 'List Plugin 1',
        version: '1.0.0',
        description: 'First list plugin',
        author: 'Author 1',
        main: 'index.js',
        hooks: [],
        enabled: true,
      };

      const plugin2: Plugin = {
        id: 'list-plugin-2',
        name: 'List Plugin 2',
        version: '2.0.0',
        description: 'Second list plugin',
        author: 'Author 2',
        main: 'index.js',
        hooks: [{ event: 'test', handler: 'handler', priority: 1 }],
        enabled: false,
      };

      pluginManager.registerPlugin(plugin1);
      pluginManager.registerPlugin(plugin2);

      const plugins = pluginManager.listPlugins();
      expect(plugins).toHaveLength(2);
      
      const plugin1Info = plugins.find(p => p.id === 'list-plugin-1');
      expect(plugin1Info).toEqual({
        id: 'list-plugin-1',
        name: 'List Plugin 1',
        version: '1.0.0',
        description: 'First list plugin',
        author: 'Author 1',
        enabled: true,
        loaded: false,
        hooks: 0,
      });
    });
  });

  describe('CustomTestStepManager', () => {
    let stepManager: CustomTestStepManager;

    beforeEach(() => {
      stepManager = new CustomTestStepManager();
    });

    it('should register custom test steps correctly', () => {
      const step: CustomTestStep = {
        id: 'test-step',
        name: 'Test Step',
        description: 'A test step for validation',
        category: 'validation',
        parameters: [
          {
            name: 'selector',
            type: 'string',
            required: true,
            description: 'CSS selector for element',
          },
          {
            name: 'timeout',
            type: 'number',
            required: false,
            description: 'Timeout in milliseconds',
            defaultValue: 5000,
            validation: { min: 1000, max: 30000 },
          },
        ],
        implementation: 'function testStep(params) { return true; }',
      };

      stepManager.registerStep(step);

      expect(logger.info).toHaveBeenCalledWith(
        'Registered custom test step: Test Step',
        expect.objectContaining({
          id: 'test-step',
          category: 'validation',
          parameters: 2,
        })
      );
    });

    it('should validate step parameters correctly', () => {
      const step: CustomTestStep = {
        id: 'validation-step',
        name: 'Validation Step',
        description: 'Step for parameter validation',
        category: 'test',
        parameters: [
          {
            name: 'required_param',
            type: 'string',
            required: true,
            description: 'Required parameter',
          },
          {
            name: 'optional_param',
            type: 'number',
            required: false,
            description: 'Optional parameter',
            validation: { min: 1, max: 100 },
          },
        ],
        implementation: 'function() {}',
      };

      stepManager.registerStep(step);

      // Valid parameters
      let result = stepManager.validateStepParameters('validation-step', {
        required_param: 'test value',
        optional_param: 50,
      });
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);

      // Missing required parameter
      result = stepManager.validateStepParameters('validation-step', {
        optional_param: 50,
      });
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Missing required parameter: required_param');

      // Invalid type
      result = stepManager.validateStepParameters('validation-step', {
        required_param: 'test',
        optional_param: 'not a number',
      });
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Parameter optional_param must be of type number');
    });

    it('should retrieve steps by category', () => {
      const step1: CustomTestStep = {
        id: 'category-step-1',
        name: 'Category Step 1',
        description: 'First step in category',
        category: 'navigation',
        parameters: [],
        implementation: 'function() {}',
      };

      const step2: CustomTestStep = {
        id: 'other-step',
        name: 'Other Step',
        description: 'Step in different category',
        category: 'validation',
        parameters: [],
        implementation: 'function() {}',
      };

      stepManager.registerStep(step1);
      stepManager.registerStep(step2);

      const navigationSteps = stepManager.getStepsByCategory('navigation');
      expect(navigationSteps).toHaveLength(1);
      expect(navigationSteps[0].id).toBe('category-step-1');

      const validationSteps = stepManager.getStepsByCategory('validation');
      expect(validationSteps).toHaveLength(1);
      expect(validationSteps[0].id).toBe('other-step');
    });

    it('should search steps correctly', () => {
      const step1: CustomTestStep = {
        id: 'search-step-1',
        name: 'Click Button',
        description: 'Clicks a button element',
        category: 'interaction',
        parameters: [],
        implementation: 'function() {}',
      };

      const step2: CustomTestStep = {
        id: 'search-step-2',
        name: 'Verify Text',
        description: 'Verifies text content',
        category: 'validation',
        parameters: [],
        implementation: 'function() {}',
      };

      stepManager.registerStep(step1);
      stepManager.registerStep(step2);

      // Search by name
      let results = stepManager.searchSteps('click');
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('search-step-1');

      // Search by description
      results = stepManager.searchSteps('text');
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('search-step-2');

      // Case insensitive search
      results = stepManager.searchSteps('BUTTON');
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('search-step-1');
    });

    it('should get all categories', () => {
      const steps: CustomTestStep[] = [
        {
          id: 'step1',
          name: 'Step 1',
          description: 'First step',
          category: 'navigation',
          parameters: [],
          implementation: 'function() {}',
        },
        {
          id: 'step2',
          name: 'Step 2',
          description: 'Second step',
          category: 'validation',
          parameters: [],
          implementation: 'function() {}',
        },
        {
          id: 'step3',
          name: 'Step 3',
          description: 'Third step',
          category: 'navigation',
          parameters: [],
          implementation: 'function() {}',
        },
      ];

      steps.forEach(step => stepManager.registerStep(step));

      const categories = stepManager.getCategories();
      expect(categories).toHaveLength(2);
      expect(categories).toContain('navigation');
      expect(categories).toContain('validation');
    });

    it('should handle non-existent step validation', () => {
      const result = stepManager.validateStepParameters('non-existent', {});
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Step non-existent not found');
    });
  });
});