import { 
  CrawlResult, 
  CrawlError, 
  LinkAnalysis, 
  SEOAnalysis, 
  PerformanceAnalysis, 
  SecurityAnalysis,
  AccessibilityAnalysis,
  AccessibilityIssue,
  TechnologyStack,
  ContentAnalysis,
  CrawlReport,
  CrawlSession
} from './types';
import { logger } from './utils/logger';

export class CrawlerAnalyzer {
  private results: CrawlResult[];
  private errors: CrawlError[];

  constructor(results: CrawlResult[], errors: CrawlError[]) {
    this.results = results;
    this.errors = errors;
  }

  generateReport(session: CrawlSession): CrawlReport {
    logger.info('Generating comprehensive crawl report');

    return {
      session,
      linkAnalysis: this.analyzeLinkStructure(),
      seoAnalysis: this.analyzeSEO(),
      performanceAnalysis: this.analyzePerformance(),
      securityAnalysis: this.analyzeSecurity(),
      accessibilityAnalysis: this.analyzeAccessibility(),
      technologyStack: this.detectTechnologyStack(),
      contentAnalysis: this.analyzeContent(),
      generatedAt: new Date().toISOString()
    };
  }

  analyzeLinkStructure(): LinkAnalysis {
    const allLinks = this.results.flatMap(result => result.pageInfo.links);
    const internalLinks = allLinks.filter(link => !this.isExternalLink(link.href));
    const externalLinks = allLinks.filter(link => this.isExternalLink(link.href));
    
    // Find broken links from errors
    const brokenLinks = this.errors
      .filter(error => error.type === 'http_error')
      .map(error => ({
        href: error.url,
        text: '',
        title: '',
        isBroken: true
      }));

    // Find redirect links (simplified)
    const redirectLinks = this.results
      .filter(result => result.pageInfo.redirectChain && result.pageInfo.redirectChain.length > 1)
      .map(result => ({
        href: result.url,
        text: '',
        title: '',
        isExternal: false
      }));

    // Find email and phone links
    const emailLinks = allLinks.filter(link => link.href.startsWith('mailto:'));
    const phoneLinks = allLinks.filter(link => link.href.startsWith('tel:'));

    return {
      totalLinks: allLinks.length,
      internalLinks: internalLinks.length,
      externalLinks: externalLinks.length,
      brokenLinks,
      redirectLinks,
      emailLinks,
      phoneLinks
    };
  }

  analyzeSEO(): SEOAnalysis {
    const pagesWithoutTitle = this.results
      .filter(result => !result.pageInfo.title || result.pageInfo.title.trim() === '')
      .map(result => result.url);

    const pagesWithoutDescription = this.results
      .filter(result => !result.pageInfo.description || result.pageInfo.description.trim() === '')
      .map(result => result.url);

    // Find duplicate titles
    const titleMap = new Map<string, string[]>();
    this.results.forEach(result => {
      const title = result.pageInfo.title.trim();
      if (title) {
        if (!titleMap.has(title)) {
          titleMap.set(title, []);
        }
        titleMap.get(title)!.push(result.url);
      }
    });

    const duplicateTitles: Record<string, string[]> = {};
    titleMap.forEach((urls, title) => {
      if (urls.length > 1) {
        duplicateTitles[title] = urls;
      }
    });

    // Find duplicate descriptions
    const descriptionMap = new Map<string, string[]>();
    this.results.forEach(result => {
      const description = result.pageInfo.description.trim();
      if (description) {
        if (!descriptionMap.has(description)) {
          descriptionMap.set(description, []);
        }
        descriptionMap.get(description)!.push(result.url);
      }
    });

    const duplicateDescriptions: Record<string, string[]> = {};
    descriptionMap.forEach((urls, description) => {
      if (urls.length > 1) {
        duplicateDescriptions[description] = urls;
      }
    });

    // Find long titles (>60 characters)
    const longTitles = this.results
      .filter(result => result.pageInfo.title.length > 60)
      .map(result => ({
        url: result.url,
        title: result.pageInfo.title,
        length: result.pageInfo.title.length
      }));

    // Find short descriptions (<120 characters)
    const shortDescriptions = this.results
      .filter(result => result.pageInfo.description.length > 0 && result.pageInfo.description.length < 120)
      .map(result => ({
        url: result.url,
        description: result.pageInfo.description,
        length: result.pageInfo.description.length
      }));

    return {
      pagesWithoutTitle,
      pagesWithoutDescription,
      duplicateTitles,
      duplicateDescriptions,
      longTitles,
      shortDescriptions
    };
  }

  analyzePerformance(): PerformanceAnalysis {
    // Sort by load time
    const sortedByLoadTime = [...this.results].sort((a, b) => b.pageInfo.loadTime - a.pageInfo.loadTime);
    const slowestPages = sortedByLoadTime.slice(0, 10).map(result => ({
      url: result.url,
      loadTime: result.pageInfo.loadTime
    }));

    // Sort by size
    const sortedBySize = [...this.results].sort((a, b) => b.pageInfo.size - a.pageInfo.size);
    const largestPages = sortedBySize.slice(0, 10).map(result => ({
      url: result.url,
      size: result.pageInfo.size
    }));

    // Average load time by depth
    const avgLoadTimeByDepth: Record<number, number> = {};
    const depthGroups = new Map<number, number[]>();

    this.results.forEach(result => {
      const depth = result.depth || 0;
      if (!depthGroups.has(depth)) {
        depthGroups.set(depth, []);
      }
      depthGroups.get(depth)!.push(result.pageInfo.loadTime);
    });

    depthGroups.forEach((loadTimes, depth) => {
      avgLoadTimeByDepth[depth] = loadTimes.reduce((sum, time) => sum + time, 0) / loadTimes.length;
    });

    // Calculate performance score (0-100)
    const avgLoadTime = this.results.reduce((sum, result) => sum + result.pageInfo.loadTime, 0) / this.results.length;
    const performanceScore = Math.max(0, Math.min(100, 100 - (avgLoadTime / 50))); // 50ms = 1 point deduction

    return {
      slowestPages,
      largestPages,
      avgLoadTimeByDepth,
      performanceScore: Math.round(performanceScore)
    };
  }

  analyzeSecurity(): SecurityAnalysis {
    const httpPages = this.results
      .filter(result => result.url.startsWith('http://'))
      .map(result => result.url);

    // Find pages with mixed content (HTTPS pages with HTTP resources)
    const mixedContentPages = this.results
      .filter(result => {
        if (!result.url.startsWith('https://')) return false;
        
        // Check if any images or links use HTTP
        const hasHttpImages = result.pageInfo.images.some(img => img.src.startsWith('http://'));
        const hasHttpLinks = result.pageInfo.links.some(link => link.href.startsWith('http://'));
        
        return hasHttpImages || hasHttpLinks;
      })
      .map(result => result.url);

    // Find insecure links
    const insecureLinks = this.results
      .flatMap(result => result.pageInfo.links)
      .filter(link => link.href.startsWith('http://'))
      .slice(0, 50); // Limit to first 50

    // Check for missing security headers (simplified)
    const missingSecurityHeaders = this.results
      .filter(result => {
        const headers = result.pageInfo.headers || {};
        const securityHeaders = [
          'strict-transport-security',
          'content-security-policy',
          'x-frame-options',
          'x-content-type-options'
        ];
        
        const missing = securityHeaders.filter(header => !headers[header]);
        return missing.length > 0;
      })
      .map(result => ({
        url: result.url,
        missingHeaders: [
          'strict-transport-security',
          'content-security-policy',
          'x-frame-options',
          'x-content-type-options'
        ].filter(header => !(result.pageInfo.headers || {})[header])
      }));

    return {
      httpPages,
      mixedContentPages,
      insecureLinks,
      missingSecurityHeaders
    };
  }

  analyzeAccessibility(): AccessibilityAnalysis {
    const issues: AccessibilityIssue[] = [];

    this.results.forEach(result => {
      // Check for images without alt text
      result.pageInfo.images.forEach(image => {
        if (!image.alt || image.alt.trim() === '') {
          issues.push({
            url: result.url,
            type: 'missing_alt',
            element: `<img src="${image.src}">`,
            message: 'Image missing alt attribute',
            severity: 'medium'
          });
        }
      });

      // Check for forms without labels (simplified)
      result.pageInfo.forms.forEach(form => {
        form.fields.forEach(field => {
          if (field.type === 'text' || field.type === 'email' || field.type === 'password') {
            if (!field.name || field.name.trim() === '') {
              issues.push({
                url: result.url,
                type: 'missing_label',
                element: `<input type="${field.type}">`,
                message: 'Form field missing name/label',
                severity: 'high'
              });
            }
          }
        });
      });

      // Check for missing page title
      if (!result.pageInfo.title || result.pageInfo.title.trim() === '') {
        issues.push({
          url: result.url,
          type: 'missing_heading',
          element: '<title>',
          message: 'Page missing title',
          severity: 'critical'
        });
      }
    });

    // Calculate accessibility score
    const totalElements = this.results.reduce((sum, result) => 
      sum + result.pageInfo.images.length + 
      result.pageInfo.forms.reduce((formSum, form) => formSum + form.fields.length, 0), 0
    );
    
    const score = totalElements > 0 ? Math.max(0, 100 - (issues.length / totalElements * 100)) : 100;

    // Group issues by type
    const issuesByType: Record<string, number> = {};
    issues.forEach(issue => {
      issuesByType[issue.type] = (issuesByType[issue.type] || 0) + 1;
    });

    return {
      issues,
      score: Math.round(score),
      pagesWithIssues: new Set(issues.map(issue => issue.url)).size,
      totalIssues: issues.length,
      issuesByType
    };
  }

  detectTechnologyStack(): TechnologyStack {
    // This is a simplified implementation
    // In a real scenario, you'd analyze HTML, headers, and JavaScript to detect technologies
    
    const frameworks: string[] = [];
    const libraries: string[] = [];
    const analytics: string[] = [];
    const cms: string[] = [];
    const servers: string[] = [];
    const languages: string[] = [];

    // Analyze page content for technology indicators
    this.results.forEach(result => {
      // Check for common frameworks in page content (simplified)
      const pageContent = result.pageInfo.title + ' ' + result.pageInfo.description;
      
      if (pageContent.toLowerCase().includes('react')) frameworks.push('React');
      if (pageContent.toLowerCase().includes('vue')) frameworks.push('Vue.js');
      if (pageContent.toLowerCase().includes('angular')) frameworks.push('Angular');
      
      // Check headers for server information
      const headers = result.pageInfo.headers || {};
      if (headers['server']) {
        servers.push(headers['server']);
      }
    });

    return {
      frameworks: [...new Set(frameworks)],
      libraries: [...new Set(libraries)],
      analytics: [...new Set(analytics)],
      cms: [...new Set(cms)],
      servers: [...new Set(servers)],
      languages: [...new Set(languages)]
    };
  }

  analyzeContent(): ContentAnalysis {
    // Word count analysis
    const wordCount: Record<string, number> = {};
    
    this.results.forEach(result => {
      const text = (result.pageInfo.title + ' ' + result.pageInfo.description).toLowerCase();
      const words = text.match(/\b\w+\b/g) || [];
      
      words.forEach(word => {
        if (word.length > 3) { // Only count words longer than 3 characters
          wordCount[word] = (wordCount[word] || 0) + 1;
        }
      });
    });

    // Get top 20 most common words
    const sortedWords = Object.entries(wordCount)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 20)
      .reduce((obj, [word, count]) => ({ ...obj, [word]: count }), {});

    // Heading structure analysis (simplified)
    const headingStructure: Record<string, Array<{ level: number; text: string }>> = {};
    
    this.results.forEach(result => {
      headingStructure[result.url] = [
        { level: 1, text: result.pageInfo.title }
      ];
    });

    // Image optimization analysis
    const imageOptimization = this.results.map(result => ({
      url: result.url,
      unoptimizedImages: result.pageInfo.images.filter(img => 
        !img.src.includes('.webp') && !img.src.includes('.avif')
      ).length
    }));

    // Content duplication (simplified - based on title similarity)
    const contentDuplication: Array<{ urls: string[]; similarity: number }> = [];
    
    return {
      wordCount: sortedWords,
      headingStructure,
      imageOptimization,
      contentDuplication
    };
  }

  private isExternalLink(href: string): boolean {
    try {
      const url = new URL(href);
      const baseUrl = new URL(this.results[0]?.url || '');
      return url.hostname !== baseUrl.hostname;
    } catch {
      return false;
    }
  }
}