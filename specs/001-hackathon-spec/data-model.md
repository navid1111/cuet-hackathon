# Data Model

## Entities

- **Job**
  - `jobId: string (uuid)`
  - `status: "queued" | "processing" | "completed" | "failed"`
  - `progress: number (0-100)`
  - `resultKey: string (e.g., downloads/<jobId>.bin)`
  - `createdAt: ISO string`
  - `updatedAt: ISO string`

- **DownloadObject**
  - `key: string` (S3 object key, under `downloads/`)
  - `size: number`
  - `contentType: string`

## Relationships

- `Job.resultKey` references `DownloadObject.key` once processing completes.

## Validation Rules

- `jobId` must be UUID v4.
- `status` must be one of the allowed enums.
- `progress` between 0 and 100.
- `resultKey` must be path-safe under `downloads/`.

## State Transitions

- `queued` → `processing` → `completed` | `failed`
- On `completed`, `resultKey` must exist in MinIO bucket.

## Redis Keys

- `job:{jobId}:status` → string
- `job:{jobId}:progress` → int
- `job:{jobId}:resultKey` → string
- `jobs:queue` → list of `jobId`
