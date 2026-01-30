import { Link } from 'react-router-dom';
import { Button } from '../components/ui/Button';

export function LandingPage() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="py-20 text-center">
        <h1 className="text-4xl font-bold text-gray-900 sm:text-6xl">
          AutoQA Pilot
        </h1>
        <p className="mt-6 text-lg leading-8 text-gray-600 max-w-2xl mx-auto">
          AI-powered autonomous testing platform that generates, executes, and maintains 
          your web application tests automatically.
        </p>
        
        <div className="mt-10 flex items-center justify-center gap-x-6">
          <Link to="/login">
            <Button size="lg">
              Get Started with GitHub
            </Button>
          </Link>
        </div>

        <div className="mt-16 grid grid-cols-1 gap-8 sm:grid-cols-3">
          <div className="text-center">
            <div className="mx-auto h-12 w-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <svg className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
              </svg>
            </div>
            <h3 className="mt-4 text-lg font-semibold text-gray-900">AI-Powered Generation</h3>
            <p className="mt-2 text-gray-600">
              Generate comprehensive test scenarios from natural language descriptions
            </p>
          </div>

          <div className="text-center">
            <div className="mx-auto h-12 w-12 bg-green-100 rounded-lg flex items-center justify-center">
              <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </div>
            <h3 className="mt-4 text-lg font-semibold text-gray-900">Autonomous Execution</h3>
            <p className="mt-2 text-gray-600">
              Run tests automatically with self-healing capabilities and detailed reporting
            </p>
          </div>

          <div className="text-center">
            <div className="mx-auto h-12 w-12 bg-purple-100 rounded-lg flex items-center justify-center">
              <svg className="h-6 w-6 text-purple-600" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
              </svg>
            </div>
            <h3 className="mt-4 text-lg font-semibold text-gray-900">Visual Regression</h3>
            <p className="mt-2 text-gray-600">
              Detect visual changes and maintain UI consistency across deployments
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}