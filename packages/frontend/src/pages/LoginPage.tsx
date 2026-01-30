import { useAuth } from '../contexts/AuthContext';
import { GitHubLoginButton } from '../components/auth/GitHubLoginButton';

export function LoginPage() {
  return (
    <div className="max-w-md mx-auto mt-20">
      <div className="bg-white py-8 px-6 shadow rounded-lg">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">
            Sign in to AutoQA Pilot
          </h2>
          
          <p className="text-gray-600 mb-8">
            Connect your GitHub account to get started with AI-powered testing
          </p>

          <GitHubLoginButton className="w-full" />

          <p className="mt-6 text-xs text-gray-500">
            By signing in, you agree to our terms of service and privacy policy
          </p>
        </div>
      </div>
    </div>
  );
}