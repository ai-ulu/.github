import React from 'react';
import { useParams } from 'react-router-dom';

export const TestExecution: React.FC = () => {
  const { executionId } = useParams<{ executionId: string }>();

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold mb-4">Test Execution Details</h1>
      <p>Execution ID: {executionId}</p>
      <p className="text-muted-foreground">
        Detailed test execution view coming soon...
      </p>
    </div>
  );
};