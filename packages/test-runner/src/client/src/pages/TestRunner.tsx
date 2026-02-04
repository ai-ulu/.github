import React, { useEffect, useState } from 'react';
import { 
  Play, 
  Bug, 
  Square, 
  FileText, 
  Folder,
  ChevronRight,
  ChevronDown,
  Clock,
  CheckCircle,
  XCircle,
  Loader2
} from 'lucide-react';
import { useTest } from '../contexts/TestContext';
import { TestFile, TestInfo } from '../contexts/TestContext';
import { cn } from '../utils/cn';

export const TestRunner: React.FC = () => {
  const { 
    testFiles, 
    executions, 
    currentExecution, 
    loading, 
    error,
    runTest, 
    debugTest, 
    stopTest, 
    loadTestFiles 
  } = useTest();

  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
  const [selectedDirectory, setSelectedDirectory] = useState<string>('');

  useEffect(() => {
    loadTestFiles();
  }, []);

  const toggleFileExpansion = (filePath: string) => {
    const newExpanded = new Set(expandedFiles);
    if (newExpanded.has(filePath)) {
      newExpanded.delete(filePath);
    } else {
      newExpanded.add(filePath);
    }
    setExpandedFiles(newExpanded);
  };

  const handleRunTest = async (testFile: string, testName?: string) => {
    await runTest(testFile, testName);
  };

  const handleDebugTest = async (testFile: string, testName?: string) => {
    await debugTest(testFile, testName);
  };

  const handleStopTest = async () => {
    if (currentExecution) {
      await stopTest(currentExecution.id);
    }
  };

  const getTestStatus = (testFile: string, testName?: string) => {
    const execution = executions.find(
      exec => exec.testFile === testFile && 
      (testName ? exec.testName === testName : !exec.testName)
    );
    return execution?.status;
  };

  const getStatusIcon = (status?: string) => {
    switch (status) {
      case 'running':
        return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
      case 'passed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'stopped':
        return <Square className="h-4 w-4 text-gray-500" />;
      default:
        return <Clock className="h-4 w-4 text-gray-400" />;
    }
  };

  return (
    <div className="flex h-[calc(100vh-4rem)]">
      {/* Sidebar - Test Files */}
      <div className="w-1/3 border-r border-border bg-card">
        <div className="p-4 border-b border-border">
          <h2 className="text-lg font-semibold mb-4">Test Files</h2>
          
          {/* Directory Selector */}
          <div className="mb-4">
            <input
              type="text"
              placeholder="Enter directory path..."
              value={selectedDirectory}
              onChange={(e) => setSelectedDirectory(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  loadTestFiles(selectedDirectory || undefined);
                }
              }}
              className="w-full px-3 py-2 border border-input rounded-md bg-background text-sm"
            />
          </div>

          {error && (
            <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded-md">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
              <span className="ml-2">Loading test files...</span>
            </div>
          ) : testFiles.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No test files found</p>
              <p className="text-sm">Add some .spec.ts or .test.ts files</p>
            </div>
          ) : (
            <div className="space-y-2">
              {testFiles.map((file) => (
                <TestFileItem
                  key={file.path}
                  file={file}
                  expanded={expandedFiles.has(file.path)}
                  onToggleExpansion={() => toggleFileExpansion(file.path)}
                  onRunTest={handleRunTest}
                  onDebugTest={handleDebugTest}
                  getTestStatus={getTestStatus}
                  getStatusIcon={getStatusIcon}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Main Content - Test Execution */}
      <div className="flex-1 flex flex-col">
        {currentExecution ? (
          <TestExecutionView
            execution={currentExecution}
            onStopTest={handleStopTest}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <Play className="h-16 w-16 mx-auto mb-4 opacity-50" />
              <h3 className="text-xl font-semibold mb-2">Ready to Run Tests</h3>
              <p>Select a test from the sidebar to get started</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

interface TestFileItemProps {
  file: TestFile;
  expanded: boolean;
  onToggleExpansion: () => void;
  onRunTest: (testFile: string, testName?: string) => void;
  onDebugTest: (testFile: string, testName?: string) => void;
  getTestStatus: (testFile: string, testName?: string) => string | undefined;
  getStatusIcon: (status?: string) => React.ReactNode;
}

const TestFileItem: React.FC<TestFileItemProps> = ({
  file,
  expanded,
  onToggleExpansion,
  onRunTest,
  onDebugTest,
  getTestStatus,
  getStatusIcon,
}) => {
  return (
    <div className="border border-border rounded-md">
      <div
        className="flex items-center justify-between p-3 cursor-pointer hover:bg-accent"
        onClick={onToggleExpansion}
      >
        <div className="flex items-center space-x-2">
          {expanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
          <FileText className="h-4 w-4" />
          <span className="text-sm font-medium">{file.name}</span>
          <span className="text-xs text-muted-foreground">
            ({file.tests.length} tests)
          </span>
        </div>
        
        <div className="flex items-center space-x-2">
          {getStatusIcon(getTestStatus(file.path))}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRunTest(file.path);
            }}
            className="p-1 hover:bg-primary/10 rounded"
            title="Run all tests in file"
          >
            <Play className="h-3 w-3" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDebugTest(file.path);
            }}
            className="p-1 hover:bg-primary/10 rounded"
            title="Debug tests in file"
          >
            <Bug className="h-3 w-3" />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border">
          {file.tests.map((test) => (
            <TestItem
              key={`${file.path}-${test.name}`}
              test={test}
              filePath={file.path}
              onRunTest={onRunTest}
              onDebugTest={onDebugTest}
              getTestStatus={getTestStatus}
              getStatusIcon={getStatusIcon}
            />
          ))}
        </div>
      )}
    </div>
  );
};

interface TestItemProps {
  test: TestInfo;
  filePath: string;
  onRunTest: (testFile: string, testName?: string) => void;
  onDebugTest: (testFile: string, testName?: string) => void;
  getTestStatus: (testFile: string, testName?: string) => string | undefined;
  getStatusIcon: (status?: string) => React.ReactNode;
}

const TestItem: React.FC<TestItemProps> = ({
  test,
  filePath,
  onRunTest,
  onDebugTest,
  getTestStatus,
  getStatusIcon,
}) => {
  const status = getTestStatus(filePath, test.name);

  return (
    <div className="flex items-center justify-between p-3 pl-8 hover:bg-accent">
      <div className="flex items-center space-x-2">
        <div className="w-2 h-2 rounded-full bg-primary/30" />
        <span className="text-sm">{test.name}</span>
        <span className="text-xs text-muted-foreground">
          line {test.line}
        </span>
      </div>
      
      <div className="flex items-center space-x-2">
        {getStatusIcon(status)}
        <button
          onClick={() => onRunTest(filePath, test.name)}
          className="p-1 hover:bg-primary/10 rounded"
          title="Run this test"
        >
          <Play className="h-3 w-3" />
        </button>
        <button
          onClick={() => onDebugTest(filePath, test.name)}
          className="p-1 hover:bg-primary/10 rounded"
          title="Debug this test"
        >
          <Bug className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
};

interface TestExecutionViewProps {
  execution: any;
  onStopTest: () => void;
}

const TestExecutionView: React.FC<TestExecutionViewProps> = ({
  execution,
  onStopTest,
}) => {
  return (
    <div className="flex-1 p-6">
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-semibold">
              {execution.testName || 'Running Tests'}
            </h2>
            <p className="text-muted-foreground">{execution.testFile}</p>
          </div>
          
          {execution.status === 'running' && (
            <button
              onClick={onStopTest}
              className="flex items-center space-x-2 px-4 py-2 bg-destructive text-destructive-foreground rounded-md hover:bg-destructive/90"
            >
              <Square className="h-4 w-4" />
              <span>Stop Test</span>
            </button>
          )}
        </div>
      </div>

      {/* Test Steps */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium">Test Steps</h3>
        
        {execution.steps.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
            <p>Waiting for test steps...</p>
          </div>
        ) : (
          <div className="space-y-2">
            {execution.steps.map((step: any, index: number) => (
              <div
                key={step.id}
                className={cn(
                  'p-4 border rounded-md test-step',
                  step.error ? 'failed' : 'passed'
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <span className="text-sm font-mono text-muted-foreground">
                      {index + 1}
                    </span>
                    <span className="font-medium">{step.action}</span>
                    {step.selector && (
                      <code className="text-sm bg-muted px-2 py-1 rounded">
                        {step.selector}
                      </code>
                    )}
                    {step.value && (
                      <span className="text-sm text-muted-foreground">
                        "{step.value}"
                      </span>
                    )}
                  </div>
                  
                  <div className="text-xs text-muted-foreground">
                    {new Date(step.timestamp).toLocaleTimeString()}
                  </div>
                </div>
                
                {step.error && (
                  <div className="mt-2 p-2 bg-destructive/10 border border-destructive/20 rounded text-sm text-destructive">
                    {step.error}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};