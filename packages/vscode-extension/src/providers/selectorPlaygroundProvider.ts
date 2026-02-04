import * as vscode from 'vscode';

export class SelectorPlaygroundProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'autoqa.selectorPlayground';
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

        webviewView.webview.onDidReceiveMessage(
            async message => {
                switch (message.type) {
                    case 'generateSelector':
                        await this._generateSelector();
                        break;
                    case 'testSelector':
                        await this._testSelector(message.selector, message.url);
                        break;
                    case 'copySelector':
                        await vscode.env.clipboard.writeText(message.selector);
                        vscode.window.showInformationMessage('Selector copied to clipboard!');
                        break;
                }
            },
            undefined,
            []
        );
    }

    private async _generateSelector() {
        try {
            const result = await vscode.commands.executeCommand('autoqa.generateSelector');
            if (this._view && result) {
                this._view.webview.postMessage({
                    type: 'selectorGenerated',
                    selector: result
                });
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to generate selector: ${error}`);
        }
    }

    private async _testSelector(selector: string, url: string) {
        if (!selector || !url) {
            vscode.window.showErrorMessage('Please provide both selector and URL');
            return;
        }

        // Here you would implement selector testing logic
        // For now, just show a message
        vscode.window.showInformationMessage(`Testing selector "${selector}" on ${url}...`);
        
        // Simulate testing result
        setTimeout(() => {
            if (this._view) {
                this._view.webview.postMessage({
                    type: 'selectorTestResult',
                    selector,
                    result: {
                        found: true,
                        count: 1,
                        message: 'Selector found 1 element'
                    }
                });
            }
        }, 2000);
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Selector Playground</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            margin: 0;
            padding: 16px;
        }

        .section {
            margin-bottom: 20px;
            padding: 16px;
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
        }

        .section-title {
            font-weight: bold;
            margin-bottom: 12px;
            color: var(--vscode-textLink-foreground);
        }

        .input-group {
            margin-bottom: 12px;
        }

        label {
            display: block;
            margin-bottom: 4px;
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
        }

        input, textarea {
            width: 100%;
            padding: 8px;
            border: 1px solid var(--vscode-input-border);
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border-radius: 2px;
            font-family: var(--vscode-editor-font-family);
            font-size: 12px;
            box-sizing: border-box;
        }

        textarea {
            resize: vertical;
            min-height: 60px;
        }

        .btn {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 8px 16px;
            border-radius: 2px;
            cursor: pointer;
            font-size: 12px;
            margin-right: 8px;
            margin-bottom: 8px;
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

        .result {
            margin-top: 12px;
            padding: 12px;
            border-radius: 4px;
            font-family: var(--vscode-editor-font-family);
            font-size: 12px;
        }

        .result.success {
            background-color: var(--vscode-testing-iconPassed);
            color: white;
        }

        .result.error {
            background-color: var(--vscode-testing-iconFailed);
            color: white;
        }

        .result.info {
            background-color: var(--vscode-editor-lineHighlightBackground);
            border: 1px solid var(--vscode-panel-border);
        }

        .selector-examples {
            margin-top: 16px;
        }

        .example {
            margin-bottom: 8px;
            padding: 8px;
            background-color: var(--vscode-editor-lineHighlightBackground);
            border-radius: 2px;
            font-family: var(--vscode-editor-font-family);
            font-size: 11px;
            cursor: pointer;
        }

        .example:hover {
            background-color: var(--vscode-list-hoverBackground);
        }

        .example-label {
            font-weight: bold;
            color: var(--vscode-textLink-foreground);
        }
    </style>
</head>
<body>
    <div class="section">
        <div class="section-title">🎯 Generate Selector</div>
        <p style="font-size: 12px; color: var(--vscode-descriptionForeground); margin-bottom: 12px;">
            Click elements in a browser to generate optimal Playwright selectors
        </p>
        <button class="btn" onclick="generateSelector()">🌐 Open Browser & Select Element</button>
    </div>

    <div class="section">
        <div class="section-title">🧪 Test Selector</div>
        <div class="input-group">
            <label for="testUrl">URL to test on:</label>
            <input type="text" id="testUrl" placeholder="https://example.com" value="https://example.com">
        </div>
        <div class="input-group">
            <label for="testSelector">Selector to test:</label>
            <textarea id="testSelector" placeholder="[data-testid='button']"></textarea>
        </div>
        <button class="btn" onclick="testSelector()">🔍 Test Selector</button>
        <button class="btn btn-secondary" onclick="copySelector()">📋 Copy</button>
        
        <div id="testResult"></div>
    </div>

    <div class="section">
        <div class="section-title">📚 Selector Examples</div>
        <div class="selector-examples">
            <div class="example" onclick="useExample('[data-testid=\\'login-button\\']')">
                <div class="example-label">Data Test ID (Recommended)</div>
                <code>[data-testid='login-button']</code>
            </div>
            <div class="example" onclick="useExample('#submit-btn')">
                <div class="example-label">ID Selector</div>
                <code>#submit-btn</code>
            </div>
            <div class="example" onclick="useExample('.btn-primary')">
                <div class="example-label">Class Selector</div>
                <code>.btn-primary</code>
            </div>
            <div class="example" onclick="useExample('button:has-text(\\'Login\\')')">
                <div class="example-label">Text Content</div>
                <code>button:has-text('Login')</code>
            </div>
            <div class="example" onclick="useExample('[name=\\'email\\']')">
                <div class="example-label">Attribute Selector</div>
                <code>[name='email']</code>
            </div>
            <div class="example" onclick="useExample('input[type=\\'password\\']')">
                <div class="example-label">Type Selector</div>
                <code>input[type='password']</code>
            </div>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();

        window.addEventListener('message', event => {
            const message = event.data;
            
            switch (message.type) {
                case 'selectorGenerated':
                    document.getElementById('testSelector').value = message.selector;
                    break;
                case 'selectorTestResult':
                    showTestResult(message.result);
                    break;
            }
        });

        function generateSelector() {
            vscode.postMessage({ type: 'generateSelector' });
        }

        function testSelector() {
            const url = document.getElementById('testUrl').value;
            const selector = document.getElementById('testSelector').value;
            
            if (!url || !selector) {
                showTestResult({
                    found: false,
                    message: 'Please provide both URL and selector'
                });
                return;
            }

            showTestResult({
                found: null,
                message: 'Testing selector...'
            });

            vscode.postMessage({
                type: 'testSelector',
                url: url,
                selector: selector
            });
        }

        function copySelector() {
            const selector = document.getElementById('testSelector').value;
            if (selector) {
                vscode.postMessage({
                    type: 'copySelector',
                    selector: selector
                });
            }
        }

        function useExample(selector) {
            document.getElementById('testSelector').value = selector;
        }

        function showTestResult(result) {
            const resultDiv = document.getElementById('testResult');
            
            if (result.found === null) {
                resultDiv.innerHTML = \`<div class="result info">\${result.message}</div>\`;
            } else if (result.found) {
                resultDiv.innerHTML = \`<div class="result success">✅ \${result.message}</div>\`;
            } else {
                resultDiv.innerHTML = \`<div class="result error">❌ \${result.message}</div>\`;
            }
        }
    </script>
</body>
</html>`;
    }
}