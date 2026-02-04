import React, { createContext, useContext, useReducer, useEffect } from 'react';
import { useSocket } from './SocketContext';

export interface TestFile {
  path: string;
  name: string;
  relativePath: string;
  tests: TestInfo[];
  lastModified: number;
}

export interface TestInfo {
  name: string;
  line: number;
  type: 'test' | 'describe';
}

export interface TestExecution {
  id: string;
  testFile: string;
  testName?: string;
  status: 'running' | 'passed' | 'failed' | 'stopped';
  startTime: number;
  endTime?: number;
  steps: TestStep[];
  error?: string;
  videoPath?: string;
  screenshots: string[];
  socketId: string;
}

export interface TestStep {
  id: string;
  type: 'action' | 'assertion' | 'navigation';
  action: string;
  selector?: string;
  value?: string;
  timestamp: number;
  screenshot?: string;
  domSnapshot?: string;
  error?: string;
  duration?: number;
}

interface TestState {
  testFiles: TestFile[];
  executions: TestExecution[];
  currentExecution: TestExecution | null;
  selectedFile: TestFile | null;
  loading: boolean;
  error: string | null;
}

type TestAction =
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'SET_TEST_FILES'; payload: TestFile[] }
  | { type: 'ADD_TEST_FILE'; payload: TestFile }
  | { type: 'UPDATE_TEST_FILE'; payload: TestFile }
  | { type: 'REMOVE_TEST_FILE'; payload: string }
  | { type: 'SET_SELECTED_FILE'; payload: TestFile | null }
  | { type: 'ADD_EXECUTION'; payload: TestExecution }
  | { type: 'UPDATE_EXECUTION'; payload: TestExecution }
  | { type: 'SET_CURRENT_EXECUTION'; payload: TestExecution | null }
  | { type: 'ADD_STEP'; payload: { executionId: string; step: TestStep } };

const initialState: TestState = {
  testFiles: [],
  executions: [],
  currentExecution: null,
  selectedFile: null,
  loading: false,
  error: null,
};

function testReducer(state: TestState, action: TestAction): TestState {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, loading: action.payload };
    
    case 'SET_ERROR':
      return { ...state, error: action.payload };
    
    case 'SET_TEST_FILES':
      return { ...state, testFiles: action.payload };
    
    case 'ADD_TEST_FILE':
      return {
        ...state,
        testFiles: [...state.testFiles, action.payload],
      };
    
    case 'UPDATE_TEST_FILE':
      return {
        ...state,
        testFiles: state.testFiles.map(file =>
          file.path === action.payload.path ? action.payload : file
        ),
      };
    
    case 'REMOVE_TEST_FILE':
      return {
        ...state,
        testFiles: state.testFiles.filter(file => file.path !== action.payload),
      };
    
    case 'SET_SELECTED_FILE':
      return { ...state, selectedFile: action.payload };
    
    case 'ADD_EXECUTION':
      return {
        ...state,
        executions: [...state.executions, action.payload],
      };
    
    case 'UPDATE_EXECUTION':
      return {
        ...state,
        executions: state.executions.map(exec =>
          exec.id === action.payload.id ? action.payload : exec
        ),
        currentExecution:
          state.currentExecution?.id === action.payload.id
            ? action.payload
            : state.currentExecution,
      };
    
    case 'SET_CURRENT_EXECUTION':
      return { ...state, currentExecution: action.payload };
    
    case 'ADD_STEP':
      return {
        ...state,
        executions: state.executions.map(exec =>
          exec.id === action.payload.executionId
            ? { ...exec, steps: [...exec.steps, action.payload.step] }
            : exec
        ),
        currentExecution:
          state.currentExecution?.id === action.payload.executionId
            ? {
                ...state.currentExecution,
                steps: [...state.currentExecution.steps, action.payload.step],
              }
            : state.currentExecution,
      };
    
    default:
      return state;
  }
}

interface TestContextType extends TestState {
  dispatch: React.Dispatch<TestAction>;
  runTest: (testFile: string, testName?: string) => Promise<void>;
  debugTest: (testFile: string, testName?: string) => Promise<void>;
  stopTest: (executionId: string) => Promise<void>;
  loadTestFiles: (directory?: string) => Promise<void>;
}

const TestContext = createContext<TestContextType | null>(null);

export const useTest = () => {
  const context = useContext(TestContext);
  if (!context) {
    throw new Error('useTest must be used within a TestProvider');
  }
  return context;
};

interface TestProviderProps {
  children: React.ReactNode;
}

export const TestProvider: React.FC<TestProviderProps> = ({ children }) => {
  const [state, dispatch] = useReducer(testReducer, initialState);
  const { socket } = useSocket();

  useEffect(() => {
    if (!socket) return;

    // Socket event listeners
    socket.on('file-added', (testFile: TestFile) => {
      dispatch({ type: 'ADD_TEST_FILE', payload: testFile });
    });

    socket.on('file-changed', (testFile: TestFile) => {
      dispatch({ type: 'UPDATE_TEST_FILE', payload: testFile });
    });

    socket.on('file-removed', ({ path }: { path: string }) => {
      dispatch({ type: 'REMOVE_TEST_FILE', payload: path });
    });

    socket.on('test-started', (execution: TestExecution) => {
      dispatch({ type: 'ADD_EXECUTION', payload: execution });
      dispatch({ type: 'SET_CURRENT_EXECUTION', payload: execution });
    });

    socket.on('test-step', ({ executionId, step }: { executionId: string; step: TestStep }) => {
      dispatch({ type: 'ADD_STEP', payload: { executionId, step } });
    });

    socket.on('test-completed', (execution: TestExecution) => {
      dispatch({ type: 'UPDATE_EXECUTION', payload: execution });
    });

    socket.on('test-failed', (execution: TestExecution) => {
      dispatch({ type: 'UPDATE_EXECUTION', payload: execution });
    });

    socket.on('test-stopped', (execution: TestExecution) => {
      dispatch({ type: 'UPDATE_EXECUTION', payload: execution });
    });

    return () => {
      socket.off('file-added');
      socket.off('file-changed');
      socket.off('file-removed');
      socket.off('test-started');
      socket.off('test-step');
      socket.off('test-completed');
      socket.off('test-failed');
      socket.off('test-stopped');
    };
  }, [socket]);

  const runTest = async (testFile: string, testName?: string) => {
    try {
      dispatch({ type: 'SET_LOADING', payload: true });
      dispatch({ type: 'SET_ERROR', payload: null });

      const response = await fetch('/api/run-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ testFile, testName }),
      });

      if (!response.ok) {
        throw new Error('Failed to run test');
      }
    } catch (error) {
      dispatch({ type: 'SET_ERROR', payload: error.message });
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  };

  const debugTest = async (testFile: string, testName?: string) => {
    try {
      dispatch({ type: 'SET_LOADING', payload: true });
      dispatch({ type: 'SET_ERROR', payload: null });

      const response = await fetch('/api/debug-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ testFile, testName }),
      });

      if (!response.ok) {
        throw new Error('Failed to debug test');
      }
    } catch (error) {
      dispatch({ type: 'SET_ERROR', payload: error.message });
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  };

  const stopTest = async (executionId: string) => {
    try {
      const response = await fetch('/api/stop-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ executionId }),
      });

      if (!response.ok) {
        throw new Error('Failed to stop test');
      }
    } catch (error) {
      dispatch({ type: 'SET_ERROR', payload: error.message });
    }
  };

  const loadTestFiles = async (directory?: string) => {
    try {
      dispatch({ type: 'SET_LOADING', payload: true });
      dispatch({ type: 'SET_ERROR', payload: null });

      const params = directory ? `?directory=${encodeURIComponent(directory)}` : '';
      const response = await fetch(`/api/files${params}`);

      if (!response.ok) {
        throw new Error('Failed to load test files');
      }

      const { testFiles } = await response.json();
      dispatch({ type: 'SET_TEST_FILES', payload: testFiles });

      // Start watching files
      if (socket) {
        socket.emit('watch-files', { directory: directory || process.cwd() });
      }
    } catch (error) {
      dispatch({ type: 'SET_ERROR', payload: error.message });
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  };

  const contextValue: TestContextType = {
    ...state,
    dispatch,
    runTest,
    debugTest,
    stopTest,
    loadTestFiles,
  };

  return (
    <TestContext.Provider value={contextValue}>
      {children}
    </TestContext.Provider>
  );
};