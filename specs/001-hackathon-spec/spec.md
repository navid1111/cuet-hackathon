# CUET Micro-Ops Hackathon 2025 — Technical Specification

## Overview

- Purpose: Plan implementation details for four challenges to deliver a resilient Node.js microservice with S3-compatible storage, asynchronous downloads, robust CI/CD, and observability.
- Current state: No S3 integration; synchronous download endpoints time out for 10–120s jobs; basic CI/CD; no observability dashboard.
- Decisions must align with the Team Constitution in `.specify/memory/constitution.md` (time-boxing, contracts, CI gates, S3-compatible storage, Redis).

## Dependencies & Order of Work

- Blocking dependencies:
  - Challenge 1 (S3) must precede health checks and any downloads that rely on storage.
  - Challenge 2 (Architecture) depends on Redis selection and endpoint contracts; it should follow S3, then enable E2E for async.
  - Challenge 3 (CI/CD) enforces gates across S3 + Architecture; can be updated in parallel once contracts are defined.
  - Challenge 4 (Observability) should integrate after API contracts exist and CI passes core gates.
- Suggested order: 1 → 2 → 3, with 4 as bonus after green CI.

---

## Challenge 1: S3 Storage Integration (15 pts)

### Goals

- Add MinIO to `docker/compose.dev.yml` and `docker/compose.prod.yml`.
- Auto-create `downloads` bucket at startup using `mc` client.
- Configure API to connect to MinIO via environment variables.
- Health endpoint returns `{"status":"healthy","checks":{"storage":"ok"}}`.
- Pass E2E tests: `npm run test:e2e`.

### Files to Create/Modify

- `docker/compose.dev.yml` (add `minio` and `minio-setup` services)
- `docker/compose.prod.yml` (add `minio` and `minio-setup` services)
- `src/index.ts` (add storage health check and MinIO client config)
- `.env.development` and `.env.production` (new env vars)
- `README.md` (document storage setup and health contract)

### MinIO Service Configuration (compose)

- Service `minio`:
  - Image: `minio/minio:RELEASE.2025-01-10T00-00-00Z` (or latest stable)
  - Command: `server /data --console-address :9001`
  - Ports: `9000:9000` (S3 API), `9001:9001` (Console)
  - Volumes: `minio_data:/data`
  - Environment:
    - `MINIO_ROOT_USER=${MINIO_ROOT_USER}`
    - `MINIO_ROOT_PASSWORD=${MINIO_ROOT_PASSWORD}`
  - Networks: default compose network (app can reach `http://minio:9000`)

- Service `minio-setup`:
  - Image: `minio/mc:RELEASE.2025-01-10T00-00-00Z`
  - Depends_on: `minio`
  - Command: initialize alias and create bucket `downloads` if not exists.
  - Example command:
    - `sh -c "mc alias set local http://minio:9000 $MINIO_ROOT_USER $MINIO_ROOT_PASSWORD && mc mb --ignore-existing local/downloads"`

### Network Configuration

- API service references MinIO via hostname `minio` inside compose network.
- No host networking required; services communicate via default Docker network.

### Environment Variables (.env)

- Add to `.env.development` and `.env.production`:
  - `MINIO_ENDPOINT=minio`
  - `MINIO_PORT=9000`
  - `MINIO_ROOT_USER=admin`
  - `MINIO_ROOT_PASSWORD=changemechangeme`
  - `MINIO_USE_SSL=false`
  - `MINIO_BUCKET=downloads`

### API Configuration & Health Check

- In `src/index.ts`, configure S3 client (MinIO-compatible) using env vars.
- Implement health endpoint `/health` that:
  - Attempts `headBucket(MINIO_BUCKET)` (or list buckets constrained) and returns status.
  - Response shape: `{"status":"healthy","checks":{"storage":"ok"}}` when bucket is present and accessible.

### Init Script (mc client)

- Use `minio-setup` container in compose with `mc` to:
  - Set alias `local` to `http://minio:9000`
  - Create bucket `downloads` if it does not exist.
  - This runs on every compose up; idempotent via `--ignore-existing`.

### Commands

```fish
# Development
docker compose -f docker/compose.dev.yml up -d

# Verify bucket exists
docker compose -f docker/compose.dev.yml exec minio-setup sh -c "mc ls local/downloads"

# Run E2E tests
npm run test:e2e
```

### Acceptance Criteria

- `docker/compose.dev.yml` and `docker/compose.prod.yml` include `minio` and `minio-setup`.
- On `docker compose up`, `downloads` bucket exists.
- `/health` returns exact JSON with `storage: ok` when MinIO reachable and bucket exists.
- `npm run test:e2e` passes.

### Rollback Plan

- Revert compose changes and env vars via git.
- Disable storage health check path behind a feature flag `ENABLE_STORAGE=false` if needed.
- Document steps in `README.md` to revert.

### Estimated Time

- 60–90 minutes including E2E and health implementation.

---

## Challenge 2: Architecture Design (15 pts)

### Goal

- Design and document an asynchronous system for variable download processing times (10–120s), operating behind Cloudflare/nginx reverse proxies.

### Files to Create/Modify

- `ARCHITECTURE.md` (new)
- `src/index.ts` (define async endpoints/contracts; job submission, status polling, presigned download URL generation)
- `README.md` (developer flows and manual testing)

### Chosen Pattern

- Pattern: Polling (SSE/WebSocket can be added later; polling is simplest, reliable behind proxies, and aligns with time-box and CI constraints).
- Justification: Works with reverse proxies and avoids long-held connections. Clear contracts for job creation + status polling + presigned download.

### Technologies

- Cache/Queue: Redis (for job IDs, statuses, and simple queue semantics).
- Job processing: In-process worker loop or BullMQ (if needed). Start with simple Redis-backed queue to meet time-box.

### New API Endpoints

- `POST /jobs`
  - Request: `{ "payload": { ... } }` (opaque payload for processing)
  - Response: `{ "jobId": "<uuid>", "status": "queued" }`

- `GET /jobs/:jobId`
  - Response: `{ "jobId": "<uuid>", "status": "queued|processing|completed|failed", "progress": <0-100>, "downloadUrl": "<presigned-url-or-null>" }`

- `GET /download/:jobId`
  - Response: `{ "url": "<presigned-url>", "expiresIn": 900 }`
  - Behavior: Only available if job status `completed` and object present at `downloads/<jobId>.bin` (or format defined).

- `GET /health`
  - Adds `jobs` check: `{ "status": "healthy", "checks": { "storage": "ok", "jobs": "ok" } }` when Redis reachable and queue operating.

### Request/Response Schemas

- Job status enum: `queued | processing | completed | failed`.
- Presigned URLs expire within 15 minutes.
- Error format: `{ "error": { "code": "string", "message": "string" } }`.

### Data Models & Schemas

- Redis keys:
  - `job:{jobId}:status` → string
  - `job:{jobId}:progress` → int (0–100)
  - `job:{jobId}:resultKey` → `downloads/{jobId}.bin`
  - `jobs:queue` → list for queued job IDs

### Job Queue Implementation

- Simple pattern:
  - `POST /jobs` pushes `{jobId}` to `jobs:queue` and sets `status=queued`.
  - Worker loop consumes from `jobs:queue`, processes workload (10–120s), writes output to MinIO bucket, updates `status` + `progress`.
  - On completion, generate presigned URL via S3 client.

### Timeouts

- Proxy (Cloudflare/nginx): keep `POST /jobs` under 5s; polling `GET /jobs/:jobId` under 1s per call.
- API: request handler timeouts at 2s for simple operations; background worker not bound by request timeout.
- Worker: max job runtime 180s; abort with `failed` if exceeded.

### Error Handling Strategy

- Consistent error object with `code` and `message`.
- Retries on MinIO transient errors (up to 3 attempts with backoff).
- If Redis unavailable, return `503` with guidance.

### Frontend Integration Examples (React Hooks)

```tsx
// frontend example hook (pseudo-code for docs)
import { useEffect, useState } from "react";

export function useDownloadJob(payload: any) {
  const [jobId, setJobId] = useState<string | undefined>();
  const [status, setStatus] = useState("idle");
  const [downloadUrl, setDownloadUrl] = useState<string | undefined>();

  async function start() {
    const res = await fetch("/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payload }),
    });
    const data = await res.json();
    setJobId(data.jobId);
    setStatus("queued");
  }

  useEffect(() => {
    if (!jobId) return;
    const id = setInterval(async () => {
      const res = await fetch(`/jobs/${jobId}`);
      const data = await res.json();
      setStatus(data.status);
      if (data.downloadUrl) setDownloadUrl(data.downloadUrl);
    }, 2000);
    return () => clearInterval(id);
  }, [jobId]);

  return { start, status, downloadUrl };
}
```

### Architecture Diagram (ASCII)

```
Client ----POST /jobs----> API ----> Redis (queue/status)
   |                          |           |
   |<--GET /jobs/:id (poll)--|           |
   |                          v           v
   |                     Worker <---- consumes queue
   |                          |
   |                          v
   |                      MinIO (downloads bucket)
   |                          |
   |<--GET /download/:id------|
```

### Commands

```fish
# Start dev stack (includes Redis and MinIO once defined in compose)
docker compose -f docker/compose.dev.yml up -d

# Manual test flow
curl -s -X POST http://localhost:3000/jobs -H 'Content-Type: application/json' -d '{"payload": {"example": true}}'
curl -s http://localhost:3000/jobs/<jobId>
curl -s http://localhost:3000/download/<jobId>
```

### Acceptance Criteria

- `ARCHITECTURE.md` documents the polling-based async design, endpoints, schemas, timeouts, and diagrams.
- API exposes `POST /jobs`, `GET /jobs/:jobId`, and `GET /download/:jobId` with documented responses.
- Health adds `jobs` check.
- Manual curl examples behave as specified when worker simulated.

### Estimated Time

- 60–90 minutes to document and stub endpoints.

---

## Challenge 3: CI/CD Pipeline (10 pts)

### Goal

- Enhance CI to run lint, format check, E2E tests, and Docker build; trigger on push to `main` and on PRs. Add CI badge to `README.md`.

### Files to Create/Modify

- `.github/workflows/ci.yml` (new or updated)
- `README.md` (add CI badge)

### Pipeline Stages & Order

1. Checkout & setup Node
2. Install dependencies (with caching)
3. Lint (`npm run lint`)
4. Format check (`npm run format:check` or `prettier --check`)
5. Build (if applicable)
6. E2E tests (`npm run test:e2e`) with services (MinIO/Redis) via `docker compose -f docker/compose.dev.yml up -d`
7. Docker build (`docker build -f docker/Dockerfile.prod .`)

### Caching Strategy

- Use `actions/setup-node` cache for npm (`cache: 'npm'`).
- Optionally cache `~/.cache` for tools.

### Parallelization Opportunities

- Run lint and format in parallel jobs; gate E2E and Docker build after both succeed.

### Secrets & Environment Variables

- `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD` for local stack (can use defaults for CI; avoid production secrets).
- Optional: `SENTRY_DSN` for tests that assert error reporting (not required for base CI).

### Deployment Target

- Skip for now; document possible targets (Railway/Render). Keep job skeleton commented for future.

### Badge URL & Placement

- Add to top of `README.md`:
  - `![CI](https://github.com/bongodev/cuet-micro-ops-hackthon-2025/actions/workflows/ci.yml/badge.svg)`

### Documentation Updates

- `README.md` should include CI stages, how to run locally, and badge.

### Commands

```fish
# Validate locally
npm run lint
npm run format:check
docker compose -f docker/compose.dev.yml up -d
npm run test:e2e
docker build -f docker/Dockerfile.prod .
```

### Acceptance Criteria

- CI runs on PRs and pushes to `main`.
- CI jobs include lint, format check, E2E, and Docker build.
- Badge appears in `README.md` and reflects CI status.

### Estimated Time

- 45–60 minutes.

---

## Challenge 4: Observability Dashboard (Bonus 10 pts)

### Goal

- Create a React frontend showing health status, download jobs, errors, and traces; integrate Sentry and OpenTelemetry; add Jaeger UI to compose.

### Files to Create/Modify

- `frontend/` (new React app via Vite)
- `frontend/src/components/` (key components)
- `frontend/src/otel.ts` (OpenTelemetry init)
- `frontend/src/sentry.ts` (Sentry init)
- `docker/compose.dev.yml` and `docker/compose.prod.yml` (add Jaeger service)
- `README.md` (usage)

### React Project Structure

- Tooling: Vite + React + TypeScript.
- Structure:
  - `frontend/src/App.tsx`
  - `frontend/src/components/HealthCard.tsx`
  - `frontend/src/components/JobsList.tsx`
  - `frontend/src/components/ErrorsPanel.tsx`
  - `frontend/src/components/TracesView.tsx`
  - `frontend/src/otel.ts` (OTel web tracer provider)
  - `frontend/src/sentry.ts` (Sentry init + error boundary)

### Key Components (at least 4)

- `HealthCard`: Polls `/health`, shows storage and jobs checks.
- `JobsList`: Polls `/jobs` listing recent job statuses.
- `ErrorsPanel`: Displays client-side captured errors via Sentry and server-provided recent errors.
- `TracesView`: Shows trace IDs and links to Jaeger UI.

### Sentry Setup Steps

- Env var: `SENTRY_DSN` in frontend.
- Initialize in `frontend/src/sentry.ts` with error boundary wrapper.

### OpenTelemetry Configuration

- Initialize web tracer provider; propagate trace headers to API.
- Ensure API logs include trace IDs (server side).

### Docker Compose Updates for Jaeger

- Add service `jaeger`:
  - Image: `jaegertracing/all-in-one:1.53`
  - Ports: `16686:16686` (UI), `4318:4318` (OTLP HTTP)
  - Environment: default

### API Integration Strategy

- Polling aligns with architecture; use fetch with intervals for `/health` and `/jobs`.

### Data Flow Diagram

```
Frontend (React) -> API (/health, /jobs) -> Redis + MinIO
Frontend (OTel) -> OTLP HTTP -> Jaeger (all-in-one)
Frontend (Sentry) -> Sentry SaaS DSN
```

### Commands

```fish
# Create frontend app
npm create vite@latest frontend -- --template react-ts

# Run frontend
cd frontend
npm install
npm run dev

# Start Jaeger
docker compose -f docker/compose.dev.yml up -d jaeger
```

### Acceptance Criteria

- `frontend/` exists with Vite React TS project.
- Sentry initialized with DSN env; error boundary present.
- OpenTelemetry web tracing initialized; traces visible in Jaeger UI.
- UI shows health, job statuses, errors, and trace IDs.

### Estimated Time

- 60–90 minutes.

---

## Assumptions

- MinIO is acceptable for both dev and prod; credentials are non-secret for dev and stored in secrets for prod/CI.
- Redis is available via compose.
- Polling is adequate for UX; advanced real-time can be added later.
- Presigned URL validity: 15 minutes.

## Success Criteria

- Users can submit a job and retrieve a download URL within typical processing windows.
- `/health` shows `storage` and `jobs` checks as `ok` under normal operations.
- CI enforces lint/format/E2E/Docker build gates and shows badge.
- Observability: Jaeger UI reachable; traces generated; Sentry captures client errors.

# Feature Specification: [FEATURE NAME]

**Feature Branch**: `[###-feature-name]`  
**Created**: [DATE]  
**Status**: Draft  
**Input**: User description: "$ARGUMENTS"

## User Scenarios & Testing _(mandatory)_

<!--
  IMPORTANT: User stories should be PRIORITIZED as user journeys ordered by importance.
  Each user story/journey must be INDEPENDENTLY TESTABLE - meaning if you implement just ONE of them,
  you should still have a viable MVP (Minimum Viable Product) that delivers value.

  Assign priorities (P1, P2, P3, etc.) to each story, where P1 is the most critical.
  Think of each story as a standalone slice of functionality that can be:
  - Developed independently
  - Tested independently
  - Deployed independently
  - Demonstrated to users independently
-->

### User Story 1 - [Brief Title] (Priority: P1)

[Describe this user journey in plain language]

**Why this priority**: [Explain the value and why it has this priority level]

**Independent Test**: [Describe how this can be tested independently - e.g., "Can be fully tested by [specific action] and delivers [specific value]"]

**Acceptance Scenarios**:

1. **Given** [initial state], **When** [action], **Then** [expected outcome]
2. **Given** [initial state], **When** [action], **Then** [expected outcome]

---

### User Story 2 - [Brief Title] (Priority: P2)

[Describe this user journey in plain language]

**Why this priority**: [Explain the value and why it has this priority level]

**Independent Test**: [Describe how this can be tested independently]

**Acceptance Scenarios**:

1. **Given** [initial state], **When** [action], **Then** [expected outcome]

---

### User Story 3 - [Brief Title] (Priority: P3)

[Describe this user journey in plain language]

**Why this priority**: [Explain the value and why it has this priority level]

**Independent Test**: [Describe how this can be tested independently]

**Acceptance Scenarios**:

1. **Given** [initial state], **When** [action], **Then** [expected outcome]

---

[Add more user stories as needed, each with an assigned priority]

### Edge Cases

<!--
  ACTION REQUIRED: The content in this section represents placeholders.
  Fill them out with the right edge cases.
-->

- What happens when [boundary condition]?
- How does system handle [error scenario]?

## Requirements _(mandatory)_

<!--
  ACTION REQUIRED: The content in this section represents placeholders.
  Fill them out with the right functional requirements.
-->

### Functional Requirements

- **FR-001**: System MUST [specific capability, e.g., "allow users to create accounts"]
- **FR-002**: System MUST [specific capability, e.g., "validate email addresses"]
- **FR-003**: Users MUST be able to [key interaction, e.g., "reset their password"]
- **FR-004**: System MUST [data requirement, e.g., "persist user preferences"]
- **FR-005**: System MUST [behavior, e.g., "log all security events"]

_Example of marking unclear requirements:_

- **FR-006**: System MUST authenticate users via [NEEDS CLARIFICATION: auth method not specified - email/password, SSO, OAuth?]
- **FR-007**: System MUST retain user data for [NEEDS CLARIFICATION: retention period not specified]

### Key Entities _(include if feature involves data)_

- **[Entity 1]**: [What it represents, key attributes without implementation]
- **[Entity 2]**: [What it represents, relationships to other entities]

## Success Criteria _(mandatory)_

<!--
  ACTION REQUIRED: Define measurable success criteria.
  These must be technology-agnostic and measurable.
-->

### Measurable Outcomes

- **SC-001**: [Measurable metric, e.g., "Users can complete account creation in under 2 minutes"]
- **SC-002**: [Measurable metric, e.g., "System handles 1000 concurrent users without degradation"]
- **SC-003**: [User satisfaction metric, e.g., "90% of users successfully complete primary task on first attempt"]
- **SC-004**: [Business metric, e.g., "Reduce support tickets related to [X] by 50%"]
