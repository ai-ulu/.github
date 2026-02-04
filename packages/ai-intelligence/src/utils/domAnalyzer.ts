import * as cheerio from 'cheerio';

export interface DOMAnalysis {
  missingElements: string[];
  changedSelectors: string[];
  structuralChanges: string[];
  newElements: string[];
  accessibility: AccessibilityAnalysis;
}

export interface AccessibilityAnalysis {
  missingLabels: string[];
  lowContrast: string[];
  missingAltText: string[];
  improperHeadings: string[];
  keyboardIssues: string[];
}

export class DOMAnalyzer {
  async analyzeDOMSnapshot(domSnapshot: string): Promise<DOMAnalysis> {
    const $ = cheerio.load(domSnapshot);
    
    return {
      missingElements: this.findMissingElements($),
      changedSelectors: this.findChangedSelectors($),
      structuralChanges: this.findStructuralChanges($),
      newElements: this.findNewElements($),
      accessibility: this.analyzeAccessibility($)
    };
  }

  private findMissingElements($: cheerio.CheerioAPI): string[] {
    const missingElements: string[] = [];
    
    // Common test selectors that might be missing
    const commonSelectors = [
      '[data-testid]',
      '#submit',
      '.btn-primary',
      'button[type="submit"]',
      'input[type="email"]',
      'input[type="password"]'
    ];

    commonSelectors.forEach(selector => {
      if ($(selector).length === 0) {
        missingElements.push(selector);
      }
    });

    return missingElements;
  }

  private findChangedSelectors($: cheerio.CheerioAPI): string[] {
    const changedSelectors: string[] = [];
    
    // Look for elements that might have changed IDs or classes
    $('[id]').each((_: number, element: any) => {
      const id = $(element).attr('id');
      if (id && this.looksLikeGeneratedId(id)) {
        changedSelectors.push(`#${id} (possibly generated ID)`);
      }
    });

    return changedSelectors;
  }

  private findStructuralChanges($: cheerio.CheerioAPI): string[] {
    const changes: string[] = [];
    
    // Check for common structural issues
    const forms = $('form');
    if (forms.length === 0) {
      changes.push('No forms found - forms may have been removed');
    }

    const buttons = $('button, input[type="button"], input[type="submit"]');
    if (buttons.length === 0) {
      changes.push('No buttons found - interactive elements may be missing');
    }

    // Check for nested structure issues
    const deeplyNested = $('div div div div div div');
    if (deeplyNested.length > 10) {
      changes.push('Deeply nested DOM structure detected - may affect performance');
    }

    return changes;
  }

  private findNewElements($: cheerio.CheerioAPI): string[] {
    const newElements: string[] = [];
    
    // Look for elements that might be new (modals, overlays, etc.)
    const modals = $('.modal, [role="dialog"], .overlay');
    modals.each((_: number, element: any) => {
      newElements.push(`Modal/overlay: ${$(element).attr('class') || 'unnamed'}`);
    });

    // Look for error messages
    const errors = $('.error, .alert-danger, [role="alert"]');
    errors.each((_: number, element: any) => {
      const text = $(element).text().trim().substring(0, 50);
      newElements.push(`Error message: "${text}"`);
    });

    return newElements;
  }

  private analyzeAccessibility($: cheerio.CheerioAPI): AccessibilityAnalysis {
    return {
      missingLabels: this.findMissingLabels($),
      lowContrast: this.findLowContrastElements($),
      missingAltText: this.findMissingAltText($),
      improperHeadings: this.findImproperHeadings($),
      keyboardIssues: this.findKeyboardIssues($)
    };
  }

  private findMissingLabels($: cheerio.CheerioAPI): string[] {
    const missingLabels: string[] = [];
    
    $('input, select, textarea').each((_: number, element: any) => {
      const $element = $(element);
      const id = $element.attr('id');
      const ariaLabel = $element.attr('aria-label');
      const ariaLabelledBy = $element.attr('aria-labelledby');
      
      // Check if there's a label
      const hasLabel = id && $(`label[for="${id}"]`).length > 0;
      
      if (!hasLabel && !ariaLabel && !ariaLabelledBy) {
        const type = $element.attr('type') || ($element.prop('tagName') as string)?.toLowerCase() || 'unknown';
        missingLabels.push(`${type} input without label`);
      }
    });

    return missingLabels;
  }

  private findLowContrastElements($: cheerio.CheerioAPI): string[] {
    // This would require color analysis - placeholder implementation
    const lowContrast: string[] = [];
    
    $('*').each((_: number, element: any) => {
      const $element = $(element);
      const style = $element.attr('style') || '';
      
      // Simple check for light colors on light backgrounds
      if (style.includes('color: #ccc') || style.includes('color: #ddd')) {
        lowContrast.push(($element.prop('tagName') as string)?.toLowerCase() || 'unknown');
      }
    });

    return lowContrast;
  }

  private findMissingAltText($: cheerio.CheerioAPI): string[] {
    const missingAlt: string[] = [];
    
    $('img').each((_: number, element: any) => {
      const $element = $(element);
      const alt = $element.attr('alt');
      const ariaLabel = $element.attr('aria-label');
      const role = $element.attr('role');
      
      if (!alt && !ariaLabel && role !== 'presentation') {
        const src = $element.attr('src') || 'unknown';
        missingAlt.push(`Image without alt text: ${src.substring(0, 50)}`);
      }
    });

    return missingAlt;
  }

  private findImproperHeadings($: cheerio.CheerioAPI): string[] {
    const issues: string[] = [];
    
    // Check heading hierarchy
    const headings = $('h1, h2, h3, h4, h5, h6').toArray();
    let previousLevel = 0;
    
    headings.forEach((heading: any) => {
      const level = parseInt(heading.tagName.charAt(1));
      
      if (level > previousLevel + 1) {
        issues.push(`Heading level skip: ${heading.tagName} after h${previousLevel}`);
      }
      
      previousLevel = level;
    });

    // Check for multiple h1s
    const h1Count = $('h1').length;
    if (h1Count > 1) {
      issues.push(`Multiple h1 elements found (${h1Count})`);
    }

    return issues;
  }

  private findKeyboardIssues($: cheerio.CheerioAPI): string[] {
    const issues: string[] = [];
    
    // Check for interactive elements without proper focus handling
    $('div, span').each((_: number, element: any) => {
      const $element = $(element);
      const onClick = $element.attr('onclick');
      const tabIndex = $element.attr('tabindex');
      const role = $element.attr('role');
      
      if (onClick && !tabIndex && !['button', 'link'].includes(role || '')) {
        issues.push('Interactive element without keyboard accessibility');
      }
    });

    // Check for positive tabindex values
    $('[tabindex]').each((_: number, element: any) => {
      const tabIndex = parseInt($(element).attr('tabindex') || '0');
      if (tabIndex > 0) {
        issues.push(`Positive tabindex found: ${tabIndex}`);
      }
    });

    return issues;
  }

  private looksLikeGeneratedId(id: string): boolean {
    // Check if ID looks like it was auto-generated
    const patterns = [
      /^[a-f0-9]{8,}$/i, // Long hex strings
      /^\d+$/,           // Pure numbers
      /^[a-z]+\d+$/i,    // Letters followed by numbers
      /^react-/,         // React generated IDs
      /^mui-/            // Material-UI generated IDs
    ];

    return patterns.some(pattern => pattern.test(id));
  }

  compareDOMSnapshots(before: string, after: string): {
    added: string[];
    removed: string[];
    modified: string[];
  } {
    const $before = cheerio.load(before);
    const $after = cheerio.load(after);

    const beforeElements = this.extractElementSignatures($before);
    const afterElements = this.extractElementSignatures($after);

    const added = afterElements.filter(el => !beforeElements.includes(el));
    const removed = beforeElements.filter(el => !afterElements.includes(el));
    
    // For modified elements, we'd need more sophisticated comparison
    const modified: string[] = [];

    return { added, removed, modified };
  }

  private extractElementSignatures($: cheerio.CheerioAPI): string[] {
    const signatures: string[] = [];
    
    $('*').each((_: number, element: any) => {
      const $element = $(element);
      const tagName = element.tagName.toLowerCase();
      const id = $element.attr('id');
      const className = $element.attr('class');
      const testId = $element.attr('data-testid');
      
      let signature = tagName;
      if (id) signature += `#${id}`;
      if (className) signature += `.${className.split(' ').join('.')}`;
      if (testId) signature += `[data-testid="${testId}"]`;
      
      signatures.push(signature);
    });

    return signatures;
  }
}