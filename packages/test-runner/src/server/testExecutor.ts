import { Server } from 'socket.io';
import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs/promises';

export interface TestExecution {
  id: string;
  testFile: string;
  testName?: string;
  status: 'running' | 'passed' | 'failed' | 'stopped';
  startTime: number;
  endTime?: number;
  steps: TestStep[];
  error?: string;
  videoPath?: string;
  screenshots: string[];
  socketId: string;
}

export interface TestStep {
  id: string;
  type: 'action' | 'assertion' | 'navigation';
  action: string;
  selector?: string;
  value?: string;
  timestamp: number;
  screenshot?: string;
  domSnapshot?: string;
  error?: string;
  duration?: number;
}

export class TestExecutor {
  private executions = new Map<string, TestExecution>();
  private browsers = new Map<string, Browser>();
  private io: Server;

  constructor(io: Server) {
    this.io = io;
  }

  async runTest(testFile: string, testName?: string, socketId?: string): Promise<string> {
    const executionId = uuidv4();
    const execution: TestExecution = {
      id: executionId,
      testFile,
      testName,
      status: 'running',
      startTime: Date.now(),
      steps: [],
      screenshots: [],
      socketId: socketId || ''
    };

    this.executions.set(executionId, execution);

    try {
      // Emit execution started
      this.io.to(socketId || '').emit('test-started', {
        executionId,
        testFile,
        testName
      });

      // Launch browser
      const browser = await chromium.launch({
        headless: false,
        args: ['--enable-automation']
      });

      this.browsers.set(executionId, browser);

      const context = await browser.newContext({
        recordVideo: {
          dir: path.join(process.cwd(), 'test-results', 'videos', executionId)
        }
      });

      const page = await context.newPage();

      // Set up step tracking
      await this.setupStepTracking(page, execution);

      // Execute the test
      await this.executeTestFile(page, testFile, testName, execution);

      execution.status = 'passed';
      execution.endTime = Date.now();

      // Get video path
      const videoPath = await this.getVideoPath(context, executionId);
      execution.videoPath = videoPath;

      await browser.close();
      this.browsers.delete(executionId);

      this.io.to(socketId || '').emit('test-completed', execution);

    } catch (error) {
      execution.status = 'failed';
      execution.endTime = Date.now();
      execution.error = error.message;

      // Clean up browser
      const browser = this.browsers.get(executionId);
      if (browser) {
        await browser.close();
        this.browsers.delete(executionId);
      }

      this.io.to(socketId || '').emit('test-failed', execution);
    }

    return executionId;
  }

  async debugTest(testFile: string, testName?: string, socketId?: string): Promise<string> {
    const executionId = uuidv4();
    const execution: TestExecution = {
      id: executionId,
      testFile,
      testName,
      status: 'running',
      startTime: Date.now(),
      steps: [],
      screenshots: [],
      socketId: socketId || ''
    };

    this.executions.set(executionId, execution);

    try {
      // Launch browser in debug mode
      const browser = await chromium.launch({
        headless: false,
        devtools: true,
        slowMo: 1000,
        args: ['--enable-automation']
      });

      this.browsers.set(executionId, browser);

      const context = await browser.newContext();
      const page = await context.newPage();

      // Set up step tracking with debugging features
      await this.setupDebugStepTracking(page, execution);

      this.io.to(socketId || '').emit('debug-started', {
        executionId,
        testFile,
        testName
      });

      // Keep browser open for debugging
      // Don't auto-close - let user control

    } catch (error) {
      execution.status = 'failed';
      execution.error = error.message;

      this.io.to(socketId || '').emit('debug-failed', execution);
    }

    return executionId;
  }

  stopTest(executionId: string): void {
    const execution = this.executions.get(executionId);
    if (execution) {
      execution.status = 'stopped';
      execution.endTime = Date.now();

      // Close browser
      const browser = this.browsers.get(executionId);
      if (browser) {
        browser.close();
        this.browsers.delete(executionId);
      }

      this.io.to(execution.socketId).emit('test-stopped', execution);
    }
  }

  private async setupStepTracking(page: Page, execution: TestExecution): Promise<void> {
    // Intercept page events
    page.on('request', (request) => {
      this.addStep(execution, {
        type: 'action',
        action: 'request',
        value: request.url(),
        timestamp: Date.now()
      });
    });

    page.on('response', (response) => {
      this.addStep(execution, {
        type: 'action',
        action: 'response',
        value: `${response.status()} ${response.url()}`,
        timestamp: Date.now()
      });
    });

    // Inject step tracking script
    await page.addInitScript(() => {
      // Override common Playwright actions
      const originalClick = HTMLElement.prototype.click;
      HTMLElement.prototype.click = function() {
        console.log('AUTOQA_STEP:', JSON.stringify({
          type: 'action',
          action: 'click',
          selector: this.getAttribute('data-testid') || this.id || this.className,
          timestamp: Date.now()
        }));
        return originalClick.call(this);
      };
    });

    // Listen for console messages
    page.on('console', (msg) => {
      if (msg.text().startsWith('AUTOQA_STEP:')) {
        try {
          const stepData = JSON.parse(msg.text().replace('AUTOQA_STEP:', ''));
          this.addStep(execution, stepData);
        } catch (error) {
          console.error('Failed to parse step data:', error);
        }
      }
    });
  }

  private async setupDebugStepTracking(page: Page, execution: TestExecution): Promise<void> {
    await this.setupStepTracking(page, execution);

    // Add debugging features
    await page.addInitScript(() => {
      // Add visual indicators for interactions
      document.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        target.style.outline = '2px solid #007acc';
        setTimeout(() => {
          target.style.outline = '';
        }, 2000);
      });
    });
  }

  private addStep(execution: TestExecution, stepData: Partial<TestStep>): void {
    const step: TestStep = {
      id: uuidv4(),
      type: stepData.type || 'action',
      action: stepData.action || '',
      selector: stepData.selector,
      value: stepData.value,
      timestamp: stepData.timestamp || Date.now(),
      screenshot: stepData.screenshot,
      domSnapshot: stepData.domSnapshot,
      error: stepData.error,
      duration: stepData.duration
    };

    execution.steps.push(step);

    // Emit step to client
    this.io.to(execution.socketId).emit('test-step', {
      executionId: execution.id,
      step
    });
  }

  private async executeTestFile(
    page: Page,
    testFile: string,
    testName: string | undefined,
    execution: TestExecution
  ): Promise<void> {
    // This is a simplified version - in reality, you'd use Playwright's test runner
    // For now, we'll simulate test execution
    
    this.addStep(execution, {
      type: 'navigation',
      action: 'goto',
      value: 'https://example.com',
      timestamp: Date.now()
    });

    await page.goto('https://example.com');
    await page.waitForTimeout(1000);

    // Take screenshot
    const screenshotPath = await this.takeScreenshot(page, execution.id);
    execution.screenshots.push(screenshotPath);

    this.addStep(execution, {
      type: 'assertion',
      action: 'expect',
      value: 'page loaded',
      timestamp: Date.now(),
      screenshot: screenshotPath
    });
  }

  private async takeScreenshot(page: Page, executionId: string): Promise<string> {
    const screenshotDir = path.join(process.cwd(), 'test-results', 'screenshots', executionId);
    await fs.mkdir(screenshotDir, { recursive: true });
    
    const screenshotPath = path.join(screenshotDir, `step-${Date.now()}.png`);
    await page.screenshot({ path: screenshotPath });
    
    return screenshotPath;
  }

  private async getVideoPath(context: BrowserContext, executionId: string): Promise<string | undefined> {
    try {
      const videoDir = path.join(process.cwd(), 'test-results', 'videos', executionId);
      const files = await fs.readdir(videoDir);
      const videoFile = files.find(file => file.endsWith('.webm'));
      
      return videoFile ? path.join(videoDir, videoFile) : undefined;
    } catch (error) {
      console.error('Failed to get video path:', error);
      return undefined;
    }
  }

  getExecution(executionId: string): TestExecution | undefined {
    return this.executions.get(executionId);
  }

  getAllExecutions(): TestExecution[] {
    return Array.from(this.executions.values());
  }
}