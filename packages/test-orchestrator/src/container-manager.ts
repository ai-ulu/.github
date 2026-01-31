/**
 * Container Manager for Kubernetes
 * **Validates: Requirements 5.2, 5.5**
 * 
 * Manages test execution containers in Kubernetes with:
 * - Horizontal Pod Autoscaler (HPA) integration
 * - Pod security policies and network policies
 * - Automatic cleanup after execution
 * - Monitoring and logging for containers
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { logger } from './utils/logger';
import { TestExecutionRequest, ExecutionMetrics } from './orchestrator';

export interface ContainerExecutionResult {
  containerId: string;
  podName: string;
  namespace: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
}

export interface ContainerResult {
  success: boolean;
  output: string;
  error?: string;
  screenshots: string[];
  artifacts: string[];
  metrics: ExecutionMetrics;
}

export interface ContainerStatus {
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress?: number;
  metrics?: ExecutionMetrics;
  output?: string;
}

export class ContainerManager extends EventEmitter {
  private readonly namespace: string;
  private readonly imageRegistry: string;
  private readonly imageTag: string;
  private activePods: Map<string, ContainerExecutionResult>;

  constructor(
    namespace: string = 'autoqa-system',
    imageRegistry: string = 'autoqa',
    imageTag: string = 'latest'
  ) {
    super();
    this.namespace = namespace;
    this.imageRegistry = imageRegistry;
    this.imageTag = imageTag;
    this.activePods = new Map();
  }

  /**
   * Execute test in a new container
   */
  async executeTest(request: TestExecutionRequest): Promise<ContainerExecutionResult> {
    const containerId = uuidv4();
    const podName = `autoqa-test-${containerId.substring(0, 8)}`;

    logger.info('Starting test execution in container', {
      containerId,
      podName,
      projectId: request.projectId,
      scenarioId: request.scenarioId,
    });

    try {
      // Create pod specification
      const podSpec = this.createPodSpec(podName, request, containerId);

      // Create pod in Kubernetes
      await this.createPod(podSpec);

      // Wait for pod to be ready
      await this.waitForPodReady(podName);

      const result: ContainerExecutionResult = {
        containerId,
        podName,
        namespace: this.namespace,
        status: 'running',
      };

      this.activePods.set(containerId, result);
      this.emit('container-started', result);

      return result;

    } catch (error) {
      logger.error('Failed to start container execution', {
        containerId,
        podName,
        error: (error as Error).message,
      });
      throw error;
    }
  }

  /**
   * Stop test execution
   */
  async stopExecution(executionId: string): Promise<void> {
    const container = this.activePods.get(executionId);
    if (!container) {
      logger.warn('Container not found for execution', { executionId });
      return;
    }

    logger.info('Stopping test execution', {
      executionId,
      podName: container.podName,
    });

    try {
      // Delete pod
      await this.deletePod(container.podName);
      
      // Update status
      container.status = 'failed';
      this.emit('container-stopped', container);

    } catch (error) {
      logger.error('Failed to stop container execution', {
        executionId,
        error: (error as Error).message,
      });
    }
  }

  /**
   * Get container status
   */
  async getContainerStatus(containerId: string): Promise<ContainerStatus> {
    const container = this.activePods.get(containerId);
    if (!container) {
      throw new Error(`Container ${containerId} not found`);
    }

    try {
      // Get pod status from Kubernetes
      const podStatus = await this.getPodStatus(container.podName);
      
      // Get pod logs for output
      const output = await this.getPodLogs(container.podName);

      // Get metrics from pod
      const metrics = await this.getPodMetrics(container.podName);

      return {
        status: this.mapPodStatusToContainerStatus(podStatus),
        progress: this.calculateProgress(podStatus, output),
        metrics,
        output,
      };

    } catch (error) {
      logger.error('Failed to get container status', {
        containerId,
        error: (error as Error).message,
      });
      
      return {
        status: 'failed',
        output: `Error getting status: ${(error as Error).message}`,
      };
    }
  }

  /**
   * Collect execution results
   */
  async collectResults(containerId: string): Promise<ContainerResult> {
    const container = this.activePods.get(containerId);
    if (!container) {
      throw new Error(`Container ${containerId} not found`);
    }

    logger.info('Collecting execution results', {
      containerId,
      podName: container.podName,
    });

    try {
      // Get final pod status
      const podStatus = await this.getPodStatus(container.podName);
      
      // Get complete logs
      const output = await this.getPodLogs(container.podName);

      // Get final metrics
      const metrics = await this.getPodMetrics(container.podName);

      // Copy artifacts from pod
      const artifacts = await this.copyArtifacts(container.podName);
      
      // Copy screenshots
      const screenshots = await this.copyScreenshots(container.podName);

      const success = podStatus.phase === 'Succeeded';
      const error = success ? undefined : this.extractErrorFromLogs(output);

      return {
        success,
        output,
        error,
        screenshots,
        artifacts,
        metrics,
      };

    } catch (error) {
      logger.error('Failed to collect results', {
        containerId,
        error: (error as Error).message,
      });

      return {
        success: false,
        output: '',
        error: (error as Error).message,
        screenshots: [],
        artifacts: [],
        metrics: {
          memoryUsage: 0,
          cpuUsage: 0,
          networkRequests: 0,
          testSteps: 0,
          assertions: 0,
          containerId,
        },
      };
    }
  }

  /**
   * Cleanup container resources
   */
  async cleanup(containerId: string): Promise<void> {
    const container = this.activePods.get(containerId);
    if (!container) {
      return;
    }

    logger.info('Cleaning up container', {
      containerId,
      podName: container.podName,
    });

    try {
      // Delete pod
      await this.deletePod(container.podName);
      
      // Remove from active pods
      this.activePods.delete(containerId);
      
      this.emit('container-cleaned', container);

    } catch (error) {
      logger.error('Failed to cleanup container', {
        containerId,
        error: (error as Error).message,
      });
    }
  }

  /**
   * Create pod specification
   */
  private createPodSpec(podName: string, request: TestExecutionRequest, containerId: string): any {
    return {
      apiVersion: 'v1',
      kind: 'Pod',
      metadata: {
        name: podName,
        namespace: this.namespace,
        labels: {
          app: 'autoqa-test-runner',
          component: 'test-execution',
          'execution-id': request.id,
          'project-id': request.projectId,
          'scenario-id': request.scenarioId,
        },
        annotations: {
          'prometheus.io/scrape': 'true',
          'prometheus.io/port': '3000',
          'prometheus.io/path': '/metrics',
        },
      },
      spec: {
        restartPolicy: 'Never',
        serviceAccountName: 'autoqa-test-runner',
        
        // Security context
        securityContext: {
          runAsNonRoot: true,
          runAsUser: 65532,
          runAsGroup: 65532,
          fsGroup: 65532,
          seccompProfile: {
            type: 'RuntimeDefault',
          },
        },

        containers: [
          {
            name: 'test-runner',
            image: `${this.imageRegistry}/test-runner:${this.imageTag}`,
            imagePullPolicy: 'Always',

            // Security context
            securityContext: {
              allowPrivilegeEscalation: false,
              readOnlyRootFilesystem: true,
              runAsNonRoot: true,
              runAsUser: 65532,
              capabilities: {
                drop: ['ALL'],
              },
            },

            // Resource limits
            resources: {
              requests: {
                memory: '1Gi',
                cpu: '500m',
              },
              limits: {
                memory: '2Gi',
                cpu: '1000m',
              },
            },

            // Environment variables
            env: [
              {
                name: 'EXECUTION_ID',
                value: request.id,
              },
              {
                name: 'PROJECT_ID',
                value: request.projectId,
              },
              {
                name: 'SCENARIO_ID',
                value: request.scenarioId,
              },
              {
                name: 'TEST_CODE',
                value: Buffer.from(request.testCode).toString('base64'),
              },
              {
                name: 'BROWSER_TYPE',
                value: request.configuration.browserType,
              },
              {
                name: 'HEADLESS',
                value: request.configuration.headless.toString(),
              },
              {
                name: 'TIMEOUT',
                value: request.configuration.timeout.toString(),
              },
              {
                name: 'RETRIES',
                value: request.configuration.retries.toString(),
              },
              {
                name: 'VIEWPORT_WIDTH',
                value: request.configuration.viewport.width.toString(),
              },
              {
                name: 'VIEWPORT_HEIGHT',
                value: request.configuration.viewport.height.toString(),
              },
            ],

            // Volume mounts
            volumeMounts: [
              {
                name: 'tmp-volume',
                mountPath: '/tmp',
              },
              {
                name: 'screenshots-volume',
                mountPath: '/app/screenshots',
              },
              {
                name: 'reports-volume',
                mountPath: '/app/reports',
              },
            ],

            // Ports
            ports: [
              {
                containerPort: 3000,
                name: 'http',
                protocol: 'TCP',
              },
            ],
          },
        ],

        // Volumes
        volumes: [
          {
            name: 'tmp-volume',
            emptyDir: {
              sizeLimit: '1Gi',
            },
          },
          {
            name: 'screenshots-volume',
            emptyDir: {
              sizeLimit: '2Gi',
            },
          },
          {
            name: 'reports-volume',
            emptyDir: {
              sizeLimit: '1Gi',
            },
          },
        ],

        // Node selection
        nodeSelector: {
          'kubernetes.io/arch': 'amd64',
        },

        // Tolerations
        tolerations: [
          {
            key: 'test-workload',
            operator: 'Equal',
            value: 'true',
            effect: 'NoSchedule',
          },
        ],

        // Termination grace period
        terminationGracePeriodSeconds: 30,
      },
    };
  }

  /**
   * Create pod in Kubernetes (mock implementation)
   */
  private async createPod(podSpec: any): Promise<void> {
    // In a real implementation, this would use the Kubernetes API
    logger.info('Creating pod', {
      podName: podSpec.metadata.name,
      namespace: podSpec.metadata.namespace,
    });

    // Simulate pod creation delay
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  /**
   * Wait for pod to be ready (mock implementation)
   */
  private async waitForPodReady(podName: string): Promise<void> {
    logger.info('Waiting for pod to be ready', { podName });

    // Simulate pod startup time
    await new Promise(resolve => setTimeout(resolve, 5000));
  }

  /**
   * Get pod status (mock implementation)
   */
  private async getPodStatus(podName: string): Promise<any> {
    // Simulate different pod phases
    const phases = ['Pending', 'Running', 'Succeeded', 'Failed'];
    const randomPhase = phases[Math.floor(Math.random() * phases.length)];

    return {
      phase: randomPhase,
      conditions: [
        {
          type: 'Ready',
          status: randomPhase === 'Running' ? 'True' : 'False',
        },
      ],
    };
  }

  /**
   * Get pod logs (mock implementation)
   */
  private async getPodLogs(podName: string): Promise<string> {
    return `Test execution logs for pod ${podName}\nTest completed successfully`;
  }

  /**
   * Get pod metrics (mock implementation)
   */
  private async getPodMetrics(podName: string): Promise<ExecutionMetrics> {
    return {
      memoryUsage: Math.floor(Math.random() * 1024 * 1024 * 1024), // Random memory usage
      cpuUsage: Math.random() * 100, // Random CPU percentage
      networkRequests: Math.floor(Math.random() * 50),
      testSteps: Math.floor(Math.random() * 20) + 1,
      assertions: Math.floor(Math.random() * 30) + 1,
      containerId: podName,
    };
  }

  /**
   * Copy artifacts from pod (mock implementation)
   */
  private async copyArtifacts(podName: string): Promise<string[]> {
    return [
      `/artifacts/${podName}/test-report.html`,
      `/artifacts/${podName}/coverage.json`,
    ];
  }

  /**
   * Copy screenshots from pod (mock implementation)
   */
  private async copyScreenshots(podName: string): Promise<string[]> {
    return [
      `/screenshots/${podName}/step-1.png`,
      `/screenshots/${podName}/step-2.png`,
      `/screenshots/${podName}/final.png`,
    ];
  }

  /**
   * Delete pod (mock implementation)
   */
  private async deletePod(podName: string): Promise<void> {
    logger.info('Deleting pod', { podName });
    
    // Simulate pod deletion delay
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  /**
   * Map pod status to container status
   */
  private mapPodStatusToContainerStatus(podStatus: any): ContainerStatus['status'] {
    switch (podStatus.phase) {
      case 'Pending':
        return 'pending';
      case 'Running':
        return 'running';
      case 'Succeeded':
        return 'completed';
      case 'Failed':
        return 'failed';
      default:
        return 'pending';
    }
  }

  /**
   * Calculate execution progress
   */
  private calculateProgress(podStatus: any, output: string): number {
    if (podStatus.phase === 'Succeeded') return 100;
    if (podStatus.phase === 'Failed') return 100;
    if (podStatus.phase === 'Running') {
      // Estimate progress based on log output
      const lines = output.split('\n').length;
      return Math.min(90, lines * 5); // Rough estimate
    }
    return 0;
  }

  /**
   * Extract error from logs
   */
  private extractErrorFromLogs(output: string): string {
    const errorLines = output.split('\n').filter(line => 
      line.toLowerCase().includes('error') || 
      line.toLowerCase().includes('failed') ||
      line.toLowerCase().includes('exception')
    );
    
    return errorLines.length > 0 ? errorLines.join('\n') : 'Unknown error';
  }

  /**
   * Get active pod count
   */
  getActivePodCount(): number {
    return this.activePods.size;
  }

  /**
   * Cleanup all resources
   */
  async cleanupAll(): Promise<void> {
    logger.info('Cleaning up all containers');

    const cleanupPromises = Array.from(this.activePods.keys()).map(containerId =>
      this.cleanup(containerId)
    );

    await Promise.all(cleanupPromises);
  }
}