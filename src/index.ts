import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { serve } from "@hono/node-server";
import type { ServerType } from "@hono/node-server";
import { httpInstrumentationMiddleware } from "@hono/otel";
import { sentry } from "@hono/sentry";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";
import { Scalar } from "@scalar/hono-api-reference";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { timeout } from "hono/timeout";
import { rateLimiter } from "hono-rate-limiter";
import { Redis } from "ioredis";

// Helper for optional URL that treats empty string as undefined
const optionalUrl = z
  .string()
  .optional()
  .transform((val) => (val === "" ? undefined : val))
  .pipe(z.url().optional());

// Environment schema
const EnvSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  S3_REGION: z.string().min(1).default("us-east-1"),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_ENDPOINT: optionalUrl,
  S3_BUCKET_NAME: z.string().default(""),
  S3_FORCE_PATH_STYLE: z.coerce.boolean().default(false),
  REDIS_HOST: z.string().default("redis"),
  REDIS_PORT: z.coerce.number().int().min(1).max(65535).default(6379),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_DB: z.coerce.number().int().min(0).default(0),
  SENTRY_DSN: optionalUrl,
  OTEL_EXPORTER_OTLP_ENDPOINT: optionalUrl,
  REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1000).default(30000),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).default(60000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().min(1).default(100),
  CORS_ORIGINS: z
    .string()
    .default("*")
    .transform((val) => (val === "*" ? "*" : val.split(","))),
  // Download delay simulation (in milliseconds)
  DOWNLOAD_DELAY_MIN_MS: z.coerce.number().int().min(0).default(10000), // 10 seconds
  DOWNLOAD_DELAY_MAX_MS: z.coerce.number().int().min(0).default(200000), // 200 seconds
  DOWNLOAD_DELAY_ENABLED: z.coerce.boolean().default(true),
  // Feature flags
  ENABLE_STORAGE: z.coerce.boolean().default(true),
});

// Parse and validate environment
const env = EnvSchema.parse(process.env);

// S3 Client
const s3Client = new S3Client({
  region: env.S3_REGION,
  ...(env.S3_ENDPOINT && { endpoint: env.S3_ENDPOINT }),
  ...(env.S3_ACCESS_KEY_ID &&
    env.S3_SECRET_ACCESS_KEY && {
      credentials: {
        accessKeyId: env.S3_ACCESS_KEY_ID,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      },
    }),
  forcePathStyle: env.S3_FORCE_PATH_STYLE,
});

// Redis Client for job queue and status storage
const redis = new Redis({
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
  password: env.REDIS_PASSWORD,
  db: env.REDIS_DB,
  retryStrategy: (times: number) => {
    if (times > 3) return null; // Stop retrying after 3 attempts
    return Math.min(times * 200, 2000); // Exponential backoff
  },
  lazyConnect: true,
});

// Separate Redis client for blocking operations (worker)
const redisWorker = new Redis({
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
  password: env.REDIS_PASSWORD,
  db: env.REDIS_DB,
  retryStrategy: (times: number) => {
    if (times > 3) return null;
    return Math.min(times * 200, 2000);
  },
  lazyConnect: true,
});

// Redis key helpers
const REDIS_KEYS = {
  queue: "jobs:queue",
  status: (jobId: string) => `job:${jobId}:status`,
  progress: (jobId: string) => `job:${jobId}:progress`,
  payload: (jobId: string) => `job:${jobId}:payload`,
  resultKey: (jobId: string) => `job:${jobId}:resultKey`,
  error: (jobId: string) => `job:${jobId}:error`,
  createdAt: (jobId: string) => `job:${jobId}:createdAt`,
  updatedAt: (jobId: string) => `job:${jobId}:updatedAt`,
};

// Initialize OpenTelemetry SDK
const otelSDK = new NodeSDK({
  resource: resourceFromAttributes({
    [ATTR_SERVICE_NAME]: "delineate-hackathon-challenge",
  }),
  traceExporter: new OTLPTraceExporter(),
});
otelSDK.start();

const app = new OpenAPIHono();

// Request ID middleware - adds unique ID to each request
app.use(async (c, next) => {
  const requestId = c.req.header("x-request-id") ?? crypto.randomUUID();
  c.set("requestId", requestId);
  c.header("x-request-id", requestId);
  await next();
});

// Security headers middleware (helmet-like)
app.use(secureHeaders());

// CORS middleware
app.use(
  cors({
    origin: env.CORS_ORIGINS,
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "X-Request-ID"],
    exposeHeaders: [
      "X-Request-ID",
      "X-RateLimit-Limit",
      "X-RateLimit-Remaining",
    ],
    maxAge: 86400,
  }),
);

// Request timeout middleware
app.use(timeout(env.REQUEST_TIMEOUT_MS));

// Rate limiting middleware
app.use(
  rateLimiter({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    limit: env.RATE_LIMIT_MAX_REQUESTS,
    standardHeaders: "draft-6",
    keyGenerator: (c) =>
      c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
      c.req.header("x-real-ip") ??
      "anonymous",
  }),
);

// OpenTelemetry middleware
app.use(
  httpInstrumentationMiddleware({
    serviceName: "delineate-hackathon-challenge",
  }),
);

// Sentry middleware
app.use(
  sentry({
    dsn: env.SENTRY_DSN,
  }),
);

// Error response schema for OpenAPI
const ErrorResponseSchema = z
  .object({
    error: z.string(),
    message: z.string(),
    requestId: z.string().optional(),
  })
  .openapi("ErrorResponse");

// Error handler with Sentry
app.onError((err, c) => {
  c.get("sentry").captureException(err);
  const requestId = c.get("requestId") as string | undefined;
  return c.json(
    {
      error: "Internal Server Error",
      message:
        env.NODE_ENV === "development"
          ? err.message
          : "An unexpected error occurred",
      requestId,
    },
    500,
  );
});

// Schemas
const MessageResponseSchema = z
  .object({
    message: z.string(),
  })
  .openapi("MessageResponse");

const HealthResponseSchema = z
  .object({
    status: z.enum(["healthy", "unhealthy"]),
    checks: z.object({
      storage: z.enum(["ok", "error"]),
      jobs: z.enum(["ok", "error"]),
    }),
  })
  .openapi("HealthResponse");

// Download API Schemas
const DownloadInitiateRequestSchema = z
  .object({
    file_ids: z
      .array(z.number().int().min(10000).max(100000000))
      .min(1)
      .max(1000)
      .openapi({ description: "Array of file IDs (10K to 100M)" }),
  })
  .openapi("DownloadInitiateRequest");

const DownloadInitiateResponseSchema = z
  .object({
    jobId: z.string().openapi({ description: "Unique job identifier" }),
    status: z.enum(["queued", "processing"]),
    totalFileIds: z.number().int(),
  })
  .openapi("DownloadInitiateResponse");

const DownloadCheckRequestSchema = z
  .object({
    file_id: z
      .number()
      .int()
      .min(10000)
      .max(100000000)
      .openapi({ description: "Single file ID to check (10K to 100M)" }),
  })
  .openapi("DownloadCheckRequest");

const DownloadCheckResponseSchema = z
  .object({
    file_id: z.number().int(),
    available: z.boolean(),
    s3Key: z
      .string()
      .nullable()
      .openapi({ description: "S3 object key if available" }),
    size: z
      .number()
      .int()
      .nullable()
      .openapi({ description: "File size in bytes" }),
  })
  .openapi("DownloadCheckResponse");

const DownloadStartRequestSchema = z
  .object({
    file_id: z
      .number()
      .int()
      .min(10000)
      .max(100000000)
      .openapi({ description: "File ID to download (10K to 100M)" }),
  })
  .openapi("DownloadStartRequest");

const DownloadStartResponseSchema = z
  .object({
    file_id: z.number().int(),
    status: z.enum(["completed", "failed"]),
    downloadUrl: z
      .string()
      .nullable()
      .openapi({ description: "Presigned download URL if successful" }),
    size: z
      .number()
      .int()
      .nullable()
      .openapi({ description: "File size in bytes" }),
    processingTimeMs: z
      .number()
      .int()
      .openapi({ description: "Time taken to process the download in ms" }),
    message: z.string().openapi({ description: "Status message" }),
  })
  .openapi("DownloadStartResponse");

// ============================================
// Job API Schemas (Async Architecture)
// ============================================

const JobStatusEnum = z.enum(["queued", "processing", "completed", "failed"]);

const JobCreateRequestSchema = z
  .object({
    payload: z.looseObject({}).openapi({
      description: "Arbitrary payload for job processing",
      example: { fileIds: [12345, 67890], format: "zip" },
    }),
  })
  .openapi("JobCreateRequest");

const JobCreateResponseSchema = z
  .object({
    jobId: z.uuid().openapi({ description: "Unique job identifier" }),
    status: z.literal("queued"),
    createdAt: z.string().openapi({ description: "ISO 8601 timestamp" }),
  })
  .openapi("JobCreateResponse");

const JobStatusResponseSchema = z
  .object({
    jobId: z.uuid(),
    status: JobStatusEnum,
    progress: z.number().int().min(0).max(100),
    downloadUrl: z.string().nullable(),
    error: z.string().nullable().optional(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("JobStatusResponse");

const JobDownloadResponseSchema = z
  .object({
    url: z.url().openapi({ description: "Presigned S3 download URL" }),
    expiresIn: z
      .number()
      .int()
      .openapi({ description: "URL validity in seconds" }),
    contentType: z.string().optional(),
    size: z.number().int().optional(),
  })
  .openapi("JobDownloadResponse");

const JobErrorResponseSchema = z
  .object({
    error: z.object({
      code: z.string(),
      message: z.string(),
    }),
  })
  .openapi("JobErrorResponse");

// Input sanitization for S3 keys - prevent path traversal
const sanitizeS3Key = (fileId: number): string => {
  // Ensure fileId is a valid integer within bounds (already validated by Zod)
  const sanitizedId = Math.floor(Math.abs(fileId));
  // Construct safe S3 key without user-controlled path components
  return `downloads/${String(sanitizedId)}.zip`;
};

// S3 health check
const checkS3Health = async (): Promise<boolean> => {
  if (!env.ENABLE_STORAGE) return true; // Feature disabled
  if (!env.S3_BUCKET_NAME) return true; // Mock mode
  try {
    // Use a lightweight HEAD request on a known path with 2s timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, 2000);

    const command = new HeadObjectCommand({
      Bucket: env.S3_BUCKET_NAME,
      Key: "__health_check_marker__",
    });

    await s3Client.send(command, { abortSignal: controller.signal });
    clearTimeout(timeoutId);
    return true;
  } catch (err) {
    // NotFound is fine - bucket is accessible
    if (err instanceof Error && err.name === "NotFound") return true;
    // AccessDenied or other errors indicate connection issues
    return false;
  }
};

// Redis health check for job queue
const checkRedisHealth = async (): Promise<boolean> => {
  try {
    await redis.ping();
    return true;
  } catch {
    return false;
  }
};

// S3 availability check
const checkS3Availability = async (
  fileId: number,
): Promise<{
  available: boolean;
  s3Key: string | null;
  size: number | null;
}> => {
  const s3Key = sanitizeS3Key(fileId);

  // If no bucket configured, use mock mode
  if (!env.S3_BUCKET_NAME) {
    const available = fileId % 7 === 0;
    return {
      available,
      s3Key: available ? s3Key : null,
      size: available ? Math.floor(Math.random() * 10000000) + 1000 : null,
    };
  }

  try {
    const command = new HeadObjectCommand({
      Bucket: env.S3_BUCKET_NAME,
      Key: s3Key,
    });
    const response = await s3Client.send(command);
    return {
      available: true,
      s3Key,
      size: response.ContentLength ?? null,
    };
  } catch {
    return {
      available: false,
      s3Key: null,
      size: null,
    };
  }
};

// Random delay helper for simulating long-running downloads
const getRandomDelay = (): number => {
  if (!env.DOWNLOAD_DELAY_ENABLED) return 0;
  const min = env.DOWNLOAD_DELAY_MIN_MS;
  const max = env.DOWNLOAD_DELAY_MAX_MS;
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

// Routes
const rootRoute = createRoute({
  method: "get",
  path: "/",
  tags: ["General"],
  summary: "Root endpoint",
  description: "Returns a welcome message",
  responses: {
    200: {
      description: "Successful response",
      content: {
        "application/json": {
          schema: MessageResponseSchema,
        },
      },
    },
  },
});

const healthRoute = createRoute({
  method: "get",
  path: "/health",
  tags: ["Health"],
  summary: "Health check endpoint",
  description: "Returns the health status of the service and its dependencies",
  responses: {
    200: {
      description: "Service is healthy",
      content: {
        "application/json": {
          schema: HealthResponseSchema,
        },
      },
    },
    503: {
      description: "Service is unhealthy",
      content: {
        "application/json": {
          schema: HealthResponseSchema,
        },
      },
    },
  },
});

app.openapi(rootRoute, (c) => {
  return c.json({ message: "Hello Hono!" }, 200);
});

app.openapi(healthRoute, async (c) => {
  const [storageHealthy, jobsHealthy] = await Promise.all([
    checkS3Health(),
    checkRedisHealth(),
  ]);
  const allHealthy = storageHealthy && jobsHealthy;
  const status = allHealthy ? "healthy" : "unhealthy";
  const httpStatus = allHealthy ? 200 : 503;
  return c.json(
    {
      status,
      checks: {
        storage: storageHealthy ? "ok" : "error",
        jobs: jobsHealthy ? "ok" : "error",
      },
    },
    httpStatus,
  );
});

// Download API Routes
const downloadInitiateRoute = createRoute({
  method: "post",
  path: "/v1/download/initiate",
  tags: ["Download"],
  summary: "Initiate download job",
  description: "Initiates a download job for multiple IDs",
  request: {
    body: {
      content: {
        "application/json": {
          schema: DownloadInitiateRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: "Download job initiated",
      content: {
        "application/json": {
          schema: DownloadInitiateResponseSchema,
        },
      },
    },
    400: {
      description: "Invalid request",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
    },
    500: {
      description: "Internal server error",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

const downloadCheckRoute = createRoute({
  method: "post",
  path: "/v1/download/check",
  tags: ["Download"],
  summary: "Check download availability",
  description:
    "Checks if a single ID is available for download in S3. Add ?sentry_test=true to trigger an error for Sentry testing.",
  request: {
    query: z.object({
      sentry_test: z.string().optional().openapi({
        description:
          "Set to 'true' to trigger an intentional error for Sentry testing",
      }),
    }),
    body: {
      content: {
        "application/json": {
          schema: DownloadCheckRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: "Availability check result",
      content: {
        "application/json": {
          schema: DownloadCheckResponseSchema,
        },
      },
    },
    400: {
      description: "Invalid request",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
    },
    500: {
      description: "Internal server error",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

app.openapi(downloadInitiateRoute, (c) => {
  const { file_ids } = c.req.valid("json");
  const jobId = crypto.randomUUID();
  return c.json(
    {
      jobId,
      status: "queued" as const,
      totalFileIds: file_ids.length,
    },
    200,
  );
});

app.openapi(downloadCheckRoute, async (c) => {
  const { sentry_test } = c.req.valid("query");
  const { file_id } = c.req.valid("json");

  // Intentional error for Sentry testing (hackathon challenge)
  if (sentry_test === "true") {
    throw new Error(
      `Sentry test error triggered for file_id=${String(file_id)} - This should appear in Sentry!`,
    );
  }

  const s3Result = await checkS3Availability(file_id);
  return c.json(
    {
      file_id,
      ...s3Result,
    },
    200,
  );
});

// Download Start Route - simulates long-running download with random delay
const downloadStartRoute = createRoute({
  method: "post",
  path: "/v1/download/start",
  tags: ["Download"],
  summary: "Start file download (long-running)",
  description: `Starts a file download with simulated processing delay.
    Processing time varies randomly between ${String(env.DOWNLOAD_DELAY_MIN_MS / 1000)}s and ${String(env.DOWNLOAD_DELAY_MAX_MS / 1000)}s.
    This endpoint demonstrates long-running operations that may timeout behind proxies.`,
  request: {
    body: {
      content: {
        "application/json": {
          schema: DownloadStartRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: "Download completed successfully",
      content: {
        "application/json": {
          schema: DownloadStartResponseSchema,
        },
      },
    },
    400: {
      description: "Invalid request",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
    },
    500: {
      description: "Internal server error",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

app.openapi(downloadStartRoute, async (c) => {
  const { file_id } = c.req.valid("json");
  const startTime = Date.now();

  // Get random delay and log it
  const delayMs = getRandomDelay();
  const delaySec = (delayMs / 1000).toFixed(1);
  const minDelaySec = (env.DOWNLOAD_DELAY_MIN_MS / 1000).toFixed(0);
  const maxDelaySec = (env.DOWNLOAD_DELAY_MAX_MS / 1000).toFixed(0);
  console.log(
    `[Download] Starting file_id=${String(file_id)} | delay=${delaySec}s (range: ${minDelaySec}s-${maxDelaySec}s) | enabled=${String(env.DOWNLOAD_DELAY_ENABLED)}`,
  );

  // Simulate long-running download process
  await sleep(delayMs);

  // Check if file is available in S3
  const s3Result = await checkS3Availability(file_id);
  const processingTimeMs = Date.now() - startTime;

  console.log(
    `[Download] Completed file_id=${String(file_id)}, actual_time=${String(processingTimeMs)}ms, available=${String(s3Result.available)}`,
  );

  if (s3Result.available) {
    return c.json(
      {
        file_id,
        status: "completed" as const,
        downloadUrl: `https://storage.example.com/${s3Result.s3Key ?? ""}?token=${crypto.randomUUID()}`,
        size: s3Result.size,
        processingTimeMs,
        message: `Download ready after ${(processingTimeMs / 1000).toFixed(1)} seconds`,
      },
      200,
    );
  } else {
    return c.json(
      {
        file_id,
        status: "failed" as const,
        downloadUrl: null,
        size: null,
        processingTimeMs,
        message: `File not found after ${(processingTimeMs / 1000).toFixed(1)} seconds of processing`,
      },
      200,
    );
  }
});

// ============================================
// Job API Routes (Async Architecture - US2)
// ============================================

// POST /jobs - Create a new job
const createJobRoute = createRoute({
  method: "post",
  path: "/jobs",
  tags: ["Jobs"],
  summary: "Create a new download job",
  description:
    "Creates a new job for async processing. Returns immediately with a jobId that can be polled for status.",
  request: {
    body: {
      content: {
        "application/json": {
          schema: JobCreateRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: "Job created successfully",
      content: {
        "application/json": {
          schema: JobCreateResponseSchema,
        },
      },
    },
    500: {
      description: "Internal server error",
      content: {
        "application/json": {
          schema: JobErrorResponseSchema,
        },
      },
    },
  },
});

app.openapi(createJobRoute, async (c) => {
  const { payload } = c.req.valid("json");
  const jobId = crypto.randomUUID();
  const now = new Date().toISOString();

  try {
    // Store job data in Redis
    await redis.mset(
      REDIS_KEYS.status(jobId),
      "queued",
      REDIS_KEYS.progress(jobId),
      "0",
      REDIS_KEYS.payload(jobId),
      JSON.stringify(payload),
      REDIS_KEYS.createdAt(jobId),
      now,
      REDIS_KEYS.updatedAt(jobId),
      now,
    );

    // Push to job queue
    await redis.lpush(REDIS_KEYS.queue, jobId);

    console.log(`[Jobs] Created job ${jobId}`);

    return c.json(
      {
        jobId,
        status: "queued" as const,
        createdAt: now,
      },
      200,
    );
  } catch (err) {
    console.error(`[Jobs] Failed to create job:`, err);
    return c.json(
      {
        error: {
          code: "QUEUE_UNAVAILABLE",
          message: "Failed to create job. Redis may be unavailable.",
        },
      },
      500,
    );
  }
});

// GET /jobs/:jobId - Get job status
const getJobStatusRoute = createRoute({
  method: "get",
  path: "/jobs/{jobId}",
  tags: ["Jobs"],
  summary: "Get job status",
  description:
    "Returns the current status of a job, including progress and download URL if completed.",
  request: {
    params: z.object({
      jobId: z.uuid().openapi({ description: "Job ID" }),
    }),
  },
  responses: {
    200: {
      description: "Job status",
      content: {
        "application/json": {
          schema: JobStatusResponseSchema,
        },
      },
    },
    404: {
      description: "Job not found",
      content: {
        "application/json": {
          schema: JobErrorResponseSchema,
        },
      },
    },
    500: {
      description: "Internal server error",
      content: {
        "application/json": {
          schema: JobErrorResponseSchema,
        },
      },
    },
  },
});

app.openapi(getJobStatusRoute, async (c) => {
  const { jobId } = c.req.valid("param");

  try {
    const [status, progress, _resultKey, error, createdAt, updatedAt] =
      await redis.mget(
        REDIS_KEYS.status(jobId),
        REDIS_KEYS.progress(jobId),
        REDIS_KEYS.resultKey(jobId),
        REDIS_KEYS.error(jobId),
        REDIS_KEYS.createdAt(jobId),
        REDIS_KEYS.updatedAt(jobId),
      );

    // _resultKey used to check completion, but downloadUrl is constructed from jobId
    void _resultKey;

    if (!status || !createdAt) {
      return c.json(
        {
          error: {
            code: "JOB_NOT_FOUND",
            message: `No job found with ID: ${jobId}`,
          },
        },
        404,
      );
    }

    const downloadUrl = status === "completed" ? `/download/${jobId}` : null;

    return c.json(
      {
        jobId,
        status: status as "queued" | "processing" | "completed" | "failed",
        progress: parseInt(progress ?? "0", 10),
        downloadUrl,
        error: error ?? undefined,
        createdAt,
        updatedAt: updatedAt ?? createdAt,
      },
      200,
    );
  } catch (err) {
    console.error(`[Jobs] Failed to get job status:`, err);
    return c.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to retrieve job status",
        },
      },
      500,
    );
  }
});

// GET /download/:jobId - Get presigned download URL
const getDownloadUrlRoute = createRoute({
  method: "get",
  path: "/download/{jobId}",
  tags: ["Jobs"],
  summary: "Get download URL for completed job",
  description:
    "Returns a presigned S3 URL for downloading the job result. Only available for completed jobs.",
  request: {
    params: z.object({
      jobId: z.uuid().openapi({ description: "Job ID" }),
    }),
  },
  responses: {
    200: {
      description: "Presigned download URL",
      content: {
        "application/json": {
          schema: JobDownloadResponseSchema,
        },
      },
    },
    400: {
      description: "Job failed",
      content: {
        "application/json": {
          schema: JobErrorResponseSchema,
        },
      },
    },
    404: {
      description: "Job not found",
      content: {
        "application/json": {
          schema: JobErrorResponseSchema,
        },
      },
    },
    409: {
      description: "Job not completed",
      content: {
        "application/json": {
          schema: JobErrorResponseSchema,
        },
      },
    },
    500: {
      description: "Internal server error",
      content: {
        "application/json": {
          schema: JobErrorResponseSchema,
        },
      },
    },
  },
});

app.openapi(getDownloadUrlRoute, async (c) => {
  const { jobId } = c.req.valid("param");

  try {
    const [status, resultKey] = await redis.mget(
      REDIS_KEYS.status(jobId),
      REDIS_KEYS.resultKey(jobId),
    );

    if (!status) {
      return c.json(
        {
          error: {
            code: "JOB_NOT_FOUND",
            message: `No job found with ID: ${jobId}`,
          },
        },
        404,
      );
    }

    if (status === "failed") {
      return c.json(
        {
          error: {
            code: "JOB_FAILED",
            message: "Job processing failed. Please create a new job.",
          },
        },
        400,
      );
    }

    if (status !== "completed") {
      return c.json(
        {
          error: {
            code: "JOB_NOT_COMPLETED",
            message: `Job is still ${status}. Please wait for completion.`,
          },
        },
        409,
      );
    }

    if (!resultKey) {
      return c.json(
        {
          error: {
            code: "RESULT_NOT_FOUND",
            message: "Job completed but result file not found",
          },
        },
        404,
      );
    }

    // Generate presigned URL (15 minute validity)
    const expiresIn = 900;

    // If no bucket configured, return mock URL
    if (!env.S3_BUCKET_NAME) {
      return c.json(
        {
          url: `http://localhost:9000/downloads/${resultKey}?mock=true&token=${crypto.randomUUID()}`,
          expiresIn,
          contentType: "application/octet-stream",
        },
        200,
      );
    }

    const command = new GetObjectCommand({
      Bucket: env.S3_BUCKET_NAME,
      Key: resultKey,
    });

    const url = await getSignedUrl(s3Client, command, { expiresIn });

    return c.json(
      {
        url,
        expiresIn,
        contentType: "application/octet-stream",
      },
      200,
    );
  } catch (err) {
    console.error(`[Jobs] Failed to generate download URL:`, err);
    return c.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to generate download URL",
        },
      },
      500,
    );
  }
});

// ============================================
// Background Worker
// ============================================

let workerRunning = false;

const startWorker = async () => {
  if (workerRunning) return;
  workerRunning = true;

  console.log("[Worker] Starting background job worker...");

  try {
    await redisWorker.connect();
  } catch (err) {
    console.error("[Worker] Failed to connect to Redis:", err);
    workerRunning = false;
    return;
  }

  const processJob = async (jobId: string) => {
    console.log(`[Worker] Processing job ${jobId}`);
    const now = new Date().toISOString();

    try {
      // Update status to processing
      await redis.mset(
        REDIS_KEYS.status(jobId),
        "processing",
        REDIS_KEYS.progress(jobId),
        "0",
        REDIS_KEYS.updatedAt(jobId),
        now,
      );

      // Get payload
      const payloadStr = await redis.get(REDIS_KEYS.payload(jobId));
      const payload: Record<string, unknown> = payloadStr
        ? (JSON.parse(payloadStr) as Record<string, unknown>)
        : {};
      console.log(`[Worker] Job ${jobId} payload:`, payload);

      // Simulate processing with progress updates
      const totalSteps = 10;
      const delayMs = getRandomDelay();
      const stepDelay = delayMs / totalSteps;

      for (let step = 1; step <= totalSteps; step++) {
        await sleep(stepDelay);
        const progress = Math.floor((step / totalSteps) * 100);
        await redis.mset(
          REDIS_KEYS.progress(jobId),
          String(progress),
          REDIS_KEYS.updatedAt(jobId),
          new Date().toISOString(),
        );
        console.log(`[Worker] Job ${jobId} progress: ${String(progress)}%`);
      }

      // Write result to MinIO
      const resultKey = `${jobId}.bin`;
      const resultData = Buffer.from(
        JSON.stringify({
          jobId,
          payload,
          completedAt: new Date().toISOString(),
          processingTimeMs: delayMs,
        }),
      );

      let uploadedToS3 = false;
      if (env.S3_BUCKET_NAME !== "") {
        try {
          const putCommand = new PutObjectCommand({
            Bucket: env.S3_BUCKET_NAME,
            Key: `downloads/${resultKey}`,
            Body: resultData,
            ContentType: "application/octet-stream",
          });
          await s3Client.send(putCommand);
          console.log(`[Worker] Uploaded result to downloads/${resultKey}`);
          uploadedToS3 = true;
        } catch (s3Err) {
          console.warn(
            `[Worker] S3 upload failed (continuing without upload):`,
            s3Err instanceof Error ? s3Err.message : s3Err,
          );
          // Continue without S3 - job still completes
        }
      }

      // Mark job as completed (with or without S3 result)
      if (uploadedToS3) {
        await redis.mset(
          REDIS_KEYS.status(jobId),
          "completed",
          REDIS_KEYS.progress(jobId),
          "100",
          REDIS_KEYS.resultKey(jobId),
          `downloads/${resultKey}`,
          REDIS_KEYS.updatedAt(jobId),
          new Date().toISOString(),
        );
      } else {
        // No S3 result, but job still completed successfully
        await redis.mset(
          REDIS_KEYS.status(jobId),
          "completed",
          REDIS_KEYS.progress(jobId),
          "100",
          REDIS_KEYS.updatedAt(jobId),
          new Date().toISOString(),
        );
        console.log(`[Worker] Job ${jobId} completed (no S3 result available)`);
      }

      console.log(`[Worker] Job ${jobId} completed successfully`);
    } catch (err) {
      console.error(`[Worker] Job ${jobId} failed:`, err);
      await redis.mset(
        REDIS_KEYS.status(jobId),
        "failed",
        REDIS_KEYS.error(jobId),
        err instanceof Error ? err.message : "Unknown error",
        REDIS_KEYS.updatedAt(jobId),
        new Date().toISOString(),
      );
    }
  };

  // Worker loop
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- checked at runtime for shutdown
  while (workerRunning) {
    try {
      // BRPOP waits for a job (timeout 5 seconds, then retry)
      const result = await redisWorker.brpop(REDIS_KEYS.queue, 5);
      if (result) {
        const [, jobId] = result;
        await processJob(jobId);
      }
    } catch (err) {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- checked at runtime for shutdown
      if (workerRunning) {
        console.error("[Worker] Error in worker loop:", err);
        await sleep(1000); // Wait before retrying
      }
    }
  }
};

const stopWorker = () => {
  console.log("[Worker] Stopping worker...");
  workerRunning = false;
  redisWorker.disconnect();
};

// Start worker after Redis connection
redis
  .connect()
  .then(() => {
    console.log("[Redis] Connected successfully");
    startWorker().catch(console.error);
  })
  .catch((err: unknown) => {
    console.error("[Redis] Failed to connect:", err);
  });

// OpenAPI spec endpoint (disabled in production)
if (env.NODE_ENV !== "production") {
  app.doc("/openapi", {
    openapi: "3.0.0",
    info: {
      title: "Delineate Hackathon Challenge API",
      version: "1.0.0",
      description: "API for Delineate Hackathon Challenge",
    },
    servers: [{ url: "http://localhost:3000", description: "Local server" }],
  });

  // Scalar API docs
  app.get("/docs", Scalar({ url: "/openapi" }));
}

// Graceful shutdown handler
const gracefulShutdown = (server: ServerType) => (signal: string) => {
  console.log(`\n${signal} received. Starting graceful shutdown...`);

  // Stop accepting new connections
  server.close(() => {
    console.log("HTTP server closed");

    // Stop the worker first
    stopWorker();
    console.log("Worker stopped");

    // Disconnect Redis
    redis.disconnect();
    console.log("Redis disconnected");

    // Shutdown OpenTelemetry to flush traces
    otelSDK
      .shutdown()
      .then(() => {
        console.log("OpenTelemetry SDK shut down");
      })
      .catch((err: unknown) => {
        console.error("Error shutting down OpenTelemetry:", err);
      })
      .finally(() => {
        // Destroy S3 client
        s3Client.destroy();
        console.log("S3 client destroyed");
        console.log("Graceful shutdown completed");
      });
  });
};

// Start server
const server = serve(
  {
    fetch: app.fetch,
    port: env.PORT,
  },
  (info) => {
    console.log(`Server is running on http://localhost:${String(info.port)}`);
    console.log(`Environment: ${env.NODE_ENV}`);
    if (env.NODE_ENV !== "production") {
      console.log(`API docs: http://localhost:${String(info.port)}/docs`);
    }
  },
);

// Register shutdown handlers
const shutdown = gracefulShutdown(server);
process.on("SIGTERM", () => {
  shutdown("SIGTERM");
});
process.on("SIGINT", () => {
  shutdown("SIGINT");
});
