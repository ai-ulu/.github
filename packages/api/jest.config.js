/** @type {import('jest').Config} */
module.exports = {
  // Test environment - use node with custom setup
  testEnvironment: 'node',
  
  // TypeScript support
  preset: 'ts-jest',
  
  // Test file patterns
  testMatch: [
    '**/__tests__/**/*.(ts|tsx|js)',
    '**/*.(test|spec).(ts|tsx|js)'
  ],
  
  // Ignore patterns
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/build/'
  ],
  
  // Module resolution
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1'
  },
  
  // Setup files - FORCE LocalStorage mock to load first
  setupFiles: [
    '<rootDir>/../../tests/setup.js'
  ],
  setupFilesAfterEnv: [
    '<rootDir>/../../jest.setup.js'
  ],
  
  // Coverage configuration - DISABLED for performance
  collectCoverage: false,
  
  // Test timeout - REDUCED for performance
  testTimeout: 5000,
  
  // Verbose output
  verbose: false,
  
  // Transform configuration
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', {
      tsconfig: 'tsconfig.json',
      isolatedModules: true
    }]
  },
  
  // Module file extensions
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  
  // ⚡ Performance optimizations
  clearMocks: true,
  restoreMocks: false,  // Don't restore for speed
  resetMocks: false,    // Don't reset for speed
  
  // Test environment options
  testEnvironmentOptions: {
    url: 'http://localhost'
  },
  
  // Global configuration
  globals: {
    'ts-jest': {
      isolatedModules: true
    }
  },
  
  // Force single worker for stability
  maxWorkers: 1
};