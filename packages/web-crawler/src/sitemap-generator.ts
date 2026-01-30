import { SitemapEntry, CrawlResult } from './types';
import { logger } from './utils/logger';

export class SitemapGenerator {
  static generateXML(entries: SitemapEntry[]): string {
    logger.info('Generating XML sitemap', { entryCount: entries.length });

    const header = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`;

    const footer = `</urlset>`;

    const urls = entries.map(entry => {
      return `  <url>
    <loc>${this.escapeXml(entry.url)}</loc>
    <lastmod>${entry.lastModified}</lastmod>
    <changefreq>${entry.changeFreq}</changefreq>
    <priority>${entry.priority.toFixed(1)}</priority>
  </url>`;
    }).join('\n');

    return `${header}\n${urls}\n${footer}`;
  }

  static generateJSON(entries: SitemapEntry[]): string {
    logger.info('Generating JSON sitemap', { entryCount: entries.length });

    const sitemap = {
      version: '1.0',
      generatedAt: new Date().toISOString(),
      urls: entries.map(entry => ({
        url: entry.url,
        lastModified: entry.lastModified,
        changeFreq: entry.changeFreq,
        priority: entry.priority,
        title: entry.title,
        description: entry.description
      }))
    };

    return JSON.stringify(sitemap, null, 2);
  }

  static generateTXT(entries: SitemapEntry[]): string {
    logger.info('Generating TXT sitemap', { entryCount: entries.length });

    return entries.map(entry => entry.url).join('\n');
  }

  static generateHTML(entries: SitemapEntry[], siteTitle: string = 'Site Map'): string {
    logger.info('Generating HTML sitemap', { entryCount: entries.length });

    const header = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${siteTitle}</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; line-height: 1.6; }
        h1 { color: #333; border-bottom: 2px solid #333; padding-bottom: 10px; }
        .url-entry { margin: 20px 0; padding: 15px; border: 1px solid #ddd; border-radius: 5px; }
        .url-link { color: #0066cc; text-decoration: none; font-weight: bold; }
        .url-link:hover { text-decoration: underline; }
        .url-meta { color: #666; font-size: 0.9em; margin-top: 5px; }
        .url-description { margin-top: 10px; color: #444; }
        .stats { background: #f5f5f5; padding: 15px; border-radius: 5px; margin-bottom: 30px; }
    </style>
</head>
<body>
    <h1>${siteTitle}</h1>
    <div class="stats">
        <strong>Total Pages:</strong> ${entries.length}<br>
        <strong>Generated:</strong> ${new Date().toLocaleString()}
    </div>`;

    const footer = `</body>
</html>`;

    const urlEntries = entries.map(entry => {
      return `    <div class="url-entry">
        <a href="${this.escapeHtml(entry.url)}" class="url-link">${this.escapeHtml(entry.title || entry.url)}</a>
        <div class="url-meta">
            Last Modified: ${new Date(entry.lastModified).toLocaleDateString()} | 
            Priority: ${entry.priority.toFixed(1)} | 
            Change Frequency: ${entry.changeFreq}
        </div>
        ${entry.description ? `<div class="url-description">${this.escapeHtml(entry.description)}</div>` : ''}
    </div>`;
    }).join('\n');

    return `${header}\n${urlEntries}\n${footer}`;
  }

  static fromCrawlResults(results: CrawlResult[]): SitemapEntry[] {
    return results.map(result => ({
      url: result.url,
      lastModified: result.crawledAt,
      changeFreq: 'weekly' as const,
      priority: this.calculatePriority(result),
      title: result.pageInfo.title,
      description: result.pageInfo.description
    }));
  }

  private static calculatePriority(result: CrawlResult): number {
    // Homepage gets highest priority
    if (result.url.endsWith('/') && (result.depth || 0) === 0) {
      return 1.0;
    }

    // Calculate priority based on depth and other factors
    const depth = result.depth || 0;
    let priority = Math.max(0.1, 1.0 - (depth * 0.2));

    // Boost priority for pages with good SEO indicators
    if (result.pageInfo.title && result.pageInfo.description) {
      priority += 0.1;
    }

    // Boost priority for pages with many internal links
    const internalLinks = result.pageInfo.links.filter(link => 
      !link.href.startsWith('http') || link.href.includes(new URL(result.url).hostname)
    ).length;
    
    if (internalLinks > 10) {
      priority += 0.1;
    }

    return Math.min(1.0, Math.max(0.1, priority));
  }

  private static escapeXml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  private static escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  static generateRobotsTxt(sitemapUrl: string, userAgent: string = '*'): string {
    return `User-agent: ${userAgent}
Allow: /

Sitemap: ${sitemapUrl}`;
  }

  static validateSitemap(entries: SitemapEntry[]): {
    isValid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check entry count
    if (entries.length === 0) {
      errors.push('Sitemap is empty');
    }

    if (entries.length > 50000) {
      errors.push('Sitemap exceeds maximum of 50,000 URLs');
    }

    // Validate each entry
    entries.forEach((entry, index) => {
      // Validate URL
      try {
        new URL(entry.url);
      } catch {
        errors.push(`Invalid URL at index ${index}: ${entry.url}`);
      }

      // Validate priority
      if (entry.priority < 0 || entry.priority > 1) {
        errors.push(`Invalid priority at index ${index}: ${entry.priority}`);
      }

      // Validate change frequency
      const validFreqs = ['always', 'hourly', 'daily', 'weekly', 'monthly', 'yearly', 'never'];
      if (!validFreqs.includes(entry.changeFreq)) {
        errors.push(`Invalid change frequency at index ${index}: ${entry.changeFreq}`);
      }

      // Validate last modified date
      if (isNaN(Date.parse(entry.lastModified))) {
        errors.push(`Invalid last modified date at index ${index}: ${entry.lastModified}`);
      }

      // Check for missing title
      if (!entry.title || entry.title.trim() === '') {
        warnings.push(`Missing title for URL: ${entry.url}`);
      }

      // Check for missing description
      if (!entry.description || entry.description.trim() === '') {
        warnings.push(`Missing description for URL: ${entry.url}`);
      }
    });

    // Check for duplicate URLs
    const urlSet = new Set();
    const duplicates: string[] = [];
    
    entries.forEach(entry => {
      if (urlSet.has(entry.url)) {
        duplicates.push(entry.url);
      } else {
        urlSet.add(entry.url);
      }
    });

    if (duplicates.length > 0) {
      errors.push(`Duplicate URLs found: ${duplicates.join(', ')}`);
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }
}