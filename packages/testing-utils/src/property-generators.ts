// Property-based testing generators for AutoQA Pilot
// These generators create random test data for comprehensive testing

import * as fc from 'fast-check';

/**
 * Generator for valid email addresses
 */
export const emailArbitrary = fc.emailAddress();

/**
 * Generator for valid URLs
 */
export const urlArbitrary = fc.webUrl();

/**
 * Generator for valid UUIDs
 */
export const uuidArbitrary = fc.uuid();

/**
 * Generator for valid project names
 */
export const projectNameArbitrary = fc.string({
  minLength: 1,
  maxLength: 255
}).filter(name => name.trim().length > 0);

/**
 * Generator for valid test scenario descriptions
 */
export const testDescriptionArbitrary = fc.string({
  minLength: 10,
  maxLength: 1000
});

/**
 * Generator for natural language test instructions
 */
export const naturalLanguageInstructionArbitrary = fc.oneof(
  fc.constant('Click the login button and enter credentials'),
  fc.constant('Navigate to settings and change password'),
  fc.constant('Add item to cart and proceed to checkout'),
  fc.constant('Fill out contact form and submit'),
  fc.constant('Search for product and view details'),
  fc.constant('Upload file and verify success message'),
  fc.string({ minLength: 20, maxLength: 200 })
);

/**
 * Generator for Playwright selectors
 */
export const playwrightSelectorArbitrary = fc.oneof(
  fc.string({ minLength: 1, maxLength: 50 }).map(s => `#${s}`), // ID selector
  fc.string({ minLength: 1, maxLength: 50 }).map(s => `.${s}`), // Class selector
  fc.string({ minLength: 1, maxLength: 50 }).map(s => `[data-testid="${s}"]`), // Data attribute
  fc.string({ minLength: 1, maxLength: 50 }).map(s => `button:has-text("${s}")`), // Text selector
  fc.string({ minLength: 1, maxLength: 100 }).map(s => `//xpath[contains(text(), "${s}")]`) // XPath
);

/**
 * Generator for user data
 */
export const userArbitrary = fc.record({
  id: uuidArbitrary,
  email: emailArbitrary,
  username: fc.string({ minLength: 3, maxLength: 50 }),
  githubId: fc.integer({ min: 1, max: 999999999 }),
  avatarUrl: fc.option(urlArbitrary),
  createdAt: fc.date(),
  updatedAt: fc.date()
});

/**
 * Generator for project data
 */
export const projectArbitrary = fc.record({
  id: uuidArbitrary,
  name: projectNameArbitrary,
  url: urlArbitrary,
  userId: uuidArbitrary,
  authCredentials: fc.option(fc.record({
    username: fc.string({ minLength: 1, maxLength: 100 }),
    password: fc.string({ minLength: 1, maxLength: 100 }),
    apiKey: fc.option(fc.string({ minLength: 10, maxLength: 100 }))
  })),
  settings: fc.record({
    timeout: fc.integer({ min: 1000, max: 300000 }),
    retries: fc.integer({ min: 0, max: 5 }),
    headless: fc.boolean(),
    viewport: fc.record({
      width: fc.integer({ min: 320, max: 1920 }),
      height: fc.integer({ min: 240, max: 1080 })
    })
  }),
  createdAt: fc.date(),
  updatedAt: fc.date()
});

/**
 * Generator for test scenario data
 */
export const testScenarioArbitrary = fc.record({
  id: uuidArbitrary,
  projectId: uuidArbitrary,
  name: fc.string({ minLength: 1, maxLength: 255 }),
  description: fc.option(testDescriptionArbitrary),
  naturalLanguageInput: naturalLanguageInstructionArbitrary,
  generatedCode: fc.string({ minLength: 50, maxLength: 2000 }),
  isActive: fc.boolean(),
  steps: fc.array(fc.record({
    id: uuidArbitrary,
    type: fc.oneof(
      fc.constant('navigate'),
      fc.constant('click'),
      fc.constant('fill'),
      fc.constant('select'),
      fc.constant('wait'),
      fc.constant('assert')
    ),
    selector: fc.option(playwrightSelectorArbitrary),
    value: fc.option(fc.string({ maxLength: 500 })),
    timeout: fc.option(fc.integer({ min: 1000, max: 30000 }))
  }), { minLength: 1, maxLength: 20 }),
  createdAt: fc.date(),
  updatedAt: fc.date()
});

/**
 * Generator for test execution data
 */
export const testExecutionArbitrary = fc.record({
  id: uuidArbitrary,
  scenarioId: uuidArbitrary,
  status: fc.oneof(
    fc.constant('queued'),
    fc.constant('running'),
    fc.constant('completed'),
    fc.constant('failed'),
    fc.constant('cancelled')
  ),
  startedAt: fc.option(fc.date()),
  completedAt: fc.option(fc.date()),
  duration: fc.option(fc.integer({ min: 100, max: 600000 })),
  errorMessage: fc.option(fc.string({ maxLength: 1000 })),
  screenshots: fc.array(fc.record({
    stepId: uuidArbitrary,
    url: urlArbitrary,
    timestamp: fc.date()
  }), { maxLength: 50 }),
  logs: fc.array(fc.record({
    level: fc.oneof(
      fc.constant('info'),
      fc.constant('warn'),
      fc.constant('error'),
      fc.constant('debug')
    ),
    message: fc.string({ maxLength: 500 }),
    timestamp: fc.date(),
    metadata: fc.option(fc.object())
  }), { maxLength: 100 }),
  createdAt: fc.date()
});

/**
 * Generator for API request data
 */
export const apiRequestArbitrary = fc.record({
  method: fc.oneof(
    fc.constant('GET'),
    fc.constant('POST'),
    fc.constant('PUT'),
    fc.constant('DELETE'),
    fc.constant('PATCH')
  ),
  url: fc.string({ minLength: 1, maxLength: 200 }),
  headers: fc.dictionary(
    fc.string({ minLength: 1, maxLength: 50 }),
    fc.string({ maxLength: 200 })
  ),
  body: fc.option(fc.object()),
  query: fc.option(fc.dictionary(
    fc.string({ minLength: 1, maxLength: 50 }),
    fc.string({ maxLength: 100 })
  ))
});

/**
 * Generator for webhook payload data
 */
export const webhookPayloadArbitrary = fc.record({
  event: fc.oneof(
    fc.constant('test.started'),
    fc.constant('test.completed'),
    fc.constant('test.failed'),
    fc.constant('project.created'),
    fc.constant('project.updated')
  ),
  timestamp: fc.date(),
  data: fc.object(),
  signature: fc.string({ minLength: 64, maxLength: 128 })
});

/**
 * Generator for cache key-value pairs
 */
export const cacheEntryArbitrary = fc.record({
  key: fc.string({ minLength: 1, maxLength: 250 }),
  value: fc.oneof(
    fc.string(),
    fc.integer(),
    fc.object(),
    fc.array(fc.anything())
  ),
  ttl: fc.option(fc.integer({ min: 1, max: 86400 })) // 1 second to 1 day
});

/**
 * Generator for database connection configuration
 */
export const dbConfigArbitrary = fc.record({
  host: fc.domain(),
  port: fc.integer({ min: 1024, max: 65535 }),
  database: fc.string({ minLength: 1, maxLength: 63 }),
  username: fc.string({ minLength: 1, maxLength: 63 }),
  password: fc.string({ minLength: 8, maxLength: 128 }),
  ssl: fc.boolean(),
  poolMin: fc.integer({ min: 1, max: 10 }),
  poolMax: fc.integer({ min: 10, max: 100 })
});

/**
 * Generator for error objects
 */
export const errorArbitrary = fc.record({
  code: fc.string({ minLength: 3, maxLength: 50 }),
  message: fc.string({ minLength: 10, maxLength: 200 }),
  details: fc.option(fc.object()),
  stack: fc.option(fc.string({ maxLength: 2000 })),
  timestamp: fc.date()
});

/**
 * Custom generator for valid Playwright code
 */
export const playwrightCodeArbitrary = fc.array(
  fc.oneof(
    fc.constant("await page.goto('https://example.com');"),
    fc.constant("await page.click('button[type=\"submit\"]');"),
    fc.constant("await page.fill('input[name=\"email\"]', 'test@example.com');"),
    fc.constant("await page.waitForSelector('.loading', { state: 'hidden' });"),
    fc.constant("await expect(page.locator('h1')).toBeVisible();"),
    fc.string({ minLength: 20, maxLength: 100 }).map(s => `await page.locator('${s}').click();`)
  ),
  { minLength: 1, maxLength: 10 }
).map(lines => lines.join('\n'));

/**
 * Generator for performance metrics
 */
export const performanceMetricsArbitrary = fc.record({
  responseTime: fc.integer({ min: 10, max: 10000 }),
  memoryUsage: fc.integer({ min: 1024 * 1024, max: 1024 * 1024 * 1024 }), // 1MB to 1GB
  cpuUsage: fc.float({ min: 0, max: 100 }),
  diskUsage: fc.integer({ min: 0, max: 1024 * 1024 * 1024 }),
  networkLatency: fc.integer({ min: 1, max: 1000 }),
  throughput: fc.integer({ min: 1, max: 10000 }),
  errorRate: fc.float({ min: 0, max: 1 }),
  timestamp: fc.date()
});