/**
 * Healing Metrics Collector
 * Comprehensive metrics collection and analysis for self-healing performance
 */

import { HealingStrategy } from '@autoqa/database';
import {
  HealingMetrics,
  HealingAttempt,
  HealingResult,
  HealingEvent
} from '../types';

export interface DetailedMetrics extends HealingMetrics {
  strategyPerformance: Record<HealingStrategy, {
    attempts: number;
    successes: number;
    failures: number;
    averageConfidence: number;
    averageExecutionTime: number;
    successRate: number;
  }>;
  elementTypePerformance: Record<string, {
    attempts: number;
    successes: number;
    failures: number;
    successRate: number;
  }>;
  timeBasedMetrics: {
    hourlySuccessRate: Record<number, number>;
    dailyTrends: Array<{
      date: string;
      attempts: number;
      successRate: number;
    }>;
  };
}

export class HealingMetricsCollector {
  private metrics: HealingMetrics;
  private events: HealingEvent[];
  private strategyPerformance: Map<HealingStrategy, any>;
  private elementTypePerformance: Map<string, any>;

  constructor() {
    this.metrics = {
      totalAttempts: 0,
      successfulHealing: 0,
      failedHealing: 0,
      averageConfidence: 0,
      strategySuccessRates: {} as Record<HealingStrategy, number>,
      averageHealingTime: 0
    };
    this.events = [];
    this.strategyPerformance = new Map();
    this.elementTypePerformance = new Map();
  }

  recordHealingAttempt(result: HealingResult, attempts: HealingAttempt[]): void {
    this.metrics.totalAttempts += attempts.length;
    
    if (result.success) {
      this.metrics.successfulHealing++;
    } else {
      this.metrics.failedHealing++;
    }

    // Update strategy performance
    for (const attempt of attempts) {
      this.updateStrategyPerformance(attempt);
    }

    // Update averages
    this.updateAverages(result, attempts);
  }

  private updateStrategyPerformance(attempt: HealingAttempt): void {
    if (!this.strategyPerformance.has(attempt.strategy)) {
      this.strategyPerformance.set(attempt.strategy, {
        attempts: 0,
        successes: 0,
        failures: 0,
        totalConfidence: 0,
        totalExecutionTime: 0
      });
    }

    const perf = this.strategyPerformance.get(attempt.strategy)!;
    perf.attempts++;
    perf.totalConfidence += attempt.confidence;
    perf.totalExecutionTime += attempt.executionTime;

    if (attempt.success) {
      perf.successes++;
    } else {
      perf.failures++;
    }

    // Update success rate in main metrics
    this.metrics.strategySuccessRates[attempt.strategy] = perf.successes / perf.attempts;
  }

  private updateAverages(result: HealingResult, attempts: HealingAttempt[]): void {
    const totalHealing = this.metrics.successfulHealing + this.metrics.failedHealing;
    
    // Update average confidence
    this.metrics.averageConfidence = (
      (this.metrics.averageConfidence * (totalHealing - 1)) + result.confidence
    ) / totalHealing;

    // Update average healing time
    const totalTime = result.metadata?.totalExecutionTime || 0;
    this.metrics.averageHealingTime = (
      (this.metrics.averageHealingTime * (totalHealing - 1)) + totalTime
    ) / totalHealing;
  }

  getMetrics(): HealingMetrics {
    return { ...this.metrics };
  }

  getDetailedMetrics(): DetailedMetrics {
    const strategyPerformance: Record<HealingStrategy, any> = {};
    
    for (const [strategy, perf] of this.strategyPerformance.entries()) {
      strategyPerformance[strategy] = {
        attempts: perf.attempts,
        successes: perf.successes,
        failures: perf.failures,
        averageConfidence: perf.totalConfidence / perf.attempts,
        averageExecutionTime: perf.totalExecutionTime / perf.attempts,
        successRate: perf.successes / perf.attempts
      };
    }

    return {
      ...this.metrics,
      strategyPerformance,
      elementTypePerformance: Object.fromEntries(this.elementTypePerformance),
      timeBasedMetrics: {
        hourlySuccessRate: {},
        dailyTrends: []
      }
    };
  }

  reset(): void {
    this.metrics = {
      totalAttempts: 0,
      successfulHealing: 0,
      failedHealing: 0,
      averageConfidence: 0,
      strategySuccessRates: {} as Record<HealingStrategy, number>,
      averageHealingTime: 0
    };
    this.events = [];
    this.strategyPerformance.clear();
    this.elementTypePerformance.clear();
  }
}