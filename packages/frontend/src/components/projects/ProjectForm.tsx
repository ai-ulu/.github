import { useState } from 'react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';

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

interface ProjectFormProps {
  initialData?: Partial<ProjectFormData>;
  onSubmit: (data: ProjectFormData) => Promise<void>;
  onCancel: () => void;
  isLoading?: boolean;
  title?: string;
}

export function ProjectForm({ 
  initialData, 
  onSubmit, 
  onCancel, 
  isLoading = false,
  title = 'Create New Project'
}: ProjectFormProps) {
  const [formData, setFormData] = useState<ProjectFormData>({
    name: initialData?.name || '',
    description: initialData?.description || '',
    url: initialData?.url || '',
    credentials: {
      username: initialData?.credentials?.username || '',
      password: initialData?.credentials?.password || '',
      apiKey: initialData?.credentials?.apiKey || ''
    }
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showCredentials, setShowCredentials] = useState(false);

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Project name is required';
    }

    if (!formData.url.trim()) {
      newErrors.url = 'Website URL is required';
    } else {
      try {
        new URL(formData.url);
      } catch {
        newErrors.url = 'Please enter a valid URL';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) return;

    try {
      await onSubmit(formData);
    } catch (error) {
      console.error('Form submission error:', error);
    }
  };

  const updateField = (field: keyof ProjectFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const updateCredential = (field: keyof NonNullable<ProjectFormData['credentials']>, value: string) => {
    setFormData(prev => ({
      ...prev,
      credentials: {
        ...prev.credentials,
        [field]: value
      }
    }));
  };

  return (
    <div className="bg-white shadow rounded-lg p-6">
      <h2 className="text-lg font-medium text-gray-900 mb-6">{title}</h2>
      
      <form onSubmit={handleSubmit} className="space-y-6">
        <Input
          label="Project Name"
          value={formData.name}
          onChange={(e) => updateField('name', e.target.value)}
          placeholder="My Awesome App"
          error={errors.name}
          required
        />
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Description
          </label>
          <textarea
            value={formData.description}
            onChange={(e) => updateField('description', e.target.value)}
            placeholder="Brief description of your project"
            rows={3}
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        
        <Input
          label="Website URL"
          type="url"
          value={formData.url}
          onChange={(e) => updateField('url', e.target.value)}
          placeholder="https://example.com"
          error={errors.url}
          required
        />

        {/* Credentials Section */}
        <div className="border-t pt-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-gray-900">Authentication (Optional)</h3>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowCredentials(!showCredentials)}
            >
              {showCredentials ? 'Hide' : 'Show'} Credentials
            </Button>
          </div>

          {showCredentials && (
            <div className="space-y-4 bg-gray-50 p-4 rounded-md">
              <p className="text-sm text-gray-600">
                Add credentials if your website requires authentication for testing.
              </p>
              
              <Input
                label="Username"
                value={formData.credentials?.username || ''}
                onChange={(e) => updateCredential('username', e.target.value)}
                placeholder="username@example.com"
              />
              
              <Input
                label="Password"
                type="password"
                value={formData.credentials?.password || ''}
                onChange={(e) => updateCredential('password', e.target.value)}
                placeholder="••••••••"
              />
              
              <Input
                label="API Key"
                value={formData.credentials?.apiKey || ''}
                onChange={(e) => updateCredential('apiKey', e.target.value)}
                placeholder="sk-..."
              />
            </div>
          )}
        </div>
        
        <div className="flex space-x-3 pt-4">
          <Button 
            type="submit" 
            isLoading={isLoading}
            disabled={isLoading}
          >
            {initialData ? 'Update Project' : 'Create Project'}
          </Button>
          <Button 
            type="button" 
            variant="outline" 
            onClick={onCancel}
            disabled={isLoading}
          >
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}