/**
 * Test Orchestrator Main Entry Point
 * **Validates: Requirements 5.3**
 * 
 * Main server that coordinates test execution with:
 * - Express API for orchestrator management
 * - WebSocket server for real-time updates
 * - Container manager for Kubernetes integration
 * - Job queue management with Redis
 */

import express from 'express';
import { TestOrchestrator } from './orchestrator';
import { ContainerManager } from './container-manager';
import { WebSocketManager } from './websocket-manager';
import { logger } from './utils/logger';

const app = express();
const port = process.env.PORT || 3001;
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const wsPort = parseInt(process.env.WS_PORT || '8080');

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// Initialize managers
const wsManager = new WebSocketManager(wsPort);
const containerManager = new ContainerManager();
const orchestrator = new TestOrchestrator(redisUrl, containerManager, wsManager);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    activeExecutions: orchestrator.getActiveExecutions().length,
    connectedClients: wsManager.getClientCount(),
  });
});

// Ready check endpoint
app.get('/ready', async (req, res) => {
  try {
    const queueStats = await orchestrator.getQueueStats();
    const clientStats = wsManager.getClientStats();
    
    res.json({
      status: 'ready',
      queue: queueStats,
      clients: clientStats,
      containers: {
        active: containerManager.getActivePodCount(),
      },
    });
  } catch (error) {
    res.status(503).json({
      status: 'not ready',
      error: (error as Error).message,
    });
  }
});

// Metrics endpoint for Prometheus
app.get('/metrics', async (req, res) => {
  try {
    const queueStats = await orchestrator.getQueueStats();
    const clientStats = wsManager.getClientStats();
    const activeExecutions = orchestrator.getActiveExecutions();
    
    const metrics = [
      `# HELP autoqa_queue_waiting_total Number of waiting jobs in queue`,
      `# TYPE autoqa_queue_waiting_total gauge`,
      `autoqa_queue_waiting_total ${queueStats.waiting}`,
      
      `# HELP autoqa_queue_active_total Number of active jobs in queue`,
      `# TYPE autoqa_queue_active_total gauge`,
      `autoqa_queue_active_total ${queueStats.active}`,
      
      `# HELP autoqa_queue_completed_total Number of completed jobs`,
      `# TYPE autoqa_queue_completed_total counter`,
      `autoqa_queue_completed_total ${queueStats.completed}`,
      
      `# HELP autoqa_queue_failed_total Number of failed jobs`,
      `# TYPE autoqa_queue_failed_total counter`,
      `autoqa_queue_failed_total ${queueStats.failed}`,
      
      `# HELP autoqa_websocket_clients_total Number of connected WebSocket clients`,
      `# TYPE autoqa_websocket_clients_total gauge`,
      `autoqa_websocket_clients_total ${clientStats.total}`,
      
      `# HELP autoqa_websocket_authenticated_clients_total Number of authenticated WebSocket clients`,
      `# TYPE autoqa_websocket_authenticated_clients_total gauge`,
      `autoqa_websocket_authenticated_clients_total ${clientStats.authenticated}`,
      
      `# HELP autoqa_active_executions_total Number of active test executions`,
      `# TYPE autoqa_active_executions_total gauge`,
      `autoqa_active_executions_total ${activeExecutions.length}`,
      
      `# HELP autoqa_active_containers_total Number of active containers`,
      `# TYPE autoqa_active_containers_total gauge`,
      `autoqa_active_containers_total ${containerManager.getActivePodCount()}`,
    ];

    res.set('Content-Type', 'text/plain');
    res.send(metrics.join('\n') + '\n');
  } catch (error) {
    res.status(500).json({
      error: 'Failed to generate metrics',
      message: (error as Error).message,
    });
  }
});

// Submit test execution
app.post('/executions', async (req, res) => {
  try {
    const executionId = await orchestrator.submitExecution(req.body);
    
    res.status(201).json({
      executionId,
      status: 'queued',
      timestamp: new Date(),
    });
  } catch (error) {
    logger.error('Failed to submit execution', { error: (error as Error).message });
    
    res.status(500).json({
      error: 'Failed to submit execution',
      message: (error as Error).message,
    });
  }
});

// Get execution status
app.get('/executions/:id', (req, res) => {
  const executionId = req.params.id;
  const execution = orchestrator.getExecutionStatus(executionId);
  
  if (!execution) {
    return res.status(404).json({
      error: 'Execution not found',
      executionId,
    });
  }
  
  res.json(execution);
});

// Cancel execution
app.delete('/executions/:id', async (req, res) => {
  try {
    const executionId = req.params.id;
    const cancelled = await orchestrator.cancelExecution(executionId);
    
    if (!cancelled) {
      return res.status(404).json({
        error: 'Execution not found',
        executionId,
      });
    }
    
    res.json({
      executionId,
      status: 'cancelled',
      timestamp: new Date(),
    });
  } catch (error) {
    logger.error('Failed to cancel execution', { error: (error as Error).message });
    
    res.status(500).json({
      error: 'Failed to cancel execution',
      message: (error as Error).message,
    });
  }
});

// Get queue statistics
app.get('/queue/stats', async (req, res) => {
  try {
    const stats = await orchestrator.getQueueStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({
      error: 'Failed to get queue stats',
      message: (error as Error).message,
    });
  }
});

// Get active executions
app.get('/executions', (req, res) => {
  const executions = orchestrator.getActiveExecutions();
  res.json({
    executions,
    count: executions.length,
  });
});

// Error handling middleware
app.use((error: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Unhandled error', {
    error: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method,
  });
  
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong',
  });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, shutting down gracefully');
  
  try {
    await orchestrator.cleanup();
    await wsManager.cleanup();
    await containerManager.cleanupAll();
    
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown', { error: (error as Error).message });
    process.exit(1);
  }
});

process.on('SIGINT', async () => {
  logger.info('Received SIGINT, shutting down gracefully');
  
  try {
    await orchestrator.cleanup();
    await wsManager.cleanup();
    await containerManager.cleanupAll();
    
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown', { error: (error as Error).message });
    process.exit(1);
  }
});

// Start server
app.listen(port, () => {
  logger.info('Test orchestrator server started', {
    port,
    wsPort,
    redisUrl,
    nodeEnv: process.env.NODE_ENV,
  });
});

export { orchestrator, containerManager, wsManager };