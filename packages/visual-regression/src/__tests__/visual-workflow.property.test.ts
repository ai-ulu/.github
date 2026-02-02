import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';
import { chromium, Browser, Page } from 'playwright';
import { VisualRegressionEngine } from '../visual-regression-engine';
import { VisualRegressionWorkflowManager } from '../workflow-manager';
import { VisualRegressionConfig, VisualTestOptions, ApprovalWorkflowConfig } from '../types';
import { mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';

/**
 * Property 15: Visual Regression Workflow
 * Validates: Requirements 7.4, 7.5
 * Test that visual differences mark tests as failed
 * Verify approval workflow for baseline changes
 */

describe('Property 15: Visual Regression Workflow', () => {
  let browser: Browser;
  let page: Page;
  let engine: VisualRegressionEngine;
  let workflowManager: VisualRegressionWorkflowManager;
  let testConfig: VisualRegressionConfig;
  let approvalConfig: ApprovalWorkflowConfig;

  beforeEach(async () => {
    browser = await chromium.launch({ headless: true });
    page = await browser.newPage();

    // Create test directories
    const baseDir = join(process.cwd(), 'test-workflow-baselines');
    const outputDir = join(process.cwd(), 'test-workflow-output');
    
    if (existsSync(baseDir)) rmSync(baseDir, { recursive: true });
    if (existsSync(outputDir)) rmSync(outputDir, { recursive: true });
    
    mkdirSync(baseDir, { recursive: true });
    mkdirSync(outputDir, { recursive: true });

    testConfig = {
      baselineDir: baseDir,
      outputDir: outputDir,
      threshold: 1.0, // 1% threshold
      includeAA: false,
      storage: {
        type: 'local'
      }
    };

    approvalConfig = {
      requireApproval: true,
      approvers: ['test-user', 'admin-user'],
      autoApproveThreshold: 0.5, // Auto-approve below 0.5%
      notificationWebhook: 'https://example.com/webhook'
    };

    engine = new VisualRegressionEngine(testConfig);
    workflowManager = new VisualRegressionWorkflowManager(engine, testConfig, approvalConfig);
  });

  afterEach(async () => {
    await page?.close();
    await browser?.close();

    // Cleanup test directories
    const baseDir = join(process.cwd(), 'test-workflow-baselines');
    const outputDir = join(process.cwd(), 'test-workflow-output');
    
    if (existsSync(baseDir)) rmSync(baseDir, { recursive: true });
    if (existsSync(outputDir)) rmSync(outputDir, { recursive: true });
  });

  it('should mark tests as failed when visual differences exceed threshold', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          testId: fc.string({ minLength: 1, maxLength: 50 }),
          testName: fc.string({ minLength: 1, maxLength: 50 }),
          baseContent: fc.string({ minLength: 10, maxLength: 100 }),
          modifiedContent: fc.string({ minLength: 10, maxLength: 100 }),
          threshold: fc.float({ min: 0.1, max: 5.0 })
        }),
        async ({ testId, testName, baseContent, modifiedContent, threshold }) => {
          // Skip if contents are identical
          if (baseContent === modifiedContent) return;

          await page.setViewportSize({ width: 800, height: 600 });

          const createHtml = (content: string, title: string) => `
            <html>
              <body style="margin: 0; padding: 20px; font-family: Arial; background: white;">
                <h1>${title}</h1>
                <div style="padding: 20px; border: 2px solid #333; background: #f0f0f0;">
                  ${content}
                </div>
                <div style="width: 100px; height: 100px; background: linear-gradient(45deg, #ff0000, #00ff00); margin: 20px 0;"></div>
              </body>
            </html>
          `;

          const options: VisualTestOptions = {
            name: testName,
            fullPage: true,
            threshold: threshold
          };

          const metadata = {
            viewport: { width: 800, height: 600 },
            browser: 'chromium',
            url: 'data:text/html'
          };

          // Create baseline
          await page.setContent(createHtml(baseContent, 'Baseline'));
          await page.waitForLoadState('networkidle');

          const baselineResult = await workflowManager.runVisualTest(
            page,
            testId,
            options,
            metadata,
            'test-user'
          );

          expect(baselineResult.status).toBe('new');

          // Compare with modified content
          await page.setContent(createHtml(modifiedContent, 'Modified'));
          await page.waitForLoadState('networkidle');

          const comparisonResult = await workflowManager.runVisualTest(
            page,
            testId,
            options,
            metadata,
            'test-user'
          );

          // Verify status based on threshold
          if (comparisonResult.percentageDifference <= threshold) {
            expect(comparisonResult.status).toBe('passed');
          } else {
            expect(comparisonResult.status).toBe('failed');
            
            // Failed tests should have diff images
            expect(comparisonResult.diffImagePath).toBeTruthy();
          }

          // Verify difference calculation consistency
          expect(comparisonResult.pixelDifference).toBeGreaterThanOrEqual(0);
          expect(comparisonResult.percentageDifference).toBeGreaterThanOrEqual(0);
          expect(comparisonResult.percentageDifference).toBeLessThanOrEqual(100);
          expect(comparisonResult.threshold).toBe(threshold);
        }
      ),
      { numRuns: 15 }
    );
  });

  it('should create approval requests for visual changes that require approval', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          testId: fc.string({ minLength: 1, maxLength: 50 }),
          testName: fc.string({ minLength: 1, maxLength: 50 }),
          changeType: fc.constantFrom('major', 'minor', 'new'),
          requestedBy: fc.constantFrom('test-user', 'dev-user', 'qa-user')
        }),
        async ({ testId, testName, changeType, requestedBy }) => {
          await page.setViewportSize({ width: 800, height: 600 });

          const baseHtml = `
            <html>
              <body style="margin: 0; padding: 20px; font-family: Arial; background: white;">
                <h1>Base Content</h1>
                <div style="width: 200px; height: 200px; background: blue;"></div>
              </body>
            </html>
          `;

          // Create different levels of changes
          const changes = {
            major: `
              <html>
                <body style="margin: 0; padding: 20px; font-family: Arial; background: white;">
                  <h1>Major Change</h1>
                  <div style="width: 300px; height: 300px; background: red;"></div>
                  <div style="width: 100px; height: 100px; background: green; margin-top: 20px;"></div>
                </body>
              </html>
            `,
            minor: `
              <html>
                <body style="margin: 0; padding: 20px; font-family: Arial; background: white;">
                  <h1>Minor Change</h1>
                  <div style="width: 210px; height: 210px; background: darkblue;"></div>
                </body>
              </html>
            `,
            new: baseHtml // For new baseline test
          };

          const options: VisualTestOptions = {
            name: testName,
            fullPage: true,
            threshold: 1.0
          };

          const metadata = {
            viewport: { width: 800, height: 600 },
            browser: 'chromium',
            url: 'data:text/html'
          };

          if (changeType === 'new') {
            // Test new baseline creation
            await page.setContent(baseHtml);
            await page.waitForLoadState('networkidle');

            const result = await workflowManager.runVisualTest(
              page,
              testId,
              options,
              metadata,
              requestedBy
            );

            expect(result.status).toBe('new');

            // New baselines should create approval requests
            const pendingApprovals = workflowManager.getPendingApprovals();
            const relevantApproval = pendingApprovals.find(a => 
              a.testId === testId && a.requestedBy === requestedBy
            );

            expect(relevantApproval).toBeTruthy();
            expect(relevantApproval!.status).toBe('pending');
            expect(relevantApproval!.comparisonResult.status).toBe('new');

          } else {
            // Create baseline first
            await page.setContent(baseHtml);
            await page.waitForLoadState('networkidle');

            const baselineResult = await workflowManager.runVisualTest(
              page,
              testId,
              options,
              metadata,
              'system'
            );

            expect(baselineResult.status).toBe('new');

            // Clear any pending approvals from baseline creation
            const initialApprovals = workflowManager.getPendingApprovals();
            for (const approval of initialApprovals) {
              if (approval.testId === testId) {
                await workflowManager.approveComparison(
                  approval.id,
                  'admin-user',
                  'Auto-approve baseline'
                );
              }
            }

            // Now test with changes
            await page.setContent(changes[changeType]);
            await page.waitForLoadState('networkidle');

            const comparisonResult = await workflowManager.runVisualTest(
              page,
              testId,
              options,
              metadata,
              requestedBy
            );

            // Check if approval was created based on difference level
            const pendingApprovals = workflowManager.getPendingApprovals();
            const relevantApproval = pendingApprovals.find(a => 
              a.testId === testId && a.requestedBy === requestedBy
            );

            if (comparisonResult.status === 'failed' && 
                comparisonResult.percentageDifference > approvalConfig.autoApproveThreshold) {
              // Should create approval request for significant changes
              expect(relevantApproval).toBeTruthy();
              expect(relevantApproval!.status).toBe('pending');
              expect(relevantApproval!.comparisonResult.status).toBe('failed');
            } else if (comparisonResult.percentageDifference <= approvalConfig.autoApproveThreshold) {
              // Should auto-approve minor changes
              expect(relevantApproval).toBeFalsy();
            }
          }
        }
      ),
      { numRuns: 12 }
    );
  });

  it('should handle approval workflow correctly with authorized approvers', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          testId: fc.string({ minLength: 1, maxLength: 50 }),
          testName: fc.string({ minLength: 1, maxLength: 50 }),
          approver: fc.constantFrom('test-user', 'admin-user', 'unauthorized-user'),
          action: fc.constantFrom('approve', 'reject'),
          reason: fc.option(fc.string({ minLength: 5, maxLength: 100 }))
        }),
        async ({ testId, testName, approver, action, reason }) => {
          await page.setViewportSize({ width: 800, height: 600 });

          const baseHtml = `
            <html>
              <body style="margin: 0; padding: 20px; font-family: Arial;">
                <h1>Base</h1>
                <div style="width: 100px; height: 100px; background: blue;"></div>
              </body>
            </html>
          `;

          const modifiedHtml = `
            <html>
              <body style="margin: 0; padding: 20px; font-family: Arial;">
                <h1>Modified</h1>
                <div style="width: 150px; height: 150px; background: red;"></div>
              </body>
            </html>
          `;

          const options: VisualTestOptions = {
            name: testName,
            fullPage: true,
            threshold: 0.1 // Low threshold to ensure failure
          };

          const metadata = {
            viewport: { width: 800, height: 600 },
            browser: 'chromium',
            url: 'data:text/html'
          };

          // Create baseline
          await page.setContent(baseHtml);
          await page.waitForLoadState('networkidle');

          await workflowManager.runVisualTest(page, testId, options, metadata, 'system');

          // Create failing comparison
          await page.setContent(modifiedHtml);
          await page.waitForLoadState('networkidle');

          const comparisonResult = await workflowManager.runVisualTest(
            page,
            testId,
            options,
            metadata,
            'test-user'
          );

          // Should create approval request for significant difference
          const pendingApprovals = workflowManager.getPendingApprovals();
          const approval = pendingApprovals.find(a => a.testId === testId);

          if (approval) {
            const isAuthorized = approvalConfig.approvers.includes(approver);

            if (action === 'approve') {
              const success = await workflowManager.approveComparison(
                approval.id,
                approver,
                reason || 'Test approval'
              );

              if (isAuthorized) {
                expect(success).toBe(true);
                
                // Approval should be removed from pending
                const updatedPending = workflowManager.getPendingApprovals();
                const stillPending = updatedPending.find(a => a.id === approval.id);
                expect(stillPending).toBeFalsy();

              } else {
                expect(success).toBe(false);
                
                // Should still be pending
                const stillPending = workflowManager.getPendingApprovals();
                const pendingApproval = stillPending.find(a => a.id === approval.id);
                expect(pendingApproval).toBeTruthy();
                expect(pendingApproval!.status).toBe('pending');
              }

            } else { // reject
              const success = await workflowManager.rejectComparison(
                approval.id,
                approver,
                reason || 'Test rejection'
              );

              if (isAuthorized) {
                expect(success).toBe(true);
                
                // Rejection should be removed from pending
                const updatedPending = workflowManager.getPendingApprovals();
                const stillPending = updatedPending.find(a => a.id === approval.id);
                expect(stillPending).toBeFalsy();

              } else {
                expect(success).toBe(false);
                
                // Should still be pending
                const stillPending = workflowManager.getPendingApprovals();
                const pendingApproval = stillPending.find(a => a.id === approval.id);
                expect(pendingApproval).toBeTruthy();
                expect(pendingApproval!.status).toBe('pending');
              }
            }
          }
        }
      ),
      { numRuns: 10 }
    );
  });

  it('should auto-approve changes below threshold consistently', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          testId: fc.string({ minLength: 1, maxLength: 50 }),
          testName: fc.string({ minLength: 1, maxLength: 50 }),
          minorChange: fc.record({
            colorShift: fc.integer({ min: 1, max: 10 }), // Small color change
            sizeChange: fc.integer({ min: 1, max: 5 })   // Small size change
          })
        }),
        async ({ testId, testName, minorChange }) => {
          // Configure for auto-approval
          const autoApprovalConfig: ApprovalWorkflowConfig = {
            requireApproval: true,
            approvers: ['test-user'],
            autoApproveThreshold: 2.0, // 2% auto-approve threshold
            notificationWebhook: undefined
          };

          const autoApprovalWorkflow = new VisualRegressionWorkflowManager(
            engine,
            testConfig,
            autoApprovalConfig
          );

          await page.setViewportSize({ width: 800, height: 600 });

          const baseHtml = `
            <html>
              <body style="margin: 0; padding: 20px; font-family: Arial; background: white;">
                <h1>Base Content</h1>
                <div style="width: 100px; height: 100px; background: rgb(100, 100, 100);"></div>
              </body>
            </html>
          `;

          // Create minor modification
          const modifiedHtml = `
            <html>
              <body style="margin: 0; padding: 20px; font-family: Arial; background: white;">
                <h1>Base Content</h1>
                <div style="width: ${100 + minorChange.sizeChange}px; height: ${100 + minorChange.sizeChange}px; background: rgb(${100 + minorChange.colorShift}, ${100 + minorChange.colorShift}, ${100 + minorChange.colorShift});"></div>
              </body>
            </html>
          `;

          const options: VisualTestOptions = {
            name: testName,
            fullPage: true,
            threshold: 5.0 // High threshold to allow minor changes
          };

          const metadata = {
            viewport: { width: 800, height: 600 },
            browser: 'chromium',
            url: 'data:text/html'
          };

          // Create baseline
          await page.setContent(baseHtml);
          await page.waitForLoadState('networkidle');

          const baselineResult = await autoApprovalWorkflow.runVisualTest(
            page,
            testId,
            options,
            metadata,
            'test-user'
          );

          expect(baselineResult.status).toBe('new');

          // Clear baseline approval
          const baselineApprovals = autoApprovalWorkflow.getPendingApprovals();
          for (const approval of baselineApprovals) {
            if (approval.testId === testId) {
              await autoApprovalWorkflow.approveComparison(
                approval.id,
                'test-user',
                'Approve baseline'
              );
            }
          }

          // Test with minor modification
          await page.setContent(modifiedHtml);
          await page.waitForLoadState('networkidle');

          const comparisonResult = await autoApprovalWorkflow.runVisualTest(
            page,
            testId,
            options,
            metadata,
            'test-user'
          );

          // Check if change was auto-approved
          const pendingApprovals = autoApprovalWorkflow.getPendingApprovals();
          const relevantApproval = pendingApprovals.find(a => a.testId === testId);

          if (comparisonResult.percentageDifference <= autoApprovalConfig.autoApproveThreshold) {
            // Should be auto-approved (no pending approval)
            expect(relevantApproval).toBeFalsy();
            expect(comparisonResult.status).toBe('passed');
          } else {
            // Should require manual approval
            expect(relevantApproval).toBeTruthy();
            expect(relevantApproval!.status).toBe('pending');
          }

          // Verify difference is reasonable for minor changes
          expect(comparisonResult.percentageDifference).toBeLessThan(10);
        }
      ),
      { numRuns: 8 }
    );
  });

  it('should generate workflow reports with accurate statistics', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          testId: fc.string({ minLength: 1, maxLength: 50 }),
          testName: fc.string({ minLength: 1, maxLength: 50 }),
          numberOfTests: fc.integer({ min: 2, max: 5 })
        }),
        async ({ testId, testName, numberOfTests }) => {
          await page.setViewportSize({ width: 800, height: 600 });

          const metadata = {
            viewport: { width: 800, height: 600 },
            browser: 'chromium',
            url: 'data:text/html'
          };

          // Create multiple test scenarios
          for (let i = 0; i < numberOfTests; i++) {
            const html = `
              <html>
                <body style="margin: 0; padding: 20px; font-family: Arial;">
                  <h1>Test ${i}</h1>
                  <div style="width: ${100 + i * 20}px; height: ${100 + i * 20}px; background: hsl(${i * 60}, 70%, 50%);"></div>
                </body>
              </html>
            `;

            const options: VisualTestOptions = {
              name: `${testName}-${i}`,
              fullPage: true,
              threshold: 1.0
            };

            await page.setContent(html);
            await page.waitForLoadState('networkidle');

            await workflowManager.runVisualTest(
              page,
              testId,
              options,
              metadata,
              'test-user'
            );
          }

          // Generate workflow report
          const report = await workflowManager.generateWorkflowReport(testId);

          // Verify report structure
          expect(report.testId).toBe(testId);
          expect(report.generatedAt).toBeInstanceOf(Date);
          expect(report.totalComparisons).toBeGreaterThanOrEqual(0);
          expect(report.pendingApprovals).toBeGreaterThanOrEqual(0);
          expect(report.approvedComparisons).toBeGreaterThanOrEqual(0);
          expect(report.rejectedComparisons).toBeGreaterThanOrEqual(0);
          expect(report.autoApprovedComparisons).toBeGreaterThanOrEqual(0);
          expect(report.averageApprovalTime).toBeGreaterThanOrEqual(0);

          // Verify pending approvals count matches actual pending
          const pendingApprovals = workflowManager.getPendingApprovals();
          const testPendingApprovals = pendingApprovals.filter(a => a.testId === testId);
          expect(report.pendingApprovals).toBe(testPendingApprovals.length);
        }
      ),
      { numRuns: 6 }
    );
  });
});