# @autoqa/integrations

Comprehensive integration ecosystem for AutoQA. Connect with project management tools, communication platforms, deployment services, and monitoring systems.

## Features

- 📋 **Project Management**: Jira, Linear, Asana, GitHub Projects
- 💬 **Communication**: Slack, Discord, Microsoft Teams, PagerDuty
- 🚀 **Deployment**: Vercel, Netlify, Railway, Fly.io
- 📊 **Monitoring**: Datadog, Grafana, New Relic, Sentry
- 🔌 **Public API**: REST & GraphQL APIs, Zapier integration
- 🔄 **Bidirectional Sync**: Keep test status in sync with issues

## Installation

```bash
npm install @autoqa/integrations
```

## Quick Start

### Slack Notifications

```typescript
import { SlackIntegration } from '@autoqa/integrations';

const slack = new SlackIntegration({
  enabled: true,
  webhookUrl: 'https://hooks.slack.com/services/YOUR/WEBHOOK/URL',
});

await slack.sendNotification({
  testResult: {
    id: 'test-123',
    name: 'Login flow test',
    status: 'failed',
    duration: 2500,
    error: 'Element not found: #login-button',
    screenshot: 'https://example.com/screenshot.png',
  },
  projectName: 'My App',
  environment: 'production',
  timestamp: new Date(),
});
```

### Jira Integration

```typescript
import { JiraIntegration } from '@autoqa/integrations';

const jira = new JiraIntegration(
  {
    enabled: true,
    apiKey: 'your-jira-api-key',
    customFields: { projectKey: 'AUTOQA' },
  },
  'https://your-domain.atlassian.net'
);

const issueKey = await jira.createIssue({
  title: 'Test failure: Login flow',
  description: 'Login test failed in production',
  priority: 'high',
  labels: ['automated-test', 'production'],
  testResult: {
    id: 'test-123',
    name: 'Login flow test',
    status: 'failed',
    duration: 2500,
    error: 'Element not found',
  },
});

console.log(`Created issue: ${issueKey}`);
```

### Vercel Deployment Testing

```typescript
import { VercelIntegration } from '@autoqa/integrations';

const vercel = new VercelIntegration({
  enabled: true,
  apiKey: 'your-vercel-token',
});

// Run tests on preview deployment
const results = await vercel.runTestsOnPreview('deployment-id');

// Update deployment status
await vercel.updateDeploymentStatus({
  deploymentId: 'deployment-id',
  url: 'https://preview.vercel.app',
  status: 'success',
  environment: 'preview',
});

// Create status badge
const badge = await vercel.createStatusBadge('project-id', 'passed');
```

### Datadog Metrics

```typescript
import { DatadogIntegration } from '@autoqa/integrations';

const datadog = new DatadogIntegration({
  enabled: true,
  apiKey: 'your-datadog-api-key',
});

// Send test metrics
await datadog.sendTestMetrics({
  id: 'test-123',
  name: 'Login flow',
  status: 'passed',
  duration: 1500,
});

// Send custom metric
await datadog.sendMetric({
  name: 'test.custom_metric',
  value: 42,
  tags: {
    environment: 'production',
    service: 'web',
  },
  timestamp: new Date(),
});
```

### Public API

```typescript
import { PublicAPI } from '@autoqa/integrations';

const api = new PublicAPI('your-api-key');

// Create test
const testId = await api.createTest({
  name: 'Login flow',
  code: 'await page.goto("/login")',
});

// Run test
const result = await api.runTest(testId);

// Get results
const results = await api.getTestResults(testId);
```

### Zapier Integration

```typescript
import { ZapierIntegration } from '@autoqa/integrations';

const zapier = new ZapierIntegration({
  enabled: true,
  webhookUrl: 'https://hooks.zapier.com/hooks/catch/YOUR/WEBHOOK',
});

await zapier.triggerZap({
  id: 'test-123',
  name: 'Login flow',
  status: 'failed',
  duration: 2500,
  error: 'Element not found',
});
```

## Available Integrations

### Project Management

- ✅ **Jira** - Create issues, update status, bidirectional sync
- ✅ **Linear** - Create issues, GraphQL API support
- 🚧 **Asana** - Task automation (coming soon)
- 🚧 **GitHub Projects** - Project board integration (coming soon)

### Communication

- ✅ **Slack** - Rich notifications with @mentions
- ✅ **Discord** - Embed notifications with images
- 🚧 **Microsoft Teams** - Adaptive cards (coming soon)
- 🚧 **PagerDuty** - Critical failure alerts (coming soon)

### Deployment

- ✅ **Vercel** - Preview deployment testing
- 🚧 **Netlify** - Deploy preview integration (coming soon)
- 🚧 **Railway** - Deployment testing (coming soon)
- 🚧 **Fly.io** - Multi-region testing (coming soon)

### Monitoring

- ✅ **Datadog** - Metrics and dashboards
- 🚧 **Grafana** - Custom dashboards (coming soon)
- 🚧 **New Relic** - APM integration (coming soon)
- 🚧 **Sentry** - Error tracking correlation (coming soon)

### API & Automation

- ✅ **Public REST API** - Full CRUD operations
- ✅ **Zapier** - No-code automation
- 🚧 **GraphQL API** - Flexible queries (coming soon)
- 🚧 **Webhooks** - Event-driven automation (coming soon)

## Configuration

All integrations follow a consistent configuration pattern:

```typescript
interface IntegrationConfig {
  enabled: boolean;
  apiKey?: string;
  webhookUrl?: string;
  customFields?: Record<string, any>;
}
```

## Error Handling

All integrations throw descriptive errors:

```typescript
try {
  await slack.sendNotification(payload);
} catch (error) {
  if (error.message.includes('not configured')) {
    console.error('Slack integration is not configured');
  }
}
```

## Rate Limiting

Integrations respect platform rate limits:

- **Slack**: 1 message per second
- **Jira**: 10 requests per second
- **Datadog**: 500 metrics per second

## Testing

```bash
npm test
```

Property-based tests ensure:

- ✅ No data loss across integrations
- ✅ Rate limiting prevents spam
- ✅ API versioning maintains compatibility
- ✅ Metrics are always accurate
- ✅ Webhook delivery with retries

## Examples

See [examples](./examples) directory for more:

- [Slack rich notifications](./examples/slack-rich.ts)
- [Jira bidirectional sync](./examples/jira-sync.ts)
- [Vercel preview testing](./examples/vercel-preview.ts)
- [Datadog dashboards](./examples/datadog-dashboard.ts)

## Contributing

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for guidelines.

## License

MIT License - see [LICENSE](../../LICENSE) for details.
