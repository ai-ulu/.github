export interface TestFailure {
  id: string;
  testName: string;
  testFile: string;
  timestamp: number;
  error: {
    message: string;
    stack?: string;
    type: 'timeout' | 'assertion' | 'network' | 'element_not_found' | 'unknown';
  };
  screenshots: {
    before?: string;
    after?: string;
    diff?: string;
  };
  domSnapshot?: string;
  networkLogs?: NetworkLog[];
  executionContext: {
    browser: string;
    viewport: { width: number; height: number };
    userAgent: string;
    url: string;
  };
  previousRuns?: TestRun[];
}

export interface NetworkLog {
  url: string;
  method: string;
  status: number;
  responseTime: number;
  timestamp: number;
  headers: Record<string, string>;
  body?: string;
}

export interface TestRun {
  id: string;
  timestamp: number;
  status: 'passed' | 'failed' | 'skipped';
  duration: number;
  error?: string;
}

export interface RootCauseAnalysis {
  failureId: string;
  category: FailureCategory;
  confidence: number; // 0-1
  explanation: string;
  suggestedFix: {
    description: string;
    codeSnippet?: string;
    priority: 'low' | 'medium' | 'high' | 'critical';
  };
  relatedFailures: string[];
  environmentalFactors: EnvironmentalFactor[];
}

export type FailureCategory = 
  | 'dom_change'
  | 'network_issue'
  | 'timing_issue'
  | 'browser_compatibility'
  | 'test_data_issue'
  | 'infrastructure_issue'
  | 'flaky_test'
  | 'code_change_impact';

export interface EnvironmentalFactor {
  type: 'time_of_day' | 'load' | 'deployment' | 'external_service';
  value: string;
  impact: number; // 0-1
}

export interface FlakyTestAnalysis {
  testId: string;
  testName: string;
  flakiness: {
    score: number; // 0-1, higher = more flaky
    confidence: number; // 0-1
    trend: 'improving' | 'stable' | 'degrading';
  };
  patterns: {
    timeOfDay?: { hour: number; failureRate: number }[];
    dayOfWeek?: { day: string; failureRate: number }[];
    environment?: { env: string; failureRate: number }[];
    browser?: { browser: string; failureRate: number }[];
  };
  recommendations: {
    action: 'quarantine' | 'investigate' | 'fix' | 'monitor';
    reason: string;
    priority: 'low' | 'medium' | 'high' | 'critical';
  };
  historicalData: {
    totalRuns: number;
    failures: number;
    successRate: number;
    averageDuration: number;
    lastFailure?: number;
  };
}

export interface TestOptimization {
  testSuite: string;
  currentMetrics: {
    totalDuration: number;
    totalCost: number;
    parallelization: number;
    redundancy: number;
  };
  optimizations: OptimizationRecommendation[];
  projectedSavings: {
    timeSaved: number; // seconds
    costSaved: number; // dollars
    percentageImprovement: number;
  };
}

export interface OptimizationRecommendation {
  type: 'parallelize' | 'skip_redundant' | 'merge_tests' | 'split_test' | 'cache_data';
  description: string;
  impact: {
    timeSaved: number;
    costSaved: number;
    riskLevel: 'low' | 'medium' | 'high';
  };
  implementation: {
    difficulty: 'easy' | 'medium' | 'hard';
    estimatedHours: number;
    codeChanges?: string[];
  };
}

export interface AITestGenerationRequest {
  type: 'user_behavior' | 'natural_language' | 'session_replay' | 'error_based';
  input: {
    description?: string;
    sessionData?: UserSession[];
    errorLogs?: ErrorLog[];
    userJourneys?: UserJourney[];
  };
  options: {
    framework: 'playwright' | 'cypress' | 'selenium';
    language: 'typescript' | 'javascript' | 'python';
    includeAssertions: boolean;
    includeDataSetup: boolean;
  };
}

export interface UserSession {
  id: string;
  timestamp: number;
  duration: number;
  actions: UserAction[];
  outcome: 'success' | 'error' | 'abandoned';
  metadata: {
    userAgent: string;
    viewport: { width: number; height: number };
    referrer?: string;
  };
}

export interface UserAction {
  type: 'click' | 'input' | 'scroll' | 'navigate' | 'wait';
  timestamp: number;
  target: {
    selector?: string;
    text?: string;
    url?: string;
  };
  value?: string;
}

export interface UserJourney {
  name: string;
  frequency: number; // how often this journey occurs
  steps: JourneyStep[];
  conversionRate: number;
  averageDuration: number;
}

export interface JourneyStep {
  action: string;
  page: string;
  selector?: string;
  expectedOutcome: string;
  failureRate: number;
}

export interface ErrorLog {
  timestamp: number;
  message: string;
  stack?: string;
  url: string;
  userAgent: string;
  userId?: string;
  sessionId: string;
}

export interface VisualAnalysis {
  screenshotId: string;
  analysis: {
    elements: DetectedElement[];
    layout: LayoutAnalysis;
    accessibility: AccessibilityIssue[];
    visualChanges?: VisualChange[];
  };
  insights: {
    summary: string;
    issues: VisualIssue[];
    recommendations: string[];
  };
}

export interface DetectedElement {
  type: 'button' | 'input' | 'link' | 'image' | 'text' | 'container';
  bounds: { x: number; y: number; width: number; height: number };
  selector: string;
  text?: string;
  attributes: Record<string, string>;
  accessibility: {
    hasLabel: boolean;
    contrastRatio?: number;
    focusable: boolean;
  };
}

export interface LayoutAnalysis {
  responsive: boolean;
  overflowIssues: { element: string; type: 'horizontal' | 'vertical' }[];
  alignmentIssues: { elements: string[]; issue: string }[];
  spacingIssues: { elements: string[]; issue: string }[];
}

export interface AccessibilityIssue {
  type: 'contrast' | 'missing_label' | 'keyboard_trap' | 'focus_order' | 'semantic';
  severity: 'low' | 'medium' | 'high' | 'critical';
  element: string;
  description: string;
  wcagRule: string;
  suggestedFix: string;
}

export interface VisualChange {
  type: 'added' | 'removed' | 'moved' | 'resized' | 'color_changed' | 'text_changed';
  element: string;
  before?: any;
  after?: any;
  impact: 'minor' | 'moderate' | 'major' | 'breaking';
}

export interface VisualIssue {
  type: 'layout_shift' | 'missing_element' | 'broken_image' | 'text_overflow' | 'color_contrast';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  affectedUsers?: string; // percentage or user segment
}

export interface AIProvider {
  name: 'openai' | 'anthropic' | 'local';
  generateAnalysis(prompt: string, context?: any): Promise<string>;
  generateCode(prompt: string, language: string): Promise<string>;
  analyzeImage(imageBuffer: Buffer, prompt: string): Promise<string>;
}