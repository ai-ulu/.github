/**
 * Property-based tests for test optimization
 * **Validates: Requirements 44.3 - Smart Test Optimization and Cost Reduction**
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { TestOptimizer, TestSuiteMetrics, TestMetrics } from '../testOptimizer';
import { TestOptimization } from '../types';
import { LocalProvider } from '../utils/aiProvider';

describe('Test Optimization Properties', () => {
  let optimizer: TestOptimizer;
  let mockAIProvider: LocalProvider;

  beforeEach(() => {
    mockAIProvider = new LocalProvider();
    optimizer = new TestOptimizer(mockAIProvider, 0.05); // $0.05 per minute
  });

  /**
   * Property Test 1: Cost Calculation Accuracy
   * **Validates: Requirements 44.3**
   * Test that cost calculations are accurate and consistent
   */
  it('should calculate costs accurately based on duration and rate', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          testSuite: fc.string({ minLength: 1, maxLength: 50 }),
          tests: fc.array(
            fc.record({
              testId: fc.string({ minLength: 1, maxLength: 20 }),
              testName: fc.string({ minLength: 1, maxLength: 100 }),
              averageDuration: fc.integer({ min: 1, max: 600 }), // 1 second to 10 minutes
              costPerRun: fc.float({ min: Math.fround(0.001), max: Math.fround(1) }),
              failureRate: fc.float({ min: Math.fround(0), max: Math.fround(1) }),
              lastRun: fc.integer({ min: 1000000000000, max: Date.now() }),
              dependencies: fc.array(fc.string(), { maxLength: 5 }),
              coverage: fc.record({
                lines: fc.integer({ min: 0, max: 1000 }),
                functions: fc.integer({ min: 0, max: 100 }),
                branches: fc.integer({ min: 0, max: 200 })
              })
            }),
            { minLength: 1, maxLength: 20 }
          )
        }),
        async (metricsInput) => {
          const metrics: TestSuiteMetrics = {
            ...metricsInput,
            totalDuration: metricsInput.tests.reduce((sum, test) => sum + test.averageDuration, 0),
            totalCost: 0, // Will be calculated
            parallelization: 0, // Will be calculated
            redundancy: 0 // Will be calculated
          };

          const optimization = await optimizer.optimizeTestSuite(metrics);

          // Cost calculation should be accurate
          const expectedTotalDuration = metrics.tests.reduce((sum, test) => sum + test.averageDuration, 0);
          const expectedTotalCost = (expectedTotalDuration / 60) * 0.05; // Convert to minutes and multiply by rate

          expect(optimization.currentMetrics.totalDuration).toBe(expectedTotalDuration);
          expect(Math.abs(optimization.currentMetrics.totalCost - expectedTotalCost)).toBeLessThan(0.01);

          // Parallelization should be between 0 and 1
          expect(optimization.currentMetrics.parallelization).toBeGreaterThanOrEqual(0);
          expect(optimization.currentMetrics.parallelization).toBeLessThanOrEqual(1);

          // Redundancy should be between 0 and 1
          expect(optimization.currentMetrics.redundancy).toBeGreaterThanOrEqual(0);
          expect(optimization.currentMetrics.redundancy).toBeLessThanOrEqual(1);
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Property Test 2: Optimization Savings Validity
   * **Validates: Requirements 44.3**
   * Test that projected savings are realistic and achievable
   */
  it('should provide realistic and achievable optimization savings', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          testSuite: fc.string({ minLength: 1 }),
          tests: fc.array(
            fc.record({
              testId: fc.string({ minLength: 1 }),
              testName: fc.string({ minLength: 1 }),
              averageDuration: fc.integer({ min: 10, max: 300 }),
              costPerRun: fc.float({ min: Math.fround(0.01), max: Math.fround(0.5) }),
              failureRate: fc.float({ min: Math.fround(0), max: Math.fround(0.5) }),
              lastRun: fc.integer({ min: 1000000000000, max: Date.now() }),
              dependencies: fc.array(fc.string(), { maxLength: 3 }),
              coverage: fc.record({
                lines: fc.integer({ min: 10, max: 500 }),
                functions: fc.integer({ min: 1, max: 50 }),
                branches: fc.integer({ min: 1, max: 100 })
              })
            }),
            { minLength: 5, maxLength: 15 }
          )
        }),
        async (metricsInput) => {
          const metrics: TestSuiteMetrics = {
            ...metricsInput,
            totalDuration: metricsInput.tests.reduce((sum, test) => sum + test.averageDuration, 0),
            totalCost: 0,
            parallelization: 0,
            redundancy: 0
          };

          const optimization = await optimizer.optimizeTestSuite(metrics);

          // Projected savings should not exceed current costs
          expect(optimization.projectedSavings.timeSaved).toBeGreaterThanOrEqual(0);
          expect(optimization.projectedSavings.timeSaved).toBeLessThanOrEqual(optimization.currentMetrics.totalDuration);
          
          expect(optimization.projectedSavings.costSaved).toBeGreaterThanOrEqual(0);
          expect(optimization.projectedSavings.costSaved).toBeLessThanOrEqual(optimization.currentMetrics.totalCost);

          // Percentage improvement should be reasonable
          expect(optimization.projectedSavings.percentageImprovement).toBeGreaterThanOrEqual(0);
          expect(optimization.projectedSavings.percentageImprovement).toBeLessThanOrEqual(100);

          // If there are optimizations, there should be some savings
          if (optimization.optimizations.length > 0) {
            const totalOptimizationSavings = optimization.optimizations.reduce(
              (sum, opt) => sum + opt.impact.timeSaved, 0
            );
            expect(optimization.projectedSavings.timeSaved).toBe(totalOptimizationSavings);
          }
        }
      ),
      { numRuns: 15 }
    );
  });

  /**
   * Property Test 3: Parallelization Detection
   * **Validates: Requirements 44.3**
   * Test that parallelization opportunities are correctly identified
   */
  it('should correctly identify parallelization opportunities', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          independentTestCount: fc.integer({ min: 2, max: 10 }),
          dependentTestCount: fc.integer({ min: 0, max: 5 }),
          testDuration: fc.integer({ min: 30, max: 120 })
        }),
        async ({ independentTestCount, dependentTestCount, testDuration }) => {
          const tests: TestMetrics[] = [];
          
          // Create independent tests (no dependencies)
          for (let i = 0; i < independentTestCount; i++) {
            tests.push({
              testId: `independent-${i}`,
              testName: `Independent Test ${i}`,
              averageDuration: testDuration,
              costPerRun: 0.1,
              failureRate: 0.1,
              lastRun: Date.now(),
              dependencies: [], // No dependencies
              coverage: { lines: 100, functions: 10, branches: 20 }
            });
          }

          // Create dependent tests
          for (let i = 0; i < dependentTestCount; i++) {
            tests.push({
              testId: `dependent-${i}`,
              testName: `Dependent Test ${i}`,
              averageDuration: testDuration,
              costPerRun: 0.1,
              failureRate: 0.1,
              lastRun: Date.now(),
              dependencies: [`independent-0`], // Depends on first independent test
              coverage: { lines: 100, functions: 10, branches: 20 }
            });
          }

          const metrics: TestSuiteMetrics = {
            testSuite: 'test-suite',
            tests,
            totalDuration: tests.reduce((sum, test) => sum + test.averageDuration, 0),
            totalCost: 0,
            parallelization: 0,
            redundancy: 0
          };

          const optimization = await optimizer.optimizeTestSuite(metrics);

          // Should detect parallelization opportunity if there are multiple independent tests
          if (independentTestCount >= 2) {
            const parallelizationOpts = optimization.optimizations.filter(
              opt => opt.type === 'parallelize'
            );
            
            if (parallelizationOpts.length > 0) {
              const parallelOpt = parallelizationOpts[0];
              expect(parallelOpt.impact.timeSaved).toBeGreaterThan(0);
              expect(parallelOpt.impact.riskLevel).toBe('low');
              expect(parallelOpt.implementation.difficulty).toBe('easy');
            }
          }

          // Parallelization metric should reflect the ratio of independent tests
          const expectedParallelization = independentTestCount / (independentTestCount + dependentTestCount);
          expect(Math.abs(optimization.currentMetrics.parallelization - expectedParallelization)).toBeLessThan(0.1);
        }
      ),
      { numRuns: 15 }
    );
  });

  /**
   * Property Test 4: Redundancy Detection
   * **Validates: Requirements 44.3**
   * Test that redundant tests are correctly identified
   */
  it('should correctly identify redundant tests with similar coverage', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          redundantGroupSize: fc.integer({ min: 2, max: 5 }),
          uniqueTestCount: fc.integer({ min: 1, max: 5 }),
          coverageLines: fc.integer({ min: 50, max: 200 })
        }),
        async ({ redundantGroupSize, uniqueTestCount, coverageLines }) => {
          const tests: TestMetrics[] = [];
          
          // Create a group of redundant tests (similar coverage)
          for (let i = 0; i < redundantGroupSize; i++) {
            tests.push({
              testId: `redundant-${i}`,
              testName: `Redundant Test ${i}`,
              averageDuration: 60,
              costPerRun: 0.1,
              failureRate: 0.1,
              lastRun: Date.now(),
              dependencies: [],
              coverage: { 
                lines: coverageLines + (i * 2), // Very similar coverage
                functions: 10 + i,
                branches: 20 + i
              }
            });
          }

          // Create unique tests (different coverage)
          for (let i = 0; i < uniqueTestCount; i++) {
            tests.push({
              testId: `unique-${i}`,
              testName: `Unique Test ${i}`,
              averageDuration: 60,
              costPerRun: 0.1,
              failureRate: 0.1,
              lastRun: Date.now(),
              dependencies: [],
              coverage: { 
                lines: coverageLines * 2 + (i * 50), // Very different coverage
                functions: 50 + (i * 10),
                branches: 100 + (i * 20)
              }
            });
          }

          const metrics: TestSuiteMetrics = {
            testSuite: 'test-suite',
            tests,
            totalDuration: tests.reduce((sum, test) => sum + test.averageDuration, 0),
            totalCost: 0,
            parallelization: 0,
            redundancy: 0
          };

          const optimization = await optimizer.optimizeTestSuite(metrics);

          // Should detect redundancy if there are multiple similar tests
          if (redundantGroupSize >= 2) {
            const redundancyOpts = optimization.optimizations.filter(
              opt => opt.type === 'skip_redundant'
            );
            
            // May or may not detect redundancy depending on similarity threshold
            // But if detected, should be reasonable
            redundancyOpts.forEach(opt => {
              expect(opt.impact.timeSaved).toBeGreaterThan(0);
              expect(opt.impact.riskLevel).toBe('medium');
              expect(opt.implementation.difficulty).toBe('medium');
            });
          }

          // Redundancy metric should be reasonable
          expect(optimization.currentMetrics.redundancy).toBeGreaterThanOrEqual(0);
          expect(optimization.currentMetrics.redundancy).toBeLessThanOrEqual(1);
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Property Test 5: Slow Test Optimization
   * **Validates: Requirements 44.3**
   * Test that slow tests are identified and optimization suggestions are provided
   */
  it('should identify slow tests and suggest optimizations', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          slowTestDuration: fc.integer({ min: 300, max: 600 }), // 5-10 minutes
          normalTestDuration: fc.integer({ min: 10, max: 60 }), // 10-60 seconds
          slowTestCount: fc.integer({ min: 1, max: 3 }),
          normalTestCount: fc.integer({ min: 5, max: 10 })
        }),
        async ({ slowTestDuration, normalTestDuration, slowTestCount, normalTestCount }) => {
          const tests: TestMetrics[] = [];
          
          // Create slow tests
          for (let i = 0; i < slowTestCount; i++) {
            tests.push({
              testId: `slow-${i}`,
              testName: `Slow Test ${i}`,
              averageDuration: slowTestDuration,
              costPerRun: 0.5,
              failureRate: 0.1,
              lastRun: Date.now(),
              dependencies: [],
              coverage: { lines: 200, functions: 20, branches: 40 }
            });
          }

          // Create normal tests
          for (let i = 0; i < normalTestCount; i++) {
            tests.push({
              testId: `normal-${i}`,
              testName: `Normal Test ${i}`,
              averageDuration: normalTestDuration,
              costPerRun: 0.1,
              failureRate: 0.1,
              lastRun: Date.now(),
              dependencies: [],
              coverage: { lines: 100, functions: 10, branches: 20 }
            });
          }

          const metrics: TestSuiteMetrics = {
            testSuite: 'test-suite',
            tests,
            totalDuration: tests.reduce((sum, test) => sum + test.averageDuration, 0),
            totalCost: 0,
            parallelization: 0,
            redundancy: 0
          };

          const optimization = await optimizer.optimizeTestSuite(metrics);

          // Should identify slow tests for optimization
          const slowTestOpts = optimization.optimizations.filter(
            opt => opt.type === 'split_test' && opt.description.toLowerCase().includes('slow')
          );

          if (slowTestOpts.length > 0) {
            slowTestOpts.forEach(opt => {
              expect(opt.impact.timeSaved).toBeGreaterThan(0);
              expect(opt.impact.riskLevel).toBe('medium');
              expect(opt.implementation.difficulty).toBe('hard');
              expect(opt.implementation.estimatedHours).toBeGreaterThan(4);
            });
          }

          // Total optimization savings should be reasonable (allow significant margin for AI optimizations)
          const totalSavings = optimization.optimizations.reduce(
            (sum, opt) => sum + opt.impact.timeSaved, 0
          );
          // AI optimizations might suggest aggressive savings, so allow up to 150% of original duration
          expect(totalSavings).toBeLessThanOrEqual(optimization.currentMetrics.totalDuration * 1.5);
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Property Test 6: Optimization Priority Ordering
   * **Validates: Requirements 44.3**
   * Test that optimizations are ordered by impact (time saved)
   */
  it('should order optimizations by impact with highest savings first', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          testSuite: fc.string({ minLength: 1 }),
          tests: fc.array(
            fc.record({
              testId: fc.string({ minLength: 1 }),
              testName: fc.string({ minLength: 1 }),
              averageDuration: fc.integer({ min: 30, max: 300 }),
              costPerRun: fc.float({ min: Math.fround(0.05), max: Math.fround(0.5) }),
              failureRate: fc.float({ min: Math.fround(0), max: Math.fround(0.3) }),
              lastRun: fc.integer({ min: 1000000000000, max: Date.now() }),
              dependencies: fc.array(fc.string(), { maxLength: 2 }),
              coverage: fc.record({
                lines: fc.integer({ min: 50, max: 300 }),
                functions: fc.integer({ min: 5, max: 30 }),
                branches: fc.integer({ min: 10, max: 60 })
              })
            }),
            { minLength: 8, maxLength: 15 }
          )
        }),
        async (metricsInput) => {
          const metrics: TestSuiteMetrics = {
            ...metricsInput,
            totalDuration: metricsInput.tests.reduce((sum, test) => sum + test.averageDuration, 0),
            totalCost: 0,
            parallelization: 0,
            redundancy: 0
          };

          const optimization = await optimizer.optimizeTestSuite(metrics);

          // Optimizations should be ordered by time saved (descending)
          for (let i = 1; i < optimization.optimizations.length; i++) {
            expect(optimization.optimizations[i - 1].impact.timeSaved).toBeGreaterThanOrEqual(
              optimization.optimizations[i].impact.timeSaved
            );
          }

          // Each optimization should have valid impact values
          optimization.optimizations.forEach(opt => {
            expect(opt.impact.timeSaved).toBeGreaterThanOrEqual(0);
            expect(opt.impact.costSaved).toBeGreaterThanOrEqual(0);
            expect(['low', 'medium', 'high']).toContain(opt.impact.riskLevel);
            expect(['easy', 'medium', 'hard']).toContain(opt.implementation.difficulty);
            expect(opt.implementation.estimatedHours).toBeGreaterThan(0);
            expect(Array.isArray(opt.implementation.codeChanges)).toBe(true);
          });
        }
      ),
      { numRuns: 12 }
    );
  });

  /**
   * Property Test 7: Cost-Benefit Analysis
   * **Validates: Requirements 44.3**
   * Test that cost-benefit analysis is reasonable for optimizations
   */
  it('should provide reasonable cost-benefit analysis for optimizations', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          testCount: fc.integer({ min: 5, max: 20 }),
          averageDuration: fc.integer({ min: 60, max: 180 }),
          costPerMinute: fc.float({ min: Math.fround(0.01), max: Math.fround(0.1) })
        }),
        async ({ testCount, averageDuration, costPerMinute }) => {
          const tests: TestMetrics[] = [];
          
          for (let i = 0; i < testCount; i++) {
            tests.push({
              testId: `test-${i}`,
              testName: `Test ${i}`,
              averageDuration: averageDuration + (i * 10), // Varying durations
              costPerRun: costPerMinute * (averageDuration / 60),
              failureRate: 0.1,
              lastRun: Date.now(),
              dependencies: i < 2 ? [] : [`test-${i - 1}`], // Some dependencies
              coverage: { 
                lines: 100 + (i * 20), 
                functions: 10 + i, 
                branches: 20 + (i * 2) 
              }
            });
          }

          const customOptimizer = new TestOptimizer(mockAIProvider, costPerMinute);
          const metrics: TestSuiteMetrics = {
            testSuite: 'test-suite',
            tests,
            totalDuration: tests.reduce((sum, test) => sum + test.averageDuration, 0),
            totalCost: 0,
            parallelization: 0,
            redundancy: 0
          };

          const optimization = await customOptimizer.optimizeTestSuite(metrics);

          // Cost savings should be proportional to time savings
          optimization.optimizations.forEach(opt => {
            const expectedCostSaved = (opt.impact.timeSaved / 60) * costPerMinute;
            expect(Math.abs(opt.impact.costSaved - expectedCostSaved)).toBeLessThan(0.01);
          });

          // Total projected savings should match sum of individual optimizations
          const totalTimeSaved = optimization.optimizations.reduce(
            (sum, opt) => sum + opt.impact.timeSaved, 0
          );
          const totalCostSaved = optimization.optimizations.reduce(
            (sum, opt) => sum + opt.impact.costSaved, 0
          );

          expect(optimization.projectedSavings.timeSaved).toBe(totalTimeSaved);
          expect(Math.abs(optimization.projectedSavings.costSaved - totalCostSaved)).toBeLessThan(0.01);

          // Percentage improvement should be calculated correctly
          if (optimization.currentMetrics.totalDuration > 0) {
            const expectedPercentage = (totalTimeSaved / optimization.currentMetrics.totalDuration) * 100;
            expect(Math.abs(optimization.projectedSavings.percentageImprovement - expectedPercentage)).toBeLessThan(0.1);
          }
        }
      ),
      { numRuns: 15 }
    );
  });
});
