import { TestOptimization, OptimizationRecommendation, TestRun } from './types';
import { AIProvider } from './utils/aiProvider';

export interface TestSuiteMetrics {
  testSuite: string;
  tests: TestMetrics[];
  totalDuration: number;
  totalCost: number;
  parallelization: number;
  redundancy: number;
}

export interface TestMetrics {
  testId: string;
  testName: string;
  averageDuration: number;
  costPerRun: number;
  failureRate: number;
  lastRun: number;
  dependencies: string[];
  coverage: {
    lines: number;
    functions: number;
    branches: number;
  };
}

export class TestOptimizer {
  private aiProvider: AIProvider;
  private costPerMinute: number;

  constructor(aiProvider: AIProvider, costPerMinute: number = 0.05) {
    this.aiProvider = aiProvider;
    this.costPerMinute = costPerMinute;
  }

  async optimizeTestSuite(metrics: TestSuiteMetrics): Promise<TestOptimization> {
    // Analyze current state
    const currentMetrics = this.calculateCurrentMetrics(metrics);
    
    // Generate optimization recommendations
    const optimizations = await this.generateOptimizations(metrics);
    
    // Calculate projected savings
    const projectedSavings = this.calculateProjectedSavings(optimizations, currentMetrics);

    return {
      testSuite: metrics.testSuite,
      currentMetrics,
      optimizations,
      projectedSavings
    };
  }

  private calculateCurrentMetrics(metrics: TestSuiteMetrics): TestOptimization['currentMetrics'] {
    const totalDuration = metrics.tests.reduce((sum, test) => sum + test.averageDuration, 0);
    const totalCost = totalDuration * this.costPerMinute / 60; // Convert to minutes
    
    // Calculate parallelization potential (tests that can run in parallel)
    const parallelizableTests = metrics.tests.filter(test => test.dependencies.length === 0);
    const parallelization = parallelizableTests.length / metrics.tests.length;
    
    // Calculate redundancy (tests covering same code)
    const redundancy = this.calculateRedundancy(metrics.tests);

    return {
      totalDuration,
      totalCost,
      parallelization,
      redundancy
    };
  }

  private calculateRedundancy(tests: TestMetrics[]): number {
    // Simple redundancy calculation based on coverage overlap
    // In a real implementation, this would analyze actual code coverage
    const totalCoverage = tests.reduce((sum, test) => sum + test.coverage.lines, 0);
    const uniqueCoverage = Math.max(...tests.map(test => test.coverage.lines));
    
    return totalCoverage > 0 ? 1 - (uniqueCoverage / totalCoverage) : 0;
  }

  private async generateOptimizations(metrics: TestSuiteMetrics): Promise<OptimizationRecommendation[]> {
    const optimizations: OptimizationRecommendation[] = [];

    // 1. Parallelization opportunities
    const parallelizationOpt = this.analyzeParallelization(metrics);
    if (parallelizationOpt) optimizations.push(parallelizationOpt);

    // 2. Redundant test detection
    const redundancyOpts = this.analyzeRedundancy(metrics);
    optimizations.push(...redundancyOpts);

    // 3. Slow test optimization
    const slowTestOpts = this.analyzeSlowTests(metrics);
    optimizations.push(...slowTestOpts);

    // 4. Test splitting opportunities
    const splittingOpts = this.analyzeTestSplitting(metrics);
    optimizations.push(...splittingOpts);

    // 5. Caching opportunities
    const cachingOpts = this.analyzeCaching(metrics);
    optimizations.push(...cachingOpts);

    // 6. AI-powered optimizations
    const aiOpts = await this.generateAIOptimizations(metrics);
    optimizations.push(...aiOpts);

    // Sort by impact (time saved)
    return optimizations.sort((a, b) => b.impact.timeSaved - a.impact.timeSaved);
  }

  private analyzeParallelization(metrics: TestSuiteMetrics): OptimizationRecommendation | null {
    const independentTests = metrics.tests.filter(test => test.dependencies.length === 0);
    const dependentTests = metrics.tests.filter(test => test.dependencies.length > 0);

    if (independentTests.length < 2) return null;

    // Calculate potential time savings
    const totalSequentialTime = metrics.tests.reduce((sum, test) => sum + test.averageDuration, 0);
    const longestIndependentTest = Math.max(...independentTests.map(test => test.averageDuration));
    const dependentTestsTime = dependentTests.reduce((sum, test) => sum + test.averageDuration, 0);
    
    const parallelTime = longestIndependentTest + dependentTestsTime;
    const timeSaved = totalSequentialTime - parallelTime;

    if (timeSaved < 30) return null; // Not worth it for less than 30 seconds

    return {
      type: 'parallelize',
      description: `Run ${independentTests.length} independent tests in parallel`,
      impact: {
        timeSaved,
        costSaved: (timeSaved / 60) * this.costPerMinute,
        riskLevel: 'low'
      },
      implementation: {
        difficulty: 'easy',
        estimatedHours: 2,
        codeChanges: [
          'Update test runner configuration to enable parallelization',
          'Ensure test isolation (no shared state)',
          'Configure parallel execution limits based on available resources'
        ]
      }
    };
  }

  private analyzeRedundancy(metrics: TestSuiteMetrics): OptimizationRecommendation[] {
    const optimizations: OptimizationRecommendation[] = [];
    
    // Group tests by similar coverage patterns
    const coverageGroups = this.groupTestsByCoverage(metrics.tests);
    
    coverageGroups.forEach(group => {
      if (group.length < 2) return;

      // Find the most comprehensive test in the group
      const bestTest = group.reduce((best, current) => 
        current.coverage.lines > best.coverage.lines ? current : best
      );

      const redundantTests = group.filter(test => test.testId !== bestTest.testId);
      const timeSaved = redundantTests.reduce((sum, test) => sum + test.averageDuration, 0);

      if (timeSaved > 60) { // Only suggest if saves more than 1 minute
        optimizations.push({
          type: 'skip_redundant',
          description: `Skip ${redundantTests.length} redundant tests that duplicate coverage of ${bestTest.testName}`,
          impact: {
            timeSaved,
            costSaved: (timeSaved / 60) * this.costPerMinute,
            riskLevel: 'medium'
          },
          implementation: {
            difficulty: 'medium',
            estimatedHours: 4,
            codeChanges: [
              'Analyze code coverage overlap',
              'Merge redundant test cases into comprehensive tests',
              'Update test suite configuration'
            ]
          }
        });
      }
    });

    return optimizations;
  }

  private analyzeSlowTests(metrics: TestSuiteMetrics): OptimizationRecommendation[] {
    const optimizations: OptimizationRecommendation[] = [];
    
    // Find tests that are significantly slower than average
    const averageDuration = metrics.tests.reduce((sum, test) => sum + test.averageDuration, 0) / metrics.tests.length;
    const slowTests = metrics.tests.filter(test => test.averageDuration > averageDuration * 3);

    slowTests.forEach(test => {
      const potentialSavings = test.averageDuration * 0.5; // Assume 50% improvement possible
      
      optimizations.push({
        type: 'split_test',
        description: `Optimize slow test: ${test.testName} (${test.averageDuration}s)`,
        impact: {
          timeSaved: potentialSavings,
          costSaved: (potentialSavings / 60) * this.costPerMinute,
          riskLevel: 'medium'
        },
        implementation: {
          difficulty: 'hard',
          estimatedHours: 8,
          codeChanges: [
            'Profile test execution to identify bottlenecks',
            'Optimize database queries or API calls',
            'Consider splitting into smaller, focused tests',
            'Add test data caching where appropriate'
          ]
        }
      });
    });

    return optimizations;
  }

  private analyzeTestSplitting(metrics: TestSuiteMetrics): OptimizationRecommendation[] {
    const optimizations: OptimizationRecommendation[] = [];
    
    // Find very long tests that could be split
    const longTests = metrics.tests.filter(test => test.averageDuration > 300); // 5+ minutes

    longTests.forEach(test => {
      const estimatedParts = Math.ceil(test.averageDuration / 120); // Split into ~2 minute chunks
      const parallelTime = test.averageDuration / estimatedParts;
      const timeSaved = test.averageDuration - parallelTime;

      if (timeSaved > 60) {
        optimizations.push({
          type: 'split_test',
          description: `Split long test ${test.testName} into ${estimatedParts} parallel tests`,
          impact: {
            timeSaved,
            costSaved: (timeSaved / 60) * this.costPerMinute,
            riskLevel: 'high'
          },
          implementation: {
            difficulty: 'hard',
            estimatedHours: 12,
            codeChanges: [
              'Analyze test structure and identify logical split points',
              'Create separate test files for each part',
              'Ensure proper test isolation and data setup',
              'Update CI/CD configuration for parallel execution'
            ]
          }
        });
      }
    });

    return optimizations;
  }

  private analyzeCaching(metrics: TestSuiteMetrics): OptimizationRecommendation[] {
    const optimizations: OptimizationRecommendation[] = [];
    
    // Look for tests that might benefit from data caching
    const testsWithSetup = metrics.tests.filter(test => 
      test.testName.toLowerCase().includes('setup') || 
      test.averageDuration > 60 // Long tests likely have setup overhead
    );

    if (testsWithSetup.length > 2) {
      const totalSetupTime = testsWithSetup.reduce((sum, test) => sum + test.averageDuration * 0.3, 0); // Assume 30% is setup
      const potentialSavings = totalSetupTime * 0.7; // 70% reduction with caching

      optimizations.push({
        type: 'cache_data',
        description: `Implement test data caching to reduce setup time across ${testsWithSetup.length} tests`,
        impact: {
          timeSaved: potentialSavings,
          costSaved: (potentialSavings / 60) * this.costPerMinute,
          riskLevel: 'low'
        },
        implementation: {
          difficulty: 'medium',
          estimatedHours: 6,
          codeChanges: [
            'Implement test data caching layer',
            'Identify cacheable setup operations',
            'Add cache invalidation logic',
            'Update test setup/teardown procedures'
          ]
        }
      });
    }

    return optimizations;
  }

  private async generateAIOptimizations(metrics: TestSuiteMetrics): Promise<OptimizationRecommendation[]> {
    const prompt = `
Analyze this test suite and suggest optimizations:

Test Suite: ${metrics.testSuite}
Total Tests: ${metrics.tests.length}
Total Duration: ${Math.round(metrics.tests.reduce((sum, test) => sum + test.averageDuration, 0))}s
Average Test Duration: ${Math.round(metrics.tests.reduce((sum, test) => sum + test.averageDuration, 0) / metrics.tests.length)}s

Slowest Tests:
${metrics.tests
  .sort((a, b) => b.averageDuration - a.averageDuration)
  .slice(0, 5)
  .map(test => `- ${test.testName}: ${test.averageDuration}s`)
  .join('\n')}

Tests with Dependencies:
${metrics.tests
  .filter(test => test.dependencies.length > 0)
  .map(test => `- ${test.testName}: depends on [${test.dependencies.join(', ')}]`)
  .join('\n')}

Suggest specific optimizations focusing on:
1. Test execution order
2. Resource utilization
3. Test data management
4. Infrastructure optimizations

Format as JSON array with: type, description, estimatedTimeSaved, difficulty
`;

    try {
      const aiResponse = await this.aiProvider.generateAnalysis(prompt);
      const suggestions = JSON.parse(aiResponse);
      
      return suggestions.map((suggestion: any) => ({
        type: 'merge_tests', // Default type for AI suggestions
        description: suggestion.description,
        impact: {
          timeSaved: suggestion.estimatedTimeSaved || 0,
          costSaved: ((suggestion.estimatedTimeSaved || 0) / 60) * this.costPerMinute,
          riskLevel: suggestion.difficulty === 'hard' ? 'high' : 'medium'
        },
        implementation: {
          difficulty: suggestion.difficulty || 'medium',
          estimatedHours: suggestion.difficulty === 'hard' ? 8 : 4,
          codeChanges: [suggestion.description]
        }
      }));
    } catch (error) {
      console.error('AI optimization generation failed:', error);
      return [];
    }
  }

  private groupTestsByCoverage(tests: TestMetrics[]): TestMetrics[][] {
    const groups: TestMetrics[][] = [];
    const processed = new Set<string>();

    tests.forEach(test => {
      if (processed.has(test.testId)) return;

      const similarTests = tests.filter(otherTest => 
        !processed.has(otherTest.testId) &&
        this.calculateCoverageSimilarity(test, otherTest) > 0.7
      );

      if (similarTests.length > 1) {
        groups.push(similarTests);
        similarTests.forEach(t => processed.add(t.testId));
      }
    });

    return groups;
  }

  private calculateCoverageSimilarity(test1: TestMetrics, test2: TestMetrics): number {
    // Simple similarity calculation based on coverage numbers
    const lineSimilarity = 1 - Math.abs(test1.coverage.lines - test2.coverage.lines) / Math.max(test1.coverage.lines, test2.coverage.lines);
    const functionSimilarity = 1 - Math.abs(test1.coverage.functions - test2.coverage.functions) / Math.max(test1.coverage.functions, test2.coverage.functions);
    const branchSimilarity = 1 - Math.abs(test1.coverage.branches - test2.coverage.branches) / Math.max(test1.coverage.branches, test2.coverage.branches);
    
    return (lineSimilarity + functionSimilarity + branchSimilarity) / 3;
  }

  private calculateProjectedSavings(
    optimizations: OptimizationRecommendation[],
    currentMetrics: TestOptimization['currentMetrics']
  ): TestOptimization['projectedSavings'] {
    const totalTimeSaved = optimizations.reduce((sum, opt) => sum + opt.impact.timeSaved, 0);
    const totalCostSaved = optimizations.reduce((sum, opt) => sum + opt.impact.costSaved, 0);
    
    const percentageImprovement = currentMetrics.totalDuration > 0 
      ? (totalTimeSaved / currentMetrics.totalDuration) * 100
      : 0;

    return {
      timeSaved: totalTimeSaved,
      costSaved: totalCostSaved,
      percentageImprovement
    };
  }

  // Utility methods for test suite analysis
  analyzeTestDependencies(tests: TestMetrics[]): {
    independentTests: TestMetrics[];
    dependencyChains: TestMetrics[][];
    circularDependencies: string[];
  } {
    const independentTests = tests.filter(test => test.dependencies.length === 0);
    const dependentTests = tests.filter(test => test.dependencies.length > 0);
    
    // Build dependency chains
    const dependencyChains: TestMetrics[][] = [];
    const visited = new Set<string>();
    
    dependentTests.forEach(test => {
      if (visited.has(test.testId)) return;
      
      const chain = this.buildDependencyChain(test, tests, visited);
      if (chain.length > 1) {
        dependencyChains.push(chain);
      }
    });

    // Detect circular dependencies (simplified)
    const circularDependencies: string[] = [];
    dependentTests.forEach(test => {
      if (this.hasCircularDependency(test, tests, new Set())) {
        circularDependencies.push(test.testId);
      }
    });

    return {
      independentTests,
      dependencyChains,
      circularDependencies
    };
  }

  private buildDependencyChain(
    test: TestMetrics,
    allTests: TestMetrics[],
    visited: Set<string>
  ): TestMetrics[] {
    if (visited.has(test.testId)) return [];
    
    visited.add(test.testId);
    const chain = [test];
    
    test.dependencies.forEach(depId => {
      const depTest = allTests.find(t => t.testId === depId);
      if (depTest) {
        chain.push(...this.buildDependencyChain(depTest, allTests, visited));
      }
    });
    
    return chain;
  }

  private hasCircularDependency(
    test: TestMetrics,
    allTests: TestMetrics[],
    path: Set<string>
  ): boolean {
    if (path.has(test.testId)) return true;
    
    path.add(test.testId);
    
    for (const depId of test.dependencies) {
      const depTest = allTests.find(t => t.testId === depId);
      if (depTest && this.hasCircularDependency(depTest, allTests, new Set(path))) {
        return true;
      }
    }
    
    return false;
  }

  generateOptimizationReport(optimization: TestOptimization): string {
    const report = `
# Test Suite Optimization Report

## Current Metrics
- **Test Suite:** ${optimization.testSuite}
- **Total Duration:** ${Math.round(optimization.currentMetrics.totalDuration)}s
- **Total Cost:** $${optimization.currentMetrics.totalCost.toFixed(2)}
- **Parallelization:** ${Math.round(optimization.currentMetrics.parallelization * 100)}%
- **Redundancy:** ${Math.round(optimization.currentMetrics.redundancy * 100)}%

## Optimization Opportunities
${optimization.optimizations.map((opt, index) => `
### ${index + 1}. ${opt.description}
- **Type:** ${opt.type}
- **Time Saved:** ${Math.round(opt.impact.timeSaved)}s
- **Cost Saved:** $${opt.impact.costSaved.toFixed(2)}
- **Risk Level:** ${opt.impact.riskLevel}
- **Difficulty:** ${opt.implementation.difficulty}
- **Estimated Hours:** ${opt.implementation.estimatedHours}h
`).join('')}

## Projected Savings
- **Total Time Saved:** ${Math.round(optimization.projectedSavings.timeSaved)}s
- **Total Cost Saved:** $${optimization.projectedSavings.costSaved.toFixed(2)}
- **Performance Improvement:** ${optimization.projectedSavings.percentageImprovement.toFixed(1)}%

## Implementation Priority
${optimization.optimizations
  .sort((a, b) => b.impact.timeSaved - a.impact.timeSaved)
  .slice(0, 3)
  .map((opt, index) => `${index + 1}. ${opt.description}`)
  .join('\n')}
    `.trim();

    return report;
  }
}