/**
 * XPath Strategy
 * Implements XPath fallback mechanisms for element location
 * Validates Requirements 4.2: XPath fallback and text content matching
 */

import { Page } from 'playwright';
import { HealingStrategy } from '@autoqa/database';
import {
  XPathStrategy,
  ElementSelector,
  ElementLocation,
  HealingContext,
  HealingResult,
  StrategyConfig
} from '../types';

export class XPathSelectorStrategy implements XPathStrategy {
  private config: StrategyConfig[HealingStrategy.XPATH];

  constructor(config?: Partial<StrategyConfig[HealingStrategy.XPATH]>) {
    this.config = {
      preferAbsolute: false,
      maxDepth: 10,
      includeText: true,
      ...config
    };
  }

  /**
   * Generate XPath alternatives for element location
   */
  generateXPath(element: ElementLocation): string[] {
    const xpaths: string[] = [];
    const { tagName = '', attributes = {}, textContent = '', parentPath = [] } = element;

    // Priority 1: XPath by unique attributes (ID, data-testid, etc.)
    if (attributes.id) {
      xpaths.push(`//*[@id='${this.escapeXPath(attributes.id)}']`);
      if (tagName) {
        xpaths.push(`//${tagName}[@id='${this.escapeXPath(attributes.id)}']`);
      }
    }

    // Test attributes
    for (const testAttr of ['data-testid', 'data-test', 'data-cy']) {
      if (attributes[testAttr]) {
        xpaths.push(`//*[@${testAttr}='${this.escapeXPath(attributes[testAttr])}']`);
        if (tagName) {
          xpaths.push(`//${tagName}[@${testAttr}='${this.escapeXPath(attributes[testAttr])}']`);
        }
      }
    }

    // Priority 2: XPath by name attribute
    if (attributes.name) {
      xpaths.push(`//*[@name='${this.escapeXPath(attributes.name)}']`);
      if (tagName) {
        xpaths.push(`//${tagName}[@name='${this.escapeXPath(attributes.name)}']`);
      }
    }

    // Priority 3: XPath by class (single and multiple)
    if (attributes.class) {
      const classes = attributes.class.split(/\s+/).filter(Boolean);
      
      // Single class
      classes.forEach(cls => {
        xpaths.push(`//*[@class='${this.escapeXPath(cls)}']`);
        xpaths.push(`//*[contains(@class, '${this.escapeXPath(cls)}')]`);
        if (tagName) {
          xpaths.push(`//${tagName}[@class='${this.escapeXPath(cls)}']`);
          xpaths.push(`//${tagName}[contains(@class, '${this.escapeXPath(cls)}')]`);
        }
      });

      // Multiple classes
      if (classes.length > 1) {
        const classConditions = classes.map(cls => `contains(@class, '${this.escapeXPath(cls)}')`).join(' and ');
        xpaths.push(`//*[${classConditions}]`);
        if (tagName) {
          xpaths.push(`//${tagName}[${classConditions}]`);
        }
      }
    }

    // Priority 4: XPath by text content
    if (this.config.includeText && textContent && textContent.trim()) {
      const trimmedText = textContent.trim();
      
      // Exact text match
      xpaths.push(`//*[text()='${this.escapeXPath(trimmedText)}']`);
      if (tagName) {
        xpaths.push(`//${tagName}[text()='${this.escapeXPath(trimmedText)}']`);
      }

      // Contains text
      xpaths.push(`//*[contains(text(), '${this.escapeXPath(trimmedText)}')]`);
      if (tagName) {
        xpaths.push(`//${tagName}[contains(text(), '${this.escapeXPath(trimmedText)}')]`);
      }

      // Normalize space (handles whitespace variations)
      xpaths.push(`//*[normalize-space(text())='${this.escapeXPath(trimmedText)}']`);
      if (tagName) {
        xpaths.push(`//${tagName}[normalize-space(text())='${this.escapeXPath(trimmedText)}']`);
      }

      // Partial text matches for longer text
      if (trimmedText.length > 10) {
        const words = trimmedText.split(/\s+/).filter(word => word.length > 3);
        words.slice(0, 3).forEach(word => {
          xpaths.push(`//*[contains(text(), '${this.escapeXPath(word)}')]`);
          if (tagName) {
            xpaths.push(`//${tagName}[contains(text(), '${this.escapeXPath(word)}')]`);
          }
        });
      }
    }

    // Priority 5: XPath by other attributes
    const importantAttrs = ['type', 'role', 'aria-label', 'title', 'alt', 'placeholder'];
    importantAttrs.forEach(attr => {
      if (attributes[attr]) {
        xpaths.push(`//*[@${attr}='${this.escapeXPath(attributes[attr])}']`);
        xpaths.push(`//*[contains(@${attr}, '${this.escapeXPath(attributes[attr])}')]`);
        if (tagName) {
          xpaths.push(`//${tagName}[@${attr}='${this.escapeXPath(attributes[attr])}']`);
        }
      }
    });

    // Priority 6: XPath by position and structure
    if (tagName) {
      // First/last of type
      xpaths.push(`//${tagName}[1]`);
      xpaths.push(`//${tagName}[last()]`);

      // Position-based with parent context
      if (parentPath.length > 0 && parentPath.length <= this.config.maxDepth) {
        const parentXPath = parentPath.join('/');
        xpaths.push(`/${parentXPath}/${tagName}`);
        xpaths.push(`/${parentXPath}/${tagName}[1]`);
        xpaths.push(`/${parentXPath}/${tagName}[last()]`);
      }
    }

    // Priority 7: Combination XPaths (attribute + text)
    if (textContent && attributes.class) {
      const trimmedText = textContent.trim();
      const classes = attributes.class.split(/\s+/).filter(Boolean);
      classes.forEach(cls => {
        xpaths.push(`//*[contains(@class, '${this.escapeXPath(cls)}') and contains(text(), '${this.escapeXPath(trimmedText)}')]`);
      });
    }

    // Priority 8: Following/preceding sibling approaches
    if (tagName) {
      xpaths.push(`//${tagName}/following-sibling::*[1]`);
      xpaths.push(`//${tagName}/preceding-sibling::*[1]`);
    }

    return this.removeDuplicates(xpaths);
  }

  /**
   * Optimize XPath by removing redundant parts and improving performance
   */
  optimizeXPath(xpath: string): string {
    let optimized = xpath;

    // Remove redundant wildcards
    optimized = optimized.replace(/\/\/\*\[/g, '//*[');
    
    // Simplify descendant selectors
    optimized = optimized.replace(/\/\/\*\/\//g, '//');
    
    // Use more specific selectors when possible
    optimized = optimized.replace(/\/\/\*\[@id=/g, '//*[@id=');
    
    // Remove unnecessary position predicates for unique attributes
    if (optimized.includes('@id=') || optimized.includes('@data-testid=')) {
      optimized = optimized.replace(/\[1\]$/, '');
    }

    return optimized;
  }

  /**
   * Validate if an XPath works on the current page
   */
  async validateXPath(page: Page, xpath: string): Promise<boolean> {
    try {
      const element = await page.locator(`xpath=${xpath}`).first();
      const count = await element.count();
      return count > 0;
    } catch (error) {
      return false;
    }
  }

  /**
   * Main healing method using XPath alternatives
   */
  async heal(context: HealingContext): Promise<HealingResult> {
    const startTime = Date.now();
    
    try {
      // Extract element information
      const elementLocation = await this.extractElementInfo(context);
      
      // Generate XPath alternatives
      const xpaths = this.generateXPath(elementLocation);
      
      if (xpaths.length === 0) {
        return {
          success: false,
          strategy: HealingStrategy.XPATH,
          confidence: 0,
          error: 'No XPath alternatives could be generated',
          metadata: { executionTime: Date.now() - startTime }
        };
      }

      // Try each XPath alternative
      for (const xpath of xpaths) {
        const optimizedXPath = this.optimizeXPath(xpath);
        const isValid = await this.validateXPath(context.page, optimizedXPath);
        
        if (isValid) {
          const confidence = this.calculateXPathConfidence(optimizedXPath, elementLocation);
          
          return {
            success: true,
            newSelector: optimizedXPath,
            strategy: HealingStrategy.XPATH,
            confidence,
            alternatives: xpaths.slice(0, 5).map(x => ({
              type: 'xpath' as const,
              value: this.optimizeXPath(x),
              confidence: this.calculateXPathConfidence(x, elementLocation)
            })),
            metadata: {
              executionTime: Date.now() - startTime,
              originalXPath: xpath,
              optimizedXPath,
              totalAlternatives: xpaths.length
            }
          };
        }
      }

      return {
        success: false,
        strategy: HealingStrategy.XPATH,
        confidence: 0,
        alternatives: xpaths.slice(0, 5).map(x => ({
          type: 'xpath' as const,
          value: this.optimizeXPath(x),
          confidence: this.calculateXPathConfidence(x, elementLocation)
        })),
        error: 'None of the generated XPath expressions matched any elements',
        metadata: {
          executionTime: Date.now() - startTime,
          totalAlternatives: xpaths.length
        }
      };

    } catch (error) {
      return {
        success: false,
        strategy: HealingStrategy.XPATH,
        confidence: 0,
        error: error instanceof Error ? error.message : 'Unknown error during XPath healing',
        metadata: { executionTime: Date.now() - startTime }
      };
    }
  }

  /**
   * Calculate confidence score for an XPath expression
   */
  private calculateXPathConfidence(xpath: string, element: ElementLocation): number {
    let confidence = 0.5; // Base confidence

    // ID-based XPaths get highest confidence
    if (xpath.includes('@id=')) {
      confidence = 0.95;
    }
    // Test attributes get high confidence
    else if (xpath.includes('@data-testid=') || xpath.includes('@data-test=')) {
      confidence = 0.90;
    }
    // Name attribute
    else if (xpath.includes('@name=')) {
      confidence = 0.85;
    }
    // Text-based XPaths
    else if (xpath.includes('text()=') || xpath.includes('normalize-space')) {
      confidence = 0.75;
    }
    // Class-based XPaths
    else if (xpath.includes('@class=') || xpath.includes('contains(@class')) {
      confidence = 0.70;
    }
    // Other attribute-based XPaths
    else if (xpath.includes('@')) {
      confidence = 0.65;
    }
    // Position-based XPaths (lower confidence)
    else if (xpath.includes('[1]') || xpath.includes('[last()]')) {
      confidence = 0.40;
    }

    // Reduce confidence for overly complex XPaths
    const complexity = (xpath.match(/\[/g) || []).length;
    if (complexity > 3) {
      confidence *= 0.8;
    }

    // Reduce confidence for absolute paths (brittle)
    if (xpath.startsWith('/html/')) {
      confidence *= 0.6;
    }

    return Math.min(confidence, 1.0);
  }

  /**
   * Extract element information from the current page context
   */
  private async extractElementInfo(context: HealingContext): Promise<ElementLocation> {
    const { page, originalSelector } = context;
    
    try {
      // Try CSS selector first, then XPath
      let element;
      if (originalSelector.startsWith('xpath=') || originalSelector.startsWith('//')) {
        const xpath = originalSelector.replace('xpath=', '');
        element = page.locator(`xpath=${xpath}`).first();
      } else {
        element = page.locator(originalSelector).first();
      }
      
      const count = await element.count();
      
      if (count > 0) {
        const [tagName, attributes, textContent, boundingBox] = await Promise.all([
          element.evaluate(el => el.tagName.toLowerCase()),
          element.evaluate(el => {
            const attrs: Record<string, string> = {};
            for (const attr of el.attributes) {
              attrs[attr.name] = attr.value;
            }
            return attrs;
          }),
          element.textContent(),
          element.boundingBox()
        ]);

        return {
          selectors: [{ type: 'xpath', value: originalSelector }],
          tagName,
          attributes,
          textContent: textContent || undefined,
          boundingBox: boundingBox || undefined
        };
      }
    } catch (error) {
      // Original selector failed
    }

    // Fallback to context information
    if (context.lastKnownLocation) {
      return context.lastKnownLocation;
    }

    return {
      selectors: [{ type: 'xpath', value: originalSelector }],
      tagName: context.elementType || 'div',
      attributes: {}
    };
  }

  /**
   * Escape special characters in XPath expressions
   */
  private escapeXPath(value: string): string {
    // Handle quotes in XPath values
    if (value.includes("'") && value.includes('"')) {
      // Use concat() for strings containing both single and double quotes
      const parts = value.split("'");
      return `concat('${parts.join("', \"'\", '")}')`;
    } else if (value.includes("'")) {
      return `"${value}"`;
    } else {
      return `'${value}'`;
    }
  }

  /**
   * Remove duplicate XPath expressions
   */
  private removeDuplicates(xpaths: string[]): string[] {
    return [...new Set(xpaths)];
  }
}