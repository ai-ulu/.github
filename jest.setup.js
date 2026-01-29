// Jest setup file for AutoQA Pilot
// This file runs before each test file

// Extend Jest matchers
import 'jest-extended';

// Set up test environment variables
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://test_user:test_password@localhost:5433/autoqa_pilot_test';
process.env.REDIS_URL = 'redis://localhost:6380';
process.env.JWT_SECRET = 'test_jwt_secret_key_for_testing_only';
process.env.ENCRYPTION_KEY = 'test_encryption_key_32_characters';

// Mock external services in test environment
jest.mock('openai', () => ({
  OpenAI: jest.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: jest.fn().mockResolvedValue({
          choices: [{
            message: {
              content: 'mocked AI response'
            }
          }]
        })
      }
    }
  }))
}));

// Mock Redis in tests
jest.mock('ioredis', () => {
  const mockRedis = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    exists: jest.fn(),
    expire: jest.fn(),
    incr: jest.fn(),
    decr: jest.fn(),
    hget: jest.fn(),
    hset: jest.fn(),
    hdel: jest.fn(),
    sadd: jest.fn(),
    srem: jest.fn(),
    smembers: jest.fn(),
    zadd: jest.fn(),
    zrem: jest.fn(),
    zrange: jest.fn(),
    flushall: jest.fn(),
    quit: jest.fn(),
    disconnect: jest.fn()
  };
  
  return jest.fn(() => mockRedis);
});

// Mock MinIO/S3 client
jest.mock('minio', () => ({
  Client: jest.fn().mockImplementation(() => ({
    bucketExists: jest.fn().mockResolvedValue(true),
    makeBucket: jest.fn().mockResolvedValue(undefined),
    putObject: jest.fn().mockResolvedValue({ etag: 'mock-etag' }),
    getObject: jest.fn().mockResolvedValue(Buffer.from('mock file content')),
    removeObject: jest.fn().mockResolvedValue(undefined),
    presignedGetObject: jest.fn().mockResolvedValue('https://mock-presigned-url.com')
  }))
}));

// Mock Playwright in tests
jest.mock('playwright', () => ({
  chromium: {
    launch: jest.fn().mockResolvedValue({
      newContext: jest.fn().mockResolvedValue({
        newPage: jest.fn().mockResolvedValue({
          goto: jest.fn(),
          click: jest.fn(),
          fill: jest.fn(),
          screenshot: jest.fn().mockResolvedValue(Buffer.from('mock screenshot')),
          close: jest.fn()
        }),
        close: jest.fn()
      }),
      close: jest.fn()
    })
  }
}));

// Global test utilities
global.testUtils = {
  // Helper to create test database connection
  createTestDb: async () => {
    // This will be implemented when we set up Prisma
    return null;
  },
  
  // Helper to clean up test data
  cleanupTestData: async () => {
    // This will be implemented when we set up Prisma
    return null;
  },
  
  // Helper to create test user
  createTestUser: () => ({
    id: 'test-user-id',
    email: 'test@example.com',
    username: 'testuser',
    githubId: 12345,
    createdAt: new Date(),
    updatedAt: new Date()
  }),
  
  // Helper to create test project
  createTestProject: () => ({
    id: 'test-project-id',
    name: 'Test Project',
    url: 'https://example.com',
    userId: 'test-user-id',
    createdAt: new Date(),
    updatedAt: new Date()
  })
};

// Increase timeout for integration tests
jest.setTimeout(30000);

// Console warnings for common test issues
const originalConsoleWarn = console.warn;
console.warn = (...args) => {
  // Suppress specific warnings in tests
  const message = args[0];
  if (typeof message === 'string') {
    if (message.includes('React.createFactory')) return;
    if (message.includes('componentWillReceiveProps')) return;
    if (message.includes('componentWillMount')) return;
  }
  originalConsoleWarn.apply(console, args);
};

// Global error handler for unhandled promises
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit the process in tests, just log the error
});

// Clean up after each test
afterEach(async () => {
  // Clear all mocks
  jest.clearAllMocks();
  
  // Clean up any test data
  if (global.testUtils?.cleanupTestData) {
    await global.testUtils.cleanupTestData();
  }
});