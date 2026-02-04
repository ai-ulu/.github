import * as vscode from 'vscode';
import OpenAI from 'openai';

interface TestIntent {
    description: string;
    type: 'login' | 'form' | 'navigation' | 'api' | 'general';
    elements: string[];
    url?: string;
}

export class AITestGenerator {
    private openai: OpenAI | null = null;

    constructor() {
        this.initializeAI();
    }

    private initializeAI() {
        const config = vscode.workspace.getConfiguration('autoqa');
        const apiKey = config.get<string>('openaiApiKey');
        
        if (apiKey) {
            this.openai = new OpenAI({ apiKey });
        }
    }

    async generateFromComment(comment: string): Promise<string> {
        const intent = this.parseTestIntent(comment);
        
        if (!this.openai) {
            // Fallback to template-based generation
            return this.generateFromTemplate(intent);
        }

        try {
            const prompt = this.buildPrompt(intent);
            const response = await this.openai.chat.completions.create({
                model: 'gpt-3.5-turbo',
                messages: [
                    {
                        role: 'system',
                        content: 'You are an expert Playwright test generator. Generate clean, maintainable test code.'
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                max_tokens: 500,
                temperature: 0.3
            });

            const generatedCode = response.choices[0]?.message?.content || '';
            return this.formatTestCode(generatedCode);
        } catch (error) {
            console.error('AI generation failed:', error);
            return this.generateFromTemplate(intent);
        }
    }

    private parseTestIntent(comment: string): TestIntent {
        const match = comment.match(/\/\/\s*Test:\s*(.+)/i);
        const description = match?.[1] || comment;
        
        return {
            description,
            type: this.inferTestType(description),
            elements: this.extractElements(description),
            url: this.extractUrl(description)
        };
    }

    private inferTestType(description: string): TestIntent['type'] {
        const lower = description.toLowerCase();
        
        if (lower.includes('login') || lower.includes('sign in') || lower.includes('authenticate')) {
            return 'login';
        }
        if (lower.includes('form') || lower.includes('submit') || lower.includes('input')) {
            return 'form';
        }
        if (lower.includes('navigate') || lower.includes('click') || lower.includes('page')) {
            return 'navigation';
        }
        if (lower.includes('api') || lower.includes('request') || lower.includes('response')) {
            return 'api';
        }
        
        return 'general';
    }

    private extractElements(description: string): string[] {
        const elements: string[] = [];
        
        // Extract quoted strings as potential selectors
        const quotes = description.match(/"([^"]+)"/g);
        if (quotes) {
            elements.push(...quotes.map(q => q.replace(/"/g, '')));
        }
        
        return elements;
    }

    private extractUrl(description: string): string | undefined {
        const urlMatch = description.match(/https?:\/\/[^\s]+/);
        return urlMatch?.[0];
    }
    private buildPrompt(intent: TestIntent): string {
        return `Generate a Playwright test for: "${intent.description}"

Requirements:
- Use TypeScript syntax
- Use async/await pattern
- Include proper selectors (prefer data-testid, then id, then class)
- Add meaningful assertions
- Follow Playwright best practices
- Keep it concise but complete

Test type: ${intent.type}
${intent.url ? `URL: ${intent.url}` : ''}
${intent.elements.length > 0 ? `Elements: ${intent.elements.join(', ')}` : ''}

Generate only the test function code, starting with test():`;
    }

    private generateFromTemplate(intent: TestIntent): string {
        switch (intent.type) {
            case 'login':
                return this.generateLoginTest(intent);
            case 'form':
                return this.generateFormTest(intent);
            case 'navigation':
                return this.generateNavigationTest(intent);
            case 'api':
                return this.generateApiTest(intent);
            default:
                return this.generateGeneralTest(intent);
        }
    }

    private generateLoginTest(intent: TestIntent): string {
        const url = intent.url || 'https://example.com/login';
        return `test('${intent.description}', async ({ page }) => {
  // Navigate to login page
  await page.goto('${url}');

  // Fill login form
  await page.fill('[data-testid="email"]', 'user@example.com');
  await page.fill('[data-testid="password"]', 'password123');

  // Submit form
  await page.click('[data-testid="login-button"]');

  // Verify successful login
  await expect(page).toHaveURL(/.*dashboard/);
  await expect(page.locator('[data-testid="user-menu"]')).toBeVisible();
});`;
    }

    private generateFormTest(intent: TestIntent): string {
        return `test('${intent.description}', async ({ page }) => {
  // Navigate to form page
  await page.goto('${intent.url || 'https://example.com/form'}');

  // Fill form fields
  await page.fill('[data-testid="name"]', 'John Doe');
  await page.fill('[data-testid="email"]', 'john@example.com');

  // Submit form
  await page.click('[data-testid="submit-button"]');

  // Verify form submission
  await expect(page.locator('[data-testid="success-message"]')).toBeVisible();
});`;
    }

    private generateNavigationTest(intent: TestIntent): string {
        return `test('${intent.description}', async ({ page }) => {
  // Navigate to page
  await page.goto('${intent.url || 'https://example.com'}');

  // Perform navigation action
  await page.click('[data-testid="nav-link"]');

  // Verify navigation
  await expect(page).toHaveURL(/.*target-page/);
  await expect(page.locator('h1')).toBeVisible();
});`;
    }

    private generateApiTest(intent: TestIntent): string {
        return `test('${intent.description}', async ({ page }) => {
  // Set up API response mock
  await page.route('**/api/**', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true })
    });
  });

  // Navigate to page that makes API call
  await page.goto('${intent.url || 'https://example.com'}');

  // Trigger API call
  await page.click('[data-testid="api-button"]');

  // Verify API response handling
  await expect(page.locator('[data-testid="api-result"]')).toBeVisible();
});`;
    }

    private generateGeneralTest(intent: TestIntent): string {
        return `test('${intent.description}', async ({ page }) => {
  // Navigate to page
  await page.goto('${intent.url || 'https://example.com'}');

  // Add your test steps here
  // Example: await page.click('[data-testid="button"]');

  // Add assertions
  // Example: await expect(page.locator('h1')).toBeVisible();
});`;
    }

    private formatTestCode(code: string): string {
        // Clean up the generated code
        let formatted = code.trim();
        
        // Remove markdown code blocks if present
        formatted = formatted.replace(/```typescript\n?/g, '');
        formatted = formatted.replace(/```\n?/g, '');
        
        // Ensure proper indentation
        const lines = formatted.split('\n');
        const indentedLines = lines.map(line => {
            if (line.trim() === '') return line;
            if (line.startsWith('test(')) return line;
            return '  ' + line;
        });
        
        return indentedLines.join('\n');
    }
}