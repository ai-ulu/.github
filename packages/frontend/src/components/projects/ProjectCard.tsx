import { Link } from 'react-router-dom';
import { Button } from '../ui/Button';

interface Project {
  id: string;
  name: string;
  description?: string;
  url: string;
  createdAt: string;
  lastRun?: string;
  status: 'active' | 'inactive' | 'error';
  testsCount: number;
  passRate: number;
}

interface ProjectCardProps {
  project: Project;
  onEdit?: (project: Project) => void;
  onDelete?: (project: Project) => void;
  onRun?: (project: Project) => void;
}

export function ProjectCard({ project, onEdit, onDelete, onRun }: ProjectCardProps) {
  const statusColors = {
    active: 'bg-green-100 text-green-800',
    inactive: 'bg-gray-100 text-gray-800',
    error: 'bg-red-100 text-red-800'
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <Link 
            to={`/projects/${project.id}`}
            className="text-lg font-semibold text-gray-900 hover:text-blue-600 transition-colors"
          >
            {project.name}
          </Link>
          {project.description && (
            <p className="text-gray-600 text-sm mt-1 line-clamp-2">
              {project.description}
            </p>
          )}
        </div>
        
        <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[project.status]}`}>
          {project.status}
        </span>
      </div>

      <div className="space-y-2 mb-4">
        <div className="flex items-center text-sm text-gray-600">
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
          <a 
            href={project.url} 
            target="_blank" 
            rel="noopener noreferrer"
            className="hover:text-blue-600 truncate"
          >
            {project.url}
          </a>
        </div>
        
        <div className="flex items-center text-sm text-gray-600">
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          <span>{project.testsCount} tests</span>
          <span className="mx-2">•</span>
          <span className={project.passRate >= 80 ? 'text-green-600' : project.passRate >= 60 ? 'text-yellow-600' : 'text-red-600'}>
            {project.passRate}% pass rate
          </span>
        </div>

        <div className="flex items-center text-sm text-gray-500">
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>Created {formatDate(project.createdAt)}</span>
          {project.lastRun && (
            <>
              <span className="mx-2">•</span>
              <span>Last run {formatDate(project.lastRun)}</span>
            </>
          )}
        </div>
      </div>

      <div className="flex items-center space-x-2">
        <Button 
          size="sm" 
          onClick={() => onRun?.(project)}
          className="flex-1"
        >
          Run Tests
        </Button>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={() => onEdit?.(project)}
        >
          Edit
        </Button>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={() => onDelete?.(project)}
          className="text-red-600 hover:text-red-700 hover:border-red-300"
        >
          Delete
        </Button>
      </div>
    </div>
  );
}