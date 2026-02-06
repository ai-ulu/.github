import axios from 'axios';
import { IntegrationConfig, IssuePayload, TestResult } from '../types';

export class LinearIntegration {
  private config: IntegrationConfig;
  private apiUrl = 'https://api.linear.app/graphql';

  constructor(config: IntegrationConfig) {
    this.config = config;
  }

  async createIssue(payload: IssuePayload): Promise<string> {
    if (!this.config.enabled) {
      throw new Error('Linear integration is not enabled');
    }

    const mutation = `
      mutation CreateIssue($input: IssueCreateInput!) {
        issueCreate(input: $input) {
          success
          issue {
            id
            identifier
          }
        }
      }
    `;

    const variables = {
      input: {
        teamId: this.config.customFields?.teamId,
        title: payload.title,
        description: this.formatDescription(payload),
        priority: this.mapPriority(payload.priority),
        labelIds: payload.labels,
        ...(payload.assignee && { assigneeId: payload.assignee }),
      },
    };

    const response = await axios.post(
      this.apiUrl,
      { query: mutation, variables },
      {
        headers: {
          Authorization: this.config.apiKey!,
          'Content-Type': 'application/json',
        },
      }
    );

    return response.data.data.issueCreate.issue.identifier;
  }

  async updateIssue(issueId: string, testResult: TestResult): Promise<void> {
    const mutation = `
      mutation UpdateIssue($id: String!, $input: IssueUpdateInput!) {
        issueUpdate(id: $id, input: $input) {
          success
        }
      }
    `;

    const variables = {
      id: issueId,
      input: {
        description: this.formatTestResultUpdate(testResult),
      },
    };

    await axios.post(
      this.apiUrl,
      { query: mutation, variables },
      {
        headers: {
          Authorization: this.config.apiKey!,
          'Content-Type': 'application/json',
        },
      }
    );
  }

  private formatDescription(payload: IssuePayload): string {
    return `${payload.description}\n\n**Test Details:**\n- Name: ${payload.testResult.name}\n- Status: ${payload.testResult.status}\n- Duration: ${payload.testResult.duration}ms`;
  }

  private formatTestResultUpdate(testResult: TestResult): string {
    return `Test updated: ${testResult.status} (${testResult.duration}ms)`;
  }

  private mapPriority(priority: string): number {
    const mapping: Record<string, number> = {
      low: 1,
      medium: 2,
      high: 3,
      critical: 4,
    };
    return mapping[priority] || 2;
  }
}
