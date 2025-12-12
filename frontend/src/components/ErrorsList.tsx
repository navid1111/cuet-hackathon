import { useEffect, useState } from "react";
import { subscribeToErrors, clearErrors, type CapturedError } from "../errorStore";

export function ErrorsList() {
  const [errors, setErrors] = useState<CapturedError[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    const unsubscribe = subscribeToErrors((newErrors) => {
      setErrors([...newErrors]);
    });
    return unsubscribe;
  }, []);

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "error":
      case "fatal":
        return "#ef4444";
      case "warning":
        return "#f59e0b";
      case "info":
        return "#3b82f6";
      default:
        return "#6b7280";
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case "error":
      case "fatal":
        return "❌";
      case "warning":
        return "⚠️";
      case "info":
        return "ℹ️";
      default:
        return "📋";
    }
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  if (errors.length === 0) {
    return (
      <div style={styles.card}>
        <div style={styles.header}>
          <h2 style={styles.title}>🛡️ Error Log (Sentry)</h2>
        </div>
        <div style={styles.emptyState}>
          <span style={styles.emptyIcon}>✨</span>
          <p style={styles.emptyText}>No errors captured yet</p>
          <p style={styles.emptySubtext}>
            Errors will appear here when they occur
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.card}>
      <div style={styles.header}>
        <h2 style={styles.title}>🛡️ Error Log (Sentry)</h2>
        <div style={styles.headerActions}>
          <span style={styles.errorCount}>{errors.length} error{errors.length !== 1 ? "s" : ""}</span>
          <button
            onClick={clearErrors}
            style={styles.clearButton}
            onMouseOver={(e) => {
              e.currentTarget.style.background = "rgba(239, 68, 68, 0.3)";
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = "rgba(239, 68, 68, 0.15)";
            }}
          >
            Clear All
          </button>
        </div>
      </div>
      <div style={styles.errorList}>
        {errors.map((error) => (
          <div
            key={error.id}
            style={{
              ...styles.errorItem,
              borderLeftColor: getSeverityColor(error.severity),
            }}
            onClick={() => toggleExpand(error.id)}
          >
            <div style={styles.errorHeader}>
              <span style={styles.severityIcon}>
                {getSeverityIcon(error.severity)}
              </span>
              <div style={styles.errorInfo}>
                <span style={styles.errorMessage}>{error.message}</span>
                <span style={styles.errorTime}>{formatTime(error.timestamp)}</span>
              </div>
              <span style={styles.expandIcon}>
                {expanded.has(error.id) ? "▼" : "▶"}
              </span>
            </div>
            {expanded.has(error.id) && (
              <div style={styles.errorDetails}>
                {error.component && (
                  <div style={styles.detailRow}>
                    <span style={styles.detailLabel}>Component:</span>
                    <span style={styles.detailValue}>{error.component}</span>
                  </div>
                )}
                {error.errorType && (
                  <div style={styles.detailRow}>
                    <span style={styles.detailLabel}>Type:</span>
                    <span style={styles.detailValue}>{error.errorType}</span>
                  </div>
                )}
                {error.stack && (
                  <div style={styles.stackTrace}>
                    <span style={styles.detailLabel}>Stack Trace:</span>
                    <pre style={styles.stackContent}>{error.stack}</pre>
                  </div>
                )}
                {error.extra && Object.keys(error.extra).length > 0 && (
                  <div style={styles.extraInfo}>
                    <span style={styles.detailLabel}>Additional Info:</span>
                    <pre style={styles.extraContent}>
                      {JSON.stringify(error.extra, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    background: "rgba(255, 255, 255, 0.1)",
    backdropFilter: "blur(20px)",
    borderRadius: "20px",
    padding: "24px",
    boxShadow: "0 8px 32px rgba(0, 0, 0, 0.1)",
    border: "1px solid rgba(255, 255, 255, 0.2)",
    marginTop: "24px",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "20px",
    flexWrap: "wrap",
    gap: "12px",
  },
  title: {
    color: "#ffffff",
    fontSize: "20px",
    fontWeight: "700",
    margin: 0,
  },
  headerActions: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
  },
  errorCount: {
    color: "rgba(255, 255, 255, 0.7)",
    fontSize: "14px",
    fontWeight: "500",
  },
  clearButton: {
    padding: "8px 16px",
    borderRadius: "8px",
    fontSize: "13px",
    fontWeight: "600",
    cursor: "pointer",
    border: "none",
    background: "rgba(239, 68, 68, 0.15)",
    color: "#ffffff",
    transition: "all 0.2s ease",
  },
  emptyState: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "40px 20px",
  },
  emptyIcon: {
    fontSize: "48px",
    marginBottom: "16px",
  },
  emptyText: {
    color: "#ffffff",
    fontSize: "16px",
    fontWeight: "600",
    margin: 0,
    marginBottom: "8px",
  },
  emptySubtext: {
    color: "rgba(255, 255, 255, 0.6)",
    fontSize: "14px",
    margin: 0,
  },
  errorList: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    maxHeight: "400px",
    overflowY: "auto",
  },
  errorItem: {
    background: "rgba(0, 0, 0, 0.2)",
    borderRadius: "12px",
    padding: "16px",
    borderLeft: "4px solid",
    cursor: "pointer",
    transition: "all 0.2s ease",
  },
  errorHeader: {
    display: "flex",
    alignItems: "flex-start",
    gap: "12px",
  },
  severityIcon: {
    fontSize: "18px",
    flexShrink: 0,
  },
  errorInfo: {
    flex: 1,
    minWidth: 0,
  },
  errorMessage: {
    color: "#ffffff",
    fontSize: "14px",
    fontWeight: "500",
    display: "block",
    wordBreak: "break-word",
  },
  errorTime: {
    color: "rgba(255, 255, 255, 0.5)",
    fontSize: "12px",
    marginTop: "4px",
    display: "block",
  },
  expandIcon: {
    color: "rgba(255, 255, 255, 0.5)",
    fontSize: "12px",
    flexShrink: 0,
  },
  errorDetails: {
    marginTop: "16px",
    paddingTop: "16px",
    borderTop: "1px solid rgba(255, 255, 255, 0.1)",
  },
  detailRow: {
    display: "flex",
    gap: "8px",
    marginBottom: "8px",
    fontSize: "13px",
  },
  detailLabel: {
    color: "rgba(255, 255, 255, 0.6)",
    fontWeight: "500",
  },
  detailValue: {
    color: "#ffffff",
    fontFamily: "monospace",
  },
  stackTrace: {
    marginTop: "12px",
  },
  stackContent: {
    background: "rgba(0, 0, 0, 0.3)",
    borderRadius: "8px",
    padding: "12px",
    color: "rgba(255, 255, 255, 0.8)",
    fontSize: "11px",
    fontFamily: "monospace",
    overflowX: "auto",
    margin: "8px 0 0 0",
    whiteSpace: "pre-wrap",
    wordBreak: "break-all",
  },
  extraInfo: {
    marginTop: "12px",
  },
  extraContent: {
    background: "rgba(0, 0, 0, 0.3)",
    borderRadius: "8px",
    padding: "12px",
    color: "rgba(255, 255, 255, 0.8)",
    fontSize: "11px",
    fontFamily: "monospace",
    overflowX: "auto",
    margin: "8px 0 0 0",
  },
};
