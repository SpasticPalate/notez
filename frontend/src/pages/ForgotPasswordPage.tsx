import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      await api.post('/api/auth/forgot-password', { email });
      setSubmitted(true);
    } catch (err: any) {
      // We still show success to prevent email enumeration
      // The API also returns success regardless of whether the email exists
      setSubmitted(true);
    } finally {
      setIsLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-700">
        <div className="max-w-md w-full space-y-8 p-8 bg-white dark:bg-gray-800 rounded-lg shadow-md">
          <div className="text-center">
            <img src="/icon-192x192.png" alt="Notez" className="w-16 h-16 mx-auto mb-4" />
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white">Check your email</h2>
            <p className="mt-4 text-sm text-gray-600 dark:text-gray-400">
              If an account exists with that email address, we've sent you a password reset link.
              The link will expire in 1 hour.
            </p>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              Didn't receive the email? Check your spam folder or{' '}
              <button
                onClick={() => {
                  setSubmitted(false);
                  setEmail('');
                }}
                className="text-blue-600 dark:text-blue-400 hover:underline"
              >
                try again
              </button>
            </p>
          </div>

          <div className="mt-6 text-center">
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

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-700">
      <div className="max-w-md w-full space-y-8 p-8 bg-white dark:bg-gray-800 rounded-lg shadow-md">
        <div className="text-center">
          <img src="/icon-192x192.png" alt="Notez" className="w-16 h-16 mx-auto mb-4" />
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white">Forgot password?</h2>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Enter your email address and we'll send you a link to reset your password.
          </p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {error && (
            <div className="rounded-md bg-red-50 p-4">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-200">
              Email address
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 dark:bg-blue-500 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Sending...' : 'Send reset link'}
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
