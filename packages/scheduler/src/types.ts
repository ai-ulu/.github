/**
 * Type definitions for the AutoQA Scheduler system
 * **Validates: Requirements 8.1, 8.2, 8.5**
 */

export interface ScheduleConfig {
  id: string;
  name: string;
  description?: string;
  cronExpression: string;
  timezone: string;
  projectId: string;
  scenarioIds: string[];
  userId: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  lastExecutedAt?: Date;
  nextExecutionAt?: Date;
  metadata?: Record<string, any>;
}

export interface ScheduleExecution {
  id: string;
  scheduleId: string;
  executionId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  startTime: Date;
  endTime?: Date;
  duration?: number;
  error?: string;
  results?: ExecutionResults;
}

export interface ExecutionResults {
  totalTests: number;
  passedTests: number;
  failedTests: number;
  skippedTests: number;
  artifacts: string[];
  reportUrl?: string;
}

export interface CronValidationResult {
  isValid: boolean;
  error?: string;
  nextExecutions?: Date[];
  description?: string;
}

export interface SchedulerConfig {
  redisUrl: string;
  timezone: string;
  maxConcurrentSchedules: number;
  executionTimeout: number;
  retryAttempts: number;
  cleanupInterval: number;
}

export interface ScheduleStats {
  totalSchedules: number;
  activeSchedules: number;
  executionsToday: number;
  successRate: number;
  averageExecutionTime: number;
}

export interface NotificationConfig {
  enabled: boolean;
  channels: NotificationChannel[];
  templates: NotificationTemplates;
}

export interface NotificationChannel {
  type: 'slack' | 'discord' | 'email' | 'webhook';
  name: string;
  config: SlackConfig | DiscordConfig | EmailConfig | WebhookConfig;
  events: NotificationEvent[];
}

export interface SlackConfig {
  webhookUrl: string;
  channel?: string;
  username?: string;
  iconEmoji?: string;
}

export interface DiscordConfig {
  webhookUrl: string;
  username?: string;
  avatarUrl?: string;
}

export interface EmailConfig {
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  smtpPassword: string;
  fromEmail: string;
  toEmails: string[];
}

export interface WebhookConfig {
  url: string;
  method: 'POST' | 'PUT';
  headers?: Record<string, string>;
  authentication?: {
    type: 'bearer' | 'basic' | 'api-key';
    token?: string;
    username?: string;
    password?: string;
    apiKey?: string;
    apiKeyHeader?: string;
  };
}

export interface NotificationTemplates {
  scheduleStarted: string;
  scheduleCompleted: string;
  scheduleFailed: string;
  criticalFailure: string;
}

export type NotificationEvent = 
  | 'schedule-started'
  | 'schedule-completed' 
  | 'schedule-failed'
  | 'critical-failure'
  | 'schedule-disabled'
  | 'schedule-created';

export interface ScheduleHistory {
  scheduleId: string;
  executions: ScheduleExecution[];
  totalExecutions: number;
  successRate: number;
  averageDuration: number;
  lastFailure?: {
    date: Date;
    error: string;
  };
}