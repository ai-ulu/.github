import { TestRun } from '../types';

export interface PatternAnalysis {
  isFlaky: boolean;
  failureRate: number;
  recentDegradation: boolean;
  timeBasedPatterns: TimePattern[];
  consistencyScore: number;
  trend: 'improving' | 'stable' | 'degrading';
}

export interface TimePattern {
  type: 'hourly' | 'daily' | 'weekly';
  pattern: { period: string; failureRate: number }[];
  confidence: number;
}

export class PatternMatcher {
  findPatterns(testRuns: TestRun[]): PatternAnalysis {
    if (testRuns.length === 0) {
      return this.getDefaultPattern();
    }

    const sortedRuns = testRuns.sort((a, b) => a.timestamp - b.timestamp);
    
    return {
      isFlaky: this.detectFlakiness(sortedRuns),
      failureRate: this.calculateFailureRate(sortedRuns),
      recentDegradation: this.detectRecentDegradation(sortedRuns),
      timeBasedPatterns: this.findTimeBasedPatterns(sortedRuns),
      consistencyScore: this.calculateConsistencyScore(sortedRuns),
      trend: this.analyzeTrend(sortedRuns)
    };
  }

  private detectFlakiness(runs: TestRun[]): boolean {
    if (runs.length < 10) return false; // Need sufficient data

    // Check for alternating pass/fail patterns
    let alternations = 0;
    for (let i = 1; i < runs.length; i++) {
      if (runs[i].status !== runs[i - 1].status) {
        alternations++;
      }
    }

    const alternationRate = alternations / (runs.length - 1);
    
    // Also check failure rate - flaky tests typically have 10-90% failure rate
    const failureRate = this.calculateFailureRate(runs);
    
    return alternationRate > 0.3 && failureRate > 0.1 && failureRate < 0.9;
  }

  private calculateFailureRate(runs: TestRun[]): number {
    if (runs.length === 0) return 0;
    
    const failures = runs.filter(run => run.status === 'failed').length;
    return failures / runs.length;
  }

  private detectRecentDegradation(runs: TestRun[]): boolean {
    if (runs.length < 20) return false; // Need sufficient data

    const recentRuns = runs.slice(-10); // Last 10 runs
    const olderRuns = runs.slice(0, -10); // All but last 10 runs

    const recentFailureRate = this.calculateFailureRate(recentRuns);
    const olderFailureRate = this.calculateFailureRate(olderRuns);

    // Degradation if recent failure rate is significantly higher
    return recentFailureRate > olderFailureRate + 0.2;
  }

  private findTimeBasedPatterns(runs: TestRun[]): TimePattern[] {
    const patterns: TimePattern[] = [];

    // Hourly patterns
    const hourlyPattern = this.analyzeHourlyPattern(runs);
    if (hourlyPattern.confidence > 0.6) {
      patterns.push(hourlyPattern);
    }

    // Daily patterns
    const dailyPattern = this.analyzeDailyPattern(runs);
    if (dailyPattern.confidence > 0.6) {
      patterns.push(dailyPattern);
    }

    // Weekly patterns
    const weeklyPattern = this.analyzeWeeklyPattern(runs);
    if (weeklyPattern.confidence > 0.6) {
      patterns.push(weeklyPattern);
    }

    return patterns;
  }

  private analyzeHourlyPattern(runs: TestRun[]): TimePattern {
    const hourlyStats = new Map<number, { total: number; failures: number }>();

    // Initialize all hours
    for (let hour = 0; hour < 24; hour++) {
      hourlyStats.set(hour, { total: 0, failures: 0 });
    }

    // Collect stats
    runs.forEach(run => {
      const hour = new Date(run.timestamp).getHours();
      const stats = hourlyStats.get(hour)!;
      stats.total++;
      if (run.status === 'failed') {
        stats.failures++;
      }
    });

    // Calculate failure rates and find patterns
    const pattern = Array.from(hourlyStats.entries()).map(([hour, stats]) => ({
      period: hour.toString().padStart(2, '0') + ':00',
      failureRate: stats.total > 0 ? stats.failures / stats.total : 0
    }));

    // Calculate confidence based on data distribution and variance
    const confidence = this.calculatePatternConfidence(pattern.map(p => p.failureRate));

    return {
      type: 'hourly',
      pattern,
      confidence
    };
  }

  private analyzeDailyPattern(runs: TestRun[]): TimePattern {
    const dailyStats = new Map<string, { total: number; failures: number }>();
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    // Initialize all days
    days.forEach(day => {
      dailyStats.set(day, { total: 0, failures: 0 });
    });

    // Collect stats
    runs.forEach(run => {
      const dayName = days[new Date(run.timestamp).getDay()];
      const stats = dailyStats.get(dayName)!;
      stats.total++;
      if (run.status === 'failed') {
        stats.failures++;
      }
    });

    const pattern = Array.from(dailyStats.entries()).map(([day, stats]) => ({
      period: day,
      failureRate: stats.total > 0 ? stats.failures / stats.total : 0
    }));

    const confidence = this.calculatePatternConfidence(pattern.map(p => p.failureRate));

    return {
      type: 'daily',
      pattern,
      confidence
    };
  }

  private analyzeWeeklyPattern(runs: TestRun[]): TimePattern {
    const weeklyStats = new Map<number, { total: number; failures: number }>();

    runs.forEach(run => {
      const weekNumber = this.getWeekNumber(new Date(run.timestamp));
      if (!weeklyStats.has(weekNumber)) {
        weeklyStats.set(weekNumber, { total: 0, failures: 0 });
      }
      
      const stats = weeklyStats.get(weekNumber)!;
      stats.total++;
      if (run.status === 'failed') {
        stats.failures++;
      }
    });

    const pattern = Array.from(weeklyStats.entries()).map(([week, stats]) => ({
      period: `Week ${week}`,
      failureRate: stats.total > 0 ? stats.failures / stats.total : 0
    }));

    const confidence = this.calculatePatternConfidence(pattern.map(p => p.failureRate));

    return {
      type: 'weekly',
      pattern,
      confidence
    };
  }

  private calculatePatternConfidence(failureRates: number[]): number {
    if (failureRates.length === 0) return 0;

    // Calculate variance - higher variance suggests a pattern
    const mean = failureRates.reduce((sum, rate) => sum + rate, 0) / failureRates.length;
    const variance = failureRates.reduce((sum, rate) => sum + Math.pow(rate - mean, 2), 0) / failureRates.length;
    
    // Normalize variance to 0-1 scale
    const normalizedVariance = Math.min(variance * 4, 1);
    
    // Also consider if there's enough data
    const dataConfidence = Math.min(failureRates.length / 10, 1);
    
    return normalizedVariance * dataConfidence;
  }

  private calculateConsistencyScore(runs: TestRun[]): number {
    if (runs.length === 0) return 1;

    const failureRate = this.calculateFailureRate(runs);
    
    // Consistency is higher when failure rate is close to 0 or 1
    // and lower when it's around 0.5 (most inconsistent)
    const distanceFromMiddle = Math.abs(failureRate - 0.5);
    return distanceFromMiddle * 2; // Scale to 0-1
  }

  private analyzeTrend(runs: TestRun[]): 'improving' | 'stable' | 'degrading' {
    if (runs.length < 10) return 'stable';

    const windowSize = Math.min(10, Math.floor(runs.length / 3));
    const recentRuns = runs.slice(-windowSize);
    const olderRuns = runs.slice(0, windowSize);

    const recentFailureRate = this.calculateFailureRate(recentRuns);
    const olderFailureRate = this.calculateFailureRate(olderRuns);

    const difference = recentFailureRate - olderFailureRate;
    const threshold = 0.1; // 10% change threshold

    if (difference > threshold) return 'degrading';
    if (difference < -threshold) return 'improving';
    return 'stable';
  }

  private getWeekNumber(date: Date): number {
    const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
    const pastDaysOfYear = (date.getTime() - firstDayOfYear.getTime()) / 86400000;
    return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
  }

  private getDefaultPattern(): PatternAnalysis {
    return {
      isFlaky: false,
      failureRate: 0,
      recentDegradation: false,
      timeBasedPatterns: [],
      consistencyScore: 1,
      trend: 'stable'
    };
  }

  // Additional pattern detection methods
  detectSequentialPatterns(runs: TestRun[]): {
    consecutiveFailures: number;
    consecutivePasses: number;
    longestFailureStreak: number;
    longestPassStreak: number;
  } {
    let consecutiveFailures = 0;
    let consecutivePasses = 0;
    let longestFailureStreak = 0;
    let longestPassStreak = 0;
    let currentFailureStreak = 0;
    let currentPassStreak = 0;

    runs.forEach(run => {
      if (run.status === 'failed') {
        currentFailureStreak++;
        currentPassStreak = 0;
        longestFailureStreak = Math.max(longestFailureStreak, currentFailureStreak);
      } else if (run.status === 'passed') {
        currentPassStreak++;
        currentFailureStreak = 0;
        longestPassStreak = Math.max(longestPassStreak, currentPassStreak);
      }
    });

    // Get current streaks
    const lastRun = runs[runs.length - 1];
    if (lastRun) {
      if (lastRun.status === 'failed') {
        consecutiveFailures = currentFailureStreak;
      } else if (lastRun.status === 'passed') {
        consecutivePasses = currentPassStreak;
      }
    }

    return {
      consecutiveFailures,
      consecutivePasses,
      longestFailureStreak,
      longestPassStreak
    };
  }

  detectPerformancePatterns(runs: TestRun[]): {
    averageDuration: number;
    durationTrend: 'faster' | 'stable' | 'slower';
    durationVariance: number;
    slowRuns: TestRun[];
  } {
    if (runs.length === 0) {
      return {
        averageDuration: 0,
        durationTrend: 'stable',
        durationVariance: 0,
        slowRuns: []
      };
    }

    const durations = runs.map(run => run.duration);
    const averageDuration = durations.reduce((sum, d) => sum + d, 0) / durations.length;
    
    // Calculate variance
    const variance = durations.reduce((sum, d) => sum + Math.pow(d - averageDuration, 2), 0) / durations.length;
    
    // Analyze trend
    const windowSize = Math.min(5, Math.floor(runs.length / 3));
    const recentRuns = runs.slice(-windowSize);
    const olderRuns = runs.slice(0, windowSize);
    
    const recentAvgDuration = recentRuns.reduce((sum, run) => sum + run.duration, 0) / recentRuns.length;
    const olderAvgDuration = olderRuns.reduce((sum, run) => sum + run.duration, 0) / olderRuns.length;
    
    let durationTrend: 'faster' | 'stable' | 'slower' = 'stable';
    const durationDifference = recentAvgDuration - olderAvgDuration;
    const threshold = averageDuration * 0.2; // 20% change threshold
    
    if (durationDifference > threshold) durationTrend = 'slower';
    else if (durationDifference < -threshold) durationTrend = 'faster';
    
    // Find slow runs (2 standard deviations above mean)
    const standardDeviation = Math.sqrt(variance);
    const slowThreshold = averageDuration + (2 * standardDeviation);
    const slowRuns = runs.filter(run => run.duration > slowThreshold);

    return {
      averageDuration,
      durationTrend,
      durationVariance: variance,
      slowRuns
    };
  }
}