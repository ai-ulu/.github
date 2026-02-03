import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./src/__tests__/setup.ts'],
    
    // ⚡ Performance Optimizations
    testTimeout: 5000,        // Reduce timeout (forces faster tests)
    hookTimeout: 5000,        // Faster setup/teardown
    
    // Optimize pooling
    pool: 'threads',          // Use threads instead of forks
    poolOptions: {
      threads: {
        singleThread: false,  // Parallel execution
        isolate: false        // Share context (faster but less isolated)
      }
    },
    
    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'src/__tests__/',
        '**/*.test.ts',
        '**/*.spec.ts'
      ],
      thresholds: {
        global: {
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80
        }
      },
      enabled: false  // Disable coverage for now to avoid dependency issues
    },
    
    // Optimize mock behavior
    clearMocks: true,         // Auto-clear between tests
    mockReset: false,         // Don't reset (keep implementations)
    restoreMocks: false,      // Don't restore (faster)
    
    // Optimize concurrency
    maxConcurrency: 10,       // More concurrent tests
    minThreads: 2,
    maxThreads: 4
  },
  
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@tests': path.resolve(__dirname, './src/__tests__'),
      'fast-check': require.resolve('fast-check')
    }
  }
});