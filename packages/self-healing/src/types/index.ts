/**
 * Self-Healing Engine Types
 * Comprehensive type definitions for element location strategies and healing mechanisms
 */

import { HealingStrategy } from '@autoqa/database';
import { Page, Locator } from 'playwright';

// Element location strategy types
export interface ElementSelector {
  type: 'css' | 'xpath' | 'text' | 'visual' | 'structural';
  value: string;
  confidence?: number;
  metadata?: Record<string, any>;
}

export interface ElementLocation {
  selectors: ElementSelector[];
  boundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  visualHash?: string;
  textContent?: string;
  attributes?: Record<string, string>;
  tagName?: string;
  parentPath?: string[];
}

// Healing strategy interfaces
export interface HealingContext {
  page: Page;
  originalSelector: string;
  elementType: string;
  lastKnownLocation?: ElementLocation;
  domSnapshot?: string;
  screenshot?: Buffer;
  metadata?: Record<string, any>;
}

export interface HealingResult {
  success: boolean;
  newSelector?: string;
  strategy: HealingStrategy;
  confidence: number;
  alternatives?: ElementSelector[];
  metadata?: Record<string, any>;
  error?: string;
}

export interface HealingAttempt {
  strategy: HealingStrategy;
  selector: string;
  confidence: number;
  success: boolean;
  error?: string;
  executionTime: number;
}

// Strategy-specific interfaces
export interface CSSStrategy {
  generateAlternatives(element: ElementLocation): ElementSelector[];
  validateSelector(page: Page, selector: string): Promise<boolean>;
  calculateConfidence(selector: string, element: ElementLocation): number;
}

export interface XPathStrategy {
  generateXPath(element: ElementLocation): string[];
  optimizeXPath(xpath: string): string;
  validateXPath(page: Page, xpath: string): Promise<boolean>;
}

export interface TextContentStrategy {
  findByText(page: Page, text: string, options?: TextMatchOptions): Promise<Locator[]>;
  findByPartialText(page: Page, partialText: string, options?: TextMatchOptions): Promise<Locator[]>;
  calculateTextSimilarity(text1: string, text2: string): number;
}

export interface TextMatchOptions {
  exact?: boolean;
  caseSensitive?: boolean;
  fuzzyThreshold?: number;
  maxDistance?: number;
}

export interface VisualRecognitionStrategy {
  captureElementImage(page: Page, selector: string): Promise<Buffer>;
  findByVisualSimilarity(page: Page, templateImage: Buffer, threshold?: number): Promise<ElementLocation[]>;
  calculateVisualSimilarity(image1: Buffer, image2: Buffer): Promise<number>;
  extractVisualFeatures(image: Buffer): Promise<VisualFeatures>;
}

export interface VisualFeatures {
  hash: string;
  dimensions: { width: number; height: number };
  colorHistogram?: number[];
  edges?: number[];
  corners?: Array<{ x: number; y: number }>;
}

export interface StructuralAnalysisStrategy {
  analyzeElementStructure(page: Page, selector: string): Promise<StructuralInfo>;
  findBySimilarStructure(page: Page, structure: StructuralInfo): Promise<ElementLocation[]>;
  calculateStructuralSimilarity(struct1: StructuralInfo, struct2: StructuralInfo): number;
}

export interface StructuralInfo {
  tagName: string;
  attributes: Record<string, string>;
  parentChain: string[];
  siblingIndex: number;
  childCount: number;
  textContent?: string;
  computedStyles?: Record<string, string>;
}

// Configuration interfaces
export interface HealingConfig {
  strategies: HealingStrategy[];
  maxAttempts: number;
  confidenceThreshold: number;
  timeout: number;
  visualSimilarityThreshold: number;
  textSimilarityThreshold: number;
  enableLogging: boolean;
  enableScreenshots: boolean;
  enableDomSnapshots: boolean;
}

export interface StrategyConfig {
  [HealingStrategy.CSS_SELECTOR]: {
    prioritizeId: boolean;
    prioritizeClass: boolean;
    includeAttributes: string[];
    excludeAttributes: string[];
  };
  [HealingStrategy.XPATH]: {
    preferAbsolute: boolean;
    maxDepth: number;
    includeText: boolean;
  };
  [HealingStrategy.TEXT_CONTENT]: {
    fuzzyThreshold: number;
    maxDistance: number;
    caseSensitive: boolean;
  };
  [HealingStrategy.VISUAL_RECOGNITION]: {
    similarityThreshold: number;
    templateMatchingMethod: 'SQDIFF' | 'CCORR' | 'CCOEFF';
    enableEdgeDetection: boolean;
  };
  [HealingStrategy.STRUCTURAL_ANALYSIS]: {
    includeStyles: boolean;
    maxParentDepth: number;
    weightAttributes: Record<string, number>;
  };
}

// Event and logging interfaces
export interface HealingEvent {
  id: string;
  scenarioId: string;
  executionId?: string;
  elementType: string;
  oldSelector: string;
  newSelector?: string;
  strategy: HealingStrategy;
  success: boolean;
  confidence: number;
  attempts: HealingAttempt[];
  metadata?: Record<string, any>;
  timestamp: Date;
}

export interface HealingLogger {
  logAttempt(attempt: HealingAttempt): void;
  logResult(result: HealingResult): void;
  logError(error: Error, context: HealingContext): void;
  getHistory(): HealingEvent[];
}

// Error types
export class HealingError extends Error {
  constructor(
    message: string,
    public strategy: HealingStrategy,
    public selector: string,
    public cause?: Error
  ) {
    super(message);
    this.name = 'HealingError';
  }
}

export class ElementNotFoundError extends HealingError {
  constructor(selector: string, strategy: HealingStrategy) {
    super(`Element not found with selector: ${selector}`, strategy, selector);
    this.name = 'ElementNotFoundError';
  }
}

export class VisualRecognitionError extends HealingError {
  constructor(message: string, cause?: Error) {
    super(message, HealingStrategy.VISUAL_RECOGNITION, '', cause);
    this.name = 'VisualRecognitionError';
  }
}

// Utility types
export type SelectorType = 'css' | 'xpath' | 'text' | 'visual' | 'structural';

export interface ElementIdentifier {
  selector: string;
  type: SelectorType;
  confidence: number;
}

export interface HealingMetrics {
  totalAttempts: number;
  successfulHealing: number;
  failedHealing: number;
  averageConfidence: number;
  strategySuccessRates: Record<HealingStrategy, number>;
  averageHealingTime: number;
}