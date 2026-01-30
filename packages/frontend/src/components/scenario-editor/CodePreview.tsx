import React, { useState } from 'react';
import { TestScenario } from '../../types/scenario';
import { Button } from '../ui/Button';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { 
  ClipboardDocumentIcon, 
  PlayIcon, 
  DocumentArrowDownIcon,
  CodeBracketIcon 
} from '@heroicons/react/24/outline';

interface CodePreviewProps {
  code?: string;
  scenario: TestScenario;
  isGenerating?: boolean;
}

export const CodePreview: React.FC<CodePreviewProps> = ({
  code,
  scenario,
  isGenerating = false
}) => {
  const [activeTab, setActiveTab] = useState<'playwright' | 'cypress' | 'selenium'>('playwright');
  const [copied, setCopied] = useState(false);

  const generatePlaywrightCode = () => {
    if (!scenario.steps.length) return '';

    const imports = `import { test, expect } from '@playwright/test';`;
    const testName = scenario.name || 'Generated Test';
    const testDescription = scenario.description || 'Auto-generated test scenario';

    let testBody = `test('${testName}', async ({ page }) => {\n`;
    testBody += `  // ${testDescription}\n\n`;

    // Generate steps
    scenario.steps.forEach((step, index) => {
      switch (step.type) {
        case 'navigate':
          testBody += `  // Step ${index + 1}: ${step.description}\n`;
          testBody += `  await page.goto('${step.value || 'https://example.com'}');\n\n`;
          break;
        case 'click':
          testBody += `  // Step ${index + 1}: ${step.description}\n`;
          testBody += `  await page.click('${step.selector || 'button'}');\n\n`;
          break;
        case 'type':
          testBody += `  // Step ${index + 1}: ${step.description}\n`;
          testBody += `  await page.fill('${step.selector || 'input'}', '${step.value || ''}');\n\n`;
          break;
        case 'wait':
          testBody += `  // Step ${index + 1}: ${step.description}\n`;
          if (step.selector === 'networkidle') {
            testBody += `  await page.waitForLoadState('networkidle');\n\n`;
          } else if (step.selector === 'domcontentloaded') {
            testBody += `  await page.waitForLoadState('domcontentloaded');\n\n`;
          } else {
            testBody += `  await page.waitForSelector('${step.selector || 'body'}');\n\n`;
          }
          break;
        case 'screenshot':
          testBody += `  // Step ${index + 1}: ${step.description}\n`;
          testBody += `  await page.screenshot({ path: 'screenshot-${index + 1}.png' });\n\n`;
          break;
        default:
          testBody += `  // Step ${index + 1}: ${step.description}\n`;
          testBody += `  // Custom step implementation needed\n\n`;
      }
    });

    // Generate assertions
    scenario.assertions.forEach((assertion, index) => {
      testBody += `  // Assertion ${index + 1}: ${assertion.description}\n`;
      switch (assertion.type) {
        case 'visible':
          testBody += `  await expect(page.locator('${assertion.selector || 'body'}')).toBeVisible();\n\n`;
          break;
        case 'text':
          testBody += `  await expect(page.locator('${assertion.selector || 'body'}')).toContainText('${assertion.expected}');\n\n`;
          break;
        case 'count':
          testBody += `  await expect(page.locator('${assertion.selector || 'body'}')).toHaveCount(${assertion.expected});\n\n`;
          break;
        case 'url':
          testBody += `  await expect(page).toHaveURL(/${assertion.expected}/);\n\n`;
          break;
        default:
          testBody += `  // Custom assertion implementation needed\n\n`;
      }
    });

    testBody += `});`;

    return `${imports}\n\n${testBody}`;
  };

  const generateCypressCode = () => {
    if (!scenario.steps.length) return '';

    const testName = scenario.name || 'Generated Test';
    const testDescription = scenario.description || 'Auto-generated test scenario';

    let testBody = `describe('${testName}', () => {\n`;
    testBody += `  it('${testDescription}', () => {\n`;

    // Generate steps
    scenario.steps.forEach((step, index) => {
      switch (step.type) {
        case 'navigate':
          testBody += `    // Step ${index + 1}: ${step.description}\n`;
          testBody += `    cy.visit('${step.value || 'https://example.com'}');\n\n`;
          break;
        case 'click':
          testBody += `    // Step ${index + 1}: ${step.description}\n`;
          testBody += `    cy.get('${step.selector || 'button'}').click();\n\n`;
          break;
        case 'type':
          testBody += `    // Step ${index + 1}: ${step.description}\n`;
          testBody += `    cy.get('${step.selector || 'input'}').type('${step.value || ''}');\n\n`;
          break;
        case 'wait':
          testBody += `    // Step ${index + 1}: ${step.description}\n`;
          testBody += `    cy.get('${step.selector || 'body'}').should('be.visible');\n\n`;
          break;
        case 'screenshot':
          testBody += `    // Step ${index + 1}: ${step.description}\n`;
          testBody += `    cy.screenshot('screenshot-${index + 1}');\n\n`;
          break;
      }
    });

    // Generate assertions
    scenario.assertions.forEach((assertion, index) => {
      testBody += `    // Assertion ${index + 1}: ${assertion.description}\n`;
      switch (assertion.type) {
        case 'visible':
          testBody += `    cy.get('${assertion.selector || 'body'}').should('be.visible');\n\n`;
          break;
        case 'text':
          testBody += `    cy.get('${assertion.selector || 'body'}').should('contain.text', '${assertion.expected}');\n\n`;
          break;
        case 'count':
          testBody += `    cy.get('${assertion.selector || 'body'}').should('have.length', ${assertion.expected});\n\n`;
          break;
        case 'url':
          testBody += `    cy.url().should('match', /${assertion.expected}/);\n\n`;
          break;
      }
    });

    testBody += `  });\n});`;

    return testBody;
  };

  const getCurrentCode = () => {
    if (code) return code;
    
    switch (activeTab) {
      case 'playwright':
        return generatePlaywrightCode();
      case 'cypress':
        return generateCypressCode();
      default:
        return generatePlaywrightCode();
    }
  };

  const handleCopy = async () => {
    const currentCode = getCurrentCode();
    if (currentCode) {
      await navigator.clipboard.writeText(currentCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownload = () => {
    const currentCode = getCurrentCode();
    if (currentCode) {
      const blob = new Blob([currentCode], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${scenario.name || 'test'}.${activeTab === 'playwright' ? 'spec.ts' : 'cy.js'}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  const currentCode = getCurrentCode();

  return (
    <div className="code-preview bg-gray-900 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="bg-gray-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <CodeBracketIcon className="w-5 h-5 text-gray-400" />
          <div className="flex space-x-1">
            {['playwright', 'cypress', 'selenium'].map((framework) => (
              <Button
                key={framework}
                variant={activeTab === framework ? 'primary' : 'ghost'}
                size="sm"
                onClick={() => setActiveTab(framework as any)}
                className={activeTab === framework ? '' : 'text-gray-400 hover:text-white'}
              >
                {framework.charAt(0).toUpperCase() + framework.slice(1)}
              </Button>
            ))}
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCopy}
            className="text-gray-400 hover:text-white"
            disabled={!currentCode}
          >
            <ClipboardDocumentIcon className="w-4 h-4 mr-1" />
            {copied ? 'Copied!' : 'Copy'}
          </Button>
          
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDownload}
            className="text-gray-400 hover:text-white"
            disabled={!currentCode}
          >
            <DocumentArrowDownIcon className="w-4 h-4 mr-1" />
            Download
          </Button>

          <Button
            variant="ghost"
            size="sm"
            className="text-green-400 hover:text-green-300"
            disabled={!currentCode}
          >
            <PlayIcon className="w-4 h-4 mr-1" />
            Run Test
          </Button>
        </div>
      </div>

      {/* Code Content */}
      <div className="relative">
        {isGenerating ? (
          <div className="flex items-center justify-center h-64 text-gray-400">
            <LoadingSpinner size="lg" className="mr-3" />
            <span>Generating test code...</span>
          </div>
        ) : currentCode ? (
          <pre className="p-4 text-sm text-gray-300 overflow-x-auto">
            <code className="language-typescript">{currentCode}</code>
          </pre>
        ) : (
          <div className="flex items-center justify-center h-64 text-gray-500">
            <div className="text-center">
              <CodeBracketIcon className="w-12 h-12 mx-auto mb-3 text-gray-600" />
              <p className="text-lg font-medium mb-2">No test code yet</p>
              <p className="text-sm">Add test steps or generate from natural language to see the code preview.</p>
            </div>
          </div>
        )}

        {/* Line numbers */}
        {currentCode && !isGenerating && (
          <div className="absolute left-0 top-0 p-4 text-xs text-gray-600 select-none pointer-events-none">
            {currentCode.split('\n').map((_, index) => (
              <div key={index} className="leading-5">
                {index + 1}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      {currentCode && !isGenerating && (
        <div className="bg-gray-800 px-4 py-2 text-xs text-gray-400 flex items-center justify-between">
          <span>
            {currentCode.split('\n').length} lines • {currentCode.length} characters
          </span>
          <span>
            {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} Test
          </span>
        </div>
      )}
    </div>
  );
};