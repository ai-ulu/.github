import * as vscode from 'vscode';
import { TestPreviewProvider } from './providers/testPreviewProvider';
import { TestExplorerProvider } from './providers/testExplorerProvider';
import { SelectorPlaygroundProvider } from './providers/selectorPlaygroundProvider';
import { AITestGenerator } from './ai/testGenerator';
import { PlaywrightSelectorGenerator } from './selectors/selectorGenerator';
import { TestRunner } from './test/testRunner';
import { SnippetProvider } from './providers/snippetProvider';

let testPreviewProvider: TestPreviewProvider;
let testExplorerProvider: TestExplorerProvider;
let selectorPlaygroundProvider: SelectorPlaygroundProvider;
let aiTestGenerator: AITestGenerator;
let selectorGenerator: PlaywrightSelectorGenerator;
let testRunner: TestRunner;

export function activate(context: vscode.ExtensionContext) {
    console.log('AutoQA extension is now active!');

    // Initialize providers
    testPreviewProvider = new TestPreviewProvider(context.extensionUri);
    testExplorerProvider = new TestExplorerProvider();
    selectorPlaygroundProvider = new SelectorPlaygroundProvider(context.extensionUri);
    aiTestGenerator = new AITestGenerator();
    selectorGenerator = new PlaywrightSelectorGenerator();
    testRunner = new TestRunner();

    // Register webview providers
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('autoqa.testPreview', testPreviewProvider)
    );

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('autoqa.selectorPlayground', selectorPlaygroundProvider)
    );

    // Register tree data provider
    context.subscriptions.push(
        vscode.window.registerTreeDataProvider('autoqa.testExplorer', testExplorerProvider)
    );

    // Register commands
    registerCommands(context);

    // Set up file watchers
    setupFileWatchers(context);

    // Check if workspace has tests
    checkForTests();
}

function registerCommands(context: vscode.ExtensionContext) {
    // Generate test from comment
    const generateTestCommand = vscode.commands.registerCommand(
        'autoqa.generateTest',
        async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showErrorMessage('No active editor found');
                return;
            }

            const document = editor.document;
            const selection = editor.selection;
            const line = document.lineAt(selection.active.line);
            const comment = line.text.trim();

            if (!comment.includes('Test:')) {
                vscode.window.showErrorMessage('Place cursor on a line with "Test:" comment');
                return;
            }

            try {
                vscode.window.showInformationMessage('Generating test...');
                const testCode = await aiTestGenerator.generateFromComment(comment);
                
                await editor.edit(editBuilder => {
                    const nextLine = selection.active.line + 1;
                    const insertPosition = new vscode.Position(nextLine, 0);
                    editBuilder.insert(insertPosition, '\n' + testCode + '\n');
                });

                vscode.window.showInformationMessage('Test generated successfully!');
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to generate test: ${error}`);
            }
        }
    );

    // Generate Playwright selector
    const generateSelectorCommand = vscode.commands.registerCommand(
        'autoqa.generateSelector',
        async () => {
            try {
                const selector = await selectorGenerator.generateInteractive();
                if (selector) {
                    await vscode.env.clipboard.writeText(selector);
                    vscode.window.showInformationMessage(`Selector copied to clipboard: ${selector}`);
                }
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to generate selector: ${error}`);
            }
        }
    );

    // Run test
    const runTestCommand = vscode.commands.registerCommand(
        'autoqa.runTest',
        async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showErrorMessage('No active editor found');
                return;
            }

            const testFile = editor.document.fileName;
            if (!testFile.includes('.spec.') && !testFile.includes('.test.')) {
                vscode.window.showErrorMessage('Current file is not a test file');
                return;
            }

            try {
                vscode.window.showInformationMessage('Running test...');
                await testRunner.runTest(testFile);
                vscode.window.showInformationMessage('Test completed!');
            } catch (error) {
                vscode.window.showErrorMessage(`Test failed: ${error}`);
            }
        }
    );

    // Debug test
    const debugTestCommand = vscode.commands.registerCommand(
        'autoqa.debugTest',
        async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showErrorMessage('No active editor found');
                return;
            }

            const testFile = editor.document.fileName;
            if (!testFile.includes('.spec.') && !testFile.includes('.test.')) {
                vscode.window.showErrorMessage('Current file is not a test file');
                return;
            }

            try {
                vscode.window.showInformationMessage('Starting debug session...');
                await testRunner.debugTest(testFile);
            } catch (error) {
                vscode.window.showErrorMessage(`Debug failed: ${error}`);
            }
        }
    );

    // Record test
    const recordTestCommand = vscode.commands.registerCommand(
        'autoqa.recordTest',
        async () => {
            const url = await vscode.window.showInputBox({
                prompt: 'Enter URL to record test for',
                placeHolder: 'https://example.com'
            });

            if (!url) {
                return;
            }

            try {
                vscode.window.showInformationMessage('Starting test recording...');
                const testCode = await testRunner.recordTest(url);
                
                // Create new test file
                const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
                if (workspaceFolder) {
                    const testFileName = `recorded-test-${Date.now()}.spec.ts`;
                    const testFilePath = vscode.Uri.joinPath(workspaceFolder.uri, 'tests', testFileName);
                    
                    await vscode.workspace.fs.writeFile(testFilePath, Buffer.from(testCode));
                    const document = await vscode.workspace.openTextDocument(testFilePath);
                    await vscode.window.showTextDocument(document);
                    
                    vscode.window.showInformationMessage('Test recorded and saved!');
                }
            } catch (error) {
                vscode.window.showErrorMessage(`Recording failed: ${error}`);
            }
        }
    );

    // Open test runner
    const openTestRunnerCommand = vscode.commands.registerCommand(
        'autoqa.openTestRunner',
        async () => {
            const config = vscode.workspace.getConfiguration('autoqa');
            const port = config.get<number>('testRunner.port', 3333);
            const url = `http://localhost:${port}`;
            
            await vscode.env.openExternal(vscode.Uri.parse(url));
        }
    );

    // Register all commands
    context.subscriptions.push(
        generateTestCommand,
        generateSelectorCommand,
        runTestCommand,
        debugTestCommand,
        recordTestCommand,
        openTestRunnerCommand
    );
}

function setupFileWatchers(context: vscode.ExtensionContext) {
    // Watch for test file changes
    const testFileWatcher = vscode.workspace.createFileSystemWatcher('**/*.{spec,test}.{ts,js}');
    
    testFileWatcher.onDidCreate(() => {
        testExplorerProvider.refresh();
        checkForTests();
    });
    
    testFileWatcher.onDidDelete(() => {
        testExplorerProvider.refresh();
        checkForTests();
    });

    // Watch for active editor changes
    vscode.window.onDidChangeActiveTextEditor(editor => {
        if (editor && isTestFile(editor.document)) {
            testPreviewProvider.updatePreview(editor.document);
        }
    });

    // Watch for document changes
    vscode.workspace.onDidChangeTextDocument(event => {
        if (isTestFile(event.document)) {
            testPreviewProvider.updatePreview(event.document);
        }
    });

    context.subscriptions.push(testFileWatcher);
}

function isTestFile(document: vscode.TextDocument): boolean {
    const fileName = document.fileName;
    return fileName.includes('.spec.') || fileName.includes('.test.');
}

async function checkForTests() {
    const testFiles = await vscode.workspace.findFiles('**/*.{spec,test}.{ts,js}');
    const hasTests = testFiles.length > 0;
    
    await vscode.commands.executeCommand('setContext', 'autoqa.hasTests', hasTests);
}

export function deactivate() {
    console.log('AutoQA extension deactivated');
}