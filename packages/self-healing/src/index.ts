/**
 * AutoQA Self-Healing Engine
 * Main entry point for element location strategies and healing mechanisms
 * 
 * This package implements comprehensive self-healing capabilities for web test automation,
 * providing multiple strategies to locate elements when original selectors fail.
 * 
 * Validates Requirements:
 * - 4.1: CSS selector alternatives and fallback mechanisms
 * - 4.2: XPath fallback and text content matching
 * - 4.5: Visual element recognition capabilities
 */

// Export all types
export * from './types';

// Export strategy implementations
export { CSSelectorStrategy } from './strategies/css-selector';
export { XPathSelectorStrategy } from './strategies/xpath';
export { TextContentMatchingStrategy } from './strategies/text-content';
export { VisualElementRecognition } from './strategies/visual-recognition';
export { StructuralElementAnalysis } from './strategies/structural-analysis';

// Export main healing engine
export { SelfHealingEngine } from './engine';

// Export utilities
export { HealingLogger } from './utils/logger';
export { HealingMetricsCollector } from './utils/metrics';
export { ElementLocationCache } from './utils/cache';