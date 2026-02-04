import { 
  VisualAnalysis, 
  DetectedElement, 
  LayoutAnalysis, 
  AccessibilityIssue, 
  VisualChange, 
  VisualIssue 
} from './types';
import { AIProvider } from './utils/aiProvider';
import { ImageAnalyzer } from './utils/imageAnalyzer';
import sharp from 'sharp';

export interface VisualIntelligenceConfig {
  enableAIAnalysis: boolean;
  accessibilityChecks: boolean;
  layoutAnalysis: boolean;
  performanceAnalysis: boolean;
  contrastThreshold: number;
  elementDetectionThreshold: number;
}

export class VisualIntelligence {
  private aiProvider: AIProvider;
  private imageAnalyzer: ImageAnalyzer;
  private config: VisualIntelligenceConfig;

  constructor(
    aiProvider: AIProvider,
    config: Partial<VisualIntelligenceConfig> = {}
  ) {
    this.aiProvider = aiProvider;
    this.imageAnalyzer = new ImageAnalyzer();
    this.config = {
      enableAIAnalysis: true,
      accessibilityChecks: true,
      layoutAnalysis: true,
      performanceAnalysis: true,
      contrastThreshold: 4.5, // WCAG AA standard
      elementDetectionThreshold: 0.8,
      ...config
    };
  }

  async analyzeScreenshot(
    screenshotPath: string,
    domSnapshot?: string,
    previousScreenshot?: string
  ): Promise<VisualAnalysis> {
    // Basic image analysis
    const imageAnalysis = await this.imageAnalyzer.analyzeScreenshot(screenshotPath);
    
    // Detect UI elements
    const elements = await this.detectUIElements(screenshotPath, domSnapshot);
    
    // Analyze layout
    const layout = this.config.layoutAnalysis 
      ? await this.analyzeLayout(elements, imageAnalysis.dimensions)
      : this.getEmptyLayoutAnalysis();
    
    // Check accessibility
    const accessibility = this.config.accessibilityChecks
      ? await this.analyzeAccessibility(elements, screenshotPath)
      : [];
    
    // Detect visual changes if previous screenshot provided
    const visualChanges = previousScreenshot
      ? await this.detectVisualChanges(previousScreenshot, screenshotPath)
      : [];

    // Generate AI insights
    const insights = this.config.enableAIAnalysis
      ? await this.generateAIInsights(screenshotPath, elements, layout, accessibility)
      : this.generateRuleBasedInsights(elements, layout, accessibility);

    return {
      screenshotId: this.generateScreenshotId(screenshotPath),
      analysis: {
        elements,
        layout,
        accessibility,
        visualChanges
      },
      insights
    };
  }

  private async detectUIElements(
    screenshotPath: string,
    domSnapshot?: string
  ): Promise<DetectedElement[]> {
    const elements: DetectedElement[] = [];

    if (this.config.enableAIAnalysis) {
      // Use AI for element detection
      const aiElements = await this.detectElementsWithAI(screenshotPath);
      elements.push(...aiElements);
    }

    // Combine with DOM-based detection if available
    if (domSnapshot) {
      const domElements = await this.detectElementsFromDOM(screenshotPath, domSnapshot);
      elements.push(...domElements);
    }

    // Fallback to basic image analysis
    if (elements.length === 0) {
      const basicElements = await this.detectElementsBasic(screenshotPath);
      elements.push(...basicElements);
    }

    return this.deduplicateElements(elements);
  }

  private async detectElementsWithAI(screenshotPath: string): Promise<DetectedElement[]> {
    try {
      const imageBuffer = await this.loadImageBuffer(screenshotPath);
      
      const prompt = `
Analyze this screenshot and identify UI elements. For each element, provide:
1. Type (button, input, link, image, text, container)
2. Bounding box coordinates (x, y, width, height)
3. Text content if visible
4. Accessibility information (has label, contrast ratio if applicable)

Return as JSON array with format:
[{
  "type": "button",
  "bounds": {"x": 100, "y": 200, "width": 80, "height": 32},
  "text": "Submit",
  "selector": "button[type='submit']",
  "attributes": {"class": "btn-primary"},
  "accessibility": {"hasLabel": true, "contrastRatio": 4.5, "focusable": true}
}]

Focus on interactive elements and important content areas.
`;

      const aiResponse = await this.aiProvider.analyzeImage(imageBuffer, prompt);
      const parsedElements = JSON.parse(aiResponse);
      
      return parsedElements.map((element: any) => ({
        type: element.type,
        bounds: element.bounds,
        selector: element.selector || this.generateSelector(element),
        text: element.text,
        attributes: element.attributes || {},
        accessibility: {
          hasLabel: element.accessibility?.hasLabel || false,
          contrastRatio: element.accessibility?.contrastRatio,
          focusable: element.accessibility?.focusable || false
        }
      }));
    } catch (error) {
      console.error('AI element detection failed:', error);
      return [];
    }
  }

  private async detectElementsFromDOM(
    screenshotPath: string,
    domSnapshot: string
  ): Promise<DetectedElement[]> {
    // This would require correlating DOM elements with visual positions
    // For now, return a simplified implementation
    const elements: DetectedElement[] = [];
    
    // Parse DOM snapshot (simplified)
    const interactiveElements = this.extractInteractiveElements(domSnapshot);
    
    interactiveElements.forEach((element, index) => {
      elements.push({
        type: this.mapDOMTypeToElementType(element.tagName),
        bounds: {
          x: 0, // Would need actual positioning
          y: index * 40,
          width: 100,
          height: 32
        },
        selector: element.selector,
        text: element.text,
        attributes: element.attributes,
        accessibility: {
          hasLabel: !!element.attributes['aria-label'] || !!element.attributes['alt'],
          focusable: element.focusable
        }
      });
    });

    return elements;
  }

  private async detectElementsBasic(screenshotPath: string): Promise<DetectedElement[]> {
    try {
      // Basic element detection using image processing
      const imageBuffer = await this.loadImageBuffer(screenshotPath);
      const metadata = await sharp(imageBuffer).metadata();
      const { width, height } = metadata;
      
      // This is a very basic implementation - in practice, you'd use computer vision
      const elements: DetectedElement[] = [];
      
      // Detect potential button areas (rectangles with borders)
      // This would use edge detection and shape recognition
      elements.push({
        type: 'container',
        bounds: { x: 0, y: 0, width: width || 0, height: height || 0 },
        selector: 'body',
        attributes: {},
        accessibility: { hasLabel: false, focusable: false }
      });

      return elements;
    } catch (error) {
      // Return empty array for invalid images
      console.warn('Basic element detection failed:', error);
      return [];
    }
  }

  private async analyzeLayout(
    elements: DetectedElement[],
    dimensions: { width: number; height: number }
  ): Promise<LayoutAnalysis> {
    const analysis: LayoutAnalysis = {
      responsive: this.checkResponsiveness(elements, dimensions),
      overflowIssues: this.detectOverflowIssues(elements, dimensions),
      alignmentIssues: this.detectAlignmentIssues(elements),
      spacingIssues: this.detectSpacingIssues(elements)
    };

    return analysis;
  }

  private async analyzeAccessibility(
    elements: DetectedElement[],
    screenshotPath: string
  ): Promise<AccessibilityIssue[]> {
    const issues: AccessibilityIssue[] = [];

    // Check for missing labels
    elements.forEach(element => {
      if (['button', 'input', 'link'].includes(element.type) && !element.accessibility.hasLabel) {
        issues.push({
          type: 'missing_label',
          severity: 'high',
          element: element.selector,
          description: `${element.type} element lacks accessible label`,
          wcagRule: 'WCAG 2.1 - 4.1.2 Name, Role, Value',
          suggestedFix: `Add aria-label or associate with a label element`
        });
      }
    });

    // Check contrast ratios
    if (this.config.enableAIAnalysis) {
      const contrastIssues = await this.analyzeContrastWithAI(screenshotPath, elements);
      issues.push(...contrastIssues);
    }

    // Check focus order
    const focusableElements = elements.filter(el => el.accessibility.focusable);
    if (focusableElements.length > 1) {
      const focusIssues = this.analyzeFocusOrder(focusableElements);
      issues.push(...focusIssues);
    }

    return issues;
  }

  private async detectVisualChanges(
    beforePath: string,
    afterPath: string
  ): Promise<VisualChange[]> {
    try {
      const diff = await this.imageAnalyzer.compareScreenshots(beforePath, afterPath);
      const changes: VisualChange[] = [];

      diff.regions.forEach(region => {
        changes.push({
          type: this.mapRegionTypeToChangeType(region.type),
          element: `region_${region.x}_${region.y}`,
          impact: this.assessChangeImpact(region),
          before: { bounds: region },
          after: { bounds: region }
        });
      });

      return changes;
    } catch (error) {
      console.error('Visual change detection failed:', error);
      return [];
    }
  }

  private async generateAIInsights(
    screenshotPath: string,
    elements: DetectedElement[],
    layout: LayoutAnalysis,
    accessibility: AccessibilityIssue[]
  ): Promise<VisualAnalysis['insights']> {
    try {
      const imageBuffer = await this.loadImageBuffer(screenshotPath);
      
      const prompt = `
Analyze this screenshot and provide insights:

Elements detected: ${elements.length}
Layout issues: ${layout.overflowIssues.length + layout.alignmentIssues.length + layout.spacingIssues.length}
Accessibility issues: ${accessibility.length}
Responsive design: ${layout.responsive ? 'Yes' : 'No'}

Key elements:
${elements.slice(0, 5).map(el => `- ${el.type}: ${el.text || 'no text'}`).join('\n')}

Accessibility issues:
${accessibility.slice(0, 3).map(issue => `- ${issue.type}: ${issue.description}`).join('\n')}

Provide:
1. A brief summary of the visual state
2. Top 3 issues that need attention
3. Recommendations for improvement

Keep response concise and actionable.
`;

      const aiResponse = await this.aiProvider.analyzeImage(imageBuffer, prompt);
      
      return {
        summary: this.extractSummary(aiResponse),
        issues: this.extractIssues(aiResponse, elements, layout, accessibility),
        recommendations: this.extractRecommendations(aiResponse)
      };
    } catch (error) {
      console.error('AI insights generation failed:', error);
      return this.generateRuleBasedInsights(elements, layout, accessibility);
    }
  }

  private generateRuleBasedInsights(
    elements: DetectedElement[],
    layout: LayoutAnalysis,
    accessibility: AccessibilityIssue[]
  ): VisualAnalysis['insights'] {
    const issues: VisualIssue[] = [];
    const recommendations: string[] = [];

    // Analyze layout issues
    if (layout.overflowIssues.length > 0) {
      issues.push({
        type: 'layout_shift',
        severity: 'medium',
        description: `${layout.overflowIssues.length} elements have overflow issues`,
        affectedUsers: 'Mobile users primarily'
      });
      recommendations.push('Fix overflow issues for better mobile experience');
    }

    // Analyze accessibility
    const criticalA11yIssues = accessibility.filter(issue => issue.severity === 'critical' || issue.severity === 'high');
    if (criticalA11yIssues.length > 0) {
      issues.push({
        type: 'color_contrast',
        severity: 'high',
        description: `${criticalA11yIssues.length} critical accessibility issues found`,
        affectedUsers: 'Users with disabilities'
      });
      recommendations.push('Address accessibility issues to improve usability for all users');
    }

    // Analyze element distribution
    const interactiveElements = elements.filter(el => ['button', 'input', 'link'].includes(el.type));
    if (interactiveElements.length === 0) {
      issues.push({
        type: 'missing_element',
        severity: 'medium',
        description: 'No interactive elements detected',
        affectedUsers: 'All users'
      });
      recommendations.push('Ensure interactive elements are properly detected and accessible');
    }

    const summary = `Visual analysis complete: ${elements.length} elements detected, ${issues.length} issues found`;

    return { summary, issues, recommendations };
  }

  // Utility methods
  private generateScreenshotId(path: string): string {
    return `screenshot_${Date.now()}_${path.split('/').pop()?.replace(/\.[^/.]+$/, '') || 'unknown'}`;
  }

  private async loadImageBuffer(imagePath: string): Promise<Buffer> {
    if (imagePath.startsWith('data:image/')) {
      const base64Data = imagePath.split(',')[1];
      return Buffer.from(base64Data, 'base64');
    } else if (imagePath.startsWith('/') || imagePath.includes(':\\')) {
      const fs = await import('fs/promises');
      return fs.readFile(imagePath);
    } else {
      return Buffer.from(imagePath, 'base64');
    }
  }

  private deduplicateElements(elements: DetectedElement[]): DetectedElement[] {
    const seen = new Set<string>();
    return elements.filter(element => {
      const key = `${element.type}_${element.bounds.x}_${element.bounds.y}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private generateSelector(element: any): string {
    if (element.attributes?.id) return `#${element.attributes.id}`;
    if (element.attributes?.class) return `.${element.attributes.class.split(' ')[0]}`;
    return element.type;
  }

  private extractInteractiveElements(domSnapshot: string): Array<{
    tagName: string;
    selector: string;
    text: string;
    attributes: Record<string, string>;
    focusable: boolean;
  }> {
    // Simplified DOM parsing - in practice, use a proper HTML parser
    const elements: any[] = [];
    
    // This would parse the DOM snapshot and extract interactive elements
    // For now, return empty array
    return elements;
  }

  private mapDOMTypeToElementType(tagName: string): DetectedElement['type'] {
    const mapping: Record<string, DetectedElement['type']> = {
      'button': 'button',
      'input': 'input',
      'a': 'link',
      'img': 'image',
      'div': 'container',
      'span': 'text',
      'p': 'text',
      'h1': 'text',
      'h2': 'text',
      'h3': 'text'
    };
    
    return mapping[tagName.toLowerCase()] || 'container';
  }

  private checkResponsiveness(
    elements: DetectedElement[],
    dimensions: { width: number; height: number }
  ): boolean {
    // Check if layout adapts to different screen sizes
    // This is a simplified check
    const mobileWidth = 768;
    const hasFlexibleLayout = elements.some(el => 
      el.bounds.width < dimensions.width * 0.9 // Not full width
    );
    
    return dimensions.width <= mobileWidth ? hasFlexibleLayout : true;
  }

  private detectOverflowIssues(
    elements: DetectedElement[],
    dimensions: { width: number; height: number }
  ): LayoutAnalysis['overflowIssues'] {
    const issues: LayoutAnalysis['overflowIssues'] = [];
    
    elements.forEach(element => {
      if (element.bounds.x + element.bounds.width > dimensions.width) {
        issues.push({
          element: element.selector,
          type: 'horizontal'
        });
      }
      
      if (element.bounds.y + element.bounds.height > dimensions.height) {
        issues.push({
          element: element.selector,
          type: 'vertical'
        });
      }
    });
    
    return issues;
  }

  private detectAlignmentIssues(elements: DetectedElement[]): LayoutAnalysis['alignmentIssues'] {
    const issues: LayoutAnalysis['alignmentIssues'] = [];
    
    // Group elements by approximate Y position (within 5px)
    const rows = new Map<number, DetectedElement[]>();
    
    elements.forEach(element => {
      const rowKey = Math.round(element.bounds.y / 5) * 5;
      if (!rows.has(rowKey)) {
        rows.set(rowKey, []);
      }
      rows.get(rowKey)!.push(element);
    });
    
    // Check alignment within rows
    rows.forEach(rowElements => {
      if (rowElements.length > 1) {
        const yPositions = rowElements.map(el => el.bounds.y);
        const minY = Math.min(...yPositions);
        const maxY = Math.max(...yPositions);
        
        if (maxY - minY > 10) { // More than 10px difference
          issues.push({
            elements: rowElements.map(el => el.selector),
            issue: 'Vertical misalignment in row'
          });
        }
      }
    });
    
    return issues;
  }

  private detectSpacingIssues(elements: DetectedElement[]): LayoutAnalysis['spacingIssues'] {
    const issues: LayoutAnalysis['spacingIssues'] = [];
    
    // Check for elements that are too close together
    for (let i = 0; i < elements.length; i++) {
      for (let j = i + 1; j < elements.length; j++) {
        const el1 = elements[i];
        const el2 = elements[j];
        
        const distance = this.calculateDistance(el1.bounds, el2.bounds);
        
        if (distance < 8 && distance > 0) { // Too close (less than 8px apart)
          issues.push({
            elements: [el1.selector, el2.selector],
            issue: 'Elements too close together'
          });
        }
      }
    }
    
    return issues;
  }

  private async analyzeContrastWithAI(
    screenshotPath: string,
    elements: DetectedElement[]
  ): Promise<AccessibilityIssue[]> {
    // This would use AI to analyze color contrast
    // For now, return empty array
    return [];
  }

  private analyzeFocusOrder(elements: DetectedElement[]): AccessibilityIssue[] {
    const issues: AccessibilityIssue[] = [];
    
    // Sort elements by visual position (top to bottom, left to right)
    const sortedElements = elements.sort((a, b) => {
      if (Math.abs(a.bounds.y - b.bounds.y) < 10) {
        return a.bounds.x - b.bounds.x; // Same row, sort by x
      }
      return a.bounds.y - b.bounds.y; // Different rows, sort by y
    });
    
    // Check if focus order matches visual order
    // This would require actual tabindex analysis
    
    return issues;
  }

  private mapRegionTypeToChangeType(regionType: string): VisualChange['type'] {
    const mapping: Record<string, VisualChange['type']> = {
      'added': 'added',
      'removed': 'removed',
      'changed': 'color_changed'
    };
    
    return mapping[regionType] || 'moved';
  }

  private assessChangeImpact(region: any): VisualChange['impact'] {
    const area = region.width * region.height;
    
    if (area > 10000) return 'major';
    if (area > 1000) return 'moderate';
    return 'minor';
  }

  private calculateDistance(bounds1: DetectedElement['bounds'], bounds2: DetectedElement['bounds']): number {
    const centerX1 = bounds1.x + bounds1.width / 2;
    const centerY1 = bounds1.y + bounds1.height / 2;
    const centerX2 = bounds2.x + bounds2.width / 2;
    const centerY2 = bounds2.y + bounds2.height / 2;
    
    return Math.sqrt(Math.pow(centerX2 - centerX1, 2) + Math.pow(centerY2 - centerY1, 2));
  }

  private getEmptyLayoutAnalysis(): LayoutAnalysis {
    return {
      responsive: true,
      overflowIssues: [],
      alignmentIssues: [],
      spacingIssues: []
    };
  }

  private extractSummary(aiResponse: string): string {
    // Extract summary from AI response
    const lines = aiResponse.split('\n');
    return lines.find(line => line.toLowerCase().includes('summary')) || 
           lines[0] || 
           'Visual analysis completed';
  }

  private extractIssues(
    aiResponse: string,
    elements: DetectedElement[],
    layout: LayoutAnalysis,
    accessibility: AccessibilityIssue[]
  ): VisualIssue[] {
    // Extract issues from AI response and combine with detected issues
    const issues: VisualIssue[] = [];
    
    // Add layout issues
    if (layout.overflowIssues.length > 0) {
      issues.push({
        type: 'layout_shift',
        severity: 'medium',
        description: 'Layout overflow detected',
        affectedUsers: 'Mobile users'
      });
    }
    
    // Add accessibility issues
    if (accessibility.length > 0) {
      issues.push({
        type: 'color_contrast',
        severity: 'high',
        description: 'Accessibility issues found',
        affectedUsers: 'Users with disabilities'
      });
    }
    
    return issues;
  }

  private extractRecommendations(aiResponse: string): string[] {
    // Extract recommendations from AI response
    const lines = aiResponse.split('\n');
    const recommendations: string[] = [];
    
    let inRecommendations = false;
    lines.forEach(line => {
      if (line.toLowerCase().includes('recommendation')) {
        inRecommendations = true;
      } else if (inRecommendations && line.trim().startsWith('-')) {
        recommendations.push(line.trim().substring(1).trim());
      }
    });
    
    return recommendations.length > 0 ? recommendations : [
      'Review visual elements for accessibility compliance',
      'Ensure responsive design works across all screen sizes',
      'Optimize layout for better user experience'
    ];
  }
}