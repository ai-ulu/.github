import * as vscode from 'vscode';

export class SnippetProvider {
    static register(context: vscode.ExtensionContext) {
        // Snippets are defined in JSON files and registered via package.json
        // This class can be used for dynamic snippet generation if needed
        
        const snippetCommand = vscode.commands.registerCommand(
            'autoqa.insertSnippet',
            async (snippetName: string) => {
                const editor = vscode.window.activeTextEditor;
                if (!editor) {
                    return;
                }

                const snippet = this.getSnippet(snippetName);
                if (snippet) {
                    await editor.insertSnippet(new vscode.SnippetString(snippet));
                }
            }
        );

        context.subscriptions.push(snippetCommand);
    }

    private static getSnippet(name: string): string | null {
        const snippets: Record<string, string> = {
            'login-test': `test('$1', async ({ page }) => {
  await page.goto('$2');
  await page.fill('[data-testid="email"]', '$3');
  await page.fill('[data-testid="password"]', '$4');
  await page.click('[data-testid="login-button"]');
  await expect(page).toHaveURL(/.*dashboard/);
});`,
            
            'form-test': `test('$1', async ({ page }) => {
  await page.goto('$2');
  await page.fill('[data-testid="$3"]', '$4');
  await page.click('[data-testid="submit-button"]');
  await expect(page.locator('[data-testid="success-message"]')).toBeVisible();
});`,
            
            'navigation-test': `test('$1', async ({ page }) => {
  await page.goto('$2');
  await page.click('[data-testid="$3"]');
  await expect(page).toHaveURL(/.*$4/);
});`
        };

        return snippets[name] || null;
    }
}