/**
 * Visual Recognition Strategy
 * Implements visual element recognition with OpenCV for element location
 * Validates Requirements 4.5: Visual element recognition capabilities
 */

import { Page } from 'playwright';
import { HealingStrategy } from '@autoqa/database';
import * as cv from 'opencv4nodejs';
import * as sharp from 'sharp';
import * as pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import {
  VisualRecognitionStrategy,
  VisualFeatures,
  ElementLocation,
  HealingContext,
  HealingResult,
  StrategyConfig,
  ElementSelector,
  VisualRecognitionError
} from '../types';

export class VisualElementRecognition implements VisualRecognitionStrategy {
  private config: StrategyConfig[HealingStrategy.VISUAL_RECOGNITION];

  constructor(config?: Partial<StrategyConfig[HealingStrategy.VISUAL_RECOGNITION]>) {
    this.config = {
      similarityThreshold: 0.8,
      templateMatchingMethod: 'CCOEFF',
      enableEdgeDetection: true,
      ...config
    };
  }

  /**
   * Capture screenshot of a specific element
   */
  async captureElementImage(page: Page, selector: string): Promise<Buffer> {
    try {
      const element = page.locator(selector).first();
      const count = await element.count();
      
      if (count === 0) {
        throw new VisualRecognitionError(`Element not found: ${selector}`);
      }

      const boundingBox = await element.boundingBox();
      if (!boundingBox) {
        throw new VisualRecognitionError(`Could not get bounding box for element: ${selector}`);
      }

      // Capture screenshot of the element area
      const screenshot = await page.screenshot({
        clip: {
          x: Math.max(0, boundingBox.x - 5), // Add small padding
          y: Math.max(0, boundingBox.y - 5),
          width: boundingBox.width + 10,
          height: boundingBox.height + 10
        },
        type: 'png'
      });

      return screenshot;
    } catch (error) {
      throw new VisualRecognitionError(
        `Failed to capture element image: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Find elements by visual similarity using template matching
   */
  async findByVisualSimilarity(
    page: Page, 
    templateImage: Buffer, 
    threshold: number = this.config.similarityThreshold
  ): Promise<ElementLocation[]> {
    try {
      // Capture full page screenshot
      const pageScreenshot = await page.screenshot({ type: 'png', fullPage: true });
      
      // Convert buffers to OpenCV matrices
      const templateMat = await this.bufferToMat(templateImage);
      const pageMat = await this.bufferToMat(pageScreenshot);

      // Perform template matching
      const matches = await this.performTemplateMatching(pageMat, templateMat, threshold);
      
      // Convert matches to ElementLocation objects
      const locations: ElementLocation[] = [];
      for (const match of matches) {
        const location: ElementLocation = {
          selectors: [{
            type: 'visual',
            value: `visual-match-${match.confidence.toFixed(3)}`,
            confidence: match.confidence
          }],
          boundingBox: {
            x: match.x,
            y: match.y,
            width: match.width,
            height: match.height
          },
          visualHash: await this.calculateImageHash(templateImage)
        };
        locations.push(location);
      }

      return locations;
    } catch (error) {
      throw new VisualRecognitionError(
        `Visual similarity search failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Calculate visual similarity between two images
   */
  async calculateVisualSimilarity(image1: Buffer, image2: Buffer): Promise<number> {
    try {
      // Method 1: Pixel-based comparison using pixelmatch
      const pixelSimilarity = await this.calculatePixelSimilarity(image1, image2);
      
      // Method 2: Feature-based comparison using OpenCV
      const featureSimilarity = await this.calculateFeatureSimilarity(image1, image2);
      
      // Method 3: Histogram comparison
      const histogramSimilarity = await this.calculateHistogramSimilarity(image1, image2);
      
      // Combine similarities with weights
      const combinedSimilarity = (
        pixelSimilarity * 0.4 +
        featureSimilarity * 0.4 +
        histogramSimilarity * 0.2
      );

      return Math.min(1.0, Math.max(0.0, combinedSimilarity));
    } catch (error) {
      console.warn('Error calculating visual similarity:', error);
      return 0.0;
    }
  }

  /**
   * Extract visual features from an image
   */
  async extractVisualFeatures(image: Buffer): Promise<VisualFeatures> {
    try {
      const mat = await this.bufferToMat(image);
      
      // Get image dimensions
      const dimensions = { width: mat.cols, height: mat.rows };
      
      // Calculate perceptual hash
      const hash = await this.calculateImageHash(image);
      
      // Extract color histogram
      const colorHistogram = await this.extractColorHistogram(mat);
      
      // Extract edges if enabled
      let edges: number[] | undefined;
      if (this.config.enableEdgeDetection) {
        edges = await this.extractEdges(mat);
      }
      
      // Extract corner points
      const corners = await this.extractCorners(mat);

      return {
        hash,
        dimensions,
        colorHistogram,
        edges,
        corners
      };
    } catch (error) {
      throw new VisualRecognitionError(
        `Feature extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Main healing method using visual recognition
   */
  async heal(context: HealingContext): Promise<HealingResult> {
    const startTime = Date.now();
    
    try {
      // Check if we have a reference image from context
      let templateImage: Buffer;
      
      if (context.screenshot) {
        templateImage = context.screenshot;
      } else if (context.lastKnownLocation?.visualHash) {
        // Try to reconstruct from visual hash (limited capability)
        return {
          success: false,
          strategy: HealingStrategy.VISUAL_RECOGNITION,
          confidence: 0,
          error: 'Visual healing requires a reference screenshot',
          metadata: { executionTime: Date.now() - startTime }
        };
      } else {
        // Try to capture current element if selector still works partially
        try {
          templateImage = await this.captureElementImage(context.page, context.originalSelector);
        } catch (error) {
          return {
            success: false,
            strategy: HealingStrategy.VISUAL_RECOGNITION,
            confidence: 0,
            error: 'No reference image available for visual matching',
            metadata: { executionTime: Date.now() - startTime }
          };
        }
      }

      // Find visually similar elements
      const similarElements = await this.findByVisualSimilarity(
        context.page, 
        templateImage, 
        this.config.similarityThreshold
      );

      if (similarElements.length === 0) {
        return {
          success: false,
          strategy: HealingStrategy.VISUAL_RECOGNITION,
          confidence: 0,
          error: 'No visually similar elements found',
          metadata: { 
            executionTime: Date.now() - startTime,
            threshold: this.config.similarityThreshold
          }
        };
      }

      // Generate selectors for the best matches
      const alternatives: ElementSelector[] = [];
      
      for (const element of similarElements.slice(0, 5)) {
        if (element.boundingBox) {
          // Create CSS selector based on position
          const positionSelector = await this.createPositionBasedSelector(context.page, element.boundingBox);
          if (positionSelector) {
            alternatives.push({
              type: 'css',
              value: positionSelector,
              confidence: element.selectors[0].confidence || 0.5,
              metadata: { 
                strategy: 'visual-position',
                boundingBox: element.boundingBox,
                visualHash: element.visualHash
              }
            });
          }

          // Create XPath selector based on position
          const xpathSelector = await this.createXPathFromPosition(context.page, element.boundingBox);
          if (xpathSelector) {
            alternatives.push({
              type: 'xpath',
              value: xpathSelector,
              confidence: (element.selectors[0].confidence || 0.5) * 0.9,
              metadata: { 
                strategy: 'visual-xpath',
                boundingBox: element.boundingBox
              }
            });
          }
        }
      }

      if (alternatives.length === 0) {
        return {
          success: false,
          strategy: HealingStrategy.VISUAL_RECOGNITION,
          confidence: 0,
          error: 'Could not generate selectors from visual matches',
          metadata: { 
            executionTime: Date.now() - startTime,
            visualMatches: similarElements.length
          }
        };
      }

      // Test each alternative selector
      for (const alternative of alternatives) {
        const isValid = await this.validateSelector(context.page, alternative.value, alternative.type);
        
        if (isValid) {
          return {
            success: true,
            newSelector: alternative.value,
            strategy: HealingStrategy.VISUAL_RECOGNITION,
            confidence: alternative.confidence || 0.5,
            alternatives: alternatives.slice(0, 3),
            metadata: {
              executionTime: Date.now() - startTime,
              selectedStrategy: alternative.metadata?.strategy,
              visualMatches: similarElements.length,
              threshold: this.config.similarityThreshold
            }
          };
        }
      }

      return {
        success: false,
        strategy: HealingStrategy.VISUAL_RECOGNITION,
        confidence: 0,
        alternatives: alternatives.slice(0, 3),
        error: 'Generated selectors from visual matches did not work',
        metadata: {
          executionTime: Date.now() - startTime,
          visualMatches: similarElements.length,
          generatedSelectors: alternatives.length
        }
      };

    } catch (error) {
      return {
        success: false,
        strategy: HealingStrategy.VISUAL_RECOGNITION,
        confidence: 0,
        error: error instanceof Error ? error.message : 'Unknown error during visual recognition',
        metadata: { executionTime: Date.now() - startTime }
      };
    }
  }

  /**
   * Convert buffer to OpenCV matrix
   */
  private async bufferToMat(buffer: Buffer): Promise<cv.Mat> {
    try {
      // Use sharp to ensure consistent format
      const { data, info } = await sharp(buffer)
        .raw()
        .ensureAlpha(false)
        .toBuffer({ resolveWithObject: true });

      // Create OpenCV matrix from raw data
      const mat = new cv.Mat(data, info.height, info.width, cv.CV_8UC3);
      return mat;
    } catch (error) {
      throw new VisualRecognitionError(`Failed to convert buffer to OpenCV matrix: ${error}`);
    }
  }

  /**
   * Perform template matching using OpenCV
   */
  private async performTemplateMatching(
    source: cv.Mat, 
    template: cv.Mat, 
    threshold: number
  ): Promise<Array<{ x: number; y: number; width: number; height: number; confidence: number }>> {
    try {
      // Convert to grayscale for better matching
      const sourceGray = source.cvtColor(cv.COLOR_BGR2GRAY);
      const templateGray = template.cvtColor(cv.COLOR_BGR2GRAY);

      // Perform template matching
      const matchMethod = this.getOpenCVMatchMethod();
      const result = sourceGray.matchTemplate(templateGray, matchMethod);

      // Find matches above threshold
      const matches: Array<{ x: number; y: number; width: number; height: number; confidence: number }> = [];
      
      // Get template dimensions
      const templateWidth = template.cols;
      const templateHeight = template.rows;

      // Find all matches above threshold
      for (let y = 0; y < result.rows; y++) {
        for (let x = 0; x < result.cols; x++) {
          const confidence = result.at(y, x);
          
          if (confidence >= threshold) {
            matches.push({
              x,
              y,
              width: templateWidth,
              height: templateHeight,
              confidence
            });
          }
        }
      }

      // Remove overlapping matches (non-maximum suppression)
      return this.nonMaximumSuppression(matches, 0.3);
    } catch (error) {
      throw new VisualRecognitionError(`Template matching failed: ${error}`);
    }
  }

  /**
   * Calculate pixel-based similarity using pixelmatch
   */
  private async calculatePixelSimilarity(image1: Buffer, image2: Buffer): Promise<number> {
    try {
      // Resize images to same dimensions for comparison
      const { resized1, resized2, width, height } = await this.resizeToSameDimensions(image1, image2);
      
      // Convert to PNG format for pixelmatch
      const png1 = PNG.sync.read(resized1);
      const png2 = PNG.sync.read(resized2);
      
      // Calculate pixel differences
      const diff = new PNG({ width, height });
      const pixelDiff = pixelmatch(png1.data, png2.data, diff.data, width, height, { threshold: 0.1 });
      
      // Convert to similarity (0-1, where 1 is identical)
      const totalPixels = width * height;
      const similarity = 1 - (pixelDiff / totalPixels);
      
      return Math.max(0, similarity);
    } catch (error) {
      console.warn('Pixel similarity calculation failed:', error);
      return 0;
    }
  }

  /**
   * Calculate feature-based similarity using OpenCV
   */
  private async calculateFeatureSimilarity(image1: Buffer, image2: Buffer): Promise<number> {
    try {
      const mat1 = await this.bufferToMat(image1);
      const mat2 = await this.bufferToMat(image2);
      
      // Convert to grayscale
      const gray1 = mat1.cvtColor(cv.COLOR_BGR2GRAY);
      const gray2 = mat2.cvtColor(cv.COLOR_BGR2GRAY);
      
      // Extract ORB features
      const orb = new cv.ORBDetector();
      const kp1 = orb.detect(gray1);
      const kp2 = orb.detect(gray2);
      
      if (kp1.length === 0 || kp2.length === 0) {
        return 0;
      }
      
      // Compute descriptors
      const desc1 = orb.compute(gray1, kp1);
      const desc2 = orb.compute(gray2, kp2);
      
      // Match features
      const matcher = new cv.BFMatcher();
      const matches = matcher.match(desc1, desc2);
      
      // Calculate similarity based on good matches
      const goodMatches = matches.filter(match => match.distance < 50);
      const similarity = goodMatches.length / Math.max(kp1.length, kp2.length);
      
      return Math.min(1, similarity);
    } catch (error) {
      console.warn('Feature similarity calculation failed:', error);
      return 0;
    }
  }

  /**
   * Calculate histogram similarity
   */
  private async calculateHistogramSimilarity(image1: Buffer, image2: Buffer): Promise<number> {
    try {
      const mat1 = await this.bufferToMat(image1);
      const mat2 = await this.bufferToMat(image2);
      
      // Calculate histograms
      const hist1 = cv.calcHist([mat1], [0, 1, 2], new cv.Mat(), [50, 50, 50], [0, 256, 0, 256, 0, 256]);
      const hist2 = cv.calcHist([mat2], [0, 1, 2], new cv.Mat(), [50, 50, 50], [0, 256, 0, 256, 0, 256]);
      
      // Compare histograms using correlation
      const correlation = cv.compareHist(hist1, hist2, cv.HISTCMP_CORREL);
      
      return Math.max(0, correlation);
    } catch (error) {
      console.warn('Histogram similarity calculation failed:', error);
      return 0;
    }
  }

  /**
   * Calculate perceptual hash of an image
   */
  private async calculateImageHash(image: Buffer): Promise<string> {
    try {
      // Resize to 8x8 and convert to grayscale
      const { data } = await sharp(image)
        .resize(8, 8)
        .grayscale()
        .raw()
        .toBuffer({ resolveWithObject: true });
      
      // Calculate average pixel value
      const average = Array.from(data).reduce((sum, pixel) => sum + pixel, 0) / data.length;
      
      // Generate hash based on pixels above/below average
      let hash = '';
      for (const pixel of data) {
        hash += pixel >= average ? '1' : '0';
      }
      
      return hash;
    } catch (error) {
      console.warn('Image hash calculation failed:', error);
      return '';
    }
  }

  /**
   * Extract color histogram from image
   */
  private async extractColorHistogram(mat: cv.Mat): Promise<number[]> {
    try {
      const hist = cv.calcHist([mat], [0, 1, 2], new cv.Mat(), [8, 8, 8], [0, 256, 0, 256, 0, 256]);
      
      // Flatten histogram to array
      const histogram: number[] = [];
      for (let i = 0; i < hist.rows; i++) {
        for (let j = 0; j < hist.cols; j++) {
          histogram.push(hist.at(i, j));
        }
      }
      
      return histogram;
    } catch (error) {
      console.warn('Color histogram extraction failed:', error);
      return [];
    }
  }

  /**
   * Extract edges using Canny edge detection
   */
  private async extractEdges(mat: cv.Mat): Promise<number[]> {
    try {
      const gray = mat.cvtColor(cv.COLOR_BGR2GRAY);
      const edges = gray.canny(50, 150);
      
      // Count edge pixels
      const edgePixels: number[] = [];
      for (let y = 0; y < edges.rows; y++) {
        for (let x = 0; x < edges.cols; x++) {
          edgePixels.push(edges.at(y, x));
        }
      }
      
      return edgePixels;
    } catch (error) {
      console.warn('Edge extraction failed:', error);
      return [];
    }
  }

  /**
   * Extract corner points using Harris corner detection
   */
  private async extractCorners(mat: cv.Mat): Promise<Array<{ x: number; y: number }>> {
    try {
      const gray = mat.cvtColor(cv.COLOR_BGR2GRAY);
      const corners = gray.goodFeaturesToTrack(100, 0.01, 10);
      
      return corners.map(corner => ({ x: corner.x, y: corner.y }));
    } catch (error) {
      console.warn('Corner extraction failed:', error);
      return [];
    }
  }

  /**
   * Get OpenCV template matching method
   */
  private getOpenCVMatchMethod(): number {
    switch (this.config.templateMatchingMethod) {
      case 'SQDIFF':
        return cv.TM_SQDIFF_NORMED;
      case 'CCORR':
        return cv.TM_CCORR_NORMED;
      case 'CCOEFF':
      default:
        return cv.TM_CCOEFF_NORMED;
    }
  }

  /**
   * Non-maximum suppression to remove overlapping matches
   */
  private nonMaximumSuppression(
    matches: Array<{ x: number; y: number; width: number; height: number; confidence: number }>,
    overlapThreshold: number
  ): Array<{ x: number; y: number; width: number; height: number; confidence: number }> {
    if (matches.length === 0) return [];

    // Sort by confidence (highest first)
    matches.sort((a, b) => b.confidence - a.confidence);

    const selected: typeof matches = [];
    const suppressed = new Set<number>();

    for (let i = 0; i < matches.length; i++) {
      if (suppressed.has(i)) continue;

      selected.push(matches[i]);

      // Suppress overlapping matches
      for (let j = i + 1; j < matches.length; j++) {
        if (suppressed.has(j)) continue;

        const overlap = this.calculateOverlap(matches[i], matches[j]);
        if (overlap > overlapThreshold) {
          suppressed.add(j);
        }
      }
    }

    return selected;
  }

  /**
   * Calculate overlap between two bounding boxes
   */
  private calculateOverlap(
    box1: { x: number; y: number; width: number; height: number },
    box2: { x: number; y: number; width: number; height: number }
  ): number {
    const x1 = Math.max(box1.x, box2.x);
    const y1 = Math.max(box1.y, box2.y);
    const x2 = Math.min(box1.x + box1.width, box2.x + box2.width);
    const y2 = Math.min(box1.y + box1.height, box2.y + box2.height);

    if (x2 <= x1 || y2 <= y1) return 0;

    const intersectionArea = (x2 - x1) * (y2 - y1);
    const box1Area = box1.width * box1.height;
    const box2Area = box2.width * box2.height;
    const unionArea = box1Area + box2Area - intersectionArea;

    return intersectionArea / unionArea;
  }

  /**
   * Resize two images to the same dimensions
   */
  private async resizeToSameDimensions(image1: Buffer, image2: Buffer): Promise<{
    resized1: Buffer;
    resized2: Buffer;
    width: number;
    height: number;
  }> {
    const [info1, info2] = await Promise.all([
      sharp(image1).metadata(),
      sharp(image2).metadata()
    ]);

    const width = Math.min(info1.width || 100, info2.width || 100);
    const height = Math.min(info1.height || 100, info2.height || 100);

    const [resized1, resized2] = await Promise.all([
      sharp(image1).resize(width, height).png().toBuffer(),
      sharp(image2).resize(width, height).png().toBuffer()
    ]);

    return { resized1, resized2, width, height };
  }

  /**
   * Create CSS selector based on element position
   */
  private async createPositionBasedSelector(
    page: Page, 
    boundingBox: { x: number; y: number; width: number; height: number }
  ): Promise<string | null> {
    try {
      // Find element at the center of the bounding box
      const centerX = boundingBox.x + boundingBox.width / 2;
      const centerY = boundingBox.y + boundingBox.height / 2;

      const element = await page.locator(`xpath=//*`).evaluateAll((elements, { x, y }) => {
        for (const el of elements) {
          const rect = el.getBoundingClientRect();
          if (rect.left <= x && x <= rect.right && rect.top <= y && y <= rect.bottom) {
            // Generate a selector for this element
            let selector = el.tagName.toLowerCase();
            
            if (el.id) {
              return `#${el.id}`;
            }
            
            if (el.className && typeof el.className === 'string') {
              const classes = el.className.split(/\s+/).filter(Boolean);
              if (classes.length > 0) {
                selector += '.' + classes.join('.');
              }
            }
            
            return selector;
          }
        }
        return null;
      }, { x: centerX, y: centerY });

      return element || null;
    } catch (error) {
      console.warn('Failed to create position-based selector:', error);
      return null;
    }
  }

  /**
   * Create XPath selector based on element position
   */
  private async createXPathFromPosition(
    page: Page,
    boundingBox: { x: number; y: number; width: number; height: number }
  ): Promise<string | null> {
    try {
      const centerX = boundingBox.x + boundingBox.width / 2;
      const centerY = boundingBox.y + boundingBox.height / 2;

      const xpath = await page.evaluate(({ x, y }) => {
        const element = document.elementFromPoint(x, y);
        if (!element) return null;

        // Generate XPath for the element
        const getXPath = (el: Element): string => {
          if (el.id) {
            return `//*[@id='${el.id}']`;
          }
          
          if (el === document.body) {
            return '/html/body';
          }
          
          const parent = el.parentElement;
          if (!parent) return '';
          
          const siblings = Array.from(parent.children).filter(child => child.tagName === el.tagName);
          const index = siblings.indexOf(el) + 1;
          
          const parentPath = getXPath(parent);
          return `${parentPath}/${el.tagName.toLowerCase()}[${index}]`;
        };

        return getXPath(element);
      }, { x: centerX, y: centerY });

      return xpath;
    } catch (error) {
      console.warn('Failed to create XPath from position:', error);
      return null;
    }
  }

  /**
   * Validate if a selector works
   */
  private async validateSelector(page: Page, selector: string, type: string): Promise<boolean> {
    try {
      let locator;
      
      if (type === 'xpath') {
        locator = page.locator(`xpath=${selector}`);
      } else {
        locator = page.locator(selector);
      }
      
      const count = await locator.count();
      return count > 0;
    } catch (error) {
      return false;
    }
  }
}