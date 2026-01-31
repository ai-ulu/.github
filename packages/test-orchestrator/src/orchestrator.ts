/**
 * Test Execution Orchestrator
 * **Validates: Requirements 5.3**
 * 
 * Manages test execution across Kubernetes containers with:
 * - Job queue management with Bull/Redis
 * - Real-time execution monitoring
 * - Execution state management
 * - Timeout handling and cleanup
 */

import Bull from 'bull';
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { logger } from './utils/logger';
import { ContainerManager } from './container-manager';
import { WebSocketManager } from './websocket-manager';

export interface TestExecutionRequest {
  id: string;
  projectId: string;
  scenarioId: string;
  testCode: string;
  configuration: TestConfiguration;
  userId: string;
  priority?: number;
  timeout?: number;
  metadata?: Record<string, any>;
}

export interface TestConfiguration {
  browserType: 'chromium' | 'firefox' | 'webkit';
  viewport: { width: number; height: number };
  headless: boolean;
  timeout: number;
  retries: number;
  parallel: boolean;
  environment: Record<string, string>;
}

export interface ExecutionResult {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'timeout' | 'cancelled';
  startTime?: Date;
  endTime?: Date;
  duration?: number;
  output?: string;
  error?: string;
  screenshots?: string[];
  artifacts?: string[];
  metrics?: ExecutionMetrics;
}

export interface ExecutionMetrics {
  memoryUsage: number;
  cpuUsage: number;
  networkRequests: number;
  testSteps: number;
  assertions: number;
  containerId?: string;
}

export class TestOrchestrator extends EventEmitter {
  private executionQueue: Bull.Queue;
  private containerManager: ContainerManager;
  private wsManager: WebSocketManager;
  private activeExecutions: Map<string, ExecutionResult>;
  private executionTimeouts: Map<string, NodeJS.Timeout>;

  constructor(
    redisUrl: string,
    containerManager: ContainerManager,
    wsManager: WebSocketManager
  ) {
    super();
    
    this.containerManager = containerManager;
    this.wsManager = wsManager;
    this.activeExecutions = new Map();
    this.executionTimeouts = new Map();

    // Initialize Bull queue with Redis
    this.executionQueue = new Bull('test-execution', redisUrl, {
      defaultJobOptions: {
        removeOnComplete: 100, // Keep last 100 completed jobs
        removeOnFail: 50,      // Keep last 50 failed jobs
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      },
      settings: {
        stalledInterval: 30 * 1000,    // 30 seconds
        maxStalledCount: 1,
      },
    });

    this.setupQueueProcessors();
    this.setupQueueEvents();
  }

  /**
   * Submit a test execution request
   */
  async submitExecution(request: TestExecutionRequest): Promise<string> {
    const executionId = request.id || uuidv4();
    
    logger.info('Submitting test execution', {
      executionId,
      projectId: request.projectId,
      scenarioId: request.scenarioId,
      userId: request.userId,
    });

    // Create initial execution result
    const execution: ExecutionResult = {
      id: executionId,
      status: 'pending',
      startTime: new Date(),
    };

    this.activeExecutions.set(executionId, execution);

    // Add job to queue
    await this.executionQueue.add('execute-test', {
      ...request,
      id: executionId,
    }, {
      priority: request.priority || 0,
      delay: 0,
      jobId: executionId,
    });

    // Set up timeout
    if (request.timeout) {
      const timeoutHandle = setTimeout(() => {
        this.handleExecutionTimeout(executionId);
      }, request.timeout);
      
      this.executionTimeouts.set(executionId, timeoutHandle);
    }

    // Notify clients
    this.wsManager.broadcast('execution-queued', {
      executionId,
      status: 'pending',
      queuePosition: await this.getQueuePosition(executionId),
    });

    return executionId;
  }

  /**
   * Cancel a test execution
   */
  async cancelExecution(executionId: string): Promise<boolean> {
    logger.info('Cancelling test execution', { executionId });

    const execution = this.activeExecutions.get(executionId);
    if (!execution) {
      return false;
    }

    // Cancel job in queue
    const job = await this.executionQueue.getJob(executionId);
    if (job) {
      await job.remove();
    }

    // Stop container if running
    if (execution.status === 'running') {
      await this.containerManager.stopExecution(executionId);
    }

    // Update status
    execution.status = 'cancelled';
    execution.endTime = new Date();
    execution.duration = execution.endTime.getTime() - (execution.startTime?.getTime() || 0);

    // Clear timeout
    const timeoutHandle = this.executionTimeouts.get(executionId);
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
      this.executionTimeouts.delete(executionId);
    }

    // Notify clients
    this.wsManager.broadcast('execution-cancelled', {
      executionId,
      status: 'cancelled',
    });

    this.emit('execution-cancelled', execution);
    return true;
  }

  /**
   * Get execution status
   */
  getExecutionStatus(executionId: string): ExecutionResult | null {
    return this.activeExecutions.get(executionId) || null;
  }

  /**
   * Get queue statistics
   */
  async getQueueStats(): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
  }> {
    return await this.executionQueue.getJobCounts();
  }

  /**
   * Get active executions
   */
  getActiveExecutions(): ExecutionResult[] {
    return Array.from(this.activeExecutions.values());
  }

  /**
   * Setup queue processors
   */
  private setupQueueProcessors(): void {
    // Process test execution jobs
    this.executionQueue.process('execute-test', 5, async (job) => {
      const request = job.data as TestExecutionRequest;
      return await this.processTestExecution(request, job);
    });
  }

  /**
   * Setup queue event handlers
   */
  private setupQueueEvents(): void {
    this.executionQueue.on('completed', (job, result) => {
      logger.info('Test execution completed', {
        executionId: job.id,
        duration: result.duration,
      });
    });

    this.executionQueue.on('failed', (job, err) => {
      logger.error('Test execution failed', {
        executionId: job.id,
        error: err.message,
      });
    });

    this.executionQueue.on('stalled', (job) => {
      logger.warn('Test execution stalled', {
        executionId: job.id,
      });
    });
  }

  /**
   * Process a test execution
   */
  private async processTestExecution(
    request: TestExecutionRequest,
    job: Bull.Job
  ): Promise<ExecutionResult> {
    const executionId = request.id;
    const execution = this.activeExecutions.get(executionId);
    
    if (!execution) {
      throw new Error(`Execution ${executionId} not found`);
    }

    try {
      // Update status to running
      execution.status = 'running';
      execution.startTime = new Date();

      // Notify clients
      this.wsManager.broadcast('execution-started', {
        executionId,
        status: 'running',
        startTime: execution.startTime,
      });

      // Update job progress
      await job.progress(10);

      // Start container execution
      const containerResult = await this.containerManager.executeTest(request);
      
      await job.progress(50);

      // Monitor execution progress
      await this.monitorExecution(executionId, containerResult.containerId, job);

      await job.progress(90);

      // Collect results
      const result = await this.containerManager.collectResults(containerResult.containerId);

      // Update execution result
      execution.status = result.success ? 'completed' : 'failed';
      execution.endTime = new Date();
      execution.duration = execution.endTime.getTime() - execution.startTime.getTime();
      execution.output = result.output;
      execution.error = result.error;
      execution.screenshots = result.screenshots;
      execution.artifacts = result.artifacts;
      execution.metrics = result.metrics;

      await job.progress(100);

      // Clean up container
      await this.containerManager.cleanup(containerResult.containerId);

      // Clear timeout
      const timeoutHandle = this.executionTimeouts.get(executionId);
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
        this.executionTimeouts.delete(executionId);
      }

      // Notify clients
      this.wsManager.broadcast('execution-completed', {
        executionId,
        status: execution.status,
        result: execution,
      });

      this.emit('execution-completed', execution);
      return execution;

    } catch (error) {
      logger.error('Test execution error', {
        executionId,
        error: (error as Error).message,
      });

      execution.status = 'failed';
      execution.endTime = new Date();
      execution.duration = execution.endTime.getTime() - (execution.startTime?.getTime() || 0);
      execution.error = (error as Error).message;

      // Notify clients
      this.wsManager.broadcast('execution-failed', {
        executionId,
        status: 'failed',
        error: execution.error,
      });

      this.emit('execution-failed', execution);
      throw error;
    }
  }

  /**
   * Monitor execution progress
   */
  private async monitorExecution(
    executionId: string,
    containerId: string,
    job: Bull.Job
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const progressInterval = setInterval(async () => {
        try {
          const containerStatus = await this.containerManager.getContainerStatus(containerId);
          
          if (containerStatus.status === 'completed' || containerStatus.status === 'failed') {
            clearInterval(progressInterval);
            resolve();
            return;
          }

          // Update progress based on container metrics
          const progress = Math.min(90, 50 + (containerStatus.progress || 0) * 0.4);
          await job.progress(progress);

          // Send real-time updates
          this.wsManager.broadcast('execution-progress', {
            executionId,
            progress,
            metrics: containerStatus.metrics,
            output: containerStatus.output,
          });

        } catch (error) {
          clearInterval(progressInterval);
          reject(error);
        }
      }, 2000); // Check every 2 seconds

      // Set maximum monitoring time
      setTimeout(() => {
        clearInterval(progressInterval);
        resolve();
      }, 300000); // 5 minutes max
    });
  }

  /**
   * Handle execution timeout
   */
  private async handleExecutionTimeout(executionId: string): Promise<void> {
    logger.warn('Test execution timeout', { executionId });

    const execution = this.activeExecutions.get(executionId);
    if (!execution) {
      return;
    }

    // Cancel job
    const job = await this.executionQueue.getJob(executionId);
    if (job) {
      await job.remove();
    }

    // Stop container
    if (execution.status === 'running') {
      await this.containerManager.stopExecution(executionId);
    }

    // Update status
    execution.status = 'timeout';
    execution.endTime = new Date();
    execution.duration = execution.endTime.getTime() - (execution.startTime?.getTime() || 0);
    execution.error = 'Execution timeout';

    // Notify clients
    this.wsManager.broadcast('execution-timeout', {
      executionId,
      status: 'timeout',
    });

    this.emit('execution-timeout', execution);
  }

  /**
   * Get queue position for an execution
   */
  private async getQueuePosition(executionId: string): Promise<number> {
    const waitingJobs = await this.executionQueue.getWaiting();
    const position = waitingJobs.findIndex(job => job.id === executionId);
    return position >= 0 ? position + 1 : 0;
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    logger.info('Cleaning up test orchestrator');

    // Clear all timeouts
    for (const timeout of this.executionTimeouts.values()) {
      clearTimeout(timeout);
    }
    this.executionTimeouts.clear();

    // Close queue
    await this.executionQueue.close();

    // Clean up active executions
    this.activeExecutions.clear();
  }
}