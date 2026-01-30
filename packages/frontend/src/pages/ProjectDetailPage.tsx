import { useParams } from 'react-router-dom';
import { Button } from '../components/ui/Button';

export function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Project Details</h1>
          <p className="text-gray-600">Project ID: {id}</p>
        </div>
        
        <div className="flex space-x-3">
          <Button variant="outline">Edit Project</Button>
          <Button>Run Tests</Button>
        </div>
      </div>

      {/* Project Info */}
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Project Information</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-gray-700">Name</label>
            <p className="mt-1 text-sm text-gray-900">Loading...</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">URL</label>
            <p className="mt-1 text-sm text-gray-900">Loading...</p>
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-gray-700">Description</label>
            <p className="mt-1 text-sm text-gray-900">Loading...</p>
          </div>
        </div>
      </div>

      {/* Test Scenarios */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-medium text-gray-900">Test Scenarios</h2>
            <Button size="sm">Add Scenario</Button>
          </div>
        </div>
        <div className="p-6">
          <div className="text-center py-12">
            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <h3 className="mt-2 text-sm font-medium text-gray-900">No test scenarios</h3>
            <p className="mt-1 text-sm text-gray-500">
              Create your first test scenario to get started
            </p>
            <div className="mt-6">
              <Button>Add Scenario</Button>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Test Runs */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-medium text-gray-900">Recent Test Runs</h2>
        </div>
        <div className="p-6">
          <div className="text-center py-12">
            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <h3 className="mt-2 text-sm font-medium text-gray-900">No test runs</h3>
            <p className="mt-1 text-sm text-gray-500">
              Run your first test to see results here
            </p>
            <div className="mt-6">
              <Button>Run Tests</Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}