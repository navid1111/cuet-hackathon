<!--
Sync Impact Report
- Version change: 0.0.0 → 1.0.0
- Modified principles: N/A (template placeholders → concrete principles)
- Added sections: Constraints; Development Workflow
- Removed sections: None
- Templates requiring updates:
	✅ `.specify/templates/plan-template.md` (Constitution Check now references time-boxed gates, CI/CD, S3)
	✅ `.specify/templates/spec-template.md` (Independent stories align with points/priorities)
	✅ `.specify/templates/tasks-template.md` (Parallel strategy matches 3-dev team, time-box checks)
	⚠ Pending: None
- Deferred TODOs: None
-->

# CUET Micro-Ops Hackathon 2025 Team Constitution

<!-- Example: Spec Constitution, TaskFlow Constitution, etc. -->

## Core Principles

### I. Time-Boxed Delivery (Non-Negotiable)

<!-- Example: I. Library-First -->

All work MUST fit the 3–4 hour window. Deliver smallest
valuable increments that can be demonstrated independently. Prefer
working solutions over exhaustive polish. Define a per-challenge time
budget at kickoff and stop when the budget ends.

<!-- Example: Every feature starts as a standalone library; Libraries must be self-contained, independently testable, documented; Clear purpose required - no organizational-only libraries -->

### II. Points-Driven Prioritization

<!-- Example: II. CLI Interface -->

Sequence work by point value and risk:

- S3 Integration (15 pts)
- Architecture Design (15 pts)
- CI/CD (10 pts)
- Observability Dashboard (10 pts bonus)
MUST complete the two 15-point challenges first. CI/CD is next. Bonus
is attempted only if core 40 points are secure.
<!-- Example: Every library exposes functionality via CLI; Text in/out protocol: stdin/args → stdout, errors → stderr; Support JSON + human-readable formats -->

### III. Microservices Discipline & Contracts

<!-- Example: III. Test-First (NON-NEGOTIABLE) -->

Define explicit API contracts and isolate services. Use S3-compatible
storage with a `downloads` bucket; Redis for job/status tracking; React
client isolated from API. Prefer presigned URLs for downloads.
Contracts MUST be testable via CLI/E2E scripts.

<!-- Example: TDD mandatory: Tests written → User approved → Tests fail → Then implement; Red-Green-Refactor cycle strictly enforced -->

### IV. CI/CD Gatekeeping

<!-- Example: IV. Integration Testing -->

Every change MUST pass lint, format check, E2E tests, and Docker build
in CI. Main branch is protected; pipelines trigger on push/PR.
Deliverables include a visible badge and clear contributor steps.

<!-- Example: Focus areas requiring integration tests: New library contract tests, Contract changes, Inter-service communication, Shared schemas -->

### V. Observability & Tracing (Bonus-Ready)

<!-- Example: V. Observability, VI. Versioning & Breaking Changes, VII. Simplicity -->

Instrument API and frontend with structured logs, Sentry errors, and
OpenTelemetry traces. Provide a simple dashboard for health, jobs,
trace IDs, and errors. This is pursued after core points are secured.

<!-- Example: Text I/O ensures debuggability; Structured logging required; Or: MAJOR.MINOR.BUILD format; Or: Start simple, YAGNI principles -->

## Constraints & Standards

<!-- Example: Additional Constraints, Security Requirements, Performance Standards, etc. -->

The stack is fixed: Node.js, Docker, MinIO (or S3-compatible), Redis,
React, CI/CD. Health endpoint MUST report `{"status":"healthy","checks":{"storage":"ok"}}`.
Services communicate via Compose service hostnames. `downloads` bucket
MUST exist at startup. Prefer polling or SSE/WebSocket for long-running
jobs; avoid holding HTTP connections open beyond proxy timeouts.

<!-- Example: Technology stack requirements, compliance standards, deployment policies, etc. -->

## Development Workflow

<!-- Example: Development Workflow, Review Process, Quality Gates, etc. -->

- Planning: Allocate time budgets per challenge; assign each of 3
  developers one primary area (S3, Architecture, CI/CD). Bonus work if
  time remains.
- Contracts first: Define endpoint shapes, env vars, bucket names,
  status keys in Redis.
- Tests early: Use provided E2E scripts to validate `/health` and
  download flows; add minimal contract checks.
- Branching: Feature branches per challenge; PRs require green CI.
- Delivery: Demonstrable increments after each time box; capture
architecture in `ARCHITECTURE.md`.
<!-- Example: Code review requirements, testing gates, deployment approval process, etc. -->

## Governance

<!-- Example: Constitution supersedes all other practices; Amendments require documentation, approval, migration plan -->

This constitution governs scope, priorities, and quality gates during
the hackathon. Amendments require team consensus and an updated version
line. Versioning follows semantic rules:

- Major: Backward-incompatible changes to principles/governance.
- Minor: New principle or materially expanded guidance.
- Patch: Clarifications or wording that don’t change semantics.

Compliance is reviewed at kickoff and after each time box. CI MUST
enforce gates. Runtime guidance resides in `README.md` and
`ARCHITECTURE.md`.

<!-- Example: All PRs/reviews must verify compliance; Complexity must be justified; Use [GUIDANCE_FILE] for runtime development guidance -->

**Version**: 1.0.0 | **Ratified**: 2025-12-12 | **Last Amended**: 2025-12-12

<!-- Example: Version: 2.1.1 | Ratified: 2025-06-13 | Last Amended: 2025-07-16 -->

# [PROJECT_NAME] Constitution

<!-- Example: Spec Constitution, TaskFlow Constitution, etc. -->

## Core Principles

### [PRINCIPLE_1_NAME]

<!-- Example: I. Library-First -->

[PRINCIPLE_1_DESCRIPTION]

<!-- Example: Every feature starts as a standalone library; Libraries must be self-contained, independently testable, documented; Clear purpose required - no organizational-only libraries -->

### [PRINCIPLE_2_NAME]

<!-- Example: II. CLI Interface -->

[PRINCIPLE_2_DESCRIPTION]

<!-- Example: Every library exposes functionality via CLI; Text in/out protocol: stdin/args → stdout, errors → stderr; Support JSON + human-readable formats -->

### [PRINCIPLE_3_NAME]

<!-- Example: III. Test-First (NON-NEGOTIABLE) -->

[PRINCIPLE_3_DESCRIPTION]

<!-- Example: TDD mandatory: Tests written → User approved → Tests fail → Then implement; Red-Green-Refactor cycle strictly enforced -->

### [PRINCIPLE_4_NAME]

<!-- Example: IV. Integration Testing -->

[PRINCIPLE_4_DESCRIPTION]

<!-- Example: Focus areas requiring integration tests: New library contract tests, Contract changes, Inter-service communication, Shared schemas -->

### [PRINCIPLE_5_NAME]

<!-- Example: V. Observability, VI. Versioning & Breaking Changes, VII. Simplicity -->

[PRINCIPLE_5_DESCRIPTION]

<!-- Example: Text I/O ensures debuggability; Structured logging required; Or: MAJOR.MINOR.BUILD format; Or: Start simple, YAGNI principles -->

## [SECTION_2_NAME]

<!-- Example: Additional Constraints, Security Requirements, Performance Standards, etc. -->

[SECTION_2_CONTENT]

<!-- Example: Technology stack requirements, compliance standards, deployment policies, etc. -->

## [SECTION_3_NAME]

<!-- Example: Development Workflow, Review Process, Quality Gates, etc. -->

[SECTION_3_CONTENT]

<!-- Example: Code review requirements, testing gates, deployment approval process, etc. -->

## Governance

<!-- Example: Constitution supersedes all other practices; Amendments require documentation, approval, migration plan -->

[GOVERNANCE_RULES]

<!-- Example: All PRs/reviews must verify compliance; Complexity must be justified; Use [GUIDANCE_FILE] for runtime development guidance -->

**Version**: [CONSTITUTION_VERSION] | **Ratified**: [RATIFICATION_DATE] | **Last Amended**: [LAST_AMENDED_DATE]

<!-- Example: Version: 2.1.1 | Ratified: 2025-06-13 | Last Amended: 2025-07-16 -->
