import { Page } from 'playwright';
import { v4 as uuidv4 } from 'uuid';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import winston from 'winston';

import { VisualRegressionEngine } from './visual-regression-engine';
import {
  VisualRegressionConfig,
  ComparisonResult,
  VisualTestOptions,
  BaselineImage,
  VisualRegressionReport
} from './types';

export interface ApprovalWorkflowConfig {
  requireApproval: boolean;
  approvers: string[];
  autoApproveThreshold: number; // Auto-approve if difference is below this percentage
  notificationWebhook?: string;
}

export interface BatchComparisonOptions {
  testId: string;
  tests: Array<{
    name: string;
    page: Page;
    options: VisualTestOptions;
  }>;
  metadata: {
    viewport: { width: number; height: number };
    browser: string;
    url: string;
  };
  parallel: boolean;
  maxConcurrency: number;
}

export interface LayoutShiftDetection {
  enabled: boolean;
  threshold: number; // CLS threshold
  ignoreElements: string[]; // CSS selectors to ignore
  trackingDuration: number; // ms to track layout shifts
}

export interface ApprovalRequest {
  id: string;
  comparisonId: string;
  testId: string;
  status: 'pending' | 'approved' | 'rejected';
  requestedBy: string;
  requestedAt: Date;
  approvedBy?: string;
  approvedAt?: Date;
  rejectedBy?: string;
  rejectedAt?: Date;
  reason?: string;
  comparisonResult: ComparisonResult;
}

export class VisualRegressionWorkflowManager {
  private engine: VisualRegressionEngine;
  private config: VisualRegressionConfig;
  private approvalConfig: ApprovalWorkflowConfig;
  private logger: winston.Logger;
  private pendingApprovals: Map<string, ApprovalRequest> = new Map();

  constructor(
    engine: VisualRegressionEngine,
    config: VisualRegressionConfig,
    approvalConfig: ApprovalWorkflowConfig
  ) {
    this.engine = engine;
    this.config = config;
    this.approvalConfig = approvalConfig;
    
    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'visual-workflow.log' })
      ]
    });

    this.loadPendingApprovals();
  }

  private loadPendingApprovals(): void {
    const approvalsFile = join(this.config.outputDir, 'pending-approvals.json');
    if (existsSync(approvalsFile)) {
      try {
        const data = JSON.parse(readFileSync(approvalsFile, 'utf-8'));
        data.forEach((approval: ApprovalRequest) => {
          this.pendingApprovals.set(approval.id, approval);
        });
        this.logger.info(`Loaded ${this.pendingApprovals.size} pending approvals`);
      } catch (error) {
        this.logger.error('Failed to load pending approvals:', error);
      }
    }
  }

  private savePendingApprovals(): void {
    const approvalsFile = join(this.config.outputDir, 'pending-approvals.json');
    try {
      const data = Array.from(this.pendingApprovals.values());
      writeFileSync(approvalsFile, JSON.stringify(data, null, 2));
      this.logger.info(`Saved ${data.length} pending approvals`);
    } catch (error) {
      this.logger.error('Failed to save pending approvals:', error);
    }
  }

  async runVisualTest(
    page: Page,
    testId: string,
    options: VisualTestOptions,
    metadata: {
      viewport: { width: number; height: number };
      browser: string;
      url: string;
    },
    requestedBy: string = 'system'
  ): Promise<ComparisonResult> {
    this.logger.info(`Running visual test: ${testId} - ${options.name}`);

    // Apply ignore regions if specified
    if (options.ignoreRegions && options.ignoreRegions.length > 0) {
      await this.applyIgnoreRegions(page, options.ignoreRegions);
    }

    // Capture screenshot
    const screenshotPath = await this.engine.captureScreenshot(page, testId, options);

    // Perform comparison
    const result = await this.engine.compareWithBaseline(
      testId,
      screenshotPath,
      options,
      metadata
    );

    // Handle approval workflow
    if (this.shouldRequireApproval(result)) {
      await this.createApprovalRequest(result, requestedBy);
    }

    return result;
  }

  private async applyIgnoreRegions(
    page: Page,
    ignoreRegions: Array<{ x: number; y: number; width: number; height: number }>
  ): Promise<void> {
    try {
      // Inject CSS to hide ignore regions
      const css = ignoreRegions
        .map((region, index) => {
          return `
            .visual-ignore-${index} {
              position: fixed !important;
              left: ${region.x}px !important;
              top: ${region.y}px !important;
              width: ${region.width}px !important;
              height: ${region.height}px !important;
              background: #ff00ff !important;
              z-index: 999999 !important;
              pointer-events: none !important;
            }
          `;
        })
        .join('\n');

      await page.addStyleTag({ content: css });

      // Add overlay elements
      await page.evaluate((regions) => {
        regions.forEach((region: any, index: number) => {
          const overlay = document.createElement('div');
          overlay.className = `visual-ignore-${index}`;
          document.body.appendChild(overlay);
        });
      }, ignoreRegions);

      this.logger.info(`Applied ${ignoreRegions.length} ignore regions`);
    } catch (error) {
      this.logger.error('Failed to apply ignore regions:', error);
    }
  }

  async runBatchComparison(options: BatchComparisonOptions): Promise<VisualRegressionReport> {
    this.logger.info(`Running batch comparison for ${options.testId} with ${options.tests.length} tests`);

    const results: ComparisonResult[] = [];
    const startTime = Date.now();

    if (options.parallel) {
      // Run tests in parallel with concurrency limit
      const chunks = this.chunkArray(options.tests, options.maxConcurrency);
      
      for (const chunk of chunks) {
        const chunkPromises = chunk.map(async (test) => {
          try {
            return await this.runVisualTest(
              test.page,
              options.testId,
              test.options,
              options.metadata
            );
          } catch (error) {
            this.logger.error(`Failed to run test ${test.name}:`, error);
            return null;
          }
        });

        const chunkResults = await Promise.all(chunkPromises);
        results.push(...chunkResults.filter(r => r !== null) as ComparisonResult[]);
      }
    } else {
      // Run tests sequentially
      for (const test of options.tests) {
        try {
          const result = await this.runVisualTest(
            test.page,
            options.testId,
            test.options,
            options.metadata
          );
          results.push(result);
        } catch (error) {
          this.logger.error(`Failed to run test ${test.name}:`, error);
        }
      }
    }

    const endTime = Date.now();
    this.logger.info(`Batch comparison completed in ${endTime - startTime}ms`);

    // Generate report
    const report = await this.engine.generateReport(options.testId, results);
    return report;
  }

  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  async detectLayoutShifts(
    page: Page,
    options: LayoutShiftDetection
  ): Promise<{
    cls: number;
    shifts: Array<{
      value: number;
      sources: Array<{
        node: string;
        previousRect: DOMRect;
        currentRect: DOMRect;
      }>;
      timestamp: number;
    }>;
  }> {
    if (!options.enabled) {
      return { cls: 0, shifts: [] };
    }

    this.logger.info('Starting layout shift detection');

    // Inject layout shift detection script
    const result = await page.evaluate(async (config) => {
      return new Promise((resolve) => {
        let cls = 0;
        const shifts: any[] = [];
        const ignoreSelectors = config.ignoreElements || [];

        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (entry.entryType === 'layout-shift' && !(entry as any).hadRecentInput) {
              const sources = (entry as any).sources || [];
              const filteredSources = sources.filter((source: any) => {
                const element = source.node;
                if (!element) return true;
                
                return !ignoreSelectors.some((selector: string) => {
                  try {
                    return element.matches && element.matches(selector);
                  } catch {
                    return false;
                  }
                });
              });

              if (filteredSources.length > 0) {
                cls += (entry as any).value;
                shifts.push({
                  value: (entry as any).value,
                  sources: filteredSources.map((source: any) => ({
                    node: source.node?.tagName || 'unknown',
                    previousRect: source.previousRect,
                    currentRect: source.currentRect
                  })),
                  timestamp: entry.startTime
                });
              }
            }
          }
        });

        observer.observe({ entryTypes: ['layout-shift'] });

        // Stop observing after specified duration
        setTimeout(() => {
          observer.disconnect();
          resolve({ cls, shifts });
        }, config.trackingDuration);
      });
    }, options);

    this.logger.info(`Layout shift detection completed. CLS: ${result.cls}, Shifts: ${result.shifts.length}`);
    return result as any;
  }

  private shouldRequireApproval(result: ComparisonResult): boolean {
    if (!this.approvalConfig.requireApproval) {
      return false;
    }

    if (result.status === 'passed') {
      return false;
    }

    if (result.status === 'new') {
      return true;
    }

    // Failed comparison - check if below auto-approve threshold
    return result.percentageDifference > this.approvalConfig.autoApproveThreshold;
  }

  private async createApprovalRequest(
    result: ComparisonResult,
    requestedBy: string
  ): Promise<ApprovalRequest> {
    const approvalRequest: ApprovalRequest = {
      id: uuidv4(),
      comparisonId: result.id,
      testId: result.testId,
      status: 'pending',
      requestedBy,
      requestedAt: new Date(),
      comparisonResult: result
    };

    this.pendingApprovals.set(approvalRequest.id, approvalRequest);
    this.savePendingApprovals();

    // Send notification if webhook configured
    if (this.approvalConfig.notificationWebhook) {
      await this.sendApprovalNotification(approvalRequest);
    }

    this.logger.info(`Created approval request: ${approvalRequest.id}`);
    return approvalRequest;
  }

  private async sendApprovalNotification(request: ApprovalRequest): Promise<void> {
    if (!this.approvalConfig.notificationWebhook) return;

    try {
      const payload = {
        type: 'approval_request',
        request: {
          id: request.id,
          testId: request.testId,
          status: request.status,
          requestedBy: request.requestedBy,
          requestedAt: request.requestedAt,
          percentageDifference: request.comparisonResult.percentageDifference,
          diffImagePath: request.comparisonResult.diffImagePath
        }
      };

      // In a real implementation, you would make an HTTP request here
      this.logger.info(`Would send notification to: ${this.approvalConfig.notificationWebhook}`);
      this.logger.debug('Notification payload:', payload);
    } catch (error) {
      this.logger.error('Failed to send approval notification:', error);
    }
  }

  async approveComparison(
    approvalId: string,
    approvedBy: string,
    reason?: string
  ): Promise<boolean> {
    const approval = this.pendingApprovals.get(approvalId);
    if (!approval) {
      this.logger.error(`Approval request not found: ${approvalId}`);
      return false;
    }

    if (!this.approvalConfig.approvers.includes(approvedBy)) {
      this.logger.error(`User ${approvedBy} is not authorized to approve`);
      return false;
    }

    approval.status = 'approved';
    approval.approvedBy = approvedBy;
    approval.approvedAt = new Date();
    approval.reason = reason;

    // Update baseline if this was a new baseline or failed comparison
    if (approval.comparisonResult.status === 'new' || approval.comparisonResult.status === 'failed') {
      try {
        const baseline = this.engine.getBaseline(
          approval.testId,
          approval.comparisonResult.actualImagePath.split('-').pop()?.replace('.png', '') || 'unknown'
        );

        if (baseline) {
          await this.engine.updateBaseline(
            baseline.id,
            approval.comparisonResult.actualImagePath,
            approvedBy,
            reason
          );
        }
      } catch (error) {
        this.logger.error('Failed to update baseline after approval:', error);
      }
    }

    this.pendingApprovals.delete(approvalId);
    this.savePendingApprovals();

    this.logger.info(`Approved comparison: ${approvalId} by ${approvedBy}`);
    return true;
  }

  async rejectComparison(
    approvalId: string,
    rejectedBy: string,
    reason: string
  ): Promise<boolean> {
    const approval = this.pendingApprovals.get(approvalId);
    if (!approval) {
      this.logger.error(`Approval request not found: ${approvalId}`);
      return false;
    }

    if (!this.approvalConfig.approvers.includes(rejectedBy)) {
      this.logger.error(`User ${rejectedBy} is not authorized to reject`);
      return false;
    }

    approval.status = 'rejected';
    approval.rejectedBy = rejectedBy;
    approval.rejectedAt = new Date();
    approval.reason = reason;

    this.pendingApprovals.delete(approvalId);
    this.savePendingApprovals();

    this.logger.info(`Rejected comparison: ${approvalId} by ${rejectedBy}`);
    return true;
  }

  getPendingApprovals(): ApprovalRequest[] {
    return Array.from(this.pendingApprovals.values());
  }

  getApprovalRequest(approvalId: string): ApprovalRequest | undefined {
    return this.pendingApprovals.get(approvalId);
  }

  async generateWorkflowReport(testId: string): Promise<{
    testId: string;
    totalComparisons: number;
    pendingApprovals: number;
    approvedComparisons: number;
    rejectedComparisons: number;
    autoApprovedComparisons: number;
    averageApprovalTime: number;
    generatedAt: Date;
  }> {
    // This would typically query a database for historical data
    // For now, we'll return current state
    const pending = this.getPendingApprovals().filter(a => a.testId === testId);
    
    return {
      testId,
      totalComparisons: pending.length, // This would be from historical data
      pendingApprovals: pending.length,
      approvedComparisons: 0, // This would be from historical data
      rejectedComparisons: 0, // This would be from historical data
      autoApprovedComparisons: 0, // This would be from historical data
      averageApprovalTime: 0, // This would be calculated from historical data
      generatedAt: new Date()
    };
  }
}