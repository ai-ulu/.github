import axios from 'axios';
import { IntegrationConfig, DeploymentPayload, TestResult } from '../types';

export class VercelIntegration {
  private config: IntegrationConfig;
  private apiUrl = 'https://api.vercel.com';

  constructor(config: IntegrationConfig) {
    this.config = config;
  }

  async runTestsOnPreview(deploymentId: string): Promise<TestResult[]> {
    if (!this.config.enabled) {
      throw new Error('Vercel integration is not enabled');
    }

    // Get deployment details
    const deployment = await this.getDeployment(deploymentId);
    
    // Run tests on preview URL
    // This would integrate with the test runner
    return [];
  }

  async updateDeploymentStatus(payload: DeploymentPayload): Promise<void> {
    const status = payload.status === 'success' ? 'ready' : 'error';

    await axios.patch(
      `${this.apiUrl}/v13/deployments/${payload.deploymentId}`,
      { state: status },
      {
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
      }
    );
  }

  async createStatusBadge(projectId: string, status: string): Promise<string> {
    const color = status === 'passed' ? 'brightgreen' : 'red';
    return `https://img.shields.io/badge/tests-${status}-${color}`;
  }

  private async getDeployment(deploymentId: string): Promise<any> {
    const response = await axios.get(
      `${this.apiUrl}/v13/deployments/${deploymentId}`,
      {
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
        },
      }
    );

    return response.data;
  }
}
