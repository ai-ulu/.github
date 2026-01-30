import { useState } from 'react';
import { Button } from '../components/ui/Button';
import { ProjectList } from '../components/projects/ProjectList';
import { ProjectForm } from '../components/projects/ProjectForm';
import toast from 'react-hot-toast';

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

interface ProjectFormData {
  name: string;
  description: string;
  url: string;
  credentials?: {
    username?: string;
    password?: string;
    apiKey?: string;
  };
}

export function ProjectsPage() {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  
  // Mock data - replace with actual API calls
  const [projects, setProjects] = useState<Project[]>([
    {
      id: '1',
      name: 'E-commerce Website',
      description: 'Main shopping website with user authentication and payment processing',
      url: 'https://shop.example.com',
      createdAt: '2024-01-15T10:00:00Z',
      lastRun: '2024-01-20T14:30:00Z',
      status: 'active',
      testsCount: 25,
      passRate: 92
    },
    {
      id: '2',
      name: 'Admin Dashboard',
      description: 'Internal admin panel for managing products and orders',
      url: 'https://admin.example.com',
      createdAt: '2024-01-10T09:00:00Z',
      lastRun: '2024-01-19T11:15:00Z',
      status: 'active',
      testsCount: 18,
      passRate: 88
    },
    {
      id: '3',
      name: 'Marketing Site',
      description: 'Public marketing website with landing pages',
      url: 'https://marketing.example.com',
      createdAt: '2024-01-05T16:00:00Z',
      status: 'inactive',
      testsCount: 12,
      passRate: 75
    }
  ]);

  const handleCreateProject = async (data: ProjectFormData) => {
    setIsLoading(true);
    try {
      // TODO: Replace with actual API call
      const newProject: Project = {
        id: Date.now().toString(),
        name: data.name,
        description: data.description,
        url: data.url,
        createdAt: new Date().toISOString(),
        status: 'inactive',
        testsCount: 0,
        passRate: 0
      };
      
      setProjects(prev => [newProject, ...prev]);
      setShowCreateForm(false);
      toast.success('Project created successfully!');
    } catch (error) {
      toast.error('Failed to create project');
      console.error('Create project error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleEditProject = async (data: ProjectFormData) => {
    if (!editingProject) return;
    
    setIsLoading(true);
    try {
      // TODO: Replace with actual API call
      setProjects(prev => prev.map(p => 
        p.id === editingProject.id 
          ? { ...p, name: data.name, description: data.description, url: data.url }
          : p
      ));
      
      setEditingProject(null);
      toast.success('Project updated successfully!');
    } catch (error) {
      toast.error('Failed to update project');
      console.error('Update project error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteProject = async (project: Project) => {
    if (!confirm(`Are you sure you want to delete "${project.name}"?`)) return;
    
    try {
      // TODO: Replace with actual API call
      setProjects(prev => prev.filter(p => p.id !== project.id));
      toast.success('Project deleted successfully!');
    } catch (error) {
      toast.error('Failed to delete project');
      console.error('Delete project error:', error);
    }
  };

  const handleRunTests = async (project: Project) => {
    try {
      // TODO: Replace with actual API call
      toast.success(`Running tests for "${project.name}"...`);
    } catch (error) {
      toast.error('Failed to run tests');
      console.error('Run tests error:', error);
    }
  };

  const handleCancelForm = () => {
    setShowCreateForm(false);
    setEditingProject(null);
  };

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Projects</h1>
          <p className="text-gray-600">
            Manage your testing projects and configurations
          </p>
        </div>
        
        <Button onClick={() => setShowCreateForm(true)}>
          Create New Project
        </Button>
      </div>

      {/* Create/Edit Project Form */}
      {(showCreateForm || editingProject) && (
        <ProjectForm
          initialData={editingProject || undefined}
          onSubmit={editingProject ? handleEditProject : handleCreateProject}
          onCancel={handleCancelForm}
          isLoading={isLoading}
          title={editingProject ? 'Edit Project' : 'Create New Project'}
        />
      )}

      {/* Projects List */}
      <ProjectList
        projects={projects}
        onEdit={setEditingProject}
        onDelete={handleDeleteProject}
        onRun={handleRunTests}
        onCreateNew={() => setShowCreateForm(true)}
      />
    </div>
  );
}