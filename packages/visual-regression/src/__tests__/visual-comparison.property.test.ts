import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';
import { chromium, Browser, Page } from 'playwright';
import { VisualRegressionEngine } from '../visual-regression-engine';
import { VisualRegressionWorkflowManager } from '../workflow-manager';
import { VisualRegressionConfig, VisualTestOptions, ApprovalWorkflowConfig } from '../types';
import { mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';

/**
 * Property 14: Visual Comparison Round Trip
 * Validates: Requirements 7.1, 7.2, 7.3
 * Test that baseline capture and comparison works accurately
 * Verify difference calculation and percentage accuracy
 */

describe('Property 14: Visual Comparison Round Trip', () => {
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
    const baseDir = join(process.cwd(), 'test-baselines');
    const outputDir = join(process.cwd(), 'test-output');
    
    if (existsSync(baseDir)) rmSync(baseDir, { recursive: true });
    if (existsSync(outputDir)) rmSync(outputDir, { recursive: true });
    
    mkdirSync(baseDir, { recursive: true });
    mkdirSync(outputDir, { recursive: true });

    testConfig = {
      baselineDir: baseDir,
      outputDir: outputDir,
      threshold: 0.1,
      includeAA: false,
      storage: {
        type: 'local'
      }
    };

    approvalConfig = {
      requireApproval: false,
      approvers: ['test-user'],
      autoApproveThreshold: 1.0,
      notificationWebhook: undefined
    };

    engine = new VisualRegressionEngine(testConfig);
    workflowManager = new VisualRegressionWorkflowManager(engine, testConfig, approvalConfig);
  });

  afterEach(async () => {
    await page?.close();
    await browser?.close();

    // Cleanup test directories
    const baseDir = join(process.cwd(), 'test-baselines');
    const outputDir = join(process.cwd(), 'test-output');
    
    if (existsSync(baseDir)) rmSync(baseDir, { recursive: true });
    if (existsSync(outputDir)) rmSync(outputDir, { recursive: true });
  });

  it('should create baseline and compare identical images with zero difference', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          testId: fc.string({ minLength: 1, maxLength: 50 }),
          testName: fc.string({ minLength: 1, maxLength: 50 }),
          htmlContent: fc.string({ minLength: 10, maxLength: 500 }),
          viewport: fc.record({
            width: fc.integer({ min: 800, max: 1920 }),
            height: fc.integer({ min: 600, max: 1080 })
          })
        }),
        async ({ testId, testName, htmlContent, viewport }) => {
          // Set viewport
          await page.setViewportSize(viewport);
          
          // Create test page
          const testHtml = `
            <html>
              <body style="margin: 0; padding: 20px; font-family: Arial;">
                <h1>Test Page</h1>
                <div>${htmlContent}</div>
              </body>
            </html>
          `;
          
          await page.setContent(testHtml);
          await page.waitForLoadState('networkidle');

          const options: VisualTestOptions = {
            name: testName,
            fullPage: true,
            threshold: 0.0 // Expect exact match
          };

          const metadata = {
            viewport,
            browser: 'chromium',
            url: 'data:text/html'
          };

          // First comparison should create baseline
          const firstResult = await workflowManager.runVisualTest(
            page,
            testId,
            options,
            metadata
          );

          expect(firstResult.status).toBe('new');
          expect(firstResult.pixelDifference).toBe(0);
          expect(firstResult.percentageDifference).toBe(0);

          // Second comparison with identical content should pass
          await page.setContent(testHtml);
          await page.waitForLoadState('networkidle');

          const secondResult = await workflowManager.runVisualTest(
            page,
            testId,
            options,
            metadata
          );

          expect(secondResult.status).toBe('passed');
          expect(secondResult.pixelDifference).toBe(0);
          expect(secondResult.percentageDifference).toBe(0);
          expect(secondResult.baselineImagePath).toBeTruthy();
        }
      ),
      { numRuns: 20 }
    );
  });

  it('should detect visual differences and calculate accurate percentages', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          testId: fc.string({ minLength: 1, maxLength: 50 }),
          testName: fc.string({ minLength: 1, maxLength: 50 }),
          baseContent: fc.string({ minLength: 10, maxLength: 200 }),
          modifiedContent: fc.string({ minLength: 10, maxLength: 200 }),
          viewport: fc.record({
            width: fc.integer({ min: 800, max: 1200 }),
            height: fc.integer({ min: 600, max: 800 })
          })
        }),
        async ({ testId, testName, baseContent, modifiedContent, viewport }) => {
          // Skip if contents are identical
          if (baseContent === modifiedContent) return;

          await page.setViewportSize(viewport);

          const baseHtml = `
            <html>
              <body style="margin: 0; padding: 20px; font-family: Arial; background: white;">
                <h1>Base Content</h1>
                <div style="padding: 10px; border: 1px solid #ccc;">
                  ${baseContent}
                </div>
              </body>
            </html>
          `;

          const modifiedHtml = `
            <html>
              <body style="margin: 0; padding: 20px; font-family: Arial; background: white;">
                <h1>Modified Content</h1>
                <div style="padding: 10px; border: 1px solid #ccc;">
                  ${modifiedContent}
                </div>
              </body>
            </html>
          `;

          const options: VisualTestOptions = {
            name: testName,
            fullPage: true,
            threshold: 50.0 // Allow large differences for this test
          };

          const metadata = {
            viewport,
            browser: 'chromium',
            url: 'data:text/html'
          };

          // Create baseline with base content
          await page.setContent(baseHtml);
          await page.waitForLoadState('networkidle');

          const baselineResult = await workflowManager.runVisualTest(
            page,
            testId,
            options,
            metadata
          );

          expect(baselineResult.status).toBe('new');

          // Compare with modified content
          await page.setContent(modifiedHtml);
          await page.waitForLoadState('networkidle');

          const comparisonResult = await workflowManager.runVisualTest(
            page,
            testId,
            options,
            metadata
          );

          // Should detect differences
          expect(comparisonResult.pixelDifference).toBeGreaterThan(0);
          expect(comparisonResult.percentageDifference).toBeGreaterThan(0);
          expect(comparisonResult.percentageDifference).toBeLessThanOrEqual(100);
          
          // Status should be based on threshold
          if (comparisonResult.percentageDifference <= options.threshold!) {
            expect(comparisonResult.status).toBe('passed');
          } else {
            expect(comparisonResult.status).toBe('failed');
          }

          // Should have diff image if failed
          if (comparisonResult.status === 'failed') {
            expect(comparisonResult.diffImagePath).toBeTruthy();
          }
        }
      ),
      { numRuns: 15 }
    );
  });

  it('should handle ignore regions correctly', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          testId: fc.string({ minLength: 1, maxLength: 50 }),
          testName: fc.string({ minLength: 1, maxLength: 50 }),
          dynamicContent: fc.string({ minLength: 5, maxLength: 100 }),
          staticContent: fc.string({ minLength: 5, maxLength: 100 }),
          ignoreRegion: fc.record({
            x: fc.integer({ min: 0, max: 200 }),
            y: fc.integer({ min: 100, max: 300 }),
            width: fc.integer({ min: 100, max: 300 }),
            height: fc.integer({ min: 50, max: 150 })
          })
        }),
        async ({ testId, testName, dynamicContent, staticContent, ignoreRegion }) => {
          await page.setViewportSize({ width: 800, height: 600 });

          const createHtml = (content: string) => `
            <html>
              <body style="margin: 0; padding: 20px; font-family: Arial;">
                <h1>Static Content</h1>
                <div style="padding: 10px;">${staticContent}</div>
                <div id="dynamic" style="position: absolute; left: ${ignoreRegion.x}px; top: ${ignoreRegion.y}px; width: ${ignoreRegion.width}px; height: ${ignoreRegion.height}px; background: red; color: white; padding: 10px;">
                  ${content}
                </div>
              </body>
            </html>
          `;

          const options: VisualTestOptions = {
            name: testName,
            fullPage: true,
            threshold: 1.0,
            ignoreRegions: [ignoreRegion]
          };

          const metadata = {
            viewport: { width: 800, height: 600 },
            browser: 'chromium',
            url: 'data:text/html'
          };

          // Create baseline
          await page.setContent(createHtml(dynamicContent));
          await page.waitForLoadState('networkidle');

          const baselineResult = await workflowManager.runVisualTest(
            page,
            testId,
            options,
            metadata
          );

          expect(baselineResult.status).toBe('new');

          // Compare with different dynamic content but same static content
          const differentDynamicContent = dynamicContent + '_modified';
          await page.setContent(createHtml(differentDynamicContent));
          await page.waitForLoadState('networkidle');

          const comparisonResult = await workflowManager.runVisualTest(
            page,
            testId,
            options,
            metadata
          );

          // Should pass because ignore region masks the differences
          // Note: This test assumes the ignore region implementation works correctly
          expect(comparisonResult.status).toBe('passed');
          expect(comparisonResult.percentageDifference).toBeLessThanOrEqual(options.threshold!);
        }
      ),
      { numRuns: 10 }
    );
  });

  it('should maintain baseline versioning consistency', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          testId: fc.string({ minLength: 1, maxLength: 50 }),
          testName: fc.string({ minLength: 1, maxLength: 50 }),
          versions: fc.array(
            fc.string({ minLength: 10, maxLength: 100 }),
            { minLength: 2, maxLength: 5 }
          )
        }),
        async ({ testId, testName, versions }) => {
          await page.setViewportSize({ width: 800, height: 600 });

          const options: VisualTestOptions = {
            name: testName,
            fullPage: true,
            threshold: 0.0
          };

          const metadata = {
            viewport: { width: 800, height: 600 },
            browser: 'chromium',
            url: 'data:text/html'
          };

          let currentBaseline: any = null;

          // Create baseline with first version
          const firstHtml = `
            <html>
              <body style="margin: 0; padding: 20px; font-family: Arial;">
                <h1>Version 1</h1>
                <div>${versions[0]}</div>
              </body>
            </html>
          `;

          await page.setContent(firstHtml);
          await page.waitForLoadState('networkidle');

          const firstResult = await workflowManager.runVisualTest(
            page,
            testId,
            options,
            metadata
          );

          expect(firstResult.status).toBe('new');
          currentBaseline = engine.getBaseline(testId, testName);
          expect(currentBaseline).toBeTruthy();
          expect(currentBaseline!.version).toBe(1);

          // Update baseline with subsequent versions
          for (let i = 1; i < versions.length; i++) {
            const versionHtml = `
              <html>
                <body style="margin: 0; padding: 20px; font-family: Arial;">
                  <h1>Version ${i + 1}</h1>
                  <div>${versions[i]}</div>
                </body>
              </html>
            `;

            await page.setContent(versionHtml);
            await page.waitForLoadState('networkidle');

            // Capture new screenshot
            const screenshotPath = await engine.captureScreenshot(page, testId, options);
            
            // Update baseline
            if (currentBaseline) {
              const updatedBaseline = await engine.updateBaseline(
                currentBaseline.id,
                screenshotPath,
                'test-user',
                `Updated to version ${i + 1}`
              );

              expect(updatedBaseline.version).toBe(i + 1);
              expect(updatedBaseline.id).toBe(currentBaseline.id);
              currentBaseline = updatedBaseline;
            }
          }

          // Verify final baseline version
          const finalBaseline = engine.getBaseline(testId, testName);
          expect(finalBaseline).toBeTruthy();
          expect(finalBaseline!.version).toBe(versions.length);
          expect(finalBaseline!.id).toBe(currentBaseline!.id);
        }
      ),
      { numRuns: 10 }
    );
  });

  it('should handle batch comparisons consistently', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          testId: fc.string({ minLength: 1, maxLength: 50 }),
          tests: fc.array(
            fc.record({
              name: fc.string({ minLength: 1, maxLength: 30 }),
              content: fc.string({ minLength: 10, maxLength: 100 })
            }),
            { minLength: 2, maxLength: 5 }
          ),
          parallel: fc.boolean()
        }),
        async ({ testId, tests, parallel }) => {
          await page.setViewportSize({ width: 800, height: 600 });

          const metadata = {
            viewport: { width: 800, height: 600 },
            browser: 'chromium',
            url: 'data:text/html'
          };

          // Create test pages for each test
          const testPages = await Promise.all(
            tests.map(async (test) => {
              const testPage = await browser.newPage();
              await testPage.setViewportSize({ width: 800, height: 600 });
              
              const html = `
                <html>
                  <body style="margin: 0; padding: 20px; font-family: Arial;">
                    <h1>${test.name}</h1>
                    <div>${test.content}</div>
                  </body>
                </html>
              `;
              
              await testPage.setContent(html);
              await testPage.waitForLoadState('networkidle');
              
              return {
                name: test.name,
                page: testPage,
                options: {
                  name: test.name,
                  fullPage: true,
                  threshold: 1.0
                } as VisualTestOptions
              };
            })
          );

          try {
            // Run batch comparison
            const report = await workflowManager.runBatchComparison({
              testId,
              tests: testPages,
              metadata,
              parallel,
              maxConcurrency: 2
            });

            // Verify report structure
            expect(report.testId).toBe(testId);
            expect(report.totalComparisons).toBe(tests.length);
            expect(report.results).toHaveLength(tests.length);
            expect(report.generatedAt).toBeInstanceOf(Date);

            // All should be new baselines
            expect(report.new).toBe(tests.length);
            expect(report.passed).toBe(0);
            expect(report.failed).toBe(0);

            // Verify each result
            report.results.forEach((result, index) => {
              expect(result.testId).toBe(testId);
              expect(result.status).toBe('new');
              expect(result.pixelDifference).toBe(0);
              expect(result.percentageDifference).toBe(0);
            });

            // Verify summary calculations
            expect(report.summary.successRate).toBe(100); // New baselines count as success
            expect(report.summary.avgPixelDifference).toBe(0);
            expect(report.summary.maxPixelDifference).toBe(0);

          } finally {
            // Cleanup test pages
            await Promise.all(testPages.map(tp => tp.page.close()));
          }
        }
      ),
      { numRuns: 8 }
    );
  });

  it('should calculate difference percentages accurately across different image sizes', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          testId: fc.string({ minLength: 1, maxLength: 50 }),
          testName: fc.string({ minLength: 1, maxLength: 50 }),
          viewport: fc.record({
            width: fc.integer({ min: 400, max: 1200 }),
            height: fc.integer({ min: 300, max: 800 })
          }),
          changeSize: fc.constantFrom('small', 'medium', 'large')
        }),
        async ({ testId, testName, viewport, changeSize }) => {
          await page.setViewportSize(viewport);

          // Create base content
          const baseHtml = `
            <html>
              <body style="margin: 0; padding: 20px; font-family: Arial; background: white;">
                <h1>Base Content</h1>
                <div style="width: 100px; height: 100px; background: blue;"></div>
              </body>
            </html>
          `;

          // Create modified content with different change sizes
          const changeConfigs = {
            small: { width: 110, height: 110, color: 'lightblue' },
            medium: { width: 150, height: 150, color: 'green' },
            large: { width: 200, height: 200, color: 'red' }
          };

          const config = changeConfigs[changeSize];
          const modifiedHtml = `
            <html>
              <body style="margin: 0; padding: 20px; font-family: Arial; background: white;">
                <h1>Modified Content</h1>
                <div style="width: ${config.width}px; height: ${config.height}px; background: ${config.color};"></div>
              </body>
            </html>
          `;

          const options: VisualTestOptions = {
            name: testName,
            fullPage: true,
            threshold: 50.0
          };

          const metadata = {
            viewport,
            browser: 'chromium',
            url: 'data:text/html'
          };

          // Create baseline
          await page.setContent(baseHtml);
          await page.waitForLoadState('networkidle');

          const baselineResult = await workflowManager.runVisualTest(
            page,
            testId,
            options,
            metadata
          );

          expect(baselineResult.status).toBe('new');

          // Compare with modified content
          await page.setContent(modifiedHtml);
          await page.waitForLoadState('networkidle');

          const comparisonResult = await workflowManager.runVisualTest(
            page,
            testId,
            options,
            metadata
          );

          // Verify difference detection
          expect(comparisonResult.pixelDifference).toBeGreaterThan(0);
          expect(comparisonResult.percentageDifference).toBeGreaterThan(0);
          expect(comparisonResult.percentageDifference).toBeLessThanOrEqual(100);

          // Larger changes should generally result in higher percentages
          // (though this isn't guaranteed due to anti-aliasing and other factors)
          expect(comparisonResult.percentageDifference).toBeGreaterThan(0.1);

          // Verify metadata consistency
          expect(comparisonResult.metadata.viewport).toEqual(viewport);
          expect(comparisonResult.metadata.browser).toBe('chromium');
          expect(comparisonResult.metadata.comparedAt).toBeInstanceOf(Date);
        }
      ),
      { numRuns: 12 }
    );
  });
});