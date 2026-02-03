import { vi } from 'vitest';

export class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState = MockWebSocket.CONNECTING;
  url: string;
  protocol: string;

  onopen: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  private listeners = new Map<string, Set<Function>>();

  constructor(url: string, protocols?: string | string[]) {
    this.url = url;
    this.protocol = Array.isArray(protocols) ? protocols[0] : protocols || '';
    
    // Simulate connection opening
    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN;
      const event = new Event('open');
      this.onopen?.(event);
      this.dispatchEvent('open', event);
    }, 10);
  }

  send = vi.fn((data: string | ArrayBuffer | Blob) => {
    if (this.readyState !== MockWebSocket.OPEN) {
      throw new Error('WebSocket is not open');
    }
    
    // Echo response simulation
    setTimeout(() => {
      const response = typeof data === 'string' 
        ? JSON.stringify({ echo: JSON.parse(data) })
        : data;
        
      const event = new MessageEvent('message', { data: response });
      this.onmessage?.(event);
      this.dispatchEvent('message', event);
    }, 10);
  });

  close = vi.fn((code = 1000, reason = 'Normal closure') => {
    if (this.readyState === MockWebSocket.CLOSED || 
        this.readyState === MockWebSocket.CLOSING) {
      return;
    }
    
    this.readyState = MockWebSocket.CLOSING;
    
    setTimeout(() => {
      this.readyState = MockWebSocket.CLOSED;
      const event = new CloseEvent('close', {
        code,
        reason,
        wasClean: code === 1000
      });
      this.onclose?.(event);
      this.dispatchEvent('close', event);
    }, 10);
  });

  addEventListener = vi.fn((type: string, listener: Function) => {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(listener);
  });

  removeEventListener = vi.fn((type: string, listener: Function) => {
    const listeners = this.listeners.get(type);
    if (listeners) {
      listeners.delete(listener);
    }
  });

  private dispatchEvent(type: string, event: Event) {
    const listeners = this.listeners.get(type);
    if (listeners) {
      listeners.forEach(listener => listener(event));
    }
  }
}

// WebSocket Server Mock
export class MockWebSocketServer {
  clients = new Set<MockWebSocket>();
  
  constructor(options: { port: number; perMessageDeflate?: boolean }) {
    // Mock server initialization
  }

  on = vi.fn((event: string, callback: Function) => {
    if (event === 'connection') {
      // Simulate client connection
      setTimeout(() => {
        const mockClient = new MockWebSocket('ws://localhost:8080');
        this.clients.add(mockClient);
        callback(mockClient);
      }, 10);
    }
  });

  close = vi.fn((callback?: Function) => {
    this.clients.clear();
    callback?.();
  });
}

// Global WebSocket replacement
(global as any).WebSocket = MockWebSocket;

// Export setup function for vitest
export function setupWebSocketMock() {
  (global as any).WebSocket = MockWebSocket;
  return MockWebSocket;
}