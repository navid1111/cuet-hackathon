# Architecture Design: Async Download System

## Overview

This document describes the architecture for handling **long-running download operations** (10-120+ seconds) in a resilient manner, designed to work behind reverse proxies (Cloudflare, nginx, AWS ALB) that impose connection timeouts.

**Author**: Sadman (Team Delineate)  
**Date**: December 12, 2025  
**Version**: 1.0.0

---

## Problem Statement

### The Challenge

When processing file downloads that take 10-120+ seconds:

| Issue                   | Impact                                           |
| ----------------------- | ------------------------------------------------ |
| **Cloudflare Timeout**  | 100s default timeout kills long HTTP connections |
| **nginx Timeout**       | Default 60s `proxy_read_timeout` drops requests  |
| **AWS ALB Timeout**     | 60s idle timeout terminates connections          |
| **User Experience**     | No feedback during long waits leads to confusion |
| **Resource Exhaustion** | Holding connections consumes server memory       |
| **Retry Storms**        | Dropped connections cause duplicate work         |

### Requirements

1. Handle processing times of 10-120+ seconds
2. Work reliably behind ALL reverse proxies
3. Provide progress feedback to clients
4. Allow horizontal scaling
5. Support job persistence across restarts
6. Enable graceful error handling

---

## Chosen Architecture: Polling Pattern

### Why Polling?

| Pattern     | Proxy Compatible         | Complexity | Real-time   | Chosen     |
| ----------- | ------------------------ | ---------- | ----------- | ---------- |
| **Polling** | ✅ All proxies           | Low        | ~1-3s delay | ✅ **YES** |
| WebSocket   | ⚠️ Requires config       | High       | Instant     | ❌         |
| SSE         | ⚠️ May timeout           | Medium     | Instant     | ❌         |
| Webhook     | ❌ Client needs endpoint | Medium     | Instant     | ❌         |

**Decision**: Polling is the most reliable pattern that works with all proxy configurations without special setup.

---

## System Architecture

### High-Level Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            CLIENT APPLICATION                                │
│  (React Frontend / Mobile App / External Service)                           │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      │ HTTP/HTTPS
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         REVERSE PROXY LAYER                                  │
│  (Cloudflare / nginx / AWS ALB)                                             │
│  - Connection timeout: 60-100s                                               │
│  - Our requests complete in <2s ✓                                           │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              API SERVER                                      │
│  (Hono + Node.js)                                                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  POST /jobs ────────────►  Create job, push to queue   ◄─── Returns <100ms │
│                                    │                                         │
│  GET /jobs/:id ─────────►  Read status from Redis      ◄─── Returns <50ms  │
│                                    │                                         │
│  GET /download/:id ─────►  Generate presigned URL      ◄─── Returns <200ms │
│                                    │                                         │
│  GET /health ───────────►  Check Redis + S3 health     ◄─── Returns <100ms │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                    ┌─────────────────┴─────────────────┐
                    ▼                                   ▼
┌──────────────────────────────┐    ┌──────────────────────────────────────────┐
│          REDIS               │    │              MINIO (S3)                   │
│  (Job Queue + Status Store)  │    │         (Object Storage)                  │
├──────────────────────────────┤    ├──────────────────────────────────────────┤
│                              │    │                                          │
│  jobs:queue (List)           │    │  downloads/                              │
│  ├─ jobId-1                  │    │  ├─ {jobId-1}.bin                        │
│  ├─ jobId-2                  │    │  ├─ {jobId-2}.bin                        │
│  └─ jobId-3                  │    │  └─ {jobId-3}.bin                        │
│                              │    │                                          │
│  job:{jobId}:status          │    │  Bucket: downloads                       │
│  job:{jobId}:progress        │    │  Auto-created on compose up              │
│  job:{jobId}:resultKey       │    │                                          │
│  job:{jobId}:payload         │    │                                          │
│  job:{jobId}:createdAt       │    │                                          │
│  job:{jobId}:updatedAt       │    │                                          │
│  job:{jobId}:error           │    │                                          │
│                              │    │                                          │
└──────────────────────────────┘    └──────────────────────────────────────────┘
         ▲                                           ▲
         │                                           │
         │         ┌─────────────────────────────────┤
         │         │                                 │
         ▼         ▼                                 │
┌──────────────────────────────────────────────────────────────────────────────┐
│                            BACKGROUND WORKER                                  │
│  (In-process loop / Can be separate process)                                 │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. BRPOP jobs:queue (blocking pop, waits for jobs)                         │
│  2. SET job:{id}:status = "processing"                                       │
│  3. Process payload (simulate 10-120s work)                                  │
│  4. Write result to MinIO → downloads/{jobId}.bin                            │
│  5. SET job:{id}:status = "completed"                                        │
│  6. SET job:{id}:resultKey = "downloads/{jobId}.bin"                         │
│                                                                              │
│  On error:                                                                   │
│  - SET job:{id}:status = "failed"                                            │
│  - SET job:{id}:error = "error message"                                       │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Sequence Diagrams

### Job Creation Flow

```
┌────────┐          ┌─────────┐          ┌───────┐
│ Client │          │   API   │          │ Redis │
└────┬───┘          └────┬────┘          └───┬───┘
     │                   │                   │
     │ POST /jobs        │                   │
     │ {payload:{...}}   │                   │
     │──────────────────►│                   │
     │                   │                   │
     │                   │ SET job:{id}:*    │
     │                   │──────────────────►│
     │                   │                   │
     │                   │ LPUSH jobs:queue  │
     │                   │──────────────────►│
     │                   │                   │
     │ 200 OK            │                   │
     │ {jobId, status:   │                   │
     │  "queued"}        │                   │
     │◄──────────────────│                   │
     │                   │                   │
     │  (~50-100ms)      │                   │
```

### Status Polling Flow

```
┌────────┐          ┌─────────┐          ┌───────┐
│ Client │          │   API   │          │ Redis │
└────┬───┘          └────┬────┘          └───┬───┘
     │                   │                   │
     │ GET /jobs/:id     │                   │
     │──────────────────►│                   │
     │                   │                   │
     │                   │ MGET job:{id}:*   │
     │                   │──────────────────►│
     │                   │                   │
     │                   │◄──────────────────│
     │                   │                   │
     │ 200 OK            │                   │
     │ {status, progress}│                   │
     │◄──────────────────│                   │
     │                   │                   │
     │  (~20-50ms)       │                   │
     │                   │                   │
     │ ... repeat every  │                   │
     │     2-3 seconds   │                   │
```

### Download Flow (After Completion)

```
┌────────┐          ┌─────────┐          ┌───────┐          ┌───────┐
│ Client │          │   API   │          │ Redis │          │ MinIO │
└────┬───┘          └────┬────┘          └───┬───┘          └───┬───┘
     │                   │                   │                   │
     │ GET /download/:id │                   │                   │
     │──────────────────►│                   │                   │
     │                   │                   │                   │
     │                   │ GET job:{id}:*    │                   │
     │                   │──────────────────►│                   │
     │                   │                   │                   │
     │                   │◄──────────────────│                   │
     │                   │                   │                   │
     │                   │ getSignedUrl()    │                   │
     │                   │──────────────────────────────────────►│
     │                   │                   │                   │
     │                   │◄──────────────────────────────────────│
     │                   │                   │                   │
     │ 200 OK            │                   │                   │
     │ {url, expiresIn}  │                   │                   │
     │◄──────────────────│                   │                   │
     │                   │                   │                   │
     │ GET signed URL    │                   │                   │
     │──────────────────────────────────────────────────────────►│
     │                   │                   │                   │
     │ Binary file data  │                   │                   │
     │◄──────────────────────────────────────────────────────────│
```

### Background Worker Flow

```
┌────────┐          ┌───────┐          ┌───────┐
│ Worker │          │ Redis │          │ MinIO │
└────┬───┘          └───┬───┘          └───┬───┘
     │                   │                   │
     │ BRPOP jobs:queue  │                   │
     │ (blocking wait)   │                   │
     │──────────────────►│                   │
     │                   │                   │
     │ jobId             │                   │
     │◄──────────────────│                   │
     │                   │                   │
     │ SET status=       │                   │
     │   "processing"    │                   │
     │──────────────────►│                   │
     │                   │                   │
     │                   │                   │
     │ ... process job   │                   │
     │ (10-120 seconds)  │                   │
     │ SET progress=N    │                   │
     │──────────────────►│                   │
     │                   │                   │
     │ PUT object        │                   │
     │──────────────────────────────────────►│
     │                   │                   │
     │ SET status=       │                   │
     │   "completed"     │                   │
     │ SET resultKey     │                   │
     │──────────────────►│                   │
     │                   │                   │
     │ Loop back to BRPOP│                   │
```

---

## API Endpoints

### POST /jobs

Create a new download job.

**Request:**

```json
{
  "payload": {
    "fileIds": [12345, 67890],
    "format": "zip",
    "options": {}
  }
}
```

**Response (200 OK):**

```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "queued",
  "createdAt": "2025-12-12T10:30:00.000Z"
}
```

**Latency**: <100ms

---

### GET /jobs/:jobId

Get the current status of a job.

**Response (200 OK) - Queued:**

```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "queued",
  "progress": 0,
  "downloadUrl": null,
  "createdAt": "2025-12-12T10:30:00.000Z",
  "updatedAt": "2025-12-12T10:30:00.000Z"
}
```

**Response (200 OK) - Processing:**

```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "processing",
  "progress": 45,
  "downloadUrl": null,
  "createdAt": "2025-12-12T10:30:00.000Z",
  "updatedAt": "2025-12-12T10:30:45.000Z"
}
```

**Response (200 OK) - Completed:**

```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "completed",
  "progress": 100,
  "downloadUrl": "/download/550e8400-e29b-41d4-a716-446655440000",
  "createdAt": "2025-12-12T10:30:00.000Z",
  "updatedAt": "2025-12-12T10:32:15.000Z"
}
```

**Response (200 OK) - Failed:**

```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "failed",
  "progress": 67,
  "downloadUrl": null,
  "error": "Storage write failed after 3 retries",
  "createdAt": "2025-12-12T10:30:00.000Z",
  "updatedAt": "2025-12-12T10:31:30.000Z"
}
```

**Latency**: <50ms

---

### GET /download/:jobId

Get a presigned URL for downloading the completed job result.

**Response (200 OK):**

```json
{
  "url": "http://minio:9000/downloads/550e8400-e29b-41d4-a716-446655440000.bin?X-Amz-Algorithm=...",
  "expiresIn": 900,
  "contentType": "application/octet-stream",
  "size": 1048576
}
```

**Response (409 Conflict) - Job Not Completed:**

```json
{
  "error": {
    "code": "JOB_NOT_COMPLETED",
    "message": "Job is still processing. Current status: processing"
  }
}
```

**Response (404 Not Found) - Job Not Found:**

```json
{
  "error": {
    "code": "JOB_NOT_FOUND",
    "message": "No job found with ID: 550e8400-e29b-41d4-a716-446655440000"
  }
}
```

**Latency**: <200ms

---

### GET /health

Health check including storage and job queue status.

**Response (200 OK):**

```json
{
  "status": "healthy",
  "checks": {
    "storage": "ok",
    "jobs": "ok"
  }
}
```

**Response (503 Service Unavailable):**

```json
{
  "status": "unhealthy",
  "checks": {
    "storage": "ok",
    "jobs": "error"
  }
}
```

---

## Data Models

### Job Entity

| Field       | Type     | Description                                         |
| ----------- | -------- | --------------------------------------------------- |
| `jobId`     | UUID v4  | Unique identifier                                   |
| `status`    | Enum     | `queued` \| `processing` \| `completed` \| `failed` |
| `progress`  | Integer  | 0-100 percentage                                    |
| `payload`   | JSON     | Original request payload                            |
| `resultKey` | String   | S3 object key (e.g., `downloads/{jobId}.bin`)       |
| `error`     | String   | Error message if failed                             |
| `createdAt` | ISO 8601 | Job creation timestamp                              |
| `updatedAt` | ISO 8601 | Last update timestamp                               |

### Redis Key Schema

```
jobs:queue                     → List of jobIds (FIFO queue)
job:{jobId}:status             → "queued" | "processing" | "completed" | "failed"
job:{jobId}:progress           → "0" to "100"
job:{jobId}:payload            → JSON string
job:{jobId}:resultKey          → "downloads/{jobId}.bin"
job:{jobId}:error              → Error message (optional)
job:{jobId}:createdAt          → ISO timestamp
job:{jobId}:updatedAt          → ISO timestamp
```

### State Transitions

```
                    ┌─────────────────┐
                    │                 │
                    ▼                 │
┌─────────┐    ┌────────────┐    ┌────────────┐
│ queued  │───►│ processing │───►│ completed  │
└─────────┘    └────────────┘    └────────────┘
                    │
                    │ (on error)
                    ▼
              ┌──────────┐
              │  failed  │
              └──────────┘
```

**Valid Transitions:**

- `queued` → `processing` (worker picks up job)
- `processing` → `completed` (job finished successfully)
- `processing` → `failed` (job encountered error)

---

## Timeout Strategy

### Request Timeouts

| Component            | Timeout     | Rationale                 |
| -------------------- | ----------- | ------------------------- |
| Cloudflare           | 100s        | Fixed, cannot change      |
| nginx                | 60s default | Can configure higher      |
| AWS ALB              | 60s default | Can configure up to 4000s |
| **Our API requests** | **<2s**     | Well under all limits ✓   |

### Job Processing Timeouts

| Operation        | Timeout  | Handling                                     |
| ---------------- | -------- | -------------------------------------------- |
| Job processing   | 180s max | Abort with `failed` status                   |
| S3 upload        | 30s      | Retry up to 3 times with exponential backoff |
| Redis operations | 5s       | Fail fast, mark job as failed                |

### Polling Configuration

| Setting                | Value      | Rationale                               |
| ---------------------- | ---------- | --------------------------------------- |
| Initial poll delay     | 1s         | Give job time to start                  |
| Poll interval          | 2-3s       | Balance between responsiveness and load |
| Max poll duration      | 5 minutes  | Prevent indefinite polling              |
| Presigned URL validity | 15 minutes | Security vs. convenience                |

---

## Error Handling

### Error Response Format

All error responses follow this structure:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable description"
  }
}
```

### Error Codes

| Code                  | HTTP Status | Description             |
| --------------------- | ----------- | ----------------------- |
| `VALIDATION_ERROR`    | 400         | Invalid request payload |
| `JOB_NOT_FOUND`       | 404         | Job ID doesn't exist    |
| `JOB_NOT_COMPLETED`   | 409         | Job still processing    |
| `STORAGE_UNAVAILABLE` | 503         | MinIO connection failed |
| `QUEUE_UNAVAILABLE`   | 503         | Redis connection failed |
| `INTERNAL_ERROR`      | 500         | Unexpected server error |

### Retry Strategy

**S3 Operations:**

```
Attempt 1: Immediate
Attempt 2: Wait 1s
Attempt 3: Wait 2s
Attempt 4: Wait 4s (final)
```

**Redis Operations:**

- Connection retry with exponential backoff
- Fail fast for individual operations

---

## Scalability Considerations

### Horizontal Scaling

```
                    ┌─────────────┐
                    │ Load        │
                    │ Balancer    │
                    └─────────────┘
                          │
          ┌───────────────┼───────────────┐
          ▼               ▼               ▼
    ┌──────────┐    ┌──────────┐    ┌──────────┐
    │ API + W  │    │ API + W  │    │ API + W  │
    │ Instance │    │ Instance │    │ Instance │
    └──────────┘    └──────────┘    └──────────┘
          │               │               │
          └───────────────┴───────────────┘
                          │
                    ┌─────┴─────┐
                    ▼           ▼
              ┌─────────┐ ┌─────────┐
              │  Redis  │ │  MinIO  │
              │ (shared)│ │ (shared)│
              └─────────┘ └─────────┘
```

**Key Points:**

- Each instance runs both API and worker
- Redis ensures only one worker processes each job (BRPOP is atomic)
- Stateless API allows load balancing any request to any instance

### Bottlenecks & Mitigations

| Bottleneck         | Mitigation                   |
| ------------------ | ---------------------------- |
| Redis single point | Redis Cluster / Sentinel     |
| MinIO throughput   | MinIO distributed mode       |
| Worker capacity    | Scale instances horizontally |

---

## Frontend Integration

### React Hook Example

```tsx
import { useCallback, useEffect, useState } from "react";

interface JobStatus {
  jobId: string;
  status: "queued" | "processing" | "completed" | "failed";
  progress: number;
  downloadUrl: string | null;
  error?: string;
}

export function useDownloadJob() {
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<JobStatus | null>(null);
  const [isPolling, setIsPolling] = useState(false);

  // Create a new job
  const createJob = useCallback(async (payload: object) => {
    const response = await fetch("/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payload }),
    });
    const data = await response.json();
    setJobId(data.jobId);
    setIsPolling(true);
    return data.jobId;
  }, []);

  // Poll for status updates
  useEffect(() => {
    if (!jobId || !isPolling) return;

    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(`/jobs/${jobId}`);
        const data: JobStatus = await response.json();
        setStatus(data);

        // Stop polling when job is terminal
        if (data.status === "completed" || data.status === "failed") {
          setIsPolling(false);
        }
      } catch (error) {
        console.error("Polling error:", error);
      }
    }, 2000); // Poll every 2 seconds

    return () => clearInterval(pollInterval);
  }, [jobId, isPolling]);

  // Get download URL
  const getDownloadUrl = useCallback(async () => {
    if (!jobId) return null;
    const response = await fetch(`/download/${jobId}`);
    const data = await response.json();
    return data.url;
  }, [jobId]);

  return {
    createJob,
    jobId,
    status,
    isPolling,
    getDownloadUrl,
  };
}
```

### Usage Example

```tsx
function DownloadButton() {
  const { createJob, status, getDownloadUrl } = useDownloadJob();

  const handleDownload = async () => {
    await createJob({ fileIds: [12345, 67890] });
  };

  if (status?.status === "completed") {
    return (
      <button
        onClick={async () => {
          const url = await getDownloadUrl();
          window.open(url, "_blank");
        }}
      >
        Download Ready!
      </button>
    );
  }

  if (status?.status === "processing") {
    return <div>Processing... {status.progress}%</div>;
  }

  return <button onClick={handleDownload}>Start Download</button>;
}
```

---

## Testing Strategy

### Manual Testing

```fish
# 1. Create a job
set JOB_ID (curl -s -X POST http://localhost:3000/jobs \
  -H 'Content-Type: application/json' \
  -d '{"payload":{"fileIds":[12345]}}' | jq -r '.jobId')

echo "Created job: $JOB_ID"

# 2. Poll status until completed
while true
    set STATUS (curl -s http://localhost:3000/jobs/$JOB_ID | jq -r '.status')
    set PROGRESS (curl -s http://localhost:3000/jobs/$JOB_ID | jq -r '.progress')
    echo "Status: $STATUS, Progress: $PROGRESS%"

    if test "$STATUS" = "completed" -o "$STATUS" = "failed"
        break
    end
    sleep 2
end

# 3. Get download URL (if completed)
if test "$STATUS" = "completed"
    curl -s http://localhost:3000/download/$JOB_ID | jq
end
```

### E2E Test Criteria

1. **Job Creation**: `POST /jobs` returns `jobId` and `status: "queued"` within 100ms
2. **Status Polling**: `GET /jobs/:id` returns current status within 50ms
3. **Completion**: Job transitions to `completed` with `resultKey` pointing to valid S3 object
4. **Download URL**: `GET /download/:id` returns valid presigned URL that downloads file
5. **Error Handling**: Failed jobs have `status: "failed"` and `error` message
6. **Health Check**: `/health` shows `jobs: "ok"` when Redis is healthy

---

## Deployment Notes

### Environment Variables

```env
# Redis Configuration
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_DB=0

# S3/MinIO Configuration
S3_ENDPOINT=http://minio:9000
S3_ACCESS_KEY_ID=admin
S3_SECRET_ACCESS_KEY=changemechangeme
S3_BUCKET_NAME=downloads
S3_FORCE_PATH_STYLE=true

# Feature Flags
ENABLE_STORAGE=true

# Timing
DOWNLOAD_DELAY_MIN_MS=10000
DOWNLOAD_DELAY_MAX_MS=120000
```

### Docker Compose Services

```yaml
services:
  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes
    volumes:
      - redis-data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5

  minio:
    image: minio/minio:latest
    command: server /data --console-address ":9001"
    environment:
      - MINIO_ROOT_USER=admin
      - MINIO_ROOT_PASSWORD=changemechangeme
    volumes:
      - minio-data:/data
```

---

## Changelog

| Version | Date       | Changes                     |
| ------- | ---------- | --------------------------- |
| 1.0.0   | 2025-12-12 | Initial architecture design |

---

## References

- [Polling vs WebSocket vs SSE](https://medium.com/system-design/polling-vs-websocket-vs-sse)
- [Redis Lists Documentation](https://redis.io/docs/data-types/lists/)
- [AWS S3 Presigned URLs](https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html)
- [Cloudflare Timeout Limits](https://developers.cloudflare.com/support/troubleshooting/cloudflare-errors/troubleshooting-cloudflare-5xx-errors/)
