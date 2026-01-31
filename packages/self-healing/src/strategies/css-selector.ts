/**
 * CSS Selector Strategy
 * Implements CSS selector alternatives including ID, class, and attribute-based selectors
 * Validates Requirements 4.1: CSS selector alternatives and fallback mechanisms
 */

import { Page } from 'playwright';
import { HealingStrategy } from '@autoqa/database';
import {
  CSSStrategy,
  ElementSelector,
  ElementLocation,
  HealingContext,
  HealingResult,
  StrategyConfig,
  ElementNotFoundError
} from '../types';

export class CSSelectorStrategy implements CSSStrategy {
  private config: StrategyConfig[HealingStrategy.CSS_SELECTOR];

  constructor(config?: Partial<StrategyConfig[HealingStrategy.CSS_SELECTOR]>) {
    this.config = {
      prioritizeId: true,
      prioritizeClass: true,
      includeAttributes: ['data-testid', 'data-test', 'name', 'type', 'role', 'aria-label'],
      excludeAttributes: ['style', 'onclick', 'onchange'],
      ...config
    };
  }

  /**
   * Generate alternative CSS selectors based on element properties
   */
  generateAlternatives(element: ElementLocation): ElementSelector[] {
    const alternatives: ElementSelector[] = [];
    const { attributes = {}, tagName = '', textContent = '' } = element;

    // Priority 1: ID selector (highest confidence)
    if (this.config.prioritizeId && attributes.id) {
      alternatives.push({
        type: 'css',
        value: `#${this.escapeSelector(attributes.id)}`,
        confidence: 0.95,
        metadata: { strategy: 'id', attribute: 'id' }
      });
    }

    // Priority 2: data-testid and similar test attributes
    for (const testAttr of ['data-testid', 'data-test', 'data-cy']) {
      if (attributes[testAttr]) {
        alternatives.push({
          type: 'css',
          value: `[${testAttr}="${this.escapeSelector(attributes[testAttr])}"]`,
          confidence: 0.90,
          metadata: { strategy: 'test-attribute', attribute: testAttr }
        });
      }
    }

    // Priority 3: Class selectors (with combinations)
    if (this.config.prioritizeClass && attributes.class) {
      const classes = attributes.class.split(/\s+/).filter(Boolean);
      
      // Single class selectors
      classes.forEach(cls => {
        alternatives.push({
          type: 'css',
          value: `.${this.escapeSelector(cls)}`,
          confidence: 0.70,
          metadata: { strategy: 'single-class', class: cls }
        });
      });

      // Combined class selectors (higher confidence)
      if (classes.length > 1) {
        const combinedClasses = classes.map(cls => `.${this.escapeSelector(cls)}`).join('');
        alternatives.push({
          type: 'css',
          value: combinedClasses,
          confidence: 0.80,
          metadata: { strategy: 'combined-classes', classes }
        });
      }

      // Tag + class combinations
      if (tagName) {
        classes.forEach(cls => {
          alternatives.push({
            type: 'css',
            value: `${tagName}.${this.escapeSelector(cls)}`,
            confidence: 0.75,
            metadata: { strategy: 'tag-class', tag: tagName, class: cls }
          });
        });
      }
    }

    // Priority 4: Attribute selectors
    this.config.includeAttributes.forEach(attr => {
      if (attributes[attr] && !this.config.excludeAttributes.includes(attr)) {
        const value = attributes[attr];
        
        // Exact attribute match
        alternatives.push({
          type: 'css',
          value: `[${attr}="${this.escapeSelector(value)}"]`,
          confidence: 0.85,
          metadata: { strategy: 'attribute-exact', attribute: attr }
        });

        // Partial attribute match (contains)
        if (value.length > 3) {
          alternatives.push({
            type: 'css',
            value: `[${attr}*="${this.escapeSelector(value)}"]`,
            confidence: 0.65,
            metadata: { strategy: 'attribute-contains', attribute: attr }
          });
        }

        // Tag + attribute combinations
        if (tagName) {
          alternatives.push({
            type: 'css',
            value: `${tagName}[${attr}="${this.escapeSelector(value)}"]`,
            confidence: 0.80,
            metadata: { strategy: 'tag-attribute', tag: tagName, attribute: attr }
          });
        }
      }
    });

    // Priority 5: Name attribute (for form elements)
    if (attributes.name) {
      alternatives.push({
        type: 'css',
        value: `[name="${this.escapeSelector(attributes.name)}"]`,
        confidence: 0.85,
        metadata: { strategy: 'name-attribute' }
      });

      if (tagName) {
        alternatives.push({
          type: 'css',
          value: `${tagName}[name="${this.escapeSelector(attributes.name)}"]`,
          confidence: 0.88,
          metadata: { strategy: 'tag-name' }
        });
      }
    }

    // Priority 6: Type attribute (for input elements)
    if (attributes.type && tagName === 'input') {
      alternatives.push({
        type: 'css',
        value: `input[type="${attributes.type}"]`,
        confidence: 0.60,
        metadata: { strategy: 'input-type' }
      });
    }

    // Priority 7: ARIA attributes
    const ariaAttributes = Object.keys(attributes).filter(key => key.startsWith('aria-'));
    ariaAttributes.forEach(ariaAttr => {
      alternatives.push({
        type: 'css',
        value: `[${ariaAttr}="${this.escapeSelector(attributes[ariaAttr])}"]`,
        confidence: 0.75,
        metadata: { strategy: 'aria-attribute', attribute: ariaAttr }
      });
    });

    // Priority 8: Tag-based selectors with position
    if (tagName && element.parentPath) {
      const parentSelector = element.parentPath.join(' > ');
      alternatives.push({
        type: 'css',
        value: `${parentSelector} > ${tagName}`,
        confidence: 0.50,
        metadata: { strategy: 'parent-child', parentPath: element.parentPath }
      });
    }

    // Priority 9: nth-child selectors (lower confidence)
    if (tagName) {
      alternatives.push({
        type: 'css',
        value: `${tagName}:first-child`,
        confidence: 0.30,
        metadata: { strategy: 'first-child' }
      });

      alternatives.push({
        type: 'css',
        value: `${tagName}:last-child`,
        confidence: 0.30,
        metadata: { strategy: 'last-child' }
      });
    }

    // Sort by confidence (highest first)
    return alternatives.sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
  }

  /**
   * Validate if a CSS selector works on the current page
   */
  async validateSelector(page: Page, selector: string): Promise<boolean> {
    try {
      const element = await page.locator(selector).first();
      const count = await element.count();
      return count > 0;
    } catch (error) {
      return false;
    }
  }

  /**
   * Calculate confidence score for a selector based on element properties
   */
  calculateConfidence(selector: string, element: ElementLocation): number {
    let confidence = 0.5; // Base confidence

    // ID selectors get highest confidence
    if (selector.startsWith('#')) {
      confidence = 0.95;
    }
    // Test attributes get high confidence
    else if (selector.includes('data-testid') || selector.includes('data-test')) {
      confidence = 0.90;
    }
    // Class selectors
    else if (selector.includes('.')) {
      const classCount = (selector.match(/\./g) || []).length;
      confidence = Math.min(0.80, 0.60 + (classCount * 0.10));
    }
    // Attribute selectors
    else if (selector.includes('[') && selector.includes(']')) {
      confidence = 0.75;
    }
    // Tag selectors
    else if (element.tagName && selector.includes(element.tagName)) {
      confidence = 0.60;
    }

    return Math.min(confidence, 1.0);
  }

  /**
   * Main healing method using CSS selector alternatives
   */
  async heal(context: HealingContext): Promise<HealingResult> {
    const startTime = Date.now();
    
    try {
      // Extract element information from the page
      const elementLocation = await this.extractElementInfo(context);
      
      // Generate alternative selectors
      const alternatives = this.generateAlternatives(elementLocation);
      
      if (alternatives.length === 0) {
        return {
          success: false,
          strategy: HealingStrategy.CSS_SELECTOR,
          confidence: 0,
          error: 'No alternative CSS selectors could be generated',
          metadata: { executionTime: Date.now() - startTime }
        };
      }

      // Try each alternative selector
      for (const alternative of alternatives) {
        const isValid = await this.validateSelector(context.page, alternative.value);
        
        if (isValid) {
          return {
            success: true,
            newSelector: alternative.value,
            strategy: HealingStrategy.CSS_SELECTOR,
            confidence: alternative.confidence || 0.5,
            alternatives: alternatives.slice(0, 5), // Return top 5 alternatives
            metadata: {
              executionTime: Date.now() - startTime,
              selectedStrategy: alternative.metadata?.strategy,
              totalAlternatives: alternatives.length
            }
          };
        }
      }

      return {
        success: false,
        strategy: HealingStrategy.CSS_SELECTOR,
        confidence: 0,
        alternatives: alternatives.slice(0, 5),
        error: 'None of the generated CSS selectors matched any elements',
        metadata: {
          executionTime: Date.now() - startTime,
          totalAlternatives: alternatives.length
        }
      };

    } catch (error) {
      return {
        success: false,
        strategy: HealingStrategy.CSS_SELECTOR,
        confidence: 0,
        error: error instanceof Error ? error.message : 'Unknown error during CSS healing',
        metadata: { executionTime: Date.now() - startTime }
      };
    }
  }

  /**
   * Extract element information from the current page context
   */
  private async extractElementInfo(context: HealingContext): Promise<ElementLocation> {
    const { page, originalSelector } = context;
    
    try {
      // Try to get element info from the original selector first
      const element = page.locator(originalSelector).first();
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
          selectors: [{ type: 'css', value: originalSelector }],
          tagName,
          attributes,
          textContent: textContent || undefined,
          boundingBox: boundingBox || undefined
        };
      }
    } catch (error) {
      // Original selector failed, try to extract from context
    }

    // If original selector fails, try to extract from last known location or DOM snapshot
    if (context.lastKnownLocation) {
      return context.lastKnownLocation;
    }

    // Fallback: return minimal element info
    return {
      selectors: [{ type: 'css', value: originalSelector }],
      tagName: context.elementType || 'div',
      attributes: {}
    };
  }

  /**
   * Escape special characters in CSS selectors
   */
  private escapeSelector(value: string): string {
    return value.replace(/[!"#$%&'()*+,.\/:;<=>?@[\\\]^`{|}~]/g, '\\$&');
  }
}