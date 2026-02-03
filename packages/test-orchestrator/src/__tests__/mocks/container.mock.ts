import { vi } from 'vitest';

// Gerçekçi Container ID formatı (Docker SHA256)
export const mockContainer = {
  id: 'sha256:1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
  shortId: '1234567890ab', // İlk 12 karakter
  
  start: vi.fn().mockResolvedValue(undefined),
  stop: vi.fn().mockResolvedValue(undefined),
  remove: vi.fn().mockResolvedValue(undefined),
  
  exec: vi.fn().mockResolvedValue({
    exitCode: 0,
    output: 'Test execution completed',
    stderr: '',
    stdout: 'All tests passed'
  }),
  
  getStats: vi.fn().mockResolvedValue({
    cpu_stats: {
      cpu_usage: {
        total_usage: 1000000000,
        usage_in_kernelmode: 200000000,
        usage_in_usermode: 800000000
      },
      system_cpu_usage: 2000000000
    },
    memory_stats: {
      usage: 512 * 1024 * 1024,
      max_usage: 1024 * 1024 * 1024,
      limit: 2 * 1024 * 1024 * 1024
    },
    networks: {
      eth0: {
        rx_bytes: 1000,
        tx_bytes: 1000
      }
    }
  }),
  
  inspect: vi.fn().mockResolvedValue({
    Id: 'sha256:1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    State: {
      Status: 'running',
      Running: true,
      Paused: false,
      Restarting: false,
      OOMKilled: false,
      Dead: false,
      Pid: 12345,
      ExitCode: 0,
      StartedAt: new Date().toISOString(),
      FinishedAt: '0001-01-01T00:00:00Z'
    },
    Config: {
      Image: 'test-runner:latest',
      Env: [
        'NODE_ENV=test',
        'CI=true'
      ],
      Cmd: ['npm', 'test'],
      Labels: {
        'com.testgen.type': 'unit-test',
        'com.testgen.project': 'test-orchestrator'
      },
      CapDrop: ['SYS_ADMIN', 'SYS_PTRACE', 'SYS_MODULE']
    },
    NetworkSettings: {
      IPAddress: '172.17.0.2',
      Ports: {}
    }
  })
};

export const createMockContainer = (overrides: Partial<typeof mockContainer> = {}) => ({
  ...mockContainer,
  ...overrides
});