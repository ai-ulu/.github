import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';

export function ProfilePage() {
  const { user } = useAuth();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Profile</h1>
        <p className="text-gray-600">
          Manage your account settings and preferences
        </p>
      </div>

      {/* Profile Information */}
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Profile Information</h2>
        
        <div className="flex items-center space-x-6 mb-6">
          <img
            className="h-20 w-20 rounded-full"
            src={user?.avatar_url || `https://ui-avatars.com/api/?name=${user?.name || user?.login}&background=3b82f6&color=fff`}
            alt={user?.name || user?.login}
          />
          <div>
            <h3 className="text-lg font-medium text-gray-900">{user?.name || user?.login}</h3>
            <p className="text-gray-600">{user?.email}</p>
            <p className="text-sm text-gray-500">GitHub: @{user?.login}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label="Display Name"
            value={user?.name || ''}
            readOnly
            className="bg-gray-50"
          />
          <Input
            label="Email"
            value={user?.email || ''}
            readOnly
            className="bg-gray-50"
          />
          <Input
            label="GitHub Username"
            value={user?.login || ''}
            readOnly
            className="bg-gray-50"
          />
          <Input
            label="Company"
            value={user?.company || 'Not specified'}
            readOnly
            className="bg-gray-50"
          />
        </div>

        <div className="mt-6">
          <label className="block text-sm font-medium text-gray-700">Bio</label>
          <div className="mt-1 p-3 bg-gray-50 rounded-md">
            <p className="text-sm text-gray-900">
              {user?.bio || 'No bio available'}
            </p>
          </div>
        </div>
      </div>

      {/* Account Settings */}
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Account Settings</h2>
        
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-medium text-gray-900">Email Notifications</h3>
              <p className="text-sm text-gray-500">Receive email notifications for test results</p>
            </div>
            <Button variant="outline" size="sm">Configure</Button>
          </div>
          
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-medium text-gray-900">API Keys</h3>
              <p className="text-sm text-gray-500">Manage your API keys for integrations</p>
            </div>
            <Button variant="outline" size="sm">Manage</Button>
          </div>
          
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-medium text-gray-900">Connected Repositories</h3>
              <p className="text-sm text-gray-500">GitHub repositories you have access to</p>
            </div>
            <Button variant="outline" size="sm">View</Button>
          </div>
        </div>
      </div>

      {/* Danger Zone */}
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-medium text-red-600 mb-4">Danger Zone</h2>
        
        <div className="border border-red-200 rounded-md p-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-medium text-gray-900">Delete Account</h3>
              <p className="text-sm text-gray-500">
                Permanently delete your account and all associated data
              </p>
            </div>
            <Button variant="outline" size="sm" className="border-red-300 text-red-700 hover:bg-red-50">
              Delete Account
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}