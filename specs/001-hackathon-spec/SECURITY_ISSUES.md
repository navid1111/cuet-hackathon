# Phase 3 Security Issues - Identified

**Date**: December 12, 2025  
**Phase**: User Story 1 (S3 Storage Integration)  
**Status**: Documented for remediation

---

## Critical Issues (P0) - High Risk

### 1. Hardcoded Credentials in Repository 🔴

**Location**: `.env.development`, `.env.production`  
**Risk Level**: CRITICAL

**Issue**:

```bash
# These files are in git with real credentials
S3_ACCESS_KEY_ID=admin
S3_SECRET_ACCESS_KEY=changemechangeme
MINIO_ROOT_USER=admin
MINIO_ROOT_PASSWORD=changemechangeme
```

**Impact**:

- Anyone with repo access has storage credentials
- Credentials visible in git history forever
- Violates security best practices

**Minimum Complexity Fix**:

```bash
# 1. Create .env.example (template only, no real creds)
S3_ACCESS_KEY_ID=your_access_key_here
S3_SECRET_ACCESS_KEY=your_secret_key_here

# 2. Move real .env files to .gitignore
.env
.env.development
.env.production

# 3. Remove from git history
git rm --cached .env.development .env.production
git commit -m "Remove env files with credentials"
```

**Effort**: 10 minutes  
**Complexity**: Low

---

### 2. No Redis Authentication 🔴

**Location**: `docker/compose.dev.yml`, `docker/compose.prod.yml`  
**Risk Level**: CRITICAL

**Issue**:

```yaml
redis:
  image: redis:7-alpine
  # No password! Anyone can connect
```

**Impact**:

- Anyone on network can read/write queue data
- Job status can be manipulated
- DoS attacks possible

**Minimum Complexity Fix**:

```yaml
redis:
  image: redis:7-alpine
  command: redis-server --requirepass ${REDIS_PASSWORD}
  environment:
    - REDIS_PASSWORD=${REDIS_PASSWORD}
```

```typescript
// Update src/index.ts env schema
REDIS_PASSWORD: z.string().optional(),
```

**Effort**: 15 minutes  
**Complexity**: Low

---

## High Priority Issues (P1) - Medium Risk

### 3. Anonymous Bucket Access ⚠️

**Location**: `docker/compose.dev.yml` (minio-setup service)  
**Risk Level**: HIGH

**Issue**:

```bash
mc anonymous set download local/downloads
# Bucket is publicly readable!
```

**Impact**:

- Anyone can list/download all files in bucket
- No access control
- Potential data leak

**Minimum Complexity Fix**:

```bash
# Remove anonymous access line
# mc anonymous set download local/downloads  <- DELETE THIS

# Access only via presigned URLs (Phase 4)
```

**Effort**: 2 minutes  
**Complexity**: Very Low

---

### 4. No Health Check Timeout ⚠️

**Location**: `src/index.ts` - `checkS3Health()` function  
**Risk Level**: MEDIUM

**Issue**:

```typescript
// No timeout - could hang indefinitely
await s3Client.send(command);
```

**Impact**:

- Health endpoint can hang if S3 is slow
- Cascading failures in load balancer
- No timeout = DoS vector

**Minimum Complexity Fix**:

```typescript
const checkS3Health = async (): Promise<boolean> => {
  // ... existing code ...

  // Add 2-second timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 2000);

  try {
    await s3Client.send(command, { abortSignal: controller.signal });
    clearTimeout(timeoutId);
    return true;
  } finally {
    clearTimeout(timeoutId);
  }
};
```

**Effort**: 10 minutes  
**Complexity**: Low

---

### 5. No TLS/HTTPS ⚠️

**Location**: All services (docker-compose, env files)  
**Risk Level**: MEDIUM

**Issue**:

```bash
S3_ENDPOINT=http://minio:9000  # HTTP, not HTTPS
# All traffic unencrypted
```

**Impact**:

- Credentials transmitted in plaintext
- Data visible to network sniffers
- Man-in-the-middle attacks possible

**Minimum Complexity Fix** (for hackathon):

```bash
# Accept for local development
# Document requirement for production
```

**Production Fix** (post-hackathon):

```bash
# Add reverse proxy with TLS
# Use Let's Encrypt certificates
# Force HTTPS redirects
```

**Effort**: Not fixing for hackathon (acceptable for local dev)  
**Complexity**: Medium (requires reverse proxy)

---

## Medium Priority Issues (P2) - Low Risk

### 6. Exposed Management Ports ⚠️

**Location**: `docker/compose.dev.yml`  
**Risk Level**: LOW (dev only)

**Issue**:

```yaml
ports:
  - "9001:9001" # MinIO console exposed
  - "16686:16686" # Jaeger UI exposed
```

**Impact**:

- Management UIs accessible to anyone
- Information disclosure
- Potential admin access

**Minimum Complexity Fix**:

```yaml
# For hackathon: acceptable for local dev
# For production: remove or bind to localhost only
ports:
  - "127.0.0.1:9001:9001" # Only accessible from host
```

**Effort**: 5 minutes  
**Complexity**: Very Low

---

### 7. No Bucket Versioning 📋

**Location**: `docker/compose.dev.yml` (minio-setup)  
**Risk Level**: LOW

**Issue**:

```bash
mc mb local/downloads
# No versioning - deletes are permanent
```

**Impact**:

- Accidental deletes can't be recovered
- No audit trail
- Data loss risk

**Minimum Complexity Fix**:

```bash
mc mb local/downloads
mc version enable local/downloads  # Add versioning
```

**Effort**: 2 minutes  
**Complexity**: Very Low

---

### 8. Missing Input Sanitization in Logs 📋

**Location**: `src/index.ts` - console.log statements  
**Risk Level**: LOW

**Issue**:

```typescript
console.log(`[Download] Starting file_id=${String(file_id)}`);
// file_id not sanitized - potential log injection
```

**Impact**:

- Log injection attacks
- Log parsing issues
- Metrics corruption

**Minimum Complexity Fix**:

```typescript
// Validate file_id is a number (already done by Zod)
// Logs are safe due to Zod validation
// No action needed for hackathon
```

**Effort**: N/A (already mitigated by Zod)  
**Complexity**: N/A

---

## Summary

| Priority | Issue                 | Risk     | Effort | Fix for Hackathon?     |
| -------- | --------------------- | -------- | ------ | ---------------------- |
| P0       | Hardcoded credentials | CRITICAL | 10 min | ✅ YES                 |
| P0       | No Redis auth         | CRITICAL | 15 min | ✅ YES                 |
| P1       | Anonymous bucket      | HIGH     | 2 min  | ✅ YES                 |
| P1       | No health timeout     | MEDIUM   | 10 min | ✅ YES                 |
| P1       | No TLS/HTTPS          | MEDIUM   | N/A    | ❌ NO (accept for dev) |
| P2       | Exposed ports         | LOW      | 5 min  | ⚠️ OPTIONAL            |
| P2       | No versioning         | LOW      | 2 min  | ⚠️ OPTIONAL            |
| P2       | Log injection         | LOW      | 0 min  | ✅ DONE (Zod)          |

**Total Effort for Critical Fixes**: ~45 minutes  
**Recommended for Hackathon**: Fix P0 and P1 issues (37 minutes total)

---

## Recommended Action Plan

### Quick Wins (Do Now - 37 minutes)

1. **Remove credentials from git** (10 min)
   - Create `.env.example` templates
   - Add `.env*` to `.gitignore`
   - Remove committed env files

2. **Add Redis password** (15 min)
   - Update compose files with `--requirepass`
   - Add `REDIS_PASSWORD` to env schema
   - Update `.env.example`

3. **Remove anonymous bucket access** (2 min)
   - Delete `mc anonymous set download` line
   - Document that access is via presigned URLs only

4. **Add health check timeout** (10 min)
   - Add AbortController with 2s timeout
   - Test with slow S3 responses

### Optional Improvements (5-10 minutes)

5. **Bind management ports to localhost** (5 min)
   - Change `9001:9001` to `127.0.0.1:9001:9001`
   - Change `16686:16686` to `127.0.0.1:16686:16686`

6. **Enable bucket versioning** (2 min)
   - Add `mc version enable local/downloads`

### Post-Hackathon (Production)

7. **Add TLS/HTTPS** (2-4 hours)
   - Set up reverse proxy (nginx/Traefik)
   - Configure Let's Encrypt
   - Update all endpoints to https://

8. **Migrate to AWS S3** (1-2 hours)
   - Replace MinIO with AWS S3
   - Use IAM roles instead of credentials
   - Enable server-side encryption

---

## Security Checklist for Phase 3

- [ ] `.env.example` created (no real credentials)
- [ ] `.env*` files in `.gitignore`
- [ ] Redis requires password (`--requirepass`)
- [ ] `REDIS_PASSWORD` in environment schema
- [ ] Anonymous bucket access removed
- [ ] Health check has 2-second timeout
- [ ] Management ports bound to localhost (optional)
- [ ] Bucket versioning enabled (optional)
- [ ] Documentation updated with security notes

---

## Notes

**For Hackathon Context**:

- Some security gaps are acceptable for local development
- Focus on critical issues that prevent credential leaks
- TLS not required for localhost development
- Document what would change for production

**What Makes This "Minimum Complexity"**:

- No external dependencies (secrets managers, etc.)
- No architecture changes
- Simple environment variable additions
- Quick Docker compose updates
- All fixes < 15 minutes each

**Risk Acceptance**:

- ✅ No TLS for local dev (acceptable)
- ✅ Exposed ports on localhost (acceptable)
- ✅ Simple passwords for dev (acceptable)
- ❌ Hardcoded credentials in git (NOT acceptable)
- ❌ No authentication (NOT acceptable)
