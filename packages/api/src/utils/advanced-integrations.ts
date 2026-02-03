/**
 * Advanced Integration Capabilities
 * **Validates: Advanced Integration**
 * 
 * Implements webhook retry mechanisms, multiple notification channels,
 * plugin architecture, and custom test step definitions.
 */

import { logger } from './logger';
import * as crypto from 'crypto';

export interface WebhookConfig {
  url: string;
  secret?: string;
  headers?: Record<string, string>;
  timeout: number;
  retryConfig: RetryConfig;
  signatureHeader?: string;
  contentType: 'application/json' | 'application/x-www-form-urlencoded';
}

export interface RetryConfig {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  jitterFactor: number;
  retryableStatusCodes: number[];
}

export interface NotificationChannel {
  id: string;
  type: 'email' | 'slack' | 'discord' | 'teams' | 'webhook' | 'sms';
  config: any;
  enabled: boolean;
  filters?: NotificationFilter[];
}

export interface NotificationFilter {
  field: string;
  operator: 'equals' | 'contains' | 'startsWith' | 'endsWith' | 'regex';
  value: string;
  caseSensitive?: boolean;
}

export interface Plugin {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  main: string;
  dependencies?: Record<string, string>;
  config?: Record<string, any>;
  hooks: PluginHook[];
  enabled: boolean;
}

export interface PluginHook {
  event: string;
  handler: string;
  priority: number;
}

export interface CustomTestStep {
  id: string;
  name: string;
  description: string;
  category: string;
  parameters: StepParameter[];
  implementation: string;
  validation?: StepValidation;
  examples?: StepExample[];
}

export interface StepParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  required: boolean;
  description: string;
  defaultValue?: any;
  validation?: ParameterValidation;
}

export interface ParameterValidation {
  min?: number;
  max?: number;
  pattern?: string;
  enum?: any[];
}

export interface StepValidation {
  schema: any;
  customValidator?: string;
}

export interface StepExample {
  name: string;
  description: string;
  parameters: Record<string, any>;
  expectedResult?: any;
}

/**
 * Webhook Retry Manager
 */
export class WebhookRetryManager {
  private webhooks = new Map<string, WebhookConfig>();
  private deliveryHistory = new Map<string, WebhookDelivery[]>();
  private activeDeliveries = new Map<string, Promise<WebhookResult>>();

  /**
   * Register webhook
   */
  registerWebhook(id: string, config: WebhookConfig): void {
    this.webhooks.set(id, config);
    
    logger.info(`Registered webhook: ${id}`, {
      url: config.url,
      timeout: config.timeout,
      maxAttempts: config.retryConfig.maxAttempts,
    });
  }

  /**
   * Send webhook with retry logic
   */
  async sendWebhook(id: string, payload: any, eventType?: string): Promise<WebhookResult> {
    const config = this.webhooks.get(id);
    if (!config) {
      throw new Error(`Webhook ${id} not found`);
    }

    const deliveryId = this.generateDeliveryId();
    const delivery: WebhookDelivery = {
      id: deliveryId,
      webhookId: id,
      eventType,
      payload,
      attempts: [],
      status: 'pending',
      createdAt: Date.now(),
    };

    // Check if there's already an active delivery for this webhook
    const activeDelivery = this.activeDeliveries.get(id);
    if (activeDelivery) {
      logger.warn(`Webhook ${id} has active delivery, queuing new delivery`);
    }

    const deliveryPromise = this.executeDelivery(config, delivery);
    this.activeDeliveries.set(id, deliveryPromise);

    try {
      const result = await deliveryPromise;
      
      // Store delivery history
      const history = this.deliveryHistory.get(id) || [];
      history.push(delivery);
      
      // Keep only last 100 deliveries
      if (history.length > 100) {
        history.splice(0, history.length - 100);
      }
      
      this.deliveryHistory.set(id, history);

      return result;
    } finally {
      this.activeDeliveries.delete(id);
    }
  }

  /**
   * Execute webhook delivery with retries
   */
  private async executeDelivery(config: WebhookConfig, delivery: WebhookDelivery): Promise<WebhookResult> {
    const { retryConfig } = config;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= retryConfig.maxAttempts; attempt++) {
      const attemptStart = Date.now();
      
      try {
        const response = await this.makeWebhookRequest(config, delivery.payload, attempt);
        
        const attemptResult: WebhookAttempt = {
          attempt,
          timestamp: attemptStart,
          duration: Date.now() - attemptStart,
          statusCode: response.status,
          success: true,
          response: response.body,
        };

        delivery.attempts.push(attemptResult);
        delivery.status = 'delivered';
        delivery.deliveredAt = Date.now();

        logger.info(`Webhook delivered successfully`, {
          webhookId: delivery.webhookId,
          deliveryId: delivery.id,
          attempt,
          statusCode: response.status,
        });

        return {
          deliveryId: delivery.id,
          success: true,
          attempts: attempt,
          finalStatusCode: response.status,
          totalDuration: Date.now() - delivery.createdAt,
        };

      } catch (error) {
        lastError = error as Error;
        
        const attemptResult: WebhookAttempt = {
          attempt,
          timestamp: attemptStart,
          duration: Date.now() - attemptStart,
          success: false,
          error: lastError.message,
          statusCode: (error as any).statusCode,
        };

        delivery.attempts.push(attemptResult);

        // Check if error is retryable
        if (!this.isRetryableError(lastError, retryConfig) || attempt === retryConfig.maxAttempts) {
          delivery.status = 'failed';
          delivery.failedAt = Date.now();

          logger.error(`Webhook delivery failed`, {
            webhookId: delivery.webhookId,
            deliveryId: delivery.id,
            attempts: attempt,
            error: lastError.message,
          });

          return {
            deliveryId: delivery.id,
            success: false,
            attempts: attempt,
            error: lastError.message,
            totalDuration: Date.now() - delivery.createdAt,
          };
        }

        // Calculate delay for next attempt
        const delay = this.calculateRetryDelay(attempt, retryConfig);
        
        logger.warn(`Webhook delivery attempt ${attempt} failed, retrying in ${delay}ms`, {
          webhookId: delivery.webhookId,
          deliveryId: delivery.id,
          error: lastError.message,
        });

        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    // This should never be reached, but just in case
    delivery.status = 'failed';
    return {
      deliveryId: delivery.id,
      success: false,
      attempts: retryConfig.maxAttempts,
      error: lastError?.message || 'Unknown error',
      totalDuration: Date.now() - delivery.createdAt,
    };
  }

  /**
   * Make webhook HTTP request
   */
  private async makeWebhookRequest(config: WebhookConfig, payload: any, attempt: number): Promise<WebhookResponse> {
    const headers: Record<string, string> = {
      'Content-Type': config.contentType,
      'User-Agent': 'AutoQA-Webhook/1.0',
      'X-Webhook-Attempt': attempt.toString(),
      ...config.headers,
    };

    // Add signature if secret is provided
    if (config.secret && config.signatureHeader) {
      const signature = this.generateSignature(payload, config.secret);
      headers[config.signatureHeader] = signature;
    }

    const body = config.contentType === 'application/json' 
      ? JSON.stringify(payload)
      : new URLSearchParams(payload).toString();

    // In production, use actual HTTP client
    const response = await this.simulateHttpRequest(config.url, {
      method: 'POST',
      headers,
      body,
      timeout: config.timeout,
    });

    return response;
  }

  /**
   * Simulate HTTP request (replace with actual HTTP client in production)
   */
  private async simulateHttpRequest(url: string, options: any): Promise<WebhookResponse> {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, Math.random() * 100 + 50));

    // Simulate different response scenarios
    const random = Math.random();
    
    if (random < 0.1) {
      // 10% chance of timeout
      throw new Error('Request timeout');
    } else if (random < 0.2) {
      // 10% chance of connection error
      const error = new Error('Connection refused');
      (error as any).statusCode = 0;
      throw error;
    } else if (random < 0.3) {
      // 10% chance of 5xx error
      const error = new Error('Internal server error');
      (error as any).statusCode = 500;
      throw error;
    } else if (random < 0.4) {
      // 10% chance of 4xx error
      const error = new Error('Bad request');
      (error as any).statusCode = 400;
      throw error;
    } else {
      // 60% chance of success
      return {
        status: 200,
        body: { success: true, timestamp: Date.now() },
      };
    }
  }

  /**
   * Generate webhook signature
   */
  private generateSignature(payload: any, secret: string): string {
    const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
    return crypto.createHmac('sha256', secret).update(body).digest('hex');
  }

  /**
   * Check if error is retryable
   */
  private isRetryableError(error: Error, retryConfig: RetryConfig): boolean {
    const statusCode = (error as any).statusCode;
    
    if (statusCode === 0) {
      // Network errors are retryable
      return true;
    }

    return retryConfig.retryableStatusCodes.includes(statusCode);
  }

  /**
   * Calculate retry delay with exponential backoff and jitter
   */
  private calculateRetryDelay(attempt: number, retryConfig: RetryConfig): number {
    const exponentialDelay = retryConfig.baseDelay * Math.pow(retryConfig.backoffMultiplier, attempt - 1);
    const cappedDelay = Math.min(exponentialDelay, retryConfig.maxDelay);
    
    // Add jitter
    const jitter = cappedDelay * retryConfig.jitterFactor * Math.random();
    
    return Math.floor(cappedDelay + jitter);
  }

  /**
   * Generate delivery ID
   */
  private generateDeliveryId(): string {
    return `delivery_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  }

  /**
   * Get webhook delivery history
   */
  getDeliveryHistory(webhookId: string): WebhookDelivery[] {
    return this.deliveryHistory.get(webhookId) || [];
  }

  /**
   * Get webhook statistics
   */
  getWebhookStatistics(webhookId: string): WebhookStatistics {
    const history = this.getDeliveryHistory(webhookId);
    
    if (history.length === 0) {
      return {
        totalDeliveries: 0,
        successfulDeliveries: 0,
        failedDeliveries: 0,
        successRate: 0,
        averageAttempts: 0,
        averageDuration: 0,
      };
    }

    const successful = history.filter(d => d.status === 'delivered').length;
    const failed = history.filter(d => d.status === 'failed').length;
    const totalAttempts = history.reduce((sum, d) => sum + d.attempts.length, 0);
    const totalDuration = history.reduce((sum, d) => {
      const endTime = d.deliveredAt || d.failedAt || Date.now();
      return sum + (endTime - d.createdAt);
    }, 0);

    return {
      totalDeliveries: history.length,
      successfulDeliveries: successful,
      failedDeliveries: failed,
      successRate: (successful / history.length) * 100,
      averageAttempts: totalAttempts / history.length,
      averageDuration: totalDuration / history.length,
    };
  }
}

/**
 * Multi-Channel Notification Manager
 */
export class MultiChannelNotificationManager {
  private channels = new Map<string, NotificationChannel>();
  private notificationHistory = new Map<string, NotificationRecord[]>();

  /**
   * Register notification channel
   */
  registerChannel(channel: NotificationChannel): void {
    this.channels.set(channel.id, channel);
    
    logger.info(`Registered notification channel: ${channel.id}`, {
      type: channel.type,
      enabled: channel.enabled,
      filters: channel.filters?.length || 0,
    });
  }

  /**
   * Send notification to multiple channels
   */
  async sendNotification(message: NotificationMessage, channelIds?: string[]): Promise<NotificationResult[]> {
    const targetChannels = channelIds 
      ? channelIds.map(id => this.channels.get(id)).filter(Boolean) as NotificationChannel[]
      : Array.from(this.channels.values()).filter(c => c.enabled);

    const results: NotificationResult[] = [];

    for (const channel of targetChannels) {
      try {
        // Check filters
        if (!this.passesFilters(message, channel.filters)) {
          results.push({
            channelId: channel.id,
            success: false,
            skipped: true,
            reason: 'Filtered out by channel filters',
          });
          continue;
        }

        const result = await this.sendToChannel(channel, message);
        results.push(result);

        // Record notification
        this.recordNotification(channel.id, message, result);

      } catch (error) {
        const result: NotificationResult = {
          channelId: channel.id,
          success: false,
          error: (error as Error).message,
        };
        
        results.push(result);
        this.recordNotification(channel.id, message, result);
      }
    }

    return results;
  }

  /**
   * Send notification to specific channel
   */
  private async sendToChannel(channel: NotificationChannel, message: NotificationMessage): Promise<NotificationResult> {
    switch (channel.type) {
      case 'email':
        return await this.sendEmail(channel, message);
      case 'slack':
        return await this.sendSlack(channel, message);
      case 'discord':
        return await this.sendDiscord(channel, message);
      case 'teams':
        return await this.sendTeams(channel, message);
      case 'webhook':
        return await this.sendWebhook(channel, message);
      case 'sms':
        return await this.sendSMS(channel, message);
      default:
        throw new Error(`Unsupported channel type: ${channel.type}`);
    }
  }

  /**
   * Send email notification
   */
  private async sendEmail(channel: NotificationChannel, message: NotificationMessage): Promise<NotificationResult> {
    logger.info(`Sending email notification`, {
      channelId: channel.id,
      to: channel.config.to,
      subject: message.subject,
    });

    // Simulate email sending
    await new Promise(resolve => setTimeout(resolve, 100));

    return {
      channelId: channel.id,
      success: true,
      deliveredAt: Date.now(),
    };
  }

  /**
   * Send Slack notification
   */
  private async sendSlack(channel: NotificationChannel, message: NotificationMessage): Promise<NotificationResult> {
    logger.info(`Sending Slack notification`, {
      channelId: channel.id,
      webhook: channel.config.webhookUrl,
      channel: channel.config.channel,
    });

    // Simulate Slack API call
    await new Promise(resolve => setTimeout(resolve, 150));

    return {
      channelId: channel.id,
      success: true,
      deliveredAt: Date.now(),
    };
  }

  /**
   * Send Discord notification
   */
  private async sendDiscord(channel: NotificationChannel, message: NotificationMessage): Promise<NotificationResult> {
    logger.info(`Sending Discord notification`, {
      channelId: channel.id,
      webhook: channel.config.webhookUrl,
    });

    // Simulate Discord API call
    await new Promise(resolve => setTimeout(resolve, 120));

    return {
      channelId: channel.id,
      success: true,
      deliveredAt: Date.now(),
    };
  }

  /**
   * Send Teams notification
   */
  private async sendTeams(channel: NotificationChannel, message: NotificationMessage): Promise<NotificationResult> {
    logger.info(`Sending Teams notification`, {
      channelId: channel.id,
      webhook: channel.config.webhookUrl,
    });

    // Simulate Teams API call
    await new Promise(resolve => setTimeout(resolve, 200));

    return {
      channelId: channel.id,
      success: true,
      deliveredAt: Date.now(),
    };
  }

  /**
   * Send webhook notification
   */
  private async sendWebhook(channel: NotificationChannel, message: NotificationMessage): Promise<NotificationResult> {
    logger.info(`Sending webhook notification`, {
      channelId: channel.id,
      url: channel.config.url,
    });

    // Simulate webhook call
    await new Promise(resolve => setTimeout(resolve, 100));

    return {
      channelId: channel.id,
      success: true,
      deliveredAt: Date.now(),
    };
  }

  /**
   * Send SMS notification
   */
  private async sendSMS(channel: NotificationChannel, message: NotificationMessage): Promise<NotificationResult> {
    logger.info(`Sending SMS notification`, {
      channelId: channel.id,
      to: channel.config.phoneNumber,
    });

    // Simulate SMS API call
    await new Promise(resolve => setTimeout(resolve, 300));

    return {
      channelId: channel.id,
      success: true,
      deliveredAt: Date.now(),
    };
  }

  /**
   * Check if message passes channel filters
   */
  private passesFilters(message: NotificationMessage, filters?: NotificationFilter[]): boolean {
    if (!filters || filters.length === 0) {
      return true;
    }

    return filters.every(filter => this.evaluateFilter(message, filter));
  }

  /**
   * Evaluate single filter
   */
  private evaluateFilter(message: NotificationMessage, filter: NotificationFilter): boolean {
    const fieldValue = this.getFieldValue(message, filter.field);
    if (fieldValue === undefined) {
      return false;
    }

    const value = filter.caseSensitive ? fieldValue : fieldValue.toLowerCase();
    const filterValue = filter.caseSensitive ? filter.value : filter.value.toLowerCase();

    switch (filter.operator) {
      case 'equals':
        return value === filterValue;
      case 'contains':
        return value.includes(filterValue);
      case 'startsWith':
        return value.startsWith(filterValue);
      case 'endsWith':
        return value.endsWith(filterValue);
      case 'regex':
        const regex = new RegExp(filterValue, filter.caseSensitive ? '' : 'i');
        return regex.test(value);
      default:
        return false;
    }
  }

  /**
   * Get field value from message
   */
  private getFieldValue(message: NotificationMessage, field: string): string {
    const fields: Record<string, any> = {
      subject: message.subject,
      body: message.body,
      priority: message.priority,
      category: message.category,
      source: message.source,
    };

    return fields[field]?.toString() || '';
  }

  /**
   * Record notification
   */
  private recordNotification(channelId: string, message: NotificationMessage, result: NotificationResult): void {
    const record: NotificationRecord = {
      channelId,
      message,
      result,
      timestamp: Date.now(),
    };

    const history = this.notificationHistory.get(channelId) || [];
    history.push(record);

    // Keep only last 1000 notifications per channel
    if (history.length > 1000) {
      history.splice(0, history.length - 1000);
    }

    this.notificationHistory.set(channelId, history);
  }

  /**
   * Get notification statistics
   */
  getNotificationStatistics(channelId?: string): NotificationStatistics {
    const records = channelId 
      ? this.notificationHistory.get(channelId) || []
      : Array.from(this.notificationHistory.values()).flat();

    if (records.length === 0) {
      return {
        totalNotifications: 0,
        successfulNotifications: 0,
        failedNotifications: 0,
        skippedNotifications: 0,
        successRate: 0,
      };
    }

    const successful = records.filter(r => r.result.success).length;
    const failed = records.filter(r => !r.result.success && !r.result.skipped).length;
    const skipped = records.filter(r => r.result.skipped).length;

    return {
      totalNotifications: records.length,
      successfulNotifications: successful,
      failedNotifications: failed,
      skippedNotifications: skipped,
      successRate: (successful / records.length) * 100,
    };
  }
}

/**
 * Plugin Architecture Manager
 */
export class PluginArchitectureManager {
  private plugins = new Map<string, Plugin>();
  private loadedPlugins = new Map<string, any>();
  private eventHooks = new Map<string, PluginHook[]>();

  /**
   * Register plugin
   */
  registerPlugin(plugin: Plugin): void {
    this.plugins.set(plugin.id, plugin);
    
    // Register hooks
    for (const hook of plugin.hooks) {
      const hooks = this.eventHooks.get(hook.event) || [];
      hooks.push({ ...hook, pluginId: plugin.id } as any);
      hooks.sort((a, b) => b.priority - a.priority); // Higher priority first
      this.eventHooks.set(hook.event, hooks);
    }

    logger.info(`Registered plugin: ${plugin.name}`, {
      id: plugin.id,
      version: plugin.version,
      hooks: plugin.hooks.length,
      enabled: plugin.enabled,
    });
  }

  /**
   * Load plugin
   */
  async loadPlugin(pluginId: string): Promise<void> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      throw new Error(`Plugin ${pluginId} not found`);
    }

    if (!plugin.enabled) {
      throw new Error(`Plugin ${pluginId} is disabled`);
    }

    if (this.loadedPlugins.has(pluginId)) {
      logger.warn(`Plugin ${pluginId} is already loaded`);
      return;
    }

    try {
      // In production, this would dynamically import the plugin module
      const pluginModule = await this.simulatePluginLoad(plugin);
      
      // Initialize plugin
      if (pluginModule.initialize) {
        await pluginModule.initialize(plugin.config || {});
      }

      this.loadedPlugins.set(pluginId, pluginModule);

      logger.info(`Loaded plugin: ${plugin.name}`, {
        id: pluginId,
        version: plugin.version,
      });

    } catch (error) {
      logger.error(`Failed to load plugin ${pluginId}`, {
        error: (error as Error).message,
      });
      throw error;
    }
  }

  /**
   * Unload plugin
   */
  async unloadPlugin(pluginId: string): Promise<void> {
    const pluginModule = this.loadedPlugins.get(pluginId);
    if (!pluginModule) {
      logger.warn(`Plugin ${pluginId} is not loaded`);
      return;
    }

    try {
      // Cleanup plugin
      if (pluginModule.cleanup) {
        await pluginModule.cleanup();
      }

      this.loadedPlugins.delete(pluginId);

      logger.info(`Unloaded plugin: ${pluginId}`);

    } catch (error) {
      logger.error(`Failed to unload plugin ${pluginId}`, {
        error: (error as Error).message,
      });
      throw error;
    }
  }

  /**
   * Execute plugin hooks for event
   */
  async executeHooks(event: string, data: any): Promise<any> {
    const hooks = this.eventHooks.get(event) || [];
    let result = data;

    for (const hook of hooks) {
      const pluginModule = this.loadedPlugins.get((hook as any).pluginId);
      if (!pluginModule) {
        continue;
      }

      try {
        const handler = pluginModule[hook.handler];
        if (typeof handler === 'function') {
          result = await handler(result, { event, hook });
        }
      } catch (error) {
        logger.error(`Plugin hook failed`, {
          pluginId: (hook as any).pluginId,
          event,
          handler: hook.handler,
          error: (error as Error).message,
        });
      }
    }

    return result;
  }

  /**
   * Simulate plugin loading (replace with actual dynamic import in production)
   */
  private async simulatePluginLoad(plugin: Plugin): Promise<any> {
    // Simulate loading delay
    await new Promise(resolve => setTimeout(resolve, 100));

    // Return mock plugin module
    return {
      initialize: async (config: any) => {
        logger.debug(`Initializing plugin ${plugin.id}`, config);
      },
      cleanup: async () => {
        logger.debug(`Cleaning up plugin ${plugin.id}`);
      },
      // Mock hook handlers
      beforeTestExecution: async (data: any) => {
        logger.debug(`Plugin ${plugin.id} beforeTestExecution hook`, data);
        return data;
      },
      afterTestExecution: async (data: any) => {
        logger.debug(`Plugin ${plugin.id} afterTestExecution hook`, data);
        return data;
      },
    };
  }

  /**
   * Get plugin status
   */
  getPluginStatus(pluginId: string): PluginStatus {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      return { exists: false };
    }

    const isLoaded = this.loadedPlugins.has(pluginId);

    return {
      exists: true,
      enabled: plugin.enabled,
      loaded: isLoaded,
      version: plugin.version,
      hooks: plugin.hooks.length,
    };
  }

  /**
   * List all plugins
   */
  listPlugins(): PluginInfo[] {
    return Array.from(this.plugins.values()).map(plugin => ({
      id: plugin.id,
      name: plugin.name,
      version: plugin.version,
      description: plugin.description,
      author: plugin.author,
      enabled: plugin.enabled,
      loaded: this.loadedPlugins.has(plugin.id),
      hooks: plugin.hooks.length,
    }));
  }
}

/**
 * Custom Test Step Manager
 */
export class CustomTestStepManager {
  private steps = new Map<string, CustomTestStep>();
  private stepCategories = new Set<string>();

  /**
   * Register custom test step
   */
  registerStep(step: CustomTestStep): void {
    this.steps.set(step.id, step);
    this.stepCategories.add(step.category);

    logger.info(`Registered custom test step: ${step.name}`, {
      id: step.id,
      category: step.category,
      parameters: step.parameters.length,
    });
  }

  /**
   * Validate step parameters
   */
  validateStepParameters(stepId: string, parameters: Record<string, any>): StepValidationResult {
    const step = this.steps.get(stepId);
    if (!step) {
      return {
        isValid: false,
        errors: [`Step ${stepId} not found`],
      };
    }

    const errors: string[] = [];

    // Check required parameters
    for (const param of step.parameters) {
      if (param.required && !(param.name in parameters)) {
        errors.push(`Missing required parameter: ${param.name}`);
        continue;
      }

      const value = parameters[param.name];
      if (value !== undefined) {
        const paramErrors = this.validateParameter(param, value);
        errors.push(...paramErrors);
      }
    }

    // Check for unknown parameters
    const knownParams = new Set(step.parameters.map(p => p.name));
    for (const paramName of Object.keys(parameters)) {
      if (!knownParams.has(paramName)) {
        errors.push(`Unknown parameter: ${paramName}`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate single parameter
   */
  private validateParameter(param: StepParameter, value: any): string[] {
    const errors: string[] = [];

    // Type validation
    if (!this.isValidType(value, param.type)) {
      errors.push(`Parameter ${param.name} must be of type ${param.type}`);
      return errors;
    }

    // Additional validation
    if (param.validation) {
      const validation = param.validation;

      if (typeof value === 'number') {
        if (validation.min !== undefined && value < validation.min) {
          errors.push(`Parameter ${param.name} must be >= ${validation.min}`);
        }
        if (validation.max !== undefined && value > validation.max) {
          errors.push(`Parameter ${param.name} must be <= ${validation.max}`);
        }
      }

      if (typeof value === 'string') {
        if (validation.pattern) {
          const regex = new RegExp(validation.pattern);
          if (!regex.test(value)) {
            errors.push(`Parameter ${param.name} does not match pattern ${validation.pattern}`);
          }
        }
      }

      if (validation.enum && !validation.enum.includes(value)) {
        errors.push(`Parameter ${param.name} must be one of: ${validation.enum.join(', ')}`);
      }
    }

    return errors;
  }

  /**
   * Check if value is of valid type
   */
  private isValidType(value: any, type: string): boolean {
    switch (type) {
      case 'string':
        return typeof value === 'string';
      case 'number':
        return typeof value === 'number';
      case 'boolean':
        return typeof value === 'boolean';
      case 'array':
        return Array.isArray(value);
      case 'object':
        return typeof value === 'object' && value !== null && !Array.isArray(value);
      default:
        return false;
    }
  }

  /**
   * Execute custom test step
   */
  async executeCustomTestStep(stepId: string, parameters: Record<string, any>): Promise<StepExecutionResult> {
    const step = this.steps.get(stepId);
    if (!step) {
      throw new Error(`Step ${stepId} not found`);
    }

    // Validate parameters
    const validation = this.validateStepParameters(stepId, parameters);
    if (!validation.isValid) {
      return {
        success: false,
        errors: validation.errors,
      };
    }

    try {
      // In production, this would execute the actual step implementation
      const result = await this.simulateStepExecution(step, parameters);

      logger.info(`Executed custom test step: ${step.name}`, {
        stepId,
        success: result.success,
      });

      return result;

    } catch (error) {
      logger.error(`Custom test step execution failed`, {
        stepId,
        error: (error as Error).message,
      });

      return {
        success: false,
        errors: [(error as Error).message],
      };
    }
  }

  /**
   * Simulate step execution
   */
  private async simulateStepExecution(step: CustomTestStep, parameters: Record<string, any>): Promise<StepExecutionResult> {
    // Simulate execution time
    await new Promise(resolve => setTimeout(resolve, Math.random() * 1000 + 500));

    // Simulate success/failure
    const success = Math.random() > 0.1; // 90% success rate

    if (success) {
      return {
        success: true,
        result: {
          stepId: step.id,
          parameters,
          executedAt: Date.now(),
          output: `Step ${step.name} executed successfully`,
        },
      };
    } else {
      return {
        success: false,
        errors: [`Step ${step.name} execution failed`],
      };
    }
  }

  /**
   * Get step by ID
   */
  getStep(stepId: string): CustomTestStep | undefined {
    return this.steps.get(stepId);
  }

  /**
   * List steps by category
   */
  getStepsByCategory(category: string): CustomTestStep[] {
    return Array.from(this.steps.values()).filter(step => step.category === category);
  }

  /**
   * Get all categories
   */
  getCategories(): string[] {
    return Array.from(this.stepCategories);
  }

  /**
   * Search steps
   */
  searchSteps(query: string): CustomTestStep[] {
    const lowerQuery = query.toLowerCase();
    
    return Array.from(this.steps.values()).filter(step => 
      step.name.toLowerCase().includes(lowerQuery) ||
      step.description.toLowerCase().includes(lowerQuery) ||
      step.category.toLowerCase().includes(lowerQuery)
    );
  }
}

// Interfaces
interface WebhookDelivery {
  id: string;
  webhookId: string;
  eventType?: string;
  payload: any;
  attempts: WebhookAttempt[];
  status: 'pending' | 'delivered' | 'failed';
  createdAt: number;
  deliveredAt?: number;
  failedAt?: number;
}

interface WebhookAttempt {
  attempt: number;
  timestamp: number;
  duration: number;
  success: boolean;
  statusCode?: number;
  response?: any;
  error?: string;
}

interface WebhookResponse {
  status: number;
  body: any;
}

interface WebhookResult {
  deliveryId: string;
  success: boolean;
  attempts: number;
  finalStatusCode?: number;
  totalDuration: number;
  error?: string;
}

interface WebhookStatistics {
  totalDeliveries: number;
  successfulDeliveries: number;
  failedDeliveries: number;
  successRate: number;
  averageAttempts: number;
  averageDuration: number;
}

interface NotificationMessage {
  subject: string;
  body: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  category?: string;
  source?: string;
  data?: Record<string, any>;
}

interface NotificationResult {
  channelId: string;
  success: boolean;
  deliveredAt?: number;
  error?: string;
  skipped?: boolean;
  reason?: string;
}

interface NotificationRecord {
  channelId: string;
  message: NotificationMessage;
  result: NotificationResult;
  timestamp: number;
}

interface NotificationStatistics {
  totalNotifications: number;
  successfulNotifications: number;
  failedNotifications: number;
  skippedNotifications: number;
  successRate: number;
}

interface PluginStatus {
  exists: boolean;
  enabled?: boolean;
  loaded?: boolean;
  version?: string;
  hooks?: number;
}

interface PluginInfo {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  enabled: boolean;
  loaded: boolean;
  hooks: number;
}

interface StepValidationResult {
  isValid: boolean;
  errors: string[];
}

interface StepExecutionResult {
  success: boolean;
  result?: any;
  errors?: string[];
}