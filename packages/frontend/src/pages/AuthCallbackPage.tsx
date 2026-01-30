import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import toast from 'react-hot-toast';

export function AuthCallbackPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { login } = useAuth();

  useEffect(() => {
    const handleCallback = async () => {
      const code = searchParams.get('code');
      const state = searchParams.get('state');
      const error = searchParams.get('error');
      const storedState = sessionStorage.getItem('oauth_state');

      // Clear stored state
      sessionStorage.removeItem('oauth_state');

      if (error) {
        toast.error(`Authentication failed: ${error}`);
        navigate('/login');
        return;
      }

      if (!code) {
        toast.error('No authorization code received');
        navigate('/login');
        return;
      }

      if (!state || state !== storedState) {
        toast.error('Invalid state parameter');
        navigate('/login');
        return;
      }

      try {
        // Exchange code for token
        const response = await fetch('/api/auth/github/callback', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ code, state }),
        });

        if (!response.ok) {
          throw new Error('Failed to exchange code for token');
        }

        const { token } = await response.json();
        
        // Login with the received token
        await login(token);
        
        toast.success('Successfully logged in!');
        navigate('/dashboard');
      } catch (error) {
        console.error('Authentication error:', error);
        toast.error('Authentication failed. Please try again.');
        navigate('/login');
      }
    };

    handleCallback();
  }, [searchParams, navigate, login]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <LoadingSpinner size="lg" />
        <p className="mt-4 text-gray-600">Completing authentication...</p>
      </div>
    </div>
  );
}