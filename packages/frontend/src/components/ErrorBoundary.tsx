import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Error caught by boundary:', error, errorInfo);
    
    this.setState({
      error,
      errorInfo,
    });

    // Log error to monitoring service in production
    if (import.meta.env.PROD) {
      // TODO: Send to error monitoring service
      console.error('Production error:', {
        error: error.message,
        stack: error.stack,
        componentStack: errorInfo.componentStack,
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
        url: window.location.href,
      });
    }
  }

  handleReload = () => {
    window.location.reload();
  };

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  render() {
    if (this.state.hasError) {
      // Custom fallback UI
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
          <div className="max-w-md w-full">
            <div className="card">
              <div className="card-body text-center">
                <div className="flex justify-center mb-4">
                  <div className="p-3 bg-error-100 rounded-full">
                    <AlertTriangle className="h-8 w-8 text-error-600" />
                  </div>
                </div>
                
                <h1 className="text-xl font-semibold text-gray-900 mb-2">
                  Bir şeyler ters gitti
                </h1>
                
                <p className="text-gray-600 mb-6">
                  Beklenmeyen bir hata oluştu. Lütfen sayfayı yenileyin veya daha sonra tekrar deneyin.
                </p>

                {/* Error details in development */}
                {import.meta.env.DEV && this.state.error && (
                  <details className="mb-6 text-left">
                    <summary className="cursor-pointer text-sm text-gray-500 hover:text-gray-700">
                      Hata detayları (geliştirici modu)
                    </summary>
                    <div className="mt-2 p-3 bg-gray-100 rounded text-xs font-mono text-gray-800 overflow-auto max-h-32">
                      <div className="font-semibold mb-1">Error:</div>
                      <div className="mb-2">{this.state.error.message}</div>
                      {this.state.error.stack && (
                        <>
                          <div className="font-semibold mb-1">Stack:</div>
                          <pre className="whitespace-pre-wrap">{this.state.error.stack}</pre>
                        </>
                      )}
                    </div>
                  </details>
                )}

                <div className="flex flex-col sm:flex-row gap-3">
                  <button
                    onClick={this.handleReset}
                    className="btn-outline flex-1"
                  >
                    Tekrar Dene
                  </button>
                  <button
                    onClick={this.handleReload}
                    className="btn-primary flex-1"
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Sayfayı Yenile
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// Hook version for functional components
export function useErrorHandler() {
  return (error: Error, errorInfo?: ErrorInfo) => {
    console.error('Error caught by hook:', error, errorInfo);
    
    // In a real app, you might want to send this to an error reporting service
    if (import.meta.env.PROD) {
      // TODO: Send to error monitoring service
    }
  };
}