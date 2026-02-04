import { TestRun, FlakyTestAnalysis, TestFailure } from './types';
import { PatternMatcher } from './utils/patternMatcher';
import { AIProvider } from './utils/aiProvider';

export class FlakyTestDetector {
  private patternMatcher: PatternMatcher;
  private aiProvider: AIProvider;

  constructor(aiProvider: AIProvider) {
    this.aiProvider = aiProvider;
    this.patternMatcher = new PatternMatcher();
  }

  async analyzeTestFlakiness(
    testId: string,
    testName: string,
    testRuns: TestRun[],
    recentFailures?: TestFailure[]
  ): Promise<FlakyTestAnalysis> {
    if (testRuns.length < 5) {
      return this.createMinimalAnalysis(testId, testName, testRuns);
    }

    // Get pattern analysis
    const patterns = this.patternMatcher.findPatterns(testRuns);
    const sequentialPatterns = this.patternMatcher.detectSequentialPatterns(testRuns);
    const performancePatterns = this.patternMatcher.detectPerformancePatterns(testRuns);

    // Calculate flakiness score
    const flakinessScore = this.calculateFlakinessScore(patterns, sequentialPatterns);
    
    // Analyze environmental patterns
    const environmentalPatterns = this.analyzeEnvironmentalPatterns(testRuns, recentFailures);

    // Generate AI-powered insights
    const aiInsights = await this.generateAIInsights(testName, patterns, recentFailures);

    // Determine recommendations
    const recommendations = this.generateRecommendations(
      flakinessScore,
      patterns,
      environmentalPatterns,
      performancePatterns
    );

    return {
      testId,
      testName,
      flakiness: {
        score: flakinessScore,
        confidence: this.calculateConfidence(testRuns.length, patterns),
        trend: patterns.trend
      },
      patterns: environmentalPatterns,
      recommendations,
      historicalData: {
        totalRuns: testRuns.length,
        failures: testRuns.filter(run => run.status === 'failed').length,
        successRate: 1 - patterns.failureRate,
        averageDuration: performancePatterns.averageDuration,
        lastFailure: this.getLastFailureTimestamp(testRuns)
      }
    };
  }

  private calculateFlakinessScore(
    patterns: any,
    sequentialPatterns: any
  ): number {
    let score = 0;

    // Base score from failure rate (flaky tests typically have 10-90% failure rate)
    const failureRate = patterns.failureRate;
    if (failureRate > 0.1 && failureRate < 0.9) {
      score += 0.4; // High contribution for being in flaky range
    } else if (failureRate > 0.05 && failureRate < 0.95) {
      score += 0.2; // Medium contribution for being somewhat flaky
    }

    // Pattern inconsistency (lower consistency = higher flakiness)
    score += (1 - patterns.consistencyScore) * 0.3;

    // Sequential pattern analysis
    const maxStreak = Math.max(
      sequentialPatterns.longestFailureStreak,
      sequentialPatterns.longestPassStreak
    );
    
    // Moderate streaks suggest flakiness (not always failing, not always passing)
    if (maxStreak > 2 && maxStreak < 10) {
      score += 0.2;
    }

    // Time-based patterns suggest environmental flakiness
    if (patterns.timeBasedPatterns.length > 0) {
      const avgConfidence = patterns.timeBasedPatterns.reduce(
        (sum: number, p: any) => sum + p.confidence, 0
      ) / patterns.timeBasedPatterns.length;
      score += avgConfidence * 0.1;
    }

    return Math.min(score, 1); // Cap at 1.0
  }

  private analyzeEnvironmentalPatterns(
    testRuns: TestRun[],
    recentFailures?: TestFailure[]
  ): FlakyTestAnalysis['patterns'] {
    const patterns: FlakyTestAnalysis['patterns'] = {};

    // Time of day analysis
    const hourlyStats = new Map<number, { total: number; failures: number }>();
    testRuns.forEach(run => {
      const hour = new Date(run.timestamp).getHours();
      if (!hourlyStats.has(hour)) {
        hourlyStats.set(hour, { total: 0, failures: 0 });
      }
      const stats = hourlyStats.get(hour)!;
      stats.total++;
      if (run.status === 'failed') {
        stats.failures++;
      }
    });

    if (hourlyStats.size > 1) {
      patterns.timeOfDay = Array.from(hourlyStats.entries()).map(([hour, stats]) => ({
        hour,
        failureRate: stats.total > 0 ? stats.failures / stats.total : 0
      }));
    }

    // Day of week analysis
    const dayStats = new Map<string, { total: number; failures: number }>();
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    
    testRuns.forEach(run => {
      const day = days[new Date(run.timestamp).getDay()];
      if (!dayStats.has(day)) {
        dayStats.set(day, { total: 0, failures: 0 });
      }
      const stats = dayStats.get(day)!;
      stats.total++;
      if (run.status === 'failed') {
        stats.failures++;
      }
    });

    if (dayStats.size > 1) {
      patterns.dayOfWeek = Array.from(dayStats.entries()).map(([day, stats]) => ({
        day,
        failureRate: stats.total > 0 ? stats.failures / stats.total : 0
      }));
    }

    // Browser analysis (if available in recent failures)
    if (recentFailures && recentFailures.length > 0) {
      const browserStats = new Map<string, { total: number; failures: number }>();
      
      recentFailures.forEach(failure => {
        const browser = failure.executionContext.browser;
        if (!browserStats.has(browser)) {
          browserStats.set(browser, { total: 0, failures: 0 });
        }
        browserStats.get(browser)!.failures++;
      });

      // We'd need all test runs with browser info to calculate total
      // For now, just track failure counts
      if (browserStats.size > 0) {
        patterns.browser = Array.from(browserStats.entries()).map(([browser, stats]) => ({
          browser,
          failureRate: 1 // We only have failure data, so assume 100% for now
        }));
      }
    }

    return patterns;
  }

  private async generateAIInsights(
    testName: string,
    patterns: any,
    recentFailures?: TestFailure[]
  ): Promise<string> {
    const prompt = `
Analyze this potentially flaky test and provide insights:

Test Name: ${testName}
Failure Rate: ${(patterns.failureRate * 100).toFixed(1)}%
Trend: ${patterns.trend}
Is Flaky: ${patterns.isFlaky}
Recent Degradation: ${patterns.recentDegradation}

${recentFailures ? `Recent Failures:
${recentFailures.slice(0, 3).map(f => `- ${f.error.message}`).join('\n')}` : ''}

Provide:
1. Root cause hypothesis for flakiness
2. Environmental factors that might contribute
3. Specific recommendations to reduce flakiness

Keep response concise and actionable.
`;

    try {
      return await this.aiProvider.generateAnalysis(prompt);
    } catch (error) {
      return this.generateRuleBasedInsights(patterns, recentFailures);
    }
  }

  private generateRuleBasedInsights(patterns: any, recentFailures?: TestFailure[]): string {
    const insights: string[] = [];

    if (patterns.failureRate > 0.1 && patterns.failureRate < 0.9) {
      insights.push('Test shows intermittent failures, indicating flaky behavior.');
    }

    if (patterns.recentDegradation) {
      insights.push('Test reliability has degraded recently, possibly due to code changes.');
    }

    if (patterns.timeBasedPatterns.length > 0) {
      insights.push('Test failures correlate with specific times, suggesting environmental factors.');
    }

    if (recentFailures && recentFailures.length > 0) {
      const errorTypes = recentFailures.map(f => f.error.type);
      const uniqueTypes = [...new Set(errorTypes)];
      
      if (uniqueTypes.includes('timeout')) {
        insights.push('Timeout errors suggest timing-related flakiness.');
      }
      
      if (uniqueTypes.includes('element_not_found')) {
        insights.push('Element location failures suggest DOM-related flakiness.');
      }
    }

    return insights.length > 0 
      ? insights.join(' ')
      : 'Insufficient data to determine specific flakiness patterns.';
  }

  private generateRecommendations(
    flakinessScore: number,
    patterns: any,
    environmentalPatterns: any,
    performancePatterns: any
  ): FlakyTestAnalysis['recommendations'] {
    let action: 'quarantine' | 'investigate' | 'fix' | 'monitor' = 'monitor';
    let priority: 'low' | 'medium' | 'high' | 'critical' = 'low';
    let reason = '';

    if (flakinessScore > 0.8) {
      action = 'quarantine';
      priority = 'critical';
      reason = 'Highly flaky test causing unreliable results';
    } else if (flakinessScore > 0.6) {
      action = 'fix';
      priority = 'high';
      reason = 'Moderately flaky test needs immediate attention';
    } else if (flakinessScore > 0.4) {
      action = 'investigate';
      priority = 'medium';
      reason = 'Test shows signs of flakiness, investigate root cause';
    } else if (flakinessScore > 0.2) {
      action = 'monitor';
      priority = 'low';
      reason = 'Test occasionally fails, monitor for patterns';
    }

    // Adjust based on specific patterns
    if (patterns.recentDegradation) {
      priority = priority === 'low' ? 'medium' : priority;
      reason += '. Recent degradation detected';
    }

    if (environmentalPatterns.timeOfDay && environmentalPatterns.timeOfDay.length > 0) {
      const maxFailureRate = Math.max(...environmentalPatterns.timeOfDay.map((t: any) => t.failureRate));
      if (maxFailureRate > 0.5) {
        reason += '. Time-based failure patterns detected';
      }
    }

    if (performancePatterns.durationTrend === 'slower') {
      reason += '. Test performance is degrading';
    }

    return {
      action,
      reason: reason.replace(/^\./, '').trim(), // Remove leading dot
      priority
    };
  }

  private calculateConfidence(runCount: number, patterns: any): number {
    // Base confidence on amount of data
    let confidence = Math.min(runCount / 50, 1); // Full confidence at 50+ runs

    // Adjust based on pattern strength
    if (patterns.timeBasedPatterns.length > 0) {
      const avgPatternConfidence = patterns.timeBasedPatterns.reduce(
        (sum: number, p: any) => sum + p.confidence, 0
      ) / patterns.timeBasedPatterns.length;
      confidence = Math.max(confidence, avgPatternConfidence);
    }

    return confidence;
  }

  private getLastFailureTimestamp(testRuns: TestRun[]): number | undefined {
    const failures = testRuns.filter(run => run.status === 'failed');
    if (failures.length === 0) return undefined;
    
    return Math.max(...failures.map(run => run.timestamp));
  }

  private createMinimalAnalysis(
    testId: string,
    testName: string,
    testRuns: TestRun[]
  ): FlakyTestAnalysis {
    const failures = testRuns.filter(run => run.status === 'failed').length;
    const successRate = testRuns.length > 0 ? 1 - (failures / testRuns.length) : 1;

    return {
      testId,
      testName,
      flakiness: {
        score: 0,
        confidence: 0.1,
        trend: 'stable'
      },
      patterns: {},
      recommendations: {
        action: 'monitor',
        reason: 'Insufficient data for flakiness analysis',
        priority: 'low'
      },
      historicalData: {
        totalRuns: testRuns.length,
        failures,
        successRate,
        averageDuration: testRuns.reduce((sum, run) => sum + run.duration, 0) / testRuns.length || 0,
        lastFailure: this.getLastFailureTimestamp(testRuns)
      }
    };
  }

  // Batch analysis for multiple tests
  async analyzeMultipleTests(
    tests: Array<{
      testId: string;
      testName: string;
      testRuns: TestRun[];
      recentFailures?: TestFailure[];
    }>
  ): Promise<FlakyTestAnalysis[]> {
    const analyses = await Promise.all(
      tests.map(test => 
        this.analyzeTestFlakiness(
          test.testId,
          test.testName,
          test.testRuns,
          test.recentFailures
        )
      )
    );

    // Sort by flakiness score (most flaky first)
    return analyses.sort((a, b) => b.flakiness.score - a.flakiness.score);
  }

  // Get summary statistics for a test suite
  getFlakinessSummary(analyses: FlakyTestAnalysis[]): {
    totalTests: number;
    flakyTests: number;
    criticallyFlaky: number;
    averageFlakinessScore: number;
    recommendedActions: { [key: string]: number };
  } {
    const totalTests = analyses.length;
    const flakyTests = analyses.filter(a => a.flakiness.score > 0.2).length;
    const criticallyFlaky = analyses.filter(a => a.flakiness.score > 0.8).length;
    
    const averageFlakinessScore = totalTests > 0 
      ? analyses.reduce((sum, a) => sum + a.flakiness.score, 0) / totalTests
      : 0;

    const recommendedActions: { [key: string]: number } = {};
    analyses.forEach(analysis => {
      const action = analysis.recommendations.action;
      recommendedActions[action] = (recommendedActions[action] || 0) + 1;
    });

    return {
      totalTests,
      flakyTests,
      criticallyFlaky,
      averageFlakinessScore,
      recommendedActions
    };
  }
}