import { TestFailure, RootCauseAnalysis, FailureCategory, EnvironmentalFactor } from './types';
import { AIProvider } from './utils/aiProvider';
import { ImageAnalyzer } from './utils/imageAnalyzer';
import { DOMAnalyzer } from './utils/domAnalyzer';
import { NetworkAnalyzer } from './utils/networkAnalyzer';
import { PatternMatcher } from './utils/patternMatcher';

export class RootCauseAnalyzer {
  private aiProvider: AIProvider;
  private imageAnalyzer: ImageAnalyzer;
  private domAnalyzer: DOMAnalyzer;
  private networkAnalyzer: NetworkAnalyzer;
  private patternMatcher: PatternMatcher;

  constructor(aiProvider: AIProvider) {
    this.aiProvider = aiProvider;
    this.imageAnalyzer = new ImageAnalyzer();
    this.domAnalyzer = new DOMAnalyzer();
    this.networkAnalyzer = new NetworkAnalyzer();
    this.patternMatcher = new PatternMatcher();
  }

  async analyzeFailure(failure: TestFailure): Promise<RootCauseAnalysis> {
    // Multi-step analysis approach
    const analyses = await Promise.all([
      this.analyzeError(failure),
      this.analyzeVisualChanges(failure),
      this.analyzeDOMChanges(failure),
      this.analyzeNetworkIssues(failure),
      this.analyzeEnvironmentalFactors(failure),
      this.analyzeHistoricalPatterns(failure)
    ]);

    // Combine all analyses
    const combinedAnalysis = this.combineAnalyses(failure, analyses);
    
    // Generate AI-powered explanation
    const aiExplanation = await this.generateAIExplanation(failure, combinedAnalysis);
    
    return {
      failureId: failure.id,
      category: combinedAnalysis.category,
      confidence: combinedAnalysis.confidence,
      explanation: aiExplanation.explanation,
      suggestedFix: aiExplanation.suggestedFix,
      relatedFailures: await this.findRelatedFailures(failure),
      environmentalFactors: combinedAnalysis.environmentalFactors
    };
  }

  private async analyzeError(failure: TestFailure): Promise<Partial<RootCauseAnalysis>> {
    const { error } = failure;
    
    // Pattern matching for common error types
    const errorPatterns = {
      'element not found': 'dom_change',
      'timeout': 'timing_issue',
      'network error': 'network_issue',
      'assertion failed': 'test_data_issue',
      'browser crashed': 'infrastructure_issue'
    };

    let category: FailureCategory = 'unknown' as any;
    let confidence = 0.5;

    // Check error message patterns
    for (const [pattern, cat] of Object.entries(errorPatterns)) {
      if (error.message.toLowerCase().includes(pattern)) {
        category = cat as FailureCategory;
        confidence = 0.8;
        break;
      }
    }

    // Analyze stack trace for more context
    if (error.stack) {
      const stackAnalysis = this.analyzeStackTrace(error.stack);
      if (stackAnalysis.confidence > confidence) {
        category = stackAnalysis.category;
        confidence = stackAnalysis.confidence;
      }
    }

    return { category, confidence: confidence };
  }

  private async analyzeVisualChanges(failure: TestFailure): Promise<Partial<RootCauseAnalysis>> {
    if (!failure.screenshots.before || !failure.screenshots.after) {
      return { confidence: 0 };
    }

    try {
      const visualDiff = await this.imageAnalyzer.compareScreenshots(
        failure.screenshots.before,
        failure.screenshots.after
      );

      if (visualDiff.differencePercentage > 0.1) { // 10% difference threshold
        const aiAnalysis = await this.aiProvider.analyzeImage(
          Buffer.from(failure.screenshots.diff || '', 'base64'),
          `Analyze this visual difference in a test failure. What changed and why might it cause the test to fail?`
        );

        return {
          category: 'dom_change',
          confidence: Math.min(visualDiff.differencePercentage * 2, 0.9),
          explanation: aiAnalysis
        };
      }
    } catch (error) {
      console.error('Visual analysis failed:', error);
    }

    return { confidence: 0 };
  }

  private async analyzeDOMChanges(failure: TestFailure): Promise<Partial<RootCauseAnalysis>> {
    if (!failure.domSnapshot) {
      return { confidence: 0 };
    }

    const domAnalysis = await this.domAnalyzer.analyzeDOMSnapshot(failure.domSnapshot);
    
    // Check for common DOM issues
    const issues = [
      ...domAnalysis.missingElements,
      ...domAnalysis.changedSelectors,
      ...domAnalysis.structuralChanges
    ];

    if (issues.length > 0) {
      return {
        category: 'dom_change',
        confidence: 0.85,
        explanation: `DOM structure changed: ${issues.join(', ')}`
      };
    }

    return { confidence: 0 };
  }

  private async analyzeNetworkIssues(failure: TestFailure): Promise<Partial<RootCauseAnalysis>> {
    if (!failure.networkLogs || failure.networkLogs.length === 0) {
      return { confidence: 0 };
    }

    const networkAnalysis = this.networkAnalyzer.analyzeNetworkLogs(failure.networkLogs);
    
    if (networkAnalysis.hasErrors) {
      return {
        category: 'network_issue',
        confidence: 0.8,
        explanation: `Network issues detected: ${networkAnalysis.errors.join(', ')}`
      };
    }

    if (networkAnalysis.slowRequests.length > 0) {
      return {
        category: 'timing_issue',
        confidence: 0.7,
        explanation: `Slow network requests: ${networkAnalysis.slowRequests.map(r => r.url).join(', ')}`
      };
    }

    return { confidence: 0 };
  }

  private async analyzeEnvironmentalFactors(failure: TestFailure): Promise<{ environmentalFactors: EnvironmentalFactor[] }> {
    const factors: EnvironmentalFactor[] = [];
    
    // Time-based analysis
    const hour = new Date(failure.timestamp).getHours();
    if (hour >= 22 || hour <= 6) {
      factors.push({
        type: 'time_of_day',
        value: 'off_hours',
        impact: 0.3
      });
    }

    // Browser analysis
    const { browser, userAgent } = failure.executionContext;
    if (browser.includes('Safari') || userAgent.includes('Safari')) {
      factors.push({
        type: 'external_service',
        value: 'safari_compatibility',
        impact: 0.4
      });
    }

    return { environmentalFactors: factors };
  }

  private async analyzeHistoricalPatterns(failure: TestFailure): Promise<Partial<RootCauseAnalysis>> {
    if (!failure.previousRuns || failure.previousRuns.length === 0) {
      return { confidence: 0 };
    }

    const patterns = this.patternMatcher.findPatterns(failure.previousRuns);
    
    if (patterns.isFlaky) {
      return {
        category: 'flaky_test',
        confidence: 0.9,
        explanation: `Test shows flaky behavior with ${patterns.failureRate}% failure rate`
      };
    }

    if (patterns.recentDegradation) {
      return {
        category: 'code_change_impact',
        confidence: 0.8,
        explanation: 'Test started failing recently, likely due to code changes'
      };
    }

    return { confidence: 0 };
  }

  private combineAnalyses(failure: TestFailure, analyses: Partial<RootCauseAnalysis>[]): {
    category: FailureCategory;
    confidence: number;
    environmentalFactors: EnvironmentalFactor[];
  } {
    // Find the analysis with highest confidence
    const bestAnalysis = analyses.reduce((best, current) => {
      return (current.confidence || 0) > (best.confidence || 0) ? current : best;
    }, { confidence: 0 });

    // Combine environmental factors
    const environmentalFactors = analyses
      .flatMap(a => (a as any).environmentalFactors || [])
      .filter(Boolean);

    return {
      category: bestAnalysis.category || 'unknown' as any,
      confidence: bestAnalysis.confidence || 0.5,
      environmentalFactors
    };
  }

  private async generateAIExplanation(
    failure: TestFailure, 
    analysis: { category: FailureCategory; confidence: number }
  ): Promise<{ explanation: string; suggestedFix: any }> {
    const prompt = `
Analyze this test failure and provide a clear explanation and fix suggestion:

Test: ${failure.testName}
Error: ${failure.error.message}
Category: ${analysis.category}
Confidence: ${analysis.confidence}

Context:
- Browser: ${failure.executionContext.browser}
- URL: ${failure.executionContext.url}
- Timestamp: ${new Date(failure.timestamp).toISOString()}

Please provide:
1. A clear, non-technical explanation of why the test failed
2. A specific fix suggestion with code if applicable
3. Priority level (low/medium/high/critical)

Format as JSON with keys: explanation, suggestedFix (with description, codeSnippet, priority)
`;

    try {
      const aiResponse = await this.aiProvider.generateAnalysis(prompt);
      return JSON.parse(aiResponse);
    } catch (error) {
      // Fallback to rule-based explanation
      return this.generateRuleBasedExplanation(failure, analysis);
    }
  }

  private generateRuleBasedExplanation(
    failure: TestFailure,
    analysis: { category: FailureCategory; confidence: number }
  ): { explanation: string; suggestedFix: any } {
    const explanations = {
      dom_change: 'The page structure changed, causing the test to fail when trying to find elements.',
      network_issue: 'Network problems prevented the test from completing successfully.',
      timing_issue: 'The test timed out waiting for elements or actions to complete.',
      browser_compatibility: 'Browser-specific behavior caused the test to fail.',
      test_data_issue: 'Test data or assertions were incorrect.',
      infrastructure_issue: 'Infrastructure problems affected test execution.',
      flaky_test: 'This test shows inconsistent behavior and may be flaky.',
      code_change_impact: 'Recent code changes likely caused this test to start failing.'
    };

    const fixes: Record<FailureCategory, any> = {
      dom_change: {
        description: 'Update selectors to match the new page structure',
        codeSnippet: '// Update your selector to match the new element\nawait page.click(\'[data-testid="new-selector"]\');',
        priority: 'high' as const
      },
      network_issue: {
        description: 'Add retry logic or increase timeout for network requests',
        codeSnippet: '// Add retry logic\nawait page.waitForResponse(response => response.status() === 200, { timeout: 30000 });',
        priority: 'medium' as const
      },
      timing_issue: {
        description: 'Increase timeout or add explicit waits',
        codeSnippet: '// Increase timeout\nawait page.waitForSelector(\'selector\', { timeout: 10000 });',
        priority: 'medium' as const
      },
      browser_compatibility: {
        description: 'Add browser-specific handling',
        codeSnippet: '// Add browser detection\nif (browser === "safari") { /* specific handling */ }',
        priority: 'medium' as const
      },
      test_data_issue: {
        description: 'Review and update test data',
        codeSnippet: '// Update test data\nconst testData = { /* corrected data */ };',
        priority: 'medium' as const
      },
      infrastructure_issue: {
        description: 'Check infrastructure and environment',
        codeSnippet: '// Add environment checks\nif (process.env.NODE_ENV === "test") { /* handle test env */ }',
        priority: 'high' as const
      },
      flaky_test: {
        description: 'Investigate and fix flaky test behavior',
        codeSnippet: '// Add retry logic or improve test stability\nawait page.waitForLoadState("networkidle");',
        priority: 'high' as const
      },
      code_change_impact: {
        description: 'Review recent code changes',
        codeSnippet: '// Update test to match code changes\n// Review git diff and update selectors',
        priority: 'medium' as const
      }
    };

    return {
      explanation: explanations[analysis.category] || 'Unknown failure cause',
      suggestedFix: fixes[analysis.category] || {
        description: 'Manual investigation required',
        priority: 'medium' as const
      }
    };
  }

  private async findRelatedFailures(failure: TestFailure): Promise<string[]> {
    // This would typically query a database of historical failures
    // For now, return empty array
    return [];
  }

  private analyzeStackTrace(stack: string): { category: FailureCategory; confidence: number } {
    if (stack.includes('TimeoutError')) {
      return { category: 'timing_issue', confidence: 0.9 };
    }
    
    if (stack.includes('ElementNotFound') || stack.includes('NoSuchElement')) {
      return { category: 'dom_change', confidence: 0.85 };
    }
    
    if (stack.includes('NetworkError') || stack.includes('fetch')) {
      return { category: 'network_issue', confidence: 0.8 };
    }

    return { category: 'unknown' as any, confidence: 0.3 };
  }
}