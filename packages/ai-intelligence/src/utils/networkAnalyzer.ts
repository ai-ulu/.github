import { NetworkLog } from '../types';

export interface NetworkAnalysis {
  hasErrors: boolean;
  errors: string[];
  slowRequests: NetworkLog[];
  failedRequests: NetworkLog[];
  suspiciousPatterns: string[];
  performance: {
    averageResponseTime: number;
    totalRequests: number;
    errorRate: number;
    slowRequestRate: number;
  };
}

export class NetworkAnalyzer {
  analyzeNetworkLogs(logs: NetworkLog[]): NetworkAnalysis {
    const errors: string[] = [];
    const slowRequests: NetworkLog[] = [];
    const failedRequests: NetworkLog[] = [];
    const suspiciousPatterns: string[] = [];

    // Define thresholds
    const SLOW_REQUEST_THRESHOLD = 5000; // 5 seconds
    const ERROR_STATUS_CODES = [400, 401, 403, 404, 500, 502, 503, 504];

    // Analyze each request
    logs.forEach(log => {
      // Check for failed requests
      if (ERROR_STATUS_CODES.includes(log.status)) {
        failedRequests.push(log);
        errors.push(`${log.method} ${log.url} returned ${log.status}`);
      }

      // Check for slow requests
      if (log.responseTime > SLOW_REQUEST_THRESHOLD) {
        slowRequests.push(log);
      }

      // Check for suspicious patterns
      this.detectSuspiciousPatterns(log, suspiciousPatterns);
    });

    // Calculate performance metrics
    const totalRequests = logs.length;
    const averageResponseTime = totalRequests > 0 
      ? logs.reduce((sum, log) => sum + log.responseTime, 0) / totalRequests 
      : 0;
    const errorRate = totalRequests > 0 ? failedRequests.length / totalRequests : 0;
    const slowRequestRate = totalRequests > 0 ? slowRequests.length / totalRequests : 0;

    return {
      hasErrors: errors.length > 0,
      errors,
      slowRequests,
      failedRequests,
      suspiciousPatterns,
      performance: {
        averageResponseTime,
        totalRequests,
        errorRate,
        slowRequestRate
      }
    };
  }

  private detectSuspiciousPatterns(log: NetworkLog, patterns: string[]): void {
    // Check for CORS issues
    if (log.status === 0 || (log.status >= 400 && log.url.includes('cors'))) {
      patterns.push(`Possible CORS issue with ${log.url}`);
    }

    // Check for rate limiting
    if (log.status === 429) {
      patterns.push(`Rate limiting detected on ${log.url}`);
    }

    // Check for authentication issues
    if (log.status === 401 || log.status === 403) {
      patterns.push(`Authentication/authorization issue with ${log.url}`);
    }

    // Check for timeout patterns
    if (log.responseTime > 30000) { // 30 seconds
      patterns.push(`Potential timeout on ${log.url}`);
    }

    // Check for redirect loops
    if (log.status >= 300 && log.status < 400) {
      const redirectCount = this.countRedirects(log.url);
      if (redirectCount > 5) {
        patterns.push(`Possible redirect loop detected for ${log.url}`);
      }
    }

    // Check for missing resources
    if (log.status === 404 && this.isStaticResource(log.url)) {
      patterns.push(`Missing static resource: ${log.url}`);
    }

    // Check for API version issues
    if (log.url.includes('/api/') && (log.status === 404 || log.status === 410)) {
      patterns.push(`Possible API version mismatch: ${log.url}`);
    }
  }

  private countRedirects(url: string): number {
    // This would typically track redirects across multiple logs
    // For now, return a placeholder value
    return 1;
  }

  private isStaticResource(url: string): boolean {
    const staticExtensions = ['.js', '.css', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.woff', '.woff2'];
    return staticExtensions.some(ext => url.toLowerCase().includes(ext));
  }

  analyzeRequestTiming(logs: NetworkLog[]): {
    dnsLookup: number;
    tcpConnect: number;
    sslHandshake: number;
    serverProcessing: number;
    contentDownload: number;
  } {
    // This would require more detailed timing information
    // For now, return estimated values based on response time
    const avgResponseTime = logs.reduce((sum, log) => sum + log.responseTime, 0) / logs.length;
    
    return {
      dnsLookup: avgResponseTime * 0.1,
      tcpConnect: avgResponseTime * 0.1,
      sslHandshake: avgResponseTime * 0.15,
      serverProcessing: avgResponseTime * 0.5,
      contentDownload: avgResponseTime * 0.15
    };
  }

  detectNetworkPatterns(logs: NetworkLog[]): {
    apiCalls: NetworkLog[];
    staticResources: NetworkLog[];
    thirdPartyRequests: NetworkLog[];
    duplicateRequests: { url: string; count: number }[];
  } {
    const apiCalls: NetworkLog[] = [];
    const staticResources: NetworkLog[] = [];
    const thirdPartyRequests: NetworkLog[] = [];
    const urlCounts = new Map<string, number>();

    logs.forEach(log => {
      // Count duplicates
      urlCounts.set(log.url, (urlCounts.get(log.url) || 0) + 1);

      // Categorize requests
      if (log.url.includes('/api/') || log.url.includes('/graphql')) {
        apiCalls.push(log);
      } else if (this.isStaticResource(log.url)) {
        staticResources.push(log);
      } else if (this.isThirdPartyRequest(log.url)) {
        thirdPartyRequests.push(log);
      }
    });

    // Find duplicate requests
    const duplicateRequests = Array.from(urlCounts.entries())
      .filter(([_, count]) => count > 1)
      .map(([url, count]) => ({ url, count }))
      .sort((a, b) => b.count - a.count);

    return {
      apiCalls,
      staticResources,
      thirdPartyRequests,
      duplicateRequests
    };
  }

  private isThirdPartyRequest(url: string): boolean {
    const thirdPartyDomains = [
      'google-analytics.com',
      'googletagmanager.com',
      'facebook.com',
      'twitter.com',
      'linkedin.com',
      'stripe.com',
      'paypal.com',
      'amazonaws.com',
      'cloudflare.com',
      'jsdelivr.net',
      'unpkg.com'
    ];

    return thirdPartyDomains.some(domain => url.includes(domain));
  }

  generateNetworkReport(logs: NetworkLog[]): {
    summary: string;
    recommendations: string[];
    criticalIssues: string[];
  } {
    const analysis = this.analyzeNetworkLogs(logs);
    const patterns = this.detectNetworkPatterns(logs);

    const summary = `
Network Analysis Summary:
- Total Requests: ${analysis.performance.totalRequests}
- Average Response Time: ${Math.round(analysis.performance.averageResponseTime)}ms
- Error Rate: ${Math.round(analysis.performance.errorRate * 100)}%
- Slow Request Rate: ${Math.round(analysis.performance.slowRequestRate * 100)}%
    `.trim();

    const recommendations: string[] = [];
    const criticalIssues: string[] = [];

    // Generate recommendations
    if (analysis.performance.errorRate > 0.1) {
      criticalIssues.push(`High error rate: ${Math.round(analysis.performance.errorRate * 100)}%`);
      recommendations.push('Investigate failed requests and implement proper error handling');
    }

    if (analysis.performance.slowRequestRate > 0.2) {
      recommendations.push('Optimize slow requests or increase timeout values');
    }

    if (patterns.duplicateRequests.length > 0) {
      recommendations.push('Implement request caching to reduce duplicate requests');
    }

    if (patterns.thirdPartyRequests.length > patterns.apiCalls.length) {
      recommendations.push('Consider reducing third-party dependencies for better performance');
    }

    if (analysis.suspiciousPatterns.length > 0) {
      criticalIssues.push(...analysis.suspiciousPatterns);
    }

    return {
      summary,
      recommendations,
      criticalIssues
    };
  }
}