import React from 'react';
import { Target } from 'lucide-react';

export const SelectorPlayground: React.FC = () => {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold mb-2">Selector Playground</h1>
        <p className="text-muted-foreground">
          Interactive tool for testing and generating Playwright selectors
        </p>
      </div>

      <div className="text-center py-16 text-muted-foreground">
        <Target className="h-16 w-16 mx-auto mb-4 opacity-50" />
        <h3 className="text-xl font-semibold mb-2">Selector Playground</h3>
        <p>Interactive selector testing coming soon...</p>
      </div>
    </div>
  );
};