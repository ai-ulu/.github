/**
 * Healing Logger
 * Comprehensive logging system for self-healing events and debugging
 */

import {
  HealingLogger as IHealingLogger,
  HealingAttempt,
  HealingResult,
  HealingEvent,
  HealingContext
} from '../types';

export class HealingLogger implements IHealingLogger {
  private history: HealingEvent[] = [];
  private maxHistorySize: number;
  private enableConsoleLogging: boolean;

  constructor(options?: { maxHistorySize?: number; enableConsoleLogging?: boolean }) {
    this.maxHistorySize = options?.maxHistorySize || 1000;
    this.enableConsoleLogging = options?.enableConsoleLogging ?? true;
  }

  /**
   * Log a healing attempt
   */
  logAttempt(attempt: HealingAttempt): void {
    if (this.enableConsoleLogging) {
      const status = attempt.success ? '✅' : '❌';
      const confidence = attempt.success ? `(${(attempt.confidence * 100).toFixed(1)}%)` : '';
      
      console.log(
        `${status} Healing attempt: ${attempt.strategy} - ${attempt.selector} ${confidence}`,
        attempt.error ? `Error: ${attempt.error}` : ''
      );
    }
  }

  /**
   * Log a healing result
   */
  logResult(result: HealingResult): void {
    const event: HealingEvent = {
      id: this.generateEventId(),
      scenarioId: '', // Will be set by the calling context
      elementType: 'unknown', // Will be set by the calling context
      oldSelector: '', // Will be set by the calling context
      newSelector: result.newSelector,
      strategy: result.strategy,
      success: result.success,
      confidence: result.confidence,
      attempts: result.metadata?.attempts || [],
      metadata: result.metadata,
      timestamp: new Date()
    };

    this.addToHistory(event);

    if (this.enableConsoleLogging) {
      const status = result.success ? '🎉 SUCCESS' : '💥 FAILED';
      const selector = result.newSelector ? `New selector: ${result.newSelector}` : 'No new selector found';
      const confidence = result.success ? `Confidence: ${(result.confidence * 100).toFixed(1)}%` : '';
      const executionTime = result.metadata?.totalExecutionTime ? `Time: ${result.metadata.totalExecutionTime}ms` : '';
      
      console.log(`${status} - ${result.strategy}`);
      console.log(`  ${selector}`);
      if (confidence) console.log(`  ${confidence}`);
      if (executionTime) console.log(`  ${executionTime}`);
      if (result.error) console.log(`  Error: ${result.error}`);
    }
  }

  /**
   * Log an error during healing
   */
  logError(error: Error, context: HealingContext): void {
    if (this.enableConsoleLogging) {
      console.error('🚨 Healing Error:', {
        message: error.message,
        selector: context.originalSelector,
        elementType: context.elementType,
        stack: error.stack
      });
    }

    // Create error event
    const event: HealingEvent = {
      id: this.generateEventId(),
      scenarioId: '', // Will be set by the calling context
      elementType: context.elementType || 'unknown',
      oldSelector: context.originalSelector,
      newSelector: undefined,
      strategy: context.metadata?.lastStrategy || 'UNKNOWN' as any,
      success: false,
      confidence: 0,
      attempts: [],
      metadata: {
        error: error.message,
        stack: error.stack,
        context: {
          hasScreenshot: !!context.screenshot,
          hasDomSnapshot: !!context.domSnapshot,
          hasLastKnownLocation: !!context.lastKnownLocation
        }
      },
      timestamp: new Date()
    };

    this.addToHistory(event);
  }

  /**
   * Get healing history
   */
  getHistory(): HealingEvent[] {
    return [...this.history];
  }

  /**
   * Get history filtered by criteria
   */
  getFilteredHistory(filter: {
    scenarioId?: string;
    success?: boolean;
    strategy?: string;
    fromDate?: Date;
    toDate?: Date;
  }): HealingEvent[] {
    return this.history.filter(event => {
      if (filter.scenarioId && event.scenarioId !== filter.scenarioId) return false;
      if (filter.success !== undefined && event.success !== filter.success) return false;
      if (filter.strategy && event.strategy !== filter.strategy) return false;
      if (filter.fromDate && event.timestamp < filter.fromDate) return false;
      if (filter.toDate && event.timestamp > filter.toDate) return false;
      return true;
    });
  }

  /**
   * Get success rate statistics
   */
  getSuccessRateStats(): {
    overall: number;
    byStrategy: Record<string, number>;
    byElementType: Record<string, number>;
  } {
    if (this.history.length === 0) {
      return { overall: 0, byStrategy: {}, byElementType: {} };
    }

    const successful = this.history.filter(e => e.success).length;
    const overall = successful / this.history.length;

    // By strategy
    const byStrategy: Record<string, number> = {};
    const strategyGroups = this.groupBy(this.history, 'strategy');
    for (const [strategy, events] of Object.entries(strategyGroups)) {
      const successCount = events.filter(e => e.success).length;
      byStrategy[strategy] = successCount / events.length;
    }

    // By element type
    const byElementType: Record<string, number> = {};
    const elementGroups = this.groupBy(this.history, 'elementType');
    for (const [elementType, events] of Object.entries(elementGroups)) {
      const successCount = events.filter(e => e.success).length;
      byElementType[elementType] = successCount / events.length;
    }

    return { overall, byStrategy, byElementType };
  }

  /**
   * Clear history
   */
  clearHistory(): void {
    this.history = [];
  }

  /**
   * Export history as JSON
   */
  exportHistory(): string {
    return JSON.stringify(this.history, null, 2);
  }

  /**
   * Import history from JSON
   */
  importHistory(jsonData: string): void {
    try {
      const imported = JSON.parse(jsonData) as HealingEvent[];
      this.history = imported.map(event => ({
        ...event,
        timestamp: new Date(event.timestamp)
      }));
      
      // Trim to max size
      if (this.history.length > this.maxHistorySize) {
        this.history = this.history.slice(-this.maxHistorySize);
      }
    } catch (error) {
      console.error('Failed to import healing history:', error);
    }
  }

  /**
   * Add event to history with size management
   */
  private addToHistory(event: HealingEvent): void {
    this.history.push(event);
    
    // Trim history if it exceeds max size
    if (this.history.length > this.maxHistorySize) {
      this.history = this.history.slice(-this.maxHistorySize);
    }
  }

  /**
   * Generate unique event ID
   */
  private generateEventId(): string {
    return `healing_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Group array by property
   */
  private groupBy<T>(array: T[], key: keyof T): Record<string, T[]> {
    return array.reduce((groups, item) => {
      const groupKey = String(item[key]);
      if (!groups[groupKey]) {
        groups[groupKey] = [];
      }
      groups[groupKey].push(item);
      return groups;
    }, {} as Record<string, T[]>);
  }
}