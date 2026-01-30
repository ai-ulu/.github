import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../ui/Button';

interface UserProfileProps {
  showLogout?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export function UserProfile({ showLogout = true, size = 'md' }: UserProfileProps) {
  const { user, logout } = useAuth();

  if (!user) return null;

  const sizeClasses = {
    sm: 'h-8 w-8 text-sm',
    md: 'h-10 w-10 text-base',
    lg: 'h-12 w-12 text-lg'
  };

  return (
    <div className="flex items-center space-x-3">
      <img
        className={`rounded-full ${sizeClasses[size]}`}
        src={user.avatar_url || `https://ui-avatars.com/api/?name=${user.name || user.login}&background=3b82f6&color=fff`}
        alt={user.name || user.login}
      />
      
      <div className="flex-1 min-w-0">
        <p className={`font-medium text-gray-900 truncate ${size === 'sm' ? 'text-sm' : ''}`}>
          {user.name || user.login}
        </p>
        {user.email && (
          <p className={`text-gray-500 truncate ${size === 'sm' ? 'text-xs' : 'text-sm'}`}>
            {user.email}
          </p>
        )}
      </div>

      {showLogout && (
        <Button variant="outline" size={size === 'lg' ? 'md' : 'sm'} onClick={logout}>
          Logout
        </Button>
      )}
    </div>
  );
}