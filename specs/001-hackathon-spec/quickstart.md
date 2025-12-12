# Quickstart

## Prerequisites

- Node.js >= 24.10.0
- npm >= 10
- Docker >= 24, Compose >= 2

## Environment

Copy `.env.example` to `.env` and ensure:

```
S3_ENDPOINT=http://minio:9000
S3_ACCESS_KEY_ID=admin
S3_SECRET_ACCESS_KEY=changemechangeme
S3_BUCKET_NAME=downloads
S3_FORCE_PATH_STYLE=true
```

## Start Stack (Development)

```fish
docker compose -f docker/compose.dev.yml up -d
npm run dev
```

## Validate Health

```fish
curl -s http://localhost:3000/health
```

Expected:

```
{"status":"healthy","checks":{"storage":"ok"}}
```

## Job Flow

```fish
# Create job
set JOB_ID (curl -s -X POST http://localhost:3000/jobs -H 'Content-Type: application/json' -d '{"payload":{"example":true}}' | jq -r .jobId)

# Poll status
curl -s http://localhost:3000/jobs/$JOB_ID

# Get download URL (once completed)
curl -s http://localhost:3000/download/$JOB_ID
```

## E2E Tests

```fish
npm run test:e2e
```
