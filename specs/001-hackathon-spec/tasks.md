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

- [x] T001 Create baseline env files `.env.development` and `.env.production` at repo root
- [x] T002 Document local run steps in `README.md` (compose up, e2e, envs)
- [x] T003 Validate project scripts run: `npm run lint`, `npm run test:e2e` (adjust README if needed)

Checks:

- After T001: Verify env files exist and are git-ignored; run `cat .env.development | wc -l` > 0.
- After T002: `grep -q "docker compose -f docker/compose.dev.yml up -d" README.md`.
- After T003: Commands exit 0 locally.

---

## Phase 2 — Foundational (blocking prerequisites)

- [x] T004 [P] Agree environment variable names in `README.md` and `.env.*` for MinIO and Redis
- [x] T005 Ensure `docker/compose.dev.yml` boots existing API container successfully

Checks:

- After T004: `grep -q "MINIO_ENDPOINT" README.md` and `.env.development` contains expected keys.
- After T005: `docker compose -f docker/compose.dev.yml up -d` starts with exit 0.

---

## Phase 3 — User Story 1 (P1): S3 Storage Integration

Goal: MinIO in compose, bucket auto-created, `/health` shows `storage: ok`.
Independent Test Criteria: Compose up creates `downloads` bucket; `/health` returns `{"status":"healthy","checks":{"storage":"ok"}}`.

Assignments: Navid

- [x] T006 [P] [US1] Add `minio` service in `docker/compose.dev.yml`
- [x] T007 [P] [US1] Add `minio-setup` service with `mc` bucket init in `docker/compose.dev.yml`
- [x] T008 [P] [US1] Mirror `minio` and `minio-setup` in `docker/compose.prod.yml`
- [x] T009 [P] [US1] Add MinIO env vars to `.env.development` and `.env.production`
- [x] T010 [US1] Configure S3 client in `src/index.ts` using env vars
- [x] T011 [US1] Implement `/health` storage check in `src/index.ts`
- [x] T012 [P] [US1] Update `README.md` with storage setup and health contract
- [x] T013 [US1] Run E2E tests `npm run test:e2e` and ensure pass
- [x] T014 [P] [US1] Create `.env.example` template without real credentials at repo root
- [x] T015 [P] [US1] Remove `.env.development` and `.env.production` from git tracking
- [x] T016 [P] [US1] Add Redis password authentication in `docker/compose.dev.yml` and `docker/compose.prod.yml`
- [x] T017 [US1] Add `REDIS_PASSWORD` to environment schema in `src/index.ts`
- [x] T018 [US1] Remove anonymous bucket access from `docker/compose.dev.yml` (minio-setup service)
- [x] T019 [US1] Add 2-second timeout to S3 health check in `src/index.ts`
- [x] T020 [P] [US1] Enable bucket versioning in minio-setup service (optional)

Checks:

- After T006/T007: `docker compose -f docker/compose.dev.yml up -d && docker compose -f docker/compose.dev.yml exec minio-setup sh -c "mc ls local/downloads"` exits 0.
- After T008: `docker compose -f docker/compose.prod.yml config` renders services.
- After T009: `grep -q "MINIO_BUCKET=downloads" .env.development`.
- After T010: `npm run build` or `tsc --noEmit` type checks.
- After T011: `curl -s http://localhost:3000/health | jq -e '.checks.storage=="ok"'` succeeds.
- After T012: `grep -q '"storage":"ok"' README.md`.
- After T013: CI/local `npm run test:e2e` exits 0.
- After T014: `test -f .env.example && grep -q "your_access_key_here" .env.example`.
- After T015: `git ls-files | grep -v ".env.development"` (env files not tracked).
- After T016: `grep -q "requirepass" docker/compose.dev.yml`.
- After T017: `grep -q "REDIS_PASSWORD" src/index.ts`.
- After T018: `! grep -q "mc anonymous set download" docker/compose.dev.yml` (line removed).
- After T019: `grep -q "AbortController" src/index.ts` (timeout added).
- After T020: `grep -q "mc version enable" docker/compose.dev.yml`.

---

## Phase 4 — User Story 2 (P1): Async Architecture (Polling + Redis + Presigned URLs)

Goal: `POST /jobs`, `GET /jobs/:jobId`, `GET /download/:jobId` with Redis-backed processing and presigned URLs.
Independent Test Criteria: Can create a job, poll status to `completed`, and fetch presigned URL pointing to object in `downloads/`.

Assignments: Sadman

- [ ] T021 [P] [US2] Create `ARCHITECTURE.md` documenting endpoints, schemas, timeouts, diagram
- [ ] T022 [P] [US2] Add Redis service to `docker/compose.dev.yml`
- [ ] T023 [US2] Implement `POST /jobs` in `src/index.ts` (queue push + `queued` status)
- [ ] T024 [US2] Implement `GET /jobs/:jobId` in `src/index.ts` (status/progress/url)
- [ ] T025 [US2] Implement `GET /download/:jobId` in `src/index.ts` (generate presigned URL)
- [ ] T026 [US2] Add `jobs` check in `/health` (Redis reachable)
- [ ] T027 [US2] Implement simple worker loop in `src/index.ts` or `src/worker.ts` (consume queue, write to MinIO, update status)
- [ ] T028 [P] [US2] Document manual curl tests in `README.md`

Checks:

- After T021: `grep -q "Polling" specs/001-hackathon-spec/ARCHITECTURE.md`.
- After T022: `docker compose -f docker/compose.dev.yml up -d redis && docker compose -f docker/compose.dev.yml ps redis` shows running.
- After T023: `curl -s -X POST http://localhost:3000/jobs -H 'Content-Type: application/json' -d '{"payload":{"example":true}}' | jq -e '.jobId and .status=="queued"'`.
- After T024: `curl -s http://localhost:3000/jobs/<jobId> | jq -e '.status'` returns one of expected enums.
- After T025: when completed, `curl -s http://localhost:3000/download/<jobId> | jq -e '.url and .expiresIn==900'`.
- After T026: `curl -s http://localhost:3000/health | jq -e '.checks.jobs=="ok"'`.
- After T027: Simulate workload: created object exists via `docker compose -f docker/compose.dev.yml exec minio-setup sh -c "mc ls local/downloads"` shows `<jobId>.bin`.
- After T028: `grep -q "/jobs" README.md`.

---

## Phase 5 — User Story 3 (P2): CI/CD Pipeline

Goal: CI runs lint, format check, E2E, and Docker build; badge added.
Independent Test Criteria: GitHub Actions shows green for all jobs on PR/push; badge visible in `README.md`.

Assignments: Sakib

- [ ] T029 [P] [US3] Create `.github/workflows/ci.yml` with lint/format parallel jobs
- [ ] T030 [P] [US3] Add E2E job that spins services via compose and runs `npm run test:e2e`
- [ ] T031 [P] [US3] Add Docker build job (`docker build -f docker/Dockerfile.prod .`)
- [ ] T032 [US3] Add CI badge to `README.md`

Checks:

- After T029: Local `act` optional; otherwise validate YAML: `yamllint .github/workflows/ci.yml` (or GitHub syntax check).
- After T030: Confirm E2E passes on PR with services; locally: `docker compose -f docker/compose.dev.yml up -d && npm run test:e2e`.
- After T031: `docker build -f docker/Dockerfile.prod .` exits 0 locally.
- After T032: Badge URL present and renders in GitHub.

---

## Phase 6 — User Story 4 (P3 — Bonus): Observability Dashboard

Goal: Optional React app with Sentry + OpenTelemetry; Jaeger in compose.
Independent Test Criteria: Frontend shows health/jobs, traces visible in Jaeger, Sentry captures client errors.

Assignments: Shared (if time permits)

- [ ] T033 [P] [US4] Scaffold `frontend/` via Vite React TS
- [ ] T034 [P] [US4] Add Jaeger service to `docker/compose.dev.yml`
- [ ] T035 [US4] Implement `frontend/src/components/HealthCard.tsx`
- [ ] T036 [US4] Implement `frontend/src/components/JobsList.tsx`
- [ ] T037 [US4] Implement `frontend/src/otel.ts` and wire OTLP
- [ ] T038 [US4] Implement `frontend/src/sentry.ts` and error boundary
- [ ] T039 [P] [US4] Update `README.md` with usage and commands

Checks:

- After T033: `test -d frontend && jq -e '.name' frontend/package.json`.
- After T034: `docker compose -f docker/compose.dev.yml up -d jaeger && curl -s http://localhost:16686` returns HTML.
- After T035/T036: `npm run dev` renders components; `curl -s http://localhost:3000/health` feeds HealthCard.
- After T037: Jaeger UI shows traces when browsing app.
- After T038: Trigger client error, see Sentry event in project.
- After T039: README has frontend and Jaeger instructions.

---

## Final Phase — Polish & Cross-Cutting Concerns

- [ ] T040 Add error format `{ "error": { "code": "string", "message": "string" } }` for all endpoints in `src/index.ts`
- [ ] T041 Add retries with backoff for MinIO operations (up to 3 attempts) in storage module
- [x] T042 Add feature flag `ENABLE_STORAGE` to disable storage health path quickly

Checks:

- After T040: Negative tests return unified error object.
- After T041: Transient failure simulation succeeds on retry.
- After T042: `ENABLE_STORAGE=false` yields health without storage check.

---

## Summary Report

- Total tasks: 42
- Task count per story:
  - US1: 15 (T006–T020) - includes 7 security hardening tasks
  - US2: 8 (T021–T028)
  - US3: 4 (T029–T032)
  - US4: 7 (T033–T039)
  - Setup/Foundational/Polish: 8 (T001–T005, T040–T042)
- Parallel opportunities: T004, T006–T009, T012, T014–T015, T020, T021–T022, T028, T029–T031, T033–T034, T039
- Security tasks added: T014–T020 address critical and high-priority issues from SECURITY_ISSUES.md
- Independent test criteria: Defined per phase above
- Suggested MVP scope: Complete US1 (S3) including security hardening to enable core health and storage
- Format validation: All tasks follow `- [ ] T### [P?] [US?] Description with file path` checklist format
