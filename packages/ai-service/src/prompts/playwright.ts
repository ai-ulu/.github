export class PlaywrightPrompts {
  buildTestGenerationPrompt(naturalLanguage: string, context?: any): string {
    const basePrompt = `Generate a comprehensive Playwright test based on this description: "${naturalLanguage}"`;
    
    let prompt = basePrompt;

    if (context?.url) {
      prompt += `\n\nTarget URL: ${context.url}`;
    }

    if (context?.framework) {
      prompt += `\n\nFramework: ${context.framework}`;
    }

    if (context?.language) {
      prompt += `\n\nLanguage: ${context.language}`;
    }

    if (context?.existingCode) {
      prompt += `\n\nExisting code context:\n${context.existingCode}`;
    }

    prompt += `\n\nRequirements:
1. Use modern Playwright APIs and best practices
2. Include proper page object patterns where appropriate
3. Add meaningful assertions that verify the expected behavior
4. Handle loading states and dynamic content
5. Include error handling for common failure scenarios
6. Use descriptive test names and comments
7. Follow TypeScript best practices
8. Include setup and teardown if needed
9. Use appropriate selectors (prefer data-testid, then accessible selectors)
10. Add timeouts and waits where necessary

The test should be production-ready and maintainable.`;

    return prompt;
  }

  buildCodeOptimizationPrompt(code: string, issues: string[]): string {
    return `Optimize this Playwright test code to fix the following issues:

Issues to fix:
${issues.map(issue => `- ${issue}`).join('\n')}

Current code:
\`\`\`typescript
${code}
\`\`\`

Please provide the optimized version that:
1. Fixes all identified issues
2. Maintains the original test intent
3. Follows Playwright best practices
4. Is more maintainable and reliable
5. Includes proper error handling`;
  }

  buildScenarioEnhancementPrompt(scenario: string, requirements: string[]): string {
    return `Enhance this test scenario with additional test cases and edge cases:

Base scenario: ${scenario}

Additional requirements:
${requirements.map(req => `- ${req}`).join('\n')}

Generate a comprehensive test suite that covers:
1. Happy path scenarios
2. Error conditions and edge cases
3. Boundary value testing
4. Accessibility testing considerations
5. Performance considerations
6. Cross-browser compatibility notes

Provide multiple test cases in a well-structured format.`;
  }

  buildAssertionGenerationPrompt(action: string, element: string): string {
    return `Generate appropriate Playwright assertions for this test action:

Action: ${action}
Element: ${element}

Provide multiple assertion options that verify:
1. Element visibility and state
2. Content validation
3. Attribute verification
4. Behavioral assertions
5. Accessibility checks

Include both positive and negative test cases where appropriate.`;
  }

  buildSelectorOptimizationPrompt(selector: string, context: string): string {
    return `Optimize this CSS selector for better reliability and maintainability:

Current selector: ${selector}
Context: ${context}

Provide alternative selectors ranked by preference:
1. data-testid attributes (most preferred)
2. Accessible role/label selectors
3. Semantic HTML selectors
4. CSS class selectors (least preferred)

Explain the pros and cons of each approach and provide the recommended selector with justification.`;
  }
}