# AutoQA VS Code Extension

AI-powered test generation and execution for Playwright tests directly in VS Code.

## Features

### 🤖 AI-Powered Test Generation

- Generate Playwright tests from comments
- Simply write `// Test: User can login with valid credentials` and generate complete test code
- Supports multiple test patterns: login, forms, navigation, API testing

### 🎯 Interactive Selector Generator

- Click elements in browser to generate optimal Playwright selectors
- Prioritizes reliable selectors: data-testid → id → class → text → xpath
- Real-time selector testing and validation

### 📝 Test Preview

- Live preview of test steps while writing code
- Visual representation of test flow
- Run and debug tests directly from preview

### 🧪 Test Runner Integration

- Run tests directly from VS Code
- Debug tests with headed browser
- Record new tests interactively

### 📚 Rich Code Snippets

- 15+ Playwright test templates
- Login, form, navigation, API test patterns
- Page Object Model templates

## Installation

1. Install from VS Code Marketplace (coming soon)
2. Or install from VSIX:
   ```bash
   code --install-extension autoqa-vscode-1.0.0.vsix
   ```

## Quick Start

1. Open a TypeScript/JavaScript file
2. Write a test comment:
   ```typescript
   // Test: User can login with valid credentials
   ```
3. Press `Ctrl+Shift+T` (or `Cmd+Shift+T` on Mac) to generate test
4. Use the Test Preview panel to visualize your tests

## Commands

| Command                      | Shortcut       | Description                           |
| ---------------------------- | -------------- | ------------------------------------- |
| Generate Test from Comment   | `Ctrl+Shift+T` | Generate Playwright test from comment |
| Generate Playwright Selector | `Ctrl+Shift+S` | Interactive selector generation       |
| Run Test                     | `Ctrl+Shift+R` | Run current test file                 |
| Debug Test                   | -              | Debug test with headed browser        |
| Record Test                  | -              | Record new test interactively         |
| Open Test Runner             | -              | Open localhost test runner            |

## Configuration

Configure the extension in VS Code settings:

```json
{
  "autoqa.aiProvider": "openai",
  "autoqa.openaiApiKey": "your-api-key",
  "autoqa.testRunner.port": 3333,
  "autoqa.testRunner.autoStart": true,
  "autoqa.preview.enabled": true
}
```

## AI Providers

- **OpenAI**: Requires API key for advanced test generation
- **Local**: Uses built-in templates (no API key required)

## Test Templates

The extension includes templates for common testing scenarios:

- **Login Tests**: Authentication flows
- **Form Tests**: Form submission and validation
- **Navigation Tests**: Page navigation and routing
- **API Tests**: API mocking and testing
- **Page Objects**: Page Object Model patterns

## Usage Examples

### Generate Login Test

```typescript
// Test: User can login with valid email and password
// ↓ Generates:
test('User can login with valid email and password', async ({ page }) => {
  await page.goto('https://example.com/login');
  await page.fill('[data-testid="email"]', 'user@example.com');
  await page.fill('[data-testid="password"]', 'password123');
  await page.click('[data-testid="login-button"]');
  await expect(page).toHaveURL(/.*dashboard/);
  await expect(page.locator('[data-testid="user-menu"]')).toBeVisible();
});
```

### Interactive Selector Generation

1. Press `Ctrl+Shift+S`
2. Enter URL in prompt
3. Browser opens - click any element
4. Optimal selector is generated and copied to clipboard

### Test Preview

Open any test file to see:

- Test structure visualization
- Step-by-step breakdown
- Run/Debug buttons for each test

## Requirements

- VS Code 1.74.0 or higher
- Node.js 16+ (for Playwright)
- Playwright installed in your project

## Extension Development

To contribute or modify the extension:

```bash
# Clone repository
git clone https://github.com/autoqa/autoqa-pilot

# Install dependencies
cd packages/vscode-extension
npm install

# Compile TypeScript
npm run compile

# Package extension
npm run package
```

## Troubleshooting

### Tests not running

- Ensure Playwright is installed: `npm install @playwright/test`
- Check that test files use `.spec.ts` or `.test.ts` extension

### AI generation not working

- Verify OpenAI API key in settings
- Check internet connection
- Fallback templates will be used if AI fails

### Selector generation issues

- Ensure browser can be launched (Playwright dependencies)
- Check for popup blockers
- Try different URLs

## Support

- [GitHub Issues](https://github.com/autoqa/autoqa-pilot/issues)
- [Documentation](https://docs.autoqa.dev)
- [Discord Community](https://discord.gg/autoqa)

## License

MIT License - see [LICENSE](LICENSE) file for details.

---

**Happy Testing!** 🚀

Made with ❤️ by the AutoQA team
