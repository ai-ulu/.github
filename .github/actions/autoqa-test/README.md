# AutoQA Pilot GitHub Action

This GitHub Action integrates AutoQA Pilot automated testing into your CI/CD pipeline.

## Features

- 🚀 Trigger test executions via webhook API
- 📊 Real-time status updates and progress tracking
- 🔍 Detailed test results and artifact collection
- ✅ GitHub Checks integration with pass/fail status
- 📝 Automatic PR comments with test results
- ⏱️ Configurable timeouts and failure handling

## Usage

### Basic Usage

```yaml
- name: Run AutoQA Tests
  uses: ./.github/actions/autoqa-test
  with:
    api-url: 'https://api.autoqa-pilot.com'
    api-key: ${{ secrets.AUTOQA_API_KEY }}
    project-id: ${{ vars.AUTOQA_PROJECT_ID }}
```

### Advanced Usage

```yaml
- name: Run AutoQA Tests
  id: autoqa
  uses: ./.github/actions/autoqa-test
  with:
    api-url: ${{ vars.AUTOQA_API_URL }}
    api-key: ${{ secrets.AUTOQA_API_KEY }}
    project-id: ${{ vars.AUTOQA_PROJECT_ID }}
    test-suite-id: ${{ vars.AUTOQA_TEST_SUITE_ID }}
    environment: 'production'
    wait-for-completion: 'true'
    timeout: '45'
    fail-on-test-failure: 'true'
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

- name: Use Test Results
  run: |
    echo "Execution ID: ${{ steps.autoqa.outputs.execution-id }}"
    echo "Status: ${{ steps.autoqa.outputs.status }}"
    echo "Total Tests: ${{ steps.autoqa.outputs.total-tests }}"
    echo "Passed: ${{ steps.autoqa.outputs.passed-tests }}"
    echo "Failed: ${{ steps.autoqa.outputs.failed-tests }}"
```

## Inputs

| Input                  | Description                         | Required | Default                        |
| ---------------------- | ----------------------------------- | -------- | ------------------------------ |
| `api-url`              | AutoQA Pilot API URL                | Yes      | `https://api.autoqa-pilot.com` |
| `api-key`              | AutoQA Pilot API key                | Yes      | -                              |
| `project-id`           | Project ID to run tests for         | Yes      | -                              |
| `test-suite-id`        | Specific test suite ID (optional)   | No       | -                              |
| `environment`          | Target environment                  | No       | `staging`                      |
| `wait-for-completion`  | Wait for test execution to complete | No       | `true`                         |
| `timeout`              | Maximum wait time in minutes        | No       | `30`                           |
| `fail-on-test-failure` | Fail action if tests fail           | No       | `true`                         |

## Outputs

| Output         | Description                          |
| -------------- | ------------------------------------ |
| `execution-id` | Unique execution ID for the test run |
| `status`       | Final execution status               |
| `results-url`  | URL to view detailed test results    |
| `total-tests`  | Total number of tests executed       |
| `passed-tests` | Number of tests that passed          |
| `failed-tests` | Number of tests that failed          |
| `duration`     | Total execution duration in seconds  |

## Environment Variables

- `GITHUB_TOKEN` - Required for GitHub Checks integration and PR comments

## Secrets and Variables

### Required Secrets

- `AUTOQA_API_KEY` - Your AutoQA Pilot API key

### Recommended Variables

- `AUTOQA_API_URL` - AutoQA Pilot API URL (if using custom instance)
- `AUTOQA_PROJECT_ID` - Default project ID
- `AUTOQA_TEST_SUITE_ID` - Default test suite ID

## Examples

### On Push to Main

```yaml
name: AutoQA Tests
on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: ./.github/actions/autoqa-test
        with:
          api-key: ${{ secrets.AUTOQA_API_KEY }}
          project-id: ${{ vars.AUTOQA_PROJECT_ID }}
```

### On Pull Request with Comments

```yaml
name: PR Tests
on:
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Run Tests
        id: autoqa
        uses: ./.github/actions/autoqa-test
        with:
          api-key: ${{ secrets.AUTOQA_API_KEY }}
          project-id: ${{ vars.AUTOQA_PROJECT_ID }}
          environment: 'staging'
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - name: Comment PR
        if: github.event_name == 'pull_request'
        uses: actions/github-script@v7
        with:
          script: |
            const comment = \`## AutoQA Test Results

            **Status:** ${{ steps.autoqa.outputs.status }}
            **Tests:** ${{ steps.autoqa.outputs.passed-tests }}/${{ steps.autoqa.outputs.total-tests }} passed
            **Duration:** ${{ steps.autoqa.outputs.duration }}s

            [View Details](${{ steps.autoqa.outputs.results-url }})
            \`;

            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: comment
            });
```

### Manual Trigger with Inputs

```yaml
name: Manual AutoQA Tests
on:
  workflow_dispatch:
    inputs:
      environment:
        description: 'Environment to test'
        required: true
        default: 'staging'
        type: choice
        options:
          - staging
          - production
      project_id:
        description: 'Project ID'
        required: true
        type: string

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: ./.github/actions/autoqa-test
        with:
          api-key: ${{ secrets.AUTOQA_API_KEY }}
          project-id: ${{ inputs.project_id }}
          environment: ${{ inputs.environment }}
          timeout: '60'
```

## Error Handling

The action handles various error scenarios gracefully:

- **API Authentication Errors**: Clear error messages for invalid API keys
- **Network Issues**: Automatic retries with exponential backoff
- **Timeout Handling**: Configurable timeouts with proper cleanup
- **GitHub API Failures**: Continues execution even if GitHub integration fails

## Security

- API keys are handled securely through GitHub Secrets
- Webhook signatures are validated when configured
- No sensitive data is logged or exposed in outputs
- Network requests use secure HTTPS connections

## Troubleshooting

### Common Issues

1. **Invalid API Key**

   ```
   Error: Invalid API key. Please check your AutoQA Pilot API key.
   ```

   Solution: Verify your `AUTOQA_API_KEY` secret is set correctly.

2. **Project Not Found**

   ```
   Error: Invalid request: Project not found
   ```

   Solution: Check that the `project-id` exists in your AutoQA Pilot account.

3. **Timeout**
   ```
   Error: Test execution timed out after 30 minutes
   ```
   Solution: Increase the `timeout` input or optimize your tests.

### Debug Mode

Enable debug logging by setting the `ACTIONS_STEP_DEBUG` secret to `true` in your repository.

## Support

For issues and questions:

- Check the [AutoQA Pilot Documentation](https://docs.autoqa-pilot.com)
- Open an issue in this repository
- Contact support at support@autoqa-pilot.com
