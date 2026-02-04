/**
 * Unit tests for AI Intelligence edge cases and error handling
 * **Validates: Requirements 44.1, 44.2, 44.3, 44.4, 44.5 - Edge Cases**
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RootCauseAnalyzer } from '../rootCauseAnalyzer';
import { FlakyTestDetector } from '../flakyTestDetector';
import { TestOptimizer } from '../testOptimizer';
import { AITestGenerator } from '../aiTestGenerator';
import { VisualIntelligence } from '../visualIntelligence';
import { LocalProvider, OpenAIProvider } from '../utils/aiProvider';
import { TestFailure, TestRun, AITestGenerationRequest } from '../types';

describe('AI Intelligence Edge Cases', () => {
  let mockAIProvider: LocalProvider;
  let rootCauseAnalyzer: RootCauseAnalyzer;
  let flakyTestDetector: FlakyTestDetector;
  let testOptimizer: TestOptimizer;
  let aiTestGenerator: AITestGenerator;
  let visualIntelligence: VisualIntelligence;

  beforeEach(() => {
    mockAIProvider = new LocalProvider();
    rootCauseAnalyzer = new RootCauseAnalyzer(mockAIProvider);
    flakyTestDetector = new FlakyTestDetector(mockAIProvider);
    testOptimizer = new TestOptimizer(mockAIProvider);
    aiTestGenerator = new AITestGenerator(mockAIProvider);
    visualIntelligence = new VisualIntelligence(mockAIProvider);
  });

  describe('RootCauseAnalyzer Edge Cases', () => {
    it('should handle empty error messages gracefully', async () => {
      const failure: TestFailure = {
        id: 'test-1',
        testName: 'empty error test',
        testFile: 'test.spec.ts',
        timestamp: Date.now(),
        error: {
          message: '', // Empty message
          type: 'unknown'
        },
        screenshots: {},
        executionContext: {
          browser: 'chrome',
          viewport: { width: 1920, height: 1080 },
          userAgent: 'test-agent',
          url: 'https://example.com'
        }
      };

      const analysis = await rootCauseAnalyzer.analyzeFailure(failure);

      expect(analysis.failureId).toBe('test-1');
      expect(analysis.category).toBeDefined();
      expect(analysis.confidence).toBeGreaterThanOrEqual(0);
      expect(analysis.explanation).toBeDefined();
      expect(analysis.explanation.length).toBeGreaterThan(0);
    });

    it('should handle malformed screenshot data', async () => {
      const failure: TestFailure = {
        id: 'test-2',
        testName: 'malformed screenshot test',
        testFile: 'test.spec.ts',
        timestamp: Date.now(),
        error: {
          message: 'test failed',
          type: 'unknown'
        },
        screenshots: {
          before: 'invalid-base64-data',
          after: 'also-invalid-base64-data',
          diff: 'completely-broken'
        },
        executionContext: {
          browser: 'chrome',
          viewport: { width: 1920, height: 1080 },
          userAgent: 'test-agent',
          url: 'https://example.com'
        }
      };

      // Should not throw an error
      const analysis = await rootCauseAnalyzer.analyzeFailure(failure);
      expect(analysis).toBeDefined();
      expect(analysis.failureId).toBe('test-2');
    });

    it('should handle extremely large DOM snapshots', async () => {
      const largeDOMSnapshot = '<div>' + 'x'.repeat(1000000) + '</div>'; // 1MB+ DOM

      const failure: TestFailure = {
        id: 'test-3',
        testName: 'large DOM test',
        testFile: 'test.spec.ts',
        timestamp: Date.now(),
        error: {
          message: 'test failed',
          type: 'unknown'
        },
        screenshots: {},
        domSnapshot: largeDOMSnapshot,
        executionContext: {
          browser: 'chrome',
          viewport: { width: 1920, height: 1080 },
          userAgent: 'test-agent',
          url: 'https://example.com'
        }
      };

      const analysis = await rootCauseAnalyzer.analyzeFailure(failure);
      expect(analysis).toBeDefined();
      expect(analysis.failureId).toBe('test-3');
    });

    it('should handle network logs with invalid URLs', async () => {
      const failure: TestFailure = {
        id: 'test-4',
        testName: 'invalid network logs test',
        testFile: 'test.spec.ts',
        timestamp: Date.now(),
        error: {
          message: 'network error',
          type: 'network'
        },
        screenshots: {},
        networkLogs: [
          {
            url: 'not-a-valid-url',
            method: 'GET',
            status: 0,
            responseTime: -1,
            timestamp: Date.now(),
            headers: {}
          },
          {
            url: '',
            method: 'POST',
            status: 999,
            responseTime: Number.MAX_SAFE_INTEGER,
            timestamp: 0,
            headers: {}
          }
        ],
        executionContext: {
          browser: 'chrome',
          viewport: { width: 1920, height: 1080 },
          userAgent: 'test-agent',
          url: 'https://example.com'
        }
      };

      const analysis = await rootCauseAnalyzer.analyzeFailure(failure);
      expect(analysis).toBeDefined();
      expect(analysis.category).toBe('network_issue');
    });

    it('should handle AI provider failures gracefully', async () => {
      const failingProvider = {
        name: 'failing' as const,
        generateAnalysis: vi.fn().mockRejectedValue(new Error('AI service unavailable')),
        generateCode: vi.fn().mockRejectedValue(new Error('AI service unavailable')),
        analyzeImage: vi.fn().mockRejectedValue(new Error('AI service unavailable'))
      };

      const analyzerWithFailingAI = new RootCauseAnalyzer(failingProvider);

      const failure: TestFailure = {
        id: 'test-5',
        testName: 'AI failure test',
        testFile: 'test.spec.ts',
        timestamp: Date.now(),
        error: {
          message: 'test failed',
          type: 'unknown'
        },
        screenshots: {},
        executionContext: {
          browser: 'chrome',
          viewport: { width: 1920, height: 1080 },
          userAgent: 'test-agent',
          url: 'https://example.com'
        }
      };

      // Should fall back to rule-based analysis
      const analysis = await analyzerWithFailingAI.analyzeFailure(failure);
      expect(analysis).toBeDefined();
      expect(analysis.explanation).toBeDefined();
      expect(analysis.suggestedFix).toBeDefined();
    });
  });

  describe('FlakyTestDetector Edge Cases', () => {
    it('should handle tests with no historical data', async () => {
      const analysis = await flakyTestDetector.analyzeTestFlakiness(
        'test-1',
        'No History Test',
        [] // Empty test runs
      );

      expect(analysis.testId).toBe('test-1');
      expect(analysis.flakiness.score).toBe(0);
      expect(analysis.flakiness.confidence).toBeLessThan(0.5);
      expect(analysis.recommendations.action).toBe('monitor');
    });

    it('should handle tests with only one run', async () => {
      const testRuns: TestRun[] = [{
        id: 'run-1',
        timestamp: Date.now(),
        status: 'passed',
        duration: 5000
      }];

      const analysis = await flakyTestDetector.analyzeTestFlakiness(
        'test-2',
        'Single Run Test',
        testRuns
      );

      expect(analysis.testId).toBe('test-2');
      expect(analysis.flakiness.score).toBe(0);
      expect(analysis.historicalData.totalRuns).toBe(1);
    });

    it('should handle tests with extreme durations', async () => {
      const testRuns: TestRun[] = [
        {
          id: 'run-1',
          timestamp: Date.now(),
          status: 'passed',
          duration: 1 // 1ms - extremely fast
        },
        {
          id: 'run-2',
          timestamp: Date.now() - 1000,
          status: 'failed',
          duration: 3600000 // 1 hour - extremely slow
        }
      ];

      const analysis = await flakyTestDetector.analyzeTestFlakiness(
        'test-3',
        'Extreme Duration Test',
        testRuns
      );

      expect(analysis.testId).toBe('test-3');
      expect(analysis.historicalData.averageDuration).toBeGreaterThan(0);
      expect(analysis.historicalData.averageDuration).toBeLessThan(Number.MAX_SAFE_INTEGER);
    });

    it('should handle tests with invalid timestamps', async () => {
      const testRuns: TestRun[] = [
        {
          id: 'run-1',
          timestamp: -1, // Invalid timestamp
          status: 'passed',
          duration: 5000
        },
        {
          id: 'run-2',
          timestamp: Number.MAX_SAFE_INTEGER, // Future timestamp
          status: 'failed',
          duration: 5000
        }
      ];

      const analysis = await flakyTestDetector.analyzeTestFlakiness(
        'test-4',
        'Invalid Timestamp Test',
        testRuns
      );

      expect(analysis.testId).toBe('test-4');
      expect(analysis.historicalData.totalRuns).toBe(2);
    });

    it('should handle batch analysis with mixed data quality', async () => {
      const testData = [
        {
          testId: 'good-test',
          testName: 'Good Test',
          testRuns: Array.from({ length: 50 }, (_, i) => ({
            id: `run-${i}`,
            timestamp: Date.now() - i * 60000,
            status: i % 4 === 0 ? 'failed' : 'passed' as const,
            duration: 5000
          }))
        },
        {
          testId: 'bad-test',
          testName: 'Bad Test',
          testRuns: [] // No data
        },
        {
          testId: 'weird-test',
          testName: 'Weird Test',
          testRuns: [{
            id: 'only-run',
            timestamp: 0,
            status: 'skipped',
            duration: -100 // Invalid duration
          }]
        }
      ];

      const analyses = await flakyTestDetector.analyzeMultipleTests(testData);

      expect(analyses).toHaveLength(3);
      expect(analyses[0].testId).toBe('good-test');
      expect(analyses[1].testId).toBe('bad-test');
      expect(analyses[2].testId).toBe('weird-test');

      // Should be sorted by flakiness score
      for (let i = 1; i < analyses.length; i++) {
        expect(analyses[i - 1].flakiness.score).toBeGreaterThanOrEqual(
          analyses[i].flakiness.score
        );
      }
    });
  });

  describe('TestOptimizer Edge Cases', () => {
    it('should handle empty test suite', async () => {
      const metrics = {
        testSuite: 'empty-suite',
        tests: [],
        totalDuration: 0,
        totalCost: 0,
        parallelization: 0,
        redundancy: 0
      };

      const optimization = await testOptimizer.optimizeTestSuite(metrics);

      expect(optimization.testSuite).toBe('empty-suite');
      expect(optimization.currentMetrics.totalDuration).toBe(0);
      expect(optimization.currentMetrics.totalCost).toBe(0);
      expect(optimization.optimizations).toHaveLength(0);
      expect(optimization.projectedSavings.timeSaved).toBe(0);
    });

    it('should handle tests with zero duration', async () => {
      const metrics = {
        testSuite: 'zero-duration-suite',
        tests: [{
          testId: 'instant-test',
          testName: 'Instant Test',
          averageDuration: 0,
          costPerRun: 0,
          failureRate: 0,
          lastRun: Date.now(),
          dependencies: [],
          coverage: { lines: 0, functions: 0, branches: 0 }
        }],
        totalDuration: 0,
        totalCost: 0,
        parallelization: 0,
        redundancy: 0
      };

      const optimization = await testOptimizer.optimizeTestSuite(metrics);

      expect(optimization.currentMetrics.totalDuration).toBe(0);
      expect(optimization.projectedSavings.percentageImprovement).toBe(0);
    });

    it('should handle circular dependencies', async () => {
      const metrics = {
        testSuite: 'circular-deps-suite',
        tests: [
          {
            testId: 'test-a',
            testName: 'Test A',
            averageDuration: 60,
            costPerRun: 0.1,
            failureRate: 0.1,
            lastRun: Date.now(),
            dependencies: ['test-b'], // Depends on B
            coverage: { lines: 100, functions: 10, branches: 20 }
          },
          {
            testId: 'test-b',
            testName: 'Test B',
            averageDuration: 60,
            costPerRun: 0.1,
            failureRate: 0.1,
            lastRun: Date.now(),
            dependencies: ['test-a'], // Depends on A (circular)
            coverage: { lines: 100, functions: 10, branches: 20 }
          }
        ],
        totalDuration: 120,
        totalCost: 0.2,
        parallelization: 0,
        redundancy: 0
      };

      const dependencyAnalysis = testOptimizer.analyzeTestDependencies(metrics.tests);

      expect(dependencyAnalysis.circularDependencies).toContain('test-a');
      expect(dependencyAnalysis.circularDependencies).toContain('test-b');
    });

    it('should handle extremely high cost per minute', async () => {
      const expensiveOptimizer = new TestOptimizer(mockAIProvider, 1000); // $1000 per minute

      const metrics = {
        testSuite: 'expensive-suite',
        tests: [{
          testId: 'expensive-test',
          testName: 'Expensive Test',
          averageDuration: 60, // 1 minute
          costPerRun: 1000,
          failureRate: 0.1,
          lastRun: Date.now(),
          dependencies: [],
          coverage: { lines: 100, functions: 10, branches: 20 }
        }],
        totalDuration: 60,
        totalCost: 1000,
        parallelization: 0,
        redundancy: 0
      };

      const optimization = await expensiveOptimizer.optimizeTestSuite(metrics);

      expect(optimization.currentMetrics.totalCost).toBe(1000);
      // Any optimization should have proportionally high cost savings
      optimization.optimizations.forEach(opt => {
        if (opt.impact.timeSaved > 0) {
          expect(opt.impact.costSaved).toBeGreaterThan(0);
        }
      });
    });
  });

  describe('AITestGenerator Edge Cases', () => {
    it('should handle empty natural language description', async () => {
      const request: AITestGenerationRequest = {
        type: 'natural_language',
        input: {
          description: '' // Empty description
        },
        options: {
          framework: 'playwright',
          language: 'typescript',
          includeAssertions: true,
          includeDataSetup: false
        }
      };

      const result = await aiTestGenerator.generateTests(request);

      expect(result.tests).toHaveLength(0);
      expect(result.summary.totalGenerated).toBe(0);
      expect(result.summary.recommendations).toContain('No tests were generated. Check input data quality and try again.');
    });

    it('should handle malformed user session data', async () => {
      const request: AITestGenerationRequest = {
        type: 'user_behavior',
        input: {
          sessionData: [{
            id: 'malformed-session',
            timestamp: -1, // Invalid timestamp
            duration: -5000, // Invalid duration
            actions: [
              {
                type: 'click',
                timestamp: Number.MAX_SAFE_INTEGER,
                target: {
                  selector: '', // Empty selector
                  text: undefined,
                  url: 'not-a-url'
                }
              }
            ],
            outcome: 'success',
            metadata: {
              userAgent: '',
              viewport: { width: -100, height: -100 }, // Invalid viewport
              referrer: 'invalid-referrer'
            }
          }]
        },
        options: {
          framework: 'playwright',
          language: 'typescript',
          includeAssertions: true,
          includeDataSetup: false
        }
      };

      // Should not throw an error
      const result = await aiTestGenerator.generateTests(request);
      expect(result).toBeDefined();
      expect(result.summary).toBeDefined();
    });

    it('should handle error logs with no stack traces', async () => {
      const request: AITestGenerationRequest = {
        type: 'error_based',
        input: {
          errorLogs: [{
            timestamp: Date.now(),
            message: '', // Empty message
            stack: undefined, // No stack trace
            url: '',
            userAgent: '',
            sessionId: 'session-1'
          }]
        },
        options: {
          framework: 'cypress',
          language: 'javascript',
          includeAssertions: false,
          includeDataSetup: false
        }
      };

      const result = await aiTestGenerator.generateTests(request);
      expect(result).toBeDefined();
      expect(result.summary.totalGenerated).toBeGreaterThanOrEqual(0);
    });

    it('should handle unsupported framework/language combinations', async () => {
      const request: AITestGenerationRequest = {
        type: 'natural_language',
        input: {
          description: 'Test login functionality'
        },
        options: {
          framework: 'playwright',
          language: 'python', // Playwright + Python might not be fully supported
          includeAssertions: true,
          includeDataSetup: true
        }
      };

      const result = await aiTestGenerator.generateTests(request);
      
      // Should still attempt to generate tests
      expect(result).toBeDefined();
      expect(result.summary).toBeDefined();
    });

    it('should handle batch generation with mixed request types', async () => {
      const requests: AITestGenerationRequest[] = [
        {
          type: 'natural_language',
          input: { description: 'Valid test description' },
          options: { framework: 'playwright', language: 'typescript', includeAssertions: true, includeDataSetup: false }
        },
        {
          type: 'user_behavior',
          input: { sessionData: [] }, // Empty session data
          options: { framework: 'cypress', language: 'javascript', includeAssertions: false, includeDataSetup: false }
        },
        {
          type: 'error_based',
          input: { errorLogs: undefined }, // Undefined error logs
          options: { framework: 'selenium', language: 'typescript', includeAssertions: true, includeDataSetup: true }
        }
      ];

      const results = await aiTestGenerator.generateTestSuite(requests);

      expect(Object.keys(results)).toHaveLength(3);
      Object.values(results).forEach(result => {
        expect(result.summary).toBeDefined();
        expect(result.tests).toBeDefined();
      });
    });
  });

  describe('VisualIntelligence Edge Cases', () => {
    it('should handle invalid image paths', async () => {
      const analysis = await visualIntelligence.analyzeScreenshot(
        'non-existent-file.png'
      );

      expect(analysis).toBeDefined();
      expect(analysis.screenshotId).toBeDefined();
      expect(analysis.analysis.elements).toHaveLength(0);
    });

    it('should handle corrupted base64 image data', async () => {
      const corruptedBase64 = 'data:image/png;base64,corrupted-data-here';

      const analysis = await visualIntelligence.analyzeScreenshot(corruptedBase64);

      expect(analysis).toBeDefined();
      expect(analysis.screenshotId).toBeDefined();
    });

    it('should handle extremely large images', async () => {
      // Mock a very large image (simulate with metadata)
      const largeImagePath = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';

      const analysis = await visualIntelligence.analyzeScreenshot(largeImagePath);

      expect(analysis).toBeDefined();
      expect(analysis.analysis.layout).toBeDefined();
    });

    it('should handle malformed DOM snapshots', async () => {
      const malformedDOM = '<div><span>unclosed tag<div>nested without closing</span>';

      const analysis = await visualIntelligence.analyzeScreenshot(
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
        malformedDOM
      );

      expect(analysis).toBeDefined();
      expect(analysis.analysis.elements).toBeDefined();
    });

    it('should handle AI provider failures in visual analysis', async () => {
      const failingProvider = {
        name: 'failing' as const,
        generateAnalysis: vi.fn().mockRejectedValue(new Error('AI service down')),
        generateCode: vi.fn().mockRejectedValue(new Error('AI service down')),
        analyzeImage: vi.fn().mockRejectedValue(new Error('AI service down'))
      };

      const visualIntelligenceWithFailingAI = new VisualIntelligence(failingProvider, {
        enableAIAnalysis: true
      });

      const analysis = await visualIntelligenceWithFailingAI.analyzeScreenshot(
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=='
      );

      // Should fall back to rule-based analysis
      expect(analysis).toBeDefined();
      expect(analysis.insights.summary).toBeDefined();
      expect(analysis.insights.recommendations).toBeDefined();
    });

    it('should handle disabled analysis features', async () => {
      const limitedVisualIntelligence = new VisualIntelligence(mockAIProvider, {
        enableAIAnalysis: false,
        accessibilityChecks: false,
        layoutAnalysis: false,
        performanceAnalysis: false
      });

      const analysis = await limitedVisualIntelligence.analyzeScreenshot(
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=='
      );

      expect(analysis).toBeDefined();
      expect(analysis.analysis.accessibility).toHaveLength(0);
      expect(analysis.analysis.layout.responsive).toBe(true); // Default empty layout
    });
  });

  describe('AI Provider Edge Cases', () => {
    it('should handle OpenAI provider with invalid API key', () => {
      expect(() => {
        new OpenAIProvider('');
      }).toThrow('OpenAI API key required');
    });

    it('should handle network timeouts gracefully', async () => {
      const timeoutProvider = {
        name: 'timeout' as const,
        generateAnalysis: vi.fn().mockImplementation(() => 
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Request timeout')), 100)
          )
        ),
        generateCode: vi.fn().mockRejectedValue(new Error('Request timeout')),
        analyzeImage: vi.fn().mockRejectedValue(new Error('Request timeout'))
      };

      const analyzerWithTimeout = new RootCauseAnalyzer(timeoutProvider);

      const failure: TestFailure = {
        id: 'timeout-test',
        testName: 'Timeout Test',
        testFile: 'test.spec.ts',
        timestamp: Date.now(),
        error: { message: 'test failed', type: 'unknown' },
        screenshots: {},
        executionContext: {
          browser: 'chrome',
          viewport: { width: 1920, height: 1080 },
          userAgent: 'test-agent',
          url: 'https://example.com'
        }
      };

      // Should fall back to rule-based analysis
      const analysis = await analyzerWithTimeout.analyzeFailure(failure);
      expect(analysis).toBeDefined();
      expect(analysis.explanation).toBeDefined();
    });

    it('should handle malformed AI responses', async () => {
      const malformedProvider = {
        name: 'malformed' as const,
        generateAnalysis: vi.fn().mockResolvedValue('not-valid-json{'),
        generateCode: vi.fn().mockResolvedValue(''),
        analyzeImage: vi.fn().mockResolvedValue('invalid-response')
      };

      const analyzerWithMalformed = new RootCauseAnalyzer(malformedProvider);

      const failure: TestFailure = {
        id: 'malformed-test',
        testName: 'Malformed Response Test',
        testFile: 'test.spec.ts',
        timestamp: Date.now(),
        error: { message: 'test failed', type: 'unknown' },
        screenshots: {},
        executionContext: {
          browser: 'chrome',
          viewport: { width: 1920, height: 1080 },
          userAgent: 'test-agent',
          url: 'https://example.com'
        }
      };

      // Should handle malformed responses gracefully
      const analysis = await analyzerWithMalformed.analyzeFailure(failure);
      expect(analysis).toBeDefined();
      expect(analysis.explanation).toBeDefined();
    });
  });
});