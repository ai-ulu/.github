import * as vscode from 'vscode';

export class TestPreviewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'autoqa.testPreview';
    private _view?: vscode.WebviewView;

    constructor(private readonly _extensionUri: vscode.Uri) {}

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        // Handle messages from webview
        webviewView.webview.onDidReceiveMessage(
            message => {
                switch (message.type) {
                    case 'runTest':
                        this._runTest(message.testName);
                        break;
                    case 'debugTest':
                        this._debugTest(message.testName);
                        break;
                }
            },
            undefined,
            []
        );
    }

    public updatePreview(document: vscode.TextDocument) {
        if (this._view) {
            const testInfo = this._extractTestInfo(document);
            this._view.webview.postMessage({
                type: 'updatePreview',
                testInfo: testInfo
            });
        }
    }

    private _extractTestInfo(document: vscode.TextDocument): any {
        const text = document.getText();
        const tests: any[] = [];

        // Extract test blocks using regex
        const testRegex = /test\s*\(\s*['"`]([^'"`]+)['"`]\s*,\s*async\s*\(\s*\{\s*page\s*\}\s*\)\s*=>\s*\{([\s\S]*?)\n\s*\}\s*\)/g;
        let match;

        while ((match = testRegex.exec(text)) !== null) {
            const testName = match[1];
            const testBody = match[2];
            const steps = this._extractSteps(testBody);

            tests.push({
                name: testName,
                steps: steps,
                startLine: document.positionAt(match.index).line,
                endLine: document.positionAt(match.index + match[0].length).line
            });
        }

        return {
            fileName: document.fileName,
            tests: tests,
            totalTests: tests.length
        };
    }

    private _extractSteps(testBody: string): any[] {
        const steps: any[] = [];
        const lines = testBody.split('\n');

        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('await page.')) {
                const step = this._parsePlaywrightStep(trimmed);
                if (step) {
                    steps.push(step);
                }
            }
        }

        return steps;
    }

    private _parsePlaywrightStep(line: string): any | null {
        // Parse different Playwright actions
        if (line.includes('.goto(')) {
            const urlMatch = line.match(/\.goto\s*\(\s*['"`]([^'"`]+)['"`]/);
            return {
                type: 'navigation',
                action: 'goto',
                url: urlMatch?.[1] || '',
                description: `Navigate to ${urlMatch?.[1] || 'URL'}`
            };
        }

        if (line.includes('.click(')) {
            const selectorMatch = line.match(/\.click\s*\(\s*['"`]([^'"`]+)['"`]/);
            return {
                type: 'interaction',
                action: 'click',
                selector: selectorMatch?.[1] || '',
                description: `Click ${selectorMatch?.[1] || 'element'}`
            };
        }

        if (line.includes('.fill(')) {
            const matches = line.match(/\.fill\s*\(\s*['"`]([^'"`]+)['"`]\s*,\s*['"`]([^'"`]+)['"`]/);
            return {
                type: 'interaction',
                action: 'fill',
                selector: matches?.[1] || '',
                value: matches?.[2] || '',
                description: `Fill ${matches?.[1] || 'field'} with "${matches?.[2] || 'value'}"`
            };
        }

        if (line.includes('expect(')) {
            const expectMatch = line.match(/expect\s*\(\s*([^)]+)\s*\)/);
            return {
                type: 'assertion',
                action: 'expect',
                target: expectMatch?.[1] || '',
                description: `Assert ${expectMatch?.[1] || 'condition'}`
            };
        }

        return null;
    }

    private async _runTest(testName: string) {
        await vscode.commands.executeCommand('autoqa.runTest');
    }

    private async _debugTest(testName: string) {
        await vscode.commands.executeCommand('autoqa.debugTest');
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AutoQA Test Preview</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            margin: 0;
            padding: 16px;
        }

        .test-container {
            margin-bottom: 20px;
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
            overflow: hidden;
        }

        .test-header {
            background-color: var(--vscode-editor-lineHighlightBackground);
            padding: 12px 16px;
            border-bottom: 1px solid var(--vscode-panel-border);
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .test-name {
            font-weight: bold;
            color: var(--vscode-textLink-foreground);
        }

        .test-actions {
            display: flex;
            gap: 8px;
        }

        .btn {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 4px 12px;
            border-radius: 2px;
            cursor: pointer;
            font-size: 12px;
        }

        .btn:hover {
            background-color: var(--vscode-button-hoverBackground);
        }

        .btn-secondary {
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }

        .btn-secondary:hover {
            background-color: var(--vscode-button-secondaryHoverBackground);
        }

        .test-steps {
            padding: 16px;
        }

        .step {
            display: flex;
            align-items: center;
            margin-bottom: 12px;
            padding: 8px;
            background-color: var(--vscode-editor-background);
            border-radius: 4px;
            border-left: 3px solid var(--vscode-textLink-foreground);
        }

        .step-icon {
            width: 20px;
            height: 20px;
            margin-right: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 50%;
            font-size: 12px;
            font-weight: bold;
        }

        .step-navigation {
            background-color: var(--vscode-charts-blue);
            color: white;
        }

        .step-interaction {
            background-color: var(--vscode-charts-green);
            color: white;
        }

        .step-assertion {
            background-color: var(--vscode-charts-orange);
            color: white;
        }

        .step-description {
            flex: 1;
            font-family: var(--vscode-editor-font-family);
        }

        .no-tests {
            text-align: center;
            color: var(--vscode-descriptionForeground);
            padding: 40px 20px;
        }

        .stats {
            background-color: var(--vscode-editor-lineHighlightBackground);
            padding: 12px 16px;
            margin-bottom: 16px;
            border-radius: 4px;
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
        }
    </style>
</head>
<body>
    <div id="content">
        <div class="no-tests">
            <p>📝 Open a test file to see preview</p>
            <p>Write tests with Playwright syntax and see them visualized here</p>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();

        window.addEventListener('message', event => {
            const message = event.data;
            
            switch (message.type) {
                case 'updatePreview':
                    updatePreview(message.testInfo);
                    break;
            }
        });

        function updatePreview(testInfo) {
            const content = document.getElementById('content');
            
            if (!testInfo || testInfo.tests.length === 0) {
                content.innerHTML = \`
                    <div class="no-tests">
                        <p>📝 No tests found in current file</p>
                        <p>Add test() blocks to see preview</p>
                    </div>
                \`;
                return;
            }

            let html = \`
                <div class="stats">
                    📊 \${testInfo.totalTests} test\${testInfo.totalTests !== 1 ? 's' : ''} found in \${testInfo.fileName.split('/').pop()}
                </div>
            \`;

            testInfo.tests.forEach(test => {
                html += \`
                    <div class="test-container">
                        <div class="test-header">
                            <div class="test-name">\${test.name}</div>
                            <div class="test-actions">
                                <button class="btn btn-secondary" onclick="runTest('\${test.name}')">▶️ Run</button>
                                <button class="btn" onclick="debugTest('\${test.name}')">🐛 Debug</button>
                            </div>
                        </div>
                        <div class="test-steps">
                            \${test.steps.map(step => \`
                                <div class="step">
                                    <div class="step-icon step-\${step.type}">
                                        \${getStepIcon(step.type)}
                                    </div>
                                    <div class="step-description">\${step.description}</div>
                                </div>
                            \`).join('')}
                        </div>
                    </div>
                \`;
            });

            content.innerHTML = html;
        }

        function getStepIcon(type) {
            switch (type) {
                case 'navigation': return '🌐';
                case 'interaction': return '👆';
                case 'assertion': return '✓';
                default: return '•';
            }
        }

        function runTest(testName) {
            vscode.postMessage({
                type: 'runTest',
                testName: testName
            });
        }

        function debugTest(testName) {
            vscode.postMessage({
                type: 'debugTest',
                testName: testName
            });
        }
    </script>
</body>
</html>`;
    }
}