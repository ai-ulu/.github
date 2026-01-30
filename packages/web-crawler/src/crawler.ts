import { chromium, Browser, Page, BrowserContext } from 'playwright';
import robotsParser from 'robots-parser';
import { URL } from 'url';
import pLimit from 'p-limit';
import { logger } from './utils/logger';
import { 
  CrawlerConfig, 
  CrawlResult, 
  PageInfo, 
  CrawlError, 
  SitemapEntry,
  JavaScriptError 
} from './types';

export class WebCrawler {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private config: CrawlerConfig;
  private visitedUrls = new Set<string>();
  private crawlQueue: string[] = [];
  private results: CrawlResult[] = [];
  private errors: CrawlError[] = [];
  private robotsCache = new Map<string, any>();
  private concurrencyLimit: ReturnType<typeof pLimit>;

  constructor(config: CrawlerConfig) {
    this.config = {
      maxPages: 100,
      maxDepth: 3,
      respectRobotsTxt: true,
      followRedirects: true,
      timeout: 30000,
      userAgent: 'AutoQA-Crawler/1.0',
      concurrency: 5,
      delay: 1000,
      ...config
    };
    
    this.concurrencyLimit = pLimit(this.config.concurrency || 5);
  }

  async initialize(): Promise<void> {
    try {
      this.browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });

      this.context = await this.browser.newContext({
        userAgent: this.config.userAgent || 'AutoQA-Crawler/1.0',
        viewport: { width: 1920, height: 1080 },
        ignoreHTTPSErrors: true
      });

      logger.info('Web crawler initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize web crawler', { error: (error as Error).message });
      throw error;
    }
  }

  async crawl(startUrl: string): Promise<{
    results: CrawlResult[];
    errors: CrawlError[];
    sitemap: SitemapEntry[];
  }> {
    if (!this.browser || !this.context) {
      throw new Error('Crawler not initialized. Call initialize() first.');
    }

    logger.info('Starting crawl', { startUrl, config: this.config });

    // Reset state
    this.visitedUrls.clear();
    this.crawlQueue = [startUrl];
    this.results = [];
    this.errors = [];

    const startTime = Date.now();

    try {
      // Check robots.txt for the domain
      const robotsAllowed = await this.checkRobotsTxt(startUrl);
      if (!robotsAllowed) {
        throw new Error(`Crawling not allowed by robots.txt for ${startUrl}`);
      }

      // Process crawl queue
      await this.processCrawlQueue();

      const duration = Date.now() - startTime;
      logger.info('Crawl completed', {
        pagesVisited: this.visitedUrls.size,
        errors: this.errors.length,
        duration: `${duration}ms`
      });

      // Generate sitemap
      const sitemap = this.generateSitemap();

      return {
        results: this.results,
        errors: this.errors,
        sitemap
      };
    } catch (error) {
      logger.error('Crawl failed', { error: (error as Error).message });
      throw error;
    }
  }

  private async processCrawlQueue(): Promise<void> {
    const promises: Promise<void>[] = [];

    while (this.crawlQueue.length > 0 && this.visitedUrls.size < (this.config.maxPages || 100)) {
      const url = this.crawlQueue.shift();
      if (!url || this.visitedUrls.has(url)) continue;

      promises.push(
        this.concurrencyLimit(async () => {
          await this.crawlPage(url);
          
          // Add delay between requests
          if ((this.config.delay || 0) > 0) {
            await new Promise(resolve => setTimeout(resolve, this.config.delay || 1000));
          }
        })
      );
    }

    await Promise.all(promises);
  }

  private async crawlPage(url: string): Promise<void> {
    if (this.visitedUrls.has(url) || this.visitedUrls.size >= (this.config.maxPages || 100)) {
      return;
    }

    this.visitedUrls.add(url);
    logger.debug('Crawling page', { url });

    const page = await this.context!.newPage();
    const pageInfo: PageInfo = {
      url,
      title: '',
      description: '',
      keywords: '',
      statusCode: 0,
      loadTime: 0,
      size: 0,
      links: [],
      images: [],
      forms: [],
      jsErrors: []
    };

    try {
      const startTime = Date.now();

      // Set up JavaScript error collection
      const jsErrors: JavaScriptError[] = [];
      page.on('pageerror', (error) => {
        jsErrors.push({
          message: error.message,
          stack: error.stack || '',
          url,
          timestamp: new Date().toISOString()
        });
      });

      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          jsErrors.push({
            message: msg.text(),
            stack: '',
            url,
            timestamp: new Date().toISOString()
          });
        }
      });

      // Navigate to page
      const response = await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: this.config.timeout || 30000
      });

      if (!response) {
        throw new Error('No response received');
      }

      pageInfo.statusCode = response.status();
      pageInfo.loadTime = Date.now() - startTime;

      // Check if page is accessible
      if (pageInfo.statusCode >= 400) {
        this.errors.push({
          url,
          type: 'http_error',
          message: `HTTP ${pageInfo.statusCode}`,
          timestamp: new Date().toISOString()
        });
        return;
      }

      // Extract page information
      await this.extractPageInfo(page, pageInfo);
      pageInfo.jsErrors = jsErrors;

      // Find and queue new links
      const depth = this.getUrlDepth(url);
      if (depth < (this.config.maxDepth || 3)) {
        await this.extractAndQueueLinks(page, url);
      }

      this.results.push({
        url,
        pageInfo,
        crawledAt: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Error crawling page', { url, error: (error as Error).message });
      this.errors.push({
        url,
        type: 'crawl_error',
        message: (error as Error).message,
        timestamp: new Date().toISOString()
      });
    } finally {
      await page.close();
    }
  }

  private async extractPageInfo(page: Page, pageInfo: PageInfo): Promise<void> {
    try {
      // Extract basic page info
      pageInfo.title = await page.title();
      
      // Extract meta information
      const metaDescription = await page.$eval('meta[name="description"]', 
        el => el.getAttribute('content')).catch(() => '');
      const metaKeywords = await page.$eval('meta[name="keywords"]', 
        el => el.getAttribute('content')).catch(() => '');
      
      pageInfo.description = metaDescription || '';
      pageInfo.keywords = metaKeywords || '';

      // Extract links
      const links = await page.$$eval('a[href]', anchors =>
        anchors.map(a => ({
          href: a.getAttribute('href') || '',
          text: a.textContent?.trim() || '',
          title: a.getAttribute('title') || ''
        }))
      );
      pageInfo.links = links;

      // Extract images
      const images = await page.$$eval('img[src]', imgs =>
        imgs.map(img => ({
          src: img.getAttribute('src') || '',
          alt: img.getAttribute('alt') || '',
          title: img.getAttribute('title') || ''
        }))
      );
      pageInfo.images = images;

      // Extract forms
      const forms = await page.$$eval('form', forms =>
        forms.map((form, index) => ({
          id: form.id || `form-${index}`,
          action: form.getAttribute('action') || '',
          method: form.getAttribute('method') || 'GET',
          fields: Array.from(form.querySelectorAll('input, select, textarea')).map(field => ({
            name: field.getAttribute('name') || '',
            type: field.getAttribute('type') || field.tagName.toLowerCase(),
            required: field.hasAttribute('required')
          }))
        }))
      );
      pageInfo.forms = forms;

      // Calculate page size (approximate)
      const content = await page.content();
      pageInfo.size = Buffer.byteLength(content, 'utf8');

    } catch (error) {
      logger.warn('Error extracting page info', { 
        url: pageInfo.url, 
        error: (error as Error).message 
      });
    }
  }

  private async extractAndQueueLinks(page: Page, baseUrl: string): Promise<void> {
    try {
      const links = await page.$$eval('a[href]', anchors =>
        anchors.map(a => a.getAttribute('href')).filter(Boolean)
      );

      const baseUrlObj = new URL(baseUrl);

      for (const link of links) {
        try {
          const absoluteUrl = new URL(link!, baseUrl).href;
          const linkUrlObj = new URL(absoluteUrl);

          // Only crawl same domain
          if (linkUrlObj.hostname === baseUrlObj.hostname &&
              !this.visitedUrls.has(absoluteUrl) &&
              !this.crawlQueue.includes(absoluteUrl)) {
            
            // Check robots.txt for this specific URL
            const allowed = await this.checkRobotsTxt(absoluteUrl);
            if (allowed) {
              this.crawlQueue.push(absoluteUrl);
            }
          }
        } catch (error) {
          // Invalid URL, skip
          continue;
        }
      }
    } catch (error) {
      logger.warn('Error extracting links', { 
        baseUrl, 
        error: (error as Error).message 
      });
    }
  }

  private async checkRobotsTxt(url: string): Promise<boolean> {
    if (!this.config.respectRobotsTxt) {
      return true;
    }

    try {
      const urlObj = new URL(url);
      const robotsUrl = `${urlObj.protocol}//${urlObj.host}/robots.txt`;

      // Check cache first
      if (this.robotsCache.has(robotsUrl)) {
        const robots = this.robotsCache.get(robotsUrl);
        return robots.isAllowed(url, this.config.userAgent);
      }

      // Fetch robots.txt
      const page = await this.context!.newPage();
      try {
        const response = await page.goto(robotsUrl, { timeout: 10000 });
        
        if (response && response.status() === 200) {
          const robotsContent = await page.content();
          const robots = robotsParser(robotsUrl, robotsContent);
          this.robotsCache.set(robotsUrl, robots);
          
          return robots.isAllowed(url, this.config.userAgent || '*') || false;
        }
      } finally {
        await page.close();
      }

      // If robots.txt doesn't exist, allow crawling
      return true;
    } catch (error) {
      logger.warn('Error checking robots.txt', { url, error: (error as Error).message });
      // If we can't check robots.txt, allow crawling
      return true;
    }
  }

  private getUrlDepth(url: string): number {
    try {
      const urlObj = new URL(url);
      const pathSegments = urlObj.pathname.split('/').filter(segment => segment.length > 0);
      return pathSegments.length;
    } catch {
      return 0;
    }
  }

  private generateSitemap(): SitemapEntry[] {
    return this.results.map(result => ({
      url: result.url,
      lastModified: result.crawledAt,
      changeFreq: 'weekly',
      priority: result.url === this.results[0]?.url ? 1.0 : 0.8,
      title: result.pageInfo.title,
      description: result.pageInfo.description
    }));
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.context = null;
      logger.info('Web crawler closed');
    }
  }

  // Utility methods for analysis
  getBrokenLinks(): CrawlError[] {
    return this.errors.filter(error => error.type === 'http_error');
  }

  getJavaScriptErrors(): JavaScriptError[] {
    return this.results.flatMap(result => result.pageInfo.jsErrors);
  }

  getPagesByStatusCode(statusCode: number): CrawlResult[] {
    return this.results.filter(result => result.pageInfo.statusCode === statusCode);
  }

  getStatistics() {
    const totalPages = this.results.length;
    const totalErrors = this.errors.length;
    const avgLoadTime = totalPages > 0 
      ? this.results.reduce((sum, result) => sum + result.pageInfo.loadTime, 0) / totalPages 
      : 0;
    const totalSize = this.results.reduce((sum, result) => sum + result.pageInfo.size, 0);

    return {
      totalPages,
      totalErrors,
      avgLoadTime: Math.round(avgLoadTime),
      totalSize,
      avgPageSize: totalPages > 0 ? Math.round(totalSize / totalPages) : 0,
      statusCodes: this.getStatusCodeDistribution(),
      jsErrorCount: this.getJavaScriptErrors().length
    };
  }

  private getStatusCodeDistribution(): Record<number, number> {
    const distribution: Record<number, number> = {};
    
    this.results.forEach(result => {
      const code = result.pageInfo.statusCode;
      distribution[code] = (distribution[code] || 0) + 1;
    });

    return distribution;
  }
}