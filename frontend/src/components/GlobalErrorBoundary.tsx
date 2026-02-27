import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { AlertCircle } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class GlobalErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Always log crash errors — these indicate critical failures
    console.error('Application crashed:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4"
        >
          <div className="text-center max-w-md">
            <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-6 h-6 text-red-600 dark:text-red-400" aria-hidden="true" />
            </div>
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
              Something went wrong
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
              An unexpected error occurred. Try reloading the page, or go back to the home screen.
            </p>
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
              >
                Reload Page
              </button>
              <a
                href="/"
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-200 dark:bg-gray-700 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
              >
                Go Home
              </a>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
