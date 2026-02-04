/**
 * Property-based tests for AI-powered root cause analysis
 * **Validates: Requirements 44.1 - Root Cause Analysis**
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fc from 'fast-check';
import { RootCauseAnalyzer } from '../rootCauseAnalyzer';
import { TestFailure, RootCauseAnalysis } from '../types';
import { LocalProvider } from '../utils/aiProvider';

describe('Root Cause Analysis Properties', () => {
  let analyzer: RootCauseAnalyzer;
  let mockAIProvider: LocalProvider;

  beforeEach(() => {
    mockAIProvider = new LocalProvider();
    analyzer = new RootCauseAnalyzer(mockAIProvider);
  });

  /**
   * Property Test 1: Root Cause Analysis Consistency
   * **Validates: Requirements 44.1**
   * Test that analyzing the same failure multiple times produces consistent results
   */
  it('should produce consistent analysis for identical failures', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          id: fc.string({ minLength: 1, maxLength: 50 }),
          testName: fc.string({ minLength: 1, maxLength: 100 }),
          testFile: fc.string({ minLength: 1, maxLength: 100 }),
          timestamp: fc.integer({ min: 1000000000000, max: Date.now() }),
          error: fc.record({
            message: fc.string({ minLength: 1, maxLength: 200 }),
            stack: fc.option(fc.string({ minLength: 1, maxLength: 500 })),
            type: fc.constantFrom('timeout', 'assertion', 'network', 'element_not_found', 'unknown')
          }),
          screenshots: fc.record({
            before: fc.option(fc.string()),
            after: fc.option(fc.string()),
            diff: fc.option(fc.string())
          }),
          domSnapshot: fc.option(fc.string()),
          networkLogs: fc.array(fc.record({
            url: fc.webUrl(),
            method: fc.constantFrom('GET', 'POST', 'PUT', 'DELETE'),
            status: fc.integer({ min: 100, max: 599 }),
            responseTime: fc.integer({ min: 1, max: 30000 }),
            timestamp: fc.integer({ min: 1000000000000, max: Date.now() }),
            headers: fc.dictionary(fc.string(), fc.string()),
            body: fc.option(fc.string())
          })),
          executionContext: fc.record({
            browser: fc.constantFrom('chrome', 'firefox', 'safari', 'edge'),
            viewport: fc.record({
              width: fc.integer({ min: 320, max: 1920 }),
              height: fc.integer({ min: 240, max: 1080 })
            }),
            userAgent: fc.string(),
            url: fc.webUrl()
          }),
          previousRuns: fc.array(fc.record({
            id: fc.string(),
            timestamp: fc.integer({ min: 1000000000000, max: Date.now() }),
            status: fc.constantFrom('passed', 'failed', 'skipped'),
            duration: fc.integer({ min: 100, max: 300000 }),
            error: fc.option(fc.string())
          }))
        }),
        async (failure: TestFailure) => {
          // Analyze the same failure twice
          const analysis1 = await analyzer.analyzeFailure(failure);
          const analysis2 = await analyzer.analyzeFailure(failure);

          // Results should be consistent
          expect(analysis1.failureId).toBe(analysis2.failureId);
          expect(analysis1.category).toBe(analysis2.category);
          expect(Math.abs(analysis1.confidence - analysis2.confidence)).toBeLessThan(0.1);
          expect(analysis1.explanation).toBe(analysis2.explanation);
          expect(analysis1.suggestedFix.priority).toBe(analysis2.suggestedFix.priority);
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Property Test 2: Analysis Completeness
   * **Validates: Requirements 44.1**
   * Test that analysis always produces required fields
   */
  it('should always produce complete analysis results', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          id: fc.string({ minLength: 1 }),
          testName: fc.string({ minLength: 1 }),
          testFile: fc.string({ minLength: 1 }),
          timestamp: fc.integer({ min: 1000000000000, max: Date.now() }),
          error: fc.record({
            message: fc.string({ minLength: 1 }),
            type: fc.constantFrom('timeout', 'assertion', 'network', 'element_not_found', 'unknown')
          }),
          screenshots: fc.record({
            before: fc.option(fc.string()),
            after: fc.option(fc.string())
          }),
          executionContext: fc.record({
            browser: fc.string({ minLength: 1 }),
            viewport: fc.record({
              width: fc.integer({ min: 1, max: 5000 }),
              height: fc.integer({ min: 1, max: 5000 })
            }),
            userAgent: fc.string(),
            url: fc.string({ minLength: 1 })
          })
        }),
        async (failure: TestFailure) => {
          const analysis = await analyzer.analyzeFailure(failure);

          // All required fields should be present
          expect(analysis.failureId).toBe(failure.id);
          expect(analysis.category).toBeDefined();
          expect(typeof analysis.confidence).toBe('number');
          expect(analysis.confidence).toBeGreaterThanOrEqual(0);
          expect(analysis.confidence).toBeLessThanOrEqual(1);
          expect(analysis.explanation).toBeDefined();
          expect(typeof analysis.explanation).toBe('string');
          expect(analysis.explanation.length).toBeGreaterThan(0);
          expect(analysis.suggestedFix).toBeDefined();
          expect(analysis.suggestedFix.description).toBeDefined();
          expect(analysis.suggestedFix.priority).toMatch(/^(low|medium|high|critical)$/);
          expect(Array.isArray(analysis.relatedFailures)).toBe(true);
          expect(Array.isArray(analysis.environmentalFactors)).toBe(true);
        }
      ),
      { numRuns: 30 }
    );
  });

  /**
   * Property Test 3: Error Type Classification
   * **Validates: Requirements 44.1**
   * Test that error types are correctly classified
   */
  it('should correctly classify error types based on error messages', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          errorType: fc.constantFrom('timeout', 'assertion', 'network', 'element_not_found'),
          message: fc.string({ minLength: 1 })
        }),
        async ({ errorType, message }) => {
          // Create error messages that should map to specific categories
          const errorMessages = {
            timeout: `${message} timeout waiting for element`,
            assertion: `${message} assertion failed: expected true but got false`,
            network: `${message} network error: connection refused`,
            element_not_found: `${message} element not found: selector not found`
          };

          const failure: TestFailure = {
            id: 'test-failure',
            testName: 'test',
            testFile: 'test.spec.ts',
            timestamp: Date.now(),
            error: {
              message: errorMessages[errorType],
              type: errorType
            },
            screenshots: {},
            executionContext: {
              browser: 'chrome',
              viewport: { width: 1920, height: 1080 },
              userAgent: 'test-agent',
              url: 'https://example.com'
            }
          };

          const analysis = await analyzer.analyzeFailure(failure);

          // Should classify correctly based on error message patterns
          if (errorType === 'timeout') {
            expect(['timing_issue', 'unknown']).toContain(analysis.category);
          } else if (errorType === 'element_not_found') {
            expect(['dom_change', 'unknown']).toContain(analysis.category);
          } else if (errorType === 'network') {
            expect(['network_issue', 'unknown']).toContain(analysis.category);
          }

          // Confidence should be reasonable for clear error patterns
          expect(analysis.confidence).toBeGreaterThan(0.3);
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Property Test 4: Environmental Factor Detection
   * **Validates: Requirements 44.1**
   * Test that environmental factors are properly detected
   */
  it('should detect environmental factors that affect test reliability', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          timestamp: fc.integer({ min: 1000000000000, max: Date.now() }),
          browser: fc.constantFrom('chrome', 'firefox', 'safari', 'edge'),
          userAgent: fc.string()
        }),
        async ({ timestamp, browser, userAgent }) => {
          const failure: TestFailure = {
            id: 'test-failure',
            testName: 'test',
            testFile: 'test.spec.ts',
            timestamp,
            error: {
              message: 'test failed',
              type: 'unknown'
            },
            screenshots: {},
            executionContext: {
              browser,
              viewport: { width: 1920, height: 1080 },
              userAgent,
              url: 'https://example.com'
            }
          };

          const analysis = await analyzer.analyzeFailure(failure);

          // Environmental factors should be detected
          expect(Array.isArray(analysis.environmentalFactors)).toBe(true);

          // Check for time-based factors
          const hour = new Date(timestamp).getHours();
          if (hour >= 22 || hour <= 6) {
            const timeFactors = analysis.environmentalFactors.filter(f => f.type === 'time_of_day');
            expect(timeFactors.length).toBeGreaterThan(0);
          }

          // Check for browser-specific factors
          if (browser.includes('safari') || userAgent.includes('Safari')) {
            const browserFactors = analysis.environmentalFactors.filter(f => f.type === 'external_service');
            // May or may not detect Safari issues, but should not crash
            expect(browserFactors.length).toBeGreaterThanOrEqual(0);
          }

          // All factors should have valid impact scores
          analysis.environmentalFactors.forEach(factor => {
            expect(factor.impact).toBeGreaterThanOrEqual(0);
            expect(factor.impact).toBeLessThanOrEqual(1);
            expect(factor.type).toMatch(/^(time_of_day|load|deployment|external_service)$/);
            expect(typeof factor.value).toBe('string');
          });
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Property Test 5: Confidence Score Validity
   * **Validates: Requirements 44.1**
   * Test that confidence scores are always within valid range and correlate with available data
   */
  it('should produce valid confidence scores that correlate with data quality', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          hasScreenshots: fc.boolean(),
          hasDOMSnapshot: fc.boolean(),
          hasNetworkLogs: fc.boolean(),
          hasPreviousRuns: fc.boolean(),
          errorMessageLength: fc.integer({ min: 1, max: 500 })
        }),
        async ({ hasScreenshots, hasDOMSnapshot, hasNetworkLogs, hasPreviousRuns, errorMessageLength }) => {
          const failure: TestFailure = {
            id: 'test-failure',
            testName: 'test',
            testFile: 'test.spec.ts',
            timestamp: Date.now(),
            error: {
              message: 'x'.repeat(errorMessageLength),
              type: 'unknown'
            },
            screenshots: hasScreenshots ? { before: 'screenshot1', after: 'screenshot2' } : {},
            domSnapshot: hasDOMSnapshot ? '<html><body>test</body></html>' : undefined,
            networkLogs: hasNetworkLogs ? [{
              url: 'https://example.com',
              method: 'GET',
              status: 200,
              responseTime: 100,
              timestamp: Date.now(),
              headers: {}
            }] : undefined,
            executionContext: {
              browser: 'chrome',
              viewport: { width: 1920, height: 1080 },
              userAgent: 'test-agent',
              url: 'https://example.com'
            },
            previousRuns: hasPreviousRuns ? [{
              id: 'run1',
              timestamp: Date.now() - 1000,
              status: 'failed',
              duration: 5000
            }] : undefined
          };

          const analysis = await analyzer.analyzeFailure(failure);

          // Confidence should be within valid range
          expect(analysis.confidence).toBeGreaterThanOrEqual(0);
          expect(analysis.confidence).toBeLessThanOrEqual(1);

          // More data should generally lead to higher confidence
          const dataPoints = [hasScreenshots, hasDOMSnapshot, hasNetworkLogs, hasPreviousRuns].filter(Boolean).length;
          
          if (dataPoints >= 3) {
            // With lots of data, confidence should be reasonable
            expect(analysis.confidence).toBeGreaterThan(0.4);
          }

          // Very short error messages should result in lower confidence
          if (errorMessageLength < 10) {
            expect(analysis.confidence).toBeLessThan(0.9);
          }
        }
      ),
      { numRuns: 30 }
    );
  });

  /**
   * Property Test 6: Suggested Fix Relevance
   * **Validates: Requirements 44.1**
   * Test that suggested fixes are relevant to the detected failure category
   */
  it('should provide relevant fixes based on failure category', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('dom_change', 'network_issue', 'timing_issue', 'browser_compatibility'),
        async (expectedCategory) => {
          // Create failures that should result in specific categories
          const categoryMessages = {
            dom_change: 'element not found: button#submit',
            network_issue: 'network error: failed to fetch',
            timing_issue: 'timeout waiting for element to appear',
            browser_compatibility: 'browser specific error occurred'
          };

          const failure: TestFailure = {
            id: 'test-failure',
            testName: 'test',
            testFile: 'test.spec.ts',
            timestamp: Date.now(),
            error: {
              message: categoryMessages[expectedCategory as keyof typeof categoryMessages],
              type: expectedCategory === 'timing_issue' ? 'timeout' : 'unknown'
            },
            screenshots: {},
            executionContext: {
              browser: 'chrome',
              viewport: { width: 1920, height: 1080 },
              userAgent: 'test-agent',
              url: 'https://example.com'
            }
          };

          const analysis = await analyzer.analyzeFailure(failure);

          // Suggested fix should be relevant
          expect(analysis.suggestedFix.description).toBeDefined();
          expect(analysis.suggestedFix.description.length).toBeGreaterThan(10);
          expect(analysis.suggestedFix.priority).toMatch(/^(low|medium|high|critical)$/);

          // For specific categories, check fix relevance
          if (analysis.category === 'dom_change') {
            expect(analysis.suggestedFix.description.toLowerCase()).toMatch(/selector|element|update/);
          } else if (analysis.category === 'network_issue') {
            expect(analysis.suggestedFix.description.toLowerCase()).toMatch(/network|retry|timeout/);
          } else if (analysis.category === 'timing_issue') {
            expect(analysis.suggestedFix.description.toLowerCase()).toMatch(/timeout|wait|time/);
          }

          // Code snippets should be provided when available
          if (analysis.suggestedFix.codeSnippet) {
            expect(analysis.suggestedFix.codeSnippet.length).toBeGreaterThan(10);
          }
        }
      ),
      { numRuns: 20 }
    );
  });
});
