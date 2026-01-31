/**
 * Text Content Strategy
 * Implements text content matching algorithms for element location
 * Validates Requirements 4.2: XPath fallback and text content matching
 */

import { Page, Locator } from 'playwright';
import { HealingStrategy } from '@autoqa/database';
import * as fuzzysort from 'fuzzysort';
import * as leven from 'leven';
import {
  TextContentStrategy,
  TextMatchOptions,
  ElementLocation,
  HealingContext,
  HealingResult,
  StrategyConfig,
  ElementSelector
} from '../types';

export class TextContentMatchingStrategy implements TextContentStrategy {
  private config: StrategyConfig[HealingStrategy.TEXT_CONTENT];

  constructor(config?: Partial<StrategyConfig[HealingStrategy.TEXT_CONTENT]>) {
    this.config = {
      fuzzyThreshold: 0.6,
      maxDistance: 3,
      caseSensitive: false,
      ...config
    };
  }

  /**
   * Find elements by exact or fuzzy text match
   */
  async findByText(page: Page, text: string, options?: TextMatchOptions): Promise<Locator[]> {
    const opts = { ...this.config, ...options };
    const locators: Locator[] = [];

    try {
      // Exact text match
      if (opts.exact) {
        const exactMatch = page.locator(`text=${opts.caseSensitive ? text : text.toLowerCase()}`);
        const count = await exactMatch.count();
        if (count > 0) {
          for (let i = 0; i < count; i++) {
            locators.push(exactMatch.nth(i));
          }
        }
      } else {
        // Fuzzy text matching using multiple strategies
        const candidates = await this.getAllTextElements(page);
        const matches = this.findFuzzyMatches(text, candidates, opts);
        
        for (const match of matches) {
          const locator = page.locator(`text=${match.text}`).first();
          const count = await locator.count();
          if (count > 0) {
            locators.push(locator);
          }
        }
      }
    } catch (error) {
      console.warn('Error in findByText:', error);
    }

    return locators;
  }

  /**
   * Find elements by partial text match
   */
  async findByPartialText(page: Page, partialText: string, options?: TextMatchOptions): Promise<Locator[]> {
    const opts = { ...this.config, ...options };
    const locators: Locator[] = [];

    try {
      // Direct partial text search
      const searchText = opts.caseSensitive ? partialText : partialText.toLowerCase();
      const partialMatch = page.locator(`text*=${searchText}`);
      const count = await partialMatch.count();
      
      if (count > 0) {
        for (let i = 0; i < count; i++) {
          locators.push(partialMatch.nth(i));
        }
      }

      // Additional fuzzy partial matching
      if (locators.length === 0) {
        const candidates = await this.getAllTextElements(page);
        const partialMatches = candidates.filter(candidate => {
          const candidateText = opts.caseSensitive ? candidate.text : candidate.text.toLowerCase();
          const searchTextLower = opts.caseSensitive ? partialText : partialText.toLowerCase();
          
          return candidateText.includes(searchTextLower) ||
                 this.calculateTextSimilarity(candidateText, searchTextLower) >= opts.fuzzyThreshold;
        });

        for (const match of partialMatches) {
          const locator = page.locator(`text=${match.text}`).first();
          const count = await locator.count();
          if (count > 0) {
            locators.push(locator);
          }
        }
      }
    } catch (error) {
      console.warn('Error in findByPartialText:', error);
    }

    return locators;
  }

  /**
   * Calculate text similarity using multiple algorithms
   */
  calculateTextSimilarity(text1: string, text2: string): number {
    if (!text1 || !text2) return 0;

    const t1 = text1.trim().toLowerCase();
    const t2 = text2.trim().toLowerCase();

    if (t1 === t2) return 1.0;

    // Use multiple similarity algorithms and take the best score
    const similarities: number[] = [];

    // 1. Levenshtein distance similarity
    const levenDistance = leven(t1, t2);
    const maxLength = Math.max(t1.length, t2.length);
    const levenSimilarity = maxLength > 0 ? 1 - (levenDistance / maxLength) : 0;
    similarities.push(levenSimilarity);

    // 2. Fuzzy string matching using fuzzysort
    const fuzzyResult = fuzzysort.single(t1, t2);
    if (fuzzyResult) {
      const fuzzyScore = fuzzyResult.score;
      // Convert fuzzysort score (negative, lower is better) to similarity (0-1, higher is better)
      const fuzzySimilarity = Math.max(0, 1 + (fuzzyScore / 1000));
      similarities.push(fuzzySimilarity);
    }

    // 3. Jaccard similarity (word-based)
    const words1 = new Set(t1.split(/\s+/));
    const words2 = new Set(t2.split(/\s+/));
    const intersection = new Set([...words1].filter(word => words2.has(word)));
    const union = new Set([...words1, ...words2]);
    const jaccardSimilarity = union.size > 0 ? intersection.size / union.size : 0;
    similarities.push(jaccardSimilarity);

    // 4. Longest common subsequence similarity
    const lcs = this.longestCommonSubsequence(t1, t2);
    const lcsSimilarity = maxLength > 0 ? lcs.length / maxLength : 0;
    similarities.push(lcsSimilarity);

    // Return the maximum similarity score
    return Math.max(...similarities);
  }

  /**
   * Main healing method using text content matching
   */
  async heal(context: HealingContext): Promise<HealingResult> {
    const startTime = Date.now();
    
    try {
      // Extract element information
      const elementLocation = await this.extractElementInfo(context);
      
      if (!elementLocation.textContent) {
        return {
          success: false,
          strategy: HealingStrategy.TEXT_CONTENT,
          confidence: 0,
          error: 'No text content available for matching',
          metadata: { executionTime: Date.now() - startTime }
        };
      }

      const originalText = elementLocation.textContent.trim();
      const alternatives: ElementSelector[] = [];

      // Strategy 1: Exact text match
      const exactMatches = await this.findByText(context.page, originalText, { exact: true });
      if (exactMatches.length > 0) {
        alternatives.push({
          type: 'text',
          value: `text=${originalText}`,
          confidence: 0.95,
          metadata: { strategy: 'exact-text', matchCount: exactMatches.length }
        });
      }

      // Strategy 2: Case-insensitive exact match
      const caseInsensitiveMatches = await this.findByText(context.page, originalText, { 
        exact: true, 
        caseSensitive: false 
      });
      if (caseInsensitiveMatches.length > 0) {
        alternatives.push({
          type: 'text',
          value: `text=${originalText}`,
          confidence: 0.90,
          metadata: { strategy: 'case-insensitive-exact', matchCount: caseInsensitiveMatches.length }
        });
      }

      // Strategy 3: Partial text match
      if (originalText.length > 5) {
        const partialMatches = await this.findByPartialText(context.page, originalText);
        if (partialMatches.length > 0) {
          alternatives.push({
            type: 'text',
            value: `text*=${originalText}`,
            confidence: 0.80,
            metadata: { strategy: 'partial-text', matchCount: partialMatches.length }
          });
        }
      }

      // Strategy 4: Word-based matching
      const words = originalText.split(/\s+/).filter(word => word.length > 2);
      for (const word of words.slice(0, 3)) { // Try first 3 significant words
        const wordMatches = await this.findByPartialText(context.page, word);
        if (wordMatches.length > 0) {
          const similarity = this.calculateTextSimilarity(word, originalText);
          alternatives.push({
            type: 'text',
            value: `text*=${word}`,
            confidence: Math.max(0.60, similarity * 0.8),
            metadata: { strategy: 'word-match', word, matchCount: wordMatches.length }
          });
        }
      }

      // Strategy 5: Fuzzy text matching
      const allTextElements = await this.getAllTextElements(context.page);
      const fuzzyMatches = this.findFuzzyMatches(originalText, allTextElements, {
        fuzzyThreshold: this.config.fuzzyThreshold,
        caseSensitive: this.config.caseSensitive
      });

      for (const match of fuzzyMatches.slice(0, 3)) {
        alternatives.push({
          type: 'text',
          value: `text=${match.text}`,
          confidence: match.similarity * 0.75, // Reduce confidence for fuzzy matches
          metadata: { 
            strategy: 'fuzzy-match', 
            similarity: match.similarity,
            originalText: originalText,
            matchedText: match.text
          }
        });
      }

      // Strategy 6: XPath with text content
      alternatives.push({
        type: 'xpath',
        value: `//*[contains(text(), '${this.escapeXPath(originalText)}')]`,
        confidence: 0.75,
        metadata: { strategy: 'xpath-contains-text' }
      });

      alternatives.push({
        type: 'xpath',
        value: `//*[normalize-space(text())='${this.escapeXPath(originalText)}']`,
        confidence: 0.80,
        metadata: { strategy: 'xpath-normalize-text' }
      });

      // Sort alternatives by confidence
      alternatives.sort((a, b) => (b.confidence || 0) - (a.confidence || 0));

      if (alternatives.length === 0) {
        return {
          success: false,
          strategy: HealingStrategy.TEXT_CONTENT,
          confidence: 0,
          error: 'No text-based alternatives could be generated',
          metadata: { executionTime: Date.now() - startTime }
        };
      }

      // Try each alternative
      for (const alternative of alternatives) {
        const isValid = await this.validateTextSelector(context.page, alternative.value);
        
        if (isValid) {
          return {
            success: true,
            newSelector: alternative.value,
            strategy: HealingStrategy.TEXT_CONTENT,
            confidence: alternative.confidence || 0.5,
            alternatives: alternatives.slice(0, 5),
            metadata: {
              executionTime: Date.now() - startTime,
              selectedStrategy: alternative.metadata?.strategy,
              originalText,
              totalAlternatives: alternatives.length
            }
          };
        }
      }

      return {
        success: false,
        strategy: HealingStrategy.TEXT_CONTENT,
        confidence: 0,
        alternatives: alternatives.slice(0, 5),
        error: 'None of the text-based selectors matched any elements',
        metadata: {
          executionTime: Date.now() - startTime,
          originalText,
          totalAlternatives: alternatives.length
        }
      };

    } catch (error) {
      return {
        success: false,
        strategy: HealingStrategy.TEXT_CONTENT,
        confidence: 0,
        error: error instanceof Error ? error.message : 'Unknown error during text content healing',
        metadata: { executionTime: Date.now() - startTime }
      };
    }
  }

  /**
   * Get all text-containing elements from the page
   */
  private async getAllTextElements(page: Page): Promise<Array<{ text: string; element: any }>> {
    try {
      return await page.evaluate(() => {
        const elements: Array<{ text: string; element: any }> = [];
        const walker = document.createTreeWalker(
          document.body,
          NodeFilter.SHOW_ELEMENT,
          {
            acceptNode: (node: Element) => {
              const text = node.textContent?.trim();
              return text && text.length > 0 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
            }
          }
        );

        let node;
        while (node = walker.nextNode()) {
          const element = node as Element;
          const text = element.textContent?.trim();
          if (text && text.length > 0) {
            elements.push({ text, element: null }); // Can't serialize DOM elements
          }
        }

        return elements;
      });
    } catch (error) {
      console.warn('Error getting text elements:', error);
      return [];
    }
  }

  /**
   * Find fuzzy matches for text content
   */
  private findFuzzyMatches(
    targetText: string, 
    candidates: Array<{ text: string; element: any }>,
    options: TextMatchOptions
  ): Array<{ text: string; similarity: number }> {
    const matches: Array<{ text: string; similarity: number }> = [];
    const threshold = options.fuzzyThreshold || this.config.fuzzyThreshold;

    for (const candidate of candidates) {
      const similarity = this.calculateTextSimilarity(targetText, candidate.text);
      if (similarity >= threshold) {
        matches.push({ text: candidate.text, similarity });
      }
    }

    // Sort by similarity (highest first)
    return matches.sort((a, b) => b.similarity - a.similarity);
  }

  /**
   * Validate if a text-based selector works
   */
  private async validateTextSelector(page: Page, selector: string): Promise<boolean> {
    try {
      let locator;
      
      if (selector.startsWith('xpath=') || selector.startsWith('//')) {
        const xpath = selector.replace('xpath=', '');
        locator = page.locator(`xpath=${xpath}`);
      } else if (selector.startsWith('text=') || selector.startsWith('text*=')) {
        locator = page.locator(selector);
      } else {
        locator = page.locator(selector);
      }
      
      const count = await locator.count();
      return count > 0;
    } catch (error) {
      return false;
    }
  }

  /**
   * Extract element information from context
   */
  private async extractElementInfo(context: HealingContext): Promise<ElementLocation> {
    if (context.lastKnownLocation?.textContent) {
      return context.lastKnownLocation;
    }

    // Try to extract from original selector if it still works
    try {
      const element = context.page.locator(context.originalSelector).first();
      const count = await element.count();
      
      if (count > 0) {
        const textContent = await element.textContent();
        return {
          selectors: [{ type: 'css', value: context.originalSelector }],
          textContent: textContent || undefined,
          tagName: context.elementType,
          attributes: {}
        };
      }
    } catch (error) {
      // Ignore error, use fallback
    }

    return {
      selectors: [{ type: 'css', value: context.originalSelector }],
      textContent: undefined,
      tagName: context.elementType,
      attributes: {}
    };
  }

  /**
   * Calculate longest common subsequence
   */
  private longestCommonSubsequence(str1: string, str2: string): string {
    const m = str1.length;
    const n = str2.length;
    const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (str1[i - 1] === str2[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1] + 1;
        } else {
          dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
      }
    }

    // Reconstruct LCS
    let lcs = '';
    let i = m, j = n;
    while (i > 0 && j > 0) {
      if (str1[i - 1] === str2[j - 1]) {
        lcs = str1[i - 1] + lcs;
        i--;
        j--;
      } else if (dp[i - 1][j] > dp[i][j - 1]) {
        i--;
      } else {
        j--;
      }
    }

    return lcs;
  }

  /**
   * Escape special characters for XPath
   */
  private escapeXPath(value: string): string {
    if (value.includes("'") && value.includes('"')) {
      const parts = value.split("'");
      return `concat('${parts.join("', \"'\", '")}')`;
    } else if (value.includes("'")) {
      return `"${value}"`;
    } else {
      return `'${value}'`;
    }
  }
}