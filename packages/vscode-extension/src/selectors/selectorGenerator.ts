import * as vscode from 'vscode';
import { chromium, Browser, Page } from 'playwright';

interface ElementInfo {
    tagName: string;
    id?: string;
    className?: string;
    text?: string;
    testId?: string;
    attributes: Record<string, string>;
    xpath: string;
}

export class PlaywrightSelectorGenerator {
    private browser: Browser | null = null;
    private page: Page | null = null;

    async generateInteractive(): Promise<string | null> {
        const url = await vscode.window.showInputBox({
            prompt: 'Enter URL to generate selector from',
            placeHolder: 'https://example.com',
            value: 'https://example.com'
        });

        if (!url) {
            return null;
        }

        try {
            await this.initializeBrowser();
            if (!this.page) {
                throw new Error('Failed to initialize browser');
            }

            await this.page.goto(url);
            
            vscode.window.showInformationMessage(
                'Click on any element in the browser to generate its selector. Press Ctrl+C to cancel.'
            );

            const selector = await this.waitForElementSelection();
            await this.cleanup();

            return selector;
        } catch (error) {
            await this.cleanup();
            throw error;
        }
    }

    private async initializeBrowser(): Promise<void> {
        this.browser = await chromium.launch({ 
            headless: false,
            args: ['--disable-web-security', '--disable-features=VizDisplayCompositor']
        });
        
        const context = await this.browser.newContext();
        this.page = await context.newPage();

        // Inject selector generation script
        await this.page.addInitScript(() => {
            let isSelecting = false;
            let highlightedElement: HTMLElement | null = null;

            function highlightElement(element: HTMLElement) {
                if (highlightedElement) {
                    highlightedElement.style.outline = '';
                }
                
                element.style.outline = '2px solid #007acc';
                highlightedElement = element;
            }

            function removeHighlight() {
                if (highlightedElement) {
                    highlightedElement.style.outline = '';
                    highlightedElement = null;
                }
            }

            function getElementInfo(element: HTMLElement) {
                const rect = element.getBoundingClientRect();
                const attributes: Record<string, string> = {};
                
                for (let i = 0; i < element.attributes.length; i++) {
                    const attr = element.attributes[i];
                    attributes[attr.name] = attr.value;
                }

                return {
                    tagName: element.tagName.toLowerCase(),
                    id: element.id || undefined,
                    className: element.className || undefined,
                    text: element.textContent?.trim().slice(0, 50) || undefined,
                    testId: element.getAttribute('data-testid') || undefined,
                    attributes,
                    xpath: getXPath(element),
                    rect: {
                        x: rect.x,
                        y: rect.y,
                        width: rect.width,
                        height: rect.height
                    }
                };
            }

            function getXPath(element: HTMLElement): string {
                if (element.id) {
                    return `//*[@id="${element.id}"]`;
                }
                
                let path = '';
                let current: Element | null = element;
                
                while (current && current.nodeType === Node.ELEMENT_NODE) {
                    let selector = current.nodeName.toLowerCase();
                    
                    if (current.id) {
                        selector += `[@id="${current.id}"]`;
                        path = '//' + selector + path;
                        break;
                    } else {
                        let sibling = current.previousElementSibling;
                        let nth = 1;
                        
                        while (sibling) {
                            if (sibling.nodeName.toLowerCase() === selector) {
                                nth++;
                            }
                            sibling = sibling.previousElementSibling;
                        }
                        
                        if (nth > 1) {
                            selector += `[${nth}]`;
                        }
                    }
                    
                    path = '/' + selector + path;
                    current = current.parentElement;
                }
                
                return path;
            }

            document.addEventListener('mouseover', (e) => {
                if (isSelecting && e.target instanceof HTMLElement) {
                    highlightElement(e.target);
                }
            });

            document.addEventListener('click', (e) => {
                if (isSelecting && e.target instanceof HTMLElement) {
                    e.preventDefault();
                    e.stopPropagation();
                    
                    const elementInfo = getElementInfo(e.target);
                    console.log('AUTOQA_ELEMENT_SELECTED:', JSON.stringify(elementInfo));
                    
                    removeHighlight();
                    isSelecting = false;
                }
            });

            // Start selection mode
            setTimeout(() => {
                isSelecting = true;
                document.body.style.cursor = 'crosshair';
            }, 1000);
        });
    }

    private async waitForElementSelection(): Promise<string> {
        return new Promise((resolve, reject) => {
            if (!this.page) {
                reject(new Error('Page not initialized'));
                return;
            }

            const timeout = setTimeout(() => {
                reject(new Error('Selection timeout'));
            }, 60000); // 1 minute timeout

            this.page.on('console', (msg) => {
                const text = msg.text();
                if (text.startsWith('AUTOQA_ELEMENT_SELECTED:')) {
                    clearTimeout(timeout);
                    
                    try {
                        const elementInfo: ElementInfo = JSON.parse(
                            text.replace('AUTOQA_ELEMENT_SELECTED:', '')
                        );
                        
                        const selector = this.generateOptimalSelector(elementInfo);
                        resolve(selector);
                    } catch (error) {
                        reject(error);
                    }
                }
            });
        });
    }

    private generateOptimalSelector(element: ElementInfo): string {
        // Priority order for selector generation
        const selectors = [
            this.generateTestIdSelector(element),
            this.generateIdSelector(element),
            this.generateClassSelector(element),
            this.generateTextSelector(element),
            this.generateAttributeSelector(element),
            this.generateXPathSelector(element)
        ].filter(Boolean);

        // Return the first (most reliable) selector
        return selectors[0] || `${element.tagName}`;
    }

    private generateTestIdSelector(element: ElementInfo): string | null {
        if (element.testId) {
            return `[data-testid="${element.testId}"]`;
        }
        return null;
    }

    private generateIdSelector(element: ElementInfo): string | null {
        if (element.id) {
            return `#${element.id}`;
        }
        return null;
    }

    private generateClassSelector(element: ElementInfo): string | null {
        if (element.className && !element.className.includes(' ')) {
            // Only use single class names to avoid brittle selectors
            return `.${element.className}`;
        }
        return null;
    }

    private generateTextSelector(element: ElementInfo): string | null {
        if (element.text && element.text.length > 0 && element.text.length < 30) {
            // Use text selector for buttons, links, etc.
            if (['button', 'a', 'span'].includes(element.tagName)) {
                return `${element.tagName}:has-text("${element.text}")`;
            }
        }
        return null;
    }

    private generateAttributeSelector(element: ElementInfo): string | null {
        // Look for meaningful attributes
        const meaningfulAttrs = ['name', 'type', 'role', 'aria-label'];
        
        for (const attr of meaningfulAttrs) {
            if (element.attributes[attr]) {
                return `[${attr}="${element.attributes[attr]}"]`;
            }
        }
        
        return null;
    }

    private generateXPathSelector(element: ElementInfo): string {
        return element.xpath;
    }

    private async cleanup(): Promise<void> {
        try {
            if (this.page) {
                await this.page.close();
                this.page = null;
            }
            
            if (this.browser) {
                await this.browser.close();
                this.browser = null;
            }
        } catch (error) {
            console.error('Cleanup error:', error);
        }
    }
}