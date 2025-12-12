export function JobsList() {
  return (
    <div style={styles.card}>
      <h2 style={styles.title}>Download Jobs</h2>
      <div style={styles.placeholder}>
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
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
        <h3 style={styles.placeholderTitle}>No jobs yet</h3>
        <p style={styles.placeholderText}>
          Jobs will appear here once the async architecture is implemented.
        </p>
        <div style={styles.comingSoon}>
          <span style={styles.badge}>Coming Soon</span>
        </div>
      </div>
      <div style={styles.info}>
        <p style={styles.infoText}>
          <strong>Phase 4 Feature:</strong> This component will display download
          jobs with status tracking, progress bars, and download links once the
          backend job endpoints are implemented.
        </p>
        <div style={styles.features}>
          <h4 style={styles.featuresTitle}>Planned Features:</h4>
          <ul style={styles.featuresList}>
            <li>Create new download jobs</li>
            <li>Real-time status updates (queued → processing → completed)</li>
            <li>Progress tracking (0-100%)</li>
            <li>Download links with presigned URLs</li>
            <li>Job history and management</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

const styles = {
  card: {
    backgroundColor: "#1f2937",
    borderRadius: "8px",
    padding: "24px",
    marginBottom: "20px",
    boxShadow: "0 4px 6px rgba(0, 0, 0, 0.1)",
    color: "#f3f4f6",
  },
  title: {
    fontSize: "24px",
    fontWeight: "bold",
    marginBottom: "16px",
    color: "#f9fafb",
  },
  placeholder: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    justifyContent: "center",
    padding: "60px 20px",
    backgroundColor: "#111827",
    borderRadius: "8px",
    border: "2px dashed #374151",
  },
  icon: {
    width: "80px",
    height: "80px",
    color: "#4b5563",
    marginBottom: "16px",
  },
  placeholderTitle: {
    fontSize: "20px",
    fontWeight: "600",
    color: "#9ca3af",
    marginBottom: "8px",
  },
  placeholderText: {
    fontSize: "14px",
    color: "#6b7280",
    textAlign: "center" as const,
    maxWidth: "400px",
  },
  comingSoon: {
    marginTop: "20px",
  },
  badge: {
    backgroundColor: "#3b82f6",
    color: "#ffffff",
    padding: "6px 16px",
    borderRadius: "20px",
    fontSize: "12px",
    fontWeight: "600",
    textTransform: "uppercase" as const,
    letterSpacing: "0.5px",
  },
  info: {
    marginTop: "24px",
    padding: "20px",
    backgroundColor: "#111827",
    borderRadius: "8px",
    border: "1px solid #374151",
  },
  infoText: {
    fontSize: "14px",
    color: "#d1d5db",
    lineHeight: "1.6",
    marginBottom: "16px",
  },
  features: {
    marginTop: "16px",
  },
  featuresTitle: {
    fontSize: "14px",
    fontWeight: "600",
    color: "#e5e7eb",
    marginBottom: "12px",
  },
  featuresList: {
    listStyle: "none",
    padding: 0,
    margin: 0,
  },
};

// Add individual list item styling
const ListItem = ({ children }: { children: React.ReactNode }) => (
  <li
    style={{
      fontSize: "13px",
      color: "#9ca3af",
      padding: "6px 0",
      paddingLeft: "20px",
      position: "relative" as const,
    }}
  >
    <span
      style={{
        position: "absolute" as const,
        left: 0,
        color: "#3b82f6",
      }}
    >
      ▸
    </span>
    {children}
  </li>
);

// Export enhanced JobsList with styled list items
export function JobsListEnhanced() {
  return (
    <div style={styles.card}>
      <h2 style={styles.title}>Download Jobs</h2>
      <div style={styles.placeholder}>
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
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
        <h3 style={styles.placeholderTitle}>No jobs yet</h3>
        <p style={styles.placeholderText}>
          Jobs will appear here once the async architecture is implemented.
        </p>
        <div style={styles.comingSoon}>
          <span style={styles.badge}>Coming Soon</span>
        </div>
      </div>
      <div style={styles.info}>
        <p style={styles.infoText}>
          <strong>Phase 4 Feature:</strong> This component will display download
          jobs with status tracking, progress bars, and download links once the
          backend job endpoints are implemented.
        </p>
        <div style={styles.features}>
          <h4 style={styles.featuresTitle}>Planned Features:</h4>
          <ul style={styles.featuresList}>
            <ListItem>Create new download jobs</ListItem>
            <ListItem>
              Real-time status updates (queued → processing → completed)
            </ListItem>
            <ListItem>Progress tracking (0-100%)</ListItem>
            <ListItem>Download links with presigned URLs</ListItem>
            <ListItem>Job history and management</ListItem>
          </ul>
        </div>
      </div>
    </div>
  );
}
