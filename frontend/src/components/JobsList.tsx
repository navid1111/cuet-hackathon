import { useEffect, useState } from "react";
import { captureException } from "../sentry";

interface Job {
  jobId: string;
  status: "queued" | "processing" | "completed" | "failed";
  progress: number;
  downloadUrl?: string;
  createdAt: string;
  updatedAt?: string;
  error?: string;
}

export function JobsList() {
  const [jobs, setJobs] = useState<Job[]>(() => {
    // Load jobs from localStorage on initial render
    const savedJobs = localStorage.getItem("jobs");
    return savedJobs ? JSON.parse(savedJobs) : [];
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createPayload, setCreatePayload] = useState("");

  // Save jobs to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem("jobs", JSON.stringify(jobs));
  }, [jobs]);

  // Resume polling for in-progress jobs on mount
  useEffect(() => {
    jobs.forEach((job) => {
      if (job.status === "queued" || job.status === "processing") {
        pollJob(job.jobId);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount

  // Fetch job status
  const fetchJob = async (jobId: string) => {
    try {
      const response = await fetch(`/api/jobs/${jobId}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      return data as Job;
    } catch (err) {
      console.error(`Failed to fetch job ${jobId}:`, err);
      return null;
    }
  };

  // Create a new job
  const createJob = async () => {
    if (!createPayload.trim()) {
      setError("Payload cannot be empty");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      let payload;
      try {
        payload = JSON.parse(createPayload);
      } catch {
        payload = { data: createPayload };
      }

      const response = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payload }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const newJob = (await response.json()) as Job;
      setJobs((prev) => [newJob, ...prev]);
      setCreatePayload("");

      // Start polling for this job
      pollJob(newJob.jobId);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to create job";
      setError(errorMessage);
      captureException(err instanceof Error ? err : new Error(String(err)), {
        tags: { component: "JobsList", action: "create" },
      });
    } finally {
      setLoading(false);
    }
  };

  // Poll a specific job until completed or failed
  const pollJob = async (jobId: string) => {
    const maxAttempts = 60; // 5 minutes with 5s interval
    let attempts = 0;

    const poll = async () => {
      attempts++;
      const jobData = await fetchJob(jobId);

      if (jobData) {
        setJobs((prev) => prev.map((j) => (j.jobId === jobId ? jobData : j)));

        // Continue polling if still processing
        if (jobData.status === "queued" || jobData.status === "processing") {
          if (attempts < maxAttempts) {
            setTimeout(poll, 5000);
          }
        }
      }
    };

    poll();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "#10b981";
      case "processing":
        return "#3b82f6";
      case "queued":
        return "#f59e0b";
      case "failed":
        return "#ef4444";
      default:
        return "#6b7280";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return "✓";
      case "processing":
        return "⟳";
      case "queued":
        return "⏱";
      case "failed":
        return "✗";
      default:
        return "?";
    }
  };

  return (
    <div style={styles.card}>
      <h2 style={styles.title}>Download Jobs</h2>

      {/* Create Job Form */}
      <div style={styles.createForm}>
        <textarea
          style={styles.textarea}
          placeholder='Enter job payload (JSON or text, e.g. {"test": "data"})'
          value={createPayload}
          onChange={(e) => setCreatePayload(e.target.value)}
          rows={3}
        />
        <button
          style={{
            ...styles.button,
            ...(loading ? styles.buttonDisabled : {}),
          }}
          onClick={createJob}
          disabled={loading}
        >
          {loading ? "Creating..." : "Create Job"}
        </button>
        {error && <div style={styles.error}>{error}</div>}
      </div>

      {/* Jobs List */}
      {jobs.length === 0 ? (
        <div style={styles.placeholder}>
          <svg
            style={styles.icon}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
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
            Create your first job using the form above
          </p>
        </div>
      ) : (
        <div style={styles.jobsList}>
          {jobs.map((job) => (
            <div key={job.jobId} style={styles.jobCard}>
              <div style={styles.jobHeader}>
                <div style={styles.jobStatus}>
                  <span
                    style={{
                      ...styles.statusIcon,
                      color: getStatusColor(job.status),
                    }}
                  >
                    {getStatusIcon(job.status)}
                  </span>
                  <span style={styles.statusText}>{job.status}</span>
                </div>
                <div style={styles.jobId}>
                  <small>{job.jobId.slice(0, 8)}</small>
                </div>
              </div>

              {/* Progress Bar */}
              {(job.status === "processing" || job.status === "queued") && (
                <div style={styles.progressContainer}>
                  <div
                    style={{
                      ...styles.progressBar,
                      width: `${job.progress}%`,
                      backgroundColor: getStatusColor(job.status),
                    }}
                  />
                  <span style={styles.progressText}>{job.progress}%</span>
                </div>
              )}

              {/* Completion Message */}
              {job.status === "completed" && (
                <div style={styles.completedMessage}>
                  ✓ Job completed successfully
                </div>
              )}

              {/* Error Message */}
              {job.status === "failed" && job.error && (
                <div style={styles.jobError}>{job.error}</div>
              )}

              {/* Timestamps */}
              <div style={styles.jobFooter}>
                <small>
                  Created: {new Date(job.createdAt).toLocaleTimeString()}
                </small>
                {job.updatedAt && (
                  <small>
                    Updated: {new Date(job.updatedAt).toLocaleTimeString()}
                  </small>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const styles = {
  card: {
    backgroundColor: "#ffffff",
    border: "1px solid #e2e8f0",
    borderRadius: "8px",
    padding: "24px",
    boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
  },
  title: {
    fontSize: "20px",
    fontWeight: "600",
    marginBottom: "16px",
    color: "#1a202c",
  },
  createForm: {
    marginBottom: "24px",
    padding: "16px",
    backgroundColor: "#f7fafc",
    borderRadius: "6px",
    border: "1px solid #e2e8f0",
  },
  textarea: {
    width: "100%",
    padding: "12px",
    fontSize: "14px",
    border: "1px solid #cbd5e0",
    borderRadius: "4px",
    marginBottom: "12px",
    fontFamily: "monospace",
    resize: "vertical" as const,
  },
  button: {
    width: "100%",
    padding: "10px 16px",
    backgroundColor: "#3b82f6",
    color: "#ffffff",
    border: "none",
    borderRadius: "4px",
    fontSize: "14px",
    fontWeight: "500",
    cursor: "pointer",
  },
  buttonDisabled: {
    backgroundColor: "#93c5fd",
    cursor: "not-allowed",
  },
  error: {
    marginTop: "12px",
    padding: "8px 12px",
    backgroundColor: "#fee",
    color: "#dc2626",
    borderRadius: "4px",
    fontSize: "13px",
  },
  placeholder: {
    textAlign: "center" as const,
    padding: "48px 24px",
    color: "#718096",
  },
  icon: {
    width: "64px",
    height: "64px",
    margin: "0 auto 16px",
    color: "#cbd5e0",
  },
  placeholderTitle: {
    fontSize: "18px",
    fontWeight: "500",
    marginBottom: "8px",
    color: "#2d3748",
  },
  placeholderText: {
    fontSize: "14px",
    color: "#718096",
  },
  jobsList: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "12px",
  },
  jobCard: {
    padding: "16px",
    backgroundColor: "#f9fafb",
    border: "1px solid #e5e7eb",
    borderRadius: "6px",
  },
  jobHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "12px",
  },
  jobStatus: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  statusIcon: {
    fontSize: "18px",
    fontWeight: "bold",
  },
  statusText: {
    fontSize: "14px",
    fontWeight: "500",
    textTransform: "capitalize" as const,
  },
  jobId: {
    color: "#6b7280",
    fontSize: "12px",
    fontFamily: "monospace",
  },
  progressContainer: {
    position: "relative" as const,
    width: "100%",
    height: "24px",
    backgroundColor: "#e5e7eb",
    borderRadius: "4px",
    marginBottom: "12px",
    overflow: "hidden",
  },
  progressBar: {
    height: "100%",
    transition: "width 0.3s ease",
  },
  progressText: {
    position: "absolute" as const,
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    fontSize: "12px",
    fontWeight: "600",
    color: "#1f2937",
  },
  completedMessage: {
    padding: "8px 12px",
    backgroundColor: "#d1fae5",
    color: "#065f46",
    borderRadius: "4px",
    fontSize: "13px",
    fontWeight: "500",
    marginBottom: "12px",
    textAlign: "center" as const,
  },
  jobError: {
    padding: "8px 12px",
    backgroundColor: "#fee2e2",
    color: "#dc2626",
    borderRadius: "4px",
    fontSize: "13px",
    marginBottom: "12px",
  },
  jobFooter: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: "12px",
    color: "#6b7280",
  },
};
