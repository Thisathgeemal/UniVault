/**
 * Environment-based configuration.
 *
 * All settings come from environment variables (backend/.env in development,
 * real environment variables in deployment). Nothing environment-specific is
 * hard-coded in source. Values are validated once at startup; the server
 * refuses to start with a clear message if anything is missing or invalid.
 * Secret values are never included in error messages or logs.
 */
import { randomBytes } from 'node:crypto';
import { z } from 'zod';

/**
 * The development-only passphrase written in backend/.env.example. Production refuses it
 * (test/config.test.ts keeps the two in sync).
 */
export const DEV_EXAMPLE_KEY_PASSPHRASE = 'univault-dev-key-passphrase-change-me';
/** Minimum ISSUER_KEY_PASSPHRASE length in production (12 elsewhere). */
export const PRODUCTION_MIN_PASSPHRASE_LENGTH = 20;

const csvList = z
  .string()
  .transform((s) =>
    s
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean),
  )
  .pipe(z.array(z.url()));

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    PUBLIC_BASE_URL: z.url().default('http://localhost:4000'),
    CORS_ORIGINS: csvList.default(['http://localhost:5173', 'http://localhost:5174']),
    // pglite://<folder> (embedded PostgreSQL, development), pglite://memory (tests)
    // or postgres://user:password@host:5432/db (a PostgreSQL server)
    DATABASE_URL: z
      .string()
      .regex(/^(pglite:\/\/.+|postgres(ql)?:\/\/.+)$/, 'must start with pglite:// or postgres://')
      .default('pglite://./.data/univault'),
    // Apply new SQL migrations automatically when the server starts
    DB_AUTO_MIGRATE: z
      .enum(['true', 'false'])
      .default('true')
      .transform((v) => v === 'true'),
    JWT_SECRET: z.string().min(32, 'must be at least 32 characters').optional(),
    ISSUER_KEYS_DIR: z.string().min(1).default('./keys'),
    ISSUER_KEY_PASSPHRASE: z.string().min(12, 'must be at least 12 characters').optional(),
    // Where issuer private keys are loaded from (src/keys/key-store.ts, Decision 014):
    // file = encrypted PEM files in ISSUER_KEYS_DIR; env = ISSUER_KEYS_BUNDLE
    ISSUER_KEY_SOURCE: z.enum(['file', 'env']).default('file'),
    // Base64 bundle made by `npm run keys:bundle` (env mode). Encrypted keys only; secret anyway
    ISSUER_KEYS_BUNDLE: z.string().max(1_000_000).optional(),
    // Exit at start-up if any active issuer key fails its check. Always true in production
    ISSUER_KEYS_STRICT_STARTUP: z
      .enum(['true', 'false'])
      .optional()
      .transform((v) => (v === undefined ? undefined : v === 'true')),
    // Seconds a failed issuer key load is remembered before the next signing retries it (0 = always)
    KEY_RETRY_BACKOFF_SECONDS: z.coerce.number().int().min(0).max(3600).default(30),
    AI_SERVICE_URL: z.url().default('http://localhost:5001'),
    AI_SERVICE_TIMEOUT_MS: z.coerce.number().int().positive().default(1500),
    CREDENTIAL_OFFER_TTL_SECONDS: z.coerce.number().int().positive().default(600),
    VERIFICATION_SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(300),
    REQUEST_BODY_LIMIT: z.string().default('100kb'),
    // Folder with the credential JSON Schemas (default: <repo>/docs/schemas)
    CREDENTIAL_SCHEMAS_DIR: z.string().min(1).optional(),
    // Issuer staff authentication
    JWT_EXPIRES_IN_SECONDS: z.coerce.number().int().min(300).max(86400).default(3600),
    LOGIN_MAX_FAILED_ATTEMPTS: z.coerce.number().int().min(1).max(20).default(5),
    LOGIN_LOCKOUT_MINUTES: z.coerce.number().int().min(1).max(1440).default(15),
    LOGIN_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(20),
    LOGIN_RATE_LIMIT_WINDOW_MINUTES: z.coerce.number().int().min(1).default(15),
    // Public credential status endpoint (GET /api/v1/status/:id): requests per IP per window
    STATUS_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(60),
    STATUS_RATE_LIMIT_WINDOW_MINUTES: z.coerce.number().int().min(1).default(1),
    // DEVELOPMENT ONLY (TEMPORARY, remove in Sprint 2): mount /api/v1/dev/credentials/:id/
    // simulate-redemption (signs a pending credential with a throwaway wallet key) and
    // simulate-expiry (moves a valid credential's expiry into the past)
    DEV_SIMULATE_REDEMPTION: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
  })
  .superRefine((env, ctx) => {
    // Secrets that are optional while developing become mandatory in production
    if (env.NODE_ENV === 'production') {
      for (const key of ['JWT_SECRET', 'ISSUER_KEY_PASSPHRASE'] as const) {
        if (!env[key]) {
          ctx.addIssue({ code: 'custom', path: [key], message: 'is required in production' });
        }
      }
      if (
        env.ISSUER_KEY_PASSPHRASE &&
        env.ISSUER_KEY_PASSPHRASE.length < PRODUCTION_MIN_PASSPHRASE_LENGTH
      ) {
        ctx.addIssue({
          code: 'custom',
          path: ['ISSUER_KEY_PASSPHRASE'],
          message: `must be at least ${PRODUCTION_MIN_PASSPHRASE_LENGTH} characters in production`,
        });
      }
      if (env.ISSUER_KEY_PASSPHRASE === DEV_EXAMPLE_KEY_PASSPHRASE) {
        ctx.addIssue({
          code: 'custom',
          path: ['ISSUER_KEY_PASSPHRASE'],
          message: 'must not be the development value from .env.example in production',
        });
      }
      if (env.ISSUER_KEY_SOURCE === 'env' && !env.ISSUER_KEYS_BUNDLE) {
        ctx.addIssue({
          code: 'custom',
          path: ['ISSUER_KEYS_BUNDLE'],
          message: 'is required in production when ISSUER_KEY_SOURCE=env',
        });
      }
      if (env.ISSUER_KEYS_STRICT_STARTUP === false) {
        ctx.addIssue({
          code: 'custom',
          path: ['ISSUER_KEYS_STRICT_STARTUP'],
          message: 'cannot be false in production (the key check is always strict there)',
        });
      }
      if (env.DEV_SIMULATE_REDEMPTION) {
        ctx.addIssue({
          code: 'custom',
          path: ['DEV_SIMULATE_REDEMPTION'],
          message: 'must not be enabled in production',
        });
      }
      // The embedded database is for development only
      if (!/^postgres(ql)?:\/\//.test(env.DATABASE_URL)) {
        ctx.addIssue({
          code: 'custom',
          path: ['DATABASE_URL'],
          message: 'must be a postgres:// URL in production',
        });
      }
    }
  });

export type AppConfig = Omit<z.infer<typeof envSchema>, 'ISSUER_KEYS_STRICT_STARTUP'> & {
  /** Always set after loadConfig(). */
  JWT_SECRET: string;
  /** Always set after loadConfig(): true in production, else the value given (default false). */
  ISSUER_KEYS_STRICT_STARTUP: boolean;
  /** True when no JWT_SECRET was configured and a temporary one was generated (dev/test only). */
  JWT_SECRET_IS_EPHEMERAL: boolean;
};

export class ConfigError extends Error {
  constructor(public readonly problems: string[]) {
    super(`Invalid environment configuration:\n  - ${problems.join('\n  - ')}`);
    this.name = 'ConfigError';
  }
}

/**
 * Parses and validates configuration from an environment object.
 * Pure function (no side effects) so it can be tested with any input.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  // Treat empty strings (e.g. "JWT_SECRET=" copied from .env.example) as unset
  const cleaned = Object.fromEntries(
    Object.entries(env).filter(([, value]) => value !== undefined && value !== ''),
  );
  const result = envSchema.safeParse(cleaned);
  if (!result.success) {
    // Report variable names and rules only – never the (possibly secret) values
    throw new ConfigError(
      result.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`),
    );
  }
  // Outside production a missing JWT_SECRET is replaced by a random one for this run only:
  // logins work, but every restart signs everyone out. Production requires a real secret.
  const ephemeral = !result.data.JWT_SECRET;
  return {
    ...result.data,
    ISSUER_KEYS_STRICT_STARTUP:
      result.data.NODE_ENV === 'production' || result.data.ISSUER_KEYS_STRICT_STARTUP === true,
    JWT_SECRET: result.data.JWT_SECRET ?? randomBytes(48).toString('base64url'),
    JWT_SECRET_IS_EPHEMERAL: ephemeral,
  };
}
