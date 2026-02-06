import axios from 'axios';
import { IntegrationConfig, MetricPayload } from '../types';

export class DatadogIntegration {
  private config: IntegrationConfig;
  private apiUrl = 'https://api.datadoghq.com/api/v1';

  constructor(config: IntegrationConfig) {
    this.config = config;
  }

  async sendMetric(payload: MetricPayload): Promise<void> {
    if (!this.config.enabled) {
      throw new Error('Datadog integration is not enabled');
    }

    const series = {
      series: [
        {
          metric: `autoqa.${payload.name}`,
          points: [[Math.floor(payload.timestamp.getTime() / 1000), payload.value]],
          type: 'gauge',
          tags: Object.entries(payload.tags).map(([k, v]) => `${k}:${v}`),
        },
      ],
    };

    await axios.post(`${this.apiUrl}/series`, series, {
      headers: {
        'DD-API-KEY': this.config.apiKey!,
        'Content-Type': 'application/json',
      },
    });
  }

  async sendTestMetrics(testResult: any): Promise<void> {
    const metrics = [
      {
        name: 'test.duration',
        value: testResult.duration,
        tags: {
          test_name: testResult.name,
          status: testResult.status,
        },
      },
      {
        name: 'test.count',
        value: 1,
        tags: {
          status: testResult.status,
        },
      },
    ];

    for (const metric of metrics) {
      await this.sendMetric({
        ...metric,
        timestamp: new Date(),
      });
    }
  }
}
