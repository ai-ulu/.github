export interface CrawlerConfig {
  maxPages?: number;
  maxDepth?: number;
  respectRobotsTxt?: boolean;
  followRedirects?: boolean;
  timeout?: number;
  userAgent?: string;
  concurrency?: number;
  delay?: number;
  includePatterns?: string[];
  excludePatterns?: string[];
  customHeaders?: Record<string, string>;
}

export interface PageInfo {
  url: string;
  title: string;
  description: string;
  keywords: string;
  statusCode: number;
  loadTime: number;
  size: number;
  links: LinkInfo[];
  images: ImageInfo[];
  forms: FormInfo[];
  jsErrors: JavaScriptError[];
  headers?: Record<string, string>;
  redirectChain?: string[];
}

export interface LinkInfo {
  href: string;
  text: string;
  title: string;
  isExternal?: boolean;
  isBroken?: boolean;
}

export interface ImageInfo {
  src: string;
  alt: string;
  title: string;
  width?: number;
  height?: number;
  size?: number;
}

export interface FormInfo {
  id: string;
  action: string;
  method: string;
  fields: FormFieldInfo[];
}

export interface FormFieldInfo {
  name: string;
  type: string;
  required: boolean;
  placeholder?: string;
  value?: string;
}

export interface JavaScriptError {
  message: string;
  stack: string;
  url: string;
  timestamp: string;
  lineNumber?: number;
  columnNumber?: number;
}

export interface CrawlResult {
  url: string;
  pageInfo: PageInfo;
  crawledAt: string;
  depth?: number;
  parentUrl?: string;
}

export interface CrawlError {
  url: string;
  type: 'http_error' | 'timeout' | 'crawl_error' | 'robots_blocked' | 'network_error';
  message: string;
  timestamp: string;
  statusCode?: number;
  parentUrl?: string;
}

export interface SitemapEntry {
  url: string;
  lastModified: string;
  changeFreq: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
  priority: number;
  title?: string;
  description?: string;
}

export interface CrawlSession {
  id: string;
  startUrl: string;
  config: CrawlerConfig;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  startTime: string;
  endTime?: string;
  results: CrawlResult[];
  errors: CrawlError[];
  sitemap: SitemapEntry[];
  statistics: CrawlStatistics;
}

export interface CrawlStatistics {
  totalPages: number;
  totalErrors: number;
  avgLoadTime: number;
  totalSize: number;
  avgPageSize: number;
  statusCodes: Record<number, number>;
  jsErrorCount: number;
  brokenLinksCount: number;
  uniqueDomains: number;
  crawlDuration: number;
}

export interface RobotsInfo {
  url: string;
  content: string;
  isAllowed: boolean;
  disallowedPaths: string[];
  crawlDelay?: number;
  sitemap?: string[];
}

export interface CrawlerEvent {
  type: 'page_crawled' | 'error' | 'progress' | 'completed' | 'cancelled';
  data: any;
  timestamp: string;
}

export interface CrawlProgress {
  totalPages: number;
  crawledPages: number;
  queuedPages: number;
  errors: number;
  currentUrl?: string;
  estimatedTimeRemaining?: number;
}

// Analysis types
export interface LinkAnalysis {
  totalLinks: number;
  internalLinks: number;
  externalLinks: number;
  brokenLinks: LinkInfo[];
  redirectLinks: LinkInfo[];
  emailLinks: LinkInfo[];
  phoneLinks: LinkInfo[];
}

export interface SEOAnalysis {
  pagesWithoutTitle: string[];
  pagesWithoutDescription: string[];
  duplicateTitles: Record<string, string[]>;
  duplicateDescriptions: Record<string, string[]>;
  longTitles: Array<{ url: string; title: string; length: number }>;
  shortDescriptions: Array<{ url: string; description: string; length: number }>;
}

export interface PerformanceAnalysis {
  slowestPages: Array<{ url: string; loadTime: number }>;
  largestPages: Array<{ url: string; size: number }>;
  avgLoadTimeByDepth: Record<number, number>;
  performanceScore: number;
}

export interface SecurityAnalysis {
  httpPages: string[];
  mixedContentPages: string[];
  insecureLinks: LinkInfo[];
  missingSecurityHeaders: Array<{ url: string; missingHeaders: string[] }>;
}

export interface AccessibilityIssue {
  url: string;
  type: 'missing_alt' | 'missing_label' | 'low_contrast' | 'missing_heading' | 'invalid_markup';
  element: string;
  message: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface AccessibilityAnalysis {
  issues: AccessibilityIssue[];
  score: number;
  pagesWithIssues: number;
  totalIssues: number;
  issuesByType: Record<string, number>;
}

export interface TechnologyStack {
  frameworks: string[];
  libraries: string[];
  analytics: string[];
  cms: string[];
  servers: string[];
  languages: string[];
}

export interface ContentAnalysis {
  wordCount: Record<string, number>;
  headingStructure: Record<string, Array<{ level: number; text: string }>>;
  imageOptimization: Array<{ url: string; unoptimizedImages: number }>;
  contentDuplication: Array<{ urls: string[]; similarity: number }>;
}

export interface CrawlReport {
  session: CrawlSession;
  linkAnalysis: LinkAnalysis;
  seoAnalysis: SEOAnalysis;
  performanceAnalysis: PerformanceAnalysis;
  securityAnalysis: SecurityAnalysis;
  accessibilityAnalysis: AccessibilityAnalysis;
  technologyStack: TechnologyStack;
  contentAnalysis: ContentAnalysis;
  generatedAt: string;
}