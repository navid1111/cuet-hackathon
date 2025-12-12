import * as Sentry from '@sentry/react';

/**
 * Initialize Sentry error tracking for the frontend application
 * 
 * Note: For this hackathon demo, Sentry is configured but requires a valid DSN.
 * Set VITE_SENTRY_DSN environment variable with your Sentry project DSN to enable error tracking.
 */
export function initializeSentry() {
  const sentryDsn = import.meta.env.VITE_SENTRY_DSN;
  
  if (!sentryDsn) {
    console.warn('⚠ Sentry DSN not configured. Error tracking disabled. Set VITE_SENTRY_DSN to enable.');
    return false;
  }

  try {
    Sentry.init({
      dsn: sentryDsn,
      environment: import.meta.env.MODE || 'development',
      integrations: [
        Sentry.browserTracingIntegration(),
        Sentry.replayIntegration({
          maskAllText: false,
          blockAllMedia: false,
        }),
      ],
      // Performance Monitoring
      tracesSampleRate: 1.0, // Capture 100% of transactions for demo
      // Session Replay
      replaysSessionSampleRate: 0.1, // 10% of sessions
      replaysOnErrorSampleRate: 1.0, // 100% of sessions with errors
      
      // Additional configuration
      beforeSend(event, hint) {
        // Log errors to console in development
        if (import.meta.env.MODE === 'development') {
          console.error('Sentry captured error:', hint.originalException || hint.syntheticException);
        }
        return event;
      },
    });

    console.log('✓ Sentry initialized - errors will be tracked');
    return true;
  } catch (error) {
    console.error('Failed to initialize Sentry:', error);
    return false;
  }
}

/**
 * Manually capture an exception to Sentry
 */
export function captureException(error: Error, context?: Record<string, unknown>) {
  if (context) {
    Sentry.setContext('additional', context);
  }
  Sentry.captureException(error);
}

/**
 * Manually capture a message to Sentry
 */
export function captureMessage(message: string, level: Sentry.SeverityLevel = 'info') {
  Sentry.captureMessage(message, level);
}

/**
 * Test Sentry integration by throwing an intentional error
 */
export function testSentryIntegration() {
  try {
    throw new Error('Test error from CUET Hackathon Frontend - Sentry is working!');
  } catch (error) {
    Sentry.captureException(error);
    console.log('Test error sent to Sentry. Check your Sentry dashboard.');
  }
}
