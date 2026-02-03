// Global test setup for LocalStorage mock
// This fixes the jest-environment-node localStorage initialization error

class LocalStorageMock {
  constructor() {
    this.store = new Map();
  }

  getItem(key) {
    return this.store.get(key) ?? null;
  }

  setItem(key, value) {
    this.store.set(key, String(value));
  }

  removeItem(key) {
    this.store.delete(key);
  }

  clear() {
    this.store.clear();
  }

  get length() {
    return this.store.size;
  }

  key(index) {
    return Array.from(this.store.keys())[index] ?? null;
  }
}

// Mock localStorage and sessionStorage globally
global.localStorage = new LocalStorageMock();
global.sessionStorage = new LocalStorageMock();

// Mock window object for browser-specific tests
global.window = global.window || {
  localStorage: global.localStorage,
  sessionStorage: global.sessionStorage,
  location: {
    href: 'http://localhost',
    origin: 'http://localhost'
  }
};

// Mock document object
global.document = global.document || {
  createElement: () => ({}),
  addEventListener: () => {},
  removeEventListener: () => {}
};

// Override Object.defineProperty to prevent localStorage errors
const originalDefineProperty = Object.defineProperty;
Object.defineProperty = function(obj, prop, descriptor) {
  if (prop === 'localStorage' || prop === 'sessionStorage') {
    return obj;
  }
  return originalDefineProperty.call(this, obj, prop, descriptor);
};

// Suppress console warnings in tests
const originalConsoleWarn = console.warn;
console.warn = (...args) => {
  const message = args[0];
  if (typeof message === 'string') {
    // Suppress specific localStorage warnings
    if (message.includes('localStorage')) return;
    if (message.includes('sessionStorage')) return;
    if (message.includes('Cannot initialize local storage')) return;
    if (message.includes('SecurityError')) return;
  }
  originalConsoleWarn.apply(console, args);
};

// Suppress console errors for localStorage
const originalConsoleError = console.error;
console.error = (...args) => {
  const message = args[0];
  if (typeof message === 'string') {
    if (message.includes('localStorage')) return;
    if (message.includes('SecurityError')) return;
  }
  originalConsoleError.apply(console, args);
};

console.log('✅ LocalStorage mock initialized successfully');