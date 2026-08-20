import { z } from 'zod';

/** Parse boolean environment variables without treating the string "false" as truthy. */
const optionalUrl = z.union([z.string().url(), z.literal('')]).optional();

const envBoolean = z.preprocess((value) => {
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1') return true;
    if (normalized === 'false' || normalized === '0') return false;
  }
  return value;
}, z.boolean());

/**
 * Validates all environment variables at startup.
 * The NestJS app calls validateEnv() in main.ts before bootstrapping.
 * An invalid or missing variable causes an immediate process exit with a
 * descriptive error — preventing mysterious runtime failures.
 */
export const envSchema = z.object({
  // ─── Runtime ──────────────────────────────────────────────────────────────
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  // Only the worker role may register BullMQ consumers and scheduled work.
  // API is the safe default for ad-hoc local commands and public web processes.
  PROCESS_ROLE: z.enum(['api', 'worker']).default('api'),

  // ─── Database ─────────────────────────────────────────────────────────────
  DATABASE_URL: z.string().url('DATABASE_URL must be a valid postgresql:// URL'),
  DATABASE_DIRECT_URL: z.string().url().optional(),
  // Owner/admin connection used only by controlled schema deployment jobs.
  // Runtime processes may omit it; migration deployment certification requires it.
  MIGRATE_DATABASE_URL: z.string().url().optional(),
  DATABASE_TEST_URL: z.string().url().optional(),

  // ─── Redis ────────────────────────────────────────────────────────────────
  REDIS_HOST: z.string().min(1).default('localhost'),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_TLS: envBoolean.default(false),
  REDIS_URL: z.string().url().optional(),

  // ─── JWT ──────────────────────────────────────────────────────────────────
  JWT_PRIVATE_KEY_B64: z.string().min(100, 'JWT_PRIVATE_KEY_B64 must be a base64-encoded RS256 private key'),
  JWT_PUBLIC_KEY_B64: z.string().min(50, 'JWT_PUBLIC_KEY_B64 must be a base64-encoded RS256 public key'),
  JWT_ACCESS_TOKEN_TTL: z.coerce.number().int().positive().default(900),
  JWT_REFRESH_TOKEN_TTL: z.coerce.number().int().positive().default(604800),

  // ─── Encryption ───────────────────────────────────────────────────────────
  ENCRYPTION_KEY_HEX: z
    .string()
    .length(64, 'ENCRYPTION_KEY_HEX must be exactly 64 hex characters (32 bytes for AES-256)'),

  // ─── API Server ───────────────────────────────────────────────────────────
  API_PORT: z.coerce.number().int().positive().default(3001),
  API_PREFIX: z.string().default('api/v1'),

  // ─── Frontend ─────────────────────────────────────────────────────────────
  FRONTEND_ORIGIN: z.string().refine(
    (value) => value.split(',').every((origin) => z.string().url().safeParse(origin.trim()).success),
    'FRONTEND_ORIGIN must contain one or more comma-separated absolute URLs',
  ).default('http://localhost:3000'),
  // AdmissionsService refuses public application/status operations unless this
  // secret is provisioned; optional here so admin/read-only processes can boot.
  ADMISSIONS_TRACKING_SECRET: z.string().min(32).optional(),
  ADMISSIONS_TURNSTILE_SECRET_KEY: z.string().min(10).optional(),
  ADMISSIONS_TURNSTILE_REQUIRED: envBoolean.default(false),

  // ─── AWS ──────────────────────────────────────────────────────────────────
  AWS_REGION: z.string().default('us-east-1'),
  S3_ENDPOINT_URL: optionalUrl,
  S3_FORCE_PATH_STYLE: envBoolean.default(true),
  S3_UPLOADS_BUCKET: z.string().optional(),
  S3_REPORTS_BUCKET: z.string().optional(),
  S3_STATIC_BUCKET: z.string().optional(),

  // ─── Email ────────────────────────────────────────────────────────────────
  SES_FROM_ADDRESS: z.string().email().optional(),
  SES_REPLY_TO: z.string().email().optional(),
  // Deep-audit fix (Aug 2026): notifications.processor.ts sends real email
  // via generic SMTP (works against SES's own SMTP interface, or any other
  // provider — Postal, Mailgun, a local relay). SMTP_FROM falls back to
  // SES_FROM_ADDRESS above if unset, so institutions already using SES
  // don't need to configure a redundant sender address.
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: envBoolean.default(false),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().email().optional(),

  // ─── SMS ──────────────────────────────────────────────────────────────────
  TERMII_API_KEY: z.string().optional(),
  TERMII_SENDER_ID: z.string().default('UniPortal'),

  // ─── Payment Gateways ─────────────────────────────────────────────────────
  REMITA_MERCHANT_ID: z.string().optional(),
  REMITA_API_KEY: z.string().optional(),
  REMITA_WEBHOOK_SECRET: z.string().optional(),
  // Deep-audit fix (Aug 2026): live RRR generation needs these two, which
  // weren't previously required by anything since generation was stubbed.
  REMITA_SERVICE_TYPE_ID: z.string().optional(),
  REMITA_RRR_ENDPOINT: optionalUrl,
  // Server-to-server verification endpoints are intentionally explicit. A
  // payment provider must not be enabled for production settlement unless the
  // institution has supplied the endpoint documented for its merchant product.
  REMITA_STATUS_ENDPOINT: optionalUrl,
  REMITA_STATUS_VERIFICATION_ENABLED: envBoolean.default(false),
  PAYSTACK_SECRET_KEY: z.string().optional(),
  PAYSTACK_WEBHOOK_SECRET: z.string().optional(),
  PAYSTACK_API_BASE_URL: z.string().url().default('https://api.paystack.co'),
  PAYMENT_PROVIDER_TIMEOUT_MS: z.coerce.number().int().min(1000).max(30000).default(10000),

  // ─── Rate Limiting ────────────────────────────────────────────────────────
  THROTTLE_AUTH_TTL: z.coerce.number().int().positive().default(60000),
  THROTTLE_AUTH_LIMIT: z.coerce.number().int().positive().default(5),
  THROTTLE_API_TTL: z.coerce.number().int().positive().default(60000),
  THROTTLE_API_LIMIT: z.coerce.number().int().positive().default(100),

  // ─── Bull Board ───────────────────────────────────────────────────────────
  BULL_BOARD_USERNAME: z.string().default('admin'),
  BULL_BOARD_PASSWORD: z.string().min(8).optional(),

  // ─── Reliability / deployment ────────────────────────────────────────────
  TRUST_PROXY: envBoolean.default(false),
  TRUST_PROXY_HOPS: z.coerce.number().int().nonnegative().default(1),
  SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().positive().default(10000),
  SLOW_QUERY_MS: z.coerce.number().int().positive().default(500),
  REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
  REPORTING_DATABASE_URL: optionalUrl,
  // Legacy compatibility alias; REPORTING_DATABASE_URL is canonical.
  PRISMA_REPORTING_URL: optionalUrl,
  // A hard ceiling prevents a single report job from materialising an
  // institution-wide dataset without an explicit capacity decision.
  MAX_REPORT_EXPORT_ROWS: z.coerce.number().int().min(1000).max(100000).default(25000),

  // ─── Logging ──────────────────────────────────────────────────────────────
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
}).superRefine((env, ctx) => {
  if ((env.NODE_ENV === 'staging' || env.NODE_ENV === 'production') && !env.S3_REPORTS_BUCKET?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['S3_REPORTS_BUCKET'],
      message: 'S3_REPORTS_BUCKET is required in staging and production; configure approved object storage before startup.',
    });
  }
});

export type Env = z.infer<typeof envSchema>;

/**
 * Validate environment and return typed config object.
 * Call this once at application bootstrap.
 */
export function validateEnv(env: Record<string, unknown> = process.env): Env {
  const result = envSchema.safeParse(env);

  if (!result.success) {
    const errors = result.error.issues
      .map((issue) => `  • ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    process.stderr.write('\n❌ Environment validation failed:\n' + errors + '\n');
    process.exit(1);
  }

  return result.data;
}
