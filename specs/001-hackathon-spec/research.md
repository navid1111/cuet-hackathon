# Phase 0 Research

## Decisions

- **S3 Storage**: MinIO via Docker Compose, bucket `downloads` created by `minio-setup` using `mc` client.
- **Async Pattern**: Polling pattern for job status; avoids long-held connections, works behind Cloudflare/nginx.
- **Queue/State**: Redis for job queue and status keys; simple worker loop (BullMQ optional later).
- **Download Delivery**: Presigned S3 URLs valid 15 minutes; object key `downloads/<jobId>.bin`.
- **Health Contract**: `/health` returns `{"status":"healthy","checks":{"storage":"ok"}}` once bucket accessible.
- **CI/CD**: GitHub Actions runs lint, format check, E2E, Docker build; uses Node cache.
- **Observability**: Optional dashboard via Vite React TS; Jaeger `all-in-one` in compose; Sentry DSN configured in frontend.

## Rationale

- **MinIO**: Easiest S3-compatible service to run locally and in CI; mature tooling (`mc`).
- **Polling**: Simplicity and reliability with proxies; avoids WebSocket/SSE complexity within time-box.
- **Redis**: Lightweight and reliable for queues/status; ubiquitous and easy in Compose.
- **Presigned URLs**: Offload downloads to S3-compatible storage; reduces API load and avoids proxy timeouts.
- **Health Contract**: Matches spec acceptance criteria; enables E2E tests to validate storage.
- **CI/CD**: Ensures gates mandated by Constitution; fast feedback with caching.
- **Observability**: Adds traceability and error visibility; bonus after core points.

## Alternatives Considered

- **RustFS vs MinIO**: RustFS is lightweight but less common; MinIO chosen for stability and tooling.
- **WebSocket/SSE**: Real-time updates possible; deferred due to proxy complexities and time-box.
- **BullMQ/Kafka**: Robust queuing; overkill for hackathon scope; simple Redis list sufficient.
- **Direct Downloads via API**: Risks timeouts and resource waste; presigned URLs preferred.
