// Audit middleware for Prisma client
// Automatically logs all database operations for security compliance

import { Prisma } from '@prisma/client';

export interface AuditContext {
  userId?: string;
  ipAddress?: string;
  userAgent?: string;
  correlationId?: string;
}

// Thread-local storage for audit context
let auditContext: AuditContext = {};

export function setAuditContext(context: AuditContext): void {
  auditContext = { ...context };
}

export function getAuditContext(): AuditContext {
  return { ...auditContext };
}

export function clearAuditContext(): void {
  auditContext = {};
}

// Create audit middleware for Prisma
export function createAuditMiddleware(): Prisma.Middleware {
  return async (params, next) => {
    const start = Date.now();
    
    try {
      const result = await next(params);
      const duration = Date.now() - start;
      
      // Log the operation for audit purposes
      await logAuditEvent({
        tableName: params.model || 'unknown',
        operation: params.action.toUpperCase(),
        recordId: extractRecordId(params, result),
        oldValues: extractOldValues(params),
        newValues: extractNewValues(params, result),
        duration,
        success: true,
      });
      
      return result;
    } catch (error) {
      const duration = Date.now() - start;
      
      // Log failed operations
      await logAuditEvent({
        tableName: params.model || 'unknown',
        operation: params.action.toUpperCase(),
        recordId: extractRecordId(params),
        oldValues: extractOldValues(params),
        newValues: null,
        duration,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      throw error;
    }
  };
}

interface AuditEventData {
  tableName: string;
  operation: string;
  recordId?: string;
  oldValues?: any;
  newValues?: any;
  duration: number;
  success: boolean;
  error?: string;
}

async function logAuditEvent(data: AuditEventData): Promise<void> {
  try {
    const context = getAuditContext();
    
    // Only log operations on auditable tables
    if (!isAuditableTable(data.tableName)) {
      return;
    }
    
    // Create audit log entry
    const auditEntry = {
      tableName: data.tableName,
      operation: data.operation,
      recordId: data.recordId || null,
      oldValues: data.oldValues ? JSON.stringify(data.oldValues) : null,
      newValues: data.newValues ? JSON.stringify(data.newValues) : null,
      userId: context.userId || null,
      ipAddress: context.ipAddress || null,
      userAgent: context.userAgent || null,
      correlationId: context.correlationId || null,
      metadata: {
        duration: data.duration,
        success: data.success,
        error: data.error,
        timestamp: new Date().toISOString(),
      },
    };
    
    // In a real implementation, this would use a separate database connection
    // to avoid infinite recursion when logging audit events
    console.log('AUDIT:', JSON.stringify(auditEntry));
    
    // TODO: Implement actual audit log storage
    // This should use a separate Prisma client or direct database connection
    // to avoid triggering the audit middleware recursively
    
  } catch (error) {
    // Never let audit logging break the main operation
    console.error('Failed to log audit event:', error);
  }
}

function isAuditableTable(tableName: string): boolean {
  // Define which tables should be audited
  const auditableTables = [
    'User',
    'Project',
    'TestScenario',
    'TestRun',
    'TestExecution',
    'ApiKey',
    'UserSession',
    'Webhook',
    'TestSchedule',
  ];
  
  return auditableTables.includes(tableName);
}

function extractRecordId(params: Prisma.MiddlewareParams, result?: any): string | undefined {
  // Extract record ID from various operation types
  if (params.action === 'create' && result?.id) {
    return result.id;
  }
  
  if (params.action === 'update' || params.action === 'delete') {
    if (params.args?.where?.id) {
      return params.args.where.id;
    }
  }
  
  if (params.action === 'findUnique' && params.args?.where?.id) {
    return params.args.where.id;
  }
  
  return undefined;
}

function extractOldValues(params: Prisma.MiddlewareParams): any {
  // For update and delete operations, we would need to fetch the old values
  // This is a simplified implementation
  if (params.action === 'update' || params.action === 'delete') {
    // In a real implementation, we would fetch the current record before the operation
    return null;
  }
  
  return null;
}

function extractNewValues(params: Prisma.MiddlewareParams, result?: any): any {
  if (params.action === 'create' || params.action === 'update') {
    return params.args?.data || result;
  }
  
  return null;
}

// Utility functions for audit context management
export class AuditContextManager {
  private static contexts = new Map<string, AuditContext>();
  
  static setContext(requestId: string, context: AuditContext): void {
    this.contexts.set(requestId, context);
  }
  
  static getContext(requestId: string): AuditContext | undefined {
    return this.contexts.get(requestId);
  }
  
  static clearContext(requestId: string): void {
    this.contexts.delete(requestId);
  }
  
  static clearAllContexts(): void {
    this.contexts.clear();
  }
}

// Express middleware for setting audit context
export function auditMiddleware(req: any, res: any, next: any): void {
  const context: AuditContext = {
    userId: req.user?.id,
    ipAddress: req.ip || req.connection.remoteAddress,
    userAgent: req.get('User-Agent'),
    correlationId: req.headers['x-correlation-id'] || generateCorrelationId(),
  };
  
  setAuditContext(context);
  
  // Clear context after response
  res.on('finish', () => {
    clearAuditContext();
  });
  
  next();
}

function generateCorrelationId(): string {
  return `audit-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Audit query builder for compliance reporting
export class AuditQueryBuilder {
  static async getAuditTrail(options: {
    tableName?: string;
    operation?: string;
    userId?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
  }) {
    // This would query the audit_log table
    // Implementation depends on the actual audit storage mechanism
    return [];
  }
  
  static async getUserActivity(userId: string, options?: {
    startDate?: Date;
    endDate?: Date;
    limit?: number;
  }) {
    // Query user-specific audit events
    return [];
  }
  
  static async getDataAccessLog(recordId: string, tableName: string) {
    // Query all access to a specific record
    return [];
  }
}

// GDPR compliance utilities
export class GDPRCompliance {
  static async exportUserData(userId: string) {
    // Export all user data for GDPR compliance
    return {
      user: null,
      projects: [],
      testRuns: [],
      auditLogs: [],
    };
  }
  
  static async deleteUserData(userId: string) {
    // Implement "right to be forgotten"
    // This should be done in a transaction with proper cascading
    return {
      deletedRecords: 0,
      anonymizedRecords: 0,
    };
  }
  
  static async anonymizeUserData(userId: string) {
    // Anonymize user data while preserving analytics
    return {
      anonymizedRecords: 0,
    };
  }
}