import { IntegrationConfig, TestResult } from '../types';

export class ZapierIntegration {
  private config: IntegrationConfig;

  constructor(config: IntegrationConfig) {
    this.config = config;
  }

  async triggerZap(testResult: TestResult): Promise<void> {
    if (!this.config.enabled || !this.config.webhookUrl) {
      throw new Error('Zapier integration is not configured');
    }

    const payload = {
      test_id: testResult.id,
      test_name: testResult.name,
      status: testResult.status,
      duration: testResult.duration,
      error: testResult.error,
      screenshot: testResult.screenshot,
      video: testResult.video,
      timestamp: new Date().toISOString(),
    };

    const response = await fetch(this.config.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Zapier webhook failed: ${response.statusText}`);
    }
  }
}
