import axios from 'axios';
import { IntegrationConfig, IssuePayload, TestResult } from '../types';

export class JiraIntegration {
  private config: IntegrationConfig;
  private baseUrl: string;

  constructor(config: IntegrationConfig, baseUrl: string) {
    this.config = config;
    this.baseUrl = baseUrl;
  }

  async createIssue(payload: IssuePayload): Promise<string> {
    if (!this.config.enabled) {
      throw new Error('Jira integration is not enabled');
    }

    const issue = {
      fields: {
        project: { key: this.config.customFields?.projectKey || 'AUTOQA' },
        summary: payload.title,
        description: this.formatDescription(payload),
        issuetype: { name: 'Bug' },
        priority: { name: this.mapPriority(payload.priority) },
        labels: payload.labels,
        ...(payload.assignee && { assignee: { name: payload.assignee } }),
      },
    };

    const response = await axios.post(
      `${this.baseUrl}/rest/api/3/issue`,
      issue,
      {
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    return response.data.key;
  }

  async updateIssue(issueKey: string, testResult: TestResult): Promise<void> {
    const comment = this.formatTestResultComment(testResult);

    await axios.post(
      `${this.baseUrl}/rest/api/3/issue/${issueKey}/comment`,
      { body: comment },
      {
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
      }
    );
  }

  async syncTestStatus(issueKey: string, status: string): Promise<void> {
    const transition = this.mapStatusToTransition(status);

    await axios.post(
      `${this.baseUrl}/rest/api/3/issue/${issueKey}/transitions`,
      { transition: { id: transition } },
      {
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
      }
    );
  }

  private formatDescription(payload: IssuePayload): string {
    return `
${payload.description}

*Test Details:*
- Test Name: ${payload.testResult.name}
- Status: ${payload.testResult.status}
- Duration: ${payload.testResult.duration}ms
${payload.testResult.error ? `- Error: ${payload.testResult.error}` : ''}
${payload.testResult.screenshot ? `- Screenshot: ${payload.testResult.screenshot}` : ''}
    `.trim();
  }

  private formatTestResultComment(testResult: TestResult): string {
    return `Test execution completed:
- Status: ${testResult.status}
- Duration: ${testResult.duration}ms
${testResult.error ? `- Error: ${testResult.error}` : ''}`;
  }

  private mapPriority(priority: string): string {
    const mapping: Record<string, string> = {
      low: 'Low',
      medium: 'Medium',
      high: 'High',
      critical: 'Highest',
    };
    return mapping[priority] || 'Medium';
  }

  private mapStatusToTransition(status: string): string {
    const mapping: Record<string, string> = {
      passed: '31', // Done
      failed: '21', // In Progress
      skipped: '11', // To Do
    };
    return mapping[status] || '11';
  }
}
