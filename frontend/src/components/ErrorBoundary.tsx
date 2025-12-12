import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import * as Sentry from '@sentry/react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    Sentry.captureException(error, {
      contexts: {
        react: {
          componentStack: errorInfo.componentStack,
        },
      },
    });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={styles.container}>
          <div style={styles.card}>
            <div style={styles.iconContainer}>
              <svg
                style={styles.icon}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>
            <h1 style={styles.title}>Oops! Something went wrong</h1>
            <p style={styles.message}>
              The application encountered an unexpected error. This error has been logged and reported.
            </p>
            {this.state.error && (
              <div style={styles.errorDetails}>
                <details>
                  <summary style={styles.summary}>Error Details</summary>
                  <pre style={styles.pre}>
                    {this.state.error.toString()}
                    {'\n\n'}
                    {this.state.error.stack}
                  </pre>
                </details>
              </div>
            )}
            <div style={styles.actions}>
              <button onClick={this.handleReset} style={styles.button}>
                Try Again
              </button>
              <button
                onClick={() => window.location.reload()}
                style={{ ...styles.button, ...styles.buttonSecondary }}
              >
                Reload Page
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

const styles = {
  container: {
    minHeight: '100vh',
    backgroundColor: '#111827',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '20px',
  },
  card: {
    backgroundColor: '#1f2937',
    borderRadius: '12px',
    padding: '40px',
    maxWidth: '600px',
    width: '100%',
    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3)',
  },
  iconContainer: {
    display: 'flex',
    justifyContent: 'center',
    marginBottom: '24px',
  },
  icon: {
    width: '64px',
    height: '64px',
    color: '#ef4444',
  },
  title: {
    fontSize: '24px',
    fontWeight: 'bold',
    color: '#f9fafb',
    textAlign: 'center' as const,
    marginBottom: '16px',
  },
  message: {
    fontSize: '16px',
    color: '#d1d5db',
    textAlign: 'center' as const,
    marginBottom: '24px',
    lineHeight: '1.6',
  },
  errorDetails: {
    marginTop: '24px',
    marginBottom: '24px',
  },
  summary: {
    fontSize: '14px',
    color: '#9ca3af',
    cursor: 'pointer',
    marginBottom: '12px',
    userSelect: 'none' as const,
  },
  pre: {
    backgroundColor: '#111827',
    color: '#ef4444',
    padding: '16px',
    borderRadius: '8px',
    fontSize: '12px',
    overflow: 'auto',
    maxHeight: '200px',
    fontFamily: 'monospace',
  },
  actions: {
    display: 'flex',
    gap: '12px',
    justifyContent: 'center',
  },
  button: {
    padding: '12px 24px',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    border: 'none',
    backgroundColor: '#3b82f6',
    color: '#ffffff',
    transition: 'background-color 0.2s',
  },
  buttonSecondary: {
    backgroundColor: '#374151',
  },
};
