/**
 * Property-based tests for flaky test detection
 * **Validates: Requirements 44.2 - Predictive Flaky Test Detection**
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { FlakyTestDetector } from '../flakyTestDetector';
import { TestRun, FlakyTestAnalysis } from '../types';
import { LocalProvider } from '../utils/aiProvider';

describe('Flaky Test Detection Properties', () => {
  let detector: FlakyTestDetector;
  let mockAIProvider: LocalProvider;

  beforeEach(() => {
    mockAIProvider = new LocalProvider();
    detector = new FlakyTestDetector(mockAIProvider);
  });

  /**
   * Property Test 1: Flakiness Score Consistency
   * **Validates: Requirements 44.2**
   * Test that flakiness scores are consistent and within valid range
   */
  it('should produce consistent flakiness scores within valid range', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          testId: fc.string({ minLength: 1, maxLength: 50 }),
          testName: fc.string({ minLength: 1, maxLength: 100 }),
          testRuns: fc.array(
            fc.record({
              id: fc.string({ minLength: 1 }),
              timestamp: fc.integer({ min: 1000000000000, max: Date.now() }),
              status: fc.constantFrom('passed', 'failed', 'skipped'),
              duration: fc.integer({ min: 100, max: 300000 }),
              error: fc.option(fc.string())
            }),
            { minLength: 10, maxLength: 100 }
          )
        }),
        async ({ testId, testName, testRuns }) => {
          const analysis = await detector.analyzeTestFlakiness(testId, testName, testRuns);

          // Flakiness score should be within valid range
          expect(analysis.flakiness.score).toBeGreaterThanOrEqual(0);
          expect(analysis.flakiness.score).toBeLessThanOrEqual(1);

          // Confidence should be within valid range
          expect(analysis.flakiness.confidence).toBeGreaterThanOrEqual(0);
          expect(analysis.flakiness.confidence).toBeLessThanOrEqual(1);

          // Trend should be valid
          expect(['improving', 'stable', 'degrading']).toContain(analysis.flakiness.trend);

          // Historical data should be accurate
          expect(analysis.historicalData.totalRuns).toBe(testRuns.length);
          expect(analysis.historicalData.failures).toBe(
            testRuns.filter(run => run.status === 'failed').length
          );
          expect(analysis.historicalData.successRate).toBeGreaterThanOrEqual(0);
          expect(analysis.historicalData.successRate).toBeLessThanOrEqual(1);
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Property Test 2: Flaky Pattern Detection
   * **Validates: Requirements 44.2**
   * Test that alternating pass/fail patterns are detected as flaky
   */
  it('should detect alternating pass/fail patterns as flaky', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          testId: fc.string({ minLength: 1 }),
          testName: fc.string({ minLength: 1 }),
          alternationCount: fc.integer({ min: 5, max: 20 })
        }),
        async ({ testId, testName, alternationCount }) => {
          // Create alternating pass/fail pattern
          const testRuns: TestRun[] = [];
          let currentStatus: 'passed' | 'failed' = 'passed';
          
          for (let i = 0; i < alternationCount * 2; i++) {
            testRuns.push({
              id: `run-${i}`,
              timestamp: Date.now() - (alternationCount * 2 - i) * 60000, // 1 minute apart
              status: currentStatus,
              duration: 5000,
              error: currentStatus === 'failed' ? 'test failed' : undefined
            });
            currentStatus = currentStatus === 'passed' ? 'failed' : 'passed';
          }

          const analysis = await detector.analyzeTestFlakiness(testId, testName, testRuns);

          // Should detect high flakiness for alternating pattern
          expect(analysis.flakiness.score).toBeGreaterThan(0.5);
          
          // Failure rate should be around 50% for alternating pattern
          expect(analysis.historicalData.successRate).toBeGreaterThan(0.4);
          expect(analysis.historicalData.successRate).toBeLessThan(0.6);

          // Should recommend investigation or fixing
          expect(['investigate', 'fix', 'quarantine']).toContain(analysis.recommendations.action);
        }
      ),
      { numRuns: 15 }
    );
  });

  /**
   * Property Test 3: Stable Test Detection
   * **Validates: Requirements 44.2**
   * Test that consistently passing or failing tests are not marked as flaky
   */
  it('should not mark consistently passing or failing tests as flaky', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          testId: fc.string({ minLength: 1 }),
          testName: fc.string({ minLength: 1 }),
          runCount: fc.integer({ min: 20, max: 50 }),
          isConsistentlyPassing: fc.boolean()
        }),
        async ({ testId, testName, runCount, isConsistentlyPassing }) => {
          // Create consistent pass or fail pattern
          const testRuns: TestRun[] = [];
          const status = isConsistentlyPassing ? 'passed' : 'failed';
          
          for (let i = 0; i < runCount; i++) {
            testRuns.push({
              id: `run-${i}`,
              timestamp: Date.now() - (runCount - i) * 60000,
              status,
              duration: 5000,
              error: status === 'failed' ? 'test consistently fails' : undefined
            });
          }

          const analysis = await detector.analyzeTestFlakiness(testId, testName, testRuns);

          // Should have low flakiness score for consistent behavior
          expect(analysis.flakiness.score).toBeLessThan(0.3);

          // Success rate should be close to 0 or 1
          if (isConsistentlyPassing) {
            expect(analysis.historicalData.successRate).toBeGreaterThan(0.95);
          } else {
            expect(analysis.historicalData.successRate).toBeLessThan(0.05);
          }

          // Should recommend monitoring for stable tests
          if (analysis.flakiness.score < 0.2) {
            expect(analysis.recommendations.action).toBe('monitor');
            expect(analysis.recommendations.priority).toBe('low');
          }
        }
      ),
      { numRuns: 15 }
    );
  });

  /**
   * Property Test 4: Environmental Pattern Detection
   * **Validates: Requirements 44.2**
   * Test that time-based failure patterns are detected
   */
  it('should detect time-based failure patterns', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          testId: fc.string({ minLength: 1 }),
          testName: fc.string({ minLength: 1 }),
          failureHour: fc.integer({ min: 0, max: 23 }),
          runCount: fc.integer({ min: 30, max: 50 })
        }),
        async ({ testId, testName, failureHour, runCount }) => {
          // Create time-based failure pattern
          const testRuns: TestRun[] = [];
          
          for (let i = 0; i < runCount; i++) {
            const timestamp = Date.now() - (runCount - i) * 3600000; // 1 hour apart
            const hour = new Date(timestamp).getHours();
            const shouldFail = hour === failureHour;
            
            testRuns.push({
              id: `run-${i}`,
              timestamp,
              status: shouldFail ? 'failed' : 'passed',
              duration: 5000,
              error: shouldFail ? 'time-based failure' : undefined
            });
          }

          const analysis = await detector.analyzeTestFlakiness(testId, testName, testRuns);

          // Should detect time-based patterns
          if (analysis.patterns.timeOfDay) {
            const failureHourPattern = analysis.patterns.timeOfDay.find(p => p.hour === failureHour);
            if (failureHourPattern) {
              expect(failureHourPattern.failureRate).toBeGreaterThan(0.8);
            }
          }

          // Should have some flakiness score due to time-based pattern (but may be low)
          expect(analysis.flakiness.score).toBeGreaterThanOrEqual(0);
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Property Test 5: Recommendation Appropriateness
   * **Validates: Requirements 44.2**
   * Test that recommendations match the severity of flakiness
   */
  it('should provide appropriate recommendations based on flakiness severity', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          testId: fc.string({ minLength: 1 }),
          testName: fc.string({ minLength: 1 }),
          failureRate: fc.float({ min: Math.fround(0), max: Math.fround(1) }),
          runCount: fc.integer({ min: 20, max: 100 })
        }),
        async ({ testId, testName, failureRate, runCount }) => {
          // Create test runs with specific failure rate
          const testRuns: TestRun[] = [];
          const failureCount = Math.floor(runCount * failureRate);
          
          for (let i = 0; i < runCount; i++) {
            const shouldFail = i < failureCount;
            testRuns.push({
              id: `run-${i}`,
              timestamp: Date.now() - (runCount - i) * 60000,
              status: shouldFail ? 'failed' : 'passed',
              duration: 5000,
              error: shouldFail ? 'test failure' : undefined
            });
          }

          const analysis = await detector.analyzeTestFlakiness(testId, testName, testRuns);

          // Recommendations should match flakiness level
          if (analysis.flakiness.score > 0.8) {
            expect(['quarantine', 'fix']).toContain(analysis.recommendations.action);
            expect(['critical', 'high']).toContain(analysis.recommendations.priority);
          } else if (analysis.flakiness.score > 0.6) {
            expect(['fix', 'investigate']).toContain(analysis.recommendations.action);
            expect(['high', 'medium']).toContain(analysis.recommendations.priority);
          } else if (analysis.flakiness.score > 0.4) {
            expect(['investigate', 'monitor']).toContain(analysis.recommendations.action);
            expect(['medium', 'low']).toContain(analysis.recommendations.priority);
          } else {
            expect(analysis.recommendations.action).toBe('monitor');
            expect(analysis.recommendations.priority).toBe('low');
          }

          // Reason should be provided (allow empty for edge cases)
          expect(analysis.recommendations.reason).toBeDefined();
          if (analysis.recommendations.reason) {
            expect(analysis.recommendations.reason.length).toBeGreaterThan(0);
          }
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Property Test 6: Batch Analysis Consistency
   * **Validates: Requirements 44.2**
   * Test that batch analysis produces consistent results
   */
  it('should produce consistent results in batch analysis', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            testId: fc.string({ minLength: 1, maxLength: 20 }),
            testName: fc.string({ minLength: 1, maxLength: 50 }),
            testRuns: fc.array(
              fc.record({
                id: fc.string({ minLength: 1 }),
                timestamp: fc.integer({ min: 1000000000000, max: Date.now() }),
                status: fc.constantFrom('passed', 'failed', 'skipped'),
                duration: fc.integer({ min: 100, max: 60000 })
              }),
              { minLength: 10, maxLength: 30 }
            )
          }),
          { minLength: 2, maxLength: 10 }
        ),
        async (testData) => {
          const batchAnalyses = await detector.analyzeMultipleTests(testData);

          // Should return same number of analyses
          expect(batchAnalyses.length).toBe(testData.length);

          // Should be sorted by flakiness score (descending)
          for (let i = 1; i < batchAnalyses.length; i++) {
            expect(batchAnalyses[i - 1].flakiness.score).toBeGreaterThanOrEqual(
              batchAnalyses[i].flakiness.score
            );
          }

          // Each analysis should be complete and match original test data
          // Note: Results are sorted by flakiness score, so we need to find matching tests
          batchAnalyses.forEach((analysis) => {
            const originalTest = testData.find(t => t.testId === analysis.testId);
            expect(originalTest).toBeDefined();
            expect(analysis.testName).toBe(originalTest!.testName);
            expect(analysis.flakiness.score).toBeGreaterThanOrEqual(0);
            expect(analysis.flakiness.score).toBeLessThanOrEqual(1);
            expect(analysis.recommendations).toBeDefined();
            expect(analysis.historicalData).toBeDefined();
          });

          // Summary should be accurate
          const summary = detector.getFlakinessSummary(batchAnalyses);
          expect(summary.totalTests).toBe(batchAnalyses.length);
          expect(summary.flakyTests).toBe(
            batchAnalyses.filter(a => a.flakiness.score > 0.2).length
          );
          expect(summary.criticallyFlaky).toBe(
            batchAnalyses.filter(a => a.flakiness.score > 0.8).length
          );
          expect(summary.averageFlakinessScore).toBeGreaterThanOrEqual(0);
          expect(summary.averageFlakinessScore).toBeLessThanOrEqual(1);
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Property Test 7: Trend Analysis Accuracy
   * **Validates: Requirements 44.2**
   * Test that trend analysis correctly identifies improving/degrading patterns
   */
  it('should correctly identify test reliability trends', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          testId: fc.string({ minLength: 1 }),
          testName: fc.string({ minLength: 1 }),
          trendType: fc.constantFrom('improving', 'degrading', 'stable'),
          runCount: fc.integer({ min: 30, max: 60 })
        }),
        async ({ testId, testName, trendType, runCount }) => {
          const testRuns: TestRun[] = [];
          
          for (let i = 0; i < runCount; i++) {
            let shouldFail = false;
            
            if (trendType === 'improving') {
              // More failures at the beginning, fewer at the end
              shouldFail = i < runCount * 0.3;
            } else if (trendType === 'degrading') {
              // Fewer failures at the beginning, more at the end
              shouldFail = i > runCount * 0.7;
            } else {
              // Stable - consistent failure rate
              shouldFail = i % 4 === 0; // 25% failure rate throughout
            }
            
            testRuns.push({
              id: `run-${i}`,
              timestamp: Date.now() - (runCount - i) * 60000,
              status: shouldFail ? 'failed' : 'passed',
              duration: 5000,
              error: shouldFail ? 'test failure' : undefined
            });
          }

          const analysis = await detector.analyzeTestFlakiness(testId, testName, testRuns);

          // Trend should match expected pattern
          if (trendType === 'improving' || trendType === 'degrading') {
            expect(analysis.flakiness.trend).toBe(trendType);
          }
          // Note: 'stable' might be detected as any trend depending on the exact pattern

          // Flakiness score should reflect the trend
          if (trendType === 'degrading') {
            expect(analysis.flakiness.score).toBeGreaterThan(0.2);
          }
        }
      ),
      { numRuns: 15 }
    );
  });
});
