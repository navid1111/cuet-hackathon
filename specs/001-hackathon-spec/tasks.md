# Tasks — Delineate Hackathon Challenges

Feature: CUET Micro-Ops Hackathon 2025 — Resilient Node.js Microservice
Feature Dir: `/home/navid-kamal/cuet_hackathon/cuet-hackathon/cuet-micro-ops-hackthon-2025/specs/001-hackathon-spec`

Owner Assignments:

- Navid: S3 storage integration + health checks
- Sadman: Async architecture endpoints + Redis worker
- Sakib: CI/CD pipeline and documentation updates

Implementation Strategy: MVP first (User Story 1), then incremental delivery.

Dependencies (Story Order):

- US1 (S3) → US2 (Async Architecture) → US3 (CI/CD)
- US4 (Observability) optional after US1–US3 green

Parallel Execution Examples:

- Lint and format jobs in CI can run in parallel.
- Compose updates for dev and prod can be edited in parallel after env agreement.
- Endpoint stubs can be written in parallel with worker scaffold once Redis config decided.

---

## Phase 1 — Setup

- [X] T001 Create baseline env files `.env.development` and `.env.production` at repo root
- [X] T002 Document local run steps in `README.md` (compose up, e2e, envs)
- [X] T003 Validate project scripts run: `npm run lint`, `npm run test:e2e` (adjust README if needed)

Checks:

- After T001: Verify env files exist and are git-ignored; run `cat .env.development | wc -l` > 0.
- After T002: `grep -q "docker compose -f docker/compose.dev.yml up -d" README.md`.
- After T003: Commands exit 0 locally.

---

## Phase 2 — Foundational (blocking prerequisites)

- [X] T004 [P] Agree environment variable names in `README.md` and `.env.*` for MinIO and Redis
- [X] T005 Ensure `docker/compose.dev.yml` boots existing API container successfully

Checks:

- After T004: `grep -q "MINIO_ENDPOINT" README.md` and `.env.development` contains expected keys.
- After T005: `docker compose -f docker/compose.dev.yml up -d` starts with exit 0.

---

## Phase 3 — User Story 1 (P1): S3 Storage Integration

Goal: MinIO in compose, bucket auto-created, `/health` shows `storage: ok`.
Independent Test Criteria: Compose up creates `downloads` bucket; `/health` returns `{"status":"healthy","checks":{"storage":"ok"}}`.

Assignments: Navid

- [X] T006 [P] [US1] Add `minio` service in `docker/compose.dev.yml`
- [X] T007 [P] [US1] Add `minio-setup` service with `mc` bucket init in `docker/compose.dev.yml`
- [X] T008 [P] [US1] Mirror `minio` and `minio-setup` in `docker/compose.prod.yml`
- [X] T009 [P] [US1] Add MinIO env vars to `.env.development` and `.env.production`
- [X] T010 [US1] Configure S3 client in `src/index.ts` using env vars
- [X] T011 [US1] Implement `/health` storage check in `src/index.ts`
- [X] T012 [P] [US1] Update `README.md` with storage setup and health contract
- [X] T013 [US1] Run E2E tests `npm run test:e2e` and ensure pass

Checks:

- After T006/T007: `docker compose -f docker/compose.dev.yml up -d && docker compose -f docker/compose.dev.yml exec minio-setup sh -c "mc ls local/downloads"` exits 0.
- After T008: `docker compose -f docker/compose.prod.yml config` renders services.
- After T009: `grep -q "MINIO_BUCKET=downloads" .env.development`.
- After T010: `npm run build` or `tsc --noEmit` type checks.
- After T011: `curl -s http://localhost:3000/health | jq -e '.checks.storage=="ok"'` succeeds.
- After T012: `grep -q '"storage":"ok"' README.md`.
- After T013: CI/local `npm run test:e2e` exits 0.

---

## Phase 4 — User Story 2 (P1): Async Architecture (Polling + Redis + Presigned URLs)

Goal: `POST /jobs`, `GET /jobs/:jobId`, `GET /download/:jobId` with Redis-backed processing and presigned URLs.
Independent Test Criteria: Can create a job, poll status to `completed`, and fetch presigned URL pointing to object in `downloads/`.

Assignments: Sadman

- [ ] T014 [P] [US2] Create `ARCHITECTURE.md` documenting endpoints, schemas, timeouts, diagram
- [ ] T015 [P] [US2] Add Redis service to `docker/compose.dev.yml`
- [ ] T016 [US2] Implement `POST /jobs` in `src/index.ts` (queue push + `queued` status)
- [ ] T017 [US2] Implement `GET /jobs/:jobId` in `src/index.ts` (status/progress/url)
- [ ] T018 [US2] Implement `GET /download/:jobId` in `src/index.ts` (generate presigned URL)
- [ ] T019 [US2] Add `jobs` check in `/health` (Redis reachable)
- [ ] T020 [US2] Implement simple worker loop in `src/index.ts` or `src/worker.ts` (consume queue, write to MinIO, update status)
- [ ] T021 [P] [US2] Document manual curl tests in `README.md`

Checks:

- After T014: `grep -q "Polling" specs/001-hackathon-spec/ARCHITECTURE.md`.
- After T015: `docker compose -f docker/compose.dev.yml up -d redis && docker compose -f docker/compose.dev.yml ps redis` shows running.
- After T016: `curl -s -X POST http://localhost:3000/jobs -H 'Content-Type: application/json' -d '{"payload":{"example":true}}' | jq -e '.jobId and .status=="queued"'`.
- After T017: `curl -s http://localhost:3000/jobs/<jobId> | jq -e '.status'` returns one of expected enums.
- After T018: when completed, `curl -s http://localhost:3000/download/<jobId> | jq -e '.url and .expiresIn==900'`.
- After T019: `curl -s http://localhost:3000/health | jq -e '.checks.jobs=="ok"'`.
- After T020: Simulate workload: created object exists via `docker compose -f docker/compose.dev.yml exec minio-setup sh -c "mc ls local/downloads"` shows `<jobId>.bin`.
- After T021: `grep -q "/jobs" README.md`.

---

## Phase 5 — User Story 3 (P2): CI/CD Pipeline

Goal: CI runs lint, format check, E2E, and Docker build; badge added.
Independent Test Criteria: GitHub Actions shows green for all jobs on PR/push; badge visible in `README.md`.

Assignments: Sakib

- [X] T022 [P] [US3] Create `.github/workflows/ci.yml` with lint/format parallel jobs
- [X] T023 [P] [US3] Add E2E job that spins services via compose and runs `npm run test:e2e`
- [X] T024 [P] [US3] Add Docker build job (`docker build -f docker/Dockerfile.prod .`)
- [X] T025 [US3] Add CI badge to `README.md`

Checks:

- After T022: Local `act` optional; otherwise validate YAML: `yamllint .github/workflows/ci.yml` (or GitHub syntax check).
- After T023: Confirm E2E passes on PR with services; locally: `docker compose -f docker/compose.dev.yml up -d && npm run test:e2e`.
- After T024: `docker build -f docker/Dockerfile.prod .` exits 0 locally.
- After T025: Badge URL present and renders in GitHub.

---

## Phase 6 — User Story 4 (P3 — Bonus): Observability Dashboard

Goal: Optional React app with Sentry + OpenTelemetry; Jaeger in compose.
Independent Test Criteria: Frontend shows health/jobs, traces visible in Jaeger, Sentry captures client errors.

Assignments: Shared (if time permits)

- [ ] T026 [P] [US4] Scaffold `frontend/` via Vite React TS
- [ ] T027 [P] [US4] Add Jaeger service to `docker/compose.dev.yml`
- [ ] T028 [US4] Implement `frontend/src/components/HealthCard.tsx`
- [ ] T029 [US4] Implement `frontend/src/components/JobsList.tsx`
- [ ] T030 [US4] Implement `frontend/src/otel.ts` and wire OTLP
- [ ] T031 [US4] Implement `frontend/src/sentry.ts` and error boundary
- [ ] T032 [P] [US4] Update `README.md` with usage and commands

Checks:

- After T026: `test -d frontend && jq -e '.name' frontend/package.json`.
- After T027: `docker compose -f docker/compose.dev.yml up -d jaeger && curl -s http://localhost:16686` returns HTML.
- After T028/T029: `npm run dev` renders components; `curl -s http://localhost:3000/health` feeds HealthCard.
- After T030: Jaeger UI shows traces when browsing app.
- After T031: Trigger client error, see Sentry event in project.
- After T032: README has frontend and Jaeger instructions.

---

## Final Phase — Polish & Cross-Cutting Concerns

- [ ] T033 Add error format `{ "error": { "code": "string", "message": "string" } }` for all endpoints in `src/index.ts`
- [ ] T034 Add retries with backoff for MinIO operations (up to 3 attempts) in storage module
- [ ] T035 Add feature flag `ENABLE_STORAGE` to disable storage health path quickly

Checks:

- After T033: Negative tests return unified error object.
- After T034: Transient failure simulation succeeds on retry.
- After T035: `ENABLE_STORAGE=false` yields health without storage check.

---

## Summary Report

- Total tasks: 35
- Task count per story:
  - US1: 8 (T006–T013)
  - US2: 8 (T014–T021)
  - US3: 4 (T022–T025)
  - US4: 7 (T026–T032)
  - Setup/Foundational/Polish: 8 (T001–T005, T033–T035)
- Parallel opportunities: T004, T006–T009, T012, T014–T015, T021, T022–T024, T026–T027, T032
- Independent test criteria: Defined per phase above
- Suggested MVP scope: Complete US1 (S3) to enable core health and storage
- Format validation: All tasks follow `- [ ] T### [P?] [US?] Description with file path` checklist format
