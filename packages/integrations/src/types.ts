export interface IntegrationConfig {
  enabled: boolean;
  apiKey?: string;
  webhookUrl?: string;
  customFields?: Record<string, any>;
}

export interface TestResult {
  id: string;
  name: string;
  status: 'passed' | 'failed' | 'skipped';
  duration: number;
  error?: string;
  screenshot?: string;
  video?: string;
}

export interface NotificationPayload {
  testResult: TestResult;
  projectName: string;
  timestamp: Date;
  environment: string;
}

export interface IssuePayload {
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  labels: string[];
  assignee?: string;
  testResult: TestResult;
}

export interface DeploymentPayload {
  deploymentId: string;
  url: string;
  status: 'pending' | 'success' | 'failed';
  environment: string;
}

export interface MetricPayload {
  name: string;
  value: number;
  tags: Record<string, string>;
  timestamp: Date;
}
