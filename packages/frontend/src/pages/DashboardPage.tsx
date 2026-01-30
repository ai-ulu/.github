import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/Button';

export function DashboardPage() {
  const { user } = useAuth();

  // Mock data - replace with actual API calls
  const stats = [
    { name: 'Total Projects', value: '3', change: '+1 this week', trend: 'up' },
    { name: 'Tests Generated', value: '127', change: '+12 today', trend: 'up' },
    { name: 'Tests Passed', value: '118', change: '92% pass rate', trend: 'up' },
    { name: 'Coverage', value: '89%', change: '+2% this week', trend: 'up' }
  ];

  const recentActivity = [
    {
      id: 1,
      type: 'test_run',
      project: 'E-commerce Website',
      message: 'Test run completed with 25/25 tests passing',
      time: '2 hours ago',
      status: 'success'
    },
    {
      id: 2,
      type: 'project_created',
      project: 'Admin Dashboard',
      message: 'New project created and configured',
      time: '1 day ago',
      status: 'info'
    },
    {
      id: 3,
      type: 'test_failed',
      project: 'Marketing Site',
      message: '2 tests failed due to UI changes',
      time: '2 days ago',
      status: 'warning'
    }
  ];

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return (
          <div className="flex-shrink-0 w-2 h-2 bg-green-400 rounded-full"></div>
        );
      case 'warning':
        return (
          <div className="flex-shrink-0 w-2 h-2 bg-yellow-400 rounded-full"></div>
        );
      case 'info':
        return (
          <div className="flex-shrink-0 w-2 h-2 bg-blue-400 rounded-full"></div>
        );
      default:
        return (
          <div className="flex-shrink-0 w-2 h-2 bg-gray-400 rounded-full"></div>
        );
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Welcome back, {user?.name || user?.login}!
          </h1>
          <p className="text-gray-600">
            Here's what's happening with your testing projects
          </p>
        </div>
        
        <Link to="/projects">
          <Button>Create New Project</Button>
        </Link>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.name} className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="text-2xl font-bold text-gray-900">{stat.value}</div>
                </div>
              </div>
              <div className="mt-1">
                <div className="text-sm font-medium text-gray-500">{stat.name}</div>
                <div className={`text-sm ${stat.trend === 'up' ? 'text-green-600' : 'text-gray-500'}`}>
                  {stat.change}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Recent Activity */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-medium text-gray-900">Recent Activity</h2>
        </div>
        <div className="p-6">
          {recentActivity.length > 0 ? (
            <div className="flow-root">
              <ul className="-mb-8">
                {recentActivity.map((activity, activityIdx) => (
                  <li key={activity.id}>
                    <div className="relative pb-8">
                      {activityIdx !== recentActivity.length - 1 ? (
                        <span
                          className="absolute top-4 left-4 -ml-px h-full w-0.5 bg-gray-200"
                          aria-hidden="true"
                        />
                      ) : null}
                      <div className="relative flex space-x-3">
                        <div className="flex items-center">
                          {getStatusIcon(activity.status)}
                        </div>
                        <div className="min-w-0 flex-1 pt-1.5 flex justify-between space-x-4">
                          <div>
                            <p className="text-sm text-gray-500">
                              <span className="font-medium text-gray-900">{activity.project}</span>{' '}
                              {activity.message}
                            </p>
                          </div>
                          <div className="text-right text-sm whitespace-nowrap text-gray-500">
                            {activity.time}
                          </div>
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="text-center py-12">
              <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <h3 className="mt-2 text-sm font-medium text-gray-900">No activity yet</h3>
              <p className="mt-1 text-sm text-gray-500">
                Get started by creating your first testing project
              </p>
              <div className="mt-6">
                <Link to="/projects">
                  <Button>Create Project</Button>
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}