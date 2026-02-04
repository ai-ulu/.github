import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export class TestExplorerProvider implements vscode.TreeDataProvider<TestItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<TestItem | undefined | null | void> = new vscode.EventEmitter<TestItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<TestItem | undefined | null | void> = this._onDidChangeTreeData.event;

    constructor() {}

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: TestItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: TestItem): Promise<TestItem[]> {
        if (!element) {
            // Root level - return test files
            return this.getTestFiles();
        } else if (element.type === 'file') {
            // File level - return tests in file
            return this.getTestsInFile(element.filePath!);
        }
        
        return [];
    }

    private async getTestFiles(): Promise<TestItem[]> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            return [];
        }

        const testFiles = await vscode.workspace.findFiles('**/*.{spec,test}.{ts,js}');
        
        return testFiles.map(file => {
            const relativePath = path.relative(workspaceFolder.uri.fsPath, file.fsPath);
            const fileName = path.basename(file.fsPath);
            
            return new TestItem(
                fileName,
                vscode.TreeItemCollapsibleState.Collapsed,
                'file',
                file.fsPath,
                relativePath
            );
        });
    }

    private async getTestsInFile(filePath: string): Promise<TestItem[]> {
        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const tests = this.extractTests(content);
            
            return tests.map(test => new TestItem(
                test.name,
                vscode.TreeItemCollapsibleState.None,
                'test',
                filePath,
                undefined,
                test
            ));
        } catch (error) {
            console.error('Error reading test file:', error);
            return [];
        }
    }

    private extractTests(content: string): TestInfo[] {
        const tests: TestInfo[] = [];
        const testRegex = /test\s*\(\s*['"`]([^'"`]+)['"`]\s*,\s*async\s*\(\s*\{\s*page\s*\}\s*\)\s*=>\s*\{/g;
        
        let match;
        while ((match = testRegex.exec(content)) !== null) {
            tests.push({
                name: match[1],
                line: content.substring(0, match.index).split('\n').length - 1
            });
        }
        
        return tests;
    }
}

interface TestInfo {
    name: string;
    line: number;
}

class TestItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly type: 'file' | 'test',
        public readonly filePath?: string,
        public readonly relativePath?: string,
        public readonly testInfo?: TestInfo
    ) {
        super(label, collapsibleState);

        if (type === 'file') {
            this.tooltip = relativePath;
            this.iconPath = new vscode.ThemeIcon('file-code');
            this.contextValue = 'testFile';
            this.command = {
                command: 'vscode.open',
                title: 'Open',
                arguments: [vscode.Uri.file(filePath!)]
            };
        } else if (type === 'test') {
            this.tooltip = `${label} (line ${testInfo?.line})`;
            this.iconPath = new vscode.ThemeIcon('beaker');
            this.contextValue = 'test';
            this.command = {
                command: 'vscode.open',
                title: 'Open',
                arguments: [
                    vscode.Uri.file(filePath!),
                    { selection: new vscode.Range(testInfo?.line || 0, 0, testInfo?.line || 0, 0) }
                ]
            };
        }
    }
}