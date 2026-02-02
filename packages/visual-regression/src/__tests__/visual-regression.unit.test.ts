import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { VisualRegressionEngine } from '../visual-regression-engine';
import { VisualRegressionWorkflowManager } from '../workflow-manager';
import { VisualRegressionConfig, ApprovalWorkflowConfig } from '../types';
import { mkdirSync, rmSync, existsSync, writeFileSync } from 'fs';
import { join } from 'path';

// Mock playwright
vi.mock('playwright', () => ({
  chromium: {
    launch: vi.fn(() => ({
      newPage: vi.fn(() => ({
        setViewportSize: vi.fn(),
        setContent: vi.fn(),
        waitForLoadState: vi.fn(),
        screenshot: vi.fn(() => Buffer.from('mock-screenshot')),
        locator: vi.fn(() => ({
          screenshot: vi.fn(() => Buffer.from('mock-element-screenshot')),
          boundingBox: vi.fn(() => ({ x: 10, y: 10, width: 100, height: 100 }))
        })),
        addStyleTag: vi.fn(),
        evaluate: vi.fn(),
        close: vi.fn()
      })),
      close: vi.fn()
    }))
  }
}));

// Mock sharp
vi.mock('sharp', () => {
  const mockSharp = vi.fn(() => ({
    metadata: vi.fn(() => ({ width: 800, height: 600 })),
    png: vi.fn(() => ({
      raw: vi.fn(() => ({
        toBuffer: vi.fn(() => ({
          resolveWithObject: true,
          data: Buffer.alloc(800 * 600 * 4),
          info: { width: 800, height: 600 }
        }))
      })),
      toFile: vi.fn(),
      toBuffer: vi.fn(() => Buffer.from('mock-png'))
    })),
    composite: vi.fn(() => ({
      png: vi.fn(() => ({
        toBuffer: vi.fn(() => Buffer.from('mock-composite'))
      }))
    }))
  }));
  
  mockSharp.default = mockSharp;
  return { default: mockSharp };
});

// Mock pixelmatch
vi.mock('pixelmatch', () => ({
  default: vi.fn(() => 100) // Mock pixel difference
}));

describe('Visual Regression Engine - Unit Tests (Edge Cases)', () => {
  let engine: VisualRegressionEngine;
  let workflowManager: VisualRegressionWorkflowManager;
  let testConfig: VisualRegressionConfig;
  let approvalConfig: ApprovalWorkflowConfig;

  beforeEach(() => {
    // Create test directories
    const baseDir = join(process.cwd(), 'test-unit-baselines');
    const outputDir = join(process.cwd(), 'test-unit-output');
    
    if (existsSync(baseDir)) rmSync(baseDir, { recursive: true });
    if (existsSync(outputDir)) rmSync(outputDir, { recursive: true });
    
    mkdirSync(baseDir, { recursive: true });
    mkdirSync(outputDir, { recursive: true });

    testConfig = {
      baselineDir: baseDir,
      outputDir: outputDir,
      threshold: 1.0,
      includeAA: false,
      storage: {
        type: 'local'
      }
    };

    approvalConfig = {
      requireApproval: true,
      approvers: ['test-user'],
      autoApproveThreshold: 0.5,
      notificationWebhook: undefined
    };

    engine = new VisualRegressionEngine(testConfig);
    workflowManager = new VisualRegressionWorkflowManager(engine, testConfig, approvalConfig);
  });

  afterEach(() => {
    // Cleanup test directories
    const baseDir = join(process.cwd(), 'test-unit-baselines');
    const outputDir = join(process.cwd(), 'test-unit-output');
    
    if (existsSync(baseDir)) rmSync(baseDir, { recursive: true });
    if (existsSync(outputDir)) rmSync(outputDir, { recursive: true });
  });

  describe('Large Image Handling', () => {
    it('should handle very large images without memory issues', async () => {
      const mockPage = {
        screenshot: vi.fn(() => Buffer.alloc(10 * 1024 * 1024)), // 10MB image
        setViewportSize: vi.fn(),
        setContent: vi.fn(),
        waitForLoadState: vi.fn()
      } as any;

      const options = {
        name: 'large-image-test',
        fullPage: true
      };

      // Should not throw memory errors
      const screenshotPath = await engine.captureScreenshot(mockPage, 'test-large', options);
      expect(screenshotPath).toBeTruthy();
      expect(screenshotPath).toContain('large-image-test');
    });

    it('should handle images with different dimensions gracefully', async () => {
      const sharp = await import('sharp');
      
      // Mock different image dimensions
      vi.mocked(sharp.default).mockImplementation(() => ({
        metadata: vi.fn(() => ({ width: 1920, height: 1080 })),
        png: vi.fn(() => ({
          raw: vi.fn(() => ({
            toBuffer: vi.fn(() => ({
              resolveWithObject: true,
              data: Buffer.alloc(1920 * 1080 * 4),
              info: { width: 1920, height: 1080 }
            }))
          }))
        }))
      }) as any);

      const mockPage = {
        screenshot: vi.fn(() => Buffer.from('large-screenshot')),
        setViewportSize: vi.fn(),
        setContent: vi.fn(),
        waitForLoadState: vi.fn()
      } as any;

      const options = {
        name: 'dimension-test',
        fullPage: true
      };

      const screenshotPath = await engine.captureScreenshot(mockPage, 'test-dimensions', options);
      expect(screenshotPath).toBeTruthy();
    });
  });

  describe('Comparison Performance Edge Cases', () => {
    it('should handle pixel comparison timeout gracefully', async () => {
      const pixelmatch = await import('pixelmatch');
      
      // Mock slow pixelmatch operation
      vi.mocked(pixelmatch.default).mockImplementation(() => {
        // Simulate slow operation
        const start = Date.now();
        while (Date.now() - start < 100) {
          // Busy wait
        }
        return 500;
      });

      // Create mock baseline
      const baselineImagePath = join(testConfig.baselineDir, 'timeout-test-baseline.png');
      writeFileSync(baselineImagePath, Buffer.from('mock-baseline'));

      const actualImagePath = join(testConfig.outputDir, 'timeout-test-actual.png');
      writeFileSync(actualImagePath, Buffer.from('mock-actual'));

      const options = {
        name: 'timeout-test',
        fullPage: true,
        threshold: 1.0
      };

      const metadata = {
        viewport: { width: 800, height: 600 },
        browser: 'chromium',
        url: 'test://timeout'
      };

      // Should complete without hanging
      const result = await engine.compareWithBaseline(
        'test-timeout',
        actualImagePath,
        options,
        metadata
      );

      expect(result).toBeTruthy();
      expect(result.pixelDifference).toBe(500);
    });

    it('should handle corrupted image files gracefully', async () => {
      // Create corrupted baseline file
      const baselineImagePath = join(testConfig.baselineDir, 'corrupted-test-baseline.png');
      writeFileSync(baselineImagePath, Buffer.from('not-a-valid-image'));

      const actualImagePath = join(testConfig.outputDir, 'corrupted-test-actual.png');
      writeFileSync(actualImagePath, Buffer.from('also-not-a-valid-image'));

      const sharp = await import('sharp');
      
      // Mock sharp to throw error for corrupted images
      vi.mocked(sharp.default).mockImplementation(() => {
        throw new Error('Invalid image format');
      });

      const options = {
        name: 'corrupted-test',
        fullPage: true,
        threshold: 1.0
      };

      const metadata = {
        viewport: { width: 800, height: 600 },
        browser: 'chromium',
        url: 'test://corrupted'
      };

      // Should handle error gracefully
      await expect(engine.compareWithBaseline(
        'test-corrupted',
        actualImagePath,
        options,
        metadata
      )).rejects.toThrow('Invalid image format');
    });
  });

  describe('Ignore Regions Edge Cases', () => {
    it('should handle overlapping ignore regions', async () => {
      const mockPage = {
        addStyleTag: vi.fn(),
        evaluate: vi.fn(),
        locator: vi.fn(() => ({
          boundingBox: vi.fn(() => ({ x: 10, y: 10, width: 100, height: 100 }))
        })),
        screenshot: vi.fn(() => Buffer.from('mock-screenshot')),
        setViewportSize: vi.fn(),
        setContent: vi.fn(),
        waitForLoadState: vi.fn()
      } as any;

      const options = {
        name: 'overlapping-regions-test',
        fullPage: true,
        ignoreRegions: [
          { x: 10, y: 10, width: 100, height: 100 },
          { x: 50, y: 50, width: 100, height: 100 }, // Overlapping
          { x: 80, y: 80, width: 50, height: 50 }    // Inside first region
        ]
      };

      const metadata = {
        viewport: { width: 800, height: 600 },
        browser: 'chromium',
        url: 'test://overlapping'
      };

      // Should handle overlapping regions without errors
      const result = await workflowManager.runVisualTest(
        mockPage,
        'test-overlapping',
        options,
        metadata
      );

      expect(result).toBeTruthy();
      expect(mockPage.addStyleTag).toHaveBeenCalled();
      expect(mockPage.evaluate).toHaveBeenCalled();
    });

    it('should handle ignore regions outside viewport', async () => {
      const mockPage = {
        addStyleTag: vi.fn(),
        evaluate: vi.fn(),
        locator: vi.fn(() => ({
          boundingBox: vi.fn(() => null) // Element not found
        })),
        screenshot: vi.fn(() => Buffer.from('mock-screenshot')),
        setViewportSize: vi.fn(),
        setContent: vi.fn(),
        waitForLoadState: vi.fn()
      } as any;

      const options = {
        name: 'outside-viewport-test',
        fullPage: true,
        ignoreRegions: [
          { x: 2000, y: 2000, width: 100, height: 100 }, // Outside viewport
          { x: -100, y: -100, width: 50, height: 50 }     // Negative coordinates
        ]
      };

      const metadata = {
        viewport: { width: 800, height: 600 },
        browser: 'chromium',
        url: 'test://outside'
      };

      // Should handle out-of-bounds regions gracefully
      const result = await workflowManager.runVisualTest(
        mockPage,
        'test-outside',
        options,
        metadata
      );

      expect(result).toBeTruthy();
    });
  });

  describe('Baseline Versioning Edge Cases', () => {
    it('should handle concurrent baseline updates', async () => {
      // Create initial baseline
      const baselineImagePath = join(testConfig.baselineDir, 'concurrent-test-baseline.png');
      writeFileSync(baselineImagePath, Buffer.from('initial-baseline'));

      const baseline = await engine.createBaseline(
        'test-concurrent',
        baselineImagePath,
        { name: 'concurrent-test', fullPage: true },
        {
          viewport: { width: 800, height: 600 },
          browser: 'chromium',
          url: 'test://concurrent'
        }
      );

      // Simulate concurrent updates
      const updatePromises = [
        engine.updateBaseline(baseline.id, baselineImagePath, 'user1', 'Update 1'),
        engine.updateBaseline(baseline.id, baselineImagePath, 'user2', 'Update 2'),
        engine.updateBaseline(baseline.id, baselineImagePath, 'user3', 'Update 3')
      ];

      // Should handle concurrent updates without corruption
      const results = await Promise.allSettled(updatePromises);
      
      // At least one should succeed
      const successful = results.filter(r => r.status === 'fulfilled');
      expect(successful.length).toBeGreaterThan(0);

      // Final baseline should have a valid version
      const finalBaseline = engine.getBaseline('test-concurrent', 'concurrent-test');
      expect(finalBaseline).toBeTruthy();
      expect(finalBaseline!.version).toBeGreaterThan(1);
    });

    it('should handle rollback to non-existent version', async () => {
      // Create baseline
      const baselineImagePath = join(testConfig.baselineDir, 'rollback-test-baseline.png');
      writeFileSync(baselineImagePath, Buffer.from('baseline'));

      const baseline = await engine.createBaseline(
        'test-rollback',
        baselineImagePath,
        { name: 'rollback-test', fullPage: true },
        {
          viewport: { width: 800, height: 600 },
          browser: 'chromium',
          url: 'test://rollback'
        }
      );

      // Try to rollback to non-existent version
      await expect(engine.rollbackBaseline(baseline.id, 999))
        .rejects.toThrow('Version 999 not found');
    });
  });

  describe('Approval Workflow Edge Cases', () => {
    it('should handle approval of non-existent comparison', async () => {
      const success = await workflowManager.approveComparison(
        'non-existent-id',
        'test-user',
        'Test approval'
      );

      expect(success).toBe(false);
    });

    it('should handle approval by unauthorized user', async () => {
      // Create a mock approval request
      const mockPage = {
        screenshot: vi.fn(() => Buffer.from('mock-screenshot')),
        setViewportSize: vi.fn(),
        setContent: vi.fn(),
        waitForLoadState: vi.fn()
      } as any;

      const options = {
        name: 'auth-test',
        fullPage: true,
        threshold: 0.1 // Low threshold to trigger approval
      };

      const metadata = {
        viewport: { width: 800, height: 600 },
        browser: 'chromium',
        url: 'test://auth'
      };

      // This should create an approval request
      await workflowManager.runVisualTest(mockPage, 'test-auth', options, metadata);

      const pendingApprovals = workflowManager.getPendingApprovals();
      const approval = pendingApprovals[0];

      if (approval) {
        // Try to approve with unauthorized user
        const success = await workflowManager.approveComparison(
          approval.id,
          'unauthorized-user',
          'Unauthorized approval'
        );

        expect(success).toBe(false);
      }
    });

    it('should handle multiple approval attempts on same request', async () => {
      const mockPage = {
        screenshot: vi.fn(() => Buffer.from('mock-screenshot')),
        setViewportSize: vi.fn(),
        setContent: vi.fn(),
        waitForLoadState: vi.fn()
      } as any;

      const options = {
        name: 'multiple-approval-test',
        fullPage: true,
        threshold: 0.1
      };

      const metadata = {
        viewport: { width: 800, height: 600 },
        browser: 'chromium',
        url: 'test://multiple'
      };

      await workflowManager.runVisualTest(mockPage, 'test-multiple', options, metadata);

      const pendingApprovals = workflowManager.getPendingApprovals();
      const approval = pendingApprovals[0];

      if (approval) {
        // First approval should succeed
        const firstSuccess = await workflowManager.approveComparison(
          approval.id,
          'test-user',
          'First approval'
        );
        expect(firstSuccess).toBe(true);

        // Second approval should fail (already processed)
        const secondSuccess = await workflowManager.approveComparison(
          approval.id,
          'test-user',
          'Second approval'
        );
        expect(secondSuccess).toBe(false);
      }
    });
  });

  describe('Layout Shift Detection Edge Cases', () => {
    it('should handle layout shift detection with no shifts', async () => {
      const mockPage = {
        evaluate: vi.fn(() => Promise.resolve({ cls: 0, shifts: [] }))
      } as any;

      const options = {
        enabled: true,
        threshold: 0.1,
        ignoreElements: [],
        trackingDuration: 1000
      };

      const result = await workflowManager.detectLayoutShifts(mockPage, options);

      expect(result.cls).toBe(0);
      expect(result.shifts).toHaveLength(0);
    });

    it('should handle layout shift detection when disabled', async () => {
      const mockPage = {
        evaluate: vi.fn()
      } as any;

      const options = {
        enabled: false,
        threshold: 0.1,
        ignoreElements: [],
        trackingDuration: 1000
      };

      const result = await workflowManager.detectLayoutShifts(mockPage, options);

      expect(result.cls).toBe(0);
      expect(result.shifts).toHaveLength(0);
      expect(mockPage.evaluate).not.toHaveBeenCalled();
    });

    it('should handle layout shift detection timeout', async () => {
      const mockPage = {
        evaluate: vi.fn(() => new Promise(resolve => {
          setTimeout(() => resolve({ cls: 0.5, shifts: [] }), 50);
        }))
      } as any;

      const options = {
        enabled: true,
        threshold: 0.1,
        ignoreElements: [],
        trackingDuration: 100
      };

      const result = await workflowManager.detectLayoutShifts(mockPage, options);

      expect(result).toBeTruthy();
      expect(typeof result.cls).toBe('number');
      expect(Array.isArray(result.shifts)).toBe(true);
    });
  });

  describe('Batch Processing Edge Cases', () => {
    it('should handle batch processing with failing tests', async () => {
      const mockPages = [
        {
          screenshot: vi.fn(() => Buffer.from('mock-1')),
          setViewportSize: vi.fn(),
          setContent: vi.fn(),
          waitForLoadState: vi.fn()
        },
        {
          screenshot: vi.fn(() => { throw new Error('Screenshot failed'); }),
          setViewportSize: vi.fn(),
          setContent: vi.fn(),
          waitForLoadState: vi.fn()
        },
        {
          screenshot: vi.fn(() => Buffer.from('mock-3')),
          setViewportSize: vi.fn(),
          setContent: vi.fn(),
          waitForLoadState: vi.fn()
        }
      ] as any[];

      const batchOptions = {
        testId: 'batch-fail-test',
        tests: mockPages.map((page, i) => ({
          name: `test-${i}`,
          page,
          options: {
            name: `test-${i}`,
            fullPage: true,
            threshold: 1.0
          }
        })),
        metadata: {
          viewport: { width: 800, height: 600 },
          browser: 'chromium',
          url: 'test://batch'
        },
        parallel: false,
        maxConcurrency: 1
      };

      const report = await workflowManager.runBatchComparison(batchOptions);

      // Should handle partial failures gracefully
      expect(report.testId).toBe('batch-fail-test');
      expect(report.results.length).toBeLessThan(3); // Some tests failed
      expect(report.totalComparisons).toBeLessThan(3);
    });

    it('should handle empty batch processing', async () => {
      const batchOptions = {
        testId: 'empty-batch-test',
        tests: [],
        metadata: {
          viewport: { width: 800, height: 600 },
          browser: 'chromium',
          url: 'test://empty'
        },
        parallel: false,
        maxConcurrency: 1
      };

      const report = await workflowManager.runBatchComparison(batchOptions);

      expect(report.testId).toBe('empty-batch-test');
      expect(report.results).toHaveLength(0);
      expect(report.totalComparisons).toBe(0);
      expect(report.summary.successRate).toBe(0);
    });
  });
});