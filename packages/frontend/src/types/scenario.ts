export interface TestScenario {
  id: string;
  name: string;
  description: string;
  steps: TestStep[];
  assertions: TestAssertion[];
  tags?: string[];
  createdAt?: string;
  updatedAt?: string;
  author?: string;
}

export interface TestStep {
  id: string;
  type: 'navigate' | 'click' | 'type' | 'wait' | 'screenshot' | 'custom';
  selector?: string;
  value?: string;
  description: string;
  timeout?: number;
  options?: StepOptions;
}

export interface StepOptions {
  clickType?: 'left' | 'right' | 'double';
  waitType?: 'networkidle' | 'domcontentloaded' | 'selector';
  screenshotType?: 'fullPage' | 'element';
  customCode?: string;
}

export interface TestAssertion {
  id: string;
  type: 'visible' | 'text' | 'attribute' | 'count' | 'url' | 'custom';
  selector?: string;
  expected: string;
  description: string;
  matchType?: 'exact' | 'contains' | 'regex';
  attributeName?: string;
  operator?: 'equals' | 'greater' | 'less' | 'between';
  customCode?: string;
}

export interface ScenarioTemplate {
  id: string;
  name: string;
  description: string;
  category: 'authentication' | 'forms' | 'navigation' | 'ecommerce' | 'general';
  scenario: Omit<TestScenario, 'id' | 'createdAt' | 'updatedAt'>;
}

export interface CodeGenerationOptions {
  framework: 'playwright' | 'cypress' | 'selenium';
  language: 'typescript' | 'javascript' | 'python';
  includeComments: boolean;
  includeSetup: boolean;
  includeTeardown: boolean;
}

export interface GeneratedCode {
  code: string;
  framework: string;
  language: string;
  confidence: number;
  suggestions: string[];
  warnings: string[];
}

export interface ScenarioValidation {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  type: 'missing_selector' | 'invalid_url' | 'empty_step' | 'invalid_assertion';
  message: string;
  stepId?: string;
  assertionId?: string;
}

export interface ValidationWarning {
  type: 'weak_selector' | 'missing_description' | 'long_timeout' | 'duplicate_step';
  message: string;
  stepId?: string;
  assertionId?: string;
  suggestion?: string;
}

export interface ScenarioExecution {
  id: string;
  scenarioId: string;
  status: 'pending' | 'running' | 'passed' | 'failed' | 'cancelled';
  startTime: string;
  endTime?: string;
  results: ExecutionResult[];
  screenshots: Screenshot[];
  logs: ExecutionLog[];
  error?: string;
}

export interface ExecutionResult {
  stepId: string;
  status: 'passed' | 'failed' | 'skipped';
  duration: number;
  error?: string;
  screenshot?: string;
}

export interface Screenshot {
  id: string;
  stepId: string;
  url: string;
  timestamp: string;
  type: 'step' | 'error' | 'assertion';
}

export interface ExecutionLog {
  id: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  timestamp: string;
  stepId?: string;
  data?: any;
}