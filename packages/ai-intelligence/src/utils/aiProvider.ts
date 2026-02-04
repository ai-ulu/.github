import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { AIProvider } from '../types';

export { AIProvider };

export class OpenAIProvider implements AIProvider {
  name = 'openai' as const;
  private client: OpenAI;

  constructor(apiKey: string) {
    if (!apiKey || apiKey.trim() === '') {
      throw new Error('OpenAI API key required');
    }
    this.client = new OpenAI({ apiKey });
  }

  async generateAnalysis(prompt: string, context?: any): Promise<string> {
    try {
      const response = await this.client.chat.completions.create({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'You are an expert test automation engineer specializing in root cause analysis of test failures. Provide clear, actionable insights.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 1000,
        temperature: 0.3
      });

      return response.choices[0]?.message?.content || 'No analysis available';
    } catch (error) {
      console.error('OpenAI API error:', error);
      throw new Error('Failed to generate AI analysis');
    }
  }

  async generateCode(prompt: string, language: string): Promise<string> {
    try {
      const response = await this.client.chat.completions.create({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: `You are an expert ${language} developer specializing in test automation. Generate clean, maintainable test code.`
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 1500,
        temperature: 0.2
      });

      return response.choices[0]?.message?.content || '';
    } catch (error) {
      console.error('OpenAI code generation error:', error);
      throw new Error('Failed to generate code');
    }
  }

  async analyzeImage(imageBuffer: Buffer, prompt: string): Promise<string> {
    try {
      const base64Image = imageBuffer.toString('base64');
      
      const response = await this.client.chat.completions.create({
        model: 'gpt-4-vision-preview',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/png;base64,${base64Image}`
                }
              }
            ]
          }
        ],
        max_tokens: 500
      });

      return response.choices[0]?.message?.content || 'No visual analysis available';
    } catch (error) {
      console.error('OpenAI image analysis error:', error);
      throw new Error('Failed to analyze image');
    }
  }
}

export class AnthropicProvider implements AIProvider {
  name = 'anthropic' as const;
  private client: any; // Use any for now to avoid type issues

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async generateAnalysis(prompt: string, context?: any): Promise<string> {
    try {
      // Use a fallback implementation for now
      return this.ruleBasedAnalysis(prompt);
    } catch (error) {
      console.error('Anthropic API error:', error);
      throw new Error('Failed to generate AI analysis');
    }
  }

  async generateCode(prompt: string, language: string): Promise<string> {
    try {
      // Use a fallback implementation for now
      return this.templateBasedCodeGeneration(prompt, language);
    } catch (error) {
      console.error('Anthropic code generation error:', error);
      throw new Error('Failed to generate code');
    }
  }

  async analyzeImage(imageBuffer: Buffer, prompt: string): Promise<string> {
    try {
      // Use a fallback implementation for now
      return 'Visual analysis requires proper Anthropic API configuration';
    } catch (error) {
      console.error('Anthropic image analysis error:', error);
      throw new Error('Failed to analyze image');
    }
  }

  private ruleBasedAnalysis(prompt: string): string {
    const keywords = {
      'timeout': 'Test timed out waiting for an element or action to complete. Consider increasing timeout or adding explicit waits.',
      'element not found': 'Element could not be located. The selector may have changed or the element may not be visible.',
      'network': 'Network-related issue detected. Check API endpoints and network connectivity.',
      'assertion': 'Test assertion failed. Verify expected vs actual values.',
      'browser': 'Browser-specific issue detected. Test may need cross-browser compatibility fixes.'
    };

    for (const [keyword, analysis] of Object.entries(keywords)) {
      if (prompt.toLowerCase().includes(keyword)) {
        return analysis;
      }
    }

    return 'Unable to determine root cause. Manual investigation required.';
  }

  private templateBasedCodeGeneration(prompt: string, language: string): string {
    const templates = {
      typescript: `// Generated test code
test('${prompt}', async ({ page }) => {
  // Add your test steps here
  await page.goto('https://example.com');
  // TODO: Implement test logic
});`,
      javascript: `// Generated test code
test('${prompt}', async ({ page }) => {
  // Add your test steps here
  await page.goto('https://example.com');
  // TODO: Implement test logic
});`,
      python: `# Generated test code
def test_${prompt.replace(/\s+/g, '_').toLowerCase()}(page):
    # Add your test steps here
    page.goto('https://example.com')
    # TODO: Implement test logic`
    };

    return templates[language as keyof typeof templates] || '// Code generation not available for this language';
  }
}

export class LocalProvider implements AIProvider {
  name = 'local' as const;

  async generateAnalysis(prompt: string, context?: any): Promise<string> {
    // Fallback rule-based analysis
    return this.ruleBasedAnalysis(prompt);
  }

  async generateCode(prompt: string, language: string): Promise<string> {
    // Simple template-based code generation
    return this.templateBasedCodeGeneration(prompt, language);
  }

  async analyzeImage(imageBuffer: Buffer, prompt: string): Promise<string> {
    // Basic image analysis without AI
    return 'Visual analysis requires AI provider configuration';
  }

  private ruleBasedAnalysis(prompt: string): string {
    const keywords = {
      'timeout': 'Test timed out waiting for an element or action to complete. Consider increasing timeout or adding explicit waits.',
      'element not found': 'Element could not be located. The selector may have changed or the element may not be visible.',
      'network': 'Network-related issue detected. Check API endpoints and network connectivity.',
      'assertion': 'Test assertion failed. Verify expected vs actual values.',
      'browser': 'Browser-specific issue detected. Test may need cross-browser compatibility fixes.'
    };

    for (const [keyword, analysis] of Object.entries(keywords)) {
      if (prompt.toLowerCase().includes(keyword)) {
        return analysis;
      }
    }

    return 'Unable to determine root cause. Manual investigation required.';
  }

  private templateBasedCodeGeneration(prompt: string, language: string): string {
    const templates = {
      typescript: `// Generated test code
test('${prompt}', async ({ page }) => {
  // Add your test steps here
  await page.goto('https://example.com');
  // TODO: Implement test logic
});`,
      javascript: `// Generated test code
test('${prompt}', async ({ page }) => {
  // Add your test steps here
  await page.goto('https://example.com');
  // TODO: Implement test logic
});`,
      python: `# Generated test code
def test_${prompt.replace(/\s+/g, '_').toLowerCase()}(page):
    # Add your test steps here
    page.goto('https://example.com')
    # TODO: Implement test logic`
    };

    return templates[language as keyof typeof templates] || '// Code generation not available for this language';
  }
}

export function createAIProvider(provider: 'openai' | 'anthropic' | 'local', apiKey?: string): AIProvider {
  switch (provider) {
    case 'openai':
      if (!apiKey) throw new Error('OpenAI API key required');
      return new OpenAIProvider(apiKey);
    case 'anthropic':
      if (!apiKey) throw new Error('Anthropic API key required');
      return new AnthropicProvider(apiKey);
    case 'local':
      return new LocalProvider();
    default:
      throw new Error(`Unknown AI provider: ${provider}`);
  }
}