/**
 * Structural Analysis Strategy
 * Implements structural element analysis for element location
 * Validates Requirements 4.1, 4.2: CSS selector alternatives and structural analysis
 */

import { Page } from 'playwright';
import { HealingStrategy } from '@autoqa/database';
import {
  StructuralAnalysisStrategy,
  StructuralInfo,
  ElementLocation,
  HealingContext,
  HealingResult,
  StrategyConfig,
  ElementSelector
} from '../types';

export class StructuralElementAnalysis implements StructuralAnalysisStrategy {
  private config: StrategyConfig[HealingStrategy.STRUCTURAL_ANALYSIS];

  constructor(config?: Partial<StrategyConfig[HealingStrategy.STRUCTURAL_ANALYSIS]>) {
    this.config = {
      includeStyles: false,
      maxParentDepth: 5,
      weightAttributes: {
        'id': 1.0,
        'data-testid': 0.95,
        'data-test': 0.95,
        'class': 0.8,
        'name': 0.85,
        'type': 0.7,
        'role': 0.75,
        'aria-label': 0.75
      },
      ...config
    };
  }

  /**
   * Analyze the structural properties of an element
   */
  async analyzeElementStructure(page: Page, selector: string): Promise<StructuralInfo> {
    try {
      const element = page.locator(selector).first();
      const count = await element.count();
      
      if (count === 0) {
        throw new Error(`Element not found: ${selector}`);
      }

      // Extract comprehensive structural information
      const structuralInfo = await element.evaluate((el, config) => {
        const info: StructuralInfo = {
          tagName: el.tagName.toLowerCase(),
          attributes: {},
          parentChain: [],
          siblingIndex: 0,
          childCount: el.children.length,
          textContent: el.textContent?.trim() || undefined
        };

        // Extract all attributes
        for (const attr of el.attributes) {
          info.attributes[attr.name] = attr.value;
        }

        // Build parent chain up to maxParentDepth
        let current = el.parentElement;
        let depth = 0;
        while (current && depth < config.maxParentDepth) {
          let parentSelector = current.tagName.toLowerCase();
          
          // Add identifying attributes to parent selector
          if (current.id) {
            parentSelector += `#${current.id}`;
          } else if (current.className) {
            const classes = current.className.split(/\s+/).filter(Boolean);
            if (classes.length > 0) {
              parentSelector += `.${classes[0]}`; // Use first class
            }
          }
          
          info.parentChain.unshift(parentSelector);
          current = current.parentElement;
          depth++;
        }

        // Calculate sibling index
        if (el.parentElement) {
          const siblings = Array.from(el.parentElement.children).filter(
            child => child.tagName === el.tagName
          );
          info.siblingIndex = siblings.indexOf(el);
        }

        // Extract computed styles if enabled
        if (config.includeStyles) {
          const computedStyles = window.getComputedStyle(el);
          info.computedStyles = {
            display: computedStyles.display,
            position: computedStyles.position,
            visibility: computedStyles.visibility,
            opacity: computedStyles.opacity,
            zIndex: computedStyles.zIndex
          };
        }

        return info;
      }, this.config);

      return structuralInfo;
    } catch (error) {
      throw new Error(`Failed to analyze element structure: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Find elements with similar structural properties
   */
  async findBySimilarStructure(page: Page, structure: StructuralInfo): Promise<ElementLocation[]> {
    try {
      const candidates = await page.evaluate((targetStructure, config) => {
        const results: ElementLocation[] = [];
        
        // Get all elements of the same tag type
        const elements = document.querySelectorAll(targetStructure.tagName);
        
        for (const element of elements) {
          const candidateStructure: StructuralInfo = {
            tagName: element.tagName.toLowerCase(),
            attributes: {},
            parentChain: [],
            siblingIndex: 0,
            childCount: element.children.length,
            textContent: element.textContent?.trim() || undefined
          };

          // Extract attributes
          for (const attr of element.attributes) {
            candidateStructure.attributes[attr.name] = attr.value;
          }

          // Build parent chain
          let current = element.parentElement;
          let depth = 0;
          while (current && depth < config.maxParentDepth) {
            let parentSelector = current.tagName.toLowerCase();
            if (current.id) {
              parentSelector += `#${current.id}`;
            } else if (current.className) {
              const classes = current.className.split(/\s+/).filter(Boolean);
              if (classes.length > 0) {
                parentSelector += `.${classes[0]}`;
              }
            }
            candidateStructure.parentChain.unshift(parentSelector);
            current = current.parentElement;
            depth++;
          }

          // Calculate sibling index
          if (element.parentElement) {
            const siblings = Array.from(element.parentElement.children).filter(
              child => child.tagName === element.tagName
            );
            candidateStructure.siblingIndex = siblings.indexOf(element);
          }

          // Calculate similarity
          const similarity = this.calculateStructuralSimilarity(targetStructure, candidateStructure, config);
          
          if (similarity >= 0.6) { // Minimum similarity threshold
            // Generate selectors for this candidate
            const selectors: ElementSelector[] = [];
            
            // ID selector (highest priority)
            if (candidateStructure.attributes.id) {
              selectors.push({
                type: 'css',
                value: `#${candidateStructure.attributes.id}`,
                confidence: 0.95
              });
            }

            // Class-based selector
            if (candidateStructure.attributes.class) {
              const classes = candidateStructure.attributes.class.split(/\s+/).filter(Boolean);
              if (classes.length > 0) {
                selectors.push({
                  type: 'css',
                  value: `.${classes.join('.')}`,
                  confidence: 0.8
                });
              }
            }

            // Structural selector with parent chain
            if (candidateStructure.parentChain.length > 0) {
              const structuralSelector = candidateStructure.parentChain.join(' > ') + ` > ${candidateStructure.tagName}`;
              selectors.push({
                type: 'css',
                value: structuralSelector,
                confidence: similarity * 0.7
              });
            }

            // Position-based selector
            if (candidateStructure.siblingIndex >= 0) {
              const positionSelector = `${candidateStructure.tagName}:nth-of-type(${candidateStructure.siblingIndex + 1})`;
              selectors.push({
                type: 'css',
                value: positionSelector,
                confidence: similarity * 0.5
              });
            }

            const boundingBox = element.getBoundingClientRect();
            
            results.push({
              selectors,
              boundingBox: {
                x: boundingBox.left,
                y: boundingBox.top,
                width: boundingBox.width,
                height: boundingBox.height
              },
              tagName: candidateStructure.tagName,
              attributes: candidateStructure.attributes,
              textContent: candidateStructure.textContent,
              parentPath: candidateStructure.parentChain
            });
          }
        }

        return results;
      }, structure, this.config);

      return candidates;
    } catch (error) {
      console.warn('Error finding similar structures:', error);
      return [];
    }
  }

  /**
   * Calculate structural similarity between two elements
   */
  calculateStructuralSimilarity(struct1: StructuralInfo, struct2: StructuralInfo): number {
    let totalScore = 0;
    let maxScore = 0;

    // Tag name similarity (must match)
    if (struct1.tagName === struct2.tagName) {
      totalScore += 1.0;
    }
    maxScore += 1.0;

    // Attribute similarity with weights
    const allAttributes = new Set([
      ...Object.keys(struct1.attributes),
      ...Object.keys(struct2.attributes)
    ]);

    for (const attr of allAttributes) {
      const weight = this.config.weightAttributes[attr] || 0.5;
      maxScore += weight;

      const value1 = struct1.attributes[attr];
      const value2 = struct2.attributes[attr];

      if (value1 && value2) {
        if (value1 === value2) {
          totalScore += weight; // Exact match
        } else if (attr === 'class') {
          // Special handling for class attributes
          const classes1 = new Set(value1.split(/\s+/));
          const classes2 = new Set(value2.split(/\s+/));
          const intersection = new Set([...classes1].filter(cls => classes2.has(cls)));
          const union = new Set([...classes1, ...classes2]);
          const classSimilarity = intersection.size / union.size;
          totalScore += weight * classSimilarity;
        } else {
          // Partial string similarity for other attributes
          const similarity = this.calculateStringSimilarity(value1, value2);
          totalScore += weight * similarity;
        }
      }
    }

    // Parent chain similarity
    const parentSimilarity = this.calculateParentChainSimilarity(struct1.parentChain, struct2.parentChain);
    totalScore += parentSimilarity * 0.5;
    maxScore += 0.5;

    // Child count similarity
    const childCountDiff = Math.abs(struct1.childCount - struct2.childCount);
    const childCountSimilarity = Math.max(0, 1 - (childCountDiff / Math.max(struct1.childCount, struct2.childCount, 1)));
    totalScore += childCountSimilarity * 0.3;
    maxScore += 0.3;

    // Text content similarity
    if (struct1.textContent && struct2.textContent) {
      const textSimilarity = this.calculateStringSimilarity(struct1.textContent, struct2.textContent);
      totalScore += textSimilarity * 0.4;
      maxScore += 0.4;
    } else if (struct1.textContent || struct2.textContent) {
      maxScore += 0.4; // Penalty for missing text content
    }

    // Sibling index similarity (less important)
    const siblingDiff = Math.abs(struct1.siblingIndex - struct2.siblingIndex);
    const siblingSimilarity = Math.max(0, 1 - (siblingDiff / 10)); // Normalize by max expected siblings
    totalScore += siblingSimilarity * 0.2;
    maxScore += 0.2;

    return maxScore > 0 ? totalScore / maxScore : 0;
  }

  /**
   * Main healing method using structural analysis
   */
  async heal(context: HealingContext): Promise<HealingResult> {
    const startTime = Date.now();
    
    try {
      // Extract structural information from the original element or context
      let targetStructure: StructuralInfo;
      
      if (context.lastKnownLocation) {
        // Use cached structural information if available
        targetStructure = {
          tagName: context.lastKnownLocation.tagName || context.elementType || 'div',
          attributes: context.lastKnownLocation.attributes || {},
          parentChain: context.lastKnownLocation.parentPath || [],
          siblingIndex: 0,
          childCount: 0,
          textContent: context.lastKnownLocation.textContent
        };
      } else {
        // Try to analyze the original selector if it still works
        try {
          targetStructure = await this.analyzeElementStructure(context.page, context.originalSelector);
        } catch (error) {
          return {
            success: false,
            strategy: HealingStrategy.STRUCTURAL_ANALYSIS,
            confidence: 0,
            error: 'Could not analyze original element structure',
            metadata: { executionTime: Date.now() - startTime }
          };
        }
      }

      // Find elements with similar structure
      const similarElements = await this.findBySimilarStructure(context.page, targetStructure);
      
      if (similarElements.length === 0) {
        return {
          success: false,
          strategy: HealingStrategy.STRUCTURAL_ANALYSIS,
          confidence: 0,
          error: 'No structurally similar elements found',
          metadata: { 
            executionTime: Date.now() - startTime,
            targetStructure: {
              tagName: targetStructure.tagName,
              attributeCount: Object.keys(targetStructure.attributes).length,
              parentDepth: targetStructure.parentChain.length
            }
          }
        };
      }

      // Try each candidate's selectors
      for (const candidate of similarElements) {
        for (const selector of candidate.selectors) {
          const isValid = await this.validateSelector(context.page, selector.value);
          
          if (isValid) {
            return {
              success: true,
              newSelector: selector.value,
              strategy: HealingStrategy.STRUCTURAL_ANALYSIS,
              confidence: selector.confidence || 0.5,
              alternatives: similarElements
                .flatMap(el => el.selectors)
                .slice(0, 5)
                .sort((a, b) => (b.confidence || 0) - (a.confidence || 0)),
              metadata: {
                executionTime: Date.now() - startTime,
                selectedStrategy: selector.metadata?.strategy || 'structural',
                candidatesFound: similarElements.length,
                targetStructure: {
                  tagName: targetStructure.tagName,
                  attributeCount: Object.keys(targetStructure.attributes).length,
                  parentDepth: targetStructure.parentChain.length
                }
              }
            };
          }
        }
      }

      return {
        success: false,
        strategy: HealingStrategy.STRUCTURAL_ANALYSIS,
        confidence: 0,
        alternatives: similarElements
          .flatMap(el => el.selectors)
          .slice(0, 5)
          .sort((a, b) => (b.confidence || 0) - (a.confidence || 0)),
        error: 'Generated selectors from structural analysis did not work',
        metadata: {
          executionTime: Date.now() - startTime,
          candidatesFound: similarElements.length,
          selectorsGenerated: similarElements.reduce((sum, el) => sum + el.selectors.length, 0)
        }
      };

    } catch (error) {
      return {
        success: false,
        strategy: HealingStrategy.STRUCTURAL_ANALYSIS,
        confidence: 0,
        error: error instanceof Error ? error.message : 'Unknown error during structural analysis',
        metadata: { executionTime: Date.now() - startTime }
      };
    }
  }

  /**
   * Calculate similarity between parent chains
   */
  private calculateParentChainSimilarity(chain1: string[], chain2: string[]): number {
    if (chain1.length === 0 && chain2.length === 0) return 1.0;
    if (chain1.length === 0 || chain2.length === 0) return 0.0;

    const maxLength = Math.max(chain1.length, chain2.length);
    let matches = 0;

    // Compare from the end (closest parents are more important)
    for (let i = 0; i < Math.min(chain1.length, chain2.length); i++) {
      const index1 = chain1.length - 1 - i;
      const index2 = chain2.length - 1 - i;
      
      if (chain1[index1] === chain2[index2]) {
        matches++;
      } else {
        // Partial match for similar parent selectors
        const similarity = this.calculateStringSimilarity(chain1[index1], chain2[index2]);
        matches += similarity;
      }
    }

    return matches / maxLength;
  }

  /**
   * Calculate string similarity using Levenshtein distance
   */
  private calculateStringSimilarity(str1: string, str2: string): number {
    if (str1 === str2) return 1.0;
    if (!str1 || !str2) return 0.0;

    const maxLength = Math.max(str1.length, str2.length);
    const distance = this.levenshteinDistance(str1, str2);
    
    return Math.max(0, 1 - (distance / maxLength));
  }

  /**
   * Calculate Levenshtein distance between two strings
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const matrix: number[][] = [];

    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            matrix[i][j - 1] + 1,     // insertion
            matrix[i - 1][j] + 1      // deletion
          );
        }
      }
    }

    return matrix[str2.length][str1.length];
  }

  /**
   * Validate if a selector works on the current page
   */
  private async validateSelector(page: Page, selector: string): Promise<boolean> {
    try {
      const element = page.locator(selector).first();
      const count = await element.count();
      return count > 0;
    } catch (error) {
      return false;
    }
  }
}