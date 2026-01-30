import React, { useState } from 'react';
import { Button } from '../ui/Button';
import { SparklesIcon, ArrowRightIcon } from '@heroicons/react/24/outline';
import { LoadingSpinner } from '../ui/LoadingSpinner';

interface NaturalLanguageInputProps {
  value: string;
  onChange: (value: string) => void;
  onGenerate: () => Promise<void>;
  isGenerating?: boolean;
}

const EXAMPLE_PROMPTS = [
  "Navigate to login page, enter username and password, click login button",
  "Go to homepage, search for 'product', and verify results are displayed",
  "Open settings page, toggle dark mode, save changes, and verify theme applied",
  "Fill out contact form with name, email, message and submit",
  "Add item to cart, proceed to checkout, and verify order summary"
];

export const NaturalLanguageInput: React.FC<NaturalLanguageInputProps> = ({
  value,
  onChange,
  onGenerate,
  isGenerating = false
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const handleExampleClick = (example: string) => {
    onChange(example);
    setIsExpanded(false);
  };

  const handleGenerate = async () => {
    if (value.trim() && !isGenerating) {
      await onGenerate();
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      handleGenerate();
    }
  };

  return (
    <div className="natural-language-input bg-gradient-to-r from-purple-50 to-blue-50 rounded-lg p-4 border border-purple-200">
      <div className="flex items-center space-x-2 mb-3">
        <SparklesIcon className="w-5 h-5 text-purple-600" />
        <h3 className="font-medium text-purple-900">AI-Powered Test Generation</h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-purple-600 hover:text-purple-700"
        >
          {isExpanded ? 'Hide Examples' : 'Show Examples'}
        </Button>
      </div>

      {/* Examples */}
      {isExpanded && (
        <div className="mb-4 p-3 bg-white rounded-md border border-purple-100">
          <p className="text-sm text-gray-600 mb-2">Try these examples:</p>
          <div className="space-y-2">
            {EXAMPLE_PROMPTS.map((example, index) => (
              <button
                key={index}
                onClick={() => handleExampleClick(example)}
                className="block w-full text-left text-sm text-gray-700 hover:text-purple-700 hover:bg-purple-50 p-2 rounded transition-colors"
              >
                "{example}"
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input Area */}
      <div className="space-y-3">
        <div className="relative">
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyPress}
            placeholder="Describe your test scenario in natural language... 
Example: Navigate to the login page, enter valid credentials, click the login button, and verify the user is redirected to the dashboard."
            className="w-full h-24 p-3 border border-gray-300 rounded-md resize-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            disabled={isGenerating}
          />
          
          {/* Character count */}
          <div className="absolute bottom-2 right-2 text-xs text-gray-400">
            {value.length}/500
          </div>
        </div>

        {/* Generate Button */}
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-600">
            <kbd className="px-2 py-1 bg-gray-100 rounded text-xs">Cmd/Ctrl + Enter</kbd> to generate
          </div>
          
          <Button
            onClick={handleGenerate}
            disabled={!value.trim() || isGenerating}
            className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
          >
            {isGenerating ? (
              <>
                <LoadingSpinner size="sm" className="mr-2" />
                Generating...
              </>
            ) : (
              <>
                <SparklesIcon className="w-4 h-4 mr-2" />
                Generate Test
                <ArrowRightIcon className="w-4 h-4 ml-2" />
              </>
            )}
          </Button>
        </div>

        {/* Tips */}
        {!isExpanded && (
          <div className="text-xs text-gray-500 bg-white p-2 rounded border border-gray-100">
            💡 <strong>Tips:</strong> Be specific about actions (click, type, navigate) and include what you want to verify. 
            The AI will generate both test steps and assertions.
          </div>
        )}
      </div>
    </div>
  );
};