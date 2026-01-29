// Database layer exports for AutoQA Pilot
// Production-ready database client with connection pooling and error handling

export * from './client';
export * from './types';
export * from './utils';
export * from './migrations';
export * from './seed';
export * from './encryption';
export * from './audit';

// Re-export Prisma types for convenience
export type {
  User,
  Project,
  TestScenario,
  TestRun,
  TestExecution,
  ExecutionLog,
  TestArtifact,
  HealingEvent,
  VisualBaseline,
  VisualComparison,
  CrawlResult,
  TestSchedule,
  Webhook,
  WebhookDelivery,
  Notification,
  AuditLog,
  UserSession,
  ApiKey,
  UserRole,
  TestStatus,
  TriggerType,
  LogLevel,
  ArtifactType,
  HealingStrategy,
  ComparisonStatus,
  CrawlStatus,
  DeliveryStatus,
  NotificationType,
  Prisma
} from '@prisma/client';