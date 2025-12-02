import { useState, useEffect } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isValidating, setIsValidating] = useState(true);
  const [isValidToken, setIsValidToken] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    async function validateToken() {
      if (!token) {
        setIsValidating(false);
        setIsValidToken(false);
        return;
      }

      try {
        const response = await api.get(`/api/auth/validate-reset-token?token=${encodeURIComponent(token)}`);
        setIsValidToken(response.data.valid);
      } catch {
        setIsValidToken(false);
      } finally {
        setIsValidating(false);
      }
    }

    validateToken();
  }, [token]);

  const validatePassword = (pwd: string): string | null => {
    if (pwd.length < 8) {
      return 'Password must be at least 8 characters';
    }
    if (!/[A-Z]/.test(pwd)) {
      return 'Password must contain at least one uppercase letter';
    }
    if (!/[0-9]/.test(pwd)) {
      return 'Password must contain at least one number';
    }
    if (!/[^A-Za-z0-9]/.test(pwd)) {
      return 'Password must contain at least one special character';
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    const passwordError = validatePassword(password);
    if (passwordError) {
      setError(passwordError);
      return;
    }

    setIsLoading(true);

    try {
      await api.post('/api/auth/reset-password', {
        token,
        newPassword: password,
      });
      setSuccess(true);
    } catch (err: any) {
      const message = err.response?.data?.error || 'Failed to reset password. Please try again.';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  // Loading state while validating token
  if (isValidating) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-700">
        <div className="max-w-md w-full space-y-8 p-8 bg-white dark:bg-gray-800 rounded-lg shadow-md">
          <div className="text-center">
            <img src="/icon-192x192.png" alt="Notez" className="w-16 h-16 mx-auto mb-4" />
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white">Validating...</h2>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              Please wait while we verify your reset link.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Invalid or expired token
  if (!isValidToken) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-700">
        <div className="max-w-md w-full space-y-8 p-8 bg-white dark:bg-gray-800 rounded-lg shadow-md">
          <div className="text-center">
            <img src="/icon-192x192.png" alt="Notez" className="w-16 h-16 mx-auto mb-4" />
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white">Invalid or Expired Link</h2>
            <p className="mt-4 text-sm text-gray-600 dark:text-gray-400">
              This password reset link is invalid or has expired.
              Please request a new password reset link.
            </p>
          </div>

          <div className="mt-6 text-center space-y-4">
            <Link
              to="/forgot-password"
              className="block w-full py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 dark:bg-blue-500 hover:bg-blue-700 text-center"
            >
              Request New Reset Link
            </Link>
            <Link
              to="/login"
              className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
            >
              Back to sign in
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Success state
  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-700">
        <div className="max-w-md w-full space-y-8 p-8 bg-white dark:bg-gray-800 rounded-lg shadow-md">
          <div className="text-center">
            <img src="/icon-192x192.png" alt="Notez" className="w-16 h-16 mx-auto mb-4" />
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white">Password Reset!</h2>
            <p className="mt-4 text-sm text-gray-600 dark:text-gray-400">
              Your password has been successfully reset.
              You can now sign in with your new password.
            </p>
          </div>

          <div className="mt-6 text-center">
            <button
              onClick={() => navigate('/login')}
              className="w-full py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 dark:bg-blue-500 hover:bg-blue-700"
            >
              Sign In
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Password reset form
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-700">
      <div className="max-w-md w-full space-y-8 p-8 bg-white dark:bg-gray-800 rounded-lg shadow-md">
        <div className="text-center">
          <img src="/icon-192x192.png" alt="Notez" className="w-16 h-16 mx-auto mb-4" />
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white">Reset Password</h2>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Enter your new password below.
          </p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {error && (
            <div className="rounded-md bg-red-50 dark:bg-red-900/30 p-4">
              <p className="text-sm text-red-800 dark:text-red-300">{error}</p>
            </div>
          )}

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-gray-200">
              New Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              placeholder="Enter new password"
              minLength={8}
            />
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 dark:text-gray-200">
              Confirm Password
            </label>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              placeholder="Confirm new password"
              minLength={8}
            />
          </div>

          <div>
            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 dark:bg-blue-500 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Resetting...' : 'Reset Password'}
            </button>
          </div>

          <div className="text-center">
            <Link
              to="/login"
              className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
            >
              Back to sign in
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
