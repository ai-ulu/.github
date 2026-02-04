import { 
  AITestGenerationRequest, 
  UserSession, 
  UserJourney, 
  ErrorLog,
  UserAction 
} from './types';
import { AIProvider } from './utils/aiProvider';

export interface GeneratedTest {
  id: string;
  name: string;
  description: string;
  code: string;
  framework: string;
  language: string;
  assertions: string[];
  testData: any;
  metadata: {
    generatedFrom: string;
    confidence: number;
    estimatedExecutionTime: number;
    complexity: 'simple' | 'medium' | 'complex';
  };
}

export interface TestGenerationResult {
  tests: GeneratedTest[];
  summary: {
    totalGenerated: number;
    successRate: number;
    averageConfidence: number;
    recommendations: string[];
  };
}

export class AITestGenerator {
  private aiProvider: AIProvider;

  constructor(aiProvider: AIProvider) {
    this.aiProvider = aiProvider;
  }

  async generateTests(request: AITestGenerationRequest): Promise<TestGenerationResult> {
    const tests: GeneratedTest[] = [];

    switch (request.type) {
      case 'natural_language':
        if (request.input.description) {
          const test = await this.generateFromNaturalLanguage(
            request.input.description,
            request.options
          );
          if (test) tests.push(test);
        }
        break;

      case 'user_behavior':
        if (request.input.sessionData) {
          const behaviorTests = await this.generateFromUserBehavior(
            request.input.sessionData,
            request.options
          );
          tests.push(...behaviorTests);
        }
        break;

      case 'session_replay':
        if (request.input.sessionData) {
          const replayTests = await this.generateFromSessionReplay(
            request.input.sessionData,
            request.options
          );
          tests.push(...replayTests);
        }
        break;

      case 'error_based':
        if (request.input.errorLogs) {
          const errorTests = await this.generateFromErrors(
            request.input.errorLogs,
            request.options
          );
          tests.push(...errorTests);
        }
        break;
    }

    return {
      tests,
      summary: this.generateSummary(tests)
    };
  }

  private async generateFromNaturalLanguage(
    description: string,
    options: AITestGenerationRequest['options']
  ): Promise<GeneratedTest | null> {
    const prompt = this.buildNaturalLanguagePrompt(description, options);
    
    try {
      const code = await this.aiProvider.generateCode(prompt, options.language);
      
      if (!code || code.trim().length === 0) {
        return null;
      }

      return {
        id: this.generateTestId(),
        name: this.extractTestName(description),
        description,
        code: this.cleanGeneratedCode(code),
        framework: options.framework,
        language: options.language,
        assertions: this.extractAssertions(code),
        testData: this.extractTestData(code),
        metadata: {
          generatedFrom: 'natural_language',
          confidence: this.calculateConfidence(code, description),
          estimatedExecutionTime: this.estimateExecutionTime(code),
          complexity: this.assessComplexity(code)
        }
      };
    } catch (error) {
      console.error('Natural language test generation failed:', error);
      return null;
    }
  }

  private async generateFromUserBehavior(
    sessions: UserSession[],
    options: AITestGenerationRequest['options']
  ): Promise<GeneratedTest[]> {
    const tests: GeneratedTest[] = [];
    
    // Analyze user journeys to find common patterns
    const journeys = this.analyzeUserJourneys(sessions);
    
    for (const journey of journeys) {
      if (journey.frequency < 5) continue; // Skip infrequent journeys
      
      const test = await this.generateFromUserJourney(journey, options);
      if (test) tests.push(test);
    }

    return tests;
  }

  private async generateFromSessionReplay(
    sessions: UserSession[],
    options: AITestGenerationRequest['options']
  ): Promise<GeneratedTest[]> {
    const tests: GeneratedTest[] = [];

    for (const session of sessions.slice(0, 10)) { // Limit to 10 sessions
      if (session.outcome !== 'success') continue; // Only successful sessions
      
      const test = await this.generateFromSingleSession(session, options);
      if (test) tests.push(test);
    }

    return tests;
  }

  private async generateFromErrors(
    errorLogs: ErrorLog[],
    options: AITestGenerationRequest['options']
  ): Promise<GeneratedTest[]> {
    const tests: GeneratedTest[] = [];
    
    // Group errors by type and frequency
    const errorGroups = this.groupErrorsByPattern(errorLogs);
    
    for (const group of errorGroups) {
      if (group.errors.length < 3) continue; // Skip infrequent errors
      
      const test = await this.generateErrorRegressionTest(group, options);
      if (test) tests.push(test);
    }

    return tests;
  }

  private buildNaturalLanguagePrompt(
    description: string,
    options: AITestGenerationRequest['options']
  ): string {
    const frameworkInstructions = {
      playwright: 'Use Playwright with page object model. Include proper waits and error handling.',
      cypress: 'Use Cypress commands with proper assertions and best practices.',
      selenium: 'Use Selenium WebDriver with explicit waits and page object pattern.'
    };

    return `
Generate a ${options.framework} test in ${options.language} for the following requirement:

"${description}"

Requirements:
- Use ${frameworkInstructions[options.framework]}
- ${options.includeAssertions ? 'Include comprehensive assertions' : 'Include basic assertions'}
- ${options.includeDataSetup ? 'Include test data setup and cleanup' : 'Use minimal test data'}
- Follow best practices for maintainable test code
- Include comments explaining the test logic
- Handle common edge cases and error scenarios

Generate only the test code without additional explanation.
`;
  }

  private analyzeUserJourneys(sessions: UserSession[]): UserJourney[] {
    const journeyMap = new Map<string, UserJourney>();

    sessions.forEach(session => {
      const journeyKey = this.createJourneyKey(session.actions);
      
      if (!journeyMap.has(journeyKey)) {
        journeyMap.set(journeyKey, {
          name: this.generateJourneyName(session.actions),
          frequency: 0,
          steps: this.convertActionsToSteps(session.actions),
          conversionRate: 0,
          averageDuration: 0
        });
      }

      const journey = journeyMap.get(journeyKey)!;
      journey.frequency++;
      journey.averageDuration = (journey.averageDuration + session.duration) / 2;
      
      if (session.outcome === 'success') {
        journey.conversionRate = (journey.conversionRate + 1) / journey.frequency;
      }
    });

    return Array.from(journeyMap.values())
      .sort((a, b) => b.frequency - a.frequency);
  }

  private async generateFromUserJourney(
    journey: UserJourney,
    options: AITestGenerationRequest['options']
  ): Promise<GeneratedTest | null> {
    const prompt = `
Generate a ${options.framework} test that validates this user journey:

Journey: ${journey.name}
Frequency: ${journey.frequency} users
Conversion Rate: ${(journey.conversionRate * 100).toFixed(1)}%

Steps:
${journey.steps.map((step, index) => 
  `${index + 1}. ${step.action} on ${step.page} - Expected: ${step.expectedOutcome}`
).join('\n')}

Generate a comprehensive test that validates each step and the overall user flow.
Include assertions for successful completion and handle potential failure points.
`;

    try {
      const code = await this.aiProvider.generateCode(prompt, options.language);
      
      return {
        id: this.generateTestId(),
        name: `Test ${journey.name}`,
        description: `Validates user journey: ${journey.name}`,
        code: this.cleanGeneratedCode(code),
        framework: options.framework,
        language: options.language,
        assertions: this.extractAssertions(code),
        testData: { journey },
        metadata: {
          generatedFrom: 'user_behavior',
          confidence: Math.min(journey.conversionRate + 0.3, 1),
          estimatedExecutionTime: journey.averageDuration / 1000,
          complexity: journey.steps.length > 5 ? 'complex' : 'medium'
        }
      };
    } catch (error) {
      console.error('User journey test generation failed:', error);
      return null;
    }
  }

  private async generateFromSingleSession(
    session: UserSession,
    options: AITestGenerationRequest['options']
  ): Promise<GeneratedTest | null> {
    const prompt = `
Generate a ${options.framework} test that replicates this user session:

Duration: ${session.duration}ms
Outcome: ${session.outcome}
Browser: ${session.metadata.userAgent}
Viewport: ${session.metadata.viewport.width}x${session.metadata.viewport.height}

Actions:
${session.actions.map((action, index) => 
  `${index + 1}. ${action.type} ${action.target?.selector || action.target?.text || action.target?.url || ''} ${action.value || ''}`
).join('\n')}

Generate a test that replicates these exact user interactions.
`;

    try {
      const code = await this.aiProvider.generateCode(prompt, options.language);
      
      return {
        id: this.generateTestId(),
        name: `Session Replay Test ${session.id.substring(0, 8)}`,
        description: `Replicates user session ${session.id}`,
        code: this.cleanGeneratedCode(code),
        framework: options.framework,
        language: options.language,
        assertions: this.extractAssertions(code),
        testData: { sessionId: session.id },
        metadata: {
          generatedFrom: 'session_replay',
          confidence: session.outcome === 'success' ? 0.8 : 0.6,
          estimatedExecutionTime: session.duration / 1000,
          complexity: session.actions.length > 10 ? 'complex' : 'medium'
        }
      };
    } catch (error) {
      console.error('Session replay test generation failed:', error);
      return null;
    }
  }

  private groupErrorsByPattern(errorLogs: ErrorLog[]): Array<{
    pattern: string;
    errors: ErrorLog[];
    frequency: number;
  }> {
    const groups = new Map<string, ErrorLog[]>();

    errorLogs.forEach(error => {
      // Create a pattern key based on error message and URL
      const pattern = this.createErrorPattern(error);
      
      if (!groups.has(pattern)) {
        groups.set(pattern, []);
      }
      groups.get(pattern)!.push(error);
    });

    return Array.from(groups.entries())
      .map(([pattern, errors]) => ({
        pattern,
        errors,
        frequency: errors.length
      }))
      .sort((a, b) => b.frequency - a.frequency);
  }

  private async generateErrorRegressionTest(
    errorGroup: { pattern: string; errors: ErrorLog[]; frequency: number },
    options: AITestGenerationRequest['options']
  ): Promise<GeneratedTest | null> {
    const sampleError = errorGroup.errors[0];
    
    const prompt = `
Generate a ${options.framework} regression test for this error pattern:

Error: ${sampleError.message}
URL: ${sampleError.url}
Frequency: ${errorGroup.frequency} occurrences
Stack: ${sampleError.stack?.split('\n').slice(0, 3).join('\n') || 'N/A'}

Generate a test that:
1. Reproduces the conditions that cause this error
2. Verifies the error is handled gracefully
3. Ensures the error doesn't break the user experience
4. Includes proper error assertions

Focus on preventing regression of this error pattern.
`;

    try {
      const code = await this.aiProvider.generateCode(prompt, options.language);
      
      return {
        id: this.generateTestId(),
        name: `Error Regression Test: ${this.extractErrorType(sampleError.message)}`,
        description: `Prevents regression of error: ${sampleError.message.substring(0, 100)}`,
        code: this.cleanGeneratedCode(code),
        framework: options.framework,
        language: options.language,
        assertions: this.extractAssertions(code),
        testData: { errorPattern: errorGroup.pattern },
        metadata: {
          generatedFrom: 'error_based',
          confidence: Math.min(errorGroup.frequency / 100, 0.9),
          estimatedExecutionTime: 30,
          complexity: 'medium'
        }
      };
    } catch (error) {
      console.error('Error regression test generation failed:', error);
      return null;
    }
  }

  // Utility methods
  private generateTestId(): string {
    return `test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private extractTestName(description: string): string {
    // Extract a concise test name from description
    const words = description.split(' ').slice(0, 6);
    return words.join(' ').replace(/[^a-zA-Z0-9\s]/g, '');
  }

  private cleanGeneratedCode(code: string): string {
    // Remove markdown code blocks and clean up formatting
    return code
      .replace(/```[\w]*\n?/g, '')
      .replace(/```/g, '')
      .trim();
  }

  private extractAssertions(code: string): string[] {
    const assertions: string[] = [];
    const assertionPatterns = [
      /expect\([^)]+\)\.[^;]+/g,
      /assert\.[^;]+/g,
      /cy\.[^;]*should\([^)]+\)/g,
      /\.should\([^)]+\)/g
    ];

    assertionPatterns.forEach(pattern => {
      const matches = code.match(pattern);
      if (matches) {
        assertions.push(...matches);
      }
    });

    return [...new Set(assertions)]; // Remove duplicates
  }

  private extractTestData(code: string): any {
    // Try to extract test data objects from the code
    const dataMatches = code.match(/const\s+\w*[Dd]ata\s*=\s*{[^}]+}/g);
    if (dataMatches) {
      try {
        // This is a simplified extraction - in practice, you'd use AST parsing
        return { extractedData: dataMatches };
      } catch (error) {
        return {};
      }
    }
    return {};
  }

  private calculateConfidence(code: string, description: string): number {
    let confidence = 0.5; // Base confidence

    // Check for proper test structure
    if (code.includes('test(') || code.includes('it(')) confidence += 0.2;
    
    // Check for assertions
    const assertions = this.extractAssertions(code);
    if (assertions.length > 0) confidence += 0.2;
    
    // Check for proper waits/selectors
    if (code.includes('waitFor') || code.includes('wait')) confidence += 0.1;
    
    // Check if code length is reasonable
    if (code.length > 200 && code.length < 2000) confidence += 0.1;

    return Math.min(confidence, 1);
  }

  private estimateExecutionTime(code: string): number {
    // Rough estimation based on code complexity
    let time = 5; // Base time in seconds

    // Count interactions
    const interactions = (code.match(/click|type|select|navigate/g) || []).length;
    time += interactions * 2;

    // Count waits
    const waits = (code.match(/wait|sleep|delay/g) || []).length;
    time += waits * 3;

    // Count assertions
    const assertions = this.extractAssertions(code);
    time += assertions.length * 0.5;

    return Math.min(time, 300); // Cap at 5 minutes
  }

  private assessComplexity(code: string): 'simple' | 'medium' | 'complex' {
    const lines = code.split('\n').length;
    const interactions = (code.match(/click|type|select|navigate/g) || []).length;
    const assertions = this.extractAssertions(code).length;

    const complexityScore = lines * 0.1 + interactions * 2 + assertions * 1;

    if (complexityScore < 10) return 'simple';
    if (complexityScore < 25) return 'medium';
    return 'complex';
  }

  private createJourneyKey(actions: UserAction[]): string {
    // Create a unique key for similar user journeys
    return actions
      .map(action => `${action.type}:${action.target?.selector || action.target?.text || ''}`)
      .join('->');
  }

  private generateJourneyName(actions: UserAction[]): string {
    const firstAction = actions[0];
    const lastAction = actions[actions.length - 1];
    
    if (firstAction && lastAction) {
      return `${firstAction.type} to ${lastAction.type} journey`;
    }
    
    return `User journey with ${actions.length} steps`;
  }

  private convertActionsToSteps(actions: UserAction[]): any[] {
    return actions.map(action => ({
      action: action.type,
      page: action.target?.url || 'current page',
      selector: action.target?.selector,
      expectedOutcome: `${action.type} should succeed`,
      failureRate: 0.05 // Default low failure rate
    }));
  }

  private createErrorPattern(error: ErrorLog): string {
    // Create a pattern key for similar errors
    const messagePattern = error.message.replace(/\d+/g, 'N').replace(/['"]/g, '');
    const urlPattern = error.url.replace(/\d+/g, 'N');
    return `${messagePattern}@${urlPattern}`;
  }

  private extractErrorType(message: string): string {
    // Extract error type from message
    const match = message.match(/^(\w+Error|\w+Exception)/);
    return match ? match[1] : 'Unknown Error';
  }

  private generateSummary(tests: GeneratedTest[]): TestGenerationResult['summary'] {
    const totalGenerated = tests.length;
    const successRate = totalGenerated > 0 ? 1 : 0; // All generated tests are considered successful
    const averageConfidence = totalGenerated > 0 
      ? tests.reduce((sum, test) => sum + test.metadata.confidence, 0) / totalGenerated
      : 0;

    const recommendations: string[] = [];
    
    if (totalGenerated === 0) {
      recommendations.push('No tests were generated. Check input data quality and try again.');
    } else {
      if (averageConfidence < 0.7) {
        recommendations.push('Generated tests have low confidence. Review and refine manually.');
      }
      
      const complexTests = tests.filter(t => t.metadata.complexity === 'complex').length;
      if (complexTests > totalGenerated * 0.5) {
        recommendations.push('Many complex tests generated. Consider breaking them into smaller tests.');
      }
      
      const longTests = tests.filter(t => t.metadata.estimatedExecutionTime > 60).length;
      if (longTests > 0) {
        recommendations.push(`${longTests} tests may take over 1 minute to execute. Consider optimization.`);
      }
    }

    return {
      totalGenerated,
      successRate,
      averageConfidence,
      recommendations
    };
  }

  // Batch generation methods
  async generateTestSuite(
    requests: AITestGenerationRequest[]
  ): Promise<{ [key: string]: TestGenerationResult }> {
    const results: { [key: string]: TestGenerationResult } = {};
    
    for (let i = 0; i < requests.length; i++) {
      const request = requests[i];
      const key = `suite_${i}_${request.type}`;
      results[key] = await this.generateTests(request);
    }
    
    return results;
  }

  async generateFromTemplate(
    template: string,
    variables: { [key: string]: any },
    options: AITestGenerationRequest['options']
  ): Promise<GeneratedTest | null> {
    // Replace template variables
    let processedTemplate = template;
    Object.entries(variables).forEach(([key, value]) => {
      processedTemplate = processedTemplate.replace(
        new RegExp(`{{${key}}}`, 'g'),
        String(value)
      );
    });

    return this.generateFromNaturalLanguage(processedTemplate, options);
  }
}