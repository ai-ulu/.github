import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { TestRunner } from './pages/TestRunner';
import { TestExecution } from './pages/TestExecution';
import { SelectorPlayground } from './pages/SelectorPlayground';
import { Settings } from './pages/Settings';
import { SocketProvider } from './contexts/SocketContext';
import { TestProvider } from './contexts/TestContext';

function App() {
  return (
    <SocketProvider>
      <TestProvider>
        <Layout>
          <Routes>
            <Route path="/" element={<TestRunner />} />
            <Route path="/execution/:executionId" element={<TestExecution />} />
            <Route path="/selector-playground" element={<SelectorPlayground />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </Layout>
      </TestProvider>
    </SocketProvider>
  );
}

export default App;