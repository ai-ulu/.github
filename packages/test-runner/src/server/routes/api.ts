import { Router } from 'express';
import { TestExecutor } from '../testExecutor';
import { FileWatcher } from '../fileWatcher';
import path from 'path';
import fs from 'fs/promises';

export function apiRoutes(testExecutor: TestExecutor, fileWatcher: FileWatcher) {
  const router = Router();

  // Get all test files in a directory
  router.get('/files', async (req, res) => {
    try {
      const directory = req.query.directory as string || process.cwd();
      const testFiles = await fileWatcher.getTestFiles(directory);
      res.json({ testFiles });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get test file content
  router.get('/files/:filePath(*)', async (req, res) => {
    try {
      const filePath = req.params.filePath;
      const content = await fs.readFile(filePath, 'utf-8');
      res.json({ content });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Run a specific test
  router.post('/run-test', async (req, res) => {
    try {
      const { testFile, testName } = req.body;
      const executionId = await testExecutor.runTest(testFile, testName);
      res.json({ executionId });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Debug a specific test
  router.post('/debug-test', async (req, res) => {
    try {
      const { testFile, testName } = req.body;
      const executionId = await testExecutor.debugTest(testFile, testName);
      res.json({ executionId });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Stop test execution
  router.post('/stop-test', (req, res) => {
    try {
      const { executionId } = req.body;
      testExecutor.stopTest(executionId);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get test execution details
  router.get('/executions/:executionId', (req, res) => {
    try {
      const { executionId } = req.params;
      const execution = testExecutor.getExecution(executionId);
      
      if (!execution) {
        return res.status(404).json({ error: 'Execution not found' });
      }

      res.json(execution);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get all executions
  router.get('/executions', (req, res) => {
    try {
      const executions = testExecutor.getAllExecutions();
      res.json({ executions });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Serve screenshots
  router.get('/screenshots/:executionId/:filename', async (req, res) => {
    try {
      const { executionId, filename } = req.params;
      const screenshotPath = path.join(
        process.cwd(),
        'test-results',
        'screenshots',
        executionId,
        filename
      );

      const exists = await fs.access(screenshotPath).then(() => true).catch(() => false);
      if (!exists) {
        return res.status(404).json({ error: 'Screenshot not found' });
      }

      res.sendFile(screenshotPath);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Serve videos
  router.get('/videos/:executionId/:filename', async (req, res) => {
    try {
      const { executionId, filename } = req.params;
      const videoPath = path.join(
        process.cwd(),
        'test-results',
        'videos',
        executionId,
        filename
      );

      const exists = await fs.access(videoPath).then(() => true).catch(() => false);
      if (!exists) {
        return res.status(404).json({ error: 'Video not found' });
      }

      res.sendFile(videoPath);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Health check
  router.get('/health', (req, res) => {
    res.json({ 
      status: 'ok', 
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    });
  });

  return router;
}