import * as vscode from 'vscode';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import { chromium, Browser, Page } from 'playwright';

export class TestRunner {
    private runningProcesses: Map<string, ChildProcess> = new Map();

    async runTest(testFile: string): Promise<void> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            throw new Error('No workspace folder found');
        }

        const relativePath = path.relative(workspaceFolder.uri.fsPath, testFile);
        const processKey = `run-${relativePath}`;

        // Kill existing process if running
        if (this.runningProcesses.has(processKey)) {
            this.runningProcesses.get(processKey)?.kill();
            this.runningProcesses.delete(processKey);
        }

        return new Promise((resolve, reject) => {
            const process = spawn('npx', ['playwright', 'test', relativePath], {
                cwd: workspaceFolder.uri.fsPath,
                stdio: 'pipe'
            });

            this.runningProcesses.set(processKey, process);

            let output = '';
            let errorOutput = '';

            process.stdout?.on('data', (data) => {
                output += data.toString();
            });

            process.stderr?.on('data', (data) => {
                errorOutput += data.toString();
            });

            process.on('close', (code) => {
                this.runningProcesses.delete(processKey);

                if (code === 0) {
                    vscode.window.showInformationMessage('✅ Test passed!');
                    this.showTestOutput(output, 'Test Results');
                    resolve();
                } else {
                    vscode.window.showErrorMessage('❌ Test failed!');
                    this.showTestOutput(errorOutput || output, 'Test Errors');
                    reject(new Error(`Test failed with code ${code}`));
                }
            });

            process.on('error', (error) => {
                this.runningProcesses.delete(processKey);
                reject(error);
            });
        });
    }

    async debugTest(testFile: string): Promise<void> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            throw new Error('No workspace folder found');
        }

        const relativePath = path.relative(workspaceFolder.uri.fsPath, testFile);
        
        // Run test in headed mode for debugging
        const process = spawn('npx', ['playwright', 'test', relativePath, '--headed', '--debug'], {
            cwd: workspaceFolder.uri.fsPath,
            stdio: 'inherit'
        });

        const processKey = `debug-${relativePath}`;
        this.runningProcesses.set(processKey, process);

        process.on('close', () => {
            this.runningProcesses.delete(processKey);
        });

        vscode.window.showInformationMessage('🐛 Debug session started in browser');
    }

    async recordTest(url: string): Promise<string> {
        let browser: Browser | null = null;
        let page: Page | null = null;

        try {
            browser = await chromium.launch({ headless: false });
            const context = await browser.newContext();
            page = await context.newPage();

            // Start recording
            const actions: string[] = [];
            
            // Set up action recording
            await this.setupActionRecording(page, actions);

            // Navigate to URL
            await page.goto(url);
            actions.push(`await page.goto('${url}');`);

            vscode.window.showInformationMessage(
                'Recording started! Interact with the page. Press Ctrl+Shift+P and run "AutoQA: Stop Recording" when done.'
            );

            // Wait for user to finish recording
            await this.waitForRecordingStop();

            // Generate test code
            const testCode = this.generateTestFromActions(actions, url);
            
            return testCode;
        } finally {
            if (page) await page.close();
            if (browser) await browser.close();
        }
    }

    private async setupActionRecording(page: Page, actions: string[]): Promise<void> {
        // Record clicks
        await page.exposeFunction('recordClick', (selector: string, text: string) => {
            if (selector) {
                actions.push(`await page.click('${selector}');`);
            }
        });

        // Record form fills
        await page.exposeFunction('recordFill', (selector: string, value: string) => {
            if (selector && value) {
                actions.push(`await page.fill('${selector}', '${value}');`);
            }
        });

        // Inject recording script
        await page.addInitScript(() => {
            function getSelector(element: HTMLElement): string {
                // Try data-testid first
                if (element.getAttribute('data-testid')) {
                    return `[data-testid="${element.getAttribute('data-testid')}"]`;
                }
                
                // Try id
                if (element.id) {
                    return `#${element.id}`;
                }
                
                // Try name attribute
                if (element.getAttribute('name')) {
                    return `[name="${element.getAttribute('name')}"]`;
                }
                
                // Try class (if single class)
                if (element.className && !element.className.includes(' ')) {
                    return `.${element.className}`;
                }
                
                // Fallback to tag name
                return element.tagName.toLowerCase();
            }

            // Record clicks
            document.addEventListener('click', (e) => {
                if (e.target instanceof HTMLElement) {
                    const selector = getSelector(e.target);
                    const text = e.target.textContent?.trim().slice(0, 20) || '';
                    (window as any).recordClick(selector, text);
                }
            });

            // Record form inputs
            document.addEventListener('input', (e) => {
                if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
                    const selector = getSelector(e.target);
                    const value = e.target.value;
                    (window as any).recordFill(selector, value);
                }
            });
        });
    }

    private async waitForRecordingStop(): Promise<void> {
        // Register temporary command to stop recording
        const disposable = vscode.commands.registerCommand('autoqa.stopRecording', () => {
            disposable.dispose();
        });

        // Wait for command to be called or timeout
        return new Promise((resolve) => {
            const timeout = setTimeout(() => {
                disposable.dispose();
                resolve();
            }, 300000); // 5 minutes timeout

            const originalDispose = disposable.dispose;
            disposable.dispose = () => {
                clearTimeout(timeout);
                originalDispose.call(disposable);
                resolve();
            };
        });
    }

    private generateTestFromActions(actions: string[], url: string): string {
        const testName = `Recorded test for ${new URL(url).hostname}`;
        
        return `test('${testName}', async ({ page }) => {
  ${actions.map(action => `  ${action}`).join('\n')}
  
  // Add your assertions here
  // Example: await expect(page.locator('h1')).toBeVisible();
});`;
    }

    private showTestOutput(output: string, title: string): void {
        const outputChannel = vscode.window.createOutputChannel(title);
        outputChannel.clear();
        outputChannel.appendLine(output);
        outputChannel.show();
    }

    dispose(): void {
        // Clean up running processes
        for (const [key, process] of this.runningProcesses) {
            process.kill();
        }
        this.runningProcesses.clear();
    }
}