// packages/test-orchestrator/tests/setup.ts
// OPTIMIZED VERSION - Removed unnecessary delays
import { vi } from 'vitest'

// ⚡ Performans Optimizasyonu: Tüm async işlemler anında tamamlanıyor
export const mockContainer = {
  id: 'sha256:1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
  shortId: '1234567890ab',

  // Instant operations - no setTimeout delays
  start: vi.fn().mockResolvedValue(undefined),
  stop: vi.fn().mockResolvedValue(undefined),
  remove: vi.fn().mockResolvedValue(undefined),

  exec: vi.fn().mockResolvedValue({ 
    exitCode: 0, 
    output: 'Test execution completed',
    stderr: '',
    stdout: 'All tests passed'
  }),

  // Cached stats for instant retrieval
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

  // Pre-computed inspect data
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
      StartedAt: new Date('2024-01-01T00:00:00Z').toISOString(),
      FinishedAt: '0001-01-01T00:00:00Z'
    },
    Config: {
      Image: 'test-runner:latest',
      Env: ['NODE_ENV=test', 'CI=true'],
      Cmd: ['npm', 'test'],
      Labels: {
        'com.testgen.type': 'unit-test',
        'com.testgen.project': 'test-orchestrator'
      }
    },
    NetworkSettings: {
      IPAddress: '172.17.0.2',
      Ports: {}
    }
  })
}

// ⚡ Optimized WebSocket Mock - Synchronous event simulation
export class MockWebSocket {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3

  readyState = MockWebSocket.OPEN // Start as OPEN for faster tests
  url: string
  protocol: string

  onopen: ((event: Event) => void) | null = null
  onclose: ((event: CloseEvent) => void) | null = null
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((event: Event) => void) | null = null

  private listeners = new Map<string, Set<Function>>()

  constructor(url: string, protocols?: string | string[]) {
    this.url = url
    this.protocol = Array.isArray(protocols) ? protocols[0] : protocols || ''

    // Immediately trigger open event (synchronous in tests)
    queueMicrotask(() => {
      const event = new Event('open')
      this.onopen?.(event)
      this.dispatchEvent('open', event)
    })
  }

  send = vi.fn((data: string | ArrayBuffer | Blob) => {
    if (this.readyState !== MockWebSocket.OPEN) {
      throw new Error('WebSocket is not open')
    }

    // Synchronous echo for test speed
    queueMicrotask(() => {
      const response = typeof data === 'string' 
        ? JSON.stringify({ echo: JSON.parse(data) })
        : data
        
      const event = new MessageEvent('message', { data: response })
      this.onmessage?.(event)
      this.dispatchEvent('message', event)
    })
  })

  close = vi.fn((code = 1000, reason = 'Normal closure') => {
    if (this.readyState === MockWebSocket.CLOSED || 
        this.readyState === MockWebSocket.CLOSING) {
      return
    }
    
    this.readyState = MockWebSocket.CLOSED
    queueMicrotask(() => {
      const event = new CloseEvent('close', {
        code,
        reason,
        wasClean: code === 1000
      })
      this.onclose?.(event)
      this.dispatchEvent('close', event)
    })
  })

  addEventListener = vi.fn((type: string, listener: Function) => {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set())
    }
    this.listeners.get(type)!.add(listener)
  })

  removeEventListener = vi.fn((type: string, listener: Function) => {
    const listeners = this.listeners.get(type)
    if (listeners) {
      listeners.delete(listener)
    }
  })

  private dispatchEvent(type: string, event: Event) {
    const listeners = this.listeners.get(type)
    if (listeners) {
      listeners.forEach(listener => listener(event))
    }
  }
}

// Global setup
(global as any).WebSocket = MockWebSocket

// Helper function to wait for microtasks (faster than setTimeout)
export const flushPromises = () => new Promise(resolve => queueMicrotask(resolve))