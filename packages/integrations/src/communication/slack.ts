import axios from 'axios';
import { IntegrationConfig, NotificationPayload } from '../types';

export class SlackIntegration {
  private config: IntegrationConfig;

  constructor(config: IntegrationConfig) {
    this.config = config;
  }

  async sendNotification(payload: NotificationPayload): Promise<void> {
    if (!this.config.enabled || !this.config.webhookUrl) {
      throw new Error('Slack integration is not configured');
    }

    const message = this.formatMessage(payload);

    await axios.post(this.config.webhookUrl, message, {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  async sendRichNotification(payload: NotificationPayload, mentions: string[] = []): Promise<void> {
    if (!this.config.enabled || !this.config.webhookUrl) {
      throw new Error('Slack integration is not configured');
    }

    const blocks = this.buildRichBlocks(payload, mentions);

    await axios.post(
      this.config.webhookUrl,
      { blocks },
      {
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  private formatMessage(payload: NotificationPayload): any {
    const { testResult, projectName, environment } = payload;
    const icon = testResult.status === 'passed' ? '✅' : testResult.status === 'failed' ? '❌' : '⏭️';

    return {
      text: `${icon} Test ${testResult.status}: ${testResult.name}`,
      attachments: [
        {
          color: this.getColor(testResult.status),
          fields: [
            { title: 'Project', value: projectName, short: true },
            { title: 'Environment', value: environment, short: true },
            { title: 'Duration', value: `${testResult.duration}ms`, short: true },
            { title: 'Status', value: testResult.status, short: true },
            ...(testResult.error ? [{ title: 'Error', value: testResult.error, short: false }] : []),
          ],
          footer: 'AutoQA',
          ts: Math.floor(payload.timestamp.getTime() / 1000),
        },
      ],
    };
  }

  private buildRichBlocks(payload: NotificationPayload, mentions: string[]): any[] {
    const { testResult, projectName, environment } = payload;
    const icon = testResult.status === 'passed' ? '✅' : testResult.status === 'failed' ? '❌' : '⏭️';

    const blocks: any[] = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `${icon} Test ${testResult.status}`,
        },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Test:*\n${testResult.name}` },
          { type: 'mrkdwn', text: `*Project:*\n${projectName}` },
          { type: 'mrkdwn', text: `*Environment:*\n${environment}` },
          { type: 'mrkdwn', text: `*Duration:*\n${testResult.duration}ms` },
        ],
      },
    ];

    if (testResult.error) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Error:*\n\`\`\`${testResult.error}\`\`\``,
        },
      });
    }

    if (testResult.screenshot) {
      blocks.push({
        type: 'image',
        image_url: testResult.screenshot,
        alt_text: 'Test screenshot',
      });
    }

    if (mentions.length > 0) {
      blocks.push({
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `cc: ${mentions.map(m => `<@${m}>`).join(' ')}`,
          },
        ],
      });
    }

    return blocks;
  }

  private getColor(status: string): string {
    const colors: Record<string, string> = {
      passed: '#36a64f',
      failed: '#ff0000',
      skipped: '#ffcc00',
    };
    return colors[status] || '#808080';
  }
}
