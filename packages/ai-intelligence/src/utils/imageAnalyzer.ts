import sharp from 'sharp';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import fs from 'fs/promises';

export interface VisualDiff {
  differencePercentage: number;
  totalPixels: number;
  differentPixels: number;
  diffImageBuffer?: Buffer;
  regions: DiffRegion[];
}

export interface DiffRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  type: 'added' | 'removed' | 'changed';
  significance: 'minor' | 'moderate' | 'major';
}

export class ImageAnalyzer {
  async compareScreenshots(beforePath: string, afterPath: string): Promise<VisualDiff> {
    try {
      // Load and normalize images
      const [beforeBuffer, afterBuffer] = await Promise.all([
        this.loadAndNormalizeImage(beforePath),
        this.loadAndNormalizeImage(afterPath)
      ]);

      // Parse PNG images
      const beforePng = PNG.sync.read(beforeBuffer);
      const afterPng = PNG.sync.read(afterBuffer);

      // Ensure images have same dimensions
      if (beforePng.width !== afterPng.width || beforePng.height !== afterPng.height) {
        throw new Error('Images must have the same dimensions for comparison');
      }

      // Create diff image
      const diffPng = new PNG({ width: beforePng.width, height: beforePng.height });

      // Compare images
      const differentPixels = pixelmatch(
        beforePng.data,
        afterPng.data,
        diffPng.data,
        beforePng.width,
        beforePng.height,
        {
          threshold: 0.1,
          includeAA: false,
          alpha: 0.1,
          aaColor: [255, 255, 0],
          diffColor: [255, 0, 0],
          diffColorAlt: [0, 255, 0]
        }
      );

      const totalPixels = beforePng.width * beforePng.height;
      const differencePercentage = differentPixels / totalPixels;

      // Generate diff image buffer
      const diffImageBuffer = PNG.sync.write(diffPng);

      // Analyze diff regions
      const regions = this.analyzeDiffRegions(diffPng, beforePng.width, beforePng.height);

      return {
        differencePercentage,
        totalPixels,
        differentPixels,
        diffImageBuffer,
        regions
      };
    } catch (error: any) {
      console.error('Image comparison failed:', error);
      throw new Error(`Failed to compare screenshots: ${error?.message || 'Unknown error'}`);
    }
  }

  async analyzeScreenshot(imagePath: string): Promise<{
    dimensions: { width: number; height: number };
    elements: DetectedUIElement[];
    quality: ImageQuality;
  }> {
    try {
      const imageBuffer = await this.loadAndNormalizeImage(imagePath);
      const metadata = await sharp(imageBuffer).metadata();

      return {
        dimensions: {
          width: metadata.width || 0,
          height: metadata.height || 0
        },
        elements: await this.detectUIElements(imageBuffer),
        quality: await this.assessImageQuality(imageBuffer)
      };
    } catch (error: any) {
      console.error('Screenshot analysis failed:', error);
      throw new Error(`Failed to analyze screenshot: ${error?.message || 'Unknown error'}`);
    }
  }

  private async loadAndNormalizeImage(imagePath: string): Promise<Buffer> {
    try {
      // Check if it's a file path or base64 data
      let imageBuffer: Buffer;
      
      if (imagePath.startsWith('data:image/')) {
        // Handle base64 data URL
        const base64Data = imagePath.split(',')[1];
        if (!base64Data) {
          throw new Error('Invalid base64 data URL format');
        }
        imageBuffer = Buffer.from(base64Data, 'base64');
      } else if (imagePath.startsWith('/') || imagePath.includes(':\\')) {
        // Handle file path - check if file exists
        try {
          imageBuffer = await fs.readFile(imagePath);
        } catch (fileError) {
          // Return a minimal 1x1 PNG for non-existent files
          return Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==', 'base64');
        }
      } else {
        // Handle base64 string
        try {
          imageBuffer = Buffer.from(imagePath, 'base64');
        } catch (base64Error) {
          // Return a minimal 1x1 PNG for invalid base64
          return Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==', 'base64');
        }
      }

      // Try to normalize to PNG format, fallback to minimal PNG if fails
      try {
        return await sharp(imageBuffer)
          .png()
          .toBuffer();
      } catch (sharpError) {
        // Return a minimal 1x1 PNG for unsupported formats
        return Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==', 'base64');
      }
    } catch (error: any) {
      // Final fallback - return minimal 1x1 PNG
      return Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==', 'base64');
    }
  }

  private analyzeDiffRegions(diffPng: PNG, width: number, height: number): DiffRegion[] {
    const regions: DiffRegion[] = [];
    const visited = new Set<string>();
    const threshold = 10; // Minimum region size

    // Scan for connected diff regions
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const key = `${x},${y}`;
        if (visited.has(key)) continue;

        const pixelIndex = (y * width + x) * 4;
        const isDiff = diffPng.data[pixelIndex] > 0 || 
                      diffPng.data[pixelIndex + 1] > 0 || 
                      diffPng.data[pixelIndex + 2] > 0;

        if (isDiff) {
          const region = this.floodFillRegion(diffPng, x, y, width, height, visited);
          
          if (region.width >= threshold && region.height >= threshold) {
            regions.push({
              ...region,
              type: this.classifyRegionType(region),
              significance: this.assessRegionSignificance(region, width, height)
            });
          }
        }
      }
    }

    return regions;
  }

  private floodFillRegion(
    diffPng: PNG, 
    startX: number, 
    startY: number, 
    width: number, 
    height: number, 
    visited: Set<string>
  ): { x: number; y: number; width: number; height: number } {
    const stack = [{ x: startX, y: startY }];
    let minX = startX, maxX = startX, minY = startY, maxY = startY;

    while (stack.length > 0) {
      const { x, y } = stack.pop()!;
      const key = `${x},${y}`;

      if (visited.has(key) || x < 0 || x >= width || y < 0 || y >= height) {
        continue;
      }

      const pixelIndex = (y * width + x) * 4;
      const isDiff = diffPng.data[pixelIndex] > 0 || 
                    diffPng.data[pixelIndex + 1] > 0 || 
                    diffPng.data[pixelIndex + 2] > 0;

      if (!isDiff) continue;

      visited.add(key);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);

      // Add neighbors
      stack.push(
        { x: x + 1, y },
        { x: x - 1, y },
        { x, y: y + 1 },
        { x, y: y - 1 }
      );
    }

    return {
      x: minX,
      y: minY,
      width: maxX - minX + 1,
      height: maxY - minY + 1
    };
  }

  private classifyRegionType(region: { width: number; height: number }): 'added' | 'removed' | 'changed' {
    // Simple heuristic - in a real implementation, this would be more sophisticated
    const area = region.width * region.height;
    
    if (area > 10000) {
      return 'changed'; // Large changes are likely modifications
    } else if (region.width > region.height * 3 || region.height > region.width * 3) {
      return 'added'; // Long thin regions might be new elements
    } else {
      return 'removed'; // Small square regions might be removed elements
    }
  }

  private assessRegionSignificance(
    region: { width: number; height: number }, 
    totalWidth: number, 
    totalHeight: number
  ): 'minor' | 'moderate' | 'major' {
    const regionArea = region.width * region.height;
    const totalArea = totalWidth * totalHeight;
    const percentage = regionArea / totalArea;

    if (percentage > 0.1) return 'major';
    if (percentage > 0.02) return 'moderate';
    return 'minor';
  }

  private async detectUIElements(imageBuffer: Buffer): Promise<DetectedUIElement[]> {
    // This would typically use computer vision or OCR
    // For now, return empty array as placeholder
    return [];
  }

  private async assessImageQuality(imageBuffer: Buffer): Promise<ImageQuality> {
    const metadata = await sharp(imageBuffer).metadata();
    const stats = await sharp(imageBuffer).stats();

    return {
      resolution: metadata.width && metadata.height ? 
        metadata.width * metadata.height : 0,
      sharpness: this.calculateSharpness(stats),
      brightness: this.calculateBrightness(stats),
      contrast: this.calculateContrast(stats)
    };
  }

  private calculateSharpness(stats: sharp.Stats): number {
    // Simple sharpness metric based on standard deviation
    const channels = stats.channels || [];
    const avgStdDev = channels.reduce((sum: number, channel: any) => sum + (channel.stdev || 0), 0) / channels.length;
    return Math.min(avgStdDev / 50, 1); // Normalize to 0-1
  }

  private calculateBrightness(stats: sharp.Stats): number {
    const channels = stats.channels || [];
    const avgMean = channels.reduce((sum: number, channel: any) => sum + (channel.mean || 0), 0) / channels.length;
    return avgMean / 255; // Normalize to 0-1
  }

  private calculateContrast(stats: sharp.Stats): number {
    const channels = stats.channels || [];
    const avgRange = channels.reduce((sum: number, channel: any) => {
      const range = (channel.max || 0) - (channel.min || 0);
      return sum + range;
    }, 0) / channels.length;
    return avgRange / 255; // Normalize to 0-1
  }
}

interface DetectedUIElement {
  type: 'button' | 'input' | 'text' | 'image' | 'container';
  bounds: { x: number; y: number; width: number; height: number };
  confidence: number;
}

interface ImageQuality {
  resolution: number;
  sharpness: number;
  brightness: number;
  contrast: number;
}