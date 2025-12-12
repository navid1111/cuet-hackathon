import { useEffect, useState } from 'react';
import { captureException } from '../sentry';

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  checks: {
    storage?: 'ok' | 'fail';
    jobs?: 'ok' | 'fail';
  };
}

export function HealthCard() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchHealth = async () => {
      try {
        setLoading(true);
        setError(null);
        // Use /api proxy configured in vite.config.ts to avoid CORS issues
        const response = await fetch('/api/health');
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        setHealth(data);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to fetch health status';
        setError(errorMessage);
        
        // Send health check errors to Sentry
        captureException(
          err instanceof Error ? err : new Error(String(err)),
          {
            tags: {
              component: 'HealthCard',
              errorType: 'health-check-failure'
            },
            extra: {
              errorMessage,
              timestamp: new Date().toISOString()
            }
          }
        );
      } finally {
        setLoading(false);
      }
    };

    fetchHealth();
    const interval = setInterval(fetchHealth, 5000); // Poll every 5 seconds

    return () => clearInterval(interval);
  }, []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy':
      case 'ok':
        return '#10b981'; // green
      case 'degraded':
        return '#f59e0b'; // amber
      case 'unhealthy':
      case 'fail':
        return '#ef4444'; // red
      default:
        return '#6b7280'; // gray
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy':
      case 'ok':
        return '✓';
      case 'degraded':
        return '⚠';
      case 'unhealthy':
      case 'fail':
        return '✗';
      default:
        return '?';
    }
  };

  if (loading && !health) {
    return (
      <div style={styles.card}>
        <h2 style={styles.title}>System Health</h2>
        <p style={styles.loading}>Loading health status...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.card}>
        <h2 style={styles.title}>System Health</h2>
        <div style={{ ...styles.status, color: getStatusColor('fail') }}>
          <span style={styles.icon}>{getStatusIcon('fail')}</span>
          Error: {error}
        </div>
      </div>
    );
  }

  if (!health) {
    return null;
  }

  return (
    <div style={styles.card}>
      <h2 style={styles.title}>System Health</h2>
      <div style={{ ...styles.status, color: getStatusColor(health.status) }}>
        <span style={styles.icon}>{getStatusIcon(health.status)}</span>
        <span style={styles.statusText}>
          Overall Status: <strong>{health.status.toUpperCase()}</strong>
        </span>
      </div>
      <div style={styles.checks}>
        <h3 style={styles.checksTitle}>Component Checks:</h3>
        {health.checks.storage && (
          <div style={styles.check}>
            <span style={{ color: getStatusColor(health.checks.storage) }}>
              {getStatusIcon(health.checks.storage)}
            </span>
            <span style={styles.checkLabel}>Storage (MinIO):</span>
            <span style={styles.checkValue}>{health.checks.storage}</span>
          </div>
        )}
        {health.checks.jobs && (
          <div style={styles.check}>
            <span style={{ color: getStatusColor(health.checks.jobs) }}>
              {getStatusIcon(health.checks.jobs)}
            </span>
            <span style={styles.checkLabel}>Jobs (Redis):</span>
            <span style={styles.checkValue}>{health.checks.jobs}</span>
          </div>
        )}
      </div>
      <div style={styles.footer}>
        Last updated: {new Date().toLocaleTimeString()}
      </div>
    </div>
  );
}

const styles = {
  card: {
    backgroundColor: '#1f2937',
    borderRadius: '8px',
    padding: '24px',
    marginBottom: '20px',
    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
    color: '#f3f4f6',
  },
  title: {
    fontSize: '24px',
    fontWeight: 'bold',
    marginBottom: '16px',
    color: '#f9fafb',
  },
  loading: {
    color: '#9ca3af',
    fontSize: '14px',
  },
  status: {
    fontSize: '18px',
    marginBottom: '20px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  icon: {
    fontSize: '24px',
    fontWeight: 'bold',
  },
  statusText: {
    fontSize: '16px',
  },
  checks: {
    marginTop: '16px',
  },
  checksTitle: {
    fontSize: '16px',
    fontWeight: '600',
    marginBottom: '12px',
    color: '#e5e7eb',
  },
  check: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 0',
    fontSize: '14px',
  },
  checkLabel: {
    fontWeight: '500',
    minWidth: '140px',
    color: '#d1d5db',
  },
  checkValue: {
    fontFamily: 'monospace',
    padding: '2px 8px',
    backgroundColor: '#374151',
    borderRadius: '4px',
    color: '#e5e7eb',
  },
  footer: {
    marginTop: '16px',
    fontSize: '12px',
    color: '#9ca3af',
    fontStyle: 'italic',
  },
};
