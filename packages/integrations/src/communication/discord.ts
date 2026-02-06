import axios from 'axios';
import { IntegrationConfig, NotificationPayload } from '../types';

export class DiscordIntegration {
  private config: IntegrationConfig;

  constructor(config: IntegrationConfig) {
    this.config = config;
  }

  async sendNotification(payload: NotificationPayload): Promise<void> {
    if (!this.config.enabled || !this.config.webhookUrl) {
      throw new Error('Discord integration is not configured');
    }

    const embed = this.buildEmbed(payload);

    await axios.post(
      this.config.webhookUrl,
      { embeds: [embed] },
      {
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  private buildEmbed(payload: NotificationPayload): any {
    const { testResult, projectName, environment } = payload;

    return {
      title: `Test ${testResult.status}: ${testResult.name}`,
      color: this.getColor(testResult.status),
      fields: [
        { name: 'Project', value: projectName, inline: true },
        { name: 'Environment', value: environment, inline: true },
        { name: 'Duration', value: `${testResult.duration}ms`, inline: true },
        { name: 'Status', value: testResult.status, inline: true },
        ...(testResult.error ? [{ name: 'Error', value: `\`\`\`${testResult.error}\`\`\``, inline: false }] : []),
      ],
      ...(testResult.screenshot && { image: { url: testResult.screenshot } }),
      footer: { text: 'AutoQA' },
      timestamp: payload.timestamp.toISOString(),
    };
  }

  private getColor(status: string): number {
    const colors: Record<string, number> = {
      passed: 0x36a64f,
      failed: 0xff0000,
      skipped: 0xffcc00,
    };
    return colors[status] || 0x808080;
  }
}
