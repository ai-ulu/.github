/**
 * Schedule Management System
 * **Validates: Requirements 8.1, 8.2, 8.5**
 * 
 * Manages test schedules with:
 * - CRUD operations for schedules
 * - Schedule history tracking
 * - Timezone handling and DST support
 * - Schedule validation and conflict detection
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import moment from 'moment-timezone';
import { 
  ScheduleConfig, 
  ScheduleExecution, 
  ScheduleHistory, 
  ScheduleStats,
  CronValidationResult 
} from './types';
import { CronValidator } from './cron-validator';
import { logger } from './utils/logger';

export interface ScheduleStorage {
  saveSchedule(schedule: ScheduleConfig): Promise<void>;
  getSchedule(id: string): Promise<ScheduleConfig | null>;
  getAllSchedules(userId?: string): Promise<ScheduleConfig[]>;
  updateSchedule(id: string, updates: Partial<ScheduleConfig>): Promise<void>;
  deleteSchedule(id: string): Promise<void>;
  getActiveSchedules(): Promise<ScheduleConfig[]>;
  saveExecution(execution: ScheduleExecution): Promise<void>;
  getExecutionHistory(scheduleId: string, limit?: number): Promise<ScheduleExecution[]>;
  getScheduleStats(scheduleId?: string): Promise<ScheduleStats>;
}

export class ScheduleManager extends EventEmitter {
  private storage: ScheduleStorage;
  private schedules: Map<string, ScheduleConfig>;
  private executionHistory: Map<string, ScheduleExecution[]>;

  constructor(storage: ScheduleStorage) {
    super();
    this.storage = storage;
    this.schedules = new Map();
    this.executionHistory = new Map();
  }

  /**
   * Initialize the schedule manager
   */
  async initialize(): Promise<void> {
    logger.info('Initializing schedule manager');
    
    try {
      // Load all schedules from storage
      const schedules = await this.storage.getAllSchedules();
      
      for (const schedule of schedules) {
        this.schedules.set(schedule.id, schedule);
        
        // Update next execution time
        await this.updateNextExecutionTime(schedule.id);
      }

      logger.info('Schedule manager initialized', {
        totalSchedules: schedules.length,
        activeSchedules: schedules.filter(s => s.isActive).length,
      });

    } catch (error) {
      logger.error('Failed to initialize schedule manager', {
        error: (error as Error).message,
      });
      throw error;
    }
  }

  /**
   * Create a new schedule
   */
  async createSchedule(config: Omit<ScheduleConfig, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    logger.info('Creating new schedule', {
      name: config.name,
      cronExpression: config.cronExpression,
      timezone: config.timezone,
      userId: config.userId,
    });

    // Validate cron expression
    const validation = CronValidator.validate(config.cronExpression, config.timezone, {
      validateFuture: true,
      maxNextExecutions: 1,
    });

    if (!validation.isValid) {
      throw new Error(`Invalid cron expression: ${validation.error}`);
    }

    // Validate timezone
    if (!CronValidator.validateTimezone(config.timezone)) {
      throw new Error(`Invalid timezone: ${config.timezone}`);
    }

    // Create schedule
    const schedule: ScheduleConfig = {
      ...config,
      id: uuidv4(),
      createdAt: new Date(),
      updatedAt: new Date(),
      nextExecutionAt: validation.nextExecutions?.[0],
    };

    // Save to storage
    await this.storage.saveSchedule(schedule);
    
    // Cache in memory
    this.schedules.set(schedule.id, schedule);

    logger.info('Schedule created successfully', {
      scheduleId: schedule.id,
      nextExecution: schedule.nextExecutionAt,
    });

    this.emit('schedule-created', schedule);
    return schedule.id;
  }

  /**
   * Update an existing schedule
   */
  async updateSchedule(
    id: string, 
    updates: Partial<Omit<ScheduleConfig, 'id' | 'createdAt' | 'updatedAt'>>
  ): Promise<void> {
    logger.info('Updating schedule', { scheduleId: id, updates });

    const existingSchedule = this.schedules.get(id);
    if (!existingSchedule) {
      throw new Error(`Schedule not found: ${id}`);
    }

    // Validate cron expression if updated
    if (updates.cronExpression || updates.timezone) {
      const cronExpression = updates.cronExpression || existingSchedule.cronExpression;
      const timezone = updates.timezone || existingSchedule.timezone;

      const validation = CronValidator.validate(cronExpression, timezone, {
        validateFuture: true,
        maxNextExecutions: 1,
      });

      if (!validation.isValid) {
        throw new Error(`Invalid cron expression: ${validation.error}`);
      }

      // Update next execution time
      updates.nextExecutionAt = validation.nextExecutions?.[0];
    }

    // Validate timezone if updated
    if (updates.timezone && !CronValidator.validateTimezone(updates.timezone)) {
      throw new Error(`Invalid timezone: ${updates.timezone}`);
    }

    // Update schedule
    const updatedSchedule: ScheduleConfig = {
      ...existingSchedule,
      ...updates,
      updatedAt: new Date(),
    };

    // Save to storage
    await this.storage.updateSchedule(id, updatedSchedule);
    
    // Update cache
    this.schedules.set(id, updatedSchedule);

    logger.info('Schedule updated successfully', {
      scheduleId: id,
      nextExecution: updatedSchedule.nextExecutionAt,
    });

    this.emit('schedule-updated', updatedSchedule);
  }

  /**
   * Delete a schedule
   */
  async deleteSchedule(id: string): Promise<void> {
    logger.info('Deleting schedule', { scheduleId: id });

    const schedule = this.schedules.get(id);
    if (!schedule) {
      throw new Error(`Schedule not found: ${id}`);
    }

    // Remove from storage
    await this.storage.deleteSchedule(id);
    
    // Remove from cache
    this.schedules.delete(id);
    this.executionHistory.delete(id);

    logger.info('Schedule deleted successfully', { scheduleId: id });

    this.emit('schedule-deleted', schedule);
  }

  /**
   * Get a schedule by ID
   */
  async getSchedule(id: string): Promise<ScheduleConfig | null> {
    let schedule = this.schedules.get(id);
    
    if (!schedule) {
      // Try loading from storage
      schedule = await this.storage.getSchedule(id);
      if (schedule) {
        this.schedules.set(id, schedule);
      }
    }

    return schedule || null;
  }

  /**
   * Get all schedules for a user
   */
  async getUserSchedules(userId: string): Promise<ScheduleConfig[]> {
    const allSchedules = Array.from(this.schedules.values());
    return allSchedules.filter(schedule => schedule.userId === userId);
  }

  /**
   * Get all active schedules
   */
  async getActiveSchedules(): Promise<ScheduleConfig[]> {
    const allSchedules = Array.from(this.schedules.values());
    return allSchedules.filter(schedule => schedule.isActive);
  }

  /**
   * Get schedules due for execution
   */
  async getDueSchedules(currentTime?: Date): Promise<ScheduleConfig[]> {
    const now = currentTime || new Date();
    const activeSchedules = await this.getActiveSchedules();

    return activeSchedules.filter(schedule => {
      if (!schedule.nextExecutionAt) {
        return false;
      }
      
      // Check if execution time has passed (with 1 minute tolerance)
      const executionTime = new Date(schedule.nextExecutionAt);
      const tolerance = 60 * 1000; // 1 minute in milliseconds
      
      return now.getTime() >= (executionTime.getTime() - tolerance);
    });
  }

  /**
   * Record a schedule execution
   */
  async recordExecution(execution: ScheduleExecution): Promise<void> {
    logger.info('Recording schedule execution', {
      scheduleId: execution.scheduleId,
      executionId: execution.executionId,
      status: execution.status,
    });

    // Save to storage
    await this.storage.saveExecution(execution);

    // Update cache
    const history = this.executionHistory.get(execution.scheduleId) || [];
    history.unshift(execution);
    
    // Keep only last 100 executions in memory
    if (history.length > 100) {
      history.splice(100);
    }
    
    this.executionHistory.set(execution.scheduleId, history);

    // Update schedule's last execution time
    const schedule = this.schedules.get(execution.scheduleId);
    if (schedule) {
      schedule.lastExecutedAt = execution.startTime;
      await this.updateNextExecutionTime(execution.scheduleId);
    }

    this.emit('execution-recorded', execution);
  }

  /**
   * Get execution history for a schedule
   */
  async getExecutionHistory(scheduleId: string, limit: number = 50): Promise<ScheduleExecution[]> {
    // Try cache first
    let history = this.executionHistory.get(scheduleId);
    
    if (!history || history.length === 0) {
      // Load from storage
      history = await this.storage.getExecutionHistory(scheduleId, limit);
      this.executionHistory.set(scheduleId, history);
    }

    return history.slice(0, limit);
  }

  /**
   * Get schedule statistics
   */
  async getScheduleStats(scheduleId?: string): Promise<ScheduleStats> {
    return await this.storage.getScheduleStats(scheduleId);
  }

  /**
   * Get schedule history with analytics
   */
  async getScheduleHistory(scheduleId: string): Promise<ScheduleHistory> {
    const executions = await this.getExecutionHistory(scheduleId);
    
    const totalExecutions = executions.length;
    const successfulExecutions = executions.filter(e => e.status === 'completed').length;
    const successRate = totalExecutions > 0 ? (successfulExecutions / totalExecutions) * 100 : 0;
    
    const completedExecutions = executions.filter(e => e.duration);
    const averageDuration = completedExecutions.length > 0 
      ? completedExecutions.reduce((sum, e) => sum + (e.duration || 0), 0) / completedExecutions.length
      : 0;

    const lastFailure = executions
      .filter(e => e.status === 'failed')
      .sort((a, b) => b.startTime.getTime() - a.startTime.getTime())[0];

    return {
      scheduleId,
      executions,
      totalExecutions,
      successRate,
      averageDuration,
      lastFailure: lastFailure ? {
        date: lastFailure.startTime,
        error: lastFailure.error || 'Unknown error',
      } : undefined,
    };
  }

  /**
   * Enable/disable a schedule
   */
  async toggleSchedule(id: string, isActive: boolean): Promise<void> {
    logger.info('Toggling schedule', { scheduleId: id, isActive });

    await this.updateSchedule(id, { isActive });

    const schedule = this.schedules.get(id);
    if (schedule) {
      this.emit(isActive ? 'schedule-enabled' : 'schedule-disabled', schedule);
    }
  }

  /**
   * Update next execution time for a schedule
   */
  private async updateNextExecutionTime(scheduleId: string): Promise<void> {
    const schedule = this.schedules.get(scheduleId);
    if (!schedule || !schedule.isActive) {
      return;
    }

    const nextExecution = CronValidator.getNextExecution(
      schedule.cronExpression,
      schedule.timezone
    );

    if (nextExecution) {
      schedule.nextExecutionAt = nextExecution;
      await this.storage.updateSchedule(scheduleId, { nextExecutionAt: nextExecution });
      
      logger.debug('Updated next execution time', {
        scheduleId,
        nextExecution: nextExecution.toISOString(),
      });
    }
  }

  /**
   * Validate schedule configuration
   */
  validateScheduleConfig(config: Partial<ScheduleConfig>): CronValidationResult {
    if (!config.cronExpression) {
      return {
        isValid: false,
        error: 'Cron expression is required',
      };
    }

    if (!config.timezone) {
      return {
        isValid: false,
        error: 'Timezone is required',
      };
    }

    return CronValidator.validate(config.cronExpression, config.timezone, {
      validateFuture: true,
      maxNextExecutions: 5,
    });
  }

  /**
   * Get upcoming executions across all schedules
   */
  async getUpcomingExecutions(hours: number = 24): Promise<Array<{
    schedule: ScheduleConfig;
    nextExecution: Date;
  }>> {
    const activeSchedules = await this.getActiveSchedules();
    const now = new Date();
    const endTime = new Date(now.getTime() + (hours * 60 * 60 * 1000));

    const upcoming: Array<{ schedule: ScheduleConfig; nextExecution: Date }> = [];

    for (const schedule of activeSchedules) {
      const executions = CronValidator.getNextExecutions(
        schedule.cronExpression,
        10, // Get next 10 executions
        schedule.timezone,
        now
      );

      for (const execution of executions) {
        if (execution <= endTime) {
          upcoming.push({
            schedule,
            nextExecution: execution,
          });
        }
      }
    }

    // Sort by execution time
    upcoming.sort((a, b) => a.nextExecution.getTime() - b.nextExecution.getTime());

    return upcoming;
  }

  /**
   * Cleanup old execution history
   */
  async cleanupHistory(retentionDays: number = 30): Promise<void> {
    logger.info('Cleaning up execution history', { retentionDays });

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    let cleanedCount = 0;

    for (const [scheduleId, history] of this.executionHistory.entries()) {
      const filteredHistory = history.filter(execution => 
        execution.startTime > cutoffDate
      );

      if (filteredHistory.length !== history.length) {
        this.executionHistory.set(scheduleId, filteredHistory);
        cleanedCount += (history.length - filteredHistory.length);
      }
    }

    logger.info('Execution history cleanup completed', {
      cleanedExecutions: cleanedCount,
    });
  }
}